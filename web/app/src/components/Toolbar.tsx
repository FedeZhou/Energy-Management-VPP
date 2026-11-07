import { useRef } from "react";
import { CalendarRange, Download, Gauge, Loader2, Play, Upload } from "lucide-react";
import type { Mode, Site } from "../api";
import { useStore } from "../store";

const MODES: { id: Mode; label: string; hint: string; icon: typeof Gauge }[] = [
  { id: "plan", label: "Plan", hint: "Months to a year, hourly. Costs, savings, wear.", icon: CalendarRange },
  { id: "operate", label: "Operate", hint: "Hours to days, 15-minute steps. EVs, fuses, phases.", icon: Gauge },
];

export function Toolbar() {
  const presets = useStore((s) => s.presets);
  const mode = useStore((s) => s.site.mode);
  const running = useStore((s) => s.running);
  const stale = useStore((s) => s.stale);
  const hasResult = useStore((s) => s.result !== null);
  const assets = useStore((s) => s.site.assets.length);
  const { loadSite, run, setMode } = useStore.getState();
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

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo" aria-hidden>⚡</span>
        <div>
          <strong>Site Lab</strong>
          <span className="muted small block">emsbench simulator</span>
        </div>
      </div>
      <div className="modes" role="radiogroup" aria-label="Mode">
        {MODES.map(({ id, label, hint, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={mode === id} className={`mode ${mode === id ? "on" : ""}`}
            onClick={() => mode !== id && setMode(id)} title={hint}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <div className="toolbar-mid">
        <select id="preset" aria-label="Load an example" defaultValue="" onChange={(e) => {
          const p = presets.find((x) => x.id === e.target.value);
          if (p) loadSite(p.site);
          e.target.value = "";
        }}>
          <option value="" disabled>Load an example…</option>
          {presets.filter((p) => p.mode === mode).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="btn ghost" onClick={() => loadSite({ ...useStore.getState().site, name: "New site", assets: [] })}>New</button>
        <button className="btn ghost" onClick={exportJson} title="Save the site as a JSON file"><Download size={15} /> Export</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()} title="Open a site JSON file"><Upload size={15} /> Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }} />
      </div>
      <button className="btn primary run" onClick={() => run()} disabled={running || assets === 0}>
        {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
        {running ? "Simulating…" : hasResult && stale ? "Run again" : "Run simulation"}
      </button>
    </header>
  );
}
