"""The public static demo leaves out examples whose data forbids commercial use, based on the source registry."""

import importlib.util
import re
from pathlib import Path
from types import ModuleType

from fastapi.testclient import TestClient

from emsbench.api.app import app
from emsbench.data.registry import SOURCES

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "export_static_demo.py"


def load_export() -> ModuleType:
    spec = importlib.util.spec_from_file_location("export_static_demo", SCRIPT)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_filter_follows_the_registry() -> None:
    export = load_export()
    non_commercial = {s["prefix"] for s in SOURCES if not s["commercial_use"]}
    assert set(export.NON_COMMERCIAL_PROFILE_PREFIXES) == non_commercial
    assert "utwente/" in non_commercial and "leeds/" not in non_commercial


def test_every_preset_profile_has_a_registered_licence_and_the_depot_is_public() -> None:
    export = load_export()
    presets = {p["id"]: p for p in TestClient(app).get("/api/presets").json()}
    prefixes = {str(s["prefix"]) for s in SOURCES}
    for p in presets.values():
        ids = re.findall(r'"(?:load_profile|profile|sessions|price_profile)": "([^"]+)"',
                         str(p["site"]).replace("'", '"'))
        for pid in ids:
            assert any(pid.startswith(x) for x in prefixes), (p["id"], pid)
    assert export.uses_non_commercial_data(presets["plan_ev_timeblock_nl"]["site"])
    assert not export.uses_non_commercial_data(presets["plan_fleet_depot_timeblock"]["site"])
