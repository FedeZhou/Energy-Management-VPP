"""Library of time-series profiles (load, solar, price, EV sessions).

Every profile carries a human-readable source. For now all profiles come from
public CityLearn datasets (MIT licence), downloaded and cached by CityLearn.
Other sources (ENTSO-E prices, ACN-Data EV sessions, Open-Meteo + pvlib solar)
can be added as further loaders producing the same `Profile` / `EVSessionSet`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]

CL_PHASE1 = "citylearn_challenge_2022_phase_1"
CL_EVS = "citylearn_challenge_2022_phase_all_plus_evs"
CL_REPO = "https://github.com/citylearn-project/CityLearn/tree/v3.2.0/data/datasets"


@dataclass(frozen=True)
class Profile:
    """A time series with metadata.

    kind:
        "load": kWh per step (= kW for hourly steps).
        "pv": generation per kW of installed panels, kWh per kWp per step.
        "price": currency per kWh.
    """

    id: str
    kind: str
    label: str
    source: str
    values: FloatArray
    note: str = ""

    def summary(self) -> dict[str, object]:
        stats: dict[str, float] = {"steps": float(self.values.size)}
        if self.kind in ("load", "pv"):
            stats["annual_total"] = round(float(self.values.sum()), 1)
            stats["peak"] = round(float(self.values.max()), 3)
        else:
            stats["min"] = round(float(self.values.min()), 4)
            stats["mean"] = round(float(self.values.mean()), 4)
            stats["max"] = round(float(self.values.max()), 4)
        return {"id": self.id, "kind": self.kind, "label": self.label, "source": self.source,
                "note": self.note, "stats": stats}


@dataclass(frozen=True)
class EVSession:
    """One EV visit to a charger.

    arrival: first step the car is plugged in.
    departure: first step the car is gone (exclusive end).
    energy_kwh: energy the car's battery needs to reach its target SoC.
    """

    arrival: int
    departure: int
    energy_kwh: float
    ev_id: str
    battery_kwh: float


@dataclass(frozen=True)
class EVSessionSet:
    id: str
    label: str
    source: str
    sessions: tuple[EVSession, ...]
    steps: int
    note: str = ""

    def summary(self) -> dict[str, object]:
        energies = [s.energy_kwh for s in self.sessions]
        return {
            "id": self.id, "kind": "ev_sessions", "label": self.label, "source": self.source,
            "note": self.note,
            "stats": {
                "sessions": len(self.sessions),
                "annual_energy_kwh": round(float(sum(energies)), 1),
                "mean_session_kwh": round(float(np.mean(energies)), 1) if energies else 0.0,
            },
        }


@dataclass
class ProfileLibrary:
    profiles: dict[str, Profile] = field(default_factory=dict)
    ev_sets: dict[str, EVSessionSet] = field(default_factory=dict)
    month: NDArray[np.int_] = field(default_factory=lambda: np.zeros(0, dtype=int))
    hour: NDArray[np.int_] = field(default_factory=lambda: np.zeros(0, dtype=int))
    start_date: str = ""

    @property
    def steps(self) -> int:
        return int(self.month.size)

    def get(self, profile_id: str, kind: str) -> Profile:
        p = self.profiles.get(profile_id)
        if p is None or p.kind != kind:
            raise KeyError(f"unknown {kind} profile: {profile_id}")
        return p

    def get_ev(self, set_id: str) -> EVSessionSet:
        if set_id not in self.ev_sets:
            raise KeyError(f"unknown EV session set: {set_id}")
        return self.ev_sets[set_id]

    def catalogue(self) -> dict[str, list[dict[str, object]]]:
        out: dict[str, list[dict[str, object]]] = {"load": [], "pv": [], "price": [], "ev": []}
        for p in self.profiles.values():
            out[p.kind].append(p.summary())
        out["ev"] = [s.summary() for s in self.ev_sets.values()]
        return out


def parse_citylearn_charger(
    frame: pd.DataFrame, ev_capacity_kwh: dict[str, float], steps: int
) -> list[EVSession]:
    """Turn a CityLearn charger CSV into sessions.

    CityLearn charger files have one row per step with a state:
    1 = car plugged in (with hours until departure and required SoC in %),
    2 = car on its way (with estimated arrival SoC in %), 3 = no car.
    A session needs the arrival SoC from the state-2 row just before it;
    sessions without one are skipped.
    """
    state = frame["electric_vehicle_charger_state"].to_numpy()[:steps]
    sessions: list[EVSession] = []
    t = 0
    while t < len(state):
        if state[t] == 1 and (t == 0 or state[t - 1] != 1):
            start = t
            while t < len(state) and state[t] == 1:
                t += 1
            if start == 0 or state[start - 1] != 2:
                continue
            ev_id = str(frame["electric_vehicle_id"].iloc[start])
            soc_arrival = float(frame["electric_vehicle_estimated_soc_arrival"].iloc[start - 1])
            soc_target = float(frame["electric_vehicle_required_soc_departure"].iloc[start])
            capacity = float(ev_capacity_kwh.get(ev_id, np.nan))
            if not (np.isfinite(soc_arrival) and np.isfinite(soc_target) and np.isfinite(capacity)):
                continue
            energy = max(0.0, (soc_target - soc_arrival) / 100.0 * capacity)
            sessions.append(EVSession(start, t, energy, ev_id, capacity))
        else:
            t += 1
    return sessions


def _dataset_dir(name: str) -> Path:
    from citylearn.data import DataSet

    from emsbench.net import use_system_certificates

    use_system_certificates()
    return Path(DataSet().get_dataset(name)).parent


@lru_cache(maxsize=1)
def default_library() -> ProfileLibrary:
    """Build the library from CityLearn's 2022 datasets (downloaded once, then cached)."""
    evs_dir = _dataset_dir(CL_EVS)
    p1_dir = _dataset_dir(CL_PHASE1)
    schema = json.loads((evs_dir / "schema.json").read_text(encoding="utf-8"))
    lib = ProfileLibrary(start_date=str(schema.get("start_date", "")))

    src_evs = f"CityLearn dataset {CL_EVS} ({CL_REPO}/{CL_EVS}), MIT licence"
    src_p1 = f"CityLearn dataset {CL_PHASE1} ({CL_REPO}/{CL_PHASE1}), MIT licence"

    buildings = sorted(schema["buildings"], key=lambda b: int(b.split("_")[1]))
    for name in buildings:
        frame = pd.read_csv(evs_dir / f"{name}.csv")
        if lib.month.size == 0:
            lib.month = frame["month"].to_numpy(dtype=int)
            lib.hour = frame["hour"].to_numpy(dtype=int)
        n = name.split("_")[1]
        load = frame["non_shiftable_load"].to_numpy(dtype=float)
        lib.profiles[f"cl2022/home_{n}"] = Profile(
            f"cl2022/home_{n}", "load", f"Home {n} ({load.sum():,.0f} kWh/yr)",
            f"{src_evs}, {name}.csv column non_shiftable_load", load,
            note="Residential, hourly. Location believed to be Southern California (unverified).",
        )
        lib.profiles[f"cl2022/pv_{n}"] = Profile(
            f"cl2022/pv_{n}", "pv", f"Solar, site of home {n}",
            f"{src_evs}, {name}.csv column solar_generation (W per kW installed)",
            frame["solar_generation"].to_numpy(dtype=float) / 1000.0,
        )

    tou = pd.read_csv(p1_dir / "pricing.csv")["electricity_pricing"].to_numpy(dtype=float)
    lib.profiles["cl2022/tou"] = Profile(
        "cl2022/tou", "price", "Time-of-use: 0.22 off-peak, 0.54 at 16-21h",
        f"{src_p1}, pricing.csv", tou,
        note="Currency not stated in the dataset (assumed USD).",
    )
    dyn = pd.read_csv(evs_dir / "pricing.csv")["electricity_pricing"].to_numpy(dtype=float)
    lib.profiles["cl2022/dynamic"] = Profile(
        "cl2022/dynamic", "price", "Dynamic hourly price",
        f"{src_evs}, pricing.csv", dyn,
        note="Origin of these prices is not documented in the dataset (unverified).",
    )

    capacities = {
        k: float(v["battery"]["attributes"]["capacity"])
        for k, v in schema["electric_vehicles_def"].items()
    }
    steps = lib.steps
    for csv in sorted(evs_dir.glob("charger_*.csv")):
        cid = csv.stem
        sessions = parse_citylearn_charger(pd.read_csv(csv), capacities, steps)
        lib.ev_sets[f"cl2022/{cid}"] = EVSessionSet(
            f"cl2022/{cid}", f"EV sessions, {cid.replace('_', ' ')}",
            f"{src_evs}, {csv.name} with EV capacities from schema.json electric_vehicles_def",
            tuple(sessions), steps,
            note="Appears synthetic; generation method not documented (unverified). "
            "Uses the first year of the file.",
        )
    return lib
