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
| mpc_scenarios3 | realistic | 864 (120 to 1,919) | 354 (330 to 387) | 1,243 (450 to 2,255) | 225 (45 to 404) | 62% (44% to 72%) | 34.0 (31.0 to 36.4) | 86.8 (24.7 to 217.1) |
| mpc_hybrid | perfect | 753 (19 to 1,722) | 371 (289 to 397) | 1,142 (381 to 2,012) | 336 (233 to 510) | 69% (49% to 80%) | 32.4 (30.2 to 40.0) | 86.8 (24.7 to 217.4) |
| mpc_hybrid | realistic | 855 (144 to 1,869) | 348 (296 to 391) | 1,230 (479 to 2,165) | 216 (135 to 421) | 63% (46% to 74%) | 34.6 (30.7 to 40.0) | 86.8 (24.7 to 217.1) |
| mpc_cautious | perfect | 722 (-5 to 1,704) | 361 (267 to 377) | 1,097 (345 to 1,971) | 379 (269 to 554) | 69% (49% to 81%) | 33.2 (31.8 to 40.0) | 86.8 (24.7 to 217.1) |
| mpc_cautious | realistic | 737 (0 to 1,734) | 360 (260 to 374) | 1,108 (352 to 1,993) | 365 (262 to 538) | 69% (48% to 81%) | 33.4 (32.1 to 40.0) | 86.8 (24.7 to 217.1) |

Runtime 238 s.
