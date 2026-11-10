"""HTTP API for the site simulator, plus the built web app.

Run:  emsbench-app          (http://localhost:8000)
Dev:  uvicorn emsbench.api.app:app --reload   and   npm run dev  in web/app
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from emsbench.sim.engine import FloatArray, SimResult, simulate
from emsbench.sim.model import ASSET_TYPES, MAX_STEPS, ControllerSpec, GridConnection, Site, Tariff
from emsbench.sim.profiles import default_library

ROOT = Path(__file__).resolve().parents[3]
PRESETS_DIR = ROOT / "configs" / "sites"
WEB_DIST = ROOT / "web" / "app" / "dist"

ASSET_INFO: dict[str, dict[str, str]] = {
    "building": {"label": "Building", "group": "Loads"},
    "data_center": {"label": "Data center", "group": "Loads"},
    "heat_pump": {"label": "Heat pump", "group": "Loads"},
    "ev_charger": {"label": "EV charger", "group": "Loads"},
    "pv": {"label": "Solar PV", "group": "Sources"},
    "battery": {"label": "Battery", "group": "Storage"},
}

app = FastAPI(title="emsbench", version="0.1")


def _fields(model: type[Any]) -> list[dict[str, Any]]:
    """Flatten a pydantic model's JSON schema into form field descriptions."""
    schema = model.model_json_schema()
    out = []
    for name, prop in schema["properties"].items():
        if name in ("id", "type") or prop.get("hidden"):
            continue
        kind = prop.get("type")
        if "anyOf" in prop:  # optional numbers
            kinds = [p.get("type") for p in prop["anyOf"] if p.get("type") != "null"]
            kind = kinds[0] if kinds else "string"
            prop = {**prop, **next(p for p in prop["anyOf"] if p.get("type") != "null")}
        out.append({
            "name": name, "label": prop.get("title", name), "type": kind,
            "enum": prop.get("enum"), "default": schema["properties"][name].get("default"),
            "unit": prop.get("unit", ""), "help": prop.get("description", ""), "format": prop.get("format", ""),
            "source": prop.get("source", ""), "options": prop.get("options", ""),
            "min": prop.get("minimum"), "max": prop.get("maximum"),
            "nullable": "anyOf" in schema["properties"][name],
        })
    return out


@app.get("/api/catalog")
def catalog() -> dict[str, Any]:
    return {
        "assets": {
            t: {**ASSET_INFO[t], "description": (cls.__doc__ or "").strip(), "fields": _fields(cls)}
            for t, cls in ASSET_TYPES.items()
        },
        "site": {
            "grid": _fields(GridConnection), "tariff": _fields(Tariff),
            "controller": _fields(ControllerSpec),
            "period": [f for f in _fields(Site) if f["name"] in ("start", "days", "step_minutes")],
            "max_steps": MAX_STEPS,
        },
    }


@app.get("/api/profiles")
def profiles() -> dict[str, Any]:
    lib = default_library()
    return {"warnings": lib.warnings, **lib.catalogue()}


@app.get("/api/datasources")
def datasources() -> dict[str, Any]:
    from emsbench.data.openmeteo_pv import load_validations
    from emsbench.data.registry import EXCLUDED, RULES, SOURCES, STATIC_CHECKS

    lib = default_library()
    ids = list(lib.profiles) + list(lib.ev_sets)
    def count(s: dict[str, Any]) -> int:  # a source with a "suffix" owns only ids ending in it
        suffix = str(s.get("suffix", ""))
        return sum(1 for i in ids if i.startswith(s["prefix"]) and (i.endswith(suffix) if suffix else "@" not in i))

    sources = [{**s, "profiles": count(s)} for s in SOURCES]
    return {"sources": sources, "excluded": EXCLUDED, "rules": RULES, "checks": STATIC_CHECKS,
            "pv_checks": load_validations(), "warnings": lib.warnings}


@app.get("/api/tariffs")
def tariffs() -> list[dict[str, Any]]:
    from emsbench.data.eurostat import load_tariffs

    default_library()  # make sure the data has been prepared
    return load_tariffs()


@app.get("/api/presets")
def presets() -> list[dict[str, Any]]:
    out = []
    for path in sorted(PRESETS_DIR.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        site = Site.model_validate(data["site"])
        out.append({"id": path.stem, "label": data.get("label", path.stem), "mode": site.mode,
                    "description": data.get("description", ""),
                    "site": site.model_dump(mode="json")})
    return out


def _series(arr: FloatArray, digits: int = 3) -> list[float]:
    return [round(float(v), digits) for v in arr]


def _result_json(r: SimResult) -> dict[str, Any]:
    return {
        "kpis": {k: round(v, 4) for k, v in r.kpis.items()},
        "warnings": r.warnings,
        "site": {k: _series(v) for k, v in r.site.items()},
        "assets": {a: {k: _series(v) for k, v in s.items()} for a, s in r.assets.items()},
        "sessions": r.sessions,
        "sources": r.sources,
        "currency": r.currency,
    }


@app.post("/api/simulate")
def run_simulation(site: Site) -> dict[str, Any]:
    lib = default_library()
    started = time.perf_counter()
    try:
        result = simulate(site, lib)
        baseline_site = site.model_copy(
            update={"controller": site.controller.model_copy(
                update={"battery": "idle", "ev": "as_fast_as_possible", "heat_pump": "on_demand",
                        "ev_discharge": "never"})}
        )
        baseline = simulate(baseline_site, lib)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=422, detail=str(e).strip("'\"")) from e
    return {
        "time": {"start": result.start.isoformat(), "step_minutes": result.step_minutes,
                 "steps": int(result.site["grid_kw"].size)},
        "result": _result_json(result),
        "baseline": {"kpis": {k: round(v, 4) for k, v in baseline.kpis.items()},
                     "site": {"grid_kw": _series(baseline.site["grid_kw"])}},
        "runtime_s": round(time.perf_counter() - started, 2),
    }


if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        target = WEB_DIST / path
        return FileResponse(target if path and target.is_file() else WEB_DIST / "index.html")


def main() -> None:
    import uvicorn

    from emsbench.net import use_system_certificates

    use_system_certificates()
    lib = default_library()  # download/cache data before the first request
    for w in lib.warnings:
        print("data warning:", w)
    print("emsbench app: http://localhost:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)
