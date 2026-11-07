import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { AxisPointerComponent, DataZoomComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useStore } from "../store";
import { readVar, stepLabel } from "../util";

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, AxisPointerComponent, TitleComponent, CanvasRenderer]);

// Four stacked panels share one time axis. Each panel uses at most three colours
// (validated palette); identity is also carried by the legend and line style.
const PANELS = [
  { top: 30, height: 128, title: "Site power (kW)" },
  { top: 196, height: 70, title: "Battery and EV charging (kW)" },
  { top: 304, height: 46, title: "Battery charge level" },
  { top: 388, height: 36, title: "Import price (per kWh)" },
];
const HEIGHT = 470;

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
  const cursor = useStore((s) => s.cursor);
  const setCursor = useStore((s) => s.setCursor);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const line = useRef<HTMLDivElement>(null);
  const win = useRef<[number, number]>([0, 0]);
  const dark = useDark();

  // Build the chart when a new result arrives or the theme changes.
  useEffect(() => {
    if (!r || !box.current) return;
    const c = echarts.init(box.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const v = (n: string) => readVar(n);
    const ink = v("--ink"), muted = v("--muted"), hair = v("--hair");
    const s = r.result.site;
    const T = s.grid_kw.length;
    const x = Array.from({ length: T }, (_, i) => i);
    const label = (i: number) => stepLabel(r.time.start_date, r.time.first_step + i, r.time.hour[i]);
    const start = Math.max(0, useStore.getState().cursor - 72);
    win.current = [start, Math.min(T - 1, start + 24 * 7)];
    const axes = PANELS.map((_, k) => ({
      type: "category" as const, data: x, gridIndex: k, boundaryGap: true,
      axisLine: { lineStyle: { color: hair } }, axisTick: { show: false },
      axisLabel: k === PANELS.length - 1
        ? { color: muted, formatter: (val: string) => label(Number(val)).split(",")[0], interval: (i: number) => r.time.hour[i] === 1 }
        : { show: false },
      axisPointer: { show: true, label: { show: false }, lineStyle: { color: muted } },
    }));
    const yAxis = (k: number, extra: object = {}) => ({
      type: "value" as const, gridIndex: k, splitNumber: 2,
      axisLabel: { color: muted, fontSize: 10 }, splitLine: { lineStyle: { color: hair } }, ...extra,
    });
    const lineS = (name: string, data: number[], color: string, k: number, extra: object = {}) => ({
      name, type: "line" as const, data, xAxisIndex: k, yAxisIndex: k, showSymbol: false, sampling: "lttb" as const,
      lineStyle: { width: 2, color }, itemStyle: { color }, ...extra,
    });

    c.setOption({
      animation: false,
      textStyle: { fontFamily: v("--font-ui") },
      title: PANELS.map((p) => ({ text: p.title, top: p.top - 22, left: 52, textStyle: { fontSize: 11, fontWeight: 600, color: muted } })),
      grid: PANELS.map((p) => ({ left: 52, right: 24, top: p.top, height: p.height })),
      xAxis: axes,
      yAxis: [yAxis(0), yAxis(1), yAxis(2, { min: 0, max: 100, axisLabel: { color: muted, fontSize: 10, formatter: "{value}%" } }), yAxis(3)],
      axisPointer: { link: [{ xAxisIndex: "all" }] },
      tooltip: {
        trigger: "axis", backgroundColor: v("--panel"), borderColor: hair, textStyle: { color: ink, fontSize: 12 },
        formatter: (ps: { dataIndex: number; seriesName: string; value: number; marker: string }[]) => {
          if (!ps.length) return "";
          const i = ps[0].dataIndex;
          const rows = ps.map((p) => `<div style="display:flex;justify-content:space-between;gap:16px">${p.marker}<span style="flex:1">${p.seriesName}</span><b>${Number(p.value).toFixed(p.seriesName.includes("price") ? 3 : 1)}</b></div>`);
          return `<div style="font-weight:600;margin-bottom:4px">${label(i)}</div>${rows.join("")}`;
        },
      },
      legend: {
        top: 0, right: 24, itemWidth: 14, itemHeight: 8, textStyle: { color: muted, fontSize: 11 },
        data: ["Demand", "Solar", "Grid", "Grid, baseline", "Battery", "EV charging"],
      },
      dataZoom: [
        { type: "inside", xAxisIndex: [0, 1, 2, 3], startValue: win.current[0], endValue: win.current[1], zoomOnMouseWheel: "ctrl", moveOnMouseWheel: false },
        { type: "slider", xAxisIndex: [0, 1, 2, 3], startValue: win.current[0], endValue: win.current[1], bottom: 4, height: 18,
          borderColor: hair, fillerColor: "rgba(127,127,127,0.12)", textStyle: { color: muted }, labelFormatter: (i: number) => label(i).split(",")[0] },
      ],
      series: [
        lineS("Solar", s.pv_kw, v("--c-solar"), 0, { areaStyle: { color: v("--c-solar"), opacity: 0.18 }, lineStyle: { width: 1.5, color: v("--c-solar") } }),
        lineS("Demand", s.load_kw.map((l, i) => l + s.ev_kw[i]), v("--c-load"), 0, { lineStyle: { width: 1.5, color: v("--c-load") } }),
        lineS("Grid, baseline", r.baseline.site.grid_kw, v("--c-grid"), 0, { lineStyle: { width: 1.5, type: "dashed", color: v("--c-grid"), opacity: 0.55 } }),
        lineS("Grid", s.grid_kw, v("--c-grid"), 0),
        { name: "Battery", type: "bar", data: s.battery_kw, xAxisIndex: 1, yAxisIndex: 1, barCategoryGap: "15%", itemStyle: { color: v("--c-batt"), borderRadius: 2 }, large: true },
        lineS("EV charging", s.ev_kw, v("--c-ev"), 1, { step: "middle", areaStyle: { color: v("--c-ev"), opacity: 0.22 }, lineStyle: { width: 1.5, color: v("--c-ev") } }),
        lineS("Battery charge", s.soc.map((q) => q * 100), v("--c-batt"), 2, { areaStyle: { color: v("--c-batt"), opacity: 0.15 } }),
        lineS("Import price", s.price, ink, 3, { step: "middle", lineStyle: { width: 1.5, color: muted } }),
      ],
    });

    c.on("datazoom", () => {
      const opt = c.getOption() as { dataZoom: { startValue: number; endValue: number }[] };
      win.current = [opt.dataZoom[0].startValue, opt.dataZoom[0].endValue];
      placeLine();
    });
    c.getZr().on("click", (e: { offsetX: number; offsetY: number }) => {
      const i = c.convertFromPixel({ xAxisIndex: 0 }, [e.offsetX, e.offsetY]);
      const idx = Array.isArray(i) ? i[0] : i;
      if (Number.isFinite(idx)) { useStore.getState().setPlaying(false); setCursor(idx); }
    });
    const ro = new ResizeObserver(() => { c.resize(); placeLine(); });
    ro.observe(box.current);
    placeLine();
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, dark]);

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

  // Follow the playhead: move the line, and scroll the window when it leaves it.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const [a, b] = win.current;
    if (cursor < a || cursor > b) {
      const span = b - a;
      const start = Math.max(0, cursor - Math.round(span * 0.25));
      win.current = [start, start + span];
      c.dispatchAction({ type: "dataZoom", startValue: start, endValue: start + span });
    }
    placeLine();
  }, [cursor]);

  if (!r) return null;
  return (
    <div className="charts">
      <div ref={box} style={{ height: HEIGHT, width: "100%" }} />
      <div ref={line} className="playhead" />
    </div>
  );
}
