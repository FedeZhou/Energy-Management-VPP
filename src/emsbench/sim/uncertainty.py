"""How wrong the forecast of the uncontrollable net load tends to be, and the safety margin a chance MPC plans with.

Net load here is what the controller cannot move: building and data-centre load, heat pumps running on demand, minus
solar. EV charging is not part of it (the planner decides it).

**Probabilistic forecast.** A real controller can keep score of its own forecast: at every step it sees how far the
net load was from what it had predicted. Collecting those errors at the same time of day over the last few weeks gives
an empirical distribution, and adding its quantiles to the point forecast gives quantile forecasts ("on 90% of recent
days the net load at 10:00 was at most 25 kW above the forecast"). No probability distribution is assumed: this is the
data-driven, non-parametric idea of Babic et al. (Frontiers in Control Engineering 4, 2023,
https://www.frontiersin.org/articles/10.3389/fcteg.2023.1237759, guide section 7.2: chance constraints "that need no
assumed probability distribution, trained on three weeks of data").

Only errors observed before the step at which the forecast is made are used (no look-ahead), and only errors of the
same time of day: a step's samples are the same clock time 1, 2, ... days earlier, the most recent first.

The point forecast here is the realistic one of `sim/forecasts.py` (load: the same time on the most recent day; solar:
the archived day-ahead weather forecast, or the most recent day). Its error at a step does not depend on how far ahead
the forecast was made as long as that is less than a day, which covers horizons up to 24 h; for longer horizons the
one-day errors are used as an approximation.

**Back-off for a chance constraint (scenario approach).** To keep a limit with probability at least 1 - eps, the MPC
plans against the limit minus a margin b (the "back-off"; guide section 7.2, Figure 14). b is chosen with the scenario
approach (guide section 4.2; Campi, Garatti and Prandini, Handbook of Model Predictive Control,
https://marco-campi.unibs.it/pdf-pszip/Handbook%20MPC.pdf): take N past days and choose the smallest margin that would
have covered the error on all of them, i.e. the largest of the N errors at that time of day. Choosing one number (the
margin) is a convex problem with one decision variable, for which the probability that the margin fails on more than a
share eps of new days is at most (1 - eps)^N. Requiring that to be at most 1 - confidence gives
N = ceil(ln(1 - confidence) / ln(1 - eps)); for eps = 10% and 95% confidence, N = 29 days.

Assumptions, stated: the theory needs the days to be independent and alike (independent and identically distributed).
Real days are not (seasons, weekdays, holidays), which is why the margin uses only the most recent N days and why the
run reports how often the margin was actually exceeded. The guarantee is per step; a day is kept only if every step of
it is, so the share of days kept can be lower (errors of neighbouring hours are strongly related, so usually not by
much). Days with too little history (the first days of a run without earlier data) have fewer samples and less
confidence.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
IntArray = NDArray[np.int_]

# Days of past errors behind a quantile forecast: four weeks, so that every weekday appears four times. Our choice, near
# the three weeks of training data of Babic et al. 2023 (module docstring).
QUANTILE_DAYS = 28
# Longest window the back-off may use (a reliability target of 100% would otherwise ask for infinitely many days).
MAX_BACKOFF_DAYS = 366


def scenario_days(target: float, confidence: float) -> int:
    """Days N of past errors needed so that the largest of them is exceeded on at most a share 1 - `target` of new days,
    with probability at least `confidence`: the smallest N with target^N <= 1 - confidence (scenario approach with one
    decision variable, see module docstring). 0 if the target is 0 (no margin needed)."""
    if target <= 0.0:
        return 0
    if target >= 1.0 or confidence <= 0.0:
        return MAX_BACKOFF_DAYS if target >= 1.0 else 1
    if confidence >= 1.0:
        return MAX_BACKOFF_DAYS
    n = math.ceil(math.log(1.0 - confidence) / math.log(target) - 1e-12)
    return int(min(max(n, 1), MAX_BACKOFF_DAYS))


def scenario_confidence(target: float, days: int) -> float:
    """Confidence that the largest of `days` errors is exceeded on at most a share 1 - `target` of new days."""
    return 1.0 - target ** days if days > 0 else 0.0


@dataclass
class NetLoadUncertainty:
    """Past errors of the net-load point forecast, and the quantiles and back-off computed from them.

    `errors[i]` is actual minus forecast net load for step i - `offset` of the run (history before the run first; NaN
    where unknown). It may hold the whole run, but a query at step t only ever reads errors of steps before t.
    """

    errors: FloatArray
    offset: int  # index of the run's first step in `errors`
    steps_per_day: int
    backoff_days: int = 0  # N of the scenario approach; 0 = no back-off

    def samples(self, targets: IntArray, issued: IntArray, days: int) -> FloatArray:
        """Errors at the same time of day as each target step, from the `days` most recent days observed before the
        step at which the forecast is issued; shape (len(targets), days), NaN where unknown."""
        d = self.steps_per_day
        lead = np.asarray(targets) - np.asarray(issued)
        if np.any(lead < 0):
            raise ValueError("a forecast is issued before its target step")
        first = lead // d + 1  # whole days back to the most recent same-time step before the issue step
        back = (first[:, None] + np.arange(days)[None, :]) * d
        idx = self.offset + np.asarray(targets)[:, None] - back  # always < offset + issued
        out = np.full(idx.shape, np.nan)
        ok = (idx >= 0) & (idx < self.errors.size)
        out[ok] = self.errors[idx[ok]]
        return out

    def _window(self, t: int, steps: int, days: int) -> FloatArray:
        k = np.arange(steps)
        return self.samples(t + k, np.full(steps, t), days)

    def error_quantile(self, t: int, steps: int, q: float, days: int = QUANTILE_DAYS) -> FloatArray:
        """The q-quantile of the forecast error for steps t .. t + steps - 1, as known at step t (0 without samples).
        Add it to the point forecast for a quantile forecast of the net load."""
        return _row_quantile(self._window(t, steps, days), q)

    def backoff(self, t: int, steps: int) -> FloatArray:
        """The margin (kW, at least 0) to subtract from the import limit for steps t .. t + steps - 1: the largest
        error at that time of day over the last `backoff_days` days (scenario approach, module docstring)."""
        if self.backoff_days <= 0:
            return np.zeros(steps)
        return np.clip(_row_max(self._window(t, steps, self.backoff_days)), 0.0, None)

    def calibration(self, steps: int, q: float, days: int = QUANTILE_DAYS) -> tuple[float | None, int]:
        """Share of run steps 0 .. steps - 1 whose actual net load exceeded the q-quantile forecast made one step
        earlier (expected: 1 - q), and the number of steps evaluated (those with a full window of `days` samples and a
        known error)."""
        return self._exceed(steps, days, lambda s: _row_quantile(s, q))

    def backoff_exceedance(self, steps: int) -> tuple[float | None, int]:
        """Share of run steps whose actual error exceeded the back-off (allowed: 1 - target), and steps evaluated."""
        if self.backoff_days <= 0:
            return None, 0
        n = self.backoff_days
        return self._exceed(steps, n, lambda s: np.clip(_row_max(s), 0.0, None))

    def _exceed(self, steps: int, days: int, stat: Callable[[FloatArray], FloatArray]) -> tuple[float | None, int]:
        s = np.arange(steps)
        smp = self.samples(s, s, days)  # issued at step s: the most recent sample is a day before
        actual = self.errors[self.offset: self.offset + steps]
        ok = np.isfinite(smp).all(axis=1) & np.isfinite(actual[: s.size])
        if not ok.any():
            return None, 0
        bound = stat(smp[ok])
        return float(np.mean(actual[: s.size][ok] > bound + 1e-9)), int(ok.sum())


def _row_quantile(samples: FloatArray, q: float) -> FloatArray:
    """Per row, the empirical q-quantile ("inverted CDF": an actual sample), ignoring NaN; 0 for an empty row."""
    out = np.zeros(samples.shape[0])
    for i, row in enumerate(samples):
        r = row[np.isfinite(row)]
        if r.size:
            out[i] = float(np.quantile(r, min(max(q, 0.0), 1.0), method="inverted_cdf"))
    return out


def _row_max(samples: FloatArray) -> FloatArray:
    has = np.isfinite(samples).any(axis=1)
    out = np.zeros(samples.shape[0])
    out[has] = np.nanmax(samples[has], axis=1)
    return out


def persistence_errors(load: FloatArray, pv: FloatArray, pv_forecast: FloatArray | None,
                       steps_per_day: int) -> FloatArray:
    """Errors of the realistic net-load forecast (`sim/forecasts.py`) at each step of the given series (history then
    run, NaN where unknown): actual minus forecast, where the load forecast is the same time a day earlier and the
    solar forecast is `pv_forecast` (archived day-ahead forecast) or, without one, solar a day earlier."""
    d = steps_per_day
    err = np.full(load.size, np.nan)
    if load.size <= d:
        return err
    load_fc = load[:-d]
    pv_fc = pv_forecast[d:] if pv_forecast is not None else pv[:-d]
    err[d:] = (load[d:] - load_fc) - (pv[d:] - pv_fc)
    return err
