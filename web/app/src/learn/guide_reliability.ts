// The complete guide (reliability): chapters 20-23, after chapter 19 "Contracts and reliability in Site Lab".
// How Site Lab plans a battery and a contract, keeps the limit under forecast uncertainty (chance-constrained MPC),
// models devices that are less ideal than the controller believes, and an example depot built on open data.
// Same rules as pages.ts: every {id} must exist in a source list; statements are backed by a cited source, by this
// repository's code, or by our own runs (labelled as such, with a date). Background lives in part 1 and is linked,
// not repeated. LaTeX lives in String.raw strings only.
import type { Page } from "./pages";
import type { Source } from "./sources";

export const GUIDE_RELIABILITY_PAGES: Page[] = [
  // ------------------------------------------------------------------ 20. The size & contract planner
  {
    id: "g-planner", section: "guide", title: "20. Choosing a battery and a contract: the planner",
    summary: "The 'Size & contract' tab: what each run is, how to read the cost against days-kept chart and its front, the service-level rule for car energy, how the recommendation is chosen, and why days kept is a count over one year, not a probability.",
    blocks: [
      { kind: "p", text: "In plain words: before signing a flexible grid contract, a site wants to know which battery and which contract level give an acceptable cost and an acceptable risk of breaking the limit. Part 1 explains why sizing should be answered this way, battery and contract chosen together ([Section 8.1](#learn-planning-and-sizing-under-uncertainty/s8-1)), and why a promise of the form 'the limit holds on at least 90% of days' is the useful one ([Section 4.2](#learn-quantifying-flexibility-under-uncertainty/s4-2)). This chapter explains the Site Lab tool that puts it into practice: the 'Size & contract' tab next to Charts and Compare {gr_code_planner}." },

      { kind: "h", text: "What the planner runs" },
      { kind: "p", text: "The planner takes the site on screen and makes copies of it, one for every combination of a battery size and a contract option, then simulates each copy over the same period. Every run is an ordinary simulation: same data, same control strategy, same forecasts, same wear model. Nothing in the planner adds a price or a parameter of its own {gr_code_planner}." },
      { kind: "facts", rows: [
        ["Battery sizes", "Typed as a list of kWh. The default is 0, ½, 1, 1.5 and 2 times today's capacity (just 0 for a site without a battery). Every battery is scaled to the new total and keeps its power per kWh (its C-rate); 0 removes the battery; a site without one gets a battery with the catalog's default settings {gr_code_planner} {code_model}."],
        ["Contract options", "Today's contract, the firm limit with no windows, and the windows' reduced limit at other percentages of today's value (default 80% and 120%). A site without windows varies its firm limit instead. These are variants to explore, not offers: a grid operator decides which contracts exist and what they cost {gr_code_planner}."],
        ["Size of a plan", "At most 4 contract options (so the chart can tell them apart) and 30 runs; runs go two at a time, like the Compare tab. Stopping keeps the runs that finished {gr_code_planner}."],
        ["Cost", "Cost including battery wear when wear is priced, otherwise the energy bill (with a warning, because a bigger battery then looks free). Wear is the share of the battery's replacement value the period used up; see [chapter 3](#learn-g-batteries). It is not an investment case: no financing, installation or contract fee {gr_code_planner} {code_wear}."],
      ] },

      { kind: "h", text: "Reading the chart" },
      { kind: "p", text: "Each run is one point: cost across, days kept up. Colour and marker shape say which contract, the label says the battery size. A dashed line marks the reliability target (default 90% of days). The solid line joins the front: the runs for which no cheaper run keeps the limit on as many days or more {gr_code_planner}. Up and to the left is better; a point below and to the right of the line is beaten on both counts by a point on it." },
      { kind: "p", text: "How the front is found, step by step: sort the runs by cost; walk from the cheapest; keep a run only if it keeps the limit on more days than every cheaper run kept. Illustrative numbers, not a run: A costs 100 and keeps 85% of days, B 104 and 96%, C 106 and 93%, D 110 and 99%. A is kept (cheapest), B is kept (more days than A), C is dropped (dearer than B and fewer days), D is kept. The front A-B-D shows what each extra share of kept days costs: 4 for the step from 85% to 96%, 6 more for 99% {gr_code_planner}." },
      { kind: "math", tex: String.raw`\text{run } i \text{ is on the front} \iff \text{no run } j \text{ has } c_j \le c_i \text{ and } k_j \ge k_i \text{ (with one of them strict)}`,
        caption: String.raw`\(c\) cost, \(k\) share of days kept. This is a Pareto front with two goals; the code sorts by cost and keeps each run that raises the best \(k\) so far {gr_code_planner}.` },

      { kind: "h", text: "The service-level rule: the cars must get their energy" },
      { kind: "p", text: "Chapter 19 showed a catch: the engine always protects the limit by slowing the cars, so a contract can look reliable because the drivers paid for it in energy they did not get {code_engine}. The planner therefore applies a service-level rule. An option counts as feasible only if the car energy left undelivered at departure is at most a tolerance, by default 1% of what the cars asked for (asked for = delivered + left short). Options above the tolerance stay in the table and the chart, greyed out with the reason, but they cannot be recommended and are not on the front {gr_code_planner}." },
      { kind: "note", tone: "warn", text: "The 1% is the owner's choice, a setting that stands for the promise made to drivers. It is not a sourced number and not an industry standard. Change it in the tab to match the promise you want to test {gr_code_planner}." },
      { kind: "p", text: "Before choosing a tolerance, look at the floor: the shortfall the site has with no limit at all. Plan mode runs in hours, so each stay is shortened to whole hours (arrival rounded up, departure down), and some visits ask for more than their charger can deliver in that time {gr_cfg_depot}. Our runs of 22 November 2026 {gr_runs_floor}:" },
      { kind: "facts", rows: [
        ["Time-block car park, no limit at all", "1,746 kWh short of 62,132 kWh asked for: 2.8% {gr_runs_floor}."],
        ["Time-block car park, as shipped (peak shaving)", "2,006 kWh short: 3.2% {gr_runs_floor}."],
        ["Fleet depot, no limit at all", "1,070 kWh short of 20,157 kWh: 5.3% {gr_runs_floor}."],
        ["Fleet depot, as shipped (peak shaving)", "1,074 kWh short: 5.3% {gr_runs_floor}."],
      ] },
      { kind: "p", text: "So on both EV examples, at hourly steps, no option can meet the default 1%: the floor alone is above it. That is not the contract's fault. Either set the tolerance a little above the floor (for example, 'at most 0.5 points worse than no limit'), or read the 'EV served' column against the floor rather than against zero {gr_runs_floor}." },

      { kind: "h", text: "How the recommendation is chosen" },
      { kind: "steps", items: [
        "Among the feasible options, the cheapest one that meets the reliability target is recommended, with its cost and days kept {gr_code_planner}.",
        "If a cheaper option met the target only by delivering less car energy, the text also names the option with the least shortfall and its cost, so the two can be weighed {gr_code_planner}.",
        "If no option meets the target, the most reliable one is named instead; ties go to the cheaper {gr_code_planner}.",
        "Today's set-up (current battery, current contract) is always shown underneath for comparison {gr_code_planner}.",
      ] },
      { kind: "p", text: "Each row has an Open button that makes that variant the site and result on screen, so you can inspect its charts and days in detail {gr_code_planner}." },

      { kind: "h", text: "What the planner cannot tell you" },
      { kind: "list", items: [
        "Days kept is a count over one replay of the simulated period, not a probability with a confidence range. 'Kept on 92% of days' counts those days of that year; another year of weather, prices or cars would give another count, and one or two days can move an option across the target {gr_code_planner} {gc_code_reliability}.",
        "The days of one year are not independent samples (seasons, weekdays), so the count cannot simply be turned into a probability. That needs many simulated years or scenarios, which the planner does not run yet {gc_code_reliability}.",
        "The answer is only as good as the controller behind it. With perfect forecasts the controller knows the future and batteries look more capable than they will be ([Section 8.3](#learn-planning-and-sizing-under-uncertainty/s8-3)); plan with realistic forecasts. On the time-block car park the same MPC kept 365 days with perfect and 341 with realistic forecasts {gc_runs_timeblock}.",
        "Contract options are scaled versions of today's contract, not real offers, and the cost has no contract fee or investment cost {gr_code_planner}.",
      ] },
      { kind: "note", tone: "info", text: "Try it in the live app: open #plan_ev_timeblock_nl-run, open the 'Size & contract' tab and run the default plan (5 sizes × 3 contracts = 15 year-long runs). Set the battery strategy to MPC with realistic forecasts first for a fairer answer; it takes longer." },
    ],
  },

  // ------------------------------------------------------------------ 21. Chance-constrained MPC
  {
    id: "g-chance", section: "guide", title: "21. Keeping the promise: the chance-constrained MPC",
    summary: "How Site Lab's MPC plans against a limit lowered by a safety margin learned from its own past forecast errors, why 29 days of history give 95% confidence for a 90% target, what it achieved on the time-block car park, and why a per-hour margin over-delivers on a per-day promise.",
    blocks: [
      { kind: "p", text: "In plain words: the cautious MPC of chapter 16 plans as if its forecast were right, then reacts carefully when it is not. On the time-block car park that kept the limit on fewer days than the simple peak-shaving rule (341 against 350) {gc_runs_timeblock}. The chance-constrained MPC adds one idea: plan against a limit that is a little lower than the real one, by a margin sized so that the real limit holds on the target share of days. Part 1 explains the theory: chance constraints and constraint tightening in [Section 7.2](#learn-optimisation-and-control-under-uncertainty/s7-2), and the scenario approach in [Section 4.2](#learn-quantifying-flexibility-under-uncertainty/s4-2). Select it with MPC execution = chance {code_model} {gr_code_uncertainty}." },

      { kind: "h", text: "Step 1: a forecast that grades itself" },
      { kind: "p", text: "The MPC cannot move the building load or the solar output, only the battery and the cars. So the uncertainty that matters is the net load, load minus solar. Every hour, a real controller can compare what the net load turned out to be with what its realistic forecast said (chapter 17: yesterday's load, the day-ahead solar forecast). Site Lab keeps those errors, and for each clock time collects the errors at that time over recent days. That collection is an empirical distribution: no bell curve is assumed, only the errors actually seen. Only errors observed before the moment of planning are used, never later ones {gr_code_uncertainty}." },
      { kind: "p", text: "Adding a quantile of these errors to the point forecast gives a quantile forecast: 'on 90% of the last 28 days, the net load at 10:00 was at most this much above the forecast'. This is the data-driven, distribution-free idea of Babic and colleagues, whom part 1 cites for chance constraints trained on about three weeks of data {gr_code_uncertainty} {gr_babic2023}. Site Lab uses 28 days so every weekday appears four times; that number is our choice {gr_code_uncertainty}." },

      { kind: "h", text: "Step 2: the margin, from the scenario approach" },
      { kind: "p", text: String.raw`For each hour of the plan, the margin \(b_h\) is the largest error at that clock time over the last \(N\) days. The plan then has to keep its import below the real limit minus that margin. The current step is metered, so it has no margin {gr_code_uncertainty} {code_mpc}.` },
      { kind: "math", tex: String.raw`g^{+}_k \;\le\; L_k - b_{h(k)} + o_k, \qquad b_h = \max\!\big(0,\ \max_{d = 1 \dots N} e_{h,d}\big), \qquad N = \Big\lceil \frac{\ln(1 - \beta)}{\ln(1 - \varepsilon)} \Big\rceil`,
        caption: String.raw`\(g^{+}_k\) planned import at future step \(k\), \(L_k\) the contract limit, \(o_k\) the soft-constraint slack of chapter 16, \(e_{h,d}\) the net-load error at clock time \(h\) on the day \(d\) days back, \(\varepsilon = 1 -\) target, \(\beta\) the confidence (mpc_chance_confidence, default 0.95). For a convex problem with one decision variable (here: one margin per clock time), the chance that a margin covering all \(N\) sampled days fails on more than a share \(\varepsilon\) of new days is at most \((1-\varepsilon)^N\) {gr_code_uncertainty} {gr_campi_handbook} {campi2009}.` },
      { kind: "h", text: "Worked example: why 29 days" },
      { kind: "steps", items: [
        String.raw`Target 90% of days, so \(\varepsilon = 0.1\) and \(1 - \varepsilon = 0.9\). Confidence 95%, so we need \(0.9^N \le 1 - 0.95 = 0.05\) {gr_code_uncertainty}.`,
        String.raw`Take logarithms: \(N \ge \ln(0.05) / \ln(0.9) = (-2.996) / (-0.1054) = 28.4\). Round up: \(N = 29\) days {gr_calc}.`,
        String.raw`Check: \(0.9^{29} \approx 0.047\), below 0.05. One day fewer would not do: \(0.9^{28} \approx 0.052\) {gr_calc}.`,
        String.raw`Read it as: if days were independent and alike, the chance that the margin built from 29 days fails on more than 10% of new days is at most 4.7%. With 50% confidence the same rule gives 7 days; with 99.9%, 66 days, the example in part 1's Section 4.2 {gr_calc} {gr_runs_chance}.`,
      ] },
      { kind: "p", text: "Why one margin per clock time and not the whole plan as the decision? The scenario bound grows with the number of decision variables. A plan has hundreds of them, so it would need hundreds of sampled days; one number per clock time needs only 29 {gr_runs_chance}. The margin works by keeping energy back rather than by importing less now: the plan treats future hours as if the load came in high, so it keeps the battery charged for them and lets cars that can wait charge later. The problem stays the same size; the run took 7% longer {gr_runs_chance}." },

      { kind: "h", text: "What it achieved on the time-block car park" },
      { kind: "p", text: "Full year from 6 October 2025, hourly, 110 kW on working days 08:00-12:00 and 250 kW otherwise (illustrative contract), 150 kWh / 75 kW battery, 20 chargers, realistic forecasts for the MPCs. Our runs, results/chance_mpc/README.md, 22 November 2026 {gr_runs_chance}:" },
      { kind: "facts", rows: [
        ["Peak-shaving rule (as shipped)", "350 of 365 days kept (95.9%); 366 kWh over the limit; €175,593 a year including €2,263 of wear; 2,006 kWh of car energy undelivered {gr_runs_chance}."],
        ["MPC cautious", "341 days (93.4%); 618 kWh over; €169,562 incl. €2,368 wear; 3,985 kWh undelivered {gr_runs_chance}."],
        ["MPC chance, 95% confidence (N = 29, the default)", "364 days (99.7%); 26 kWh over; €171,378 incl. €2,571 wear; 2,772 kWh undelivered {gr_runs_chance}."],
        ["MPC chance, 50% (N = 7) and 99.9% (N = 66)", "362 and 364 days; €171,193 and €171,427; 2,820 and 2,825 kWh undelivered. The confidence setting barely matters here {gr_runs_chance}."],
        ["Bound: MPC cautious, perfect forecasts", "365 days; nothing over; €170,361; 1,797 kWh undelivered {gr_runs_chance}."],
      ] },
      { kind: "p", text: "So the chance MPC is the first controller in Site Lab to keep the limit on more days than the rule, and it is 2.4% cheaper than the rule including wear. The cost: 38% more car energy undelivered than the rule (2.8 against 2.0 MWh, about 4.5% of what the cars asked for). Against the cautious MPC it costs 1.1% more and delivers more car energy {gr_runs_chance}. Most of the extra shortfall is in cars that leave inside the morning window: 1,347 kWh in 132 sessions for cars leaving by 12:00, against 795 kWh in 114 sessions with the rule. The README's guess, not verified: the MPC learns about each car only when it plugs in and, with the margin, holds the battery for later in the window instead of spending it on a car that leaves at 11:00 {gr_runs_chance}." },
      { kind: "p", text: "On the apartment block example (80 kW firm limit) every controller kept the limit on all 365 days, so the chance constraint had nothing to fix: it cost 0.6% more than the cautious MPC {gr_runs_chance}." },

      { kind: "h", text: "Was the forecast honest? Calibration" },
      { kind: "p", text: "Every run with realistic forecasts now reports two checks {code_engine} {gr_code_uncertainty}:" },
      { kind: "facts", rows: [
        ["Quantile forecast exceeded", "The share of steps on which the actual net load was above the 90% quantile forecast made a step earlier. Expected: 10%. On the car park: 8.4%, slightly cautious. On the apartment block: 10.5% {gr_runs_chance}."],
        ["Margin exceeded (chance MPC only)", "The share of steps on which the error was larger than the margin. Allowed: 10%. On the car park: 3.1%; for independent days the theory expects about 1/30 = 3.3% {gr_runs_chance}."],
      ] },

      { kind: "h", text: "Why a per-hour margin over-delivers on a per-day promise" },
      { kind: "p", text: "The target was 90% of days; the chance MPC kept 99.7%. Three reasons, the first from the theory, the other two our reading of how the margin is used {gr_runs_chance} {gr_code_uncertainty}:" },
      { kind: "steps", items: [
        String.raw`The guarantee is a worst case. '\((1-\varepsilon)^N \le 5\%\)' bounds how often the margin can fail badly. For alike, independent days, the chance that a new day's error beats the largest of \(N\) earlier ones is only \(1/(N+1)\): 1/30, about 3.3%, for \(N = 29\). The run measured 3.1% {gr_runs_chance}.`,
        "The margin for each hour is that hour's worst day, and the worst days differ from hour to hour. The plan therefore prepares for a morning made of the worst 08:00 of the last 29 days, plus the worst 09:00, plus the worst 10:00, and so on: a morning worse than any real one. A promise about days only needs to survive real days {gr_runs_chance}.",
        "A margin exceeded is not a limit broken. When the error is larger than the margin, the battery may still have energy to spare, and the safety layer slows the cars before it records an excess {code_engine}.",
      ] },
      { kind: "p", text: "A day-level margin (a joint chance constraint, which sizes one margin for the whole window of a day) could give back some of the cost and car energy. It is not built {gr_runs_chance}." },

      { kind: "h", text: "Limits" },
      { kind: "list", items: [
        "One business site with an illustrative contract, one year, one battery size. The design and defaults were fixed before the full-year run, but the site is the one the question was asked on, so it is not a holdout test {gr_runs_chance}.",
        "Only the net load is treated as uncertain. Cars are not forecast at all until they plug in, so car uncertainty shows up as undelivered energy, not as broken days. A probabilistic forecast of arrivals and energy is the next step for that column {gr_runs_chance}.",
        "The bound assumes independent, alike days. Real days are not (weekdays, seasons); the margin uses only the most recent days, and the calibration check above is how to see whether the assumption held on a run {gr_code_uncertainty}.",
        "With perfect forecasts the margin is zero and chance behaves exactly like cautious {code_model}.",
      ] },
      { kind: "note", tone: "info", text: "Try it in the live app: open #plan_ev_timeblock_nl-run, set the battery strategy to MPC, forecasts to realistic and MPC execution to chance, run, and compare days kept and EV energy short with the peak-shaving run pinned in Compare." },
    ],
  },

  // ------------------------------------------------------------------ 22. Device uncertainty
  {
    id: "g-devices", section: "guide", title: "22. Device uncertainty: when the battery is not what the controller thinks",
    summary: "Three optional device effects: a state-of-charge estimate that drifts, battery power that tapers near full and empty, and cars that draw less near full. What the plan shortfall measures, and why days kept barely moved on the car park while drivers and plans paid.",
    blocks: [
      { kind: "p", text: "In plain words: every chapter so far gave the controller a perfect picture of its devices. Real batteries do not know exactly how full they are, and neither batteries nor cars take full power right up to full. Part 1 calls this gap G3 ([Section 12.2](#learn-trends-and-research-gaps/s12-2)); the battery background is in [Appendix A.3](#learn-appendix-a-batteries/sa-3) (behaviour in operation) and [A.6](#learn-appendix-a-batteries/h-how-a-bms-estimates-state-of-charge) (how a BMS estimates the charge). Site Lab can now switch on three effects, each off by default so existing sites behave exactly as before {gr_code_device} {code_model}." },

      { kind: "h", text: "1. A state-of-charge estimate that drifts" },
      { kind: "p", text: "A battery management system (BMS) estimates state of charge (SoC), mostly by counting energy in and out. LFP cells have an almost flat voltage over most of their range, so the estimate drifts. A battery-analytics vendor reports errors of ±15% as common in LFP systems, with outliers above ±40% {gr_accure}. The estimate is corrected when the battery reaches a steep part of the voltage curve, near full or empty; a battery maker's service guide says calibration completes at the latest after a full cycle {gr_fronius}." },
      { kind: "math", tex: String.raw`w_{t+1} = a(s_t)\,\big(w_t + \beta\, x_t + \sigma \sqrt{x_t}\; z_t\big), \qquad a(s) = \begin{cases} s / 0.15 & s < 0.15 \\ 1 & 0.15 \le s \le 0.9 \\ 1 - (s - 0.9)/0.1 & s > 0.9 \end{cases}`,
        caption: String.raw`\(w\) estimated minus true SoC, \(x_t\) the share of capacity moved in the step, \(z_t\) a standard normal draw, \(s\) the true SoC. The error grows with energy cycled and is pulled back to zero near empty and full (a full charge resets it). Shape and breakpoints from Braendle and Hug, Table I {gr_braendle}. Their paper gives no units; Site Lab reads its numbers as \(\beta = 0.01\) and \(\sigma = 0.1\) per capacity cycled, a conversion that is ours and uncertain {gr_code_device}. \(a\) is applied per hour, so results do not depend on the step length {gr_code_device}.` },
      { kind: "p", text: "The rule that matters: the controller sees the estimate; the battery obeys the truth. If the estimate reads 15 points high, a plan that counts on the last kilowatt-hours fails, because the battery is really empty {code_engine} {gr_code_device}. Settings: starting error, systematic drift, random drift and a random seed, so runs are reproducible and two strategies see the same luck {code_model}." },

      { kind: "h", text: "2. Battery power that tapers near full and empty" },
      { kind: "p", text: "Lithium-ion cells charge at constant current up to a voltage limit, then at constant voltage with falling current (CC-CV), so charging slows near full ([Appendix A.3](#learn-appendix-a-batteries/sa-3)). Site Lab uses ACN-Sim's two-stage model: full power up to 80% SoC, then a straight line down to zero at 100% {lee2020acnsim} {gr_code_device}. CityLearn documents the same 80% breakpoint {code_model}. For discharge it mirrors the shape below 20% SoC; that breakpoint is an example choice, because no public LFP derating table was found {code_model}. Within a step the power falls as the battery fills, so the engine computes the step's exact average power rather than using the SoC at the start of the step {gr_code_device}." },
      { kind: "p", text: String.raw`Worked example, our arithmetic on the formula in device.py: a 150 kWh / 75 kW battery at 90% SoC with 95% one-way efficiency. The taper zone is the top 20%, 30 kWh; 15 kWh of room is left. At the start of the hour it may take \(75 \times 15/30 = 37.5\) kW; as it fills, less. Over the hour it stores \(15\,(1 - e^{-0.95 \times 75/30}) \approx 13.6\) kWh, an average of about 14.3 kW at the terminals, against the 75 kW a controller that ignores the taper would plan for {gr_calc} {gr_code_device}.` },

      { kind: "h", text: "3. Cars that draw less near full" },
      { kind: "p", text: "Cars follow the same curve, but charging records give only the energy a car took, not its battery size or SoC. Site Lab assumes, and says so, that each session ended because the car was nearly full, at the point where it would draw less than the charger's 6 A minimum: the most taper possible. The car's battery is taken as the smallest of ACN-Sim's candidate sizes (8, 24, 40, 60, 85, 100 kWh) that holds the energy {gr_code_device} {lee2020acnsim} {iec61851}. Controllers do not know the car's SoC; the car simply draws less {code_model}." },

      { kind: "h", text: "A new measure: the plan shortfall" },
      { kind: "p", text: "When the controller asks the battery for power that it believed possible, and the battery cannot deliver it, the engine records the gap as the plan shortfall: kWh over the run, and the number of steps in which it happened. A warning appears when it is above 0.01 kWh {code_engine}. It answers the question 'how often did the plan not survive contact with the hardware?'. For the peak-shaving rule it counts only requests the battery could not meet, because the rule never plans with the SoC {gr_cfg_uncertain}." },

      { kind: "h", text: "What it did to the time-block car park" },
      { kind: "p", text: "Preset plan_ev_timeblock_nl_uncertain: the car park of chapter 19 with all three effects on, starting error +15 points, drift as above, seed 0. Our runs, 22 November 2026, full year {gr_cfg_uncertain}:" },
      { kind: "facts", rows: [
        ["Peak shaving, ideal devices", "350 of 365 days kept; €173,330; 2,006 kWh undelivered (276 sessions); no shortfall {gr_cfg_uncertain}."],
        ["Peak shaving, uncertain devices", "349 days; €173,314; 2,137 kWh undelivered (320 sessions); plan shortfall 2,597 kWh in 983 hours {gr_cfg_uncertain}."],
        ["MPC on realistic forecasts, ideal devices", "341 days; €167,194; 3,985 kWh undelivered (391 sessions); no shortfall {gr_cfg_uncertain}."],
        ["MPC on realistic forecasts, uncertain devices", "340 days; €167,191; 4,845 kWh undelivered (922 sessions); plan shortfall 5,654 kWh in 1,226 hours {gr_cfg_uncertain}."],
        ["Other seeds (MPC, uncertain)", "Seeds 1-3: 341 days each, 4,806-4,824 kWh undelivered, 5,605-6,001 kWh shortfall. The ±1 day is noise; the car and shortfall figures are stable {gr_cfg_uncertain}."],
        ["One effect at a time (rule / MPC)", "SoC error alone: 350 / 342 days, 2,006 / 4,053 kWh undelivered. Battery taper alone: 349 / 340 days, 2,045 / 4,075 kWh. Car curves alone: 350 / 341 days, 2,100 / 4,759 kWh. The largest SoC error in the year: 0.26 (rule) and 0.33 (MPC) {gr_cfg_uncertain}."],
      ] },

      { kind: "h", text: "Why days kept barely moved" },
      { kind: "p", text: "The engine slows the cars. When the battery cannot deliver what the plan expected, import rises; the safety layer then slows the charging cars before it records an excess (chapter 19) {code_engine}. So the contract survives and the drivers pay: undelivered car energy rose by about a fifth for the MPC (3,985 to 4,845 kWh), and more than twice as many sessions ended short (391 to 922) {gr_cfg_uncertain}. Most of that came from the car charging curves, not from the battery {gr_cfg_uncertain}." },
      { kind: "p", text: "Rules shrug, planners suffer. The rule asks for 'whatever keeps import under the limit' and takes what the battery gives, so the SoC error alone changes nothing physical for it. The MPC plans with the SoC estimate and with full power, so its plans failed in about 1,200 hours of the year {gr_cfg_uncertain}. Costs fell slightly in both cases, only because less car energy was bought {gr_cfg_uncertain}." },
      { kind: "note", tone: "warn", text: "Read days kept, undelivered car energy and plan shortfall together. Days kept alone would say device uncertainty does not matter here; the other two say who paid for it {gr_cfg_uncertain}." },

      { kind: "h", text: "Limits" },
      { kind: "list", items: [
        "The drift numbers come from a paper that gives no units; the per-capacity reading is ours and uncertain {gr_code_device} {gr_braendle}.",
        "The car battery and SoC are assumed, with the most taper possible (every car charged until nearly full) {gr_code_device}.",
        "The discharge breakpoint (20%) is an example choice {code_model}.",
        "No controller knows about its own device uncertainty yet. A planner that treated the SoC as uncertain (stochastic MPC with the SoC in the chance constraint) would hold a margin instead; that is the next step, not built {gr_cfg_uncertain}.",
        "The chance MPC of chapter 21 was not run on this preset; its result combined with device uncertainty is not known yet.",
      ] },
      { kind: "note", tone: "info", text: "Try it in the live app (the Utrecht car data is non-commercial, so it is not in the public demo): open #plan_ev_timeblock_nl_uncertain-run, then switch the battery's 'Power near full / empty' and the SoC estimate settings off one by one and compare." },
    ],
  },

  // ------------------------------------------------------------------ 23. Leeds fleet depot
  {
    id: "g-depot", section: "guide", title: "23. An open-data fleet depot: Leeds on a time-block contract",
    summary: "A council fleet depot built only on commercially usable data: real Leeds charging sessions (Open Government Licence), what the data holds and lacks, every assumption the preset flags, and what 21 weeks of runs show.",
    blocks: [
      { kind: "p", text: "In plain words: the car park of chapter 19 uses Utrecht commuter data that may not be used commercially, so it cannot appear in the public demo or in anything built on top {data_registry}. This example is built only on data that allows commercial use, and it is a depot, the kind of site part 1 points to for reliable flexibility ([Section 13.3](#learn-where-to-focus/s13-3)). It is in the public demo {gr_cfg_depot} {gr_code_demo}." },

      { kind: "h", text: "The data" },
      { kind: "facts", rows: [
        ["What", "Measured charging sessions of Leeds City Council's own fleet at its depots and offices, published on Data Mill North: charge point, plug-in and unplug time, energy delivered, location {gr_leeds} {gr_code_leeds}."],
        ["Licence", "Open Government Licence v3.0, which allows commercial use with attribution. Credit: 'EV Fleet Chargepoint use (Depot Usage 2023), (c) Leeds City Council, 2023. This information is licensed under the terms of the Open Government Licence.' {gr_leeds} {data_registry}"],
        ["The depot used", "Knowsthorpe HQ, 11 charge points. No charge point ever has more than two cars plugged in at once, so each is read as a two-socket post: a session goes to the first free socket. That gives 22 session sets {gr_code_leeds}."],
        ["Period", "The file name says May to November, but sessions run from 23 April to 2 October 2023. Coverage is set to whole months, 1 May - 1 October, so runs of up to 21 weeks fit {gr_code_leeds}."],
        ["What it lacks", "No vehicle IDs, no charger ratings, no building load. A council fleet, not a parcel operator {gr_code_leeds} {data_registry}."],
      ] },

      { kind: "h", text: "The assumptions, as the preset flags them" },
      { kind: "facts", rows: [
        ["Charger rating", "7.4 kW single-phase (230 V × 32 A), spread over L1-L3. The file has no ratings; the highest average session power is about 7.2 kW, which fits 7.4 kW sockets. Our assumption {gr_cfg_depot} {gr_code_leeds}."],
        ["Contract (illustrative)", "80 kW firm, about the depot's highest import with cars charging on arrival; 20 kW on working days 14:00-18:00, a window chosen to overlap the fleet's return (half of all plug-ins are at 14:00-16:00), so that it binds. Not a real offer. The form is the time-limited contract of part 1's [Section 3.2](#learn-grid-congestion-and-flexible-contracts/s3-2) {gr_cfg_depot}."],
        ["Building", "NREL ComStock warehouse load shape for California, modelled, scaled to 3,000 m² {gr_cfg_depot}."],
        ["Solar, prices", "Solar modelled from Amsterdam weather; Dutch day-ahead prices plus a Eurostat 2025 business adder of 0.144 €/kWh, as in the car park example {gr_cfg_depot}."],
        ["Sizes", "3,000 m² building, 50 kWp of solar, 100 kWh / 50 kW battery: example choices {gr_cfg_depot}."],
        ["Mixing", "A UK fleet on a Dutch tariff and contract with a Californian building shape, each data set from its own year for the same season and weekday (fleet 2023, prices and solar 2026) {gr_cfg_depot} {code_profiles}."],
        ["Length", "21 weeks (147 days, May-September), hourly, because the fleet data covers only those months {gr_cfg_depot}."],
      ] },

      { kind: "h", text: "What the runs show" },
      { kind: "p", text: "Checked with the simulator on 22 November 2026; every one of the 147 days has a limit {gr_cfg_depot}:" },
      { kind: "facts", rows: [
        ["Every variant", "The limit holds on 147 of 147 days. The engine slows the cars to keep it, and fleet vehicles parked for hours can wait {gr_cfg_depot}."],
        ["No battery", "The 90th-percentile day just reaches the limit (daily peak ratio 1.00); 1,309 kWh undelivered in 262 of 1,503 sessions {gr_cfg_depot}."],
        ["Firm 80 kW only, no window", "1,070 kWh undelivered in 225 sessions, the same as with no limit at all. This floor comes from hourly steps shortening each stay to whole hours, not from the contract. So the window costs about 240 kWh over 21 weeks, about 1.2% of the 19,100 kWh delivered {gr_cfg_depot}."],
        ["Peak-shaving battery (the preset)", "1,074 kWh undelivered (226 sessions): it gives back almost all the charging the window took, for €206 more energy cost (€9,004 against €8,798) and €629 of modelled battery wear {gr_cfg_depot}."],
        ["MPC battery", "1,071 kWh undelivered with perfect forecasts, 1,070 with realistic ones; total cost €4,845 / €5,050 (it also moves solar into the evening); €1,000 / €932 of wear {gr_cfg_depot}."],
      ] },
      { kind: "p", text: "The takeaway, for this depot and this invented window: slowing the chargers alone keeps the limit, and a battery buys back about 1% of the charging. A tighter window, a bigger building load or shorter stays would change that; the planner of chapter 20 is the tool to try them {gr_cfg_depot}. Note also the 5.3% floor: with the planner's default 1% service level, no option is feasible here at hourly steps (chapter 20) {gr_runs_floor}." },

      { kind: "h", text: "A better depot dataset, not yet used" },
      { kind: "p", text: "UK Power Networks' Optimise Prime trial published Royal Mail depot data under CC BY 4.0: charge-point power, building load and each depot's real profiled connection (a limit that changes by time window), 2020-2022. It would remove most of the mixing above, but it is about 130 GB behind a yearly-rotating access token, too large for a first-run download; it is a candidate for a one-off processing script {data_registry}." },
      { kind: "note", tone: "info", text: "Try it: open #plan_fleet_depot_timeblock-run (also in the public demo), then tighten the window limit or remove the battery and compare the EV energy short." },
    ],
  },
];

