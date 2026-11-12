// The complete guide (systems): a chaptered, detailed explanation of how Site Lab works and the theory behind it,
// written so a reader could explain it to someone else. Same rules as pages.ts: every {id} must exist in a source
// list; statements are backed by a cited source, by this repository's code, or by our own runs (labelled as such).
// LaTeX lives in String.raw strings only.
import type { Page } from "./pages";
import type { Source } from "./sources";

export const GUIDE_SYSTEMS_PAGES: Page[] = [
  // ------------------------------------------------------------------ 1. Energy basics
  {
    id: "g-basics", section: "guide", title: "1. Energy basics: power, energy, meters and the grid connection",
    summary: "The handful of ideas everything else rests on: kW versus kWh, time steps, what a meter counts, self-consumption versus self-sufficiency, peaks, phases and fuses, each with the numbers Site Lab uses.",
    blocks: [
      { kind: "p", text: "Part 1 of this guide explains the energy world that Site Lab simulates: the physics and the rules, and for each one exactly how the simulator represents it. Part 2 explains how the simulator is built, Part 3 how controllers decide. This first chapter sets up the vocabulary. If you can explain the difference between 4 kW and 4 kWh, why an hourly simulation hides peaks, and how a home can be 73% self-sufficient while using only 56% of its own solar, the rest of the guide will read easily." },

      { kind: "h", text: "Power and energy" },
      { kind: "p", text: "Power is a rate: how fast energy flows at a given moment. Its unit is the watt (W) or kilowatt (kW = 1,000 W). Energy is an amount: how much has flowed over some time. Its unit is the kilowatt-hour (kWh), the energy delivered by 1 kW flowing for one hour. The relationship is the same as between speed and distance: power is speed, energy is distance travelled." },
      { kind: "math", tex: String.raw`E = \bar P \cdot \Delta t \qquad\Longrightarrow\qquad 11\ \text{kW} \times 2\ \text{h} = 22\ \text{kWh}, \qquad 2\ \text{kW} \times 0.25\ \text{h} = 0.5\ \text{kWh}`,
        caption: String.raw`\(E\) is the energy in kWh, \(\bar P\) the average power in kW over the interval and \(\Delta t\) its length in hours. Site Lab's default wallbox is 11 kW {code_model}, so two hours at full power draw 22 kWh from the grid; a quarter-hour at 2 kW is half a kWh {gs_calc}.` },
      { kind: "p", text: "Equipment is rated in both units, and the two mean different things. A home battery of 10 kWh and 5 kW stores 10 kWh but can move at most 5 kW in or out; it needs at least two hours to fill. Solar panels are rated in kWp (peak power, chapter 2), a heat pump in kW of electricity, a tariff in money per kWh, a demand charge in money per kW. Mixing them up is the most common error in energy discussions." },

      { kind: "h", text: "Time steps and averages" },
      { kind: "p", text: "Site Lab, like every energy simulator, cuts time into steps. A run uses steps of 1, 5, 15 or 60 minutes {code_model}. Inside a step everything is constant: each number is the average power over that step, and the energy of the step is that average times its length. Two modes use the same engine: Plan runs long periods (months to a year) at hourly steps, Operate runs days at 1 to 15-minute steps {code_model}. A run is limited to 110,000 steps, for example a year at 5-minute steps, to keep it under about 20 seconds {code_model}." },
      { kind: "p", text: "Averaging changes what you see. It keeps energy exactly, but it flattens short peaks. In our run of the measured German home of the main example (home only, no solar, battery or car), the same June week has a highest 15-minute average of 2.79 kW but a highest hourly average of only 1.27 kW, while the energy is 42.45 kWh either way {gs_runs}. Whatever drew 2.79 kW for a quarter-hour simply disappears into the hour. That is why the 'Limits' page warns that Plan mode, which averages 15-minute data into hours, shows lower peaks and fewer fuse problems than reality {code_profiles}." },
      { kind: "p", text: "The opposite direction is not allowed to cheat. If you ask for 1-minute steps from 15-minute data, Site Lab repeats each value and labels the run 'repeated (finer than the data)', instead of inventing detail that was never measured {code_profiles} {data_registry}." },

      { kind: "h", text: "What the meter counts" },
      { kind: "p", text: "A site in Site Lab is one grid connection with one meter, and all its assets sit on one electrical bus behind it {code_model}. Every step, the engine adds up what each asset takes from or gives to that bus. The sign convention is simple: positive means consumed from the bus (building load, battery charging, car charging, heat pump), negative means supplied to it (solar, battery discharging, a car giving energy back) {code_ctrl}. What is left over must come from, or go to, the grid:" },
      { kind: "math", tex: String.raw`g_t = L_t + H_t + \sum_i P^{\mathrm{EV}}_{i,t} + P^{\mathrm{bat}}_t - S_t, \qquad g^{+}_t = \max(g_t, 0)\ \text{(import)}, \quad g^{-}_t = \max(-g_t, 0)\ \text{(export)}`,
        caption: String.raw`At step \(t\): \(L_t\) building and data center load, \(H_t\) heat pump electricity, \(P^{\mathrm{EV}}_{i,t}\) the power of charger \(i\) (negative if a car discharges), \(P^{\mathrm{bat}}_t\) battery power at its terminals (positive when charging) and \(S_t\) solar output after any curtailment, all in kW. \(g_t\) is the grid power {code_engine}.` },
      { kind: "p", text: "The bill is computed from imports and exports separately, step by step: each kWh imported costs that step's import price, each kWh exported earns that step's export price {gs_code_kpis} {code_engine}." },
      { kind: "math", tex: String.raw`C_{\text{energy}} = \sum_{t} \big( g^{+}_t\, p_t - g^{-}_t\, x_t \big)\, \Delta t, \qquad C_{\text{total}} = C_{\text{energy}} + C_{\text{demand}}`,
        caption: String.raw`\(p_t\) is the import price and \(x_t\) the export price in step \(t\) (money per kWh); \(C_{\text{demand}}\) are demand charges on monthly peaks (chapter 6) {gs_code_kpis} {code_engine}.` },
      { kind: "p", text: "Some tariffs work differently. 'Net metering' is a billing arrangement that lets a customer reduce the billed electricity by what their own generation sends back to the grid, typically netted over the billing period {gs_eia_netmetering}. Site Lab never nets: an exported kWh at noon does not cancel an imported kWh in the evening; it only earns the export price. In the German home example that difference is large. In the June week with the self-consumption battery rule, the home imported 38.3 kWh and exported 87.9 kWh {gs_runs}; netted, it would have paid for nothing, but billed per step it paid €11.57, because each imported kWh costs about 30 ct while each exported kWh earned at most 7.86 ct {gs_runs} {bnetza_eeg}." },

      { kind: "h", text: "Self-consumption and self-sufficiency" },
      { kind: "p", text: "These two shares sound alike and measure opposite sides of the same flows. Self-consumption asks: of the solar energy produced, what share was used on site (directly or after storage in the battery)? Self-sufficiency asks: of the energy the site consumed, what share did not come from the grid? HTW Berlin's widely used definitions are {weniger2014}:" },
      { kind: "math", tex: String.raw`s = \frac{E_{\mathrm{DU}} + E_{\mathrm{BC}}}{E_{\mathrm{PV}}}, \qquad d = \frac{E_{\mathrm{DU}} + E_{\mathrm{BD}}}{E_{\mathrm{L}}}`,
        caption: String.raw`\(s\) self-consumption rate, \(d\) degree of self-sufficiency. \(E_{\mathrm{DU}}\) solar used directly, \(E_{\mathrm{BC}}\) solar used to charge the battery, \(E_{\mathrm{PV}}\) all solar produced, \(E_{\mathrm{BD}}\) energy discharged from the battery to the load, \(E_{\mathrm{L}}\) the load {weniger2014}.` },
      { kind: "p", text: "Site Lab computes the same two shares from the meter's point of view, which needs no bookkeeping of where each kWh went {code_engine}:" },
      { kind: "math", tex: String.raw`s = \frac{E_{\mathrm{PV}} - E_{\mathrm{exp}}}{E_{\mathrm{PV}}}, \qquad d = 1 - \frac{E_{\mathrm{imp}}}{E_{\mathrm{cons}}}, \qquad E_{\mathrm{cons}} = E_{\mathrm{building}} + E_{\mathrm{EV,charged}} + E_{\mathrm{heat\ pump}}`,
        caption: String.raw`\(E_{\mathrm{PV}}\) solar after curtailment, \(E_{\mathrm{exp}}\) exported energy (at most \(E_{\mathrm{PV}}\)), \(E_{\mathrm{imp}}\) imported energy, \(E_{\mathrm{cons}}\) consumption excluding battery losses {code_engine}. When the battery only charges from solar, the two versions agree. When it also charges from the grid, Site Lab's \(d\) counts that grid energy as a shortfall; when a battery or car discharges into the grid, its export is counted as exported solar.` },
      { kind: "facts", rows: [
        ["Worked example", "German home, 8-14 June 2026: 8 kWp of solar, a 10 kWh battery, a car charging in the cheapest hours {gs_runs}."],
        ["Flows", "Solar produced 199.9 kWh; exported 87.9 kWh; imported 38.3 kWh; home 42.5 kWh plus car 97.5 kWh = 139.9 kWh consumed {gs_runs}."],
        ["Self-consumption", "(199.9 − 87.9) ÷ 199.9 = 56% {gs_runs} {gs_calc}."],
        ["Self-sufficiency", "1 − 38.3 ÷ 139.9 = 73% {gs_runs} {gs_calc}."],
        ["Same week, battery idle, car charging on arrival", "Self-consumption 22%, self-sufficiency 31%, energy cost €29.32 instead of €11.57 {gs_runs}."],
      ] },
      { kind: "p", text: "A big solar array on a small house has high self-sufficiency but low self-consumption (most of its solar is exported); a small array on a big building has the reverse. Neither share is money: what a kWh of self-consumption is worth depends on the gap between the import and export prices. The practical example 'Does a home battery pay for itself?' works through exactly this confusion." },

      { kind: "h", text: "Peaks" },
      { kind: "p", text: "The peak is the highest grid import in any one step, in kW {gs_code_kpis}. It matters for three reasons: the connection or transformer must carry it, the fuses must survive it, and some tariffs bill it. Site Lab reports the peak of the whole run and the average of each month's peak, because a monthly demand charge bills each calendar month's highest step {gs_code_kpis} {code_engine}. Because a peak is one step's average, the time step defines it: a 15-minute peak is what a meter with 15-minute intervals would record. In the June example week the peak was 7.49 kW with the battery rule and 7.53 kW with the battery idle: the car's charging set it, and a battery that follows solar barely touches it {gs_runs}." },

      { kind: "h", text: "Voltage, current and phases" },
      { kind: "p", text: "Electric power is voltage times current. Voltage (volts, V) is the electrical 'pressure', current (amperes, A) the flow. European low-voltage supply is 230 V between each phase conductor and neutral, and 400 V between two phases, at 50 Hz {iec60038}. Most homes and businesses are connected with three phases (called L1, L2 and L3) plus neutral; a large device can use all three, a small one uses one." },
      { kind: "math", tex: String.raw`P = U \cdot I, \qquad P_{\text{3-phase}} = 3 \cdot 230\ \text{V} \cdot I \quad\Longrightarrow\quad 3 \times 230\ \text{V} \times 16\ \text{A} = 11{,}040\ \text{W} \approx 11\ \text{kW}`,
        caption: String.raw`\(U\) voltage, \(I\) current per phase. A charger drawing 16 A on each of three phases at 230 V delivers about 11 kW, Site Lab's default charger power {code_model} {iec60038} {gs_calc}.` },
      { kind: "p", text: "Site Lab uses exactly this conversion: a phase's current is its power divided by 230 V {code_engine}. That treats voltage as constant and current as exactly in step with voltage, which real equipment only approximates; the simulator does not model voltage changes or reactive power. On the phases, buildings, solar, heat pumps and batteries are assumed to be spread evenly over L1-L3; a three-phase charger splits its power equally; a single-phase charger puts all of it on its phase {code_engine}. A car whose own maximum power is below the smallest power a three-phase charger can deliver (6 A on three phases, about 4.1 kW) is assumed to charge single-phase on the charger's phase {code_engine}. In reality the car's onboard charger decides how many phases it uses; Site Lab infers it from the car's power only." },

      { kind: "h", text: "Fuses and connection limits" },
      { kind: "p", text: "Each phase of the connection is protected by a main fuse. Its rating in amperes sets the most current that phase may carry; Site Lab turns it into power per phase. A 3 × 25 A connection, the size used in the German home examples, allows 230 × 25 = 5.75 kW per phase, or 17.25 kW in total if perfectly balanced {code_model} {gs_calc}. A single-phase 7 kW car on L1 uses most of L1's 5.75 kW allowance on its own, while L2 and L3 sit almost idle: the fuse limits per phase, not per site." },
      { kind: "p", text: "Site Lab offers three connection limits on the grid connection {code_model}: an import limit in kW (a connection or transformer rating), an export limit in kW (solar is curtailed above it) and the fuse per phase in A. After the controller has spoken, the engine's safety layer enforces them in that order {code_engine}:" },
      { kind: "steps", items: [
        "Import limit: stop charging the batteries, then discharge them harder, then slow all charging cars in proportion; whatever is still above the limit is recorded as overload {code_engine}.",
        "Fuse per phase: on the most loaded phase, reduce battery charging (spread over the three phases), then slow the cars on that phase, single-phase cars first and three-phase cars after; up to three passes, so a second phase can be fixed too. A charger squeezed below its 6 A minimum pauses. If the base load alone exceeds the fuse, the excess is recorded and a warning is shown {code_engine}.",
        "Export limit: stop cars that give energy back, charge the battery more, and finally curtail solar {code_engine}.",
      ] },
      { kind: "p", text: "In the June example week the highest phase current was 10.8 A, well inside the 25 A fuse {gs_runs}. Fuses bind where many loads share one connection: in the shared-garage example (eight 11 kW chargers behind 3 × 63 A), moving all cars to the cheapest hours made them start together and pushed the busiest phase from 56 A to the full 63 A {runs_2026_11}." },
      { kind: "note", tone: "warn", text: "Simplification: Site Lab treats a fuse as a limit that must hold in every step. It does not model how long an overload lasts before a fuse blows, nor voltage drop along cables. A step that exceeds the fuse is counted as 'fuse overload' energy and flagged, not simulated as a blown fuse {code_engine}." },

      { kind: "h", text: "The units, in one table" },
      { kind: "facts", rows: [
        ["kW", "Power, a rate: battery and charger ratings, peaks, demand charges per kW."],
        ["kWh", "Energy, an amount: battery capacity, consumption, prices per kWh."],
        ["kWp", "Rated peak power of solar panels under standard test conditions (chapter 2)."],
        ["A and V", "Current and voltage; per phase, kW = 230 V × A ÷ 1,000 in Site Lab {code_engine}."],
        ["Time step", "1, 5, 15 or 60 minutes; every value is an average over its step {code_model}."],
        ["Shares", "Self-consumption (of solar), self-sufficiency (of consumption), both from the meter's flows {code_engine}."],
      ] },
      { kind: "note", tone: "info", text: "Try it: open #operate_home_ev-run and look at the Results strip for self-sufficiency and peak import. Then change the time step to 60 minutes in the site settings and run again: the energy stays the same, the peak falls." },
    ],
  },

  // ------------------------------------------------------------------ 2. Solar
  {
    id: "g-solar", section: "guide", title: "2. Solar: from sunlight to kilowatt-hours",
    summary: "What kWp means, how sunlight is measured (GHI, DNI, DHI), how Site Lab turns 15-minute weather into output per kWp with the PVWatts chain, how good the result is against PVGIS, and where day-ahead solar forecasts come from.",
    blocks: [
      { kind: "p", text: "Solar panels turn sunlight into direct current (DC); an inverter converts it to the alternating current (AC) of the building and grid, with some loss and a maximum output {gs_pvlib_inv}. Site Lab never uses metered solar output. It computes output per kWp from weather data with a standard open model, so any location with weather data can be simulated, and checks the result against an independent long-term reference. This chapter follows that chain step by step, with the formulas the code actually uses." },

      { kind: "h", text: "kWp: what the size of a solar array means" },
      { kind: "p", text: "A panel's rating in kWp (kilowatt-peak) is its DC power at an irradiance of 1,000 W/m² and a cell temperature of 25 °C, the reference conditions the PVWatts model is built around {gs_pvlib_dc}. It is a laboratory reference, not what the roof delivers: real irradiance is usually lower, cells run hotter, and wiring, dirt and the inverter take their share. In Site Lab an array is a size in kWp times a profile of AC output per kWp {code_model} {code_engine}; 8 kWp on the Konstanz profile is simply 8 × that profile." },

      { kind: "h", text: "Measuring sunlight: GHI, DNI and DHI" },
      { kind: "p", text: "Irradiance is solar power arriving per square metre (W/m²). Weather services describe it with three numbers {gs_om_hist} {gs_pvlib_poa}:" },
      { kind: "facts", rows: [
        ["GHI, global horizontal irradiance", "Everything that falls on a flat, horizontal surface: the direct beam plus the light scattered by the sky {gs_om_hist}."],
        ["DNI, direct normal irradiance", "The direct beam only, measured on a surface that faces the sun {gs_om_hist}."],
        ["DHI, diffuse horizontal irradiance", "The scattered sky light only, on a horizontal surface {gs_om_hist}."],
      ] },
      { kind: "math", tex: String.raw`\mathrm{GHI} = \mathrm{DHI} + \mathrm{DNI} \cdot \cos\theta_z`,
        caption: String.raw`The closure equation: the beam's contribution to a horizontal surface shrinks with the cosine of the solar zenith angle \(\theta_z\) (0° with the sun overhead) {gs_pvlib_closure}. On an overcast day DNI is near zero and GHI is almost all diffuse.` },

      { kind: "h", text: "From the horizontal to the panel: plane of array" },
      { kind: "p", text: "Panels are tilted and face a direction (azimuth), so what matters is the irradiance in the plane of the panels, the plane-of-array (POA) irradiance. It has three parts: the direct beam projected onto the tilted panel, diffuse light from the part of the sky the panel sees, and light reflected from the ground {gs_pvlib_poa}. Site Lab uses pvlib's get_total_irradiance with the Hay-Davies sky model, which splits sky diffuse light into a part coming from around the sun (circumsolar) and an evenly spread part, weighted by an anisotropy index, the ratio of DNI to the irradiance at the top of the atmosphere {gs_pvlib_poa} {gs_code_pv}. The ground's reflectivity (albedo) is left at pvlib's default of 0.25 {gs_pvlib_poa} {gs_code_pv}." },
      { kind: "math", tex: String.raw`I_{\mathrm{POA}} = I_{\mathrm{beam}} + I_{\mathrm{sky\ diffuse}} + I_{\mathrm{ground}}, \qquad I_{\mathrm{sky\ diffuse}}^{\mathrm{Hay\text{-}Davies}} = \mathrm{DHI}\Big( A\, R_b + (1 - A)\,\frac{1 + \cos\beta}{2} \Big)`,
        caption: String.raw`\(A\) anisotropy index (DNI over extraterrestrial irradiance), \(R_b\) the ratio that projects the beam onto the tilted plane, \(\beta\) the panel tilt {gs_pvlib_poa}.` },
      { kind: "p", text: "Two roof layouts exist for each place: south-facing at 30° tilt, and east-west at 15° tilt, computed as half the panels facing east and half facing west {gs_code_pv}. East-west arrays produce less per kWp over a year but spread output over a longer day." },

      { kind: "h", text: "Heat: why panels deliver less on a hot day" },
      { kind: "p", text: "Panels lose power as they warm up. The model first estimates the cell temperature from the irradiance, the air temperature and the wind, using the Sandia (SAPM) model with the parameters for glass-polymer modules on an open rack {gs_pvlib_temp} {gs_code_pv}:" },
      { kind: "math", tex: String.raw`T_m = E\, e^{\,a + b\, W} + T_a, \qquad T_c = T_m + \frac{E}{1000}\,\Delta T, \qquad a = -3.56,\ b = -0.075,\ \Delta T = 3\ ^\circ\mathrm{C}`,
        caption: String.raw`\(E\) plane-of-array irradiance (W/m²), \(T_a\) air temperature, \(W\) wind speed at 10 m (m/s), \(T_m\) module back temperature, \(T_c\) cell temperature {gs_pvlib_temp}.` },
      { kind: "p", text: "Then DC power follows the PVWatts temperature-coefficient model {gs_pvlib_dc}, with the PVWatts 'standard module' coefficient of −0.47% per °C used by the code {gs_code_pv}. pvlib's documentation gives −0.2% to −0.5% per °C as the typical range {gs_pvlib_dc}." },
      { kind: "math", tex: String.raw`P_{\mathrm{dc}} = \frac{E}{1000}\, P_{\mathrm{dc0}} \big( 1 + \gamma\, (T_c - 25) \big), \qquad \gamma = -0.0047\ /^\circ\mathrm{C}`,
        caption: String.raw`\(P_{\mathrm{dc0}}\) the rating (1 kW per kWp), \(\gamma\) the temperature coefficient {gs_pvlib_dc} {gs_code_pv}.` },

      { kind: "h", text: "Losses and the inverter" },
      { kind: "p", text: "Real systems lose energy to soiling, shading, mismatch between panels, wiring, connections, light-induced degradation, nameplate tolerance and downtime. Site Lab applies the PVWatts default losses (listed on the 'Solar panels' page), combined multiplicatively {pvlib_losses}; they total 14.08% {gs_calc}. The inverter then converts DC to AC with PVWatts' efficiency curve, nominal efficiency 96%, and caps output at its AC rating {gs_pvlib_inv} {gs_code_pv}. The code gives the inverter the same DC rating as the panels (1 kW per kWp), so output is capped at 0.96 kW AC per kWp {gs_code_pv} {gs_pvlib_inv}." },
      { kind: "math", tex: String.raw`P_{\mathrm{ac}} = \min\big(\eta(\zeta)\, P_{\mathrm{dc}}',\ P_{\mathrm{ac0}}\big), \qquad \eta(\zeta) = \frac{0.96}{0.9637}\Big( -0.0162\,\zeta - \frac{0.0059}{\zeta} + 0.9858 \Big), \qquad \zeta = \frac{P_{\mathrm{dc}}'}{P_{\mathrm{dc0}}}`,
        caption: String.raw`\(P_{\mathrm{dc}}' = P_{\mathrm{dc}}\,(1 - 0.1408)\) is DC power after losses, \(P_{\mathrm{ac0}} = 0.96\,P_{\mathrm{dc0}}\) the AC rating; the efficiency is a little lower at part load {gs_pvlib_inv} {gs_code_pv}.` },

      { kind: "h", text: "Worked example: one kWp at noon" },
      { kind: "p", text: "Take 1,000 W/m² on the panels, 25 °C air and 1 m/s of wind, and follow the chain (our arithmetic with pvlib's functions) {gs_calc}:" },
      { kind: "math", tex: String.raw`\begin{aligned}
T_c &= 1000\, e^{-3.56 - 0.075 \cdot 1} + 25 + 3 = 54.4\ ^\circ\mathrm{C} \\[10pt]
P_{\mathrm{dc}} &= 1 \times \big(1 - 0.0047 \times (54.4 - 25)\big) = 0.862\ \text{kW} \\[10pt]
P_{\mathrm{dc}}' &= 0.862 \times (1 - 0.1408) = 0.741\ \text{kW} \\[10pt]
P_{\mathrm{ac}} &= 0.962 \times 0.741 = 0.713\ \text{kW per kWp}
\end{aligned}`,
        caption: String.raw`At 10 °C air the cell runs at 39.4 °C and the output is 0.771 kW per kWp: about 8% more for the same sunshine {gs_calc}. An 8 kWp roof on a hot, clear noon gives about 5.7 kW.` },
      { kind: "p", text: "This matches what the data shows. On the two clear days of the June example week (13 and 14 June 2026) the Konstanz south-facing profile peaked at 0.726 and 0.734 kW per kWp, and the highest value anywhere in that profile is 0.82 kW per kWp {gs_data}. Values above the worked example need more than 1,000 W/m² on the panel or a colder module; we have not checked which applies when." },

      { kind: "h", text: "The chain in the code" },
      { kind: "steps", items: [
        "openmeteo_pv.build() in src/emsbench/data/openmeteo_pv.py loops over five places (Konstanz, Amsterdam, Paris, Aarhus, Los Angeles) and the two roof layouts {gs_code_pv}.",
        "_weather() downloads month by month from Open-Meteo's Historical Forecast API: 15-minute GHI, DNI, DHI, air temperature and wind, in UTC, from October 2025 to two days before today; months not yet complete are downloaded again on refresh {gs_code_pv}. That API is an archive of past weather forecasts, stitched from the first hours of each model run {gs_om_hist}.",
        "Short gaps (up to 8 steps, two hours) are interpolated; irradiance gaps left after that count as zero {gs_code_pv}.",
        "per_kwp() computes the sun's position, the plane-of-array irradiance (Hay-Davies), the cell temperature (SAPM), DC power (PVWatts, γ = −0.0047), the 14.08% losses and the inverter (96%), and clips negative values to zero {gs_code_pv}.",
        "The result is stored as a profile of AC kW per kWp at 15-minute steps, with its clock shifted from UTC to fixed CET (UTC+1, no summer time) for Europe and UTC−8 for Los Angeles; its label states the yearly yield {gs_code_pv} {data_registry}.",
        "pvgis_yearly() asks the EU's PVGIS service for the long-term average yield of the same place and layout with 14% losses, and the comparison is written into the profile's note and pv_validations.json {gs_code_pv}.",
      ] },
      { kind: "note", tone: "warn", text: String.raw`Three things to know about the weather input. (1) Open-Meteo provides native 15-minute data only for Central Europe and North America; elsewhere 15-minute values are interpolated from hourly ones {gs_om_fc}. Konstanz and Los Angeles are inside those regions; whether Open-Meteo counts Amsterdam, Paris and Aarhus as Central Europe we have not checked. (2) Open-Meteo documents 15-minute radiation as the mean of the preceding 15 minutes {gs_om_fc}, while per_kwp() computes the sun's position 7.5 minutes after each time label, the middle of the following quarter-hour {gs_code_pv}. That may shift the sun geometry by a quarter-hour; not yet checked. (3) pvlib's PVWatts DC model expects irradiance after angle-of-incidence (reflection) losses {gs_pvlib_dc}; the code passes the plane-of-array irradiance without that correction {gs_code_pv}, which on its own would make output read somewhat high. The PVGIS check below is what tells us the net effect.` },

      { kind: "h", text: "Yield per kWp, and the PVGIS check" },
      { kind: "p", text: "The yearly yield in kWh per kWp is the most useful single number for a solar site: multiply it by the array size and you have the annual energy. PVGIS, the European Commission JRC's photovoltaic tool, publishes long-term average yields with their year-to-year standard deviation; the build step compares each of our profiles' last 12 months with it {gs_code_pv} {pvgis_check}." },
      { kind: "facts", rows: [
        ["Konstanz, south 30°", "1,183 kWh/kWp in the last 12 months vs PVGIS 1,130 ± 53 (+4.7%) {pvgis_check}."],
        ["Konstanz, east-west 15°", "1,017 vs 954 ± 40 (+6.6%) {pvgis_check}."],
        ["Paris, south 30°", "1,181 vs 1,137 ± 49 (+3.9%) {pvgis_check}."],
        ["Aarhus, south 30°", "938 vs 982 ± 37 (−4.5%) {pvgis_check}."],
        ["Amsterdam, south 30°", "1,116 vs 1,016 ± 47 (+9.9%), outside two standard deviations {pvgis_check}."],
        ["Los Angeles, south 30°", "1,610 vs 1,780 ± 42 (−9.6%), outside two standard deviations {pvgis_check}."],
      ] },
      { kind: "p", text: "Six of the ten profiles fall within normal year-to-year variation; Amsterdam reads about 9% high and Los Angeles about 9% low, causes unverified, so modelled solar is treated as accurate to about ±10% {data_registry} {pvgis_check}. Note that the comparison is one particular year against a long-term average, so even a perfect model would differ by roughly one standard deviation in a typical year." },
      { kind: "p", text: "Worked numbers: 8 kWp in Konstanz at 1,183 kWh/kWp gives about 9,460 kWh a year {gs_calc}. The year is very uneven. In the June example week the profile delivered 25.0 kWh per kWp, so 200 kWh from 8 kWp; in a January week (12-18 January 2026) only 8.9 kWh per kWp, 71 kWh {gs_data} {gs_runs}. For comparison, HTW Berlin's 2013 model of a south-facing 35° system near Berlin, with 2004 weather, gave 1,024 kWh per kWp {weniger2014}: yields depend on place, year and the model's loss assumptions." },

      { kind: "h", text: "Day-ahead solar forecasts" },
      { kind: "p", text: "A controller that plans ahead (cheapest-hours rules, the MPC) needs to know tomorrow's solar. With perfect forecasts it is told the actual profile; with realistic forecasts it gets what a real system would have known a day earlier {code_forecasts}. That forecast is built by openmeteo_forecast.build() in src/emsbench/data/openmeteo_forecast.py {gs_code_pvfc}:" },
      { kind: "steps", items: [
        "Download Open-Meteo's Previous Runs API, the variables ending in '_previous_day1': the value predicted 24 hours before the time it is valid for {om_prevruns} {gs_code_pvfc}.",
        "These are hourly, with radiation averaged over the past hour, so each value is computed with the sun's position 30 minutes before its label and given to the four 15-minute steps inside that hour {gs_code_pvfc}.",
        "Run the forecast weather through exactly the same solar model as the actual profile (openmeteo_pv.per_kwp), aligned step by step, so the only difference between forecast and actual is the weather forecast's error {gs_code_pvfc}.",
        "Fill hours missing from the archive with the actual solar 24 hours earlier, and say in the note how many there were {gs_code_pvfc}.",
      ] },
      { kind: "facts", rows: [
        ["8 June 2026 (Mon)", "Actual 5.05 kWh/kWp, forecast 5.00 {gs_data}."],
        ["9 June", "Actual 0.95, forecast 1.53 {gs_data}."],
        ["10 June", "Actual 1.62, forecast 3.05: almost double {gs_data}."],
        ["11 June", "Actual 4.22, forecast 4.41 {gs_data}."],
        ["12 June", "Actual 1.18, forecast 0.78 {gs_data}."],
        ["13 and 14 June (clear)", "Actual 5.95 and 6.02, forecast 5.91 and 5.83 {gs_data}."],
      ] },
      { kind: "p", text: "Clear days are forecast well; cloudy days are where the errors are, in both directions. Across all ten profiles from October 2025 to November 2026, the day-ahead forecasts miss daytime output by 17-30% of its mean on average, Amsterdam the most {runs_2026_11b}. EMHASS, an open-source home energy optimiser, also forecasts solar from Open-Meteo weather by default {emhass_fc}. Chapter 17, 'When the forecast is wrong', shows what these errors cost a planner." },

      { kind: "h", text: "What the solar model leaves out" },
      { kind: "list", items: [
        "Real shading geometry, snow and ageing over the years: the PVWatts losses include a flat 3% for shading and 0% for snow and age {pvlib_losses}.",
        "Clipping by an inverter smaller than the panels: the code sizes the inverter to the panels {gs_code_pv}.",
        "Curtailment happens only when the site has an export limit; then the engine reduces solar last, after cars and the battery have absorbed what they can {code_engine}.",
        "The solar data starts in October 2025; a run on other dates uses the same season and weekday from a year that is covered (see '8. The data pipeline: from open data to profiles') {code_profiles}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: open #operate_home_ev-run, click the solar panels and switch the profile between Konstanz south and east-west, or change the size. Then set 'Forecasts' to realistic in the Control strategy section and use Compare forecasts to see what the day-ahead forecast changes." },
    ],
  },

  // ------------------------------------------------------------------ 3. Batteries
  {
    id: "g-batteries", section: "guide", title: "3. Batteries: capacity, power, losses and ageing",
    summary: "What capacity, power, C-rate, efficiency and state of charge mean; LFP versus NMC; why batteries age with time and with use; how Site Lab turns ageing into an expected life and a cost with NREL's BLAST-Lite; and what it leaves out, such as standby draw.",
    blocks: [
      { kind: "p", text: "A battery is the most flexible device on a site: it can be a load or a source within one step, and the controller decides which. That flexibility is also why battery questions dominate this project: how much does it earn, how hard should it work, and what does working hard cost in lost life? This chapter covers the physics and economics in plain terms and shows exactly how Site Lab represents each. The deeper series 'Battery modelling, from scratch' goes further into each topic." },

      { kind: "h", text: "Capacity, power and C-rate" },
      { kind: "p", text: "Capacity (kWh) is how much energy the battery can store; Site Lab uses usable capacity, what the system actually lets you use. Power (kW) is how fast it can charge or discharge, usually limited by the inverter. Site Lab's defaults are CityLearn's: 6.4 kWh and 5 kW; the German home examples use 10 kWh and 5 kW, an example choice {code_model}. The ratio of the two is called the C-rate:" },
      { kind: "math", tex: String.raw`\text{C-rate} = \frac{P}{E_{\mathrm{cap}}} \qquad\Longrightarrow\qquad \frac{5\ \text{kW}}{10\ \text{kWh}} = 0.5\,\text{C}, \qquad \frac{1{,}000\ \text{kW}}{4{,}000\ \text{kWh}} = 0.25\,\text{C}`,
        caption: String.raw`At 0.5 C a battery needs at least two hours to go from empty to full. The data center example's UPS battery runs at 0.25 C {code_model} {gs_calc}. C-rate matters for ageing: the LFP cell behind Site Lab's wear model was tested charging at no more than 0.65 C {blast_lite}.` },

      { kind: "h", text: "Efficiency" },
      { kind: "p", text: "Every kWh stored and taken back loses some energy as heat in the cells and the power electronics. The round-trip efficiency is the share that comes back. Site Lab's default is 0.9, from CityLearn {code_model}. The engine splits the loss evenly between the way in and the way out, so each direction has an efficiency of √0.9 ≈ 0.949 {code_engine}. Real systems vary: a 2026 lab test of 12 home battery systems measured battery efficiencies from 87.9% to 97.1% {htw_inspektion2026}." },
      { kind: "math", tex: String.raw`\begin{aligned}
t_{\text{fill}} &= \frac{E_{\mathrm{cap}}}{\eta\, P} = \frac{10}{0.949 \times 5} = 2.11\ \text{h} \\[10pt]
t_{\text{empty}} &= \frac{\eta\, E_{\mathrm{cap}}}{P} = \frac{0.949 \times 10}{5} = 1.90\ \text{h} \\[10pt]
10\ \text{kWh in} &\;\to\; 9.49\ \text{kWh stored} \;\to\; 9.0\ \text{kWh out}
\end{aligned}`,
        caption: String.raw`With \(\eta = 0.949\) each way, filling the 10 kWh / 5 kW battery from empty takes 2.11 h at full power and emptying it 1.90 h; 10 kWh bought brings back 9.0 kWh {gs_calc}. In the June example week the self-consumption rule put 62.5 kWh in and took 52.1 kWh out; 6.0 kWh were true conversion losses, the rest was still stored at the end {deep_runs}.` },
      { kind: "p", text: "The full model, with the limits on power and fullness every strategy shares, is on the page '2. The energy-reservoir model (what Site Lab uses)'. Two details matter here. First, efficiency is constant: it does not change with power, temperature or age {code_engine}. Second, when a site has several batteries, the engine adds them up for the controller and splits the requested power between them in proportion to how much each can still take or give {code_engine}." },

      { kind: "h", text: "State of charge" },
      { kind: "p", text: "State of charge (SoC) is how full the battery is, as a share of capacity. Site Lab lets you set a minimum, a maximum and a starting value {code_model}. The minimum is also how a reserve is kept: in the data center example, the battery doubles as the UPS (the backup that bridges a power cut until the generator starts), and a minimum of 12.5% keeps its backup energy out of reach of every strategy {code_engine} {ex_dc}. The starting value defaults to 0, CityLearn's default {code_model}; that choice matters for wear, as shown below. Controllers know the state of charge exactly; real systems estimate it, see '4. Estimating state of charge' {code_engine}." },

      { kind: "h", text: "Chemistry: LFP and NMC" },
      { kind: "p", text: "Two lithium-ion families dominate. LFP (lithium iron phosphate) is cheaper per kWh and long-lived; NMC (nickel manganese cobalt) stores more energy per kilogram and is common in cars. In BloombergNEF's 2025 survey LFP packs averaged $81/kWh and NMC packs $128/kWh, and stationary storage packs $70/kWh {bnef2025}. Long-term ageing studies of a commercial LFP/graphite cell chose it precisely because it promises long calendar and cycle life, which stationary storage needs {naumann2018}. Site Lab's battery has a 'Cell chemistry (for wear)' setting: lfp or nmc. It changes only which ageing model prices wear, not the efficiency or power {code_model} {code_wear}." },

      { kind: "h", text: "How batteries age" },
      { kind: "p", text: "A battery slowly loses capacity and gains internal resistance. A review of ageing-aware battery operation names the stress factors: state of charge, charge and discharge rate, cycle count and temperature {collath2022}. They fall into two kinds:" },
      { kind: "facts", rows: [
        ["Calendar ageing", "Happens even at rest, faster when warm and when kept full. A 29-month study stored commercial LFP cells at 17 combinations of temperature and state of charge and fitted a model of capacity loss and resistance growth {naumann2018}."],
        ["Cycle ageing", "Comes from use: energy moved through the cells, depth of each cycle, current. The follow-up study tested 19 combinations of temperature, C-rate, depth and state of charge {naumann2020}."],
        ["Many paths", "The same cell can reach end of life by different mechanisms depending on use; one modelling study found five pathways {okane2022}."],
      ] },
      { kind: "p", text: "End of life is a convention, not a cliff. A common home-battery warranty guarantees 80% of the original energy after 10 years or 30 MWh of throughput {lg_resu12}; Site Lab uses 80% as the default end of life, adjustable from 50% to 99% {code_model}." },

      { kind: "h", text: "BLAST-Lite: turning a state-of-charge history into a life" },
      { kind: "p", text: "Site Lab does not invent an ageing curve. It uses NREL's open BLAST-Lite library {blast_lite}, whose models predict capacity loss from a time series of state of charge and temperature, adding calendar ageing (time, average state of charge, temperature) and cycle ageing (energy cycled, depth of discharge, C-rate) {code_wear}. Two of its large-format cells stand for the two chemistries: Lfp_Gr_250AhPrismatic for LFP and NMC_Gr_75Ah_A for NMC, both fitted to the ageing tests in Gasper et al. 2023 {code_wear} {gasper2023}." },
      { kind: "steps", items: [
        "After a run, engine._battery_wear() takes each battery's state-of-charge series, including its starting value {code_engine}.",
        "wear.expected_life() in src/emsbench/sim/wear.py tiles a short run to at least 28 days and hands it to BLAST-Lite, which repeats the pattern until the battery reaches its end-of-life capacity or 40 years, whichever comes first {code_wear}.",
        "For speed, ageing is updated in chunks of at most a week or 5 full cycles; on the example runs this changed the expected life by under 4% {code_wear}.",
        "The result is an expected life in years, and the share of capacity loss due to cycling (the rest is calendar ageing) {code_wear}.",
        "A perfectly constant battery (idle, never moving) takes BLAST-Lite's fast path for constant inputs {code_wear}.",
      ] },
      { kind: "p", text: "Why repeat the pattern instead of just measuring a week's capacity loss? A new battery ages fastest in its first weeks, so one week's loss would exaggerate wear; repeating the run's way of operating to end of life gives the years this operation would last {code_wear}. The repetition joins the run's end to its start, which counts as a small extra cycle if the run ends at a different charge than it started {code_wear}." },

      { kind: "h", text: "From life to money" },
      { kind: "p", text: "A run's wear cost is the battery's replacement value times the share of its life the run used up {code_wear}:" },
      { kind: "math", tex: String.raw`C_{\text{wear}} = c_{\text{repl}} \cdot E_{\mathrm{cap}} \cdot \frac{\text{run length (years)}}{\text{expected life (years)}}`,
        caption: String.raw`\(c_{\text{repl}}\) replacement cost per usable kWh. A life longer than 40 years is priced by the capacity actually lost in 40 years over the allowed loss {code_wear}.` },
      { kind: "facts", rows: [
        ["Home, up to 30 kWh", "€1,200 per usable kWh {figgener2023} {code_wear}."],
        ["Commercial", "€710 up to 100 kWh, €580 for 100-500 kWh, €595 for 500-1,000 kWh {figgener2023} {code_wear}."],
        ["Large-scale", "€464 for 1-10 MWh, €380 above 10 MWh {figgener2023} {code_wear}."],
        ["Caveats", "2022 means, excluding VAT, for EUR sites only; prices have fallen since, so wear is overstated. Sites priced in another currency get no default and report life only, unless you enter a cost {code_wear}."],
      ] },
      { kind: "p", text: "The MPC needs a price per kWh, not a life, to decide whether a cycle is worth it. Only cycling depends on the controller, so wear.wear_price_per_kwh() measures the cycle-ageing loss per full cycle on a reference of one full 0-100% cycle a day at the battery's temperature, and divides by the capacity that may be lost {code_wear}:" },
      { kind: "math", tex: String.raw`w = c_{\text{repl}} \cdot \frac{\text{capacity lost per full cycle}}{1 - \text{end-of-life capacity}}`,
        caption: String.raw`At €1,200 per kWh and 25 °C this is about €0.148 per kWh for LFP and €0.49 for NMC {code_wear} {deep_calc}. The page '8. Putting a price on wear' shows how the MPC uses it.` },

      { kind: "h", text: "Worked numbers" },
      { kind: "facts", rows: [
        ["One full cycle a day, 25 °C", "LFP lasts about 6,150 cycles (19 years) to 80%; NMC about 2,260 cycles (7 years) {code_wear} {runs_2026_11c}."],
        ["Depth", "In the LFP model wear per full cycle is almost the same from 10% to 100% depth (2.8 to 3.1 × 10⁻⁵ of capacity); in the NMC model it rises from 4.4 × 10⁻⁶ at 10% to 7.8 × 10⁻⁵ at 100% {runs_2026_11f}."],
        ["A real year", "Four German homes with a 10 kWh LFP battery on the self-consumption rule: median 180 full cycles a year, expected life about 32 years, wear €374 a year {ex_year}."],
        ["Check the arithmetic", "€1,200 × 10 kWh ÷ 32 years ≈ €375 a year {gs_calc}."],
        ["A June week", "MPC pricing wear: energy €12.32 + wear €7.64; MPC ignoring wear: €10.06 + €10.34 {runs_2026_11d}."],
      ] },
      { kind: "note", tone: "warn", text: "An idle battery that starts empty shows almost no wear: in the LFP model a battery kept at 0% barely loses capacity {runs_2026_11c}. Since the default starting charge is 0 {code_model}, an 'idle' baseline looks nearly free. A real unused battery sits at some charge and ages with time, so wear savings measured against idle look slightly too good (see 'Limits')." },

      { kind: "h", text: "Standby losses" },
      { kind: "p", text: "Real battery systems draw power even when idle, for their electronics and battery management. The 2026 HTW Berlin test of 12 home systems measured standby draws from 4 to 64 W {htw_inspektion2026}. Over a year that is 4 W × 8,760 h ≈ 35 kWh to 64 W × 8,760 h ≈ 561 kWh {gs_calc}. Compare that with what a home battery moves: 180 full cycles of 10 kWh is about 1,800 kWh a year {ex_year} {gs_calc}. At the high end, standby would eat almost a third of the battery's useful throughput. Site Lab does not model standby draw or self-discharge, which flatters batteries slightly {code_engine}." },

      { kind: "h", text: "What Site Lab leaves out" },
      { kind: "list", items: [
        "Voltage, current and resistance: efficiency does not depend on power, and full power is available at any state of charge {code_engine}.",
        "Temperature is a constant you set (default 25 °C); the LFP model was fitted between 10 and 45 °C {code_model} {blast_lite}.",
        "Fast charging: both cells were tested at gentle rates, so high C-rates are outside what the models know {blast_lite}.",
        "Uneven ageing of cells inside one system, and the depth-dependent wear that a flat price per kWh cannot see: see '8. Putting a price on wear' and market-dispatch research on cycle-ageing costs {xu2017}.",
        "Inverter replacement, installation and system design choices; a review of stationary storage design covers those {hesse2017}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: open #operate_home_ev-mpc-run, click the battery and switch Cell chemistry between lfp and nmc, or set Replacement cost to 600, and watch the wear cost and expected life in the Results strip." },
    ],
  },

  // ------------------------------------------------------------------ 4. EV charging
  {
    id: "g-ev", section: "guide", title: "4. EV charging: power, phases, sessions and strategies",
    summary: "How an AC wallbox and a car agree on power, why 6 A is the floor, how Site Lab turns measured charging sessions from Norway and the Netherlands into car visits, what each charging strategy does, and how a bidirectional car can lend energy without leaving its driver short.",
    blocks: [
      { kind: "p", text: "A parked electric car is a large, flexible load: it typically needs a few hours of charging but stays plugged in much longer. Whether that flexibility is used depends on three things this chapter explains: the electrical limits (phases, currents, the car's own charger), the behaviour of drivers (when they arrive, how long they stay, how much they need), and the strategy that decides when to charge." },

      { kind: "h", text: "How AC charging works" },
      { kind: "p", text: "At home and at work, cars charge on alternating current (AC). The wallbox does not convert anything; it tells the car how much current it may draw, and the car's onboard charger converts AC to DC for the battery. The signal is the control pilot defined in IEC 61851-1: a duty cycle of 10% means 6 A, the lowest current a charger may offer; below that the charger must pause instead {iec61851}. The power is then phases × voltage × current:" },
      { kind: "math", tex: String.raw`P = n_{\phi} \cdot 230\ \text{V} \cdot I, \qquad P_{\min}^{3\phi} = 3 \times 230 \times 6\ \text{A} = 4.14\ \text{kW}, \qquad P_{\min}^{1\phi} = 230 \times 6\ \text{A} = 1.38\ \text{kW}`,
        caption: String.raw`\(n_{\phi}\) is the number of phases the car draws on. 16 A on three phases is about 11 kW, Site Lab's default charger {code_model} {iec60038}; the 6 A floor is 4.14 kW on three phases and 1.38 kW on one {iec61851} {gs_calc}.` },
      { kind: "p", text: "That floor matters for control. A three-phase car cannot charge 'a little' from 2 kW of spare solar: it is either off or at least 4.14 kW. Chapter 15, 'Optimisation from scratch: linear programs', explains why this 'off or at least 6 A' rule is hard for an optimiser." },

      { kind: "h", text: "The charger in Site Lab" },
      { kind: "facts", rows: [
        ["Max charging power", "11 kW by default, from CityLearn's EV schema {code_model}."],
        ["Charging efficiency", "0.95: the share of grid energy that reaches the car battery {code_model}."],
        ["Phases", "1 or 3; single-phase chargers, and single-phase cars on a three-phase charger, use the phase you pick {code_model}."],
        ["Minimum current", "6 A per phase (IEC 61851-1) {code_model} {iec61851}."],
        ["Bidirectional", "Off by default; when on, a plugged-in car may give energy back (below) {code_model}."],
        ["Sessions", "Which cars arrive, when they leave and how much energy they ask for {code_model}."],
      ] },
      { kind: "p", text: "When a car arrives, engine.simulate() works out its limits with car_limits(): its maximum is the lower of the charger's rating and the car's own power (from the dataset, if known); if that maximum is below the three-phase minimum of 4.14 kW, the car is assumed to charge single-phase on the charger's phase; its minimum is 6 A on the phases it uses {code_engine}. Each step the engine then clips whatever the controller asks for: never more than the car's maximum or the energy it still needs, and if the request falls below the minimum current the charger pauses, unless the car only needs a last small top-up {code_engine}." },
      { kind: "p", text: "Worked example: the car of the German home example (a resident of garage ASK, spot 7, in the Norwegian dataset) has an estimated power of about 7.25 kW {gs_data}. That is above 4.14 kW, so Site Lab treats it as a three-phase car drawing 7.25 kW ÷ (3 × 230 V) = 10.5 A per phase {code_engine} {gs_calc}; the highest phase current in the June week was 10.8 A {gs_runs}. Its first recorded visit, on 18 November 2018, plugged in at 22:30, left at 06:46 and took 23.7 kWh {gs_data}. At full power that needs 23.7 ÷ (7.25 × 0.95) = 3.4 hours of the 8.3 hours parked: almost five hours of slack a strategy can play with {gs_calc}." },

      { kind: "h", text: "Where the car visits come from" },
      { kind: "p", text: "Drivers are the hardest part to model, so Site Lab uses measured sessions: plug-in time, plug-out time and energy delivered. Two open datasets provide them; a third set, CityLearn's EV schedules, is used in the Plan examples but looks synthetic {data_registry}." },
      { kind: "facts", rows: [
        ["Homes: SINTEF, Norway", "35,000 charging sessions of residents in 12 shared residential garages, CC BY 4.0 {data_registry} {sorensen2023}. The dataset's authors estimate each user's charging power and battery size; these are estimates, not measurements {sorensen2023} {gs_code_ev}."],
        ["Workplace: University of Twente / ElaadNL", "Sessions at an office car park in Utrecht with about 300 charge points, licence CC BY-NC-SA 4.0: fine for research, not for a commercial product {data_registry}. Car power is not recorded; chargers give up to 11 kW per plug when shared, and from March 2023 part of the car park was already smart-charged {gs_code_ev}."],
      ] },
      { kind: "p", text: "The loaders in src/emsbench/data/sintef.py and utwente.py keep only regular users with at least 150 sessions, so a chosen spot has a car most days; convert local time with summer time to fixed CET; and, for Twente, drop charging cards the dataset lists as shared plus any card averaging more than two sessions per weekday, our rule for spotting fleet cards {gs_code_ev}. What is left differs sharply between home and work {gs_data}:" },
      { kind: "facts", rows: [
        ["Norway, homes", "81 regular users, 24,951 sessions, February 2018 to August 2021. Median 8.1 kWh per visit, parked a median 11.0 hours, median arrival hour 16:00 CET {gs_data}."],
        ["Utrecht, office", "64 regular drivers, 13,892 sessions, August 2020 to October 2024. Median 16.5 kWh per visit, parked 7.8 hours, median arrival hour 07:00 CET {gs_data}."],
      ] },
      { kind: "p", text: "Home cars arrive in the afternoon or evening and stay overnight, which is why residential charging has a considerable potential to shift from afternoon and evening into the night {sorensen2023}. Office cars arrive in the morning and overlap with solar. Caltech's workplace dataset has been used the same way, to learn user behaviour and size on-site solar for adaptive charging {lee2019acn}." },
      { kind: "p", text: "In the engine, each session becomes an arrival step, a departure step and an energy request; the dates are mapped onto the simulated period by season and weekday {code_profiles} {code_engine}. A car that arrives while the charger is still occupied is skipped and the run warns about it. When a car leaves, the energy it asked for but did not get is recorded as unmet; a car still plugged in at the end has unknown unmet energy {code_engine}." },

      { kind: "h", text: "Charging strategies" },
      { kind: "p", text: "Four rules are built in, implemented in ev_power() in src/emsbench/sim/controllers.py {code_ctrl}. All four share one safety override: if the hours left are no more than the hours needed at full power, the car charges at full power whatever the strategy {code_ctrl}." },
      { kind: "facts", rows: [
        ["As fast as possible", "Full power from arrival until done. The baseline every smart strategy is compared with {code_ctrl}."],
        ["Spread until departure", "The lowest steady power that still finishes on time, but at least the minimum current {code_ctrl}."],
        ["Cheapest hours", "Count the steps needed at full power, look at the prices until departure, and charge in the cheapest of those steps {code_ctrl}."],
        ["Solar surplus", "Charge from spare solar only, and only if that reaches the minimum current; full power when time runs out {code_ctrl}."],
      ] },
      { kind: "p", text: "Measured on the June example week with the home battery idle, so only the car's timing changes: all strategies delivered 92.6 kWh over 9 visits with no car left short; as fast as possible cost €29.32, cheapest hours €26.18 (10.7% less), solar surplus €26.15, and spreading €28.21 but with a peak of 4.8 kW instead of 7.5 kW {ex_week}. Over a full year in four homes, cheapest hours saved a median €149 with no battery at all {ex_year}. Cheapest hours needs to know when the car leaves; Site Lab assumes the driver enters it at plug-in, as in a charging app {code_forecasts}. Open products work the same way: evcc offers solar-surplus charging and charging plans with a target time {evcc_solar} {evcc_plans}." },
      { kind: "note", tone: "warn", text: "Many cheap cars together make a new peak. In the shared-garage example, cheapest hours started all eight cars in the same cheap quarter-hours and pushed the busiest phase from 56 A to the full 63 A {runs_2026_11}. The literature calls synchronised charging an avalanche effect; capacity-based pricing is one proposed fix {valogianni2025}. Uncontrolled charging affects the local grid through voltage, losses, phase unbalance and transformer ageing {alogaili2019}." },
      { kind: "p", text: "The MPC (chapter 16, 'Site Lab's MPC, exactly as implemented') does not use these rules: it plans every charger together with the battery over the next hours and re-plans immediately when a car arrives {code_model} {code_mpc}." },

      { kind: "h", text: "Bidirectional charging (V2H)" },
      { kind: "p", text: "A bidirectional charger lets a parked car send energy back to the home (vehicle-to-home, V2H) or the grid (V2G). Early work computed what capacity and net revenue a car could offer the grid {mkt_kempton2005}; commercial V2H offers for Germany were announced for 2026 {mkt_v2g}. In Site Lab a charger marked bidirectional is assumed to be a DC charger, so the 6 A minimum of AC charging does not apply to discharging {code_model}. The engine allows lending only what can be won back {code_engine}:" },
      { kind: "math", tex: String.raw`\text{slack}_t = (k_{\text{dep}} - t - 1)\, P_{\max}\, \Delta t\, \eta - E_{\text{rem}}, \qquad \text{lend}_t = \max\!\big(0,\ \min(\text{slack}_t,\ E^{\text{visit}}_{\max} - E^{\text{lent}})\big)`,
        caption: String.raw`\(k_{\text{dep}}\) departure step, \(P_{\max}\) the car's maximum power, \(\eta\) charger efficiency, \(E_{\text{rem}}\) energy the car still needs, \(E^{\text{visit}}_{\max}\) the per-visit limit (10 kWh by default, an example choice) and \(E^{\text{lent}}\) what was already lent this visit. The car may discharge at most \(\text{lend}_t\,\eta/\Delta t\), and never more than its maximum power {code_engine} {code_model}.` },
      { kind: "p", text: "Energy lent is added to what the car still needs, with the charger's losses applied both ways {code_engine}. The rule 'high_prices' in controllers.py decides when to lend: only when the price is in the dearer half of the next 24 hours, only when the price now beats the cheapest price before departure divided by the efficiency squared (otherwise the round trip loses money), only to cover what the site still imports after the battery, and only so much that the car can be recharged in half of its remaining stay {code_ctrl}. In the January heat pump example the car gave back 7.3 kWh in the week and every visit still left with the energy it asked for {gs_runs} {mkt_runs_hp}. The MPC does not discharge cars yet {code_model}. More on the page 'Bidirectional charging (V2H and V2G)'." },

      { kind: "h", text: "What Site Lab leaves out" },
      { kind: "list", items: [
        "The slowdown as a car's battery approaches full (charging taper); the car's own state of charge is not modelled, only the energy it asks for (see 'EV charging').",
        "Which phases a real car uses: inferred from its power only {code_engine}.",
        "DC fast charging and public charging; realistic simulators such as ACN-Sim also model battery charging behaviour and unbalanced three-phase infrastructure {lee2020acnsim}.",
        "Aggregators and markets around EV fleets, which the early framework of EV grid integration sets out {lopes2010}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: open #operate_home_ev-run, set Battery strategy to Idle and switch the EV charging strategy. Then open #operate_shared_garage-run and look at the phase currents in the chart with cheapest hours versus spread until departure." },
    ],
  },

  // ------------------------------------------------------------------ 5. Heat pumps and data centers
  {
    id: "g-heat-dc", section: "guide", title: "5. Heat pumps and data centers",
    summary: "Two loads with very different flexibility: a heat pump whose efficiency follows the weather and whose tank lets it run early, and a data center whose servers set the load, whose cooling is a multiple of it, and whose UPS battery can shave peaks.",
    blocks: [
      { kind: "p", text: "Heat pumps and data centers both turn electricity into, or out of, heat, and both are modelled in Site Lab as a measured or synthetic demand times a factor: heat divided by a coefficient of performance for the heat pump, IT power times a power usage effectiveness for the data center. The interesting part is what each factor hides, and where the flexibility sits." },

      { kind: "h", text: "Heat pumps: moving heat instead of making it" },
      { kind: "p", text: "A heat pump moves heat from outside air (or the ground) into the house. Its coefficient of performance (COP) is the kWh of heat delivered per kWh of electricity; a field review of domestic heat pumps compared published efficiency figures with real operation {mkt_staffell2012}. The COP falls when the temperature gap the pump must bridge grows: colder air outside, or hotter water inside." },
      { kind: "math", tex: String.raw`\mathrm{COP} = \frac{Q_{\text{heat}}}{W_{\text{el}}}, \qquad W_{\text{el}} = \frac{Q_{\text{heat}}}{\mathrm{COP}}`,
        caption: String.raw`\(Q_{\text{heat}}\) heat delivered, \(W_{\text{el}}\) electricity used, over the same interval.` },

      { kind: "h", text: "Where the heat numbers come from: When2Heat" },
      { kind: "p", text: "Site Lab's heat demand and COP come from When2Heat, an open dataset of synthetic national hourly time series {mkt_when2heat}. As its authors describe the method {gs_ruhnau2019}:" },
      { kind: "list", items: [
        "Heat demand follows the German gas standard load profile method (BGW and BDEW), driven by reanalysis temperature and wind at each grid location, then weighted by population and scaled to national statistics {gs_ruhnau2019}.",
        "The COP comes from quadratic curves fitted to manufacturer data, as a function of the gap between the heat sink (the water the house needs) and the heat source (outside air, or the ground minus 5 K) {gs_ruhnau2019}.",
        "Sink temperatures follow heating curves: radiators 40 °C minus the outdoor temperature, floor heating 30 °C minus half of it, hot water a constant 50 °C, with a gap of at least 15 K {gs_ruhnau2019}.",
        "All COPs are multiplied by 0.85, because manufacturer data are measured under ideal conditions; the factor corresponds to field measurements {gs_ruhnau2019}.",
      ] },
      { kind: "math", tex: String.raw`\mathrm{COP}_{\text{air}} = 0.85\,\big(6.08 - 0.09\,\Delta T + 0.0005\,\Delta T^2\big), \qquad \mathrm{COP}_{\text{ground}} = 0.85\,\big(10.29 - 0.21\,\Delta T + 0.0012\,\Delta T^2\big)`,
        caption: String.raw`\(\Delta T\) is sink minus source temperature in K. The curves are from the 2019 paper {gs_ruhnau2019}; the 2023 data version Site Lab uses switched to ERA5 weather and increased the precision of the COP curves, so its exact coefficients may differ slightly {gs_w2h_2023}.` },
      { kind: "facts", rows: [
        ["Air source, radiators, −5 °C outside", "Sink 40 + 5 = 45 °C, gap 50 K: 0.85 × (6.08 − 4.50 + 1.25) = 2.41 {gs_calc}."],
        ["Same, +5 °C outside", "Sink 35 °C, gap 30 K: 0.85 × (6.08 − 2.70 + 0.45) = 3.26 {gs_calc}."],
        ["Floor heating, −5 °C", "Sink 32.5 °C, gap 37.5 K: 0.85 × 3.41 = 2.90 {gs_calc}."],
        ["Hot water, −5 °C", "Sink 50 °C, gap 55 K: 0.85 × 2.64 = 2.25 {gs_calc}."],
      ] },
      { kind: "p", text: "The loader src/emsbench/data/when2heat.py turns the dataset into two kinds of profile per country (Germany, the Netherlands, France, Denmark) {mkt_heat_code}. A 'heat' profile is space heating plus hot water for a single- or multi-family house, in kW per kWh of annual demand, mixed in the ratio of the dataset's national totals. A 'cop' profile is the effective COP of that mix for an air- or ground-source pump with radiators or floor heating: total heat divided by (space heat ÷ space COP + water heat ÷ water COP) each hour {mkt_heat_code}. The data is hourly and covers 2008-2022, so 15-minute runs repeat each hour and use the same season and weekday from a covered year {data_registry} {code_profiles}. The default annual demand is 15,730 kWh, the average gas use of a 130 m² German single-family house in the Heizspiegel 2025; gas use includes boiler losses, so real heat demand is a little lower {mkt_heizspiegel} {code_model}." },

      { kind: "h", text: "The heat pump in the engine" },
      { kind: "steps", items: [
        "Heat demand = profile × annual demand; COP from its profile, floored at 1; electricity needed on demand = heat ÷ COP {code_engine}.",
        "If no size is given, the heat pump is sized to the coldest step of the period, rounded up to 0.1 kW, which leaves no spare power for pre-heating {code_engine} {code_model}.",
        "The controller asks for a power. The engine keeps it between 'just enough to meet demand with what is in the tank' and 'until the tank is full', and never above the heat pump's size {code_engine}.",
        "The tank's stored heat changes by (COP × power − demand) × time step. If it would go below empty, the shortfall is recorded as unmet heat and the run warns {code_engine}.",
        "Heat pumps are not slowed by the import-limit or fuse checks, but grid-operator dimming (chapter 6) can limit them {code_engine}.",
      ] },
      { kind: "math", tex: String.raw`B_{t+1} = \min\!\Big(B_{\max},\ \max\big(0,\ B_t + (\mathrm{COP}_t\, P^{\mathrm{hp}}_t - Q_t)\,\Delta t\big)\Big)`,
        caption: String.raw`\(B\) heat stored in the tank (kWh of heat), \(P^{\mathrm{hp}}\) electric power, \(Q\) heat demand {code_engine}. The default tank of 7 kWh is a 300-litre water tank used over 20 K: 300 kg × 20 K × 4.19 kJ/(kg·K) = 7.0 kWh {code_model}.` },
      { kind: "p", text: "Three strategies exist (hp_power() in controllers.py) {code_ctrl}: on demand (the tank is not used), cheap hours (fill the tank when the price is in the cheapest quarter of the next 24 hours, draw on it in the dearest quarter) and solar surplus (put spare solar into the tank). With the MPC, heat pumps run on demand; the planner does not schedule them yet {code_model}." },
      { kind: "facts", rows: [
        ["Worked example", "German home, 12-18 January 2026: 6 kW air-source heat pump with radiators, 14 kWh tank, cheap-hours strategy {gs_runs}."],
        ["Heat and electricity", "650.8 kWh of heat for 251.0 kWh of electricity: a week-average COP of 2.59 {gs_runs}."],
        ["COP range in the week", "2.43 to 2.98 per hour; at the coldest step 5.41 kW of heat needed 5.41 ÷ 2.43 = 2.23 kW of electricity {gs_runs} {gs_calc}."],
        ["Comfort", "No unmet heat {gs_runs}."],
        ["Peak", "13.8 kW, up from 11.6 kW, because pre-heating and car charging met in the same cheap hours {mkt_runs_hp} {gs_runs}."],
      ] },
      { kind: "note", tone: "warn", text: "Limits. National profiles are smoother than one house, and population weighting ignores regional differences in insulation {gs_ruhnau2019}. There is no building thermal model: comfort means 'heat delivered' {code_engine}. And charging a tank at cheap hours raises the water temperature and lowers the COP in reality {gs_ruhnau2019}, while Site Lab uses the same hourly COP whether the tank is being filled or not {code_engine}, which flatters pre-heating." },

      { kind: "h", text: "Data centers: IT load and PUE" },
      { kind: "p", text: "A data center's load is its IT equipment (servers, storage, network) plus everything that keeps it running: cooling, fans, pumps, lights and electrical losses. The overhead is summarised by the power usage effectiveness (PUE): total facility power divided by IT power, standardised in ISO/IEC 30134-2 {iso30134} {uptime_2025}. The 2025 industry average was 1.54, almost unchanged for six years; 1.48 for facilities built in the last five years and 1.44 for sites of 20 MW and above {uptime_2025}." },
      { kind: "math", tex: String.raw`P_{\text{facility}} = \mathrm{PUE} \cdot P_{\mathrm{IT}}, \qquad P_{\text{overhead}} = (\mathrm{PUE} - 1)\, P_{\mathrm{IT}}`,
        caption: String.raw`Site Lab's Data center element draws IT load × IT scale × PUE, with PUE defaulting to 1.54; the engine reports IT and overhead separately {code_model} {code_engine}.` },
      { kind: "p", text: "The IT load is measured: NREL's ESIF high-performance computing data center in Colorado publishes IT power, cooling, HVAC, pumps and lights under CC BY 4.0 {esif_pue}. The loader src/emsbench/data/esif.py averages the roughly one-minute samples to 15 minutes, interpolates gaps up to two hours, keeps the current machine's era (from 2024) and only uninterrupted stretches of at least 90 days, and adds the constant 2.67 kW tower filter pump that the dataset's README lists separately {gs_code_esif}. ESIF is a warm-water liquid-cooled centre with a measured PUE of about 1.07-1.08 (facility energy over IT energy in the profiles we use), far better than typical, which is why the example multiplies its IT load by the industry-average PUE instead of using its facility profile {data_registry} {gs_code_esif}." },
      { kind: "facts", rows: [
        ["Worked example", "The data center example, June 2026 (IT data from April-August 2024 mapped onto it), battery idle {gs_runs}."],
        ["IT load", "Average 2,954 kW, between 597 and 3,648 kW: an HPC load that is flat over the day but jumps with jobs {gs_runs} {gs_code_esif}."],
        ["Energy", "IT 2,127 MWh; facility 3,275 MWh; overhead 1,149 MWh, 54% of the IT energy, exactly PUE − 1 {gs_runs} {gs_calc}."],
        ["Peak", "5,618 kW = 3,648 kW × 1.54 {gs_runs} {gs_calc}."],
      ] },
      { kind: "note", tone: "warn", text: "PUE is held constant, so cooling follows the IT load but not the weather; real cooling rises on hot afternoons {code_model}. That understates summer peaks, exactly when the example's tariff charges most for them." },

      { kind: "h", text: "The UPS battery" },
      { kind: "p", text: "Data centers keep an uninterruptible power supply (UPS) that bridges a grid failure until generators start. A battery vendor reports that many data centers run with about 5 minutes of UPS runtime and that generators come online in under 50 seconds {zincfive2024}. The example sizes the reserve from that: 5 minutes at a peak facility load of 3,780 kW × 1.54 = 5,820 kW is 485 kWh, 12.1% of a 4,000 kWh battery, rounded up to a 12.5% minimum state of charge (500 kWh) {ex_dc} {gs_calc}. Below the minimum no strategy can reach the energy, and in every June run the battery never went below 12.5% {code_engine} {ex_dc}. The generator and an actual outage are not simulated." },
      { kind: "p", text: "Above the reserve the battery can shave peaks. With demand charges that were almost half the June bill, a fixed threshold saved 1.1% and an MPC with perfect forecasts 5.4%; chapter 6 and the example 'Demand charges: one quarter-hour sets the month's bill' explain why {ex_dc}." },

      { kind: "h", text: "Data center flexibility beyond the battery" },
      { kind: "list", items: [
        "A 2025 review argues that data centers' large but controllable consumption makes them a significant source of flexibility, provided quality-of-service agreements are respected and market rules let them take part {takci2025}.",
        "Compute in time: Google's day-ahead 'virtual capacity curves' cap each cluster's hourly capacity for flexible jobs while keeping the daily total {google_vcc}.",
        "Compute on demand: a software-only field test on a 256-GPU cluster cut cluster power by 25% for three hours during peak grid events {emerald2025}.",
        "Cooling: DeepMind reported that learned models recommending cooling actions cut cooling energy by up to 40% {deepmind2016}.",
        "Grid planning: letting AI data centers shift compute in time and place reduced grid investment and operating costs by 3-21% in one capacity-expansion study {chen2026}.",
      ] },
      { kind: "p", text: "Site Lab models none of these yet: no deferrable jobs, no cooling control, only the battery {code_model}." },
      { kind: "note", tone: "info", text: "Try it: open #operate_home_heatpump_v2h-run and watch the tank fill before the dearest hours; set Heat pump strategy to on_demand to compare. Then open #operate_data_center-run, click the data center and try a PUE of 1.08 to see how much of the load is cooling." },
    ],
  },

  // ------------------------------------------------------------------ 6. Prices, tariffs and rules
  {
    id: "g-markets", section: "guide", title: "6. Prices, tariffs and rules",
    summary: "How the day-ahead auction sets 15-minute prices (and why they go negative), what makes up a German household price, dynamic tariffs, the feed-in tariff and its negative-price rule, §14a dimming and time-variable network fees, US demand charges, and exactly which Site Lab setting represents each.",
    blocks: [
      { kind: "p", text: "Control strategies chase money, so the tariff decides what 'smart' means. The same battery that saves money on one tariff loses it on another. This chapter explains the European wholesale market that dynamic tariffs follow, the parts of a retail price that do not move, the German rules for solar exports and grid-operator control, and the American demand charge, and ends with a map from each rule to the setting that represents it in Site Lab." },

      { kind: "h", text: "The day-ahead auction" },
      { kind: "p", text: "Most electricity in Europe is priced the day before delivery, in the single day-ahead coupling (SDAC): power exchanges across Europe run one coupled auction, and each bidding zone (Germany and Luxembourg form one) gets its price for every period of the next day. Bids close at 12:00, and final results were published at 12:58, with 13:01 proposed for the 2025 timings {mesc2024}. Since delivery day 1 October 2025 the products are 15 minutes long instead of an hour (first trading 30 September 2025) {sdac_15min}. Prices may range between harmonised limits: a reference maximum of +4,000 €/MWh and a reference minimum of −500 €/MWh, which are adjusted automatically when prices come close to them; the minimum falls by 100 €/MWh after prices go below 70% of it in at least two periods on two different days within 30 days {gs_acer_hmmcp}." },
      { kind: "p", text: "In Site Lab the prices are fetched by src/emsbench/data/energycharts.py from the Energy-Charts API (data from Bundesnetzagentur | SMARD.de) for Germany-Luxembourg, the Netherlands, France and western Denmark, from October 2025, converted from €/MWh to €/kWh and kept only if the API states an open CC BY licence; the Norwegian zone was rejected because its terms are 'private and internal use only' {gs_code_prices} {data_registry}." },
      { kind: "facts", rows: [
        ["Germany, 1 Oct 2025 to 7 Nov 2026", "Lowest −0.49999 €/kWh on 1 May 2026, five quarter-hours from 12:15 CET: the −500 €/MWh floor. Highest 0.747 €/kWh on 24 June 2026 at 19:45 CET {gs_data}."],
        ["How often negative", "2,059 quarter-hours (5.3%); in the last 12 months 465 hours. 90% of negative quarter-hours fell between 09:00 and 17:00 CET, the most in April, none in November or December {gs_data}."],
        ["Typical level", "Last 12 months: median 11.1 ct/kWh, 10th percentile 1.4 ct, 90th percentile 19.5 ct; on a median day the cheapest quarter-hour was 4.1 ct and the dearest 18.6 ct {gs_data}."],
      ] },
      { kind: "p", text: "Negative prices are a solar story in this data: they cluster at sunny middays in spring and summer, when solar output exceeds what the market wants and some producers would rather pay than stop {gs_data}. The practical example 'Negative prices and the 2025 solar rule' shows what a sunny weekend does to a home's feed-in income." },
      { kind: "p", text: "For controllers, the timing of publication matters. With realistic forecasts, Site Lab tells a controller tomorrow's prices only from 13:00 on its clock; before that it knows prices to midnight, and beyond the last known day it repeats that day {code_forecasts}. Site Lab's European clock is fixed CET, so in summer this waits an hour longer than reality {code_forecasts}." },

      { kind: "h", text: "What a household actually pays" },
      { kind: "p", text: "The spot price is only part of a retail price. Eurostat splits average prices into three components: energy and supply, network costs, and taxes, fees, levies and charges; the third already includes VAT, so energy + network + taxes reproduces Eurostat's published all-in price within about 0.5% {gs_code_eurostat} {eurostat_check}." },
      { kind: "math", tex: String.raw`\underbrace{0.1481}_{\text{energy, supply}} + \underbrace{0.1130}_{\text{network}} + \underbrace{0.1241}_{\text{taxes incl. VAT}} = 0.3852\ \text{EUR/kWh}`,
        caption: String.raw`German households using 2,500-4,999 kWh a year, 2025 (Eurostat nrg_pc_204_c, band DC); VAT is 0.0615 of the taxes {eurostat_check} {gs_data}. Network costs and taxes together are 62% of the price and do not follow the market.` },
      { kind: "p", text: "A dynamic tariff passes the spot price through and adds everything else. German law requires every electricity supplier to offer one to customers with a smart meter since 1 January 2025 {mkt_enwg41a}, implementing an EU rule that final customers with a smart meter can ask for a dynamic price contract {mkt_eu2019_944}. A real German price sheet adds a supplier price of 2.50 ct/kWh net to the spot price, on top of fees, levies and VAT {witten_tariff}." },
      { kind: "p", text: "Site Lab builds the same thing from a spot profile plus a 'price adder' per kWh. The German home examples use 0.1130 (network) + 0.1241 (taxes incl. VAT) + 0.02975 (the 2.50 ct margin with VAT) = 0.26685 €/kWh {code_engine} {eurostat_check} {witten_tariff}. In the app, the tariff section suggests Eurostat's network + taxes as a household or business add-on for the chosen price zone (businesses excluding VAT, which they usually recover) {gs_code_eurostat}." },
      { kind: "facts", rows: [
        ["Cheapest moment of the June example week", "−5.3 ct spot + 26.7 ct adder ≈ 21.4 ct per kWh imported: a negative spot price is not free power for a household {ex_calc} {gs_calc}."],
        ["Dearest quarter-hour in the data", "74.7 ct spot + 26.7 ct ≈ 101.4 ct per kWh {gs_data} {gs_calc}."],
        ["Approximation", "On the supplier's sheet, the gross price is the net price plus VAT {witten_tariff}; in Site Lab the VAT is a fixed amount inside the adder (Eurostat's average), so it does not rise and fall with the spot price {code_engine} {eurostat_check}."],
      ] },
      { kind: "p", text: "Worked example, why fees matter for a battery: on a median day, buying 10 kWh at the cheapest quarter-hour costs 10 × (4.1 + 26.7) ct = €3.08; after losses 9.0 kWh come back and replace imports at the dearest quarter-hour, 9 × (18.6 + 26.7) ct = €4.08 {gs_data} {gs_calc}. The €1.00 gain is before wear; at the LFP wear price of about €0.148 per kWh cycled, split as the MPC does, wear is about 0.074 × (10 + 9) ≈ €1.41, and the cycle loses money {code_wear} {gs_calc}. It is also optimistic: a 5 kW battery needs two hours to take 10 kWh, not one quarter-hour. The 10% loss is charged on the full 30 ct import price, not on the 4 ct spot price; that is why grid arbitrage rarely pays for households in Germany." },

      { kind: "h", text: "Feed-in tariff and the negative-price rule" },
      { kind: "p", text: "Solar exported from a German home earns a feed-in tariff under the renewable energy law (EEG). For a new rooftop system up to 10 kWp with partial feed-in, commissioned between 1 August 2025 and 31 January 2026, it is 7.86 ct/kWh {bnetza_eeg}. Since the 2025 'Solarspitzengesetz', § 51 EEG reduces the payment to zero for periods in which the spot price is negative, for systems below 100 kW from the year after a smart meter is fitted {eeg51} {code_model}. New systems below 25 kW without a smart meter may feed in at most 60% of their power {eeg9}; Site Lab does not model that cap, because dynamic tariffs require a smart meter anyway (see 'Limits')." },
      { kind: "math", tex: String.raw`x_t = \begin{cases} x_{\text{FiT}} & \text{if } p^{\text{spot}}_t \ge 0 \text{ or the rule is off} \\[6pt] 0 & \text{if } p^{\text{spot}}_t < 0 \text{ and the rule is on} \end{cases}`,
        caption: String.raw`The export price per step in engine.simulate(): the tariff's export price \(x_{\text{FiT}}\) (7.86 ct in the German examples), set to zero in steps with a negative spot price when 'No export pay at negative spot prices' is ticked {code_engine} {eeg51}.` },
      { kind: "p", text: "In the June example week that rule cost €3.89: 49.5 kWh were exported while the spot price was negative, more than half the week's feed-in income {ex_week} {ex_calc}. The feed-in tariff is also why self-consumption is worth money: a stored kWh gives up 7.86 ct of export income and saves about 30 ct of import. HTW Berlin pointed out the same shift in 2013, when feed-in tariffs for small systems had fallen below household retail prices {weniger2014}." },

      { kind: "h", text: "§14a: grid-operator dimming and time-variable network fees" },
      { kind: "p", text: "Germany lets distribution grid operators limit large controllable devices in the low-voltage grid when the grid is stressed, in exchange for lower network fees. The rules (Bundesnetzagentur decision BK6-22-300, applying from 1 January 2024) cover private EV charge points, heat pumps, room cooling and batteries while charging, each above 4.2 kW {mkt_bnetza_14a}. A directly controlled device keeps at least 4.2 kW (heat pumps and air conditioning above 11 kW keep 0.4 × their power); devices behind an energy management system share one allowance {mkt_bnetza_14a}:" },
      { kind: "math", tex: String.raw`P_{\min}^{\text{EMS}} = 4.2\ \text{kW} + (n - 1) \cdot f_n \cdot 4.2\ \text{kW}, \qquad n = 3,\ f_3 = 0.75: \quad 4.2 + 2 \times 0.75 \times 4.2 = 10.5\ \text{kW}`,
        caption: String.raw`\(n\) controllable devices, \(f_n\) the simultaneity factor (0.8 for two devices down to 0.45 for nine or more) {mkt_bnetza_14a}. Example: an 11 kW wallbox, a 6 kW heat pump and a 5 kW battery (all above 4.2 kW) keep 10.5 kW together under EMS control, against 3 × 4.2 = 12.6 kW if each is limited directly {gs_calc}.` },
      { kind: "p", text: "In Site Lab, the grid connection's 'Grid-operator dimming' setting (off, direct or ems) applies these limits in a daily window, 17:00 for two hours by default, after the controller acts and before the import-limit and fuse checks; with ems, the allowance goes to heat first, then cars, then battery charging, and a charger that cannot get its 6 A pauses {code_engine} {code_model}. Real dimming is rare and comes at short notice, so the daily window is a stress test, not a forecast {code_model}. The energy cut is reported as dimmed kWh {code_engine}." },
      { kind: "p", text: "The other half of the deal is the network fee. Since 1 April 2025 grid operators must offer households with a controllable device and a smart meter a three-tier time-variable network fee (Modul 3), with windows each operator sets {mkt_14a}. Site Lab has two real 2026 price sheets as profiles, built by src/emsbench/data/netfees.py and added to every imported kWh {mkt_netfee_code}:" },
      { kind: "facts", rows: [
        ["Netzgesellschaft Düsseldorf", "Low 3.16 ct/kWh (04:30-05:00), standard 7.91, high 8.19 (18:00-20:00); low and high tiers in the first and fourth quarter only {mkt_sheet_dus}."],
        ["Stadtwerke Mosbach", "Low 3.65 ct/kWh (01:00-05:00), standard 9.31, high 11.90 (09:00-11:00 and 17:00-20:00); low and high in Q1 and Q4 {mkt_sheet_mos}."],
        ["How to combine", "Use the fee profile and leave the network part out of the price adder; the January heat pump example does exactly that (adder 0.15385 = taxes + margin) {code_model} {mkt_netfee_code}."],
        ["Not modelled", "The fixed Modul 1 reduction, which does not depend on operation {mkt_netfee_code}."],
      ] },

      { kind: "h", text: "Demand charges" },
      { kind: "p", text: "Commercial tariffs often bill power as well as energy: a demand charge is a price per kW of the highest import in each month. Xcel Energy's Schedule PG in Colorado (2024), the data center example's tariff, has three parts that matter {urdb_xcel_pg} {code_tariffs}:" },
      { kind: "facts", rows: [
        ["Energy", "0.00778 + 0.04113 = 0.04891 USD/kWh in June-September, 0.00778 + 0.02539 = 0.03317 otherwise {code_tariffs}."],
        ["Flat demand charge", "4.23 + 3.68 = 7.91 USD per kW of the month's highest import, all hours {code_tariffs}."],
        ["Peak-window demand charge", "14.97 + 3.68 = 18.65 USD/kW-month in summer (10.03 + 3.68 = 13.71 otherwise) on the highest import between 14:00 and 18:00 local time {code_tariffs}."],
        ["Left out", "The fixed charge of 697.70 USD a month, which does not depend on operation {code_tariffs}."],
      ] },
      { kind: "math", tex: String.raw`C_{\text{demand}} = \sum_{m} \Big( r_{\text{flat}} \max_{t \in m} g^{+}_t + \sum_{r > 0} r \max_{t \in m,\ \rho_t = r} g^{+}_t \Big)`,
        caption: String.raw`Per calendar month \(m\): the flat rate times the month's highest import, plus, for each positive rate \(r\) in the peak-window profile \(\rho_t\), \(r\) times the highest import in the steps that carry it (tou_demand_cost() in engine.py). The peak is measured over one simulation step, so use 15-minute steps; URDB leaves the interval blank {code_engine} {code_tariffs}.` },
      { kind: "p", text: "Worked example, the data center in June 2026 with the battery idle: energy 160,201 USD, plus 5,618 kW × 7.91 ≈ 44,436 USD and 5,493 kW × 18.65 ≈ 102,441 USD of demand charges, 307,079 USD in all {ex_dc}. Almost half the bill comes from two numbers, each set by a single quarter-hour. The tariff data is converted from local Mountain time to the data's fixed MST clock, so in summer the 14:00-18:00 window sits at 13:00-17:00 on the profile's clock {code_tariffs}. Site Lab has no default demand charge for other sites: enter your tariff's value {code_model}." },

      { kind: "h", text: "Every rule and its setting in Site Lab" },
      { kind: "facts", rows: [
        ["Day-ahead price", "Tariff → Import price: a spot profile such as ec/de_lu_da (15-minute) {code_model} {gs_code_prices}."],
        ["Flat retail price", "Tariff → Import price: a Eurostat all-in profile (constant, includes VAT for households); keep the adder at 0 {gs_code_eurostat}."],
        ["Fees, taxes, margin", "Tariff → Price adder, per kWh imported; the app suggests Eurostat values {code_model} {gs_code_eurostat}."],
        ["Feed-in tariff", "Tariff → Export price, per kWh exported (CityLearn convention: 0 by default) {code_model}."],
        ["§ 51 EEG", "Tariff → 'No export pay at negative spot prices' {code_model} {eeg51}."],
        ["§14a Modul 3", "Tariff → Time-variable network fee: the Düsseldorf or Mosbach profile {code_model} {mkt_netfee_code}."],
        ["§14a dimming", "Grid connection → Grid-operator dimming, window start and length {code_model}."],
        ["Demand charges", "Tariff → Demand charge (flat, per kW-month) and Peak-window demand charge (a profile id such as urdb/xcel_co_pg_demand) {code_model}."],
        ["Price publication", "Control strategy → Forecasts: realistic waits for 13:00 before revealing tomorrow's day-ahead prices {code_forecasts}."],
      ] },
      { kind: "note", tone: "warn", text: "Not modelled: intraday trading and balancing markets, the monthly base fee, the 60% feed-in cap without a smart meter, and fixed network fee reductions. Each example's tariff is one year's rules repeated {code_engine} {eeg9} {mkt_netfee_code}." },
      { kind: "note", tone: "info", text: "Try it: open #operate_home_ev-run and, in the Tariff section, untick 'No export pay at negative spot prices', then set the price adder to 0 (spot only) and run the price arbitrage rule: without fees, buying from the grid to fill the battery starts to look attractive. Then open #operate_data_center-run and set the peak-window demand charge empty to see how much of the bill it was." },
    ],
  },
];

export const GUIDE_SYSTEMS_SOURCES: Source[] = [
  // ---------- The complete guide, Part 1 (read 2026-11-12) ----------
  { id: "gs_calc", title: "Our arithmetic in the complete guide, Part 1", read: "data",
    note: "Products, sums and ratios of the numbers shown, and the cited formulas evaluated by hand (PVWatts chain checked with pvlib's own functions; When2Heat COP curves; §14a EMS formula)." },
  { id: "gs_runs", title: "Site Lab runs for the complete guide, Part 1, 12 Nov 2026", read: "data",
    note: "Our own simulations of configs/sites: operate_home_ev.yaml (8-14 June 2026) as configured and with battery idle + car on arrival; the same home's building alone at 15- and 60-minute steps; operate_home_heatpump_v2h.yaml (12-18 Jan 2026) as configured (its total cost is now 136.28 EUR, more than the 124.00 EUR recorded on 9 Nov, apparently because the supplier margin was added to its price adder since); operate_data_center.yaml, June 2026, battery idle. Sizes are example choices." },
  { id: "gs_data", title: "Our analysis of the open data as stored by Site Lab, 12 Nov 2026", read: "data",
    note: "German day-ahead prices (Energy-Charts, 1 Oct 2025 - 7 Nov 2026); Konstanz south-facing solar profile and its day-ahead forecast; SINTEF and Twente sessions of the regular users the loaders keep; Eurostat 2025 German household components. Computed from the processed profiles in %LOCALAPPDATA%\\emsbench." },
  { id: "gs_code_kpis", title: "Simulator-independent KPIs: src/emsbench/benchmark/kpis.py", read: "code" },
  { id: "gs_code_pv", title: "Solar profiles from weather: src/emsbench/data/openmeteo_pv.py", read: "code" },
  { id: "gs_code_pvfc", title: "Day-ahead solar forecasts: src/emsbench/data/openmeteo_forecast.py", read: "code" },
  { id: "gs_code_prices", title: "Day-ahead prices: src/emsbench/data/energycharts.py", read: "code" },
  { id: "gs_code_eurostat", title: "Retail price components: src/emsbench/data/eurostat.py and web/app/src/components/TariffSuggestion.tsx", read: "code" },
  { id: "gs_code_ev", title: "EV session loaders: src/emsbench/data/sintef.py and src/emsbench/data/utwente.py", read: "code" },
  { id: "gs_code_esif", title: "Data center load loader: src/emsbench/data/esif.py", read: "code" },
  { id: "gs_om_hist", title: "Open-Meteo Historical Forecast API (variables GHI, DNI, DHI; archive stitched from forecast runs)",
    venue: "Open-Meteo documentation", read: "docs", url: "https://open-meteo.com/en/docs/historical-forecast-api",
    note: "Read: variable list, 'historical forecasts archived from the Weather Forecast API', first hours of each run stitched together, coverage from about 2022." },
  { id: "gs_om_fc", title: "Open-Meteo Weather Forecast API: 15-minutely data", venue: "Open-Meteo documentation", read: "docs",
    url: "https://open-meteo.com/en/docs",
    note: "Read: 15-minutely data native only for Central Europe (DWD ICON-D2, Météo-France AROME) and North America (NOAA RRFS), interpolated from hourly elsewhere; 15-minute radiation is the preceding 15 minutes' mean; hourly radiation is averaged over the past hour." },
  { id: "gs_pvlib_dc", title: "pvlib.pvsystem.pvwatts_dc (PVWatts DC model, after Dobos 2014)", venue: "pvlib documentation", read: "docs",
    url: "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.pvsystem.pvwatts_dc.html" },
  { id: "gs_pvlib_poa", title: "pvlib.irradiance.get_total_irradiance and pvlib.irradiance.haydavies (plane-of-array irradiance)",
    venue: "pvlib documentation", read: "docs",
    url: "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.irradiance.get_total_irradiance.html",
    note: "Both pages read: components beam + sky diffuse + ground, albedo default 0.25; Hay-Davies equation and anisotropy index." },
  { id: "gs_pvlib_closure", title: "pvlib.irradiance.complete_irradiance (closure equation GHI = DHI + DNI cos zenith)", venue: "pvlib documentation",
    read: "docs", url: "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.irradiance.complete_irradiance.html" },
  { id: "gs_pvlib_temp", title: "pvlib.temperature.sapm_cell (Sandia cell temperature model, King et al. 2004)", venue: "pvlib documentation",
    read: "docs", url: "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.temperature.sapm_cell.html" },
  { id: "gs_pvlib_inv", title: "pvlib.inverter.pvwatts (PVWatts inverter model)", venue: "pvlib documentation", read: "docs",
    url: "https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.inverter.pvwatts.html" },
  { id: "gs_ruhnau2019", title: "Time series of heat demand and heat pump efficiency for energy system modeling (methods)",
    authors: "Ruhnau, Hirth, Praktiknjo", year: 2019, venue: "Scientific Data 6:189 (open access, PMC6773861)", read: "report",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6773861/",
    note: "Methods read: COP regressions, heat sink temperatures, 15 K minimum gap, 0.85 field correction, heat source temperatures, demand method and stated limitations. Describes the 2019 version of the data." },
  { id: "gs_w2h_2023", title: "When2Heat data package, version 2023-07-27", authors: "Ruhnau, Muessel", year: 2023, venue: "Open Power System Data",
    read: "docs", url: "https://data.open-power-system-data.org/when2heat/2023-07-27/",
    note: "Read: changes in this version (data to 2022, radiator/floor COP labels corrected, more precise COP curves), ERA5 listed as source, CC BY 4.0." },
  { id: "gs_acer_hmmcp", title: "ACER Decision on the harmonised maximum and minimum clearing prices for single day-ahead coupling, Annex I",
    year: 2026, venue: "ACER, 4 February 2026", read: "report",
    url: "https://www.acer.europa.eu/sites/default/files/documents/Individual%20Decisions_annex/ACER-Decision-02-2026-AnnexI.pdf",
    note: "Articles 3 and 4 read: reference maximum +4,000 EUR/MWh, reference minimum -500 EUR/MWh; adjustment rules and 28-day transition period." },
  { id: "gs_eia_netmetering", title: "Glossary: Net metering", venue: "U.S. Energy Information Administration", read: "docs",
    url: "https://www.eia.gov/tools/glossary/index.php?id=N" },
];
