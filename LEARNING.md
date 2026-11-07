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
