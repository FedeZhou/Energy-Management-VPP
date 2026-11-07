"""Cross-check: our engine reproduces CityLearn on the same home without a battery.

Battery physics are deliberately simpler than CityLearn's (constant efficiency
instead of power-dependent curves), so only the no-battery case must match
exactly. Runs a real CityLearn episode; skip offline with -m "not integration".
"""

import datetime as dt

import numpy as np
import pytest

pytestmark = pytest.mark.integration
STEPS = 48


def test_load_pv_and_cost_match_citylearn_building_1() -> None:
    from emsbench.adapters.citylearn import IdleController, make_env, run_episode
    from emsbench.sim.engine import simulate
    from emsbench.sim.model import Building, ControllerSpec, Site, SolarPV
    from emsbench.sim.profiles import default_library

    env = make_env("citylearn_challenge_2022_phase_1", simulation_end_time_step=STEPS)
    run_episode(env, IdleController(env))
    b1 = env.buildings[0]
    n = len(env.net_electricity_consumption)
    cl_net = np.asarray(b1.net_electricity_consumption_without_storage[:n])
    cl_cost = float(np.clip(np.asarray(b1.net_electricity_consumption_cost_without_storage[:n]),
                            0, None).sum())

    # CityLearn step 0 covers 23:00-24:00 on 31 Jul; our site starts 1 Aug 00:00 = CityLearn step 1.
    site = Site(
        start=dt.date(2024, 8, 1),
        days=2,
        controller=ControllerSpec(battery="idle"),
        assets=[Building(id="b1", load_profile="cl2022/home_1"),
                SolarPV(id="pv", capacity_kwp=4.0, profile="cl2022/pv_1")],
    )
    ours = simulate(site, default_library())
    m = n - 1
    assert np.allclose(ours.site["grid_kw"][:m], cl_net[1:n], atol=1e-4)
    cl_cost_aligned = float(np.clip(np.asarray(b1.net_electricity_consumption_cost_without_storage[1:n]),
                                    0, None).sum())
    our_cost = float((np.clip(ours.site["grid_kw"][:m], 0, None) * ours.site["price"][:m]).sum())
    assert our_cost == pytest.approx(cl_cost_aligned, rel=1e-5)
    assert cl_cost > 0
