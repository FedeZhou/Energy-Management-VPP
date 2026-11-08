"""Workplace EV charging sessions, office car park in Utrecht (University of Twente / ElaadNL).

Winschermann, L. et al., "Electric Vehicle Charging Session Data of Large Office Parking Lot",
4TU.ResearchData, doi:10.4121/80ef3824-3f5d-4e45-8794-3b8791efbd13 (version 1, 2024).
Licence: CC BY-NC-SA 4.0, i.e. NON-COMMERCIAL use only. Fine for this open research project;
not for a commercial product. We download at runtime and do not redistribute the data.

Sessions are measured (start, end, energy). Up to ~300 charging points, mostly 22 kW double
plugs (11 kW per plug when both are used). Times are local Dutch time; converted to fixed CET.
Shared charging IDs (listed in the dataset README) cannot be attributed to one driver and are
excluded. From March 2023 an MPC controlled part of the car park, so later sessions already
reflect some smart charging (README).
"""

from __future__ import annotations

import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import EVSession, EVSessionSet

URL = "https://data.4tu.nl/file/80ef3824-3f5d-4e45-8794-3b8791efbd13/f2e3498b-1f30-45ac-a440-25215e83f94d"
SOURCE = ("Winschermann et al., 'Electric Vehicle Charging Session Data of Large Office Parking Lot', "
          "4TU.ResearchData, doi:10.4121/80ef3824-3f5d-4e45-8794-3b8791efbd13")
LICENCE = "CC BY-NC-SA 4.0 (non-commercial only)"
SHARED_IDS = {"EV107", "EV191", "EV132", "EV148", "EV342", "EV242", "EV130", "EV173", "EV131", "EV384",
              "EV318", "EV127", "EV257", "EV192", "EV129", "EV211", "EV323", "EV343", "EV161", "EV456"}
MIN_SESSIONS = 150
MAX_SESSIONS_PER_WEEKDAY = 2.0  # our cleaning rule, see build()
PLUG_KW = 11.0  # per plug when both plugs of a 22 kW charger are in use (dataset README)


def to_cet(s: pd.Series, zone: str) -> pd.Series:
    """Local wall-clock time with summer time -> fixed CET (UTC+1), naive."""
    local = s.dt.tz_localize(zone, ambiguous="NaT", nonexistent="shift_forward")
    out: pd.Series = (local.dt.tz_convert("UTC") + pd.Timedelta(hours=1)).dt.tz_localize(None)
    return out


def build() -> list[EVSessionSet]:
    path = download(URL, RAW / "utwente" / "sessions.csv")
    d = pd.read_csv(path, sep=";", parse_dates=["start_datetime", "end_datetime"], encoding="utf-8-sig")
    d = d[~d["EV_id_x"].isin(SHARED_IDS)].dropna(subset=["start_datetime", "end_datetime", "total_energy"])
    d["start"] = to_cet(d["start_datetime"], "Europe/Amsterdam")
    d["end"] = to_cet(d["end_datetime"], "Europe/Amsterdam")
    d = d.dropna(subset=["start", "end"]).sort_values("start")
    out = []
    for ev, g in d.groupby("EV_id_x"):
        if len(g) < MIN_SESSIONS:
            continue
        # Cleaning rule: an ID averaging more than 2 sessions per weekday is a shared or fleet card
        # (not in the README's list), not one commuter.
        weekdays = max(1, int(pd.bdate_range(g["start"].min().normalize(), g["start"].max().normalize()).size))
        if len(g) / weekdays > MAX_SESSIONS_PER_WEEKDAY:
            continue
        cap_values = g["capacity_kwh"].dropna()
        cap = float(cap_values.iloc[0]) if len(cap_values) else None
        rows = zip(g["start"].dt.to_pydatetime().tolist(), g["end"].dt.to_pydatetime().tolist(),
                   g["total_energy"].astype(float).tolist(), strict=True)
        sessions = tuple(EVSession(a, b, e, str(ev), None, cap) for a, b, e in rows if b > a)
        out.append(EVSessionSet(
            f"utwente/{ev}", f"Office car park Utrecht, driver {str(ev)[2:]} ({len(sessions)} visits)",
            SOURCE, sessions, sessions[0].arrival.replace(hour=0, minute=0, second=0), sessions[-1].departure,
            licence=LICENCE, resolution_minutes=1,
            note="Measured workplace sessions. NON-COMMERCIAL licence. Car power not recorded (chargers give "
                 f"up to {PLUG_KW:.0f} kW per plug when shared). Times converted to CET (UTC+1). Some sessions "
                 "from 2023 on were already smart-charged by the site's controller.",
        ))
    return out
