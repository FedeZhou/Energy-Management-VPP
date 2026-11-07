import { useEffect, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useStore } from "../store";
import { money, num, pct, stepLabel } from "../util";
import { Charts } from "./Charts";

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
  const hasEv = site.assets.some((a) => a.type === "ev_charger");
  const hasBat = site.assets.some((a) => a.type === "battery");
  const hasPv = site.assets.some((a) => a.type === "pv");
  const cards: Card[] = [
    { label: "Total cost", value: money(k.total_cost), ...delta(k.total_cost, b.total_cost, money, true),
      sub: k.demand_charge_cost > 0 ? `incl. ${money(k.demand_charge_cost)} demand charges` : "energy only" },
    { label: "Peak grid import", value: `${num(k.peak_import_kw, 1)} kW`, ...delta(k.peak_import_kw, b.peak_import_kw, (v) => `${num(v, 1)} kW`, true) },
    { label: "Self-sufficiency", value: pct(k.self_sufficiency_share), ...delta(k.self_sufficiency_share, b.self_sufficiency_share, (v) => `${Math.round(v * 100)} pts`, false),
      sub: "share of demand not bought from the grid" },
  ];
  if (hasPv) cards.push({ label: "Solar used on site", value: pct(k.self_consumption_share),
    ...delta(k.self_consumption_share, b.self_consumption_share, (v) => `${Math.round(v * 100)} pts`, false),
    sub: k.pv_curtailed_kwh > 0.5 ? `${num(k.pv_curtailed_kwh)} kWh curtailed` : `${num(k.grid_export_kwh)} kWh exported` });
  if (hasBat) cards.push({ label: "Battery cycles", value: num(k.battery_equivalent_full_cycles), sub: `${num(k.battery_discharge_kwh)} kWh discharged · wear proxy` });
  if (hasEv) cards.push({ label: "EV energy delivered", value: `${num(k.ev_delivered_kwh)} kWh`,
    sub: k.ev_unmet_kwh > 0.5 ? `${num(k.ev_unmet_kwh)} kWh short in ${k.ev_sessions_unmet} of ${k.ev_sessions} visits` : `all ${k.ev_sessions} visits fully charged`,
    good: k.ev_unmet_kwh > 0.5 ? false : null, delta: k.ev_unmet_kwh > 0.5 ? "targets missed" : undefined });
  if (site.grid.import_limit_kw != null) {
    const over = k.grid_overload_kwh > 0.01;
    cards.push({
      label: "Grid limit", value: over ? `${num(k.grid_overload_kwh)} kWh` : "Respected",
      delta: over ? "over the limit" : b.grid_overload_kwh > 0.01 ? `baseline: ${num(b.grid_overload_kwh)} kWh over` : undefined,
      good: !over, sub: `limit ${site.grid.import_limit_kw} kW`,
    });
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
      const T = st.result?.result.site.grid_kw.length ?? 0;
      pos.current += ((now - last) / 1000) * st.speed;
      last = now;
      if (pos.current >= T - 1) { setCursor(T - 1); setPlaying(false); return; }
      if (Math.floor(pos.current) !== st.cursor) setCursor(Math.floor(pos.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setCursor, setPlaying]);

  if (!r) return null;
  const T = r.result.site.grid_kw.length;
  const label = stepLabel(r.time.start_date, r.time.first_step + cursor, r.time.hour[cursor]);
  return (
    <div className="timeline">
      <button className="icon-btn" onClick={() => setCursor(cursor - 24)} aria-label="Back one day"><SkipBack size={16} /></button>
      <button className="btn primary small-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? "Pause" : "Play"}
      </button>
      <button className="icon-btn" onClick={() => setCursor(cursor + 24)} aria-label="Forward one day"><SkipForward size={16} /></button>
      <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
        <option value={1}>1 h/s</option>
        <option value={4}>4 h/s</option>
        <option value={12}>12 h/s</option>
        <option value={48}>2 days/s</option>
      </select>
      <input type="range" min={0} max={T - 1} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} aria-label="Time" />
      <span className="time-label">{label}</span>
    </div>
  );
}

export function Results() {
  const r = useStore((s) => s.result);
  const stale = useStore((s) => s.stale);
  const error = useStore((s) => s.error);
  const collapsed = useStore((s) => s.collapsed);
  const setCollapsed = useStore((s) => s.setCollapsed);
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
        </>
      )}
    </section>
  );
}
