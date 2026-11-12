# Cautious MPC: how it was chosen and how it was tested (11-12 Nov 2026)

Question: with realistic forecasts the MPC lost to the self-consumption rule in every home of this study. Can an MPC
that expects its forecast to be wrong beat the rule on homes and drivers it was not tuned on, on the energy bill and
on cost including battery wear?

Answer: **yes, `mpc_execution: cautious`**, in all four homes on both measures. The margin is modest: median 33 EUR/yr
on energy and 45 EUR/yr including wear, about 4% of the rule's cost including wear. Its runs took about half as long
as the plain MPC's.

All numbers are our own simulations. Wear is priced with the default home replacement cost (1,200 EUR/kWh, Figgener et
al. 2023) and BLAST-Lite's LFP model at 25 °C, as everywhere in Site Lab. Sizes (8 kWp, 10 kWh / 5 kW, 11 kW
charger) are example choices.

## What cautious does

Four habits of a planner that does not trust its forecast (`src/emsbench/sim/mpc.py`):

1. Plan with the metered load and solar of the current step instead of their forecast.
2. Between re-plans the battery still takes up forecast error, but never by trading more with the grid: no charging
   from an import, no discharging into an export. Before this, a cloud made the battery discharge into a planned
   export at the 7.86 ct feed-in price.
3. Value energy left at the end of the plan net of the wear of using it later. Without this the plan hoarded: it kept
   the battery 50-80% full for two days while the car charged from the grid at about 0.36 EUR/kWh.
4. When storing now or later costs the same, store now (a tie-break of 1e-5 EUR per kWh per hour). With a flat
   feed-in tariff the plain plan often exported morning sun and planned to charge "later"; on Wed 10 June its battery
   was 14% full at 18:00 (the rule: 92%) when the car arrived.

## How it was chosen (tuning set)

The design was developed on branch `stochastic-mpc` (a separate attempt that also built its own scenario MPC; only
the cautious habits were carried over to this branch). Tuning set: `configs/sites/plan_home_de_ev.yaml` with this
study's four homes paired with four **other** drivers (opsd/residential4 + sintef/OSL_S_KT146, residential5 +
BAR_Plass157, residential2 + OSL_S_KT162, residential6 + OSL_S_KT49), 28 days from 3 Nov 2025, 2 Feb, 4 May and
3 Aug 2026, hourly, realistic forecasts. Sum of the 16 runs, EUR. Rows marked * used temporary switches the final code
does not have, so they cannot be re-run from it.

| Variant | Energy | Incl. wear |
|---|---|---|
| Rule | 1,604 | 2,039 |
| MPC, plain plan | 1,854 | 2,238 |
| * + habits 1 and 2 | 1,833 | 2,113 |
| * + habit 3 | 1,788 | 2,058 |
| + habit 4 = **cautious** (tie-break 1e-5) | 1,565 | 2,004 |
| * same with tie-break 1e-4 / 1e-3 | 1,565 / 1,582 | 2,006 / 2,029 |
| MPC, perfect forecasts, plain plan | 1,567 | 1,973 |
| * MPC, perfect forecasts + habit 3 | 1,545 | 1,922 |

The design was fixed on this table before the test below was run.

## Test (this study's homes and drivers, not used for tuning)

`python -m emsbench.study --controllers mpc_cautious --merge`, full year Nov 2025 - Oct 2026, hourly. EUR per year,
energy / including wear; the other rows are from the same `runs.csv`.

| Home + driver | Rule | MPC plan | MPC hybrid | MPC cautious |
|---|---|---|---|---|
| residential2 + OSL_S_KT43 | 127 / 523 | 288 / 571 | 215 / 575 | 84 / 458 |
| residential4 + BOD_02H0505 | 1,425 / 1,797 | 1,545 / 1,887 | 1,494 / 1,884 | 1,390 / 1,758 |
| residential5 + BAR_Plass160 | 31 / 403 | 153 / 430 | 144 / 479 | 0 / 352 |
| residential6 + OSL_S_KT45 | 1,752 / 2,014 | 1,888 / 2,211 | 1,869 / 2,165 | 1,734 / 1,993 |
| **Median** | 776 / 1,160 | 916 / 1,229 | 855 / 1,230 | 737 / 1,108 |

Saving of cautious against the rule, per home: energy 18 to 44 EUR/yr, including wear 20 to 65 EUR/yr.
With perfect forecasts cautious costs 722 / 1,097; the plain plan 726 / 1,050: storing early costs some battery life
when the future is known.

The same habits reproduce on the one-week case (`configs/sites/operate_home_ev.yaml`, 8-14 June 2026, 15-min steps,
realistic forecasts): rule 11.58 / 21.74, plain plan 20.33 / 25.77, hybrid 14.83 / 23.28, cautious 11.13 / 20.43.

## Limits

- Only the drivers differ between tuning and test. Home loads, weather and prices are the same series (four homes
  cover a year; there is one year of prices and archived solar forecasts), and the test year contains the tuning
  windows.
- Four homes, one tariff (German dynamic price with the EEG feed-in tariff), one equipment size. With this tariff a
  stored kWh replaces a roughly 30 ct import and gives up a 7.86 ct export, so "store whenever you can" is close to
  optimal; planning for uncertainty may matter more with small grid connections or demand charges.
- Not optimal over the battery's life: with perfect forecasts the plain plan is cheaper including wear.
