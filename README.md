# Energy-Management-VPP (`emsbench`)

An open source, generic site energy management simulator and an **honest benchmark of control
strategies under increasing forecast error**, with battery wear priced as a cost.

A site (home, office building, commercial site with battery/solar/EV chargers, data center) is a
configuration of sources, storage and loads. Controllers compared: rule-based, deterministic MPC,
stochastic/robust MPC, hybrid, and safe RL.

Status: early. **Site Lab**, a local web app where you build a site (buildings, solar, batteries, EV chargers), run it and watch the energy flows, is working in two modes: **Plan** (hourly, up to a year: costs, savings, wear) and **Operate** (15-minute steps over days: EV visits, phase currents, fuses), on measured open data. CityLearn baseline scoreboard in [results/](results/baseline_scoreboard.md).

- Research and rationale: [docs/research.md](docs/research.md)
- How things work, in plain language: [LEARNING.md](LEARNING.md)
- Developer notes and commands: [CLAUDE.md](CLAUDE.md)

## Quick start

Requires Python 3.11 (CityLearn 3.2.0 does not install on 3.12).

```bash
python3.11 -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
pytest
python -m emsbench.baseline --end-step 167          # one-week smoke run
python -m emsbench.data                             # download open data (~70 MB, once)
cd web/app && npm install && npm run build && cd ../..
emsbench-app                                        # Site Lab at http://localhost:8000
```

Uses only public, openly licensed data and open source tools: see [docs/data-sources.md](docs/data-sources.md) for sources, licences and attribution (OPSD, SINTEF/Zenodo, Energy-Charts/SMARD, Open-Meteo, CityLearn).

License: MIT.
