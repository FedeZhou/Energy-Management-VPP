import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, Pin, X } from "lucide-react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Site } from "../api";
import { benchmarkAxis, useScenarios, type Scenario } from "../scenarios";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { dayLabel, isMidnight, kw, money, num, pct, qty, readVar, timeAt } from "../util";
import { Help } from "./Help";
import { PRETTY } from "./Inspector";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/** A scenario's name: what the user typed, or its control choices ("Price arbitrage · realistic"). */
function label(sc: Scenario, all: Scenario[]): string {
  if (sc.name.trim()) return sc.name.trim();
  const c = sc.site.controller;
  const has = (t: string) => sc.site.assets.some((a) => a.type === t);
  const strategy = has("battery") ? PRETTY[c.battery] ?? c.battery : PRETTY[c.ev] ?? c.ev;
  const fc = c.forecast === "realistic" ? "realistic" : "perfect";
  const base = `${strategy} · ${fc}`;
  // Same control on different sites (pinned after editing): number them so rows stay distinct.
  const twins = all.filter((o) => !o.name.trim() && o.site.controller.battery === c.battery && o.site.controller.ev === c.ev
    && (o.site.controller.forecast ?? "perfect") === (c.forecast ?? "perfect"));
  return twins.length > 1 ? `${base} (${twins.indexOf(sc) + 1})` : base;
}

interface Column { key: string; title: string; fmt: (v: number) => string; lower: boolean; show: (s: Site[]) => boolean }

/** Overlay colours: the first three categorical slots, validated all-pairs for colour-vision deficiency
 *  in both themes (dataviz reference palette). More than three overlaid lines would not stay legible. */
const OVERLAY = { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] };

