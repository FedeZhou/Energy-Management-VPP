import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { BookOpen, CircleHelp, Database, Download, FilePlus2, Loader2, Moon, Play, RotateCw, Scale, Square, Sun, Upload } from "lucide-react";
import { LIVE_APP_URL, STATIC_DEMO, type Mode, type Site } from "../api";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { siteProblems } from "../validate";
import { FIT_VIEW } from "./Canvas";
import { useGuide } from "./Guide";
import { Help, useHelp } from "./Help";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "plan", label: "Plan", hint: "Months to a year, hourly: costs, savings, battery wear" },
  { id: "operate", label: "Operate", hint: "Hours to days, 1–15 min steps: EVs, fuses, phases" },
];

function Mark() {
  // Three bars on a baseline: load, storage, supply. Drawn in ink, no container.
  return (
    <svg className="brand-mark" viewBox="0 0 16 16" aria-hidden>
      <g fill="currentColor">
        <rect x="1.5" y="8" width="3" height="7" />
        <rect x="6.5" y="2" width="3" height="13" />
        <rect x="11.5" y="5" width="3" height="10" />
      </g>
    </svg>
  );
}

/** Light/dark switch. The icon shows the theme a click switches to; the choice is remembered. */
function ThemeSwitch() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${next} view`} title={`Switch to ${next} view`}>
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/** Time since the running simulation started, as m:ss, ticking every second. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <span className="num elapsed">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

export function Toolbar() {
  const presets = useStore((s) => s.presets);
  const mode = useStore((s) => s.site.mode);
  const name = useStore((s) => s.site.name);
  const job = useStore((s) => s.job);
  const stale = useStore((s) => s.stale);
  const hasResult = useStore((s) => s.result !== null);
  const assets = useStore((s) => s.site.assets.length);
  // On Learn, the lab-only controls (mode, examples, files, run) step aside and Learn shows as the current page.
  const onLearn = useStore((s) => s.page === "learn");
  const { loadSite, run, compareForecasts, setMode, cancel } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  // Values the engine would reject (e.g. -5 days) block Run, with the reason on the button.
  const site = useStore((s) => s.site);
  const catalog = useStore((s) => s.catalog);
  const problems = useMemo(() => (catalog ? siteProblems(site, catalog) : []), [site, catalog]);
  const blocked = problems.length > 0 ? `Fix first: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}` : "";

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

  // The logo goes home: the lab view with the site settings, nothing open on top, the site framed.
  // The site itself (and any result) is kept: home is a place, not a reset.
  const { fitView } = useReactFlow();
  const goHome = () => {
    const wasLab = useStore.getState().page === "lab";
    history.replaceState(null, "", location.pathname + location.search);
    useStore.setState({ page: "lab", dataPanelOpen: false, selectedId: null });
    useHelp.getState().close();
    useGuide.getState().go(null);
    if (wasLab) void fitView({ ...FIT_VIEW, duration: 250 }); // coming back from Learn, the canvas fits as it mounts
  };

  const again = hasResult && stale;
  const running = job !== null;
  return (
    <header className={`topbar ${onLearn ? "on-learn" : ""}`}>
      <div className="brand" title={name}>
        <a className="brand-home" href="./" title="Back to the lab" aria-label="Site Lab: back to the lab"
          onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); goHome(); }}>
          <Mark />
          <span className="brand-name">Site Lab</span>
        </a>
        <span className="crumb-sep" aria-hidden>/</span>
        <span className="crumb">{onLearn ? "Learn" : name}</span>
        {STATIC_DEMO && (
          <a className="demo-pill" href={LIVE_APP_URL} target="_blank" rel="noreferrer"
            title="This public demo runs the example sites with pre-computed results. Open the live app to change and simulate anything.">
            Demo · open the live app
          </a>
        )}
      </div>
      <div className="tb-group lab-only">
        <div className="segmented" role="radiogroup" aria-label="Mode" data-tour="mode">
          {MODES.map(({ id, label, hint }) => (
            <button key={id} role="radio" aria-checked={mode === id} className={mode === id ? "on" : ""}
              onClick={() => mode !== id && setMode(id)} title={hint}>
              {label}
            </button>
          ))}
        </div>
        <Help topic="modes" />
      </div>
      <div className="tb-sep lab-only" />
      <div className="tb-group lab-only" data-tour="examples">
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
      <div className="tb-spacer" />
      <div className="tb-group tb-links">
        <button className={`btn ghost ${onLearn ? "on" : ""}`} aria-current={onLearn ? "page" : undefined} data-tour="learn" onClick={() => useStore.getState().setPage("learn")}
          title="Learn: general knowledge about grid flexibility, and how Site Lab works" aria-label="Learn">
          <BookOpen size={15} /><span className="lbl">Learn</span>
        </button>
        <button className="btn ghost" onClick={() => useGuide.getState().start()} data-tour="guide"
          title="Guide: a short tour of the interface" aria-label="Guide">
          <CircleHelp size={15} /><span className="lbl">Guide</span>
        </button>
        <button className="btn ghost" title="Where the data comes from" aria-label="Data sources" data-tour="data"
          onClick={() => useStore.getState().setDataPanel(true)}>
          <Database size={15} /><span className="lbl">Data</span>
        </button>
      </div>
      <ThemeSwitch />
      <div className="tb-sep lab-only" />
      <div className="tb-group tb-actions lab-only">
        <button className="btn" onClick={() => compareForecasts()} disabled={running || assets === 0 || !!blocked}
          aria-label="Compare forecasts"
          title="Compare forecasts: run twice, with perfect forecasts and with what a real controller would know (yesterday's load, the day-ahead weather forecast, prices only once published, cars only once plugged in)">
          {job?.kind === "compare" ? <Loader2 size={14} className="spin" /> : <Scale size={14} />}
          <span className="lbl">{job?.kind === "compare" ? "Comparing" : "Compare forecasts"}</span>
          {job?.kind === "compare" && <Elapsed since={job.started} />}
        </button>
        {running ? (
          <button className="btn danger-outline" onClick={cancel} title="Stop the simulation (the previous result stays)" data-tour="run">
            <Square size={12} fill="currentColor" /> Stop
            {job.kind === "run" && <><Loader2 size={13} className="spin" /><Elapsed since={job.started} /></>}
          </button>
        ) : (
          <button className="btn primary" data-tour="run" onClick={() => run()} disabled={assets === 0 || !!blocked} title={blocked || "Run simulation (Ctrl+Enter)"}>
            {again ? <RotateCw size={14} /> : <Play size={14} />}
            {again ? "Re-run" : "Run"}
          </button>
        )}
      </div>
    </header>
  );
}
