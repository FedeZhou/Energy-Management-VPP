# Energy Management & VPP: State of the Art Research File

Living research file for Fede's open, employer-neutral energy management simulator project. Version 1, November 2026.

**How to read this:** Items are marked **\[S\]** when checked against sources found in this research pass, and **\[K\]** when they come from general background knowledge and should be double-checked. Vendor claims are marketing unless stated otherwise.

---

## 1. The problem in one paragraph

A site (home, building, EV charging hub, data center, microgrid) has **sources** (grid, solar, wind, generator), **storage** (stationary battery, EV batteries, thermal mass) and **loads** (fixed and flexible). An energy management system (EMS) decides, every few minutes, how much each asset charges, discharges or consumes. The goals are to minimise cost, respect limits (grid connection, transformer, battery state of charge, comfort, departure deadlines), and optionally earn money from markets. It must do this with **forecasts that are wrong**. A virtual power plant (VPP) is the same problem one level up: many sites aggregated and bid into markets as one plant.

**The universal model** (this is the core abstraction for your simulator):

- Nodes: sources, storage, loads, grid connection point
- Each asset: power limits, energy limits, efficiency, flexibility window, priority, cost of use (e.g. battery wear)
- Site constraints: connection limit, phase balance, transformer rating
- Signals: prices (day-ahead, intraday, imbalance), tariffs (time-of-use, demand charges), CO2 intensity, grid operator requests
- Controller: takes forecasts and measurements, outputs setpoints

Home, building, EV hub and data center are then just **configurations** of the same model. This is what makes the EV version a renaming exercise.

---

## 2. Use cases, ranked

Ranked by a mix of market momentum, pain severity and fit for an independent builder.

| Rank | Use case | Why it matters | Crowdedness | Fit for you |
| --- | --- | --- | --- | --- |
| 1 | Commercial & industrial sites with battery + solar + flexible loads (incl. EV fleets/depots) | Demand charges make peak shaving very valuable; many sites miss projected ROI due to rigid EMS \[S\] | Medium, fragmented | High, transfers directly to EV hubs |
| 2 | Home energy (battery, PV, heat pump, EV, appliances) | Huge volume, dynamic tariffs spreading in Europe; open tools exist (EMHASS, OpenEMS) \[S\] | High (Enpal, Sonnen, Tibber, gridX, Octopus) \[S\] | High for learning and demo, low for startup |
| 3 | VPP aggregation of many small assets | Big market growth; Shell bought Next Kraftwerke and Limejump; Capalo AI passed 1 GW contracted \[S\] | High at platform level | Medium, needs market access |
| 4 | Data center flexibility | Hot topic: Google announced 1 GW of demand response contracts in March 2026; a Duke study says 1 to 2% peak reduction can cut rates 0.5 to 2.8% \[S\] | Early, fast-moving (e.g. Emerald AI) \[S\] | Medium, great as a showcase configuration |
| 5 | Isolated microgrids (islands, mines, remote) | Diesel savings, resilience | Niche | Low to medium |

**Takeaway:** build for #1 as the core, demo #2 and #4 as configurations.

---

## 3. Algorithms, ranked

Ranked by **real-world readiness today**, not academic novelty.

| Rank | Method | What it is | Strengths | Weaknesses | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Rule-based control (RBC) | If-then rules, thresholds | Simple, transparent, cheap, trusted | Leaves money on the table; brittle when tariffs change | Dominant in deployed products \[K\] |
| 2 | Deterministic MPC (LP/MILP, rolling horizon) | Forecast, optimise over horizon, apply first step, repeat | Handles constraints exactly; explainable; strong baseline | Only as good as forecasts; solver cost | The practical state of the art. EMHASS reports 5 to 8% daily gain over standard rules in real use \[S\] |
| 3 | Stochastic / robust / chance-constrained MPC | Plans over forecast ranges or scenarios | Explicitly handles forecast error; protects against missed peaks | Harder to tune; needs probabilistic forecasts | Strong in literature, thin in products \[S\] |
| 4 | Hybrid: optimisation inside a learning loop | MPC whose weights or virtual prices are tuned by learning or evolutionary search | Interpretable plus adaptive | Needs domain design | Won CityLearn 2021 and 2022 style challenges \[S\] |
| 5 | Safe reinforcement learning | RL with safety layers, projection, shielding | Adapts, no explicit model | Sample hungry, sim-to-real gap, hard guarantees are tough | Active research; SafeCityLearn benchmark in 2026 \[S\] |
| 6 | Model-free deep RL (DQN, SAC, TD3, DDPG, PPO) | Learns a policy from interaction | Flexible, fast at runtime | Unsafe exploration, hyperparameter sensitive, poor transfer | Mostly simulation. One 2026 study showed 12% cost reduction vs MPC in simulation \[S\], but RL often gives no gain over a well-tuned rule controller \[S\] |
| 7 | Metaheuristics (GA, PSO, swarm variants) | Population search | Easy for nonconvex problems | Slow, no guarantees, many low-quality papers | Common in papers, rare in products \[K\] |

