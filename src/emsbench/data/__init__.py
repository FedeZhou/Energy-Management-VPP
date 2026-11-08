"""Open data sources, downloaded and processed into a local cache.

`python -m emsbench.data`             prepare everything (first run downloads ~70 MB)
`python -m emsbench.data --refresh`   rebuild processed profiles (re-downloads recent months)
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from functools import lru_cache

from emsbench.data import cache
from emsbench.sim.profiles import EVSessionSet, Profile, ProfileLibrary

log = logging.getLogger(__name__)


def _sources() -> dict[str, Callable[[], tuple[list[Profile], list[EVSessionSet]]]]:
    from emsbench.data import citylearn, comstock, energycharts, eurostat, openmeteo_pv, opsd, sintef, utwente

    return {
        "citylearn": citylearn.build,
        "opsd": lambda: (opsd.build(), []),
        "comstock": lambda: (comstock.build(), []),
        "energycharts": lambda: (energycharts.build(), []),
        "eurostat": lambda: (eurostat.build(), []),
        "openmeteo_pv": lambda: (openmeteo_pv.build(), []),
        "sintef": lambda: ([], sintef.build()),
        "utwente": lambda: ([], utwente.build()),
    }


def prepare(refresh: bool = False, only: list[str] | None = None) -> list[str]:
    """Build processed caches. Returns warnings for sources that failed."""
    warnings = []
    for name, build in _sources().items():
        if only and name not in only:
            continue
        if not refresh and (cache.load_profiles(name) is not None or cache.load_sessions(name) is not None):
            continue
        try:
            profiles, sets = build()
            if profiles:
                cache.save_profiles(name, profiles)
            if sets:
                cache.save_sessions(name, sets)
        except Exception as e:  # keep the app usable when one source is offline
            warnings.append(f"{name}: {e}")
            log.warning("could not prepare %s: %s", name, e)
    return warnings


@lru_cache(maxsize=1)
def load_library() -> ProfileLibrary:
    lib = ProfileLibrary(warnings=prepare())
    for name in _sources():
        for p in cache.load_profiles(name) or []:
            lib.add(p)
        for s in cache.load_sessions(name) or []:
            lib.ev_sets[s.id] = s
    return lib
