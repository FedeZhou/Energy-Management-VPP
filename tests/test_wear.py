"""Battery wear: NREL BLAST-Lite life estimates turned into money, and the MPC's wear price."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest

from emsbench.sim import wear
from emsbench.sim.engine import simulate
from emsbench.sim.model import Battery, Building, ControllerSpec, Site, Tariff
from emsbench.sim.profiles import Profile, ProfileLibrary

START = dt.datetime(2024, 1, 1)


def daily_cycles(days: int, depth: float, step_h: float = 1.0) -> np.ndarray:
    h = np.arange(0, days * 24 + step_h, step_h) % 24
    return depth * np.where(h < 12, h / 12, (24 - h) / 12)


def test_more_and_deeper_cycling_shortens_life() -> None:
    full = wear.expected_life(daily_cycles(7, 1.0), 3600, "lfp", 25.0, 0.8)
    half = wear.expected_life(daily_cycles(7, 0.5), 3600, "lfp", 25.0, 0.8)
    assert half.years > full.years
    assert 0 < full.cycle_share <= 1


def test_nmc_ages_faster_than_lfp_and_heat_ages_both() -> None:
    soc = daily_cycles(7, 1.0)
    lfp = wear.expected_life(soc, 3600, "lfp", 25.0, 0.8).years
    assert wear.expected_life(soc, 3600, "nmc", 25.0, 0.8).years < lfp
    assert wear.expected_life(soc, 3600, "lfp", 40.0, 0.8).years < lfp


def test_idle_battery_at_low_charge_is_capped_and_priced_by_the_capacity_it_lost() -> None:
    life = wear.expected_life(np.zeros(25), 3600, "lfp", 25.0, 0.8)
    assert life.capped and life.years == wear.MAX_YEARS
    assert life.wear_cost(1000.0, 1.0) < 1000.0 / wear.MAX_YEARS  # cheaper than "a whole battery per 40 years"


def test_wear_cost_scales_with_run_length() -> None:
    life = wear.expected_life(daily_cycles(7, 1.0), 3600, "lfp", 25.0, 0.8)
    assert life.wear_cost(1000.0, 2.0) == pytest.approx(2 * life.wear_cost(1000.0, 1.0))
    assert life.wear_cost(1000.0, life.years) == pytest.approx(1000.0)  # a whole life uses the whole battery


def test_default_replacement_cost_follows_the_size_classes() -> None:
    assert wear.default_replacement_cost(10, "EUR") == 1200.0  # home
    assert wear.default_replacement_cost(200, "EUR") == 580.0  # commercial 100-500 kWh
    assert wear.default_replacement_cost(5000, "EUR") == 464.0  # large-scale 1-10 MWh
    assert wear.default_replacement_cost(10, "USD") is None  # no sourced default outside EUR


def test_wear_price_is_positive_and_proportional_to_cost() -> None:
    p = wear.wear_price_per_kwh(1000.0, "lfp", 25.0, 0.8)
    assert p > 0
    assert wear.wear_price_per_kwh(2000.0, "lfp", 25.0, 0.8) == pytest.approx(2 * p)


def _library(spread: float) -> ProfileLibrary:
    hour = np.tile(np.arange(24), 2)
    lib = ProfileLibrary()
    lib.add(Profile("load", "load", "flat", "test", np.full(48, 2.0), START, 3600))
    price = np.where((hour >= 17) & (hour <= 20), 0.2 + spread, 0.2)
    lib.add(Profile("price", "price", "tou", "test", price.astype(float), START, 3600, currency="EUR"))
    return lib


def _site(battery: str, wear_cost: bool = True) -> Site:
    ctrl = ControllerSpec(battery=battery, mpc_wear_cost=wear_cost, mpc_replan_minutes=60)  # type: ignore[arg-type]
    bat = Battery(id="bat", capacity_kwh=10.0, power_kw=3.0, round_trip_efficiency=0.9)
    return Site(start=START.date(), days=2, step_minutes=60, controller=ctrl, tariff=Tariff(price_profile="price"),
                assets=[Building(id="home", load_profile="load"), bat])


def test_kpis_include_wear_and_total_with_wear() -> None:
    k = simulate(_site("self_consumption"), _library(0.3)).kpis
    assert k["battery_wear_priced"] == 1.0
    assert k["total_cost_with_wear"] == pytest.approx(k["total_cost"] + k["battery_wear_cost"])
    assert k["battery_life_years"] > 0


def test_mpc_does_not_cycle_when_the_spread_is_below_the_wear_price() -> None:
    # Home LFP at 1,200 EUR/kWh: about 0.15 EUR per kWh cycled, plus 10% losses. A 0.05 EUR spread does not pay.
    lib = _library(0.05)
    blind = simulate(_site("mpc", wear_cost=False), lib).kpis
    aware = simulate(_site("mpc"), lib).kpis
    assert blind["battery_equivalent_full_cycles"] > 0.1
    assert aware["battery_equivalent_full_cycles"] < 1e-3
    assert aware["total_cost_with_wear"] <= blind["total_cost_with_wear"] + 1e-6


def test_mpc_still_cycles_when_the_spread_pays_for_wear() -> None:
    aware = simulate(_site("mpc"), _library(0.6)).kpis
    assert aware["battery_equivalent_full_cycles"] > 0.1
