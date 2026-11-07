"""Export hourly site-level series for each controller, for visualisation.

Usage:
    python -m emsbench.viz.export                    # full year -> results/raw/replay.json
    python -m emsbench.viz.export --end-step 335     # two weeks

The output is plain JSON so any front end (the replay page today, the website
later) can read it without Python.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from emsbench.benchmark.kpis import FloatArray
from emsbench.net import use_system_certificates

DEFAULT_DATASET = "citylearn_challenge_2022_phase_1"
DEFAULT_CONTROLLERS = (
    "idle",
    "citylearn_BasicBatteryRBC",
    "citylearn_OptimizedRBC",
    "citylearn_BasicRBC",
)


def site_series(env: Any) -> dict[str, Any]:
    """Sum building-level series into site totals for one finished episode.

    Returns kWh per step (equal to average kW for hourly steps) and battery
    state of charge as a fraction of total capacity. Checks the energy balance
    grid = demand - solar + battery for every step.
    """
    t = len(env.net_electricity_consumption)
    b = env.buildings

    def total(attr: str) -> FloatArray:
        arrays = [np.asarray(getattr(x, attr)[:t], dtype=float) for x in b]
        return np.asarray(np.sum(arrays, axis=0), dtype=float)

    demand = total("net_electricity_consumption_without_storage_and_pv")
    solar = demand - total("net_electricity_consumption_without_storage")
    grid = total("net_electricity_consumption")
    battery = np.sum([np.asarray(x.electrical_storage.energy_balance[:t]) for x in b], axis=0)
    capacity = float(sum(x.electrical_storage.capacity for x in b))
    stored = np.sum(
        [np.asarray(x.electrical_storage.soc[:t]) * x.electrical_storage.capacity for x in b],
        axis=0,
    )
    price = np.asarray(b[0].pricing.electricity_pricing[:t], dtype=float)
    # Billing is per building with exports earning nothing (CityLearn's rule).
    cost = np.sum(
        [np.clip(np.asarray(x.net_electricity_consumption[:t]), 0, None) * price for x in b],
        axis=0,
    )

    imbalance = np.abs(grid - (demand - solar + battery)).max()
    if imbalance > 1e-3:
        raise RuntimeError(f"energy balance off by {imbalance:.4f} kWh")

    return {
        "demand_kwh": demand,
        "solar_kwh": solar,
        "battery_kwh": battery,
        "grid_kwh": grid,
        "soc": stored / capacity if capacity > 0 else np.zeros(t),
        "cost": cost,
        "price": price,
        "capacity_kwh": capacity,
    }


def _rounded(values: FloatArray, digits: int) -> list[float]:
    return [round(float(v), digits) for v in values]


def build_replay(dataset: str, controllers: list[str], end_step: int | None) -> dict[str, Any]:
    from emsbench.adapters.citylearn import make_env, run_episode
    from emsbench.baseline import _controller_factories

    factories = _controller_factories()
    kwargs: dict[str, Any] = {}
    if end_step is not None:
        kwargs["simulation_end_time_step"] = end_step

    out: dict[str, Any] = {"dataset": dataset, "controllers": {}}
    for name in controllers:
        env = make_env(dataset, **kwargs)
        run_episode(env, factories[name](env))
        s = site_series(env)
        first = env.buildings[0].energy_simulation
        t = len(s["price"])
        if "site" not in out:
            out["site"] = {
                "buildings": len(env.buildings),
                "battery_kwh": s["capacity_kwh"],
                "battery_kw": float(sum(x.electrical_storage.nominal_power for x in env.buildings)),
                "pv_kw": float(sum(x.pv.nominal_power for x in env.buildings)),
                "month": [int(m) for m in first.month[:t]],
                "hour": [int(h) for h in first.hour[:t]],
                "demand_kwh": _rounded(s["demand_kwh"], 2),
                "solar_kwh": _rounded(s["solar_kwh"], 2),
                "price": _rounded(s["price"], 3),
            }
        out["controllers"][name] = {
            "battery_kwh": _rounded(s["battery_kwh"], 2),
            "grid_kwh": _rounded(s["grid_kwh"], 2),
            "soc": _rounded(s["soc"], 3),
            "cost": _rounded(s["cost"], 3),
        }
        print(f"{name}: exported {t} steps")
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--controllers", nargs="+", default=list(DEFAULT_CONTROLLERS))
    parser.add_argument("--end-step", type=int, default=None)
    parser.add_argument("--out", type=Path, default=Path("results/raw/replay.json"))
    args = parser.parse_args(argv)

    use_system_certificates()
    replay = build_replay(args.dataset, args.controllers, args.end_step)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(replay, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {args.out} ({args.out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
