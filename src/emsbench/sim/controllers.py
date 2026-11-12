"""Rule-based controllers for the generic engine.

A controller sees an `Observation` each step and returns an `Action`: desired
total battery power and desired power per EV charger. The engine then clips
these to physical limits and applies the safety layer (grid limit, fuses), so a
controller can never break a limit, only ask for something infeasible.

Sign convention: positive power = consumed from the site bus (battery
charging, EV charging, heat pump); negative = supplied to the bus (battery
discharging, a car discharging through a bidirectional charger).
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
    phase: str = "3"  # "3" = spread over three phases, else the phase it draws from
    can_discharge: bool = False  # bidirectional charger and a car that may give energy back now
    max_discharge_kw: float = 0.0  # feasible discharge this step (keeps the departure target reachable)


@dataclass(frozen=True)
class HPState:
    heat_kw: float  # heat demand this step (space + hot water)
    cop: float  # kWh heat per kWh electricity this step
    buffer_kwh: float  # heat stored in the tank now
    buffer_cap_kwh: float
    max_kw: float  # electric power limit


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
    month_peak_kw: float = 0.0  # highest import so far this billing month (for demand charges)
    tou_peaks: tuple[tuple[float, float], ...] = ()  # (rate, highest import so far this month) per window
    heat_pumps: tuple[HPState, ...] = ()


@dataclass(frozen=True)
class Action:
    battery_kw: float
    ev_kw: tuple[float, ...]
    hp_kw: tuple[float, ...] = ()  # empty: heat pumps run on demand


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
        if dearest - cheapest < 1e-9:
            return -net_kw  # flat prices ahead: nothing to arbitrage, so behave like self-consumption
        if dearest > cheapest and obs.price >= dearest - 1e-9:
            return -net_kw  # most expensive step of the coming day: cover the site
        if dearest > cheapest and obs.price <= cheapest + 1e-9:
            return obs.battery_max_charge_kw  # cheapest step: fill up from the grid
        return 0.0
    raise ValueError(f"unknown battery strategy {spec.battery}")


def hp_power(spec: ControllerSpec, hp: HPState, obs: Observation, surplus_kw: float) -> float:
    """Desired electric power of a heat pump. The engine keeps it between 'just enough to meet demand with
    what is in the tank' and 'tank full', so asking for 0 means 'use the tank' and max means 'fill it'."""
    on_demand = hp.heat_kw / hp.cop if hp.cop > 0 else 0.0
    if spec.heat_pump == "on_demand" or hp.buffer_cap_kwh <= 0:
        return on_demand
    if spec.heat_pump == "cheap_hours":
        low, high = np.quantile(obs.price_ahead, [0.25, 0.75])
        if obs.price <= low:
            return hp.max_kw  # cheap: fill the tank
        if obs.price >= high:
            return 0.0  # dear: draw on the tank first (the engine still heats if it runs empty)
        return on_demand
    if spec.heat_pump == "solar_surplus":
        return on_demand + max(surplus_kw, 0.0)  # spare solar goes into the tank
    raise ValueError(f"unknown heat pump strategy {spec.heat_pump}")


def decide(spec: ControllerSpec, obs: Observation) -> Action:
    surplus = obs.pv_kw - obs.load_kw  # spare solar before EVs, heat pumps and battery
    ev = []
    for e in obs.evs:
        p = ev_power(spec, e, obs, surplus)
        surplus -= p
        ev.append(p)
    hp = []
    for h in obs.heat_pumps:
        p = hp_power(spec, h, obs, surplus)
        surplus -= p
        hp.append(p)
    net = obs.load_kw - obs.pv_kw + sum(ev) + sum(hp)
    bat = battery_power(spec, obs, net)
    # Bidirectional chargers: a car that is not charging covers what is still imported, at dear hours.
    if spec.ev_discharge == "high_prices" and any(e.can_discharge for e in obs.evs):
        residual = net + max(-obs.battery_max_discharge_kw, min(bat, obs.battery_max_charge_kw))
        if residual > 0 and obs.price >= float(np.median(obs.price_ahead)):
            for i, e in enumerate(obs.evs):
                if e.can_discharge and ev[i] <= 0 and residual > 0:
                    d = min(residual, v2h_power(e, obs))
                    if d > 0:
                        ev[i] = -d
                        residual -= d
    return Action(battery_kw=bat, ev_kw=tuple(ev), hp_kw=tuple(hp))


def v2h_power(e: EVState, obs: Observation) -> float:
    """How much a car may give back now under the 'high_prices' rule.

    Only if it pays after losses: a kWh lent now must be recharged later, losing energy both ways, so the price
    now must beat the cheapest price before departure divided by efficiency squared. And only so much that the
    car can still be recharged in half of its remaining stay, which leaves room to recharge at cheap hours
    instead of being forced to charge at full power whatever the price.
    """
    future = obs.price_ahead[1: max(e.steps_left, 1)]
    if future.size == 0 or obs.price * e.efficiency**2 <= float(future.min()):
        return 0.0
    dt = obs.step_hours
    half_stay = (e.steps_left - 1) // 2
    room_kwh = half_stay * e.max_kw * dt * e.efficiency - e.remaining_kwh  # car energy we may still lend
    if room_kwh <= 0:
        return 0.0
    return min(e.max_discharge_kw, room_kwh * e.efficiency / dt)


class RuleController:
    """Wraps the stateless rules in the same interface as stateful controllers (MPC)."""

    def __init__(self, spec: ControllerSpec) -> None:
        self.spec = spec

    def act(self, obs: Observation) -> Action:
        return decide(self.spec, obs)
