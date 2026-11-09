"""Measured data center load: NREL/NLR ESIF high-performance computing data center, Golden, Colorado.

Dataset: "NLR HPC Facility Power Usage Effectiveness (PUE) Data", Clark & Strelka, National
Laboratory of the Rockies (formerly NREL), 2026, CC BY 4.0. https://data.openei.org/submissions/8616
Fields (README): it_power_kw (IT equipment on the data center floor), cooling_kw, hvac_kw, pump_kw,
plug_and_light_kw; a tower filter pump runs constantly and "2.67 kilowatts are attributed to this
pump" that are not in pump_kw. Raw samples are irregular (about one per minute); we average them to
15 minutes.

This is a warm-water liquid-cooled supercomputer centre with heat reuse: its measured PUE is about
1.04-1.06, far better than the 2025 industry average of 1.54 (Uptime Institute Global Data Center
Survey 2025, Fig. 2). The IT profile is representative of an HPC/AI load; the facility profile is a
best-case cooling overhead, not a typical one.
"""

from __future__ import annotations

import datetime as dt
import zipfile

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import Profile

URL = "https://data.nlr.gov/system/files/300/1757105566-esif.influx.buildingData.PUE.combined.csv.zip"
MEMBER = "esif.influx.buildingData.PUE.combined.csv"
SOURCE = ("NLR HPC Facility Power Usage Effectiveness (PUE) Data, Clark & Strelka, National Laboratory of the "
          "Rockies (NREL), 2026 (https://data.openei.org/submissions/8616)")
LICENCE = "CC BY 4.0 (National Laboratory of the Rockies)"
COMPONENTS = ["it_power_kw", "cooling_kw", "hvac_kw", "pump_kw", "plug_and_light_kw"]
FILTER_PUMP_KW = 2.67  # README: constant tower filter pump load not included in pump_kw
MST = dt.timedelta(hours=-7)  # fixed Mountain Standard Time (UTC-7), no daylight saving
FIRST = pd.Timestamp("2024-01-01")  # the current system (Kestrel) era; earlier years are a smaller machine
MIN_DAYS = 90


def parse_timestamps(ts: pd.Series) -> pd.DatetimeIndex:
    """'Mon Nov 09 2015 20:00:01 GMT-0700 (Mountain Standard Time)' -> naive fixed-MST times."""
    core = ts.str.slice(4, 33).str.replace(" GMT", " ", regex=False)  # 'Nov 09 2015 20:00:01 -0700'
    utc = pd.to_datetime(core, format="%b %d %Y %H:%M:%S %z", utc=True)
    return pd.DatetimeIndex(utc.dt.tz_localize(None) + MST)


def to_15min(path: str) -> pd.DataFrame:
    parts = []
    with zipfile.ZipFile(path) as z, z.open(MEMBER) as f:
        for chunk in pd.read_csv(f, usecols=["ts", *COMPONENTS], chunksize=500_000):
            idx = parse_timestamps(chunk["ts"])
            parts.append(chunk[COMPONENTS].set_axis(idx).resample("15min").mean())
    q = pd.concat(parts)
    return q.groupby(level=0).mean().asfreq("15min")


def runs(valid: NDArray[np.bool_]) -> list[tuple[int, int]]:
    """(start, end) index pairs of uninterrupted True stretches."""
    edges = np.flatnonzero(np.diff(np.r_[0, valid.astype(int), 0]))
    return list(zip(edges[::2].tolist(), edges[1::2].tolist(), strict=True))


def build() -> list[Profile]:
    path = download(URL, RAW / "esif" / "esif_pue_combined.csv.zip", timeout=600)
    q = to_15min(str(path)).clip(lower=0)  # a few small negative meter readings
    q = q.interpolate(limit=8, limit_area="inside")  # gaps up to 2 h, as for the other measured loads
    q = q[q.index >= FIRST]
    facility = q[COMPONENTS].sum(axis=1, min_count=len(COMPONENTS)) + FILTER_PUMP_KW
    out: list[Profile] = []
    for a, b in runs(facility.notna().to_numpy()):
        if (b - a) < MIN_DAYS * 96:
            continue
        idx = q.index[a:b]
        it, fac = q["it_power_kw"].iloc[a:b], facility.iloc[a:b]
        period = f"{idx[0]:%b %Y}-{idx[-1]:%b %Y}"
        tag = f"{idx[0]:%Y%m}"
        note = ("Measured. Times in MST (UTC-7, no daylight saving). Raw samples averaged to 15 min; gaps up to "
                "2 h interpolated. HPC load: flat over the day but with large job-driven jumps.")
        out.append(Profile(
            f"esif/it_{tag}", "load", f"Data center IT load, HPC, Colorado ({period}, avg {it.mean() / 1000:.1f} MW)",
            f"{SOURCE}, column it_power_kw", it.to_numpy(dtype=float), idx[0].to_pydatetime(), 900,
            note=note + " IT equipment only: add cooling separately (e.g. IT x (PUE - 1)).", licence=LICENCE,
        ))
        pue = float(fac.sum() / it.sum())
        out.append(Profile(
            f"esif/facility_{tag}", "load",
            f"Data center whole facility, liquid-cooled HPC, Colorado ({period}, PUE {pue:.2f})",
            f"{SOURCE}, it + cooling + hvac + pump + plug_and_light + {FILTER_PUMP_KW} kW filter pump",
            fac.to_numpy(dtype=float), idx[0].to_pydatetime(), 900,
            note=note + f" Best-in-class cooling (PUE {pue:.2f}); the 2025 industry average is 1.54.", licence=LICENCE,
        ))
    return out
