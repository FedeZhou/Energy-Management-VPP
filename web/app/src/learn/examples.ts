// Practical examples: real-world situations worked through in Site Lab, each teaching one concept with numbers from
// our own runs and a demo link. Same rules as pages.ts: every {id} must exist in a source list; statements are backed
// by a cited source, by this repository, or by our own runs (labelled as such). LaTeX lives in String.raw strings only.
import type { Page } from "./pages";
import type { Source } from "./sources";

export const EXAMPLE_PAGES: Page[] = [
  // ------------------------------------------------------------------ 1. Does a home battery pay?
  {
    id: "ex-battery-payback", section: "examples", title: "Does a home battery pay for itself?",
    summary: "Self-sufficiency nearly doubles and the bill falls by about €550 a year, but the battery is worth €12,000. Four real homes over a full year, with what the arithmetic leaves out.",
    blocks: [
      { kind: "h", text: "The situation" },
      { kind: "p", text: "A family in Germany already has 8 kWp of solar on the roof and an electric car. An installer offers a 10 kWh battery and promises to 'double your self-sufficiency'. Self-sufficiency is the share of the home's own consumption that does not come from the grid. The family's real question is different: will the battery earn back what it costs?" },
      { kind: "p", text: "Three numbers get mixed up in this conversation: self-sufficiency, the yearly energy bill, and battery wear. Wear is the part of the battery's life each year of use eats up, priced as a share of what the battery is worth. This page keeps them apart." },
      { kind: "h", text: "What we ran" },
      { kind: "facts", rows: [
        ["Homes", "The four measured German households of the year study, each with its own measured car driver {runs_2026_11e}."],
        ["Equipment", "8 kWp solar, a 10 kWh / 5 kW LFP battery, an 11 kW charger. Example sizes, not sourced {runs_2026_11e}."],
        ["Tariff", "Day-ahead price plus grid fees, taxes and a real supplier margin; exports earn the EEG feed-in tariff of 7.86 ct/kWh, nothing while the spot price is negative {bnetza_eeg} {eeg51} {witten_tariff}."],
        ["Period", "November 2025 to October 2026, hourly steps, perfect forecasts {ex_year}."],
        ["Comparison", "Battery idle versus the self-consumption rule (store spare solar, use it when short). The car charges in the cheapest hours in both runs, so the difference is the battery alone {ex_year}."],
        ["Battery value", "1,200 €/kWh, the 2022 average for German home systems excluding VAT, so €12,000 for 10 kWh {figgener2023}."],
      ] },
      { kind: "h", text: "The numbers (median of the four homes, range in brackets)" },
      { kind: "facts", rows: [
        ["Self-sufficiency", "39.5% (27% to 51%) without the battery, 68.5% (48% to 80%) with it {ex_year}."],
        ["Energy bill saving, before wear", "€553 a year (€418 to €592) {ex_year}."],
        ["Battery wear", "€374 a year (€262 to €395). In the ageing model the battery lasts about 32 years (30 to more than 40) at about 180 full cycles a year (140 to 191) {ex_year} {code_wear}."],
        ["Saving after wear", "€175 a year (€146 to €218) {ex_year}."],
        ["Simple payback", "€12,000 ÷ yearly energy saving = about 22 years (20 to 29) {ex_calc}."],
      ] },
      { kind: "math", tex: String.raw`\text{simple payback} = \frac{\text{battery price}}{\text{yearly energy saving}} = \frac{1{,}200\ \tfrac{\text{EUR}}{\text{kWh}} \times 10\ \text{kWh}}{553\ \tfrac{\text{EUR}}{\text{year}}} \approx 22\ \text{years}`,
        caption: String.raw`'Simple' because it ignores interest, price changes and repairs. A full cycle means charging and discharging the whole capacity once; half a cycle twice counts as one {ex_calc}.` },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "Self-sufficiency is not money. Each kWh the battery stores was solar that would otherwise have been exported for 7.86 ct, and it replaces a kWh bought later at the full household price, minus charging losses. That gap, not the share of own power, is what the battery earns {bnetza_eeg} {code_engine}.",
        "Wear is a real cost the bill does not show. Here it is about two thirds of the gross saving (median €374 of €553) {ex_year}.",
        "Whether it pays depends on how long the battery really lasts. The model says about 32 years, but a common home-battery warranty covers 10 years or 30 MWh {lg_resu12}. Ten years of the median saving is €5,530, less than half the price {ex_calc}.",
        "Break-even price: to pay back within 10 years, the battery would have to cost about €553 per kWh, under half the 2022 average. Prices have fallen since 2022, so check today's quote against that figure {ex_calc} {figgener2023}.",
        "Do the free thing first. In the same homes, simply charging the car in the cheapest hours saved €149 a year (median) with no battery at all; see 'Charging the car when power is cheap' {ex_year}.",
      ] },
      { kind: "h", text: "What is not included" },
      { kind: "list", items: [
        "Interest on the money, and the fact that a euro saved in 15 years is worth less than one today {ex_calc}.",
        "Replacing the inverter or other electronics during the battery's life. Installation may or may not be in the 2022 price: the market review notes that it is not always clear what published prices include {figgener2023}.",
        "Future changes in prices, fees and feed-in rules: the run repeats one year's tariff {runs_2026_11e}.",
        "Standby draw: real home batteries used 4 to 64 W when idle in a 2026 lab test of 12 systems; Site Lab does not model it, which flatters the battery slightly {htw_inspektion2026}.",
        "Anything besides savings: Site Lab does not model backup power in an outage, for example {code_engine}.",
      ] },
      { kind: "note", tone: "info", text: "Can we trust the model? For a home with 1 kWp of solar and 1 kWh of battery per MWh of yearly demand, HTW Berlin published 59% self-consumption and 56% self-sufficiency; our model gives 62% and 58% (median over its homes). Without a battery: published about 30% / 30%, ours 32% / 33% {weniger2014} {code_validate}." },
      { kind: "note", tone: "info", text: "Try it: open Site Lab at #plan_home_de_ev-run. This is home 4 of the study with the rule running. Then set Battery strategy to Idle in the Inspector's Control strategy section and run again: the energy cost should go from about €1,421 to about €2,013 a year {ex_year}. Set the battery's Replacement cost to 600 to see wear halve." },
    ],
  },

  // ------------------------------------------------------------------ 2. Charging the car when power is cheap
  {
    id: "ex-ev-cheap-hours", section: "examples", title: "Charging the car when power is cheap",
    summary: "Plug in and charge at once, or let the wallbox pick the cheapest hours before you leave? A June week and a full year, with no battery involved.",
    blocks: [
      { kind: "h", text: "The situation" },
      { kind: "p", text: "A driver comes home in the evening, plugs in, and leaves the next morning. By default the wallbox charges at full power straight away. On a dynamic tariff the price changes every 15 minutes with the day-ahead market (the 'spot price'), so the driver can instead tell the wallbox when the car must be ready and let it choose the cheapest moments in between. Does it make a difference?" },
      { kind: "h", text: "What we ran" },
      { kind: "facts", rows: [
        ["Site", "The German home example: measured household, 8 kWp solar, 11 kW charger, measured car visits from a Norwegian home garage (a car of about 7 kW) {runs_2026_11d}."],
        ["Period", "8 to 14 June 2026, 15-minute steps, real German tariff {runs_2026_11d}."],
        ["Battery", "Idle, so only the car's timing changes {ex_week}."],
        ["Strategies", "As fast as possible (full power on arrival), Cheapest hours, Solar surplus, Spread until departure (lowest steady power that still finishes) {code_ctrl}."],
        ["Year", "The four study homes, November 2025 to October 2026, hourly, car on arrival versus cheapest hours {ex_year}."],
      ] },
      { kind: "h", text: "The numbers" },
      { kind: "facts", rows: [
        ["Every strategy", "9 car visits, 92.6 kWh delivered, no car left short {ex_week}."],
        ["As fast as possible", "Energy cost €29.32 for the week; self-sufficiency 31%; highest grid import 7.5 kW {ex_week}."],
        ["Cheapest hours", "€26.18 (€3.14 or 10.7% less); self-sufficiency 35%; grid import 90.4 kWh instead of 96.2 kWh {ex_week}."],
        ["Solar surplus", "€26.15; self-sufficiency 39.5% {ex_week}."],
        ["Spread until departure", "€28.21; highest grid import 4.8 kW instead of 7.5 kW {ex_week}."],
        ["Full year, battery idle", "Cheapest hours saved €149 a year (median; €65 to €280) {ex_year}."],
        ["Full year, with the battery rule", "Still €126 a year (€16 to €154) on top of what the battery saves {ex_year}."],
      ] },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "It is the cheapest saving there is: no extra hardware beyond a controllable wallbox and a dynamic tariff, and no battery wear {ex_week}.",
        "In a German June, cheap hours and sunny hours overlap: lots of solar on the grid pushes the midday spot price down (this week's negative prices all fell in daytime). That is why 'cheapest hours' also raised self-sufficiency, from 31% to 35%, when the car happened to be home in daytime {ex_week}.",
        "The saving depends a lot on the household and the driver: four-fold between the four homes over a year {ex_year}.",
        "There is a trade-off with peaks. Spreading the charge lowers the home's peak but saves less. In a shared garage, cheapest hours started every car at the same cheap moment and pushed the busiest phase from 56 A to the full 63 A {runs_2026_11}.",
        "Cheapest hours needs to know when the car leaves. Site Lab assumes the driver enters it at plug-in, as in a charging app {code_forecasts}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: open Site Lab at #operate_home_ev-run. In the Inspector's Control strategy section, set Battery strategy to Idle, then switch EV charging strategy between As fast as possible, Cheapest hours and Solar surplus and run each time. Watch when the car's charging appears in the chart compared with the price line." },
    ],
  },

  // ------------------------------------------------------------------ 3. Negative prices
  {
    id: "ex-negative-prices", section: "examples", title: "Negative prices and the 2025 solar rule",
    summary: "On a sunny weekend the spot price fell below zero for 21 hours, and more than half the week's exports earned nothing. Why a battery cannot fix that, and what can.",
    blocks: [
      { kind: "h", text: "The situation" },
      { kind: "p", text: "On sunny days so much solar power reaches the market that the day-ahead price can drop below zero: producers pay to get rid of power. Since the 2025 'Solarspitzengesetz', a new German solar system earns no feed-in tariff while the spot price is negative, once it has a smart meter {eeg51}. A homeowner with a battery asks: how much do I lose, and can my battery save it?" },
      { kind: "h", text: "What we ran" },
      { kind: "facts", rows: [
        ["Site", "The German home example: 8 kWp solar, 10 kWh / 5 kW battery, car charging in the cheapest hours {runs_2026_11d}."],
        ["Period", "8 to 14 June 2026 (Monday to Sunday), 15-minute steps, perfect forecasts {runs_2026_11d}."],
        ["Export rules compared", "Feed-in tariff for every kWh; feed-in except at negative prices (today's rule); exports paid nothing {runs_2026_11d}."],
        ["Battery", "Self-consumption rule, and the optimiser (MPC) for comparison {ex_week}."],
      ] },
      { kind: "h", text: "The numbers" },
      { kind: "facts", rows: [
        ["Negative spot price", "85 quarter-hours, 21.25 hours in all, only on Saturday and Sunday: about 07:30-17:45 and 06:30-17:30 (CET, the data's clock; add an hour for German summer time). Lowest: -5.3 ct/kWh {ex_week}."],
        ["Exports in the week", "87.9 kWh with the battery rule; 49.5 kWh of it while the price was negative, so unpaid {runs_2026_11d} {ex_week}."],
        ["Energy cost of the week", "€7.68 if every kWh were paid; €11.57 with today's rule; €14.59 if exports earned nothing {runs_2026_11d}."],
        ["Check", "49.5 kWh × 7.86 ct = €3.89, exactly the gap between €11.57 and €7.68: 56% of the week's €6.91 feed-in income {ex_calc}."],
        ["Unpaid exports by battery strategy", "Battery idle 64.0 kWh; self-consumption rule 49.5 kWh; MPC that knows the future 48.9 kWh {ex_week}."],
        ["Battery fullness when prices turned negative", "Rule: 42% on Saturday, 81% on Sunday. MPC: 5% and 0%, but only 23% and 36% full when the negative hours ended {ex_week}."],
        ["Import price at the lowest spot price", "Still about 21 ct/kWh: -5.3 ct spot plus 26.7 ct of fees, taxes and margin {ex_calc} {eurostat_check} {witten_tariff}."],
      ] },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "The rule hits exactly the hours a solar home exports most. In this week it removed more than half of the feed-in income {ex_calc}.",
        "A battery can only store what the home will use later. Even the planner that knew the future emptied the battery before the weekend's negative hours, then stored only about what the evening and night needed. Our reading: storing more would have left the battery still full when the next morning's solar arrived, and would have cost wear {ex_week}.",
        "For a household, a negative spot price does not mean free power. Fees and taxes keep the import price around 21 ct/kWh, so buying from the grid to fill the battery does not pay on this tariff {ex_calc}.",
        "What helps is moving consumption into those hours: the car, a heat pump, hot water. Here the car happened to be home and took 24.6 kWh during negative-price hours, the same with every charging strategy {ex_week}.",
      ] },
      { kind: "note", tone: "warn", text: "One week, one home, one region's prices. How often negative prices occur changes from year to year; the full-year study includes all of them {runs_2026_11e}." },
      { kind: "note", tone: "info", text: "Try it: open Site Lab at #operate_home_ev-run. In the Inspector's Tariff section, untick 'No export pay at negative spot prices' and run again, then set Export price to 0. Then open #operate_home_ev-mpc-run and look at the battery on Saturday and Sunday." },
    ],
  },

  // ------------------------------------------------------------------ 4. Forecasts
  {
    id: "ex-forecasts", section: "examples", title: "Why the clever controller lost: forecasts",
    summary: "An optimiser that plans the next 24 hours beat a simple rule with perfect forecasts, and lost to it with realistic ones. Which forecast mattered most, and what that means for products.",
    blocks: [
      { kind: "h", text: "The situation" },
      { kind: "p", text: "A company sells a 'smart' home energy optimiser. It uses model predictive control (MPC): every hour it plans battery and car charging for the next 24 hours with a linear program, carries out the first step, and plans again {code_mpc}. In the demo it beats the simple self-consumption rule. In the field, customers see less. Why?" },
      { kind: "p", text: "The demo used perfect forecasts: the simulator told the planner the true future. A real controller only knows what has happened and what has been published {code_forecasts}." },
      { kind: "h", text: "What we ran" },
      { kind: "facts", rows: [
        ["Site", "The German home example, 8 to 14 June 2026, 15-minute steps, real tariff, wear included {runs_2026_11d}."],
        ["Perfect forecasts", "The true future for load, solar, prices and car visits {code_forecasts}."],
        ["Realistic forecasts", "Load: yesterday repeated. Solar: the weather forecast from about a day earlier. Prices: only once published (about 13:00 for the next day). Cars: unknown until they plug in {code_forecasts}."],
        ["One ingredient at a time", "Realistic forecasts, but one input made perfect again, to see which one costs most {runs_2026_11d}."],
        ["Year", "The four study homes, full year, rule versus MPC with both kinds of forecast {runs_2026_11e}."],
      ] },
      { kind: "h", text: "The numbers (cost including wear)" },
      { kind: "facts", rows: [
        ["Self-consumption rule", "€21.74 for the week with either kind of forecast: it only reacts to what it measures {runs_2026_11d}."],
        ["MPC, perfect forecasts", "€19.96: €1.78 better than the rule {runs_2026_11d}."],
        ["MPC, realistic forecasts", "€25.77: €4.03 worse than the rule. Self-sufficiency fell from 69% to 51% (the rule reaches 73%) and exports rose from 96.6 to 124.1 kWh {runs_2026_11d} {ex_week}."],
        ["Perfect solar only", "€23.44: worth €2.33 {runs_2026_11d}."],
        ["Perfect car arrivals only", "€23.90: worth €1.87 {runs_2026_11d}."],
        ["Perfect load only", "€25.09: worth €0.68 {runs_2026_11d}."],
        ["Perfect prices only", "€25.77: worth nothing, because published day-ahead prices are already exact {runs_2026_11d}."],
        ["Full year, saving vs battery idle", "Rule €336; MPC perfect €399; MPC realistic €239 (medians). The rule beat realistic MPC in all four homes {runs_2026_11e}."],
      ] },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "Perfect forecasts give an upper bound, not a prediction of field results. Over a year, the optimiser's €63 lead over the rule (median) turned into a €97 deficit once it had to forecast {runs_2026_11e}.",
        "A planner that trusts a wrong forecast commits the battery to the wrong plan. Here it left solar unstored: lower self-sufficiency than even the simple rule {ex_week}.",
        "Not all forecasts matter equally. Solar and car arrivals were worth most; prices nothing, because they are published a day ahead {runs_2026_11d}. For a product, that says where to invest: better solar forecasts and asking drivers for their plans.",
        "To beat a good rule, the optimiser must plan for uncertainty instead of trusting one forecast; see 'Planning under uncertainty'. Until then, a well-chosen rule is a hard baseline {runs_2026_11e}.",
      ] },
      { kind: "note", tone: "info", text: "Try it: open Site Lab at #operate_home_ev-mpc-compare. It runs the MPC with perfect and with realistic forecasts side by side (the Compare forecasts button in the toolbar does the same). To run one by hand, change Forecasts in the Inspector's Control strategy section. Then set Battery strategy to Self-consumption and compare again: the rule does not change." },
    ],
  },

  // ------------------------------------------------------------------ 5. Wear changes the ranking
  {
    id: "ex-wear-ranking", section: "examples", title: "Battery wear changes which strategy is best",
    summary: "Ranked by the energy bill, the wear-blind optimiser wins. Ranked by bill plus wear, the order flips. And a battery that just sits full wears out too.",
    blocks: [
      { kind: "h", text: "The situation" },
      { kind: "p", text: "An installer compares battery strategies for a customer by looking at the energy bill. But every kWh that goes through the battery uses up part of its life, and so does time, especially when the battery sits full. Site Lab prices that wear as a share of the battery's replacement value, using NREL's BLAST-Lite ageing model {blast_lite} {code_wear}. Does counting it change the advice?" },
      { kind: "h", text: "What we ran" },
      { kind: "facts", rows: [
        ["Site", "The German home example, 8 to 14 June 2026, 15-minute steps, real tariff, car in the cheapest hours, perfect forecasts {runs_2026_11d}."],
        ["Battery value", "1,200 €/kWh (2022 average, excluding VAT), LFP chemistry at 25 °C {figgener2023} {runs_2026_11d}."],
        ["Strategies", "Battery idle; price arbitrage (store spare solar, also fill up from the grid at the day's cheapest step, cover the home at the dearest); self-consumption rule; MPC ignoring wear; MPC pricing wear (Site Lab's default) {code_ctrl} {code_mpc}."],
      ] },
      { kind: "h", text: "The numbers (energy cost / wear / total, euros per week)" },
      { kind: "facts", rows: [
        ["Battery idle", "26.18 / about 0 / 26.18 {runs_2026_11d}."],
        ["Price arbitrage", "26.22 / 4.57 / 30.79. The battery sat 93% full on average, gave out only 2.1 kWh all week and ended it full; 71% of its wear came from time, not from cycling {runs_2026_11d} {ex_week}."],
        ["Self-consumption rule", "11.57 / 10.16 / 21.74. 5.2 full cycles; the battery would last 22.6 years {runs_2026_11d}."],
        ["MPC ignoring wear", "10.06 / 10.34 / 20.39. 6.4 full cycles; 22.3 years {runs_2026_11d}."],
        ["MPC pricing wear", "12.32 / 7.64 / 19.96. 4.4 full cycles; 30.1 years {runs_2026_11d}."],
        ["Ranking by energy only", "MPC ignoring wear, then the rule, then MPC pricing wear {runs_2026_11d}."],
        ["Ranking including wear", "MPC pricing wear, then MPC ignoring wear, then the rule: the order flips {runs_2026_11d}."],
        ["Battery at 600 €/kWh instead", "Rule 16.66; MPC ignoring wear 15.23; MPC pricing wear 15.35. With wear half as dear, the two MPCs end up almost level {ex_week}."],
        ["Full year, four homes", "Saving vs battery idle: MPC ignoring wear €395, MPC pricing wear €399 a year (medians); battery life 35 versus 39.5 years {runs_2026_11e}."],
      ] },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "Ranking by the bill favours strategies that work the battery harder. The wear-blind optimiser saved €2.26 more energy than the wear-aware one, but used up €2.70 more battery {runs_2026_11d}.",
        "Wear is the same size as what cycling earns. With the rule, wear divided by cycles is about €2 per full cycle of 10 kWh, roughly 20 ct per kWh through the battery, counting ageing from time as well {ex_calc} {runs_2026_11d}.",
        "Pricing wear mostly buys life, not money: over a year it saved only €4 more (median) but stretched battery life by about four years {runs_2026_11e}.",
        "A full battery ages even when unused. Price arbitrage barely cycled, yet wore the battery by €4.57 in a week, because in the ageing model calendar wear grows with the average fullness {ex_week} {blast_lite}.",
        "The right wear price depends on what the battery costs. At half the 2022 price the advantage of pricing wear almost disappears {ex_week}.",
      ] },
      { kind: "note", tone: "warn", text: "One more twist from the same week: with realistic forecasts, MPC ignoring wear (€24.37) beat MPC pricing wear (€25.77) {runs_2026_11d}. One week is an anecdote; over the full year both saved €239 (median) with realistic forecasts {runs_2026_11e}." },
      { kind: "note", tone: "info", text: "Try it: open Site Lab at #operate_home_ev-mpc-run. In the Inspector's Control strategy section, untick 'MPC prices battery wear' and run again; compare the wear card and the battery life. Then click the battery and change Replacement cost (empty means 1,200 for a home battery)." },
    ],
  },

  // ------------------------------------------------------------------ 6. Demand charges
  {
    id: "ex-demand-charges", section: "examples", title: "Demand charges: one quarter-hour sets the month's bill",
    summary: "A 6 MW data center pays almost half its bill for its single highest quarter-hours. A simple threshold saved 1.1%, a planner with perfect forecasts 5.4%, and the same planner with realistic forecasts nothing.",
    blocks: [
      { kind: "h", text: "The situation" },
      { kind: "p", text: "Commercial sites often pay a demand charge: a price per kW of the highest power they draw in a month, on top of the price per kWh. One bad quarter-hour therefore sets a charge for the whole month. A data center in Colorado has a battery that doubles as its UPS (the backup that bridges a power cut). The facilities manager asks: can the battery cut the bill by shaving peaks, without touching the backup reserve?" },
      { kind: "h", text: "What we ran" },
      { kind: "facts", rows: [
        ["Load", "Measured IT load of NREL's ESIF high-performance computing data center, times a PUE of 1.54 for cooling and overheads (the 2025 industry average) {esif_pue} {uptime_2025}."],
        ["Tariff", "Xcel Energy Colorado, Schedule PG (summer): energy about 4.9 US cents/kWh; 7.91 USD per kW of the month's highest 15-minute import; plus 18.65 USD per kW of the highest import between 14:00 and 18:00 {urdb_xcel_pg} {code_tariffs}."],
        ["Battery", "4,000 kWh / 1,000 kW, keeping 12.5% as a 5-minute backup reserve that no strategy may use {zincfive2024} {code_engine}."],
        ["Period", "June 2026, 15-minute steps {ex_dc}."],
        ["Strategies", "Battery idle; peak shaving with a fixed 5,400 kW threshold; MPC with perfect and with realistic forecasts {ex_dc}."],
      ] },
      { kind: "h", text: "The numbers (June bill, USD)" },
      { kind: "facts", rows: [
        ["Battery idle", "307,079: energy 160,201 plus demand charges 146,878. Those come from a monthly peak of 5,618 kW (44,436) and a 14:00-18:00 peak of 5,493 kW (102,441) {ex_dc}."],
        ["Peak shaving at 5,400 kW", "303,637 (1.1% less). The peak was held at exactly 5,400 kW; only 0.5 full cycles {ex_dc} {runs_2026_11}."],
        ["MPC, perfect forecasts", "290,354 (5.4% less). The 14:00-18:00 peak fell to 4,624 kW, but the monthly peak only fell to 5,550 kW, higher than with the simple rule; 9.1 full cycles {ex_dc}."],
        ["MPC, realistic forecasts", "307,047: 32 USD less than idle. Both peaks were almost unchanged (5,618 and 5,483 kW), after 7.1 full cycles {ex_dc}."],
        ["Backup reserve", "Never touched in any run: the battery never went below 12.5% {ex_dc}."],
      ] },
      { kind: "h", text: "What it teaches" },
      { kind: "list", items: [
        "Read the tariff before choosing a strategy. Demand charges were 48% of this bill, and the afternoon window costs 2.4 times more per kW than the all-day peak, so the planner spent the battery there {ex_dc} {ex_calc}.",
        "The lowest peak is not the lowest bill. The planner's monthly peak was higher than the rule's, yet its bill was 4.4% lower {ex_dc} {ex_calc}.",
        "Forecasts matter even more than at home: one missed quarter-hour sets the month's charge. With yesterday's load as the forecast, the planner cycled the battery seven times and saved almost nothing {ex_dc} {code_forecasts}.",
        "Strategies built for energy prices can backfire. In our California office example, price arbitrage cut the energy bill by 12.7% but raised the peak from 158 to 218 kW, which a demand charge would bill every month {runs_2026_11}.",
      ] },
      { kind: "note", tone: "warn", text: "Battery wear is not priced here: Site Lab only has a default replacement cost for euro sites. Set one on the battery to include it {code_wear}." },
      { kind: "note", tone: "info", text: "Try it: open Site Lab at #operate_data_center-run and change Peak-shaving threshold in the Inspector's Control strategy section (try 5,300 or 5,500). Then open #operate_data_center-mpc-run for the planner, and #operate_data_center-mpc-compare to see perfect and realistic forecasts side by side." },
    ],
  },
];

