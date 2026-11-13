"""Export a static demo of Site Lab for GitHub Pages.

GitHub Pages serves static files only, while Site Lab simulates in a Python server. This script calls the real
API once (in-process, via FastAPI's TestClient) and writes its answers as JSON into web/app/public/demo/:

- catalog, profiles, presets, datasources and tariffs (what the app loads at start),
- for every example site, four pre-computed runs: its own battery strategy and the MPC, each with perfect and
  realistic forecasts. That covers "Run", the MPC demo links and "Compare forecasts".

A static build of the frontend (VITE_STATIC_DEMO=1) reads these files instead of calling the API. Changing a site
in the demo shows a message pointing to the live app (Codespaces or a local install).

Examples whose data carries a non-commercial licence (CC BY-NC-SA: the Utrecht workplace EV sessions) are left out
of the public demo; they stay available in the live app.

Usage:  python scripts/export_static_demo.py [--only PRESET ...]
"""

from __future__ import annotations

import argparse
import copy
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient

from emsbench.api.app import app

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "app" / "public" / "demo"
NON_COMMERCIAL_PROFILE_PREFIXES = ("utwente/",)  # licence CC BY-NC-SA 4.0: not republished in the public demo


def uses_non_commercial_data(site: dict[str, object]) -> bool:
    text = json.dumps(site)
    return any(prefix in text for prefix in NON_COMMERCIAL_PROFILE_PREFIXES)


def run_key(preset_id: str, battery: str, forecast: str) -> str:
    return f"{preset_id}__{battery}__{forecast}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", nargs="*", help="export runs only for these preset ids (static files always)")
    args = parser.parse_args()

    client = TestClient(app)
    (OUT / "runs").mkdir(parents=True, exist_ok=True)

    presets = [p for p in client.get("/api/presets").json() if not uses_non_commercial_data(p["site"])]
    for name in ["catalog", "profiles", "datasources", "tariffs"]:
        (OUT / f"{name}.json").write_text(client.get(f"/api/{name}").text, encoding="utf-8")
    (OUT / "presets.json").write_text(json.dumps(presets), encoding="utf-8")

    index_path = OUT / "runs.json"
    index: list[str] = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
    for preset in presets:
        if args.only and preset["id"] not in args.only:
            continue
        own = preset["site"]["controller"]["battery"]
        for battery in dict.fromkeys([own, "mpc"]):
            for forecast in ["perfect", "realistic"]:
                site = copy.deepcopy(preset["site"])
                site["controller"]["battery"] = battery
                site["controller"]["forecast"] = forecast
                t = time.perf_counter()
                r = client.post("/api/simulate", json=site)
                r.raise_for_status()
                key = run_key(preset["id"], battery, forecast)
                (OUT / "runs" / f"{key}.json").write_text(r.text, encoding="utf-8")
                if key not in index:
                    index.append(key)
                print(f"{key}: {len(r.content) // 1024} kB in {time.perf_counter() - t:.1f} s", flush=True)
    index_path.write_text(json.dumps(sorted(index)), encoding="utf-8")
    print(f"wrote {OUT} ({len(presets)} examples, {len(index)} runs)")


if __name__ == "__main__":
    main()
