import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "./store";
import { Toolbar } from "./components/Toolbar";
import { Palette } from "./components/Palette";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { Results } from "./components/Results";

export function App() {
  const ready = useStore((s) => s.catalog !== null);
  const error = useStore((s) => s.error);
  useEffect(() => {
    // Demo shortcuts: #operate opens Operate mode, and "run" in the hash runs the example
    // straight away (#run, #operate-run).
    useStore.getState().init().then(() => {
      const h = location.hash;
      if (h.includes("operate")) useStore.getState().setMode("operate");
      const preset = useStore.getState().presets.find((p) => h.includes(p.id));
      if (preset) useStore.getState().loadSite(preset.site);
      if (h.includes("run")) useStore.getState().run();
    });
  }, []);

  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar />
        <div className="workspace">
          <Palette />
          <main className="center">
            {ready ? <Canvas /> : <div className="canvas canvas-empty">{error ?? "Loading the simulator…"}</div>}
            <Results />
          </main>
          <Inspector />
        </div>
      </div>
    </ReactFlowProvider>
  );
}
