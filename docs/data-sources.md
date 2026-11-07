# Data sources

All data is public and openly licensed. Nothing is stored in this repository: `python -m emsbench.data`
downloads the raw files into a local cache (`%LOCALAPPDATA%\emsbench`, outside the repo) and converts them
into profiles. Every profile in the app shows its source, licence, resolution and date range.

## Attribution

Required by the CC BY licences below; also shown next to each profile in the app.

- Open Power System Data. 2020. *Data Package Household Data*, version 2020-04-15.
  https://doi.org/10.25832/household_data/2020-04-15 (CC BY 4.0).
- Sørensen, Å. L. et al. *Electric vehicle charging dataset with 35,000 charging sessions from 12 residential
  locations in Norway*. Zenodo. https://doi.org/10.5281/zenodo.12730566 (CC BY 4.0).
- Bundesnetzagentur | SMARD.de, via the Energy-Charts API of Fraunhofer ISE (api.energy-charts.info)
  (CC BY 4.0, as stated in every API response).
- Weather data by Open-Meteo.com (CC BY 4.0), Historical Forecast API.
- CityLearn datasets, citylearn-project/CityLearn v3.2.0 (MIT).
- Solar model: pvlib python (BSD-3), PVWatts conventions from Dobos, A. P. (2014), *PVWatts Version 5 Manual*,
  NREL/TP-6A20-62641.

## Sources

| Source | What we use | Resolution | Period | Notes and caveats |
| --- | --- | --- | --- | --- |
| **OPSD household data** | Measured consumption of 5 homes and 1 school in Konstanz, Germany | 15 min | 2015-2019 (varies per site) | Cumulative meters, differenced. Consumption = import - export + PV. EV sub-meter removed from home 4. A site with PV but no export meter (home 1) is skipped. Gaps up to 2 h interpolated. Values > 10x the 99.9th percentile treated as meter glitches. |
| **SINTEF EV sessions** | Plug-in, plug-out, energy per visit for 81 regular users (>=150 visits) in 12 Norwegian residential garages | 1 min (timestamps) | 2018-2021 | Measured. Car charging power and battery size are *estimates by the dataset authors* (Dataset2). Local Norwegian time. |
| **Energy-Charts / SMARD** | Germany-Luxembourg day-ahead prices | 15 min | from 2025-10-01 | Wholesale spot price, can be negative. Retail tariffs add fees and taxes: set the tariff's price adder. |
| **Open-Meteo + pvlib** | Solar output per kWp, Konstanz, south 30° and east-west 15° | 15 min | from 2025-10-01 | Modelled from weather, not measured. PVWatts default losses (14.08%) and inverter efficiency (96%), temperature coefficient -0.47 %/°C. |
| **CityLearn 2022** | 17 California home loads, solar per kW, two price series, 8 EV session sets | 1 hour | one typical year | Location and recording year not documented. EV sessions appear synthetic. "Dynamic" prices have no documented origin. |

## Rules the simulator follows

- **No fake resolution.** If the time step is finer than the data, values are repeated and the run says so
  ("repeated (finer than the data)"). CityLearn's own 15-second datasets were *not* used: their metadata shows
  they are hourly data split evenly into 15-second slices (`hourly_to_15s_expansion`).
- **Same season, same weekday.** Sources cover different years. A run asks each source for its own dates; if a
  source does not cover them, it uses the nearest year that does, shifted by up to three days so weekdays match.
  The results show the real dates used.
- **Times.** European sources use fixed CET (UTC+1) without daylight saving, so summer clock times are one hour
  off wall-clock time. SINTEF timestamps are local Norwegian time as published.
