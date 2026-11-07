"""Physics and controller tests for the generic engine, on synthetic data."""

from __future__ import annotations

import datetime as dt

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

START = dt.datetime(2024, 1, 1)
T = 48


def library(sessions: tuple[EVSession, ...] = ()) -> ProfileLibrary:
    hour = np.tile(np.arange(24), T // 24)  # hour of day 0..23
    load = np.full(T, 2.0)
    pv = np.where((hour >= 7) & (hour <= 16), 1.0, 0.0)  # 1 kW/kWp from 07:00 to 17:00
    price = np.where((hour >= 16) & (hour <= 20), 0.5, 0.2)
    lib = ProfileLibrary()
    for p in (Profile("load", "load", "flat 2 kW", "test", load, START, 3600),
              Profile("pv", "pv", "box", "test", pv, START, 3600),
              Profile("price", "price", "tou", "test", price.astype(float), START, 3600)):
        lib.add(p)
    lib.ev_sets = {"ev": EVSessionSet("ev", "ev", "test", sessions, START, START + dt.timedelta(hours=T))}
    return lib


def car(arrive: int, leave: int, kwh: float, max_kw: float | None = None) -> EVSession:
    return EVSession(START + dt.timedelta(hours=arrive), START + dt.timedelta(hours=leave), kwh, "car", max_kw)


def site(*assets: object, **kw: object) -> Site:
    kw.setdefault("tariff", Tariff(price_profile="price"))
    return Site(start=START.date(), days=2, step_minutes=60, assets=list(assets), **kw)  # type: ignore[arg-type]


HOME = Building(id="home", load_profile="load")
PV = SolarPV(id="pv", capacity_kwp=5.0, profile="pv")
BAT = Battery(id="bat", capacity_kwh=10.0, power_kw=3.0, round_trip_efficiency=0.81)
CHARGER = EVCharger(id="ev", max_power_kw=11.0, efficiency=1.0, sessions="ev")


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
    b = BAT.model_copy(update={"power_kw": 100.0})
    r = simulate(site(HOME, b, controller=ControllerSpec(battery="price_arbitrage")), library())
    bat = r.site["battery_kw"]
    charged, discharged = bat[bat > 0].sum(), -bat[bat < 0].sum()
    assert bat[bat > 0][0] == pytest.approx(10.0 / 0.9)
    assert discharged == pytest.approx((charged * 0.9 - r.site["soc"][-1] * 10.0) * 0.9)


def test_price_arbitrage_charges_at_cheapest_and_discharges_at_dearest() -> None:
    r = simulate(site(HOME, BAT, controller=ControllerSpec(battery="price_arbitrage")), library())
    price, bat = r.site["price"], r.site["battery_kw"]
    assert np.all(price[bat > 1e-9] == price.min())
    assert np.all(price[bat < -1e-9] == price.max())


def test_price_adder_is_added_to_every_step() -> None:
    r = simulate(site(HOME, tariff=Tariff(price_profile="price", price_adder=0.1)), library())
    assert r.site["price"].min() == pytest.approx(0.3)


def test_import_limit_slows_ev_then_reports_overload() -> None:
    lib = library((car(0, 10, 40.0),))
    r = simulate(site(HOME, CHARGER, grid=GridConnection(import_limit_kw=6.0)), lib)
    assert r.site["grid_kw"].max() <= 6.0 + 1e-9
    assert r.kpis["grid_overload_kwh"] == 0
    r2 = simulate(site(HOME, grid=GridConnection(import_limit_kw=1.5)), library())
    assert r2.kpis["grid_overload_kwh"] == pytest.approx(0.5 * T)
    assert r2.warnings


def test_export_limit_curtails_solar() -> None:
    r = simulate(site(HOME, PV, controller=ControllerSpec(battery="idle"),
                      grid=GridConnection(export_limit_kw=1.0)), library())
    assert r.site["grid_kw"].min() >= -1.0 - 1e-9
    assert r.kpis["pv_curtailed_kwh"] == pytest.approx(2 * 10 * 2.0)
    assert balance_ok(r)


def test_ev_strategies_deliver_and_shape_power() -> None:
    lib = library((car(2, 8, 12.0),))
    one_phase = CHARGER.model_copy(update={"phases": 1, "max_power_kw": 7.4})
    fast = simulate(site(HOME, CHARGER), lib)
    spread = simulate(site(HOME, one_phase, controller=ControllerSpec(ev="spread_until_departure")), lib)
    assert fast.site["ev_kw"][2] == pytest.approx(11.0)
    assert spread.site["ev_kw"][2:8] == pytest.approx(np.full(6, 2.0))  # above the 1.38 kW minimum
    # A three-phase charger cannot go below 6 A x 3 x 230 V = 4.14 kW, so "spread" runs at that.
    spread3 = simulate(site(HOME, CHARGER, controller=ControllerSpec(ev="spread_until_departure")), lib)
    assert spread3.site["ev_kw"][2] == pytest.approx(4.14)
    assert spread3.kpis["ev_delivered_kwh"] == pytest.approx(12.0)
    for r in (fast, spread):
        assert r.kpis["ev_delivered_kwh"] == pytest.approx(12.0)
        assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0)
        assert r.sessions[0]["delivered_kwh"] == pytest.approx(12.0)


