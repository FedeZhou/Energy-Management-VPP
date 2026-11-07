"""German/Luxembourg day-ahead prices from the Energy-Charts API (Fraunhofer ISE).

Data: Bundesnetzagentur | SMARD.de, CC BY 4.0 (stated in every API response).
The day-ahead market moved to 15-minute products on 1 Oct 2025, so we fetch from then.
Prices are wholesale spot prices: a real dynamic tariff adds grid fees and taxes
(set those as the tariff's price adder).
"""

from __future__ import annotations

import datetime as dt
import json

import numpy as np

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import Profile

API = "https://api.energy-charts.info/price?bzn=DE-LU&start={start}&end={end}"
FIRST = dt.date(2025, 10, 1)
CET = dt.timedelta(hours=1)


def _months(first: dt.date, last: dt.date) -> list[tuple[dt.date, dt.date]]:
    out, d = [], first.replace(day=1)
    while d <= last:
        nxt = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        out.append((d, min(nxt - dt.timedelta(days=1), last)))
        d = nxt
    return out


def build(today: dt.date | None = None) -> list[Profile]:
    last = (today or dt.date.today()) - dt.timedelta(days=1)
    times: list[int] = []
    prices: list[float] = []
    licence = ""
    for a, b in _months(FIRST, last):
        complete = b < last.replace(day=1)
        path = download(API.format(start=a.isoformat(), end=b.isoformat()),
                        RAW / "energycharts" / f"DE-LU_{a:%Y-%m}.json", force=not complete)
        data = json.loads(path.read_text(encoding="utf-8"))
        licence = data.get("license_info", licence)
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
    return [Profile(
        "ec/de_lu_da", "price", "Germany day-ahead spot price (15-min)",
        "Energy-Charts API (api.energy-charts.info), bidding zone DE-LU; data Bundesnetzagentur | SMARD.de",
        vals, start, step, currency="EUR", licence=licence or "CC BY 4.0 (Bundesnetzagentur | SMARD.de)",
        note="Wholesale spot price, can be negative. Real tariffs add grid fees and taxes: use the price "
             "adder. Times in CET (UTC+1, no daylight saving).",
    )]
