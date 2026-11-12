// The complete guide (control): a chaptered, detailed explanation of how Site Lab works and the theory behind it,
// written so a reader could explain it to someone else. Same rules as pages.ts: every {id} must exist in a source
// list; statements are backed by a cited source, by this repository's code, or by our own runs (labelled as such).
// LaTeX lives in String.raw strings only.
import type { Page } from "./pages";
import type { Source } from "./sources";

export const GUIDE_CONTROL_PAGES: Page[] = [
  // ============================== PART 3: HOW DECISIONS ARE MADE ==============================
  {
    id: "g-control-problem", section: "guide", title: "13. The control problem: what a controller decides",
    summary: "Before any algorithm: what a controller can change, what it knows, which limits it must respect, what it is trying to achieve, and on which clocks all of this happens.",
    blocks: [
      { kind: "p", text: "Part 1 described the energy world and Part 2 how Site Lab simulates it. Part 3 is about the one piece of software that makes choices: the controller. Every other part of the simulator is physics or bookkeeping. The controller is the only part that could be replaced by a better one, and comparing replacements fairly is what Site Lab exists for." },
      { kind: "p", text: "Every control problem, from a thermostat to a power plant, can be described by four questions. What can I change? What do I know? What must I never do? What do I want? Answer them precisely and the choice of algorithm follows. This chapter answers them for Site Lab, using the exact data structures in the code, and ends with the clocks on which the answers live." },
      { kind: "h", text: "1. What a controller can change: the action" },
      { kind: "p", text: "Each time step the engine hands the controller an observation and receives back an Action, a small record defined in src/emsbench/sim/controllers.py {code_ctrl}. It has three fields:" },
      { kind: "facts", rows: [
        ["battery_kw", "The desired total battery power in kW. Positive means charging (taking power from the site), negative means discharging (giving power to the site). With several batteries the engine splits the total in proportion to what each can do {code_engine}."],
        ["ev_kw", "One desired power per EV charger, in kW. Positive charges the car. Negative is only possible with a bidirectional charger and means the car gives energy back to the house (vehicle-to-home, V2H) {code_ctrl}."],
        ["hp_kw", "One desired electric power per heat pump. If the controller leaves it empty, heat pumps run on demand (just enough to meet this step's heat need) {code_ctrl}."],
      ] },
      { kind: "p", text: "The sign convention is the same everywhere: positive is power consumed from the site's electrical bus, negative is power supplied to it {code_ctrl}. The building's demand and the solar output are not decisions. They happen to the controller. Solar is only reduced (curtailed) when an export limit forces it, and that is done by the engine's safety layer, not by the rules; the MPC can also plan curtailment, but only when an export limit exists {code_engine} {code_mpc}." },
      { kind: "h", text: "2. What a controller knows: the observation" },
      { kind: "p", text: "The Observation record is the controller's whole view of the world at step t {code_ctrl}. Reading its fields is the fastest way to understand what a Site Lab controller can and cannot base a decision on:" },
      { kind: "facts", rows: [
        ["t, step_hours", "Which step this is, and its length in hours (1/60 to 1) {code_ctrl}."],
        ["load_kw, pv_kw", "Building demand and solar output this step, as metered {code_ctrl}."],
        ["price, price_ahead", "The import price now, and the next 24 hours of import prices starting with this step. With perfect forecasts price_ahead is the true future; with realistic forecasts it only contains prices already published, then the last known day repeated {code_engine} {code_forecasts}."],
        ["battery_energy_kwh, battery_capacity_kwh", "How much is stored, and the capacity {code_ctrl}."],
        ["battery_max_charge_kw, battery_max_discharge_kw", "How much the battery could take or give this step, already limited by its power rating and by how full or empty it is {code_engine}."],
        ["evs", "Per charger: is a car connected, how much energy it still needs, how many steps until it leaves, its maximum and minimum power, the charger efficiency, the phase it draws from, and whether (and how much) it may discharge now {code_ctrl}."],
        ["month_peak_kw, tou_peaks", "The highest import so far this billing month, overall and per time-of-use demand window. These matter for demand charges, which bill the month's peak {code_ctrl}."],
        ["heat_pumps", "Per heat pump: heat demand, COP, heat in the tank, tank size, electric limit {code_ctrl}."],
      ] },
      { kind: "p", text: "Rules read only this record. The MPC also receives a Forecast object from src/emsbench/sim/forecasts.py that answers two questions: window(name, t, steps), the expected load, solar, price, export price or demand rate for the next steps, and sessions(charger, t, steps), the car visits expected to start inside the horizon {code_forecasts}. The module docstring makes the key design point explicit: perfect and realistic forecasts answer the same two questions, so a controller cannot tell which one it has {code_forecasts}. That is what makes 'Compare forecasts' a clean experiment: only the information changes, never the controller." },
      { kind: "note", tone: "info", text: "Site Lab gives the controller the battery's exact stored energy. Real systems estimate it, with errors; see 'Knowing the state: estimation and the Kalman filter' {code_engine}." },
      { kind: "h", text: "The state: what must be remembered" },
      { kind: "p", text: "In control theory the state is whatever you need to know now to predict the future, given the decisions {astrom_murray}. In Site Lab it is: the energy in each battery, each connected car's remaining need and departure step, the heat in each tank, and, less obviously, the highest import so far this month. That last one is state because a demand charge bills the monthly peak: once the month has seen 9 kW, importing 8 kW later costs nothing extra, while importing 10 kW does. A controller that forgets the peak so far will either waste effort shaving below it or fail to protect it, which is why month_peak_kw is in the observation {code_ctrl} {code_mpc}." },
      { kind: "h", text: "3. What a controller must never do: the limits" },
      { kind: "p", text: "The controllers.py docstring states the contract: the engine clips every request to physical limits and then applies the safety layer, so 'a controller can never break a limit, only ask for something infeasible' {code_ctrl}. In order, inside engine.simulate() {code_engine}:" },
      { kind: "steps", items: [
        "Physical limits. Battery power is clipped to its rating and to the room left between minimum and maximum charge. A car's charging is clipped to its maximum, to what it still needs, and to 'off or at least the minimum current' (6 A per phase under IEC 61851, so 4.14 kW on three phases), except for a final top-up {iec61851} {code_engine}. A heat pump is kept between 'just enough to meet demand with what is in the tank' and 'tank full' {code_engine}.",
        "Grid-operator dimming (§14a, optional): during a dimming window, controllable devices are capped {code_engine}.",
        "Import limit: if the site would draw too much, battery charging stops first, then the battery discharges harder, then cars slow down in proportion; any overload left is recorded {code_engine}.",
        "Fuse per phase: the same idea, phase by phase, slowing the cars on the overloaded phase {code_engine}.",
        "Export limit: cars stop giving energy back, the battery charges more, and as a last resort solar is curtailed {code_engine}.",
      ] },
      { kind: "p", text: "This split, a controller that may ask for anything above a safety layer that decides what is allowed, is the same architecture real systems use; Google's cooling AI has its instructions re-checked by the local control system {deepmind2018}. See 'Control layers and time scales'." },
      { kind: "h", text: "4. What a controller wants: the goals" },
      { kind: "list", items: [
        "Energy bill: imports times the price of each step, minus export earnings at the export price of that step {code_engine}.",
        "Demand charges, where the tariff has them: a price per kW of the month's highest import, or of the highest import in each time-of-use window {code_engine}.",
        "Battery wear: every run is scored with an ageing model (NREL BLAST-Lite) and the share of the battery's life it used is priced at the replacement cost; 'cost including wear' is the headline number in the study {code_wear} {blast_lite}.",
        "Service: cars should leave with the energy they asked for; heat demand must be met {code_engine}.",
        "Secondary measures: self-sufficiency, peak import, number of cycles. They describe a run but are not what the optimiser minimises {code_engine}.",
      ] },
      { kind: "p", text: "Goals conflict. In the one-week German home example, a 5 kW peak-shaving rule held the peak at exactly 5.0 kW and raised the bill from €26.18 (battery idle) to €31.33, while the self-consumption rule cut it to €11.57 and left the peak at 7.5 kW {runs_2026_11d}. A controller serves the goal it is given, so writing the goal down correctly is part of the control design." },
      { kind: "h", text: "Worked example: one sunny hour" },
      { kind: "p", text: String.raw`Take the full-year example home (10 kWh / 5 kW battery, round-trip efficiency 0.9, so one-way \(\eta = \sqrt{0.9} \approx 0.949\)) {code_model}. At noon the house draws 0.6 kW and the panels give 3.2 kW (numbers chosen for the example). The net demand before the battery is 0.6 - 3.2 = -2.6 kW: a surplus. The self-consumption rule asks for +2.6 kW of charging; in one hour that stores 2.6 x 0.949 = 2.47 kWh {code_ctrl} {gc_calc}.` },
      { kind: "p", text: "Was that a good decision? The question is what 1 kWh of surplus is worth in each use. Exporting it earns the feed-in tariff, 7.86 ct {bnetza_eeg}. Storing it returns 0.9 kWh later, which replaces imports. Over the study year the import price averaged about 37.8 ct/kWh, and the cheapest hour of a day was typically about 31.5 ct (median over the year), so the 0.9 kWh is worth 28 to 34 ct {gc_calc}. Against that stands wear: Site Lab's wear price for this LFP battery is about 14.8 ct per kWh cycled, charged half on the way in and half on the way out, about 14.1 ct for this round trip {code_wear} {gc_calc}. Net: storing beats exporting by roughly 6 to 12 ct per kWh, whatever the evening brings. That small calculation explains much of Part 3: with this tariff 'store spare solar' is right almost regardless of the forecast, which is why a simple rule is so hard to beat (results/study_home_de/README_cautious.md says the same) {runs_2026_11g}." },
      { kind: "math", tex: String.raw`\underbrace{\eta^2\, p^{\mathrm{later}}}_{\text{value if stored}} - \underbrace{\tfrac{w}{2}\,(1 + \eta^2)}_{\text{wear}} \quad \text{vs} \quad \underbrace{p^{\mathrm{exp}}}_{\text{value if exported}}`,
        caption: String.raw`The decision behind every kWh of surplus. With \(\eta^2 = 0.9\), \(w = 0.148\) per kWh, \(p^{\mathrm{exp}} = 0.0786\) and \(p^{\mathrm{later}}\) between 0.315 and 0.378, the left side is 0.14 to 0.20, roughly two to two and a half times the export value {gc_calc}.` },
      { kind: "h", text: "Two ways to decide: feedback and planning" },
      { kind: "p", text: "Feedback means: measure, compare with what you want, act, repeat. The standard text treats it as the central idea of control {astrom_murray}. Site Lab's rules are pure feedback. Self-consumption measures the net demand and cancels it; peak shaving measures the gap to a threshold and closes it {code_ctrl}. Feedback is robust because it reacts to what actually happens, but it cannot anticipate: it will not save energy for a peak it cannot yet see." },
      { kind: "p", text: "Planning means: use a model of the system and a forecast of the future to choose the whole sequence of decisions that minimises cost. That is optimal control; Bellman's dynamic programming is its classic form {bellman1954}. A plan can anticipate, but it is only as good as its forecast. Model predictive control (MPC) combines the two: plan over a horizon, carry out only the beginning, measure, and plan again. Re-planning from fresh measurements turns a plan into a feedback controller {rawlings_mpc}. Chapter 14 covers the rules, 15 the optimisation underneath MPC, 16 Site Lab's MPC itself, 17 what happens when the forecast is wrong, and 18 how to judge the results." },
      { kind: "h", text: "The clocks" },
      { kind: "facts", rows: [
        ["Time step: 1 to 60 minutes", "How often the controller is asked. Plan mode is hourly, Operate mode 1-15 minutes {code_engine}. Everything faster (inverter control, frequency response) is assumed to happen perfectly inside a step."],
        ["Re-plan interval: 60 minutes by default", "How often the MPC solves a new plan, and immediately when a car plugs in. With hourly steps this means every step {code_model} {code_mpc}."],
        ["Horizon: 24 hours by default (1 to 48)", "How far the MPC looks ahead; 24 hours covers one daily price and solar cycle. EMHASS recommends a horizon of at least five optimisation steps {code_model} {emhass_lp}."],
        ["Price publication: about 13:00", "When tomorrow's day-ahead prices become known. Before that, a realistic controller knows prices only until midnight {code_forecasts} {mesc2024}."],
        ["Billing month", "The period over which a demand charge's peak is measured {code_engine}."],
        ["Battery life: years to decades", "What wear eats into. In the study, the rule's way of operating would wear the battery out in about 32 years in the ageing model {runs_2026_11e}."],
      ] },
      { kind: "p", text: "The hardest part of energy control is the gap between these clocks. A decision taken in one minute changes a battery's life, measured in years, and a demand charge, measured over a month. The tools that bridge the gap are simple: month_peak_kw carries the month into each step, and a wear price per kWh carries the battery's life into each plan {code_ctrl} {code_wear}. Whether these bridges are good enough is an empirical question, answered in chapters 17 and 18." },
    ],
  },
  {
    id: "g-rules", section: "guide", title: "14. Rule-based control, rule by rule",
    summary: "Every rule in controllers.py written out as pseudo-code with worked numbers: the battery, the EV chargers, the heat pump and car discharge, and the order in which they share the solar surplus.",
    blocks: [
      { kind: "p", text: "A rule-based controller is a fixed recipe: look at the current observation, apply if-then logic, return an action. Site Lab's rules live in src/emsbench/sim/controllers.py and are stateless: the same observation always gives the same action {code_ctrl}. They are not a straw man. On real house hardware, rules, decision trees and MPC ended within 0.6% of each other in cost {ruddick2024}, CityLearn ships rules as its baselines {vazquez2019}, and in Site Lab's full-year study a two-line rule beat the plain optimiser running on realistic forecasts in every home {runs_2026_11e}. This chapter writes every rule out exactly, so you can predict what it will do. The theory and the literature are on 'Rule-based battery control' and 'EV smart charging'; this chapter is the precise reference." },
      { kind: "h", text: "The order of decisions: decide()" },
      { kind: "p", text: "One function, decide(spec, obs), builds the whole action. The order matters, because devices share the solar surplus first come, first served {code_ctrl}:" },
      { kind: "code", text: `def decide(spec, obs):
    surplus = obs.pv_kw - obs.load_kw          # spare solar before EVs, heat pumps, battery
    for each car:          p = ev_power(...);  surplus -= p
    for each heat pump:    p = hp_power(...);  surplus -= p
    net = obs.load_kw - obs.pv_kw + sum(ev) + sum(hp)   # what the site needs before the battery
    battery = battery_power(spec, obs, net)
    if spec.ev_discharge == "high_prices" and some car can discharge:
        residual = net + battery (clipped to what the battery can do)
        if residual > 0 and obs.price >= median(obs.price_ahead):
            each idle car that may discharge covers min(residual, v2h_power(car))
    return Action(battery, ev, hp)` },
      { kind: "p", text: "So cars get the solar surplus first, then heat pumps, and the battery deals with whatever is left. Car discharge (V2H) comes last and only covers what the battery could not. The study's 'rule' controller is the combination self-consumption for the battery plus cheapest hours for the car {gc_study}." },
      { kind: "h", text: "Battery rules: battery_power()" },
      { kind: "code", text: `def battery_power(spec, obs, net):
    idle:              return 0
    self_consumption:  return -net                        # surplus -> charge, deficit -> discharge
    peak_shaving:      return threshold - net             # below: recharge with headroom; above: discharge
    price_arbitrage:
        cheapest, dearest = min(obs.price_ahead), max(obs.price_ahead)
        if net < 0:                                  return -net      # store spare solar first
        if dearest > cheapest and price >= dearest:  return -net      # dearest step: cover the site
        if dearest > cheapest and price <= cheapest: return obs.battery_max_charge_kw   # fill up
        return 0` },
      { kind: "p", text: "These are requests. If self-consumption asks for 7 kW of charging from a 5 kW battery, the engine gives 5 kW, and the rest of the surplus is exported. If it asks for discharge from an empty battery, nothing happens {code_engine}." },
      { kind: "facts", rows: [
        ["Self-consumption, worked", "House 0.6 kW, solar 3.2 kW, no car: net = -2.6 kW, request +2.6 kW (charge). Evening, house 1.8 kW, no sun: net = +1.8, request -1.8 kW (discharge), so the grid sees zero as long as the battery has energy {code_ctrl} {gc_calc}."],
        ["Peak shaving, worked", "Threshold 5 kW. Net 7.5 kW: request 5 - 7.5 = -2.5 kW (discharge 2.5 kW, import exactly 5). Net 3 kW: request +2 kW, recharging only with the headroom under the threshold, so recharging never makes a new peak {code_ctrl} {gc_calc}."],
        ["Price arbitrage, worked", "At the cheapest step of the next 24 hours, with no surplus, the rule asks for the battery's full feasible charging power from the grid; at the dearest step it covers the site's whole net demand. Every other step it does nothing except store spare solar {code_ctrl}."],
      ] },
      { kind: "p", text: "Two weaknesses of arbitrage are visible in the code. It never checks whether the trade pays after losses, and it acts in exactly one cheapest and one dearest step of the window, so at 15-minute steps a battery that needs two hours to fill gets one quarter-hour {code_ctrl}. Whether arbitrage pays is easy to check by hand. In the 2025-26 German price series used by the study (day-ahead price plus 26.685 ct of fees, taxes and margin), the median day had a cheapest hour of 31.5 ct and a dearest of 43.6 ct. Buying 1 kWh at 31.5 ct returns 0.9 kWh worth 39.2 ct: a gain of 7.7 ct before wear. But the wear of that round trip is about 14.1 ct. Over the year, the trade paid after losses on 95% of days and after losses and wear on only 24% {gc_calc}. That is part of why the price-arbitrage rule did badly on the German home week (€26.22, against €26.18 with the battery idle) {runs_2026_11d}." },
      { kind: "h", text: "EV rules: ev_power()" },
      { kind: "p", text: "Every EV rule starts from the same quantities, recomputed every step from the energy still missing, so a car slowed by a fuse is caught up later {code_ctrl}:" },
      { kind: "code", text: `needed_kw   = remaining_kwh / efficiency / step_hours     # power that would finish in one step
full        = min(max_kw, needed_kw)                     # the most the car can usefully take
steps_needed = ceil(needed_kw / max_kw)                  # full-power steps still needed
no_slack    = steps_needed >= steps_left                 # safety net: no time to wait

if not connected or nothing left:            return 0
if as_fast_as_possible or no_slack:          return full
spread_until_departure:  return min(full, max(min_kw, needed_kw / steps_left))
cheapest_hours:          charge at full now if this step is among the steps_needed
                         cheapest of the next steps_left steps (price_ahead), else 0
solar_surplus:           p = min(full, max(surplus, 0)); return p if p >= min_kw else 0` },
      { kind: "p", text: "Worked example, hourly steps. A car plugs in at 20:00, leaves at 06:00 (steps_left = 10), needs 20 kWh, on an 11 kW charger with 95% efficiency. needed_kw = 20 / 0.95 / 1 = 21.05 kW, so full = 11 kW and steps_needed = ceil(21.05 / 11) = 2 {gc_calc}." },
      { kind: "facts", rows: [
        ["As fast as possible", "11 kW at 20:00 and 21:00 (the second hour only 10.05 kW, what is left: 20 - 11 x 0.95 = 9.55 kWh, divided by 0.95) {code_ctrl} {gc_calc}."],
        ["Spread until departure", "21.05 / 10 = 2.1 kW is below the three-phase minimum of 4.14 kW, so the rule asks for 4.14 kW. The car finishes after about five hours, not ten: the 6 A minimum makes 'spread evenly' impossible for small needs {code_ctrl} {iec61851} {gc_calc}."],
        ["Cheapest hours", "At 20:00 the rule sorts the next 10 prices and charges only if 20:00 is one of the 2 cheapest. Each hour it re-checks; if the car is still short when the hours run out, no_slack forces full power {code_ctrl}."],
        ["Solar surplus", "At night the surplus is zero, so the rule waits, until no_slack forces full power from the grid. By day, a 3 kW surplus is below the 4.14 kW minimum: the charger stays off and the surplus goes to the battery or the grid {code_ctrl} {code_engine}."],
      ] },
      { kind: "note", tone: "warn", text: "cheapest_hours picks steps by price only; it ignores the solar forecast and the home battery. With realistic forecasts it cost within €2 a year of its perfect-forecast version in every study home, probably because the night's prices are usually already published by the time a car plugs in {runs_2026_11e} {gc_calc}." },
      { kind: "h", text: "Heat pump rules: hp_power()" },
      { kind: "code", text: `on_demand = heat_kw / cop                       # electricity to meet this step's heat need
if on_demand strategy or no tank:   return on_demand
cheap_hours:
    low, high = 25th and 75th percentile of price_ahead
    price <= low:   return max_kw     # cheap: fill the tank
    price >= high:  return 0          # dear: draw on the tank (engine still heats if it runs empty)
    otherwise:      return on_demand
solar_surplus:      return on_demand + max(surplus, 0)    # spare solar goes into the tank` },
      { kind: "p", text: "The engine then keeps the request between the minimum that meets demand with what is in the tank and the maximum that fills it, so asking for 0 means 'use the tank' and asking for the maximum means 'fill it' {code_ctrl} {code_engine}. Example: heat demand 6 kW of heat at COP 3 means on_demand = 2 kW of electricity. In a cheap quarter of the day's prices the rule asks for the heat pump's maximum and stores the extra heat; in a dear quarter it asks for 0 and the tank supplies the 6 kW until it is empty {gc_calc}." },
      { kind: "h", text: "Car discharge (V2H): v2h_power()" },
      { kind: "p", text: "With a bidirectional charger and the setting ev_discharge = high_prices, a car that is plugged in but not charging may cover what the house still imports, under three conditions {code_ctrl}:" },
      { kind: "steps", items: [
        "The house is importing after the battery has done its part, and the price now is at least the median of the next 24 hours {code_ctrl}.",
        String.raw`It pays after losses: the price now times the charger efficiency squared must beat the cheapest price before departure, \(p_t\, \eta_c^2 > \min p_{\text{future}}\), because every kWh lent must be recharged later, losing energy both ways {code_ctrl}.`,
        "It leaves room to recharge cheaply: the car only lends what it could recharge in half of its remaining stay at full power, so it is never forced to recharge at full power whatever the price. The engine adds its own limits: the target must stay reachable, and a per-visit cap on lent energy applies {code_ctrl} {code_engine}.",
      ] },
      { kind: "p", text: "Worked example. 18:00, the car leaves at 07:00 (steps_left = 13), needs 10 kWh more, 11 kW charger, 95% efficiency. Price now 40 ct; cheapest price before departure 30 ct. Test: 40 x 0.95² = 36.1 ct > 30 ct, so lending pays. Room: half_stay = (13 - 1) / 2 = 6 steps, 6 x 11 x 0.95 = 62.7 kWh could be recharged, minus the 10 kWh still needed: 52.7 kWh may be lent, far more than one evening needs, so the engine's own caps decide. If the cheapest later price were 37 ct, 36.1 < 37 and the car would not discharge {code_ctrl} {gc_calc}." },
      { kind: "h", text: "What rules cannot do, precisely" },
      { kind: "list", items: [
        "They look at most 24 hours of prices and nothing else ahead: no solar forecast, no load forecast, no knowledge of the next car {code_ctrl}.",
        "They do not coordinate: the car takes the surplus before the battery even when the battery would have made better use of it, and the battery rule does not know the car will arrive tonight {code_ctrl}.",
        "They do not price wear: self-consumption cycles the battery whenever there is a surplus, whatever a kWh is worth {code_ctrl}. In the study it cost about €374 a year of wear (median) and would wear the battery out in about 32 years in the model {runs_2026_11e}.",
        "They switch instantly, with no hysteresis; real controllers wait before switching so devices are not cycled on and off too often {evcc_solar}.",
      ] },
      { kind: "p", text: "Rules use the future only through price_ahead, so 'realistic forecasts' affect only cheapest hours, arbitrage, heat-pump cheap hours and V2H. That is why the self-consumption rule cost the same with perfect and realistic forecasts (€1,159 against €1,160 a year including wear, median of four homes): it is robust because it does not depend on predictions {runs_2026_11e}. Chapter 16 shows what is gained by planning; chapter 17 why that gain is fragile." },
    ],
  },
  {
    id: "g-optimisation", section: "guide", title: "15. Optimisation from scratch: linear programs",
    summary: "What a linear program is, a small charging problem solved by hand, what the solver's 'shadow prices' mean, the tricks for peaks and penalties, why 'off or at least 6 A' breaks linearity, and how Site Lab handles it.",
    blocks: [
      { kind: "p", text: "The MPC in chapter 16 is, at its core, one optimisation problem solved again every hour. This chapter builds the tools to read it: what an optimisation problem is, why the linear kind is special, how it is solved, and where Site Lab's problem stops being linear. Everything here can be checked with pencil and paper or with ten lines of Python." },
      { kind: "h", text: "The three parts of an optimisation problem" },
      { kind: "facts", rows: [
        ["Decision variables", "The numbers you choose: battery power each hour, charging power each hour, grid import each hour."],
        ["Objective", "One number to minimise (or maximise) that depends on the variables: the cost."],
        ["Constraints", "Rules the variables must satisfy: the energy balance, power ratings, the car's need by departure."],
      ] },
      { kind: "p", text: "A problem is a linear program (LP) when the objective and every constraint are straight-line (linear) expressions of the variables: sums of variables times fixed numbers, compared with =, less-than-or-equal or greater-than-or-equal. No products of variables, no squares, no 'if'. Battery dispatch fits, provided charging and discharging are separate variables with fixed efficiencies; see 'Battery dispatch as a linear program' {emhass_lp}." },
      { kind: "math", tex: String.raw`\min_{x}\ c^\top x \quad \text{subject to} \quad A_{\mathrm{ub}}\, x \le b_{\mathrm{ub}}, \qquad A_{\mathrm{eq}}\, x = b_{\mathrm{eq}}, \qquad l \le x \le u`,
        caption: String.raw`The standard form SciPy's linprog accepts: \(x\) the vector of variables, \(c\) the cost per unit of each, rows of \(A_{\mathrm{ub}}\) and \(A_{\mathrm{eq}}\) the constraints, \(l\) and \(u\) the bounds of each variable {gc_scipy_linprog}. Site Lab's MPC builds exactly these arrays in the _LP helper class of src/emsbench/sim/mpc.py {code_mpc}.` },
      { kind: "h", text: "A problem small enough to solve by hand" },
      { kind: "p", text: "A car is plugged in for two hours and needs 9 kWh (ignore losses to keep the numbers clean). Hour 1 costs 20 ct/kWh, hour 2 costs 30 ct/kWh. The car's on-board charger takes at most 7 kW. In hour 1 the house is busy, so the connection leaves room for only 6 kW of charging. Let x1 and x2 be the kWh charged in each hour {gc_lp_check}." },
      { kind: "math", tex: String.raw`\begin{aligned}
\min\quad & 0.20\, x_1 + 0.30\, x_2 && \text{cost} \\[10pt]
\text{s.t.}\quad & x_1 + x_2 \ge 9 && \text{energy by departure} \\[10pt]
& 0 \le x_1 \le 6 && \text{connection room in hour 1} \\[10pt]
& 0 \le x_2 \le 7 && \text{car's maximum in hour 2}
\end{aligned}`,
        caption: String.raw`Two variables, so the problem can be drawn: \(x_1\) on one axis, \(x_2\) on the other. The constraints cut out a triangle of allowed plans {gc_lp_check}.` },
      { kind: "p", text: "Solving by hand uses the central fact of linear programming: if an LP has a best solution, one is at a corner of the allowed region. The objective is a straight line; slide it across the region in the direction of lower cost and the last point it touches is a corner (or a whole edge, when there is a tie). So list the corners and evaluate the cost at each {gc_lp_check}:" },
      { kind: "facts", rows: [
        ["Corner (6, 3)", "Fill hour 1 to its limit, the rest in hour 2: 0.20 x 6 + 0.30 x 3 = 2.10. The cheapest {gc_lp_check}."],
        ["Corner (2, 7)", "Hour 2 at the car's maximum: 0.40 + 2.10 = 2.50 {gc_lp_check}."],
        ["Corner (6, 7)", "Both at their maximum, delivering 13 kWh: 1.20 + 2.10 = 3.30 {gc_lp_check}."],
      ] },
      { kind: "p", text: "The answer, x1 = 6 and x2 = 3 for 2.10, matches intuition: use as much of the cheap hour as allowed. SciPy's linprog with the HiGHS solver returns the same plan and cost {gc_lp_check}. In real problems with thousands of variables you cannot list corners, but the simplex method does the same thing cleverly: it starts at one corner and walks along edges to neighbouring corners, each time lowering the cost, until no neighbour is better {gc_dantzig}." },
      { kind: "h", text: "Shadow prices: what a limit costs" },
      { kind: "p", text: "A solver also returns, for each constraint, a dual value or shadow price: how much the best cost would change if that constraint's right-hand side were loosened by one unit {gc_scipy_linprog}. For the example {gc_lp_check}:" },
      { kind: "facts", rows: [
        ["Energy need: 0.30 per kWh", "One more kWh needed by departure would cost 0.30, because it would have to come from hour 2 {gc_lp_check}."],
        ["Connection room in hour 1: 0.10 per kWh", "One more kWh of room in hour 1 would save 0.30 - 0.20 = 0.10, moving a kWh from the dear hour to the cheap one {gc_lp_check}."],
        ["Car's maximum in hour 2: 0", "Not binding (3 is below 7), so loosening it is worth nothing {gc_lp_check}."],
      ] },
      { kind: "p", text: "Shadow prices are the most useful by-product of optimisation for a product manager: they put a price on each limit. A fuse with a high shadow price is worth upgrading; one with a zero shadow price is not the problem. Site Lab does not report them yet; this is an idea, not a feature." },
      { kind: "h", text: "Two standard tricks: maximum and penalties" },
      { kind: "p", text: String.raw`A demand charge bills the highest import of the month, \(\max_t g^{+}_t\). A maximum is not linear, but there is a standard trick: introduce one new variable \(\hat g\), require \(g^{+}_t \le \hat g\) for every step, and put \(\hat g\) times the demand rate into the cost. The solver pushes \(\hat g\) down until it touches the highest import, so at the optimum it equals the maximum {code_mpc}. Small example: a house draws 3 kW in hour 1 and 5 kW in hour 2 and the battery holds 2 kWh. Minimising \(\hat g\) subject to \(3 - d_1 \le \hat g\), \(5 - d_2 \le \hat g\), \(d_1 + d_2 \le 2\) gives \(d_2 = 2\) and a peak of 3 kW {gc_lp_check}.` },
      { kind: "p", text: String.raw`The second trick makes a hard limit soft. 'The car must get 9 kWh' can become impossible (a car that leaves after one hour cannot get 9 kWh at 7 kW), and an impossible LP has no answer at all. So Site Lab adds a shortfall variable \(s \ge 0\): \(x_1 + x_2 + s \ge 9\), with \(s\) costing a large penalty \(M\) per kWh. The solver uses \(s\) only when there is no other way. The same is done for the import limit and each phase's fuse, with an even larger penalty, so the MPC always returns a plan and only breaks a limit when nothing else is possible {code_mpc}.` },
      { kind: "h", text: "Where linearity breaks: off, or at least 6 A" },
      { kind: "p", text: "A charger cannot offer less than 6 A per phase (IEC 61851): it is either off or at least 4.14 kW on three phases {iec61851}. That rule is not linear. The allowed set, zero plus the interval from 4.14 to 7, has a hole in it, and an LP can only describe regions without holes (convex regions). Optimisation texts call such a variable semi-continuous." },
      { kind: "p", text: "Apply it to the example. The LP's answer had x2 = 3 kWh, which sits in the hole: 3 is not 0 and is below 4.14. Three ways to deal with it {gc_lp_check}:" },
      { kind: "facts", rows: [
        ["Round up (naive)", "Keep x1 = 6, raise x2 to 4.14: the car gets 10.14 kWh for 2.44, paying for energy it did not ask for {gc_lp_check}."],
        ["Round down (naive)", "Switch x2 off: the car leaves 3 kWh short {gc_lp_check}."],
        ["Re-optimise with x2 forced to at least 4.14", "The LP moves the remaining need: x1 = 4.86, x2 = 4.14, exactly 9 kWh, cost 2.214. Only 0.114 more than the impossible LP plan {gc_lp_check}."],
      ] },
      { kind: "p", text: "This is why the MPC docstring warns that 'a plan for a trickle of spare solar would be rounded up to the minimum and the grid would pay the difference' {code_mpc}. The fix has two forms in the code." },
      { kind: "h", text: "Exact: a mixed-integer program" },
      { kind: "math", tex: String.raw`P \le P^{\max}\, u, \qquad P \ge P^{\min}\, u, \qquad u \in \{0, 1\}`,
        caption: String.raw`One on/off variable \(u\) per car per step. With \(u = 0\) the first line forces \(P = 0\); with \(u = 1\) the second forces \(P \ge P^{\min}\). This is how _LP._milp() in mpc.py writes it, handing the problem to SciPy's milp {code_mpc} {gc_scipy_milp}.` },
      { kind: "p", text: "Once some variables must be whole numbers, the problem is a mixed-integer linear program (MILP). These are much harder: the solver explores a tree of LP relaxations (nodes), fixing on/off choices one way or the other, and stops when its best plan is provably close enough to the best possible {gc_scipy_milp}. Site Lab's exact mode stops at a relative gap of 0.01% (MILP_GAP = 1e-4) or after 10 seconds per solve (MILP_TIME_LIMIT_S), keeping the best plan found {code_mpc}. It is too slow for year-long runs, so it is not offered in the app; the tests use it as a reference {code_mpc}." },
      { kind: "h", text: "Fast: relax-and-fix" },
      { kind: "p", text: "The default is a heuristic in _LP.solve(), described in the module docstring {code_mpc}:" },
      { kind: "steps", items: [
        "Solve the LP without the on/off rule (the relaxation) {code_mpc}.",
        "Find each car's steps whose planned power sits strictly between 0 and its minimum. If none, done {code_mpc}.",
        "Repair (a): switch all those steps off and re-solve. Repair (b): per car, force the largest of them up to the minimum and switch the others off, then re-solve; the LP takes the extra energy from other steps (the code comment's example: 11 + 11 + 0.7 kW becomes 11 + 7.6 + 4.1) {code_mpc}.",
        "Keep the cheaper of the two plans, with its bounds, and repeat, at most 5 rounds (RELAX_AND_FIX_ROUNDS) {code_mpc}.",
      ] },
      { kind: "p", text: "Trying both repairs matters, the code comment explains, because the LP is often indifferent between a trickle now and full power later, and repair (b) alone would lock in the trickle {code_mpc}. On the example, with both hours subject to the 4.14 kW minimum, round 1 compares (a) x2 off, which leaves the car 3 kWh short and costs a penalty, against (b) x2 forced to 4.14, which costs 2.214; (b) wins, and since 4.86 and 4.14 are both outside the hole, it stops. Running the actual _LP class on this example, relax-and-fix and the exact MILP return the same plan, 4.86 and 4.14 {gc_lp_check}. In general it is a heuristic: tests/test_mpc.py checks that on a test site it delivers the same car energy as the exact version at no more than 2% higher cost {code_mpc}." },
      { kind: "note", tone: "info", text: "One detail from the code: the minimum used for a visit is the smaller of the charger minimum and the visit's whole energy need in one step, so a car that needs less than one step at minimum power may take a small final top-up, as the engine allows {code_mpc} {code_engine}." },
      { kind: "h", text: "The solver: HiGHS through SciPy" },
      { kind: "p", text: "Site Lab calls scipy.optimize.linprog with method='highs' {code_mpc}. SciPy's documentation says this default chooses automatically between HiGHS's dual revised simplex implementation and its interior-point method, which has a crossover step so it is as accurate as simplex {gc_scipy_linprog}. HiGHS is open-source; its parallel dual simplex is described by Huangfu and Hall {gc_highs}. EMHASS uses HiGHS by default too {emhass_home}. Interior-point methods, the alternative to simplex, move through the inside of the allowed region instead of along its corners." },
      { kind: "p", text: "How big is Site Lab's problem? Counting from the code for the study's home (hourly steps, 24-hour horizon, a battery, one charger, a 25 A fuse, no import limit, no demand charge): 24 variables each for import, export, curtailment, charging and discharging, 25 for stored energy, 72 fuse slacks, plus up to 24 for a plugged-in car and one shortfall, about 220 to 245 variables in all; and 49 equality constraints (energy and power balance) and 72 to 74 inequalities (fuses, car energy) {code_mpc} {gc_calc}. A year of hourly re-plans is 8,760 of them. The study's plain MPC with realistic forecasts took 187 to 265 seconds per home-year, so about 20 to 30 milliseconds per step for building, solving and simulating together {runs_2026_11e} {gc_calc}." },
      { kind: "h", text: "Why not dynamic programming, or something non-linear?" },
      { kind: "list", items: [
        "Dynamic programming handles any cost shape, but its table of states explodes as batteries, cars and tanks are added {bellman1954}. An LP handles many devices at once as long as everything is linear.",
        "Non-linear effects (efficiency that varies with power, wear that depends on depth) can be approximated by straight-line pieces at the cost of more variables; Site Lab keeps one efficiency and one wear price per kWh {code_mpc} {code_wear}.",
        "MPC textbooks build on exactly this link between optimal control and repeated optimisation {rawlings_mpc}.",
      ] },
    ],
  },
  {
    id: "g-mpc", section: "guide", title: "16. Site Lab's MPC, exactly as implemented",
    summary: "Every variable, cost and constraint of the linear program in sim/mpc.py, when it is solved again, what leftover energy and battery wear are worth, how the plan is executed (plan, hybrid, cautious), and how several scenarios are combined.",
    blocks: [
      { kind: "p", text: "This chapter is the reference for src/emsbench/sim/mpc.py. The class MPCController plans the battery and every EV charger together. It builds one linear program over the next H steps, solves it with HiGHS, and follows the beginning of the plan until the next re-plan {code_mpc}. The overall formulation follows EMHASS's LP (power balance per step, separate charge and discharge efficiencies) {emhass_lp}, extended with cars, fuses, demand charges, a value for leftover energy and a wear price {code_mpc}. The overview page 'Model predictive control (MPC)' gives the idea and the literature; here is every term." },
      { kind: "h", text: "When a plan is made" },
      { kind: "p", text: "MPCController.act() is called every step. It solves a new plan when the current one is stale, meaning the re-plan interval or the horizon has passed since it was made, or when a car has just plugged in, because a new car changes everything {code_mpc}. Both intervals are settings: horizon 24 hours by default (1 to 48), re-plan every 60 minutes by default {code_model}. In steps: horizon H = round(hours / step length), re-plan every max(1, round(minutes / 60 / step length)) steps {code_mpc}. With the study's hourly steps that is H = 24 and a new plan every step; in Operate at 15 minutes, H = 96 and a plan is followed for four steps {gc_calc}." },
      { kind: "h", text: "What the plan is made from" },
      { kind: "list", items: [
        "From the Observation: the battery's energy now, each car's state, the month's peak so far and the peak so far in each time-of-use window {code_mpc}.",
        "From the Forecast: windows of load, solar, import price, export price and demand rate, and the car visits expected inside the horizon {code_mpc} {code_forecasts}.",
        "From SiteLimits (built once by the engine): step length, battery capacity, minimum and maximum energy, power, one-way efficiency (several batteries are planned as one), import and export limits, fuse per phase in kW (amps x 230 V), the fixed export price, the flat demand rate, each charger's efficiency, and the wear price {code_mpc} {code_engine}.",
      ] },
      { kind: "h", text: "The variables" },
      { kind: "facts", rows: [
        ["Import and export", String.raw`Grid import \(g^{+}_k\) and export \(g^{-}_k\) at step \(k = 0 \dots H-1\), kW. Export is capped at the export limit if there is one {code_mpc}.`],
        ["Curtailment", String.raw`Curtailed solar \(u_k\), at most the forecast solar, but only when an export limit exists; otherwise fixed at 0 {code_mpc}.`],
        ["Battery power", String.raw`Battery charging \(c_k\) and discharging \(d_k\) power, each between 0 and the battery's power rating (fixed at 0 without a battery) {code_mpc}.`],
        ["Stored energy", String.raw`Stored energy \(e_k\) at the start of step \(k = 0 \dots H\), between \(E_{\min}\) and \(E_{\max}\) {code_mpc}.`],
        ["Car charging", String.raw`Charging power \(P_{j,k}\) of car visit \(j\) at step \(k\), from its arrival (or now) to its departure or the end of the horizon, between 0 and the car's maximum {code_mpc}.`],
        ["Shortfall", String.raw`Energy shortfall \(s_j\) of visit \(j\), kWh {code_mpc}.`],
        ["Overloads", String.raw`Overload \(o_k\) above the import limit, and \(o^{\phi}_k\) above the fuse on phase \(\phi \in \{L1, L2, L3\}\) {code_mpc}.`],
        ["Peaks", String.raw`The month's peak import \(\hat g\) (only with a flat demand charge) and one peak \(\hat g_r\) per time-of-use demand rate \(r\) present in the horizon {code_mpc}.`],
      ] },
      { kind: "h", text: "The objective" },
      { kind: "math", tex: String.raw`\begin{aligned}
\min\ \ & \sum_{k=0}^{H-1} \Big( p_k\, g^{+}_k - \min\!\big(p^{\mathrm{exp}}_k,\ p_k\big)\, g^{-}_k \Big)\Delta t
\;+\; \kappa \sum_{k=0}^{H-1} (c_k + d_k)\,\Delta t
\;-\; v\, e_H \\[10pt]
& +\; M \sum_j s_j \;+\; 100M \sum_{k} \Big(o_k + \sum_{\phi} o^{\phi}_k\Big)\Delta t
\;+\; c^{\mathrm{flat}}\, \hat g \;+\; \sum_r r\, \hat g_r
\;\Big[\, -\ \varepsilon \sum_{k=1}^{H-1} e_k\, \Delta t \ \ \text{cautious only} \Big]
\end{aligned}`,
        caption: String.raw`\(p_k\) is the import price, \(p^{\mathrm{exp}}_k\) the export price of each step, \(\Delta t\) the step length in hours {code_mpc}. Every term is explained below.` },
      { kind: "facts", rows: [
        ["Energy bill", String.raw`Imports at the import price, exports at the export price, but never at more than the import price of the same step. The code comment explains: one meter cannot import and export at once, and when wholesale prices go negative, importing in order to export would look like free money to the LP {code_mpc}.`],
        ["Cycling cost", String.raw`\(\kappa = \max(w/2,\ 10^{-4})\) per kWh charged and per kWh discharged. \(w\) is the wear price per kWh; half is charged on the way in and half on the way out, so one equivalent full cycle (one capacity in and out) costs \(w\) per kWh of capacity. Without a wear price, \(10^{-4}\) (TIE_BREAK_PER_KWH) only stops pointless cycling when costs tie {code_mpc}.`],
        ["Leftover energy", String.raw`\(v\) per kWh still stored at the end of the horizon; see below {code_mpc}.`],
        ["Penalties", String.raw`\(M = 10 \max(1,\ \max |p_k|,\ c^{\mathrm{flat}})\) per kWh of car shortfall; 100 times that per kWh over the import limit or a fuse. So missing car energy is always worse than buying it, and breaking a limit is worse still {code_mpc}.`],
        ["Demand charges", String.raw`\(c^{\mathrm{flat}}\) per kW of the month's peak; each time-of-use rate \(r\) per kW of the peak in its window {code_mpc}.`],
        ["Store-early tie-break (cautious)", String.raw`\(\varepsilon = 10^{-5}\) per kWh stored per hour (EARLY_PER_KWH_HOUR). A kWh held a whole day earns 0.00024, far below any price difference, so it only decides between plans that otherwise cost the same {code_mpc}.`],
      ] },
      { kind: "h", text: "The constraints" },
      { kind: "math", tex: String.raw`\begin{aligned}
& g^{+}_k - g^{-}_k = L_k - S_k + u_k + c_k - d_k + \textstyle\sum_j P_{j,k} && \text{power balance} \\[10pt]
& e_0 = E_{\text{now}}, \qquad e_{k+1} = e_k + \eta\, c_k\, \Delta t - d_k\, \Delta t / \eta && \text{battery} \\[10pt]
& g^{+}_k \le G^{\mathrm{imp}} + o_k && \text{import limit} \\[10pt]
& \tfrac13\big(L_k - S_k + u_k + c_k - d_k\big) + \textstyle\sum_{j \in 3\phi} \tfrac13 P_{j,k} + \sum_{j \in \phi} P_{j,k} \le F + o^{\phi}_k && \text{fuse, each phase } \phi \\[10pt]
& \textstyle\sum_k \eta_c\, P_{j,k}\, \Delta t + s_j \ge \text{need}_j && \text{car energy} \\[10pt]
& P_{j,k} = 0 \ \ \text{or} \ \ \min\!\big(P^{\min}_j,\ E_j / (\eta_c \Delta t)\big) \le P_{j,k} \le P^{\max}_j && \text{off or at least 6 A} \\[10pt]
& g^{+}_k \le \hat g, \quad \hat g \ge \text{peak so far}; \qquad g^{+}_k \le \hat g_r \ \ (k \text{ in window } r), \quad \hat g_r \ge \text{peak so far in } r && \text{peaks}
\end{aligned}`,
        caption: String.raw`\(L_k, S_k\) forecast load (heat pumps on demand included) and solar; \(E_{\text{now}}\) the measured stored energy, clipped into \([E_{\min}, E_{\max}]\); \(F\) the fuse in kW per phase. The fuse row assumes house, solar and battery are balanced over the three phases, as the engine does. \(\text{need}_j = \max\big(0,\ E_j - (N_j - n_j)\, P^{\max}_j\, \eta_c\, \Delta t\big)\): of the energy \(E_j\) the car needs over its \(N_j\) remaining steps, only the part that could not be delivered after the horizon's last step (its \(n_j\) steps inside the horizon) must come inside it {code_mpc}.` },
      { kind: "p", text: "Which cars are in the plan? Every car plugged in now, and every visit the forecast expects inside the horizon. A perfect forecast knows the visits the engine will accept; a realistic forecast knows none until they plug in; a scenario replays the driver's visits from an earlier day. Expected visits that would arrive while the charger is still busy are skipped, as the engine would skip them {code_mpc} {code_forecasts} {code_engine}." },
      { kind: "note", tone: "info", text: "What the MPC does not plan: heat pumps run on demand, and cars never discharge (V2H is rule-only). Several batteries are planned as one. A billing month that changes inside the horizon is treated as one month {code_mpc} {code_ctrl}." },
      { kind: "h", text: "The value of leftover energy" },
      { kind: "p", text: "Every finite plan has an edge. Without a value for what is left at the end, the optimiser sees stored energy at hour 24 as worthless and empties the battery; EMHASS's answer is a terminal constraint, ending where it started {emhass_lp}. Site Lab instead gives each kWh left at the end a value {code_mpc}:" },
      { kind: "math", tex: String.raw`v = \eta \cdot \max\!\Big(0,\ \min_k p_k - \kappa\,[\text{cautious}],\ p^{\mathrm{exp}}\Big)`,
        caption: String.raw`The cheapest import price in the horizon, times the discharge efficiency: what a kWh still stored could at least save later. \(p^{\mathrm{exp}}\) here is the tariff's fixed export price. The cautious mode subtracts the cycling cost \(\kappa\) of taking it out again. The value is 0 if the cheapest price is negative {code_mpc}.` },
      { kind: "p", text: "Why this level? The docstring gives both halves: it is enough to make free solar worth storing even when exports earn nothing and the controller cannot yet see tonight's car, but it never makes buying from the grid just to fill up pay, because charging a kWh costs the price divided by the efficiency, more than the price times the efficiency it is valued at {code_mpc}. Numbers for the study home: in the 2025-26 German prices plus fees, the cheapest hour of the next 24 was typically 31.2 ct (median over the year). So in plan mode v = 0.949 x 31.2 = 29.6 ct per kWh; in cautious mode v = 0.949 x (31.2 - 7.4) = 22.6 ct {gc_calc}. The difference is habit 3 of the cautious mode below." },
      { kind: "h", text: "The wear price" },
      { kind: "p", text: String.raw`Where does \(w\) come from? In src/emsbench/sim/wear.py, wear_price_per_kwh() runs the BLAST-Lite ageing model on one full cycle a day (0 to 100 to 0%) at the battery's temperature until end of life, takes the capacity lost to cycling per equivalent full cycle, and prices it: \(w = \text{cost per kWh} \times \text{loss per cycle} / (1 - \text{end-of-life capacity})\) {code_wear} {blast_lite}. For the default home battery (LFP, 25 °C, end of life at 80%, 1,200 €/kWh from the 2022 German market review) the loss is 2.47e-5 per cycle and \(w = 1{,}200 \times 0.0000247 / 0.2 \approx 0.148\) € per kWh, so \(\kappa = 0.074\) per kWh in and out {figgener2023} {gc_calc}. The engine computes it only when 'MPC prices battery wear' is on (the default) and a replacement cost is known; with several batteries it uses the capacity-weighted average {code_engine}.` },
      { kind: "p", text: "The MPC decides with this flat price; the run is then scored with the full ageing model, which also counts calendar ageing. The two can disagree; see 'Putting a price on wear' for when the flat price helped and when it backfired {code_wear} {runs_2026_11d}." },
      { kind: "h", text: "From plan to action: three execution modes" },
      { kind: "p", text: "Each step, act() reads the plan's entry for this step: the battery power and each car's power (tiny values are set to 0). Car powers are always followed. What happens to the battery depends on mpc_execution {code_mpc} {code_model}:" },
      { kind: "math", tex: String.raw`\begin{aligned}
\text{plan:}\quad & b = b^{\mathrm{plan}}_k - \big(n^{\mathrm{actual}} - n^{\mathrm{plan}}_k\big) \\[10pt]
\text{hybrid:}\quad & b = \max\!\big(-(n^{\mathrm{actual}} + \textstyle\sum_j P_j),\ b^{\mathrm{plan}}_k\big) \\[10pt]
\text{cautious:}\quad & b = b^{\mathrm{plan}}_k - \big(n^{\mathrm{actual}} - n^{\mathrm{plan}}_k\big), \ \text{ unless that trades more with the grid}
\end{aligned}`,
        caption: String.raw`\(n\) is load (with heat pumps on demand) minus solar, \(b^{\mathrm{plan}}_k\) the planned battery power for this step \(k\) of the plan, \(n^{\mathrm{plan}}_k\) the net load the plan assumed {code_mpc}.` },
      { kind: "facts", rows: [
        ["plan", "The battery takes up this step's forecast error, so the grid exchange stays as planned (zero error with a perfect forecast). The next re-plan starts from the battery's real state. Example: the plan assumed a 3 kW surplus and planned 2 kW of charging (1 kW export). A cloud leaves a 1 kW surplus: error = -1 - (-3) = +2, so the battery is set to 2 - 2 = 0, and the export stays at 1 kW as planned {code_mpc} {gc_calc}."],
        ["hybrid", "Behave like the self-consumption rule and let the plan only add to it: charge harder (for example from the grid before an expensive stretch) or discharge less to hold a reserve. Example: surplus 3 kW, plan says charge 1 kW: the battery charges 3 kW, never storing less solar than the rule. Evening, the house needs 2 kW and the plan says 0 (hold the energy): the battery stays at 0 and the house imports {code_mpc} {gc_calc}."],
        ["cautious (default)", "Like plan, with a guard, plus three changes to the plan itself (below) {code_mpc}."],
      ] },
      { kind: "h", text: "The cautious mode: four habits" },
      { kind: "p", text: "The cautious mode is 'four habits of a planner that does not trust its forecast', in the docstring's words {code_mpc}. Two change the data and the execution, two change the objective:" },
      { kind: "steps", items: [
        String.raw`Plan with the meter. The forecast load and solar of step 0 are replaced by this step's measured values before the LP is built {code_mpc}. A side effect worth knowing: with hourly steps and hourly re-plans, as in the full-year study, every step starts a new plan from the meter, so the forecast error at execution is exactly zero and habit 2 never has anything to correct; habit 2 matters in Operate runs, where a plan is followed for several steps {code_mpc} {gc_calc}.`,
        String.raw`Never trade more with the grid to absorb an error. If demand is lower than forecast (error < 0) and the corrected battery power would import, charge at most what the plan said and import less instead. If solar is lower than forecast (error > 0) and the correction would export, discharge at most what the plan said and export less. Example: plan 0 kW with a 3 kW planned export; a cloud cuts the surplus to 1 kW. Plan mode discharges 2 kW to keep exporting 3 kW, selling stored energy at the 7.86 ct feed-in price; cautious keeps the battery at 0 and exports 1 kW {code_mpc} {gc_calc}.`,
        String.raw`Value leftover energy net of wear: the \(-\kappa\) in \(v\). Without it the plan hoarded energy it would have to pay wear to use; on the tuning set it kept the battery 50-80% full for two days while the car charged from the grid at about 36 ct {code_mpc} {runs_2026_11g}.`,
        String.raw`Store early when it costs the same: the \(\varepsilon\) term. With a flat feed-in tariff the plain plan often exported morning sun and planned to charge 'later'; on Wednesday 10 June its battery was 14% full at 18:00 (the rule's: 92%) when the car arrived {code_mpc} {runs_2026_11g}.`,
      ] },
      { kind: "p", text: "The tie-break size was tuned: on the tuning set 1e-5 and 1e-4 gave the same result within €2 in €2,000, and 1e-3 was €23 worse (code comment and README_cautious.md) {code_mpc} {runs_2026_11g}. How the habits were found and tested is chapter 17." },
      { kind: "h", text: "Scenarios: planning for several futures in one LP" },
      { kind: "p", text: "With mpc_scenarios above 1 and realistic forecasts, solve() builds one LP containing S copies of the problem, one per scenario, each from forecast.scenario(b) for b = 0 ... S-1 {code_mpc}. Scenario b replays the day b + 1 days ago: that day's load, today's day-ahead solar forecast corrected by that day's forecast error, prices as published and then that day's prices, and the car visits the driver made that day at the same times, using only what was already observed {code_forecasts}. Perfect forecasts have no scenarios, so the setting does nothing there {code_mpc}." },
      { kind: "math", tex: String.raw`\min\ \frac{1}{S} \sum_{s=1}^{S} J_s\big(x^{\mathrm{now}},\ x^{\mathrm{later}}_s\big), \qquad x^{\mathrm{now}} = \big(c_k,\ d_k,\ P_{\text{plugged},k}\big)_{k < \min(\text{replan},\, H)}`,
        caption: String.raw`Each scenario \(s\) has its own copy of every variable and constraint above, with its costs weighted by \(1/S\). The decisions until the next re-plan, battery charge and discharge and the charging of the car plugged in now, are one shared set of variables: whatever happens, the controller has to commit to them before it knows which future comes. Later steps may differ per scenario. This is two-stage stochastic MPC {code_mpc} {mesbah2016} {campi2009}.` },
      { kind: "p", text: "The plan returned holds scenario 0's later steps, and its assumed net load is the average over the scenarios, so in plan mode the battery absorbs deviations from the average {code_mpc}. With S = 1 the same code is the deterministic MPC. The study's mpc_scenarios3 used S = 3 and took about two to three times longer than the single-scenario MPC (381 to 552 seconds per home-year) {gc_study} {runs_2026_11e}." },
      { kind: "h", text: "Checklist: what the existing overview page simplifies" },
      { kind: "p", text: "The formulation on 'Model predictive control (MPC)' gives the right structure, simplified in four places: it writes the export price as a single fixed value, while the code uses the export price of each step capped at the import price; the time-of-use peaks also start from the peak so far in each window; the overload penalty is per kWh (times the step length); and the cautious terms appear on 'Planning under uncertainty' rather than in the main formula {code_mpc}." },
    ],
  },
  {
    id: "g-uncertainty", section: "guide", title: "17. When the forecast is wrong",
    summary: "What a realistic controller knows, how much knowing the future is worth, deterministic versus stochastic versus robust planning, and what Site Lab measured: scenario MPC, the hybrid and the cautious planner.",
    blocks: [
      { kind: "p", text: "Chapter 16 described a planner. A planner needs a forecast, and every forecast is wrong. This chapter asks three questions: what can a real controller know, what is it worth to know more, and how should a plan be made when its inputs are uncertain? Then it reports what Site Lab measured, including two approaches that did not work, because they teach as much as the one that did." },
      { kind: "h", text: "What a realistic controller knows" },
      { kind: "p", text: "RealisticForecast in src/emsbench/sim/forecasts.py answers the same questions as the perfect forecast, using only information available at step t {code_forecasts}:" },
      { kind: "facts", rows: [
        ["Load", "The most recent day repeated: the forecast for step t + k is the value one day earlier, or two days earlier if that is the latest already seen (function persistence()). This is EMHASS's 'naive' method {emhass_fc} {code_forecasts}."],
        ["Solar", "The weather model's forecast from about a day earlier, from Open-Meteo's archive of past forecasts, run through the same solar model as the actual data, so the only difference is the weather forecast's error. Where no archive exists, yesterday's solar repeated {om_prevruns} {code_forecasts}."],
        ["Prices", "Known only once published: before 13:00 until midnight, after 13:00 until the end of tomorrow; beyond that, the last known day repeated (_published()). The auction closes at 12:00 and results come at about 13:00 {mesc2024} {code_forecasts}."],
        ["Demand charges", "Known: they are part of the tariff {code_forecasts}."],
        ["Cars", "Unknown until they plug in; then departure and energy are known, as if the driver had entered them in an app {code_forecasts}."],
      ] },
      { kind: "p", text: "These are simple forecasts, deliberately: they are what any home system can do without a forecasting service. Better forecasts would close part of the gap; see 'Forecasting'. The engine hands realistic forecasts eight days of data from before the run (HISTORY_DAYS), so persistence and the scenario replays have a history from step 0 {code_engine}." },
      { kind: "h", text: "The value of knowing the future" },
      { kind: "p", text: "Run the same controller twice, once with perfect and once with realistic forecasts, and the difference is what perfect information would be worth to that controller. Stochastic programming calls the best-case version of this the expected value of perfect information (EVPI); Birge's companion measure, the value of the stochastic solution (VSS), asks how much better a plan that accounts for uncertainty does than one that plans for a single average forecast {gc_birge1982}. Site Lab's full-year study gives both kinds of number. Per home, cost including wear, realistic minus perfect {runs_2026_11e} {gc_calc}:" },
      { kind: "facts", rows: [
        ["Self-consumption rule", "-1 to +2 € a year: it barely uses the future at all {runs_2026_11e} {gc_calc}."],
        ["Plain MPC (wear priced)", "149 to 232 € a year: the plan trusts its forecast, and pays for it {runs_2026_11e} {gc_calc}."],
        ["Hybrid MPC", "86 to 154 € a year {runs_2026_11e} {gc_calc}."],
        ["Cautious MPC", "5 to 22 € a year: almost immune to forecast error {runs_2026_11e} {gc_calc}."],
      ] },
      { kind: "p", text: "And the ceiling: with perfect forecasts, the wear-priced MPC beat the realistic-forecast rule by €35 to €139 a year per home (median cost including wear €1,050 against €1,160). That is the most any smarter controller could have gained on these homes and this tariff, and it is small compared with what the battery itself saves (the rule saved a median €336 a year against battery idle) {runs_2026_11e} {gc_calc}. A forecast that loses €149 to €232 throws away more than the whole ceiling, which is exactly what happened." },
      { kind: "h", text: "Where the plain plan loses" },
      { kind: "p", text: "On the one-week case (German home, June, 15-minute steps), switching one ingredient at a time back to perfect recovered €2.33 with perfect solar, €1.87 with cars known in advance, €0.68 with perfect load and nothing with perfect prices, which are published in time {runs_2026_11d}. The mechanism is always the same: a plan that trusts its forecast exports midday solar it believes it will not need, then meets a cloudier afternoon or an unannounced evening car with a battery that is less full. The rule stores all spare solar anyway and is robust by accident." },
      { kind: "h", text: "Three ways to plan under uncertainty" },
      { kind: "math", tex: String.raw`\begin{aligned}
\text{deterministic (certainty equivalence):}\quad & \min_x\ J(x, \hat\xi) \\[10pt]
\text{stochastic (scenarios):}\quad & \min_x\ \tfrac{1}{S} \textstyle\sum_{s=1}^{S} J(x, \xi_s) \\[10pt]
\text{robust:}\quad & \min_x\ \max_{\xi \in \Xi}\ J(x, \xi)
\end{aligned}`,
        caption: String.raw`\(x\) the decisions, \(J\) the cost of chapter 16, \(\xi\) the uncertain inputs (load, solar, prices, cars). Deterministic planning uses one forecast \(\hat\xi\) and relies on re-planning. Stochastic planning minimises the average over sampled futures \(\xi_s\). Robust planning minimises the worst case over an uncertainty set \(\Xi\) {mesbah2016} {campi2009} {bertsimas2004}.` },
      { kind: "list", items: [
        "Deterministic MPC is what chapter 16 builds with one scenario. It is cheap and, with frequent re-planning, often good enough; its weakness is that the plan never hedges {code_mpc}.",
        "Stochastic MPC brings the probability of disturbances into the optimisation itself {mesbah2016}; the scenario approach designs controllers from a finite set of sampled scenarios {campi2009}. In energy, one study cut a company's peak grid draw by a further 99 kW (5.8%) against standard MPC with a stochastic, constraint-tightened formulation {li2025smpc}.",
        "Robust optimisation plans for the worst case. Bertsimas and Sim made the conservatism tunable (at most a chosen number of inputs deviate at once) while keeping the problem linear; the price is a worse result when the forecast is right {bertsimas2004}. For a home battery that means holding back energy that would have been worth using on most days.",
      ] },
      { kind: "p", text: "A fourth option sits outside this list: keep a deterministic planner but change how it reacts to error. That is what worked in Site Lab." },
      { kind: "h", text: "Attempt 1: scenarios replayed from recent days" },
      { kind: "p", text: "Site Lab's scenario MPC (chapter 16) planned for three futures replayed from the last three days, committing only to the next hour. Over the full year it saved a median €225 a year against battery idle, wear included: no better than planning for one forecast (€239) and below the rule (€335) {runs_2026_11e}. It bought less energy than the single-forecast MPC but cycled the battery more (€354 of wear against €303, median) {runs_2026_11e}. Our reading, not proven: three replayed days are a weak picture of what tomorrow can bring, and averaging over them still let each scenario's plan count on energy it would not get." },
      { kind: "h", text: "Attempt 2: the rule with a plan on top" },
      { kind: "p", text: "The hybrid execution mode follows the self-consumption rule and lets the plan only add to it. It saved a median €216 a year, also below the rule: the reserves it held back on the strength of wrong forecasts cost more than storing all solar won back {runs_2026_11e}. Its sensitivity to forecasts was smaller than the plain MPC's (86 to 154 € a year) but still large {gc_calc}." },
      { kind: "h", text: "What worked: the cautious planner" },
      { kind: "p", text: "An hour-by-hour look at the June week showed that much of the loss came not from the forecast itself but from how the plan reacted to it {runs_2026_11g}. The four habits of chapter 16 address exactly those reactions: use the meter for the present, never let the battery trade extra with the grid to cover an error, do not hoard energy whose use costs wear, and store at the first chance when later is only a forecast {code_mpc}." },
      { kind: "p", text: "How it was chosen matters as much as the result. The design was fixed on a tuning set: the study's four homes paired with four other drivers, four 28-day windows (November, February, May, August), realistic forecasts. Sum of the 16 runs, cost including wear {runs_2026_11g}:" },
      { kind: "facts", rows: [
        ["Rule", "€2,039 {runs_2026_11g}."],
        ["MPC, plain plan", "€2,238 {runs_2026_11g}."],
        ["+ habits 1 and 2", "€2,113 {runs_2026_11g}."],
        ["+ habit 3", "€2,058 {runs_2026_11g}."],
        ["+ habit 4 = cautious", "€2,004 (energy alone fell from €1,788 to €1,565 with this habit) {runs_2026_11g}."],
        ["MPC with perfect forecasts, plain plan", "€1,973: the ceiling on this set {runs_2026_11g}."],
      ] },
      { kind: "p", text: "Then it was tested once on the study's own homes and drivers over the full year: €1,108 a year including wear (median), against €1,160 for the rule, €1,229 for the plain MPC and €1,230 for the hybrid; better than the rule in all four homes, by €20 to €65 a year {runs_2026_11e} {runs_2026_11g}. It also ran about twice as fast as the plain MPC (80 to 122 seconds per home-year, against 187 to 265) {runs_2026_11e}. Measured against the gap between the rule (€1,160) and perfect foresight (€1,050), the cautious planner closed about half (52 of 110 € in medians) {gc_calc}." },
      { kind: "note", tone: "warn", text: "Read with care. Only the drivers differ between tuning and test: home loads, weather and prices are the same series, and the test year contains the tuning windows. Four homes, one tariff, one equipment size. And cautious is not best over the battery's life: with perfect forecasts the plain plan is cheaper including wear (€1,050 against €1,097), because storing early ages the battery {runs_2026_11g}." },
      { kind: "h", text: "Why something this simple works here" },
      { kind: "p", text: "Chapter 13's arithmetic: with this tariff a stored kWh replaces an import of about 31 to 38 ct and gives up an export of 7.86 ct, so storing beats exporting by 6 to 12 ct after wear, whatever happens {gc_calc}. When one action is right in almost every future, planning for many futures adds little, and a plan that sometimes deviates from that action on a wrong forecast loses. Planning under uncertainty should matter more where a wrong guess is expensive: a small grid connection, a demand charge (one bad quarter-hour sets the month's bill), or a tariff where exporting pays nearly as much as importing costs {runs_2026_11g}. Those are the next tests, not results." },
    ],
  },
  {
    id: "g-judging", section: "guide", title: "18. Judging controllers fairly, and what comes next",
    summary: "How Site Lab compares controllers without fooling itself: baselines, paired savings, full years and several homes, wear included, a tuning set kept apart, a check against published results, and the limits. Then the results so far and the next steps.",
    blocks: [
      { kind: "p", text: "It is easy to make any controller look good. Pick a sunny week, a tariff that suits it, a perfect forecast, and leave out battery wear. This chapter lists the rules Site Lab follows to avoid that, shows how each appears in the code and the results files, and ends with what the results so far say and what comes next. The short version is on 'Judging controllers fairly' in the control-theory section." },
      { kind: "h", text: "Rule 1: a baseline, and paired comparisons" },
      { kind: "p", text: "Every number needs a reference. In the app, every run is repeated with the battery idle and every car charging at full power on arrival: the same equipment without smart control {code_engine}. The study runner, src/emsbench/study.py, does the same with an explicit 'idle' controller (battery idle, car as fast as possible) and reports each controller's saving against the same home with the battery idle {gc_study}. Pairing matters: the four homes' bills range from €614 to €2,300 a year with the battery idle, so comparing averages across homes would drown the controller in the differences between households {runs_2026_11e}." },
      { kind: "p", text: "Worked example, home residential2 with its driver, realistic forecasts: idle costs €995.72 a year including wear, the rule €522.89, so the rule's paired saving is €472.83, the largest of the four homes (the summary's '473') {runs_2026_11e} {gc_calc}." },
      { kind: "h", text: "Rule 2: an upper bound" },
      { kind: "p", text: "The same optimiser with perfect forecasts shows the most any controller could achieve on this site with this model. It is a ceiling, not a rival: a perfect-forecast MPC beat the rule in every home, while the same MPC with realistic forecasts lost to it in every home {runs_2026_11e}. Reporting the ceiling next to the realistic result shows how much of the possible gain a controller captures, and stops anyone from comparing a perfect-forecast simulation with a real product." },
      { kind: "h", text: "Rule 3: full years, several homes, ranges" },
      { kind: "p", text: "One week is an anecdote; the study.py docstring says so in its first lines {gc_study}. The study runs a full year (November 2025 to October 2026, hourly) for four measured German homes from Open Power System Data, each paired with a measured Norwegian driver (SINTEF), and reports the median and the range (minimum to maximum) across homes {gc_study} {runs_2026_11e}. The ranking can differ between a week and a year: in the June week the rule beat the perfect-forecast MPC on energy alone (€11.57 against €12.32), while over the year the perfect-forecast MPC was cheaper on energy in every home {runs_2026_11d} {runs_2026_11e}." },
      { kind: "h", text: "Rule 4: count wear" },
      { kind: "p", text: "Every run is scored with BLAST-Lite: the run's state-of-charge pattern is repeated until the battery reaches 80% of its capacity (or 40 years), and the run is charged the share of the battery's replacement value it used {code_wear} {blast_lite}. Wear is not small: the rule's battery wear was about €374 a year (median), more than half of its €672 median energy saving {runs_2026_11e}. And it can change the winner: on the June week, the wear-blind MPC earned the most on energy but cycled hardest, and pricing wear made it €0.43 better in total {runs_2026_11d}." },
      { kind: "note", tone: "info", text: "A detail in runs.csv: the idle battery's wear is about €0.14 a year and its life is capped at 40 years, because the idle baseline starts empty (CityLearn's default initial charge of 0) and in the LFP model an empty battery barely ages. Wear savings against 'idle' therefore look slightly too good; 'Limits: what Site Lab simplifies' explains {runs_2026_11e} {code_model}." },
      { kind: "h", text: "Rule 5: keep the tuning set apart" },
      { kind: "p", text: "When a controller has knobs, tuning them on the test data guarantees a flattering result. The cautious MPC was designed on a separate tuning set (other drivers, four 28-day windows) and its design was fixed before the full-year test was run, as README_cautious.md records {runs_2026_11g}. The split is imperfect, and the file says so: only the drivers differ; loads, weather and prices are shared {runs_2026_11g}. Stating the imperfection is part of the method." },
      { kind: "h", text: "Rule 6: check the simulator against published results" },
      { kind: "p", text: "A comparison is only as good as the simulator underneath. src/emsbench/validate.py reproduces the setup of a published HTW Berlin study (1 kWp of solar and 1 kWh of battery per MWh of demand, a self-consumption rule) on the same four homes {code_validate} {weniger2014}:" },
      { kind: "facts", rows: [
        ["Without battery", "Self-consumption 32% and self-sufficiency 33% (median, ours); published about 30% and 30% {code_validate} {weniger2014}."],
        ["With 1 kWh per MWh", "62% and 58% (ours); published 59% and 56% {code_validate} {weniger2014}."],
        ["Battery cycles per year", "219 (ours); published about 270 {code_validate} {weniger2014}."],
      ] },
      { kind: "p", text: "Close enough to trust comparisons between controllers, not close enough to promise any single home's numbers. The engine is also checked against CityLearn for a home without a battery, to five significant digits, in an automated test {code_engine}." },
      { kind: "h", text: "Rule 7: say what is the same for everyone" },
      { kind: "p", text: "Some numbers do not depend on the controller and must not be read as if they did. In the study, cars left short by 24.7 to 217.1 kWh a year with every controller, including idle with the car charging at full power on arrival: some recorded visits ask for more than an 11 kW charger can deliver before departure. That shortfall comes from the data {runs_2026_11e}." },
      { kind: "h", text: "The results so far, in one table" },
      { kind: "p", text: "Full year, four homes, realistic forecasts, cost including wear, median (range), and saving against battery idle {runs_2026_11e}:" },
      { kind: "facts", rows: [
        ["Rule (self-consumption + cheapest hours)", "€1,160 (403 to 2,014); saves €335 {runs_2026_11e}."],
        ["MPC, wear-blind", "€1,231 (415 to 2,235); saves €239 {runs_2026_11e}."],
        ["MPC, wear priced", "€1,229 (430 to 2,211); saves €239 {runs_2026_11e}."],
        ["MPC, 3 scenarios", "€1,243 (450 to 2,255); saves €225 {runs_2026_11e}."],
        ["MPC, hybrid", "€1,230 (479 to 2,165); saves €216 {runs_2026_11e}."],
        ["MPC, cautious", "€1,108 (352 to 1,993); saves €365 {runs_2026_11e}."],
        ["Ceiling: MPC wear priced, perfect forecasts", "€1,050 (281 to 1,979); saves €399 {runs_2026_11e}."],
      ] },
      { kind: "p", text: "Three conclusions, each with its limit. A home battery mostly earns by storing midday solar for the evening, and a two-line rule captures most of that. Perfect foresight is worth only about €100 a year more on this home and tariff. And how a plan reacts to forecast error matters more than how many futures it considers: the cautious habits beat both the scenario MPC and the hybrid {runs_2026_11e} {runs_2026_11g}. This agrees with field evidence that rules and MPC can end within 0.6% of each other on real house hardware {ruddick2024}, and with the CityLearn Challenge finding that hybrid approaches combining forecasting, optimisation and learning do well {nagy2025}." },
      { kind: "h", text: "What Site Lab does not yet test" },
      { kind: "list", items: [
        "Other tariffs and sites: demand charges, small connections, an export price close to the import price. Chapter 17 argues these are where planning should matter more; that is a hypothesis {runs_2026_11g}.",
        "Better forecasts: probabilistic forecasts and models better than 'yesterday again', and a sweep that degrades forecasts step by step; see 'Roadmap: bringing their ideas into Site Lab'.",
        "Real-world imperfections: estimated rather than exact battery charge, standby losses, delays and hysteresis; see 'Limits: what Site Lab simplifies' {code_engine}.",
      ] },
      { kind: "h", text: "What comes next: learning-based control" },
      { kind: "p", text: "Reinforcement learning (RL) learns a policy by trial and error instead of solving an optimisation each step; the formulation is the Markov decision process of the standard textbook {suttonbarto2018}. It is the last item on the project's list for a reason: model-free RL explores with largely random decisions that can violate safety constraints, so deploying it without safety mechanisms is considered unacceptable {yu2024saferl}, and on real house hardware an RL agent still in training cost 25.5% more than rules, decision trees and MPC {ruddick2024}. In Site Lab an RL agent would plug in exactly where the rules and the MPC do: it receives the Observation, returns an Action, and the safety layer stays underneath {code_ctrl} {code_engine}. The fairness rules above apply unchanged: same baseline, same years and homes, wear included, realistic information, a separate tuning set. See 'Reinforcement learning'." },
      { kind: "h", text: "What comes next: many sites at once" },
      { kind: "p", text: "A virtual power plant (VPP) aggregates many homes and controls them centrally, distributed or in a hybrid way, across day-ahead, intraday and real-time time scales {huang2026vpp}. The fleet layer that would bring this into Site Lab (sampled homes, an aggregator controller, fleet measures such as delivered against promised flexibility) is a proposal awaiting a decision; see 'Roadmap: bringing their ideas into Site Lab' and 'Residential energy at four scales'. One lesson from this Part carries over directly: when many homes respond to the same price signal at once, they can create a new peak instead of shaving one, as the shared-garage example on 'EV smart charging' shows. At fleet scale, coordination becomes the control problem." },
      { kind: "note", tone: "info", text: "Reproduce the study: python -m emsbench.study (options --days for a quick check, --controllers and --forecasts for subsets, --merge to add rows to an existing runs.csv); results land in results/study_home_de as runs.csv and summary.md {gc_study}." },
    ],
  },
];

