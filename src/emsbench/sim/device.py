"""Device uncertainty: the gap between what a controller believes a device can do and what the hardware does.

Controllers in the literature usually plan with forecast uncertainty only; the devices themselves are taken as
known (guide section 7, gap G3). Two device effects are modelled here, both off by default:

1. **State-of-charge estimation error.** A battery management system (BMS) cannot measure state of charge (SoC);
   it estimates it, and for LFP cells, whose voltage is flat over most of the range, the estimate drifts. Field
   data from a battery analytics vendor report typical errors of +-15% in LFP systems, with outliers above +-40%
   (Accure via ESS News, 7 Oct 2025, https://www.ess-news.com/?p=6558). The estimate is corrected when the battery
   reaches a steep part of the voltage curve, near full or empty: BYD's service guide says "the calculation of the
   state of charge is generally more precise if the battery regularly sees full cycles" and "the SOC calibration
   is completed at the latest after a full cycle" (quoted in Fronius, "Charging behavior of lithium iron phosphate
   batteries", whitepaper v01, 01/2024, section 2.3).

   We use the error model of Braendle and Hug (arXiv 2604.12594, eq. 2, Table I), taken by them from an
   industry whitepaper (Powin and Tierra Climate, March 2025):

       w[t+1] = a(s[t]) * (w[t] + |p[t]| * eta),   eta ~ Normal(beta, sigma^2)

   w is the estimate minus the true SoC, p the battery power, s the true SoC. The error grows with the energy
   cycled, and a(s) pulls it back to zero near the ends: a = s / b below b = 0.15, 1 between b and c = 0.9, and
   1 - (s - c) / (1 - c) above c (so a full charge resets it). Adaptations, stated:
   - the paper does not give units; its battery is 10 MW / 10 MWh at hourly steps, so a full-power hour moves one
     capacity. We express the drift per capacity cycled (fraction of capacity moved): beta = 1e-3 and
     sigma = sqrt(1e-4) = 0.01 per MW become 0.01 and 0.1 per capacity. That conversion is our reading;
   - so that results do not depend on the time step, the random part has a variance proportional to the energy
     cycled (a random walk in throughput: std = sigma * sqrt(x) for a step that moves x capacities), which equals
     the paper's for one full-power hour on their battery, and a(s) is applied as a(s) ** (step hours / 1 h);
   - a starting error (`soc_error_initial`) can be set, e.g. a BMS that reads 15 points high.

   The controller sees the estimate; the plant integrates the true energy and enforces the true limits, so a plan
   built on the estimate can fail (the battery runs empty earlier, or still has room when the plan thought it full).

2. **SoC-dependent power limits (CC-CV).** Lithium-ion cells are charged at constant current until a voltage limit,
   then at constant voltage with falling current (guide appendix A.3); the same voltage arithmetic limits discharge
   power near empty. We use the two-stage linear model of ACN-Sim (Lee, Johansson and Low, "ACN-Sim: An
   Open-Source Simulator for Data-Driven Electric Vehicle Charging Research", IEEE SmartGridComm 2019;
   `Linear2StageBattery` in https://github.com/zach401/acnportal): full power up to a transition SoC (default
   0.8), then "the maximum charging rate of the battery will decrease linearly to 0 at 100% state of charge".
   CityLearn documents the same breakpoint (`capacity_power_curve` default [[0, 1], [0.8, 1], [1, 0.2]]). A limit
   that is linear in the energy still to go is also the form Kazhamiaka, Rosenberg and Keshav fit to cell data
   ("Tractable lithium-ion storage models for optimizing energy systems", Energy Informatics 2:4, 2019,
   https://doi.org/10.1186/s42162-019-0070-6: energy-content limits linear in current). For discharge we mirror
   it: full power down to a SoC (default 0.2, an example choice: no public LFP derating table was found), then
   linearly to zero at empty.

   Within a step the limit falls as the battery fills, so the step's highest average power is computed exactly
   (an exponential approach, as in ACN-Sim's `_charge`), not from the SoC at the start of the step; results then
   do not depend on the step length.

EV charging curves use the same shape. Charging sessions give the energy a car took, not its battery size or SoC,
so we approximate (documented as such): the session ended because the car was (nearly) full, i.e. its requested
energy takes it to the point where its acceptance has fallen to the charger's minimum power (6 A, IEC 61851-1), an
upper bound on the taper (a driver who left early never reached it); its battery is the smallest of ACN-Sim's
candidate sizes (8, 24, 40, 60, 85, 100 kWh, from `batt_cap_fn`) that holds that energy.
"""

from __future__ import annotations

import math

import numpy as np

