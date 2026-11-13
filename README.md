# Energy-Management-VPP (`emsbench`)

An open source, generic site energy management simulator and an **honest benchmark of control
strategies under increasing forecast error**, with battery wear priced as a cost.

A site (home, apartment garage, office, commercial site, data center) is a configuration of sources,
storage and loads: buildings, solar, batteries, EV chargers (including bidirectional), heat pumps and
data centers. Controllers compared so far: rule-based strategies and a rolling-horizon MPC, each with
perfect or realistic forecasts.

## Try it

| | What you get | Needs |
| --- | --- | --- |
| **[Open the demo](https://fedezhou.github.io/Energy-Management-VPP/)** | The example sites with pre-computed results (scene, charts, numbers, "Compare forecasts") and all Learn pages | A browser |
| [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/FedeZhou/Energy-Management-VPP?quickstart=1) | The full live app: change any site and simulate it | A GitHub account (Codespaces has a free monthly allowance). First start takes several minutes: it installs everything, and the first run downloads the open data (~400 MB) |
| Your computer | The full live app, offline after the first data download | Python 3.11 and Node 22, see below |

## What is in it

- **Site Lab**, a web app where you build a site, run it and watch the energy flows, in two modes:
  **Plan** (hourly, up to a year: costs, savings, battery wear) and **Operate** (1-15 minute steps
  over days: EV visits, phase currents, fuses), on measured open data.
- **Learn**, short review-style pages on control (rules, MPC, planning under uncertainty,
  reinforcement learning), the systems (batteries, solar, EVs, heat pumps, tariffs, data centers),
  research digests and a market overview, each statement cited.
- **Results**: a CityLearn baseline scoreboard ([results/](results/baseline_scoreboard.md)) and
  studies such as [the home study with realistic forecasts](results/study_home_de/summary.md).

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
(Utrecht workplace EV sessions) is licensed for non-commercial use only; the example that uses it
is left out of the public demo. Personal project, not affiliated with any company.

License: MIT.
