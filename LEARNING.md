# LEARNING.md

Plain-language notes on how things work, written as we go. Version: CityLearn 3.2.0.
Marked **(unsure)** where I am inferring rather than certain.

---

## 1. CityLearn in one picture

CityLearn is a **time-stepping simulator**. Think of a spreadsheet with one row per hour of a
year. Each row already contains what happened in reality: building electricity demand, solar
output, weather, price. What CityLearn adds is *the battery*: at every row a controller decides
"charge this much" or "discharge this much", and CityLearn works out the consequences (new state
of charge, what the building then draws from the grid, what it costs).

```
reset() -> observations
loop:
    controller looks at observations -> actions
    step(actions) -> new observations, reward, done?
evaluate() -> KPI table
```

This loop shape is the **Gym/Gymnasium interface**, the standard in reinforcement learning. Any
controller, including an MPC that has nothing to do with RL, plugs in by implementing
`predict(observations) -> actions`.

## 2. A dataset = a schema + CSV files

A dataset is a folder with a `schema.json` and CSVs. The schema says which buildings exist, which
assets each has (battery size, PV size), which CSV holds its data, and which observations and
actions are active. On first use CityLearn downloads it from GitHub and caches it in
`%LOCALAPPDATA%\citylearn-project\citylearn\Cache`.

Our baseline uses `citylearn_challenge_2022_phase_1`:

- 5 buildings, 8,760 hourly steps (one year). The data appear to start on 1 August
  (first step is labelled "month 7, hour 24", see quirks). Location believed to be
  Fontana, California **(unsure, not stated in the files)**.
- Each building: battery 6.4 kWh / 5 kW, PV 4 kW (from `schema.json`).
- Price (`pricing.csv`): a fixed time-of-use tariff, 0.22 per kWh off-peak and 0.54 per kWh
  from 16:00 to 21:00. Currency not stated in the files; assumed USD **(unsure)**. The
  "predicted" price columns equal the actual ones, so price forecasts are perfect here.
- Weather has 1-3 hour-ahead "predicted" columns. Whether they contain deliberate error is
  something to check before task 2 **(unsure)**.

## 3. Observations and actions

- **Observations** are a flat list of numbers: calendar (month, hour, day type), weather and its
  short forecasts, price and its forecasts, and per building: load, solar, battery state of
  charge, net consumption.
- **Actions** are one number per battery in [-1, 1]. **+1 = charge at full rated power, -1 =
  discharge at full rated power.** It is a fraction of *power* (kW), not of capacity (kWh).
  Verified in code and by test: action 0.3 on a 5 kW battery moved exactly 1.5 kWh in an hour.
  The rule-controller docstrings still say "% of maximum capacity"; they are out of date.

## 4. What happens inside one step

For each building:

1. The action becomes a requested energy (action x rated power x 1 hour).
2. The battery limits it: it can't go above full or below empty, and its maximum power shrinks
   near full charge (a `capacity_power_curve`, like a phone charging slowly above 80%).
3. Losses: efficiency depends on how hard you push the battery (a `power_efficiency_curve`).
   Our dataset's schema says "efficiency 0.9", but the code appears to use the power-dependent
   curve, which is about 0.83 at low power **(unsure: one test plus code reading)**.
4. Net grid energy = building load - solar + battery charging (or - battery discharging).
   Positive = buying from the grid, negative = exporting.
5. Degradation: capacity shrinks in proportion to the energy cycled
   (coefficient x energy through the battery). Nothing for calendar aging (batteries also age
   just sitting), depth of discharge or temperature. This is the "simple wear model" the research
   doc mentions; it is what we plan to replace with wear priced in money.

## 5. How CityLearn scores a controller

CityLearn computes the same building **twice**: once with your controller, once as a
counterfactual **with PV but no battery**. Every KPI is a ratio: controller / no-battery.
1.0 = no change, 0.9 = 10% better.

Three things that are easy to miss:

- **District score = average of building ratios, not ratio of totals.** If a small building
  saves 20% and a big one loses 5%, the "district" looks good even if total money went up. On
  our one-week smoke run: total cost fell 4.2%, but CityLearn's district `cost_total` said 2.2%.
  Over the full year the two almost agree (9.4% vs 9.5%), because the buildings are similar.
  Both are "right"; the total is what a site owner pays. We report both.
