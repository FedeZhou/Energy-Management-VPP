"""Fleet depot EV charging sessions, Leeds City Council (Data Mill North).

Leeds City Council, "EV Fleet Chargepoint use", file "Depot Usage 2023 May to November",
https://datamillnorth.org/dataset/e7ljx/ev-fleet-chargepoint-use. Licence: Open Government Licence v3.0
(dataset page: "Open Government Licence v3"), which allows commercial use with attribution. Attribution
statement required by the page: "[title], (c) Leeds City Council, [year], [link]. This information is licensed
under the terms of the Open Government Licence."

What the file holds (measured, one row per session): charge point ID, plug-in and unplug date/time, charge
start/end (identical to plug-in/unplug in every row, so they add nothing), energy delivered (kWh) and the charger
location. The council's own fleet charges at its depots and offices; there are no vehicle IDs, no charger ratings
and no building load.

Processing (our rules, see docs/data-sources.md):
- Sessions with no energy or a non-positive duration are dropped.
- No charge point ever has more than two cars plugged in at once, so each is read as a two-socket post: every
  session goes to the first socket that is free (A, then B). The engine models one car per charger, so each socket
  becomes its own session set.
- Despite the file name, sessions run from 23 Apr to 2 Oct 2023. Coverage is set to whole calendar months
  (1 May - 1 Oct 2023), so runs of up to 21 weeks fit; a run uses the same season and weekday of 2023.
- Times are UK local time (BST all summer = UTC+1), converted to fixed CET (UTC+1): no change in practice.
"""

from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.data.utwente import to_cet
from emsbench.sim.profiles import EVSession, EVSessionSet

URL = "https://datamillnorth.org/download/e7ljx/0bp/Depot%20Usage%202023%20May%20to%20November%20.csv"
PAGE = "https://datamillnorth.org/dataset/e7ljx/ev-fleet-chargepoint-use"
SOURCE = f"Leeds City Council, 'EV Fleet Chargepoint use', Depot Usage 2023, Data Mill North, {PAGE}"
LICENCE = "OGL v3.0 (Open Government Licence)"
SOCKETS = "abcdefgh"
# The highest average power of any session at the busiest site (Knowsthorpe HQ) is about 7.2 kW (our analysis of
# this file, 99th percentile per charge point 6.3-7.2 kW), consistent with 7.4 kW AC sockets (230 V x 32 A). The
# file does not state charger ratings.
OBSERVED_MAX_KW = 7.2
_LOCATION = re.compile(r"^(?:LCC )?(?P<site>.*?)(?:, Leeds)?(?: (?P<n>\d+))?$")


def _site_and_number(location: str) -> tuple[str, str | None]:
    m = _LOCATION.match(location.strip())
    if m is None:  # pragma: no cover - the pattern matches any string
        return location, None
    return m.group("site"), m.group("n")


def _month_start_after(t: pd.Timestamp) -> dt.datetime:
    d = t.to_pydatetime().replace(hour=0, minute=0, second=0, microsecond=0)
    if d.day == 1 and t == pd.Timestamp(d):
        return d
    return (d.replace(day=1) + dt.timedelta(days=32)).replace(day=1)


def _month_start_before(t: pd.Timestamp) -> dt.datetime:
    return t.to_pydatetime().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def assign_sockets(sessions: list[EVSession]) -> list[list[EVSession]]:
    """Split one charge point's sessions over as few sockets as needed: each goes to the first free socket."""
    sockets: list[list[EVSession]] = []
    for s in sorted(sessions, key=lambda x: x.arrival):
        for sock in sockets:
            if sock[-1].departure <= s.arrival:
                sock.append(s)
                break
        else:
            sockets.append([s])
    return sockets


def parse(path: Path) -> list[EVSessionSet]:
    d = pd.read_csv(path, encoding="utf-8-sig", dtype=str)
    d["start"] = to_cet(pd.to_datetime(d["Plug in Date"] + " " + d["Plug in Time"], dayfirst=True),
                        "Europe/London")
    d["end"] = to_cet(pd.to_datetime(d["Unplug Date"] + " " + d["Unplug Time"], dayfirst=True), "Europe/London")
    d["kwh"] = pd.to_numeric(d["Total kWh"], errors="coerce")
    first = _month_start_after(d["start"].min())  # coverage over all rows, before cleaning
    last = _month_start_before(d["end"].max())
    d = d.dropna(subset=["start", "end", "kwh"])
    d = d[(d["kwh"] > 0) & (d["end"] > d["start"])]
    out = []
    for (cp, location), g in d.groupby(["Chargepoint ID", "New List.Charger Location"], sort=True):
        site, number = _site_and_number(str(location))
        rows = zip([t.to_pydatetime() for t in g["start"]], [t.to_pydatetime() for t in g["end"]],
                   g["kwh"].astype(float).tolist(), strict=True)
        sessions = [EVSession(a, b, e, "fleet vehicle (not identified)") for a, b, e in rows]
        sockets = assign_sockets(sessions)
        charger = f"charger {number}" if number else "charger"
        for letter, sock in zip(SOCKETS, sockets, strict=False):
            out.append(EVSessionSet(
                f"leeds/{cp}{letter}",
                f"Leeds council fleet, {site}, {charger} socket {letter.upper()} ({len(sock)} visits)",
                SOURCE, tuple(sock), first, last, licence=LICENCE, resolution_minutes=1,
                note="Measured council fleet sessions (Leeds City Council, OGL v3.0). Two cars at most per charge "
                     "point, so each is split into two sockets (first free socket). Charger rating not recorded: "
                     f"the highest session average at the main depot is about {OBSERVED_MAX_KW} kW. Times "
                     "converted from UK summer time to CET (same clock). Data covers May-Sep 2023 only.",
            ))
    return out


def build() -> list[EVSessionSet]:
    return parse(download(URL, RAW / "leeds" / "depot_usage_2023.csv"))
