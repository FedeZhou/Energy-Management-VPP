"""US utility tariffs turned into 15-minute time series, from the OpenEI Utility Rate Database (URDB).

Xcel Energy Colorado (Public Service Co of Colorado), Primary General Service, Schedule PG,
effective 2024-01-22 to 2024-12-31, URDB record 6616db7196839681b20553db
(https://apps.openei.org/IURDB/rate/view/6616db7196839681b20553db; URDB data is public domain,
U.S. DOE / NREL). Values below are "rate + adjustments" as listed in the record:

- energy: period 1 (Jun-Sep) 0.00778 + 0.04113 = 0.04891 USD/kWh; period 2 (other months)
  0.00778 + 0.02539 = 0.03317 USD/kWh, the same at all hours;
- flat demand charge, all hours, every month: 4.23 + 3.68 = 7.91 USD per kW per month
  (set as the tariff's demand charge in the site config);
- time-of-use demand charge, 14:00-18:00 local time (URDB lists the same window for weekdays and
  weekends): 10.03 + 3.68 = 13.71 USD/kW-month Oct-May, 14.97 + 3.68 = 18.65 USD/kW-month Jun-Sep;
- fixed charge 697.70 USD per month (not modelled: it does not depend on operation).

URDB leaves the demand interval blank; we bill on the simulation step (use 15-minute steps).
Times are local Mountain time in the tariff; profiles are expressed in fixed MST (UTC-7) like the
ESIF data, so in summer the 14:00-18:00 MDT window is 13:00-17:00 on the profile's clock.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from emsbench.sim.profiles import FloatArray, Profile

URDB_PG = "https://apps.openei.org/IURDB/rate/view/6616db7196839681b20553db"
SOURCE = f"OpenEI Utility Rate Database, Xcel Energy Colorado Schedule PG 2024 ({URDB_PG})"
LICENCE = "Public domain (U.S. DOE / NREL, OpenEI URDB)"
SUMMER = (6, 7, 8, 9)
ENERGY = {"summer": 0.00778 + 0.04113, "winter": 0.00778 + 0.02539}  # USD/kWh
TOU_DEMAND = {"summer": 14.97 + 3.68, "winter": 10.03 + 3.68}  # USD per kW per month
ON_PEAK_HOURS = range(14, 18)  # local time, 14:00-18:00
FLAT_DEMAND = 4.23 + 3.68  # USD per kW per month, all hours (exported for configs/tests)
START, END = dt.datetime(2015, 1, 1), dt.datetime(2036, 1, 1)
MST = pd.Timedelta(hours=7)


STEP = 900  # a tariff schedule is exact at any resolution; 15 min matches Operate mode


def local_calendar(start: dt.datetime, end: dt.datetime) -> tuple[NDArray[np.int_], NDArray[np.int_]]:
    """(month, hour) in Denver local time for each 15-minute step of fixed-MST time [start, end)."""
    mst = pd.date_range(start, end, freq=f"{STEP}s", inclusive="left")
    local = (mst + MST).tz_localize("UTC").tz_convert("America/Denver")
    return local.month.to_numpy(), local.hour.to_numpy()


def xcel_pg(start: dt.datetime = START, end: dt.datetime = END) -> tuple[FloatArray, FloatArray]:
    month, hour = local_calendar(start, end)
    summer = np.isin(month, SUMMER)
    energy = np.where(summer, ENERGY["summer"], ENERGY["winter"])
    on_peak = np.isin(hour, ON_PEAK_HOURS)
    demand = np.where(on_peak, np.where(summer, TOU_DEMAND["summer"], TOU_DEMAND["winter"]), 0.0)
    return energy.astype(float), demand.astype(float)


def build() -> list[Profile]:
    energy, demand = xcel_pg()
    note = ("Tariff schedule, not measured. Times in MST (UTC-7, no daylight saving); the tariff's local-time "
            "windows are converted, including summer time. Fixed monthly charge not included.")
    return [
        Profile("urdb/xcel_co_pg", "price",
                f"Xcel Colorado large C&I (Schedule PG 2024): {ENERGY['winter']:.3f} / {ENERGY['summer']:.3f} "
                "USD/kWh winter/summer", SOURCE, energy, START, STEP, note=note, currency="USD", licence=LICENCE),
        Profile("urdb/xcel_co_pg_demand", "demand",
                f"Xcel Colorado Schedule PG peak-window demand charge, 14-18 h local: {TOU_DEMAND['winter']:.2f} / "
                f"{TOU_DEMAND['summer']:.2f} USD/kW-month", SOURCE, demand, START, STEP, note=note, currency="USD",
                licence=LICENCE),
    ]
