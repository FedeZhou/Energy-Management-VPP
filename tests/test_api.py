"""API tests. Uses the real profile library (CityLearn data), so marked integration."""

import pytest
from fastapi.testclient import TestClient

from emsbench.api.app import app

pytestmark = pytest.mark.integration
client = TestClient(app)


def test_catalog_lists_assets_with_sourced_fields() -> None:
    cat = client.get("/api/catalog").json()
    assert set(cat["assets"]) == {"building", "pv", "battery", "ev_charger"}
    battery = {f["name"]: f for f in cat["assets"]["battery"]["fields"]}
    assert battery["capacity_kwh"]["unit"] == "kWh"
    assert "CityLearn" in battery["capacity_kwh"]["source"]
    grid = {f["name"]: f for f in cat["site"]["grid"]}
    assert grid["import_limit_kw"]["nullable"] is True


def test_presets_validate_and_simulate() -> None:
    presets = client.get("/api/presets").json()
    assert {p["id"] for p in presets} >= {"home", "ev_parking"}
    site = next(p for p in presets if p["id"] == "ev_parking")["site"]
    site["days"] = 7
    body = client.post("/api/simulate", json=site).json()
    assert len(body["result"]["site"]["grid_kw"]) == 7 * 24
    assert body["result"]["kpis"]["grid_overload_kwh"] >= 0
    assert "total_cost" in body["baseline"]["kpis"]
    assert set(body["result"]["assets"]) == {a["id"] for a in site["assets"]}


def test_unknown_profile_is_a_clear_error() -> None:
    bad = {"assets": [{"type": "building", "id": "b", "load_profile": "nope"}], "days": 1}
    r = client.post("/api/simulate", json=bad)
    assert r.status_code == 422
    assert "nope" in r.text
