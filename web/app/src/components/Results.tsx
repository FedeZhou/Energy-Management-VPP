import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useStore } from "../store";
import { dayLabel, kw, money, num, pct, pts, qty, signed, stepLabel, timeAt } from "../util";
import { Help } from "./Help";
import { Sessions } from "./Sessions";

// ECharts is large: it loads with the first result, not with the lab.
const Charts = lazy(() => import("./Charts").then((m) => ({ default: m.Charts })));

interface Card { label: string; value: string; delta?: string; good?: boolean | null; dir?: 1 | -1; detail?: string }

/** Change against the baseline as a signed value, e.g. "−€20.25 (−60%)". Shares in percentage points
 *  (relative = false) show only the point change, since a percentage of a percentage confuses. */
function delta(cur: number, base: number, fmt: (v: number) => string, lowerIsGood: boolean, relative = true): Pick<Card, "delta" | "good" | "dir"> {
  const d = cur - base;
  // A change that rounds to zero at the precision shown is "No change", not "−0 pts".
  if (Math.abs(d) < 1e-6 * Math.max(1, Math.abs(base)) || fmt(Math.abs(d)) === fmt(0)) return { delta: "No change", good: null };
  const r = relative && base ? Math.abs((d / base) * 100) : 0;
  const rel = r ? ` (${signed(d, () => `${num(r, r < 10 ? 1 : 0)}%`)})` : "";
  return { delta: `${signed(d, fmt)}${rel}`, good: lowerIsGood ? d < 0 : d > 0, dir: d > 0 ? 1 : -1 };
}

