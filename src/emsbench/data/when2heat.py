"""Heat demand and heat pump COP from the When2Heat dataset (Open Power System Data, version 2023-07-27).

Ruhnau, Hirth, Praktiknjo (2019), "Time series of heat demand and heat pump efficiency for energy system
modeling", Scientific Data 6:189, https://doi.org/10.1038/s41597-019-0199-y. Data package:
https://data.open-power-system-data.org/when2heat/2023-07-27/ (CC BY 4.0). Hourly, 2008-2022, national
synthetic profiles built from gas standard load profiles, reanalysis weather and population data.

What we build per country (DE, NL, FR, DK, matching the price zones we use):
- kind "heat", id ``w2h/<cc>_<sfh|mfh>``: heat demand for space heating plus hot water, in kW per kWh of
  annual heat demand (so a house needing 15,000 kWh a year is this profile x 15,000). Space and water are
  mixed in the ratio of the dataset's national totals for that building type (our computation).
- kind "cop", id ``w2h/<cc>_<ashp|gshp>_<radiator|floor>``: effective COP for the same single-family
  space + water mix, = total heat / (space heat / COP_space + water heat / COP_water) each hour (our
  computation from the dataset's COP and demand columns). Electricity = heat / COP.

Times: the file's UTC timestamps shifted to fixed CET (UTC+1), like all European data here.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import FloatArray, Profile

URL = "https://data.open-power-system-data.org/when2heat/2023-07-27/when2heat.csv"
SOURCE = ("When2Heat, Open Power System Data 2023-07-27 (Ruhnau, Hirth, Praktiknjo 2019, Scientific Data 6:189, "
          "https://doi.org/10.1038/s41597-019-0199-y)")
LICENCE = "CC BY 4.0 (Open Power System Data, When2Heat)"
CET = pd.Timedelta(hours=1)
COUNTRIES = {"DE": "Germany", "NL": "Netherlands", "FR": "France", "DK": "Denmark"}
BUILDINGS = {"SFH": "single-family house", "MFH": "multi-family house"}
PUMPS = {"ASHP": "air-source", "GSHP": "ground-source"}
SINKS = {"radiator": "radiators", "floor": "floor heating"}
NOTE = ("Synthetic national profile (gas standard load profiles + weather), not a measured house. Hourly; finer "
        "steps repeat each hour. One missing hour per year in the source file is filled by interpolation.")


def _columns() -> list[str]:
    cols = ["utc_timestamp"]
    for cc in COUNTRIES:
        for b in BUILDINGS:
            cols += [f"{cc}_heat_profile_space_{b}", f"{cc}_heat_profile_water_{b}",
                     f"{cc}_heat_demand_space_{b}", f"{cc}_heat_demand_water_{b}"]
        for p in PUMPS:
            cols += [f"{cc}_COP_{p}_{s}" for s in SINKS] + [f"{cc}_COP_{p}_water"]
    return cols


def heat_shape(space_profile: FloatArray, water_profile: FloatArray, space_total: float,
               water_total: float, hours_per_year: float) -> FloatArray:
    """Mix normalized space and water profiles (MW/TWh) into kW per kWh of annual demand.

    A normalized profile in MW/TWh integrates to 1e6 MWh per TWh over one year, i.e. it is the hourly
    share of the year's demand times 1e6. Dividing by 1e6 gives kWh per hour (= kW) per kWh per year.
    """
    w_space = space_total / (space_total + water_total)
    shape = (w_space * space_profile + (1 - w_space) * water_profile) / 1e6
    # Guard: rescale so each full year sums to 1 kWh per kWh per year (hourly data).
    total_years = shape.size / hours_per_year
    return shape * (total_years / shape.sum()) if shape.sum() > 0 else shape


def effective_cop(space_kw: FloatArray, water_kw: FloatArray, cop_space: FloatArray,
                  cop_water: FloatArray) -> FloatArray:
    """COP for a mix of space and water heat: total heat / total electricity."""
    elec = space_kw / cop_space + water_kw / cop_water
    total = space_kw + water_kw
    out = np.divide(total, elec, out=np.full_like(total, np.nan), where=elec > 0)
    # Hours without demand: use the space-heating COP (any value works, no energy flows).
    return np.where(np.isfinite(out), out, cop_space)


def build() -> list[Profile]:
    path = download(URL, RAW / "when2heat" / "when2heat.csv", timeout=600)
    # The file is European-formatted: ';' separators and decimal commas.
    header = pd.read_csv(path, nrows=0, sep=";").columns
    cols = [c for c in _columns() if c in header]
    full = pd.read_csv(path, usecols=cols, sep=";", decimal=",", parse_dates=["utc_timestamp"])
    # The file skips one hour per year (15 in 2008-2022): put it on a complete hourly grid and fill those
    # single hours by linear interpolation.
    grid = pd.date_range(full["utc_timestamp"].iloc[0], full["utc_timestamp"].iloc[-1], freq="h")
    full = full.set_index("utc_timestamp").reindex(grid)
    start = (grid[0].tz_localize(None) + CET).to_pydatetime()
    hours_per_year = 8766.0  # average incl. leap years; the rescale only fixes rounding
    out: list[Profile] = []
    for cc, country in COUNTRIES.items():
        mix: dict[str, float] = {}  # building type -> space share of space + water heat
        for b, bname in BUILDINGS.items():
            prof = [f"{cc}_heat_profile_space_{b}", f"{cc}_heat_profile_water_{b}"]
            dem = [f"{cc}_heat_demand_space_{b}", f"{cc}_heat_demand_water_{b}"]
            if not all(c in full for c in prof + dem):
                continue
            # Absolute demand exists only for some years (2008-2015 for DE in this version): use it just for
            # the space / water split; the hourly shape comes from the normalized profiles (all years).
            space_total, water_total = float(full[dem[0]].sum()), float(full[dem[1]].sum())
            mix[b] = space_total / (space_total + water_total)
            sp = full[prof[0]].interpolate(limit=2).to_numpy(float)
            wa = full[prof[1]].interpolate(limit=2).to_numpy(float)
            shape = heat_shape(sp, wa, space_total, water_total, hours_per_year)
            out.append(Profile(f"w2h/{cc.lower()}_{b.lower()}", "heat",
                               f"{country}, {bname}: space heating + hot water ({100 * (1 - mix[b]):.0f}% hot water)",
                               SOURCE, shape, start, 3600, note=NOTE, licence=LICENCE))
        if "SFH" not in mix:
            continue
        # Hourly single-family space and water heat (relative units are enough for a COP).
        space = mix["SFH"] * full[f"{cc}_heat_profile_space_SFH"].interpolate(limit=2).to_numpy(float)
        water = (1 - mix["SFH"]) * full[f"{cc}_heat_profile_water_SFH"].interpolate(limit=2).to_numpy(float)
        for p, pname in PUMPS.items():
            water_col = f"{cc}_COP_{p}_water"
            for s, sname in SINKS.items():
                col = f"{cc}_COP_{p}_{s}"
                if col not in full or water_col not in full:
                    continue
                cop = effective_cop(space, water, full[col].interpolate(limit=2).to_numpy(float),
                                    full[water_col].interpolate(limit=2).to_numpy(float))
                out.append(Profile(f"w2h/{cc.lower()}_{p.lower()}_{s}", "cop",
                                   f"{country}, {pname} heat pump with {sname} (COP for heating + hot water)",
                                   SOURCE, cop, start, 3600, note=NOTE, licence=LICENCE))
    return out


START_YEAR, END_YEAR = 2008, 2022  # documented coverage (for tests and the registry)
