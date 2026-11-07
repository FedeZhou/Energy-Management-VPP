"""OPSD processing on a synthetic file: meter differencing, consumption balance, EV removal, glitches."""

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from emsbench.data import opsd


def synthetic_csv(tmp_path: Path, glitch: bool = False) -> Path:
    n = 96 * 70  # 70 days of 15-minute readings
    t = pd.date_range("2016-06-01", periods=n, freq="15min", tz="UTC")
    rng = np.random.default_rng(0)
    imp = rng.uniform(0.05, 0.15, n)  # kWh per 15 min
    exp = rng.uniform(0.0, 0.05, n)
    pv = rng.uniform(0.0, 0.2, n)
    ev = np.where(np.arange(n) % 96 < 8, 0.5, 0.0)
    if glitch:
        imp[3000] = 500.0  # cumulative counter jump
    cols = {
        "utc_timestamp": t,
        "DE_KN_residential4_grid_import": np.cumsum(imp),
        "DE_KN_residential4_grid_export": np.cumsum(exp),
        "DE_KN_residential4_pv": np.cumsum(pv),
        "DE_KN_residential4_ev": np.cumsum(ev),
        # PV without an export meter: cannot be balanced, must be skipped
        "DE_KN_residential1_grid_import": np.cumsum(imp),
        "DE_KN_residential1_pv": np.cumsum(pv),
    }
    path = tmp_path / "opsd.csv"
    pd.DataFrame(cols).to_csv(path, index=False)
    return path


def test_consumption_balance_and_ev_removed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = synthetic_csv(tmp_path)
    monkeypatch.setattr(opsd, "download", lambda url, dest: path)
    profiles = {p.id: p for p in opsd.build()}
    assert "opsd/residential1" not in profiles  # PV without export meter is skipped
    p = profiles["opsd/residential4"]
    raw = pd.read_csv(path)
    d = raw.filter(like="residential4").diff().iloc[1:]
    expected_kw = (d.iloc[:, 0] - d.iloc[:, 1] + d.iloc[:, 2] - d.iloc[:, 3]).clip(lower=0).to_numpy() * 4
    assert p.step_seconds == 900
    assert np.allclose(p.values[:200], expected_kw[:200])
    assert "CC BY" in p.licence


def test_meter_glitch_is_removed_and_reported(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = synthetic_csv(tmp_path, glitch=True)
    monkeypatch.setattr(opsd, "download", lambda url, dest: path)
    p = next(x for x in opsd.build() if x.id == "opsd/residential4")
    assert p.values.max() < 10  # the 500 kWh jump would be 2000 kW
    assert "glitch" in p.note
