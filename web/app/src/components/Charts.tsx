import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useStore } from "../store";
import { dayLabel, isMidnight, readVar, stepLabel, timeAt } from "../util";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, AxisPointerComponent,
  TitleComponent, MarkLineComponent, CanvasRenderer]);

// Stacked panels share one time axis. Each panel uses at most three colours (validated
// palette); identity is also carried by legend, line style and labels.
interface Panel { key: string; title: string; height: number }
const GAP = 38;

function useDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const m = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return dark;
}

export function Charts() {
  const r = useStore((s) => s.result);
  const site = useStore((s) => s.site);
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const line = useRef<HTMLDivElement>(null);
  const win = useRef<[number, number]>([0, 0]);
  const dark = useDark();

  const hasBattery = site.assets.some((a) => a.type === "battery");
  const hasEv = site.assets.some((a) => a.type === "ev_charger");
  const showPhases = site.grid.fuse_a != null || (site.mode === "operate" && hasEv);
  const panels: Panel[] = [
    { key: "power", title: "Site power (kW)", height: 130 },
    ...(hasBattery || hasEv ? [{ key: "flex", title: "Battery and EV charging (kW)", height: 72 }] : []),
    ...(hasBattery ? [{ key: "soc", title: "Battery charge level", height: 46 }] : []),
    ...(showPhases ? [{ key: "phase", title: "Current per phase (A)", height: 80 }] : []),
    { key: "price", title: `Import price (${r?.result.currency ?? ""} per kWh)`, height: 40 },
  ];
  let y = 30;
  const layout = panels.map((p) => { const top = y; y += p.height + GAP; return { ...p, top }; });
  const HEIGHT = y + 10;
  const panelKey = layout.map((p) => p.key).join(",");

  useEffect(() => {
    if (!r || !box.current) return;
    const c = echarts.init(box.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const v = (n: string) => readVar(n);
    const ink = v("--ink"), ink2 = v("--ink-2"), muted = v("--muted"), hair = v("--hair"), bad = v("--bad");
    const s = r.result.site;
    const { start, step_minutes: step, steps: T } = r.time;
    const x = Array.from({ length: T }, (_, i) => i);
    const label = (i: number) => stepLabel(start, step, i);
    const totalDays = (T * step) / 1440;
    const view = site.mode === "operate" || totalDays <= 7 ? T : Math.round((7 * 1440) / step);
    const cur = useStore.getState().cursor;
    const first = Math.max(0, Math.min(T - view, cur - Math.round(view * 0.3)));
    win.current = [first, Math.min(T - 1, first + view - 1)];
    const idx = Object.fromEntries(layout.map((p, k) => [p.key, k]));
    const last = layout.length - 1;

    const axes = layout.map((_, k) => ({
      type: "category" as const, data: x, gridIndex: k, boundaryGap: true,
      axisLine: { lineStyle: { color: hair } }, axisTick: { show: false },
      axisLabel: k === last
        ? { color: muted, formatter: (val: string) => dayLabel(timeAt(start, step, Number(val))), interval: (i: number) => isMidnight(start, step, i) }
        : { show: false },
      axisPointer: { show: true, label: { show: false }, lineStyle: { color: muted } },
    }));
    const tidy = (n: number) => (Number.isInteger(n) || Math.abs(n) >= 10 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
    const yAxis = (k: number, extra: object = {}) => ({
      type: "value" as const, gridIndex: k, splitNumber: 2,
      axisLabel: { color: muted, fontSize: 10, formatter: tidy }, splitLine: { lineStyle: { color: hair } }, ...extra,
    });
    const lineS = (name: string, data: number[], color: string, k: number, extra: object = {}) => ({
      name, type: "line" as const, data, xAxisIndex: k, yAxisIndex: k, showSymbol: false, sampling: "lttb" as const,
      lineStyle: { width: 2, color }, itemStyle: { color }, ...extra,
    });

    const series: object[] = [
      lineS("Solar", s.pv_kw, v("--c-solar"), idx.power, { areaStyle: { color: v("--c-solar"), opacity: 0.18 }, lineStyle: { width: 1.5, color: v("--c-solar") } }),
      lineS("Demand", s.load_kw.map((l, i) => l + s.ev_kw[i]), v("--c-load"), idx.power, { lineStyle: { width: 1.5, color: v("--c-load") } }),
      lineS("Grid, baseline", r.baseline.site.grid_kw, v("--c-grid"), idx.power, { lineStyle: { width: 1.5, type: "dashed", color: v("--c-grid"), opacity: 0.55 } }),
      lineS("Grid", s.grid_kw, v("--c-grid"), idx.power),
      lineS("Import price", s.price, ink, idx.price, { step: "middle", lineStyle: { width: 1.5, color: muted } }),
    ];
    const hasPv = site.assets.some((a) => a.type === "pv");
    const legend = ["Demand", ...(hasPv ? ["Solar"] : []), "Grid", "Grid, baseline"];
    if (!hasPv) series.shift(); // no solar line for a site without panels
    if (idx.flex !== undefined) {
      if (hasBattery) {
        series.push({ name: "Battery", type: "bar", data: s.battery_kw, xAxisIndex: idx.flex, yAxisIndex: idx.flex, barCategoryGap: "15%", itemStyle: { color: v("--c-batt"), borderRadius: 2 }, large: true });
        legend.push("Battery");
      }
      if (hasEv) {
        series.push(lineS("EV charging", s.ev_kw, v("--c-ev"), idx.flex, { step: "middle", areaStyle: { color: v("--c-ev"), opacity: 0.22 }, lineStyle: { width: 1.5, color: v("--c-ev") } }));
        legend.push("EV charging");
      }
    }
    if (idx.soc !== undefined) series.push(lineS("Battery charge", s.soc.map((q) => q * 100), v("--c-batt"), idx.soc, { areaStyle: { color: v("--c-batt"), opacity: 0.15 } }));
    if (idx.phase !== undefined) {
      const fuse = site.grid.fuse_a;
      (["phase_l1_a", "phase_l2_a", "phase_l3_a"] as const).forEach((key, k) => {
        series.push(lineS(`L${k + 1}`, s[key], ink2, idx.phase, {
          lineStyle: { width: 1.5, color: ink2, type: ["solid", "dashed", "dotted"][k] },
          ...(k === 0 && fuse != null ? { markLine: { silent: true, symbol: "none", lineStyle: { color: bad, width: 1.5 },
            label: { formatter: `Fuse ${fuse} A`, color: bad, position: "insideEndTop" }, data: [{ yAxis: fuse }] } } : {}),
        }));
      });
      legend.push("L1", "L2", "L3");
    }

    c.setOption({
      animation: false,
      textStyle: { fontFamily: v("--font-ui") },
      title: layout.map((p) => ({ text: p.title, top: p.top - 22, left: 52, textStyle: { fontSize: 11, fontWeight: 600, color: muted } })),
      grid: layout.map((p) => ({ left: 52, right: 24, top: p.top, height: p.height })),
      xAxis: axes,
      yAxis: layout.map((p, k) => p.key === "soc"
        ? yAxis(k, { min: 0, max: 100, axisLabel: { color: muted, fontSize: 10, formatter: "{value}%" } })
        : p.key === "phase" && site.grid.fuse_a != null ? yAxis(k, { max: (val: { max: number }) => Math.ceil(Math.max(val.max, site.grid.fuse_a! * 1.1) / 5) * 5 })
          : yAxis(k)),
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: {
        trigger: "axis", backgroundColor: v("--panel"), borderColor: hair, textStyle: { color: ink, fontSize: 12 },
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; marker: string }[]) => {
          if (!ps.length) return "";
          const i = ps[0].dataIndex;
          const unit = (n: string) => (n.includes("price") ? "" : n.startsWith("L") ? " A" : n.includes("charge") ? " %" : " kW");
          const rows = ps.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}<span style="flex:1">${p.seriesName}</span><b>${Number(p.value).toFixed(p.seriesName.includes("price") ? 3 : 1)}${unit(p.seriesName)}</b></div>`);
          return `<div style="font-weight:600;margin-bottom:4px">${label(i)}</div>${rows.join("")}`;
        },
      },
      legend: { top: 0, right: 24, itemWidth: 14, itemHeight: 8, textStyle: { color: muted, fontSize: 11 }, data: legend },
      dataZoom: [
        { type: "inside", xAxisIndex: layout.map((_, k) => k), startValue: win.current[0], endValue: win.current[1], zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false },
        { type: "slider", xAxisIndex: layout.map((_, k) => k), startValue: win.current[0], endValue: win.current[1], bottom: 2, height: 18,
          borderColor: hair, fillerColor: "rgba(127,127,127,0.12)", textStyle: { color: muted }, labelFormatter: (i: number) => dayLabel(timeAt(start, step, i)) },
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
      <div ref={line} className="playhead" style={{ bottom: 30 }} />
    </div>
  );
}