# Braendle and Hug, arXiv 2604.12594, Table I: a(s) rises from 0 at empty to 1 at b and falls from 1 at c to 0 at
# full. Their time step is one hour.
RECAL_LOW_SOC = 0.15
RECAL_HIGH_SOC = 0.9
RECAL_REF_HOURS = 1.0
# ACN-Sim batt_cap_fn candidate battery capacities, kWh (zach401/acnportal, acnsim/models/battery.py).
EV_CAPACITIES_KWH = (8.0, 24.0, 40.0, 60.0, 85.0, 100.0)


def recalibration_factor(soc_true: float) -> float:
    """a(s): how much of the SoC error survives one hour at true SoC `soc_true` (0 = fully recalibrated)."""
    s = min(max(soc_true, 0.0), 1.0)
    if s < RECAL_LOW_SOC:
        return s / RECAL_LOW_SOC
    if s > RECAL_HIGH_SOC:
        return 1.0 - (s - RECAL_HIGH_SOC) / (1.0 - RECAL_HIGH_SOC)
    return 1.0


def max_taper_power(room_kwh: float, room_taper_kwh: float, p_max_kw: float, rate: float, dt_h: float) -> float:
    """Highest average power over a step of `dt_h` hours when the allowed power falls linearly to zero as `room`
    goes to zero below `room_taper` (CC-CV).

    `room` is the stored energy still to go in this direction: to full when charging, above empty when
    discharging. `rate` is the kWh of room used per kWh at the terminals: the one-way efficiency when charging,
    1 / efficiency when discharging. At full power until `room` reaches `room_taper`, then the power is
    p_max * room / room_taper, so room decays exponentially with time constant room_taper / (rate * p_max).
    """
    if room_kwh <= 0 or p_max_kw <= 0 or dt_h <= 0:
        return 0.0
    if room_taper_kwh <= 0:
        return p_max_kw
    full_kwh = rate * p_max_kw * dt_h  # room used by a whole step at full power
    if room_kwh - full_kwh >= room_taper_kwh:
        return p_max_kw  # still above the taper at the end of the step
    k = rate * p_max_kw / room_taper_kwh  # 1/h
    if room_kwh > room_taper_kwh:
        t1 = (room_kwh - room_taper_kwh) / (rate * p_max_kw)
        used = room_kwh - room_taper_kwh + room_taper_kwh * (1.0 - math.exp(-k * (dt_h - t1)))
    else:
        used = room_kwh * (1.0 - math.exp(-k * dt_h))
    return min(p_max_kw, used / (rate * dt_h))


def ev_battery(requested_kwh: float, taper_soc: float, min_kw: float, max_kw: float) -> tuple[float, float]:
    """Assumed car battery for a session: (capacity, energy still to full when the session's energy is delivered),
    both in kWh at the car battery.

    The session ends when the car's acceptance has fallen to the charger's minimum power (6 A, IEC 61851-1): with
    the linear taper that leaves (1 - taper_soc) x min / max of the capacity unfilled. Without this end point the
    exponential tail would never deliver the last fraction of a kWh and nearly every session would count as unmet.
    The capacity is the smallest ACN-Sim candidate that holds the requested energy plus that rest.
    """
    end_share = (1.0 - taper_soc) * min(1.0, min_kw / max_kw) if max_kw > 0 else 0.0
    for c in EV_CAPACITIES_KWH:
        if c * (1.0 - end_share) >= requested_kwh:
            return c, end_share * c
    c = requested_kwh / (1.0 - end_share) if end_share < 1 else requested_kwh
    return c, end_share * c


class SocEstimator:
    """The BMS's estimate of one battery's SoC: true SoC plus an error that drifts with use and is recalibrated
    near full or empty (see the module docstring). Seeded, so a run is reproducible; one random draw per step
    whatever the battery does, so two strategies on the same site see the same random numbers."""

    def __init__(self, initial_error: float, drift_bias: float, drift_std: float, seed: int, index: int) -> None:
        self.error = float(initial_error)
        self.bias = float(drift_bias)
        self.std = float(drift_std)
        self.rng = np.random.default_rng([int(seed), int(index)])
        self.active = bool(initial_error or drift_bias or drift_std)

    def estimate(self, soc_true: float) -> float:
        """The SoC the BMS reports (between 0 and 1)."""
        return min(max(soc_true + self.error, 0.0), 1.0)

    def step(self, soc_true_before: float, cycled_fraction: float, dt_h: float) -> None:
        """Update the error after a step that moved `cycled_fraction` of the capacity, starting at true SoC
        `soc_true_before` (the paper's a(s[t]))."""
        z = float(self.rng.standard_normal())
        if not self.active:
            return
        x = max(cycled_fraction, 0.0)
        drift = self.bias * x + self.std * math.sqrt(x) * z
        a = recalibration_factor(soc_true_before) ** (dt_h / RECAL_REF_HOURS)
        self.error = min(max(a * (self.error + drift), -1.0), 1.0)
