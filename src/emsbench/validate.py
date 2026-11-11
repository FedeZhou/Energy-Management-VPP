"""Sanity check against a published result: Weniger, Tjaden and Quaschning (HTW Berlin), "Sizing and grid integration
of residential PV battery systems", Energy Procedia 46 (2014) 78-87 (IRES 2013),
https://solar.htw-berlin.de/wp-content/uploads/WENIGER-2013-Sizing-and-Grid-Integration-of-Residential-PV-Battery-Systems.pdf

Their setup (quoted from the paper): a single-family home of 4 MWh/yr (VDI 4655 profile, one-minute steps), PV yield
1024 kWh/kWp, battery power limited to 1 kW per kWh of usable capacity, AC round-trip efficiency 84%, a simple
self-consumption rule. Published results: with 1 kWp/MWh and no battery, self-consumption and self-sufficiency of
about 30%; adding 1 kWh/MWh of usable battery raises them to 59% and 56%, and the battery makes about 270 cycles a year.

Ours: four measured German homes (OPSD), 15-minute steps, one year (Nov 2025 - Oct 2026 weather), Konstanz solar.
Sizes are normalised per MWh of each home's demand as in the paper; PV capacity is scaled so the solar ENERGY per MWh
of demand matches their 1024 kWh/kWp (our site yields more per kWp).

    python -m emsbench.validate
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Literal

import numpy as np

from emsbench.study import HOMES

PUBLISHED = {"no battery": {"self_consumption": 0.30, "self_sufficiency": 0.30},
             "1 kWh/MWh battery": {"self_consumption": 0.59, "self_sufficiency": 0.56, "cycles": 270.0}}
YIELD_KWH_PER_KWP = 1024.0
START, DAYS = dt.date(2025, 11, 1), 365
STEP: Literal[15] = 15
PV_PROFILE = "om/konstanz_south30"


def run() -> list[dict[str, float | str]]:
    from emsbench.data import load_library
    from emsbench.sim.engine import simulate
    from emsbench.sim.model import Battery, Building, ControllerSpec, Site, SolarPV, Tariff

    lib = load_library()
    rows: list[dict[str, float | str]] = []
    for home, _ in HOMES:
        probe = Site(start=START, days=DAYS, step_minutes=STEP, tariff=Tariff(price_profile="ec/de_lu_da"),
                     assets=[Building(id="home", load_profile=home), SolarPV(id="pv", capacity_kwp=1.0,
                                                                              profile=PV_PROFILE)])
        r0 = simulate(probe, lib)
        demand_mwh = float(r0.site["load_kw"].sum() * STEP / 60 / 1000)
        our_yield = float(r0.site["pv_kw"].sum() * STEP / 60)  # kWh per kWp over the year
        kwp = demand_mwh * YIELD_KWH_PER_KWP / our_yield
        for case, kwh in (("no battery", 0.0), ("1 kWh/MWh battery", demand_mwh)):
            assets: list[object] = [Building(id="home", load_profile=home),
                                    SolarPV(id="pv", capacity_kwp=kwp, profile=PV_PROFILE)]
            if kwh:
                assets.append(Battery(id="bat", capacity_kwh=kwh, power_kw=kwh, round_trip_efficiency=0.84))
            site = Site(start=START, days=DAYS, step_minutes=STEP, tariff=Tariff(price_profile="ec/de_lu_da"),
                        controller=ControllerSpec(battery="self_consumption"), assets=assets)  # type: ignore[arg-type]
            k = simulate(site, lib).kpis
            rows.append({"home": home, "case": case, "demand_mwh": demand_mwh, "pv_kwp": kwp,
                         "self_consumption": k["self_consumption_share"],
                         "self_sufficiency": k["self_sufficiency_share"],
                         "cycles": k["battery_equivalent_full_cycles"]})
    return rows


def _pct(v: float | str) -> str:
    return f"{100 * float(v):.0f}%"


def report(rows: list[dict[str, float | str]]) -> str:
    out = ["| Home | Demand (MWh/yr) | Case | Self-consumption | Self-sufficiency | Cycles/yr |", "|---" * 6 + "|"]
    for r in rows:
        cyc = f"{float(r['cycles']):.0f}" if r["case"] != "no battery" else "-"
        out.append(f"| {r['home']} | {float(r['demand_mwh']):.1f} | {r['case']} | {_pct(r['self_consumption'])} | "
                   f"{_pct(r['self_sufficiency'])} | {cyc} |")
    for case, pub in PUBLISHED.items():
        sel = [r for r in rows if r["case"] == case]
        med = {m: float(np.median([float(r[m]) for r in sel]))
               for m in ("self_consumption", "self_sufficiency", "cycles")}
        cyc = f"{med['cycles']:.0f} (published about {pub['cycles']:.0f})" if "cycles" in pub else "-"
        out.append(f"| **median, ours** | | {case} | {_pct(med['self_consumption'])} "
                   f"(published {_pct(pub['self_consumption'])}) | {_pct(med['self_sufficiency'])} "
                   f"(published {_pct(pub['self_sufficiency'])}) | {cyc} |")
    return "\n".join(out)


SPREAD = ("Across 74 measured household profiles at 1 kWp + 1 kWh per MWh, the same group reports self-sufficiency of "
          "54% on average, 61% for a household active by day and 43% for one active at night (HTW Berlin study "
          "'Dezentrale Solarstromspeicher fuer die Energiewende', 2015).")


def main() -> None:
    table = report(run())
    out = Path("results/validation_htw2014.md")
    out.parent.mkdir(parents=True, exist_ok=True)
    intro = (__doc__ or "").split("\n\n")[0]
    title = "# Sanity check: Weniger, Tjaden and Quaschning 2014 (HTW Berlin)"
    out.write_text(f"{title}\n\n{intro}\n\n{table}\n\n{SPREAD}\n", encoding="utf-8")
    print(table)


if __name__ == "__main__":
    main()
