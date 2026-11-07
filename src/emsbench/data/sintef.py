"""Residential EV charging sessions, Norway (SINTEF), Zenodo 10.5281/zenodo.12730566.

Dataset1: plug-in/plug-out time and energy per session (measured). Dataset2:
per-user charging power and battery capacity *estimated by the dataset authors*.
Each user is one parking spot in a shared residential garage ("location").
"""

from __future__ import annotations

import math

import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import EVSession, EVSessionSet

BASE = "https://zenodo.org/records/12730566/files"
SOURCE = ("Sørensen et al., 'Electric vehicle charging dataset with 35,000 charging sessions from 12 "
          "residential locations in Norway', Zenodo, doi:10.5281/zenodo.12730566")
LICENCE = "CC BY 4.0"
MIN_SESSIONS = 150  # keep regular users only, so a picked spot has a car most days


def _estimates(path: str) -> dict[str, tuple[float | None, float | None]]:
    """user -> (charging power kW, battery kWh); a missing estimate means unknown."""
    u = pd.read_csv(path, sep=";", decimal=",")

    def known(v: object) -> float | None:
        f = float(v) if isinstance(v, (int, float)) else math.nan
        return None if math.isnan(f) else f

    return {str(user): (known(p), known(c)) for user, p, c in
            zip(u["user_id"].tolist(), u["charging_power"].tolist(), u["battery_capacity"].tolist(), strict=True)}


def build() -> list[EVSessionSet]:
    reports = download(f"{BASE}/Dataset1_charging_reports.csv?download=1",
                       RAW / "sintef" / "Dataset1_charging_reports.csv")
    users = download(f"{BASE}/Dataset2_user_predictions.csv?download=1",
                     RAW / "sintef" / "Dataset2_user_predictions.csv")
    d = pd.read_csv(reports, sep=";", decimal=",", parse_dates=["plugin_time", "plugout_time"])
    d = d.dropna(subset=["plugin_time", "plugout_time", "energy_session"]).sort_values("plugin_time")
    est = _estimates(str(users))
    out: list[EVSessionSet] = []
    for user, g in d.groupby("user_id"):
        if len(g) < MIN_SESSIONS:
            continue
        uid = str(user)
        kw, cap = est.get(uid, (None, None))
        rows = zip(g["plugin_time"].dt.to_pydatetime().tolist(), g["plugout_time"].dt.to_pydatetime().tolist(),
                   g["energy_session"].astype(float).tolist(), strict=True)
        sessions = tuple(EVSession(a, b, e, uid, kw, cap) for a, b, e in rows if b > a)
        loc, spot = uid.split("_", 1) if "_" in uid else (uid, "")
        spot = spot.replace("Plass", "spot ")
        out.append(EVSessionSet(
            f"sintef/{uid}", f"Norway garage {loc}, {spot} ({len(sessions)} visits"
            + (f", car ~{kw:.1f} kW)" if kw else ")"),
            SOURCE, sessions, sessions[0].arrival.replace(hour=0, minute=0, second=0),
            sessions[-1].departure, licence=LICENCE, resolution_minutes=1,
            note="Measured sessions (local Norwegian time). Car power and battery size are estimates "
                 "by the dataset authors.",
        ))
    return out
