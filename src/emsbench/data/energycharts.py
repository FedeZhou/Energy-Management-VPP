"""Day-ahead prices from the Energy-Charts API (Fraunhofer ISE), several bidding zones.

Each API response states its own licence. We only keep zones whose data is CC BY
(Bundesnetzagentur | SMARD.de). Zones served under restrictive terms (e.g. Norway,
"private and internal use only") are rejected automatically.
The day-ahead market moved to 15-minute products on 1 Oct 2025, so we fetch from then.
Prices are wholesale spot prices: real tariffs add grid fees and taxes (price adder).
"""

from __future__ import annotations

import datetime as dt
import json

import numpy as np

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import Profile

API = "https://api.energy-charts.info/price?bzn={zone}&start={start}&end={end}"
FIRST = dt.date(2025, 10, 1)
CET = dt.timedelta(hours=1)
ZONES = {"DE-LU": ("ec/de_lu_da", "Germany"), "NL": ("ec/nl_da", "Netherlands"),
         "FR": ("ec/fr_da", "France"), "DK1": ("ec/dk1_da", "Denmark (west)")}


class LicenceRejected(Exception):
    pass


def _months(first: dt.date, last: dt.date) -> list[tuple[dt.date, dt.date]]:
    out, d = [], first.replace(day=1)
    while d <= last:
        nxt = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        out.append((d, min(nxt - dt.timedelta(days=1), last)))
        d = nxt
    return out


def _zone(zone: str, pid: str, country: str, last: dt.date) -> Profile:
    times: list[int] = []
    prices: list[float] = []
    licence = ""
    for a, b in _months(FIRST, last):
        complete = b < last.replace(day=1)
        path = download(API.format(zone=zone, start=a.isoformat(), end=b.isoformat()),
                        RAW / "energycharts" / f"{zone}_{a:%Y-%m}.json", force=not complete)
        data = json.loads(path.read_text(encoding="utf-8"))
        licence = data.get("license_info", "")
        if "CC BY" not in licence:
            raise LicenceRejected(f"{zone}: licence is not open ({licence[:80]}...)")
        times += data["unix_seconds"]
        prices += [np.nan if p is None else p for p in data["price"]]
    t = np.array(times)
    order = np.argsort(t)
    t, p = t[order], np.array(prices, dtype=float)[order]
    keep = np.r_[True, np.diff(t) > 0]
    t, p = t[keep], p[keep]
    step = 900
    t15 = t[t >= int(dt.datetime(2025, 10, 1, tzinfo=dt.UTC).timestamp())]
    grid = np.arange(t15[0], t[-1] + step, step)
    vals = np.interp(grid, t[~np.isnan(p)], p[~np.isnan(p)]) / 1000.0  # EUR/MWh -> EUR/kWh
    start = dt.datetime.fromtimestamp(int(grid[0]), dt.UTC).replace(tzinfo=None) + CET
    return Profile(
        pid, "price", f"{country} day-ahead spot price (15-min)",
        f"Energy-Charts API (api.energy-charts.info), bidding zone {zone}; data Bundesnetzagentur | SMARD.de",
        vals, start, step, currency="EUR", licence=licence,
        note="Wholesale spot price, can be negative. Real tariffs add grid fees and taxes: use the price "
             "adder (Eurostat suggestions in the tariff settings). Times in CET (UTC+1, no daylight saving).",
    )


def build(today: dt.date | None = None) -> list[Profile]:
    last = (today or dt.date.today()) - dt.timedelta(days=1)
    out = []
    for zone, (pid, country) in ZONES.items():
        try:
            out.append(_zone(zone, pid, country, last))
        except LicenceRejected:
            continue  # recorded in the registry as "checked, not used"
    if not out:
        raise RuntimeError("no price zone could be loaded")
    return out
