"""Hourly profiles from CityLearn's 2022 datasets (typical year, MIT licence)."""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import numpy as np
import pandas as pd

from emsbench.sim.profiles import EVSession, EVSessionSet, FloatArray, Profile

CL_PHASE1 = "citylearn_challenge_2022_phase_1"
CL_EVS = "citylearn_challenge_2022_phase_all_plus_evs"
CL_REPO = "https://github.com/citylearn-project/CityLearn/tree/v3.2.0/data/datasets"
LICENCE = "MIT (CityLearn)"
# Step 0 is labelled "month 7, hour 24" and the EV schema's start_date is 2024-08-01, so
# step 0 covers 23:00-24:00 on 31 July. The real recording year is not documented.
START = dt.datetime(2024, 7, 31, 23, 0)
TZ_NOTE = "Times as in the dataset (believed Pacific time, unverified)."


def _dataset_dir(name: str) -> Path:
    from citylearn.data import DataSet

    from emsbench.net import use_system_certificates

    use_system_certificates()
    return Path(DataSet().get_dataset(name)).parent


def parse_charger(
    frame: pd.DataFrame, ev_capacity_kwh: dict[str, float], steps: int
) -> list[tuple[int, int, float, str, float]]:
    """CityLearn charger CSV -> (arrival_step, departure_step, kWh, ev_id, capacity).

    States: 1 = plugged in (hours to departure, required SoC %), 2 = on its way
    (estimated arrival SoC %), 3 = no car. Sessions without an arrival SoC are skipped.
    """
    state = frame["electric_vehicle_charger_state"].to_numpy()[:steps]
    out = []
    t = 0
    while t < len(state):
        if state[t] == 1 and (t == 0 or state[t - 1] != 1):
            start = t
            while t < len(state) and state[t] == 1:
                t += 1
            if start == 0 or state[start - 1] != 2:
                continue
            ev_id = str(frame["electric_vehicle_id"].iloc[start])
            soc_a = float(frame["electric_vehicle_estimated_soc_arrival"].iloc[start - 1])
            soc_t = float(frame["electric_vehicle_required_soc_departure"].iloc[start])
            cap = float(ev_capacity_kwh.get(ev_id, np.nan))
            if np.isfinite(soc_a) and np.isfinite(soc_t) and np.isfinite(cap):
                out.append((start, t, max(0.0, (soc_t - soc_a) / 100 * cap), ev_id, cap))
        else:
            t += 1
    return out


def build() -> tuple[list[Profile], list[EVSessionSet]]:
    evs_dir, p1_dir = _dataset_dir(CL_EVS), _dataset_dir(CL_PHASE1)
    schema = json.loads((evs_dir / "schema.json").read_text(encoding="utf-8"))
    src_evs = f"CityLearn dataset {CL_EVS} ({CL_REPO}/{CL_EVS})"
    src_p1 = f"CityLearn dataset {CL_PHASE1} ({CL_REPO}/{CL_PHASE1})"
    def prof(pid: str, kind: str, label: str, source: str, values: FloatArray, note: str = "",
             currency: str = "") -> Profile:
        return Profile(pid, kind, label, source, np.asarray(values, dtype=float), START, 3600, note, currency,
                       cyclic=True, licence=LICENCE)

    profiles: list[Profile] = []
    for name in sorted(schema["buildings"], key=lambda b: int(b.split("_")[1])):
        frame = pd.read_csv(evs_dir / f"{name}.csv")
        n = name.split("_")[1]
        load = frame["non_shiftable_load"].to_numpy(dtype=float)
        profiles.append(prof(f"cl2022/home_{n}", "load", f"Home {n}, California (hourly, {load.sum():,.0f} kWh/yr)",
                             f"{src_evs}, {name}.csv non_shiftable_load", load,
                             "Residential. Location believed Southern California (unverified). " + TZ_NOTE))
        profiles.append(prof(f"cl2022/pv_{n}", "pv", f"Solar, California home {n} (hourly)",
                             f"{src_evs}, {name}.csv solar_generation (W per kW)",
                             frame["solar_generation"].to_numpy(dtype=float) / 1000.0))
    tou = pd.read_csv(p1_dir / "pricing.csv")["electricity_pricing"].to_numpy(float)
    dyn = pd.read_csv(evs_dir / "pricing.csv")["electricity_pricing"].to_numpy(float)
    profiles.append(prof("cl2022/tou", "price", "California time-of-use: 0.22 / 0.54 at 16-21h (hourly)",
                         f"{src_p1}, pricing.csv", tou, "Currency not stated in the dataset (assumed USD).", "USD"))
    profiles.append(prof("cl2022/dynamic", "price", "CityLearn dynamic price (hourly)", f"{src_evs}, pricing.csv",
                         dyn, "Origin of these prices is not documented (unverified).", "USD"))

    caps = {k: float(v["battery"]["attributes"]["capacity"]) for k, v in schema["electric_vehicles_def"].items()}
    steps = len(profiles[0].values)
    end = START + dt.timedelta(hours=steps)
    sets = []
    for csv in sorted(evs_dir.glob("charger_*.csv")):
        rows = parse_charger(pd.read_csv(csv), caps, steps)
        sessions = tuple(
            EVSession(START + dt.timedelta(hours=a), START + dt.timedelta(hours=d), e, ev, None, cap)
            for a, d, e, ev, cap in rows
        )
        sets.append(EVSessionSet(f"cl2022/{csv.stem}", f"California EVs, {csv.stem.replace('_', ' ')} (hourly)",
                                 f"{src_evs}, {csv.name} + electric_vehicles_def", sessions, START, end,
                                 note="Appears synthetic; generation method not documented (unverified).",
                                 cyclic=True, licence=LICENCE, resolution_minutes=60))
    return profiles, sets