export function Compare() {
  const list = useScenarios((s) => s.list);
  const progress = useScenarios((s) => s.progress);
  const error = useScenarios((s) => s.error);
  const { pin, remove, rename, clear, open, benchmark, cancel } = useScenarios.getState();
  const result = useStore((s) => s.result);
  const stale = useStore((s) => s.stale);
  const site = useStore((s) => s.site);
  const axis = benchmarkAxis(site);
  const pinned = list.some((s) => s.result === result);
  const cur = list[0]?.result.result.currency ?? result?.result.currency ?? "";
  const m = (v: number) => money(v, cur);
  const sites = list.map((s) => s.site);
  const any = (t: string) => (ss: Site[]) => ss.some((s) => s.assets.some((a) => a.type === t));

  const allColumns: Column[] = [
    { key: "total_cost", title: "Total cost", fmt: m, lower: true, show: () => true },
    { key: "total_cost_with_wear", title: "Cost incl. wear", fmt: m, lower: true, show: () => list.some((s) => s.result.result.kpis.battery_wear_priced) },
    { key: "peak_import_kw", title: "Peak import", fmt: (v) => kw(v), lower: true, show: () => true },
    { key: "limit_days_kept_share", title: "Limit kept", fmt: (v) => `${pct(v)} of days`, lower: false,
      show: () => list.some((s) => s.result.result.kpis.limit_days_kept_share != null) },
    { key: "self_sufficiency_share", title: "Self-sufficiency", fmt: pct, lower: false, show: any("pv") },
    { key: "ev_unmet_kwh", title: "EV short", fmt: (v) => qty(v, "kWh", 1), lower: true, show: any("ev_charger") },
    { key: "battery_life_years", title: "Battery life", fmt: (v) => qty(v, "yr", 1), lower: false, show: any("battery") },
  ];
  const columns = allColumns.filter((c) => c.show(sites));
  const best = (c: Column) => {
    const vals = list.map((s) => s.result.result.kpis[c.key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!vals.length) return null;
    const lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 1e-9) return null; // all equal: nothing is "best"
    return c.lower ? lo : hi;
  };
  const costKey = columns.some((c) => c.key === "total_cost_with_wear") ? "total_cost_with_wear" : "total_cost";
  const bestCost = best(columns.find((c) => c.key === costKey)!);

  const [overlay, setOverlay] = useState<string[]>([]);
  useEffect(() => { setOverlay((o) => o.filter((id) => list.some((s) => s.id === id))); }, [list]);
  const toggle = (id: string) => setOverlay((o) => (o.includes(id) ? o.filter((x) => x !== id) : o.length < 3 ? [...o, id] : o));

  return (
    <div className="tab-pane cmp">
      <div className="cmp-bar">
        <p className="pane-intro">Runs side by side. Pin a run, change anything, run again; or benchmark every strategy with perfect and realistic forecasts. <Help topic="forecasts" /></p>
        <div className="cmp-actions">
          <button className="btn" onClick={pin} disabled={!result || stale || pinned || !!progress}
            title={!result ? "Run the site first" : stale ? "The result is out of date: run again, then pin" : pinned ? "This run is already in the list" : "Keep this run in the comparison"}>
            <Pin size={14} /> Pin current run
          </button>
          {progress ? (
            <button className="btn" onClick={cancel} title="Stop the benchmark">
              <Loader2 size={14} className="spin" /> Benchmarking {progress.done}/{progress.total} · Stop
            </button>
          ) : (
            <button className="btn primary" onClick={() => void benchmark()} disabled={!axis}
              title={axis ? `Runs ${axis.values.length} ${axis.key === "battery" ? "battery" : "EV charging"} strategies × perfect and realistic forecasts (${axis.values.length * 2} runs) and replaces the list` : "Add a battery or an EV charger to benchmark strategies"}>
              Benchmark strategies
            </button>
          )}
          {list.length > 0 && !progress && <button className="btn ghost" onClick={clear}>Clear</button>}
        </div>
      </div>
      {error && <p className="alert bad">{error}</p>}
      {list.length === 0 ? (
        <p className="empty-note">No runs to compare yet.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table cmp-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  {columns.map((c) => <th key={c.key}>{c.title}</th>)}
                  <th>vs best</th>
                  <th title="Overlay grid power below (up to three)">Overlay</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((sc) => {
                  const k = sc.result.result.kpis;
                  const cost = k[costKey];
                  const vs = bestCost != null && Math.abs(bestCost) > 1e-9 ? ((cost - bestCost) / Math.abs(bestCost)) * 100 : 0;
                  return (
                    <tr key={sc.id} className={sc.result === result ? "current" : ""}>
                      <td>
                        <input className="cmp-name" value={sc.name} placeholder={label(sc, list)} aria-label="Scenario name"
                          onChange={(e) => rename(sc.id, e.target.value)} />
                      </td>
                      {columns.map((c) => {
                        const v = k[c.key];
                        const b = best(c);
                        const isBest = typeof v === "number" && b != null && Math.abs(v - b) < 1e-9 && list.length > 1;
                        return <td key={c.key} className={isBest ? "best" : ""}>{typeof v === "number" ? c.fmt(v) : "—"}</td>;
                      })}
                      <td className={bestCost != null && vs < 0.05 ? "best" : ""}>{bestCost == null ? "—" : vs < 0.05 ? "best" : `+${num(vs, 1)}%`}</td>
                      <td><input type="checkbox" checked={overlay.includes(sc.id)} onChange={() => toggle(sc.id)}
                        disabled={!overlay.includes(sc.id) && overlay.length >= 3} aria-label={`Overlay ${label(sc, list)}`} /></td>
                      <td className="cmp-row-actions">
                        <button className="icon-btn sm" onClick={() => open(sc.id)} title="Open: make this the site and result on screen" aria-label="Open scenario"><FolderOpen size={14} /></button>
                        <button className="icon-btn sm danger" onClick={() => remove(sc.id)} title="Remove from the comparison" aria-label="Remove scenario"><X size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CostGap list={list} costKey={costKey} fmt={m} />
          <Overlay list={list.filter((s) => overlay.includes(s.id))} labels={list.filter((s) => overlay.includes(s.id)).map((s) => label(s, list))} />
        </>
      )}
    </div>
  );
}

/** Cost per strategy: the bar is the realistic run, the tick the perfect-forecast run. The gap between them
 *  is what not knowing the future costs. Shown when the list holds perfect/realistic pairs (a benchmark). */
function CostGap({ list, costKey, fmt }: { list: Scenario[]; costKey: string; fmt: (v: number) => string }) {
  const rows = useMemo(() => {
    const key = (s: Scenario) => (s.site.assets.some((a) => a.type === "battery") ? s.site.controller.battery : s.site.controller.ev);
    const groups = new Map<string, { perfect?: number; realistic?: number }>();
    for (const s of list) {
      const g = groups.get(key(s)) ?? {};
      g[s.site.controller.forecast === "realistic" ? "realistic" : "perfect"] = s.result.result.kpis[costKey];
      groups.set(key(s), g);
    }
    return [...groups].filter(([, g]) => g.perfect != null && g.realistic != null)
      .map(([id, g]) => ({ id, perfect: g.perfect!, realistic: g.realistic! }))
      .sort((a, b) => a.realistic - b.realistic);
  }, [list, costKey]);
  if (rows.length < 2) return null;
  const max = Math.max(...rows.flatMap((r) => [r.perfect, r.realistic]), 1e-9);
  return (
    <figure className="cmp-gap" aria-label="Cost by strategy">
      <figcaption>
        <span className="panel-title">Cost by strategy</span>
        <span className="cmp-key"><i className="bar" /> realistic forecasts <i className="tick" /> perfect forecasts</span>
      </figcaption>
      {rows.map((r) => {
        const gap = r.realistic - r.perfect;
        return (
          <div className="cmp-gap-row" key={r.id}>
            <span className="cmp-gap-name">{PRETTY[r.id] ?? r.id}</span>
            <span className="cmp-gap-track">
              <span className="cmp-gap-bar" style={{ width: `${(Math.max(r.realistic, 0) / max) * 100}%` }} />
              <span className="cmp-gap-tick" style={{ left: `${(Math.max(r.perfect, 0) / max) * 100}%` }} title={`Perfect forecasts: ${fmt(r.perfect)}`} />
            </span>
            <span className="cmp-gap-val">{fmt(r.realistic)} <em>{Math.abs(gap) < 0.005 ? "no gap" : `${gap > 0 ? "+" : "−"}${fmt(Math.abs(gap))} vs perfect`}</em></span>
          </div>
        );
      })}
    </figure>
  );
}

/** Grid power of up to three scenarios on one time axis. */
function Overlay({ list, labels }: { list: Scenario[]; labels: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const theme = useTheme((s) => s.theme);
  const t0 = list[0]?.result.time;
  const key = list.map((s) => s.id).join("|") + "#" + labels.join("|");
  const sameAxis = list.every((s) => s.result.time.start === t0?.start && s.result.time.steps === t0?.steps && s.result.time.step_minutes === t0?.step_minutes);
  useEffect(() => {
    if (!box.current || !list.length || !sameAxis || !t0) return;
    const c = echarts.init(box.current, undefined, { renderer: "canvas" });
    const v = readVar, muted = v("--muted"), mono = v("--font-mono"), font = v("--font-ui");
    const colors = OVERLAY[theme];
    const x = Array.from({ length: t0.steps }, (_, i) => i);
    const days = (t0.steps * t0.step_minutes) / 1440;
    const view = days <= 7 ? t0.steps : Math.round((7 * 1440) / t0.step_minutes);
    c.setOption({
      animation: false,
      textStyle: { fontFamily: font },
      grid: { left: 56, right: 20, top: 34, bottom: 28 },
      legend: { top: 0, left: 52, icon: "rect", itemWidth: 12, itemHeight: 2, textStyle: { color: v("--ink-2"), fontSize: 12, fontFamily: font } },
      tooltip: { trigger: "axis", backgroundColor: v("--surface"), borderColor: v("--border"), textStyle: { color: v("--ink"), fontSize: 12, fontFamily: font },
        valueFormatter: (val: number) => kw(val) },
      xAxis: { type: "category", data: x, boundaryGap: false, axisLine: { lineStyle: { color: v("--border-strong") } }, axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 10.5, fontFamily: mono, hideOverlap: true, interval: (i: number) => isMidnight(t0.start, t0.step_minutes, i),
          formatter: (i: string) => dayLabel(timeAt(t0.start, t0.step_minutes, Number(i))) } },
      yAxis: { type: "value", splitNumber: 3, axisLabel: { color: muted, fontSize: 10.5, fontFamily: mono }, splitLine: { lineStyle: { color: v("--chart-grid") } } },
      dataZoom: [{ type: "inside", startValue: 0, endValue: view - 1, zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false }],
      series: list.map((s, k) => ({ name: labels[k], type: "line", data: s.result.result.site.grid_kw, showSymbol: false, sampling: "lttb",
        lineStyle: { width: 1.5, color: colors[k] }, itemStyle: { color: colors[k] }, emphasis: { disabled: true } })),
    });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(box.current);
    return () => { ro.disconnect(); c.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sameAxis, theme]);
  if (!list.length) return <p className="pane-intro">Tick “Overlay” on up to three scenarios to draw their grid power on one time axis.</p>;
  if (!sameAxis) return <p className="pane-intro">These scenarios cover different periods or time steps, so their grid power can't share one axis.</p>;
  return (
    <figure className="cmp-overlay" aria-label="Grid power by scenario">
      <figcaption className="panel-title">Grid power (kW, + import)</figcaption>
      <div ref={box} style={{ height: 220, width: "100%" }} />
    </figure>
  );
}
