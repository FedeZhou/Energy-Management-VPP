"""A controller that never uses the battery. Used as a sanity check."""

from __future__ import annotations

from typing import Any


class IdleController:
    """Always commands zero charge/discharge.

    Its result should match CityLearn's "without storage" baseline (KPI ratios
    of 1.0) unless the battery has standby losses. If it does not, our
    understanding of the baseline is wrong.
    """

    def __init__(self, env: Any) -> None:
        self._dims = [space.shape[0] for space in env.action_space]

    def predict(self, observations: Any, deterministic: bool | None = None) -> list[list[float]]:
        return [[0.0] * d for d in self._dims]
