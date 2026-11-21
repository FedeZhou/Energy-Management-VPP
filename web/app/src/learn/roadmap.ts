// Limits and roadmap: what Site Lab simplifies, what it cannot simulate yet, and the next steps.
// Same rules as pages.ts: every {id} must exist in a source list, and only statements backed by a cited source
// (company figures are labelled as the companies' own claims).
import type { Page } from "./pages";
import type { Source } from "./sources";

export const ROADMAP_PAGES: Page[] = [
  {
    id: "limits", section: "roadmap", title: "Limits: what Site Lab simplifies",
    summary: "Every simulator leaves things out. Here is everything Site Lab simplifies, and which way each simplification is likely to push the results.",
    blocks: [
      { kind: "p", text: "In plain words: a result is only as trustworthy as its weakest assumption. This page lists them in one place, so you can judge a number before you repeat it. 'Pushes results' says which way each simplification probably biases a comparison, where that is clear." },
      { kind: "h", text: "Data" },
      { kind: "facts", rows: [
        ["Stitched across years and places", "Home loads are measured in 2015-2018, weather, solar and prices are from 2025-2026, the EV visits from Norwegian garages in 2018-2021; each is mapped onto the simulated dates by season and weekday {code_profiles}. Weather-driven load (heating on a cold day) is therefore not aligned with that day's solar and prices. Pushes results: probably understates how often high load, low sun and high prices coincide."],
        ["Solar is modelled, not metered", "From weather with a standard solar model, checked against a long-term reference to about ±10% {pvgis_check}. Two known small biases, measured on the Konstanz profile: the model leaves out the reflection loss on the panel glass (about 2.7% too much solar a year), and it takes the sun's position at the middle of the following quarter-hour although Open-Meteo's radiation is the average of the preceding one (+0.2% a year, about 3% on single steps) {code_pv_bias}. Pushes results: slightly more solar than reality."],
        ["Example sizes are choices", "Solar, battery and charger sizes in the examples are typical choices, not sourced; device parameters are sourced {code_model}."],
        ["Hourly runs average short peaks", "Plan mode averages 15-minute data into hours {code_profiles}. Pushes results: lower peaks and fewer fuse problems than reality."],
      ] },
      { kind: "h", text: "Devices and the grid" },
      { kind: "facts", rows: [
        ["Battery", "Constant efficiency split equally between charging and discharging; no standby consumption or self-discharge; full power at any state of charge {code_engine}. Real home batteries drew 4 to 64 W in standby in a 2026 lab test of 12 systems {htw_inspektion2026}. Pushes results: batteries look slightly better than in reality."],
        ["Exact state of charge", "Controllers know the battery's charge exactly; real systems estimate it {code_engine}."],
        ["One meter, simple phases", "Three-phase devices and the house load are spread evenly over the phases; solar can only be curtailed when an export limit is set {code_engine}."],
        ["Faster than a time step", "Nothing faster than the time step is simulated (inverter control, frequency response); the plan is assumed to be executed exactly {code_engine}."],
        ["Heat pumps and cars under MPC", "The MPC runs heat pumps on demand and never discharges cars; the rules can do both {code_mpc}."],
      ] },
      { kind: "h", text: "Prices and forecasts" },
      { kind: "facts", rows: [
        ["Tariffs", "German home examples: day-ahead price + national average grid fees and taxes + a real supplier's margin (2.50 ct/kWh net) {witten_tariff}; exports earn the EEG feed-in tariff, 7.86 ct/kWh {bnetza_eeg}, but nothing while the spot price is negative, as for new systems with a smart meter {eeg51}. Left out: the monthly base fee (fixed, so it does not change any comparison) and the 60% export cap for systems without a smart meter {eeg9}; dynamic tariffs need a smart meter anyway {mkt_enwg41a}."],
        ["Fixed winter clock", "European data runs on CET all year {code_profiles}. With realistic forecasts, prices are published at 13:00 on that clock, an hour later than reality in summer {code_forecasts}."],
        ["Realistic forecasts are simple", "Load = the most recent day repeated; solar = the forecast made 24 hours ahead even for the next hour, hourly and repeated over 15-minute steps {code_forecasts}. Pushes results: real systems that update forecasts during the day would do somewhat better."],
      ] },
      { kind: "h", text: "Wear" },
      { kind: "facts", rows: [
        ["Two cells stand for all batteries", "Wear comes from ageing models of one LFP and one NMC cell, tested at gentle rates and, for LFP, between 10 and 45 °C {blast_lite} {gasper2023}."],
        ["An empty battery barely ages", "In the LFP model a battery kept empty loses almost no capacity {runs_2026_11c}. The idle baseline starts at 0% (CityLearn's default) and stays there, so it shows almost no wear {code_model}. A real unused battery sits at some charge and ages more, so wear savings measured against 'idle' look a little too good. Real batteries also keep some reserve."],
        ["Prices from 2022", "Default replacement costs are 2022 averages, higher than today's {figgener2023}. Pushes results: wear in euros is overstated."],
        ["Lives capped at 40 years", "Longer lives are priced by the capacity actually lost in 40 years {code_wear}."],
      ] },
      { kind: "h", text: "The optimiser" },
      { kind: "facts", rows: [
        ["Approximations", "The 'off or at least 6 A' charger rule is handled by relax-and-fix, within 2% of the exact solution in our tests; a billing month that changes inside the horizon is treated as one month {code_mpc}."],
        ["Flat wear price", "The MPC decides with one wear price per kWh cycled, calibrated on daily full cycles. It ignores how full the battery is kept (which drives calendar ageing) and, for NMC, how deep the cycles are {code_wear} {runs_2026_11f}; in one setting it made the MPC €0.77 worse than ignoring wear {runs_2026_11c}."],
      ] },
      { kind: "h", text: "How far to trust it: a check against published results" },
      { kind: "p", text: "HTW Berlin simulated a 4 MWh/yr home with 1 kWp of solar and 1 kWh of usable battery per MWh of demand and a simple self-consumption rule: about 30% self-consumption and self-sufficiency without the battery, 59% and 56% with it, and about 270 battery cycles a year {weniger2014}. Site Lab with the same sizes on four measured German homes gives a median of 32% and 33% without the battery, 62% and 58% with it, and 219 cycles {code_validate}. One home that uses most of its power around midday reaches 76% self-sufficiency; HTW reports 43% to 61% across 74 households {code_validate}. Close enough to trust comparisons; not a guarantee for any single home." },
      { kind: "note", tone: "info", text: "When a result matters, check it two ways: over a full year and several homes (the study runner) rather than one week, and with realistic forecasts rather than perfect ones." },
    ],
  },
  // ============================== MARKET AND ROADMAP ==============================
  {
    id: "m-gaps", section: "roadmap", title: "What they do that Site Lab cannot simulate yet",
    summary: "Heat pumps, bidirectional charging and German grid rules are now in. Forecasts, fleets and reserve markets are not.",
    blocks: [
      { kind: "p", text: "Site Lab is a simulator and benchmark, not an operator. The useful question is which behaviours these companies rely on that we cannot yet represent: if we cannot simulate it, we cannot benchmark it {mkt_doc}." },
      { kind: "h", text: "Added in November 2026" },
      { kind: "facts", rows: [
        ["Heat pumps", "Heat demand and COP from When2Heat, with a hot-water tank for pre-heating; strategies on demand, cheap hours and solar surplus; unmet heat is reported {mkt_when2heat} {mkt_heat_code}. See Heat pumps and heat flexibility."],
        ["Bidirectional EVs", "A car on a bidirectional charger can cover the home at dear hours while it can still reach its target by departure {code_engine}. See Bidirectional charging."],
        ["German grid rules (§14a)", "Grid-operator dimming per the regulator's decision, and time-variable network fees from two real 2026 price sheets {mkt_bnetza_14a} {mkt_netfee_code}. See Grid-operator control in Germany."],
      ] },
      { kind: "h", text: "Still missing" },
      { kind: "facts", rows: [
        ["Forecast-driven control", "MPC exists with perfect or realistic forecasts (yesterday's load, archived day-ahead weather forecasts for solar, prices once published, cars once plugged in) {code_forecasts}. Furo and the VPPs plan on forecasts {mkt_furo}. Missing: forecast models beyond persistence, scenario or probabilistic forecasts, and a sweep over forecast-error levels."],
        ["Fleets of homes", "VPPs bid thousands of homes as one {mkt_kraken}. Site Lab has one site behind one meter {code_engine}. See Virtual power plants and fleets."],
        ["Reserve markets", "Batteries earn from FCR and aFRR as well as energy trading {mkt_enspired}. Site Lab prices energy and demand charges only. See Reserve markets."],
        ["Intraday trading", "Tibber trades EV charging on the intraday market {mkt_tibber}. Site Lab uses day-ahead prices only."],
        ["Behaviour", "Programmes depend on people not opting out; the 16.8 GW figure is a framework, not contracts {mkt_renewhome}. Site Lab assumes full compliance."],
        ["Heat pumps in the MPC", "The MPC runs heat pumps on demand and never discharges cars yet; only the rules use the tank and the car battery {code_engine}."],
      ] },
      { kind: "note", tone: "warn", text: "Not gaps to chase: hardware, device APIs, retail tariffs and customer acquisition. They are these companies' businesses; copying them would not make the simulator better {mkt_doc}." },
    ],
  },
  {
    id: "m-roadmap", section: "roadmap", title: "Roadmap: bringing their ideas into Site Lab",
    summary: "What is done, and the next steps, each unlocking a new benchmark question.",
    blocks: [
      { kind: "p", text: "The principle: reproduce what these companies do in simulation, so it can be measured; do not rebuild their products {mkt_doc}." },
      { kind: "steps", items: [
        "Done: one site, rule controllers and an MPC that plans on perfect or realistic forecasts, open data, phases, fuses and demand charges {code_engine} {mkt_mpc_code} {code_forecasts}.",
        "Done (November 2026): a complete home with rule-based control: heat pump with a tank, bidirectional charging (V2H), §14a dimming and time-variable network fees {code_engine} {mkt_bnetza_14a}.",
        "Realistic EV plans: departure time and target entered by the driver, with the errors real drivers make {mkt_doc}.",
        "Forecasts: realistic forecasts and 'Compare forecasts' are done (November 2026) {code_forecasts}. Next: better forecast models than 'yesterday again', probabilistic forecasts, and a sweep that degrades forecasts step by step to measure what each controller loses {mkt_doc}.",
        "A supplier view: what the energy retailer earns or loses, next to what the household pays {mkt_doc}.",
        "Fleet layer (option A, awaiting a decision): sampled homes, an aggregator controller, opt-outs, fleet KPIs such as delivered vs promised flexibility {mkt_doc}.",
        "Neighbourhood: a shared transformer limit and grid-operator flexibility requests; later, optionally, feeder power flow {mkt_doc}.",
        "Markets and value stacking: reserve products (FCR, aFRR), intraday prices, battery wear as a cost, revenue split between operator and households {mkt_svk}.",
        "The trust report: a public, reproducible scoreboard of every controller at every scale, under the same forecast error {mkt_doc}.",
      ] },
      { kind: "note", tone: "info", text: "Order matters: forecasts before market features, because comparing a perfect-foresight MPC with a commercial product would flatter us (in our June week the MPC cost €19.96 with perfect forecasts and €25.77 with realistic ones, wear included, against €21.74 for the simple rule) {runs_2026_11d}; the fleet layer before the neighbourhood, because a street is a small fleet with a shared limit {mkt_doc}." },
    ],
  },

  // ============================== TOPIC PAGES ==============================
];

