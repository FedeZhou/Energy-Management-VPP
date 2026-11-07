"""On-disk cache for raw downloads and processed profiles (outside the repo)."""

from __future__ import annotations

import datetime as dt
import json
import time
from pathlib import Path

import numpy as np
import platformdirs
import requests

from emsbench.sim.profiles import EVSession, EVSessionSet, Profile

ROOT = Path(platformdirs.user_data_dir("emsbench", appauthor=False))
RAW = ROOT / "raw"
PROCESSED = ROOT / "profiles"
USER_AGENT = "emsbench/0.1 (open source energy simulator)"


def download(url: str, dest: Path, *, force: bool = False, timeout: int = 120) -> Path:
    """Download once into the raw cache. Each source gets its own folder."""
    from emsbench.net import use_system_certificates

    if dest.exists() and dest.stat().st_size > 0 and not force:
        return dest
    use_system_certificates()
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Be polite to free APIs: pause between requests and back off when asked (HTTP 429).
    for attempt in range(6):
        time.sleep(1.0)
        r = requests.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
        if r.status_code != 429:
            break
        wait = float(r.headers.get("Retry-After", 0) or 0) or 5.0 * 2**attempt
        time.sleep(min(wait, 120))
    r.raise_for_status()
    tmp = dest.with_suffix(dest.suffix + ".part")
    tmp.write_bytes(r.content)
    tmp.replace(dest)
    return dest


def save_profiles(name: str, profiles: list[Profile]) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    arrays = {f"p{i}": p.values.astype(np.float32) for i, p in enumerate(profiles)}
    np.savez_compressed(PROCESSED / f"{name}.npz", **arrays)
    meta = [{
        "id": p.id, "kind": p.kind, "label": p.label, "source": p.source, "start": p.start.isoformat(),
        "step_seconds": p.step_seconds, "note": p.note, "currency": p.currency, "cyclic": p.cyclic,
        "licence": p.licence,
    } for p in profiles]
    (PROCESSED / f"{name}.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")


def load_profiles(name: str) -> list[Profile] | None:
    meta_path, data_path = PROCESSED / f"{name}.json", PROCESSED / f"{name}.npz"
    if not (meta_path.exists() and data_path.exists()):
        return None
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    with np.load(data_path) as z:
        return [Profile(m["id"], m["kind"], m["label"], m["source"], z[f"p{i}"].astype(float),
                        dt.datetime.fromisoformat(m["start"]), int(m["step_seconds"]), m["note"],
                        m["currency"], bool(m["cyclic"]), m["licence"]) for i, m in enumerate(meta)]


def save_sessions(name: str, sets: list[EVSessionSet]) -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    data = [{
        "id": s.id, "label": s.label, "source": s.source, "note": s.note, "cyclic": s.cyclic,
        "licence": s.licence, "first": s.first.isoformat(), "last": s.last.isoformat(),
        "resolution_minutes": s.resolution_minutes,
        "sessions": [[x.arrival.isoformat(), x.departure.isoformat(), round(x.energy_kwh, 3), x.ev_id,
                      x.max_kw, x.battery_kwh] for x in s.sessions],
    } for s in sets]
    (PROCESSED / f"{name}.sessions.json").write_text(json.dumps(data), encoding="utf-8")


def load_sessions(name: str) -> list[EVSessionSet] | None:
    path = PROCESSED / f"{name}.sessions.json"
    if not path.exists():
        return None
    out = []
    for s in json.loads(path.read_text(encoding="utf-8")):
        sessions = tuple(EVSession(dt.datetime.fromisoformat(a), dt.datetime.fromisoformat(d), e, ev, mk, bk)
                         for a, d, e, ev, mk, bk in s["sessions"])
        out.append(EVSessionSet(s["id"], s["label"], s["source"], sessions, dt.datetime.fromisoformat(s["first"]),
                                dt.datetime.fromisoformat(s["last"]), s["note"], s["cyclic"], s["licence"],
                                s["resolution_minutes"]))
    return out
