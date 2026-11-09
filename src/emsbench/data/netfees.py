"""Time-variable network fees under § 14a EnWG "Modul 3" (Germany), as 15-minute time series.

Since 1 April 2025 German grid operators must offer a time-variable network fee to households with a
controllable device (heat pump, wallbox, battery, air conditioning) and a smart meter. It replaces the
fixed network working price with three tiers (low, standard, high) whose times each grid operator sets in
its price sheet (BNetzA decision BK8-22/010-A). Values are net of VAT, in EUR/kWh; they are added to the
import price. Modul 3 is only available together with Modul 1 (a fixed annual reduction), which does not
depend on operation and is not modelled.

Sources (price sheets read 2026-11-08):
- Netzgesellschaft Düsseldorf mbH, "Netzentgelte Strom und weitere Entgeltbestandteile, gültig ab
  01.01.2026", published 18.12.2025, section A.2.3: low 3.16 ct/kWh (04:30-05:00), standard 7.91 ct/kWh
  (00:00-04:30, 05:00-18:00, 20:00-24:00), high 8.19 ct/kWh (18:00-20:00); low and high tiers apply in
  Q1 and Q4 2026, the standard tier otherwise.
  https://a.storyblok.com/f/274773/x/dc3a61c884/2025-12-12_finales-preisblatt-nne-strom-2026.pdf
- Stadtwerke Mosbach GmbH, "Preise für die Nutzung des Stromverteilnetzes, gültig ab 1. Januar 2026",
  status October 2025, Preisblatt 2a: low 3.65 ct/kWh (01:00-05:00), standard 9.31 ct/kWh, high
  11.90 ct/kWh (09:00-11:00 and 17:00-20:00); low and high tiers in Q1 and Q4, standard in Q2 and Q3.
  https://www.swm-online.de/wp-content/uploads/Preisblatt_Netzentgelte_Strom_2026.pdf

Each schedule is the 2026 rule applied to every year (a schedule, not measured data). Times are local
German time in the sheets; profiles use fixed CET (UTC+1), so in summer time the windows shift by an hour
on the profile's clock (only Q1/Q4 matter here, mostly winter time).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import numpy as np
import pandas as pd

from emsbench.sim.profiles import FloatArray, Profile

STEP = 900
START, END = dt.datetime(2015, 1, 1), dt.datetime(2036, 1, 1)
CET = pd.Timedelta(hours=1)
LICENCE = "Published network price sheet (public tariff information)"
TIER_QUARTERS = (1, 4)  # low and high tiers apply in Q1 and Q4 in both sheets

@dataclass(frozen=True)
class Sheet:
    name: str
    url: str
    low: float  # EUR/kWh, net
    standard: float
    high: float
    low_windows: tuple[tuple[float, float], ...]  # local hours [from, to)
    high_windows: tuple[tuple[float, float], ...]


DUESSELDORF = Sheet(
    "Netzgesellschaft Düsseldorf 2026 (final, 18.12.2025)",
    "https://a.storyblok.com/f/274773/x/dc3a61c884/2025-12-12_finales-preisblatt-nne-strom-2026.pdf",
    low=0.0316, standard=0.0791, high=0.0819, low_windows=((4.5, 5.0),), high_windows=((18.0, 20.0),),
)
MOSBACH = Sheet(
    "Stadtwerke Mosbach 2026 (sheet status October 2025)",
    "https://www.swm-online.de/wp-content/uploads/Preisblatt_Netzentgelte_Strom_2026.pdf",
    low=0.0365, standard=0.0931, high=0.1190, low_windows=((1.0, 5.0),), high_windows=((9.0, 11.0), (17.0, 20.0)),
)


def schedule(sheet: Sheet, start: dt.datetime = START, end: dt.datetime = END) -> FloatArray:
    """Network fee in EUR/kWh for each 15-minute step of fixed-CET time [start, end)."""
    cet = pd.date_range(start, end, freq=f"{STEP}s", inclusive="left")
    local = (cet - CET).tz_localize("UTC").tz_convert("Europe/Berlin")
    hour = local.hour.to_numpy() + local.minute.to_numpy() / 60
    in_tier_quarter = np.isin(local.quarter.to_numpy(), TIER_QUARTERS)
    fee = np.full(len(cet), sheet.standard)
    for lo, hi in sheet.low_windows:
        fee[in_tier_quarter & (hour >= lo) & (hour < hi)] = sheet.low
    for lo, hi in sheet.high_windows:
        fee[in_tier_quarter & (hour >= lo) & (hour < hi)] = sheet.high
    return fee


def build() -> list[Profile]:
    note = ("Tariff schedule, net of VAT: the 2026 price sheet applied to every year. Add it on top of an energy "
            "price that does not already include network fees. Times converted from German local time to CET.")
    out = []
    for pid, sh in (("netfee/de_duesseldorf_2026", DUESSELDORF), ("netfee/de_mosbach_2026", MOSBACH)):
        label = (f"{sh.name}: {100 * sh.low:.2f} / {100 * sh.standard:.2f} / {100 * sh.high:.2f} ct/kWh "
                 "low / standard / high")
        out.append(Profile(pid, "netfee", label, f"{sh.name} network price sheet, § 14a Modul 3 ({sh.url})",
                           schedule(sh), START, STEP, note=note, currency="EUR", licence=LICENCE))
    return out
