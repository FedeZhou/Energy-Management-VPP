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

from emsbench.data.cache import PROCESSED, RAW, download
from emsbench.sim.profiles import FloatArray, Profile

API = ("https://historical-forecast-api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
       "&start_date={start}&end_date={end}&minutely_15=shortwave_radiation,direct_normal_irradiance,"
       "diffuse_radiation,temperature_2m,wind_speed_10m&wind_speed_unit=ms&timezone=UTC")
# name, lat, lon, UTC offset of the profile's clock (standard time, no daylight saving)
SITES = {
    "konstanz": ("Konstanz, Germany", 47.66, 9.18, 1),
    "amsterdam": ("Amsterdam, Netherlands", 52.37, 4.90, 1),
    "paris": ("Paris, France", 48.86, 2.35, 1),
    "aarhus": ("Aarhus, Denmark", 56.16, 10.20, 1),
    "losangeles": ("Los Angeles, USA", 34.05, -118.24, -8),
}
PVGIS = ("https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat={lat}&lon={lon}&peakpower=1&loss=14"
         "&angle={angle}&aspect={aspect}&outputformat=json")
VALIDATIONS_FILE = "pv_validations.json"
ORIENTATIONS = {"south30": (30.0, 180.0, "south-facing, 30° tilt"), "eastwest15": (15.0, None, "east-west, 15° tilt")}
FIRST = dt.date(2025, 10, 1)
GAMMA_PDC = -0.0047  # PVWatts v5 "standard" module temperature coefficient (Dobos 2014, Table 2)
ETA_INV_NOM = 0.96  # PVWatts v5 nominal inverter efficiency (Dobos 2014)


def per_kwp(weather: pd.DataFrame, lat: float, lon: float, tilt: float, azimuth: float,
            mid_minutes: float = 7.5) -> FloatArray:
    """AC kW per kWp. `mid_minutes`: offset from each time label to the middle of its interval (sun position)."""
    import pvlib

    times = pd.DatetimeIndex(weather.index).tz_localize("UTC") + pd.Timedelta(minutes=mid_minutes)
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


def pvgis_yearly(lat: float, lon: float, tilt: float, azimuth: float | None, key: str) -> tuple[float, float]:
    """Long-term mean yearly yield (kWh/kWp) and inter-annual SD from PVGIS (EU JRC), 14% losses."""
    aspects = [-90.0, 90.0] if azimuth is None else [azimuth - 180.0]  # PVGIS: 0 = south, 90 = west
    ys, sds = [], []
    for asp in aspects:
        path = download(PVGIS.format(lat=lat, lon=lon, angle=tilt, aspect=asp),
                        RAW / "pvgis" / f"{key}_{tilt:g}_{asp:g}.json")
        fixed = json.loads(path.read_text(encoding="utf-8"))["outputs"]["totals"]["fixed"]
        ys.append(float(fixed["E_y"]))
        sds.append(float(fixed.get("SD_y", 0.0)))
    return float(np.mean(ys)), float(np.mean(sds))


def build(today: dt.date | None = None) -> list[Profile]:
    last = (today or dt.date.today()) - dt.timedelta(days=2)
    out, checks = [], []
    for key, (place, lat, lon, utc) in SITES.items():
        w = _weather(lat, lon, last, key)
        for okey, (tilt, az, desc) in ORIENTATIONS.items():
            if az is None:  # east-west: half the panels each way
                vals = 0.5 * (per_kwp(w, lat, lon, tilt, 90.0) + per_kwp(w, lat, lon, tilt, 270.0))
            else:
                vals = per_kwp(w, lat, lon, tilt, az)
            start = w.index[0].to_pydatetime() + dt.timedelta(hours=utc)
            last12 = float(vals[-365 * 96:].sum() / 4) if vals.size >= 365 * 96 else float(vals.mean() * 8760)
            check = ""
            try:
                ref, sd = pvgis_yearly(lat, lon, tilt, az, key)
                diff = (last12 / ref - 1) * 100
                check = (f" Check: last 12 months {last12:,.0f} kWh/kWp vs PVGIS long-term {ref:,.0f} ± {sd:,.0f} "
                         f"({diff:+.1f}%).")
                checks.append({"profile": f"om/{key}_{okey}", "place": place, "orientation": desc,
                               "ours_last_12_months": round(last12), "pvgis_mean": round(ref), "pvgis_sd": round(sd),
                               "difference_pct": round(diff, 1), "within_2_sd": abs(last12 - ref) <= 2 * max(sd, 1)})
            except Exception as e:  # PVGIS down: keep the profile, say the check is missing
                check = f" PVGIS check unavailable ({type(e).__name__})."
            tz = "CET (UTC+1)" if utc == 1 else f"UTC{utc:+d}"
            out.append(Profile(
                f"om/{key}_{okey}", "pv", f"Solar {place}, {desc} (15-min, {last12:,.0f} kWh/kWp/yr)",
                f"Open-Meteo Historical Forecast API ({lat}, {lon}) + pvlib PVWatts model", vals, start, 900,
                licence="Weather CC BY 4.0 (Open-Meteo); model pvlib (BSD-3)",
                note="Modelled from weather, not measured. PVWatts default losses (14%) and inverter "
                     f"efficiency (96%). Times in {tz}, no daylight saving." + check,
            ))
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / VALIDATIONS_FILE).write_text(json.dumps(checks, indent=1), encoding="utf-8")
    return out


def load_validations() -> list[dict[str, object]]:
    path = PROCESSED / VALIDATIONS_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
