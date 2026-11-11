"""Simulator-independent KPIs computed from one episode's time series.

These are deliberately absolute (currency, kW, kWh) rather than ratios to a
baseline, so results from different simulators, sites and forecast-error
levels can be compared directly. Ratios can always be derived afterwards.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
from numpy.typing import NDArray

FloatArray = NDArray[np.float64]


@dataclass(frozen=True)
class EpisodeTrace:
    """Time series from one simulated episode, for a whole site.

    A site can have several grid meters (e.g. a CityLearn district where each
    building is billed separately). A single home or commercial site is just
    one meter (M = 1).

    Attributes:
        step_hours: Length of one time step in hours (1.0 for hourly data).
        net_grid_kwh: Energy exchanged with the grid per meter and step,
            shape (M, T). Positive = import, negative = export.
        price_per_kwh: Import price in each step, shape (T,), currency/kWh.
            Assumed identical for all meters.
        month: Calendar month (1-12) of each step, shape (T,). Used for
            monthly peak demand, which is what demand charges bill on.
        battery_terminal_kwh: Energy at each battery's terminals per step,
            shape (B, T). Positive = charging, negative = discharging.
            Includes conversion losses (it is what the site sees).
        battery_capacity_kwh: Nominal usable capacity of each battery, shape (B,).
        export_price_per_kwh: Price received for exported energy. CityLearn
            pays nothing for exports, so the default is 0.
    """

    step_hours: float
    net_grid_kwh: FloatArray
    price_per_kwh: FloatArray
    month: NDArray[np.int_]
    battery_terminal_kwh: FloatArray
    battery_capacity_kwh: FloatArray
    export_price_per_kwh: float | FloatArray = 0.0  # one price, or one per step (shape (T,))

    def __post_init__(self) -> None:
        if self.net_grid_kwh.ndim != 2:
            raise ValueError("net_grid_kwh must have shape (n_meters, T)")
        t = self.net_grid_kwh.shape[1]
        if self.price_per_kwh.shape != (t,) or self.month.shape != (t,):
            raise ValueError("price_per_kwh and month must have shape (T,)")
        if self.battery_terminal_kwh.ndim != 2 or self.battery_terminal_kwh.shape[1] != t:
            raise ValueError("battery_terminal_kwh must have shape (n_batteries, T)")
        if self.battery_capacity_kwh.shape != (self.battery_terminal_kwh.shape[0],):
            raise ValueError("battery_capacity_kwh must have shape (n_batteries,)")
        if self.step_hours <= 0:
            raise ValueError("step_hours must be positive")


@dataclass(frozen=True)
class EpisodeKPIs:
    """Absolute KPIs for one episode. Units are in the field names."""

    energy_cost: float
    grid_import_kwh: float
    grid_export_kwh: float
    peak_import_kw: float
    mean_monthly_peak_import_kw: float
    battery_discharge_kwh: float
    battery_equivalent_full_cycles: float

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


def compute_kpis(trace: EpisodeTrace) -> EpisodeKPIs:
    """Compute absolute KPIs from an episode trace.

    Definitions:
        energy_cost: per meter, sum(import * price) - sum(export * export_price),
            then summed over meters. Exports on one meter do not offset
            imports on another (each meter is billed on its own).
        grid_import_kwh / grid_export_kwh: per-meter totals, summed.
        peak_import_kw: highest import power of the whole site (all meters
            added together) over any single step. This is what the grid
            connection or transformer sees.
        mean_monthly_peak_import_kw: average over months of each month's
            site-level peak import power. With one meter this is exactly what
            a monthly demand charge bills on.
        battery_discharge_kwh: total energy delivered by all batteries.
        battery_equivalent_full_cycles: discharge energy / total capacity.
            A common, simple proxy for cycle wear. Real wear also depends on
            depth of discharge, temperature, C-rate and time (calendar aging);
            that is modelled separately.
    """
    imports = np.clip(trace.net_grid_kwh, 0.0, None)
    exports = np.clip(-trace.net_grid_kwh, 0.0, None)

    site_import_kw = np.clip(trace.net_grid_kwh.sum(axis=0), 0.0, None) / trace.step_hours
    monthly_peaks = [
        float(site_import_kw[trace.month == m].max()) for m in np.unique(trace.month)
    ]

    discharge = float(np.clip(-trace.battery_terminal_kwh, 0.0, None).sum())
    total_capacity = float(trace.battery_capacity_kwh.sum())

    return EpisodeKPIs(
        energy_cost=float((imports * trace.price_per_kwh).sum())
        - float((exports * trace.export_price_per_kwh).sum()),
        grid_import_kwh=float(imports.sum()),
        grid_export_kwh=float(exports.sum()),
        peak_import_kw=float(site_import_kw.max()) if site_import_kw.size else 0.0,
        mean_monthly_peak_import_kw=float(np.mean(monthly_peaks)) if monthly_peaks else 0.0,
        battery_discharge_kwh=discharge,
        battery_equivalent_full_cycles=discharge / total_capacity if total_capacity > 0 else 0.0,
    )
