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
| **Leeds City Council** fleet depots (Data Mill North) | Measured | Council fleet charging sessions; main depot Knowsthorpe HQ with 11 two-socket charge points | 1 min | May-Sep 2023 | OGL v3.0 |
| **Energy-Charts** (SMARD data) | Measured | Day-ahead prices: Germany, Netherlands, France, western Denmark | 15 min | from Oct 2025 | CC BY 4.0 |
| **Eurostat** nrg_pc_204_c / nrg_pc_205_c | Statistics | Household and business price components (energy, network, taxes) for 15 countries | annual | 2025 | CC BY 4.0 |
| **Open-Meteo** weather + **pvlib** | Modelled | Solar output per kWp: Konstanz, Amsterdam, Paris, Aarhus, Los Angeles; south 30° and east-west 15° | 15 min | from Oct 2025 | CC BY 4.0 / BSD-3 |
| **Open-Meteo Previous Runs** + **pvlib** | Modelled (forecast) | Day-ahead solar forecasts for the same 10 profiles: the weather predicted 24 h before each hour, through the same solar model. Used only for realistic forecasts, never as actual solar | 1 hour (repeated over 15-min steps, flagged) | from Oct 2025 | CC BY 4.0 / BSD-3 |
| **CityLearn** 2022 datasets | Mixed | 17 California home loads, solar, two prices, EV schedules | 1 hour | typical year | MIT |
| **NLR (NREL) ESIF** HPC data center PUE data | Measured | IT power and whole-facility power of a ~2.5-2.9 MW liquid-cooled supercomputer centre, Golden, Colorado | 15 min (from ~1-min samples) | Apr-Aug 2024, Nov 2024-Jun 2025 | CC BY 4.0 |
| **OpenEI URDB**, Xcel Colorado Schedule PG | Statistics (tariff) | Large-customer energy price and 14-18 h peak-window demand charge | 15 min (schedule, exact) | tariff of 2024 | Public domain |
| **When2Heat** (Open Power System Data 2023-07-27) | Modelled | Heat demand (space + hot water, single- and multi-family houses) and heat pump COP (air / ground source, radiators / floor heating) for DE, NL, FR, DK | 1 hour | 2008-2022 | CC BY 4.0 |
| **§14a Modul 3 network fees**: Netzgesellschaft Düsseldorf, Stadtwerke Mosbach | Statistics (tariff) | Low / standard / high network fee by time of day, net of VAT | 15 min (schedule, exact) | 2026 price sheets, applied to every year | Public tariff information |

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
- *EV Fleet Chargepoint use* (Depot Usage 2023), (c) Leeds City Council, 2023,
  https://datamillnorth.org/dataset/e7ljx/ev-fleet-chargepoint-use. This information is licensed under the terms of the
  Open Government Licence (v3.0).