export const GUIDE_CONTROL_SOURCES: Source[] = [
  // ---------- The complete guide, Part 3 (checked 2026-11-12) ----------
  { id: "gc_calc", title: "Guide, Part 3: our arithmetic on the code, the data and the study results", read: "data",
    note: "Wear price: emsbench.sim.wear.wear_price_per_kwh(1200, 'lfp', 25 °C, end of life 0.8) = 0.148 EUR/kWh (capacity lost to cycling 2.47e-5 per full cycle; NMC: 0.486). Prices: profile ec/de_lu_da plus the study's adder of 0.26685 EUR/kWh, Nov 2025 - Oct 2026, hourly: mean 0.378; median daily cheapest hour 0.315 and dearest 0.436; median cheapest price in the next 24 h 0.312; buying at the daily minimum and replacing an import at the daily maximum pays after 90% round-trip losses on 95% of days and after losses plus wear (0.074 per kWh in and out) on 24%. Per-home differences: results/study_home_de/runs.csv. LP size counted from sim/mpc.py for configs/sites/plan_home_de_ev.yaml. Other examples are simple arithmetic shown on the page with example values." },
  { id: "gc_lp_check", title: "Guide, chapter 15: the two-hour charging LP, solved by hand and checked with SciPy", read: "data",
    note: "min 0.20 x1 + 0.30 x2 s.t. x1 + x2 >= 9, 0 <= x1 <= 6, 0 <= x2 <= 7: scipy.optimize.linprog (HiGHS) gives (6, 3), cost 2.10, marginals 0.30 (need) and 0.10 (hour-1 bound). With a 4.14 minimum on both hours, Site Lab's _LP class (relax-and-fix) and its exact MILP both give (4.86, 4.14), cost 2.214. Peak example: loads 3 and 5 kW, 2 kWh battery, minimum peak 3 kW (linprog)." },
  { id: "gc_study", title: "Site Lab study runner: src/emsbench/study.py (homes, drivers, controllers, paired savings)", read: "code" },
  { id: "gc_scipy_linprog", title: "scipy.optimize.linprog documentation (method='highs', dual values / shadow prices)", venue: "SciPy documentation",
    read: "docs", url: "https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linprog.html",
    note: "'highs' (default) chooses automatically between HiGHS dual revised simplex (highs-ds) and interior point with crossover (highs-ipm); marginals are 'AKA dual values / shadow prices / Lagrange multipliers'." },
  { id: "gc_scipy_milp", title: "scipy.optimize.milp documentation (mixed-integer linear programming with HiGHS)", venue: "SciPy documentation",
    read: "docs", url: "https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.milp.html",
    note: "Wraps HiGHS; options time_limit and mip_rel_gap (stop when the gap between the best solution and the dual bound, relative to the objective, is at most this value; default 1e-4); solves nodes (linear program relaxations)." },
  { id: "gc_highs", title: "Parallelizing the dual revised simplex method", authors: "Huangfu, Hall", year: 2018,
    venue: "Mathematical Programming Computation 10(1), 119-142", url: "https://doi.org/10.1007/s12532-017-0130-5", read: "metadata",
    note: "Cited by the SciPy documentation as the reference for HiGHS's simplex solver; paper not read here." },
  { id: "gc_dantzig", title: "Linear Programming and Extensions", authors: "Dantzig", year: 1963, venue: "Princeton University Press",
    read: "metadata", note: "Classic text on linear programming and the simplex method; cited for the general idea only, not re-read here." },
  { id: "gc_birge1982", title: "The value of the stochastic solution in stochastic linear programs with fixed recourse", authors: "Birge",
    year: 1982, venue: "Mathematical Programming 24, 314-325", url: "https://doi.org/10.1007/BF01585113", read: "metadata",
    note: "Cited for the definitions of the value of the stochastic solution and its relation to the value of perfect information; paper not re-read here." },
];
