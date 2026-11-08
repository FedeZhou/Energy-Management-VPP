"""Single description of every data source: what it is, how trustworthy, licence, attribution.

Used by the API (data panel in the app) and mirrored in docs/data-sources.md.
"""

from __future__ import annotations

from typing import Any

SOURCES: list[dict[str, Any]] = [
    {
        "id": "opsd", "prefix": "opsd/", "name": "Measured homes and a school, Germany",
        "provider": "Open Power System Data", "kind": "measured",
        "what": "Electricity use of 5 homes and 1 school in Konstanz, from building meters.",
        "used_for": "Building loads in Operate mode", "resolution": "15 min", "coverage": "2015-2019, varies per site",
        "licence": "CC BY 4.0", "commercial_use": True,
        "attribution": "Open Power System Data. 2020. Data Package Household Data, version 2020-04-15. "
                       "https://doi.org/10.25832/household_data/2020-04-15",
        "url": "https://data.open-power-system-data.org/household_data/",
        "caveats": "Small sample. Meter glitches removed by a documented rule; short gaps interpolated.",
    },
    {
        "id": "comstock", "prefix": "comstock/", "name": "Commercial buildings, California",
        "provider": "NREL ComStock (U.S. Department of Energy)", "kind": "modelled",
        "what": "Offices, a shop, a warehouse, a school and a hospital: calibrated building simulations, "
                "averaged over thousands of buildings, per 1,000 m² of floor area.",
        "used_for": "Commercial building loads (both modes)", "resolution": "15 min", "coverage": "weather year 2018",
        "licence": "CC BY 4.0", "commercial_use": True,
        "attribution": "Data includes information from the ComStock dataset developed by the National Renewable "
                       "Energy Laboratory (NREL) with funding from the U.S. Department of Energy (DOE). "
                       "doi:10.25984/1876417",
        "url": "https://data.openei.org/submissions/4520",
        "caveats": "Modelled, not metered. Averages are smoother than any single real building.",
    },
    {
        "id": "sintef", "prefix": "sintef/", "name": "Home EV charging, Norway",
        "provider": "SINTEF (Zenodo)", "kind": "measured",
        "what": "35,000 charging sessions of residents in 12 shared garages: plug-in, plug-out, energy.",
        "used_for": "EV visits at homes and residential garages", "resolution": "1 min", "coverage": "2018-2021",
        "licence": "CC BY 4.0", "commercial_use": True,
        "attribution": "Sørensen, Å. L. et al. Electric vehicle charging dataset with 35,000 charging sessions from "
                       "12 residential locations in Norway. Zenodo. https://doi.org/10.5281/zenodo.12730566",
        "url": "https://zenodo.org/records/12730566",
        "caveats": "Car charging power and battery size are the authors' estimates, not measurements.",
    },
    {
        "id": "utwente", "prefix": "utwente/", "name": "Workplace EV charging, Netherlands",
        "provider": "University of Twente / ElaadNL (4TU.ResearchData)", "kind": "measured",
        "what": "Sessions of regular drivers at an office car park in Utrecht with about 300 charge points.",
        "used_for": "EV visits at workplaces", "resolution": "1 min", "coverage": "2020-2024",
        "licence": "CC BY-NC-SA 4.0", "commercial_use": False,
        "attribution": "Winschermann, L. et al. Electric Vehicle Charging Session Data of Large Office Parking Lot. "
                       "4TU.ResearchData. https://doi.org/10.4121/80ef3824-3f5d-4e45-8794-3b8791efbd13",
        "url": "https://data.4tu.nl/datasets/80ef3824-3f5d-4e45-8794-3b8791efbd13/1",
        "caveats": "Non-commercial licence: fine for research, not for a commercial product. Car power not "
                   "recorded. From 2023 part of the car park was already smart-charged.",
    },
    {
        "id": "energycharts", "prefix": "ec/", "name": "Wholesale electricity prices",
        "provider": "Bundesnetzagentur | SMARD.de via Energy-Charts (Fraunhofer ISE)", "kind": "measured",
        "what": "Day-ahead market prices for Germany, the Netherlands, France and western Denmark.",
        "used_for": "Dynamic prices in Operate mode", "resolution": "15 min", "coverage": "from Oct 2025",
        "licence": "CC BY 4.0", "commercial_use": True,
        "attribution": "Bundesnetzagentur | SMARD.de, via api.energy-charts.info (Fraunhofer ISE)",
        "url": "https://api.energy-charts.info",
        "caveats": "Spot price only. Add grid fees and taxes with the price adder (Eurostat suggestion).",
    },
    {
        "id": "eurostat", "prefix": "eurostat/", "name": "Retail tariff components by country",
        "provider": "Eurostat", "kind": "statistics",
        "what": "Average household and business prices split into energy, network costs and taxes, for 15 "
                "countries.",
        "used_for": "Price adder suggestions and flat retail tariffs", "resolution": "annual average",
        "coverage": "latest published year (2025)",
        "licence": "CC BY 4.0", "commercial_use": True,
        "attribution": "Eurostat, nrg_pc_204_c (doi:10.2908/NRG_PC_204_C) and nrg_pc_205_c "
                       "(doi:10.2908/NRG_PC_205_C)",
        "url": "https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204_c/default/table",
        "caveats": "Annual averages: real contracts differ. Spot + adder approximates a dynamic tariff without "
                   "the supplier's margin.",
    },
    {
        "id": "openmeteo_pv", "prefix": "om/", "name": "Solar generation",
        "provider": "Open-Meteo weather + pvlib (NREL PVWatts method)", "kind": "modelled",
        "what": "Output per kWp for 5 locations and 2 roof orientations, computed from 15-minute weather.",
        "used_for": "Solar panels in Operate mode", "resolution": "15 min", "coverage": "from Oct 2025",
        "licence": "CC BY 4.0 (weather); BSD-3 (pvlib)", "commercial_use": True,
        "attribution": "Weather data by Open-Meteo.com (CC BY 4.0); pvlib python; Dobos (2014), PVWatts "
                       "Version 5 Manual, NREL/TP-6A20-62641",
        "url": "https://open-meteo.com",
        "caveats": "Modelled, not metered. Checked against PVGIS (EU JRC): 6 of 10 profiles fall within normal "
                   "year-to-year variation; Amsterdam is about 9% higher and Los Angeles about 9% lower (causes "
                   "unverified). Treat solar yields as accurate to about ±10%.",
    },
    {
        "id": "citylearn", "prefix": "cl2022/", "name": "CityLearn typical year, California",
        "provider": "CityLearn (Intelligent Environments Lab)", "kind": "mixed",
        "what": "17 home loads, solar per kW, two price series and EV schedules for one typical year.",
        "used_for": "Plan mode examples (hourly)", "resolution": "1 hour", "coverage": "one typical year",
        "licence": "MIT", "commercial_use": True,
        "attribution": "CityLearn, citylearn-project/CityLearn v3.2.0",
        "url": "https://github.com/citylearn-project/CityLearn",
        "caveats": "Location and year not documented. EV schedules look synthetic. 'Dynamic' price origin unknown.",
    },
]

