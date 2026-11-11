"""Generic site simulator.

One electrical bus behind one three-phase grid meter. Each step:
1. read exogenous data (building load, solar per kWp, price, EV arrivals),
2. ask the controller for battery and EV setpoints,
3. clip them to physical limits (power, state of charge, energy still needed,
   minimum charging current),
4. grid-operator dimming (§14a, optional), then the safety layer: site import limit, per-phase fuse,
   export limit,
5. update states and record everything.

Heat pumps draw heat / COP from the bus and can store heat in a tank; unmet heat is recorded. Cars on
bidirectional chargers can supply the bus (negative power) while they can still reach their target.

Phases: buildings, solar, heat pumps and batteries are treated as balanced over L1-L3.
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
from emsbench.sim.controllers import EVState, HPState, Observation, RuleController
from emsbench.sim.forecasts import DAY_AHEAD_PUBLISHED_HOUR, Forecast, FutureSession, PerfectForecast, RealisticForecast
from emsbench.sim.model import (
    DIM_GZF,
    DIM_GZF_MANY,
    DIM_LARGE_FACTOR,
    DIM_LARGE_KW,
    DIM_MIN_KW,
    DIM_THRESHOLD_KW,
    PHASE_VOLTAGE,
    Battery,
    Building,
    DataCenter,
    EVCharger,
    HeatPump,
    Site,
    SolarPV,
)
from emsbench.sim.profiles import Profile, ProfileLibrary
from emsbench.sim.wear import MAX_YEARS, default_replacement_cost, expected_life, wear_price_per_kwh

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


def tou_demand_cost(import_kw: FloatArray, rate: FloatArray, bill_month: NDArray[np.int_]) -> float:
    """Time-of-use demand charges: per billing month, each positive rate (currency per kW per month) is
    charged on the highest import during the steps that carry that rate. Steps with equal rates form
    one period, so two different windows with the same price are billed as one."""
    cost = 0.0
    for m in np.unique(bill_month):
        in_month = bill_month == m
        for r in np.unique(rate[in_month & (rate > 0)]):
            cost += float(r) * float(import_kw[in_month & (rate == r)].max())
    return cost


def simulate(site: Site, lib: ProfileLibrary) -> SimResult:
    step_s = site.step_minutes * 60
    dth = step_s / 3600.0
    T = site.steps
    start = dt.datetime.combine(site.start, dt.time())
    sources: list[dict[str, str]] = []
    warnings: list[str] = []

    used: dict[tuple[str, str], tuple[Profile, dt.datetime]] = {}  # (asset, kind) -> profile, source start

    def window(asset_id: str, profile_id: str, kind: str, steps: int = T) -> FloatArray:
        p = lib.get(profile_id, kind)
        vals, info = p.window(start, steps, step_s)
        used.setdefault((asset_id, kind), (p, info.source_start))
        sources.append({"asset": asset_id, "profile": profile_id, "label": p.label,
                        "source_start": info.source_start.isoformat(), "resampling": info.resampling})
        return vals

    buildings = [a for a in site.assets if isinstance(a, Building)]
    pvs = [a for a in site.assets if isinstance(a, SolarPV)]
    bats = [a for a in site.assets if isinstance(a, Battery)]
    chargers = [a for a in site.assets if isinstance(a, EVCharger)]
    centers = [a for a in site.assets if isinstance(a, DataCenter)]

    load = {b.id: window(b.id, b.load_profile, "load") * b.scale for b in buildings}
    # Data centers: facility power = IT power x PUE (constant PUE: cooling follows IT, not weather).
    it_kw = {d.id: window(d.id, d.it_load_profile, "load") * d.it_scale for d in centers}
    load.update({d.id: it_kw[d.id] * d.pue for d in centers})
    pv_avail = {p.id: window(p.id, p.profile, "pv") * p.capacity_kwp for p in pvs}

    # Heat pumps: heat demand (kW) = shape (kW per kWh/yr) x annual demand; electricity = heat / COP.
    hps = [a for a in site.assets if isinstance(a, HeatPump)]
    n_hp = len(hps)
    hp_heat = [window(h.id, h.heat_profile, "heat") * h.annual_heat_kwh for h in hps]
    hp_cop = [np.maximum(window(h.id, h.cop_profile, "cop"), 1.0) for h in hps]
    hp_need = [q / c for q, c in zip(hp_heat, hp_cop, strict=True)]  # electric kW to heat on demand
    # No size given: just enough for the coldest step of this period (rounded up to 0.1 kW).
    hp_pmax = np.array([h.max_power_kw if h.max_power_kw is not None else float(np.ceil(n.max() * 10) / 10)
                        for h, n in zip(hps, hp_need, strict=True)], dtype=float)
    hp_cap = np.array([h.buffer_kwh for h in hps], dtype=float)
    hp_buf = hp_cap * np.array([h.buffer_initial for h in hps], dtype=float)
    hp_need_tot = np.sum(hp_need, axis=0) if hps else np.zeros(T)
    look = int(round(24 / dth))
    price_profile = lib.get(site.tariff.price_profile, "price")

    def window_ahead(profile_id: str, kind: str) -> FloatArray:
        """The period plus 24 h of look-ahead for the controllers; if the data ends inside the look-ahead,
        the last day is repeated."""
        try:
            return window("tariff", profile_id, kind, T + look)
        except ValueError:
            base = window("tariff", profile_id, kind)
            return np.concatenate([base, base[-look:] if T >= look else np.resize(base, look)])

    spot_ext = window_ahead(site.tariff.price_profile, "price")
    price_ext = spot_ext + site.tariff.price_adder
    # Export price per step: the feed-in tariff, zero while the spot price is negative if that rule applies.
    export_ext = np.full(spot_ext.size, site.tariff.export_price)
    if site.tariff.export_unpaid_at_negative_prices:
        export_ext[spot_ext < 0] = 0.0
    if site.tariff.network_fee_profile:  # §14a Modul 3: a time-of-day network fee on every imported kWh
        price_ext = price_ext + window_ahead(site.tariff.network_fee_profile, "netfee")
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

    def car_limits(i: int, s: Any) -> tuple[float, str, float]:
        """Max power, phase ("3" or a phase name) and minimum power for session `s` on charger `i`."""
        c = chargers[i]
        car_max = s.max_kw if s.max_kw else c.max_power_kw
        single = c.phases == 3 and car_max < min3[i]  # a single-phase car on a three-phase charger
        phase = c.phase if (c.phases == 1 or single) else "3"
        return min(c.max_power_kw, car_max), phase, c.min_current_a * PHASE_VOLTAGE * (1 if phase != "3" else 3) / 1000

    # Billing months are calendar months (year and month), so a run longer than a year bills each one.
    year_month = np.array([(d.year, d.month) for d in (start + dt.timedelta(seconds=step_s * i) for i in range(T))])
    bill_month = year_month[:, 0] * 12 + year_month[:, 1] if T else np.zeros(0, dtype=int)
    demand_rate = (window("tariff", site.tariff.demand_charge_profile, "demand") if site.tariff.demand_charge_profile
                   else np.zeros(T))
    month_peak: dict[int, float] = {}
    tou_peak: dict[tuple[int, float], float] = {}

    # Battery state
    cap = np.array([b.capacity_kwh for b in bats], dtype=float)
    pmax = np.array([b.power_kw for b in bats], dtype=float)
    eta = np.sqrt([b.round_trip_efficiency for b in bats])
    e_min = cap * np.array([b.soc_min for b in bats])
    e_max = cap * np.array([b.soc_max for b in bats])
    energy = np.clip(cap * np.array([b.soc_initial for b in bats]), e_min, e_max)
    energy_start = energy.copy()

    # EV state per charger
    ev_rem = np.zeros(n_c)
    ev_dep = np.full(n_c, -1)
    ev_on = np.zeros(n_c, dtype=bool)
    ev_max = np.zeros(n_c)
    ev_min = np.zeros(n_c)
    ev_ph = [""] * n_c  # "3" or a phase name
    ev_sess: list[dict[str, Any] | None] = [None] * n_c
    ev_lent = np.zeros(n_c)  # energy taken from the current car this visit (bidirectional chargers)
    sessions_out: list[dict[str, Any]] = []
    skipped = 0
    ev_delivered = 0.0
    ev_discharged = 0.0
    hp_unmet = np.zeros(n_hp)

    # §14a dimming window (simulation clock = local time) and the devices it can limit.
    dim = site.grid.dimming
    hour_of_step = np.array([((step_s * i) / 3600.0) % 24 for i in range(T)])
    d0, dlen = site.grid.dimming_start_hour % 24, site.grid.dimming_hours
    dim_mask = (((hour_of_step - d0) % 24) < dlen) if dim != "off" and dlen > 0 else np.zeros(T, dtype=bool)
    dim_ev = [c.max_power_kw > DIM_THRESHOLD_KW for c in chargers]
    dim_bat = [b.power_kw > DIM_THRESHOLD_KW for b in bats]
    dim_hp = [float(pm) > DIM_THRESHOLD_KW for pm in hp_pmax]
    n_dim = sum(dim_ev) + sum(dim_bat) + sum(dim_hp)
    big_hp_kw = float(sum(pm for pm, d in zip(hp_pmax, dim_hp, strict=True) if d and pm > DIM_LARGE_KW))
    if n_dim <= 1:
        ems_cap = DIM_LARGE_FACTOR * big_hp_kw if big_hp_kw > 0 else DIM_MIN_KW
    else:
        gzf = DIM_GZF.get(n_dim, DIM_GZF_MANY)
        ems_cap = (DIM_LARGE_FACTOR * big_hp_kw if big_hp_kw > 0 else DIM_MIN_KW) + (n_dim - 1) * gzf * DIM_MIN_KW

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
    rec_hp = np.zeros((n_hp, T))
    rec_hp_buf = np.zeros((n_hp, T))
    rec_dimmed = np.zeros(T)
    imp_lim, exp_lim, fuse = site.grid.import_limit_kw, site.grid.export_limit_kw, site.grid.fuse_a

    # What the controllers are told about the future (heat pumps run on demand in these series).
    forecast: Forecast
    actual = {"load": load_tot + hp_need_tot, "pv": pv_tot, "price": price_ext, "export_price": export_ext,
              "demand_rate": demand_rate}
    # The sessions the engine will accept (a car arriving while the charger is busy is skipped). A perfect
    # forecast knows them in advance; a realistic one only those already seen (for scenario MPC).
    upcoming: list[list[FutureSession]] = []
    for i in range(n_c):
        accepted: list[FutureSession] = []
        free_from = -1
        for a in sorted(arrivals[i]):
            dep, s = arrivals[i][a]
            if a < free_from:
                continue
            mx, car_phase, mn = car_limits(i, s)
            accepted.append(FutureSession(int(a), int(dep), float(s.energy_kwh), mx, mn, car_phase))
            free_from = int(dep)
        upcoming.append(accepted)
    if site.controller.forecast == "realistic":
        forecast = _realistic_forecast(site, lib, actual, used, start, T, step_s, pvs, warnings)
        forecast.ev_visits = upcoming
    else:
        forecast = PerfectForecast(actual, upcoming, int(round(86400 / step_s)))

    # Battery wear: replacement value per battery (None = not priced) and the MPC's wear price per kWh.
    wear_cost_per_kwh = [b.replacement_cost_per_kwh if b.replacement_cost_per_kwh is not None
                         else default_replacement_cost(b.capacity_kwh, price_profile.currency) for b in bats]

    controller: Any = RuleController(site.controller)
    if site.controller.battery == "mpc":
        from emsbench.sim.mpc import MPCController, SiteLimits

        wear_price = 0.0
        if site.controller.mpc_wear_cost and bats and cap.sum() > 0:
            prices = [wear_price_per_kwh(c, b.chemistry, b.temperature_c, b.end_of_life_capacity) if c else 0.0
                      for b, c in zip(bats, wear_cost_per_kwh, strict=True)]
            wear_price = float(np.dot(prices, cap) / cap.sum())

        controller = MPCController(site.controller, SiteLimits(
            step_hours=dth, battery_capacity_kwh=float(cap.sum()), battery_min_kwh=float(e_min.sum()),
            battery_max_kwh=float(e_max.sum()), battery_power_kw=float(pmax.sum()),
            battery_eta=float(np.mean(eta)) if bats else 1.0, import_limit_kw=imp_lim, export_limit_kw=exp_lim,
            fuse_kw=fuse * PHASE_VOLTAGE / 1000 if fuse is not None else None, export_price=site.tariff.export_price,
            demand_rate_flat=site.tariff.demand_charge_per_kw_month,
            charger_efficiency=tuple(c.efficiency for c in chargers), battery_wear_per_kwh=wear_price,
        ), forecast)

    def phase_kw(base: float, ev_kw: FloatArray) -> FloatArray:
        out = np.full(3, base / 3.0)
        for i in range(n_c):
            if ev_kw[i] == 0:
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
                ev_on[i], ev_dep[i], ev_rem[i] = True, dep, s.energy_kwh
                ev_max[i], ev_ph[i], ev_min[i] = car_limits(i, s)
                ev_sess[i] = {"charger": c.id, "ev": s.ev_id, "arrival": t, "departure": int(dep),
                              "requested_kwh": round(s.energy_kwh, 3), "delivered_kwh": 0.0, "discharged_kwh": 0.0}
                ev_lent[i] = 0.0

        # Bidirectional chargers: how much a car may give back now and still reach its target by departure
        # (charging at full power in the remaining steps), within the per-visit limit.
        ev_dis = np.zeros(n_c)
        for i, c in enumerate(chargers):
            if ev_on[i] and c.bidirectional:
                slack = (ev_dep[i] - t - 1) * ev_max[i] * dth * c.efficiency - ev_rem[i]
                lend = max(0.0, min(slack, c.v2g_max_kwh_per_visit - ev_lent[i]))
                ev_dis[i] = min(float(ev_max[i]), lend * c.efficiency / dth)
        max_ch = np.minimum(pmax, np.maximum(e_max - energy, 0) / (eta * dth)) if bats else pmax
        max_dis = np.minimum(pmax, np.maximum(energy - e_min, 0) * eta / dth) if bats else pmax
        obs = Observation(
            t=t, step_hours=dth, load_kw=float(load_tot[t]), pv_kw=float(pv_tot[t]),
            price=float(price[t]), price_ahead=forecast.window("price", t, look),
            battery_energy_kwh=float(energy.sum()), battery_capacity_kwh=float(cap.sum()),
            battery_max_charge_kw=float(max_ch.sum()), battery_max_discharge_kw=float(max_dis.sum()),
            evs=tuple(EVState(bool(ev_on[i]), float(ev_rem[i]), int(ev_dep[i] - t) if ev_on[i] else 0,
                              float(ev_max[i]), float(ev_min[i]), chargers[i].efficiency, ev_ph[i] or "3",
                              bool(ev_dis[i] > 0), float(ev_dis[i]))
                      for i in range(n_c)),
            heat_pumps=tuple(HPState(float(hp_heat[j][t]), float(hp_cop[j][t]), float(hp_buf[j]), float(hp_cap[j]),
                                     float(hp_pmax[j])) for j in range(n_hp)),
            month_peak_kw=month_peak.get(int(bill_month[t]), 0.0),
            tou_peaks=tuple((r, v) for (m, r), v in tou_peak.items() if m == int(bill_month[t])),
        )
        act = controller.act(obs)

        # Physical limits
        ev_kw = np.zeros(n_c)
        for i, req in enumerate(act.ev_kw):
            if ev_on[i] and req < 0 and ev_dis[i] > 0:  # a car gives energy back (bidirectional charger)
                ev_kw[i] = -min(-req, float(ev_dis[i]))
            elif ev_on[i]:
                need_kw = float(ev_rem[i] / chargers[i].efficiency / dth)
                want = min(max(req, 0.0), float(ev_max[i]), need_kw)
                # Below the minimum current the charger pauses, unless the car only needs a top-up.
                ev_kw[i] = want if want >= ev_min[i] - EPS or want >= need_kw - EPS else 0.0
        # Heat pumps: at least enough to meet demand with what is in the tank, at most until the tank is full.
        hp_kw = np.zeros(n_hp)
        for j in range(n_hp):
            q, cop = float(hp_heat[j][t]), float(hp_cop[j][t])
            req = act.hp_kw[j] if j < len(act.hp_kw) else float(hp_need[j][t])
            p_need = max(0.0, (q * dth - hp_buf[j]) / (cop * dth))
            p_fill = max(0.0, (hp_cap[j] - hp_buf[j] + q * dth) / (cop * dth))
            hi = min(float(hp_pmax[j]), p_fill)
            hp_kw[j] = hi if p_need > hi else min(max(req, p_need), hi)
        total_b = float(np.clip(act.battery_kw, -max_dis.sum(), max_ch.sum())) if bats else 0.0
        b_kw = np.array(_split(total_b, list(max_ch if total_b > 0 else max_dis))) if bats else np.zeros(0)
        pv_out = float(pv_tot[t])

        # Grid-operator dimming (§14a, BK6-22-300 Anlage 1 section 4.5): limit controllable devices.
        if dim_mask[t]:
            before = float(np.clip(ev_kw, 0, None).sum() + hp_kw.sum() + np.clip(b_kw, 0, None).sum())
            if dim == "direct":
                for i in range(n_c):
                    if dim_ev[i] and ev_kw[i] > DIM_MIN_KW:
                        ev_kw[i] = DIM_MIN_KW
                for j in range(n_hp):
                    if dim_hp[j]:
                        cap_j = DIM_LARGE_FACTOR * hp_pmax[j] if hp_pmax[j] > DIM_LARGE_KW else DIM_MIN_KW
                        hp_kw[j] = min(hp_kw[j], cap_j)
                for kb in range(len(bats)):
                    if dim_bat[kb] and b_kw[kb] > DIM_MIN_KW:
                        b_kw[kb] = DIM_MIN_KW
            else:  # "ems": one allowance for all controllable devices together
                # The EMS hands it out by priority: heat first (comfort), then cars, then battery charging.
                # Each device gets what it asked for from what is left; a charger that cannot get its
                # minimum current pauses and leaves its share to the next one.
                left = ems_cap
                for j in range(n_hp):
                    if dim_hp[j]:
                        hp_kw[j] = min(hp_kw[j], left)
                        left -= hp_kw[j]
                for i in range(n_c):
                    if dim_ev[i] and ev_kw[i] > 0:
                        ev_kw[i] = min(ev_kw[i], left)
                        if ev_kw[i] < ev_min[i] - EPS:
                            ev_kw[i] = 0.0
                        left -= ev_kw[i]
                for kb in range(len(bats)):
                    if dim_bat[kb] and b_kw[kb] > 0:
                        b_kw[kb] = min(b_kw[kb], max(left, 0.0))
                        left -= b_kw[kb]
            for i in range(n_c):  # a charger squeezed below its minimum current pauses (IEC 61851-1)
                if 0 < ev_kw[i] < ev_min[i] - EPS:
                    ev_kw[i] = 0.0
            after = float(np.clip(ev_kw, 0, None).sum() + hp_kw.sum() + np.clip(b_kw, 0, None).sum())
            rec_dimmed[t] = max(before - after, 0.0)
        base_load = float(load_tot[t] + hp_kw.sum())  # heat pumps are not curtailed by the safety layer

        # Safety layer 1: site import limit
        net = base_load - pv_out + b_kw.sum() + ev_kw.sum()
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
            ev_sum = float(np.clip(ev_kw, 0, None).sum())  # slow charging EVs proportionally
            if ev_sum > EPS and excess > EPS:
                r = min(excess, ev_sum)
                ev_kw = np.where(ev_kw > 0, ev_kw * (ev_sum - r) / ev_sum, ev_kw)
                excess -= r
            for i in range(n_c):  # a charger squeezed below its minimum current pauses (IEC 61851-1)
                if 0 < ev_kw[i] < ev_min[i] - EPS:
                    ev_kw[i] = 0.0
            rec_overload[t] = max(excess, 0.0)

        # Safety layer 2: per-phase fuse (import side), by slowing EVs on the overloaded phase
        if fuse is not None:
            fuse_kw = fuse * PHASE_VOLTAGE / 1000
            for _ in range(3):
                base = base_load - pv_out + b_kw.sum()
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
            base = base_load - pv_out + b_kw.sum()
            over = float(phase_kw(base, ev_kw).max()) - fuse_kw
            rec_fuse_over[t] = over if over > 1e-6 else 0.0

        # Safety layer 3: export limit
        net = base_load - pv_out + b_kw.sum() + ev_kw.sum()
        if exp_lim is not None and -net > exp_lim + EPS:
            surplus = -net - exp_lim
            for i in range(n_c):  # stop cars giving energy back first
                if ev_kw[i] < 0 and surplus > EPS:
                    r = min(surplus, -ev_kw[i])
                    ev_kw[i] += r
                    surplus -= r
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
        for j in range(n_hp):
            hp_buf[j] += (hp_cop[j][t] * hp_kw[j] - hp_heat[j][t]) * dth
            if hp_buf[j] < 0:  # demand not met (heat pump too small, or limited by dimming)
                hp_unmet[j] += -hp_buf[j]
                hp_buf[j] = 0.0
            hp_buf[j] = min(hp_buf[j], hp_cap[j])
        for i in range(n_c):
            if not ev_on[i]:
                continue
            sess = ev_sess[i]
            assert sess is not None
            if ev_kw[i] >= 0:
                got = ev_kw[i] * dth * chargers[i].efficiency
                ev_rem[i] = max(ev_rem[i] - got, 0.0)
                ev_delivered += got
            else:  # the car gave energy back: it now needs that much more (losses on the way out)
                lent = -ev_kw[i] * dth / chargers[i].efficiency
                ev_rem[i] += lent
                ev_lent[i] += lent
                ev_discharged += lent
                sess["discharged_kwh"] += lent
                got = -lent
            rec_ev_on[i, t] = 1.0
            rec_ev_rem[i, t] = ev_rem[i]
            sess["delivered_kwh"] += got
            if t + 1 >= ev_dep[i]:
                sess["delivered_kwh"] = round(sess["delivered_kwh"], 3)
                sess["discharged_kwh"] = round(sess["discharged_kwh"], 3)
                sess["unmet_kwh"] = round(max(sess["requested_kwh"] - sess["delivered_kwh"], 0.0), 3)
                sessions_out.append(sess)
                ev_on[i], ev_rem[i], ev_sess[i] = False, 0.0, None

        rec_bat[:, t] = b_kw
        rec_soc[:, t] = energy / np.where(cap > 0, cap, 1)
        rec_ev[:, t] = ev_kw
        rec_hp[:, t] = hp_kw
        rec_hp_buf[:, t] = hp_buf
        net = base_load - pv_out + b_kw.sum() + ev_kw.sum()
        rec_grid[t] = net
        bm = int(bill_month[t])
        month_peak[bm] = max(month_peak.get(bm, 0.0), net)
        if demand_rate[t] > 0:
            key = (bm, float(demand_rate[t]))
            tou_peak[key] = max(tou_peak.get(key, 0.0), net)
        rec_phase[:, t] = phase_kw(net - ev_kw.sum(), ev_kw) * 1000 / PHASE_VOLTAGE

    for i in range(n_c):  # sessions still plugged in at the end
        sess = ev_sess[i]
        if sess is not None:
            sess["delivered_kwh"] = round(sess["delivered_kwh"], 3)
            sess["discharged_kwh"] = round(sess["discharged_kwh"], 3)
            sess["unmet_kwh"] = None  # unknown: the car leaves after the period
            sessions_out.append(sess)

    # Billing and KPIs
    month = np.array([(start + dt.timedelta(seconds=step_s * i)).month for i in range(0, T)])
    trace = EpisodeTrace(
        step_hours=dth, net_grid_kwh=rec_grid[None, :] * dth, price_per_kwh=price.astype(float),
        month=month, battery_terminal_kwh=rec_bat * dth, battery_capacity_kwh=cap,
        export_price_per_kwh=export_ext[:T],
    )
    k = compute_kpis(trace).as_dict()
    import_kw = np.clip(rec_grid, 0, None)
    monthly_peaks = [float(import_kw[bill_month == m].max()) for m in np.unique(bill_month)]
    demand_flat = site.tariff.demand_charge_per_kw_month * sum(monthly_peaks)
    demand_tou = 0.0
    if site.tariff.demand_charge_profile:
        demand_tou = tou_demand_cost(import_kw, demand_rate, bill_month)
    demand_cost = demand_flat + demand_tou
    pv_used = float((pv_tot.sum() - rec_curtail.sum()) * dth)
    pv_exported = min(float(np.clip(-rec_grid, 0, None).sum() * dth), pv_used)
    consumption = float((load_tot.sum() + np.clip(rec_ev, 0, None).sum() + rec_hp.sum()) * dth)
    hp_elec = float(rec_hp.sum() * dth)
    hp_heat_needed = float(sum(q.sum() for q in hp_heat) * dth)
    hp_heat_delivered = hp_heat_needed - float(hp_unmet.sum())
    done = [s for s in sessions_out if s.get("unmet_kwh") is not None]
    k.update(
        demand_charge_cost=demand_cost,
        demand_charge_peak_window_cost=demand_tou,
        peak_import_kw=float(import_kw.max()) if T else 0.0,
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
        ev_discharged_kwh=ev_discharged,
        hp_electric_kwh=hp_elec,
        hp_heat_kwh=hp_heat_delivered,
        hp_unmet_heat_kwh=float(hp_unmet.sum()),
        hp_scop=hp_heat_delivered / hp_elec if hp_elec > EPS else 0.0,
        dimmed_kwh=float(rec_dimmed.sum() * dth),
    )
    k.update(_battery_wear(bats, cap, energy_start, rec_soc, step_s, T * dth / 8760, wear_cost_per_kwh))
    k["total_cost_with_wear"] = k["total_cost"] + k["battery_wear_cost"]
    if rec_overload.sum() > 0.01:
        warnings.append(f"Import limit exceeded in {(rec_overload > 0.01).sum()} time steps even after "
                        "using the battery and slowing EV charging.")
    if rec_fuse_over.sum() > 0.01:
        warnings.append(f"A phase exceeded the {fuse} A fuse in {(rec_fuse_over > 0.01).sum()} time steps "
                        "even after slowing EV charging (the base load alone is too high).")
    if skipped:
        warnings.append(f"{skipped} EV visit(s) skipped because the charger was still occupied.")
    if hp_unmet.sum() > 0.5:
        warnings.append(f"Heat pumps left {hp_unmet.sum():,.0f} kWh of heat demand unmet (too small, or limited by "
                        "grid-operator dimming).")
    if any(s["resampling"].startswith("repeated") for s in sources):
        warnings.append("Some data is coarser than the time step and was repeated, not measured, at this "
                        "resolution. See Data sources.")

    site_series = {
        "load_kw": load_tot, "pv_kw": pv_tot - rec_curtail, "pv_curtailed_kw": rec_curtail,
        "battery_kw": rec_bat.sum(axis=0), "ev_kw": rec_ev.sum(axis=0), "hp_kw": rec_hp.sum(axis=0),
        "grid_kw": rec_grid, "dimmed_kw": rec_dimmed,
        "price": price.astype(float),
        "soc": (rec_soc * cap[:, None]).sum(axis=0) / cap.sum() if cap.sum() > 0 else np.zeros(T),
        "phase_l1_a": rec_phase[0], "phase_l2_a": rec_phase[1], "phase_l3_a": rec_phase[2],
    }
    assets: dict[str, dict[str, FloatArray]] = {}
    for bld in buildings:
        assets[bld.id] = {"power_kw": load[bld.id]}
    for dcn in centers:
        assets[dcn.id] = {"power_kw": load[dcn.id], "it_kw": it_kw[dcn.id], "cooling_kw": load[dcn.id] - it_kw[dcn.id]}
    curtail_share = np.divide(rec_curtail, pv_tot, out=np.zeros(T), where=pv_tot > EPS)
    for p in pvs:
        assets[p.id] = {"power_kw": -pv_avail[p.id] * (1 - curtail_share)}
    for i, bat in enumerate(bats):
        assets[bat.id] = {"power_kw": rec_bat[i], "soc": rec_soc[i]}
    for i, c in enumerate(chargers):
        assets[c.id] = {"power_kw": rec_ev[i], "connected": rec_ev_on[i], "remaining_kwh": rec_ev_rem[i]}
    for j, h in enumerate(hps):
        assets[h.id] = {"power_kw": rec_hp[j], "heat_kw": hp_heat[j], "cop": hp_cop[j],
                        "buffer": rec_hp_buf[j] / hp_cap[j] if hp_cap[j] > 0 else np.zeros(T)}

    return SimResult(start, site.step_minutes, month, site_series, assets, k, sessions_out, sources,
                     price_profile.currency, warnings)


HISTORY_DAYS = 8  # days of data before the run handed to realistic forecasts (scenario MPC replays up to 7)


def _realistic_forecast(site: Site, lib: ProfileLibrary, actual: dict[str, FloatArray],
                        used: dict[tuple[str, str], tuple[Profile, dt.datetime]], start: dt.datetime, T: int,
                        step_s: int, pvs: list[SolarPV], warnings: list[str]) -> RealisticForecast:
    """Forecasts from what a real controller knows (see emsbench.sim.forecasts)."""
    day = int(round(86400 / step_s))
    hist = HISTORY_DAYS * day  # the days before the run: yesterday for persistence, more for scenarios

    def before(asset_id: str, kind: str) -> FloatArray | None:
        p, src = used[(asset_id, kind)]
        vals = p.before(src, hist, step_s)
        if vals is None:  # less history than that: repeat the last day before the run, if there is one
            last = p.before(src, day, step_s)
            vals = None if last is None else np.tile(last, HISTORY_DAYS)
        return vals

    # The day before the run, for "repeat the most recent day". Missing data: use the run's first day.
    parts: list[FloatArray | None] = []
    for a in site.assets:
        if isinstance(a, Building):
            b = before(a.id, "load")
            parts.append(None if b is None else b * a.scale)
        elif isinstance(a, DataCenter):
            b = before(a.id, "load")
            parts.append(None if b is None else b * a.it_scale * a.pue)
        elif isinstance(a, HeatPump):
            q, c = before(a.id, "heat"), before(a.id, "cop")
            parts.append(None if q is None or c is None else q * a.annual_heat_kwh / np.maximum(c, 1.0))
    first_day = np.resize(actual["load"][:day], hist)
    if any(x is None for x in parts):
        load_before = first_day
        warnings.append("Realistic forecast: no load data before the start, so the first day's load forecast uses "
                        "that day's actual load.")
    else:
        load_before = np.sum([x for x in parts if x is not None], axis=0) if parts else np.zeros(hist)

    pv_parts = [before(p.id, "pv") for p in pvs]
    if any(x is None for x in pv_parts):
        pv_before = np.resize(actual["pv"][:day], hist)
    else:
        pv_before = np.sum([x * p.capacity_kwp for x, p in zip(pv_parts, pvs, strict=True) if x is not None],
                           axis=0) if pvs else np.zeros(hist)

    # Solar: the archived day-ahead weather forecast through the same model, aligned with the actual data.
    pv_dayahead: FloatArray | None = np.zeros(T + 2 * day) if pvs else None
    for p in pvs:
        fc = lib.profiles.get(f"{p.profile}@dayahead")
        truth, src = used[(p.id, "pv")]
        vals: FloatArray | None = None
        if fc is not None and fc.kind == "pvforecast":
            for n in (T + 2 * day, T):
                try:
                    v, info = fc.window(start, n, step_s)
                except ValueError:
                    continue
                if info.source_start == src:
                    vals = np.concatenate([v, np.resize(v[-day:], T + 2 * day - n)]) if n < T + 2 * day else v
                break
        if vals is None or pv_dayahead is None:
            pv_dayahead = None
            warnings.append(f"Realistic forecast: no archived weather forecast for '{truth.label}', so its solar "
                            "forecast repeats the most recent day.")
            break
        pv_dayahead += vals * p.capacity_kwp

    published = next((h for prefix, h in DAY_AHEAD_PUBLISHED_HOUR.items()
                      if site.tariff.price_profile.startswith(prefix)), None)
    first_step = int(round((start.hour * 3600 + start.minute * 60) / step_s))
    return RealisticForecast(actual, load_before, pv_before, pv_dayahead, day, first_step,
                             None if published is None else int(round(published * 3600 / step_s)))


def _battery_wear(bats: list[Battery], cap: FloatArray, energy_start: FloatArray, rec_soc: FloatArray, step_s: int,
                  run_years: float, cost_per_kwh: list[float | None]) -> dict[str, float]:
    """Expected life and wear cost of the batteries (see emsbench.sim.wear). Life: the shortest of all batteries."""
    out = {"battery_life_years": 0.0, "battery_life_capped": 0.0, "battery_wear_cost": 0.0,
           "battery_wear_priced": 0.0, "battery_cycle_wear_share": 0.0}
    lives = []
    for i, b in enumerate(bats):
        if b.capacity_kwh <= 0:
            continue
        soc = np.concatenate([[energy_start[i] / cap[i]], rec_soc[i]])
        life = expected_life(soc, step_s, b.chemistry, b.temperature_c, b.end_of_life_capacity)
        lives.append(life)
        price = cost_per_kwh[i]
        if price is not None:
            out["battery_wear_cost"] += life.wear_cost(price * b.capacity_kwh, run_years)
            out["battery_wear_priced"] = 1.0
    if lives:
        shortest = min(lives, key=lambda x: x.years)
        out["battery_life_years"] = shortest.years
        out["battery_life_capped"] = 1.0 if shortest.years >= MAX_YEARS else 0.0
        out["battery_cycle_wear_share"] = shortest.cycle_share
    return out
