"""Data center scenario: peak-window demand billing, tariff calendar, ESIF parsing, UPS reserve."""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
import pytest

from emsbench.data import esif, tariffs_us
from emsbench.sim.engine import simulate, tou_demand_cost
from emsbench.sim.model import Battery, Building, ControllerSpec, Site, Tariff
from emsbench.sim.profiles import Profile, ProfileLibrary

START = dt.datetime(2024, 6, 3)  # a Monday in June (summer rates)


def test_tou_demand_cost_bills_each_rate_on_its_own_peak() -> None:
    imp = np.array([5.0, 9.0, 7.0, 6.0, 8.0, 4.0])
    rate = np.array([0.0, 0.0, 10.0, 10.0, 20.0, 20.0])
    month = np.array([1, 1, 1, 1, 1, 1])
    # rate 10 on max(7, 6) = 7; rate 20 on max(8, 4) = 8; the 9 kW peak is outside both windows
    assert tou_demand_cost(imp, rate, month) == pytest.approx(10 * 7 + 20 * 8)


def test_tou_demand_cost_is_per_month() -> None:
    imp = np.array([5.0, 9.0, 3.0, 4.0])
    rate = np.full(4, 2.0)
    month = np.array([1, 1, 2, 2])
    assert tou_demand_cost(imp, rate, month) == pytest.approx(2 * 9 + 2 * 4)


def test_xcel_peak_window_follows_local_summer_time() -> None:
    # Fixed-MST clock. In July, Denver is on MDT (UTC-6), so 14:00-18:00 local is 13:00-17:00 MST.
    energy, demand = tariffs_us.xcel_pg(dt.datetime(2024, 7, 1), dt.datetime(2024, 7, 2))
    per_hour = demand.reshape(24, 4)[:, 0]
    assert per_hour[12] == 0 and per_hour[17] == 0
    assert np.all(per_hour[13:17] == pytest.approx(14.97 + 3.68))
    assert energy[0] == pytest.approx(0.00778 + 0.04113)
    # In January there is no summer time: the window is 14:00-18:00 on the MST clock, winter rate.
    energy, demand = tariffs_us.xcel_pg(dt.datetime(2024, 1, 15), dt.datetime(2024, 1, 16))
    per_hour = demand.reshape(24, 4)[:, 0]
    assert per_hour[13] == 0 and per_hour[18] == 0
    assert np.all(per_hour[14:18] == pytest.approx(10.03 + 3.68))
    assert energy[0] == pytest.approx(0.00778 + 0.02539)


def test_esif_timestamps_become_fixed_mst() -> None:
    ts = pd.Series(["Mon Nov 09 2015 20:00:01 GMT-0700 (Mountain Standard Time)",
                    "Mon Jul 01 2024 14:30:00 GMT-0600 (Mountain Daylight Time)"])
    idx = esif.parse_timestamps(ts)
    assert idx[0] == pd.Timestamp("2015-11-09 20:00:01")
    assert idx[1] == pd.Timestamp("2024-07-01 13:30:00")  # 14:30 MDT = 13:30 MST


def test_esif_runs() -> None:
    assert esif.runs(np.array([True, True, False, True, False, False, True])) == [(0, 2), (3, 4), (6, 7)]


def _library(load: np.ndarray) -> ProfileLibrary:
    n = load.size
    lib = ProfileLibrary()
    energy, demand = tariffs_us.xcel_pg(START, START + dt.timedelta(minutes=15 * n))
    lib.add(Profile("dc", "load", "dc", "test", load.astype(float), START, 900))
    lib.add(Profile("price", "price", "pg", "test", energy, START, 900, currency="USD"))
    lib.add(Profile("pgd", "demand", "pg demand", "test", demand, START, 900, currency="USD"))
    return lib


def _site(*assets: object, **kw: object) -> Site:
    tariff = Tariff(price_profile="price", demand_charge_per_kw_month=7.91, demand_charge_profile="pgd")
    return Site(start=START.date(), days=1, step_minutes=15, tariff=tariff, assets=list(assets),  # type: ignore[arg-type]
                **kw)  # type: ignore[arg-type]


def test_engine_bills_flat_and_peak_window_demand() -> None:
    load = np.full(96, 1000.0)
    load[40] = 1500.0  # 10:00 MST, outside the summer window (13-17 MST)
    load[60] = 1200.0  # 15:00 MST, inside the window
    r = simulate(_site(Building(id="dc", load_profile="dc")), _library(load))
    k = r.kpis
    assert k["demand_charge_peak_window_cost"] == pytest.approx((14.97 + 3.68) * 1200)
    assert k["demand_charge_cost"] == pytest.approx(7.91 * 1500 + (14.97 + 3.68) * 1200)
    assert k["total_cost"] == pytest.approx(k["energy_cost"] + k["demand_charge_cost"])
    assert k["peak_import_kw"] == pytest.approx(1500)


def test_ups_reserve_is_never_used_for_peak_shaving() -> None:
    load = np.full(96, 1000.0)
    load[30:70] = 1800.0  # a 10-hour high stretch, more than the usable energy can cover
    ups = Battery(id="ups", capacity_kwh=1000, power_kw=500, soc_min=0.25, soc_initial=1.0)
    s = _site(Building(id="dc", load_profile="dc"), ups,
              controller=ControllerSpec(battery="peak_shaving", peak_threshold_kw=1200))
    r = simulate(s, _library(load))
    assert r.site["soc"].min() >= 0.25 - 1e-9
    assert r.kpis["peak_import_kw"] > 1200  # the reserve is kept even though the peak is not fully shaved


def test_data_center_asset_is_it_load_times_pue() -> None:
    from emsbench.sim.model import DataCenter

    it = np.full(96, 2000.0)
    it[10] = 3000.0
    dc = DataCenter(id="dc", it_load_profile="dc", it_scale=0.5, pue=1.5)
    r = simulate(_site(dc), _library(it))
    a = r.assets["dc"]
    assert np.allclose(a["it_kw"], it * 0.5)
    assert np.allclose(a["power_kw"], it * 0.5 * 1.5)
    assert np.allclose(a["cooling_kw"], it * 0.5 * 0.5)
    assert np.allclose(r.site["load_kw"], a["power_kw"])
    assert r.kpis["peak_import_kw"] == pytest.approx(3000 * 0.5 * 1.5)
