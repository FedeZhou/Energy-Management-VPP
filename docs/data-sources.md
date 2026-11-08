# Data sources

All data is public and openly licensed (one source is non-commercial, flagged below). Nothing is stored in this
repository: `python -m emsbench.data` downloads the raw files into a local cache (`%LOCALAPPDATA%\emsbench`, outside
the repo) and converts them into profiles. In the app, **Data sources** (database icon in the top bar) shows the same
information, and every profile shows its source, licence, resolution and date range.
The machine-readable version is `src/emsbench/data/registry.py`.

## Sources

| Source | Kind | What we use | Resolution | Period | Licence |
| --- | --- | --- | --- | --- | --- |
| **Open Power System Data**, household data | Measured | Consumption of 5 homes and 1 school, Konstanz, Germany | 15 min | 2015-2019 | CC BY 4.0 |
| **NREL ComStock** 2025 release 1 | Modelled | Small and medium office, shop, warehouse, primary school, hospital, California, per 1,000 m² | 15 min | weather year 2018 | CC BY 4.0 |
| **SINTEF** EV dataset (Zenodo) | Measured | 81 regular residents' charging sessions in Norwegian shared garages | 1 min | 2018-2021 | CC BY 4.0 |
| **University of Twente / ElaadNL** (4TU) | Measured | 64 regular drivers at an office car park in Utrecht | 1 min | 2020-2024 | **CC BY-NC-SA 4.0 (non-commercial)** |
| **Energy-Charts** (SMARD data) | Measured | Day-ahead prices: Germany, Netherlands, France, western Denmark | 15 min | from Oct 2025 | CC BY 4.0 |
| **Eurostat** nrg_pc_204_c / nrg_pc_205_c | Statistics | Household and business price components (energy, network, taxes) for 15 countries | annual | 2025 | CC BY 4.0 |
| **Open-Meteo** weather + **pvlib** | Modelled | Solar output per kWp: Konstanz, Amsterdam, Paris, Aarhus, Los Angeles; south 30° and east-west 15° | 15 min | from Oct 2025 | CC BY 4.0 / BSD-3 |
| **CityLearn** 2022 datasets | Mixed | 17 California home loads, solar, two prices, EV schedules | 1 hour | typical year | MIT |

## Attribution

Required by the CC BY licences; also shown in the app.

- Open Power System Data. 2020. *Data Package Household Data*, version 2020-04-15. https://doi.org/10.25832/household_data/2020-04-15
- Data includes information from the ComStock dataset developed by the National Renewable Energy Laboratory (NREL) with
  funding from the U.S. Department of Energy (DOE). NREL (2025), ComStock 2025 Release 1, https://doi.org/10.25984/1876417.
  Methodology: Wilson et al. (2022), https://doi.org/10.2172/1854582
- Sørensen, Å. L. et al. *Electric vehicle charging dataset with 35,000 charging sessions from 12 residential locations in
  Norway*. Zenodo. https://doi.org/10.5281/zenodo.12730566
- Winschermann, L. et al. *Electric Vehicle Charging Session Data of Large Office Parking Lot*. 4TU.ResearchData.
  https://doi.org/10.4121/80ef3824-3f5d-4e45-8794-3b8791efbd13 (CC BY-NC-SA 4.0)
- Bundesnetzagentur | SMARD.de, via the Energy-Charts API of Fraunhofer ISE (api.energy-charts.info).
- Eurostat, nrg_pc_204_c (https://doi.org/10.2908/NRG_PC_204_C) and nrg_pc_205_c (https://doi.org/10.2908/NRG_PC_205_C).
- Weather data by Open-Meteo.com (CC BY 4.0). pvlib python (BSD-3). Dobos, A. P. (2014), *PVWatts Version 5 Manual*,
  NREL/TP-6A20-62641. Validation reference: PVGIS 5.3, European Commission Joint Research Centre.
- CityLearn, citylearn-project/CityLearn v3.2.0 (MIT).

## Processing and cleaning rules

- **OPSD:** cumulative meters differenced; consumption = import - export + PV; EV sub-meter removed from home 4; a site with
  PV but no export meter (home 1) skipped; gaps up to 2 h interpolated; 15-min values above 10x the series' 99.9th
  percentile treated as meter glitches.
- **ComStock:** state aggregates divided by floor area represented (ft² to m², exact factor 0.09290304) to give kW per
  1,000 m². Timestamps are period-ending EST; shifted to Pacific standard time.
- **SINTEF:** users with at least 150 visits. Car power and battery size are the dataset authors' *estimates*.
- **Twente:** shared IDs listed in the dataset README removed; drivers with at least 150 visits; IDs averaging more than 2
  sessions per weekday removed as shared or fleet cards (our rule; it removed one ID with ~6.6 sessions a day). From March
  2023 part of the car park was smart-charged by the site's controller.
- **Energy-Charts:** each response states its licence; zones that are not CC BY are rejected automatically.
- **Eurostat:** the "taxes, fees, levies and charges" component already includes VAT. Household total = energy + network +
  taxes; business prices exclude VAT (recoverable). Price adder = network + taxes. This approximates a dynamic tariff
  without the supplier's margin.
- **Solar:** PVWatts defaults (14.08% losses, 96% inverter efficiency, -0.47 %/°C).
- **Times:** European sources in fixed CET (UTC+1, no summer time; local timestamps converted via their time zone);
  California sources in Pacific standard time.
- **No fake resolution:** finer steps than the data are flagged "repeated (finer than the data)".
- **Same season, same weekday:** sources from different years are aligned on season and weekday; runs list the real dates.

## Checked and not used

| Source | Why not |
| --- | --- |
| CityLearn 15-second datasets | Not real 15-second data: metadata says hourly values split evenly into 15-second slices. |
| Norwegian day-ahead prices (Energy-Charts NO1) | "Private and internal use only"; commercial use prohibited. |
| Caltech ACN-Data (GitHub copy) | No licence attached; official API needs a personal key. |
| Google data center power traces | CC BY 4.0, but only through BigQuery with a cloud account. Candidate for later. |

## Validation checks

| Date | Check | Result |
| --- | --- | --- |
| 2026-11-08 | Solar model (last 12 months) vs PVGIS long-term mean, every location and orientation (automatic) | Within 2 SD of PVGIS: Konstanz (+4.7% / +6.6%), Paris (+3.9% / +5.9%), Aarhus (-4.5% / -2.2%). Outside: Amsterdam (+9.9% / +8.5%) and Los Angeles (-9.6% / -8.2%), causes unverified. Treat modelled solar as ±10%. Values: south 30° / east-west 15°. |
| 2026-11-08 | Eurostat components vs published all-in household price (nrg_pc_204) | Energy + network + taxes within about 0.5% for DE, NL, FR, DK. |
| 2026-11-07 | Engine vs CityLearn, same home without battery | Grid power and cost match to 5 significant digits (automated test). |