export const ROADMAP_SOURCES: Source[] = [
  // ---------- Market and roadmap (read 2026-11-08; company figures are the companies' own claims) ----------
  { id: "mkt_doc", title: "Market landscape and gap analysis: docs/market-landscape.md", read: "code",
    note: "Our synthesis of the sources below; options and roadmap are proposals, not decisions." },
  { id: "mkt_mpc_code", title: "MPC controller: src/emsbench/sim/mpc.py", read: "code" },
  { id: "mkt_kraken", title: "Kraken's residential VPP hits 2GW", authors: "Kraken", year: 2025, venue: "Company press release",
    url: "https://www.kraken.tech/press-releases/residential-vpp-hits-2gw", read: "docs", note: "Company claim." },
  { id: "mkt_enspired", title: "Battery storage optimization for maximum revenue", authors: "enspired", year: 2026, venue: "Company website",
    url: "https://www.enspired-trading.com/bess", read: "docs", note: "Company description of its markets." },
  { id: "mkt_renewhome", title: "Sunrun, Tesla, Renew Home announce plans for 16.8 GW virtual power plant program", year: 2026, venue: "pv magazine USA",
    url: "https://pv-magazine-usa.com/2026/06/25/sunrun-tesla-renew-home-announce-plans-for-16-8-gw-virtual-power-plant-program/", read: "secondary",
    note: "Trade press article read in full." },
  { id: "mkt_tibber", title: "Tibber startet Grid Rewards", year: 2026, venue: "electrive", url: "https://www.electrive.net/2026/09/11/tibber-startet-grid-rewards/",
    read: "secondary", note: "Trade press article read in full." },
  { id: "mkt_furo", title: "Furo raises $4 million to expand battery optimization platform", year: 2026, venue: "Mercom",
    url: "https://mercomcapital.com/furo-raises-4-million-to-expand-battery-optimization-platform/", read: "secondary", note: "Trade press article read in full." },
  { id: "mkt_14a", title: "§ 14a EnWG 2026: Module 1–3, Dimmung und Netzentgelt für Wärmepumpen", year: 2026, venue: "42watt (consumer guide)",
    url: "https://42watt.de/magazin/paragraph-14a-enwg", read: "secondary",
    note: "Consumer guide read in full; the binding text is the BNetzA decision BK8-22/010-A and each grid operator's price sheet." },
  // ---------- Topic pages (read 2026-11-09) ----------
  { id: "mkt_when2heat", title: "Time series of heat demand and heat pump efficiency for energy system modeling", authors: "Ruhnau, Hirth, Praktiknjo",
    year: 2019, venue: "Scientific Data 6:189", url: "https://doi.org/10.1038/s41597-019-0199-y", read: "abstract",
    note: "Data used in Site Lab: Open Power System Data, When2Heat 2023-07-27 (CC BY 4.0)." },
  { id: "mkt_heizspiegel", title: "Heizspiegel 2025: average heating consumption (co2online)", year: 2025, venue: "t-online (reporting co2online)",
    url: "https://t-online.de/heim-garten/energie/heizung/id_100246322/heizspiegel-2024-tabelle-zeigt-dieser-verbrauch-ist-normal.html",
    read: "secondary", note: "130 m² single-family house: about 15,730 kWh of gas per year (article updated 23.09.2025)." },
  { id: "mkt_bnetza_14a", title: "Festlegung BK6-22-300 (§14a EnWG), Anlage 1", authors: "Bundesnetzagentur, Beschlusskammer 6", year: 2023,
    venue: "Decision of 27.11.2023", url: "https://www.bundesnetzagentur.de/DE/Beschlusskammern/1_GZ/BK6-GZ/2022/BK6-22-300/BK6-22-300_Beschluss.html",
    read: "report", note: "Anlage 1 read: sections 2.4.1 (devices), 4.5.1 and 4.5.2 (minimum power, EMS formula and simultaneity factors)." },
  { id: "mkt_sheet_dus", title: "Netzentgelte Strom und weitere Entgeltbestandteile, gültig ab 01.01.2026", authors: "Netzgesellschaft Düsseldorf mbH",
    year: 2025, venue: "Price sheet, published 18.12.2025", url: "https://a.storyblok.com/f/274773/x/dc3a61c884/2025-12-12_finales-preisblatt-nne-strom-2026.pdf",
    read: "report", note: "Section A.2.3, Modul 3. Net of VAT." },
  { id: "mkt_sheet_mos", title: "Preise für die Nutzung des Stromverteilnetzes, gültig ab 1. Januar 2026", authors: "Stadtwerke Mosbach GmbH",
    year: 2025, venue: "Price sheet, status October 2025", url: "https://www.swm-online.de/wp-content/uploads/Preisblatt_Netzentgelte_Strom_2026.pdf",
    read: "report", note: "Preisblatt 2a, Modul 3. Net of VAT." },
  { id: "mkt_svk", title: "Overview of requirements for reserves (FFR, FCR-N, FCR-D, aFRR, mFRR)", authors: "Svenska kraftnät", year: 2025,
    venue: "TSO document, updated 24.03.2025", url: "https://www.svk.se/4aa31c/siteassets/english/stakeholder-portal/provision-of-ancillary-services/oversiktlig-kravbild-for-reserver-eng.pdf",
    read: "report" },
  { id: "mkt_eu2019_944", title: "Directive (EU) 2019/944 on common rules for the internal market for electricity", year: 2019,
    venue: "Official Journal L 158, 14.6.2019", url: "https://eur-lex.europa.eu/eli/dir/2019/944/oj/eng", read: "docs",
    note: "Articles 11(1) (dynamic price contracts) and 16(1) (citizen energy communities) read." },
  { id: "mkt_enwg41a", title: "§ 41a EnWG: Lastvariable, tageszeitabhängige oder dynamische und sonstige Stromtarife", venue: "Energiewirtschaftsgesetz",
    url: "https://www.gesetze-im-internet.de/enwg_2005/__41a.html", read: "docs", note: "Paragraph 2 read." },
  { id: "mkt_heat_code", title: "When2Heat loader: src/emsbench/data/when2heat.py", read: "code" },
  { id: "mkt_netfee_code", title: "Modul 3 network fee schedules: src/emsbench/data/netfees.py", read: "code" },
  { id: "mkt_runs_hp", title: "Site Lab run of configs/sites/operate_home_heatpump_v2h.yaml (12-18 Jan 2026), re-run 12 Nov 2026 with the real tariff", read: "data",
    note: "Our own simulation; sizes are example choices. Bill €136.28 vs €140.83 baseline (supplier margin and feed-in tariff included since 11 Nov 2026); peak 13.8 vs 11.6 kW; car gave back 7.3 kWh." },
];
