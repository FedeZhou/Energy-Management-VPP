# Sanity check: Weniger, Tjaden and Quaschning 2014 (HTW Berlin)

Sanity check against a published result: Weniger, Tjaden and Quaschning (HTW Berlin), "Sizing and grid integration
of residential PV battery systems", Energy Procedia 46 (2014) 78-87 (IRES 2013),
https://solar.htw-berlin.de/wp-content/uploads/WENIGER-2013-Sizing-and-Grid-Integration-of-Residential-PV-Battery-Systems.pdf

| Home | Demand (MWh/yr) | Case | Self-consumption | Self-sufficiency | Cycles/yr |
|---|---|---|---|---|---|
| opsd/residential2 | 2.5 | no battery | 35% | 36% | - |
| opsd/residential2 | 2.5 | 1 kWh/MWh battery | 66% | 62% | 269 |
| opsd/residential4 | 5.5 | no battery | 29% | 30% | - |
| opsd/residential4 | 5.5 | 1 kWh/MWh battery | 52% | 49% | 198 |
| opsd/residential5 | 2.4 | no battery | 30% | 30% | - |
| opsd/residential5 | 2.4 | 1 kWh/MWh battery | 58% | 54% | 239 |
| opsd/residential6 | 9.8 | no battery | 61% | 63% | - |
| opsd/residential6 | 9.8 | 1 kWh/MWh battery | 76% | 76% | 131 |
| **median, ours** | | no battery | 32% (published 30%) | 33% (published 30%) | - |
| **median, ours** | | 1 kWh/MWh battery | 62% (published 59%) | 58% (published 56%) | 219 (published about 270) |

Across 74 measured household profiles at 1 kWp + 1 kWh per MWh, the same group reports self-sufficiency of 54% on average, 61% for a household active by day and 43% for one active at night (HTW Berlin study 'Dezentrale Solarstromspeicher fuer die Energiewende', 2015).
