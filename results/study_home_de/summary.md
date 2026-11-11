# Study: German home, full year

Base site: `configs/sites/plan_home_de_ev.yaml`, 365 days from 2025-11-01, 60-min steps. Homes and drivers: opsd/residential2 + sintef/OSL_S_KT43, opsd/residential4 + sintef/BOD_02H0505, opsd/residential5 + sintef/BAR_Plass160, opsd/residential6 + sintef/OSL_S_KT45.
Values: median (min to max) across the 4 homes, in the tariff's currency. Saving vs idle is per home, against the same home with the battery idle and the car charging on arrival, wear included.

| Controller | Forecast | Energy cost | Wear | Cost incl. wear | Saving vs idle incl. wear | Self-sufficiency | Battery life (yr) | EV short (kWh) |
|---|---|---|---|---|---|---|---|---|
| idle | perfect | 1,588 (614 to 2,300) | 0 (0 to 0) | 1,589 (614 to 2,300) | 0 (0 to 0) | 34% (24% to 49%) | 40.0 (40.0 to 40.0) | 86.8 (24.7 to 217.1) |
| idle | realistic | 1,588 (614 to 2,300) | 0 (0 to 0) | 1,589 (614 to 2,300) | 0 (0 to 0) | 34% (24% to 49%) | 40.0 (40.0 to 40.0) | 86.8 (24.7 to 217.1) |
| rule | perfect | 774 (31 to 1,752) | 374 (262 to 395) | 1,159 (404 to 2,014) | 336 (210 to 473) | 68% (48% to 80%) | 32.1 (30.3 to 40.0) | 86.8 (24.7 to 217.1) |
| rule | realistic | 776 (31 to 1,752) | 372 (261 to 395) | 1,160 (403 to 2,014) | 335 (211 to 473) | 69% (48% to 80%) | 32.3 (30.3 to 40.0) | 86.8 (24.7 to 217.1) |
| mpc_wear_blind | perfect | 694 (-48 to 1,655) | 342 (318 to 384) | 1,053 (271 to 2,006) | 395 (294 to 625) | 69% (48% to 81%) | 35.1 (31.3 to 37.7) | 86.8 (24.7 to 217.4) |
| mpc_wear_blind | realistic | 879 (107 to 1,860) | 343 (308 to 394) | 1,231 (415 to 2,235) | 239 (65 to 436) | 61% (43% to 69%) | 35.3 (30.5 to 38.9) | 86.8 (24.7 to 217.1) |
| mpc_wear_priced | perfect | 726 (-12 to 1,708) | 300 (271 to 340) | 1,050 (281 to 1,979) | 399 (321 to 612) | 69% (48% to 80%) | 39.5 (35.3 to 40.0) | 86.8 (24.7 to 217.4) |
| mpc_wear_priced | realistic | 916 (153 to 1,888) | 303 (277 to 343) | 1,229 (430 to 2,211) | 239 (89 to 425) | 61% (43% to 68%) | 38.6 (35.0 to 40.0) | 86.8 (24.7 to 217.1) |

Runtime 2,962 s.