def test_cheapest_hours_avoids_the_peak() -> None:
    lib = library((car(14, 24, 11.0),))  # plugged 14:00-24:00, peak price 16:00-21:00
    r = simulate(site(HOME, CHARGER, controller=ControllerSpec(ev="cheapest_hours")), lib)
    ev, price = r.site["ev_kw"], r.site["price"]
    assert np.all(price[ev > 1e-9] == price.min())
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0)


def test_solar_surplus_uses_sun_then_finishes_by_departure() -> None:
    sunny = library((car(8, 14, 6.0),))
    one_phase = CHARGER.model_copy(update={"phases": 1, "max_power_kw": 7.4})
    ctrl = ControllerSpec(battery="idle", ev="solar_surplus")
    r = simulate(site(HOME, PV, one_phase, controller=ctrl), sunny)
    assert r.site["grid_kw"][8:14].max() <= 1e-9  # charged from the 3 kW surplus only
    assert r.kpis["ev_delivered_kwh"] == pytest.approx(6.0)
    # Three-phase: 3 kW surplus is below the 4.14 kW minimum, so it waits, then must use the grid.
    r3 = simulate(site(HOME, PV, CHARGER, controller=ctrl), sunny)
    assert r3.site["ev_kw"][8:13].max() == 0 and r3.kpis["ev_delivered_kwh"] == pytest.approx(6.0)
    tight = library((car(18, 20, 20.0),))  # no sun, little time: must charge anyway
    r2 = simulate(site(HOME, PV, CHARGER, controller=ControllerSpec(ev="solar_surplus")), tight)
    assert r2.kpis["ev_delivered_kwh"] == pytest.approx(20.0)


def test_ev_unmet_when_session_too_short() -> None:
    c = CHARGER.model_copy(update={"max_power_kw": 10.0})
    r = simulate(site(HOME, c), library((car(0, 2, 30.0),)))
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(10.0)
    assert r.kpis["ev_sessions_unmet"] == 1


def test_car_limit_caps_charger() -> None:
    r = simulate(site(HOME, CHARGER), library((car(0, 10, 20.0, max_kw=3.7),)))
    assert r.site["ev_kw"].max() == pytest.approx(3.7)


def test_single_phase_charger_respects_fuse() -> None:
    c = CHARGER.model_copy(update={"phases": 1, "phase": "L2", "max_power_kw": 7.4})
    r = simulate(site(HOME, c, grid=GridConnection(fuse_a=25.0)), library((car(0, 20, 30.0),)))
    # Home 2 kW balanced = 2.9 A per phase; 25 A fuse leaves ~22 A (5.1 kW) for the car on L2.
    assert r.site["phase_l2_a"].max() <= 25.0 + 1e-6
    assert r.site["phase_l1_a"].max() == pytest.approx(2000 / 3 / 230)
    assert r.site["ev_kw"][0] == pytest.approx(25 * 0.230 - 2 / 3, rel=1e-6)
    assert r.kpis["fuse_overload_kwh"] == 0


def test_charger_pauses_below_minimum_current() -> None:
    # Fuse leaves less than 6 A on L1 for a single-phase charger: it must pause, not trickle.
    c = CHARGER.model_copy(update={"phases": 1, "phase": "L1"})
    r = simulate(site(HOME, c, grid=GridConnection(fuse_a=7.0)), library((car(0, 10, 10.0),)))
    assert np.allclose(r.site["ev_kw"], 0)


def test_demand_charge_added_to_cost() -> None:
    r = simulate(site(HOME, controller=ControllerSpec(battery="idle"),
                      tariff=Tariff(price_profile="price", demand_charge_per_kw_month=10.0)), library())
    assert r.kpis["demand_charge_cost"] == pytest.approx(10.0 * 2.0)
    assert r.kpis["total_cost"] == pytest.approx(r.kpis["energy_cost"] + 20.0)


def test_fifteen_minute_steps_preserve_energy() -> None:
    lib = library((car(2, 8, 12.0),))
    hourly = simulate(site(HOME, PV, BAT, CHARGER), lib)
    quarter = simulate(site(HOME, PV, BAT, CHARGER).model_copy(update={"step_minutes": 15}), lib)
    assert quarter.site["grid_kw"].size == 4 * hourly.site["grid_kw"].size
    assert quarter.kpis["grid_import_kwh"] == pytest.approx(hourly.kpis["grid_import_kwh"], rel=0.05)
    assert quarter.kpis["ev_delivered_kwh"] == pytest.approx(12.0)
    assert any(s["resampling"].startswith("repeated") for s in quarter.sources)


def test_peak_shaving_caps_import_when_battery_allows() -> None:
    c = CHARGER.model_copy(update={"max_power_kw": 6.0})
    b = BAT.model_copy(update={"soc_initial": 1.0})
    ctrl = ControllerSpec(battery="peak_shaving", peak_threshold_kw=4.0)
    r = simulate(site(HOME, c, b, controller=ctrl), library((car(20, 23, 6.0),)))
    assert r.site["battery_kw"][20] == pytest.approx(-3.0)  # 2 + 6 - 4 needs 4, battery gives 3
    assert r.site["grid_kw"][20] == pytest.approx(5.0)
    assert balance_ok(r)
