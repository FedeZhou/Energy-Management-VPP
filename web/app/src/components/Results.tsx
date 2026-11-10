import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useStore } from "../store";
import { dayLabel, money, num, pct, stepLabel, timeAt } from "../util";
import { Charts } from "./Charts";
import { Help } from "./Help";
import { Sessions } from "./Sessions";

interface Card { label: string; value: string; delta?: string; good?: boolean | null; dir?: 1 | -1; detail?: string }

/** Change against the baseline as a signed value, e.g. "−€20.25 (−60%)". Shares in percentage points
 *  (relative = false) show only the point change, since a percentage of a percentage confuses. */
function delta(cur: number, base: number, fmt: (v: number) => string, lowerIsGood: boolean, relative = true): Pick<Card, "delta" | "good" | "dir"> {
  const d = cur - base;
  // A change that rounds to zero at the precision shown is "No change", not "-0 pts".
  if (Math.abs(d) < 1e-6 * Math.max(1, Math.abs(base)) || fmt(Math.abs(d)) === fmt(0)) return { delta: "No change", good: null };
  const sign = d < 0 ? "−" : "+";
  const r = relative && base ? Math.abs((d / base) * 100) : 0;
  const rel = r ? ` (${sign}${r < 10 ? r.toFixed(1) : Math.round(r)}%)` : "";
  return { delta: `${sign}${fmt(Math.abs(d))}${rel}`, good: lowerIsGood ? d < 0 : d > 0, dir: d > 0 ? 1 : -1 };
}

