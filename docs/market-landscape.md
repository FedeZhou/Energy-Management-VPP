# VPP and energy management market: who does what, and where emsbench stands

Checked 2026-11-08. Companion to [research.md](research.md) (section 6 is the short version of this).

**How to read this:** **\[S\]** = the linked page was read in this pass (2026-11-08) and says this. **\[K\]** = only a
search summary or a single weak source: verify before use. Company numbers (GW, devices, savings) are **the companies'
own claims**, reported by them or by trade press, not independent facts. Funding figures often differ between outlets.

---

## 1. The landscape in one picture

The money in 2026 is mostly going into **residential** flexibility, sold as a bundle (hardware + tariff + fleet
trading), and into **battery trading** for large batteries. Pure software for C&I sites and planning tools is smaller.

| Segment | What they sell | Examples (2026) | Their moat |
| --- | --- | --- | --- |
| **Integrated home VPP** | Home battery or solar, an electricity tariff, and an app; the company trades the fleet | Base Power (Texas: owns the batteries; customer pays an install fee and a monthly fee and buys retail power from Base; the fleet is bid into ERCOT energy markets) \[S\]; Lunar Energy ($232M Series C+D, Feb 2026; Gridshare software, 650 MW of devices under management) \[S\]; 1KOMMA5° (Heartbeat AI: 1 GW of shiftable capacity, May 2026; 300,000+ systems installed; 20 GW target by 2030) \[S\], FCR-D in Sweden \[K\]; Rabot Energy ($50M Series B, Oct 2026; 200,000+ customers; plug-in battery for renters + dynamic tariff) \[S\]; Octopus / Kraken (2 GW, 500,000+ home devices, July 2025) \[S\]; Tibber (Grid Rewards, Germany, Sept 2026: EV charging traded on the intraday market) \[S\]; Amber Electric (€49M Series E, expanding to EU/US) \[K\] | Customers, hardware, retail licence, market access |
| **Aggregator / flexibility operator** | Pays homes and businesses for flexibility, sells it to grid operators and data centers | Voltus ($225M Series D, Oct 2026; about 8.5 GW on its platform, 20 GW target by 2030; sells home and business capacity to data centers, e.g. up to 100 MW a year for Google in PJM) \[S\]; Axle Energy (€21M Series A, Jul 2026; connects EV chargers, batteries and heat pumps, forecasts their availability, bids, dispatches and settles) \[S\]; Renew Home with Sunrun and Tesla (16.8 GW framework, of which about 9 GW thermostats and 7.8 GW batteries; analysts doubt the firm share) \[S\]; Hybrid Greentech (€15M) \[S\] | Utility and market contracts, device fleet |
| **Utility platforms (DERMS / VPP software)** | Software utilities use to run their own programmes | EnergyHub, Uplight (bought AutoGrid; closed early 2024), Generac (ex-Enbala), Itron \[K\] | Utility procurement, long contracts |
| **Device connectivity** | One API to read and control many brands of EV, charger, heat pump, battery | Enode (one API for batteries, EVs, chargers, heat pumps / HVAC, inverters, meters; $15M Series A) \[K\] | Integrations with hundreds of models |
| **Battery traders (merchant / large BESS)** | Optimise and trade large batteries across day-ahead, intraday and reserves (FCR, aFRR) | Entrix (€43M, Mar 2026; 3 GW / 8.5 GWh contracted, 2 GW live in 2026) \[S\]; enspired (intraday continuous, FCR, aFRR, imbalance; >1 GW in 10+ markets per Modo) \[S\]; Capalo AI (1.6 GW managed, 500 MW live, per Modo) \[S\]; suena \[K\] | Trading desk, market models, track record |
| **C&I site optimisers** | Peak shaving, self-consumption and trading for business batteries | Furo ($4M, Sept 2026; forecasts prices and weather about two days ahead; 6,000+ sites) \[S\]; Companion.energy \[S, from research.md\] | Installer channels |
| **Planning / modelling** | Feasibility, sizing and cash-flow models for batteries and flexible assets | Gridcog (multi-market, multi-site, multi-asset project simulation for feasibility \[S\]; Series A, Jul 2026 \[K\]); HOMER, PVsyst \[S, research.md\] | Bankable reports |
| **Multi-family / energy sharing** | Tenant electricity (Mieterstrom), energy-sharing communities | neugemacht (platform + metering for sharing communities) \[K\]; ecoworks (retrofit + PV + heat pumps) \[K\] | Regulation know-how, metering role |
| **Open source** | Local home EMS | evcc (local-first; controls chargers, heat pumps and home batteries \[S\]; about 7k GitHub stars \[K\]); EMHASS, OpenEMS \[S, research.md\] | Community |

