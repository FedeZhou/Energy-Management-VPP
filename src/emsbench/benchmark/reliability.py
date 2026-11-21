"""Contract reliability: how often a site kept its grid import limit ("days kept" and a P90-style promise).

A flexible grid contract is only useful if the site can say how reliably it keeps the limit (guide section 4.2:
"the limit holds on at least 90% of days"). These KPIs answer that for one simulated run, from the import power
and the limit per step. Simulator-independent: plain arrays in, numbers out.

Definitions (a "day" is a local calendar day, midnight to midnight):

- a day is *evaluated* if it is complete (all its steps are in the run) and the limit is finite in at least one of
  its steps (a weekday-only contract does not count unlimited weekends as kept days);
- a day is *kept* if import never exceeded the limit in any step of it (tolerance `TOL_KW`, numerical only);
- `limit_days_kept_share` = kept / evaluated; `limit_target_met` = share >= target;
- `limit_excess_kwh`: energy imported above the limit, over all steps of the run (partial days included);
- `limit_worst_excess_kw` and `limit_worst_excess_date`: the largest excess in one step and the day it happened;
- `limit_daily_peak_ratio_at_target`: each evaluated day's highest import / limit (over its limited steps), then
  the value that `target` of the days stay at or below (P90 for the default target 0.9; the "inverted CDF"
  quantile, so it is an actual day's value). Below 1 means a margin on the target-share of days (0.85 = 15%
  below the limit); above 1 means the target-share day overshoots (1.10 = 10% over). The target is met when
  this is at most 1 (up to the tolerance). It says how far the site is from keeping (or losing) its promise,
  which the share alone does not. None if a limit of 0 kW makes the ratio undefined.

Partial days: the Site Lab engine always starts a run at midnight and runs whole days, so it has none; for other
traces a day cut by the run's start or end is not evaluated (a half day could look kept only because the busy
half was cut off), but its excess energy still counts.

All fields are None when the run has no limit at all (or no complete limited day).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict, dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]
TOL_KW = 1e-3  # numerical tolerance (1 W) for "at or under the limit"; not a contract parameter


@dataclass(frozen=True)
class LimitReliability:
    limit_days_evaluated: int | None
    limit_days_kept: int | None
    limit_days_kept_share: float | None
    limit_reliability_target: float | None
    limit_target_met: bool | None
    limit_excess_kwh: float | None
    limit_worst_excess_kw: float | None
    limit_worst_excess_date: str | None  # ISO date, None if never exceeded
    limit_daily_peak_ratio_at_target: float | None

    def as_dict(self) -> dict[str, float | int | bool | str | None]:
        return asdict(self)


NO_LIMIT = LimitReliability(None, None, None, None, None, None, None, None, None)


def limit_reliability(import_kw: FloatArray, limit_kw: FloatArray, start: dt.datetime, step_hours: float,
                      target: float) -> LimitReliability:
    """Reliability KPIs for net grid power `import_kw` (negative = export) against `limit_kw` (inf = unlimited),
    for steps of `step_hours` starting at local time `start`."""
    imp = np.clip(np.asarray(import_kw, dtype=float), 0.0, None)
    lim = np.asarray(limit_kw, dtype=float)
    if imp.shape != lim.shape:
        raise ValueError("import_kw and limit_kw must have the same shape")
    limited = np.isfinite(lim)
    if not limited.any():
        return NO_LIMIT
    excess = np.where(limited, imp - np.where(limited, lim, 0.0), 0.0)
    excess_kwh = float(np.clip(excess, 0.0, None).sum() * step_hours)

    step_s = step_hours * 3600.0
    steps_per_day = round(86400 / step_s)
    offset = start.hour * 3600 + start.minute * 60 + start.second  # seconds after midnight of the first step
    day_idx = ((offset + step_s * np.arange(imp.size)) // 86400).astype(int)
    over = excess > TOL_KW
    kept = evaluated = 0
    ratios: list[float] = []
    for d in np.unique(day_idx):
        in_day = day_idx == d
        if int(in_day.sum()) != steps_per_day or not limited[in_day].any():
            continue
        evaluated += 1
        kept += 0 if over[in_day].any() else 1
        sel = in_day & limited
        with np.errstate(divide="ignore", invalid="ignore"):
            r = np.where(lim[sel] > 0, imp[sel] / np.where(lim[sel] > 0, lim[sel], 1.0),
                         np.where(imp[sel] > TOL_KW, np.inf, 0.0))
        ratios.append(float(r.max()))
    if evaluated == 0:
        return NO_LIMIT
    share = kept / evaluated
    ratio_q = float(np.quantile(np.array(ratios), target, method="inverted_cdf"))
    worst = int(np.argmax(excess))
    worst_kw = float(excess[worst])
    worst_date = None
    if worst_kw > TOL_KW:
        worst_date = (start + dt.timedelta(seconds=step_s * worst)).date().isoformat()
    return LimitReliability(
        limit_days_evaluated=evaluated,
        limit_days_kept=kept,
        limit_days_kept_share=share,
        limit_reliability_target=target,
        limit_target_met=share >= target - 1e-12,
        limit_excess_kwh=excess_kwh,
        limit_worst_excess_kw=max(worst_kw, 0.0),
        limit_worst_excess_date=worst_date,
        limit_daily_peak_ratio_at_target=ratio_q if np.isfinite(ratio_q) else None,
    )
