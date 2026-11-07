"""Rule-based controllers for the generic engine.

A controller sees an `Observation` each step and returns an `Action`: desired
total battery power and desired power per EV charger. The engine then clips
these to physical limits and applies the grid-limit safety layer, so a
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
    max_kw: float
    efficiency: float


@dataclass(frozen=True)
class Observation:
    t: int
    step_hours: float
    load_kw: float
    pv_kw: float
    price: float
    price_next_24h: NDArray[np.float64]  # includes the current step
    battery_energy_kwh: float  # total stored, all batteries
    battery_capacity_kwh: float
    battery_max_charge_kw: float  # feasible this step (power and SoC limits)
    battery_max_discharge_kw: float
    evs: tuple[EVState, ...]


@dataclass(frozen=True)
class Action:
    battery_kw: float
    ev_kw: tuple[float, ...]


def ev_power(spec: ControllerSpec, ev: EVState, step_hours: float) -> float:
    if not ev.connected or ev.remaining_kwh <= 1e-9:
        return 0.0
    needed_kw = ev.remaining_kwh / ev.efficiency / step_hours
    if spec.ev == "spread_until_departure":
        return min(ev.max_kw, needed_kw / max(ev.steps_left, 1))
    return min(ev.max_kw, needed_kw)


def battery_power(spec: ControllerSpec, obs: Observation, net_kw: float) -> float:
    """Desired battery power given the site's net demand before the battery."""
    if spec.battery == "idle":
        return 0.0
    if spec.battery == "self_consumption":
        return -net_kw  # surplus (net<0) -> charge; deficit -> discharge
    if spec.battery == "peak_shaving":
        return spec.peak_threshold_kw - net_kw  # charge below threshold, discharge above
    if spec.battery == "price_arbitrage":
        window = obs.price_next_24h
        cheapest, dearest = float(window.min()), float(window.max())
        if net_kw < 0:
            return -net_kw  # always store spare solar first
        if dearest > cheapest and obs.price >= dearest - 1e-9:
            return -net_kw  # most expensive hour of the coming day: cover the site
        if dearest > cheapest and obs.price <= cheapest + 1e-9:
            return obs.battery_max_charge_kw  # cheapest hour: fill up from the grid
        return 0.0
    raise ValueError(f"unknown battery strategy {spec.battery}")


def decide(spec: ControllerSpec, obs: Observation) -> Action:
    ev = tuple(ev_power(spec, e, obs.step_hours) for e in obs.evs)
    net = obs.load_kw - obs.pv_kw + sum(ev)
    return Action(battery_kw=battery_power(spec, obs, net), ev_kw=ev)
