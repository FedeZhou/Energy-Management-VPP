"""Integration tests: our KPIs must agree with CityLearn where definitions overlap.

These run a short real CityLearn episode. The dataset is downloaded once and
cached; skip with `pytest -m "not integration"` when offline.
"""

import numpy as np
import pytest

pytestmark = pytest.mark.integration

DATASET = "citylearn_challenge_2022_phase_1"
END_STEP = 47  # two days


@pytest.fixture(scope="module")
def finished_env():  # type: ignore[no-untyped-def]
    from citylearn.agents.rbc import BasicBatteryRBC

    from emsbench.adapters.citylearn import make_env, run_episode
    from emsbench.net import use_system_certificates

    use_system_certificates()
    env = make_env(DATASET, simulation_end_time_step=END_STEP)
    run_episode(env, BasicBatteryRBC(env))
    return env


def test_per_building_cost_ratio_matches_citylearn(finished_env) -> None:  # type: ignore[no-untyped-def]
    from emsbench.adapters.citylearn import trace_from_env
    from emsbench.benchmark.kpis import compute_kpis

    env = finished_env
    control = trace_from_env(env)
    baseline = trace_from_env(env, without_storage=True)
    table = env.evaluate()
    cl = table[table["cost_function"] == "cost_total"].set_index("name")["value"]

    ours = []
    for i, building in enumerate(env.buildings):

        def one_meter(trace, i=i):  # type: ignore[no-untyped-def]
            return type(trace)(
                step_hours=trace.step_hours,
                net_grid_kwh=trace.net_grid_kwh[i : i + 1],
                price_per_kwh=trace.price_per_kwh,
                month=trace.month,
                battery_terminal_kwh=np.zeros((0, trace.price_per_kwh.size)),
                battery_capacity_kwh=np.zeros(0),
            )

        ratio = compute_kpis(one_meter(control)).energy_cost / compute_kpis(
            one_meter(baseline)
        ).energy_cost
        ours.append(ratio)
        assert ratio == pytest.approx(cl[building.name], rel=1e-5)

    # CityLearn's district value is the unweighted mean of building ratios.
    assert np.mean(ours) == pytest.approx(cl["District"], rel=1e-5)


def test_trace_shapes(finished_env) -> None:  # type: ignore[no-untyped-def]
    from emsbench.adapters.citylearn import trace_from_env

    trace = trace_from_env(finished_env)
    n_buildings = len(finished_env.buildings)
    assert trace.net_grid_kwh.shape == (n_buildings, END_STEP)
    assert trace.battery_terminal_kwh.shape[0] == n_buildings
    assert trace.step_hours == 1.0
