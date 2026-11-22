# Chance-constrained MPC: does it keep the promise? (22 Nov 2026)

Question (docs/research.md, "Direction (2026-11-21)", tension paragraph): on the limit-keeping objective, does an MPC
that plans for uncertainty with a chance constraint beat the cautious MPC and the peak-shaving rule?

Answer on one business site, one year: **it keeps the limit on more days than both (364 of 365, against 350 for the
rule and 341 for the cautious MPC) and costs 2.4% less than the rule including battery wear, but it leaves 38% more
car energy undelivered than the rule (2.8 against 2.0 MWh, about 4.5% of the energy the cars asked for).** It costs
1.1% more than the cautious MPC and delivers more car energy than it. All numbers are our own simulations.

## What `mpc_execution: chance` does

The cautious MPC, plus a safety margin under the import limit for every future step of the plan (constraint
tightening, guide section 7.2 / Figure 14). The margin for a time of day is the largest amount by which the net load
(load minus solar) exceeded its forecast at that time of day over the last N days (scenario approach, guide section
4.2): with N = ceil(ln(1 - confidence) / ln(target)) days, the chance that this margin fails on more than 1 - target
of new days is at most 1 - confidence. Defaults: target = `site.grid.reliability_target` (0.9), confidence =
`controller.mpc_chance_confidence` (0.95), so N = 29 days. The current step is metered and has no margin. Code:
`src/emsbench/sim/uncertainty.py`, `src/emsbench/sim/mpc.py`.

Why this design rather than the alternatives:

- *Quantile back-off only* (subtract the forecast's 90% quantile): no statement of confidence, and the plain empirical
  quantile is the same thing as the scenario rule with about 50% confidence (row "chance, 50%" below).
- *Scenario MPC with the whole plan as the decision*: the Campi-Garatti bound grows with the number of decision
  variables (hundreds per plan here), so it would need hundreds of sampled days.
- *Margin from the scenario approach on one number per time of day* (chosen): the bound needs only 29 days for a 90%
  target at 95% confidence, keeps the LP the same size (runtime +7%), and its assumption can be checked on the run
  (below).

## Result: time-block car park (`configs/sites/plan_ev_timeblock_nl.yaml`)

Full year from 6 Oct 2025, hourly, 110 kW limit on working days 08:00-12:00 (250 kW otherwise; illustrative
contract), 150 kWh / 75 kW battery, 20 chargers, realistic forecasts for the MPCs. EUR per year. Runtime: one run on
its own on the author's laptop.

| Controller | Days kept | Excess over limit (kWh) | Cost incl. wear | of which wear | EV unmet (kWh) | Runtime |
|---|---|---|---|---|---|---|
| Peak-shaving rule (as shipped) | 350 (95.9%) | 366 | 175,593 | 2,263 | 2,006 | 6 s |
| MPC cautious | 341 (93.4%) | 618 | 169,562 | 2,368 | 3,985 | 77 s |
| **MPC chance, 95% (N = 29, default)** | **364 (99.7%)** | **26** | **171,378** | 2,571 | **2,772** | 82 s |
| MPC chance, 50% (N = 7) | 362 (99.2%) | 74 | 171,193 | 2,622 | 2,820 | ~same |
| MPC chance, 99.9% (N = 66) | 364 (99.7%) | 19 | 171,427 | 2,560 | 2,825 | ~same |
| MPC cautious, perfect forecasts (bound) | 365 (100%) | 0 | 170,361 | 2,502 | 1,797 | - |

Calibration on this run: the 90% quantile forecast of net load was exceeded on 8.4% of steps (expected 10%: slightly
cautious); the 29-day margin was exceeded on 3.1% of steps (allowed 10%; for independent days the theory expects about
1/30 = 3.3%).

Where the undelivered car energy is (sessions with a shortfall, kWh / sessions): rule 795 / 114 for cars leaving by
12:00, 993 / 114 for stays of at most 4 h, 218 / 48 others; chance 1,347 / 132, 988 / 116, 437 / 60. So the extra
shortfall is mostly cars that leave inside the morning window. Our guess, not verified: the MPC learns about each car
only when it plugs in, and with the margin it holds the battery for later in the window instead of spending it on a
car that leaves at 11:00; the rule spends it straight away (that is also why the rule breaks the limit later in the
morning on its 15 lost days).

## Result: apartment block (`configs/sites/plan_apartment_ev.yaml`, quick check)

Full year, 80 kW firm limit, 50 kWh battery, 4 chargers. Every controller keeps the limit on all 365 days, so the
chance constraint has nothing to fix: it costs 18,517 against 18,415 for the cautious MPC (+0.6%) and 20,850 for the
shipped price-arbitrage rule (22,113 for peak shaving), and lowers undelivered car energy from 7.5 to 1.6 kWh (the
rules: 1.6). Battery wear is not priced here (no default replacement cost for USD price data, `sim/wear.py`).
Quantile calibration: 10.5% of steps above the 90% quantile (expected 10%).

## Limits

- One business site with an illustrative contract, one year, one battery size. Not a holdout: the design and the
  defaults were fixed before the full-year run, but the site is the one the question was asked on.
- It overshoots the target (99.7% of days against 90%): the margin is per hour, while a day is lost if any hour is,
  and the per-hour margins together are more cautious than a promise about days needs. A day-level margin (joint
  chance constraint) could give back some cost and car energy; not built.
- Only the uncontrollable net load is treated as uncertain. Cars are not forecast at all until they plug in (the
  engine pauses cars before it breaks the limit, so car uncertainty shows up as undelivered energy, not broken days).
  A probabilistic forecast of arrivals and energy is the obvious next step for the EV-unmet column.
- The scenario bound assumes independent, alike days. Days are not (weekdays, seasons); the run's exceedance rate is
  the check, and here it matched the theory.

Reproduce: run `emsbench.sim.engine.simulate()` on the preset with the controller overridden, e.g.
`{"battery": "mpc", "forecast": "realistic", "mpc_execution": "chance"}` (or set it in the app);
KPIs `limit_days_kept`, `total_cost_with_wear`, `ev_unmet_kwh`, and the calibration fields
`forecast_quantile_exceed_share` and `chance_backoff_exceed_share`.