**Key insight:** the honest state of the art is **MPC with good forecasts plus a safety layer**. RL wins papers; MPC and rules win deployments. The open space is **uncertainty-aware MPC and hybrids, benchmarked honestly**.

### Forecasting, the hidden half

- **Time series foundation models** are the newest wave: Chronos-2, TimesFM 2.5, Moirai 2.0, TiRex. Chronos-2 is reported as state of the art for day-ahead load forecasting, zero-shot and fine-tuned \[S\].
- They give **probabilistic** forecasts out of the box, which feeds directly into stochastic MPC. Very few works close the loop from foundation-model forecast to control decision to money saved. This is a real gap \[S/K\].
- Baselines you must beat: persistence, seasonal naive, gradient boosting (XGBoost, LightGBM) \[K\].

---

## 4. Key concepts to master

1. **Battery modelling:** state of charge, power limits, round-trip efficiency, C-rate, degradation (cycle aging vs calendar aging; depth of discharge, temperature, average SoC). Treat wear as an **economic cost** in the objective \[S\].
2. **Tariffs and markets:** time-of-use, dynamic prices, demand charges (monthly peak kW), day-ahead and intraday markets, ancillary services (FCR, aFRR), imbalance.
3. **Value stacking:** peak shaving, arbitrage, self-consumption, grid services. Peak shaving stresses depth of discharge; frequency regulation stresses cycle count \[S\].
4. **Flexible loads:** EVs (arrival, departure, energy needed), heat pumps and thermal mass, deferrable appliances, data center workloads (deferrable in time, shiftable in location) \[S\].
5. **Grid constraints:** connection limit, transformer limit, three-phase unbalance (ACN-Sim models this) \[S\].
6. **Control architecture:** day-ahead planning, intraday re-planning, real-time safety layer.
7. **Uncertainty handling:** rolling horizon, reserves, probabilistic forecasts, scenario trees, chance constraints.
8. **Fair allocation in VPPs:** splitting revenue among participants (Shapley value approximations, etc.) \[S\].

---

## 5. Open source landscape

| Project | What it is | Use for you | Link |
| --- | --- | --- | --- |
| **OpenEMS** | Leading open source EMS, 10+ years, Java/OSGi, hardware-agnostic; batteries, EV charging, heat pumps, ToU \[S\] | Reference architecture for a real EMS | https://github.com/OpenEMS/openems |
| **EMHASS** | Python LP optimiser for homes, Home Assistant integration \[S\] | Best compact reference for MPC-style home EMS | https://github.com/davidusb-geek/emhass |
| **CityLearn** | Gym environment for building demand response, LF Energy project; PV, battery, HVAC, EV \[S\] | Benchmark and RL environment | https://github.com/intelligent-environments-lab/CityLearn |
| **SafeCityLearn** | Safety-constrained RL benchmark built on CityLearn (2026) \[S\] | Safe RL baselines | https://climateainordics.com/featured-works/2026-04-24-featured-work-safecitylearn/ |
| **pymgrid** | Python microgrid simulator, 600+ microgrid configs, RL ready (TotalEnergies R&D) \[S\] | Quick microgrid sandbox | https://github.com/Total-RD/pymgrid |
| **ACN-Sim / ACN-Data** | Caltech EV charging simulator with real data, three-phase modelling \[S\] | EV charging algorithms and data | https://ev.caltech.edu/simulator |
| **Grid2Op** | Sequential decision making on power grids (RTE France) \[S\] | Grid-level, less relevant for site EMS | https://github.com/rte-france/Grid2Op |
| **GridLAB-D** | PNNL agent-based distribution simulation \[S\] | Grid impact studies | https://github.com/gridlab-d/gridlab-d |
| **BOPTEST** | Building control benchmark framework \[S\] | HVAC control benchmarking | https://github.com/ibpsa/project1-boptest |
| **PyBaMM** | Battery physics and degradation models \[K\] | Realistic aging models | https://github.com/pybamm-team/PyBaMM |
| **pvlib** | Solar PV modelling \[K\] | PV generation from weather | https://github.com/pvlib/pvlib-python |
| **Linopy / Pyomo / CVXPY** | Optimisation modelling in Python \[K\] | Build your MPC | https://github.com/PyPSA/linopy |
| **Chronos** | Amazon time series foundation model \[S\] | Probabilistic forecasts | https://github.com/amazon-science/chronos-forecasting |