function Kpis() {
  const r = useStore((s) => s.result)!;
  const site = useStore((s) => s.site);
  const k = r.result.kpis;
  const b = r.baseline.kpis;
  const cur = r.result.currency;
  const m = (v: number) => money(v, cur);
  const has = (t: string) => site.assets.some((a) => a.type === t);
  const batteryKwh = site.assets.filter((a) => a.type === "battery").reduce((s, a) => s + (Number(a.capacity_kwh) || 0), 0);
  const stepTxt = r.time.step_minutes >= 60 ? "hourly" : `${r.time.step_minutes}-min`;
  const cards: Card[] = [
    { label: "Total cost", value: m(k.total_cost), ...delta(k.total_cost, b.total_cost, m, true),
      detail: k.demand_charge_cost > 0 ? `Includes ${m(k.demand_charge_cost)} demand charges` : site.tariff.price_adder ? "Energy, incl. price adder" : "Energy only" },
    { label: "Peak import", value: kw(k.peak_import_kw), ...delta(k.peak_import_kw, b.peak_import_kw, (v) => kw(v), true),
      detail: `Highest ${stepTxt} average grid import` },
  ];
  if (site.grid.fuse_a != null) {
    const over = k.fuse_overload_kwh > 0.01;
    cards.push({ label: "Max phase current", value: qty(k.max_phase_current_a, "A", 1),
      ...delta(k.max_phase_current_a, b.max_phase_current_a, (v) => qty(v, "A", 1), true),
      detail: over ? `Fuse ${site.grid.fuse_a} A exceeded` : `Fuse ${site.grid.fuse_a} A respected` });
  }
  // Without local generation the share is zero by construction: nothing to show.
  const generates = has("pv") || k.self_sufficiency_share > 0.005 || b.self_sufficiency_share > 0.005;
  if (generates) cards.push({ label: "Self-sufficiency", value: pct(k.self_sufficiency_share),
    ...delta(k.self_sufficiency_share, b.self_sufficiency_share, pts, false, false),
    detail: "Share of demand not bought from the grid" });
  if (has("pv")) cards.push({ label: "Solar self-use", value: pct(k.self_consumption_share),
    ...delta(k.self_consumption_share, b.self_consumption_share, pts, false, false),
    detail: `Share of solar used on site. ${k.pv_curtailed_kwh > 0.5 ? `${qty(k.pv_curtailed_kwh, "kWh", 0)} curtailed` : `${qty(k.grid_export_kwh, "kWh", 0)} exported`}` });
  if (has("battery") && batteryKwh > 0) {
    const life = k.battery_life_capped ? `${num(k.battery_life_years)}+ yr` : qty(k.battery_life_years, "yr", 1);
    const cycles = `${num(k.battery_equivalent_full_cycles, k.battery_equivalent_full_cycles < 10 ? 1 : 0)} full cycles`;
    const lifeTxt = `At this pace the battery would last ${life} until end of life (NREL BLAST-Lite ageing model, ${Math.round(k.battery_cycle_wear_share * 100)}% of the ageing from cycling, the rest from time).`;
    if (k.battery_wear_priced) {
      cards[0].detail = `${cards[0].detail}. Excludes ${m(k.battery_wear_cost)} battery wear`;
      cards.splice(1, 0, { label: "Cost incl. wear", value: m(k.total_cost_with_wear),
        ...delta(k.total_cost_with_wear, b.total_cost_with_wear, m, true),
        detail: "Total cost plus the share of the battery's value this period used up" });
      cards.push({ label: "Battery wear", value: m(k.battery_wear_cost), delta: `${life} life`,
        detail: `${lifeTxt} ${cycles} this period. The idle baseline also ages: ${m(b.battery_wear_cost)}.` });
    } else {
      cards.push({ label: "Battery life", value: life, delta: cycles,
        detail: `${lifeTxt} Wear is not priced: set the battery's replacement cost (no default outside EUR sites).` });
    }
  }
  if (has("ev_charger")) {
    const short = k.ev_unmet_kwh > 0.5;
    cards.push({ label: "EV energy", value: qty(k.ev_delivered_kwh, "kWh", 0),
      delta: short ? `${qty(k.ev_unmet_kwh, "kWh", 1)} short` : "All targets met", good: short ? false : null,
      detail: short ? `${k.ev_sessions_unmet} of ${k.ev_sessions} finished visits left short` : `${k.ev_sessions} finished visits` });
  }
  if (has("heat_pump")) {
    const unmet = k.hp_unmet_heat_kwh > 0.5;
    cards.push({ label: "Heat pump", value: qty(k.hp_electric_kwh, "kWh", 0),
      delta: unmet ? `${qty(k.hp_unmet_heat_kwh, "kWh", 0)} heat unmet` : `COP ${num(k.hp_scop, 2)} average`, good: unmet ? false : null,
      detail: `Electricity used for ${qty(k.hp_heat_kwh, "kWh", 0)} of heat (seasonal COP ${num(k.hp_scop, 2)})` });
  }
  if (site.assets.some((a) => a.type === "ev_charger" && a.bidirectional)) {
    cards.push({ label: "Car to home", value: qty(k.ev_discharged_kwh, "kWh", 1),
      detail: "Energy cars gave back through bidirectional chargers (counted at the car battery)" });
  }
  if (site.grid.dimming && site.grid.dimming !== "off") {
    cards.push({ label: "Dimmed (§14a)", value: qty(k.dimmed_kwh, "kWh", 1),
      delta: `${site.grid.dimming === "ems" ? "EMS" : "direct"} · ${site.grid.dimming_hours ?? 0} h/day`,
      detail: "Energy the grid operator's limit held back from controllable devices" });
  }
  if (site.grid.import_limit_kw != null) {
    const over = k.grid_overload_kwh > 0.01;
    cards.push({ label: "Import limit", value: over ? `${qty(k.grid_overload_kwh, "kWh", 0)} over` : "Respected",
      delta: !over && b.grid_overload_kwh > 0.01 ? `Baseline ${qty(b.grid_overload_kwh, "kWh", 0)} over` : `Limit ${kw(site.grid.import_limit_kw)}`,
      good: !over && b.grid_overload_kwh > 0.01 ? true : over ? false : null, detail: `Limit ${kw(site.grid.import_limit_kw)}` });
  }
  return (
    <div className="kpis" data-tour="kpis">
      {cards.map((c) => (
        <div className="kpi" key={c.label} title={c.detail}>
          <span className="kpi-label">{c.label}</span>
          <span className="kpi-value">{c.value}</span>
          {c.delta && (
            <span className="kpi-delta">
              {c.good != null && (c.dir === 1 || c.dir === -1)
                ? <span className={`kpi-arrow ${c.good ? "good" : "bad"}`} aria-label={c.good ? "better" : "worse"}>
                    {c.dir === 1 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  </span>
                : c.good === false && <AlertTriangle size={12} className="kpi-arrow bad" aria-label="problem" />}
              <span className="kpi-delta-text">{c.delta}</span>
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
      <div className="transport-buttons">
        <button className="icon-btn sm" onClick={() => setCursor(cursor - perDay)} title="Back one day" aria-label="Back one day"><SkipBack size={14} /></button>
        <button className="icon-btn sm play" onClick={() => setPlaying(!playing)} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button className="icon-btn sm" onClick={() => setCursor(cursor + perDay)} title="Forward one day" aria-label="Forward one day"><SkipForward size={14} /></button>
      </div>
      <input type="range" min={0} max={T - 1} value={cursor} onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }} aria-label="Time" />
      <span className="time">{stepLabel(start, step, cursor)}</span>
      <select className="speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed" title="Playback speed">
        <option value={0.5}>30 min/s</option>
        <option value={1}>1 h/s</option>
        <option value={4}>4 h/s</option>
        <option value={12}>12 h/s</option>
        <option value={48}>2 d/s</option>
      </select>
    </div>
  );
}

function Sources() {
  const r = useStore((s) => s.result)!;
  const site = useStore((s) => s.site);
  const name = (id: string) => (id === "tariff" ? "Price" : site.assets.find((a) => a.id === id)?.name || id);
  const start = timeAt(r.time.start, r.time.step_minutes, 0);
  return (
    <div className="table-wrap">
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
    </div>
  );
}

/** Shown after "Compare forecasts": the same site with perfect and with realistic forecasts. */
function ForecastCompare() {
  const cmp = useStore((s) => s.compare)!;
  const site = useStore((s) => s.site);
  const p = cmp.perfect.result.kpis, q = cmp.realistic.result.kpis;
  const cur = cmp.realistic.result.currency;
  const m = (v: number) => money(v, cur);
  // label, perfect, realistic, value format, difference format, lower is better
  type Row = [string, number, number, (v: number) => string, (v: number) => string, boolean];
  const rows: Row[] = [
    ["Total cost", p.total_cost, q.total_cost, m, m, true],
    ["Peak import", p.peak_import_kw, q.peak_import_kw, (v) => kw(v), (v) => kw(v), true],
  ];
  if (site.assets.some((a) => a.type === "pv")) rows.push(["Self-sufficiency", p.self_sufficiency_share, q.self_sufficiency_share, pct, pts, false]);
  if (site.assets.some((a) => a.type === "battery") && q.battery_wear_priced) rows.splice(1, 0, ["Cost incl. battery wear", p.total_cost_with_wear, q.total_cost_with_wear, m, m, true]);
  if (site.assets.some((a) => a.type === "ev_charger")) rows.push(["EV energy short", p.ev_unmet_kwh, q.ev_unmet_kwh, (v) => qty(v, "kWh", 1), (v) => qty(v, "kWh", 1), true]);
  const extra = q.total_cost - p.total_cost;
  const share = p.total_cost ? (extra / Math.abs(p.total_cost)) * 100 : 0;
  const ctrl = site.controller.battery === "mpc" ? "the optimiser (MPC)" : "rule-based control";
  return (
    <section className="fc-compare" aria-label="Perfect versus realistic forecasts">
      <div className="fc-head">
        <h4 className="with-help">Perfect vs realistic forecasts <Help topic="forecasts" /></h4>
        <p className="muted">
          {Math.abs(extra) < 0.005 ? `Real-world forecasts cost ${ctrl} nothing here.`
            : extra > 0 ? `Real-world forecasts cost ${ctrl} ${m(extra)} more (${num(share, 1)}%).`
            : `The realistic run came out ${m(-extra)} cheaper; see the help for why this can happen.`}
          {" "}Everything below shows the realistic run.
        </p>
      </div>
      <div className="table-wrap">
        <table className="table fc-table">
          <thead><tr><th>Metric</th><th>Perfect</th><th>Realistic</th><th>Difference</th></tr></thead>
          <tbody>
            {rows.map(([label, a, b, f, fd, lower]) => {
              const d = b - a;
              const same = fd(Math.abs(d)) === fd(0); // no difference at the precision shown
              const worse = lower ? d > 0 : d < 0;
              return (
                <tr key={label}>
                  <td>{label}</td><td>{f(a)}</td><td>{f(b)}</td>
                  <td className={same ? "muted" : worse ? "worse" : "better"}>{same ? "Same" : signed(d, fd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
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
  const comparing = !!compare && compare.realistic === r && !stale;
  const alerts = [...(error ? [error] : []), ...(r?.result.warnings ?? [])];

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
          {stale && <span className="chip warn">Out of date</span>}
          {comparing && <span className="chip" title="Compare forecasts ran the site twice; the numbers and charts show the run with realistic forecasts. Your Forecasts setting is unchanged.">Showing: realistic forecasts</span>}
          {r && (
            <span className="meta-text">
              <span className="hide-narrow">vs baseline</span> <Help topic="baseline" /> <span className="num">{num(r.runtime_s, 1)}{" "}s</span>
            </span>
          )}
        </div>
        {r && (
          <button className="icon-btn sm" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand results" : "Collapse results"} title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>
      {alerts.length > 0 && (
        <div className="results-alerts" role="status">
          {alerts.map((a) => <p key={a} className={a === error ? "alert bad" : "alert warn"}><AlertTriangle size={13} /><span>{a}</span></p>)}
        </div>
      )}
      {open && (
        <div className="results-body">
          {comparing && <ForecastCompare />}
          <Kpis />
          <Transport />
          {active === "charts" && (
            <div className="tab-pane">
              <p className="pane-intro">Power, battery, phases and price over time. Click a chart to move the playhead. <Help topic="charts" /></p>
              <Suspense fallback={<div className="pane-loading">Loading charts…</div>}><Charts /></Suspense>
            </div>
          )}
          {active === "sessions" && <Sessions />}
          {active === "sources" && <div className="tab-pane"><p className="pane-intro">The data behind each component in this run. <Help topic="sources" /></p><Sources /></div>}
        </div>
      )}
    </section>
  );
}
