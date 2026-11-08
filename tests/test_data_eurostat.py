"""Eurostat JSON-stat parsing and tariff arithmetic on a synthetic response."""

import json
from pathlib import Path

import pytest

from emsbench.data import eurostat


def jsonstat(values: dict[tuple[str, str, str], float]) -> dict[str, object]:
    """Minimal JSON-stat with dimensions nrg_prc x geo x time (same layout as Eurostat)."""
    prc = ["NRG_SUP", "NETC", "TAX_FEE_LEV_CHRG", "VAT"]
    geo = ["DE", "NL"]
    time = ["2024", "2025"]
    dims = {"nrg_prc": prc, "geo": geo, "time": time}
    flat = {}
    for (p, g, t), v in values.items():
        idx = (prc.index(p) * len(geo) + geo.index(g)) * len(time) + time.index(t)
        flat[str(idx)] = v
    return {
        "id": list(dims), "size": [len(v) for v in dims.values()],
        "dimension": {k: {"category": {"index": {c: i for i, c in enumerate(v)}}} for k, v in dims.items()},
        "value": flat,
    }


def test_parse_jsonstat_roundtrip() -> None:
    d = jsonstat({("NETC", "NL", "2025"): 0.11, ("VAT", "DE", "2024"): 0.06})
    ids, values = eurostat.parse_jsonstat(d)  # type: ignore[arg-type]
    assert ids == ["nrg_prc", "geo", "time"]
    assert values == {("NETC", "NL", "2025"): 0.11, ("VAT", "DE", "2024"): 0.06}


def test_tariff_math_household_and_business(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    resp = jsonstat({
        ("NRG_SUP", "DE", "2025"): 0.15, ("NETC", "DE", "2025"): 0.11,
        ("TAX_FEE_LEV_CHRG", "DE", "2025"): 0.12, ("VAT", "DE", "2025"): 0.06,
        ("NRG_SUP", "DE", "2024"): 0.99,  # older year with missing parts must be ignored
    })
    path = tmp_path / "resp.json"
    path.write_text(json.dumps(resp))
    monkeypatch.setattr(eurostat, "download", lambda *a, **k: path)
    monkeypatch.setattr(eurostat, "COUNTRIES", {"DE": "Germany"})
    rows = {r["consumer"]: r for r in eurostat.build_tariffs()}
    home, biz = rows["household"], rows["business"]
    # Taxes already include VAT for households: total = energy + network + taxes.
    assert home["year"] == "2025"
    assert home["total"] == pytest.approx(0.15 + 0.11 + 0.12)
    assert home["adder"] == pytest.approx(0.11 + 0.12)
    # Businesses recover VAT: it is removed from the taxes.
    assert biz["taxes"] == pytest.approx(0.12 - 0.06)
    assert biz["adder"] == pytest.approx(0.11 + 0.06)
