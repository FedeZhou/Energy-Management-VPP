"""Run baseline controllers on a CityLearn dataset and write a scoreboard.

Usage:
    python -m emsbench.baseline                      # full year, default controllers
    python -m emsbench.baseline --end-step 167       # quick one-week smoke run
"""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pandas as pd

from emsbench.net import use_system_certificates

DEFAULT_DATASET = "citylearn_challenge_2022_phase_1"


def _controller_factories() -> dict[str, Callable[[Any], Any]]:
    from citylearn.agents.rbc import BasicBatteryRBC, BasicRBC, OptimizedRBC

    from emsbench.adapters.citylearn import IdleController

    return {
        "idle": IdleController,
        "citylearn_BasicRBC": BasicRBC,
        "citylearn_BasicBatteryRBC": BasicBatteryRBC,
        "citylearn_OptimizedRBC": OptimizedRBC,
    }


def _git_commit() -> str:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True
        )
        return out.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def run(dataset: str, controllers: list[str], end_step: int | None) -> pd.DataFrame:
    """Run each controller for one episode and return one row per controller."""
    import citylearn

    from emsbench.adapters.citylearn import citylearn_kpis, make_env, run_episode, trace_from_env
    from emsbench.benchmark.kpis import compute_kpis

    factories = _controller_factories()
    env_kwargs: dict[str, Any] = {}
    if end_step is not None:
        env_kwargs["simulation_end_time_step"] = end_step

    rows: list[dict[str, Any]] = []
    for i, name in enumerate(controllers):
        env = make_env(dataset, **env_kwargs)
        controller = factories[name](env)
        started = time.perf_counter()
        run_episode(env, controller)
        elapsed = time.perf_counter() - started

        if i == 0:
            # CityLearn's counterfactual "no battery" series, from the same run.
            rows.append(
                {
                    "controller": "no_battery (CityLearn baseline)",
                    **compute_kpis(trace_from_env(env, without_storage=True)).as_dict(),
                }
            )
        rows.append(
            {
                "controller": name,
                **compute_kpis(trace_from_env(env)).as_dict(),
                **citylearn_kpis(env),
                "runtime_s": round(elapsed, 1),
            }
        )
        print(f"{name}: done in {elapsed:.0f}s")

    table = pd.DataFrame(rows)
    # Ratio of totals. Differs from CityLearn's cl_cost_total, which is the
    # unweighted mean of per-building ratios.
    table.insert(2, "cost_vs_no_battery", table["energy_cost"] / table.loc[0, "energy_cost"])
    table.attrs.update(
        dataset=dataset,
        steps=len(env.net_electricity_consumption),
        citylearn_version=citylearn.__version__,
        git_commit=_git_commit(),
        date=dt.date.today().isoformat(),
    )
    return table


def to_markdown(table: pd.DataFrame) -> str:
    meta = table.attrs
    header = (
        "# Baseline scoreboard\n\n"
        f"- Dataset: `{meta['dataset']}` ({meta['steps']} steps)\n"
        f"- CityLearn {meta['citylearn_version']}, emsbench commit `{meta['git_commit']}`, "
        f"run on {meta['date']}\n"
        "- Absolute KPIs are computed by `emsbench.benchmark.kpis` (see its docstring for "
        "definitions). Cost is in the dataset's price unit (assumed USD, unverified).\n"
        "- `cost_vs_no_battery` = total cost / total cost without battery (whole district).\n"
        "- `cl_*` columns are CityLearn's own KPIs: ratios to the same buildings with PV but "
        "no battery (1.0 = no change, below 1.0 = better). At district level CityLearn "
        "reports the **unweighted mean of per-building ratios**, so `cl_cost_total` differs "
        "from `cost_vs_no_battery`: small buildings weigh as much as large ones.\n\n"
    )
    return header + table.to_markdown(index=False, floatfmt=".3f") + "\n"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--controllers", nargs="+", default=list(_controller_factories()))
    parser.add_argument("--end-step", type=int, default=None, help="last time step (inclusive)")
    parser.add_argument("--out", type=Path, default=Path("results/baseline_scoreboard"))
    args = parser.parse_args(argv)

    use_system_certificates()
    table = run(args.dataset, args.controllers, args.end_step)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(args.out.with_suffix(".csv"), index=False)
    args.out.with_suffix(".md").write_text(to_markdown(table), encoding="utf-8")
    print(to_markdown(table))


if __name__ == "__main__":
    main()
