"""Residential features on synthetic data: heat pump with a tank, §14a dimming, time-variable network
fees, and bidirectional (V2H) charging."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from emsbench.sim.engine import simulate
from emsbench.sim.model import (
    DIM_GZF,
    DIM_MIN_KW,
    Building,
    ControllerSpec,
    EVCharger,
    GridConnection,
    HeatPump,
    Site,
    Tariff,
)
from emsbench.sim.profiles import EVSession, EVSessionSet, Profile, ProfileLibrary

START = dt.datetime(2024, 1, 1)
T = 48
HEAT_KW = 2.0  # constant heat demand in the synthetic profile
COP = 2.0


def library(*sets: tuple[str, tuple[EVSession, ...]], price: np.ndarray | None = None) -> ProfileLibrary:
    hour = np.tile(np.arange(24), T // 24)
    if price is None:
        price = np.where((hour >= 16) & (hour <= 20), 0.5, 0.2)
    lib = ProfileLibrary()
    for p in (
        Profile("load", "load", "flat 1 kW", "test", np.full(T, 1.0), START, 3600),
        Profile("price", "price", "tou", "test", price.astype(float), START, 3600),
        # 1/8760 kW per kWh/yr: a house needing HEAT_KW x 8760 kWh a year needs HEAT_KW every hour.
        Profile("heat", "heat", "flat", "test", np.full(T, 1 / 8760), START, 3600),
        Profile("cop", "cop", "flat", "test", np.full(T, COP), START, 3600),
        Profile("fee", "netfee", "flat fee", "test", np.full(T, 0.1), START, 3600),
    ):
        lib.add(p)
    lib.ev_sets = {sid: EVSessionSet(sid, sid, "test", ss, START, START + dt.timedelta(hours=T)) for sid, ss in sets}
    return lib


def car(arrive: int, leave: int, kwh: float) -> EVSession:
    return EVSession(START + dt.timedelta(hours=arrive), START + dt.timedelta(hours=leave), kwh, "car")


def site(*assets: object, **kw: object) -> Site:
    kw.setdefault("tariff", Tariff(price_profile="price"))
    return Site(start=START.date(), days=2, step_minutes=60, assets=list(assets), **kw)  # type: ignore[arg-type]


HOME = Building(id="home", load_profile="load")


def heat_pump(**kw: object) -> HeatPump:
    defaults: dict[str, object] = {"id": "hp", "heat_profile": "heat", "cop_profile": "cop",
                                   "annual_heat_kwh": HEAT_KW * 8760, "buffer_kwh": 0.0}
    return HeatPump(**{**defaults, **kw})  # type: ignore[arg-type]


def balanced(r) -> bool:  # type: ignore[no-untyped-def]
    s = r.site
    return bool(np.allclose(s["grid_kw"], s["load_kw"] + s["hp_kw"] - s["pv_kw"] + s["battery_kw"] + s["ev_kw"]))


# ---------- heat pump ----------

def test_heat_pump_on_demand_draws_heat_over_cop() -> None:
    r = simulate(site(HOME, heat_pump()), library())
    assert np.allclose(r.assets["hp"]["power_kw"], HEAT_KW / COP)
    assert r.kpis["hp_scop"] == pytest.approx(COP)
    assert r.kpis["hp_unmet_heat_kwh"] == pytest.approx(0.0)
    assert r.kpis["hp_heat_kwh"] == pytest.approx(HEAT_KW * T)
    assert balanced(r)


def test_undersized_heat_pump_records_unmet_heat() -> None:
    r = simulate(site(HOME, heat_pump(max_power_kw=0.5)), library())
    # 0.5 kW electric x COP 2 = 1 kW heat against 2 kW demand: 1 kWh short every hour.
    assert r.kpis["hp_unmet_heat_kwh"] == pytest.approx((HEAT_KW - 0.5 * COP) * T)
    assert any("unmet" in w for w in r.warnings)


def test_cheap_hours_preheats_into_the_tank_and_saves_money() -> None:
    spec = {"max_power_kw": 3.0, "buffer_kwh": 10.0, "buffer_initial": 0.0}
    lib = library()
    on_demand = simulate(site(HOME, heat_pump(**spec)), lib)
    cheap = simulate(site(HOME, heat_pump(**spec), controller=ControllerSpec(heat_pump="cheap_hours")), lib)
    hour = np.tile(np.arange(24), T // 24)
    dear = (hour >= 16) & (hour <= 20)
    assert cheap.assets["hp"]["power_kw"][dear].sum() < on_demand.assets["hp"]["power_kw"][dear].sum()
    assert cheap.kpis["energy_cost"] < on_demand.kpis["energy_cost"]
    assert cheap.kpis["hp_unmet_heat_kwh"] == pytest.approx(0.0)
    assert balanced(cheap)


# ---------- time-variable network fee ----------

def test_network_fee_is_added_to_every_imported_kwh() -> None:
    lib = library()
    plain = simulate(site(HOME), lib)
    with_fee = simulate(site(HOME, tariff=Tariff(price_profile="price", network_fee_profile="fee")), lib)
    extra = with_fee.kpis["energy_cost"] - plain.kpis["energy_cost"]
    assert extra == pytest.approx(0.1 * plain.kpis["grid_import_kwh"])


# ---------- §14a dimming ----------

def test_direct_dimming_limits_each_charger_to_the_minimum_power() -> None:
    lib = library(("ev", (car(17, 30, 30.0),)))
    charger = EVCharger(id="c", max_power_kw=11.0, efficiency=1.0, sessions="ev")
    grid = GridConnection(dimming="direct", dimming_start_hour=17, dimming_hours=2)
    r = simulate(site(HOME, charger, grid=grid), lib)
    ev = r.assets["c"]["power_kw"]
    assert ev[17] == pytest.approx(DIM_MIN_KW) and ev[18] == pytest.approx(DIM_MIN_KW)
    assert ev[19] == pytest.approx(11.0)  # window over: full power again
    assert r.kpis["dimmed_kwh"] == pytest.approx(2 * (11.0 - DIM_MIN_KW))


def test_direct_dimming_keeps_40_percent_for_a_large_heat_pump() -> None:
    grid = GridConnection(dimming="direct", dimming_start_hour=0, dimming_hours=24)
    hp = heat_pump(annual_heat_kwh=10 * 8760, max_power_kw=12.0)  # needs 5 kW electric, rated 12 kW
    r = simulate(site(HOME, hp, grid=grid), library())
    assert r.assets["hp"]["power_kw"].max() == pytest.approx(0.4 * 12.0)  # 4.8 kW, above the 4.2 kW floor


def test_ems_dimming_shares_one_limit_with_the_simultaneity_factor() -> None:
    lib = library(("a", (car(17, 30, 30.0),)), ("b", (car(17, 30, 30.0),)))
    chargers = [EVCharger(id=x, max_power_kw=11.0, efficiency=1.0, sessions=x) for x in ("a", "b")]
    grid = GridConnection(dimming="ems", dimming_start_hour=17, dimming_hours=1)
    r = simulate(site(HOME, *chargers, grid=grid), lib)
    total = r.assets["a"]["power_kw"][17] + r.assets["b"]["power_kw"][17]
    assert total == pytest.approx(DIM_MIN_KW + (2 - 1) * DIM_GZF[2] * DIM_MIN_KW)  # 4.2 + 0.8 x 4.2


def test_devices_up_to_4_2_kw_are_not_dimmed() -> None:
    lib = library(("ev", (car(17, 30, 30.0),)))
    charger = EVCharger(id="c", max_power_kw=3.7, efficiency=1.0, sessions="ev")
    grid = GridConnection(dimming="direct", dimming_start_hour=17, dimming_hours=2)
    r = simulate(site(HOME, charger, grid=grid), lib)
    assert r.assets["c"]["power_kw"][17] == pytest.approx(3.7)
    assert r.kpis["dimmed_kwh"] == pytest.approx(0.0)


# ---------- bidirectional charging (V2H) ----------

def v2h_price() -> np.ndarray:
    hour = np.tile(np.arange(24), T // 24)
    return np.where((hour >= 18) & (hour <= 20), 0.6, np.where(hour < 6, 0.1, 0.3)).astype(float)


def test_bidirectional_car_covers_dear_hours_and_still_leaves_charged() -> None:
    lib = library(("ev", (car(17, 32, 5.0),)), price=v2h_price())  # parked overnight, needs 5 kWh
    charger = EVCharger(id="c", max_power_kw=7.0, efficiency=0.95, sessions="ev", bidirectional=True)
    ctrl = ControllerSpec(ev="cheapest_hours", ev_discharge="high_prices")
    r = simulate(site(HOME, charger, controller=ctrl), lib)
    ev = r.assets["c"]["power_kw"]
    assert ev[18:21].min() < 0  # gives energy back at the 0.6 price
    assert r.kpis["ev_discharged_kwh"] > 0
    assert r.kpis["ev_discharged_kwh"] <= charger.v2g_max_kwh_per_visit + 1e-9
    assert r.kpis["ev_unmet_kwh"] == pytest.approx(0.0)  # still reaches its target by departure
    assert balanced(r)
    one_way = simulate(site(HOME, charger.model_copy(update={"bidirectional": False}), controller=ctrl), lib)
    assert r.kpis["energy_cost"] < one_way.kpis["energy_cost"]  # lending at 0.6, recharging at 0.1 pays


def test_no_discharge_when_disabled_or_not_profitable() -> None:
    lib = library(("ev", (car(17, 32, 5.0),)), price=v2h_price())
    charger = EVCharger(id="c", max_power_kw=7.0, efficiency=0.95, sessions="ev", bidirectional=True)
    off = simulate(site(HOME, charger, controller=ControllerSpec(ev_discharge="never")), lib)
    assert off.kpis["ev_discharged_kwh"] == 0.0
    flat = simulate(site(HOME, charger), library(("ev", (car(17, 32, 5.0),)), price=np.full(T, 0.3)))
    assert flat.kpis["ev_discharged_kwh"] == 0.0  # flat price: losses make lending a loss


def test_mpc_runs_with_a_heat_pump_on_demand() -> None:
    r = simulate(site(HOME, heat_pump(), controller=ControllerSpec(battery="mpc")), library())
    assert np.allclose(r.assets["hp"]["power_kw"], HEAT_KW / COP)
    assert balanced(r)


# ---------- data helpers (no download) ----------

def test_duesseldorf_modul3_schedule_matches_the_price_sheet() -> None:
    from emsbench.data.netfees import DUESSELDORF, schedule

    winter = schedule(DUESSELDORF, dt.datetime(2026, 1, 5), dt.datetime(2026, 1, 6))  # Monday, CET = local
    q = {h: winter[int(h * 4)] for h in (3.0, 4.5, 4.75, 5.0, 17.75, 18.0, 19.75, 20.0)}
    assert q[3.0] == 0.0791 and q[4.5] == 0.0316 and q[4.75] == 0.0316 and q[5.0] == 0.0791
    assert q[17.75] == 0.0791 and q[18.0] == 0.0819 and q[19.75] == 0.0819 and q[20.0] == 0.0791
    summer = schedule(DUESSELDORF, dt.datetime(2026, 7, 6), dt.datetime(2026, 7, 7))  # Q3: standard only
    assert set(np.unique(summer)) == {0.0791}


def test_when2heat_mix_and_effective_cop() -> None:
    from emsbench.data.when2heat import effective_cop, heat_shape

    hours = 8760
    space = np.full(hours, 1e6 / hours)  # MW/TWh: one year's normalized profile
    water = np.full(hours, 1e6 / hours)
    shape = heat_shape(space, water, space_total=3.0, water_total=1.0, hours_per_year=hours)
    assert shape.sum() == pytest.approx(1.0)  # kW per kWh/yr integrates to one year's demand
    # 3 kWh space at COP 3 and 1 kWh water at COP 2: 4 kWh heat for 1.5 kWh electricity -> COP 2.67
    cop = effective_cop(np.array([3.0]), np.array([1.0]), np.array([3.0]), np.array([2.0]))
    assert cop[0] == pytest.approx(4.0 / 1.5)
