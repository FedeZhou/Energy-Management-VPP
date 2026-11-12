"""The cautious MPC: four habits of a planner that does not trust its forecast (see sim/mpc.py)."""

from __future__ import annotations

import numpy as np
import pytest

from emsbench.sim.controllers import Observation
from emsbench.sim.forecasts import PerfectForecast
from emsbench.sim.model import ControllerSpec
from emsbench.sim.mpc import MPCController, SiteLimits

D = 96  # 15-minute steps per day


def _controller(mode: str, forecast_load: float, forecast_pv: float) -> MPCController:
    z = np.zeros(2 * D)
    fc = PerfectForecast({"load": z + forecast_load, "pv": z + forecast_pv, "price": z + 0.3, "demand_rate": z}, [], D)
    lim = SiteLimits(step_hours=0.25, battery_capacity_kwh=10, battery_min_kwh=0, battery_max_kwh=10,
                     battery_power_kw=5, battery_eta=0.95, import_limit_kw=None, export_limit_kw=None, fuse_kw=None,
                     export_price=0.08, demand_rate_flat=0.0, charger_efficiency=())
    return MPCController(ControllerSpec(battery="mpc", mpc_execution=mode), lim, fc)  # type: ignore[arg-type]


def _obs(t: int, load: float, pv: float, energy: float) -> Observation:
    return Observation(t=t, step_hours=0.25, load_kw=load, pv_kw=pv, price=0.3, price_ahead=np.full(D, 0.3),
                       battery_energy_kwh=energy, battery_capacity_kwh=10.0, battery_max_charge_kw=5.0,
                       battery_max_discharge_kw=5.0, evs=())


def test_cautious_does_not_discharge_into_the_grid_when_solar_falls_short() -> None:
    # The forecast says 8 kW of solar all day: the battery (already full) is planned idle and 7 kW is exported.
    # One step into the plan a cloud passes and solar is 2 kW. Keeping the export "as planned" would empty the
    # battery into the grid at the feed-in price; the cautious controller exports the 1 kW that is really spare.
    for mode, expected in (("plan", -5.0 - 1.0), ("cautious", 0.0)):
        c = _controller(mode, forecast_load=1.0, forecast_pv=8.0)
        c.act(_obs(0, 1.0, 8.0, 10.0))
        a = c.act(_obs(1, 1.0, 2.0, 10.0))  # between two re-plans (hourly re-plan, 15-minute steps)
        assert a.battery_kw == pytest.approx(expected, abs=1e-6), mode


def test_cautious_does_not_charge_from_the_grid_when_demand_falls_short() -> None:
    # No solar, an empty battery, 1 kW of forecast load imported. The load turns out to be 0.2 kW: import 0.2 kW,
    # do not import the planned 1 kW and put the rest into the battery.
    for mode, expected in (("plan", 0.8), ("cautious", 0.0)):
        c = _controller(mode, forecast_load=1.0, forecast_pv=0.0)
        c.act(_obs(0, 1.0, 0.0, 0.0))
        a = c.act(_obs(1, 0.2, 0.0, 0.0))
        assert a.battery_kw == pytest.approx(expected, abs=1e-6), mode


def test_cautious_plans_with_the_metered_step() -> None:
    # The forecast says no solar; the meter says 3 kW of solar against 1 kW of load right now. The cautious plan
    # stores the 2 kW that is really spare in this step; the plain plan, believing the forecast, plans nothing.
    plain = _controller("plan", forecast_load=1.0, forecast_pv=0.0).solve(_obs(0, 1.0, 3.0, 0.0))
    cautious = _controller("cautious", forecast_load=1.0, forecast_pv=0.0).solve(_obs(0, 1.0, 3.0, 0.0))
    assert plain.battery_kw[0] == pytest.approx(0.0, abs=1e-6)
    assert cautious.battery_kw[0] == pytest.approx(2.0, abs=1e-6)


def test_cautious_stores_spare_solar_at_the_first_chance() -> None:
    # 2 kW of spare solar all day and an empty 10 kWh battery: filling it now or this afternoon costs the same, so a
    # plain plan may leave it for later. The cautious plan stores from the first step (later is only a forecast).
    plan = _controller("cautious", forecast_load=1.0, forecast_pv=3.0).solve(_obs(0, 1.0, 3.0, 0.0))
    assert plan.battery_kw[0] == pytest.approx(2.0, abs=1e-6)
    steps_to_full = int(np.ceil(10.0 / (2.0 * 0.95 * 0.25)))
    assert np.all(plan.battery_kw[: steps_to_full - 1] > 2.0 - 1e-6)
