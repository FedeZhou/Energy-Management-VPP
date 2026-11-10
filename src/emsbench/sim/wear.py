"""Battery wear priced in money, measured with NREL's BLAST-Lite ageing models.

BLAST-Lite (https://github.com/NREL/BLAST-Lite, BSD-3-Clause, pip `blast-lite`) predicts the capacity a lithium-ion
cell loses from a state-of-charge and temperature time series: calendar ageing (time, average state of charge,
temperature) plus cycle ageing (energy cycled, depth of discharge, C-rate). We use two of its large-format cells,
both fitted to the test data in Gasper et al. 2023, https://doi.org/10.1016/j.est.2023.109042:

- "lfp": `Lfp_Gr_250AhPrismatic`, a >250 Ah prismatic LFP-graphite cell (the chemistry of most new stationary
  storage). Fitted on gentle rates (charging at most 0.65 C), 10-45 °C.
- "nmc": `NMC_Gr_75Ah_A`, a ~75 Ah pouch NMC-graphite cell. Also fitted on conservative rates.

Two numbers per battery:

1. **Expected life** (scoring). The run's state-of-charge pattern is repeated until the battery reaches its
   end-of-life capacity (or `MAX_YEARS`). That gives the years this way of operating would last, free of the
   artefact that a new battery ages fastest in its first weeks. A run's **wear cost** is the battery's
   replacement value times the share of its life the run used: cost x capacity x run length / life. If the
   battery outlives `MAX_YEARS`, the share is the capacity actually lost in those years over the allowed loss.
   An idle battery still ages (calendar ageing), so the baseline has a wear cost too.
   Repeating the pattern joins its end to its start; that jump counts as cycling, a small overestimate when the
   run ends at a different charge level than it started.
2. **Wear price per kWh** (what the MPC sees). Only the cycling part depends on the controller, so the price is
   the cycle-ageing loss per equivalent full cycle, from a reference of one full cycle a day at the battery's
   temperature, run to end of life: price = cost per kWh x (cycle loss per cycle) / (1 - end-of-life capacity).

Replacement cost defaults (EUR per usable kWh, 2022 means, inflation-adjusted, excluding VAT) are from Figgener et
al. 2023, "The development of battery storage systems in Germany: a market review (status 2023)",
https://arxiv.org/abs/2203.06762: home systems (<= 30 kWh) about 1,200; industrial up to 100 kWh 710, 100-500 kWh
580, 500-1,000 kWh 595; large-scale 1-10 MWh 464, above 10 MWh 380. Prices have fallen since 2022, so these
overstate today's wear; set `replacement_cost_per_kwh` to override. Sites priced in another currency get no
default (wear is reported as life only).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

MODELS = {"lfp": "Lfp_Gr_250AhPrismatic", "nmc": "NMC_Gr_75Ah_A"}
MAX_YEARS = 40.0  # computational cap: lives beyond this are reported as "more than 40 years"
# Ageing is updated in chunks of at most a week or 5 full cycles (BLAST-Lite's default is a day / 1 cycle): on our
# example runs the expected life changed by under 4% and the calculation ran 3-5 times faster.
CHUNK_SECONDS, CHUNK_CYCLES = 7 * 86400.0, 5.0
MIN_PATTERN_DAYS = 28  # shorter runs are tiled to this length before BLAST-Lite repeats them

# (upper capacity bound in kWh, EUR per usable kWh): Figgener et al. 2023, 2022 mean system prices excl. VAT.
EUR_PER_KWH_BY_SIZE = ((30.0, 1200.0), (100.0, 710.0), (500.0, 580.0), (1000.0, 595.0), (10000.0, 464.0),
                       (float("inf"), 380.0))


def default_replacement_cost(capacity_kwh: float, currency: str) -> float | None:
    """EUR per usable kWh for a battery of this size, or None outside EUR sites."""
    if currency != "EUR":
        return None
    return next(price for limit, price in EUR_PER_KWH_BY_SIZE if capacity_kwh <= limit)


def _model(chemistry: str) -> Any:
    from blast import models

    return getattr(models, MODELS[chemistry])()


@dataclass(frozen=True)
class Life:
    years: float  # until end of life, capped at MAX_YEARS
    capped: bool
    cycle_share: float  # share of the capacity loss due to cycling (the rest is calendar ageing)
    life_used: float = 1.0  # share of the battery's life used up in `years` (below 1 only when capped)

    def wear_cost(self, value: float, run_years: float) -> float:
        """The part of `value` (the battery's replacement value) a run of `run_years` uses up."""
        return value * self.life_used * run_years / self.years


def expected_life(soc: FloatArray, step_seconds: float, chemistry: str, temperature_c: float,
                  end_of_life: float) -> Life:
    """Years until `end_of_life` capacity if this state-of-charge pattern repeated (soc: T + 1 points)."""
    soc = np.clip(np.asarray(soc, dtype=float), 0.0, 1.0)
    if soc.size < 2:
        soc = np.repeat(soc[:1] if soc.size else np.zeros(1), 2)
    constant = float(np.ptp(soc)) < 1e-9  # an idle battery: BLAST-Lite's fast path for constant inputs
    if constant:
        soc, step_seconds = soc[:2], 86400.0
    else:  # hand over at least MIN_PATTERN_DAYS (the pattern is repeated anyway) so weekly chunks can be used
        span = (soc.size - 1) * step_seconds
        reps = int(np.ceil(MIN_PATTERN_DAYS * 86400.0 / span)) if span > 0 else 1
        if reps > 1:
            soc = np.concatenate([soc] + [soc[1:]] * (reps - 1))
    t = np.arange(soc.size, dtype=float) * step_seconds
    m = _model(chemistry)
    m.simulate_battery_life({"Time_s": t, "SOC": soc, "Temperature_C": np.full(soc.size, temperature_c)},
                            threshold_capacity=end_of_life, threshold_time=MAX_YEARS, is_constant_input=constant,
                            breakpoints_max_time_diff_s=CHUNK_SECONDS, breakpoints_max_EFC_diff=CHUNK_CYCLES)
    q = float(m.outputs["q"][-1])
    days = float(m.stressors["t_days"][-1])
    loss_t, loss_c = float(m.states["qLoss_t"][-1]), float(m.states["qLoss_EFC"][-1])
    share = loss_c / (loss_t + loss_c) if loss_t + loss_c > 0 else 0.0
    if q > end_of_life:  # stopped by the time cap: price the capacity actually lost in MAX_YEARS
        return Life(MAX_YEARS, True, share, max(0.0, 1.0 - q) / (1.0 - end_of_life))
    return Life(days / 365.0, False, share)


@lru_cache(maxsize=32)
def cycle_loss_per_cycle(chemistry: str, temperature_c: float, end_of_life: float) -> float:
    """Capacity lost to cycling per equivalent full cycle: one full cycle a day (0 -> 100 -> 0 %), to end of life."""
    h = np.arange(0, 24 * MIN_PATTERN_DAYS + 1, dtype=float)
    hour = h % 24
    soc = np.where(hour < 12, hour / 12, (24 - hour) / 12)
    m = _model(chemistry)
    m.simulate_battery_life({"Time_s": h * 3600, "SOC": soc, "Temperature_C": np.full(h.size, temperature_c)},
                            threshold_capacity=end_of_life, threshold_time=MAX_YEARS,
                            breakpoints_max_time_diff_s=CHUNK_SECONDS, breakpoints_max_EFC_diff=CHUNK_CYCLES)
    efc = float(m.stressors["efc"][-1])
    return float(m.states["qLoss_EFC"][-1]) / efc if efc > 0 else 0.0


def wear_price_per_kwh(cost_per_kwh: float, chemistry: str, temperature_c: float, end_of_life: float) -> float:
    """Money per kWh discharged that cycling costs in battery life (see module docstring)."""
    return cost_per_kwh * cycle_loss_per_cycle(chemistry, temperature_c, end_of_life) / (1.0 - end_of_life)