### Top 3 tools for this project, and the pick

Pick: **CityLearn** as the base simulator, with EMHASS as the reference for the MPC controller you add to it.

| Rank | Tool | License | Why it ranks here | Main limits for your goal |
| --- | --- | --- | --- | --- |
| 1 | [CityLearn](https://github.com/intelligent-environments-lab/CityLearn) | MIT \[S\] | Python, configurable multi-asset sites (PV, battery, heat pumps, EV chargers), standard KPIs, used in a 4-year NeurIPS challenge, so results compare to others \[S\] | Building-centric; controllers mostly RL; no native probabilistic forecasts; simple battery wear model \[K\] |
| 2 | [EMHASS](https://github.com/davidusb-geek/emhass) | MIT \[S\] | Cleanest real-world LP/MPC EMS; deployed in real homes with 5 to 8% gain over rules \[S\] | Home only; an optimiser, not a simulator or benchmark |
| 3 | [OpenEMS](https://github.com/OpenEMS/openems) | EPL-2.0 and AGPL-3.0 \[S\] | Production-grade EMS, hardware-agnostic, 10+ years \[S\] | Java/OSGi, heavy to learn; built for running real hardware, not comparing algorithms |

**Can you just download them?** Yes. MIT lets you use, modify and build on the code, even commercially, if you keep the license notice. AGPL (part of OpenEMS) means if you modify it and offer it as a service, you must publish your changes, so do not copy OpenEMS code into a future closed product. Not legal advice.

**What CityLearn does:** it steps through time (typically hourly) on real building load, solar and weather data. At each step your controller sets charge or discharge for batteries and other storage; CityLearn applies physics and limits and scores cost, peak, ramping and emissions.

**Where we improve on it (your novelty):**

1. **Strong MPC baselines:** add deterministic and stochastic MPC controllers, modelled on EMHASS's LP formulation.
2. **Probabilistic forecasting module:** plug Chronos-2 forecasts into the control loop.
3. **Forecast-error sweep harness:** degrade forecasts step by step and measure cost, missed peaks and wear for every controller.
4. **Wear-as-cost battery model:** chemistry-specific (LFP vs NMC) cycle and calendar aging, priced in euros.
5. **Generic asset plugins:** data center load (deferrable workloads), appliances, EV fleets, defined by config files with parameters sourced online.
6. **Peak and tariff realism:** monthly demand charges and dynamic EU prices from ENTSO-E.
7. **Web front end:** visual site configurator, then the 3D explorer.
8. **Real-data validation:** compare simulated results with measured data from a real site later.

If CityLearn's building focus becomes limiting, keep its data and KPIs but move the core into your own generic asset model; plan for that around Phase 4.

Curated lists: [best-of-ps](https://github.com/ps-wiki/best-of-ps), [Awesome Microgrid Management](https://github.com/ishandutta2007/Awesome-Microgrid-Management), [Awesome Building Energy Optimization](https://github.com/ishandutta2007/Awesome-Building-Energy-Optimization), [awesome-sustainable-technology](https://github.com/OpenEnergyPlatform/awesome-sustainable-technology).

**Data sources:** ENTSO-E Transparency Platform for EU prices and load \[K\], ACN-Data for EV sessions \[S\], NREL NSRDB and OpenEI load profiles (used by pymgrid) \[S\], BuildingsBench for building load \[S\], Open-Meteo for weather \[K\].

---

## 6. Commercial landscape

| Segment | Players | Notes |
| --- | --- | --- |
| Big VPP / trading platforms | Tesla Autobidder, Fluence Mosaic, AutoGrid, Stem Athena, Kraken Flex (Octopus) \[S\] | Scale and market access are their moat |
| European utility / home EMS | gridX (XENON, 200+ energy companies, E.ON), Tibber, Enpal (with Entrix), Sonnen \[S\] | Crowded, distribution-driven |
| European VPP / flexibility startups | Capalo AI (1 GW+ contracted, €11M Series A), Companion.energy (C&I automated execution) \[S\] | Move from dashboards to automated execution |
| Battery analytics | ACCURE (performance and warranty analytics) \[S\] | Degradation and warranty tracking as a product |
| Data center flexibility | Emerald AI, hyperscaler in-house (Google) \[S\] | Early, high momentum |
| Residential battery-as-a-service | Base Power, Lunar Energy ($532M raised) \[S\] | Hardware plus VPP vertical integration |
| Planning / design tools | HOMER, PVsyst \[S\] | Sizing, not live control |

**Pattern:** big players own scale and market access. Gaps sit in **trust, honest performance verification, and hardware-agnostic mid-market control**.

Full 2026 landscape, capability gaps versus emsbench, and the plan for residential at several scales:
[market-landscape.md](market-landscape.md) (checked 2026-11-08).

---

## 7. Best papers and reviews to read, in order

Read in this order. Summaries are written from the abstracts and the search results, not full-text reads; verify as you go.

1. **[Virtual Power Plants for DER integration: aggregation, control, market participation and revenue allocation](https://www.sciencedirect.com/science/article/pii/S2211467X26003238)** (2026). The map of the whole field: how assets are grouped, centralized vs distributed control, day-ahead to real-time scheduling, and how VPPs earn money. Read first for vocabulary.
2. **[Systematic Review and Meta-Analysis of MPC in Microgrids](https://www.mdpi.com/2227-9717/13/7/2197)** (Processes, 2025). Why MPC became the practical standard and how its variants compare. This is the core method you will implement.
3. **[Reinforcement Learning vs Model-Based Control in EV Charging Microgrids](https://www.sciencedirect.com/science/article/abs/pii/S0967066126001346)** (Burgaud et al., 2026). Head-to-head of perfect-foresight optimum, MPC, rules and three RL agents on real battery control. Closest to your benchmark idea; copy its comparison design.
4. **[Optimizing peak shaving through stochastic programming and probabilistic forecasting](https://www.sciencedirect.com/science/article/abs/pii/S2352710224007319)** (2024). Shows that planning over forecast uncertainty beats single-number forecasts, and that load forecast quality drives battery value. The heart of your gap.
5. **[Advances in Battery Energy Storage Management: Control and Economic Synergies](https://arxiv.org/html/2602.06365v1)** (arXiv 2026). Battery wear as an economic cost, and conflicts when stacking peak shaving, arbitrage and grid services.
6. **[The CityLearn Challenge: Four Years of Common Task Frameworks](https://dl.acm.org/doi/10.1145/3679240.3734667)** (ACM e-Energy 2025). What actually won in the main open benchmark (hybrids of MPC and learning) and lessons for running a benchmark. Read before touching CityLearn.
7. **[Benchmarking Time Series Foundation Models for Load Forecasting Under Covariate Uncertainty](https://arxiv.org/html/2610.07232v1)** (arXiv 2026). Chronos-2, TimesFM 2.5, Moirai 2.0, TiRex vs trained models; Chronos-2 leads. Picks your forecasting module.
8. **[Getting Closer to Reality? Peak-Shaving with Battery Systems in Commerce](https://www.atlantis-press.com/article/125987292.pdf)**. Simple controllers with realistic forecasts on commercial load; shows how forecast choice changes peak capture. A model for honest evaluation.
9. **[Optimal BESS Management for Peak Shaving and Battery Health Under Prediction Uncertainty](https://www.researchgate.net/publication/393416094)**. Stochastic MPC that balances peak shaving against battery health. A concrete template for your best controller.
10. **[The Challenges of Using RL for Controlling Industrial Energy Systems](https://arxiv.org/html/2605.31044v1)** (arXiv 2026). A real deployment where RL stays stable but underperforms its simulation. Evidence for the sim-to-real pain point.
11. **[Safe RL for Power System Control: A Review](https://arxiv.org/abs/2407.00681)**. How to make RL respect hard limits (safety layers, shielding, projection). Read when you add an RL controller.
12. **[Degradation-aware BO-MILP sizing for peak shaving and demand response](https://www.sciencedirect.com/science/article/pii/S0196890425014712)** (Oak Ridge, 2026). Couples dispatch with an electrochemical aging model; finds oversized batteries waste money through idle aging.
13. **[ACN-Sim: Open-Source Simulator for EV Charging Research](https://arxiv.org/abs/2012.02809)** (Caltech). Realistic EV charging with three-phase limits and real session data. Your EV-site configuration reference.
14. **[AI-Driven Virtual Power Plants: A Comprehensive Review](https://www.mdpi.com/1996-1073/19/4/1084)** (Energies 2026). Overview of AI methods in VPPs and open issues: data quality, interpretability, scalability.
15. **[To Defer or To Shift? AI Data Center Flexibility and Grid Interconnection](https://arxiv.org/html/2604.05376v1)** (arXiv 2026). How deferrable and location-shiftable compute loads act as flexibility. Your data center configuration reference.

---

## 8. Open problems and pain points

| # | Pain point | Who feels it | Evidence | Opportunity |
| --- | --- | --- | --- | --- |
| 1 | **Sim-to-real gap.** Controllers underperform their simulated promises | Operators, investors | Real RL deployment shows significant gap vs simulation \[S\]; many systems miss ROI due to rigid EMS \[S\] | Honest, realistic benchmarks with messy data |
| 2 | **Forecast error kills peak shaving.** One missed peak can wipe a month of savings | C&I sites, EV hubs | Forecast quality directly drives results \[S\] | Probabilistic forecast plus stochastic MPC, closed loop |
| 3 | **Trust and bankability.** Black-box AI is hard to underwrite | Investors, site owners | RL lacks guarantees \[S\] | Interpretable controllers, savings verification |
| 4 | **Value stacking conflicts** | Battery owners | Needs priority-based frameworks, immature \[S\] | Priority-aware multi-service scheduler |
| 5 | **Degradation as cost** | Battery owners | Usually treated as constraint not cost \[S\] | Wear-priced dispatch; matters most for frequent low-margin cycling |
| 6 | **Integration cost.** Every site has different hardware and protocols | Integrators | Proprietary systems block deployment \[S\] | Hardware-agnostic adapters (out of scope initially) |
| 7 | **Fair revenue allocation in VPPs** | Aggregators | Named a major open challenge \[S\] | Fast, fair allocation methods |
| 8 | **Cybersecurity of aggregators** | Grid operators | Standards only partially adapted \[S\] | Longer term |
| 9 | **Benchmark fragmentation.** Papers are hard to compare | Researchers | Standardisation called a central need \[S\] | Your benchmark |

---

## 9. Where you can be new

The combination that looks under-served:

> **An open, configurable site simulator plus an honest benchmark of controllers (rules, MPC, stochastic MPC, hybrid, safe RL) driven by foundation-model probabilistic forecasts, measured under increasing forecast error, with battery wear priced in, and explained visually.**

Why it is novel: each piece exists, but the **closed loop from modern probabilistic forecast to control to money and wear**, evaluated honestly across configurations, is thin \[S/K\]. It is also employer-neutral and maps cleanly to EV charging by configuration.

Audiences:

- **Research groups:** reproducible benchmark plus a paper on value of probabilistic forecasts for control
- **Startups and employers:** proves depth in forecasting, optimisation and systems
- **Investors:** seed of a "trust layer" product: verify and de-risk EMS performance before deployment

---

## 10. Roadmap

1. **Phase 0, learn (2 to 3 weeks):** read papers 1, 2, 4, 5, 9. Run EMHASS and CityLearn locally.
2. **Phase 1, core simulator:** generic asset model (battery, PV, flexible load, grid limit), real price and load data, rule-based and deterministic MPC controllers.
3. **Phase 2, uncertainty:** add Chronos-2 forecasts, stochastic MPC, reserve logic, real-time safety layer. Sweep forecast error.
4. **Phase 3, wear and stacking:** degradation cost, multi-service priorities.
5. **Phase 4, configurations:** home, C&I with EV fleet, data center.
6. **Phase 5, website:** 2D dashboard first, then 3D scene and concept explainers with open problems flagged.
7. **Phase 6, user scenarios:** let visitors upload or configure their own site.

**Before going public:** get a short written okay from your manager or HR that the project is generic, uses open data, and is unrelated to ABB products.

---

## 11. Data centers: deep dive (checked 2026-11-08)

**Why they matter.** US data centers used about 4.4% of US electricity in 2023 and could use 6.7 to 12% by 2028
(LBNL, *2024 United States Data Center Energy Usage Report*, LBNL-2001637, via DOE) \[S\]. Grid connection queues,
not chips, are now a main limit on new AI capacity, which is why "flexible" data centers get faster connections
(Chen and Zheng, arXiv 2604.05376: flexible AI load cuts grid investment and operating cost by 3 to 21% depending on
location) \[S\].

**Consumption.**

- *IT load* (servers, storage, network) is most of it. Cloud and HPC halls run at a high, fairly flat level; AI
  training adds large, fast swings as jobs start and stop. Measured: the NLR/NREL ESIF HPC data center averaged
  2.9 MW in Apr-Aug 2024, varied by only about ±1% over the day on average, but 0.1% of 15-min steps jumped by more
  than 650 kW (our analysis of the open dataset) \[S\].
- *Cooling and overhead* = IT x (PUE - 1). The 2025 weighted average PUE is **1.54** and has barely moved for six
  years (Uptime Institute Global Data Center Survey 2025, Fig. 2, n=681) \[S\]. Best-in-class liquid cooling is
  near 1.05 (ESIF measured 1.07-1.08) \[S\]. Cooling rises with outdoor temperature, so summer afternoons are the peak.
- *Load factor* (average / peak) is high: 0.81 for ESIF IT load with typical cooling in June 2024 (our analysis). A
  high load factor leaves little "peak" to shave.

**Electrical layout** (typical, varies by tier): utility feed at medium voltage -> transformers -> switchgear with an
automatic transfer switch to **diesel generators** -> **UPS** (battery, now mostly lithium-ion LFP) -> power
distribution units -> racks. Tier III sites commonly use N+1 for supply and generation and 2N for UPS and distribution
(arXiv 2602.01013) \[S\]. The UPS only bridges until the generators take over: generators "can usually start up and
come online in under 50 seconds" and "many data centers are operating with a 5 minute runtime" (ZincFive white
paper, 2024, vendor source) \[S\]. Fuel is commonly stored for 24 to 72 hours (vendor guide, unverified) \[K\].

**What operators and researchers do today (energy management):**

| Lever | Time scale | Who / evidence | In our engine |
| --- | --- | --- | --- |
| Peak shaving / demand-charge management with a battery | minutes to hours | Standard C&I practice; joint peak shaving + frequency regulation for a 1 MW data center gives more than the sum of both (Microsoft Research, arXiv 1702.08065) \[S\] | Yes: battery with a reserve floor, flat + peak-window demand charges |
| Grid-interactive UPS for fast frequency response | sub-second to seconds | Microsoft + Eaton at Grange Castle, Dublin, bid into EirGrid DS3 by Enel X; "the most lucrative services are related to fast frequency response" (Vertiv) \[S\] | No: below our time step (assume the plan is executed) |
| Shifting compute in time ("carbon-intelligent computing") | hours to a day | Google: day-ahead per-cluster power caps ("virtual capacity curves") (Radovanović et al., arXiv 2106.11750); demand response pilots in Taiwan, Oregon, Nebraska (Google Cloud blog, 2023) \[S\] | Not yet: needs a deferrable-load asset |
| Demand response by job orchestration | hours | Emerald AI field test: 25% less cluster power for 3 hours on a 256-GPU cluster in Phoenix, with QoS kept (arXiv 2507.00909) \[S\] | Not yet |
| Cooling flexibility (thermal mass, setpoints, thermal storage) | minutes to hours | Integrated IT + UPS + cooling MILP, 15-min day-ahead schedule, 10% cost cut for a 1 MW model site (Takci, Day, Qadrdan, arXiv 2511.07159; review in *Energy Reports* 13, 2025) \[S\] | Not yet |
| Generators for demand response | hours | Possible but limited by emissions permits (not researched here) \[K\] | No |

**What we learned from our own scenario** (`configs/sites/operate_data_center.yaml`, June, Xcel Colorado Schedule PG
tariff from OpenEI URDB): demand charges are about 48% of the bill, yet a 4 MWh / 1 MW battery with a simple
constant-threshold rule cuts the bill by only about 1.1%. Below a threshold of 5.3 MW the rule runs the battery down on
long high-load stretches (up to 14 hours) and the monthly peak is not cut at all. **This contradicts the general
claim in section 2 that demand charges make peak shaving "very valuable": for a high-load-factor site, a battery
alone is worth little; the bigger levers are moving compute and cooling.** It is also a clean benchmark case, because
a forecast-based controller should beat the rule clearly (spend energy only in the 14-18 h window that costs 2.4 times
more, and pre-charge before long high stretches).
