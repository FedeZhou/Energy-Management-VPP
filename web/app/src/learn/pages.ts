// Market and roadmap pages live in market.ts (kept apart so parallel edits do not collide).
import { MARKET_PAGES } from "./market";
import { DEEP_PAGES } from "./deepdive";
import { EXAMPLE_PAGES } from "./examples";

// Learn pages. Text may cite sources inline with {sourceId}; every id must exist in sources.ts.
// Rule: only statements backed by a cited source (or by this repository / our own runs, labelled as such).

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "facts"; rows: [string, string][] }
  | { kind: "code"; text: string }
  | { kind: "math"; tex: string; caption?: string }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  | { kind: "h"; text: string };

export interface Page {
  id: string;
  section: "lab" | "examples" | "systems" | "control" | "battery" | "research" | "market";
  title: string;
  summary: string;
  status?: "built" | "planned";
  blocks: Block[];
}

export const SECTIONS: Record<Page["section"], { title: string; intro: string }> = {
  lab: { title: "How Site Lab works", intro: "What the simulator does, step by step, and how each control strategy is implemented." },
  examples: { title: "Practical examples", intro: "Real-world situations worked through in Site Lab, each teaching one idea, with numbers from our own runs and a link to try it." },
  systems: { title: "How the systems behave", intro: "Batteries, solar, EV charging, grid connections, tariffs, buildings and data centers." },
  control: { title: "Control theory, from scratch", intro: "Feedback, optimal control, linear programming, estimation and fair comparisons, with worked examples from real Site Lab runs." },
  battery: { title: "Battery modelling, from scratch", intro: "From cells to systems: the energy-reservoir model, equivalent circuits, state-of-charge estimation, physics models, ageing, cycle counting and the price of wear." },
  research: { title: "Research digests", intro: "Recent papers, what they found, and what it means for Site Lab. Summaries are based on abstracts unless stated." },
  market: { title: "Market and roadmap", intro: "Who builds virtual power plants and home energy systems in 2026, what Site Lab cannot simulate yet, and the steps to get there. Company figures are their own claims." },
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
    id: "battery-strategies", section: "lab", title: "Rule-based battery control", status: "built",
    summary: "The simplest way to run a battery: fixed if-then rules. How they work, the battery physics underneath, what the literature says about them, and where they break.",
    blocks: [
      { kind: "p", text: "In plain words: a rule-based controller looks at what is happening right now (is there spare solar? is the price high? is the site drawing too much?) and applies a fixed rule, such as 'store spare solar' or 'discharge when import exceeds 50 kW'. It does not plan ahead and needs no forecast. Almost every home battery and many commercial systems start here, because rules are easy to understand, cheap to run and safe to certify. The cost is that a rule cannot anticipate: it may spend the battery too early, or miss a peak it could have seen coming." },
      { kind: "h", text: "Why rules are still the baseline" },
      { kind: "p", text: "Rules are not a straw man. On real hardware, four house reproductions run with rules, decision trees and MPC ended within 0.6% of each other in cost, while a reinforcement-learning agent still in training cost 25.5% more {ruddick2024}. CityLearn, the reference benchmark for building energy control, ships rule-based controllers as its baselines {vazquez2019} {nagy2025}. Optimisation pays off when the site has something to plan for, such as a demand charge, a price spread worth chasing or a limit that binds; that is why the same research field that built MPC still reports rules alongside it {drgona2020}." },
      { kind: "h", text: "Notation" },
      { kind: "math", tex: String.raw`\text{net}_t = L_t + \sum_i P^{\mathrm{EV}}_{i,t} - S_t, \qquad g_t = \text{net}_t + P_t`,
        caption: String.raw`At each time step \(t\) of length \(\Delta t\) hours: \(L_t\) is building demand, \(S_t\) solar output and \(P^{\mathrm{EV}}_{i,t}\) the charging power of car \(i\), all in kW. \(\text{net}_t\) is what the site needs before the battery. The battery power \(P_t\) is positive when charging and negative when discharging, so the grid power \(g_t\) is import when positive and export when negative {code_engine}.` },
      { kind: "h", text: "The battery model every strategy shares" },
      { kind: "math", tex: String.raw`\eta = \sqrt{\eta_{\mathrm{rt}}}, \qquad E_{t+1} = \begin{cases} E_t + \eta\, P_t\, \Delta t & P_t \ge 0 \ \text{(charging)} \\[8pt] E_t + P_t\, \Delta t / \eta & P_t < 0 \ \text{(discharging)} \end{cases}`,
        caption: String.raw`\(E_t\) is the energy stored (kWh). The round-trip efficiency \(\eta_{\mathrm{rt}}\) is split evenly between the way in and the way out, so each direction loses \(1-\eta\). With the default \(\eta_{\mathrm{rt}} = 0.9\) {code_model}, \(\eta \approx 0.949\): 1 kWh from the grid adds 0.949 kWh to the battery, and taking 1 kWh out removes 1.054 kWh {code_engine}.` },
      { kind: "math", tex: String.raw`\bar P^{\mathrm{ch}}_t = \min\!\Big(P_{\mathrm{nom}},\ \frac{E_{\max} - E_t}{\eta\, \Delta t}\Big), \qquad \bar P^{\mathrm{dis}}_t = \min\!\Big(P_{\mathrm{nom}},\ \frac{(E_t - E_{\min})\,\eta}{\Delta t}\Big), \qquad -\bar P^{\mathrm{dis}}_t \le P_t \le \bar P^{\mathrm{ch}}_t`,
        caption: String.raw`Whatever a strategy asks for is clipped to these limits: the inverter's rated power \(P_{\mathrm{nom}}\), and the room left between the minimum and maximum charge \(E_{\min} = \text{soc}_{\min}\cdot\text{capacity}\) and \(E_{\max} = \text{soc}_{\max}\cdot\text{capacity}\) {code_engine}. The minimum charge is also how a backup reserve is kept: in the data center example the UPS's 5 minutes of backup energy sits below \(E_{\min}\), where no strategy can reach it {code_engine}.` },
      { kind: "h", text: "Idle" },
      { kind: "math", tex: String.raw`P_t = 0`, caption: "Never uses the battery. This is the baseline every run is compared with {code_ctrl}." },
      { kind: "h", text: "Self-consumption" },
      { kind: "math", tex: String.raw`P_t = -\,\text{net}_t \quad\Longrightarrow\quad g_t = 0 \ \text{whenever the battery can follow}`,
        caption: String.raw`Spare solar (\(\text{net}_t < 0\)) charges the battery; any shortfall (\(\text{net}_t > 0\)) is covered from it. The goal is zero exchange with the grid, and the battery never charges from the grid {code_ctrl}.` },
      { kind: "p", text: "Where it fits: homes and small businesses with solar, where buying a kWh costs much more than selling one, so every kWh of solar used on site is worth the purchase price. EMHASS offers a comparable self-consumption objective in its optimiser, weighting grid purchases more heavily than export revenue {emhass_lp}. Where it fails: it ignores prices and time, so on a dynamic tariff it may empty the battery at noon, when power is cheap, and have nothing left for the expensive evening." },
      { kind: "h", text: "Price arbitrage" },
      { kind: "math", tex: String.raw`P_t = \begin{cases} -\,\text{net}_t & \text{if } \text{net}_t < 0 \quad \text{(store spare solar first)} \\[6pt] -\,\text{net}_t & \text{if } p_t = \max_{\tau \in W_t} p_\tau \quad \text{(cover the site at the dearest step)} \\[6pt] \bar P^{\mathrm{ch}}_t & \text{if } p_t = \min_{\tau \in W_t} p_\tau \quad \text{(fill up at the cheapest step)} \\[6pt] 0 & \text{otherwise} \end{cases}`,
        caption: String.raw`\(p_t\) is the import price and \(W_t\) the next 24 hours of prices, which Site Lab knows exactly {code_ctrl}.` },
      { kind: "math", tex: String.raw`\text{buying at } p_{\text{low}} \text{ to replace a purchase at } p_{\text{high}} \text{ pays only if } \quad p_{\text{high}}\, \eta^2 > p_{\text{low}}`,
        caption: String.raw`1 kWh bought brings back \(\eta^2 \approx 0.9\) kWh. The rule never checks this, and it acts in only one cheapest and one dearest step of the window: at 15-minute steps, a battery that needs two hours to fill gets one 15-minute slot {code_ctrl}.` },
      { kind: "note", tone: "warn", text: "Where it backfires: in our one-year California office example it cut the energy bill by 12.7% (USD 156,671 to 136,782) but raised the peak import from 158 to 218 kW, because the battery charges from the grid on top of the office load. With a demand charge, the extra 59 kW of peak would be billed every month {runs_2026_11}." },
      { kind: "h", text: "Peak shaving" },
      { kind: "math", tex: String.raw`P_t = \theta - \text{net}_t \quad\Longrightarrow\quad g_t = \theta \ \text{ while } -\bar P^{\mathrm{dis}}_t \le \theta - \text{net}_t \le \bar P^{\mathrm{ch}}_t`,
        caption: String.raw`Above the threshold \(\theta\) the battery discharges the excess; below it, it recharges using only the headroom \(\theta - \text{net}_t\), so recharging never creates a new peak {code_ctrl}.` },
      { kind: "p", text: "Peak shaving is one of the oldest battery applications in the literature. Oudalov, Cherkaoui and Béguin sized a battery to maximise a customer's benefit from lower demand payments with the smallest possible capacity, and operated it with dynamic programming, an optimisation over the whole day rather than a fixed threshold {oudalov2007}. Commercial EMSs ship the threshold version as a standard controller: OpenEMS, the open-source EMS behind FENECON's commercial systems, has a 'Symmetric Peak-Shaving' controller that works at the grid connection {openems_intro} {openems_peak}." },
      { kind: "note", tone: "warn", text: "Two failure modes from our runs. Office week, no demand charge in the tariff: the peak fell from 98 to 90 kW but the bill rose from €1,721 to €1,744, because a lower peak earned nothing while battery losses still cost money {runs_2026_11}. Data center month, demand charges about half the bill: the best fixed threshold cut the bill by only 1.1% (USD 307,079 to 303,637). Below 5.3 MW the battery ran empty during high-load stretches of up to 14 hours and the monthly peak was not reduced at all {runs_2026_11}." },
      { kind: "h", text: "Making rules behave on real hardware" },
      { kind: "list", items: [
        "Hysteresis and delays: real controllers wait until a condition has held for a while before switching, so devices are not turned on and off too often; evcc makes these delays configurable for exactly that reason {evcc_solar}. Site Lab's rules switch instantly.",
        "Priorities: when several rules compete (charge the car or the home battery first?), products expose an explicit priority setting; evcc, for example, lets the user decide how far the home battery may be used for the car {evcc_solar}.",
        "Fallback role: even sites run by optimisers or learned controllers keep rules underneath as the safe default; Google's AI cooling control hands back to the site's rules and heuristics whenever operators leave AI mode {deepmind2018}.",
      ] },
      { kind: "h", text: "What all four lack" },
      { kind: "p", text: "None of them plans: they cannot save energy for a peak that is coming, refill before a long high stretch, or weigh price against wear. Commercial systems add a planning layer for exactly this: OpenEMS's time-of-use controller recomputes a 24-hour battery schedule in 15-minute intervals from forecasts and day-ahead prices, on a rolling basis {openems_tou}. That planning layer is model predictive control, the subject of the next pages." },
      { kind: "h", text: "Go deeper" },
      { kind: "facts", rows: [
        ["Rules vs optimisation on real hardware", "Ruddick et al. 2024 compare rules, decision trees, MPC and safe RL on physical house reproductions {ruddick2024}."],
        ["Optimal peak shaving", "Oudalov et al. 2007: sizing a battery for demand charges and operating it with dynamic programming {oudalov2007}."],
        ["Benchmarks with rule baselines", "CityLearn: the environment {vazquez2019} and four years of its challenge {nagy2025}."],
      ] },
    ],
  },
  {
    id: "ev-strategies", section: "lab", title: "EV smart charging", status: "built",
    summary: "Why uncontrolled charging is a problem, how smart charging is classified in the literature, the four strategies Site Lab implements as formulas, and how real controllers and aggregators do it.",
    blocks: [
      { kind: "p", text: "In plain words: an electric car plugged in for ten hours usually needs only two or three hours of charging. Smart charging decides when, and how fast, to use those hours: when power is cheap, when the sun shines, or when the building's connection has room. Done well, the car is still full at departure and the site pays less and stays within its limits; done naively, many cars start at the same moment and create a new peak." },
      { kind: "h", text: "Why it matters" },
      { kind: "p", text: "Uncontrolled charging affects the local distribution grid through its voltage profile, power losses, phase unbalance, transformer ageing and harmonic distortion {alogaili2019}. Early work set out the framework that still structures the field: integrating EVs touches both the grid's technical operation and the electricity market, with a cast of players (car owners, aggregators, distribution and transmission operators, suppliers) {lopes2010}. An aggregator, the commercial middleman between the market and EV owners, can buy energy and sell reserve for a whole fleet; its bids depend on forecasts of how cars will arrive, leave and charge {bessa2011}." },
      { kind: "h", text: "How the literature classifies smart charging" },
      { kind: "facts", rows: [
        ["Scheduling", "Decide each car's charging power over time from prices, limits and departure times; the strategies below are simple scheduling rules {alogaili2019}."],
        ["Clustering", "Group sessions or users with similar behaviour so they can be planned together {alogaili2019}."],
        ["Forecasting", "Predict arrivals, departures and energy needs, which scheduling then relies on {alogaili2019}."],
      ] },
      { kind: "p", text: "Open datasets made this measurable. ACN-Data, from charging networks at Caltech and JPL, records real sessions, and its authors showed how such data serves both analysis and control research {lee2019acn}; ACN-Sim turns it into an open-source simulator for testing charging algorithms {lee2020acnsim}. Norwegian residential data show a large potential to shift charging from afternoon and evening to night {sorensen2023}." },
      { kind: "h", text: "Quantities every strategy uses" },
      { kind: "math", tex: String.raw`n_t = \frac{E_t}{\eta_c\,\Delta t}, \qquad \hat P_t = \min\big(\bar P,\ n_t\big), \qquad k_t = \Big\lceil \frac{n_t}{\bar P} \Big\rceil, \qquad \text{no slack} \iff k_t \ge N_t`,
        caption: String.raw`\(E_t\) is the energy the car still needs (kWh, at its battery), \(\eta_c\) the charger efficiency (default 0.95), \(\bar P\) the smaller of the charger's and the car's maximum power, and \(N_t\) the number of steps until departure. \(n_t\) is the power that would finish in one step, \(\hat P_t\) the most the car can usefully take now, and \(k_t\) the number of full-power steps still needed {code_ctrl}.` },
      { kind: "p", text: String.raw`The no-slack rule is the safety net: whatever the strategy, a car that would otherwise miss its departure target charges at full power \(\hat P_t\). Every strategy re-decides every step from the energy still missing, so a car slowed by a fuse or the import limit is caught up later {code_ctrl}.` },
      { kind: "h", text: "The four strategies in Site Lab" },
      { kind: "math", tex: String.raw`\begin{aligned}
\text{as fast as possible:}\quad & P_t = \hat P_t \\[10pt]
\text{spread until departure:}\quad & P_t = \min\!\Big(\hat P_t,\ \max\!\big(P_{\min},\ \tfrac{E_t}{\eta_c\,\Delta t\,N_t}\big)\Big) \\[10pt]
\text{cheapest hours:}\quad & P_t = \begin{cases} \hat P_t & t \text{ among the } k_t \text{ cheapest of the next } N_t \text{ steps} \\[4pt] 0 & \text{otherwise} \end{cases} \\[10pt]
\text{solar surplus:}\quad & P_t = \begin{cases} \min(\hat P_t,\ s_t) & \text{if } \ge P_{\min} \\[4pt] 0 & \text{otherwise} \end{cases}
\end{aligned}`,
        caption: String.raw`\(s_t\) is the solar surplus left after building demand and after chargers earlier in the list have taken their share {code_ctrl}.` },
      { kind: "h", text: "The minimum current" },
      { kind: "math", tex: String.raw`P_{\min} = I_{\min} \cdot 230\ \mathrm{V} \cdot n_\phi, \qquad I_{\min} = 6\ \mathrm{A} \ \Rightarrow\ P_{\min} = 4.14\ \mathrm{kW}\ (3\ \text{phases}),\ 1.38\ \mathrm{kW}\ (1\ \text{phase})`,
        caption: String.raw`Under IEC 61851-1 a charger cannot offer less than 6 A per phase {iec61851}; below that it pauses instead {code_model}. A car whose own maximum is below the three-phase minimum is treated as charging on one phase {code_engine}.` },
      { kind: "note", tone: "info", text: "Consequence found in our tests: a three-phase charger cannot follow a 3 kW solar surplus, because its minimum is 4.14 kW. It has to wait {code_engine}." },
      { kind: "note", tone: "info", text: "Site Lab knows each car's departure time and energy need exactly, because they come from recorded sessions. Real chargers usually do not: evcc can plan to a target charge level only if it can read the car's charge level and battery size (for example through the car maker's online service); otherwise the user enters an energy amount in kWh {evcc_plans}. This gap is one of the forecast errors the benchmark will add." },
      { kind: "h", text: "How a real charging controller does it: evcc" },
      { kind: "p", text: "evcc is an open-source charging controller for homes and small sites {evcc_solar}. Its behaviour maps closely onto the strategies above, plus details that matter on real hardware:" },
      { kind: "list", items: [
        "Solar surplus ('Smart' mode): charging starts once the surplus covers the minimum charging power and is adjusted continuously so that, if possible, no grid power is drawn; it pauses when the surplus drops {evcc_solar}.",
        "Start and stop delays: charging starts only after the surplus has stayed above the minimum for a while, and stops only after it has stayed below for a while, because some cars refuse to restart after too many interruptions {evcc_solar}.",
        "Phase switching: with a charger that can switch between one and three phases, charging can start at just 1.4 kW (one phase at 6 A) instead of the three-phase minimum {evcc_solar}.",
        "Solar share: a slider lets part of the minimum power come from the grid or the home battery, so charging is not blocked in winter, when surplus rarely reaches the minimum {evcc_solar}.",
        "Cheap grid charging: on a dynamic tariff the user sets a price limit, and fast charging is enabled in the hours below it {evcc_tariffs}.",
        "Charging plans: given a departure time and a target, the planner charges in the cheapest hours before departure, or the lowest-CO₂ hours if a CO₂ forecast is configured; it can pick the cheapest slots or one continuous block, and can move part of the charging to just before departure {evcc_plans}.",
      ] },
      { kind: "p", text: "OpenEMS has the same building blocks for commercial sites: its EV charging controller runs modes such as 'Force-Charge' and 'Surplus Energy Charging' {openems_evcs}." },
      { kind: "h", text: "The rebound peak" },
      { kind: "p", text: "Price signals move load, and if everyone sees the same signal, everyone moves together. In our shared-garage example, moving every car to the cheapest hours saved 1.4% over two winter days (€169.85 to €167.52, with the household tariff add-on) but raised the highest phase current from 56 A to 63 A, right at the fuse {runs_2026_11}. The literature calls this an avalanche effect, and capacity-based pricing is one proposed fix {valogianni2025}. A review of reinforcement learning for demand response makes the same point from the other side: when prices depend on demand, controllers risk shifting the peak instead of shaving it {vazquezcanteli2019review}. Coordinated approaches avoid it; in a game-theoretic scheme, each household best-responds to the total load and tariff, and the resulting equilibrium both minimises total cost and lowers the peak-to-average ratio {mohsenianrad2010}." },
      { kind: "h", text: "Go deeper" },
      { kind: "facts", rows: [
        ["The framework", "Lopes, Soares and Almeida 2010: EVs in grid operation and markets, and who does what {lopes2010}."],
        ["Review of control strategies", "Al-Ogaili et al. 2019: scheduling, clustering and forecasting with real-world data {alogaili2019}."],
        ["Fleets in the market", "Bessa et al. 2011: an EV aggregator bidding energy and reserve {bessa2011}."],
        ["Open data and simulation", "ACN-Data {lee2019acn} and ACN-Sim {lee2020acnsim}; Norwegian residential sessions {sorensen2023}."],
        ["Coordination and pricing", "Game-theoretic scheduling {mohsenianrad2010}; capacity-based pricing against avalanches {valogianni2025}."],
      ] },
    ],
  },
  {
    id: "planned", section: "lab", title: "Planned controllers", status: "planned",
    summary: "Deterministic MPC is built; stochastic MPC, learning-based hybrids and safe reinforcement learning follow, in that order.",
    blocks: [
      { kind: "note", tone: "info", text: "Only deterministic MPC on this page is implemented in Site Lab so far {code_mpc}. The rest is the plan; the theory is on 'Model predictive control', 'Planning under uncertainty' and 'Reinforcement learning'." },
      { kind: "h", text: "Deterministic MPC (built)" },
      { kind: "p", text: "Model predictive control optimises over a forecast horizon, applies only the first step, and repeats. EMHASS implements this as a linear program and re-optimises frequently, for example every 5 minutes {emhass_lp}, building the problem with CVXPY and solving it with HiGHS by default {emhass_home}. Site Lab's version is described on 'Model predictive control' {code_mpc}." },
      { kind: "h", text: "Stochastic MPC" },
      { kind: "p", text: "Plans against forecast uncertainty instead of a single forecast. One study combined an LSTM forecaster with a constraint-tightened stochastic optimisation and cut a German company's peak grid draw by a further 99 kW (5.8%) compared with standard MPC {li2025smpc}." },
      { kind: "h", text: "Learning-based hybrids" },
      { kind: "p", text: "Across four years of the CityLearn Challenge, hybrid approaches combining forecasting, optimisation and learning proved effective {nagy2025}." },
      { kind: "h", text: "Safe reinforcement learning (last)" },
      { kind: "p", text: "Model-free RL explores with largely random decisions that can violate safety constraints, so deploying it directly is considered unacceptable without safety mechanisms {yu2024saferl}. In a real home test, an RL agent still in training cost 25.5% more than rules, decision trees and MPC {ruddick2024}; in a real industrial heating network, RL ran stably but performed significantly worse than in simulation {lademann2026}." },
    ],
  },
  {
    id: "layers", section: "lab", title: "Control layers and time scales",
    summary: "Real energy management is a stack: day-ahead plans, re-planning every few minutes, fast local control in seconds, and hard safety limits underneath.",
    blocks: [
      { kind: "p", text: "In plain words: a site's energy management is not one algorithm but a chain of them, each on its own clock. Once a day a planner decides roughly when to buy, store and use energy; every few minutes that plan is refreshed with new measurements; within seconds, local controllers react to the grid and to breakers; and underneath everything, hard limits stop any decision that would be unsafe. Each layer hands its decision down as a target for the next." },
      { kind: "p", text: "Reviews of microgrid energy management describe the same building blocks: decision-making strategies and their solution methods, ways to quantify the uncertainty of renewables and load, and the communication technology that links them {zia2018}. Reviews of virtual power plants add the time dimension: optimisation runs day-ahead, intra-day and in real time, with centralised, distributed or hybrid control {huang2026vpp}." },
      { kind: "facts", rows: [
        ["Day ahead (once a day)", "Plan tomorrow from price and load forecasts. European day-ahead prices are set per 15 minutes since 1 October 2025 {sdac_15min}. Google plans each data center cluster's hourly capacity for flexible jobs one day ahead {google_vcc}."],
        ["Re-planning (every 5-15 min)", "Re-run the plan with fresh measurements and forecasts, apply only the next step. EMHASS's MPC mode re-optimises, for example, every 5 minutes {emhass_lp}; OpenEMS's time-of-use controller rebuilds a 24-hour schedule in 15-minute intervals on a rolling basis {openems_tou}; Google's autonomous cooling control acts every five minutes {deepmind2018}."],
        ["Fast local control (seconds)", "React to the grid frequency or a breaker limit without waiting for the planner. Below Site Lab's time step, so Site Lab assumes this layer executes the plan perfectly."],
        ["Safety limits (always)", "Hard limits checked locally before anything is executed. In Site Lab this is the safety layer (import limit, fuses, export limit) {code_engine}; in Google's cooling system the local control system re-verifies every instruction from the cloud against its own constraints {deepmind2018}."],
      ] },
      { kind: "h", text: "Site Lab's safety layer, as a formula" },
      { kind: "math", tex: String.raw`\text{if } g_t > G^{\mathrm{imp}}: \quad P^{\mathrm{EV}}_{i,t} \leftarrow P^{\mathrm{EV}}_{i,t}\Big(1 - \frac{x_t}{\sum_j P^{\mathrm{EV}}_{j,t}}\Big), \qquad x_t = \text{excess left after the battery}`,
        caption: String.raw`When the site would import more than its limit \(G^{\mathrm{imp}}\), the battery first stops charging, then discharges harder; whatever excess \(x_t\) remains is taken from the cars in proportion to their power, and any overload still left is recorded {code_engine}. Fuses are handled the same way, per phase {code_engine}.` },
      { kind: "h", text: "Fast layer example: frequency containment reserve (FCR)" },
      { kind: "p", text: "Batteries can be paid to help stabilise the grid frequency {shi2017}. EU rules require FCR to be activated by a proportional governor reacting to frequency deviations, or by a monotonic piecewise-linear power-frequency curve {sogl2017}. In continental Europe the full reserve must be delivered for a deviation of ±200 mHz within 30 seconds, with a dead band of at most 10 mHz {sogl2017}:" },
      { kind: "math", tex: String.raw`P^{\mathrm{FCR}}_t = -\,P^{\mathrm{res}} \cdot \operatorname{clip}\!\Big(\frac{f_t - 50\ \mathrm{Hz}}{0.2\ \mathrm{Hz}},\ -1,\ 1\Big), \qquad P^{\mathrm{battery}}_t = P^{\mathrm{plan}}_t + P^{\mathrm{FCR}}_t`,
        caption: String.raw`\(f_t\) is the measured grid frequency and \(P^{\mathrm{res}}\) the reserve sold. Frequency too high: the battery charges; too low: it discharges, proportionally, reaching the full reserve at 49.8 or 50.2 Hz {sogl2017}.` },
      { kind: "p", text: "This is why the layers matter for planning: power and energy reserved for FCR are not available for peak shaving, so the planner must hold them back. Research on using one battery for both, with degradation and uncertainty in load and regulation signals in the model, found the joint saving is often larger than the sum of the two alone, that a simple threshold real-time rule captures that gain, and that bills fell by up to 15% on real data {shi2017}." },
      { kind: "h", text: "Why Site Lab models only part of the stack" },
      { kind: "p", text: "Site Lab simulates the re-planning and safety layers at 1-60 minute steps {code_engine}. Second-by-second services like FCR, and the inverter control that delivers them, need a different simulator; we treat them as executed exactly as planned and say so." },
    ],
  },
  {
    id: "mpc", section: "lab", title: "Model predictive control (MPC)", status: "built",
    summary: "Planning ahead with a model and a forecast, re-planned every few minutes: the idea, the optimisation Site Lab solves, the design choices, what reviews and field tests report, and where it is used.",
    blocks: [
      { kind: "note", tone: "info", text: "Built in Site Lab as the battery strategy 'mpc': it plans the battery and every EV charger together {code_mpc}. By default it sees perfect forecasts (the true future load, solar, prices and car visits), an upper bound; with realistic forecasts it sees only what a real system would know, and 'Compare forecasts' runs both. See 'Planning under uncertainty' {code_mpc} {code_forecasts}." },
      { kind: "p", text: "In plain words: MPC is how a careful driver uses the road ahead. With a model of how the site behaves and a forecast of the next day (prices, load, sun, cars), it works out the best plan for the whole horizon, carries out only the first step, then looks again with fresh information and re-plans. The model makes it plan; the re-planning makes it forgive wrong forecasts. Its strength is that goals (cost, peaks, wear) and limits (fuses, battery size, departure times) are written down explicitly and traded off by a solver rather than by hand-tuned rules." },
      { kind: "h", text: "Where it comes from" },
      { kind: "p", text: "MPC's appeal, in the words of one overview, is its conceptual simplicity and its ability to handle systems with many inputs and outputs, constraints on inputs and states, and conflicting objectives {mesbah2016}. Mayne reviews its recent developments and future promise {mayne2014}. In buildings, reviews report that MPC can notably reduce energy use and emissions, but that practical applications are still at an early stage {drgona2020}; it has been applied to building thermal mass, to active storage and to on-site renewables, and its ability to handle constraints, disturbance forecasts and conflicting goals such as comfort and cost is its main advantage {serale2018}." },
      { kind: "h", text: "The loop (receding horizon)" },
      { kind: "steps", items: [
        "Measure the current state, above all the battery's charge (the optimiser's initial state of charge) {emhass_lp}.",
        "Take forecasts for the next H steps: load and solar, plus the price for each step {emhass_lp}.",
        "Solve one optimisation over the whole horizon {emhass_lp}.",
        "Apply only the first step's decisions, then repeat at the next step with new data {emhass_lp}.",
      ] },
      { kind: "h", text: "The optimisation Site Lab solves at every re-plan" },
      { kind: "p", text: "The structure follows EMHASS's linear program (power balance per step, battery charge and discharge with their own efficiencies) {emhass_lp}, extended with EV charging, the site's limits and demand charges {code_mpc}. Each re-plan covers the next 24 hours by default and is repeated every 60 minutes, and immediately when a car plugs in; both are settings {code_mpc} {code_model}. It is solved with HiGHS through SciPy {code_mpc}." },
      { kind: "math", tex: String.raw`\min\ \ \underbrace{\sum_{t=0}^{H-1}\big(p_t\, g^{+}_t - p^{\mathrm{exp}}\, g^{-}_t\big)\Delta t}_{\text{energy bill}} \;+\; \underbrace{c^{\mathrm{flat}}\, \hat g \;+\; \sum_{w} c_w\, \hat g_w}_{\text{demand charges}} \;-\; \underbrace{v\, e_H}_{\text{energy left at the end}} \;+\; \underbrace{M \sum_{k} s_k \;+\; 100M \sum_t o_t}_{\text{penalties}} \;+\; \underbrace{\tfrac{w}{2} \sum_t (c_t + d_t)\Delta t}_{\text{battery wear}}`,
        caption: String.raw`Variables for every step \(t\) of the horizon \(H\): battery charge \(c_t\) and discharge \(d_t\); grid import \(g^{+}_t\) and export \(g^{-}_t\); curtailed solar \(u_t\); charging power \(P_{k,t}\) for each car visit \(k\), plugged in now or expected inside the horizon; peaks \(\hat g\) (monthly) and \(\hat g_w\) (one per time-of-use demand window); a shortfall \(s_k\) per visit and an overload \(o_t\) for the import limit and each phase's fuse, all \(\ge 0\) {code_mpc}. \(p_t\) is the import price, \(p^{\mathrm{exp}}\) the export price, \(c^{\mathrm{flat}}\) and \(c_w\) the demand charges per kW. Energy left in the battery at the end is valued at \(v = \eta \cdot \max(\min_t p_t,\ p^{\mathrm{exp}},\ 0)\), the cheapest price ahead after losses: enough to store free solar rather than export it for nothing, never enough to buy from the grid just to fill up, since charging costs \(p/\eta > p\,\eta\). EMHASS instead can force the battery to end where it started {emhass_lp}. The penalty \(M\) is 10 times the largest price or demand rate (at least 10), so missing car energy is always worse than paying for it, and breaking a limit worse still. \(w\) is the battery's wear price per kWh cycled, charged half on the way in and half on the way out (one full cycle is one capacity in and out), from the same ageing model that scores every run; see 'Batteries' {code_mpc} {code_wear}. Without a replacement cost, \(w/2 = 10^{-4}\) per kWh only stops pointless cycling when costs tie {code_mpc}.` },
      { kind: "math", tex: String.raw`\begin{aligned}
& g^{+}_t - g^{-}_t = L_t - S_t + u_t + \textstyle\sum_k P_{k,t} + c_t - d_t && \text{power balance} \\[10pt]
& e_{t+1} = e_t + \big(\eta\, c_t - d_t/\eta\big)\Delta t, \quad E_{\min} \le e_t \le E_{\max}, \quad c_t, d_t \le P_{\mathrm{nom}} && \text{battery} \\[10pt]
& g^{+}_t \le G^{\mathrm{imp}} + o_t, \quad g^{-}_t \le G^{\mathrm{exp}}, \quad u_t \le S_t && \text{grid connection} \\[10pt]
& \tfrac13 (L_t - S_t + u_t + c_t - d_t) + \textstyle\sum_{k \in \phi} P_{k,t} + \tfrac13 \sum_{k \in 3\phi} P_{k,t} \le F + o^{\phi}_t && \text{each phase } \phi \text{ and its fuse} \\[10pt]
& P_{k,t} = 0 \ \text{ or } \ P^{\min}_k \le P_{k,t} \le P^{\max}_k, \quad P_{k,t} = 0 \text{ when car } k \text{ is away} && \text{charger off or at least 6 A} \\[10pt]
& \textstyle\sum_{t} \eta_c\, P_{k,t}\, \Delta t + s_k \ge E_k && \text{energy by departure} \\[10pt]
& \hat g \ge \max(g^{+}_t,\ \text{peak so far this month}), \quad \hat g_w \ge g^{+}_t \ \ \forall\, t \in w && \text{peaks}
\end{aligned}`,
        caption: String.raw`\(L_t\) and \(S_t\) are the forecast load and solar, \(F\) the fuse limit per phase in kW, \(P^{\min}_k\) the charger's minimum (6 A per phase, or less for the final top-up), \(E_k\) the energy a car still needs (only the part that cannot wait until after the horizon) {code_mpc}. The peak lines are the standard trick for a 'maximum' inside a linear program: \(\hat g\) can only be as low as the highest import, and the objective pushes it down, so the optimiser trades energy cost against peak cost. The 'off or at least 6 A' line is not linear. Modelled exactly it needs an on/off variable per car and step (a mixed-integer program), which was too slow for year-long runs, so Site Lab uses relax-and-fix instead. It solves the linear version; where a car's plan falls between 0 and its minimum, it re-solves once with those steps off and once with the largest forced up to the minimum, keeps the cheaper plan, and repeats until no step is left in between {code_mpc}. On the test cases it matches the exact solution to within 2% {code_mpc}.` },
      { kind: "h", text: "What we learned building it" },
      { kind: "list", items: [
        "A planner is only as good as what it is told. With a perfect forecast of load, solar and prices but blind to car visits, our MPC exported free solar at midday and then charged the evening car from the grid; on a German home it cost more than a simple 'store all spare solar' rule. Telling it the upcoming visits fixed that {code_mpc}.",
        "End-of-horizon value matters. Without a value for energy left at the end, storing solar today looks worthless whenever tomorrow's sun will refill the battery anyway {code_mpc}.",
        "Rounding a continuous plan is not harmless. Rounding a trickle of planned charging up to the 6 A minimum made the grid pay the difference, and switching small remainders off made cars leave short {code_mpc}.",
        "Without a demand charge in the tariff, MPC has no reason to keep peaks low and will charge up to the import limit when that is cheapest; the objective only contains peaks when the tariff bills them {code_mpc}.",
      ] },
      { kind: "h", text: "Design choices that decide whether MPC works" },
      { kind: "p", text: "A review of MPC for heating and cooling systems lists the factors that drive performance: the control configuration, the type of process, the model, the optimisation technique, the prediction and control horizons, the constraints and the cost function {afram2014}. Three of them matter most for energy sites:" },
      { kind: "list", items: [
        "The model. Building MPC uses physics-based, data-driven or hybrid models, and the choice drives both accuracy and solve time {drgona2020}. Developing control-oriented models for each individual building is a major hurdle, which is why data-driven predictive control, with models learned from measurements, is attracting attention {kathirgamanathan2020}. Battery and EV models, as on this page, are simple and linear, which is why storage is a natural first target.",
        "The problem class. With on/off decisions (a generator started, a device switched) the problem becomes a mixed-integer linear program; a microgrid MPC formulated this way was solved efficiently with commercial solvers and run on an experimental microgrid in Athens {parisio2014}. Pure battery and charging problems can usually stay linear, and open-source solvers such as HiGHS handle them {emhass_home}.",
        "The horizon and replan interval. Longer horizons see further but need forecasts further out; EMHASS re-plans, for example, every 5 minutes {emhass_lp}, OpenEMS rebuilds a 24-hour schedule in 15-minute steps {openems_tou}.",
      ] },
      { kind: "h", text: "Pricing battery wear" },
      { kind: "list", items: [
        "Cycle-ageing cost modelled as a piecewise-linear function, usable in electricity-market clearing {xu2017}.",
        "EMHASS adds virtual costs that steer behaviour without changing the reported bill: an inverter 'stress cost' that grows with the square of power (approximated piecewise-linearly; recommended 0.05-0.20 per kWh at full power) to prefer running 'low and slow', and a cost per kWh per hour spent above a high state-of-charge threshold, because sitting full accelerates calendar ageing {emhass_lp}.",
        "Batteries are not uniform: optimising each string's ageing separately gave 21% more revenue per unit of health lost {graner2025}.",
        "Site Lab: the MPC decides with one price per kWh cycled (replacement cost x capacity lost per cycle, calibrated on one full 0-100% cycle a day), while every run is scored by the full ageing model. On the German home week with the real tariff, pricing wear made the MPC cycle less (4.4 instead of 6.4 full cycles) and it ended €0.43 better once wear was counted (€19.96 against €20.39) {code_wear} {runs_2026_11d}. With exports paid nothing (an earlier setting) the same flat price backfired by €0.77: each kWh not cycled saved only about €0.11 of scored wear against a €0.15 price {runs_2026_11c}. The cause is not cycle depth: in the LFP model, wear per full cycle barely changes between 10% and 100% depth, while in the NMC model it rises sixteen-fold {runs_2026_11f}. Likely causes, not yet pinned down: the referee also counts calendar ageing, which depends on how full the battery is kept, and ageing slows as a battery ages, neither of which a price per kWh sees {code_wear}.",
      ] },
      { kind: "h", text: "What field tests and reviews report" },
      { kind: "list", items: [
        "On real hardware, MPC, simple rules and decision trees ended within 0.6% of each other in cost on four house reproductions {ruddick2024}: the gain depends on the site.",
        "On an experimental microgrid, an MILP-based MPC was feasible and effective in real operation {parisio2014}.",
        "Adding forecast uncertainty explicitly helped: a stochastic MPC cut a company's peak grid draw by a further 99 kW (5.8%) compared with standard MPC {li2025smpc}. See 'Planning under uncertainty'.",
        "Practical deployment needs more than the optimiser: building MPC reviews stress control architectures, communication with the site's SCADA system, implementation workflows and standardised performance assessment {drgona2020}.",
      ] },
      { kind: "h", text: "Where it is used" },
      { kind: "p", text: "Open source: EMHASS runs this kind of optimisation for Home Assistant households {emhass_lp}. Commercial: OpenEMS, the software behind FENECON's systems, runs a rolling 24-hour time-of-use schedule {openems_intro} {openems_tou}. Research: microgrids {parisio2014} and building climate control {drgona2020} {serale2018}. How the formulation specialises for a home, a garage, an office and a data center is on 'Control by use case'." },
      { kind: "h", text: "Go deeper" },
      { kind: "facts", rows: [
        ["Start here", "Drgoňa et al. 2020, 'All you need to know about model predictive control for buildings': formulations, models, solvers, implementation {drgona2020}."],
        ["Formulation and taxonomy", "Serale et al. 2018: a common dictionary and formulation framework for building MPC {serale2018}."],
        ["What drives performance", "Afram and Janabi-Sharifi 2014: horizons, models, constraints, cost functions {afram2014}."],
        ["Microgrids", "Parisio et al. 2014: MILP-based MPC tested on a real microgrid {parisio2014}."],
        ["Data-driven models", "Kathirgamanathan et al. 2020: predictive control with learned models {kathirgamanathan2020}."],
        ["Theory", "Mayne 2014: developments and future of MPC {mayne2014}."],
      ] },
    ],
  },
  {
    id: "uncertainty", section: "lab", title: "Planning under uncertainty",
    summary: "Forecasts are always wrong. Re-planning, stochastic MPC, chance constraints and robust optimisation are four ways to live with that, each with a different price.",
    blocks: [
      { kind: "p", text: "In plain words: every plan rests on forecasts of load, sun, prices and cars, and every forecast is wrong. A planner can react in four ways: trust one forecast but re-plan often; plan for many possible futures at once and do well on average; demand that limits hold with a chosen probability; or plan for the worst case. Each step along that list buys safety and costs performance. Measuring that trade-off on real data, with forecast errors added on purpose, is the core of this benchmark." },
      { kind: "h", text: "Where the uncertainty comes from" },
      { kind: "list", items: [
        "Renewables and load: reviews of microgrid energy management treat their volatility and intermittency as the central difficulty, and summarise several ways to quantify it {zia2018}.",
        "People: when cars arrive and leave, and how much energy they need, has to be forecast; an EV aggregator's bids depend on exactly these forecasts {bessa2011}.",
        "Prices: day-ahead prices are set in an auction the day before, per 15 minutes since October 2025 {sdac_15min}; any energy bought or sold closer to real time is still uncertain when the plan is made.",
      ] },
      { kind: "h", text: "Four ways to plan" },
      { kind: "math", tex: String.raw`\begin{aligned}
\text{deterministic (certainty equivalence):}\quad & \min_x\ J(x, \hat\xi) \\[12pt]
\text{stochastic (scenarios):}\quad & \min_x\ \frac{1}{S}\sum_{s=1}^{S} J(x, \xi_s) \\[12pt]
\text{chance-constrained:}\quad & \min_x\ \mathbb{E}\big[J(x,\xi)\big] \ \ \text{s.t.}\ \ \Pr\big[g^{+}_t(x,\xi) \le G^{\mathrm{imp}}\big] \ge 1-\varepsilon \\[12pt]
\text{robust:}\quad & \min_x\ \max_{\xi \in \Xi}\ J(x, \xi)
\end{aligned}`,
        caption: String.raw`\(x\) are the decisions, \(J\) the cost (as on the MPC page) and \(\xi\) the uncertain inputs. Deterministic MPC plans for one forecast \(\hat\xi\) and relies on re-planning. Stochastic MPC optimises the average over \(S\) scenarios. A chance constraint lets a limit fail with probability at most \(\varepsilon\). Robust optimisation plans for the worst case in an uncertainty set \(\Xi\).` },
      { kind: "h", text: "Stochastic MPC" },
      { kind: "p", text: "Stochastic MPC brings the probability of disturbances into the optimisation itself; an overview of the past decade's work presents the general stochastic optimal control problem and the main algorithms for linear and nonlinear systems, along with the open theoretical challenges {mesbah2016}. The scenario approach is a framework for designing controllers from a finite set of sampled scenarios {campi2009}. For energy sites, one study combined an LSTM forecaster with a constraint-tightened stochastic optimisation and cut a company's peak grid draw by a further 99 kW (5.8%) compared with standard MPC {li2025smpc}; another applied stochastic programming with probabilistic forecasts to peak shaving {rafayal2024}." },
      { kind: "h", text: "Robust optimisation and the price of robustness" },
      { kind: "math", tex: String.raw`\sum_j \bar a_j x_j \;+\; \max_{\{S:\ |S| \le \Gamma\}} \sum_{j \in S} \hat a_j\, |x_j| \;\le\; b`,
        caption: String.raw`Bertsimas and Sim's idea in one line: each uncertain coefficient \(a_j\) may deviate from its nominal value \(\bar a_j\) by up to \(\hat a_j\), but at most \(\Gamma\) of them at the same time. \(\Gamma = 0\) is the nominal plan, a large \(\Gamma\) the full worst case. Choosing \(\Gamma\) sets the level of conservatism through probabilistic bounds on constraint violation, and the robust problem stays a linear program {bertsimas2004}.` },
      { kind: "p", text: "The concern with robust plans is that they may be too conservative: they accept a worse result for the nominal forecast so that the plan stays feasible and near-optimal when the data changes {bertsimas2004}. For a battery that means holding back energy that would have been worth using on most days." },
      { kind: "h", text: "Better forecasts instead of more caution" },
      { kind: "p", text: "The other lever is the forecast itself. Probabilistic load forecasting, which gives a range rather than a single number, has its own tutorial review {hongfan2016}. Pretrained 'foundation' models now forecast many time series without site-specific training {chronos1} {chronos2}, and a 2026 benchmark tested them for load forecasting under uncertain inputs {kaljevic2026}. See the 'Forecasting' page." },
      { kind: "h", text: "Realistic forecasts in Site Lab" },
      { kind: "p", text: "Site Lab can run every controller twice: with perfect forecasts (the true future, an upper bound) and with realistic ones, which use only what a real system would know at that moment {code_forecasts}. The 'Compare forecasts' button next to Run does both and shows the difference. Realistic means:" },
      { kind: "facts", rows: [
        ["Load", "The most recent day repeated: EMHASS's 'naive' method, where the load at each future step equals the load at the same time of day on the most recent day {emhass_fc} {code_forecasts}."],
        ["Solar", "The weather forecast made 24 hours before each hour, from Open-Meteo's archive of past forecasts {om_prevruns}, run through the same solar model as the actual solar, so the only difference is the weather forecast's error {code_forecasts}. EMHASS also forecasts solar from Open-Meteo weather by default {emhass_fc}. Across our 10 solar profiles (Oct 2025 to Nov 2026), these forecasts miss daytime output by 17-30% of its mean on average, Amsterdam the most {runs_2026_11b}."],
        ["Prices", "Day-ahead prices only once published. The auction closes at 12:00 and final results were published at 12:58, with 13:01 proposed for the 2025 timings {mesc2024}; so before about 13:00 a controller knows prices until midnight, afterwards until the end of tomorrow, and beyond that it repeats the last known day {code_forecasts}. Site Lab's clock is fixed CET, so in summer this waits an hour longer than reality. Fixed tariffs are known in advance."],
        ["Cars", "Unknown until they plug in; then departure and energy are known, as if the driver had entered them in an app {code_forecasts}."],
      ] },
      { kind: "p", text: "When the forecast is wrong, the MPC lets the battery take up the difference in the current step, so the grid exchange stays as planned, and re-plans from the battery's real state at the next re-plan {code_mpc}." },
      { kind: "h", text: "First result: what deterministic MPC loses" },
      { kind: "p", text: "On the German home example (one June week, solar, battery and an EV, on a dynamic tariff with the EEG feed-in tariff), deterministic MPC cost €19.96 with perfect forecasts and €25.77 with realistic ones, battery wear included. The simple self-consumption rule cost €21.74 either way, because it does not look ahead {runs_2026_11d}. Switching each ingredient back to perfect, one at a time, recovers €2.33 with perfect solar, €1.87 when cars are known in advance, €0.68 with perfect load and nothing with perfect prices, which are published in time {runs_2026_11d}. A plan that trusts its forecast exports midday solar it believes it will not need, then meets a cloudier day or the unannounced evening car with a battery that is less full; the rule stores all spare solar anyway and is robust by accident. This is the gap the stochastic and robust methods above are meant to close, and Site Lab's next step." },
      { kind: "p", text: "The tariff changes which forecast matters most. When exports earned nothing (an earlier setting of the same example), not knowing when the car arrives was by far the biggest loss: €5.94 of an €8.71 gap in energy cost {runs_2026_11b}. With a feed-in tariff, exported solar is worth something, so wrongly exporting hurts less and the solar forecast weighs more {runs_2026_11d}." },
      { kind: "h", text: "Go deeper" },
      { kind: "facts", rows: [
        ["Stochastic MPC", "Mesbah 2016: overview and research directions {mesbah2016}; the scenario approach {campi2009}."],
        ["Robust optimisation", "Bertsimas and Sim 2004: tunable conservatism that stays linear {bertsimas2004}."],
        ["Energy applications", "Stochastic MPC for peak shaving with battery health {li2025smpc}; uncertainty in microgrid EMS {zia2018}."],
        ["Forecasting", "Probabilistic load forecasting review {hongfan2016}; foundation models {chronos2} {kaljevic2026}."],
      ] },
    ],
  },
  {
    id: "learning", section: "lab", title: "Reinforcement learning",
    summary: "Learning a control policy from experience instead of solving an optimisation each step: the formulation, what reviews find, what has worked in real facilities, and what still stands in the way.",
    blocks: [
      { kind: "note", tone: "info", text: "Not built in Site Lab. This page summarises the method, reviews and published deployments." },
      { kind: "p", text: "In plain words: reinforcement learning (RL) learns a control policy by trial and error. An agent sees the state of the site, takes an action, receives a reward (minus the cost, minus penalties) and, over many episodes, learns which actions pay off. It needs no explicit model of the site, which is its promise: it can adapt to a building as it is, including to the people in it. The price is data, training time and safety, because a learning agent must try things, and some of those things are bad." },
      { kind: "h", text: "The formulation" },
      { kind: "math", tex: String.raw`\pi^{*} = \arg\max_{\pi}\ \mathbb{E}\Big[\sum_{t=0}^{\infty} \gamma^{t}\, r(s_t, a_t)\Big], \qquad a_t \sim \pi(\cdot \mid s_t), \qquad r_t = -\big(p_t\, g^{+}_t\, \Delta t + \lambda \cdot \text{violation}_t\big)`,
        caption: String.raw`The state \(s_t\) holds measurements and forecasts (charge level, load, prices, time); the action \(a_t\) holds setpoints (battery power, charging power); the reward \(r_t\) is minus the cost, with a penalty \(\lambda\) for breaking limits; \(\gamma < 1\) discounts the future. This is the standard Markov decision process of RL textbooks {suttonbarto2018}. Deep RL represents the policy or value function with a neural network; a landmark paper reached human-level control with deep reinforcement learning {mnih2015}.` },
      { kind: "h", text: "The five design choices" },
      { kind: "p", text: "A review of RL for building controls breaks every study into the same five components: the algorithm, the state, the action, the reward and the environment it is trained in {wanghong2020}. In energy terms: which learning method; what the agent sees (forecasts or only measurements); what it controls (one battery or many devices); how cost, comfort and limits are weighted in the reward; and whether it trains in a simulator, on recorded data or on the real site." },
      { kind: "h", text: "What reviews find" },
      { kind: "list", items: [
        "RL has been used to control electric vehicles, heating and cooling, smart appliances and batteries for demand response {vazquezcanteli2019review}.",
        "Most studies consider a single agent, prices that do not depend on demand and a stationary environment; when prices depend on demand, controllers risk shifting the peak instead of shaving it, so coordinating many agents is a key open need {vazquezcanteli2019review}.",
        "RL for building controls is still mostly research: only 11% of the reviewed studies were applied in real buildings {wanghong2020}.",
        "Three barriers stand in the way: training is time-consuming and data-hungry, control security and robustness must improve, and controllers generalise poorly to new buildings without methods such as transfer learning {wanghong2020}.",
        "Model-free RL explores with largely random decisions that can violate safety constraints, so deploying it without safety mechanisms is considered unacceptable {yu2024saferl}.",
      ] },
      { kind: "h", text: "Benchmarks" },
      { kind: "p", text: "CityLearn was built as an open environment for training and comparing RL agents for building demand response {vazquez2019}. Four years of its challenge found that hybrid approaches, combining forecasting, optimisation and learning, did well {nagy2025}. Site Lab's goal is the same kind of honest comparison, on its own engine and with real data." },
      { kind: "h", text: "Deployed example: Google data center cooling" },
      { kind: "list", items: [
        "2016, recommendations: ensembles of deep neural networks trained on historical data from thousands of sensors (temperatures, power, pump speeds, setpoints) predicted future PUE, temperature and pressure {deepmind2016}; operators vetted and implemented the recommended actions {deepmind2018}. Cooling energy fell by up to 40%, equal to a 15% reduction in PUE overhead {deepmind2016}.",
        "2018, autonomous control: every five minutes the system reads thousands of sensors, predicts how candidate actions affect future energy use, and picks the one that minimises energy within safety constraints {deepmind2018}.",
        "Safety design: actions with low confidence are discarded; every action is checked against operator-defined constraints in the cloud and again by the local control system; operators can leave AI mode at any time and fall back to the site's rules {deepmind2018}.",
        "Trade-off: the operating range was deliberately narrowed for safety, accepting smaller savings; savings grew from 12% at launch to about 30% on average over nine months {deepmind2018}.",
      ] },
      { kind: "math", tex: String.raw`a_t = \arg\min_{a \in \mathcal{A}_{\text{safe}}}\ \widehat{\text{PUE}}(s_t, a) \quad \text{s.t.}\ \ \widehat{T}(s_t, a) \le T^{\max},\ \ \text{confidence}(a) \ge \kappa`,
        caption: String.raw`A sketch of that loop: a learned model \(\widehat{\text{PUE}}\) predicts efficiency, learned models \(\widehat T\) predict temperatures and pressures, and only confident actions inside the operator-defined safe set \(\mathcal{A}_{\text{safe}}\) are allowed {deepmind2016} {deepmind2018}. The notation is ours; the blog posts describe the steps in words. Note that this is learned models plus optimisation, closer to MPC with learned models than to model-free RL.` },
      { kind: "h", text: "Real-world tests of RL itself" },
      { kind: "list", items: [
        "Real home hardware: an RL agent still in training cost 25.5% more than rules, decision trees and MPC {ruddick2024}.",
        "Real industrial heating network: RL ran stably but performed significantly worse than in simulation {lademann2026}.",
        "Homes with several batteries and uncertain conditions remain an active research topic {yuan2026}.",
      ] },
      { kind: "p", text: "This matches what safe-RL reviews call for: learning only with safety mechanisms around it {yu2024saferl}. It is also the same split as Site Lab's controller plus safety layer {code_engine}." },
      { kind: "h", text: "Go deeper" },
      { kind: "facts", rows: [
        ["The basics", "Sutton and Barto, the standard RL textbook {suttonbarto2018}; human-level control with deep RL {mnih2015}."],
        ["RL for demand response", "Vázquez-Canteli and Nagy 2019: algorithms and modelling, and the peak-shifting risk {vazquezcanteli2019review}."],
        ["RL for buildings", "Wang and Hong 2020: five components, 11% real-building share, three barriers {wanghong2020}."],
        ["Safety", "Safe RL for power system control {yu2024saferl}."],
        ["Reality checks", "Real hardware {ruddick2024}; real industrial network {lademann2026}; CityLearn {nagy2025}."],
      ] },
    ],
  },
  {
    id: "case-home-de", section: "examples", title: "Case study: what is smart control worth?",
    summary: "Four real German homes with solar, a battery and an EV, simulated for a full year on today's tariff rules, with realistic forecasts and battery wear counted. A simple rule beat the optimiser.",
    blocks: [
      { kind: "p", text: "The question a home owner, an installer or an energy company asks: how much does a home battery save, and how much more does a 'smart' optimiser add? Single example weeks can mislead, so this study runs a full year for four different real homes, each with its own real driver, and reports the range {runs_2026_11e}." },
      { kind: "h", text: "Setup" },
      { kind: "facts", rows: [
        ["Homes", "Four measured German households from Open Power System Data, using 2.4 to 9.8 MWh a year; one has a heat pump, one uses most of its power around midday {runs_2026_11e}."],
        ["Cars", "Each home gets one measured driver from Norwegian home garages (SINTEF), charging up to 11 kW {runs_2026_11e}."],
        ["Equipment", "8 kWp of solar (modelled from Konstanz weather), a 10 kWh / 5 kW LFP battery; example sizes, not sourced {runs_2026_11e}."],
        ["Tariff", "German day-ahead price plus average grid fees and taxes and a real supplier margin; exports earn the EEG feed-in tariff of 7.86 ct/kWh, but nothing while the spot price is negative {bnetza_eeg} {eeg51} {witten_tariff}."],
        ["Period", "November 2025 to October 2026, hourly steps {runs_2026_11e}."],
        ["Controllers", "Battery idle with the car charging on arrival (the baseline); a simple rule (store spare solar, charge the car in the cheapest hours); and the optimiser (MPC), with perfect or realistic forecasts {runs_2026_11e}."],
        ["Wear", "Every run is scored with NREL's ageing model; the battery is worth 1,200 €/kWh, the 2022 average for German home systems excluding VAT {code_wear} {figgener2023}."],
      ] },
      { kind: "h", text: "Results: yearly saving against battery idle, wear included" },
      { kind: "facts", rows: [
        ["Simple rule", "€336 a year (median of the four homes; €210 to €473). Self-sufficiency rose from 34% to 68% {runs_2026_11e}."],
        ["Optimiser, perfect forecasts", "€399 a year (€321 to €612): better than the rule in every home, by €35 to €139 {runs_2026_11e}."],
        ["Optimiser, realistic forecasts", "€239 a year (€89 to €425): worse than the rule in every home, by €27 to €197 {runs_2026_11e}."],
        ["Battery wear", "About €374 a year with the rule, which wears the battery to the end of its life in about 32 years in the model; the optimiser that prices wear stretches that to about 39 years {runs_2026_11e}."],
      ] },
      { kind: "h", text: "What it means" },
      { kind: "list", items: [
        "A battery mostly earns by storing midday solar for the evening. With the rule, the energy bill fell by €548 to €869 a year (median €672), and wear ate a bit more than half of that {runs_2026_11e}.",
        "Perfect foresight is worth only about €100 a year more than the simple rule here: the ceiling for any smarter controller on this kind of home and tariff {runs_2026_11e}.",
        "A deterministic optimiser that trusts imperfect forecasts loses that edge and more, in every home. It needs to plan for uncertainty (see 'Planning under uncertainty') before it can beat a well-chosen rule {runs_2026_11e}.",
        "Counting wear matters: on energy alone the ranking of controllers can flip, as the June week on the 'Batteries' page shows {runs_2026_11d}.",
      ] },
      { kind: "h", text: "Read with care" },
      { kind: "list", items: [
        "Four homes are not a market average; the homes differ a lot (energy bills from €614 to €2,300 a year with the battery idle) {runs_2026_11e}.",
        "The wear value uses 2022 battery prices, which have fallen since, and leaves out financing, inverter replacement and installation; it is not a full payback calculation {figgener2023}.",
        "Some car visits ask for more energy than the charger can deliver before departure; that shortfall is the same for every controller and comes from the data, not from control {runs_2026_11e}.",
        "Hourly steps, loads from other years than the weather, and the other simplifications on the 'Limits' page apply {code_profiles}.",
      ] },
      { kind: "note", tone: "info", text: "Reproduce it: python -m emsbench.study (about 50 minutes on 8 cores); results in results/study_home_de. Try one home in the app with the example 'German home, solar + battery + EV (full year)'." },
    ],
  },
  {
    id: "limits", section: "lab", title: "Limits: what Site Lab simplifies",
    summary: "Every simulator leaves things out. Here is everything Site Lab simplifies, and which way each simplification is likely to push the results.",
    blocks: [
      { kind: "p", text: "In plain words: a result is only as trustworthy as its weakest assumption. This page lists them in one place, so you can judge a number before you repeat it. 'Pushes results' says which way each simplification probably biases a comparison, where that is clear." },
      { kind: "h", text: "Data" },
      { kind: "facts", rows: [
        ["Stitched across years and places", "Home loads are measured in 2015-2018, weather, solar and prices are from 2025-2026, the EV visits from Norwegian garages in 2018-2020; each is mapped onto the simulated dates by season and weekday {code_profiles}. Weather-driven load (heating on a cold day) is therefore not aligned with that day's solar and prices. Pushes results: probably understates how often high load, low sun and high prices coincide."],
        ["Solar is modelled, not metered", "From weather with a standard solar model, checked against a long-term reference to about ±10% {pvgis_check}."],
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
  {
    id: "use-cases", section: "lab", title: "Control by use case",
    summary: "How the algorithms are applied to a home, a shared garage, an office or C&I site, a data center and a portfolio of sites: what is optimised, what limits bind, what our runs show and what real systems do.",
    blocks: [
      { kind: "p", text: "In plain words: a home, a garage, an office and a data center all have the same ingredients (a grid connection, loads, maybe solar, a battery and cars) but they pay for electricity differently and hit different limits first. A home cares about the price of each kWh; a shared garage about its fuse; an office about its monthly peak; a data center about never touching its backup reserve while its peaks are billed heavily. The algorithm that wins depends on which of these dominates, so this page writes the cost and the binding limit down for each kind of site and then looks at what each controller does with it." },
      { kind: "p", text: "The same engine and the same algorithms run every site; what changes is the cost the site pays, the limit that binds first, and which devices can move {code_engine}. All numbers from our runs come from the example sites, compared with the same equipment without smart control (battery idle, cars charging on arrival) {runs_2026_11}." },
      { kind: "facts", rows: [
        ["Home", "Cost: energy at a fixed or dynamic price. Binding limit: the house fuse. Flexible: home battery, one car."],
        ["Shared garage / apartment block", "Cost: energy. Binding limit: the shared fuse or connection. Flexible: many cars, maybe a shared battery."],
        ["Office / C&I", "Cost: energy plus demand charges. Binding limit: the connection, and the monthly peak on the bill. Flexible: battery, workplace charging."],
        ["Data center", "Cost: dominated by demand charges and a flat, high load. Binding limit: the backup reserve, which must never be touched. Flexible: battery above the reserve, deferrable compute, cooling."],
      ] },

      { kind: "h", text: "1. Home with solar, battery and EV" },
      { kind: "math", tex: String.raw`J_{\text{home}} = \sum_t \big[(p_t + a)\, g^{+}_t - p^{\mathrm{exp}}\, g^{-}_t\big]\,\Delta t, \qquad I_{\phi,t} \le I^{\mathrm{fuse}}`,
        caption: String.raw`On a dynamic tariff the household pays the spot price \(p_t\) plus a fixed add-on \(a\) for network costs and taxes; the example uses \(a = €0.237/\mathrm{kWh}\), derived from Eurostat's 2025 averages for Germany {eurostat_check}. Exports earn \(p^{\mathrm{exp}}\) (zero in the example) {code_engine}.` },
      { kind: "p", text: "Rules in our example: self-consumption for the battery, cheapest hours for the car. Over one June week the bill fell from €29.32 (battery idle, car charging on arrival) to €11.57 (−61%), the share of consumption covered on site rose from 31% to 73%, every car reached its target, and the battery did 5.2 equivalent full cycles in the week {runs_2026_11d}." },
      { kind: "p", text: "Real systems do the same with more care: evcc combines solar surplus, a price limit and charging plans at one charging point {evcc_solar} {evcc_tariffs} {evcc_plans}; EMHASS runs the full linear program for Home Assistant households, including deferrable appliances {emhass_lp}. What MPC adds at home: deciding whether battery energy is worth more tonight or tomorrow morning, and charging the car from the battery or from the grid, using the wear cost to avoid cycling for tiny gains." },

      { kind: "h", text: "2. Shared garage or apartment block" },
      { kind: "math", tex: String.raw`I_{\phi,t} = \frac{1000}{230}\Big(\frac{B_t}{3} + \sum_{i \in \phi} P_{i,t} + \sum_{i \in 3\phi} \frac{P_{i,t}}{3}\Big) \le I^{\mathrm{fuse}} \quad \text{for each phase } \phi \in \{L1, L2, L3\}`,
        caption: String.raw`\(B_t\) is the building load in kW, assumed balanced over the three phases; single-phase chargers add all their power to their own phase, three-phase chargers a third to each. When a phase would exceed the fuse, the safety layer slows the chargers on that phase in proportion, and a charger squeezed below its minimum pauses {code_engine}.` },
      { kind: "p", text: "Rules in our garage example (eight chargers behind a 3 × 63 A fuse, two winter days): cheapest hours saved 1.4% but pushed the highest phase current from 56 A to the full 63 A, because all cars started at the same cheap moment {runs_2026_11}. In the one-year apartment example (price arbitrage, spread until departure, 80 kW limit) the bill fell 4.3% (USD 21,792 to 20,850) and the peak stayed at the 80 kW limit instead of 86 kW {runs_2026_11}." },
      { kind: "note", tone: "warn", text: "Caveat on the garage: its building load is one measured home's profile multiplied by eight, so the eight 'flats' peak at the same moment; real flats peak at different times. This overstates how close the fuse is {runs_2026_11}." },
      { kind: "p", text: "What MPC adds here: the fuse becomes a constraint inside the plan instead of a correction afterwards, so cars are staggered across the cheap hours before they would collide. The avalanche of synchronised charging is a known effect, and capacity-based pricing is one proposed fix {valogianni2025}." },

      { kind: "h", text: "3. Office or commercial and industrial (C&I) site" },
      { kind: "math", tex: String.raw`J_{\text{C\&I}} = \sum_t p_t\, g^{+}_t\, \Delta t + c_d \cdot \max_{t \in \text{month}} g^{+}_t`,
        caption: String.raw`Many commercial tariffs add a demand charge \(c_d\) per kW of the month's highest import {code_engine}. One kW avoided at the peak saves \(c_d\) every month, which is why peak shaving matters here and arbitrage can backfire.` },
      { kind: "p", text: String.raw`Our office runs show both sides. Price arbitrage over a year cut the energy bill by 12.7% but raised the peak from 158 to 218 kW; peak shaving over a week cut the peak from 98 to 90 kW but cost 1.4% more, because that tariff had no demand charge {runs_2026_11}. The right rule depends on the tariff, which is what an optimiser handles automatically through \(c_d\).` },
      { kind: "p", text: "Real systems: OpenEMS runs peak shaving and a rolling 24-hour time-of-use schedule on commercial sites {openems_peak} {openems_tou}. Batteries on such sites can also sell grid services; doing peak shaving and frequency regulation jointly beat doing either alone in published research {shi2017}." },

      { kind: "h", text: "4. Data center" },
      { kind: "p", text: "Why data centers are a topic of their own: they use about 1.7% of the world's electricity, and their consumption was projected to roughly double between 2022 and 2026, to about 1,000 TWh. A 2025 review argues that their large but controllable consumption makes them a significant source of flexibility, provided quality-of-service agreements are respected and market rules allow them to take part {takci2025}." },
      { kind: "math", tex: String.raw`P^{\mathrm{fac}}_t = \text{PUE} \cdot \alpha\, P^{\mathrm{IT}}_t, \qquad E_{\min} = \tau_{\mathrm{UPS}}\, \hat P^{\mathrm{fac}} = \tfrac{5}{60}\,\mathrm{h} \times 5{,}820\ \mathrm{kW} \approx 485\ \mathrm{kWh}`,
        caption: String.raw`Facility power is the measured IT load \(P^{\mathrm{IT}}_t\), scaled by \(\alpha\), times the PUE (1.54 is the 2025 industry average) {code_engine} {uptime_2025}. The battery doubles as the UPS: its minimum charge holds \(\tau_{\mathrm{UPS}} = 5\) minutes of backup at the peak facility load, the runtime many data centers now operate with {zincfive2024} {code_engine}.` },
      { kind: "math", tex: String.raw`J_{\mathrm{DC}} = \sum_t p_t\, g^{+}_t\, \Delta t \;+\; 7.91 \max_{t \in \text{month}} g^{+}_t \;+\; 18.65 \max_{t \in \text{month},\ 14\text{-}18\,\mathrm{h}} g^{+}_t \qquad [\mathrm{USD}]`,
        caption: String.raw`The example uses Xcel Energy Colorado's large-customer tariff: 7.91 USD per kW of the month's highest 15-minute import, plus 18.65 USD per kW (summer) of the highest import between 14:00 and 18:00 local time {urdb_xcel_pg} {code_tariffs}. Demand charges are about half of the bill {runs_2026_11}.` },
      { kind: "p", text: "Rule in our example: peak shaving with a fixed threshold. It cut the June bill by 1.1% (USD 307,079 to 303,637) and the peak from 5,618 to 5,400 kW, using 0.5 equivalent full cycles {runs_2026_11}. The load is flat and high, so peaks last hours; the rule empties the battery on long high stretches and spends energy outside the window that costs most {runs_2026_11}." },
      { kind: "p", text: String.raw`What MPC adds: with \(J_{\mathrm{DC}}\) in the objective it keeps energy for the 14-18 h window, refills before long high stretches, and never touches the reserve because \(E_{\min}\) is a constraint. Beyond the battery, real data centers move other things:` },
      { kind: "list", items: [
        "Compute in time: Google's day-ahead 'virtual capacity curves' cap each cluster's hourly capacity for flexible jobs while keeping the daily total, so the jobs move to cleaner or cheaper hours but still finish within the day {google_vcc}. In symbols: \\(\\sum_h C_h = C^{\\text{day}},\\ C_h \\le \\bar C_h\\).",
        "Compute on demand: a software-only field test on a 256-GPU cluster cut cluster power by 25% for three hours during peak grid events, keeping AI quality-of-service guarantees and without hardware changes or storage {emerald2025}.",
        "Cooling: learned models chose cooling setpoints every five minutes within safety constraints, saving about 30% of cooling energy on average {deepmind2018}.",
        "Grid services: a battery doing peak shaving and frequency regulation jointly saved more than the sum of both in published research {shi2017}; in Europe the fast part must follow the FCR rule on the 'Control layers' page {sogl2017}.",
      ] },

      { kind: "h", text: "5. Many sites: virtual power plants" },
      { kind: "p", text: "In plain words: one home battery cannot move the market, but ten thousand of them can. A virtual power plant (VPP) bundles many small sites and runs them as if they were one power plant, selling their combined flexibility to the grid. Each site keeps its own controller and limits; an aggregator above them forecasts what the fleet can offer, bids it, and splits the targets back to the sites." },
      { kind: "p", text: "Reviews describe VPPs as optimisation on several time scales, day-ahead, intra-day and real time, with centralised, distributed or hybrid control, and with market participation and revenue allocation as part of the problem {huang2026vpp}. Machine learning is being applied to forecasting, scheduling, bidding and aggregation, with data quality, interpretability and multi-agent scalability among the open issues {li2026aivpp}. Two classic results show the two ways of coordinating:" },
      { kind: "list", items: [
        "Central: an EV aggregator buys energy and sells secondary reserve in the day-ahead market for a whole fleet, and its bids depend on forecasting the fleet's behaviour {bessa2011}.",
        "Distributed: in a game-theoretic scheme, each household schedules its own appliances as the best response to the total load and the tariff; the equilibrium reaches the global cost optimum, lowers the peak-to-average ratio, and households keep their schedules private {mohsenianrad2010}.",
      ] },
      { kind: "p", text: "Site Lab simulates one site at a time; coordinating several is a later step." },
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
      { kind: "h", text: "How Site Lab prices wear" },
      { kind: "p", text: "Every run is scored by NREL's BLAST-Lite ageing models {blast_lite}, fitted to ageing tests of large-format commercial cells {gasper2023}: an LFP cell (the chemistry of most new stationary storage) and an NMC cell. They add calendar ageing (time, average state of charge, temperature) and cycle ageing (energy cycled, depth, charge rate) {blast_lite}. Site Lab repeats the run's charging pattern until the battery holds 80% of its original capacity, the retention a home-battery warranty guarantees after 10 years {lg_resu12}; that gives the battery's expected life if it were always run like this. Wear = the battery's replacement value x the share of that life the run used {code_wear}." },
      { kind: "facts", rows: [
        ["Replacement value", "Default for EUR sites: 2022 mean system prices per usable kWh, excluding VAT: about 1,200 € for home systems up to 30 kWh, 580-710 € for commercial and 380-464 € for large-scale systems {figgener2023}. Prices have fallen since, so wear is overstated; set your own in the battery {code_wear}."],
        ["Life at one full cycle a day", "LFP about 6,150 cycles (19 years) to 80% at 25 °C; NMC about 2,260 cycles (7 years), in our runs of the two models {code_wear} {runs_2026_11c}."],
        ["Limits", "Both cells were tested at gentle rates (LFP charging at most 0.65 C) and the LFP model between 10 and 45 °C, so fast-charging batteries and extreme temperatures are outside what the models know {blast_lite}. Temperature is a constant you set {code_wear}."],
      ] },
      { kind: "h", text: "Worked example: one June week, German home with solar and an EV" },
      { kind: "facts", rows: [
        ["Self-consumption rule", "Energy €11.57 + wear €10.16 = €21.74; expected life 22.6 years {runs_2026_11d}."],
        ["MPC, wear not priced", "Energy €10.06 + wear €10.34 = €20.39; life 22.3 years, 6.4 full cycles {runs_2026_11d}."],
        ["MPC, wear priced", "Energy €12.32 + wear €7.64 = €19.96; life 30.1 years: it cycled less (4.4 full cycles), paid €2.26 more for energy and saved €2.70 of wear {runs_2026_11d}."],
        ["Price arbitrage rule", "Barely used the battery: wear €4.57 but energy €26.22 {runs_2026_11d}."],
        ["Battery idle", "Energy €29.32, wear €0.00 {runs_2026_11d}."],
      ] },
      { kind: "p", text: "On energy alone the simple rule beat the wear-aware optimiser (€11.57 against €12.32); with wear counted the optimiser wins by €1.78, because it cycled more gently {runs_2026_11d}. And the idle battery ages almost not at all: in the LFP model, a battery kept empty barely loses capacity {runs_2026_11d}." },
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
      { kind: "note", tone: "info", text: "Built in Site Lab: the Data center element draws IT load × scale × PUE, where the IT load comes from the ESIF measurements and PUE defaults to the 2025 industry average of 1.54 {code_model}. The engine reports the IT part and the overhead (cooling and other losses) separately {code_engine}." },
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
      { kind: "note", tone: "info", text: "Site Lab controllers can run with perfect information or with realistic forecasts: the most recent day's load repeated, the day-ahead weather forecast for solar, prices only once published, cars only once plugged in {code_forecasts}. 'Compare forecasts' shows the difference; see 'Planning under uncertainty'." },
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
      { kind: "note", tone: "info", text: "For Site Lab: the template for the stochastic MPC step. The first half of the forecast-error harness now exists: 'Compare forecasts' runs controllers with realistic forecasts {code_forecasts}." },
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
  ...EXAMPLE_PAGES,
  ...DEEP_PAGES,
  ...MARKET_PAGES,
];
