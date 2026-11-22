import type { ReactNode } from "react";

/** Longer explanations behind the "?" buttons. Each one describes what the engine actually
 *  does (src/emsbench/sim/engine.py, controllers.py, benchmark/kpis.py, api/app.py), so keep
 *  them in sync when the engine changes. */
export interface HelpEntry { title: string; body: ReactNode }

export const HELP = {
  modes: {
    title: "Plan and Operate",
    body: (
      <>
        <p>Both modes run the same simulator; they differ in the time scale and in what you look at.</p>
        <dl>
          <dt>Plan</dt>
          <dd>Months to a year in hourly steps. Use it to size equipment and compare yearly cost, self-sufficiency and battery wear.</dd>
          <dt>Operate</dt>
          <dd>Hours to days in 1 to 15 minute steps. Use it to watch EV charging, phase currents and fuse limits in detail.</dd>
        </dl>
        <p>Switching mode loads that mode's first example.</p>
      </>
    ),
  },
  components: {
    title: "Components",
    body: (
      <>
        <p>A site is a set of components behind one grid connection. Drag one onto the site view, or click it to add.</p>
        <dl>
          <dt>Building</dt>
          <dd>Electricity demand that cannot be shifted, replayed from a recorded or modelled load profile and scaled as you like.</dd>
          <dt>Data center</dt>
          <dd>Servers (measured IT load) plus cooling and overhead: total power = IT power × PUE. Add a battery with a minimum charge as its UPS backup reserve.</dd>
          <dt>Solar PV</dt>
          <dd>Panels sized in kWp (peak power). Output is a per-kWp weather profile times the size.</dd>
          <dt>Battery</dt>
          <dd>Stationary storage. The control strategy decides when it charges and discharges.</dd>
          <dt>EV charger</dt>
          <dd>A charger plus the cars that visit it: each visit has an arrival, a departure and the energy the car needs. Bidirectional chargers can also take energy back from the car.</dd>
          <dt>Heat pump</dt>
          <dd>Heating and hot water from electricity, with a tank that can store heat for later.</dd>
        </dl>
      </>
    ),
  },
  siteView: {
    title: "Site view",
    body: (
      <>
        <p>A picture of the site. Every component connects to the <b>grid connection</b> (the site's meter), which connects to the <b>utility grid</b>.</p>
        <p>Two styles show the same site and data: <b>Scene</b> is an illustration (windows light up at night, a car appears when one is plugged in, the battery gauge shows its charge); <b>Diagram</b> is a compact one-line diagram, better for sites with many chargers.</p>
        <ul>
          <li>After a run, each card shows its power at the playhead time, and moving dots show where energy flows. Thicker dots mean more power.</li>
          <li>The clock in the corner shows which moment you are looking at. Move it with the playback bar or by clicking a chart.</li>
          <li>Click a card to edit it on the right. Drag to move it. Press Delete to remove it.</li>
          <li>Drag the background to pan; scroll or use the buttons to zoom.</li>
        </ul>
      </>
    ),
  },
  period: {
    title: "Period and time step",
    body: (
      <>
        <p>The simulation runs from the start date for the given number of days, one time step at a time.</p>
        <ul>
          <li><b>Time step</b>: shorter steps show more detail (EV sessions, short peaks) but take longer to run.</li>
          <li><b>Data resolution</b>: each profile has its own resolution. If the step is finer than the data, values are repeated, not measured, and flagged as "repeated" in Data sources.</li>
          <li><b>Dates</b>: if a profile does not cover your dates, the same season from another year is used, shifted so weekdays stay weekdays.</li>
        </ul>
      </>
    ),
  },
  controller: {
    title: "Control strategy",
    body: (
      <>
        <p>Each time step the controller asks for a battery power and a charging power per car. The simulator then enforces physics and the grid limits, so a strategy can ask for something impossible but can never break a limit.</p>
        <h5>Battery</h5>
        <dl>
          <dt>Idle</dt><dd>Never used.</dd>
          <dt>Self-consumption</dt><dd>Stores spare solar and covers demand from storage when solar is short.</dd>
          <dt>Price arbitrage</dt><dd>Stores spare solar, fills up from the grid at the cheapest step of the next 24 hours, and covers the site at the most expensive one.</dd>
          <dt>Peak shaving</dt><dd>Aims for the lower of its threshold and this step's import limit (lower inside a contract window): discharges when demand is above that target and recharges below it. It does not look ahead; of the strategies, only MPC plans for a window before it starts.</dd>
          <dt>MPC</dt><dd>Model predictive control: every re-plan (hourly by default, and when a car plugs in) it solves an optimisation over the planning horizon (24 hours by default) for the battery and all cars together, minimising energy cost, any demand charges and, when the battery has a replacement cost, battery wear (a price per kWh cycled from the same ageing model). How the plan is carried out is the <b>MPC execution</b> setting: <i>plan</i> follows it and lets the battery absorb forecast errors; <i>hybrid</i> stores all spare solar like the self-consumption rule and lets the plan only add to it; <i>cautious</i> plans from this step's measured load and solar, never trades extra with the grid to keep to a wrong plan, and values leftover energy net of wear (the best choice for cost with realistic forecasts in our tests); <i>chance</i> is cautious plus a safety margin under the import limit for every future hour, sized from the forecast's own past errors so the limit holds on the reliability target's share of days (needs realistic forecasts; its <b>confidence</b> setting and a worked example are under "Chance-constrained MPC"). <b>MPC scenarios</b> above 1 plan for several futures replayed from recent days. The EV strategy below is then ignored. Heat pumps run on demand and cars are not discharged under MPC yet.</dd>
        </dl>
        <h5>EV charging</h5>
        <dl>
          <dt>As fast as possible</dt><dd>Full power from arrival.</dd>
          <dt>Spread until departure</dt><dd>The lowest steady power that still finishes by departure.</dd>
          <dt>Cheapest hours</dt><dd>Charges only in the cheapest steps before departure.</dd>
          <dt>Solar surplus</dt><dd>Charges from spare solar only.</dd>
        </dl>
        <p>Every EV strategy switches to full power when there is no time left to spare.</p>
        <h5>Heat pump</h5>
        <dl>
          <dt>On demand</dt><dd>Heats exactly what is needed each step; the tank is not used.</dd>
          <dt>Cheap hours</dt><dd>Fills the tank in the cheapest quarter of the next 24 hours and draws on it in the dearest quarter.</dd>
          <dt>Solar surplus</dt><dd>Puts spare solar into the tank.</dd>
        </dl>
        <h5>Car discharging (bidirectional chargers only)</h5>
        <p>At high prices, a plugged-in car covers what the site still imports after the battery, but only when it pays after losses (the price now beats the cheapest price before departure divided by the efficiency squared) and only so much that the car can be recharged in half of its remaining stay.</p>
      </>
    ),
  },
  grid: {
    title: "Grid connection",
    body: (
      <>
        <p>The single point where the site meets the utility grid. Positive power is import, negative is export.</p>
        <dl>
          <dt>Import limit</dt><dd>The most the site may draw (the firm limit). When exceeded, the simulator stops battery charging, then discharges harder, then slows EV charging. Heat pumps and buildings are never cut, so a limit can still be exceeded.</dd>
          <dt>Contract windows</dt><dd>Times in which a flexible contract lowers the import limit, for example 110 kW on weekdays 08:00–12:00 and the firm limit otherwise. Each step uses the limit that applies then. See the "?" next to the windows for how they work and how reliability is scored.</dd>
          <dt>Reliability target</dt><dd>The share of days on which the limit must hold for the contract to count as kept (0.9 = 90% of days). Shown when there is a limit.</dd>
          <dt>Export limit</dt><dd>The most the site may feed in. Spare solar first goes into the battery, then is curtailed (thrown away).</dd>
          <dt>Fuse per phase</dt><dd>The current limit on each of the three phases (L1, L2, L3) at 230 V. When a phase is overloaded, battery charging is reduced first, then EV chargers on that phase slow down or pause.</dd>
          <dt>Grid-operator dimming (§14a)</dt><dd>In Germany the grid operator may limit controllable devices above 4.2 kW (private EV chargers, heat pumps, air conditioning, batteries while charging). <b>Direct</b>: each device keeps at least 4.2 kW (heat pumps above 11 kW keep 40% of their power). <b>EMS</b>: all of them together keep 4.2 kW + (n − 1) × simultaneity factor × 4.2 kW (0.8 for two devices down to 0.45 for nine or more), and the energy management system shares it: heat first, then cars, then battery charging. Real dimming is rare; the daily window is a stress test. Source: BNetzA decision BK6-22-300, Anlage 1.</dd>
        </dl>
        <p>Buildings, solar and batteries load the three phases equally. Single-phase chargers load only their phase, which is why phases can be uneven.</p>
      </>
    ),
  },
  contract: {
    title: "Flexible contracts and reliability",
    body: (
      <>
        <p>A <b>firm</b> connection has one import limit at all times. A <b>flexible</b> contract lowers it at agreed times. In a <b>time-block</b> contract (like the Dutch one) the site has full access except in set windows; a <b>capacity-limited</b> contract is a lower limit all day (one all-day window, or just the import limit).</p>
        <h5>Windows</h5>
        <ul>
          <li>Each window has a start, an end, the days it starts on and the limit inside it. Times are the site's clock (fixed CET for European data, no summer time).</li>
          <li>An end at or before the start runs past midnight (22:00–06:00); the same start and end means the whole day.</li>
          <li>Where windows overlap, the lowest limit applies, and the firm import limit caps every window.</li>
          <li>A time step that touches a window for any part gets the window's limit (with hourly steps, 08:30–12:00 limits the 08:00 hour).</li>
          <li>The simulator compiles the contract into one limit per step. The safety layer enforces it, peak shaving aims under it and MPC plans for it (the contract is known in advance, also with realistic forecasts).</li>
        </ul>
        <h5>Reliability: days kept</h5>
        <p>A flexible contract is only useful if the site can say how reliably it keeps the limit. A day is <b>kept</b> if import never went over the limit in any of its steps. Days without any limit (weekends of a weekday-only contract) are not counted. <b>Limit kept</b> is the share of counted days that were kept; the contract counts as kept when that share reaches the <b>reliability target</b> (90% by default: a "P90" promise that the limit holds on at least 90% of days).</p>
        <h5>P90 daily peak</h5>
        <p>The share alone does not say how close a run came. For each counted day the simulator takes its highest import as a share of the limit at that time, then the value that 90% of days stay at or below (the target share). Below 1 is a margin: 0.85 means even the 90th-percentile day stayed 15% under the limit. Above 1 is an overshoot: 1.10 means that day went 10% over. Exactly 1 means the 90th-percentile day just touched the limit.</p>
        <p>Also reported: the energy imported above the limit over the whole run, and the worst overshoot in one step with its date.</p>
      </>
    ),
  },
  planner: {
    title: "Size & contract planner",
    body: (
      <>
        <p>Choosing a battery and a grid contract together: the planner runs this site once for every battery size and contract option you list, and puts each run's cost next to how reliably it kept the import limit.</p>
        <h5>What each run is</h5>
        <ul>
          <li>A normal simulation of a copy of the site: same period, data, control strategy and forecasts. Only the battery size and the contract change.</li>
          <li><b>Battery size</b>: every battery is scaled to the total you type and keeps its power per kWh (its C-rate). 0 removes the battery. A site without a battery gets one with the default battery's settings.</li>
          <li><b>Contract options</b>: today's contract, the firm limit with no windows, and the windows' reduced limit at other percentages of today's value. They are variants to explore, not offers: a real grid operator sets which contracts exist and what they cost.</li>
        </ul>
        <h5>Reading the results</h5>
        <ul>
          <li><b>Cost incl. wear</b> is the energy bill plus battery wear: the share of the battery's replacement value this period used up (expected life from the ageing model). It is how a bigger battery shows up as a cost. It is not a full investment case: no financing, installation, discount rate or grid-contract fee is included. Where the currency has no default replacement cost, wear is not priced and only the bill is compared.</li>
          <li><b>Days kept</b> is the share of days on which import never went over the limit (see "Flexible contracts and reliability").</li>
          <li>The line joins the <b>front</b>: options where no cheaper option keeps the limit on as many days. Options off the front cost more for the same or less reliability.</li>
          <li>The recommendation is the cheapest <b>feasible</b> option that meets the reliability target. On sites with chargers, feasible means the cars got their energy: at most the <b>service level</b> you set (1% by default) of what they asked for left undelivered. The simulator slows car charging to keep the limit, so without this rule a contract could look reliable and cheap because cars got less energy. Options that miss it stay in the chart (hollow grey) and the table (greyed, with the share undelivered) but are not recommended and not on the front; if none is feasible, the recommendation says so and names the one with the smallest shortfall. See "Service level".</li>
        </ul>
        <h5>Limits</h5>
        <ul>
          <li>This is one replay of the simulated year. "Kept on 92% of days" counts those days; it is not a probability with a confidence range. A different year of weather, prices or cars would give a different count, and one or two days can move an option across the target.</li>
          <li>With perfect forecasts the controller knows the future, which makes batteries look more capable than they will be in operation. Plan with realistic forecasts for a fairer answer.</li>
          <li>The guide's chapter 8 (planning and sizing under uncertainty) explains why sizing should be stated as how often the limit holds, and section 4.2 why a promise like "90% of days" is the useful form. Turning the count into a probability needs many simulated years (scenarios), which the planner does not do yet.</li>
        </ul>
      </>
    ),
  },
  serviceLevel: {
    title: "Service level: the cars' energy is part of the promise",
    body: (
      <>
        <p>A site with chargers promises two things: to keep the grid limit, and to give the cars the energy they ask for. The simulator keeps the limit by slowing cars when nothing else is left, so a set-up can look reliable (many days kept) and cheap (less energy bought) only because drivers left with less. The service-level rule stops such options from winning.</p>
        <h5>The rule</h5>
        <ul>
          <li>Requested energy = energy delivered + energy still missing when cars left. Cars still plugged in at the end of the period count what they got so far and no shortfall (their outcome is unknown).</li>
          <li><b>The floor.</b> Some cars cannot get all their energy whatever the contract: the charging records are replayed at the time step, so with hourly steps each stay is rounded to whole hours. Each batch therefore runs one <b>reference</b>: the same site with no import limit, no contract windows, no battery and every car charged at full power from arrival. What the cars still miss there is the floor. On the time-block car park it is 1,746 of 62,131 kWh (2.8%), on the Leeds fleet depot 1,070 of 20,157 kWh (5.3%) (our runs, 22 Nov 2026). It does not depend on the battery, the contract or the strategy (on both examples the site's own strategy with no limit misses exactly the same), so one reference serves the whole planner batch and every Compare row on the same site.</li>
          <li>An option is <b>feasible</b> if (energy missing − floor) is at most the service level times the requested energy: the rule counts only what the contract and the control add. The default, 1%, is a setting (the promise you choose to make), not a number from a source. Change it in Size &amp; contract; Compare uses the same value.</li>
          <li>Example: the depot as shipped (80 kW firm, 20 kW on working days 14:00–18:00, 100 kWh battery): cars asked for 20,157 kWh and got 19,083 kWh, so 1,074 kWh is missing; minus the 1,070 kWh floor that is 4 kWh (0.02%), well inside 1%: feasible. Without the floor the same option would read "5.3% undelivered" and nothing on this site could ever pass.</li>
          <li>If the reference run fails (or in the public demo, which cannot run it) the floor is 0 and all missing energy counts; the planner and Compare say so.</li>
          <li>Sites without chargers: the rule does not apply and every option is feasible.</li>
        </ul>
        <h5>Where it is used</h5>
        <ul>
          <li><b>Size &amp; contract</b>: the recommendation and the front line consider feasible options only. Others stay visible, greyed, with the share undelivered. If none is feasible, the recommendation says so and names the option with the smallest shortfall.</li>
          <li><b>Compare</b>: the <b>EV served</b> column is the share of requested energy delivered. "Best" (the dot) and "vs best" compare feasible runs only; the EV short column still compares all of them.</li>
        </ul>
      </>
    ),
  },
  chanceMpc: {
    title: "Chance-constrained MPC",
    body: (
      <>
        <p><b>MPC execution: chance</b> is the cautious MPC with a safety margin. A forecast of the site's load is always somewhat wrong; if the plan uses the whole import limit, a load a bit higher than forecast breaks it. So for every future hour the MPC plans against <b>the limit minus a margin</b> (the "back-off"). The hour being metered now gets no margin, because its load is measured.</p>
        <h5>How big the margin is</h5>
        <p>For each time of day, the margin is the largest amount by which the net load (load minus solar) came out above its forecast at that time over the last <b>N</b> days. N comes from two numbers: the <b>reliability target</b> of the grid connection (90% of days by default) and the <b>confidence</b> setting (95% by default):</p>
        <p>N = ceil( ln(1 − confidence) / ln(target) )</p>
        <p>Worked example: ln(1 − 0.95) = ln(0.05) = −3.00 and ln(0.90) = −0.105, so N = ceil(28.4) = <b>29 days</b>. The theory (the "scenario approach") then says: if days were independent and alike, the chance that a margin covering the worst of 29 days fails on more than 10% of new days is at most 0.9<sup>29</sup> = 4.7%, under the 5% asked for. Asking for 99.9% confidence needs 66 days and gives a larger margin; 50% needs 7 days.</p>
        <h5>Why it over-delivers on a daily target</h5>
        <p>The guarantee is per hour, and the worst of 29 days is cautious: for independent days the margin should be exceeded in about 1 hour in 30 (3.3%), well under the 10% a 90% target allows. On the time-block car park example (one year, realistic forecasts, our run of 22 Nov 2026) it kept the limit on 364 of 365 days against a 90% target, cost 1.1% more than the cautious MPC, and left more car energy undelivered than the peak-shaving rule (2.8 against 2.0 MWh). A margin sized for days rather than hours could give some of that back; it is not built.</p>
        <h5>What to check after a run</h5>
        <ul>
          <li>The <b>Limit kept</b> tooltip: how often the margin was exceeded against the share allowed (on the car park: 3.1% of hours, 10% allowed), and whether the P90 forecast was calibrated.</li>
          <li><b>EV energy</b> and the service level: a cautious margin can be paid for by the cars.</li>
          <li>A warning when the run starts with less than N days of history: the first days' margins are less certain.</li>
        </ul>
        <p>Needs realistic forecasts; with perfect ones it is the same as cautious. Real days are not independent (weekdays, seasons), which is why the margin uses only the most recent days and why the run reports how often it was exceeded. Sources: the guide's sections 4.2 (scenario approach) and 7.2 (constraint tightening); Campi, Garatti and Prandini, Handbook of Model Predictive Control; results in results/chance_mpc/README.md.</p>
      </>
    ),
  },
  deviceUncertainty: {
    title: "Device uncertainty",
    body: (
      <>
        <p>Controllers usually plan as if the devices were exactly known. Real ones are not, and three effects can be switched on (all off by default):</p>
        <dl>
          <dt>Battery state-of-charge estimate</dt><dd>A battery cannot measure how full it is; its management system estimates it, and for LFP cells the estimate drifts. Errors of ±15% are common in LFP systems, outliers above ±40% (Accure, via ESS News, Oct 2025). Set a starting error and a drift per capacity cycled; it shrinks back near full and empty, where the cells recalibrate. The controller sees the estimate, the battery obeys the truth.</dd>
          <dt>Battery power near full / empty</dt><dd><i>cc_cv</i>: full power up to 80%, then falling linearly to zero at 100% (ACN-Sim's model); discharging mirrored below 20% (an example choice: no public LFP derating table was found). Controllers still plan with full power.</dd>
          <dt>Car charging curves</dt><dd>Cars draw less near full. Charging records give only the energy, so the simulator assumes each visit ended nearly full: the most slowing possible.</dd>
        </dl>
        <h5>What you see</h5>
        <ul>
          <li><b>Plan shortfall</b> card and a warning: energy the battery did not deliver though the controller asked for it within what it believed possible.</li>
          <li>Faint red bands in the battery power chart where it fell short, and a dashed "SoC as estimated" line next to the true charge.</li>
          <li>In the EV energy tooltip: energy cars refused near full.</li>
        </ul>
        <h5>Days kept can hide device problems</h5>
        <p>When the battery falls short, the safety layer slows the cars to keep the limit, so the contract looks fine and the drivers pay. On the time-block car park (one year, our runs of 22 Nov 2026) the peak-shaving rule kept the limit on 349 days with all three effects on against 350 without, but car energy undelivered rose from about 2,010 to 2,140 kWh. Always read days kept together with <b>EV served</b> and <b>Plan shortfall</b>; the service-level rule does this for the planner and Compare.</p>
      </>
    ),
  },
  tariff: {
    title: "Tariff",
    body: (
      <>
        <dl>
          <dt>Import price</dt><dd>A price profile per time step. Wholesale spot prices exclude network fees and taxes.</dd>
          <dt>Price adder</dt><dd>Added to every import price, to turn a wholesale price into a realistic retail one.</dd>
          <dt>Export price</dt><dd>What each exported kWh earns, for example a feed-in tariff.</dd>
          <dt>No export pay at negative spot prices</dt><dd>The German rule for new systems with a smart meter (§ 51 EEG): exports earn nothing while the day-ahead price is negative.</dd>
          <dt>Demand charge</dt><dd>Billed per kW of each month's highest import, averaged over one time step.</dd>
          <dt>Peak-window demand charge</dt><dd>Optional: a charge per kW on the highest import inside set hours (for example 14:00 to 18:00 on summer weekdays), from a real US tariff.</dd>
          <dt>Time-variable network fee</dt><dd>German "Modul 3" under §14a: a low, standard and high network fee by time of day, added to every imported kWh. Two real 2026 price sheets are included (Düsseldorf and Mosbach). If you use it, leave the network fee out of the price adder.</dd>
        </dl>
        <p>Total cost = imports × price − exports × export price (per step) + demand charges. Battery wear is shown separately, and added in "Cost incl. wear".</p>
      </>
    ),
  },
  building: {
    title: "Building",
    body: <p>Fixed demand replayed from the selected load profile, multiplied by the scale (for example ×10 for ten similar homes). The controller cannot shift it.</p>,
  },
  data_center: {
    title: "Data center",
    body: (
      <>
        <p>Total power = the IT load profile × the IT scale × the <b>PUE</b> (total power ÷ IT power). Everything above 1 is cooling, fans, pumps and lights. The 2025 industry average is 1.54; the best liquid-cooled sites reach about 1.05–1.1.</p>
        <p>The PUE is held constant, so cooling follows the servers but not the weather. Add a battery with a minimum charge as the UPS backup reserve.</p>
      </>
    ),
  },
  heat_pump: {
    title: "Heat pump",
    body: (
      <>
        <p>Heat demand (space heating plus hot water) = an hourly When2Heat profile × the annual heat demand. Electricity = heat ÷ COP, the coefficient of performance for that hour, which drops when it is cold outside and when radiators need hot water.</p>
        <ul>
          <li>The tank stores heat. With a tank and spare power, the strategy can heat early (cheap hours, spare solar) and use the heat later.</li>
          <li>Each step the heat pump runs at least enough to meet demand with what is in the tank, and at most until the tank is full.</li>
          <li>If it cannot cover the demand (too small, or dimmed by the grid operator), the shortfall is reported as unmet heat.</li>
          <li>No size given: it is sized for the coldest hour of the period, which leaves no spare power for pre-heating.</li>
        </ul>
        <p>Data: Ruhnau, Hirth and Praktiknjo (2019), When2Heat, Scientific Data 6:189 (CC BY 4.0). National synthetic profiles, smoother than a single house.</p>
      </>
    ),
  },
  pv: {
    title: "Solar PV",
    body: <p>Output = the profile's generation per kWp × the installed kWp. Solar is curtailed only when an export limit forces it.</p>,
  },
  battery: {
    title: "Battery",
    body: (
      <>
        <p><b>Capacity</b> (kWh) is how much energy it holds; <b>power</b> (kW) is how fast it can charge or discharge.</p>
        <p>Round-trip losses are split evenly between charging and discharging. The charge level stays between the minimum and maximum you set.</p>
        <p><b>Power near full / empty</b> (off by default): with <i>cc_cv</i>, charging power falls linearly to zero above the charge taper point (80% by default) and discharging power below the discharge taper point (20%), like real lithium-ion cells. <b>SoC estimate error</b> (off by default): the controller sees the battery management system's estimate of its charge, which can start off and drift; the battery obeys its true charge. See "Device uncertainty".</p>
        <p><b>Wear</b>: each run is scored with NREL's BLAST-Lite ageing model for the chosen chemistry (LFP or NMC) at the set temperature, giving an expected life and a wear cost from the replacement cost and the end-of-life capacity. Cycles (energy discharged ÷ capacity) are shown too, as a simple count.</p>
      </>
    ),
  },
  ev_charger: {
    title: "EV charger",
    body: (
      <>
        <p>The visit profile defines when cars arrive and leave and how much energy each one needs.</p>
        <ul>
          <li>Power is limited by the charger and by the car, whichever is lower.</li>
          <li>Below the minimum charging current the charger pauses instead of charging slowly.</li>
          <li>Single-phase chargers load one phase; three-phase chargers split power over all three.</li>
          <li>A car still needing energy at departure "left short".</li>
          <li>Bidirectional (V2H): a car may give energy back while it can still reach its target by departure at full power, up to a per-visit limit. Lent energy is added to what the car still needs, with losses both ways.</li>
          <li>Car charging curve (off by default): with <i>cc_cv</i> a car draws less near full, falling linearly to zero above the taper point. The data gives only each visit's energy, so the simulator assumes the car ended nearly full and picks the smallest of 8–100 kWh batteries that holds it. Controllers do not know the car's charge; the car simply draws less. See "Device uncertainty".</li>
        </ul>
      </>
    ),
  },
  forecasts: {
    title: "Perfect and realistic forecasts",
    body: (
      <>
        <p>Controllers that plan ahead (MPC, and the rules that look for cheap hours) need to know the future. <b>Perfect</b> tells them the true future: the best any forecast could do. <b>Realistic</b> tells them only what a real system would know at that moment:</p>
        <dl>
          <dt>Load</dt><dd>The most recent day repeated (the "naive" method of EMHASS, an open-source home energy manager).</dd>
          <dt>Solar</dt><dd>The weather forecast made about a day earlier (Open-Meteo's archive of past forecasts), through the same solar model as the actual solar. Where no archived forecast exists, yesterday's solar repeated.</dd>
          <dt>Prices</dt><dd>Day-ahead market prices only once published, around 13:00 for the next day; beyond that, the last known day repeated. Fixed tariffs are known in advance.</dd>
          <dt>Cars</dt><dd>Unknown until they plug in; then their departure time and energy are known, as if the driver had entered them in an app.</dd>
        </dl>
        <p><b>Compare forecasts</b> runs the site both ways. The difference is what perfect knowledge would be worth, and shows how much a strategy depends on its forecast. Simple reactive rules (self-consumption) do not look ahead, so they are unaffected. When the forecast is wrong, MPC lets the battery take up the difference so the grid exchange stays as planned, then re-plans. With <b>MPC execution: cautious</b> it never trades extra with the grid to do so, plans with the measured present and stores solar at the first chance: with realistic forecasts that beat the simple rule in our full-year study, where the plain plan did not. <b>MPC execution: chance</b> goes one step further and plans under the import limit minus a margin learned from how wrong this forecast has been (see "Chance-constrained MPC"); with perfect forecasts there is nothing to learn and it behaves like cautious.</p>
        <p>With realistic forecasts the run also checks the forecast's own uncertainty: how often the net load (load minus solar) came out above its P90 forecast (10% of hours would be right for a 90% target). It is in the tooltip of the <b>Limit kept</b> card.</p>
        <p>A realistic run can occasionally come out cheaper: a plan that is optimal for a forecast is not always best for the real day, and the end of the period is valued differently.</p>
      </>
    ),
  },
  baseline: {
    title: "Baseline",
    body: (
      <>
        <p>Every run is simulated twice. The baseline is the same site with the <b>battery idle</b>, <b>EVs charging at full power on arrival</b>, <b>heat pumps heating on demand</b> and <b>no car discharging</b>. Forecast settings do not matter for the baseline, which does not look ahead.</p>
        <p>The arrows show the change from the baseline: green is better, red is worse. This isolates what your control strategy adds.</p>
      </>
    ),
  },
  kpis: {
    title: "Headline numbers",
    body: (
      <dl>
        <dt>Total cost</dt><dd>Energy bought minus energy sold, plus demand charges, over the whole period.</dd>
        <dt>Peak import</dt><dd>The highest grid import in one time step.</dd>
        <dt>Max phase current</dt><dd>The highest current on any one phase, shown when a fuse is set.</dd>
        <dt>Self-sufficiency</dt><dd>The share of demand (including EVs) not bought from the grid.</dd>
        <dt>Solar self-use</dt><dd>The share of solar used on site rather than exported.</dd>
        <dt>Cost incl. wear</dt><dd>Total cost plus battery wear: the share of the battery's value this period used up.</dd>
        <dt>Battery wear</dt><dd>NREL's BLAST-Lite ageing model (LFP or NMC; calendar and cycle ageing, depth of discharge, state of charge, temperature) estimates how many years the battery would last if it were always run like this, until it holds its end-of-life share of its capacity (80% by default). Wear = replacement cost × the share of that life this period used. An idle battery ages too, so the baseline has wear. Default replacement costs are 2022 German averages excluding VAT (1,200 €/kWh for home systems), higher than today's prices; set your own in the battery. Without a price (non-EUR sites) only the life is shown.</dd>
        <dt>Plan shortfall</dt><dd>Shown only when it happened: energy the battery did not deliver although the controller asked for it within what it believed possible, because the battery's state-of-charge estimate was off or its power tapered near full or empty. Its tooltip gives the hours and the largest and average estimate error. See "Device uncertainty".</dd>
        <dt>EV energy</dt><dd>Energy delivered to cars, and how much was missing at departure (also as a share of what the cars asked for). With car charging curves on, the tooltip adds the energy cars refused near full.</dd>
        <dt>Limit kept</dt><dd>Shown when there is an import limit (firm or contract windows): the share of days on which import stayed under the limit at every step, against the reliability target (90% by default). Its tooltip adds the energy above the limit, the worst overshoot and the P90 daily peak; with realistic forecasts, how often the net load beat its P90 forecast; with the chance MPC, how often its safety margin was exceeded against the share allowed. Details: the "?" next to Contract windows.</dd>
        <dt>Heat pump</dt><dd>Electricity used, the average COP over the period, and any heat demand left unmet.</dd>
        <dt>Car to home</dt><dd>Energy cars gave back through bidirectional chargers.</dd>
        <dt>Dimmed (§14a)</dt><dd>Energy the grid operator's limit held back from controllable devices.</dd>
      </dl>
    ),
  },
  charts: {
    title: "Charts",
    body: (
      <ul>
        <li>All panels share one time axis. The top panel shows each component: every building or load by name (grey, told apart by line style), EV charging, solar and the grid. The dashed blue line is grid power in the baseline. With an import limit, a dark dashed stepped line shows the limit at each step (it drops inside contract windows); grid import above it is an overshoot.</li>
        <li>Hover to see each component's power and the total demand at that moment.</li>
        <li>Positive battery power is charging, negative is discharging. Faint red bands in the battery power panel ("Battery fell short") mark hours in which the battery delivered less than the controller asked; hover for the kW missing.</li>
        <li>In the state-of-charge panel, a dashed grey line ("SoC as estimated") shows what the battery management system reported to the controller, when that differs from the true charge (filled). The gap is the estimate error.</li>
        <li>The chance MPC's safety margin is not drawn: the simulator does not report the margin hour by hour yet. Its calibration is in the Limit kept tooltip.</li>
        <li>Click a chart to move the playhead there. Drag the slider at the bottom to change the visible window, or use Ctrl+scroll.</li>
      </ul>
    ),
  },
  sessions: {
    title: "EV sessions",
    body: (
      <ul>
        <li>One row per charger, one bar per car visit, from arrival to departure.</li>
        <li>The darker fill shows how much of the energy needed was delivered.</li>
        <li>A red outline means the car left short. A dashed bar is still plugged in when the period ends.</li>
        <li>Click a bar to jump to that arrival.</li>
      </ul>
    ),
  },
  sources: {
    title: "Data sources for this run",
    body: (
      <>
        <p>Which profile fed each component, and which real dates were used.</p>
        <dl>
          <dt>native</dt><dd>The data matches the time step.</dd>
          <dt>averaged</dt><dd>The data is finer than the step and was averaged.</dd>
          <dt>repeated</dt><dd>The data is coarser than the step, so each value was repeated. It is not real detail at this resolution.</dd>
        </dl>
        <p>The database button in the top bar describes every source, its licence and its caveats.</p>
      </>
    ),
  },
} satisfies Record<string, HelpEntry>;

export type HelpTopic = keyof typeof HELP;
