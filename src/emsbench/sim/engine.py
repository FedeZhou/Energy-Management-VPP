"""Generic site simulator.

One electrical bus behind one grid meter. Each step:
1. read exogenous data (building load, solar availability, price, EV arrivals),
2. ask the controller for battery and EV setpoints,
3. clip them to physical limits (power, state of charge, energy still needed),
4. safety layer: enforce the grid import/export limits,
5. update states and record everything.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from emsbench.benchmark.kpis import EpisodeTrace, compute_kpis
from emsbench.sim.controllers import EVState, Observation, decide
from emsbench.sim.model import Battery, Building, EVCharger, Site, SolarPV
from emsbench.sim.profiles import ProfileLibrary

FloatArray = NDArray[np.float64]
EPS = 1e-9


@dataclass
class SimResult:
    step_hours: float
    month: NDArray[np.int_]
    hour: NDArray[np.int_]
    site: dict[str, FloatArray]
    assets: dict[str, dict[str, FloatArray]]
    kpis: dict[str, float]
    warnings: list[str] = field(default_factory=list)


def _split(total: float, weights: list[float]) -> list[float]:
    s = sum(weights)
    return [total * w / s for w in weights] if s > EPS else [0.0 for _ in weights]


def simulate(site: Site, lib: ProfileLibrary) -> SimResult:
    dt = 1.0  # CityLearn 2022 data are hourly
    s0 = site.start_day * 24
    s1 = min(lib.steps, s0 + site.days * 24)
    if s1 <= s0:
        raise ValueError("simulation period is empty")
    T = s1 - s0
    warnings: list[str] = []

    buildings = [a for a in site.assets if isinstance(a, Building)]
    pvs = [a for a in site.assets if isinstance(a, SolarPV)]
    bats = [a for a in site.assets if isinstance(a, Battery)]
    chargers = [a for a in site.assets if isinstance(a, EVCharger)]

    load = {b.id: lib.get(b.load_profile, "load").values[s0:s1] * b.scale for b in buildings}
    pv_avail = {p.id: lib.get(p.profile, "pv").values[s0:s1] * p.capacity_kwp for p in pvs}
    price = lib.get(site.tariff.price_profile, "price").values[s0:s1]
    price_full = lib.get(site.tariff.price_profile, "price").values
    load_tot = np.sum(list(load.values()), axis=0) if load else np.zeros(T)
    pv_tot = np.sum(list(pv_avail.values()), axis=0) if pv_avail else np.zeros(T)

    # EV sessions that start inside the period, re-indexed to period steps.
    starts: list[dict[int, tuple[int, float]]] = []
    for c in chargers:
        m: dict[int, tuple[int, float]] = {}
        for s in lib.get_ev(c.sessions).sessions:
            if s0 <= s.arrival < s1:
                m[s.arrival - s0] = (min(s.departure, s1) - s0, s.energy_kwh)
        starts.append(m)

    # Battery state
    cap = np.array([b.capacity_kwh for b in bats])
    pmax = np.array([b.power_kw for b in bats])
    eta = np.sqrt([b.round_trip_efficiency for b in bats])
    e_min = cap * np.array([b.soc_min for b in bats])
    e_max = cap * np.array([b.soc_max for b in bats])
    energy = np.clip(cap * np.array([b.soc_initial for b in bats]), e_min, e_max)

    # EV state
    n_c = len(chargers)
    ev_rem = np.zeros(n_c)
    ev_dep = np.full(n_c, -1)
    ev_on = np.zeros(n_c, dtype=bool)

    rec_bat = np.zeros((len(bats), T))
    rec_soc = np.zeros((len(bats), T))
    rec_ev = np.zeros((n_c, T))
    rec_ev_on = np.zeros((n_c, T))
    rec_ev_rem = np.zeros((n_c, T))
    rec_grid = np.zeros(T)
    rec_curtail = np.zeros(T)
    rec_overload = np.zeros(T)
    ev_delivered = 0.0
    ev_unmet = 0.0
    ev_sessions = 0
    ev_sessions_unmet = 0
    imp_lim = site.grid.import_limit_kw
    exp_lim = site.grid.export_limit_kw

    for t in range(T):
        # EV arrivals
        for i in range(n_c):
            if t in starts[i]:
                dep, need = starts[i][t]
                ev_on[i], ev_dep[i], ev_rem[i] = True, dep, need
                ev_sessions += 1

        max_ch = np.minimum(pmax, np.maximum(e_max - energy, 0) / (eta * dt)) if bats else pmax
        max_dis = np.minimum(pmax, np.maximum(energy - e_min, 0) * eta / dt) if bats else pmax
        obs = Observation(
            t=t, step_hours=dt, load_kw=float(load_tot[t]), pv_kw=float(pv_tot[t]),
            price=float(price[t]), price_next_24h=price_full[s0 + t : s0 + t + 24],
            battery_energy_kwh=float(energy.sum()), battery_capacity_kwh=float(cap.sum()),
            battery_max_charge_kw=float(max_ch.sum()),
            battery_max_discharge_kw=float(max_dis.sum()),
            evs=tuple(
                EVState(bool(ev_on[i]), float(ev_rem[i]), int(ev_dep[i] - t) if ev_on[i] else 0,
                        chargers[i].max_power_kw, chargers[i].efficiency)
                for i in range(n_c)
            ),
        )
        act = decide(site.controller, obs)

        # Physical limits
        ev_kw = np.array([
            min(max(a, 0.0), chargers[i].max_power_kw, ev_rem[i] / chargers[i].efficiency / dt)
            if ev_on[i] else 0.0
            for i, a in enumerate(act.ev_kw)
        ])
        total_b = float(np.clip(act.battery_kw, -max_dis.sum(), max_ch.sum())) if bats else 0.0
        weights = list(max_ch if total_b > 0 else max_dis)
        b_kw = np.array(_split(total_b, weights)) if bats else np.zeros(0)
        pv_out = pv_tot[t]

        # Safety layer: import limit
        net = load_tot[t] - pv_out + b_kw.sum() + ev_kw.sum()
        if imp_lim is not None and net > imp_lim + EPS:
            excess = net - imp_lim
            for i in range(len(bats)):  # 1. stop charging batteries
                r = min(excess, max(b_kw[i], 0.0))
                b_kw[i] -= r
                excess -= r
            for i in range(len(bats)):  # 2. discharge harder
                r = min(excess, max_dis[i] + min(b_kw[i], 0.0))
                b_kw[i] -= r
                excess -= r
            ev_sum = ev_kw.sum()  # 3. slow EV charging proportionally
            if ev_sum > EPS and excess > EPS:
                r = min(excess, ev_sum)
                ev_kw *= (ev_sum - r) / ev_sum
                excess -= r
            rec_overload[t] = max(excess, 0.0)
        # Safety layer: export limit
        net = load_tot[t] - pv_out + b_kw.sum() + ev_kw.sum()
        if exp_lim is not None and -net > exp_lim + EPS:
            surplus = -net - exp_lim
            for i in range(len(bats)):  # 1. stop discharging, 2. charge harder
                r = min(surplus, max_ch[i] - b_kw[i])
                b_kw[i] += r
                surplus -= r
            r = min(surplus, pv_out)  # 3. curtail solar
            pv_out -= r
            rec_curtail[t] = r

        # State updates
        for i in range(len(bats)):
            energy[i] += b_kw[i] * dt * eta[i] if b_kw[i] >= 0 else b_kw[i] * dt / eta[i]
        energy = np.clip(energy, e_min, e_max) if bats else energy
        for i in range(n_c):
            if ev_on[i]:
                got = ev_kw[i] * dt * chargers[i].efficiency
                ev_rem[i] = max(ev_rem[i] - got, 0.0)
                ev_delivered += got
                rec_ev_on[i, t] = 1.0
                rec_ev_rem[i, t] = ev_rem[i]
                if t + 1 >= ev_dep[i]:
                    if ev_rem[i] > 0.01:
                        ev_unmet += ev_rem[i]
                        ev_sessions_unmet += 1
                    ev_on[i], ev_rem[i] = False, 0.0

        rec_bat[:, t] = b_kw
        rec_soc[:, t] = energy / np.where(cap > 0, cap, 1)
        rec_ev[:, t] = ev_kw
        rec_grid[t] = load_tot[t] - pv_out + b_kw.sum() + ev_kw.sum()

    # Billing and KPIs
    month = lib.month[s0:s1]
    trace = EpisodeTrace(
        step_hours=dt, net_grid_kwh=rec_grid[None, :] * dt, price_per_kwh=price.astype(float),
        month=month, battery_terminal_kwh=rec_bat * dt, battery_capacity_kwh=cap.astype(float),
        export_price_per_kwh=site.tariff.export_price,
    )
    k = compute_kpis(trace).as_dict()
    import_kw = np.clip(rec_grid, 0, None)
    monthly_peaks = [float(import_kw[month == m].max()) for m in np.unique(month)]
    demand_cost = site.tariff.demand_charge_per_kw_month * sum(monthly_peaks)
    pv_used = float(pv_tot.sum() - rec_curtail.sum())
    pv_exported = min(float(np.clip(-rec_grid, 0, None).sum()), pv_used)
    consumption = float(load_tot.sum() + rec_ev.sum() * dt)
    k.update(
        demand_charge_cost=demand_cost,
        total_cost=k["energy_cost"] + demand_cost,
        pv_generated_kwh=float(pv_tot.sum()),
        pv_curtailed_kwh=float(rec_curtail.sum()),
        self_consumption_share=(pv_used - pv_exported) / pv_used if pv_used > EPS else 0.0,
        self_sufficiency_share=1 - k["grid_import_kwh"] / consumption if consumption > EPS else 0.0,
        ev_sessions=float(ev_sessions),
        ev_delivered_kwh=ev_delivered,
        ev_unmet_kwh=ev_unmet,
        ev_sessions_unmet=float(ev_sessions_unmet),
        grid_overload_kwh=float(rec_overload.sum() * dt),
    )
    if rec_overload.sum() > 0.01:
        warnings.append(
            f"Import limit exceeded in {(rec_overload > 0.01).sum()} hours even after "
            "using the battery and slowing EV charging."
        )

    site_series = {
        "load_kw": load_tot, "pv_kw": pv_tot - rec_curtail, "pv_curtailed_kw": rec_curtail,
        "battery_kw": rec_bat.sum(axis=0), "ev_kw": rec_ev.sum(axis=0), "grid_kw": rec_grid,
        "price": price.astype(float),
        "soc": (rec_soc * cap[:, None]).sum(axis=0) / cap.sum() if cap.sum() > 0 else np.zeros(T),
    }
    assets: dict[str, dict[str, FloatArray]] = {}
    for bld in buildings:
        assets[bld.id] = {"power_kw": load[bld.id]}
    curtail_share = np.divide(rec_curtail, pv_tot, out=np.zeros(T), where=pv_tot > EPS)
    for p in pvs:
        assets[p.id] = {"power_kw": -pv_avail[p.id] * (1 - curtail_share)}
    for i, bat in enumerate(bats):
        assets[bat.id] = {"power_kw": rec_bat[i], "soc": rec_soc[i]}
    for i, c in enumerate(chargers):
        assets[c.id] = {
            "power_kw": rec_ev[i], "connected": rec_ev_on[i], "remaining_kwh": rec_ev_rem[i],
        }

    return SimResult(dt, month, lib.hour[s0:s1], site_series, assets, k, warnings)
