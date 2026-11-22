"""Device uncertainty (sim/device.py): SoC estimation error, CC-CV power taper, EV charging curves."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from emsbench.sim.device import (
    SocEstimator,
    ev_battery,
    max_taper_power,
    recalibration_factor,
)
from emsbench.sim.engine import simulate
from emsbench.sim.model import (
    Battery,
    Building,
    ContractWindow,
    ControllerSpec,
    EVCharger,
    GridConnection,
    Site,
    SolarPV,
    Tariff,
)
from emsbench.sim.profiles import EVSession, EVSessionSet, Profile, ProfileLibrary

START = dt.datetime(2024, 1, 1)
T = 48


def library(sessions: tuple[EVSession, ...] = (), load_kw: float = 2.0, price: float | None = None) -> ProfileLibrary:
    hour = np.tile(np.arange(24), T // 24)
    pv = np.where((hour >= 7) & (hour <= 16), 1.0, 0.0)
    if price is None:
        tou = np.where((hour >= 16) & (hour <= 20), 0.5, 0.2)
    else:
        tou = np.full(T, price)
    lib = ProfileLibrary()
    for p in (Profile("load", "load", "flat", "test", np.full(T, load_kw), START, 3600),
              Profile("pv", "pv", "box", "test", pv, START, 3600),
              Profile("price", "price", "tou", "test", tou.astype(float), START, 3600)):
        lib.add(p)
    lib.ev_sets = {"ev": EVSessionSet("ev", "ev", "test", sessions, START, START + dt.timedelta(hours=T))}
    return lib


def car(arrive: int, leave: int, kwh: float) -> EVSession:
    return EVSession(START + dt.timedelta(hours=arrive), START + dt.timedelta(hours=leave), kwh, "car")


def site(*assets: object, **kw: object) -> Site:
    kw.setdefault("tariff", Tariff(price_profile="price"))
    return Site(start=START.date(), days=2, step_minutes=60, assets=list(assets), **kw)  # type: ignore[arg-type]


HOME = Building(id="home", load_profile="load")
PV = SolarPV(id="pv", capacity_kwp=5.0, profile="pv")
BAT = Battery(id="bat", capacity_kwh=10.0, power_kw=3.0, round_trip_efficiency=0.81)
CHARGER = EVCharger(id="ev", max_power_kw=11.0, efficiency=1.0, sessions="ev")


# --- taper shape -----------------------------------------------------------------------------------------------


def test_taper_full_power_above_the_taper_and_zero_at_the_end() -> None:
    assert max_taper_power(5.0, 2.0, 3.0, 1.0, 1.0) == pytest.approx(3.0)  # ends the step at room 2: no taper yet
    assert max_taper_power(0.0, 2.0, 3.0, 1.0, 1.0) == 0.0
    assert max_taper_power(1.0, 0.0, 3.0, 1.0, 1.0) == 3.0  # no taper region


def test_taper_is_linear_in_the_room_left_for_short_steps() -> None:
    # In the taper region the allowed power is p_max * room / room_taper (ACN-Sim's linear second stage).
    for room in (2.0, 1.0, 0.5):
        assert max_taper_power(room, 2.0, 3.0, 1.0, 1e-6) == pytest.approx(3.0 * room / 2.0, rel=1e-5)


def test_taper_does_not_depend_on_the_step_length() -> None:
    # One hour in one step moves the same energy as sixty one-minute steps (exact exponential inside the step).
    room0, room_t, p, rate = 2.5, 2.0, 3.0, 0.9
    hour = max_taper_power(room0, room_t, p, rate, 1.0) * rate * 1.0
    room = room0
    for _ in range(60):
        room -= max_taper_power(room, room_t, p, rate, 1 / 60) * rate / 60
    assert room0 - room == pytest.approx(hour, rel=1e-9)
    assert hour < p * rate  # slower than full power


def test_ev_battery_is_smallest_acn_candidate_that_holds_the_energy() -> None:
    # No minimum power: the car ends at 100%.
    assert ev_battery(5.0, 0.8, 0.0, 11.0) == (8.0, 0.0)
    assert ev_battery(24.0, 0.8, 0.0, 11.0) == (24.0, 0.0)
    assert ev_battery(30.0, 0.8, 0.0, 11.0) == (40.0, 0.0)
    assert ev_battery(150.0, 0.8, 0.0, 11.0) == (150.0, 0.0)
    # With a 4.14 kW minimum on an 11 kW charger, the session ends with 0.2 x 4.14 / 11 = 7.5% of the battery
    # unfilled: 23 kWh no longer fits in 24 kWh (22.2 usable), so the car is assumed to have 40 kWh.
    cap, rest = ev_battery(23.0, 0.8, 4.14, 11.0)
    assert cap == 40.0 and rest == pytest.approx(40.0 * 0.2 * 4.14 / 11.0)


# --- SoC estimate: drift and recalibration -----------------------------------------------------------------------


def test_recalibration_factor_shape() -> None:
    # Braendle and Hug: s / 0.15 below 15%, 1 between, 1 - (s - 0.9) / 0.1 above 90%.
    assert recalibration_factor(0.0) == 0.0
    assert recalibration_factor(0.075) == pytest.approx(0.5)
    assert recalibration_factor(0.5) == 1.0
    assert recalibration_factor(0.95) == pytest.approx(0.5)
    assert recalibration_factor(1.0) == 0.0


def test_bias_drift_accumulates_with_energy_cycled_and_full_charge_resets_it() -> None:
    est = SocEstimator(0.0, 0.01, 0.0, seed=0, index=0)
    for _ in range(10):
        est.step(0.5, 0.5, 1.0)  # half a capacity per step at mid SoC: no recalibration
    assert est.error == pytest.approx(0.05)
    est.step(0.5, 0.0, 1.0)  # idle: no drift
    assert est.error == pytest.approx(0.05)
    est.step(1.0, 0.0, 1.0)  # an hour at full: recalibrated
    assert est.error == 0.0


def test_random_drift_is_reproducible_and_scales_with_sqrt_of_energy_cycled() -> None:
    def run(seed: int, x: float, n: int) -> list[float]:
        e = SocEstimator(0.0, 0.0, 0.1, seed=seed, index=0)
        out = []
        for _ in range(n):
            e.step(0.5, x, 1.0)
            out.append(e.error)
        return out

    assert run(1, 0.2, 50) == run(1, 0.2, 50)
    assert run(1, 0.2, 50) != run(2, 0.2, 50)
    # After cycling 4 capacities in total the spread is about 0.1 * sqrt(4) = 0.2, whatever the step size.
    ends_big = [run(s, 1.0, 4)[-1] for s in range(2000)]
    ends_small = [run(s, 0.25, 16)[-1] for s in range(2000)]
    assert np.std(ends_big) == pytest.approx(0.2, rel=0.08)
    assert np.std(ends_small) == pytest.approx(0.2, rel=0.08)


def test_inactive_estimator_never_drifts() -> None:
    e = SocEstimator(0.0, 0.0, 0.0, seed=3, index=0)
    for _ in range(20):
        e.step(0.5, 1.0, 1.0)
    assert e.error == 0.0 and e.estimate(0.42) == 0.42


# --- engine ------------------------------------------------------------------------------------------------------


def test_defaults_leave_results_unchanged_and_new_kpis_zero() -> None:
    lib = library((car(2, 8, 12.0),))
    base = simulate(site(HOME, PV, BAT, CHARGER), lib)
    reseeded = simulate(site(HOME, PV, BAT.model_copy(update={"soc_error_seed": 7}), CHARGER), lib)
    assert base.kpis == reseeded.kpis  # the seed only matters when an error is configured
    for k in ("battery_plan_shortfall_kwh", "battery_plan_shortfall_steps", "battery_soc_error_max",
              "battery_soc_error_mean", "ev_taper_limited_kwh"):
        assert base.kpis[k] == 0.0
    assert np.array_equal(base.site["soc_estimate"], base.site["soc"])
    assert not base.site["battery_shortfall_kw"].any()


def test_cc_cv_battery_charges_slower_near_full() -> None:
    b = BAT.model_copy(update={"soc_initial": 0.5})
    nominal = simulate(site(HOME, PV, b), library())
    tapered = simulate(site(HOME, PV, b.model_copy(update={"power_taper": "cc_cv"})), library())
    # 3 kW of spare solar: the nominal battery is full after ~2 h; with the taper it needs longer and charges less
    # than 3 kW once above 80%.
    soc, bat = tapered.site["soc"], tapered.site["battery_kw"]
    above = (np.concatenate([[0.5], soc[:-1]]) >= 0.8) & (bat > 0)
    assert above.any() and np.all(bat[above] < 3.0 - 1e-9)
    assert np.argmax(nominal.site["soc"] > 0.999) < np.argmax(soc > 0.99)
    assert tapered.kpis["battery_plan_shortfall_kwh"] > 0  # the rule asked for 3 kW it could not get
    assert soc.max() <= 1.0 + 1e-12


def test_cc_cv_battery_discharges_less_near_empty() -> None:
    b = BAT.model_copy(update={"soc_initial": 0.3, "power_kw": 2.0, "round_trip_efficiency": 1.0})
    ctrl = ControllerSpec(battery="self_consumption")
    nominal = simulate(site(HOME, b, controller=ctrl), library())
    tapered = simulate(site(HOME, b.model_copy(update={"power_taper": "cc_cv"}), controller=ctrl), library())
    assert nominal.site["battery_kw"][0] == pytest.approx(-2.0)
    # Below 20% the power falls with the energy left: the battery never quite empties within the run.
    assert tapered.site["battery_kw"][1] > -2.0 + 1e-6
    assert tapered.site["soc"][-1] > 0 and nominal.site["soc"][-1] == pytest.approx(0.0)


def test_plant_obeys_true_soc_while_controller_sees_estimate() -> None:
    # The BMS reads 30 points high: 50% shown, 20% real. Self-consumption asks for 2 kW at night; the battery runs
    # out after the true 2 kWh, and the rest of the request becomes a shortfall.
    b = BAT.model_copy(update={"soc_initial": 0.2, "round_trip_efficiency": 1.0, "soc_error_initial": 0.3})
    r = simulate(site(HOME, b, controller=ControllerSpec(battery="self_consumption")), library())
    assert r.site["soc_estimate"][0] - r.site["soc"][0] == pytest.approx(0.3)
    assert -r.site["battery_kw"].sum() == pytest.approx(2.0)  # only the true energy came out
    assert r.site["soc"].min() >= 0.0
    assert r.kpis["battery_plan_shortfall_kwh"] > 0
    assert r.kpis["battery_soc_error_max"] == pytest.approx(0.3)
    assert any("less than the controller asked" in w for w in r.warnings)


def test_mpc_plans_on_the_estimate_and_the_contract_pays_for_it() -> None:
    # A contract window 16:00-21:00 limits import to 1 kW against a 2 kW load: the battery must supply 5 kWh. It
    # holds 3 kWh, so with a correct estimate the MPC charges 2 kWh more before the window (flat price) and keeps
    # the limit. When the BMS reads 30 points high (6 kWh), the MPC sees no need to charge, the battery runs out in
    # the window, and the contract is broken: plan shortfall and lost days.
    window = ContractWindow(start="16:00", end="21:00", import_limit_kw=1.0)
    grid = GridConnection(contract_windows=[window])
    # "plan" execution: no early-storage tie-break, so the MPC buys only the energy it thinks it needs
    ctrl = ControllerSpec(battery="mpc", mpc_replan_minutes=60, mpc_execution="plan")
    b = BAT.model_copy(update={"soc_initial": 0.3, "round_trip_efficiency": 1.0})
    lib = library(price=0.2)
    truth = simulate(site(HOME, b, controller=ctrl, grid=grid), lib)
    wrong = simulate(site(HOME, b.model_copy(update={"soc_error_initial": 0.3}), controller=ctrl, grid=grid), lib)
    assert truth.kpis["battery_plan_shortfall_kwh"] == 0
    assert truth.reliability["limit_days_kept"] == 2
    assert wrong.kpis["battery_plan_shortfall_kwh"] > 0
    assert wrong.reliability["limit_days_kept"] == 1  # day 1 broken; the estimate is recalibrated near empty
    assert wrong.reliability["limit_excess_kwh"] == pytest.approx(2.0)  # the 2 kWh it did not have


def test_full_charge_recalibrates_the_estimate_in_a_run() -> None:
    b = BAT.model_copy(update={"soc_initial": 0.5, "soc_error_initial": -0.2})
    r = simulate(site(HOME, PV, b), library())
    full = np.flatnonzero(r.site["soc"] >= 1.0 - 1e-9)
    assert full.size and r.site["soc_estimate"][0] == pytest.approx(r.site["soc"][0] - 0.2)
    k = int(full[0]) + 1  # the step after reaching full starts at 100%: a(1) = 0
    assert r.site["soc_estimate"][k] == pytest.approx(r.site["soc"][k])


def test_ev_charging_curve_slows_the_last_kilowatt_hours() -> None:
    # 22 kWh on an 11 kW charger (minimum 4.14 kW): assumed 24 kWh car that stops 1.8 kWh short of 100%, where it
    # would draw only the minimum; above 80% (the last 4.8 kWh to 100%) it tapers.
    lib = library((car(0, 12, 22.0),))
    flat = simulate(site(HOME, CHARGER), lib)
    curve = simulate(site(HOME, CHARGER.model_copy(update={"charging_curve": "cc_cv"})), lib)
    assert flat.site["ev_kw"][1] == pytest.approx(11.0)
    assert curve.site["ev_kw"][0] == pytest.approx(11.0)  # 0 -> 11 kWh: still constant current
    assert curve.site["ev_kw"][1] < 11.0 - 0.5  # crosses 80% in the second hour (about 10.2 kW)
    assert curve.kpis["ev_taper_limited_kwh"] > 0
    assert curve.kpis["ev_delivered_kwh"] == pytest.approx(22.0)  # the session's energy is still reached
    assert curve.kpis["ev_sessions_unmet"] == 0
    tight = (car(0, 2, 22.0),)  # two hours at 11 kW is just enough without the curve
    assert simulate(site(HOME, CHARGER), library(tight)).kpis["ev_unmet_kwh"] == pytest.approx(0.0)
    short = simulate(site(HOME, CHARGER.model_copy(update={"charging_curve": "cc_cv"})), library(tight))
    assert short.kpis["ev_unmet_kwh"] > 0.5