EXCLUDED: list[dict[str, str]] = [
    {"name": "CityLearn 15-second datasets", "why": "Not real 15-second data: the files' own metadata says they "
     "are hourly values split evenly into 15-second slices."},
    {"name": "Norwegian day-ahead prices (Energy-Charts, NO1)", "why": "Published for private and internal use "
     "only; commercial use prohibited. Not open data."},
    {"name": "Caltech ACN-Data (GitHub copy)", "why": "No licence attached; redistribution terms unclear. "
     "The official API needs a personal key."},
    {"name": "Google data center power traces", "why": "Open (CC BY 4.0) but only reachable through BigQuery "
     "with a cloud account. Candidate for later."},
]

RULES: list[str] = [
    "No fake resolution: if the time step is finer than the data, values are repeated and the run says so.",
    "Same season, same weekday: sources from different years are aligned on season and weekday; each run lists "
    "the real dates used.",
    "European times use CET (UTC+1) without summer time; California data uses Pacific standard time.",
    "Every default parameter cites its source; example sizes in the example sites are marked as choices.",
]

STATIC_CHECKS: list[dict[str, str]] = [
    {"what": "Engine vs CityLearn, same home without a battery",
     "result": "Grid power and cost match to 5 significant digits (automated test)."},
    {"what": "Eurostat components vs published all-in household price",
     "result": "Energy + network + taxes reproduces the total within about 0.5% (DE, NL, FR, DK)."},
]
