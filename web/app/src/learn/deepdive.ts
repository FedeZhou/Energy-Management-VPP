// Deep dives: control theory and battery modelling, from scratch, with worked examples.
// Same rules as pages.ts: every {id} must exist in a source list; statements are backed by a cited source, by this
// repository, or by our own runs / arithmetic (labelled as such). LaTeX lives in String.raw strings only.
import type { Page } from "./pages";
import type { Source } from "./sources";

export const DEEP_PAGES: Page[] = [
  // ============================== CONTROL THEORY ==============================
  {
    id: "c-feedback", section: "control", title: "1. Feedback: the core idea",
    summary: "Measure, compare with what you want, act, repeat. Every energy controller is built on this loop.",
    blocks: [
      { kind: "p", text: "Control theory is about making a system behave the way you want although you cannot fully predict it. The standard introductory text treats feedback as the central idea: measure the output, compare it with the goal, and use the difference to decide the next action {astrom_murray}." },
      { kind: "h", text: "The vocabulary" },
      { kind: "facts", rows: [
        ["System (plant)", "What you control. In Site Lab: the site behind the meter (loads, solar, battery, cars) {code_engine}."],
        ["State", "What you need to know now to predict the future: the battery's stored energy, each car's remaining need, a heat tank's charge {code_engine}."],
        ["Input (action)", "What the controller sets: battery power, charging power per car, heat pump power {code_ctrl}."],
        ["Disturbance", "What happens to you: household demand, sunshine, prices, when cars arrive {code_engine}."],
        ["Output and goal", "What you measure and care about: grid power, cost, peak, whether cars are charged {code_engine}."],
      ] },
      { kind: "h", text: "Open loop versus closed loop" },
      { kind: "list", items: [
        "Open loop: act on a plan without looking at the result, e.g. 'charge the battery from 01:00 to 04:00 every night'. Simple, but blind to surprises.",
        "Closed loop (feedback): look at the measurement every step and react. Site Lab's self-consumption rule is pure feedback: it measures the site's net demand each step and sets the battery to cancel it {code_ctrl}.",
      ] },
      { kind: "math", tex: String.raw`P^{\mathrm{bat}}_t = -\,\big(L_t + P^{\mathrm{EV}}_t - S_t\big)`,
        caption: String.raw`Self-consumption as feedback: \(L_t\) household demand, \(P^{\mathrm{EV}}_t\) car charging, \(S_t\) solar. The battery absorbs any surplus and covers any shortfall, within its limits.` },
      { kind: "h", text: "Setpoints and proportional control" },
      { kind: "p", text: "The classic feedback law is PID: the action is a weighted sum of the error, its accumulated history and its rate of change {astrom_murray}." },
      { kind: "math", tex: String.raw`u(t) = K_p\, e(t) + K_i \int_0^t e(\tau)\,d\tau + K_d\, \frac{de(t)}{dt}, \qquad e(t) = r(t) - y(t)`,
        caption: String.raw`\(r\) is the setpoint (what you want), \(y\) the measurement, \(e\) the error. \(K_p, K_i, K_d\) are tuning gains.` },
      { kind: "p", text: "Two everyday examples in energy systems are purely proportional. Site Lab's peak-shaving rule sets the battery to the gap between the threshold and the net demand, a proportional controller with gain 1 that removes the error in one step {code_ctrl}. Frequency containment reserve is droop control: power proportional to the frequency deviation, by EU rule {sogl2017}." },
      { kind: "note", tone: "info", text: "Why feedback alone is not enough for energy management: it only reacts to the present. To buy cheap energy tonight for tomorrow's peak, a controller must look ahead. That is what optimal control and MPC add (next pages)." },
    ],
  },
  {
    id: "c-optimal", section: "control", title: "2. Optimal control and dynamic programming",
    summary: "Choose the whole sequence of actions that minimises total cost. Worked example: a battery over four hours, solved exactly.",
    blocks: [
      { kind: "p", text: "Optimal control asks a different question from feedback: given a model of the system and of the future, which sequence of actions minimises the total cost? Bellman's dynamic programming, set out in an address to the American Mathematical Society in 1954, is the classic way to answer it {bellman1954}." },
      { kind: "h", text: "Bellman's idea: solve it backwards" },
      { kind: "math", tex: String.raw`V_t(E) = \min_{a}\ \Big[\, c_t(a) + V_{t+1}\big(E + \Delta E(a)\big) \Big], \qquad V_T(E) = 0`,
        caption: String.raw`\(V_t(E)\) is the cheapest possible cost from hour \(t\) to the end if the battery holds \(E\) kWh now; \(c_t(a)\) is this hour's cost of action \(a\). Knowing \(V_{t+1}\) for every state, you get \(V_t\) one step back, all the way to now.` },
      { kind: "p", text: "In words: an optimal plan, cut at any point, is still optimal for the rest. So you can work out the best action for the last hour first, then the hour before, and so on." },
      { kind: "h", text: "Worked example (our calculation)" },
      { kind: "p", text: "A home uses 1 kW every hour for four hours. Prices are 0.10, 0.30, 0.50 and 0.20 per kWh. The battery holds 1 kWh, charges or discharges at up to 1 kW, and starts empty. Without a battery the four hours cost 1.10 {deep_calc}." },
      { kind: "facts", rows: [
        ["No losses", "Charge 1 kWh in hour 1 at 0.10, use it in hour 3 instead of buying at 0.50. Cost 0.70, a saving of 0.40 {deep_calc}."],
        ["90% round-trip efficiency", "Charge in hour 1, and top up a little in hour 2 at 0.30, because 0.30 ÷ 0.9 = 0.333 is still below 0.50; deliver 0.949 kWh in hour 3. Cost 0.742, a saving of 0.358 {deep_calc}."],
        ["80% round-trip efficiency", "Same pattern, larger top-up; cost 0.788, a saving of 0.312 {deep_calc}."],
      ] },
      { kind: "p", text: "Two lessons. Losses shrink the value of every cycle. And the optimal plan does things a simple rule would not, like buying at a 'medium' price because an even dearer hour follows." },
      { kind: "h", text: "Dynamic programming versus linear programming" },
      { kind: "list", items: [
        "Dynamic programming handles any cost shape, including discrete choices, but the table of states explodes as you add batteries, cars and tanks: the 'curse of dimensionality'.",
        "Linear programming solves problems whose costs and limits are straight lines, with many variables at once. A battery with fixed efficiencies fits, which is why EMHASS and Site Lab's MPC use it {emhass_lp} {code_mpc}.",
        "MPC textbooks build on exactly this link between optimal control and repeated optimisation {rawlings_mpc}.",
      ] },
    ],
  },
  {
    id: "c-lp", section: "control", title: "3. Battery dispatch as a linear program",
    summary: "Variables, constraints and objective, written out. The building block of MPC.",
    blocks: [
      { kind: "p", text: "Here is the optimisation at the heart of an MPC for one battery, in the form EMHASS documents and Site Lab follows (Site Lab adds cars, phase fuses and demand charges) {emhass_lp} {code_mpc}." },
      { kind: "math", tex: String.raw`\begin{aligned}
\min_{c_t,\,d_t,\,g^+_t,\,g^-_t}\quad & \sum_{t} \Big( p_t\, g^{+}_t - p^{\mathrm{exp}}\, g^{-}_t \Big)\,\Delta t \\[10pt]
\text{s.t.}\quad & g^{+}_t - g^{-}_t = L_t - S_t + c_t - d_t && \text{(power balance)} \\[6pt]
& E_{t+1} = E_t + \eta\, c_t\,\Delta t - \frac{d_t}{\eta}\,\Delta t && \text{(storage)} \\[6pt]
& E_{\min} \le E_t \le E_{\max},\quad 0 \le c_t, d_t \le P_{\max} && \text{(limits)} \\[6pt]
& g^{+}_t \le G^{\mathrm{imp}},\quad E_T \ge E_0 && \text{(grid limit, end state)}
\end{aligned}`,
        caption: String.raw`\(c_t, d_t\) charge and discharge power; \(g^{\pm}_t\) import and export; \(p_t\) import price; \(\eta\) one-way efficiency. Splitting charge and discharge into two variables is what lets a linear model charge losses in both directions.` },
      { kind: "h", text: "Design choices that matter" },
      { kind: "list", items: [
        "End state: without 'end at least as full as you started', the optimiser empties the battery at the end of every plan, because the future beyond the horizon is invisible. EMHASS documents this terminal condition {emhass_lp}. Site Lab's MPC instead gives energy left at the end a value, the cheapest price ahead times the discharge efficiency: enough to store free solar rather than export it for nothing, never enough to buy from the grid just to fill up {code_mpc}.",
        "Separate charge and discharge: losses make simultaneous charging and discharging wasteful, so an optimiser normally avoids it; with negative prices it can become 'profitable' to burn energy that way, a known quirk of linear battery models.",
        "Wear: a cost per kWh of throughput stops pointless cycling. Site Lab's MPC charges half the wear price w on every kWh charged and half on every kWh discharged; w is calibrated from the NREL BLAST-Lite ageing model (about €0.15 per kWh for a home LFP battery, see 'Putting a price on wear'). With wear pricing switched off it keeps only a tiny tie-breaking cost {code_mpc} {code_wear}.",
        "Horizon: long enough to see the next daily price and solar cycle; EMHASS recommends at least five optimisation steps {emhass_lp}.",
      ] },
      { kind: "p", text: "The receding-horizon loop (solve, apply the first step, re-measure, solve again) turns this plan into a feedback controller; see Model predictive control (MPC) in How Site Lab works." },
    ],
  },
  {
    id: "c-week", section: "control", title: "4. Worked example: one real week, five controllers",
    summary: "A German home in June, 15-minute steps, real prices: what each strategy did, and why.",
    blocks: [
      { kind: "p", text: "We ran the 'Home with solar, battery and EV' example (8 kWp solar, 10 kWh / 5 kW battery, measured German household, German 15-minute day-ahead prices plus grid fees, taxes and a supplier margin, exports paid the EEG feed-in tariff except at negative prices, 8-14 June 2026) with each battery strategy. The car charged in the cheapest hours in every run {runs_2026_11d}." },
      { kind: "facts", rows: [
        ["No battery (idle)", "Cost €26.18 · peak 7.5 kW · self-sufficiency 35% {runs_2026_11d}."],
        ["Self-consumption", "Cost €11.57 · peak 7.5 kW · self-sufficiency 73% · 5.2 equivalent full cycles {runs_2026_11d}."],
        ["Price arbitrage", "Cost €26.22 · peak 7.5 kW · charged mostly from the grid and ended the week full {runs_2026_11d}."],
        ["Peak shaving, 5 kW", "Cost €31.33 · peak 5.0 kW exactly · self-sufficiency 26% {runs_2026_11d}."],
        ["MPC, perfect forecasts", "Cost €12.32 · self-sufficiency 69% · 4.4 cycles; it also prices battery wear, so it cycles less {runs_2026_11d}."],
        ["MPC, realistic forecasts", "Cost €20.33 · self-sufficiency 51% · 3.0 cycles {runs_2026_11d}."],
      ] },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "In a sunny week, storing spare solar is almost all the value: on energy alone the simple feedback rule (€11.57) even beat the optimiser with perfect foresight (€12.32), which holds back because it prices battery wear; with wear counted the optimiser wins, €19.96 against €21.74 {runs_2026_11d}. The optimiser's advantage grows when prices, not sunshine, drive the decision (winter, dynamic tariffs, demand charges).",
        "Price arbitrage looked poor partly because it ended with 10 kWh still stored, which no-one paid for: the 'end-of-horizon value' problem from the linear-program page {runs_2026_11d}.",
        "Peak shaving bought a lower peak with a higher bill: objectives conflict, and a controller can only serve the one it is given {runs_2026_11d}.",
        "A perfect-forecast MPC is an upper bound, not a fair rival to real controllers. With realistic forecasts (yesterday's load, the day-ahead weather forecast, prices once published, cars only once plugged in) the same MPC cost €20.33 this week, against €11.57 for the self-consumption rule; 'Compare forecasts' next to Run shows both {code_forecasts} {runs_2026_11d}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: open the example in Operate mode, switch the battery strategy in Control strategy, and press Run. The results compare against the same site with the battery idle." },
    ],
  },
  {
    id: "c-estimation", section: "control", title: "5. Knowing the state: estimation and the Kalman filter",
    summary: "A controller is only as good as its picture of now. The Kalman filter blends a model with noisy measurements.",
    blocks: [
      { kind: "p", text: "Every controller needs the current state, but sensors are noisy and some states, like a battery's state of charge, cannot be measured directly. Kalman's 1960 paper gave the optimal recursive estimator for linear systems with noise and showed that filtering is the mathematical dual of the control (regulator) problem {kalman1960}." },
      { kind: "h", text: "Predict, then correct" },
      { kind: "math", tex: String.raw`\begin{aligned}
\text{predict:}\quad & \hat x_{t|t-1} = A\,\hat x_{t-1} + B\,u_{t-1}, \qquad P_{t|t-1} = A P_{t-1} A^\top + Q \\[8pt]
\text{correct:}\quad & K_t = P_{t|t-1} C^\top \big(C P_{t|t-1} C^\top + R\big)^{-1}, \qquad \hat x_t = \hat x_{t|t-1} + K_t\,\big(y_t - C\,\hat x_{t|t-1}\big)
\end{aligned}`,
        caption: String.raw`\(\hat x\) the estimate, \(P\) its uncertainty, \(Q\) and \(R\) the model and sensor noise. The gain \(K_t\) decides how much to trust the new measurement \(y_t\) versus the model's prediction.` },
      { kind: "p", text: "State of charge is a good example: it is one of the key quantities a battery management system must estimate, and it cannot be measured directly {how2019}. In a Kalman-type estimator the model counts charge in and out (which drifts), and the measured voltage pulls the estimate back. Extended Kalman filters, which linearise a non-linear battery model at each step, have been applied to battery management systems for hybrid-vehicle packs {plett2004}." },
      { kind: "note", tone: "info", text: "Site Lab assumes the state is known exactly (the simulator knows the true stored energy) {code_engine}. Real controllers act on an estimate, one more reason real results trail simulated ones." },
    ],
  },
  {
    id: "c-judge", section: "control", title: "6. Judging controllers fairly",
    summary: "Same site, same data, a baseline, an upper bound, and honest forecasts. Otherwise a comparison proves little.",
    blocks: [
      { kind: "steps", items: [
        "Same site and data for every controller: Site Lab runs each strategy on identical profiles and repeats every run with the battery idle as the baseline {code_engine}.",
        "An upper bound: the same optimiser with perfect forecasts shows the most any controller could achieve on this site {code_mpc}.",
        "Honest forecasts: the gap between that bound and a real controller is mostly forecast error. 'Compare forecasts' runs a site with perfect and with realistic forecasts, which use only what a real system would know at that moment, and shows the difference {code_forecasts}.",
        "Several objectives at once: cost, peak, self-sufficiency and battery wear can pull against each other, as the five-controller week shows {deep_runs}.",
        "Beware the baseline effect: simple rules are a serious benchmark. On real hardware, rules, decision trees and MPC came within 0.6% of each other in one study {ruddick2024}.",
      ] },
    ],
  },

  // ============================== BATTERY MODELLING ==============================
  {
    id: "b-cells", section: "battery", title: "1. From cell to battery system",
    summary: "Cells, modules, racks, battery management and the inverter; why chemistry matters.",
    blocks: [
      { kind: "facts", rows: [
        ["Cell", "The electrochemical unit: two electrodes, a separator and electrolyte. A well-studied example is LG's M50, a cylindrical 21700 cell with an NMC 811 positive electrode and a graphite-silicon-oxide negative electrode {chen2020}."],
        ["Module, rack, pack", "Cells in series (for voltage) and parallel (for capacity), with wiring, sensing and a battery management system (BMS); estimating the state of charge is one of the BMS's key jobs {how2019}."],
        ["Inverter (PCS)", "Converts the battery's DC to grid AC; its own losses add to the cell losses."],
        ["System design", "A review of stationary lithium-ion storage gives guidance on matching cell technology, system design and operation to the application, based on real projects {hesse2017}."],
      ] },
      { kind: "h", text: "Chemistry and price" },
      { kind: "list", items: [
        "Two families dominate: LFP (lithium iron phosphate) and NMC (nickel manganese cobalt). In BloombergNEF's 2025 survey, LFP packs averaged $81/kWh and NMC packs $128/kWh across all uses {bnef2025}.",
        "Stationary storage packs fell to $70/kWh in 2025, 45% below 2024, the cheapest segment for the first time {bnef2025}.",
        "The long-term ageing studies on the next pages test a commercial LFP/graphite cell chosen because it promises long calendar and cycle life, which stationary storage needs {naumann2018} {naumann2020}.",
      ] },
    ],
  },
  {
    id: "b-reservoir", section: "battery", title: "2. The energy-reservoir model (what Site Lab uses)",
    summary: "A bucket of kWh with a tap: power limits, charge limits and losses. Worked numbers included.",
    blocks: [
      { kind: "p", text: "For planning and dispatch, most energy management tools treat a battery as a reservoir of energy with limits, not as an electrochemical device. EMHASS and Site Lab both use this model {emhass_lp} {code_engine}." },
      { kind: "math", tex: String.raw`E_{t+1} = \begin{cases} E_t + \eta\,P_t\,\Delta t & P_t \ge 0 \ \text{(charging)} \\[6pt] E_t + P_t\,\Delta t / \eta & P_t < 0 \ \text{(discharging)} \end{cases} \qquad \eta = \sqrt{\eta_{\mathrm{rt}}}`,
        caption: String.raw`\(E\) stored energy, \(P\) power at the battery terminals, \(\eta_{\mathrm{rt}}\) round-trip efficiency split equally between charging and discharging. Limits: \(E_{\min} \le E \le E_{\max}\) and \(|P| \le P_{\max}\).` },
      { kind: "h", text: "Worked example (our arithmetic, Site Lab defaults)" },
      { kind: "list", items: [
        "Battery 10 kWh, 5 kW, round-trip efficiency 0.9, so one-way η = √0.9 ≈ 0.949 {code_model}.",
        "Charging at 5 kW for one hour stores 5 × 0.949 = 4.74 kWh (0.26 kWh lost on the way in) {deep_calc}.",
        "Discharging 5 kW for one hour takes 5 ÷ 0.949 = 5.27 kWh out of storage (0.27 kWh lost on the way out) {deep_calc}.",
        "In the June example week, self-consumption put 62.5 kWh in and took 52.1 kWh out; true conversion losses were 6.0 kWh, the rest is energy still stored at the end {deep_runs}.",
      ] },
      { kind: "note", tone: "warn", text: "What this model leaves out: voltage, current and resistance (so efficiency does not change with power), temperature, and ageing. It is accurate enough for cost planning, not for designing or protecting cells; the next pages cover what is underneath {code_engine}." },
    ],
  },
  {
    id: "b-ecm", section: "battery", title: "3. Equivalent circuit models",
    summary: "A voltage source that depends on charge, a resistor and one or two RC pairs: why efficiency falls at high power.",
    blocks: [
      { kind: "p", text: "Between the 'bucket of energy' and full electrochemistry sits the equivalent circuit model: an open-circuit voltage that depends on state of charge, a series resistance for the instant voltage drop, and one or more resistor-capacitor pairs for the slower relaxation. It is one of the model-based approaches to state-of-charge estimation that reviews compare with data-driven ones {how2019}; extended Kalman filters for battery management systems run on models of this kind {plett2004}." },
      { kind: "math", tex: String.raw`\begin{aligned}
V_t &= \mathrm{OCV}(z_t) - R_0\, I_t - V_{1,t} \\[6pt]
\frac{dV_1}{dt} &= -\frac{V_1}{R_1 C_1} + \frac{I}{C_1}, \qquad \frac{dz}{dt} = -\frac{I}{Q}
\end{aligned}`,
        caption: String.raw`\(V\) terminal voltage, \(z\) state of charge, \(I\) current (positive when discharging), \(Q\) capacity in ampere-hours, \(R_0\) series resistance, \(R_1C_1\) the relaxation pair.` },
      { kind: "h", text: "Why efficiency falls at high power" },
      { kind: "p", text: "The resistor turns energy into heat at a rate of I² × R₀ (Joule heating). Double the current and the resistive loss quadruples, while the energy moved only doubles. So a battery is more efficient when cycled gently, which a fixed round-trip efficiency (the reservoir model) cannot show." },
      { kind: "h", text: "Where the parameters come from" },
      { kind: "p", text: "The open-circuit voltage curve is measured with slow, interrupted pulses (galvanostatic intermittent titration); resistances and time constants from pulse tests and impedance spectroscopy. A detailed public example is the parameter set measured for the LG M50 cell {chen2020}." },
    ],
  },
  {
    id: "b-soc", section: "battery", title: "4. Estimating state of charge",
    summary: "Counting charge drifts, voltage alone is ambiguous, so real systems combine both.",
    blocks: [
      { kind: "facts", rows: [
        ["Coulomb counting", "Add up current over time: z = z₀ − ∫I dt ÷ Q. Simple, but sensor offsets accumulate, so the estimate drifts and needs resetting."],
        ["Voltage lookup", "Read state of charge from the open-circuit voltage curve. Only valid at rest: under current, the measured voltage also contains the R₀ × I drop and the RC voltage (see the equation on the previous page)."],
        ["Kalman filtering", "Run the equivalent-circuit model, compare its predicted voltage with the measured one, and correct the state by a gain that weighs model and sensor noise {kalman1960} {plett2004}."],
      ] },
      { kind: "p", text: "Why it is hard: state of charge cannot be measured directly and depends on battery age, temperature and other factors; a review of electric-vehicle battery management splits the methods into model-based (equations of the battery's behaviour) and data-driven (learned from large amounts of measured data) {how2019}." },
      { kind: "p", text: "For energy management this matters because every schedule starts from the current state of charge: an MPC re-plans from the measured state at each step {emhass_lp}. An estimate that is off by a few percent can make a planned discharge hit the minimum earlier than expected." },
    ],
  },
  {
    id: "b-physics", section: "battery", title: "5. Physics-based models and PyBaMM",
    summary: "Model the ions themselves: the Doyle-Fuller-Newman (P2D) model, its simplifications, and open-source tools.",
    blocks: [
      { kind: "p", text: "Physics-based models describe what happens inside the cell: lithium diffusing in electrode particles, ions moving through the electrolyte, and reactions at the particle surfaces. Doyle, Fuller and Newman modelled the charge and discharge of a lithium insertion cell with concentrated solution theory in 1993; this 'pseudo-two-dimensional' (P2D, or DFN) model is still the reference {doyle1993}." },
      { kind: "list", items: [
        "It needs many parameters. One public study measured a full 35-parameter set for a commercial 21700 cell by tearing it down and testing each part {chen2020}.",
        "PyBaMM, an open-source Python package, is a platform for implementing and comparing battery models and numerical methods {pybamm2021}.",
        "Where it fits: cell design, fast charging, ageing research. For energy management of a site, a P2D model is far more detail than a 15-minute dispatch needs; the reservoir model plus a wear cost is the usual compromise (our view).",
      ] },
    ],
  },
  {
    id: "b-ageing", section: "battery", title: "6. How batteries age",
    summary: "Capacity fades and resistance rises, from time (calendar ageing) and from use (cycle ageing).",
    blocks: [
      { kind: "p", text: "A review of ageing-aware battery operation names the key effects of degradation, decreasing capacity, increasing resistance and safety implications, and the stress factors that drive it: state of charge, charge and discharge rate, cycle count and temperature {collath2022}." },
      { kind: "facts", rows: [
        ["Calendar ageing", "Happens even when the battery rests. A 29-month study of a commercial LFP/graphite cell stored 3 cells at each of 17 combinations of temperature and state of charge, and fitted a 5-parameter model for capacity loss and resistance increase {naumann2018}."],
        ["Cycle ageing", "Comes from use. The follow-up study tested 19 combinations of temperature, C-rate, depth of discharge and state of charge, and combined both into one model, validated on two realistic load profiles to below 1% capacity error {naumann2020}."],
        ["Many paths", "The same cell can reach end of life by different mechanisms depending on how it is used; one modelling study found five pathways {okane2022}."],
        ["Uneven strings", "Large batteries are strings of cells that age differently; modelling that gave 21% more revenue per unit of health lost in one study {graner2025}."],
      ] },
      { kind: "note", tone: "info", text: "What it means for control: the cheapest schedule for energy may not be the cheapest once wear is priced. The stress factors the review names (state of charge, charge and discharge rate, cycle count, temperature) are all things a controller influences {collath2022}." },
    ],
  },
  {
    id: "b-rainflow", section: "battery", title: "7. Counting cycles: rainflow",
    summary: "Turn an irregular charge history into a list of cycles by depth, then add up the damage. Worked on a real simulated week.",
    blocks: [
      { kind: "p", text: "Real batteries do not cycle neatly from full to empty. To apply a cycle-ageing model to an irregular profile, battery degradation models use a cycle-counting method to identify the stress cycles {xu2018}. A widely used one is rainflow counting, one of the cycle-counting methods compiled in the ASTM standard for fatigue analysis of materials {astm_e1049}; it splits the state-of-charge history into full and half cycles of different depths." },
      { kind: "steps", items: [
        "Reduce the state-of-charge history to its turning points (each local peak and valley).",
        "Scan with three consecutive points; when the newest swing is at least as large as the previous one, the previous swing is a closed cycle: record its depth and remove it.",
        "Whatever is left at the end counts as half cycles.",
        "Damage = sum over cycles of (damage per cycle at that depth), using a depth-of-discharge stress curve; Xu and co-authors combine this with calendar ageing in a semi-empirical model {xu2018}.",
      ] },
      { kind: "h", text: "Worked example: the June week (our computation, earlier tariff setting)" },
      { kind: "facts", rows: [
        ["Self-consumption", "5.2 equivalent full cycles; rainflow found 4 deep cycles (swings of 50% or more), 5 medium (20-50%) and 5 small (5-20%) {deep_runs}."],
        ["MPC (perfect forecasts)", "5.2 equivalent full cycles too, but shaped differently: 5 deep, 3 medium, 1 small {deep_runs}."],
        ["MPC (realistic forecasts)", "3.2 equivalent full cycles: 1 deep, 4.5 medium, 6.5 small. With an uncertain view of the future the battery moves in many small steps instead of a few full swings {deep_runs}."],
      ] },
      { kind: "p", text: "Same energy throughput, different cycle mix. With a depth-dependent ageing curve these two weeks would wear the battery differently, which an 'equivalent full cycles' count cannot tell apart." },
    ],
  },
  {
    id: "b-wear-cost", section: "battery", title: "8. Putting a price on wear",
    summary: "Turn lifetime into money per kWh, compare it with what a cycle earns, and let the controller decide.",
    blocks: [
      { kind: "p", text: "The simplest wear price spreads the battery's cost over all the energy it will deliver in its life. Market-dispatch research turns cycle ageing into a piecewise-linear cost per cycle depth that optimisers can use directly {xu2017}." },
      { kind: "math", tex: String.raw`c_{\mathrm{wear}} \approx \frac{C_{\mathrm{battery}}}{N_{\mathrm{cycles}} \times \mathrm{DoD}} \quad \text{per kWh of capacity cycled}`,
        caption: String.raw`\(C_{\mathrm{battery}}\) cost per kWh of capacity, \(N_{\mathrm{cycles}}\) cycles to end of life at depth of discharge DoD. A rough average: real ageing depends on depth, temperature and state of charge (previous pages).` },
      { kind: "h", text: "Worked example (our arithmetic)" },
      { kind: "p", text: "Take BloombergNEF's 2025 average stationary-storage pack price, $70 per kWh {bnef2025}. Cycle life varies with product and conditions, so here is the wear price for three possible lifetimes at full depth:" },
      { kind: "facts", rows: [
        ["If it lasts 3,000 cycles", "$70 ÷ 3,000 ≈ $0.023 per kWh delivered {deep_calc}."],
        ["If it lasts 6,000 cycles", "$70 ÷ 6,000 ≈ $0.012 per kWh delivered {deep_calc}."],
        ["If it lasts 10,000 cycles", "$70 ÷ 10,000 = $0.007 per kWh delivered {deep_calc}."],
      ] },
      { kind: "list", items: [
        "Compared with the four-hour example (buy at 0.10, use at 0.50), a wear price of one or two cents changes nothing: the cycle is clearly worth it {deep_calc}.",
        "Compared with a spread of a few cents after losses, the same wear price can wipe out the profit: that is when an optimiser should leave the battery alone.",
        "The pack price excludes inverter, installation and the rest of the system, so the full wear cost per kWh is higher {bnef2025}.",
      ] },
      { kind: "h", text: "How Site Lab does it: score every run, price every kWh" },
      { kind: "p", text: "Site Lab uses wear in two ways. First, every run is scored: the battery's state-of-charge pattern is repeated until the battery is down to 80% of its capacity (the end-of-life point in a common home-battery warranty {lg_resu12}), using NREL's open BLAST-Lite ageing models {blast_lite}, which are fitted to ageing tests of large commercial LFP and NMC cells {gasper2023}. That gives an expected life, and the run's wear cost is the replacement value times the share of that life the run used {code_wear}." },
      { kind: "math", tex: String.raw`\text{wear cost of a run} = C_{\mathrm{repl}} \times E_{\mathrm{cap}} \times \frac{\text{run length}}{\text{expected life}}`,
        caption: String.raw`\(C_{\mathrm{repl}}\) replacement cost per usable kWh, \(E_{\mathrm{cap}}\) capacity. Lives beyond 40 years are capped, and then priced by the capacity actually lost.` },
      { kind: "p", text: "Second, the MPC needs a price per kWh it can put in its objective. Only cycling depends on the controller (a battery ages with time too, whatever you do), so the price uses only the cycle-ageing part, measured on a reference of one full 0-100% cycle a day {code_wear}:" },
      { kind: "math", tex: String.raw`w = C_{\mathrm{repl}} \times \frac{\text{capacity lost per full cycle}}{1 - 0.8}`,
        caption: String.raw`The MPC adds \(\tfrac{w}{2}\) per kWh charged and \(\tfrac{w}{2}\) per kWh discharged, so one full cycle of the whole capacity costs \(w\) per kWh.` },
      { kind: "facts", rows: [
        ["Replacement cost (home, ≤ 30 kWh)", "About €1,200 per usable kWh: the 2022 mean for German home systems, excluding VAT {figgener2023}. Prices have fallen since, so this overstates wear."],
        ["Cycle loss, LFP at 25 °C", "0.0025% of capacity per full cycle in the model, i.e. about 8,100 cycles of pure cycling to lose 20% {code_wear} {deep_calc}."],
        ["Wear price, LFP", "1,200 × 0.0000247 ÷ 0.2 ≈ €0.148 per kWh {code_wear} {deep_calc}."],
        ["Wear price, NMC", "About €0.49 per kWh with the same cost: the NMC cell ages roughly three times faster per cycle in the model {code_wear} {deep_calc}."],
      ] },
      { kind: "p", text: "That is far above the $0.007-0.023 from BloombergNEF's pack price above, for two reasons you can see in the numbers: a home system costs much more per kWh than a bare pack (inverter, installation, margins), and the 2022 price is old {figgener2023} {bnef2025}." },
      { kind: "h", text: "Worked example: the June home week, with wear" },
      { kind: "p", text: "German home with an EV, 8-14 June 2026, real tariff (feed-in tariff, no export pay at negative prices), perfect forecasts, LFP battery at 25 °C {runs_2026_11d}:" },
      { kind: "facts", rows: [
        ["Self-consumption rule", "Energy €11.57 + wear €10.16 = €21.74 · expected life 22.6 years {runs_2026_11d}."],
        ["MPC, wear not priced", "Energy €10.06 + wear €10.34 = €20.39 · life 22.3 years · 6.4 full cycles {runs_2026_11d}."],
        ["MPC, wear priced", "Energy €12.32 + wear €7.64 = €19.96 · life 30.1 years · 4.4 full cycles {runs_2026_11d}."],
        ["Price arbitrage rule", "Energy €26.22 + wear €4.57 = €30.79 {runs_2026_11d}."],
        ["Idle battery, car charging on arrival", "Energy €29.32 + wear €0.00 {runs_2026_11d}."],
      ] },
      { kind: "list", items: [
        "The optimiser that ignores wear earns the most on energy (€10.06) but cycles hardest (6.4 full cycles): it moves energy whenever there is a cent to gain {runs_2026_11d}.",
        "Pricing wear made the MPC cycle less (4.4 instead of 6.4 full cycles): it paid €2.26 more for energy, saved €2.70 of wear and ended €0.43 better in total {runs_2026_11d}. With exports paid nothing (an earlier setting) the same flat €0.148 price made it €0.77 worse: the cycling it avoided saved only about €0.11 per kWh of scored wear {runs_2026_11c}.",
        "Why: in the ageing model a shallow cycle wears less per kWh than a deep one, but a flat price per kWh treats them the same. This is exactly what the cycle-depth cost of market-dispatch research fixes {xu2017}, and what rainflow counting (page 7) measures. A depth-aware price is Site Lab's next step.",
        "With realistic forecasts: wear-blind MPC €18.24 + €6.12 = €24.37; wear-priced €20.33 + €5.44 = €25.77 {runs_2026_11d}.",
        "The idle battery shows €0 wear because in the LFP model a battery kept empty barely ages; at a high state of charge it would age even when idle {runs_2026_11d}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: in the Inspector, pick MPC for the battery and tick or untick 'MPC prices battery wear'; the Results strip shows cost including wear, the wear cost and the expected life {code_mpc} {code_wear}." },
    ],
  },
];

