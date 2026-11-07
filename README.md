# Energy-Management-VPP (`emsbench`)

An open source, generic site energy management simulator and an **honest benchmark of control
strategies under increasing forecast error**, with battery wear priced as a cost.

A site (home, office building, commercial site with battery/solar/EV chargers, data center) is a
configuration of sources, storage and loads. Controllers compared: rule-based, deterministic MPC,
stochastic/robust MPC, hybrid, and safe RL.

Status: early. **Site Lab**, a local web app where you build a site (buildings, solar, batteries, EV chargers), run a year in about a second and watch the energy flows, is working. CityLearn baseline scoreboard in [results/](results/baseline_scoreboard.md).

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
cd web/app && npm install && npm run build && cd ../..
emsbench-app                                        # Site Lab at http://localhost:8000
```

Uses only public data and open source tools. Built on
[CityLearn](https://github.com/citylearn-project/CityLearn) (MIT).

License: MIT.
