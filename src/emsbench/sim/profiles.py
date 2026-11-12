"""Time-series profiles (load, solar, price) and EV session sets, with calendars.

Every profile knows its own start time, native resolution and source. The
engine asks for a *window* (start, number of steps, step length); the profile
answers with values resampled to that step and says which real dates it used:

- Same season, same weekday, different year. If the profile does not cover the
  requested dates, it uses the closest year that does, shifted by up to three
  days so the weekday matches (Mondays stay Mondays).
- "Typical year" profiles (cyclic=True, e.g. CityLearn) wrap around.
- Coarser data is never passed off as finer: when the step is finer than the
  data, values are repeated and the window is flagged "repeated".

Sign/units: load = average kW per step; pv = average kW per kWp installed;
price = currency per kWh; heat = kW per kWh of annual heat demand; cop = kWh heat per kWh
electricity; netfee = currency per kWh.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


@dataclass(frozen=True)
class WindowInfo:
    source_start: dt.datetime
    resampling: str  # "native" | "averaged" | "repeated (finer than the data)"


def _shift_years(d: dt.datetime, years: int) -> dt.datetime:
    try:
        return d.replace(year=d.year + years)
    except ValueError:  # 29 Feb
        return d.replace(year=d.year + years, day=28)


def _candidates(start: dt.datetime) -> list[dt.datetime]:
    """Same date first, then other years, each nudged to the same weekday."""
    out = [start]
    for dy in [y for k in range(1, 12) for y in (-k, k)]:
        s = _shift_years(start, dy)
        for k in (0, -1, 1, -2, 2, -3, 3):
            c = s + dt.timedelta(days=k)
            if c.weekday() == start.weekday():
                out.append(c)
                break
    return out


def _locate(start: dt.datetime, duration: dt.timedelta, first: dt.datetime, last: dt.datetime,
            cyclic: bool, label: str) -> dt.datetime:
    for c in _candidates(start):
        if c >= first and c + duration <= last:
            return c
    if cyclic:
        for c in _candidates(start):
            if first <= c < last:
                return c
    raise ValueError(
        f"No data for '{label}' around {start:%d %b} for {duration.days or 1} day(s). "
        f"It covers {first:%Y-%m-%d} to {last:%Y-%m-%d}."
    )


@dataclass(frozen=True)
class Profile:
    id: str
    kind: str  # "load" | "pv" | "price" | "demand" | "heat" | "cop" | "netfee"
    label: str
    source: str
    values: FloatArray
    start: dt.datetime
    step_seconds: int
    note: str = ""
    currency: str = ""
    cyclic: bool = False
    licence: str = ""

    @property
    def end(self) -> dt.datetime:
        return self.start + dt.timedelta(seconds=self.step_seconds * self.values.size)

    def window(self, start: dt.datetime, steps: int, step_seconds: int) -> tuple[FloatArray, WindowInfo]:
        duration = dt.timedelta(seconds=steps * step_seconds)
        src = _locate(start, duration, self.start, self.end, self.cyclic, self.label)
        n = self.step_seconds
        offset = (src - self.start).total_seconds()
        if offset % n:
            raise ValueError(f"start {start} is not aligned with the {n // 60}-minute data of {self.label}")
        vals, how = self._take(int(offset // n), steps, step_seconds)
        return vals, WindowInfo(src, how)

    def _take(self, i0: int, steps: int, step_seconds: int) -> tuple[FloatArray, str]:
        """`steps` values of `step_seconds` starting at data index i0 (wrapping around the data)."""
        n = self.step_seconds
        if step_seconds >= n:
            if step_seconds % n:
                raise ValueError(f"step {step_seconds}s is not a multiple of the data step {n}s")
            f = step_seconds // n
            idx = (i0 + np.arange(steps * f)) % self.values.size
            return self.values[idx].reshape(steps, f).mean(axis=1).astype(float), ("native" if f == 1 else "averaged")
        if n % step_seconds:
            raise ValueError(f"data step {n}s is not a multiple of step {step_seconds}s")
        f = n // step_seconds
        idx = (i0 + np.arange(-(-steps // f))) % self.values.size
        return np.repeat(self.values[idx], f)[:steps].astype(float), "repeated (finer than the data)"

    def before(self, source_start: dt.datetime, steps: int, step_seconds: int) -> FloatArray | None:
        """The `steps` steps just before `source_start` (a window's source start), continuous with that
        window; None if the data starts later (typical-year profiles wrap around instead)."""
        first = source_start - dt.timedelta(seconds=steps * step_seconds)
        offset = (first - self.start).total_seconds()
        if (offset < 0 and not self.cyclic) or offset % self.step_seconds:
            return None
        return self._take(int(offset // self.step_seconds), steps, step_seconds)[0]

    def summary(self) -> dict[str, object]:
        stats: dict[str, float] = {}
        hours = self.step_seconds / 3600
        years = self.values.size * hours / 8760
        if self.kind in ("load", "pv"):
            stats["annual_total"] = round(float(self.values.sum() * hours / max(years, 1e-9)), 1)
            stats["peak"] = round(float(self.values.max()), 3)
        else:
            stats["min"] = round(float(self.values.min()), 4)
            stats["mean"] = round(float(self.values.mean()), 4)
            stats["max"] = round(float(self.values.max()), 4)
        return {
            "id": self.id, "kind": self.kind, "label": self.label, "source": self.source,
            "note": self.note, "licence": self.licence, "currency": self.currency,
            "resolution_minutes": self.step_seconds // 60, "cyclic": self.cyclic,
            "first": self.start.isoformat(), "last": self.end.isoformat(), "stats": stats,
        }


@dataclass(frozen=True)
class EVSession:
    arrival: dt.datetime
    departure: dt.datetime
    energy_kwh: float  # energy the car battery needs
    ev_id: str
    max_kw: float | None = None  # what the car can draw (onboard charger), if known
    battery_kwh: float | None = None


@dataclass(frozen=True)
class EVSessionSet:
    id: str
    label: str
    source: str
    sessions: tuple[EVSession, ...]
    first: dt.datetime
    last: dt.datetime
    note: str = ""
    cyclic: bool = False
    licence: str = ""
    resolution_minutes: int = 1

    def window(
        self, start: dt.datetime, steps: int, step_seconds: int
    ) -> tuple[list[tuple[int, int, EVSession]], WindowInfo]:
        """Sessions arriving inside the window, as (arrival_step, departure_step, session)."""
        duration = dt.timedelta(seconds=steps * step_seconds)
        src = _locate(start, duration, self.first, self.last, self.cyclic, self.label)
        span = (self.last - self.first) if self.cyclic else None
        out: list[tuple[int, int, EVSession]] = []
        for s in self.sessions:
            arr = (s.arrival - src).total_seconds()
            dep = (s.departure - src).total_seconds()
            if span is not None and arr < 0:  # wrap typical-year sessions
                arr += span.total_seconds()
                dep += span.total_seconds()
            a = int(np.ceil(arr / step_seconds))
            d = int(np.floor(dep / step_seconds))
            if 0 <= a < steps and d > a:
                out.append((a, min(d, steps), s))
        how = "native" if step_seconds >= self.resolution_minutes * 60 else "repeated (finer than the data)"
        return sorted(out, key=lambda x: x[0]), WindowInfo(src, how)

    def summary(self) -> dict[str, object]:
        energies = [s.energy_kwh for s in self.sessions]
        years = max((self.last - self.first).days / 365, 1e-9)
        cars = {s.ev_id: s.max_kw for s in self.sessions}
        return {
            "id": self.id, "kind": "ev", "label": self.label, "source": self.source, "note": self.note,
            "licence": self.licence, "first": self.first.isoformat(), "last": self.last.isoformat(),
            "resolution_minutes": self.resolution_minutes, "cyclic": self.cyclic,
            "stats": {
                "sessions": len(self.sessions),
                "annual_energy_kwh": round(float(sum(energies)) / years, 1),
                "mean_session_kwh": round(float(np.mean(energies)), 1) if energies else 0.0,
                "car_max_kw": round(float(max((v for v in cars.values() if v), default=0)), 1),
            },
        }


@dataclass
class ProfileLibrary:
    profiles: dict[str, Profile] = field(default_factory=dict)
    ev_sets: dict[str, EVSessionSet] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def add(self, p: Profile) -> None:
        self.profiles[p.id] = p

    def get(self, profile_id: str, kind: str) -> Profile:
        p = self.profiles.get(profile_id)
        if p is None:
            raise KeyError(f"unknown {kind} profile: {profile_id}")
        if p.kind != kind:
            raise KeyError(f"'{profile_id}' is a {p.kind} profile, but a {kind} profile is needed here")
        return p

    def get_ev(self, set_id: str) -> EVSessionSet:
        if set_id not in self.ev_sets:
            raise KeyError(f"unknown EV session set: {set_id}")
        return self.ev_sets[set_id]

    def catalogue(self) -> dict[str, list[dict[str, object]]]:
        out: dict[str, list[dict[str, object]]] = {"load": [], "pv": [], "price": [], "demand": [], "heat": [],
                                                  "cop": [], "netfee": [], "ev": []}
        for p in self.profiles.values():
            if p.kind in out:  # forecasts (e.g. "pvforecast") are not choosable inputs
                out[p.kind].append(p.summary())
        out["ev"] = [s.summary() for s in self.ev_sets.values()]
        return out


def default_library() -> ProfileLibrary:
    """All available profiles: CityLearn (hourly) plus the granular open datasets."""
    from emsbench.data import load_library

    return load_library()
