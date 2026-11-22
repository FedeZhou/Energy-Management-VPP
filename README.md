# Energy-Management-VPP (`emsbench`)

An open source site simulator built around one question: **how reliably can a business site keep a
flexible grid contract, and what battery, contract and controller does that take?**

## Why

Where the grid is congested, a business that wants a bigger connection is often offered a *flexible*
one instead: full power most of the time, a lower limit in agreed windows (the Dutch time-block
contract), a lower limit all day, or limits sent day by day (dynamic operating envelopes). Signing
such a contract is a bet. The site has to know, before it signs, how often it would break the limit
and what it would take not to. That is hard for sites full of electric cars, vans or trucks, whose
arrivals and energy needs are uncertain.

The project's compass is the guide in Learn part 1, *Grid congestion and site flexibility*
([web/app/src/learn/general/](web/app/src/learn/general/)). Its chapter 13, *Where to focus*, recommends
**reliable flexibility for EV-heavy business sites** (logistics depots, charging hubs, retail and
office car parks with batteries), in three parts:

1. **Planning**: battery size and contract choice, with a stated probability of breaching the grid
   limit (for example "the limit holds on at least 90% of days", a P90 promise).
2. **Operation**: a controller that plans for uncertainty and keeps that promise.
3. **One site model** (a digital twin) used for both.

It also says what to avoid: another generic controller or energy management system. Comparing
controllers honestly (rules, MPC, under realistic forecasts, with battery wear priced as a cost) stays
part of the method, because a reliability number is only as good as the controller behind it, but it
is no longer the goal in itself. Decided on 2026-11-21; earlier directions (a residential fleet
benchmark, a generic controller scoreboard) are kept in the docs as background.

**Where it stands (November 2026).** Built: flexible grid contracts (time windows compiled into a
limit for every time step), reliability measures (days the limit was kept against a target, P90 daily
peak against the limit), rule controllers and an MPC on perfect or realistic forecasts, battery wear
from an ageing model, and a Compare tab that benchmarks every strategy. Added on 22 November 2026:

- a **Size & contract planner** that replays a site for battery sizes x contract options and shows cost
  against days kept, with the cheapest option for each level of reliability and a recommendation; an
  option only counts if cars are left short by at most a tolerance (default 1% of the energy they asked
  for, a setting, not a sourced number);
- a **chance-constrained MPC** that plans against the limit minus a safety margin learned from its own past
  forecast errors. On the business car park example (one year, our runs) it kept the limit on 364 of 365
  days, against 350 for the peak-shaving rule and 341 for the cautious MPC, and cost less than the rule,
  but left more car energy undelivered than the rule ([results/chance_mpc](results/chance_mpc/README.md));
- optional **device uncertainty**: a battery whose state-of-charge estimate drifts, power that tapers near
  full and empty, cars that charge more slowly near full;
- a **fleet depot example** on real Leeds City Council charging sessions (Open Government Licence).

Not yet: validation on a real site (it needs a partner with metered data), a margin sized per day rather
than per hour, forecasts of car arrivals, and reliability stated as a probability across many years.
The full list is in Learn, *Limits and roadmap*.

A site (home, apartment garage, office, car park, commercial site, data center) is a configuration of
sources, storage and loads: buildings, solar, batteries, EV chargers (including bidirectional), heat
pumps and data centers. The engine stays generic; the EV focus is a matter of examples and measures.

## Try it

| | What you get | Needs |
| --- | --- | --- |
| **[Open the demo](https://fedezhou.github.io/Energy-Management-VPP/)** | The example sites with pre-computed results (scene, charts, numbers, "Compare forecasts"), including a fleet depot on a flexible contract built on open-licence data, and all Learn pages | A browser |
| [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/FedeZhou/Energy-Management-VPP?quickstart=1) | The full live app: change any site and simulate it | A GitHub account (Codespaces has a free monthly allowance). First start takes several minutes: it installs everything, and the first run downloads the open data (~400 MB) |
| Your computer | The full live app, offline after the first data download | Python 3.11 and Node 22, see below |

## What is in it

- **Site Lab**, a web app where you build a site, run it and watch the energy flows, in two modes:
  **Plan** (hourly, up to a year: costs, savings, battery wear, on how many days the grid limit
  held) and **Operate** (1-15 minute steps over days: EV visits, phase currents, fuses), on measured
  open data. A **Compare** tab pins runs side by side and benchmarks every battery strategy with
  perfect and realistic forecasts; a **Size & contract** tab compares battery sizes and contract options
  by cost and days kept.
- **Learn**, in two parts: general knowledge (a guide to grid congestion and site flexibility: the
  grid, flexible connection contracts, the state of the art in modelling, control and planning, the
  market, batteries and BESS) and how Site Lab works (how it models each system, how it is built,
  how its controllers decide, worked examples and its limits), each statement cited.
- **Results**: a CityLearn baseline scoreboard ([results/](results/baseline_scoreboard.md)) and
  studies such as [the home study with realistic forecasts](results/study_home_de/summary.md) and
  [the chance-constrained MPC on a business car park](results/chance_mpc/README.md).

Background and plain-language notes: [docs/research.md](docs/research.md),
[LEARNING.md](LEARNING.md), [docs/market-landscape.md](docs/market-landscape.md).
Developer notes and commands: [CLAUDE.md](CLAUDE.md).

## Run it on your computer

Requires Python 3.11 (CityLearn 3.2.0 does not install on 3.12) and Node 22.

```bash
python3.11 -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest -m "not integration"                         # fast tests
cd web/app && npm ci && npm run build && cd ../..
emsbench-app                                        # Site Lab at http://localhost:8000
```

The first start downloads and processes the open data once (~400 MB, mostly When2Heat heat
demand); later starts are quick. For frontend work, keep `emsbench-app` running and use
`cd web/app && npm run dev` (live reload at http://localhost:5173).

## Updating the public demo

```bash
python scripts/export_static_demo.py   # pre-compute the example runs (about 20 minutes)
bash scripts/deploy_pages.sh           # static build, published to the gh-pages branch
```

## Data and licences

Only public, openly licensed data and open source tools: see
[docs/data-sources.md](docs/data-sources.md) for sources, licences and attribution. One source
(Utrecht workplace EV sessions) is licensed for non-commercial use only (CC BY-NC-SA 4.0), so the
examples that use it (the office car park and the time-block contract examples,
`configs/sites/plan_ev_timeblock_nl*.yaml`) are left out of the public demo and run only in the
live app; the demo export reads each source's licence from the data registry. The depot example
(`configs/sites/plan_fleet_depot_timeblock.yaml`) uses Leeds City Council fleet sessions under the
Open Government Licence v3.0, which allows commercial use, so it is in the demo. The
non-commercial licence also means a commercial product could not be built on that data without
the rights holders' permission or another dataset. Personal project, not affiliated with any company.

License: MIT.
