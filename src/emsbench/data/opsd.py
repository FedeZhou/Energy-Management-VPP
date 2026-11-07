"""Measured 15-minute loads from Open Power System Data, household_data 2020-04-15.

Sites in Konstanz, Germany. Meters record cumulative kWh; we difference them.
Consumption = grid import - grid export + PV (when PV is present). A site with
PV but no export meter cannot be balanced and is skipped. EV charging, when
sub-metered, is removed from the base load because EVs are modelled separately.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import Profile

URL = "https://data.open-power-system-data.org/household_data/2020-04-15/household_data_15min_singleindex.csv"
SOURCE = ("Open Power System Data, Household Data 2020-04-15 "
          "(https://doi.org/10.25832/household_data/2020-04-15), 15-minute file")
LICENCE = "CC BY 4.0 (Open Power System Data)"
CET = dt.timedelta(hours=1)  # we use fixed CET (UTC+1), no daylight saving, for all European data

LABELS = {
    "residential2": "German home 2, no solar",
    "residential3": "German home 3",
    "residential4": "German home 4, heat pump (EV removed)",
    "residential5": "German home 5, no solar",
    "residential6": "German home 6",
    "industrial1": "Craft business, Germany",
    "industrial2": "Research institute building, Germany",
    "industrial3": "Warehouse, Germany",
    "public1": "School 1, Germany",
    "public2": "School 2, Germany",
}


def build() -> list[Profile]:
    path = download(URL, RAW / "opsd" / "household_data_15min_singleindex.csv")
    df = pd.read_csv(path, parse_dates=["utc_timestamp"])
    out: list[Profile] = []
    for site, label in LABELS.items():
        cols = {c.split(f"{site}_", 1)[1]: c for c in df.columns if f"_{site}_" in c}
        pv_cols = [c for k, c in cols.items() if k.startswith("pv")]
        if "grid_import" not in cols or (pv_cols and "grid_export" not in cols):
            continue
        used = [cols["grid_import"], *pv_cols] + ([cols["grid_export"]] if "grid_export" in cols else [])
        if "ev" in cols:
            used.append(cols["ev"])
        block = df[["utc_timestamp", *used]].dropna()
        if len(block) < 96 * 60:  # need at least ~2 months
            continue
        energy = block[used].diff().iloc[1:].clip(lower=0)  # kWh per 15 min
        cons = energy[cols["grid_import"]].copy()
        if "grid_export" in cols:
            cons -= energy[cols["grid_export"]]
        for c in pv_cols:
            cons += energy[c]
        if "ev" in cols:
            cons -= energy[cols["ev"]]
        cons = cons.clip(lower=0)
        # Cleaning rule: a 15-min value above 10x the series' 99.9th percentile is a meter glitch
        # (e.g. a cumulative counter jump), not consumption. Replace it by interpolation.
        threshold = 10 * float(np.nanpercentile(cons, 99.9))
        glitches = int((cons > threshold).sum())
        cons = cons.mask(cons > threshold)
        t = block["utc_timestamp"].iloc[1:]
        # Reindex to a regular grid; short gaps (<= 2 h) are interpolated, longer gaps break the series.
        series = pd.Series(cons.to_numpy() * 4.0, index=t.dt.tz_convert(None) - pd.Timedelta(minutes=15))
        series = series[~series.index.duplicated()].asfreq("15min")
        filled = series.interpolate(limit=8)
        valid = filled.notna().to_numpy()
        # keep the longest uninterrupted stretch
        edges = np.flatnonzero(np.diff(np.r_[0, valid.astype(int), 0]))
        runs = list(zip(edges[::2], edges[1::2], strict=True))
        a, b = max(runs, key=lambda r: r[1] - r[0])
        part = filled.iloc[a:b]
        start = part.index[0].to_pydatetime() + CET
        kwh_year = part.mean() * 8760
        out.append(Profile(
            f"opsd/{site}", "load", f"{label} (15-min, {kwh_year:,.0f} kWh/yr)",
            f"{SOURCE}, columns {', '.join(c.split('_', 2)[2] for c in used)}",
            part.to_numpy(dtype=float), start, 900,
            note="Measured. Times in CET (UTC+1, no daylight saving). Gaps up to 2 h interpolated "
                 "(OPSD also interpolated some values; see its 'interpolated' column)."
                 + (f" {glitches} meter glitch value(s) removed." if glitches else ""),
            licence=LICENCE,
        ))
    return out
