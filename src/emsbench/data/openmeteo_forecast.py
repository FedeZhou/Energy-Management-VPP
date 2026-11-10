"""Day-ahead solar forecasts: the weather a real controller was told about a day earlier.

Weather: Open-Meteo Previous Runs API (https://open-meteo.com/en/docs/previous-runs-api, CC BY 4.0). Variables
ending in `_previous_day1` hold "the value predicted 24 hours before valid time". Archived from January 2024
for most models. Hourly only; radiation is "averaged over the past hour".

Each forecast goes through exactly the same solar model as the actual profile (`openmeteo_pv.per_kwp`) and
is aligned step by step with it (same start, same length), so the only difference is the weather forecast
error. An hourly value labelled h covers (h - 1 h, h]; it is given to the four 15-minute steps inside that hour.
Hours the archive does not have are filled with the actual solar 24 hours earlier (a persistence forecast),
and the note says how many.
"""

from __future__ import annotations

import datetime as dt
import json

import numpy as np
import pandas as pd

from emsbench.data import openmeteo_pv as pv
from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import FloatArray, Profile

API = ("https://previous-runs-api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
       "&start_date={start}&end_date={end}&hourly=shortwave_radiation_previous_day1,"
       "direct_normal_irradiance_previous_day1,diffuse_radiation_previous_day1,temperature_2m_previous_day1,"
       "wind_speed_10m_previous_day1&wind_speed_unit=ms&timezone=UTC")
COLUMNS = {"ghi": "shortwave_radiation_previous_day1", "dni": "direct_normal_irradiance_previous_day1",
           "dhi": "diffuse_radiation_previous_day1", "temp": "temperature_2m_previous_day1",
           "wind": "wind_speed_10m_previous_day1"}


def _forecast_weather(lat: float, lon: float, last: dt.date, key: str) -> pd.DataFrame:
    frames = []
    d = pv.FIRST
    while d <= last:
        b = min(dt.date(d.year + (d.month // 12), d.month % 12 + 1, 1) - dt.timedelta(days=1), last)
        complete = b < last.replace(day=1)
        path = download(API.format(lat=lat, lon=lon, start=d.isoformat(), end=b.isoformat()),
                        RAW / "openmeteo_prev" / f"{key}_{d:%Y-%m}.json", force=not complete)
        h = json.loads(path.read_text(encoding="utf-8"))["hourly"]
        frames.append(pd.DataFrame({k: h[v] for k, v in COLUMNS.items()}, index=pd.to_datetime(h["time"]),
                                   dtype=float))
        d = b + dt.timedelta(days=1)
    w = pd.concat(frames)
    return w[~w.index.duplicated()].asfreq("1h")


def _model(w: pd.DataFrame, lat: float, lon: float, tilt: float, az: float | None, mid: float) -> FloatArray:
    """Solar output per kWp for weather `w` (rows with gaps give NaN); east-west = half each way."""
    ok = w.dropna()
    if az is None:
        v = 0.5 * (pv.per_kwp(ok, lat, lon, tilt, 90.0, mid) + pv.per_kwp(ok, lat, lon, tilt, 270.0, mid))
    else:
        v = pv.per_kwp(ok, lat, lon, tilt, az, mid)
    out: FloatArray = pd.Series(v, index=ok.index).reindex(w.index).to_numpy(dtype=float)
    return out


def build(today: dt.date | None = None) -> list[Profile]:
    last = (today or dt.date.today()) - dt.timedelta(days=2)
    out = []
    for key, (place, lat, lon, utc) in pv.SITES.items():
        actual_w = pv._weather(lat, lon, last, key)  # 15-minute index of the actual profile
        fc_w = _forecast_weather(lat, lon, last, key)
        missing_hours = fc_w[list(COLUMNS)].isna().any(axis=1)
        fc_w = fc_w.interpolate(limit=2)  # short gaps only
        # a 15-minute label u lies in the hour (h - 1 h, h] with h = ceil(u)
        hours = pd.DatetimeIndex(actual_w.index).ceil("h")
        for okey, (tilt, az, desc) in pv.ORIENTATIONS.items():
            actual = _model(actual_w, lat, lon, tilt, az, 7.5)  # exactly as openmeteo_pv builds the actual profile
            hourly = pd.Series(_model(fc_w, lat, lon, tilt, az, -30.0), index=fc_w.index)
            fc = hourly.reindex(hours).to_numpy()
            gaps = np.isnan(fc)
            day = 96
            fallback = np.concatenate([actual[:day], actual[:-day]])  # actual solar 24 h earlier
            fc = np.where(gaps, fallback, fc)
            start = actual_w.index[0].to_pydatetime() + dt.timedelta(hours=utc)
            tz = "CET (UTC+1)" if utc == 1 else f"UTC{utc:+d}"
            n_missing = int(missing_hours.sum())
            out.append(Profile(
                f"om/{key}_{okey}@dayahead", "pvforecast",
                f"Day-ahead solar forecast {place}, {desc}",
                f"Open-Meteo Previous Runs API ({lat}, {lon}), forecast made 24 h ahead, + pvlib PVWatts model",
                np.clip(np.nan_to_num(fc), 0, None), start, 900,
                licence="Weather CC BY 4.0 (Open-Meteo); model pvlib (BSD-3)",
                note=f"What a controller would have been told a day ahead, for om/{key}_{okey}. Hourly forecast, "
                     f"repeated over each hour's four 15-minute steps. {n_missing} archive hours missing, "
                     f"filled with the actual solar 24 h earlier. Times in {tz}, no daylight saving.",
            ))
    return out
