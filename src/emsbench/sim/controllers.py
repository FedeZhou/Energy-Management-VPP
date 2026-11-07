"""Rule-based controllers for the generic engine.

A controller sees an `Observation` each step and returns an `Action`: desired
total battery power and desired power per EV charger. The engine then clips
these to physical limits and applies the safety layer (grid limit, fuses), so a
controller can never break a limit, only ask for something infeasible.

Sign convention: positive power = consumed from the site bus (battery
charging, EV charging); negative = supplied to the bus (battery discharging).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from emsbench.sim.model import ControllerSpec


@dataclass(frozen=True)
class EVState:
    connected: bool
    remaining_kwh: float  # energy the car still needs, at the car battery
    steps_left: int  # steps until departure, including this one
    max_kw: float  # min(charger, car)
    min_kw: float  # below this the charger pauses (IEC 61851 minimum current)
    efficiency: float


@dataclass(frozen=True)
class Observation:
    t: int
    step_hours: float
    load_kw: float
    pv_kw: float
    price: float
    price_ahead: NDArray[np.float64]  # next 24 h of prices, starting with the current step
    battery_energy_kwh: float
    battery_capacity_kwh: float
    battery_max_charge_kw: float  # feasible this step (power and SoC limits)
    battery_max_discharge_kw: float
    evs: tuple[EVState, ...]


@dataclass(frozen=True)
class Action:
    battery_kw: float
    ev_kw: tuple[float, ...]


def _needed_kw(ev: EVState, dt: float) -> float:
    return ev.remaining_kwh / ev.efficiency / dt


def ev_power(spec: ControllerSpec, ev: EVState, obs: Observation, surplus_kw: float) -> float:
    if not ev.connected or ev.remaining_kwh <= 1e-9:
        return 0.0
    dt = obs.step_hours
    full = min(ev.max_kw, _needed_kw(ev, dt))
    # Steps at full power still needed; if that equals the time left, there is no slack.
    steps_needed = int(np.ceil(_needed_kw(ev, dt) / max(ev.max_kw, 1e-9) - 1e-9))
    no_slack = steps_needed >= ev.steps_left
    if spec.ev == "as_fast_as_possible" or no_slack:
        return full
    if spec.ev == "spread_until_departure":
        return min(full, max(ev.min_kw, _needed_kw(ev, dt) / max(ev.steps_left, 1)))
    if spec.ev == "cheapest_hours":
        horizon = obs.price_ahead[: max(ev.steps_left, 1)]
        cheapest = np.argsort(horizon, kind="stable")[:steps_needed]
        return full if 0 in cheapest else 0.0
    if spec.ev == "solar_surplus":
        p = min(full, max(surplus_kw, 0.0))
        return p if p >= ev.min_kw else 0.0
    raise ValueError(f"unknown EV strategy {spec.ev}")


def battery_power(spec: ControllerSpec, obs: Observation, net_kw: float) -> float:
    """Desired battery power given the site's net demand before the battery."""
    if spec.battery == "idle":
        return 0.0
    if spec.battery == "self_consumption":
        return -net_kw  # surplus (net<0) -> charge; deficit -> discharge
    if spec.battery == "peak_shaving":
        return spec.peak_threshold_kw - net_kw  # charge below threshold, discharge above
    if spec.battery == "price_arbitrage":
        window = obs.price_ahead
        cheapest, dearest = float(window.min()), float(window.max())
        if net_kw < 0:
            return -net_kw  # always store spare solar first
        if dearest > cheapest and obs.price >= dearest - 1e-9:
            return -net_kw  # most expensive step of the coming day: cover the site
        if dearest > cheapest and obs.price <= cheapest + 1e-9:
            return obs.battery_max_charge_kw  # cheapest step: fill up from the grid
        return 0.0
    raise ValueError(f"unknown battery strategy {spec.battery}")


def decide(spec: ControllerSpec, obs: Observation) -> Action:
    surplus = obs.pv_kw - obs.load_kw  # spare solar before EVs and battery
    ev = []
    for e in obs.evs:
        p = ev_power(spec, e, obs, surplus)
        surplus -= p
        ev.append(p)
    net = obs.load_kw - obs.pv_kw + sum(ev)
    return Action(battery_kw=battery_power(spec, obs, net), ev_kw=tuple(ev))
