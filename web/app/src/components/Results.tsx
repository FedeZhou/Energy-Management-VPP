import { useEffect, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useStore } from "../store";
import { dayLabel, money, num, pct, stepLabel, timeAt } from "../util";
import { Charts } from "./Charts";
import { Sessions } from "./Sessions";

interface Card { label: string; value: string; delta?: string; good?: boolean | null; sub?: string }

function delta(cur: number, base: number, fmt: (v: number) => string, lowerIsGood: boolean): Pick<Card, "delta" | "good"> {
  const d = cur - base;
  if (Math.abs(d) < 1e-6 * Math.max(1, Math.abs(base))) return { delta: "same as baseline", good: null };
  const rel = base ? ` (${d > 0 ? "+" : "−"}${Math.abs((d / base) * 100).toFixed(1)}%)` : "";
  return { delta: `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}${rel}`, good: lowerIsGood ? d < 0 : d > 0 };
}

function Kpis() {
  const r = useStore((s) => s.result);
  const site = useStore((s) => s.site);
  if (!r) return null;
  const k = r.result.kpis;
  const b = r.baseline.kpis;
  const cur = r.result.currency;
  const m = (v: number) => money(v, cur);
  const has = (t: string) => site.assets.some((a) => a.type === t);
  const stepTxt = r.time.step_minutes >= 60 ? "hourly" : `${r.time.step_minutes}-min`;
  const cards: Card[] = [
    { label: "Total cost", value: m(k.total_cost), ...delta(k.total_cost, b.total_cost, m, true),
      sub: k.demand_charge_cost > 0 ? `incl. ${m(k.demand_charge_cost)} demand charges` : site.tariff.price_adder ? "energy, incl. price adder" : "energy only" },
    { label: `Peak grid import (${stepTxt})`, value: `${num(k.peak_import_kw, 1)} kW`, ...delta(k.peak_import_kw, b.peak_import_kw, (v) => `${num(v, 1)} kW`, true) },
  ];
  if (site.grid.fuse_a != null) {
    const over = k.fuse_overload_kwh > 0.01;
    cards.push({ label: "Highest phase current", value: `${num(k.max_phase_current_a, 1)} A`,
      ...delta(k.max_phase_current_a, b.max_phase_current_a, (v) => `${num(v, 1)} A`, true),
      sub: over ? `fuse ${site.grid.fuse_a} A exceeded` : `fuse ${site.grid.fuse_a} A respected` });
  }
  cards.push({ label: "Self-sufficiency", value: pct(k.self_sufficiency_share),
    ...delta(k.self_sufficiency_share, b.self_sufficiency_share, (v) => `${Math.round(v * 100)} pts`, false),
    sub: "share of demand not bought from the grid" });
  if (has("pv")) cards.push({ label: "Solar used on site", value: pct(k.self_consumption_share),
    ...delta(k.self_consumption_share, b.self_consumption_share, (v) => `${Math.round(v * 100)} pts`, false),
    sub: k.pv_curtailed_kwh > 0.5 ? `${num(k.pv_curtailed_kwh)} kWh curtailed` : `${num(k.grid_export_kwh)} kWh exported` });
  if (has("battery")) cards.push({ label: "Battery cycles", value: num(k.battery_equivalent_full_cycles, k.battery_equivalent_full_cycles < 10 ? 1 : 0),
    sub: `${num(k.battery_discharge_kwh)} kWh discharged · wear proxy` });
  if (has("ev_charger")) {
    const short = k.ev_unmet_kwh > 0.5;
    cards.push({ label: "EV energy delivered", value: `${num(k.ev_delivered_kwh)} kWh`,
      delta: short ? `${num(k.ev_unmet_kwh, 1)} kWh short` : "all targets met", good: !short,
      sub: short ? `${k.ev_sessions_unmet} of ${k.ev_sessions} finished visits left short` : `${k.ev_sessions} finished visits` });
  }
  if (site.grid.import_limit_kw != null) {
    const over = k.grid_overload_kwh > 0.01;
    cards.push({ label: "Import limit", value: over ? `${num(k.grid_overload_kwh)} kWh over` : "Respected",
      delta: !over && b.grid_overload_kwh > 0.01 ? `baseline: ${num(b.grid_overload_kwh)} kWh over` : undefined,
      good: !over, sub: `limit ${site.grid.import_limit_kw} kW` });
  }
  return (
    <div className="kpis">
      {cards.map((c) => (
        <div className="kpi" key={c.label}>
          <span className="kpi-label">{c.label}</span>
          <span className="kpi-value">{c.value}</span>
          {c.delta && <span className={`kpi-delta ${c.good === true ? "good" : c.good === false ? "bad" : ""}`}>{c.delta}</span>}
          {c.sub && <span className="kpi-sub">{c.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function Timeline() {
  const r = useStore((s) => s.result);
  const cursor = useStore((s) => s.cursor);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const { setCursor, setPlaying, setSpeed } = useStore.getState();
  const pos = useRef(cursor);

  useEffect(() => {
    if (!playing) return;
    pos.current = useStore.getState().cursor;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const st = useStore.getState();
      const res = st.result;
      if (!res) return;
      const T = res.time.steps;
      pos.current += ((now - last) / 1000) * st.speed * (60 / res.time.step_minutes); // speed = hours per second
      last = now;
      if (pos.current >= T - 1) { setCursor(T - 1); setPlaying(false); return; }
      if (Math.floor(pos.current) !== st.cursor) setCursor(Math.floor(pos.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setCursor, setPlaying]);

  if (!r) return null;
  const { start, step_minutes: step, steps: T } = r.time;
  const perDay = 1440 / step;
  return (
    <div className="timeline">
      <button className="icon-btn" onClick={() => setCursor(cursor - perDay)} aria-label="Back one day"><SkipBack size={16} /></button>
      <button className="btn primary small-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "Pause" : "Play"}
      </button>
      <button className="icon-btn" onClick={() => setCursor(cursor + perDay)} aria-label="Forward one day"><SkipForward size={16} /></button>
      <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
        <option value={0.5}>30 min/s</option>
        <option value={1}>1 h/s</option>
        <option value={4}>4 h/s</option>
        <option value={12}>12 h/s</option>
        <option value={48}>2 days/s</option>
      </select>
      <input type="range" min={0} max={T - 1} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} aria-label="Time" />
      <span className="time-label">{stepLabel(start, step, cursor)}</span>
    </div>
  );
}

function Sources() {
  const r = useStore((s) => s.result);
  const site = useStore((s) => s.site);
  if (!r) return null;
  const name = (id: string) => (id === "tariff" ? "Price" : site.assets.find((a) => a.id === id)?.name || id);
  const start = timeAt(r.time.start, r.time.step_minutes, 0);
  return (
    <details className="sources">
      <summary>Data sources for this run ({r.result.sources.length})</summary>
      <table>
        <thead><tr><th>Used for</th><th>Data</th><th>Real dates used</th><th>Resolution</th></tr></thead>
        <tbody>
          {r.result.sources.map((s) => {
            const used = new Date(`${s.source_start.slice(0, 19)}Z`);
            const same = used.toISOString().slice(0, 10) === start.toISOString().slice(0, 10);
            return (
              <tr key={`${s.asset}-${s.profile}`}>
                <td>{name(s.asset)}</td>
                <td>{s.label}</td>
                <td>{same ? "as simulated" : `from ${dayLabel(used)} ${used.getUTCFullYear()} (same season and weekday)`}</td>
                <td className={s.resampling.startsWith("repeated") ? "warn-text" : ""}>{s.resampling}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

export function Results() {
  const r = useStore((s) => s.result);
  const stale = useStore((s) => s.stale);
  const error = useStore((s) => s.error);
  const collapsed = useStore((s) => s.collapsed);
  const setCollapsed = useStore((s) => s.setCollapsed);
  const mode = useStore((s) => s.site.mode);
  if (!r && !error) return null;
  return (
    <section className={`results ${collapsed ? "collapsed" : ""}`}>
      <div className="results-head">
        <h3>Results</h3>
        {r && <span className="small muted">vs baseline: same site, battery idle, EVs charge on arrival · simulated in {r.runtime_s}s</span>}
        {stale && <span className="pill warn">Site changed since this run. Press Run again.</span>}
        {r?.result.warnings.map((w) => <span key={w} className="pill bad"><AlertTriangle size={13} /> {w}</span>)}
        {error && <span className="pill bad"><AlertTriangle size={13} /> {error}</span>}
        <button className="icon-btn push" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand results" : "Collapse results"}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {r && !collapsed && (
        <>
          <Kpis />
          <Timeline />
          <Charts />
          {(mode === "operate" || r.time.steps * r.time.step_minutes <= 14 * 1440) && <Sessions />}
          <Sources />
        </>
      )}
    </section>
  );
}
