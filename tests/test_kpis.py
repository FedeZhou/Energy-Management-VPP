import numpy as np
import pytest

from emsbench.benchmark.kpis import EpisodeTrace, compute_kpis


def make_trace(**overrides: object) -> EpisodeTrace:
    base: dict[str, object] = dict(
        step_hours=1.0,
        net_grid_kwh=np.array([[2.0, -1.0, 4.0, 3.0]]),
        price_per_kwh=np.array([0.2, 0.2, 0.5, 0.1]),
        month=np.array([1, 1, 2, 2]),
        battery_terminal_kwh=np.array([[1.0, 2.0, -2.5, -0.5]]),
        battery_capacity_kwh=np.array([5.0]),
    )
    base.update(overrides)
    return EpisodeTrace(**base)  # type: ignore[arg-type]


def test_cost_counts_imports_only_by_default() -> None:
    k = compute_kpis(make_trace())
    # 2*0.2 + 4*0.5 + 3*0.1 = 2.7; the 1 kWh export earns nothing
    assert k.energy_cost == pytest.approx(2.7)
    assert k.grid_import_kwh == pytest.approx(9.0)
    assert k.grid_export_kwh == pytest.approx(1.0)


def test_export_price_reduces_cost() -> None:
    k = compute_kpis(make_trace(export_price_per_kwh=0.1))
    assert k.energy_cost == pytest.approx(2.7 - 0.1)


def test_peaks_overall_and_monthly() -> None:
    k = compute_kpis(make_trace())
    assert k.peak_import_kw == pytest.approx(4.0)
    assert k.mean_monthly_peak_import_kw == pytest.approx((2.0 + 4.0) / 2)


def test_peak_uses_power_not_energy_for_subhourly_steps() -> None:
    # 4 kWh in a 15-minute step is an average power of 16 kW
    k = compute_kpis(make_trace(step_hours=0.25))
    assert k.peak_import_kw == pytest.approx(16.0)


def test_meters_billed_separately_but_peak_is_site_level() -> None:
    # Meter A exports 3 kWh while meter B imports 3 kWh in the same hour.
    k = compute_kpis(
        make_trace(
            net_grid_kwh=np.array([[-3.0, 0, 0, 0], [3.0, 1.0, 0, 0]]),
        )
    )
    # Billing: A's export does not offset B's import.
    assert k.energy_cost == pytest.approx(3.0 * 0.2 + 1.0 * 0.2)
    assert k.grid_import_kwh == pytest.approx(4.0)
    assert k.grid_export_kwh == pytest.approx(3.0)
    # Physics at the site connection: they cancel, so the site peak is 1 kW.
    assert k.peak_import_kw == pytest.approx(1.0)


def test_battery_throughput_and_cycles() -> None:
    k = compute_kpis(make_trace())
    assert k.battery_discharge_kwh == pytest.approx(3.0)
    assert k.battery_equivalent_full_cycles == pytest.approx(3.0 / 5.0)


def test_multiple_batteries_cycle_on_total_capacity() -> None:
    k = compute_kpis(
        make_trace(
            battery_terminal_kwh=np.array([[0, 0, -2.0, 0], [0, 0, -1.0, -1.0]]),
            battery_capacity_kwh=np.array([4.0, 6.0]),
        )
    )
    assert k.battery_equivalent_full_cycles == pytest.approx(4.0 / 10.0)


def test_no_battery_gives_zero_cycles() -> None:
    k = compute_kpis(
        make_trace(battery_terminal_kwh=np.zeros((0, 4)), battery_capacity_kwh=np.zeros(0))
    )
    assert k.battery_equivalent_full_cycles == 0.0


def test_shape_mismatch_rejected() -> None:
    with pytest.raises(ValueError):
        make_trace(price_per_kwh=np.array([0.2, 0.2]))
    with pytest.raises(ValueError):
        make_trace(net_grid_kwh=np.array([2.0, -1.0, 4.0, 3.0]))
