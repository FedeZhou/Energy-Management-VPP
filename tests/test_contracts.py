"""Flexible grid contracts: window compilation, reliability KPIs, and controllers that respect limit[t]."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from emsbench.benchmark.reliability import limit_reliability
from emsbench.sim.contracts import compile_import_limit
from emsbench.sim.engine import simulate
from emsbench.sim.model import (
    Battery,
    Building,
    ContractWindow,
    ControllerSpec,
    EVCharger,
    GridConnection,
    Site,
    Tariff,
)
from emsbench.sim.profiles import EVSession, EVSessionSet, Profile, ProfileLibrary

MONDAY = dt.datetime(2024, 1, 1)  # a Monday
H = 3600
INF = np.inf


def win(start: str, end: str, kw: float, days: list[str] | None = None) -> ContractWindow:
    args: dict[str, object] = {"start": start, "end": end, "import_limit_kw": kw}
    if days is not None:
        args["days"] = days
    return ContractWindow(**args)  # type: ignore[arg-type]


# --- compilation --------------------------------------------------------------------------------------------


def test_no_windows_is_the_firm_limit_or_unlimited() -> None:
    assert np.all(compile_import_limit(GridConnection(import_limit_kw=50), MONDAY, 48, H) == 50)
    assert np.all(np.isinf(compile_import_limit(GridConnection(), MONDAY, 48, H)))


def test_window_applies_inside_and_firm_limit_outside() -> None:
    lim = compile_import_limit(GridConnection(import_limit_kw=100, contract_windows=[win("16:00", "20:00", 60)]),
                               MONDAY, 48, H)
    assert lim[15] == 100 and lim[16] == 60 and lim[19] == 60 and lim[20] == 100
    assert lim[24 + 16] == 60  # every day by default


def test_window_wraps_past_midnight_and_counts_from_its_start_day() -> None:
    # Sunday night 22:00 -> Monday 06:00: the run starts on Monday, so the first 6 hours are inside it.
    grid = GridConnection(contract_windows=[win("22:00", "06:00", 5, days=["sun"])])
    lim = compile_import_limit(grid, MONDAY, 48, H)
    assert np.all(lim[:6] == 5) and np.isinf(lim[6])
    assert np.all(np.isinf(lim[22:48]))  # Monday 22:00 is not a Sunday window
    grid_all = GridConnection(contract_windows=[win("22:00", "06:00", 5)])
    lim_all = compile_import_limit(grid_all, MONDAY, 48, H)
    assert np.all(lim_all[22:30] == 5) and np.isinf(lim_all[30])


def test_weekdays_only() -> None:
    weekdays = ["mon", "tue", "wed", "thu", "fri"]
    grid = GridConnection(import_limit_kw=80, contract_windows=[win("08:00", "12:00", 40, days=weekdays)])
    lim = compile_import_limit(grid, MONDAY, 7 * 24, H)
    for day in range(7):
        assert lim[day * 24 + 9] == (40 if day < 5 else 80)


def test_overlapping_windows_take_the_lower_limit_and_firm_caps_windows() -> None:
    grid = GridConnection(import_limit_kw=30, contract_windows=[win("10:00", "14:00", 50), win("12:00", "16:00", 20)])
    lim = compile_import_limit(grid, MONDAY, 24, H)
    assert lim[10] == 30  # the firm limit is lower than the window's
    assert lim[12] == 20 and lim[13] == 20 and lim[15] == 20 and lim[16] == 30


def test_a_step_partly_inside_a_window_gets_its_limit_and_start_equal_end_is_all_day() -> None:
    lim = compile_import_limit(GridConnection(contract_windows=[win("16:30", "17:00", 7)]), MONDAY, 24, H)
    assert lim[16] == 7 and np.isinf(lim[15]) and np.isinf(lim[17])
    q = compile_import_limit(GridConnection(contract_windows=[win("16:30", "17:00", 7)]), MONDAY, 96, 900)
    assert q[66] == 7 and np.isinf(q[65]) and np.isinf(q[68])
    all_day = compile_import_limit(GridConnection(contract_windows=[win("00:00", "00:00", 9)]), MONDAY, 48, H)
    assert np.all(all_day == 9)
    assert np.all(compile_import_limit(GridConnection(contract_windows=[win("00:00", "24:00", 9)]),
                                       MONDAY, 48, H) == 9)


def test_bad_times_are_rejected() -> None:
    with pytest.raises(ValueError):
        win("25:00", "06:00", 5)
    with pytest.raises(ValueError):
        win("08:00", "8:30", 5)


# --- reliability KPIs ---------------------------------------------------------------------------------------


def test_reliability_kpis_on_a_hand_made_trace() -> None:
    imp = np.full(72, 5.0)
    imp[10] = 8.0  # day 1: highest 8 of 10, kept
    imp[24 + 18] = 12.0  # day 2: 2 kW over for one hour
    imp[48 + 9], imp[48 + 18] = 11.0, 15.0  # day 3: 1 and 5 kW over
    imp[30] = -4.0  # an export never counts as over
    lim = np.full(72, 10.0)
    r = limit_reliability(imp, lim, MONDAY, 1.0, 0.9)
    assert r.limit_days_evaluated == 3 and r.limit_days_kept == 1
    assert r.limit_days_kept_share == pytest.approx(1 / 3)
    assert r.limit_target_met is False and r.limit_reliability_target == 0.9
    assert r.limit_excess_kwh == pytest.approx(2 + 1 + 5)
    assert r.limit_worst_excess_kw == pytest.approx(5.0)
    assert r.limit_worst_excess_date == "2024-01-03"
    assert r.limit_daily_peak_ratio_at_target == pytest.approx(1.5)  # daily ratios 0.8, 1.2, 1.5
    low = limit_reliability(imp, lim, MONDAY, 1.0, 0.3)
    assert low.limit_target_met is True and low.limit_daily_peak_ratio_at_target == pytest.approx(0.8)


def test_reliability_with_15_minute_steps_converts_energy() -> None:
    imp = np.full(96, 1.0)
    imp[40:44] = 3.0  # one hour 1 kW over
    r = limit_reliability(imp, np.full(96, 2.0), MONDAY, 0.25, 0.9)
    assert r.limit_excess_kwh == pytest.approx(1.0) and r.limit_days_kept == 0


def test_partial_days_and_unlimited_days_are_not_evaluated() -> None:
    start = MONDAY + dt.timedelta(hours=12)  # the first day is cut in half
    imp = np.full(36, 1.0)
    imp[2] = 9.0  # over on the partial day: counts as energy, not as a lost day
    r = limit_reliability(imp, np.full(36, 5.0), start, 1.0, 0.9)
    assert r.limit_days_evaluated == 1 and r.limit_days_kept == 1
    assert r.limit_excess_kwh == pytest.approx(4.0)
    # Weekday-only window, no firm limit: the weekend has no limit and is not counted as kept.
    grid = GridConnection(contract_windows=[win("08:00", "12:00", 2, days=["mon", "tue", "wed", "thu", "fri"])])
    lim = compile_import_limit(grid, MONDAY, 7 * 24, H)
    r2 = limit_reliability(np.ones(7 * 24), lim, MONDAY, 1.0, 0.9)
    assert r2.limit_days_evaluated == 5 and r2.limit_days_kept_share == 1.0


def test_no_limit_gives_nulls() -> None:
    r = limit_reliability(np.ones(48), np.full(48, INF), MONDAY, 1.0, 0.9)
    assert all(v is None for v in r.as_dict().values())


# --- engine and controllers -----------------------------------------------------------------------------------

T = 48


def library(load_kw: float = 5.0, sessions: tuple[EVSession, ...] = ()) -> ProfileLibrary:
    lib = ProfileLibrary()
    for p in (Profile("load", "load", "flat", "test", np.full(T, load_kw), MONDAY, H),
              Profile("pv", "pv", "none", "test", np.zeros(T), MONDAY, H),
              Profile("price", "price", "flat", "test", np.full(T, 0.2), MONDAY, H)):
        lib.add(p)
    lib.ev_sets = {"ev": EVSessionSet("ev", "ev", "test", sessions, MONDAY, MONDAY + dt.timedelta(hours=T))}
    return lib


HOME = Building(id="home", load_profile="load")
BAT = Battery(id="bat", capacity_kwh=12.0, power_kw=3.0, round_trip_efficiency=0.81)
EVENING = GridConnection(import_limit_kw=20, contract_windows=[win("17:00", "21:00", 3)])
WINDOW = np.zeros(T, dtype=bool)
WINDOW[17:21] = WINDOW[24 + 17: 24 + 21] = True


def site(*assets: object, grid: GridConnection = EVENING, **ctrl: object) -> Site:
    return Site(start=MONDAY.date(), days=2, step_minutes=60, assets=list(assets), grid=grid,
                tariff=Tariff(price_profile="price"), controller=ControllerSpec(**ctrl))  # type: ignore[arg-type]


def test_engine_reports_the_limit_series_and_kpis() -> None:
    r = simulate(site(HOME, battery="idle"), library())
    lim = r.site["import_limit_kw"]
    assert np.all(lim[WINDOW] == 3) and np.all(lim[~WINDOW] == 20)
    # 5 kW load, 3 kW allowed, no battery: 2 kW over for 4 hours on both days
    assert r.kpis["grid_overload_kwh"] == pytest.approx(2 * 4 * 2)
    assert r.reliability["limit_days_kept_share"] == 0.0 and r.reliability["limit_excess_kwh"] == pytest.approx(16)
    assert r.reliability["limit_target_met"] is False
    assert any("reliability target" in w for w in r.warnings)
    none = simulate(site(HOME, grid=GridConnection()), library())
    assert np.all(np.isinf(none.site["import_limit_kw"]))
    assert all(v is None for v in none.reliability.values())


def test_safety_layer_slows_ev_only_inside_the_window() -> None:
    car = EVSession(MONDAY + dt.timedelta(hours=15), MONDAY + dt.timedelta(hours=23), 30.0, "car")
    charger = EVCharger(id="c", max_power_kw=11.0, efficiency=1.0, sessions="ev")
    grid = GridConnection(import_limit_kw=20, contract_windows=[win("17:00", "21:00", 10)])
    r = simulate(site(HOME, charger, grid=grid, battery="idle"), library(sessions=(car,)))
    ev = r.assets["c"]["power_kw"]
    assert ev[15] == pytest.approx(11.0) and ev[16] == pytest.approx(11.0)  # outside: full power
    assert np.all(r.site["grid_kw"][17:21] <= 10 + 1e-9)  # inside: slowed to the window limit
    assert ev[17] == pytest.approx(5.0)
    assert r.reliability["limit_days_kept_share"] == 1.0


def test_peak_shaving_rule_charges_before_the_window_and_keeps_it() -> None:
    r = simulate(site(HOME, BAT, battery="peak_shaving", peak_threshold_kw=10), library())
    assert np.all(r.site["grid_kw"][WINDOW] <= 3 + 1e-6)
    assert r.reliability["limit_days_kept_share"] == 1.0 and r.reliability["limit_target_met"] is True
    idle = simulate(site(HOME, BAT, battery="self_consumption"), library())  # no solar: never charges
    assert idle.reliability["limit_days_kept_share"] == 0.0


@pytest.mark.parametrize("execution", ["plan", "hybrid", "cautious"])
def test_mpc_plans_for_the_window_limit(execution: str) -> None:
    r = simulate(site(HOME, BAT, battery="mpc", mpc_horizon_hours=24, mpc_execution=execution), library())
    assert np.all(r.site["grid_kw"][WINDOW] <= 3 + 1e-6), r.site["grid_kw"][WINDOW]
    assert r.reliability["limit_days_kept_share"] == 1.0
    assert r.kpis["grid_overload_kwh"] == pytest.approx(0.0, abs=1e-6)


def test_windows_above_the_firm_limit_change_nothing() -> None:
    car = EVSession(MONDAY + dt.timedelta(hours=15), MONDAY + dt.timedelta(hours=23), 30.0, "car")
    charger = EVCharger(id="c", max_power_kw=11.0, efficiency=1.0, sessions="ev")
    lib = library(sessions=(car,))
    for battery in ("peak_shaving", "mpc"):
        firm = simulate(site(HOME, BAT, charger, grid=GridConnection(import_limit_kw=9), battery=battery,
                             peak_threshold_kw=7), lib)
        loose = GridConnection(import_limit_kw=9, contract_windows=[win("17:00", "21:00", 50)])
        same = simulate(site(HOME, BAT, charger, grid=loose, battery=battery, peak_threshold_kw=7), lib)
        assert firm.kpis == same.kpis
        assert np.array_equal(firm.site["grid_kw"], same.site["grid_kw"])


@pytest.mark.integration
def test_existing_example_without_windows_is_unchanged() -> None:
    """Regression: KPIs of an existing example (import limit binding at 80 kW) recorded before contract windows
    existed (2026-11-21, 14-day run)."""
    from pathlib import Path

    import yaml

    from emsbench.sim.profiles import default_library

    path = Path(__file__).resolve().parents[1] / "configs" / "sites" / "plan_apartment_ev.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))["site"]
    data["days"] = 14
    r = simulate(Site.model_validate(data), default_library())
    assert r.kpis["total_cost"] == pytest.approx(708.6119141082333, rel=1e-9)
    assert r.kpis["grid_import_kwh"] == pytest.approx(4729.902795223437, rel=1e-9)
    assert r.kpis["peak_import_kw"] == pytest.approx(80.0)
    assert r.kpis["battery_discharge_kwh"] == pytest.approx(285.38481479458574, rel=1e-9)
    assert r.kpis["ev_delivered_kwh"] == pytest.approx(902.0, rel=1e-9)
    assert r.reliability["limit_days_evaluated"] == 14 and r.reliability["limit_days_kept_share"] == 1.0
