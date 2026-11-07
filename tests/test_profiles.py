"""Calendar windows and resampling of profiles and EV session sets."""

import datetime as dt

import numpy as np
import pytest

from emsbench.sim.profiles import EVSession, EVSessionSet, Profile

D = dt.datetime


def hourly(start: D, days: int, cyclic: bool = False) -> Profile:
    return Profile("p", "load", "test", "test", np.arange(days * 24, dtype=float), start, 3600, cyclic=cyclic)


def test_exact_window_and_native_resolution() -> None:
    p = hourly(D(2024, 1, 1), 10)
    v, info = p.window(D(2024, 1, 2), 24, 3600)
    assert v[0] == 24 and v.size == 24
    assert info.source_start == D(2024, 1, 2) and info.resampling == "native"


def test_other_year_same_weekday() -> None:
    p = hourly(D(2016, 6, 1), 60)  # covers June-July 2016
    start = D(2026, 6, 8)  # a Monday
    v, info = p.window(start, 24, 3600)
    assert info.source_start.weekday() == start.weekday()
    assert info.source_start.year == 2016
    assert abs((info.source_start - D(2016, 6, 8)).days) <= 3


def test_averaging_and_repeating() -> None:
    p = Profile("p", "load", "t", "t", np.arange(8, dtype=float), D(2024, 1, 1), 900)
    v, info = p.window(D(2024, 1, 1), 2, 3600)  # 15 min -> 1 h: mean of 4
    assert v.tolist() == [1.5, 5.5] and info.resampling == "averaged"
    v, info = p.window(D(2024, 1, 1), 6, 300)  # 15 min -> 5 min: repeated and flagged
    assert v.tolist() == [0, 0, 0, 1, 1, 1] and info.resampling.startswith("repeated")


def test_cyclic_profile_wraps() -> None:
    p = hourly(D(2024, 7, 31, 23), 365, cyclic=True)
    v, info = p.window(D(2025, 7, 30), 72, 3600)  # runs past the end of the data
    assert v.size == 72


def test_missing_period_is_a_clear_error() -> None:
    p = hourly(D(2016, 6, 1), 30)
    with pytest.raises(ValueError, match="covers 2016-06-01"):
        p.window(D(2026, 1, 10), 24, 3600)


def test_sessions_window_to_steps() -> None:
    s = (EVSession(D(2019, 6, 10, 18, 7), D(2019, 6, 11, 7, 2), 12.0, "car", 7.0, 50.0),)
    sset = EVSessionSet("e", "e", "t", s, D(2019, 1, 1), D(2019, 12, 31))
    rows, info = sset.window(D(2019, 6, 10), 96, 900)
    a, d, sess = rows[0]
    assert a == int(np.ceil((18 * 60 + 7) / 15)) and d == min(96, int(((24 + 7) * 60 + 2) // 15))
    assert sess.max_kw == 7.0
