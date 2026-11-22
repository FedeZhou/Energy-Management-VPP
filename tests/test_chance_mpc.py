"""The chance-constrained MPC (mpc_execution = "chance"): plans against the limit minus a margin from past errors."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import yaml

from emsbench.sim.controllers import EVState, Observation
from emsbench.sim.forecasts import PerfectForecast, RealisticForecast
from emsbench.sim.model import ControllerSpec, Site
from emsbench.sim.mpc import MPCController, SiteLimits
from emsbench.sim.uncertainty import NetLoadUncertainty, persistence_errors, scenario_days

D = 24
LIMIT = 10.0
PRESETS = Path(__file__).resolve().parents[1] / "configs" / "sites"


def _limits() -> SiteLimits:
    return SiteLimits(step_hours=1.0, battery_capacity_kwh=0.0, battery_min_kwh=0.0, battery_max_kwh=0.0,
                      battery_power_kw=0.0, battery_eta=1.0, import_limit_kw=LIMIT, export_limit_kw=None, fuse_kw=None,
                      export_price=0.0, demand_rate_flat=0.0, charger_efficiency=(1.0,))


def _forecast(hist: np.ndarray, run: np.ndarray, confidence: float = 0.95) -> RealisticForecast:
    n = run.size + 3 * D
    load = np.concatenate([hist, run])
    unc = NetLoadUncertainty(persistence_errors(load, np.zeros(load.size), None, D), hist.size, D,
                             scenario_days(0.9, confidence))
    return RealisticForecast({"load": run, "pv": np.zeros(run.size), "price": np.full(n, 0.3),
                              "demand_rate": np.zeros(n), "import_limit": np.full(n, LIMIT)},
                             hist, np.zeros(hist.size), None, D, 0, None, uncertainty=unc)


def _hungry_car_obs(t: int, load: float) -> Observation:
    # A car that wants more than the limit can give before it leaves at the end of the horizon: the plan charges as
    # much as the (tightened) limit allows in every step.
    car = EVState(connected=True, remaining_kwh=1000.0, steps_left=D, max_kw=11.0, min_kw=0.0, efficiency=1.0)
    return Observation(t=t, step_hours=1.0, load_kw=load, pv_kw=0.0, price=0.3, price_ahead=np.full(D, 0.3),
                       battery_energy_kwh=0.0, battery_capacity_kwh=0.0, battery_max_charge_kw=0.0,
                       battery_max_discharge_kw=0.0, evs=(car,))


def _noise(days: int, seed: int) -> np.ndarray:
    return 5.0 + np.random.default_rng(seed).normal(0.0, 1.0, days * D)


def test_chance_plan_keeps_the_margin_below_the_limit_except_now() -> None:
    hist, run = _noise(40, 1), _noise(5, 2)
    fc = _forecast(hist, run)
    t = 2 * D + 5
    out = {}
    for mode in ("cautious", "chance"):
        c = MPCController(ControllerSpec(battery="mpc", mpc_execution=mode), _limits(), fc)  # type: ignore[arg-type]
        out[mode] = c.solve(_hungry_car_obs(t, float(run[t])))
    load_fc = fc.window("load", t, D)
    load_fc[0] = run[t]
    margin = fc.window("net_backoff", t, D)
    assert np.all(margin[1:] > 0.5)  # differences of unit noise: the largest of 29 is well above 0.5 kW
    planned_import = {m: load_fc + p.ev_kw[0] for m, p in out.items()}
    np.testing.assert_allclose(planned_import["cautious"], LIMIT, atol=1e-6)  # charges up to the limit everywhere
    assert planned_import["chance"][0] == pytest.approx(LIMIT, abs=1e-6)  # now: metered, no margin needed
    np.testing.assert_allclose(planned_import["chance"][1:], LIMIT - margin[1:], atol=1e-6)


def test_tightened_plan_keeps_a_toy_limit_with_the_target_frequency() -> None:
    # No battery: a hungry car is the only thing the controller moves. It re-plans every 2 h, so every second step is
    # executed from a plan made an hour earlier on a forecast; the car then charges what the plan said and the limit is
    # broken whenever the load comes in higher than the plan allowed for. Target 90%: the cautious plan (no margin)
    # breaks it about half the time, the chance plan at most on 10% of those steps (about 1/30 expected).
    hist, run = _noise(40, 3), _noise(30, 4)
    fc = _forecast(hist, run)
    breaks: dict[str, list[bool]] = {}
    for mode in ("cautious", "chance"):
        spec = ControllerSpec(battery="mpc", mpc_execution=mode, mpc_replan_minutes=120)  # type: ignore[arg-type]
        c = MPCController(spec, _limits(), fc)
        out = []
        for t in range(run.size):
            a = c.act(_hungry_car_obs(t, float(run[t])))
            if t % 2 == 1:
                out.append(run[t] + a.ev_kw[0] > LIMIT + 1e-6)
        breaks[mode] = out
    share = {m: float(np.mean(b)) for m, b in breaks.items()}
    assert share["cautious"] > 0.3
    assert share["chance"] <= 0.1


def test_chance_without_uncertainty_equals_cautious() -> None:
    # A perfect forecast has no errors to learn from, so no margin: the chance plan is the cautious plan.
    z = np.zeros(3 * D)
    fc = PerfectForecast({"load": z + 5.0, "pv": z, "price": z + 0.3, "demand_rate": z,
                          "import_limit": z + LIMIT}, [], D)
    plans = [MPCController(ControllerSpec(battery="mpc", mpc_execution=m), _limits(), fc)  # type: ignore[arg-type]
             .solve(_hungry_car_obs(3, 5.0)) for m in ("cautious", "chance")]
    np.testing.assert_allclose(plans[0].ev_kw, plans[1].ev_kw, atol=1e-9)


def test_defaults_are_unchanged() -> None:
    spec = ControllerSpec()
    assert spec.mpc_execution == "cautious" and spec.forecast == "perfect" and spec.battery == "self_consumption"


@pytest.mark.integration
@pytest.mark.parametrize("preset", sorted(p.stem for p in PRESETS.glob("*.yaml")))
def test_presets_do_not_depend_on_the_uncertainty_machinery(preset: str, monkeypatch: pytest.MonkeyPatch) -> None:
    """Every preset as shipped, and with a realistic cautious MPC, gives the same KPIs whether or not the probabilistic
    forecast exists: only mpc_execution = "chance" may use it (it adds calibration KPIs, nothing else)."""
    import emsbench.sim.engine as engine
    from emsbench.data import load_library

    raw = yaml.safe_load((PRESETS / f"{preset}.yaml").read_text(encoding="utf-8"))["site"]
    raw["days"] = min(raw["days"], 2)
    variants = [raw, {**raw, "controller": {**raw.get("controller", {}), "battery": "mpc", "forecast": "realistic"}}]
    lib = load_library()
    for v in variants:
        site = Site.model_validate(v)
        with_unc = engine.simulate(site, lib)
        with monkeypatch.context() as m:
            m.setattr(engine, "_net_load_uncertainty",
                      lambda *a, **k: NetLoadUncertainty(np.full(1, np.nan), 0, D))  # no error record at all
            without = engine.simulate(site, lib)
        assert with_unc.kpis == without.kpis, preset
        assert with_unc.reliability == without.reliability, preset
