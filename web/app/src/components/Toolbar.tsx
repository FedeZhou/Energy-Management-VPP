import { useRef } from "react";
import { BookOpen, CircleHelp, Database, Download, FilePlus2, Loader2, Play, RotateCw, Scale, Upload } from "lucide-react";
import type { Mode, Site } from "../api";
import { useStore } from "../store";
import { useGuide } from "./Guide";
import { Help } from "./Help";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "plan", label: "Plan", hint: "Months to a year, hourly: costs, savings, battery wear" },
  { id: "operate", label: "Operate", hint: "Hours to days, 1–15 min steps: EVs, fuses, phases" },
];

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <g fill="var(--surface)">
        <rect x="6" y="12" width="3" height="6" rx="1" />
        <rect x="10.5" y="6" width="3" height="12" rx="1" />
        <rect x="15" y="9" width="3" height="9" rx="1" />
      </g>
    </svg>
  );
}

export function Toolbar() {
  const presets = useStore((s) => s.presets);
  const mode = useStore((s) => s.site.mode);
  const name = useStore((s) => s.site.name);
  const running = useStore((s) => s.running);
  const stale = useStore((s) => s.stale);
  const hasResult = useStore((s) => s.result !== null);
  const assets = useStore((s) => s.site.assets.length);
  const { loadSite, run, compareForecasts, setMode } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const site = useStore.getState().site;
    const blob = new Blob([JSON.stringify(site, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${site.name.replace(/[^\w-]+/g, "_") || "site"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const site = JSON.parse(await file.text()) as Site;
      if (!Array.isArray(site.assets)) throw new Error("missing assets list");
      loadSite(site);
    } catch (e) {
      useStore.setState({ error: `Could not read ${file.name}: ${(e as Error).message}` });
    }
  };

  const again = hasResult && stale;
  return (
    <header className="topbar">
      <div className="brand">
        <Mark />
        <span className="brand-name">Site Lab</span>
        <span className="crumb-sep">/</span>
        <span className="crumb" title={name}>{name}</span>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Mode" data-tour="mode">
        {MODES.map(({ id, label, hint }) => (
          <button key={id} role="radio" aria-checked={mode === id} className={mode === id ? "on" : ""}
            onClick={() => mode !== id && setMode(id)} title={hint}>
            {label}
          </button>
        ))}
      </div>
      <Help topic="modes" />
      <div className="topbar-spacer" />
      <div className="topbar-group">
        <button className="btn ghost" onClick={() => useGuide.getState().start()} data-tour="guide" title="A short tour of the interface">
          <CircleHelp size={15} /> Guide
        </button>
        <button className="btn ghost" data-tour="learn" onClick={() => useStore.getState().setPage("learn")} title="How Site Lab works, how the systems behave, research digests">
          <BookOpen size={15} /> Learn
        </button>
        <button className="icon-btn" title="Where the data comes from" aria-label="Data sources" data-tour="data"
          onClick={() => useStore.getState().setDataPanel(true)}>
          <Database size={16} />
        </button>
      </div>
      <div className="vsep" />
      <div className="topbar-files" data-tour="examples">
        <select className="examples" aria-label="Load an example" defaultValue="" onChange={(e) => {
          const p = presets.find((x) => x.id === e.target.value);
          if (p) loadSite(p.site);
          e.target.value = "";
        }}>
          <option value="" disabled>Examples</option>
          {presets.filter((p) => p.mode === mode).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="icon-btn" title="New empty site" aria-label="New empty site"
          onClick={() => loadSite({ ...useStore.getState().site, name: "New site", assets: [] })}>
          <FilePlus2 size={16} />
        </button>
        <button className="icon-btn" title="Open a site file (JSON)" aria-label="Open a site file" onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
        </button>
        <button className="icon-btn" title="Save the site as JSON" aria-label="Save the site as JSON" onClick={exportJson}>
          <Download size={16} />
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }} />
      </div>
      <div className="vsep" />
      <button className="btn" onClick={() => compareForecasts()} disabled={running || assets === 0}
        title="Run twice: with perfect forecasts, and with what a real controller would know (yesterday's load, the day-ahead weather forecast, prices only once published, cars only once plugged in)">
        <Scale size={14} /> Compare forecasts
      </button>
      <button className="btn primary" data-tour="run" onClick={() => run()} disabled={running || assets === 0} title="Run simulation (Ctrl+Enter)">
        {running ? <Loader2 size={14} className="spin" /> : again ? <RotateCw size={14} /> : <Play size={14} />}
        {running ? "Running" : again ? "Re-run" : "Run"}
      </button>
    </header>
  );
}
