import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent, TitleComponent, TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { importLimitSeries } from "../api";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { dayLabel, isMidnight, num, readVar, stepLabel, timeAt, UNIT_SPACE } from "../util";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, AxisPointerComponent,
  TitleComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);

/** Contiguous runs of steps where `v` > 0, as [first, last] index pairs (for shading spans). */
function spans(v: number[] | undefined): [number, number][] {
  const out: [number, number][] = [];
  if (!v) return out;
  let a = -1;
  for (let i = 0; i <= v.length; i++) {
    const on = i < v.length && v[i] > 1e-6;
    if (on && a < 0) a = i;
    if (!on && a >= 0) { out.push([a, i - 1]); a = -1; }
  }
  return out;
}

// Stacked panels share one time axis. Series colours are the energy tokens (styles.css), validated
// as a categorical set in both themes; identity is also carried by the legend and by line style
// (loads by dash pattern, EV and solar as filled areas, the baseline dashed).
interface Panel { key: string; title: string; height: number }
const GAP = 40; // between panels: room for the next panel's title
const LEGEND_H = 30; // the legend has its own row, so it never collides with a panel title
const LEFT = 56;
const EST_NAME = "SoC as estimated";
const SHORT_NAME = "Battery fell short";
const RIGHT = 20;

/** Axis numbers: thousands separators, no needless decimals. */
const tidy = (n: number) => num(n, Number.isInteger(n) || Math.abs(n) >= 10 ? 0 : Math.abs(n) >= 1 ? 1 : 2);

