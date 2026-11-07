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
    // Opening the app with #run runs the first example straight away (handy for demos).
    useStore.getState().init().then(() => {
      if (location.hash === "#run") useStore.getState().run();
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