export const DEEP_SOURCES: Source[] = [
  // ---------- Deep dives (checked 2026-11-09) ----------
  { id: "astrom_murray", title: "Feedback Systems: An Introduction for Scientists and Engineers (2nd edition)", authors: "Åström, Murray",
    year: 2020, venue: "Princeton University Press (free PDF on the authors' wiki)", url: "https://fbswiki.org/wiki/index.php/Main_Page",
    read: "metadata", note: "Standard textbook; cited for standard definitions (feedback, PID). Book site checked, chapters not re-read here." },
  { id: "rawlings_mpc", title: "Model Predictive Control: Theory, Computation, and Design (2nd edition)", authors: "Rawlings, Mayne, Diehl",
    year: 2017, venue: "Nob Hill Publishing (PDF on the lead author's site)",
    url: "https://sites.engineering.ucsb.edu/~jbraw/mpc/MPC-book-2nd-edition-3rd-printing.pdf", read: "metadata",
    note: "Standard MPC textbook; existence and edition checked." },
  { id: "bellman1954", title: "The theory of dynamic programming", authors: "Bellman", year: 1954,
    venue: "Bulletin of the American Mathematical Society 60(6)", url: "https://doi.org/10.1090/S0002-9904-1954-09848-8", read: "abstract" },
  { id: "kalman1960", title: "A New Approach to Linear Filtering and Prediction Problems", authors: "Kalman", year: 1960,
    venue: "Journal of Basic Engineering", url: "https://doi.org/10.1115/1.3662552", read: "abstract" },
  { id: "plett2004", title: "Extended Kalman filtering for battery management systems of LiPB-based HEV battery packs", authors: "Plett",
    year: 2004, venue: "Journal of Power Sources", url: "https://doi.org/10.1016/j.jpowsour.2004.02.031", read: "metadata",
    note: "No public abstract found; cited only for what its title states (EKF for battery management)." },
  { id: "astm_e1049", title: "ASTM E1049-85(2017): Standard Practices for Cycle Counting in Fatigue Analysis", authors: "ASTM International",
    year: 2017, venue: "Standard", url: "https://store.astm.org/e1049-85r17.html", read: "metadata",
    note: "Scope (from the store page): a compilation of cycle-counting procedures, including rainflow counting, without recommending one." },
  { id: "how2019", title: "State of Charge Estimation for Lithium-Ion Batteries Using Model-Based and Data-Driven Methods: A Review",
    authors: "How, Hannan, Lipu, Ker", year: 2019, venue: "IEEE Access", url: "https://doi.org/10.1109/ACCESS.2019.2942213", read: "abstract" },
  { id: "doyle1993", title: "Modeling of Galvanostatic Charge and Discharge of the Lithium/Polymer/Insertion Cell",
    authors: "Doyle, Fuller, Newman", year: 1993, venue: "Journal of The Electrochemical Society", url: "https://doi.org/10.1149/1.2221597", read: "abstract" },
  { id: "chen2020", title: "Development of Experimental Techniques for Parameterization of Multi-scale Lithium-ion Battery Models",
    authors: "Chen, Brosa Planella, O'Regan, Gastol et al.", year: 2020, venue: "Journal of The Electrochemical Society",
    url: "https://doi.org/10.1149/1945-7111/ab9050", read: "abstract" },
  { id: "pybamm2021", title: "Python Battery Mathematical Modelling (PyBaMM)", authors: "Sulzer, Marquis, Timms, Robinson et al.",
    year: 2021, venue: "Journal of Open Research Software", url: "https://doi.org/10.5334/jors.309", read: "abstract" },
  { id: "naumann2018", title: "Analysis and modeling of calendar aging of a commercial LiFePO4/graphite cell", authors: "Naumann, Schimpe, Keil, Hesse et al.",
    year: 2018, venue: "Journal of Energy Storage", url: "https://doi.org/10.1016/j.est.2018.01.019", read: "abstract", note: "Abstract via Semantic Scholar." },
  { id: "naumann2020", title: "Analysis and modeling of cycle aging of a commercial LiFePO4/graphite cell", authors: "Naumann, Spingler, Jossen",
    year: 2020, venue: "Journal of Power Sources", url: "https://doi.org/10.1016/j.jpowsour.2019.227666", read: "abstract", note: "Abstract via Semantic Scholar." },
  { id: "xu2018", title: "Modeling of Lithium-Ion Battery Degradation for Cell Life Assessment", authors: "Xu, Oudalov, Ulbig, Andersson",
    year: 2016, venue: "IEEE Transactions on Smart Grid", url: "https://doi.org/10.1109/TSG.2016.2578950", read: "abstract" },
  { id: "hesse2017", title: "Lithium-Ion Battery Storage for the Grid: A Review of Stationary Battery Storage System Design",
    authors: "Hesse, Schimpe, Kucevic, Jossen", year: 2017, venue: "Energies", url: "https://doi.org/10.3390/en10122107", read: "abstract" },
  { id: "collath2022", title: "Aging aware operation of lithium-ion battery energy storage systems: A review", authors: "Collath, Tepe, Englberger, Jossen et al.",
    year: 2022, venue: "Journal of Energy Storage", url: "https://doi.org/10.1016/j.est.2022.105634", read: "abstract" },
  { id: "bnef2025", title: "Lithium-Ion Battery Pack Prices Fall to $108 per Kilowatt-Hour", authors: "BloombergNEF", year: 2025,
    venue: "Press release, 9 December 2025",
    url: "https://about.bnef.com/insights/clean-energy/lithium-ion-battery-pack-prices-fall-to-108-per-kilowatt-hour", read: "docs",
    note: "Survey results as published by BNEF: average $108/kWh, stationary storage $70/kWh, LFP $81/kWh, NMC $128/kWh." },
  { id: "deep_runs", title: "Site Lab runs of configs/sites/operate_home_ev.yaml (8-14 June 2026), one per battery strategy, 9-10 Nov 2026",
    read: "data", note: "Our own simulations with perfect knowledge of the state; peak shaving at a 5 kW threshold. MPC rows re-run on 10 Nov 2026 after the MPC started valuing leftover energy (perfect and realistic forecasts). Rainflow counting by our script (ASTM E1049 three-point method)." },
  { id: "deep_calc", title: "Worked examples: our arithmetic, checked with a small linear program (scipy linprog)", read: "data",
    note: "Four-hour example: home 1 kW, prices 0.10/0.30/0.50/0.20, battery 1 kWh / 1 kW starting empty." },
];
