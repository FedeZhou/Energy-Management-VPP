"""Batch study: one base site, several real homes and drivers, several controllers and forecast modes.

Single example weeks are anecdotes. This runs full years for several measured homes (each with its own measured EV
driver) and reports the range across homes (median, min, max), and each controller's saving against the same home
with the battery idle (paired, so differences between homes cancel out).

    python -m emsbench.study                                  # flagship: German home with solar, battery and EV
    python -m emsbench.study --days 28 --out results/smoke    # quick check
"""

from __future__ import annotations

import argparse
import csv
import statistics
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

import yaml

# Measured German homes (OPSD) that cover a full November-October year, each with a measured EV driver (SINTEF home
# garages in Norway) whose sessions also cover one. Home 3 does not cover such a year and is left out.
HOMES = (
    ("opsd/residential2", "sintef/OSL_S_KT43"),
    ("opsd/residential4", "sintef/BOD_02H0505"),
    ("opsd/residential5", "sintef/BAR_Plass160"),
    ("opsd/residential6", "sintef/OSL_S_KT45"),
)
CONTROLLERS: dict[str, dict[str, Any]] = {
    "idle": {"battery": "idle", "ev": "as_fast_as_possible"},
    "rule": {"battery": "self_consumption", "ev": "cheapest_hours"},
    "mpc_wear_blind": {"battery": "mpc", "mpc_wear_cost": False, "mpc_execution": "plan"},
    "mpc_wear_priced": {"battery": "mpc", "mpc_wear_cost": True, "mpc_execution": "plan"},
    # scenarios only differ from plain MPC when forecasts are realistic
    "mpc_scenarios3": {"battery": "mpc", "mpc_wear_cost": True, "mpc_scenarios": 3, "mpc_execution": "plan"},
    "mpc_hybrid": {"battery": "mpc", "mpc_wear_cost": True, "mpc_execution": "hybrid"},
    "mpc_cautious": {"battery": "mpc", "mpc_wear_cost": True, "mpc_execution": "cautious"},
}
FORECASTS = ("perfect", "realistic")
METRICS = ("total_cost", "battery_wear_cost", "total_cost_with_wear", "self_sufficiency_share", "peak_import_kw",
           "ev_unmet_kwh", "battery_life_years", "battery_equivalent_full_cycles", "grid_export_kwh")


def _run(job: tuple[dict[str, Any], str, str, str, str, int | None]) -> dict[str, Any]:
    from emsbench.data import load_library
    from emsbench.sim.engine import simulate
    from emsbench.sim.model import Site

    base, home, ev, ctrl, forecast, days = job
    raw = yaml.safe_load(yaml.safe_dump(base))  # deep copy
    for a in raw["assets"]:
        if a["type"] == "building":
            a["load_profile"] = home
        if a["type"] == "ev_charger":
            a["sessions"] = ev
    raw["controller"] = {**raw.get("controller", {}), **CONTROLLERS[ctrl], "forecast": forecast}
    if days:
        raw["days"] = days
    t0 = time.time()
    k = simulate(Site.model_validate(raw), load_library()).kpis
    return {"home": home, "ev": ev, "controller": ctrl, "forecast": forecast, "seconds": round(time.time() - t0, 1),
            **{m: k[m] for m in METRICS}}


def summarise(rows: list[dict[str, Any]]) -> str:
    def rng(vals: list[float], fmt: str) -> str:
        return f"{fmt.format(statistics.median(vals))} ({fmt.format(min(vals))} to {fmt.format(max(vals))})"

    idle = {(r["home"], r["forecast"]): r for r in rows if r["controller"] == "idle"}
    lines = ["| Controller | Forecast | Energy cost | Wear | Cost incl. wear | Saving vs idle incl. wear | "
             "Self-sufficiency | Battery life (yr) | EV short (kWh) |", "|---" * 9 + "|"]
    for ctrl in CONTROLLERS:
        for fc in FORECASTS:
            sel = [r for r in rows if r["controller"] == ctrl and r["forecast"] == fc]
            if not sel:
                continue
            saving = [idle[(r["home"], fc)]["total_cost_with_wear"] - r["total_cost_with_wear"] for r in sel
                      if (r["home"], fc) in idle]
            lines.append(
                f"| {ctrl} | {fc} | {rng([r['total_cost'] for r in sel], '{:,.0f}')} | "
                f"{rng([r['battery_wear_cost'] for r in sel], '{:,.0f}')} | "
                f"{rng([r['total_cost_with_wear'] for r in sel], '{:,.0f}')} | "
                f"{rng(saving, '{:,.0f}') if saving else '-'} | "
                f"{rng([100 * r['self_sufficiency_share'] for r in sel], '{:.0f}%')} | "
                f"{rng([r['battery_life_years'] for r in sel], '{:.1f}')} | "
                f"{rng([r['ev_unmet_kwh'] for r in sel], '{:.1f}')} |")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default="configs/sites/plan_home_de_ev.yaml")
    ap.add_argument("--out", default="results/study_home_de")
    ap.add_argument("--days", type=int, default=None, help="shorter runs for a quick check")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--controllers", nargs="*", default=list(CONTROLLERS), help="subset of controllers to run")
    ap.add_argument("--forecasts", nargs="*", default=list(FORECASTS), help="subset of forecast modes to run")
    ap.add_argument("--merge", action="store_true", help="add to the existing runs.csv instead of replacing it")
    args = ap.parse_args()
    base = yaml.safe_load(Path(args.base).read_text(encoding="utf-8"))["site"]
    jobs = [(base, h, e, c, f, args.days) for h, e in HOMES for c in args.controllers for f in args.forecasts]
    t0 = time.time()
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(_run, jobs))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    if args.merge and (out / "runs.csv").exists():
        with (out / "runs.csv").open(encoding="utf-8") as f:
            old = [{k: (v if k in ("home", "ev", "controller", "forecast") else float(v)) for k, v in r.items()}
                   for r in csv.DictReader(f)]
        new_keys = {(r["home"], r["controller"], r["forecast"]) for r in rows}
        rows = [r for r in old if (r["home"], r["controller"], r["forecast"]) not in new_keys] + rows
    with (out / "runs.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    summary = summarise(rows)
    (out / "summary.md").write_text(
        f"# Study: {base.get('name', args.base)}\n\nBase site: `{args.base}`, {args.days or base['days']} days from "
        f"{base['start']}, {base['step_minutes']}-min steps. Homes and drivers: "
        f"{', '.join(f'{h} + {e}' for h, e in HOMES)}.\nValues: median (min to max) across the {len(HOMES)} homes, "
        f"in the tariff's currency. Saving vs idle is per home, against the same home with the battery idle and the "
        f"car charging on arrival, wear included.\n\n{summary}\n\nRuntime {time.time() - t0:,.0f} s.\n",
        encoding="utf-8")
    print(summary)


if __name__ == "__main__":
    main()