function Kpis() {
  const r = useStore((s) => s.result)!;
  const site = useStore((s) => s.site);
  const k = r.result.kpis;
  const b = r.baseline.kpis;
  const cur = r.result.currency;
  const m = (v: number) => money(v, cur);
  const has = (t: string) => site.assets.some((a) => a.type === t);
  const stepTxt = r.time.step_minutes >= 60 ? "hourly" : `${r.time.step_minutes}-min`;
  const cards: Card[] = [
    { label: "Total cost", value: m(k.total_cost), ...delta(k.total_cost, b.total_cost, m, true),
      detail: k.demand_charge_cost > 0 ? `Includes ${m(k.demand_charge_cost)} demand charges` : site.tariff.price_adder ? "Energy, incl. price adder" : "Energy only" },
    { label: "Peak import", value: `${num(k.peak_import_kw, 1)} kW`, ...delta(k.peak_import_kw, b.peak_import_kw, (v) => `${num(v, 1)} kW`, true),
      detail: `Highest ${stepTxt} average grid import` },
  ];
  if (site.grid.fuse_a != null) {
    const over = k.fuse_overload_kwh > 0.01;
    cards.push({ label: "Max phase current", value: `${num(k.max_phase_current_a, 1)} A`,
      ...delta(k.max_phase_current_a, b.max_phase_current_a, (v) => `${num(v, 1)} A`, true),
      detail: over ? `Fuse ${site.grid.fuse_a} A exceeded` : `Fuse ${site.grid.fuse_a} A respected` });
  }
  cards.push({ label: "Self-sufficiency", value: pct(k.self_sufficiency_share),
    ...delta(k.self_sufficiency_share, b.self_sufficiency_share, (v) => `${Math.round(v * 100)} pts`, false, false),
    detail: "Share of demand not bought from the grid" });
  if (has("pv")) cards.push({ label: "Solar self-use", value: pct(k.self_consumption_share),
    ...delta(k.self_consumption_share, b.self_consumption_share, (v) => `${Math.round(v * 100)} pts`, false, false),
    detail: `Share of solar used on site. ${k.pv_curtailed_kwh > 0.5 ? `${num(k.pv_curtailed_kwh)} kWh curtailed` : `${num(k.grid_export_kwh)} kWh exported`}` });
  if (has("battery")) cards.push({ label: "Battery cycles", value: num(k.battery_equivalent_full_cycles, k.battery_equivalent_full_cycles < 10 ? 1 : 0),
    delta: `${num(k.battery_discharge_kwh)} kWh out`, detail: "Equivalent full cycles, a proxy for wear" });
  if (has("ev_charger")) {
    const short = k.ev_unmet_kwh > 0.5;
    cards.push({ label: "EV energy", value: `${num(k.ev_delivered_kwh)} kWh`,
      delta: short ? `${num(k.ev_unmet_kwh, 1)} kWh short` : "All targets met", good: !short,
      detail: short ? `${k.ev_sessions_unmet} of ${k.ev_sessions} finished visits left short` : `${k.ev_sessions} finished visits` });
  }
  if (has("heat_pump")) {
    const unmet = k.hp_unmet_heat_kwh > 0.5;
    cards.push({ label: "Heat pump", value: `${num(k.hp_electric_kwh)} kWh`,
      delta: unmet ? `${num(k.hp_unmet_heat_kwh)} kWh heat unmet` : `COP ${num(k.hp_scop, 2)} average`, good: unmet ? false : null,
      detail: `Electricity used for ${num(k.hp_heat_kwh)} kWh of heat (seasonal COP ${num(k.hp_scop, 2)})` });
  }
  if (site.assets.some((a) => a.type === "ev_charger" && a.bidirectional)) {
    cards.push({ label: "Car to home", value: `${num(k.ev_discharged_kwh, 1)} kWh`,
      detail: "Energy cars gave back through bidirectional chargers (counted at the car battery)" });
  }
  if (site.grid.dimming && site.grid.dimming !== "off") {
    cards.push({ label: "Dimmed (§14a)", value: `${num(k.dimmed_kwh, 1)} kWh`,
      delta: `${site.grid.dimming === "ems" ? "EMS" : "direct"} · ${site.grid.dimming_hours ?? 0} h/day`,
      detail: "Energy the grid operator's limit held back from controllable devices" });
  }
  if (site.grid.import_limit_kw != null) {
    const over = k.grid_overload_kwh > 0.01;
    cards.push({ label: "Import limit", value: over ? `${num(k.grid_overload_kwh)} kWh over` : "Respected",
      delta: !over && b.grid_overload_kwh > 0.01 ? `Baseline ${num(b.grid_overload_kwh)} kWh over` : `${site.grid.import_limit_kw} kW`,
      good: !over && b.grid_overload_kwh > 0.01 ? true : over ? false : null, detail: `Limit ${site.grid.import_limit_kw} kW` });
  }
  return (
    <div className="kpis" data-tour="kpis">
      {cards.map((c) => (
        <div className="kpi" key={c.label} title={c.detail}>
          <span className="kpi-label">{c.label}</span>
          <span className="kpi-value">{c.value}</span>
          {c.delta && (
            <span className={`kpi-delta ${c.good === true ? "good" : c.good === false ? "bad" : ""}`}>
              {c.delta}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function Transport() {
  const r = useStore((s) => s.result)!;
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

  const { start, step_minutes: step, steps: T } = r.time;
  const perDay = 1440 / step;
  return (
    <div className="transport" data-tour="transport">
      <button className="icon-btn" onClick={() => setCursor(cursor - perDay)} title="Back one day" aria-label="Back one day"><SkipBack size={15} /></button>
      <button className="btn primary play" onClick={() => setPlaying(!playing)} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button className="icon-btn" onClick={() => setCursor(cursor + perDay)} title="Forward one day" aria-label="Forward one day"><SkipForward size={15} /></button>
      <input type="range" min={0} max={T - 1} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} aria-label="Time" />
      <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed" title="Playback speed">
        <option value={0.5}>30 min/s</option>
        <option value={1}>1 h/s</option>
        <option value={4}>4 h/s</option>
        <option value={12}>12 h/s</option>
        <option value={48}>2 d/s</option>
      </select>
      <span className="time">{stepLabel(start, step, cursor)}</span>
    </div>
  );
}

function Sources() {
  const r = useStore((s) => s.result)!;
  const site = useStore((s) => s.site);
  const name = (id: string) => (id === "tariff" ? "Price" : site.assets.find((a) => a.id === id)?.name || id);
  const start = timeAt(r.time.start, r.time.step_minutes, 0);
  return (
    <table className="table">
      <thead><tr><th>Used for</th><th>Data</th><th>Dates used</th><th>Resolution</th></tr></thead>
      <tbody>
        {r.result.sources.map((s) => {
          const used = new Date(`${s.source_start.slice(0, 19)}Z`);
          const same = used.toISOString().slice(0, 10) === start.toISOString().slice(0, 10);
          return (
            <tr key={`${s.asset}-${s.profile}`}>
              <td>{name(s.asset)}</td>
              <td>{s.label}</td>
              <td>{same ? "As simulated" : `From ${dayLabel(used)} ${used.getUTCFullYear()} (same season and weekday)`}</td>
              <td className={s.resampling.startsWith("repeated") ? "warn-text" : ""}>{s.resampling}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Shown after "Compare forecasts": the same site with perfect and with realistic forecasts. */
function ForecastCompare() {
  const cmp = useStore((s) => s.compare)!;
  const site = useStore((s) => s.site);
  const p = cmp.perfect.result.kpis, q = cmp.realistic.result.kpis;
  const cur = cmp.realistic.result.currency;
  const m = (v: number) => money(v, cur);
  type Row = [string, number, number, (v: number) => string, boolean];  // label, perfect, realistic, format, lower is better
  const rows: Row[] = [
    ["Total cost", p.total_cost, q.total_cost, m, true],
    ["Peak import", p.peak_import_kw, q.peak_import_kw, (v) => `${num(v, 1)} kW`, true],
    ["Self-sufficiency", p.self_sufficiency_share, q.self_sufficiency_share, pct, false],
  ];
  if (site.assets.some((a) => a.type === "ev_charger")) rows.push(["EV energy short", p.ev_unmet_kwh, q.ev_unmet_kwh, (v) => `${num(v, 1)} kWh`, true]);
  const extra = q.total_cost - p.total_cost;
  const share = p.total_cost ? (extra / Math.abs(p.total_cost)) * 100 : 0;
  const ctrl = site.controller.battery === "mpc" ? "MPC" : "rule-based control";
  return (
    <div className="fc-compare" aria-label="Perfect versus realistic forecasts">
      <div className="fc-head">
        <b>Forecasts: perfect vs realistic</b> <Help topic="forecasts" />
        <span className="muted">
          {Math.abs(extra) < 0.005 ? `Real-world forecasts cost ${ctrl} nothing here.`
            : extra > 0 ? `Real-world forecasts cost ${ctrl} ${m(extra)} more (${share.toFixed(1)}%). Charts and numbers below show the realistic run.`
            : `The realistic run came out ${m(-extra)} cheaper; see the help for why this can happen. Charts below show the realistic run.`}
        </span>
      </div>
      <table className="table fc-table">
        <thead><tr><th></th><th>Perfect forecast</th><th>Realistic forecast</th><th>Difference</th></tr></thead>
        <tbody>
          {rows.map(([label, a, b, f, lower]) => {
            const d = b - a;
            const same = f(Math.abs(d)) === f(0);  // no difference at the precision shown
            const worse = lower ? d > 0 : d < 0;
            return (
              <tr key={label}>
                <td>{label}</td><td>{f(a)}</td><td>{f(b)}</td>
                <td className={same ? "muted" : worse ? "warn-text" : ""}>{same ? "same" : `${d > 0 ? "+" : "−"}${f(Math.abs(d))}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type Tab = "charts" | "sessions" | "sources";

export function Results() {
  const r = useStore((s) => s.result);
  const stale = useStore((s) => s.stale);
  const error = useStore((s) => s.error);
  const collapsed = useStore((s) => s.collapsed);
  const setCollapsed = useStore((s) => s.setCollapsed);
  const site = useStore((s) => s.site);
  const compare = useStore((s) => s.compare);
  const [tab, setTab] = useState<Tab>("charts");
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.48));
  const [dragging, setDragging] = useState(false);
  if (!r && !error) return null;

  const showSessions = !!r && site.assets.some((a) => a.type === "ev_charger")
    && (site.mode === "operate" || r.time.steps * r.time.step_minutes <= 14 * 1440);
  const tabs: { id: Tab; label: string }[] = [
    { id: "charts", label: "Charts" },
    ...(showSessions ? [{ id: "sessions" as Tab, label: "EV sessions" }] : []),
    { id: "sources", label: "Data sources" },
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "charts";

  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY, h0 = height;
    setDragging(true);
    const move = (ev: PointerEvent) => setHeight(Math.max(180, Math.min(window.innerHeight - 220, h0 - (ev.clientY - y0))));
    const up = () => { setDragging(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const open = r && !collapsed;
  return (
    <section className="results" style={open ? { height } : undefined} aria-label="Results">
      {open && <div className={`resize ${dragging ? "on" : ""}`} onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="Resize results" />}
      <div className="results-head">
        <h3 className="with-help">Results <Help topic="kpis" /></h3>
        {r && !collapsed && (
          <nav className="tabs" role="tablist" data-tour="tabs">
            {tabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <div className="results-meta">
          {error && <span className="badge bad" title={error}><AlertTriangle size={12} /> {error.length > 80 ? `${error.slice(0, 80)}…` : error}</span>}
          {r?.result.warnings.map((w) => <span key={w} className="badge bad" title={w}><AlertTriangle size={12} /> {w}</span>)}
          {stale && <span className="badge warn">Out of date</span>}
          {r && (
            <span className="muted">
              Compared with baseline <Help topic="baseline" /> · {r.runtime_s}s
            </span>
          )}
        </div>
        {r && (
          <button className="icon-btn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand results" : "Collapse results"} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
      {open && (
        <div className="results-body">
          {compare && compare.realistic === r && !stale && <ForecastCompare />}
          <Kpis />
          <Transport />
          {active === "charts" && <div className="tab-pane"><div className="pane-help"><Help topic="charts" /></div><Charts /></div>}
          {active === "sessions" && <Sessions />}
          {active === "sources" && <div className="tab-pane"><p className="pane-intro">The data behind each component in this run <Help topic="sources" /></p><Sources /></div>}
        </div>
      )}
    </section>
  );
}
