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
          <dt>Peak shaving</dt><dd>Discharges when demand is above the threshold and recharges below it.</dd>
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
          <dt>Import limit</dt><dd>The most the site may draw. When exceeded, the simulator stops battery charging, then discharges harder, then slows EV charging.</dd>
          <dt>Export limit</dt><dd>The most the site may feed in. Spare solar first goes into the battery, then is curtailed (thrown away).</dd>
          <dt>Fuse per phase</dt><dd>The current limit on each of the three phases (L1, L2, L3) at 230 V. When a phase is overloaded, battery charging is reduced first, then EV chargers on that phase slow down or pause.</dd>
          <dt>Grid-operator dimming (§14a)</dt><dd>In Germany the grid operator may limit controllable devices above 4.2 kW (private EV chargers, heat pumps, air conditioning, batteries while charging). <b>Direct</b>: each device keeps at least 4.2 kW (heat pumps above 11 kW keep 40% of their power). <b>EMS</b>: all of them together keep 4.2 kW + (n − 1) × simultaneity factor × 4.2 kW (0.8 for two devices down to 0.45 for nine or more), and the energy management system shares it: heat first, then cars, then battery charging. Real dimming is rare; the daily window is a stress test. Source: BNetzA decision BK6-22-300, Anlage 1.</dd>
        </dl>
        <p>Buildings, solar and batteries load the three phases equally. Single-phase chargers load only their phase, which is why phases can be uneven.</p>
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
          <dt>Export price</dt><dd>What each exported kWh earns.</dd>
          <dt>Demand charge</dt><dd>Billed per kW of each month's highest import, averaged over one time step.</dd>
          <dt>Time-variable network fee</dt><dd>German "Modul 3" under §14a: a low, standard and high network fee by time of day, added to every imported kWh. Two real 2026 price sheets are included (Düsseldorf and Mosbach). If you use it, leave the network fee out of the price adder.</dd>
        </dl>
        <p>Total cost = imports × price − exports × export price + demand charges.</p>
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
        <p>Cycles (energy discharged ÷ capacity) are reported as a simple proxy for wear.</p>
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
        </ul>
      </>
    ),
  },
  baseline: {
    title: "Baseline",
    body: (
      <>
        <p>Every run is simulated twice. The baseline is the same site with the <b>battery idle</b> and <b>EVs charging at full power on arrival</b>.</p>
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
        <dt>Battery cycles</dt><dd>Energy discharged ÷ capacity: a simple proxy for wear.</dd>
        <dt>EV energy</dt><dd>Energy delivered to cars, and how much was missing at departure.</dd>
        <dt>Import limit</dt><dd>Energy above the limit that the safety layer could not avoid.</dd>
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
        <li>All panels share one time axis. The top panel shows each component: every building or load by name (grey, told apart by line style), EV charging, solar and the grid. The dashed blue line is grid power in the baseline.</li>
        <li>Hover to see each component's power and the total demand at that moment.</li>
        <li>Positive battery power is charging, negative is discharging.</li>
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
