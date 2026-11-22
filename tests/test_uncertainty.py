"""Probabilistic net-load forecasts and the scenario-approach margin (sim/uncertainty.py), on synthetic data."""

from __future__ import annotations

import numpy as np
import pytest

from emsbench.sim.forecasts import RealisticForecast
from emsbench.sim.uncertainty import (
    NetLoadUncertainty,
    persistence_errors,
    scenario_confidence,
    scenario_days,
)

D = 24  # hourly steps per day


def _noisy_days(days: int, seed: int, sd: float = 1.0) -> np.ndarray:
    """A daily load shape plus independent noise at every step."""
    rng = np.random.default_rng(seed)
    shape = 5.0 + 3.0 * np.sin(np.arange(D) / D * 2 * np.pi)
    return np.tile(shape, days) + rng.normal(0.0, sd, days * D)


def test_scenario_days_follow_the_guide_bound() -> None:
    # Guide section 4.2: eps = 10% and N = 66 days give 0.9^66 = 0.001, i.e. 99.9% confidence.
    assert scenario_days(0.9, 0.999) == 66
    assert scenario_confidence(0.9, 66) == pytest.approx(0.999, abs=1e-4)
    assert scenario_days(0.9, 0.95) == 29  # 0.9^28 = 0.052 > 0.05 >= 0.9^29 = 0.047
    assert scenario_days(0.95, 0.95) == 59
    assert scenario_days(0.0, 0.95) == 0  # no target, no margin


def test_quantiles_and_margin_use_no_future_data() -> None:
    # Change everything from step t on: what is known at step t must not move.
    hist, run = _noisy_days(30, 1), _noisy_days(20, 2)
    t = 10 * D + 7
    changed = run.copy()
    changed[t:] += np.random.default_rng(3).normal(0.0, 50.0, changed.size - t)
    out = []
    for r in (run, changed):
        load = np.concatenate([hist, r])
        unc = NetLoadUncertainty(persistence_errors(load, np.zeros(load.size), None, D), hist.size, D, 29)
        fc = RealisticForecast({"load": r, "pv": np.zeros(r.size)}, hist, np.zeros(hist.size), None, D, 0, None,
                               uncertainty=unc)
        out.append((unc.error_quantile(t, 48, 0.9), unc.backoff(t, 48), fc.window("net_backoff", t, 48),
                    fc.window("load", t, 48)))
    for a, b in zip(out[0], out[1], strict=True):
        np.testing.assert_array_equal(a, b)


def test_samples_are_the_same_time_on_earlier_days_before_the_issue_step() -> None:
    errors = np.arange(10 * D, dtype=float)  # error = its own index, to read back which steps were used
    unc = NetLoadUncertainty(errors, 0, D)
    t = 5 * D + 3
    smp = unc.samples(np.array([t, t + 1, t + D]), np.array([t, t, t]), 2)
    # step t (metered, not yet in the error record): yesterday and the day before at the same time
    np.testing.assert_array_equal(smp[0], [t - D, t - 2 * D])
    np.testing.assert_array_equal(smp[1], [t + 1 - D, t + 1 - 2 * D])
    # a day ahead: the same time yesterday is not observed yet either (it is step t + D - D = t), so two and three
    # days before the target
    np.testing.assert_array_equal(smp[2], [t - D, t - 2 * D])


def test_quantile_forecast_is_calibrated_on_noise() -> None:
    # Independent noise: the 0.9-quantile forecast should be exceeded on about 10% of steps (with 28 samples, the
    # inverted-CDF quantile is the 26th of 28, exceeded with probability 3/29 = 10.3%), and the scenario margin (the
    # largest of 29) on about 1/30 = 3.3% of steps, within the allowed 10%.
    load = _noisy_days(400, 4)
    unc = NetLoadUncertainty(persistence_errors(load, np.zeros(load.size), None, D), 30 * D, D,
                             scenario_days(0.9, 0.95))
    steps = load.size - 30 * D
    share, n = unc.calibration(steps, 0.9)
    assert n == steps
    assert share == pytest.approx(3 / 29, abs=0.015)
    b_share, _ = unc.backoff_exceedance(steps)
    assert b_share is not None and b_share == pytest.approx(1 / 30, abs=0.01)
    assert b_share <= 0.1


def test_overconfident_forecast_shows_in_calibration() -> None:
    # Calm history, then a much noisier run: the quantiles learned from calm days are exceeded far more often.
    load = np.concatenate([_noisy_days(40, 5, sd=0.2), _noisy_days(40, 6, sd=3.0)])
    unc = NetLoadUncertainty(persistence_errors(load, np.zeros(load.size), None, D), 40 * D, D)
    share, _ = unc.calibration(5 * D, 0.9)  # the first noisy days, with a window still full of calm days
    assert share is not None and share > 0.3


def test_solar_errors_use_the_day_ahead_forecast() -> None:
    load = np.full(3 * D, 4.0)
    pv = np.tile(np.r_[np.zeros(8), np.full(8, 6.0), np.zeros(8)], 3)
    pv_fc = pv + 1.0  # the forecast always promises 1 kW more solar than comes
    err = persistence_errors(load, pv, pv_fc, D)
    assert np.all(np.isnan(err[:D]))
    np.testing.assert_allclose(err[D:], 1.0)  # net load is 1 kW higher than forecast