- **Each building is its own meter, and exports earn nothing.** Cost is clipped at zero per
  building per hour. Real tariffs often pay something for exports, and a single commercial site
  has one meter. Our KPI module handles both (meters and an export price).
- **Peak KPIs are district-level** (all buildings added up), i.e. what the shared transformer sees.

## 6. Quirks worth remembering

- First step is labelled "hour 24" of the previous day: CityLearn counts hours 1-24, and
  midnight belongs to the day before.
- District time series have T entries, building ones T + 1 (an extra initial value). A
  one-year run therefore scores 8,759 hours, not 8,760: the last step is not recorded.
- `round_trip_efficiency` actually returns the one-way efficiency (square root of the
  round-trip value). The name is inverted.
- A full year with 5 buildings takes about 75 s per controller on this laptop.

## 7. How emsbench wraps CityLearn (and why)

We want to be able to leave CityLearn later without rewriting the benchmark. So:

- `benchmark/kpis.py` knows nothing about CityLearn. It takes an `EpisodeTrace`: plain arrays
  of grid energy per meter, price, month, battery energy flows, capacities. It returns
  **absolute** KPIs (money, kW, kWh, equivalent full cycles).
- `adapters/citylearn.py` is the only file that reads CityLearn internals and converts a
  finished episode into an `EpisodeTrace`.
- A test runs a real two-day CityLearn episode and checks that our per-building cost ratios
  match CityLearn's to 5 significant digits. If CityLearn changes, the test catches it.

**Equivalent full cycles (EFC)** = total energy discharged / battery capacity. "One cycle" =
emptying a full battery once. It is the simplest wear proxy; it treats ten 10% dips the same as
one full discharge, which real chemistry does not.

---

## 8. Our own engine (Site Lab)

From November 2026 the simulator core is our own engine (`src/emsbench/sim/`), not CityLearn.
CityLearn remains the source of the data and a cross-check.

**A site** is one grid connection (one meter) with assets on it: buildings (fixed demand),
solar panels, batteries and EV chargers. The app edits exactly this structure, and it saves
as JSON or YAML.

**Every time step (an hour in Plan mode, minutes in Operate mode) the engine:**
1. reads the data: building demand, solar output per kWp, price, cars arriving;
2. asks the controller what it wants: battery power, and charging power per car;
3. applies physics: battery power and fullness limits, losses (round-trip efficiency, split
   equally between charging and discharging), and what each car still needs;
4. runs a **safety layer** for the grid connection. If the site would draw more than its
   limit, it first stops charging the battery, then discharges it harder, then slows the
   EVs, and records whatever overload is left. Above an export limit it curtails solar;
5. records everything and bills it: energy × price, minus exports × export price, plus a
   demand charge on each month's highest hour if you set one.

A controller can therefore never break a limit. It can only ask for something the site
can't do, and the safety layer shows the consequence.

**Controllers so far** (all simple rules):
- *Self-consumption*: store spare solar, use it when short. The default for most home batteries.
- *Price arbitrage*: also buy at the day's cheapest hour and use it at the most expensive.
- *Peak shaving*: keep grid import under a threshold.
- EVs charge either as fast as possible, or at the lowest steady power that still finishes
  by departure.

**Baseline.** Every run is compared with the same site with the battery idle and EVs
charging on arrival, i.e. "the equipment, but no smart control".

**Checked how?** Unit tests on synthetic data (energy balance each hour, limits, losses,
EV delivery, demand charges), and a test showing that for the same home without a battery
our grid power and cost equal CityLearn's to 5 significant digits. Battery physics are
simpler than CityLearn's (constant efficiency instead of power-dependent curves), on
purpose: a transparent baseline first, detail later where it changes decisions.

**Data caveats:** the EV sessions appear synthetic and their generation is not documented;
the dataset's "dynamic" prices have no documented origin. The app shows these notes next to
each profile.

---

## 9. Plan and Operate: two time scales, one engine

**Why two modes.** A question sets its own time scale. "Is this battery worth buying?" needs a year (seasons,
monthly demand charges, wear) and hourly steps are fine. "Will every car be charged by 7:00 without tripping the
fuse?" needs minutes, because a fuse trips on a short peak that an hourly average hides. Same physics, different
step and period, so the app has two modes on one engine instead of two models.

