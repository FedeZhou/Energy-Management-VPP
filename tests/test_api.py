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
    assert {p["mode"] for p in presets} == {"plan", "operate"}
    for preset in presets:
        site = preset["site"]
        site["days"] = min(site["days"], 2)
        r = client.post("/api/simulate", json=site)
        assert r.status_code == 200, (preset["id"], r.text)
        body = r.json()
        steps = site["days"] * 24 * 60 // site["step_minutes"]
        assert len(body["result"]["site"]["grid_kw"]) == steps
        assert body["result"]["sources"]
    site = next(p for p in presets if p["id"] == "plan_apartment_ev")["site"]
    body = client.post("/api/simulate", json=site).json()
    assert body["result"]["kpis"]["grid_overload_kwh"] >= 0
    assert "total_cost" in body["baseline"]["kpis"]
    assert set(body["result"]["assets"]) == {a["id"] for a in site["assets"]}


def test_unknown_profile_is_a_clear_error() -> None:
    bad = {"assets": [{"type": "building", "id": "b", "load_profile": "nope"}], "days": 1}
    r = client.post("/api/simulate", json=bad)
    assert r.status_code == 422
    assert "nope" in r.text


def test_too_many_steps_rejected_with_explanation() -> None:
    r = client.post("/api/simulate", json={"days": 365, "step_minutes": 1, "assets": []})
    assert r.status_code == 422
    assert "limit" in r.text


def test_other_year_is_used_when_dates_are_missing() -> None:
    # German prices start in Oct 2025; March 2023 maps to March 2026 (same season and weekday).
    site = {"start": "2023-03-01", "days": 1, "step_minutes": 15,
            "tariff": {"price_profile": "ec/de_lu_da"}, "assets": []}
    body = client.post("/api/simulate", json=site).json()
    used = next(s for s in body["result"]["sources"] if s["asset"] == "tariff")["source_start"]
    assert used.startswith("2026-0") or used.startswith("2026-03")


def test_period_without_data_is_explained() -> None:
    # The school load covers about six months; 300 days cannot be found in any year.
    site = {"days": 300, "assets": [{"type": "building", "id": "s", "load_profile": "opsd/public1"}]}
    r = client.post("/api/simulate", json=site)
    assert r.status_code == 422
    assert "covers 2016-05" in r.text
