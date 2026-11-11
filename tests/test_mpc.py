"""Deterministic MPC: behaviour that must hold by construction, on synthetic data."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from emsbench.sim.engine import simulate
from emsbench.sim.model import Battery, Building, ControllerSpec, EVCharger, GridConnection, Site, SolarPV, Tariff
from emsbench.sim.profiles import EVSession, EVSessionSet, Profile, ProfileLibrary

START = dt.datetime(2024, 1, 1)
T = 48


def library(sessions: tuple[EVSession, ...] = (), load_kw: float = 2.0) -> ProfileLibrary:
    hour = np.tile(np.arange(24), T // 24)
    pv = np.where((hour >= 7) & (hour <= 16), 1.0, 0.0)
    price = np.where((hour >= 16) & (hour <= 20), 0.5, 0.2)
    lib = ProfileLibrary()
    for p in (Profile("load", "load", "flat", "test", np.full(T, load_kw), START, 3600),
              Profile("pv", "pv", "box", "test", pv, START, 3600),
              Profile("price", "price", "tou", "test", price.astype(float), START, 3600)):
        lib.add(p)
    lib.ev_sets = {f"ev{i}": EVSessionSet(f"ev{i}", "ev", "test", (s,), START, START + dt.timedelta(hours=T))
                   for i, s in enumerate(sessions)}
    return lib


def car(arrive: int, leave: int, kwh: float) -> EVSession:
    return EVSession(START + dt.timedelta(hours=arrive), START + dt.timedelta(hours=leave), kwh, "car")


def site(*assets: object, battery: str = "mpc", ev: str = "as_fast_as_possible", **kw: object) -> Site:
    kw.setdefault("tariff", Tariff(price_profile="price"))
    ctrl = ControllerSpec(battery=battery, ev=ev, mpc_replan_minutes=60)  # type: ignore[arg-type]
    return Site(start=START.date(), days=2, step_minutes=60, controller=ctrl, assets=list(assets), **kw)  # type: ignore[arg-type]


HOME = Building(id="home", load_profile="load")
BAT = Battery(id="bat", capacity_kwh=10.0, power_kw=3.0, round_trip_efficiency=0.81)


def charger(i: int, **kw: object) -> EVCharger:
    args: dict[str, object] = {"max_power_kw": 11.0, "efficiency": 1.0, **kw}
    return EVCharger(id=f"c{i}", sessions=f"ev{i}", **args)  # type: ignore[arg-type]


def balance_ok(r) -> bool:  # type: ignore[no-untyped-def]
    s = r.site
    return bool(np.allclose(s["grid_kw"], s["load_kw"] - s["pv_kw"] + s["battery_kw"] + s["ev_kw"]))


def test_mpc_beats_or_matches_every_rule_on_arbitrage() -> None:
    lib = library()
    mpc = simulate(site(HOME, BAT), lib)
    for rule in ("idle", "self_consumption", "price_arbitrage", "peak_shaving"):
        other = simulate(site(HOME, BAT, battery=rule), lib)
        assert mpc.kpis["total_cost"] <= other.kpis["total_cost"] + 1e-6, rule
    assert balance_ok(mpc)


def test_mpc_charges_cheap_and_discharges_dear() -> None:
    r = simulate(site(HOME, BAT), library())
    price, bat = r.site["price"], r.site["battery_kw"]
    assert np.all(price[bat > 1e-6] == price.min())
    assert np.all(price[bat < -1e-6] == price.max())
    assert r.site["soc"].min() >= -1e-9 and r.site["soc"].max() <= 1 + 1e-9


def test_mpc_does_not_cycle_when_it_cannot_pay() -> None:
    # Flat price: losses make cycling a pure cost, so the battery should stay idle.
    lib = library()
    lib.profiles["price"] = Profile("price", "price", "flat", "test", np.full(T, 0.3), START, 3600)
    r = simulate(site(HOME, BAT), lib)
    assert np.abs(r.site["battery_kw"]).max() < 1e-6


def test_mpc_schedules_ev_in_cheapest_hours_and_delivers() -> None:
    lib = library((car(14, 24, 11.0),))
    r = simulate(site(HOME, charger(0)), lib)
    ev, price = r.site["ev_kw"], r.site["price"]
    assert np.all(price[ev > 1e-6] == price.min())
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0, abs=1e-6)


def test_mpc_respects_import_limit_while_delivering() -> None:
    lib = library((car(0, 10, 30.0),))
    r = simulate(site(HOME, charger(0), grid=GridConnection(import_limit_kw=7.0)), lib)
    assert r.site["grid_kw"].max() <= 7.0 + 1e-6
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0, abs=1e-6)


def test_no_controller_can_charge_below_the_minimum_current() -> None:
    # 6 kW limit - 2 kW home = 4 kW left, below a three-phase charger's 4.14 kW minimum (6 A x 3 x 230 V).
    lib = library((car(0, 10, 30.0),))
    for battery, ev in (("mpc", "as_fast_as_possible"), ("idle", "as_fast_as_possible")):
        r = simulate(site(HOME, charger(0), battery=battery, ev=ev, grid=GridConnection(import_limit_kw=6.0)), lib)
        assert r.kpis["ev_delivered_kwh"] == pytest.approx(0.0, abs=1e-6)


def test_mpc_avoids_the_rebound_peak_on_a_fuse() -> None:
    # Three single-phase cars on L1 arrive together; the cheapest hours are the same for all.
    sessions = (car(18, 31, 10.0), car(18, 31, 10.0), car(18, 31, 10.0))
    chargers = [charger(i, phases=1, phase="L1", max_power_kw=7.4) for i in range(3)]
    grid = GridConnection(fuse_a=32.0)
    rule = simulate(site(HOME, *chargers, battery="idle", ev="cheapest_hours", grid=grid), library(sessions))
    mpc = simulate(site(HOME, *chargers, grid=grid), library(sessions))
    assert mpc.kpis["fuse_overload_kwh"] == pytest.approx(0.0, abs=1e-6)
    assert mpc.site["phase_l1_a"].max() <= 32.0 + 1e-6
    assert mpc.kpis["ev_unmet_kwh"] == pytest.approx(0.0, abs=1e-3)
    assert mpc.kpis["max_phase_current_a"] <= rule.kpis["max_phase_current_a"] + 1e-6


def test_mpc_lowers_peak_when_peaks_are_billed() -> None:
    sess = (car(16, 22, 20.0),)
    no_charge = simulate(site(HOME, BAT, charger(0)), library(sess))
    billed = simulate(site(HOME, BAT, charger(0), tariff=Tariff(price_profile="price",
                                                                demand_charge_per_kw_month=20.0)), library(sess))
    assert billed.kpis["peak_import_kw"] < no_charge.kpis["peak_import_kw"] - 0.5
    assert billed.kpis["total_cost"] <= simulate(site(HOME, BAT, charger(0), battery="idle", tariff=Tariff(
        price_profile="price", demand_charge_per_kw_month=20.0)), library(sess)).kpis["total_cost"] + 1e-6


def test_mpc_with_solar_costs_no_more_than_self_consumption() -> None:
    # MPC ends every plan with at least its starting energy, so near the end of a run it may keep energy
    # in the battery that the bill does not count. Value leftover energy at the cheapest price after losses.
    pv = SolarPV(id="pv", capacity_kwp=6.0, profile="pv")
    lib = library()
    mpc = simulate(site(HOME, pv, BAT), lib)
    rule = simulate(site(HOME, pv, BAT, battery="self_consumption"), lib)

    def net_cost(r) -> float:  # type: ignore[no-untyped-def]
        leftover_kwh = float(r.site["soc"][-1]) * BAT.capacity_kwh
        return float(r.kpis["total_cost"]) - leftover_kwh * float(r.site["price"].min()) * 0.9

    assert net_cost(mpc) <= net_cost(rule) + 1e-3
    assert balance_ok(mpc)


def test_mpc_stores_free_solar_for_a_car_that_arrives_later() -> None:
    # Export pays nothing and the house needs little overnight. Tomorrow's solar refills the battery anyway,
    # so only knowing that a car arrives tonight makes storing today's solar worth it.
    pv = SolarPV(id="pv", capacity_kwp=6.0, profile="pv")
    lib = library((car(18, 30, 9.0),), load_kw=0.2)
    mpc = simulate(site(HOME, pv, BAT, charger(0)), lib)
    rule = simulate(site(HOME, pv, BAT, charger(0), battery="self_consumption", ev="cheapest_hours"), lib)
    assert mpc.kpis["ev_unmet_kwh"] == pytest.approx(0.0, abs=1e-6)
    assert mpc.kpis["total_cost"] <= rule.kpis["total_cost"] + 1e-6


def test_mpc_delivers_the_last_kwh_below_the_minimum_power() -> None:
    # 21.6 kWh at 11 kW in hourly steps: two full hours leave 0.6 kWh, less than the 4.14 kW minimum for an hour.
    lib = library((car(18, 24, 21.6),))
    r = simulate(site(HOME, charger(0)), lib)
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0, abs=1e-6)


def test_relax_and_fix_is_close_to_the_exact_on_off_solution(monkeypatch: pytest.MonkeyPatch) -> None:
    from emsbench.sim import mpc as mpc_module

    sessions = (car(6, 12, 3.0), car(18, 31, 21.6))
    pv = SolarPV(id="pv", capacity_kwp=3.0, profile="pv")
    lib = library(sessions[1:], load_kw=0.5)
    lib.ev_sets["ev1"] = lib.ev_sets["ev0"]
    lib.ev_sets["ev0"] = EVSessionSet("ev0", "ev", "test", sessions[:1], START, START + dt.timedelta(hours=T))
    s = site(HOME, pv, BAT, charger(0), charger(1))
    fast = simulate(s, lib)
    init = mpc_module.MPCController.__init__

    def exact_init(self, *a, **k) -> None:  # type: ignore[no-untyped-def]
        init(self, *a, **k)
        self.exact = True

    monkeypatch.setattr(mpc_module.MPCController, "__init__", exact_init)
    exact = simulate(s, lib)
    assert fast.kpis["ev_unmet_kwh"] == pytest.approx(exact.kpis["ev_unmet_kwh"], abs=1e-6)
    assert fast.kpis["total_cost"] <= exact.kpis["total_cost"] * 1.02 + 1e-6


def test_mpc_survives_negative_prices_without_importing_to_export() -> None:
    # Prices below the export price would make "import and export at once" look like free money.
    lib = library()
    hour = np.tile(np.arange(24), T // 24)
    lib.profiles["price"] = Profile("price", "price", "neg", "test", np.where(hour == 13, -0.5, 0.3), START, 3600)
    pv = SolarPV(id="pv", capacity_kwp=6.0, profile="pv")
    r = simulate(site(HOME, pv, BAT, tariff=Tariff(price_profile="price", export_price=0.08)), lib)
    assert balance_ok(r)
    neg = r.site["price"] < 0
    # Solar 6 kW - home 2 kW - battery 3 kW: 1 kW must be exported (no curtailment without an export limit),
    # but nothing more, and the battery charges at full power while the price is negative.
    assert np.all(r.site["grid_kw"][neg] >= -1.0 - 1e-6)
    assert np.allclose(r.site["battery_kw"][neg], BAT.power_kw)


def test_hybrid_execution_never_stores_less_solar_than_the_rule() -> None:
    # Flat price, export paid: a plain plan is indifferent between storing and exporting spare solar.
    lib = library()
    lib.profiles["price"] = Profile("price", "price", "flat", "test", np.full(T, 0.3), START, 3600)
    pv = SolarPV(id="pv", capacity_kwp=6.0, profile="pv")
    s = site(HOME, pv, BAT, tariff=Tariff(price_profile="price", export_price=0.08))
    s = s.model_copy(update={"controller": s.controller.model_copy(update={"mpc_execution": "hybrid"})})
    r = simulate(s, lib)
    surplus = r.site["pv_kw"] - r.site["load_kw"]
    soc_start = np.concatenate([[BAT.soc_initial], r.site["soc"][:-1]])
    fits = (1 - soc_start) * BAT.capacity_kwh / np.sqrt(BAT.round_trip_efficiency)  # kW that fit in one hour
    sunny = surplus > 1e-6
    expected = np.minimum.reduce([surplus, np.full(T, BAT.power_kw), fits])
    assert np.all(r.site["battery_kw"][sunny] >= expected[sunny] - 1e-6)
    assert balance_ok(r)
