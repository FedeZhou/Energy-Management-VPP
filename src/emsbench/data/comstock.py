"""Commercial building load profiles from NREL ComStock (CC BY 4.0).

Release: 2025/comstock_amy2018_release_1, timeseries aggregates by state (upgrade 0 = baseline
buildings), California. Each file sums 15-minute electricity use over all modelled buildings of
one type in the state and gives `models_used` and `floor_area_represented` (ft²). We divide by
floor area to get kW per 1,000 m², so the app scales a profile to any building size.

ComStock is *modelled* (EnergyPlus models calibrated against measured data; methodology report
doi:10.2172/1854582). An average over thousands of buildings is smoother than any one real building.
Timestamps are 15-minute period-ending in EST; we shift to Pacific standard time (UTC-8).
Attribution: "Data includes information from the ComStock dataset developed by the National
Renewable Energy Laboratory (NREL) with funding from the U.S. Department of Energy (DOE)."
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

from emsbench.data.cache import RAW, download
from emsbench.sim.profiles import Profile

BASE = ("https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/"
        "2025/comstock_amy2018_release_1/timeseries_aggregates/by_state/upgrade=0/state={state}/up0-{st}-{kind}.csv")
SOURCE = ("NREL ComStock 2025 Release 1 (AMY 2018), doi:10.25984/1876417, "
          "timeseries_aggregates/by_state/upgrade=0/state={state}/up0-{st}-{kind}.csv")
LICENCE = "CC BY 4.0 (NREL ComStock)"
FT2_TO_M2 = 0.09290304  # exact, international foot
TYPES = {
    "smalloffice": "Small office",
    "mediumoffice": "Medium office",
    "retailstandalone": "Stand-alone shop",
    "warehouse": "Warehouse",
    "primaryschool": "Primary school",
    "hospital": "Hospital",
}
STATES = {"CA": ("California", -3)}  # hours to shift from EST to local standard time


def build() -> list[Profile]:
    out = []
    for state, (state_name, shift_h) in STATES.items():
        for kind, label in TYPES.items():
            url = BASE.format(state=state, st=state.lower(), kind=kind)
            path = download(url, RAW / "comstock" / f"up0-{state.lower()}-{kind}.csv")
            cols = ["timestamp", "models_used", "floor_area_represented",
                    "out.electricity.total.energy_consumption.kwh"]
            df = pd.read_csv(path, usecols=cols, parse_dates=["timestamp"])
            area_m2 = float(df["floor_area_represented"].iloc[0]) * FT2_TO_M2
            models = int(df["models_used"].iloc[0])
            kw_per_1000m2 = df["out.electricity.total.energy_consumption.kwh"].to_numpy(float) * 4 / area_m2 * 1000
            first_end = df["timestamp"].iloc[0].to_pydatetime()
            start = first_end - dt.timedelta(minutes=15) + dt.timedelta(hours=shift_h)
            yearly = kw_per_1000m2.mean() * 8760 / 1000  # MWh per 1,000 m2 per year
            out.append(Profile(
                f"comstock/{state.lower()}_{kind}", "load",
                f"{label}, {state_name} (15-min, per 1,000 m², {yearly:,.0f} MWh/yr)",
                SOURCE.format(state=state, st=state.lower(), kind=kind), kw_per_1000m2, start, 900,
                licence=LICENCE, cyclic=True,
                note=f"Modelled (calibrated building simulations), average of {models:,} buildings, weather year "
                     "2018: smoother than a single building. Set the building's scale to floor area in m² / 1,000. "
                     "Pacific standard time.",
            ))
    return out
