"""Realistic forecasts: only information a real controller has, and no leaks from the future."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from emsbench.sim.engine import simulate
from emsbench.sim.forecasts import RealisticForecast, persistence
from emsbench.sim.model import Battery, Building, ControllerSpec, EVCharger, Site, SolarPV, Tariff
from emsbench.sim.profiles import EVSession, EVSessionSet, Profile, ProfileLibrary

START = dt.datetime(2024, 1, 2)  # data starts a day earlier, so "the day before" exists
D = 24


def test_persistence_repeats_the_most_recent_observed_day() -> None:
    history = np.arange(0, D, dtype=float)  # the day before
    actual = np.arange(100, 100 + 3 * D, dtype=float)
    fc = persistence(history, actual, t=0, steps=2 * D, period=D)
    assert np.array_equal(fc[:D], history) and np.array_equal(fc[D:], history)  # nothing of the run seen yet
    fc = persistence(history, actual, t=30, steps=D, period=D)
    assert np.array_equal(fc, actual[6:30])  # step 30 + k <- step 6 + k, the latest already observed


def test_persistence_never_uses_the_current_or_a_future_step() -> None:
    history = np.zeros(D)
    actual = np.arange(1, 1 + 4 * D, dtype=float)
    for t in range(0, 3 * D):
        fc = persistence(history, actual, t, 2 * D, D)
        assert np.all(fc < actual[t])  # strictly increasing series: any value from t on would be >= actual[t]


def _fc(first_step_of_day: int, published: int | None) -> RealisticForecast:
    price = np.arange(4 * D, dtype=float)  # each step's price is its index: easy to see what is known
    z = np.zeros(4 * D)
    return RealisticForecast({"load": z, "pv": z, "price": price, "demand_rate": z}, np.zeros(D), np.zeros(D),
                             None, D, first_step_of_day, published)


def test_day_ahead_prices_are_known_only_once_published() -> None:
    fc = _fc(first_step_of_day=0, published=13)
    assert fc.known_until(12) == D  # 12:00: today only
    assert fc.known_until(13) == 2 * D  # 13:00: tomorrow published
    w = fc.window("price", 12, D)
    assert np.array_equal(w[:12], np.arange(12, 24))  # rest of today: true prices
    assert np.array_equal(w[12:], np.arange(0, 12))  # tomorrow 00-11 h: today's 00-11 h repeated
    assert np.all(w < D)  # nothing from tomorrow leaks in before 13:00


def test_fixed_tariffs_are_known_in_advance() -> None:
    fc = _fc(first_step_of_day=0, published=None)
    assert np.array_equal(fc.window("price", 5, 2 * D), np.arange(5, 5 + 2 * D))


def _library() -> ProfileLibrary:
    days = 4
    hour = np.tile(np.arange(24), days)
    lib = ProfileLibrary()
    start = START - dt.timedelta(days=1)
    lib.add(Profile("flat", "load", "flat", "test", np.full(days * 24, 2.0), start, 3600))
    lib.add(Profile("pv", "pv", "box", "test", np.where((hour >= 8) & (hour <= 16), 1.0, 0.0), start, 3600))
    lib.add(Profile("tou", "price", "tou", "test", np.where((hour >= 17) & (hour <= 20), 0.5, 0.2), start, 3600))
    return lib


def _site(*assets: object, forecast: str, battery: str = "mpc") -> Site:
    ctrl = ControllerSpec(battery=battery, ev="cheapest_hours", forecast=forecast,  # type: ignore[arg-type]
                          mpc_replan_minutes=60)
    return Site(start=START.date(), days=2, step_minutes=60, controller=ctrl, assets=list(assets),  # type: ignore[arg-type]
                tariff=Tariff(price_profile="tou"))


HOME = Building(id="home", load_profile="flat")
BAT = Battery(id="bat", capacity_kwh=10.0, power_kw=3.0)


def test_realistic_equals_perfect_when_the_future_repeats() -> None:
    # Flat load, the same sunny day every day, a fixed tariff and no cars: yesterday is a perfect forecast.
    pv = SolarPV(id="pv", capacity_kwp=4.0, profile="pv")
    for battery in ("mpc", "price_arbitrage"):
        perfect = simulate(_site(HOME, pv, BAT, forecast="perfect", battery=battery), _library())
        real = simulate(_site(HOME, pv, BAT, forecast="realistic", battery=battery), _library())
        assert real.kpis["total_cost"] == pytest.approx(perfect.kpis["total_cost"], abs=1e-6), battery


def test_realistic_mpc_does_not_know_cars_before_they_plug_in() -> None:
    lib = _library()
    sess = EVSession(START + dt.timedelta(hours=18), START + dt.timedelta(hours=30), 9.0, "car")
    lib.ev_sets = {"ev": EVSessionSet("ev", "ev", "test", (sess,), START, START + dt.timedelta(days=2))}
    charger = EVCharger(id="c", sessions="ev", max_power_kw=11.0, efficiency=1.0)
    pv = SolarPV(id="pv", capacity_kwp=6.0, profile="pv")
    perfect = simulate(_site(HOME, pv, BAT, charger, forecast="perfect"), lib)
    real = simulate(_site(HOME, pv, BAT, charger, forecast="realistic"), lib)
    assert real.kpis["ev_unmet_kwh"] == pytest.approx(0.0, abs=1e-6)  # once plugged in, it still delivers
    assert real.kpis["total_cost"] >= perfect.kpis["total_cost"] - 1e-6  # knowing less cannot help


def test_profile_before_is_continuous_with_the_window() -> None:
    p = Profile("x", "load", "x", "test", np.arange(72, dtype=float), START - dt.timedelta(days=1), 3600)
    vals, info = p.window(START, 24, 3600)
    before = p.before(info.source_start, 24, 3600)
    assert before is not None and np.array_equal(before, vals - 24)
    assert p.before(START - dt.timedelta(days=1), 24, 3600) is None  # no data before the start
