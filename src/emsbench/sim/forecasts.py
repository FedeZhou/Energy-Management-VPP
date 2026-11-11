"""What controllers are told about the future: perfect knowledge, or what a real system would know.

Both kinds answer the same two questions, so a controller cannot tell which one it has:
`window(name, t, steps)` for the series load, pv, price and demand_rate, and `sessions(charger, t, steps)`
for car visits expected to start after step t.

Realistic forecasts use only information a real controller would have at step t:

- load: the most recent day repeated (EMHASS's "naive" method: "the load at each future time step will
  be equal to the load observed at the same time of day on the most recent day",
  https://emhass.readthedocs.io/en/latest/forecasts.html);
- solar: the weather model's forecast from about a day earlier, run through the same solar model as the
  actual data (Open-Meteo Previous Runs API, see `emsbench.data.openmeteo_forecast`); where no archived
  forecast exists, yesterday's solar repeated, like the load;
- day-ahead prices: known only once published. The European day-ahead auction closes at 12:00 CET and
  publishes results around 13:00 for the whole next day (gate closure 12:00 CET, Nord Pool; final results
  12:58-13:01, MESC 2024), so before 13:00 a controller knows prices until midnight, after 13:00 until
  the end of tomorrow; beyond that, the last known day repeated. Fixed tariffs are known in advance;
- demand charges: known (they are part of the tariff);
- cars: unknown until they plug in. Once plugged in, departure and energy are known, as if the driver
  had entered them in an app.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

# Price profiles that come from a day-ahead auction, and the local hour (profile clock, CET) at which the
# next day's prices become known. Sources: see module docstring.
DAY_AHEAD_PUBLISHED_HOUR = {"ec/": 13.0}


@dataclass(frozen=True)
class FutureSession:
    """A car visit the controller expects: steps are absolute (arrive inclusive, depart exclusive)."""

    arrive: int
    depart: int
    energy_kwh: float
    max_kw: float
    min_kw: float
    phase: str = "3"


class Forecast(Protocol):
    """What the controller is told about the future. `name` is load, pv, price or demand_rate."""

    def window(self, name: str, t: int, steps: int) -> FloatArray: ...

    def sessions(self, charger: int, t: int, steps: int) -> list[FutureSession]: ...


def _pad(s: FloatArray, t: int, steps: int, period: int = 0) -> FloatArray:
    """s[t: t + steps]; past the end of the data, the last `period` steps repeated (last value if 0)."""
    out = s[t: t + steps]
    if out.size < steps:
        if 0 < period <= s.size:
            tail = s[-period:]
            k = np.arange(s.size, t + steps) - (s.size - period)
            out = np.concatenate([out, tail[k[-(steps - out.size):] % period]])
        else:
            out = np.concatenate([out, np.full(steps - out.size, s[-1] if s.size else 0.0)])
    return out.astype(float)


@dataclass
class PerfectForecast:
    """Tells the controller the true future (an upper bound on what any forecast can achieve)."""

    series: dict[str, FloatArray]
    ev: list[list[FutureSession]] = field(default_factory=list)  # per charger, in time order
    period: int = 0  # past the end of the data, repeat the last day (steps per day); 0 = the last value

    def window(self, name: str, t: int, steps: int) -> FloatArray:
        return _pad(self.series[name], t, steps, self.period)

    def sessions(self, charger: int, t: int, steps: int) -> list[FutureSession]:
        """Cars that will arrive after step t and before t + steps."""
        if charger >= len(self.ev):
            return []
        return [s for s in self.ev[charger] if t < s.arrive < t + steps]


def persistence(history: FloatArray, actual: FloatArray, t: int, steps: int, period: int,
                extra_periods: int = 0) -> FloatArray:
    """Repeat the most recent `period` steps observed before step t (`extra_periods` more periods back).

    `history` holds the steps just before step 0 (at least one period), `actual` the run itself. Step t is not
    yet observed, so the forecast for step t + k is the value one, two, ... periods earlier, whichever is the
    latest already seen; `extra_periods` = 1 uses the day before that, and so on. Where the history is too short,
    the earliest value available is used.
    """
    ext = np.concatenate([history, actual])
    now = t + history.size  # index of step t in ext
    k = now + np.arange(steps)
    back = ((k - now) // period + 1 + extra_periods) * period
    out: FloatArray = ext[np.clip(k - back, 0, ext.size - 1)].astype(float)
    return out


@dataclass
class RealisticForecast:
    """Forecasts with the information a real controller has at step t (see module docstring)."""

    actual: dict[str, FloatArray]  # load, pv, price (with look-ahead), demand_rate
    load_before: FloatArray  # the day before the run
    pv_before: FloatArray
    pv_dayahead: FloatArray | None  # archived weather forecast through the solar model, or None
    steps_per_day: int
    first_step_of_day: int  # steps from midnight to the run's first step
    price_published_step: int | None  # step of the day when tomorrow's prices are published; None = known
    ev_visits: list[list[FutureSession]] = field(default_factory=list)  # per charger; only past ones are used

    def scenario(self, back: int) -> HistoryScenario:
        """A possible future replayed from `back` + 1 days ago (see HistoryScenario)."""
        return HistoryScenario(self, back)

    def window(self, name: str, t: int, steps: int) -> FloatArray:
        d = self.steps_per_day
        if name == "load":
            return persistence(self.load_before, self.actual["load"], t, steps, d)
        if name == "pv":
            if self.pv_dayahead is not None:
                return _pad(self.pv_dayahead, t, steps, d)
            return persistence(self.pv_before, self.actual["pv"], t, steps, d)
        if name in ("price", "export_price"):  # both follow the day-ahead price, so both are known once published
            return self._published(name, t, steps)
        return _pad(self.actual[name], t, steps, d)

    def known_until(self, t: int) -> int:
        """First step whose price is not yet published at step t."""
        if self.price_published_step is None:
            return 1 << 30
        d = self.steps_per_day
        tod = (self.first_step_of_day + t) % d
        end_of_today = t - tod + d
        return end_of_today + (d if tod >= self.price_published_step else 0)

    def _published(self, name: str, t: int, steps: int, extra_days: int = 0) -> FloatArray:
        truth = _pad(self.actual[name], t, steps, self.steps_per_day)
        known = self.known_until(t) - t
        if known >= steps:
            return truth
        d, series = self.steps_per_day, self.actual[name]
        out = truth.copy()
        for k in range(max(known, 0), steps):  # beyond the published prices: repeat the last known day
            j = t + k - ((k - known) // d + 1 + extra_days) * d  # same time of day, before the first unpublished step
            out[k] = series[min(max(j, 0), series.size - 1)]
        return out

    def sessions(self, charger: int, t: int, steps: int) -> list[FutureSession]:
        return []


@dataclass
class HistoryScenario:
    """One possible future for scenario-based (stochastic) MPC, replayed from the recent past.

    Scenario `back` = b replays the day b + 1 days ago (b = 0 is yesterday), using only what was observed before
    step t: that day's load; today's day-ahead solar forecast corrected by that day's forecast error (or that
    day's solar where no forecast archive exists); prices as published, then that day's prices; and the car
    visits the driver made that day, at the same times. Several scenarios together show the controller how
    much the future can differ from its single best guess.
    """

    base: RealisticForecast
    back: int

    def window(self, name: str, t: int, steps: int) -> FloatArray:
        b, d = self.base, self.base.steps_per_day
        if name == "load":
            return persistence(b.load_before, b.actual["load"], t, steps, d, self.back)
        if name == "pv":
            if b.pv_dayahead is None:
                return persistence(b.pv_before, b.actual["pv"], t, steps, d, self.back)
            k = t + np.arange(steps)
            j = k - ((k - t) // d + 1 + self.back) * d  # the same time on the replayed day (observed)
            fc = _pad(b.pv_dayahead, t, steps, d)
            ok = (j >= 0) & (j < b.actual["pv"].size)
            residual = np.zeros(steps)
            jj = j[ok]
            residual[ok] = b.actual["pv"][jj] - b.pv_dayahead[jj]
            out: FloatArray = np.clip(fc + residual, 0.0, None)
            return out
        if name in ("price", "export_price"):
            return b._published(name, t, steps, self.back)
        return b.window(name, t, steps)

    def sessions(self, charger: int, t: int, steps: int) -> list[FutureSession]:
        """The driver's visits on the replayed day(s), moved to the same times ahead; only visits already seen."""
        if charger >= len(self.base.ev_visits):
            return []
        d, out = self.base.steps_per_day, []
        for q in range(-(-steps // d)):
            shift = (self.back + q + 1) * d
            for v in self.base.ev_visits[charger]:
                a = v.arrive + shift
                if v.arrive < t and t < a < t + steps and t + q * d <= a < t + (q + 1) * d:
                    out.append(FutureSession(a, a + (v.depart - v.arrive), v.energy_kwh, v.max_kw, v.min_kw, v.phase))
        out.sort(key=lambda s: s.arrive)
        return out