export function Charts() {
  const r = useStore((s) => s.result);
  const site = useStore((s) => s.site);
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const line = useRef<HTMLDivElement>(null);
  const win = useRef<[number, number]>([0, 0]);
  // The chart reads colours from CSS tokens once per draw, so it redraws when the theme changes.
  const dark = useTheme((s) => s.theme) === "dark";

  const hasBattery = site.assets.some((a) => a.type === "battery");
  const hasEv = site.assets.some((a) => a.type === "ev_charger");
  const showPhases = site.grid.fuse_a != null || (site.mode === "operate" && hasEv);
  const cur = r?.result.currency === "EUR" ? "€" : r?.result.currency === "USD" ? "$" : (r?.result.currency ?? "");
  const panels: Panel[] = [
    { key: "power", title: "Site power by component (kW)", height: 180 },
    ...(hasBattery ? [{ key: "flex", title: "Battery power (kW, + charging, − discharging)", height: 76 }] : []),
    ...(hasBattery ? [{ key: "soc", title: "Battery state of charge (%)", height: 52 }] : []),
    ...(showPhases ? [{ key: "phase", title: "Current per phase (A)", height: 84 }] : []),
    { key: "price", title: `Import price (${cur}/kWh)`, height: 48 },
  ];
  let y = LEGEND_H + 22;
  const layout = panels.map((p) => { const top = y; y += p.height + GAP; return { ...p, top }; });
  const HEIGHT = y + 6;
  const panelKey = layout.map((p) => p.key).join(",");

  useEffect(() => {
    if (!r || !box.current) return;
    const c = echarts.init(box.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const v = (n: string) => readVar(n);
    const ink = v("--ink"), ink2 = v("--ink-2"), muted = v("--muted"), hair = v("--chart-grid"), axis = v("--border-strong"),
      bad = v("--bad"), strong = v("--border-strong");
    const s = r.result.site;
    const { start, step_minutes: step, steps: T } = r.time;
    const x = Array.from({ length: T }, (_, i) => i);
    const label = (i: number) => stepLabel(start, step, i);
    const totalDays = (T * step) / 1440;
    const view = site.mode === "operate" || totalDays <= 7 ? T : Math.round((7 * 1440) / step);
    const curIdx = useStore.getState().cursor;
    const first = Math.max(0, Math.min(T - view, curIdx - Math.round(view * 0.3)));
    win.current = [first, Math.min(T - 1, first + view - 1)];
    const idx = Object.fromEntries(layout.map((p, k) => [p.key, k]));
    const last = layout.length - 1;
    const font = v("--font-ui"), mono = v("--font-mono");

    const axes = layout.map((_, k) => ({
      type: "category" as const, data: x, gridIndex: k, boundaryGap: true,
      axisLine: { lineStyle: { color: axis } }, axisTick: { show: false },
      axisLabel: k === last
        ? { color: muted, fontSize: 10.5, fontFamily: mono, hideOverlap: true, formatter: (val: string) => dayLabel(timeAt(start, step, Number(val))), interval: (i: number) => isMidnight(start, step, i) }
        : { show: false },
      axisPointer: { show: true, label: { show: false }, lineStyle: { color: muted, width: 1 } },
    }));
    const yAxis = (k: number, extra: object = {}) => ({
      type: "value" as const, gridIndex: k, splitNumber: 2,
      axisLabel: { color: muted, fontSize: 10.5, fontFamily: mono, formatter: tidy, hideOverlap: true },
      splitLine: { lineStyle: { color: hair } }, ...extra,
    });
    const lineS = (name: string, data: number[], color: string, k: number, extra: object = {}) => ({
      name, type: "line" as const, data, xAxisIndex: k, yAxisIndex: k, showSymbol: false, sampling: "lttb" as const,
      lineStyle: { width: 1.5, color }, itemStyle: { color }, emphasis: { disabled: true }, ...extra,
    });

    // Power panel: one line per consuming component (each building by name, EV charging), plus solar
    // and grid. Buildings share the load colour and differ by line style; past four, the rest fold
    // into "Other loads" so the legend stays readable.
    const loadColor = v("--c-load");
    const styles = ["solid", "dashed", "dotted", [8, 3, 2, 3]] as const;
    const buildings = site.assets.filter((a) => (a.type === "building" || a.type === "data_center") && r.result.assets[a.id]?.power_kw);
    const shown = buildings.length > 4 ? buildings.slice(0, 3) : buildings;
    const folded = buildings.slice(shown.length);
    const names = new Set<string>();
    const unique = (n: string) => { let m = n, k = 2; while (names.has(m)) m = `${n} (${k++})`; names.add(m); return m; };
    const loadLines = shown.map((a, k) => ({ name: unique(a.name || a.id), data: r.result.assets[a.id].power_kw, type: styles[k] }));
    if (folded.length) {
      const sum = new Array<number>(T).fill(0);
      folded.forEach((a) => r.result.assets[a.id].power_kw.forEach((p, i) => { sum[i] += p; }));
      loadLines.push({ name: unique(`Other loads (${folded.length})`), data: sum, type: styles[3] });
    }
    const hasPv = site.assets.some((a) => a.type === "pv");
    const hasHp = site.assets.some((a) => a.type === "heat_pump");
    const consumers = [...loadLines.map((l) => l.name), ...(hasHp ? ["Heat pump"] : []), ...(hasEv ? ["EV charging"] : [])];
    const grid = v("--c-grid"), solar = v("--c-solar"), ev = v("--c-ev"), heat = v("--c-heat"), batt = v("--c-batt");
    const series: object[] = [
      ...loadLines.map((l) => lineS(l.name, l.data, loadColor, idx.power, { lineStyle: { width: 1.5, color: loadColor, type: l.type } })),
      ...(hasHp ? [lineS("Heat pump", s.hp_kw, heat, idx.power)] : []),
      ...(hasEv ? [lineS("EV charging", s.ev_kw, ev, idx.power, { step: "middle", areaStyle: { color: ev, opacity: 0.16 } })] : []),
      ...(hasPv ? [lineS("Solar", s.pv_kw, solar, idx.power, { areaStyle: { color: solar, opacity: 0.16 } })] : []),
      lineS("Grid, baseline", r.baseline.site.grid_kw, grid, idx.power, { lineStyle: { width: 1.25, type: [4, 3], color: grid, opacity: 0.6 } }),
      lineS("Grid", s.grid_kw, grid, idx.power, { lineStyle: { width: 2, color: grid } }),
      lineS("Import price", s.price, ink2, idx.price, { step: "middle", lineStyle: { width: 1.5, color: ink2 } }),
    ];
    // The baseline's legend key is dashed, like its line (a solid key would read as a second grid line).
    const dashedKey = "path://M0,0h3v1h-3zM4.5,0h3v1h-3zM9,0h3v1h-3z";
    const legend: (string | { name: string; icon: string })[] = [...consumers, ...(hasPv ? ["Solar"] : []), "Grid", { name: "Grid, baseline", icon: dashedKey }];
    // The import limit per step (firm, lower inside contract windows; gaps where unlimited). A boundary, not a
    // series to compare: neutral ink-2, so it does not read as another energy flow (blue is grid power) or as a
    // permanent alarm (--bad is kept for states such as an overshoot). Longer dashes than the baseline, stepped
    // like the contract it draws, and drawn under the grid line so the grid power stays on top where they meet.
    const limitSeries = importLimitSeries(r);
    if (limitSeries) {
      series.splice(series.length - 2, 0, lineS("Import limit", limitSeries as number[], ink2, idx.power, {
        step: "middle", sampling: undefined, connectNulls: false,
        lineStyle: { width: 1.25, type: [6, 3], color: ink2 } }));
      legend.push({ name: "Import limit", icon: "path://M0,0h5v1h-5zM7,0h5v1h-5z" });
    }
    if (idx.flex !== undefined) {
      series.push({ name: "Battery", type: "bar", data: s.battery_kw, xAxisIndex: idx.flex, yAxisIndex: idx.flex, barCategoryGap: "15%", itemStyle: { color: batt, borderRadius: 1 }, large: true });
      legend.push("Battery");
      // Plan shortfall: steps where the battery delivered less than the controller asked (SoC estimate off, or power
      // tapering). A state, not a flow: faint --bad bands behind the bars, named in the legend and, through an
      // invisible line carrying the kW, in the tooltip.
      const short = s.battery_shortfall_kw;
      const runs = spans(short);
      if (runs.length) {
        series.push({
          ...lineS(SHORT_NAME, short.map((q) => (q > 1e-6 ? q : null)) as number[], bad, idx.flex, { lineStyle: { width: 0, color: bad, opacity: 0 }, connectNulls: false, sampling: undefined, z: 0 }),
          markArea: { silent: true, itemStyle: { color: bad, opacity: dark ? 0.16 : 0.14 },
            data: runs.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]) },
        });
        legend.push({ name: SHORT_NAME, icon: "rect" });
      }
    }
    if (idx.soc !== undefined) {
      series.push(lineS("Battery charge", s.soc.map((q) => q * 100), batt, idx.soc, { areaStyle: { color: batt, opacity: 0.14 } }));
      // What the battery management system believed (device uncertainty). Only when it differs from the truth at the
      // precision shown (half a percentage point): dashed ink-2, so it reads as a reading, not as a second battery.
      const est = s.soc_estimate;
      if (Array.isArray(est) && est.some((q, i) => Math.abs(q - s.soc[i]) > 0.005)) {
        series.push(lineS(EST_NAME, est.map((q) => q * 100), ink2, idx.soc, { lineStyle: { width: 1.25, color: ink2, type: [4, 3] } }));
        legend.push({ name: EST_NAME, icon: dashedKey });
      }
    }
    const phaseNames = ["L1", "L2", "L3"];
    if (idx.phase !== undefined) {
      const fuse = site.grid.fuse_a;
      // Three phases of one quantity: one ink, told apart by dash pattern and their own legend.
      (["phase_l1_a", "phase_l2_a", "phase_l3_a"] as const).forEach((key, k) => {
        series.push(lineS(phaseNames[k], s[key], ink2, idx.phase, {
          lineStyle: { width: 1.5, color: ink2, type: ["solid", [6, 3], [1.5, 2.5]][k], opacity: [1, 0.85, 0.85][k] },
          ...(k === 0 && fuse != null ? { markLine: { silent: true, symbol: "none", lineStyle: { color: bad, width: 1.25, type: [4, 3] },
            label: { formatter: `Fuse ${fuse}${UNIT_SPACE}A`, color: bad, position: "insideEndBottom", fontSize: 10.5, fontFamily: mono }, data: [{ yAxis: fuse }] } } : {}),
        }));
      });
    }

    // Phase currents: at most four round ticks, with the fuse line inside the panel.
    function phaseScale() {
      const all = [s.phase_l1_a ?? [], s.phase_l2_a ?? [], s.phase_l3_a ?? []].flat();
      let lo = 0, hi = Math.max(1, (site.grid.fuse_a ?? 0) * 1.1);
      for (const a of all) { if (a < lo) lo = a; if (a > hi) hi = a; }
      const raw = (hi - lo) / 3;
      const mag = 10 ** Math.floor(Math.log10(raw));
      const interval = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((v) => v >= raw) ?? 10 * mag;
      return { min: Math.floor(lo / interval) * interval, max: Math.ceil(hi / interval) * interval, interval };
    }
    const legendText = { color: ink2, fontSize: 12, fontFamily: font };
    c.setOption({
      animation: false,
      textStyle: { fontFamily: font },
      title: layout.map((p) => ({ text: p.title, top: p.top - 20, left: LEFT - 4, textStyle: { fontSize: 12, fontWeight: 500, color: muted, fontFamily: font } })),
      grid: layout.map((p) => ({ left: LEFT, right: RIGHT, top: p.top, height: p.height })),
      xAxis: axes,
      yAxis: layout.map((p, k) => p.key === "soc"
        ? yAxis(k, { min: 0, max: 100, interval: 50, axisLabel: { color: muted, fontSize: 10.5, fontFamily: mono, formatter: "{value}%" } })
        : p.key === "phase" ? yAxis(k, phaseScale())
          : yAxis(k)),
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: {
        trigger: "axis", backgroundColor: v("--surface"), borderColor: v("--border"), borderWidth: 1, padding: [8, 10], textStyle: { color: ink, fontSize: 12, fontFamily: font },
        extraCssText: `border-radius:4px;box-shadow:${v("--shadow-pop")};min-width:200px`,
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; marker: string }[]) => {
          if (!ps.length) return "";
          const i = ps[0].dataIndex;
          const fmt = (n: string, val: number) => n === "Import price" ? `${cur}${num(val, 3)}/kWh`
            : phaseNames.includes(n) ? `${num(val, 1)}${UNIT_SPACE}A`
              : n === "Battery charge" || n === EST_NAME ? `${num(val, 0)}%` : `${num(val, Math.abs(val) >= 100 ? 0 : 1)}${UNIT_SPACE}kW`;
          const row = (marker: string, name: string, text: string, strongRow = false) => `<div style="display:flex;align-items:center;gap:8px;line-height:20px">${marker}<span style="flex:1;color:${strongRow ? ink : ink2}">${name}</span><b style="font-weight:${strongRow ? 600 : 500};font-family:${mono};font-size:11.5px;font-variant-numeric:tabular-nums">${text}</b></div>`;
          // A null is "no value at this step" (the import limit where the contract sets none): no row.
          const rows = ps.filter((p) => p.value != null).map((p) => row(p.marker, p.seriesName, fmt(p.seriesName, Number(p.value))));
          // Total consumption, so the sum of the component lines is readable without a separate line.
          const shownConsumers = ps.filter((p) => consumers.includes(p.seriesName));
          if (shownConsumers.length > 1) {
            const total = shownConsumers.reduce((a, p) => a + Number(p.value), 0);
            rows.splice(shownConsumers.length, 0, row('<span style="display:inline-block;width:10px"></span>', "Total demand", fmt("", total), true));
          }
          return `<div style="font-weight:600;margin-bottom:6px">${label(i)}</div>${rows.join("")}`;
        },
      },
      legend: [
        { type: "scroll", top: 0, left: LEFT - 4, right: RIGHT, icon: "rect", itemWidth: 12, itemHeight: 2, itemGap: 18,
          textStyle: legendText, pageTextStyle: { color: muted }, pageIconColor: ink2, pageIconInactiveColor: strong, data: legend },
        ...(idx.phase !== undefined ? [{ top: layout[idx.phase].top - 21, right: RIGHT, itemWidth: 16, itemHeight: 2, itemGap: 14,
          textStyle: { ...legendText, fontSize: 11 }, data: phaseNames }] : []),
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: layout.map((_, k) => k), startValue: win.current[0], endValue: win.current[1], zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false },
        { type: "slider", xAxisIndex: layout.map((_, k) => k), startValue: win.current[0], endValue: win.current[1], bottom: 2, height: 18,
          left: LEFT, right: RIGHT + 10,
          borderColor: v("--border"), backgroundColor: "transparent", fillerColor: v("--surface-3"), textStyle: { color: muted, fontSize: 10.5, fontFamily: mono },
          handleStyle: { color: v("--surface"), borderColor: strong }, moveHandleStyle: { color: strong },
          dataBackground: { lineStyle: { color: strong, opacity: 0.6 }, areaStyle: { opacity: 0 } },
          selectedDataBackground: { lineStyle: { color: muted }, areaStyle: { opacity: 0 } }, labelFormatter: (i: number) => dayLabel(timeAt(start, step, i)) },
      ],
      series,
    });

    c.on("datazoom", () => {
      const opt = c.getOption() as { dataZoom: { startValue: number; endValue: number }[] };
      win.current = [opt.dataZoom[0].startValue, opt.dataZoom[0].endValue];
      placeLine();
    });
    c.getZr().on("click", (e: { offsetX: number; offsetY: number }) => {
      const i = c.convertFromPixel({ xAxisIndex: 0 }, [e.offsetX, e.offsetY]);
      const n = Array.isArray(i) ? i[0] : i;
      if (Number.isFinite(n)) { useStore.getState().setPlaying(false); setCursor(n); }
    });
    const ro = new ResizeObserver(() => { c.resize(); placeLine(); });
    ro.observe(box.current);
    placeLine();
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, dark, panelKey]);

  function placeLine() {
    const c = chart.current, el = line.current;
    if (!c || !el) return;
    const i = useStore.getState().cursor;
    const [a, b] = win.current;
    if (i < a || i > b) { el.style.display = "none"; return; }
    const px = c.convertToPixel({ xAxisIndex: 0 }, i) as number;
    el.style.display = "block";
    el.style.transform = `translateX(${px}px)`;
  }

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const [a, b] = win.current;
    if (cursor < a || cursor > b) {
      const span = b - a;
      const startIdx = Math.max(0, cursor - Math.round(span * 0.25));
      win.current = [startIdx, startIdx + span];
      c.dispatchAction({ type: "dataZoom", startValue: startIdx, endValue: startIdx + span });
    }
    placeLine();
  }, [cursor]);

  if (!r) return null;
  return (
    <div className="charts">
      <div ref={box} style={{ height: HEIGHT, width: "100%" }} />
      <div ref={line} className="playhead" style={{ top: LEGEND_H, bottom: 30 }} />
    </div>
  );
}
