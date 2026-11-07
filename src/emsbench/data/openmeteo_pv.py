"""15-minute solar generation per kWp, from Open-Meteo weather and pvlib's PVWatts model.

Weather: Open-Meteo Historical Forecast API, 15-minute variables (CC BY 4.0).
Model (pvlib, PVWatts v5 conventions):
- plane-of-array irradiance from GHI/DNI/DHI with the Hay-Davies transposition,
- cell temperature with the SAPM model, open rack glass/polymer parameters,
- DC power: pvwatts_dc with gamma_pdc = -0.0047 /°C ("standard" module),
- system losses 14.08 % (pvwatts_losses defaults), inverter: pvwatts with eta_inv_nom 0.96.
Defaults are those documented in NREL's PVWatts Version 5 Manual (Dobos, 2014, NREL/TP-6A20-62641)
and implemented in pvlib. Orientation choices (tilt, azimuth) are part of each profile's label.
"""

from __future__ import annotations

import datetime as dt
import json

import numpy as np
import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import FloatArray, Profile

API = ("https://historical-forecast-api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
       "&start_date={start}&end_date={end}&minutely_15=shortwave_radiation,direct_normal_irradiance,"
       "diffuse_radiation,temperature_2m,wind_speed_10m&wind_speed_unit=ms&timezone=UTC")
SITES = {"konstanz": ("Konstanz, Germany", 47.66, 9.18)}
ORIENTATIONS = {"south30": (30.0, 180.0, "south-facing, 30° tilt"), "eastwest15": (15.0, None, "east-west, 15° tilt")}
FIRST = dt.date(2025, 10, 1)
CET = dt.timedelta(hours=1)
GAMMA_PDC = -0.0047  # PVWatts v5 "standard" module temperature coefficient (Dobos 2014, Table 2)
ETA_INV_NOM = 0.96  # PVWatts v5 nominal inverter efficiency (Dobos 2014)


def per_kwp(weather: pd.DataFrame, lat: float, lon: float, tilt: float, azimuth: float) -> FloatArray:
    import pvlib

    times = pd.DatetimeIndex(weather.index).tz_localize("UTC") + pd.Timedelta(minutes=7.5)  # mid-interval
    sun = pvlib.solarposition.get_solarposition(times, lat, lon)
    dni_extra = pvlib.irradiance.get_extra_radiation(times)
    poa = pvlib.irradiance.get_total_irradiance(
        tilt, azimuth, sun["apparent_zenith"], sun["azimuth"],
        weather["dni"].to_numpy(), weather["ghi"].to_numpy(), weather["dhi"].to_numpy(),
        dni_extra=dni_extra, model="haydavies")
    params = pvlib.temperature.TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_polymer"]
    t_cell = pvlib.temperature.sapm_cell(poa["poa_global"], weather["temp"].to_numpy(),
                                         weather["wind"].to_numpy(), **params)
    pdc0 = 1.0  # kW DC per kWp
    dc = pvlib.pvsystem.pvwatts_dc(poa["poa_global"].fillna(0), t_cell, pdc0, GAMMA_PDC)
    dc = dc * (1 - pvlib.pvsystem.pvwatts_losses() / 100)
    ac = pvlib.inverter.pvwatts(dc, pdc0, eta_inv_nom=ETA_INV_NOM)
    return np.clip(np.nan_to_num(np.asarray(ac, dtype=float)), 0, None)


def _weather(lat: float, lon: float, last: dt.date, key: str) -> pd.DataFrame:
    frames = []
    d = FIRST
    while d <= last:
        b = min(dt.date(d.year + (d.month // 12), d.month % 12 + 1, 1) - dt.timedelta(days=1), last)
        complete = b < last.replace(day=1)
        path = download(API.format(lat=lat, lon=lon, start=d.isoformat(), end=b.isoformat()),
                        RAW / "openmeteo" / f"{key}_{d:%Y-%m}.json", force=not complete)
        m = json.loads(path.read_text(encoding="utf-8"))["minutely_15"]
        frames.append(pd.DataFrame({"ghi": m["shortwave_radiation"], "dni": m["direct_normal_irradiance"],
                                    "dhi": m["diffuse_radiation"], "temp": m["temperature_2m"],
                                    "wind": m["wind_speed_10m"]}, index=pd.to_datetime(m["time"])))
        d = b + dt.timedelta(days=1)
    w = pd.concat(frames)
    w = w[~w.index.duplicated()].asfreq("15min")
    return w.interpolate(limit=8).fillna({"ghi": 0, "dni": 0, "dhi": 0}).ffill().bfill()


def build(today: dt.date | None = None) -> list[Profile]:
    last = (today or dt.date.today()) - dt.timedelta(days=2)
    out = []
    for key, (place, lat, lon) in SITES.items():
        w = _weather(lat, lon, last, key)
        for okey, (tilt, az, desc) in ORIENTATIONS.items():
            if az is None:  # east-west: half the panels each way
                vals = 0.5 * (per_kwp(w, lat, lon, tilt, 90.0) + per_kwp(w, lat, lon, tilt, 270.0))
            else:
                vals = per_kwp(w, lat, lon, tilt, az)
            start = w.index[0].to_pydatetime() + CET
            yearly = vals.mean() * 8760
            out.append(Profile(
                f"om/{key}_{okey}", "pv", f"Solar {place}, {desc} (15-min, {yearly:,.0f} kWh/kWp/yr)",
                f"Open-Meteo Historical Forecast API ({lat}, {lon}) + pvlib PVWatts model", vals, start, 900,
                licence="Weather CC BY 4.0 (Open-Meteo); model pvlib (BSD-3)",
                note="Modelled from weather, not measured. PVWatts default losses (14%) and inverter "
                     "efficiency (96%). Times in CET (UTC+1, no daylight saving).",
            ))
    return out
