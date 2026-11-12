import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  useStore as useFlowStore,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { AssetType } from "../api";
import { METER_ID, UTILITY_ID, useLive, useStore } from "../store";
import { stepLabel } from "../util";
import { edgeTypes } from "./FlowEdge";
import { Help } from "./Help";
import { nodeTypes } from "./Nodes";
import { sceneNodeTypes } from "./scene/SceneNodes";
import { sceneLayout, useView } from "../view";

export const DRAG_MIME = "application/x-emsbench-asset";

export function Canvas() {
  const assets = useStore((s) => s.site.assets);
  const meterPos = useStore((s) => s.meterPos);
  const selectedId = useStore((s) => s.selectedId);
  const { moveAsset, setMeterPos, select, addAsset, removeAsset } = useStore.getState();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const view = useView((v) => v.view);
  const setView = useView((v) => v.setView);
  const scene = view === "scene";

  // The utility sits left of everything so its edge to the meter never crosses an asset.
  const minX = assets.length ? Math.min(...assets.map((a) => a.ui.x)) : meterPos.x;
  const utilityPos = { x: Math.min(minX, meterPos.x) - 260, y: meterPos.y };
  const layout = useMemo(() => sceneLayout(assets), [assets]);
  const built = useMemo<Node[]>(
    () => [
      { id: UTILITY_ID, type: "utility", position: scene ? layout.utility : utilityPos, data: {}, deletable: false, selectable: false },
      { id: METER_ID, type: "meter", position: scene ? layout.meter : meterPos, data: {}, deletable: false, selected: selectedId === METER_ID },
      ...assets.map((a) => ({ id: a.id, type: "asset", position: scene ? layout.assets[a.id] : a.ui, data: {}, selected: a.id === selectedId })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, meterPos, selectedId, utilityPos.x, utilityPos.y, scene, layout],
  );
  const [nodes, setNodes] = useState<Node[]>(built);
  useEffect(() => setNodes(built), [built]);

  // Refit when the set of assets changes (new preset, add/remove) or the canvas is resized
  // (e.g. the results panel opens), but not on every parameter edit.
  const assetKey = assets.map((a) => a.id).join("|");
  const flowSize = useFlowStore((s) => `${Math.round(s.width)}x${Math.round(s.height)}`);
  useEffect(() => {
    // Room at the top for the clock and view switch, on the right for the zoom buttons.
    const t = setTimeout(() => fitView({ padding: { top: "56px", bottom: "24px", left: "32px", right: "56px" }, maxZoom: 1.1 }), 60);
    return () => clearTimeout(t);
  }, [assetKey, flowSize, fitView, view]);

  const edges = useMemo<Edge[]>(
    () => [
      { id: "e-utility", source: UTILITY_ID, target: METER_ID, type: "flow", data: { assetType: "grid" } },
      ...assets.map((a) => ({ id: `e-${a.id}`, source: a.id, target: METER_ID, type: "flow", data: { assetId: a.id, assetType: a.type } })),
    ],
    [assets],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      for (const c of changes) {
        if (c.type === "position" && c.position && c.dragging === false) {
          if (c.id === METER_ID) setMeterPos(c.position);
          else if (c.id !== UTILITY_ID) moveAsset(c.id, c.position);
        }
        if (c.type === "remove" && c.id !== METER_ID && c.id !== UTILITY_ID) removeAsset(c.id);
      }
    },
    [moveAsset, removeAsset, setMeterPos],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DRAG_MIME) as AssetType;
      if (!type) return;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // The scene places components itself; the drop point only matters for the diagram.
      const at = scene
        ? { x: meterPos.x + 300, y: meterPos.y - 120 + (assets.length % 5) * 90 }
        : { x: p.x - 118, y: p.y - 35 };
      addAsset(type, { x: Math.round(at.x), y: Math.round(at.y) });
    },
    [addAsset, screenToFlowPosition, scene, meterPos, assets.length],
  );

  return (
    <div className={`canvas ${view}`} data-tour="canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={scene ? sceneNodeTypes : nodeTypes}
        nodesDraggable={!scene}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => select(n.id === UTILITY_ID ? null : n.id)}
        onPaneClick={() => select(null)}
        nodesConnectable={false}
        deleteKeyCode={["Delete", "Backspace"]}
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="var(--grid-dot)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <Clock />
      <div className="canvas-tools">
        <div className="segmented" role="radiogroup" aria-label="Site view style" data-tour="view">
          <button role="radio" aria-checked={view === "diagram"} className={view === "diagram" ? "on" : ""} onClick={() => setView("diagram")}
            title="One-line diagram">Diagram</button>
          <button role="radio" aria-checked={view === "scene"} className={view === "scene" ? "on" : ""} onClick={() => setView("scene")}
            title="Illustrated view">Scene</button>
        </div>
        <Help topic="siteView" />
      </div>
      {assets.length === 0 && <div className="canvas-empty">Add components from the left panel</div>}
    </div>
  );
}

/** Simulated time at the playhead, so the site view reads as a snapshot of that moment. */
function Clock() {
  const live = useLive();
  const stale = useStore((s) => s.stale && s.result !== null);
  if (!live && !stale) return null;
  const r = useStore.getState().result!;
  return (
    <div className="canvas-clock">
      <span className={`dot ${stale ? "off" : ""}`} />
      {stale ? "Out of date: re-run to update" : stepLabel(r.time.start, r.time.step_minutes, live!.i)}
    </div>
  );
}