**Resolution must be real.** CityLearn offers "15-second" datasets, but their metadata says they are hourly data
spread evenly over 240 slices. That would look granular and be exactly as smooth as the hourly curve. We use
measured 15-minute data instead (OPSD homes, Energy-Charts prices) and say so when a step is finer than its data.

**Different years, same season and weekday.** Home loads are from 2015-2019, EV visits from 2018-2021, prices
from 2025-26. A simulated Monday in June takes a Monday in June from each source. Patterns that matter (evening
peaks, weekends, solar seasons) stay aligned; the weather on that exact day does not, which is a known limit.

**Phases and fuses.** A European connection has three phases at 230 V each. A 25 A fuse allows about 5.75 kW per
phase. Buildings, solar and batteries are treated as spread evenly; a single-phase car puts its whole load on
one phase, which is how a home can trip one phase while the other two are idle.

**Minimum charging current.** The charging standard IEC 61851-1 lets a charger signal no less than 6 A. On three
phases that is 6 x 3 x 230 V = 4.1 kW: a three-phase charger cannot follow a 3 kW solar surplus, it has to pause.
This is why real "solar charging" products switch to one phase.

**Things the simulator showed that are worth knowing**
- *Rebound peak.* In the shared garage, charging every car in the cheapest hours saves money but makes the
  highest phase current go from 56 A to 63 A, right at the fuse: everyone starts at the same cheap moment. Price
  signals alone can create the peaks they were meant to avoid. Coordination needs the grid limit in the loop
  (MPC, task 4).
- *Behaviour beats strategy.* Norwegian home charging happens in the evening, so a "solar surplus" strategy
  rarely gets sun. The right controller depends on when cars are actually there, which is why real session data
  matters.

---

## 10. Can I trust this data? Lessons from adding sources

- **"Open" is not one thing.** The same price API serves Germany under CC BY and Norway under "private use only".
  Check the licence of every slice you use, not just the website. The data layer now rejects non-CC-BY price zones
  automatically, and the app flags the one non-commercial source (the Utrecht office car park).
- **Measured, modelled, statistics.** Meter data (OPSD homes, EV sessions, market prices) is the most realistic but
  sparse. Models (ComStock buildings, pvlib solar) cover any size and place but are smoother than reality. Statistics
  (Eurostat tariffs) are averages. The app labels each so you know what you are looking at.
- **Check against an independent reference.** Our solar model is compared with PVGIS (EU JRC) for every location;
  the engine is compared with CityLearn; Eurostat's components are checked against its own published totals.
- **Read the small print of a dataset.** Eurostat's "taxes" already include VAT; adding VAT again would have
  overstated German household prices by about €0.06/kWh. One "driver" in the Utrecht data charged 6.6 times a day:
  a shared card, not a person.
- **Why bills look so different from spot prices.** A German household pays about €0.39/kWh all-in, of which only
  about €0.15 is energy and supply; network costs (€0.11) and taxes (€0.12) are the rest (Eurostat 2025). That is why
  a dynamic tariff saves less than the spot price swings suggest: the fixed part does not move.

## 11. Data centers: what is different