export const EXAMPLE_SOURCES: Source[] = [
  { id: "ex_week", title: "Site Lab runs for the practical examples: German home EV week (configs/sites/operate_home_ev.yaml, 8-14 June 2026), 11 Nov 2026",
    read: "data",
    note: "Our own simulations, 15-minute steps, the example's real tariff, perfect forecasts unless stated: battery idle with each EV strategy (as fast as possible, cheapest hours, solar surplus, spread until departure); self-consumption rule with the car on arrival or in the cheapest hours, with exports and battery fullness during negative spot prices; price arbitrage (average fullness, wear split); MPC with perfect and realistic forecasts; rule and both MPCs with the battery replacement cost set to 600 EUR/kWh." },
  { id: "ex_year", title: "Site Lab runs: the four study homes over a full year, battery and car timing separated, 11 Nov 2026",
    read: "data",
    note: "Our own simulations of configs/sites/plan_home_de_ev.yaml with the four homes and drivers of python -m emsbench.study, Nov 2025 - Oct 2026, hourly, perfect forecasts: battery idle or self-consumption, car on arrival or in the cheapest hours. The self-consumption + cheapest-hours runs reproduce the study's 'rule' rows exactly. Medians and ranges across the four homes." },
  { id: "ex_dc", title: "Site Lab runs: data center, June 2026 (configs/sites/operate_data_center.yaml), 11 Nov 2026",
    read: "data",
    note: "Our own simulations, 15-minute steps: battery idle, peak shaving at 5,400 kW, MPC with perfect and with realistic forecasts (24 h horizon, hourly re-plan). Wear not priced (no default replacement cost for USD sites)." },
  { id: "ex_calc", title: "Our arithmetic on the example runs",
    read: "data",
    note: "Products, differences and ratios of the numbers shown on these pages, e.g. payback = battery value / yearly energy saving, with no interest or price changes." },
];
