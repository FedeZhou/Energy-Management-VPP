"""Adapter between CityLearn and emsbench's simulator-independent benchmark.

Everything CityLearn-specific lives here, so the rest of the code base only
sees `EpisodeTrace`. If we later replace CityLearn with our own generic asset
simulator, only this module needs a counterpart.
"""

from __future__ import annotations

from typing import Any, Protocol

import numpy as np
import pandas as pd
from citylearn.citylearn import CityLearnEnv

from emsbench.benchmark.kpis import EpisodeTrace

# CityLearn district-level KPIs we report. They are ratios to the same
# buildings with PV but without battery control (1.0 = no change, <1 = better).
CITYLEARN_KPIS: tuple[str, ...] = (
    "cost_total",
    "electricity_consumption_total",
    "carbon_emissions_total",
    "all_time_peak_average",
    "daily_peak_average",
    "ramping_average",
    "daily_one_minus_load_factor_average",
)


class Controller(Protocol):
    """Anything that maps CityLearn observations to CityLearn actions."""

    def predict(self, observations: Any, deterministic: bool | None = None) -> Any: ...


class IdleController:
    """Always commands zero battery power. A sanity check: its result must match
    CityLearn's "without storage" baseline (KPI ratios of 1.0)."""

    def __init__(self, env: Any) -> None:
        self._dims = [space.shape[0] for space in env.action_space]

    def predict(self, observations: Any, deterministic: bool | None = None) -> list[list[float]]:
        return [[0.0] * d for d in self._dims]


def make_env(dataset: str, **kwargs: Any) -> CityLearnEnv:
    """Create a CityLearn environment with a single central controller."""
    kwargs.setdefault("central_agent", True)
    return CityLearnEnv(dataset, **kwargs)


def run_episode(env: CityLearnEnv, controller: Controller) -> None:
    """Step the environment to the end of one episode."""
    observations, _ = env.reset()
    done = False
    while not done:
        actions = controller.predict(observations, deterministic=True)
        observations, _, terminated, truncated, _ = env.step(actions)
        done = terminated or truncated


def trace_from_env(env: CityLearnEnv, *, without_storage: bool = False) -> EpisodeTrace:
    """Build an `EpisodeTrace` from a finished episode.

    Args:
        env: A CityLearn environment that has completed an episode.
        without_storage: If True, return CityLearn's counterfactual series in
            which batteries are absent (its default KPI baseline).

    Notes:
        - Each CityLearn building is billed as a separate meter: CityLearn
          clips negative cost per building, so exports earn nothing and cannot
          offset a neighbour's imports.
        - District series have one entry per simulated step (T); building
          series have T + 1, so we truncate to T.
    """
    t = len(env.net_electricity_consumption)
    first = env.buildings[0]

    if without_storage:
        net = np.array([b.net_electricity_consumption_without_storage[:t] for b in env.buildings])
        batteries = np.zeros((0, t))
        capacities = np.zeros(0)
    else:
        net = np.array([b.net_electricity_consumption[:t] for b in env.buildings])
        storages = [
            b.electrical_storage for b in env.buildings if b.electrical_storage.capacity > 0
        ]
        batteries = (
            np.array([s.energy_balance[:t] for s in storages]) if storages else np.zeros((0, t))
        )
        capacities = np.array([s.capacity for s in storages], dtype=float)

    return EpisodeTrace(
        step_hours=env.seconds_per_time_step / 3600.0,
        net_grid_kwh=net.astype(float),
        price_per_kwh=np.asarray(first.pricing.electricity_pricing[:t], dtype=float),
        month=np.asarray(first.energy_simulation.month[:t], dtype=int),
        battery_terminal_kwh=batteries.astype(float),
        battery_capacity_kwh=capacities,
    )


def citylearn_kpis(env: CityLearnEnv) -> dict[str, float]:
    """CityLearn's own district-level KPIs (ratios to the no-battery baseline)."""
    table: pd.DataFrame = env.evaluate()
    district = table[table["level"] == "district"].set_index("cost_function")["value"]
    return {f"cl_{name}": float(district[name]) for name in CITYLEARN_KPIS if name in district}