- Bundesnetzagentur | SMARD.de, via the Energy-Charts API of Fraunhofer ISE (api.energy-charts.info).
- Eurostat, nrg_pc_204_c (https://doi.org/10.2908/NRG_PC_204_C) and nrg_pc_205_c (https://doi.org/10.2908/NRG_PC_205_C).
- Weather data by Open-Meteo.com (CC BY 4.0). pvlib python (BSD-3). Dobos, A. P. (2014), *PVWatts Version 5 Manual*,
  NREL/TP-6A20-62641. Validation reference: PVGIS 5.3, European Commission Joint Research Centre.
- CityLearn, citylearn-project/CityLearn v3.2.0 (MIT).
- Clark, S. and Strelka, J. *NLR HPC Facility Power Usage Effectiveness (PUE) Data*. National Laboratory of the Rockies
  (formerly NREL), 2026. https://data.openei.org/submissions/8616 (CC BY 4.0)
- OpenEI Utility Rate Database (U.S. DOE / NREL), rate 6616db7196839681b20553db, Xcel Energy Colorado Schedule PG.
- Ruhnau, O., Hirth, L., Praktiknjo, A. (2019). *Time series of heat demand and heat pump efficiency for energy system
  modeling*. Scientific Data 6, 189. https://doi.org/10.1038/s41597-019-0199-y. Data: Open Power System Data, When2Heat
  2023-07-27, https://data.open-power-system-data.org/when2heat/2023-07-27/ (CC BY 4.0).
- Netzgesellschaft Düsseldorf mbH, *Netzentgelte Strom gültig ab 01.01.2026* (18.12.2025); Stadtwerke Mosbach GmbH,
  *Preise für die Nutzung des Stromverteilnetzes, gültig ab 1. Januar 2026* (status October 2025).

## Processing and cleaning rules

- **Day-ahead solar forecasts** (`data/openmeteo_forecast.py`): Open-Meteo Previous Runs API, variables ending
  `_previous_day1` ("the value predicted 24 hours before valid time"). Hourly radiation is averaged over the past hour,
  so the hour labelled h is given to the four 15-minute steps in (h - 1 h, h], and the sun position is taken at h - 30 min.
  Gaps of up to 2 hours are interpolated; longer ones are filled with the actual solar 24 h earlier and counted in the
  profile note (0 hours missing as of Nov 2026). Unverified detail: Open-Meteo does not say whether 15-minute radiation
  covers the preceding or the following 15 minutes; the actual profiles assume the following.
- **OPSD:** cumulative meters differenced; consumption = import - export + PV; EV sub-meter removed from home 4; a site with
  PV but no export meter (home 1) skipped; gaps up to 2 h interpolated; 15-min values above 10x the series' 99.9th
  percentile treated as meter glitches.
- **ComStock:** state aggregates divided by floor area represented (ft² to m², exact factor 0.09290304) to give kW per
  1,000 m². Timestamps are period-ending EST; shifted to Pacific standard time.
- **SINTEF:** users with at least 150 visits. Car power and battery size are the dataset authors' *estimates*.
- **Twente:** shared IDs listed in the dataset README removed; drivers with at least 150 visits; IDs averaging more than 2
  sessions per weekday removed as shared or fleet cards (our rule; it removed one ID with ~6.6 sessions a day). From March
  2023 part of the car park was smart-charged by the site's controller.
- **Leeds fleet depots** (`data/leeds.py`): file "Depot Usage 2023 May to November"; sessions actually run 23 Apr -
  2 Oct 2023, so coverage is set to whole months (1 May - 1 Oct 2023). Rows with 0 kWh (485 of 4,684) or a non-positive
  duration (7) dropped. Charge start/end equal plug-in/unplug in every row. No charge point ever has more than two
  cars plugged in at once, so each is read as a two-socket post and every session goes to the first free socket (our
  rule; the engine models one car per charger). UK summer time (UTC+1) equals fixed CET, so clock times are unchanged.
  Charger ratings are not in the file: the highest average session power at Knowsthorpe HQ is 7.2 kW (99th percentile
  per charge point 6.3-7.2 kW), consistent with 7.4 kW (230 V x 32 A) AC sockets. The July-Sept 2020 file of the same
  dataset is not used (different format; its chargers cannot be matched to the 2023 IDs).
- **Energy-Charts:** each response states its licence; zones that are not CC BY are rejected automatically.
- **Eurostat:** the "taxes, fees, levies and charges" component already includes VAT. Household total = energy + network +
  taxes; business prices exclude VAT (recoverable). Price adder = network + taxes. This approximates a dynamic tariff
  without the supplier's margin.
- **ESIF:** irregular ~1-min samples averaged to 15 min; small negative readings clipped to 0; gaps up to 2 h interpolated;
  only uninterrupted stretches of 90+ days from 2024 on (the current machine). Facility = IT + cooling + HVAC + pumps +
  plug and light + the constant 2.67 kW tower filter pump the README says is not in `pump_kw`. Facility PUE is
  best-in-class (~1.07); for a typical site use IT x 1.54 (Uptime Institute 2025 average).
- **URDB tariff:** "rate + adjustments" as listed in the record; local-time windows converted to fixed MST including
  summer time. URDB lists the peak window on weekends too and leaves the demand interval blank; both taken as listed.
  Fixed monthly charge (USD 697.70) not modelled.
- **Solar:** PVWatts defaults (14.08% losses, 96% inverter efficiency, -0.47 %/°C).
- **Times:** European sources in fixed CET (UTC+1, no summer time; local timestamps converted via their time zone);
  California sources in Pacific standard time; Colorado sources in Mountain standard time (UTC-7).
- **No fake resolution:** finer steps than the data are flagged "repeated (finer than the data)".
- **Same season, same weekday:** sources from different years are aligned on season and weekday; runs list the real dates.

## Checked and not used

| Source | Why not |
| --- | --- |
| CityLearn 15-second datasets | Not real 15-second data: metadata says hourly values split evenly into 15-second slices. |
| Norwegian day-ahead prices (Energy-Charts NO1) | "Private and internal use only"; commercial use prohibited. |
| Caltech ACN-Data (GitHub copy) | No licence attached; official API needs a personal key. |
| Google data center power traces | CC BY 4.0, but only through BigQuery with a cloud account. Candidate for later. |
| UK Power Networks **Optimise Prime** WS2 (Royal Mail depots) | CC BY 4.0 ("license: CC BY 4.0" in the UKPN Open Data Portal record `ukpn-optimise-prime`) and the best depot data found: charge-point power, building load and the real *profiled connections* (time-windowed limits) of each depot, 2020-2022. Charge-point measurements alone are 733 daily files, about 127 GB, plus 4.7 GB of building load, behind a yearly-rotating access token. Too large for a first-run download; candidate for a one-off processing script. |
| City of Boulder EV charging station data | CC0 ("CC0 License" in the ArcGIS item; DCAT feed `license: creativecommons.org/publicdomain/zero/1.0`). 148,000 sessions at city-owned public chargers, 2018-2023. Commercially usable; public chargers, not a depot. Candidate for a public-charging example. |
| DfT *Electric Chargepoint Analysis 2017: Local Authority Rapids* | OGL v3.0 ("All content is available under the Open Government Licence v3.0, except where otherwise stated", gov.uk). Single public rapid chargers in 27 English local authorities; chargers are not grouped by site, so no hub can be built. |
| Dundee City Council public EV charge point usage (2021-2025) | No licence stated: `licenseInfo` empty in every ArcGIS item and no licence in the portal's DCAT feed (checked 2026-11-22). Not usable until the council states one. |
| ElaadNL open data | Aggregated dashboards; "free to use" but no formal licence and no session-level download found. |
| Dutch municipal open data (data.overheid.nl) | Searched "laadsessies", "laadpaal transacties", "laadpalen": only charge point locations (CC BY / CC0), no sessions. |
| Palo Alto EV charging station usage (2011-2020) | City's own Open Data Terms: no named licence, commercial use not expressly permitted ("does not create any right ... not expressly stated"). |
| Barnet *Electric Vehicle Charging Transactions*, Perth & Kinross session data | No licence in the data.gov.uk record (Barnet) or on the IEEE DataPort listing (Perth & Kinross; the council's charger *locations* are OGL). Not verified further. |

## Validation checks

| Date | Check | Result |
| --- | --- | --- |
| 2026-11-08 | Solar model (last 12 months) vs PVGIS long-term mean, every location and orientation (automatic) | Within 2 SD of PVGIS: Konstanz (+4.7% / +6.6%), Paris (+3.9% / +5.9%), Aarhus (-4.5% / -2.2%). Outside: Amsterdam (+9.9% / +8.5%) and Los Angeles (-9.6% / -8.2%), causes unverified. Treat modelled solar as ±10%. Values: south 30° / east-west 15°. |
| 2026-11-08 | Eurostat components vs published all-in household price (nrg_pc_204) | Energy + network + taxes within about 0.5% for DE, NL, FR, DK. |
| 2026-11-07 | Engine vs CityLearn, same home without battery | Grid power and cost match to 5 significant digits (automated test). |

### When2Heat processing (2026-11-09)

- The CSV uses `;` separators and decimal commas, and skips one hour per year (15 in 2008-2022); those single hours
  are filled by linear interpolation on a complete hourly grid.
- In version 2023-07-27 the absolute demand columns end in 2015, while the normalized profiles and COPs run to 2022.
  We use the absolute columns only for the space / hot-water split (15% hot water for German single-family houses)
  and build every hourly series from the normalized profiles, so all 15 years are usable.
- Each heat profile is in kW per kWh of annual demand and integrates to exactly 1 per year (checked). The "effective"
  COP mixes space heating (radiator or floor COP) and hot water (water COP) in the same proportion: total heat / total
  electricity per hour. Both steps are our computation, not columns of the dataset.
