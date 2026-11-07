"""Physics and controller tests for the generic engine, on synthetic data."""

from __future__ import annotations

import numpy as np
import pytest

from emsbench.sim.engine import simulate
from emsbench.sim.model import (
    Battery,
    Building,
    ControllerSpec,
    EVCharger,
    GridConnection,
    Site,
    SolarPV,
    Tariff,
)
from emsbench.sim.profiles import EVSession, EVSessionSet, Profile, ProfileLibrary

T = 48


def library(sessions: tuple[EVSession, ...] = ()) -> ProfileLibrary:
    hour = np.tile(np.arange(1, 25), T // 24)
    load = np.full(T, 2.0)
    pv = np.where((hour >= 8) & (hour <= 17), 1.0, 0.0)  # 1 kWh/kWp 08-17h
    price = np.where((hour >= 17) & (hour <= 21), 0.5, 0.2)
    lib = ProfileLibrary(month=np.ones(T, dtype=int), hour=hour)
    lib.profiles = {
        "load": Profile("load", "load", "flat 2 kW", "test", load),
        "pv": Profile("pv", "pv", "box", "test", pv),
        "price": Profile("price", "price", "tou", "test", price.astype(float)),
    }
    lib.ev_sets = {"ev": EVSessionSet("ev", "ev", "test", sessions, T)}
    return lib


def site(*assets: object, **kw: object) -> Site:
    kw.setdefault("tariff", Tariff(price_profile="price"))
    return Site(days=2, assets=list(assets), **kw)  # type: ignore[arg-type]


HOME = Building(id="home", load_profile="load")
PV = SolarPV(id="pv", capacity_kwp=5.0, profile="pv")
BAT = Battery(id="bat", capacity_kwh=10.0, power_kw=3.0, round_trip_efficiency=0.81)


def balance_ok(r) -> bool:  # type: ignore[no-untyped-def]
    s = r.site
    return bool(np.allclose(s["grid_kw"], s["load_kw"] - s["pv_kw"] + s["battery_kw"] + s["ev_kw"]))


def test_idle_battery_does_nothing() -> None:
    r = simulate(site(HOME, PV, BAT, controller=ControllerSpec(battery="idle")), library())
    assert np.allclose(r.site["battery_kw"], 0)
    assert np.allclose(r.site["grid_kw"], r.site["load_kw"] - r.site["pv_kw"])
    assert balance_ok(r)


def test_self_consumption_never_charges_from_grid_or_exports_while_discharging() -> None:
    r = simulate(site(HOME, PV, BAT), library())
    s = r.site
    surplus = np.clip(s["pv_kw"] - s["load_kw"], 0, None)
    assert np.all(s["battery_kw"] <= surplus + 1e-9)
    assert not np.any((s["battery_kw"] < -1e-9) & (s["grid_kw"] < -1e-9))
    assert balance_ok(r)


def test_limits_respected() -> None:
    b = BAT.model_copy(update={"soc_min": 0.1, "soc_max": 0.9, "soc_initial": 0.5})
    r = simulate(site(HOME, PV, b), library())
    assert r.site["soc"].min() >= 0.1 - 1e-9 and r.site["soc"].max() <= 0.9 + 1e-9
    assert np.abs(r.site["battery_kw"]).max() <= 3.0 + 1e-9


def test_round_trip_losses() -> None:
    # One-way efficiency is sqrt(0.81) = 0.9 on both charge and discharge.
    b = BAT.model_copy(update={"power_kw": 100.0})
    r = simulate(site(HOME, b, controller=ControllerSpec(battery="price_arbitrage")), library())
    bat = r.site["battery_kw"]
    charged, discharged = bat[bat > 0].sum(), -bat[bat < 0].sum()
    assert bat[bat > 0][0] == pytest.approx(10.0 / 0.9)  # first fill: 10 kWh stored
    stored_end = r.site["soc"][-1] * 10.0
    assert discharged == pytest.approx((charged * 0.9 - stored_end) * 0.9)


def test_price_arbitrage_charges_at_cheapest_and_discharges_at_dearest() -> None:
    r = simulate(site(HOME, BAT, controller=ControllerSpec(battery="price_arbitrage")), library())
    price, bat = r.site["price"], r.site["battery_kw"]
    assert np.all(price[bat > 1e-9] == price.min())
    assert np.all(price[bat < -1e-9] == price.max())


def test_import_limit_slows_ev_then_reports_overload() -> None:
    sess = (EVSession(arrival=0, departure=10, energy_kwh=40.0, ev_id="a", battery_kwh=60.0),)
    car = EVCharger(id="ev", max_power_kw=11.0, efficiency=1.0, sessions="ev")
    r = simulate(site(HOME, car, grid=GridConnection(import_limit_kw=6.0)), library(sess))
    assert r.site["grid_kw"].max() <= 6.0 + 1e-9
    assert r.kpis["grid_overload_kwh"] == 0
    # A limit below the building load alone cannot be met
    r2 = simulate(site(HOME, grid=GridConnection(import_limit_kw=1.5)), library())
    assert r2.kpis["grid_overload_kwh"] == pytest.approx(0.5 * T)
    assert r2.warnings


def test_export_limit_curtails_solar() -> None:
    r = simulate(
        site(HOME, PV, controller=ControllerSpec(battery="idle"),
             grid=GridConnection(export_limit_kw=1.0)),
        library(),
    )
    assert r.site["grid_kw"].min() >= -1.0 - 1e-9
    assert r.kpis["pv_curtailed_kwh"] == pytest.approx(2 * 10 * 2.0)  # 5-2-1 kW for 10 h, 2 days
    assert balance_ok(r)


def test_ev_strategies() -> None:
    sess = (EVSession(arrival=2, departure=8, energy_kwh=12.0, ev_id="a", battery_kwh=60.0),)
    car = EVCharger(id="ev", max_power_kw=11.0, efficiency=1.0, sessions="ev")
    fast = simulate(site(HOME, car), library(sess))
    spread = simulate(
        site(HOME, car, controller=ControllerSpec(ev="spread_until_departure")), library(sess)
    )
    assert fast.site["ev_kw"][2] == pytest.approx(11.0)
    assert spread.site["ev_kw"][2:8] == pytest.approx(np.full(6, 2.0))
    for r in (fast, spread):
        assert r.kpis["ev_delivered_kwh"] == pytest.approx(12.0)
        assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0)


