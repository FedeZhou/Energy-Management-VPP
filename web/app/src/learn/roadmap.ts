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
      { kind: "h", text: "Contracts and reliability" },
      { kind: "facts", rows: [
        ["Cars give way to the limit", "The engine always keeps the limit before charging cars, so a tight contract shows up mostly as car energy not delivered by departure, not as broken limits {code_engine}. Pushes results: more days kept than at a site that would rather finish charging."],
        ["The limit is known in advance", "Contract windows are agreed ahead and both forecast modes know them; day-ahead limits and operating envelopes are not modelled yet {gc_code_contracts} {code_forecasts}."],
        ["Days kept is one sample", "Counted over the days of one simulated run, not a probability with a stated confidence {gc_code_reliability}. Pushes results: probably overconfident, since one year of profiles covers few unlucky combinations."],
        ["No device uncertainty", "Exact state of charge, full battery power at any charge, cars charging at full power until done (no CC-CV taper) {code_engine}. Pushes results: batteries and cars look more dependable than in reality."],
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
  // ============================== GAPS AND ROADMAP ==============================
  // Ordered by the General knowledge guide's recommended focus (chapter 13, section 13.3), decided 2026-11-21.
  {
    id: "m-gaps", section: "roadmap", title: "What Site Lab cannot simulate yet",
    summary: "Ranked by the project's focus, reliable flexibility for EV-heavy business sites: flexible contracts and reliability measures are in; sizing against breach risk, device uncertainty, probabilistic forecasts and real-site validation are not.",
    blocks: [
      { kind: "p", text: "Since 21 November 2026 the project follows the guide's recommended focus: reliable flexibility for EV-heavy business sites, meaning battery size and contract choice with a stated probability of breaching the grid limit, a controller that keeps that promise, and one site model for both ([Section 13.3](#learn-where-to-focus/s13-3)). The gaps below are ranked by that focus and named after the research gaps G1 to G5 of [Section 12.2](#learn-trends-and-research-gaps/s12-2). Site Lab is a simulator, not an operator: if it cannot simulate something, it cannot measure it." },
      { kind: "h", text: "Built for the focus (November 2026)" },
      { kind: "facts", rows: [
        ["Flexible grid contracts", "Recurring windows with a lower import limit (a Dutch-style time-block contract), compiled into a limit for every time step; the safety layer, peak shaving and the MPC all read it. See [chapter 19](#learn-g-contracts) {gc_code_contracts}."],
        ["Reliability measures", "Days on which the limit held, against a target (default 90%, the P90 promise of [Section 4.2](#learn-quantifying-flexibility-under-uncertainty/s4-2)); energy and worst excess above the limit; the P90 daily peak ratio {gc_code_reliability}."],
        ["An EV-heavy example", "A business car park with 20 measured Utrecht commuters on an illustrative time-block contract: the limit held on 85% of days with the battery idle, 96% with peak shaving, 100% with a perfect-foresight MPC and 93% with the same MPC on realistic forecasts {gc_cfg_timeblock} {gc_runs_timeblock}."],
        ["Strategy benchmark", "The Compare tab pins runs side by side and runs every battery strategy with perfect and realistic forecasts {gi_code_web}."],
        ["Earlier (still useful)", "Rules and an MPC on perfect or realistic forecasts, including a scenario MPC that plans for several replayed days and a cautious execution mode; battery wear from an ageing model; phases, fuses, demand charges; heat pumps, bidirectional charging and German §14a rules {code_mpc} {code_forecasts} {code_wear} {code_engine}."],
      ] },
      { kind: "h", text: "Missing, in order of the focus" },
      { kind: "facts", rows: [
        ["1. Sizing × contract choice (G4)", "The answer a site needs before signing: for each battery size and contract level, the cost and the chance of breaching the limit. Today each combination is one manual run; the study runner (emsbench.study) sweeps homes and controllers, not sizes and contracts {gc_study}. The sweep must use a realistic controller, because sizing with perfect foresight overstates what a battery delivers ([Section 8.3](#learn-planning-and-sizing-under-uncertainty/s8-3))."],
        ["2. Device uncertainty (G3)", "Controllers know the battery's charge exactly, the battery gives full power at any charge, and cars charge at full power until done, with no slow-down near full (the CC-CV taper) {code_engine}. The guide reports a study in which ignoring charge-estimation error caused reserve shortfalls in most hours ([Section 7.2](#learn-optimisation-and-control-under-uncertainty/s7-2))."],
        ["3. Probabilistic forecasts and chance constraints (G2)", "Forecasts are point forecasts: perfect, or simple realistic ones such as yesterday's load {code_forecasts}. A scenario MPC exists, but it replays recent days rather than sampling from a forecast distribution {code_mpc}. Missing: probabilistic forecasts, a chance-constrained MPC that plans against a tightened limit ([Section 7.2](#learn-optimisation-and-control-under-uncertainty/s7-2)), and a sweep over forecast-error levels."],
        ["4. A depot or charging-hub example", "The only EV-heavy business example is a commuter car park; there is no logistics depot or public charging hub yet. The guide's suggested first project uses open Dutch charging data ([Section 13.6](#learn-where-to-focus/s13-6), [Section 9.3](#learn-digital-twins-and-datasets/s9-3)); the Utrecht data in Site Lab is licensed for non-commercial use only {data_registry}."],
        ["5. Validation on a real site (G5)", "Site Lab is checked against a published home study and against CityLearn {code_validate}, never against a metered business site with a flexible contract. That needs a partner."],
        ["6. Day-ahead limits and operating envelopes", "Limits sent before each day ([Section 4.3](#learn-quantifying-flexibility-under-uncertainty/s4-3)). The engine's limit series was designed to be replaced by such a profile, but none is built {gc_code_contracts}."],
        ["7. Composable models with uncertainty (G1)", "Each asset model has fixed parameters and reports no uncertainty of its own {code_model}."],
      ] },
      { kind: "h", text: "Lower priority now" },
      { kind: "facts", rows: [
        ["Fleets of homes", "VPPs bid thousands of homes as one {mkt_kraken}. Site Lab has one site behind one meter {code_engine}. A fleet layer was proposed earlier and is set aside {mkt_doc}."],
        ["Reserve markets", "Batteries earn from FCR and aFRR as well as energy trading {mkt_enspired}. Site Lab prices energy and demand charges only."],
        ["Intraday trading", "Tibber trades EV charging on the intraday market {mkt_tibber}. Site Lab uses day-ahead prices only."],
        ["Behaviour", "Programmes depend on people not opting out; the 16.8 GW figure is a framework, not contracts {mkt_renewhome}. Site Lab assumes full compliance."],
        ["Heat pumps in the MPC", "The MPC runs heat pumps on demand and never discharges cars yet; only the rules use the tank and the car battery {code_engine}."],
      ] },
      { kind: "note", tone: "warn", text: "Not gaps to chase: hardware, device APIs, retail tariffs and customer acquisition {mkt_doc}. Nor another generic controller or energy management system, which the guide calls crowded and commoditised ([Section 13.5](#learn-where-to-focus/s13-5)). Controllers are compared only as far as the reliability answer needs." },
    ],
  },
  {
    id: "m-roadmap", section: "roadmap", title: "Roadmap: towards reliable flexibility for EV-heavy sites",
    summary: "What is done and the next steps, in the order of the guide's recommended focus: planning with a stated breach risk, a controller that keeps the promise, one site model for both.",
    blocks: [
      { kind: "p", text: "The compass is the guide's [Section 13.3](#learn-where-to-focus/s13-3). Each step below answers a question a business site faces when it signs a flexible grid contract ([Section 3.2](#learn-grid-congestion-and-flexible-contracts/s3-2)). The order changed on 21 November 2026; the earlier plan, which led towards fleets of homes and a public controller scoreboard, is kept in docs/market-landscape.md {mkt_doc}." },
      { kind: "steps", items: [
        "Done: one site, rule controllers and an MPC that plans on perfect or realistic forecasts (one forecast, several replayed days, or a cautious execution mode), battery wear from an ageing model, open data, phases, fuses and demand charges {code_engine} {mkt_mpc_code} {code_forecasts} {code_wear}.",
        "Done (November 2026): flexible grid contracts as a limit per step, reliability measures (days kept against a target, P90 peak ratio), a business car park on a time-block contract, and a Compare tab that benchmarks every strategy {gc_code_contracts} {gc_code_reliability} {gc_cfg_timeblock}. See [chapter 19](#learn-g-contracts).",
        "Next: a sizing × contract sweep. Battery sizes × contract levels (firm limit, window limit, window times), each run for a year with a realistic controller, reported as cost against days kept and the P90 ratio, so a site can see what each extra share of reliable days costs ([Section 8.1](#learn-planning-and-sizing-under-uncertainty/s8-1), [Section 8.2](#learn-planning-and-sizing-under-uncertainty/s8-2)).",
        "Device uncertainty: an estimated rather than exact state of charge, battery power that depends on the charge, and EV charging that tapers near full (CC-CV), so that the promise covers the devices as well as the forecasts (gap G3, [Section 12.2](#learn-trends-and-research-gaps/s12-2)).",
        "Probabilistic forecasts and a chance-constrained MPC: plan against a limit tightened by the spread of possible futures, so that the real limit holds on the target share of days ([Section 7.2](#learn-optimisation-and-control-under-uncertainty/s7-2)). It must be measured against the cautious MPC and the rules, which did better than replayed scenarios on homes {runs_2026_11e} {runs_2026_11g}.",
        "A depot or charging-hub example on open Dutch charging data ([Section 9.3](#learn-digital-twins-and-datasets/s9-3)): larger chargers, vans or trucks on fixed shifts. A dataset that allows commercial use is preferable, because the Utrecht data does not {data_registry}.",
        "Validation on a real site with a partner: calibrate the site model on metered data and check whether the days kept in simulation match the days kept in reality (gaps G1 and G5).",
        "Later: day-ahead limits and dynamic operating envelopes ([Section 4.3](#learn-quantifying-flexibility-under-uncertainty/s4-3)), departure times and targets entered by drivers, with their errors, and better forecast models. Markets, reserve products and fleets come last {mkt_doc}.",
      ] },
      { kind: "note", tone: "info", text: "Order matters: the sweep comes before smarter controllers because the guide's differentiator is a quantified reliability tied to a contract, not the controller itself ([Section 13.3](#learn-where-to-focus/s13-3)). And it must run on realistic forecasts, because a perfect-foresight optimiser flatters itself: in our June home week the MPC cost €19.96 with perfect forecasts and €25.77 with realistic ones, wear included, against €21.74 for the simple rule {runs_2026_11d}." },
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
