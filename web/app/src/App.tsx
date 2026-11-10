import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { Palette } from "./components/Palette";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { Results } from "./components/Results";
import { DataPanel } from "./components/DataPanel";
import { LearnPage } from "./components/LearnPage";
import { Guide, guideSeen, useGuide } from "./components/Guide";

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
      const preset = useStore.getState().presets.find((p) => h.includes(p.id));
      if (preset) useStore.getState().loadSite(preset.site);
      if (/(^|[#-])mpc($|-)/.test(h)) useStore.getState().updateSection("controller", { battery: "mpc" });
      if (h.includes("compare")) useStore.getState().compareForecasts();
      else if (h.includes("run")) useStore.getState().run();
      // #guide or #guide-4 opens the tour (at step 4); a first visit without a demo link opens it too.
      const g = /guide(?:-(\d+))?/.exec(h);
      if (g) {
        useGuide.getState().start();
        if (g[1]) useGuide.getState().go(Math.max(0, Number(g[1]) - 1));
      } else if (!h && !guideSeen() && !useStore.getState().error) useGuide.getState().start();
    });
    // Ctrl/Cmd+Enter runs the simulation from anywhere.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        const st = useStore.getState();
        if (!st.running && st.site.assets.length) { e.preventDefault(); st.run(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        {page === "learn" ? <LearnPage /> : (
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
      </div>
    </ReactFlowProvider>
  );
}
