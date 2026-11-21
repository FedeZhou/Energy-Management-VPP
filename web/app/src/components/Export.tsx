import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Image as ImageIcon, ListChecks } from "lucide-react";
import { useStore } from "../store";
import { readVar } from "../util";
import { fileStem, kpiTable, timeSeriesTable, toCsv } from "../exportData";
import "./export.css";

function save(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The results chart's element, if the Charts tab is open and drawn. */
const chartElement = () => document.querySelector<HTMLDivElement>(".charts > div:has(canvas)");

/** The charts as a PNG. ECharts is imported on demand (it is already loaded once a chart is shown), so this
 *  menu does not pull it into the main bundle; Results.tsx lazy-loads the charts for the same reason. */
async function chartPng(): Promise<Blob | null> {
  const el = chartElement();
  if (!el) return null;
  const { getInstanceByDom } = await import("echarts/core");
  const c = getInstanceByDom(el);
  if (!c) return null;
  const url = c.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: readVar("--surface"), excludeComponents: ["dataZoom"] });
  return (await fetch(url)).blob();
}

interface Item { id: string; label: string; detail: string; icon: React.ReactNode; disabled?: string; run: () => void }

/** "Export results": the run's time series and KPIs as CSV, the charts as PNG. */
export function ExportMenu() {
  const r = useStore((s) => s.result);
  const site = useStore((s) => s.site);
  const stale = useStore((s) => s.stale);
  const [open, setOpen] = useState(false);
  const [hasChart, setHasChart] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const close = (focusButton: boolean) => {
    setOpen(false);
    setPos(null);
    if (focusButton) button.current?.focus();
  };

  // Fixed position next to the button, so the results panel's scrolling never clips it. It opens below the
  // button, or above it when the panel is collapsed at the bottom of the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const b = button.current.getBoundingClientRect();
    const m = menu.current.getBoundingClientRect();
    const below = b.bottom + 4 + m.height <= window.innerHeight - 8;
    setPos({
      top: below ? b.bottom + 4 : Math.max(8, b.top - 4 - m.height),
      left: Math.max(8, Math.min(b.right - m.width, window.innerWidth - m.width - 8)),
    });
  }, [open]);

  // Focus the first item once the menu is placed (it is hidden while it is measured).
  useEffect(() => {
    if (pos) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false); };
    const resize = () => close(false);
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", down, true); window.removeEventListener("resize", resize); };
  }, [open]);

  if (!r) return null;
  const stem = fileStem(r, site);
  const minutes = r.time.step_minutes;
  const items: Item[] = [
    { id: "series", label: "Time series (CSV)", icon: <FileSpreadsheet size={14} />,
      detail: `${r.time.steps.toLocaleString("en-GB")} rows, one per ${minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`}: grid, devices, price, baseline`,
      run: () => save(`${stem}.csv`, new Blob([toCsv(timeSeriesTable(r, site))], { type: "text/csv;charset=utf-8" })) },
    { id: "kpis", label: "KPI summary (CSV)", icon: <ListChecks size={14} />,
      detail: "The result cards as numbers, with the baseline",
      run: () => save(`${stem}_kpis.csv`, new Blob([toCsv(kpiTable(r, site))], { type: "text/csv;charset=utf-8" })) },
    { id: "png", label: "Charts (PNG)", icon: <ImageIcon size={14} />,
      detail: "The charts as shown, at double resolution",
      disabled: hasChart ? undefined : "Open the Charts tab (with the results expanded) to save the charts",
      run: () => { void chartPng().then((blob) => { if (blob) save(`${stem}_charts.png`, blob); }); } },
  ];

  const choose = (it: Item) => {
    if (it.disabled) return;
    it.run();
    close(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === "Tab") { close(false); return; }
    const all = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
  };

  return (
    <div className="export" ref={wrap}>
      <button ref={button} className="icon-btn sm" aria-label="Export results" title="Export results"
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => { if (open) close(false); else { setHasChart(!!chartElement()); setOpen(true); } }}>
        <Download size={15} />
      </button>
      {open && (
        <div ref={menu} className="export-menu" role="menu" aria-label="Export results" onKeyDown={onKey}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}>
          <div className="export-head">
            <span>Export</span>
            {stale && <span className="export-stale" title="The site has changed since this run; the files hold the run shown">Run shown, out of date</span>}
          </div>
          {items.map((it) => (
            <button key={it.id} type="button" role="menuitem" className="export-item" aria-disabled={!!it.disabled}
              title={it.disabled} onClick={() => choose(it)}>
              <span className="export-icon" aria-hidden>{it.icon}</span>
              <span className="export-text">
                <span className="export-label">{it.label}</span>
                <span className="export-detail">{it.disabled ?? it.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