**Market pattern.** The winners own the **customer and the hardware** (Base, Lunar, 1KOMMA5°) or the **utility
contract** (EnergyHub, Uplight, Voltus). Every one of them claims AI-driven savings, and none of them publishes an
independent, reproducible comparison of their controller against simple rules. That is the gap emsbench was built
for (research.md section 9), and the 2026 landscape makes it more relevant, not less.


### 1b. Side by side: what they do and what our simulator does

"Site Lab today" means this repository in November 2026 (single site, rules plus an MPC on perfect or realistic forecasts, open data;
heat pump, bidirectional charging, §14a dimming and time-variable network fees added on 2026-11-09). The in-app
Learn page has the same table with a link to each company's website.

| Company | What they do (their claims) | What Site Lab can simulate of it today | Biggest missing piece |
| --- | --- | --- | --- |
| Base Power | Own home batteries, sell retail power, bid the fleet into ERCOT \[S\] | One home battery on a price profile (rules or MPC) | Fleet + market model |
| Lunar Energy | Home batteries + Gridshare VPP software, 650 MW managed \[S\] | The single home (battery, solar, EV, heat pump) | VPP layer |
| 1KOMMA5° | Optimise solar, battery, heat pump, AC, wallbox; pool 1 GW \[S\] | Solar, battery, wallbox, heat pump with tank on one site (rules) | Pooling, air conditioning |
| Rabot Energy | Dynamic tariff + smart meter + plug-in battery for renters \[S\] | Dynamic prices, German time-variable network fees, a small battery | Nothing essential (configurable today) |
| Kraken (Octopus) | Schedule EV charging and heating for 500k+ devices \[S\] | EV and heat-pump strategies for one site | Fleet |
| Tibber Grid Rewards | Trade EV charging on the intraday market \[S\] | EV charging on day-ahead / 15-min prices | Intraday market |
| Renew Home + Sunrun + Tesla | Thermostats + batteries, up to 16.8 GW (framework) \[S\] | Batteries; a heat pump with a tank (closest to thermostat pre-heating) | Fleet, opt-outs |
| evcc (open source) | Local home EMS for chargers, heat pumps, batteries; cheapest-hour charging \[S\] | Similar strategies (incl. heat pump), simulated | Real hardware (not our goal) |
| Voltus | Aggregate business + home flexibility, ~8.5 GW; capacity for data centers \[S\] | One business / data center site with peak shaving | Capacity products, aggregation |
| Axle Energy | Connect, forecast availability, bid, dispatch, settle \[S\] | Dispatch only, on perfect or realistic forecasts | Bidding, availability forecasting |
| Furo | Business batteries on ~2-day price and weather forecasts \[S\] | Business batteries with rules or MPC on realistic forecasts (yesterday's load, archived weather forecasts, published prices) | Better forecast models |
| Entrix, enspired, Capalo | Trade large batteries on intraday and reserves (FCR, aFRR) \[S\] | Energy-price arbitrage | Reserves, intraday |
| Gridcog | Multi-market, multi-site, multi-asset project simulation for feasibility \[S\] | Plan mode: a year of one site, costs vs baseline | Multi-site, cash flow (but we are open and compare controllers) |

---

## 2. What they can do that emsbench cannot (yet)

emsbench is a **simulator and benchmark**, not an operator. So the useful question is: *which behaviours do these
companies rely on that our simulator cannot represent?* If we cannot simulate it, we cannot benchmark it.

| # | Capability | Who relies on it | emsbench today | Gap size | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | **Forecast-driven control** using price, solar and load forecasts | Everyone with "AI" in the pitch (Heartbeat, Gridshare, Furo, traders) | Deterministic MPC (`sim/mpc.py`) with **perfect or realistic** forecasts (`sim/forecasts.py`: yesterday's load, archived day-ahead weather forecasts for solar, prices once published, cars once plugged in) and a "Compare forecasts" view; in the June home week the MPC cost €13.42 with perfect and €22.13 with realistic forecasts vs €13.45 for the self-consumption rule (our runs, 10 Nov 2026) | Medium | **High**: better forecast models, probabilistic forecasts and an error sweep are missing |
| 2 | **Fleet / portfolio aggregation**: many homes behind many meters, bid as one | All residential VPPs and aggregators | One site, one meter | Large | **High**: needed for "residential at scale" (section 3) |
| 3 | **Heat pumps and thermal storage** (comfort as a constraint) | 1KOMMA5°, Axle, Kraken, Renew Home (thermostats are over half its 16.8 GW) | **Built 2026-11-09**: heat pump asset (When2Heat heat demand + COP, hot-water tank, unmet heat reported), rule strategies; not yet in the MPC; no building thermal model | Small (remaining) | MPC scheduling of the tank |
| 4 | **Reserve markets** (FCR, aFRR) and value stacking with energy trading | enspired (FCR, aFRR), 1KOMMA5° (FCR-D, unverified), Capalo | Energy price and demand charges only | Medium | Medium: needs a 1-15 min reserve model and availability penalties |
| 5 | **Grid operator signals**: Germany's §14a (since 2024 the grid operator may dim new heat pumps, wallboxes, air conditioners and storage, but never below 4.2 kW per device; time-variable network fees, "Modul 3", since April 2025 with a smart meter) \[S\]; local flexibility markets (GOPACS, Piclo) \[S\] | German HEMS vendors, Tibber, aggregators | **Built 2026-11-09**: §14a dimming (direct / EMS, per BNetzA BK6-22-300 Anlage 1) in a daily stress-test window; Modul 3 fees from two real 2026 price sheets. Local flexibility markets: not yet | Small (remaining) | Local flexibility markets with the neighbourhood step |
| 6 | **Bidirectional EV (V2H / V2G)** | BMW + E.ON (V2G, unveiled 2025), BMW + SOLARWATT (V2H, late 2026 in DE/AT/NL), VW Elli (V2G package for Germany, shown 2026) \[S\] | **Built 2026-11-09**: bidirectional chargers; a car lends energy only while it can still reach its target, within a per-visit cap; rule discharges only when it pays after losses. Not yet in the MPC | Small (remaining) | MPC with car discharge |
| 7 | **Battery wear as a cost** | Traders and battery-as-a-service (they carry the warranty risk) | Cycle count only (a proxy) | Medium | High: already Phase 3 |
| 8 | **Customer behaviour**: opt-outs, comfort overrides, enrolment churn | Thermostat and EV programmes (the 16.8 GW is a framework with no contracts signed yet; analysts doubt the firm share) | Assumes full compliance | Medium | Medium: matters at fleet scale |
| 9 | **Revenue sharing** between operator and households | All residential VPPs | None | Small | Low: research.md pain point 7 |
| 10 | **Real devices and telemetry** | Everyone | Open data only, no hardware | n/a | **Out of scope** (research.md: hardware-agnostic adapters are out of scope); not our business |

**Not gaps to chase:** hardware, retail licences, device APIs, customer acquisition. These are the startups'
moats, and copying them would turn emsbench into a weaker version of a funded company.

---

## 3. Residential at different scales

The user's direction (2026-11-08): cover residential energy management **at several scales**, not only C&I. The
scales differ in what is being optimised and which constraint binds:

| Scale | Example | Who decides | Binding constraint | emsbench today |
| --- | --- | --- | --- | --- |
| **1. Home** | House with PV, battery, wallbox, heat pump | Home EMS (evcc, 1KOMMA5° Heartbeat, Tibber) | Fuse / connection, comfort, departure times, §14a dimming | **Yes, with rules** (heat pump, V2H, §14a and network fees added 2026-11-09) |
| **2. Building** | Apartment block, shared garage, tenant electricity | Building EMS, energy-sharing platform | Building connection, phase balance, fair split between tenants | **Partly** (the shared-garage and apartment examples; no per-tenant billing) |
| **3. Neighbourhood / feeder** | 50-200 homes on one low-voltage transformer, energy community | Grid operator, community operator | Transformer and feeder limits; simultaneous EV and heat pump peaks | **No**: needs several sites under one shared limit |
| **4. Portfolio (VPP)** | 10,000+ homes across a country | Aggregator / VPP operator | Market bids and delivery, forecast error of the whole fleet, opt-outs | **No**: needs a fleet layer and an aggregator controller |

Scales 1 and 2 are the engine we have. Scales 3 and 4 need a layer **above** the single site. This is a big design
choice, so here are the options (CLAUDE.md: options before big choices):

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| **A. Fleet of sites + aggregator controller** (recommended) | Generate N homes by sampling from distributions (load profile, PV size, battery, EV, heat pump, behaviour). Run each through the existing engine; an aggregator controller sends each home a target or price signal and sums the result. An optional shared transformer limit gives scale 3. | Reuses the site engine and data; shows diversity and coincidence (homes don't peak together), opt-outs and forecast error of a fleet; fast if vectorised | No voltages or line losses; a home's controller must accept outside signals (an interface change) |
| **B. Network model** (e.g. pandapower power flow on a real low-voltage feeder) | Homes as loads on a feeder model; power flow each step | Voltage and line limits, the real DSO concern | Much heavier; needs feeder data; overkill before A exists |
| **C. One "super-site"** (scale one home's profile by N) | Multiply a single site | Trivial | Wrong: loses diversity, so it overstates peaks and flexibility. Useful only as a counter-example |

**Recommendation: A first, with a simple transformer limit for scale 3; B later and optional.** A keeps the
"generic core" rule (homes are still configs), and a fleet benchmark is exactly what no startup publishes: *"how much
of the claimed fleet flexibility survives forecast error, opt-outs and a transformer limit?"*

---

## 4. Steps: how to bring what they do into emsbench

The principle: **we reproduce their behaviour in simulation so we can measure it, not their product.** Each step
below is a deliverable that unlocks a new benchmark question. Step 1 comes first: an MPC that sees the future perfectly is an
upper bound, not a fair stand-in for a commercial "AI" controller (realistic forecasts landed on 10 Nov 2026 and showed exactly
that: the June-week MPC went from €13.42 to €22.13, worse than the simple rule).

| Step | What we build | What it lets us benchmark | Whose behaviour it reproduces | Size |
| --- | --- | --- | --- | --- |
| **0. Done** | Single site, rule controllers and a perfect-forecast MPC, open data, Plan / Operate, phases and fuses, demand charges, scene view | Rules and MPC vs baseline on one site | Simple home and C&I EMS | n/a |
| **0b. Done (2026-11-09)** | A complete home with rules: heat pump + tank (When2Heat), V2H, §14a dimming, Modul 3 network fees; example `operate_home_heatpump_v2h` | Value of pre-heating, of a car as a home battery, of network-fee timing; cost of dimming | 1KOMMA5°, Tibber, Octopus, Rabot, BMW + E.ON, VW Elli | n/a |
| **1. Forecasts + error harness** | **Started (Nov 2026):** realistic persistence-style forecasts and "Compare forecasts" (`sim/forecasts.py`). Next: seasonal naive, then a time-series foundation model such as Chronos-2 for probabilistic forecasts; a sweep that degrades forecasts step by step | How much each controller loses as forecasts get worse | The forecasting half of every "AI" claim | Medium |
| **2. MPC** | **Started (Nov 2026):** rolling-horizon LP with grid limit, fuses, demand charges and EV deadlines (`sim/mpc.py`, EMHASS-style). Runs on perfect or realistic forecasts (Nov 2026); next: stochastic/robust variants and wear in the objective | Rules vs MPC vs perfect foresight, with honest forecasts | 1KOMMA5° Heartbeat, Lunar Gridshare, C&I optimisers like Furo | Small (remaining) |
| **3. A complete home, in the MPC** | The rule-based parts are done (row 0b); remaining: heat-pump tank and car discharge as MPC decision variables, and optionally a building thermal model with a comfort band | The same questions with an optimiser instead of rules | 1KOMMA5°, Tibber, Octopus | Small-medium |
| **4. Building scale** | Several meters behind one connection: per-flat billing, tenant electricity / energy-sharing split, shared EV chargers with a fairness rule | Who gains in a shared building, and whether a shared battery pays | neugemacht and other energy-sharing platforms, Rabot (renters) | Small-medium |
| **5. Fleet layer (option A)** | Population generator (homes sampled from open data distributions), aggregator controller that sends price or setpoint signals, an opt-out and override model, fleet KPIs (fleet peak, coincidence factor, delivered vs promised flexibility) | How much promised fleet flexibility is real after diversity, forecast error and opt-outs | Kraken, Voltus, Renew Home, Base Power, Axle | Large |
| **6. Neighbourhood** | Shared transformer limit across homes; grid-operator flexibility requests as events; later, optionally, a feeder power-flow model (pandapower) | Whether smart charging and heat pumps overload a street, and what a flexibility market request is worth | Piclo / GOPACS-style local flexibility markets, grid-edge devices such as SPAN Edge | Medium (large with power flow) |
| **7. Markets and value stacking** | Reserve products (FCR / aFRR capacity with availability rules), intraday prices, battery wear priced as a cost, revenue split between operator and households | Stacking energy trading with reserves, and who should get the money | Entrix, enspired, Capalo, 1KOMMA5° (FCR-D) | Large |
| **8. The trust report** | A public, reproducible scoreboard: every controller on every scale, under the same forecast error, with wear priced in | "Is a claimed saving real?", the question no company answers publicly | Our niche (research.md section 9) | Ongoing |

**Dependencies.** 1 before the MPC results count. 2 before 3-7 (a heat pump or a fleet with rule control proves little). 5 before 6.
4 and 3 are independent of each other. Steps 3 and 4 can start with rule controllers if MPC slips, but their
results must be labelled "rules only".

**What we deliberately don't build:** device APIs and hardware integrations (Enode, Kraken), retail tariffs and
customer apps (Tibber, Octopus), a trading desk (Entrix). These are businesses, not simulator features.

---

## 5. Things that update or contradict research.md

- research.md section 2 ranks home energy "High for learning and demo, low for startup". That is still true for
  *selling* a home EMS (the field is crowded and hardware-led), but the 2026 money shows residential flexibility is
  where the market is moving. Our **benchmark of residential fleets** is not crowded. This is a shift in emphasis, not
  a contradiction of facts.
- research.md section 6 lists AutoGrid separately: it has been part of Uplight since early 2024 \[K\].
- research.md roadmap Phase 1 lists deterministic MPC as future work: a first version now exists (`sim/mpc.py`).
- research.md section 6 says Capalo has "1 GW+ contracted"; Modo Energy reports 1.6 GW managed, 500 MW live \[S\].

---

## 6. Integrated energy suppliers: a different business

Checked 2026-11-09. **These companies are not doing what emsbench does, and not exactly what the VPPs in section 1
do either.** They are **electricity suppliers** (retailers with a supply licence, a tariff and a customer app) that add
generation, trading and device control on top. Their product is the customer's energy bill. Device control is one
feature among many, and they often buy it in. emsbench is a simulator and benchmark: it sells nothing to households
and holds no licence. The reason to track these companies is that they are the **biggest users of the control
strategies we benchmark**: their margins depend on how well they forecast and shift demand.

| Company | What it is | What it does that touches our topic | Scale (company claims) |
| --- | --- | --- | --- |
| **Fuse Energy** (UK, founded 2022) | Electricity and gas supplier with its own solar farms (4-25 MW projects, one 0.8 MW wind turbine) and an in-house trading desk; app and 24-hour chat, no call centre \[S\] | The trading desk buys and balances power with machine-learning forecasts from weather and household consumption \[S\]. Smart EV tariff (5p/kWh in set hours): the customer enters a departure time and target charge in the app; device access (charge level, start/stop) comes from Enode's API \[S\]; charger partnership with Easee, which gives access to Easee's VPP platform \[S\] | About 50,000 homes (Jul 2025), 200,000 (Dec 2025), 300,000+ (Jun 2026); $70M at about $5bn valuation (Dec 2025), $30M more (Jun 2026) \[S, via Wikipedia citing FT/Bloomberg/Times\]; expansion to Ireland, Spain, US announced \[S\] |
| **Octopus / Kraken** (UK) | Supplier whose software arm is now a separate company: an "AI-powered operating system for utilities" \[S\] | Kraken runs billing and device flexibility for Octopus and other utilities (2 GW of home devices, section 1) | Kraken spun out with about $1bn raised at $8.65bn (Jan 2026) \[S\] |
| **Enpal** (Germany) | Solar, battery, heat pump and wallbox installer (rental model) with its own tariff (Enpal Energy), home EMS (Enpal.One), AI unit (Flexa) and smart meters (Metrify) \[S\] | June 2026: opens its tariff and VPP to households without Enpal hardware, offers its AI operations platform and installation services to other companies; target 500,000 households moved from fixed feed-in to direct marketing by 2030 \[S\] | Revenue over €600M in H1 2026, over €1.3bn expected for 2026 \[S\]; VPP "600 MW, 1 GW by end 2026" \[K: job ad only\] |
| **sonnen** (Germany) | Home battery maker with a community tariff (sonnenCommunity) and VPP \[K\] | Supplies frequency reserve (FCR) with home batteries since 2018, marketed through Next Kraftwerke \[K\] | 250 MWh of batteries in its German VPP (Feb 2025) \[K\]; sold by Shell to TIVEN \[K\] |
| **Ostrom** (Germany) | Digital supplier with a dynamic tariff \[K\] | App that monitors and automates EVs, chargers, solar and batteries \[K\] | €20M Series B (Jun 2025), over €40M raised in total \[K\] |

**What they have in common.** They win on **customers, tariff design and cost of service**, not on control
algorithms. Device control is bought through APIs (Enode) or partners (Easee) and then pooled into a VPP. The software
is becoming a business of its own: Kraken was spun out, and Enpal now sells its platform to others.

**What this means for emsbench:**

1. **Their results depend on imperfect information.** Fuse's margin depends on its forecasts; its EV control depends
   on the departure time and target a customer types in. Our first results show how much this matters: in the June
   home week, the MPC cost €13.42 with perfect forecasts but €22.13 with realistic ones (yesterday's load, archived
   weather forecasts, prices once published, cars only once plugged in), worse than the simple self-consumption rule
   at €13.45. Most of the gap came from not knowing when cars arrive (worth €5.94), then solar (€1.75) and load
   (€0.52); prices cost nothing, since day-ahead prices are published in advance (our runs, 10 Nov 2026). Knowing
   the car's plan is exactly what Fuse asks its customers for in the app. This is the forecast-error question at the
   centre of emsbench.
2. **Time-window tariffs synchronise fleets.** With hundreds of thousands of customers on the same cheap window, the
   rebound peak we measured in the shared-garage example (56 A to 63 A when every car started at the cheapest moment)
   becomes a fleet-scale effect. This argues for the fleet layer (step 5, option A, not yet approved).
3. **Nobody publishes controller results against a fair baseline.** These companies publish customers, gigawatts and
   valuations. How much each control strategy is worth, and how much survives real forecasts, remains unmeasured in
   public.

---

## 7. Does emsbench still make sense?

**Short answer: yes, as an independent benchmark and learning tool; no, as a competitor to these companies.**

**Where we are (2026-11-09).** Site Lab simulates one site at a time (home, garage, office, data center) on open
measured data, with rule controllers and a deterministic MPC that plans on perfect or, since 10 Nov 2026, realistic
forecasts (in the June home week: €13.42 perfect, €22.13 realistic, vs €13.45 for the self-consumption rule). It has
batteries, solar, EV chargers including bidirectional ones (V2H/V2G), a heat pump asset (When2Heat data), a data
center asset, German §14a dimming (BNetzA BK6-22-300, Annex 1) and time-variable network fees (Modul 3) from two real
2026 price sheets, plus demand charges and fuses. Not yet: forecasts with errors, battery wear in the objective, a
fleet layer, reserve markets.

**Why it still makes sense:**

- **The open question is real.** Every company in sections 1 and 6 depends on control under uncertainty, yet the
  published evidence says the gain is site-dependent: on real home hardware, rules, decision trees and MPC ended within
  0.6% of each other (research.md, Ruddick et al. 2024); in our own runs, a data center battery with a fixed rule saved
  only 1.1%, while cheapest-hour charging in a garage created a new peak. A benchmark that shows *where* smarter control
  pays, and how much survives forecast errors, answers a question these companies face but do not publish.
- **Platforms are now sold to others** (Kraken, Enpal). Buyers of such platforms need ways to compare them.
- **It is a good way to learn the field** with real data and explicit assumptions, which was the starting goal.

**Why it might not, and what to watch:**

- **A simulator is not an energy business.** The money is in customers, licences, hardware and market access. emsbench
  should not try to become a home EMS or a supplier.
- **Open tools already exist** (EMHASS, evcc, OpenEMS, CityLearn). emsbench must stay different: an honest comparison
  under forecast error, with battery wear priced as a cost and real open data, not another controller.
- **For single homes the gains can be small**, so the interesting results are likely at C&I sites with demand charges,
  in fleets, and under realistic forecasts, not in a perfect-foresight single home.
- **Without real fleet or market data, results stay simulated** and must be labelled as such.

**Proposed focus (in order):** (1) realistic EV plans, where controllers get the user-entered departure and target,
with errors, instead of the truth; (2) the forecast-error harness, so every controller runs on imperfect forecasts (realistic persistence-style
forecasts and "Compare forecasts" exist since 10 Nov 2026; better forecast models and an error sweep are still to do);
(3) a supplier view: margin = tariff revenue minus wholesale cost, to show who keeps the savings; (4) the fleet layer
(option A) once the user approves it.

---

## Sources

- Rabot Energy €50M: https://tech.eu/2026/10/15/rabot-energy-secures-50m-to-transform-homes-into-a-virtual-power-plant/
- Voltus $225M: https://thenextweb.com/news/voltus-225m-series-d-virtual-power-plant
- Lunar Energy $232M: https://www.lunarenergy.com/blog/lunar-energy-raises-232-million-to-scale-home-battery-deployments-and-ai-powered-vpp-software
- Renew Home / Sunrun / Tesla 16.8 GW: https://pv-magazine-usa.com/2026/06/25/sunrun-tesla-renew-home-announce-plans-for-16-8-gw-virtual-power-plant-program/ ; caveats: https://www.tftc.io/tesla-sunrun-renew-home-16gw-vpp-ai-data-centers/
- 1KOMMA5° Heartbeat >1 GW: https://1komma5.com/en/press/press-releases/1komma5-hits-gigawatt-milestone-with-its-heartbeat-ai-virtual-power-plant/ ; FCR-D Sweden: https://www.enlit.world/library/germany-s-1komma5-to-provide-frequency-control-power-in-sweden
- Kraken 2 GW: https://www.kraken.tech/press-releases/residential-vpp-hits-2gw
- Tibber Grid Rewards: https://www.electrive.net/2026/09/11/tibber-startet-grid-rewards/
- Axle Energy, Hybrid Greentech: https://www.eu-startups.com/2026/07/as-power-demand-rises-from-electrification-and-data-centres-londons-axle-energy-raises-e21-million-for-energy-flexibility/ ; https://www.eu-startups.com/2026/02/danish-startup-hybrid-greentech-attracts-e15-million-investment-to-accelerate-european-grid-flexibility-rollout/
- Amber Electric (aggregator): https://valueaddvc.com/pulse/amber-electric-49m-series-e-home-battery-2026
- Base Power model: https://www.canarymedia.com/articles/batteries/base-power-offers-texans-big-backup-batteries-no-purchase-necessary ; 2026 battery: https://www.ess-news.com/2026/08/05/base-power-launches-39-2-kwh-us-made-home-battery/
- Uplight completed the AutoGrid acquisition (early 2024): https://www.businesswire.com/news/home/20240209846972/en/
- Enode (device categories from https://platform.enode.com): https://kurrant.com/kurrantly-news/oslo-based-enode-raises-15m-series-a-to-scale-energy-device-connectivity-api/
- Entrix €43M: https://www.eu-startups.com/2026/03/europes-push-for-resilient-flexible-power-systems-fuels-e43-million-round-for-germanys-entrix/
- enspired: https://www.enspired-trading.com/bess ; Capalo and Polish optimisers: https://modoenergy.com/research/en/who-are-the-polish-optimisers-and-how-to-find-them
- Furo: https://mercomcapital.com/furo-raises-4-million-to-expand-battery-optimization-platform/
- Gridcog: https://gridcog.com (product) ; Series A: https://www.thesaasnews.com/news/gridcog-raises-10m-series-a/
- Energy sharing (Germany, vendor source): https://neosenergy.framer.website/resources/knowledge-hub/energy-sharing-germany ; neugemacht: https://www.neugemacht.com/en/energy-sharing-with-a-fresh-new-look/
- evcc: https://evcc.io/en/ ; https://ideaproof.io/open-source/project/evcc ; https://www.linux-magazine.com/Issues/2026/313/Managing-Power-with-evcc
- §14a EnWG: https://42watt.de/magazin/paragraph-14a-enwg ; https://www.vattenfall.de/variable-netzentgelte-modul-3 ; BDEW guidance: https://www.bdew.de/service/anwendungshilfe-fuer-die-umsetzung-von-modul-3-der-festlegung-bk8-22010-a-nach-14a-enwg/
- V2G / V2H launches: https://www.powertodrive.de/news/v2h-and-v2g
- Local flexibility markets: https://www.piclo.energy/press-releases/piclo-to-deliver-italys-first-local-flexibility-market-with-e-distribuzione ; https://flex-wiki.pages.dev/wiki/source-local-flexibility-markets-in-europe-critical-review-2025
- Fuse Energy (company history, customers, funding, generation, trading desk; Wikipedia citing FT, Bloomberg, The Times and Ofgem records): https://en.wikipedia.org/wiki/Fuse_Energy ; $5bn round: https://www.uktech.news/news/fuse-energy-raises-70m-at-5bn-valuation-20251218
- Fuse EV charging via Enode: https://enode.com/customers/fuse ; Fuse and Easee (5p/kWh EV rate, VPP access): https://www.energymanagermagazine.co.uk/easee-and-fuse-energy-partner-to-launch-the-uks-lowest-ev-smart-charging-rate-and-fast-track-home-charger-installation/
- Kraken spin-out ($8.65bn, about $1bn): https://www.skadden.com/about/news-and-rankings/news/2026/01/octopus-energy-group-to-spin-out-kraken-at-865-billion-valuation
- Enpal opens its platform (June 2026), revenue: https://www.pv-magazine.de/2026/06/18/enpal-stellt-seine-infrastruktur-anderen-marktteilnehmern-zur-verfuegung/
- sonnen VPP and FCR (search summaries, not read): https://www.enlit.world/library/germany-s-sonnen-announces-250mwh-vpp-as-europe-s-largest ; https://www.enlit.world/library/transnetbw-gives-sonnen-greenlight-for-virtual-power-plant-expansion
- Ostrom Series B (search summary): https://bebeez.eu/2025/06/20/berlin-based-ostrom-raises-e20-million-to-accelerate-germanys-smart-energy-capability/
