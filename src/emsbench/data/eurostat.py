"""Retail electricity price components per country from Eurostat (CC BY 4.0).

Datasets: nrg_pc_204_c (households, doi:10.2908/NRG_PC_204_C) and nrg_pc_205_c
(non-households, doi:10.2908/NRG_PC_205_C), annual, EUR per kWh.

Components: energy and supply, network costs, and "taxes, fees, levies and charges".
The taxes component already *includes* VAT (VAT is one of its sub-items): energy +
network + taxes reproduces Eurostat's published all-in household price (nrg_pc_204)
within about 0.5%, checked for DE, NL, FR and DK on 2026-11-08. Businesses usually
recover VAT, so their prices here exclude it.

Two uses in the simulator:
- tariff add-ons: network + taxes, to add to a spot price for a realistic dynamic tariff;
- flat retail tariffs: the all-in average price as a constant price profile.
"""

from __future__ import annotations

import datetime as dt
import itertools
import json
from typing import Any

import numpy as np

from emsbench.data.cache import PROCESSED, RAW, download
from emsbench.sim.profiles import Profile

API = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}?format=JSON&lang=EN"
       "&currency=EUR&nrg_cons={band}&sinceTimePeriod={since}{geos}")
LICENCE = "CC BY 4.0 (Eurostat)"
COUNTRIES = {"DE": "Germany", "NL": "Netherlands", "FR": "France", "DK": "Denmark", "BE": "Belgium",
             "AT": "Austria", "ES": "Spain", "IT": "Italy", "PL": "Poland", "SE": "Sweden", "NO": "Norway",
             "PT": "Portugal", "IE": "Ireland", "FI": "Finland", "CZ": "Czechia"}
FLAT_PROFILES = ("DE", "NL", "FR", "DK", "ES", "IT")  # keep the price menu short
CONSUMERS = {
    "household": ("nrg_pc_204_c", "KWH2500-4999", "households, 2,500-4,999 kWh/yr (band DC)", True),
    "business": ("nrg_pc_205_c", "MWH20-499", "businesses, 20-499 MWh/yr (band IB), excl. VAT", False),
}
TARIFFS_FILE = "eurostat_tariffs.json"


def parse_jsonstat(d: dict[str, Any]) -> tuple[list[str], dict[tuple[str, ...], float]]:
    """Flatten a Eurostat JSON-stat response into {(code per dimension): value}."""
    ids, sizes = d["id"], d["size"]
    cats = [sorted(d["dimension"][k]["category"]["index"].items(), key=lambda kv: kv[1]) for k in ids]
    out: dict[tuple[str, ...], float] = {}
    for combo in itertools.product(*[range(s) for s in sizes]):
        flat = 0
        for i, c in enumerate(combo):
            flat = flat * sizes[i] + c
        v = d["value"].get(str(flat))
        if v is not None:
            out[tuple(cats[i][c][0] for i, c in enumerate(combo))] = float(v)
    return ids, out


def build_tariffs(today: dt.date | None = None) -> list[dict[str, Any]]:
    since = (today or dt.date.today()).year - 3
    geos = "".join(f"&geo={g}" for g in COUNTRIES)
    rows: list[dict[str, Any]] = []
    for consumer, (code, band, band_label, with_vat) in CONSUMERS.items():
        path = download(API.format(code=code, band=band, since=since, geos=geos),
                        RAW / "eurostat" / f"{code}_{band}_{since}.json", force=True)
        ids, values = parse_jsonstat(json.loads(path.read_text(encoding="utf-8")))
        i_prc, i_geo, i_time = ids.index("nrg_prc"), ids.index("geo"), ids.index("time")
        for geo, name in COUNTRIES.items():
            years = sorted({k[i_time] for k in values if k[i_geo] == geo}, reverse=True)
            for year in years:
                part = {k[i_prc]: v for k, v in values.items() if k[i_geo] == geo and k[i_time] == year}
                if not all(c in part for c in ("NRG_SUP", "NETC", "TAX_FEE_LEV_CHRG")):
                    continue
                vat = part.get("VAT", 0.0)
                taxes = part["TAX_FEE_LEV_CHRG"] - (0.0 if with_vat else vat)
                total = part["NRG_SUP"] + part["NETC"] + taxes
                rows.append({
                    "id": f"{consumer}-{geo}-{year}", "country": geo, "country_name": name, "consumer": consumer,
                    "band": band_label, "year": year, "currency": "EUR",
                    "energy_supply": round(part["NRG_SUP"], 4), "network": round(part["NETC"], 4),
                    "taxes": round(taxes, 4), "vat_included": with_vat, "vat": round(vat, 4),
                    "total": round(total, 4), "adder": round(part["NETC"] + taxes, 4),
                    "source": f"Eurostat {code.upper()} (doi:10.2908/{code.upper()}), {year}",
                    "licence": LICENCE,
                })
                break
    return rows


def build(today: dt.date | None = None) -> list[Profile]:
    rows = build_tariffs(today)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / TARIFFS_FILE).write_text(json.dumps(rows, indent=1), encoding="utf-8")
    out = []
    for r in rows:
        if r["country"] not in FLAT_PROFILES:
            continue
        who = "households" if r["consumer"] == "household" else "businesses"
        out.append(Profile(
            f"eurostat/{r['consumer']}_{r['country'].lower()}", "price",
            f"Flat retail price, {r['country_name']} {who} {r['year']}: €{r['total']:.3f}/kWh",
            r["source"] + ", energy + network + taxes", np.full(8760, r["total"]),
            dt.datetime(int(r["year"]), 1, 1), 3600, currency="EUR", cyclic=True, licence=LICENCE,
            note=f"Annual average for {r['band']}. Constant price: no time-of-day variation. "
                 + ("Includes VAT." if r["vat_included"] else "Excludes VAT (recoverable for businesses)."),
        ))
    return out


def load_tariffs() -> list[dict[str, Any]]:
    path = PROCESSED / TARIFFS_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