def test_ev_unmet_when_session_too_short() -> None:
    sess = (EVSession(arrival=0, departure=2, energy_kwh=30.0, ev_id="a", battery_kwh=60.0),)
    car = EVCharger(id="ev", max_power_kw=10.0, efficiency=1.0, sessions="ev")
    r = simulate(site(HOME, car), library(sess))
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(10.0)
    assert r.kpis["ev_sessions_unmet"] == 1


def test_demand_charge_added_to_cost() -> None:
    r = simulate(
        site(HOME, controller=ControllerSpec(battery="idle"),
             tariff=Tariff(price_profile="price", demand_charge_per_kw_month=10.0)),
        library(),
    )
    assert r.kpis["demand_charge_cost"] == pytest.approx(10.0 * 2.0)
    assert r.kpis["total_cost"] == pytest.approx(r.kpis["energy_cost"] + 20.0)


def test_peak_shaving_caps_import_when_battery_allows() -> None:
    sess = (EVSession(arrival=20, departure=23, energy_kwh=6.0, ev_id="a", battery_kwh=60.0),)
    car = EVCharger(id="ev", max_power_kw=6.0, efficiency=1.0, sessions="ev")
    b = BAT.model_copy(update={"soc_initial": 1.0})
    ctrl = ControllerSpec(battery="peak_shaving", peak_threshold_kw=4.0)
    r = simulate(site(HOME, car, b, controller=ctrl), library(sess))
    # 2 kW home + 6 kW EV = 8 kW; reaching 4 kW needs 4 kW but the battery gives at most 3.
    assert r.site["battery_kw"][20] == pytest.approx(-3.0)
    assert r.site["grid_kw"][20] == pytest.approx(5.0)
    assert balance_ok(r)


def test_peak_shaving_meets_threshold_when_feasible() -> None:
    sess = (EVSession(arrival=20, departure=23, energy_kwh=3.0, ev_id="a", battery_kwh=60.0),)
    car = EVCharger(id="ev", max_power_kw=3.0, efficiency=1.0, sessions="ev")
    b = BAT.model_copy(update={"soc_initial": 1.0})
    ctrl = ControllerSpec(battery="peak_shaving", peak_threshold_kw=4.0)
    r = simulate(site(HOME, car, b, controller=ctrl), library(sess))
    assert r.site["grid_kw"][20] == pytest.approx(4.0)  # 2 + 3 - 1 kW discharge