- **The load is big and flat.** Our measured example (NREL's ESIF supercomputer centre) averages about 2.9 MW and
  hardly changes between day and night. Homes peak in the evening; data centers are busy all the time. What does move
  the load is jobs starting and stopping: steps of 650 kW or more in 15 minutes happen.
- **PUE = total power / IT power.** Everything above 1.0 is cooling, fans, pumps, lights and losses. The industry
  average is 1.54 (Uptime Institute 2025); ESIF, with warm-water liquid cooling, is about 1.07. Our example uses the
  measured IT load and adds cooling as IT x 0.54, a constant ratio. Real cooling rises on hot afternoons, so our
  summer peaks are, if anything, too low.
- **The UPS battery is for backup first.** It only has to carry the site for the minutes until the diesel generators
  start (often 5 minutes today). We model it as a normal battery with a minimum state of charge (`soc_min`) equal to
  that reserve: the energy above it can be used for peak shaving, the reserve never is. That is the
  "grid-interactive UPS" idea Microsoft piloted in Dublin.
- **Large customers pay for peaks.** On Xcel Colorado's primary-voltage tariff, about half of a data center's bill is
  demand charges: $7.91 per kW of the month's highest 15-minute import, plus $18.65 per kW (summer) of the highest
  import between 14:00 and 18:00. The engine now supports such peak-window demand charges (`demand_charge_profile`).
- **Surprise: the battery barely helps here.** A 4 MWh battery with a simple "keep import under X" rule saved about
  1% of the June bill. With a flat load, high stretches last for hours and the battery runs empty before the peak
  arrives; the rule also wastes energy outside the expensive 14-18 h window. Two lessons: (1) for high-load-factor sites
  the real levers are moving compute jobs and cooling, which is what Google and Emerald AI do; (2) this is exactly where
  a controller that forecasts the next day should beat a rule, which is what our benchmark is for.
- **Time zones again.** The tariff's 14:00-18:00 is local time with summer time; our US data runs on fixed Mountain
  Standard Time, so in summer the window sits at 13:00-17:00 on the simulation clock. Getting this wrong shifts the
  expensive window by an hour.


## 12. Residential flexibility: heat pumps, cars that give back, and the grid operator

- **A heat pump is a battery for heat, if it has a tank.** Electricity = heat / COP, and the COP falls when it is
  cold outside and when radiators need hot water (air-source with radiators averages about 3.2 over the year in the
  German When2Heat data, but dips to 1.5 on the coldest hours). Without a tank, a heat pump must run when the heat is
  needed. With a tank and some spare power it can heat earlier, when power is cheap or solar is spare. An auto-sized
  heat pump (just big enough for the coldest hour) has no spare power, so "cheap hours" barely helps; a 6 kW unit with
  a 14 kWh tank does.
- **Lending a car's energy only pays with a margin.** Every kWh lent comes back with losses both ways (about 10% at
  95% one-way efficiency), so the price now must beat the cheapest price before departure by that much. And if the car
  lends all its spare time, it must later recharge at full power whatever the price, which loses money. Our first
  rule did exactly that and raised the bill; the fixed rule keeps half the remaining stay free for cheap recharging.
- **The 6 A rule bites when you share power.** Splitting a dimmed allowance equally between two three-phase chargers
  gave each 3.8 kW, below the 4.14 kW a three-phase charger needs (6 A x 230 V x 3), so both paused and nothing
  charged. A real energy manager hands the allowance out in order (heat, then cars, then battery) so one car charges.
- **What §14a really says** (BNetzA BK6-22-300, Anlage 1): devices above 4.2 kW (private chargers, heat pumps, air
  conditioning, batteries charging) can be dimmed, but each keeps 4.2 kW (heat pumps above 11 kW keep 40%); with an
  energy manager the whole group keeps 4.2 kW + (n - 1) x a simultaneity factor x 4.2 kW. Grid operators must also offer
  a three-tier network fee by time of day (Modul 3); in Düsseldorf the 2026 spread is small (3.16 to 8.19 ct/kWh), in
  Mosbach larger (3.65 to 11.90 ct/kWh), and only in winter quarters.
- **Smart control can raise the peak.** In our January home example, pre-heating and car charging both chase the same
  cheap hours: the bill fell about 4% but the peak rose from 11.6 to 13.8 kW. Cheap-hour rules need a peak limit
  alongside, or an optimiser that sees both.

## 13. Forecasts: what a controller really knows

- **"Perfect forecast" results are an upper bound, not a prediction.** Site Lab can now run any controller with
  realistic forecasts, using only what a real system knows at that moment: the most recent day's load repeated
  (EMHASS's "naive" method), the weather forecast made a day earlier for solar (Open-Meteo keeps an archive of past
  forecasts), day-ahead prices only once published (auction closes 12:00, results about 13:00), and cars only once
  they plug in. "Compare forecasts" runs both.
- **Deterministic MPC can lose to a simple rule once forecasts are real.** On the German home week (real tariff:
  dynamic price, 7.86 ct/kWh feed-in, no export pay at negative prices), MPC cost €19.96 with perfect forecasts and
  €25.77 with realistic ones, wear included; the self-consumption rule cost €21.74 either way. Putting each piece of
  knowledge back one at a time: perfect solar was worth €2.33, knowing car arrivals €1.87, perfect load €0.68,
  perfect prices nothing (they are published in time). An optimiser that trusts its forecast exports solar it thinks
  it will not need; the rule stores everything and is robust by accident. This is the case for stochastic or robust
  MPC, and for forecasting car visits.