export const GUIDE_RELIABILITY_SOURCES: Source[] = [
  // ---------- Chapters 20-23 (checked 2026-11-22) ----------
  { id: "gr_code_planner", title: "Size & contract planner: web/app/src/planner.ts and web/app/src/components/Planner.tsx", read: "code",
    note: "Sizes, contract options, Pareto front, recommendation and the service-level rule (DEFAULT_EV_TOLERANCE = 0.01, the owner's setting, not a sourced number)." },
  { id: "gr_code_uncertainty", title: "Probabilistic net-load forecast and chance-constraint margin: src/emsbench/sim/uncertainty.py (+ tests/test_uncertainty.py, tests/test_chance_mpc.py)", read: "code" },
  { id: "gr_code_device", title: "Device uncertainty: src/emsbench/sim/device.py (+ tests/test_device.py)", read: "code" },
  { id: "gr_code_leeds", title: "Leeds fleet depot loader: src/emsbench/data/leeds.py (+ tests/test_data_leeds.py)", read: "code" },
  { id: "gr_code_demo", title: "Public demo export: scripts/export_static_demo.py (licence filter read from the data registry; tests/test_demo_licence.py)", read: "code" },
  { id: "gr_runs_chance", title: "Site Lab: chance-constrained MPC on the time-block car park and the apartment block, 22 Nov 2026 (results/chance_mpc/README.md)", read: "data",
    note: "Our own simulations, full year from 6 Oct 2025, hourly, realistic forecasts for the MPCs. Days kept 350 (rule) / 341 (cautious) / 364 (chance 95%); cost incl. wear EUR 175,593 / 169,562 / 171,378; EV unmet 2,006 / 3,985 / 2,772 kWh. Calibration: 8.4% of steps above the 90% quantile; margin exceeded on 3.1% of steps." },
  { id: "gr_cfg_uncertain", title: "Example site and runs: configs/sites/plan_ev_timeblock_nl_uncertain.yaml (device uncertainty on the time-block car park), checked 22 Nov 2026", read: "data",
    note: "Our own simulations, full year, seed 0 (seeds 1-3 for the MPC); the run table is in the file's header comment." },
  { id: "gr_cfg_depot", title: "Example site and runs: configs/sites/plan_fleet_depot_timeblock.yaml (Leeds fleet depot on a time-block contract), checked 22 Nov 2026", read: "data",
    note: "Our own simulations, 147 days from 4 May 2026, hourly; contract and sizes illustrative; assumptions and results in the file's header comment." },
  { id: "gr_runs_floor", title: "Site Lab runs: car energy short as a share of energy asked for, with and without the contract limit, 22 Nov 2026", read: "data",
    note: "Our own simulations with the presets as shipped (peak shaving). plan_ev_timeblock_nl: delivered 60,126 kWh, unmet 2,006 (3.2%); with no import limit: 60,386 / 1,746 (2.8%). plan_fleet_depot_timeblock: 19,083 / 1,074 (5.3%); no limit: 19,087 / 1,070 (5.3%). Asked for = delivered + unmet." },
  { id: "gr_calc", title: "Chapters 21-22: our arithmetic", read: "data",
    note: "ln(0.05)/ln(0.9) = 28.43 -> N = 29; 0.9^29 = 0.047, 0.9^28 = 0.052; ln(0.5)/ln(0.9) = 6.6 -> 7; ln(0.001)/ln(0.9) = 65.6 -> 66. Taper example: room 15 kWh, taper zone 30 kWh, k = 0.95 x 75 / 30 = 2.375 per hour, stored 15 (1 - e^-2.375) = 13.6 kWh, at the terminals 13.6 / 0.95 = 14.3 kWh in the hour; device.max_taper_power(15, 30, 75, 0.95, 1) returns 14.32 kW." },
  { id: "gr_leeds", title: "EV Fleet Chargepoint use (Depot Usage 2023)", authors: "Leeds City Council", year: 2023, venue: "Data Mill North",
    url: "https://datamillnorth.org/dataset/e7ljx/ev-fleet-chargepoint-use", read: "docs",
    note: "Dataset page read when the loader was written: Open Government Licence v3; attribution statement as quoted. Recorded in src/emsbench/data/registry.py." },
  { id: "gr_campi_handbook", title: "The scenario approach in model predictive control (chapter in the Handbook of Model Predictive Control)", authors: "Campi, Garatti, Prandini",
    venue: "Handbook of Model Predictive Control (Birkhäuser)", url: "https://marco-campi.unibs.it/pdf-pszip/Handbook%20MPC.pdf", read: "metadata",
    note: "Cited by sim/uncertainty.py for the (1 - eps)^N bound with one decision variable; not re-read for this page." },
  { id: "gr_babic2023", title: "Data-driven chance-constrained control without an assumed distribution, trained on about three weeks of data", authors: "Babic et al.", year: 2023,
    venue: "Frontiers in Control Engineering 4", url: "https://www.frontiersin.org/articles/10.3389/fcteg.2023.1237759", read: "metadata",
    note: "Cited as in part 1, Section 7.2, and in sim/uncertainty.py; title paraphrased from those citations, paper not re-read here." },
  { id: "gr_braendle", title: "SoC estimation error model (eq. 2, Table I)", authors: "Braendle, Hug", year: 2026, venue: "arXiv 2604.12594",
    url: "https://arxiv.org/abs/2604.12594", read: "metadata",
    note: "Cited by sim/device.py and sim/model.py, which take the error model and parameters from it; the paper takes them from a Powin / Tierra Climate whitepaper (March 2025). Units not given; the per-capacity conversion is ours." },
  { id: "gr_accure", title: "Accure (battery analytics vendor) on LFP state-of-charge estimation errors", year: 2025, venue: "ESS News, 7 Oct 2025",
    url: "https://www.ess-news.com/?p=6558", read: "secondary",
    note: "Trade press quoting a vendor: 'SoC estimation errors of +-15% are common in LFP systems, with outliers above +-40%' (quoted in sim/model.py). Vendor claim, not independent." },
  { id: "gr_fronius", title: "Charging behavior of lithium iron phosphate batteries (whitepaper v01, section 2.3, quoting BYD's service guide)", authors: "Fronius", year: 2024,
    venue: "Manufacturer whitepaper", read: "secondary",
    note: "Quoted in sim/device.py: SoC calculation is more precise with regular full cycles; 'the SOC calibration is completed at the latest after a full cycle'." },
];
