"""Deterministic model predictive control (MPC): a rolling-horizon linear program.

At each re-plan the controller solves one LP over the next `horizon` hours and follows the first
part of the plan until the next re-plan (every `replan` minutes, and immediately when a car
arrives). The formulation follows the LP used by EMHASS (power balance per step, battery
state-of-charge dynamics with separate charge and discharge efficiencies; see
https://emhass.readthedocs.io/en/latest/advanced_math_model.html), extended with what Site Lab needs:

- energy left in the battery at the end of the horizon is worth the cheapest import price in the
  horizon times the discharge efficiency (EMHASS instead requires ending at the starting energy).
  This makes free solar worth storing even when export pays nothing and the controller cannot yet
  see the car that will arrive tonight, but never makes buying from the grid just to fill up pay
  (charging costs price / efficiency, more than the price x efficiency it is valued at);

- EV charging for every plugged-in car and every car the forecast expects inside the horizon, with
  the energy each needs by departure (soft, with a large penalty for shortfall);
- the site import limit and per-phase fuse (soft, very large penalty), export limit with solar
  curtailment;
- demand charges: flat monthly (on top of this month's peak so far) and time-of-use windows;
- a tiny per-kWh battery throughput cost that breaks ties (no wear model yet).

A charger is either off or at least at its minimum current (IEC 61851: 6 A). Without that rule a plan
for a trickle of spare solar would be rounded up to the minimum and the grid would pay the difference.
Modelled exactly it needs an on/off variable per car per step (a mixed-integer LP, slow); by default
we use relax-and-fix instead: solve the LP; if a car has steps planned between 0 and the minimum,
re-solve twice, once with those steps off and once with the largest forced up to the minimum (others
off), keep the cheaper plan, and repeat until no plan sits in between.

Limitations, stated: billing months that change inside the horizon are
treated as one month. Forecasts are perfect for now, including the car visits ahead
(`PerfectForecast`); the forecast-error harness will supply imperfect ones through the same interface.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import Bounds, LinearConstraint, linprog, milp
from scipy.sparse import coo_matrix

from emsbench.sim.controllers import Action, Observation
from emsbench.sim.forecasts import Forecast, FutureSession, PerfectForecast
from emsbench.sim.model import ControllerSpec

__all__ = ["Forecast", "FutureSession", "MPCController", "PerfectForecast", "SiteLimits"]

FloatArray = NDArray[np.float64]
INF = np.inf
TIE_BREAK_PER_KWH = 1e-4  # tiny battery throughput cost: avoids pointless cycling when costs tie
RELAX_AND_FIX_ROUNDS = 5  # re-solves allowed to push EV plans out of the band between 0 and the minimum
MILP_GAP = 1e-4  # exact mode: stop when the plan is provably within 0.01% of the best possible plan
MILP_TIME_LIMIT_S = 10.0  # exact mode, per solve; the best plan found so far is used if it runs out


@dataclass(frozen=True)
class SiteLimits:
    """Static facts about the site that the controller needs."""

    step_hours: float
    battery_capacity_kwh: float
    battery_min_kwh: float
    battery_max_kwh: float
    battery_power_kw: float
    battery_eta: float  # one-way efficiency
    import_limit_kw: float | None
    export_limit_kw: float | None
    fuse_kw: float | None  # per phase
    export_price: float
    demand_rate_flat: float  # per kW per month
    charger_efficiency: tuple[float, ...]
    battery_wear_per_kwh: float = 0.0  # wear price per kWh discharged (half charged on the way in, half out)


@dataclass
class _LP:
    """Minimal LP builder for scipy (HiGHS), with optional "off or at least `lo`" variables."""

    c: list[float] = field(default_factory=list)
    lb: list[float] = field(default_factory=list)
    ub: list[float] = field(default_factory=list)
    ub_rows: list[tuple[dict[int, float], float]] = field(default_factory=list)
    eq_rows: list[tuple[dict[int, float], float]] = field(default_factory=list)
    semi: list[tuple[int, float, int]] = field(default_factory=list)  # (variable, minimum when on, group)

    def var(self, n: int, lb: float | FloatArray = 0.0, ub: float | FloatArray = INF,
            cost: float | FloatArray = 0.0) -> NDArray[np.int_]:
        start = len(self.c)
        self.c.extend(np.broadcast_to(np.asarray(cost, dtype=float), (n,)).tolist())
        self.lb.extend(np.broadcast_to(np.asarray(lb, dtype=float), (n,)).tolist())
        self.ub.extend(np.broadcast_to(np.asarray(ub, dtype=float), (n,)).tolist())
        return np.arange(start, start + n)

    def off_or_at_least(self, idx: NDArray[np.int_], lo: float) -> None:
        """Each variable in `idx` (one group, e.g. one car) is either 0 or between `lo` and its upper bound."""
        if lo > 1e-9:
            group = len({g for _, _, g in self.semi})
            self.semi.extend((int(j), lo, group) for j in idx)

    def le(self, terms: dict[int, float], rhs: float) -> None:
        self.ub_rows.append((terms, rhs))

    def eq(self, terms: dict[int, float], rhs: float) -> None:
        self.eq_rows.append((terms, rhs))

    @staticmethod
    def _matrix(rows: list[tuple[dict[int, float], float]], n: int) -> tuple[coo_matrix | None, FloatArray | None]:
        if not rows:
            return None, None
        r, c, v = [], [], []
        for i, (terms, _) in enumerate(rows):
            for j, val in terms.items():
                r.append(i)
                c.append(j)
                v.append(val)
        return coo_matrix((v, (r, c)), shape=(len(rows), n)), np.array([b for _, b in rows], dtype=float)

    def _linprog(self, lb: FloatArray, ub: FloatArray) -> tuple[FloatArray, float]:
        n = len(self.c)
        a_ub, b_ub = self._matrix(self.ub_rows, n)
        a_eq, b_eq = self._matrix(self.eq_rows, n)
        res = linprog(np.array(self.c), A_ub=a_ub, b_ub=b_ub, A_eq=a_eq, b_eq=b_eq,
                      bounds=np.column_stack([lb, ub]), method="highs")
        if res.status != 0:
            raise RuntimeError(f"MPC linear program failed: {res.message}")
        return np.asarray(res.x, dtype=float), float(res.fun)

    def solve(self, exact: bool = False) -> FloatArray:
        """Solve. "Off or at least" variables are handled by relax-and-fix (default) or exactly (MILP)."""
        if exact and self.semi:
            return self._milp()
        lb, ub = np.array(self.lb), np.array(self.ub)
        x, _ = self._linprog(lb, ub)
        for _ in range(RELAX_AND_FIX_ROUNDS):
            bad: dict[int, list[tuple[int, float]]] = {}  # per group, steps inside the band (0, lo)
            for j, lo, g in self.semi:
                if 1e-6 < x[j] < lo - 1e-6:
                    bad.setdefault(g, []).append((j, lo))
            if not bad:
                break
            # Two repairs, keep the cheaper: (a) all those steps off; (b) per group, the largest forced on
            # (the LP then takes the extra energy from other steps, e.g. 11 + 11 + 0.7 kW becomes
            # 11 + 7.6 + 4.1) and the rest off. Trying both matters because the LP is often indifferent
            # between a trickle now and full power later, and (b) alone would lock in the trickle.
            lb_a, ub_a, lb_b, ub_b = lb.copy(), ub.copy(), lb.copy(), ub.copy()
            for steps in bad.values():
                keep = max(steps, key=lambda jl: x[jl[0]])
                for j, lo in steps:
                    ub_a[j] = 0.0
                    if (j, lo) == keep and ub[j] >= lo:
                        lb_b[j] = lo
                    else:
                        ub_b[j] = 0.0
            x_a, f_a = self._linprog(lb_a, ub_a)
            x_b, f_b = self._linprog(lb_b, ub_b)
            x, lb, ub = (x_a, lb_a, ub_a) if f_a <= f_b else (x_b, lb_b, ub_b)
        return x

    def _milp(self) -> FloatArray:
        """Exact version: one binary on/off variable per "off or at least" variable."""
        n0 = len(self.c)
        n = n0 + len(self.semi)
        c = np.concatenate([self.c, np.zeros(len(self.semi))])
        lb = np.concatenate([self.lb, np.zeros(len(self.semi))])
        ub = np.concatenate([self.ub, np.ones(len(self.semi))])
        rows = list(self.ub_rows)
        for m, (j, lo, _) in enumerate(self.semi):
            u = n0 + m
            rows.append(({j: 1.0, u: -float(self.ub[j])}, 0.0))  # off -> 0
            rows.append(({j: -1.0, u: lo}, 0.0))  # on -> at least lo
        a_ub, b_ub = self._matrix(rows, n)
        a_eq, b_eq = self._matrix(self.eq_rows, n)
        cons = []
        if a_ub is not None and b_ub is not None:
            cons.append(LinearConstraint(a_ub.tocsr(), -INF, b_ub))
        if a_eq is not None and b_eq is not None:
            cons.append(LinearConstraint(a_eq.tocsr(), b_eq, b_eq))
        integrality = np.zeros(n)
        integrality[n0:] = 1
        m = milp(c, constraints=cons, integrality=integrality, bounds=Bounds(lb, ub),
                 options={"time_limit": MILP_TIME_LIMIT_S, "mip_rel_gap": MILP_GAP})
        if m.x is None:  # no feasible point found (should not happen: every limit is soft)
            raise RuntimeError(f"MPC mixed-integer program failed: {m.message}")
        return np.asarray(m.x[:n0], dtype=float)


@dataclass
class Plan:
    t0: int
    battery_kw: FloatArray
    ev_kw: FloatArray  # (n_chargers, H)
    net_kw: FloatArray  # forecast load - solar the plan was made for


class MPCController:
    """Rolling-horizon LP controller for the battery and all EV chargers together."""

    def __init__(self, spec: ControllerSpec, limits: SiteLimits, forecast: Forecast) -> None:
        self.spec = spec
        self.lim = limits
        self.forecast = forecast
        self.horizon = max(1, int(round(spec.mpc_horizon_hours / limits.step_hours)))
        self.replan_every = max(1, int(round(spec.mpc_replan_minutes / 60 / limits.step_hours)))
        self.plan: Plan | None = None
        self.connected: tuple[bool, ...] = ()
        self.solves = 0
        self.exact = False  # True: exact on/off (mixed-integer, slow); False: relax-and-fix (fast)

    def act(self, obs: Observation) -> Action:
        connected = tuple(e.connected for e in obs.evs)
        arrived = any(c and not p for c, p in zip(connected, self.connected or (False,) * len(connected), strict=True))
        self.connected = connected
        stale = self.plan is None or obs.t - self.plan.t0 >= self.replan_every or obs.t - self.plan.t0 >= self.horizon
        if stale or arrived:
            self.plan = self.solve(obs)
        assert self.plan is not None
        k = obs.t - self.plan.t0
        ev_kw = []
        for i in range(len(obs.evs)):
            p = float(self.plan.ev_kw[i, k])
            ev_kw.append(p if p > 1e-6 else 0.0)
        # The battery takes up the forecast error of this step, so the grid exchange stays as planned
        # (zero with a perfect forecast). The next re-plan starts from the battery's real state.
        actual_net = obs.load_kw + sum(h.heat_kw / max(h.cop, 1.0) for h in obs.heat_pumps) - obs.pv_kw
        error = actual_net - float(self.plan.net_kw[k])
        return Action(battery_kw=float(self.plan.battery_kw[k]) - error, ev_kw=tuple(ev_kw))

    def solve(self, obs: Observation) -> Plan:
        lim, H, dt = self.lim, self.horizon, self.lim.step_hours
        load = self.forecast.window("load", obs.t, H)
        pv = self.forecast.window("pv", obs.t, H)
        price = self.forecast.window("price", obs.t, H)
        rate = self.forecast.window("demand_rate", obs.t, H)
        net0 = load - pv
        lp = _LP()
        big = 10.0 * max(1.0, float(np.abs(price).max()), lim.demand_rate_flat)  # per kWh of missed EV energy
        huge = 100.0 * big  # per kWh over a limit

        imp = lp.var(H, cost=price * dt)
        exp = lp.var(H, ub=lim.export_limit_kw if lim.export_limit_kw is not None else INF, cost=-lim.export_price * dt)
        # Curtailment only exists with an export limit; battery variables are fixed at 0 without a battery.
        cur = lp.var(H, ub=np.maximum(pv, 0.0) if lim.export_limit_kw is not None else 0.0)
        has_bat = lim.battery_capacity_kwh > 0 and lim.battery_power_kw > 0
        p_bat = lim.battery_power_kw if has_bat else 0.0
        # Cycling costs battery life: half the wear price per kWh charged, half per kWh discharged (one equivalent
        # full cycle = one capacity in and out). The tie-break avoids pointless cycling when wear is not priced.
        cycle_cost = max(lim.battery_wear_per_kwh / 2, TIE_BREAK_PER_KWH)
        ch = lp.var(H, ub=p_bat, cost=cycle_cost * dt)
        dis = lp.var(H, ub=p_bat, cost=cycle_cost * dt)
        if has_bat:
            e0 = float(np.clip(obs.battery_energy_kwh, lim.battery_min_kwh, lim.battery_max_kwh))
            energy = lp.var(H + 1, lb=lim.battery_min_kwh, ub=lim.battery_max_kwh)
            lp.eq({int(energy[0]): 1.0}, e0)
            for k in range(H):
                lp.eq({int(energy[k + 1]): 1.0, int(energy[k]): -1.0, int(ch[k]): -lim.battery_eta * dt,
                       int(dis[k]): dt / lim.battery_eta}, 0.0)
            # value of energy left at the end (see module docstring); 0 when the cheapest price is negative
            leftover_value = lim.battery_eta * max(0.0, float(price.min()), lim.export_price)
            lp.c[int(energy[H])] -= leftover_value

        # EV blocks: the plugged-in car and the cars expected to arrive inside the horizon, each with
        # power variables from arrival to departure (or the horizon end).
        blocks: list[tuple[int, int, str, NDArray[np.int_]]] = []  # (charger, first step, phase, variables)
        for i, ev in enumerate(obs.evs):
            eff = lim.charger_efficiency[i]
            visits: list[tuple[int, int, float, float, float, str]] = []  # (offset, steps left, kWh, max, min, phase)
            if ev.connected and ev.remaining_kwh > 1e-9:
                visits.append((0, ev.steps_left, ev.remaining_kwh, ev.max_kw, ev.min_kw, ev.phase))
            for fs in self.forecast.sessions(i, obs.t, H):
                visits.append((fs.arrive - obs.t, fs.depart - fs.arrive, fs.energy_kwh, fs.max_kw, fs.min_kw, fs.phase))
            for k0, steps_left, kwh, max_kw, min_kw, phase in visits:
                n = max(0, min(steps_left, H - k0))
                if n == 0:
                    continue
                car_vars = lp.var(n, ub=max_kw)
                blocks.append((i, k0, phase, car_vars))
                # Off, or at least the minimum power (less only for the final top-up, as the engine allows).
                lo = min(min_kw, kwh / eff / dt)
                lp.off_or_at_least(car_vars, lo)
                # energy that cannot wait until after the horizon must be delivered inside it
                need = max(0.0, kwh - (steps_left - n) * max_kw * eff * dt)
                if need > 0:
                    short = lp.var(1, cost=big)
                    terms: dict[int, float] = {int(j): -eff * dt for j in car_vars}
                    terms[int(short[0])] = -1.0
                    lp.le(terms, -need)

        # Power balance: imp - exp - ch + dis - sum(ev) - cur = load - pv
        ev_at: list[list[tuple[int, int]]] = [[] for _ in range(H)]  # per step: (variable, block index)
        for b, (_, k0, _, car_vars) in enumerate(blocks):
            for m, j in enumerate(car_vars):
                ev_at[k0 + m].append((int(j), b))
        for k in range(H):
            bal: dict[int, float] = {int(imp[k]): 1.0, int(exp[k]): -1.0, int(ch[k]): -1.0, int(dis[k]): 1.0,
                                     int(cur[k]): -1.0}
            for j, _ in ev_at[k]:
                bal[j] = -1.0
            lp.eq(bal, float(net0[k]))

        if lim.import_limit_kw is not None:
            over = lp.var(H, cost=huge * dt)
            for k in range(H):
                lp.le({int(imp[k]): 1.0, int(over[k]): -1.0}, lim.import_limit_kw)

        if lim.fuse_kw is not None:
            for name in ("L1", "L2", "L3"):
                slack = lp.var(H, cost=huge * dt)
                for k in range(H):
                    row = {int(slack[k]): -1.0, int(ch[k]): 1 / 3, int(dis[k]): -1 / 3, int(cur[k]): 1 / 3}
                    for j, b in ev_at[k]:
                        ph = blocks[b][2]
                        if ph == "3":
                            row[j] = 1 / 3
                        elif ph == name:
                            row[j] = 1.0
                    lp.le(row, lim.fuse_kw - float(net0[k]) / 3)

        if lim.demand_rate_flat > 0:
            peak = lp.var(1, lb=max(0.0, obs.month_peak_kw), cost=lim.demand_rate_flat)
            for k in range(H):
                lp.le({int(imp[k]): 1.0, int(peak[0]): -1.0}, 0.0)
        tou_seen = dict(obs.tou_peaks)
        for r in np.unique(rate[rate > 0]):
            peak = lp.var(1, lb=max(0.0, tou_seen.get(float(r), 0.0)), cost=float(r))
            for k in np.flatnonzero(rate == r):
                lp.le({int(imp[k]): 1.0, int(peak[0]): -1.0}, 0.0)

        x = lp.solve(exact=self.exact)
        self.solves += 1
        bat = x[ch] - x[dis]
        ev_plan = np.zeros((len(obs.evs), H))
        for i, k0, _, car_vars in blocks:
            ev_plan[i, k0: k0 + car_vars.size] = x[car_vars]
        return Plan(obs.t, bat, ev_plan, net0)
