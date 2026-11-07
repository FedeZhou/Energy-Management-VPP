"""Generic site simulator.

One electrical bus behind one three-phase grid meter. Each step:
1. read exogenous data (building load, solar per kWp, price, EV arrivals),
2. ask the controller for battery and EV setpoints,
3. clip them to physical limits (power, state of charge, energy still needed,
   minimum charging current),
4. safety layer: enforce the site import/export limits, then the per-phase fuse,
5. update states and record everything.

Phases: buildings, solar and batteries are treated as balanced over L1-L3.
Three-phase chargers split their power equally; single-phase chargers put it on
their phase. A car whose own maximum is below a three-phase charger's minimum
(6 A x 3 phases) is assumed to charge single-phase on the charger's phase.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from numpy.typing import NDArray

from emsbench.benchmark.kpis import EpisodeTrace, compute_kpis
from emsbench.sim.controllers import EVState, Observation, decide
from emsbench.sim.model import PHASE_VOLTAGE, Battery, Building, EVCharger, Site, SolarPV
from emsbench.sim.profiles import ProfileLibrary

FloatArray = NDArray[np.float64]
EPS = 1e-9
PHASES = ("L1", "L2", "L3")


@dataclass
class SimResult:
    start: dt.datetime
    step_minutes: int
    month: NDArray[np.int_]
    site: dict[str, FloatArray]
    assets: dict[str, dict[str, FloatArray]]
    kpis: dict[str, float]
    sessions: list[dict[str, Any]] = field(default_factory=list)
    sources: list[dict[str, str]] = field(default_factory=list)
    currency: str = ""
    warnings: list[str] = field(default_factory=list)

    @property
    def step_hours(self) -> float:
        return self.step_minutes / 60


def _split(total: float, weights: list[float]) -> list[float]:
    s = sum(weights)
    return [total * w / s for w in weights] if s > EPS else [0.0 for _ in weights]


def simulate(site: Site, lib: ProfileLibrary) -> SimResult:
    step_s = site.step_minutes * 60
    dth = step_s / 3600.0
    T = site.steps
    start = dt.datetime.combine(site.start, dt.time())
    sources: list[dict[str, str]] = []
    warnings: list[str] = []

    def window(asset_id: str, profile_id: str, kind: str, steps: int = T) -> FloatArray:
        p = lib.get(profile_id, kind)
        vals, info = p.window(start, steps, step_s)
        sources.append({"asset": asset_id, "profile": profile_id, "label": p.label,
                        "source_start": info.source_start.isoformat(), "resampling": info.resampling})
        return vals

    buildings = [a for a in site.assets if isinstance(a, Building)]
    pvs = [a for a in site.assets if isinstance(a, SolarPV)]
    bats = [a for a in site.assets if isinstance(a, Battery)]
    chargers = [a for a in site.assets if isinstance(a, EVCharger)]

    load = {b.id: window(b.id, b.load_profile, "load") * b.scale for b in buildings}
    pv_avail = {p.id: window(p.id, p.profile, "pv") * p.capacity_kwp for p in pvs}
    look = int(round(24 / dth))
    price_profile = lib.get(site.tariff.price_profile, "price")
    try:
        price_ext = window("tariff", site.tariff.price_profile, "price", T + look)
    except ValueError:  # data ends inside the look-ahead: repeat the last day
        base = window("tariff", site.tariff.price_profile, "price")
        price_ext = np.concatenate([base, base[-look:] if T >= look else np.resize(base, look)])
    price_ext = price_ext + site.tariff.price_adder
    price = price_ext[:T]
    load_tot = np.sum(list(load.values()), axis=0) if load else np.zeros(T)
    pv_tot = np.sum(list(pv_avail.values()), axis=0) if pv_avail else np.zeros(T)

    # EV sessions arriving inside the period.
    n_c = len(chargers)
    arrivals: list[dict[int, list[Any]]] = []
    for c in chargers:
        s_set = lib.get_ev(c.sessions)
        rows, info = s_set.window(start, T, step_s)
        sources.append({"asset": c.id, "profile": c.sessions, "label": s_set.label,
                        "source_start": info.source_start.isoformat(), "resampling": info.resampling})
        m: dict[int, list[Any]] = {}
        for a, d, s in rows:
            m.setdefault(a, [d, s])
        arrivals.append(m)
    min3 = [c.min_current_a * PHASE_VOLTAGE * c.phases / 1000 for c in chargers]

    # Battery state
    cap = np.array([b.capacity_kwh for b in bats], dtype=float)
    pmax = np.array([b.power_kw for b in bats], dtype=float)
    eta = np.sqrt([b.round_trip_efficiency for b in bats])
    e_min = cap * np.array([b.soc_min for b in bats])
    e_max = cap * np.array([b.soc_max for b in bats])
    energy = np.clip(cap * np.array([b.soc_initial for b in bats]), e_min, e_max)

    # EV state per charger
    ev_rem = np.zeros(n_c)
    ev_dep = np.full(n_c, -1)
    ev_on = np.zeros(n_c, dtype=bool)
    ev_max = np.zeros(n_c)
    ev_min = np.zeros(n_c)
    ev_ph = [""] * n_c  # "3" or a phase name
    ev_sess: list[dict[str, Any] | None] = [None] * n_c
    sessions_out: list[dict[str, Any]] = []
    skipped = 0
    ev_delivered = 0.0

    rec_bat = np.zeros((len(bats), T))
    rec_soc = np.zeros((len(bats), T))
    rec_ev = np.zeros((n_c, T))
    rec_ev_on = np.zeros((n_c, T))
    rec_ev_rem = np.zeros((n_c, T))
    rec_grid = np.zeros(T)
    rec_curtail = np.zeros(T)
    rec_overload = np.zeros(T)
    rec_phase = np.zeros((3, T))
    rec_fuse_over = np.zeros(T)
    imp_lim, exp_lim, fuse = site.grid.import_limit_kw, site.grid.export_limit_kw, site.grid.fuse_a

    def phase_kw(base: float, ev_kw: FloatArray) -> FloatArray:
        out = np.full(3, base / 3.0)
        for i in range(n_c):
            if ev_kw[i] <= 0:
                continue
            if ev_ph[i] == "3":
                out += ev_kw[i] / 3.0
            else:
                out[PHASES.index(ev_ph[i])] += ev_kw[i]
        return out

    for t in range(T):
        for i, c in enumerate(chargers):
            if t in arrivals[i]:
                dep, s = arrivals[i][t]
                if ev_on[i]:
                    skipped += 1
                    continue
                car_max = s.max_kw if s.max_kw else c.max_power_kw
                single = c.phases == 3 and car_max < min3[i]
                ev_on[i], ev_dep[i], ev_rem[i] = True, dep, s.energy_kwh
                ev_max[i] = min(c.max_power_kw, car_max)
                ev_ph[i] = c.phase if (c.phases == 1 or single) else "3"
                ev_min[i] = c.min_current_a * PHASE_VOLTAGE * (1 if ev_ph[i] != "3" else 3) / 1000
                ev_sess[i] = {"charger": c.id, "ev": s.ev_id, "arrival": t, "departure": int(dep),
                              "requested_kwh": round(s.energy_kwh, 3), "delivered_kwh": 0.0}

        max_ch = np.minimum(pmax, np.maximum(e_max - energy, 0) / (eta * dth)) if bats else pmax
        max_dis = np.minimum(pmax, np.maximum(energy - e_min, 0) * eta / dth) if bats else pmax
        obs = Observation(
            t=t, step_hours=dth, load_kw=float(load_tot[t]), pv_kw=float(pv_tot[t]),
            price=float(price[t]), price_ahead=price_ext[t: t + look],
            battery_energy_kwh=float(energy.sum()), battery_capacity_kwh=float(cap.sum()),
            battery_max_charge_kw=float(max_ch.sum()), battery_max_discharge_kw=float(max_dis.sum()),
            evs=tuple(EVState(bool(ev_on[i]), float(ev_rem[i]), int(ev_dep[i] - t) if ev_on[i] else 0,
                              float(ev_max[i]), float(ev_min[i]), chargers[i].efficiency)
                      for i in range(n_c)),
        )
        act = decide(site.controller, obs)

        # Physical limits
        ev_kw = np.zeros(n_c)
        for i, req in enumerate(act.ev_kw):
            if ev_on[i]:
                need_kw = float(ev_rem[i] / chargers[i].efficiency / dth)
                want = min(max(req, 0.0), float(ev_max[i]), need_kw)
                # Below the minimum current the charger pauses, unless the car only needs a top-up.
                ev_kw[i] = want if want >= ev_min[i] - EPS or want >= need_kw - EPS else 0.0
        total_b = float(np.clip(act.battery_kw, -max_dis.sum(), max_ch.sum())) if bats else 0.0
        b_kw = np.array(_split(total_b, list(max_ch if total_b > 0 else max_dis))) if bats else np.zeros(0)
        pv_out = float(pv_tot[t])

        # Safety layer 1: site import limit
        net = load_tot[t] - pv_out + b_kw.sum() + ev_kw.sum()
        if imp_lim is not None and net > imp_lim + EPS:
            excess = net - imp_lim
            for i in range(len(bats)):  # stop charging batteries
                r = min(excess, max(b_kw[i], 0.0))
                b_kw[i] -= r
                excess -= r
            for i in range(len(bats)):  # discharge harder
                r = min(excess, max_dis[i] + min(b_kw[i], 0.0))
                b_kw[i] -= r
                excess -= r
            ev_sum = ev_kw.sum()  # slow EVs proportionally
            if ev_sum > EPS and excess > EPS:
                r = min(excess, ev_sum)
                ev_kw *= (ev_sum - r) / ev_sum
                excess -= r
            rec_overload[t] = max(excess, 0.0)

        # Safety layer 2: per-phase fuse (import side), by slowing EVs on the overloaded phase
        if fuse is not None:
            fuse_kw = fuse * PHASE_VOLTAGE / 1000
            for _ in range(3):
                base = load_tot[t] - pv_out + b_kw.sum()
                ph = phase_kw(base, ev_kw)
                p_idx = int(np.argmax(ph))
                excess = ph[p_idx] - fuse_kw
                if excess <= EPS:
                    break
                for i in range(len(bats)):  # battery relief is shared over 3 phases
                    r = min(3 * excess, max(b_kw[i], 0.0))
                    b_kw[i] -= r
                    excess -= r / 3
                on_p = [i for i in range(n_c) if ev_kw[i] > 0 and ev_ph[i] == PHASES[p_idx]]
                on_3 = [i for i in range(n_c) if ev_kw[i] > 0 and ev_ph[i] == "3"]
                for group, per_kw in ((on_p, 1.0), (on_3, 1 / 3)):
                    s = sum(ev_kw[i] for i in group)
                    if s > EPS and excess > EPS:
                        r = min(excess / per_kw, s)
                        for i in group:
                            ev_kw[i] *= (s - r) / s
                        excess -= r * per_kw
                for i in range(n_c):  # a charger squeezed below its minimum pauses
                    if 0 < ev_kw[i] < ev_min[i] - EPS:
                        ev_kw[i] = 0.0
            base = load_tot[t] - pv_out + b_kw.sum()
            over = float(phase_kw(base, ev_kw).max()) - fuse_kw
            rec_fuse_over[t] = over if over > 1e-6 else 0.0

        # Safety layer 3: export limit
        net = load_tot[t] - pv_out + b_kw.sum() + ev_kw.sum()
        if exp_lim is not None and -net > exp_lim + EPS:
            surplus = -net - exp_lim
            for i in range(len(bats)):
                r = min(surplus, max_ch[i] - b_kw[i])
                b_kw[i] += r
                surplus -= r
            r = min(surplus, pv_out)
            pv_out -= r
            rec_curtail[t] = r

        # State updates
        for i in range(len(bats)):
            energy[i] += b_kw[i] * dth * eta[i] if b_kw[i] >= 0 else b_kw[i] * dth / eta[i]
        if bats:
            energy = np.clip(energy, e_min, e_max)
        for i in range(n_c):
            if not ev_on[i]:
                continue
            got = ev_kw[i] * dth * chargers[i].efficiency
            ev_rem[i] = max(ev_rem[i] - got, 0.0)
            ev_delivered += got
            rec_ev_on[i, t] = 1.0
            rec_ev_rem[i, t] = ev_rem[i]
            sess = ev_sess[i]
            assert sess is not None
            sess["delivered_kwh"] += got
            if t + 1 >= ev_dep[i]:
                sess["delivered_kwh"] = round(sess["delivered_kwh"], 3)
                sess["unmet_kwh"] = round(max(sess["requested_kwh"] - sess["delivered_kwh"], 0.0), 3)
                sessions_out.append(sess)
                ev_on[i], ev_rem[i], ev_sess[i] = False, 0.0, None

        rec_bat[:, t] = b_kw
        rec_soc[:, t] = energy / np.where(cap > 0, cap, 1)
        rec_ev[:, t] = ev_kw
        net = load_tot[t] - pv_out + b_kw.sum() + ev_kw.sum()
        rec_grid[t] = net
        rec_phase[:, t] = phase_kw(net - ev_kw.sum(), ev_kw) * 1000 / PHASE_VOLTAGE

    for i in range(n_c):  # sessions still plugged in at the end
        sess = ev_sess[i]
        if sess is not None:
            sess["delivered_kwh"] = round(sess["delivered_kwh"], 3)
            sess["unmet_kwh"] = None  # unknown: the car leaves after the period
            sessions_out.append(sess)

    # Billing and KPIs
    month = np.array([(start + dt.timedelta(seconds=step_s * i)).month for i in range(0, T)])
    trace = EpisodeTrace(
        step_hours=dth, net_grid_kwh=rec_grid[None, :] * dth, price_per_kwh=price.astype(float),
        month=month, battery_terminal_kwh=rec_bat * dth, battery_capacity_kwh=cap,
        export_price_per_kwh=site.tariff.export_price,
    )
    k = compute_kpis(trace).as_dict()
    import_kw = np.clip(rec_grid, 0, None)
    monthly_peaks = [float(import_kw[month == m].max()) for m in np.unique(month)]
    demand_cost = site.tariff.demand_charge_per_kw_month * sum(monthly_peaks)
    pv_used = float((pv_tot.sum() - rec_curtail.sum()) * dth)
    pv_exported = min(float(np.clip(-rec_grid, 0, None).sum() * dth), pv_used)
    consumption = float((load_tot.sum() + rec_ev.sum()) * dth)
    done = [s for s in sessions_out if s.get("unmet_kwh") is not None]
    k.update(
        demand_charge_cost=demand_cost,
        total_cost=k["energy_cost"] + demand_cost,
        pv_generated_kwh=float(pv_tot.sum() * dth),
        pv_curtailed_kwh=float(rec_curtail.sum() * dth),
        self_consumption_share=(pv_used - pv_exported) / pv_used if pv_used > EPS else 0.0,
        self_sufficiency_share=1 - k["grid_import_kwh"] / consumption if consumption > EPS else 0.0,
        ev_sessions=float(len(done)),
        ev_delivered_kwh=ev_delivered,
        ev_unmet_kwh=float(sum(s["unmet_kwh"] for s in done)),
        ev_sessions_unmet=float(sum(1 for s in done if s["unmet_kwh"] > 0.05)),
        ev_sessions_skipped=float(skipped),
        grid_overload_kwh=float(rec_overload.sum() * dth),
        max_phase_current_a=float(rec_phase.max()) if T else 0.0,
        fuse_overload_kwh=float(rec_fuse_over.sum() * dth),
    )
    if rec_overload.sum() > 0.01:
        warnings.append(f"Import limit exceeded in {(rec_overload > 0.01).sum()} time steps even after "
                        "using the battery and slowing EV charging.")
    if rec_fuse_over.sum() > 0.01:
        warnings.append(f"A phase exceeded the {fuse} A fuse in {(rec_fuse_over > 0.01).sum()} time steps "
                        "even after slowing EV charging (the base load alone is too high).")
    if skipped:
        warnings.append(f"{skipped} EV visit(s) skipped because the charger was still occupied.")
    if any(s["resampling"].startswith("repeated") for s in sources):
        warnings.append("Some data is coarser than the time step and was repeated, not measured, at this "
                        "resolution. See Data sources.")

    site_series = {
        "load_kw": load_tot, "pv_kw": pv_tot - rec_curtail, "pv_curtailed_kw": rec_curtail,
        "battery_kw": rec_bat.sum(axis=0), "ev_kw": rec_ev.sum(axis=0), "grid_kw": rec_grid,
        "price": price.astype(float),
        "soc": (rec_soc * cap[:, None]).sum(axis=0) / cap.sum() if cap.sum() > 0 else np.zeros(T),
        "phase_l1_a": rec_phase[0], "phase_l2_a": rec_phase[1], "phase_l3_a": rec_phase[2],
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
        assets[c.id] = {"power_kw": rec_ev[i], "connected": rec_ev_on[i], "remaining_kwh": rec_ev_rem[i]}

    return SimResult(start, site.step_minutes, month, site_series, assets, k, sessions_out, sources,
                     price_profile.currency, warnings)
