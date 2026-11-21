"""Grid connection contracts compiled into one import limit per time step.

A firm connection has one fixed import limit (or none). A flexible contract lowers it in recurring windows
(guide section 3.2): a *time-limited* contract, such as the Dutch time-block right, gives firm access except in
agreed windows; a *capacity-limited* one is a lower limit all day (one all-day window, or just the firm limit).

The engine compiles the contract once per run into `limit_kw[t]` (inf = unlimited) and everything that enforces or
plans for the limit reads that series: the engine's safety layer, the rule controllers (through the observation)
and the MPC (through the forecast, series "import_limit"). A dynamic operating envelope or a day-ahead limit
profile (guide section 4.3) can later replace the compiled series without touching any controller.

Clock: the simulation clock is the site's local time; a run starts at midnight of its start date. European data
uses fixed CET (UTC+1, no summer time), see sim/profiles.py.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
from numpy.typing import NDArray

from emsbench.sim.model import WEEKDAYS, GridConnection

FloatArray = NDArray[np.float64]
MIN_PER_DAY = 1440


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def has_import_limit(grid: GridConnection) -> bool:
    """True if the contract limits import at some time (a firm limit or at least one window)."""
    return grid.import_limit_kw is not None or bool(grid.contract_windows)


def compile_import_limit(grid: GridConnection, start: dt.datetime, steps: int, step_s: int) -> FloatArray:
    """The import limit for each of `steps` steps of `step_s` seconds from `start` (inf = unlimited).

    Inside a window the limit is the lower of the window's and the firm limit; where windows overlap, the lowest
    applies. A step that overlaps a window for any part gets its limit. Windows that start the day before the run
    and wrap past midnight are included.
    """
    firm = grid.import_limit_kw if grid.import_limit_kw is not None else np.inf
    if not grid.contract_windows:
        return np.full(steps, firm, dtype=float)
    step_min = step_s / 60
    if step_min != int(step_min):
        raise ValueError("Contract windows need a time step of whole minutes.")
    sm = int(step_min)
    n_min = steps * sm
    offset = start.hour * 60 + start.minute  # minutes from midnight to the first step
    per_min = np.full(n_min, firm, dtype=float)
    first_day = start.date()
    n_days = (offset + n_min) // MIN_PER_DAY + 1
    for w in grid.contract_windows:
        a, b = _minutes(w.start), _minutes(w.end)
        if b <= a:  # wraps past midnight; start == end is the whole day
            b += MIN_PER_DAY
        days = set(w.days)
        for d in range(-1, n_days + 1):
            if WEEKDAYS[(first_day + dt.timedelta(days=d)).weekday()] not in days:
                continue
            lo = d * MIN_PER_DAY + a - offset
            hi = d * MIN_PER_DAY + b - offset
            lo, hi = max(lo, 0), min(hi, n_min)
            if lo < hi:
                per_min[lo:hi] = np.minimum(per_min[lo:hi], w.import_limit_kw)
    out: FloatArray = per_min.reshape(steps, sm).min(axis=1)
    return out
