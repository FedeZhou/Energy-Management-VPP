# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this is

`emsbench`: an open source, generic site energy management simulator and an honest benchmark of
control strategies (rules, deterministic MPC, stochastic/robust MPC, hybrid, safe RL) under
increasing forecast error, with battery wear priced as a cost. A site (home, building, C&I with
battery/PV/EV chargers, data center) is a config of sources, storage and loads.
Background and conclusions: [docs/research.md](docs/research.md). Plain-language notes:
[LEARNING.md](LEARNING.md).

The owner is a product manager learning the field: explain what you build and why in plain
language, and flag uncertainty.

## Hard constraints

- **Employer-neutral.** Personal project. No charger firmware, proprietary protocols,
  confidential data or anything from the owner's employer. Public and open data only.
- **Generic core.** EV-specific variants must be config and naming changes only.
- **Licenses.** CityLearn and EMHASS are MIT (keep notices if code is reused). OpenEMS is
  EPL-2.0/AGPL-3.0: **never copy OpenEMS code into this repo.**
- `reference/` holds read-only clones of third-party repos (gitignored). Never modify them.

## Working rules

- **Never invent numbers.** Every parameter in `configs/` cites its source in a comment
  (URL + what it says). Items marked [K] in docs/research.md are unverified: check before use.
- Before big design choices, present 2-3 options with trade-offs and a recommendation.
- Say when something contradicts docs/research.md.
- Small commits, tests for core logic, type hints (`mypy --strict` on `src/`).
- Update LEARNING.md when we learn something non-obvious about CityLearn or the domain.

## Environment

- Python **3.11** (CityLearn 3.2.0 pins scikit-learn<=1.2.2, which has no 3.12 wheels).
- The repo lives in OneDrive, so the virtualenv lives **outside** it:
  `%USERPROFILE%\.venvs\energy-vpp`. `uv` is in `%USERPROFILE%\.venvs\tools`.
- This machine's antivirus (Avast) inspects HTTPS. pip >= 24.2 handles it; for uv set
  `UV_SYSTEM_CERTS=1`; in Python code call `emsbench.net.use_system_certificates()` before any
  download (CityLearn downloads datasets from GitHub on first use, cached in
  `%LOCALAPPDATA%\citylearn-project`).
- pytest's cache is disabled because OneDrive locks files mid-sync.

## Commands

```bash
PY="$USERPROFILE/.venvs/energy-vpp/Scripts/python.exe"
$PY -m pytest                          # all tests (integration ones run real CityLearn, ~15 s)
$PY -m pytest -m "not integration"     # fast unit tests only
$PY -m ruff check src tests && $PY -m mypy src
$PY -m emsbench.baseline               # full-year baseline scoreboard -> results/ (~5 min)
$PY -m emsbench.baseline --end-step 167 --out /tmp/smoke   # one-week smoke run
# install / update deps
UV_SYSTEM_CERTS=1 VIRTUAL_ENV="$USERPROFILE/.venvs/energy-vpp" \
  "$USERPROFILE/.venvs/tools/Scripts/uv.exe" pip install -e ".[dev]"
```

## Layout

- `src/emsbench/benchmark/` simulator-independent KPIs (`EpisodeTrace` -> `EpisodeKPIs`), later
  the forecast-error harness. Must not import CityLearn.
- `src/emsbench/adapters/citylearn.py` the only place that knows CityLearn internals.
- `src/emsbench/controllers/` controllers. `baseline.py` runs the scoreboard.
- `configs/` site and device YAML with sourced parameters. `results/` curated scoreboards.
- `docs/` research and notes. `tests/` tests. `reference/` third-party clones (gitignored).

## CityLearn gotchas (3.2.0)

- Battery action in [-1, 1] is a fraction of **nominal power** (kW), not capacity. The RBC
  docstrings ("% of maximum capacity") are stale.
- District KPIs are the **unweighted mean of per-building ratios** to the no-battery baseline,
  not a ratio of totals. We report both.
- Cost is clipped at zero **per building per step**: exports earn nothing and do not offset
  other buildings' imports.
- District series have T entries, building series T+1. First step is labelled hour 24 of the
  previous day.
- `StorageDevice.round_trip_efficiency` actually returns sqrt(efficiency), i.e. one-way.

## Replay page

```bash
$PY -m emsbench.viz.export       # hourly site series per controller -> results/raw/replay.json (~5 min)
$PY -m emsbench.viz.build_page   # injects it into web/replay.html -> results/raw/replay.html
```
Published privately as an Artifact: https://claude.ai/artifact/BNSTVCwDxWpTYNpaJtbrYC