- **The tariff decides which forecast matters.** With exports paid nothing (our earlier setting) not knowing the car's
  arrival dominated (€5.94 of €8.71). With a feed-in tariff, wrongly exported solar still earns something, so solar
  forecasts weigh more. Get the tariff right before drawing conclusions.
- **Day-ahead weather forecasts are rough at the hour level.** Across 10 solar profiles (Oct 2025 to Nov 2026) the
  day-ahead forecast missed daytime output by 17-30% of its mean on average, while yearly totals were within about 10%.
- **Watch the end of the data.** A forecast that pads beyond the last data point with the last value (night: no sun,
  forever) made the perfect-forecast MPC do worse than the realistic one in a test. Padding with the last day repeated
  fixed it. Edges of the horizon change decisions.

## 14. Battery wear: a referee and a price

- **Wear is scored by a validated ageing model, not by the controller.** NREL's open-source BLAST-Lite (BSD-3) turns
  a state-of-charge history and a temperature into capacity lost: calendar ageing (time, average charge, heat) plus
  cycle ageing (energy cycled, depth, charge rate). Site Lab repeats a run's pattern until the battery holds 80% of
  its capacity (a typical warranty threshold) and charges the run its share of the battery's value. Separating the
  referee from the players stops a controller from winning by believing its own optimistic wear model.
- **A new battery ages fastest, so don't price one week of a new battery.** Calendar ageing slows over time; pricing
  a run by its share of a whole life avoids charging the first weeks' steep loss to whoever runs first.
- **Chemistry matters a lot.** At one full cycle a day and 25 °C, the LFP model lasts about 6,150 cycles (19 years) to
  80%, the NMC model about 2,260 (7 years). In the LFP model an empty battery barely ages; a full one ages fastest.
- **A single price per kWh cycled is crude, and whether it pays depends on the tariff.** Calibrated on deep daily
  cycles it is about €0.15/kWh for a home LFP battery at 2022 prices. On the German home week with the real tariff,
  wear-aware MPC cycled less and won once wear was counted (€19.96 vs €20.39 for wear-blind MPC); with exports paid
  nothing it backfired by €0.77. Not because of cycle depth: in the LFP model wear per full cycle is almost the
  same from 10% to 100% depth (it is the NMC model that is depth-sensitive, sixteen-fold). The per-kWh price misses
  calendar ageing, which depends on how full the battery is kept; our guess is that is where the gap comes from. On energy
  alone the simple rule beat the wear-aware optimiser (€11.57 vs €12.32); with wear counted it lost (€21.74).
- **Replacement prices move fast.** German home storage cost about 2,500 €/kWh in 2013, 920 in 2021 and an estimated
  1,200 in 2022 (Figgener et al. 2023, excluding VAT); prices have fallen since. Wear in euros is only as good as
  that number, so it is a setting.

## 15. Real-world rules change the numbers

- **German small solar is paid for exports, but not at negative prices.** New rooftop systems up to 10 kWp earn
  7.86 ct/kWh for partial feed-in (commissioned Aug 2025 - Jan 2026, Bundesnetzagentur). Since the 2025
  "Solarspitzengesetz", new systems with a smart meter earn nothing while the spot price is negative (§ 51 EEG). In
  our June week that rule alone cost the home €3.89 against being paid for every exported kWh, because many sunny
  midday hours had negative prices.
- **A dynamic tariff is mostly fixed fees.** A real price sheet (Stadtwerke Witten, June 2026) adds to the spot price a
  2.50 ct/kWh supplier price, about 11 ct network fee, levies and 19% VAT, plus a monthly base fee. Only the spot part
  moves, so the swing between cheap and dear hours is smaller than the bill suggests.
- **Check the simulator against a published study.** With HTW Berlin's normalised sizes (1 kWp solar and 1 kWh
  battery per MWh of demand) our four measured homes reach a median 58% self-sufficiency (published 56%) and 219
  battery cycles a year (published about 270). Our data is 15-minute, theirs one-minute; the measured homes range from
  49% to 76%, one of them using most of its power around midday.

