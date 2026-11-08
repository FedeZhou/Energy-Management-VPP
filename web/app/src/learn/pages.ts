// Learn pages. Text may cite sources inline with {sourceId}; every id must exist in sources.ts.
// Rule: only statements backed by a cited source (or by this repository / our own runs, labelled as such).

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "facts"; rows: [string, string][] }
  | { kind: "code"; text: string }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  | { kind: "h"; text: string };

export interface Page {
  id: string;
  section: "lab" | "systems" | "research";
  title: string;
  summary: string;
  status?: "built" | "planned";
  blocks: Block[];
}

export const SECTIONS: Record<Page["section"], { title: string; intro: string }> = {
  lab: { title: "How Site Lab works", intro: "What the simulator does, step by step, and how each control strategy is implemented." },
  systems: { title: "How the systems behave", intro: "Batteries, solar, EV charging, grid connections, tariffs, buildings and data centers." },
  research: { title: "Research digests", intro: "Recent papers, what they found, and what it means for Site Lab. Summaries are based on abstracts unless stated." },
};

export const PAGES: Page[] = [
  // ============================== HOW SITE LAB WORKS ==============================
  {
    id: "loop", section: "lab", title: "The simulation loop", status: "built",
    summary: "Every time step, the engine reads data, asks the controller, applies physics, enforces limits and records the result.",
    blocks: [
      { kind: "p", text: "A site is one grid connection with assets behind it: buildings (fixed demand), solar panels, batteries and EV chargers. The engine steps through time in 1, 5, 15 or 60-minute steps {code_engine}." },
      { kind: "steps", items: [
        "Read the data for this step: building demand, solar output per kWp, price, cars that arrive {code_engine}.",
        "Ask the controller what it wants: battery power, and charging power per car {code_ctrl}.",
        "Apply physics: battery power and fullness limits, charge and discharge losses, the energy each car still needs, the charger's minimum current {code_engine}.",
        "Safety layer: keep the site under its import limit, then each phase under its fuse, then exports under the export limit {code_engine}.",
        "Update the battery and the cars, record everything, and bill it {code_engine}.",
      ] },
      { kind: "h", text: "The safety layer" },
      { kind: "p", text: "A controller can ask for anything; the safety layer decides what is allowed. If the site would draw too much, it first stops charging the battery, then discharges it harder, then slows the EVs in proportion, and records any overload that is left {code_engine}." },
      { kind: "h", text: "Baseline" },
      { kind: "p", text: "Every run is repeated with the battery idle and every EV charging at full power on arrival. Results are shown against that baseline: the same equipment without smart control {code_engine}." },
      { kind: "h", text: "Data alignment" },
      { kind: "list", items: [
        "Sources come from different years. A run asks each source for its own dates; if it does not cover them, it uses the nearest year that does, shifted by up to three days so weekdays match {code_profiles}.",
        "If the time step is finer than the data, values are repeated and the run says so: no fake resolution {code_profiles}.",
        "Every run lists the real dates each source used {code_engine}.",
      ] },
      { kind: "h", text: "Checks" },
      { kind: "list", items: [
        "For the same home without a battery, grid power and cost match CityLearn to 5 significant digits (automated test) {code_engine}.",
        "Unit tests check the energy balance every step, battery limits and losses, EV delivery, fuses and demand charges {code_engine}.",
      ] },
    ],
  },
  {
    id: "battery-strategies", section: "lab", title: "Battery strategies", status: "built",
    summary: "Four rules: idle, self-consumption, price arbitrage and peak shaving. Simple, transparent, and each with a known failure mode.",
    blocks: [
      { kind: "p", text: "All four are rule-based: they decide from the current step only, except price arbitrage, which looks 24 hours ahead at prices {code_ctrl}. A real-hardware study found that simple rules, decision trees and MPC achieved costs within 0.6% of each other on four house reproductions {ruddick2024}, so rules are a serious baseline, not a straw man." },
      { kind: "h", text: "Idle" },
      { kind: "p", text: "Never uses the battery. Used for the baseline {code_ctrl}." },
      { kind: "h", text: "Self-consumption" },
      { kind: "code", text: "net = demand + EV - solar\nbattery_power = -net        # spare solar -> charge, shortfall -> discharge" },
      { kind: "p", text: "Stores spare solar and uses it when the site is short. It never charges from the grid {code_ctrl}. EMHASS offers a comparable self-consumption objective in its optimiser {emhass_lp}." },
      { kind: "h", text: "Price arbitrage" },
      { kind: "code", text: "if net < 0:                       charge with the spare solar\nelif price == max(next 24 h):     discharge to cover the site\nelif price == min(next 24 h):     charge at full power from the grid\nelse:                             wait" },
      { kind: "note", tone: "warn", text: "In our one-year California office example it cut the bill by 13% but raised the peak import from 158 to 218 kW, because the battery charges from the grid on top of the office load. With a demand charge this would backfire {runs_2026_11}." },
      { kind: "h", text: "Peak shaving" },
      { kind: "code", text: "battery_power = threshold - net   # discharge above the threshold, recharge below it" },
      { kind: "note", tone: "warn", text: "In our office example it lowered the peak from 98 to 90 kW but cost slightly more (€1,744 vs €1,721 for the week): the tariff had no demand charge, so a lower peak earned nothing while battery losses still cost money {runs_2026_11}." },
      { kind: "h", text: "What all four lack" },
      { kind: "p", text: "None of them plans: they cannot save battery energy for a peak that is coming, or weigh price against wear. That is the job of MPC (see Planned controllers)." },
    ],
  },
  {
    id: "ev-strategies", section: "lab", title: "EV charging strategies", status: "built",
    summary: "As fast as possible, spread until departure, cheapest hours, and solar surplus, all limited by the car, the charger and the 6 A minimum.",
    blocks: [
      { kind: "facts", rows: [
        ["As fast as possible", "Full power from arrival until the car is full or leaves {code_ctrl}."],
        ["Spread until departure", "The lowest steady power that still finishes by departure, never below the charger's minimum {code_ctrl}."],
        ["Cheapest hours", "Ranks the coming time steps before departure by price and charges at full power in the cheapest ones {code_ctrl}."],
        ["Solar surplus", "Charges from spare solar only, and switches to full power when there is no slack left to finish by departure {code_ctrl}."],
      ] },
      { kind: "h", text: "Limits every strategy respects" },
      { kind: "list", items: [
        "The charger's maximum power, and the car's own maximum where the data gives one {code_engine}.",
        "The minimum current: under IEC 61851-1 a charger cannot offer less than 6 A, so it pauses instead {iec61851}. On three phases that is 6 A × 3 × 230 V = 4.14 kW; on one phase 1.38 kW {code_model}.",
        "A car whose maximum is below a three-phase charger's minimum is treated as charging on one phase {code_engine}.",
      ] },
      { kind: "note", tone: "info", text: "Consequence found in our tests: a three-phase charger cannot follow a 3 kW solar surplus, because its minimum is 4.14 kW. It has to wait {code_engine}." },
      { kind: "h", text: "The rebound peak" },
      { kind: "p", text: "In our shared-garage example, moving every car to the cheapest hours saved about 4% (at spot prices, before tariff add-ons) but raised the highest phase current from 56 A to 63 A, right at the fuse, because everyone started at the same cheap moment {runs_2026_11}. The literature calls this an avalanche effect: synchronised charging creates new demand peaks; capacity-based pricing is one proposed fix {valogianni2025}." },
      { kind: "h", text: "When cars are actually there" },
      { kind: "p", text: "Norwegian residential data show a large potential to shift charging from afternoon and evening to night {sorensen2023}. That also explains why a solar-surplus strategy rarely gets sun for home chargers: the cars are home in the evening." },
    ],
  },
  {
    id: "planned", section: "lab", title: "Planned controllers", status: "planned",
    summary: "Not built yet: deterministic MPC, stochastic MPC, learning-based hybrids and safe reinforcement learning, in that order.",
    blocks: [
      { kind: "note", tone: "info", text: "Nothing on this page is implemented in Site Lab yet. It describes the plan and the published methods it will follow." },
      { kind: "h", text: "Deterministic MPC (next)" },
      { kind: "p", text: "Model predictive control optimises over a forecast horizon, applies only the first step, and repeats. EMHASS implements this as a linear program: maximise profit, minus cost, or self-consumption, subject to a power balance in every step and battery state-of-charge limits with separate charge and discharge efficiencies; its MPC mode re-optimises frequently, for example every 5 minutes, and applies only the first element {emhass_lp}. EMHASS builds the problem with CVXPY and solves it with HiGHS by default {emhass_home}." },
      { kind: "code", text: "maximise   Σ_t  -price_t · grid_import_t · Δt            (cost objective)\nsubject to pv_t - load_t + grid_t + battery_out_t - battery_in_t = 0\n           SoC limits from Σ (out/η_dis - η_ch · in) · Δt\n           power limits on battery and grid" },
      { kind: "h", text: "Stochastic MPC" },
      { kind: "p", text: "Plans against forecast uncertainty instead of a single forecast. One study combined an LSTM forecaster with a constraint-tightened stochastic optimisation and cut a German company's peak grid draw by a further 99 kW (5.8%) compared with standard MPC {li2025smpc}." },
      { kind: "h", text: "Learning-based hybrids" },
      { kind: "p", text: "Across four years of the CityLearn Challenge, hybrid approaches combining forecasting, optimisation and learning proved effective {nagy2025}." },
      { kind: "h", text: "Safe reinforcement learning (last)" },
      { kind: "p", text: "Model-free RL explores with largely random decisions that can violate safety constraints, so deploying it directly is considered unacceptable without safety mechanisms {yu2024saferl}. In a real home test, an RL agent still in training cost 25.5% more than rules, decision trees and MPC {ruddick2024}; in a real industrial heating network, RL ran stably but performed significantly worse than in simulation {lademann2026}." },
    ],
  },

  // ============================== HOW THE SYSTEMS BEHAVE ==============================
  {
    id: "batteries", section: "systems", title: "Batteries",
    summary: "Energy (kWh), power (kW), state of charge, losses, and wear that depends on how the battery is used.",
    blocks: [
      { kind: "facts", rows: [
        ["Capacity (kWh)", "How much energy it stores {code_model}."],
        ["Power (kW)", "How fast it can charge or discharge {code_model}."],
        ["State of charge", "How full it is, as a share of capacity; Site Lab lets you set minimum, maximum and starting values {code_model}."],
        ["Round-trip efficiency", "Share of energy put in that comes back out. Site Lab splits the losses equally between charging and discharging {code_engine}; EMHASS also models separate charge and discharge efficiencies {emhass_lp}."],
      ] },
      { kind: "h", text: "Wear" },
      { kind: "list", items: [
        "Degradation is path-dependent: one modelling study found five different pathways to end of life for the same cell, depending on how it is used {okane2022}.",
        "Cycle ageing can be priced: a piecewise-linear cost per cycle approximates the ageing mechanism and fits into market dispatch software {xu2017}.",
        "Large batteries are built from strings that age unevenly; modelling that heterogeneity gave 21% more revenue per unit of state-of-health loss in one study {graner2025}.",
      ] },
      { kind: "note", tone: "warn", text: "Site Lab does not yet price wear. It reports equivalent full cycles (energy discharged ÷ capacity), a simple proxy that treats ten 10% dips like one full cycle {code_engine}." },
    ],
  },
  {
    id: "solar", section: "systems", title: "Solar panels",
    summary: "Output per kWp follows sunlight, panel orientation and losses; Site Lab models it from weather and checks it against PVGIS.",
    blocks: [
      { kind: "p", text: "Panel size is set in kWp {code_model}. Site Lab computes output per kWp from 15-minute weather (irradiance, temperature, wind) with pvlib's PVWatts model {data_registry}." },
      { kind: "h", text: "Losses (PVWatts defaults)" },
      { kind: "facts", rows: [
        ["Soiling", "2%"], ["Shading", "3%"], ["Mismatch", "2%"], ["Wiring", "2%"], ["Connections", "0.5%"],
        ["Light-induced degradation", "1.5%"], ["Nameplate rating", "1%"], ["Availability", "3%"], ["Snow, age", "0%"],
      ] },
      { kind: "p", text: "Losses are combined multiplicatively: total = 100 × [1 − Π(1 − Lᵢ/100)] {pvlib_losses}." },
      { kind: "h", text: "How accurate is the model?" },
      { kind: "p", text: "Our last 12 months of modelled output were compared with PVGIS long-term averages for 10 profiles. Konstanz, Paris and Aarhus fall within normal year-to-year variation (−4.5% to +6.6%); Amsterdam is about 9% higher and Los Angeles about 9% lower, causes unverified. Treat modelled solar as accurate to about ±10% {pvgis_check}." },
    ],
  },
  {
    id: "ev-charging", section: "systems", title: "EV charging",
    summary: "AC charging power is phases × voltage × current, bounded by the car, the charger and a 6 A minimum; when cars arrive matters as much as how fast they charge.",
    blocks: [
      { kind: "facts", rows: [
        ["Power", "phases × 230 V × current per phase: 16 A on three phases is about 11 kW, the default charger in Site Lab {code_model} {iec60038}."],
        ["Minimum", "6 A per phase, signalled by a 10% control-pilot duty cycle; below that the charger pauses {iec61851}."],
        ["Car limit", "The car's onboard charger caps the power; the Norwegian dataset includes the authors' estimates per user {sorensen2023}."],
      ] },
      { kind: "h", text: "Behaviour" },
      { kind: "list", items: [
        "Residential (Norway, 35,000+ sessions): a considerable potential to shift charging from afternoon and evening to night {sorensen2023}.",
        "Workplace (Caltech ACN-Data, 30,000+ sessions at release): used to learn user behaviour, size on-site solar for adaptive charging, and smooth the 'duck curve' {lee2019acn}.",
        "Realistic simulators model battery charging behaviour and unbalanced three-phase infrastructure, as ACN-Sim does {lee2020acnsim}.",
      ] },
      { kind: "note", tone: "warn", text: "Not modelled yet in Site Lab: the slowdown as a car approaches full (charging taper)." },
    ],
  },
  {
    id: "grid", section: "systems", title: "Grid connection and phases",
    summary: "European low-voltage supply is three-phase 230/400 V; each phase has its own fuse, so a single-phase load can trip one phase while the others are idle.",
    blocks: [
      { kind: "facts", rows: [
        ["Voltage", "230 V phase to neutral, 400 V phase to phase (IEC 60038, 50 Hz) {iec60038}."],
        ["Power per phase", "230 V × current: a 25 A fuse allows about 5.75 kW on that phase {code_model}."],
        ["Balanced vs single-phase", "Site Lab spreads buildings, solar and batteries evenly over the three phases; single-phase chargers put all their load on one {code_engine}."],
      ] },
      { kind: "p", text: "When a phase would exceed its fuse, Site Lab's safety layer slows the EVs on that phase first, then pauses any charger squeezed below its minimum current {code_engine}. ACN-Sim models the same kind of unbalanced three-phase limits {lee2020acnsim}." },
    ],
  },
  {
    id: "tariffs", section: "systems", title: "Prices and tariffs",
    summary: "Spot prices move every 15 minutes and can go negative, but in Germany most of a household's price per kWh is network costs and taxes, which do not move.",
    blocks: [
      { kind: "h", text: "Wholesale day-ahead market" },
      { kind: "list", items: [
        "Since delivery day 1 October 2025, the European day-ahead coupling trades 15-minute products (first trading 30 September 2025) {sdac_15min}.",
        "In the German-Luxembourg prices Site Lab uses (Oct 2025 onward), the lowest value is −€0.50/kWh: negative prices happen {data_registry}.",
      ] },
      { kind: "h", text: "What a household actually pays (Germany, 2025)" },
      { kind: "facts", rows: [
        ["Energy and supply", "€0.148/kWh"], ["Network costs", "€0.113/kWh"], ["Taxes, fees, levies (incl. VAT)", "€0.124/kWh"], ["Total", "€0.385/kWh (network and taxes: 62%)"],
      ] },
      { kind: "p", text: "Eurostat, band 2,500-4,999 kWh/yr {eurostat_check}. Eurostat's taxes component already includes VAT; adding VAT again would double-count it {eurostat_check}. Because network costs and taxes do not move with the market, a dynamic tariff saves less than the spot swings suggest. Site Lab's tariff settings offer these add-ons per country." },
      { kind: "h", text: "Demand charges" },
      { kind: "p", text: "A demand charge bills each month's highest import power. Site Lab adds rate × the sum of monthly peaks (per time step) to the energy cost {code_engine}. Without one, a battery that shaves peaks earns nothing for it (see Battery strategies)." },
      { kind: "p", text: "A real example: Public Service Co of Colorado's Schedule PG (industrial, 2024) charges a flat $4.23 + $3.68 adjustment per kW of monthly peak, plus time-of-use demand charges of $10.03 or $14.97 + $3.68 per kW in its charged periods, on top of an energy rate of $0.00778/kWh plus adjustments of $0.04113 or $0.02539 by period {urdb_xcel_pg}." },
    ],
  },
  {
    id: "buildings", section: "systems", title: "Building loads",
    summary: "Measured loads are realistic but few; modelled loads cover any building type and size but are smoother.",
    blocks: [
      { kind: "list", items: [
        "Measured: five German homes and a school at 15-minute resolution (Open Power System Data) {data_registry}.",
        "Modelled: NREL ComStock offices, shop, warehouse, school and hospital, averaged over many calibrated building models per type (the count is in each profile's note; 2,969 for the California small office) and expressed per 1,000 m² {data_registry}; methodology in {wilson2022}.",
        "An average over many buildings is smoother than any single real building, so it understates the peaks of an individual building {data_registry}.",
      ] },
    ],
  },
  {
    id: "data-centers", section: "systems", title: "Data centers",
    summary: "Load = IT plus cooling and losses; PUE measures the overhead; flexibility comes from deferring or moving compute.",
    blocks: [
      { kind: "facts", rows: [
        ["PUE", "Power usage effectiveness: total facility power divided by the power consumption of IT equipment; introduced by The Green Grid in 2007 {uptime_2025}, standardised in ISO/IEC 30134-2 {iso30134}."],
        ["Industry average", "1.54 in 2025 (weighted average, n=681), the sixth consecutive year it has virtually stood still; it fell from 2.50 in 2007 to 1.65 in 2014 {uptime_2025}."],
        ["Newer and larger sites", "1.48 for facilities commissioned within the last five years; 1.44 for sites of 20 MW and above; 15% of respondents report 1.3 or better {uptime_2025}."],
      ] },
      { kind: "p", text: "PUE leaves out other aspects of efficiency, such as facility water use or IT efficiency {uptime_2025}. A PUE of 1.54 means that for every 1 kW of IT load the whole site draws about 1.54 kW, so roughly 0.54 kW goes to cooling and other overheads." },
      { kind: "h", text: "Open measured data" },
      { kind: "p", text: "The National Laboratory of the Rockies publishes time series from its ESIF high-performance computing data center under CC BY 4.0, with separate fields for IT power, cooling, HVAC, pumps, lights and PUE {esif_pue}." },
      { kind: "h", text: "Flexibility" },
      { kind: "p", text: "A capacity-expansion study found that letting AI data centers shift compute in time and location can reduce grid investment and operating costs by 3-21%, that more flexibility does not automatically mean less generation capacity, and that longer deferral windows have diminishing returns {chen2026}." },
    ],
  },
  {
    id: "forecasting", section: "systems", title: "Forecasting",
    summary: "Controllers act on forecasts. Pretrained foundation models now forecast well zero-shot, but get worse when their inputs are noisy.",
    blocks: [
      { kind: "list", items: [
        "Chronos treats time series like language: it tokenises values and trains transformer models; zero-shot accuracy on new datasets was comparable to models trained specifically on them {chronos1}.",
        "Chronos-2 adds multivariate and covariate-informed forecasting through group attention and reports state-of-the-art results on three benchmarks {chronos2}; a 2026 paper reports +5.2 percentage points of skill score over the strongest baselines {chronos2b}.",
        "For short-term load forecasting, Chronos-2 led when future covariates were available or accurate, but degraded as covariate forecasts became noisy, where TimesNet was more robust {kaljevic2026}.",
      ] },
      { kind: "note", tone: "info", text: "Site Lab controllers currently see perfect information (prices 24 h ahead, actual loads). Measuring how they degrade with realistic forecast error is the planned forecast-error harness." },
    ],
  },

  // ============================== RESEARCH DIGESTS ==============================
  {
    id: "d-ruddick2024", section: "research", title: "Rules vs MPC vs RL on real hardware (2024)",
    summary: "Rules, decision trees and MPC cost within 0.6% of each other; RL in training cost 25.5% more.",
    blocks: [
      { kind: "p", text: "Four residential house reproductions, each with battery, solar, an emulated household load and a controllable EV charger. Compared a safe-RL agent with a safety layer, a decision-tree policy (TreeC), MPC and simple rules {ruddick2024}." },
      { kind: "list", items: [
        "Rules, TreeC and MPC: costs within 0.6% of each other {ruddick2024}.",
        "RL, still in training: 25.5% higher cost; grid-limit excess 593.9 Wh vs 27.1 Wh for TreeC {ruddick2024}.",
        "A safety layer allowed safe online RL training if the constraint function is accurate {ruddick2024}.",
      ] },
      { kind: "note", tone: "info", text: "For Site Lab: strong rule baselines matter; a benchmark must report grid-limit violations, not only cost." },
    ],
  },
  {
    id: "d-li2025", section: "research", title: "Stochastic MPC for peak shaving and battery health (2025)",
    summary: "A further 99 kW (5.8%) peak reduction over standard MPC for a German company.",
    blocks: [
      { kind: "p", text: "LSTM forecasting plus a constraint-tightened stochastic optimisation in a receding horizon, targeting peak shaving and battery health under forecast uncertainty {li2025smpc}." },
      { kind: "note", tone: "info", text: "For Site Lab: the template for the stochastic MPC step, and a reason to build the forecast-error harness first." },
    ],
  },
  {
    id: "d-nagy2025", section: "research", title: "Four years of the CityLearn Challenge (2025)",
    summary: "Hybrids of forecasting, optimisation and learning worked best; common benchmarks matter.",
    blocks: [
      { kind: "p", text: "The 2020-2023 challenges grew from policy transfer across climate zones to real datasets, battery management and grid resilience; hybrid approaches combining forecasting, optimisation and learning proved effective {nagy2025}. CityLearn itself started in 2019 as an OpenAI Gym environment to make RL demand-response research reproducible {vazquez2019}." },
    ],
  },
  {
    id: "d-forecast2026", section: "research", title: "Foundation models for load forecasting (2026)",
    summary: "Chronos-2 leads when covariates are good; TimesNet is more robust when they are noisy.",
    blocks: [
      { kind: "p", text: "Four trained-from-scratch models against four time series foundation models on three load datasets, varying how accurate future covariates are {kaljevic2026}." },
      { kind: "list", items: [
        "Chronos-2 achieved state-of-the-art accuracy both zero-shot and fine-tuned when covariates were accurate {kaljevic2026}.",
        "Its accuracy degraded as covariate forecasts got noisier; TimesNet held up better under severe uncertainty {kaljevic2026}.",
      ] },
    ],
  },
  {
    id: "d-chen2026", section: "research", title: "AI data center flexibility and the grid (2026)",
    summary: "Shifting compute can cut grid costs 3-21%, with diminishing returns from longer deferral.",
    blocks: [
      { kind: "p", text: "A grid capacity-expansion model with data centers that can shift compute in time and location {chen2026}." },
      { kind: "list", items: [
        "Flexible AI load can reduce grid investment and operating costs by 3-21% {chen2026}.",
        "More flexibility does not necessarily reduce the generation capacity required {chen2026}.",
        "Longer deferral windows have diminishing returns {chen2026}.",
      ] },
    ],
  },
  {
    id: "d-rl-real", section: "research", title: "Reinforcement learning in real systems (2024-2026)",
    summary: "Safe RL is needed for deployment; real deployments run stably but trail their simulations.",
    blocks: [
      { kind: "list", items: [
        "Review: model-free RL explores with random decisions that can break constraints; open problems are convergence and optimality, training efficiency, universality and real-world deployment {yu2024saferl}.",
        "Industrial thermal network: RL achieved operational stability but showed a significant performance gap compared with simulation {lademann2026}.",
        "Home energy management with heterogeneous batteries and stochastic EV behaviour (Lagrangian soft actor-critic): reported an 8.44% reduction in battery degradation cost {yuan2026}.",
      ] },
    ],
  },
  {
    id: "d-ev-avalanche", section: "research", title: "Synchronised EV charging and pricing (2025)",
    summary: "Price signals alone can create new peaks; capacity-based pricing reduces volatility.",
    blocks: [
      { kind: "p", text: "A pricing model that adjusts in real time to charging rates and grid capacity avoids 'avalanche effects', where synchronised charging creates new peaks; in urban simulations it reduced demand volatility while keeping charging costs for users {valogianni2025}. Site Lab's shared-garage example shows the same effect (see EV charging strategies)." },
    ],
  },
  {
    id: "d-battery-cost", section: "research", title: "Pricing battery wear (2017-2025)",
    summary: "Wear can be priced per cycle and should account for uneven ageing between strings.",
    blocks: [
      { kind: "list", items: [
        "Piecewise-linear cycle-ageing cost, usable in market clearing; case study in ISO New England energy and reserve markets {xu2017}.",
        "Ignoring differences between battery strings can produce infeasible dispatch plans and lower revenue; detailed string-level, ageing-aware optimisation gave 21% more revenue per unit of state-of-health loss {graner2025}.",
        "Degradation mechanisms interact; five end-of-life pathways were found for the same cell {okane2022}.",
      ] },
    ],
  },
  {
    id: "d-vpp", section: "research", title: "Virtual power plants: two 2026 reviews",
    summary: "From rule-based coordination to multi-time-scale optimisation and AI.",
    blocks: [
      { kind: "list", items: [
        "Covers DER modelling and aggregation, centralised, distributed and hybrid control, multi-time-scale optimisation (day-ahead, intra-day, real time), market participation and revenue allocation {huang2026vpp}.",
        "Maps machine learning, deep learning, RL and hybrids onto VPP functions (forecasting, scheduling, bidding, aggregation, ancillary services); open issues include data quality, interpretability, multi-agent scalability and cyber-physical resilience {li2026aivpp}.",
      ] },
    ],
  },
  {
    id: "d-checked", section: "research", title: "What we checked in the research file",
    summary: "Corrections to docs/research.md after reading the sources, and papers we could not read.",
    blocks: [
      { kind: "list", items: [
        "The battery management review {chundru2026} is a review of control and economic synergies; its abstract does not mention wear as an economic cost or value-stacking conflicts, as the research file suggested.",
        "The 'meta-analysis' of MPC in microgrids {yaghoubi2025} is a systematic, bibliometric review (Web of Science, keyword co-occurrence); its abstract reports no quantitative comparison of MPC variants.",
        "The CityLearn Challenge finding (hybrids worked best) is confirmed {nagy2025}.",
        "No public abstract found, so not summarised: {burgaud2026}, {rafayal2024}.",
      ] },
    ],
  },
];
