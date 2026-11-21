import { lazy, Suspense, useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { Palette } from "./components/Palette";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { Results } from "./components/Results";
import { DataPanel } from "./components/DataPanel";
import { Guide, guideSeen, useGuide } from "./components/Guide";
import { HelpPopover, useHelp } from "./components/Help";
import { useView } from "./view";

// The Learn page (with KaTeX and every article) loads only when opened, so the lab starts light.
const LearnPage = lazy(() => import("./components/LearnPage").then((m) => ({ default: m.LearnPage })));

export function App() {
  const ready = useStore((s) => s.catalog !== null);
  const error = useStore((s) => s.error);
  const page = useStore((s) => s.page);
  useEffect(() => {
    // Demo shortcuts: #operate opens Operate mode, and "run" in the hash runs the example
    // straight away (#run, #operate-run). "mpc" switches the battery to MPC; "compare" runs
    // Compare forecasts instead (#operate_home_ev-mpc-compare).
    useStore.getState().init().then(() => {
      const h = location.hash;
      if (h.includes("operate")) useStore.getState().setMode("operate");
      // The longest preset id contained in the hash: "plan_home" must not win over "plan_home_de_ev".
      const preset = useStore.getState().presets.filter((p) => h.includes(p.id))
        .sort((a, b) => b.id.length - a.id.length)[0];
      if (preset) useStore.getState().loadSite(preset.site);
      // "scene" or "diagram" in the hash picks the site view for this visit (not remembered).
      if (/(^|[#-])scene($|-)/.test(h)) useView.setState({ view: "scene" });
      if (/(^|[#-])diagram($|-)/.test(h)) useView.setState({ view: "diagram" });
      if (/(^|[#-])mpc($|-)/.test(h)) useStore.getState().updateSection("controller", { battery: "mpc" });
      // "-plan" picks the plain plan-following optimiser (the default is "cautious"), to reproduce older results.
      if (/(^|[#-])plan($|-)/.test(h)) useStore.getState().updateSection("controller", { mpc_execution: "plan" });
      if (h.includes("compare")) useStore.getState().compareForecasts();
      else if (h.includes("run")) useStore.getState().run();
      // #guide or #guide-4 opens the tour (at step 4); a first visit without a demo link opens it too.
      const g = /guide(?:-(\d+))?/.exec(h);
      if (g) {
        useGuide.getState().start();
        if (g[1]) useGuide.getState().go(Math.max(0, Number(g[1]) - 1));
      } else if (!h && !guideSeen() && !useStore.getState().error) useGuide.getState().start();
    });
    // Ctrl/Cmd+Enter runs the simulation from anywhere. Escape leaves a text field; with nothing open on
    // top (dialog, tour, help), a second Escape clears the selection and shows the site settings.
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        if (!st.running && st.site.assets.length) { e.preventDefault(); st.run(); }
        return;
      }
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const a = document.activeElement;
      if (a instanceof HTMLElement && a.matches("input, textarea, select")) { a.blur(); return; }
      const overlay = st.dataPanelOpen || useGuide.getState().step !== null || useHelp.getState().topic !== null;
      if (!overlay && st.page === "lab" && st.selectedId !== null) st.select(null);
    };
    // A scroll wheel over a focused number field would change its value while the user meant to scroll
    // the panel: let the field go first, so the wheel scrolls.
    const onWheel = (e: WheelEvent) => {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && a.type === "number" && e.target === a) a.blur();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("wheel", onWheel); };
  }, []);

  // The browser tab names what is open: the site in the lab, or Learn.
  const siteName = useStore((s) => s.site.name);
  useEffect(() => {
    document.title = page === "learn" ? "Learn · Site Lab" : `${siteName || "Untitled site"} · Site Lab`;
  }, [page, siteName]);

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        {page === "learn" ? <Suspense fallback={<div className="page-loading">Loading…</div>}><LearnPage /></Suspense> : (
          <div className="workspace">
            <Palette />
            <main className="center">
              {ready ? <Canvas /> : <div className="canvas canvas-empty">{error ?? "Loading…"}</div>}
              <Results />
            </main>
            <Inspector />
          </div>
        )}
        <DataPanel />
        <Guide />
        <HelpPopover />
      </div>
    </ReactFlowProvider>
  );
}
