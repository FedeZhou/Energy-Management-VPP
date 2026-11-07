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
import { METER_ID, UTILITY_ID, useStore } from "../store";
import { edgeTypes } from "./FlowEdge";
import { nodeTypes } from "./Nodes";

export const DRAG_MIME = "application/x-emsbench-asset";

export function Canvas() {
  const assets = useStore((s) => s.site.assets);
  const meterPos = useStore((s) => s.meterPos);
  const selectedId = useStore((s) => s.selectedId);
  const { moveAsset, setMeterPos, select, addAsset, removeAsset } = useStore.getState();
  const { screenToFlowPosition, fitView } = useReactFlow();

  // The utility sits left of everything so its edge to the meter never crosses an asset.
  const minX = assets.length ? Math.min(...assets.map((a) => a.ui.x)) : meterPos.x;
  const utilityPos = { x: Math.min(minX, meterPos.x) - 260, y: meterPos.y };
  const built = useMemo<Node[]>(
    () => [
      { id: UTILITY_ID, type: "utility", position: utilityPos, data: {}, deletable: false, selectable: false },
      { id: METER_ID, type: "meter", position: meterPos, data: {}, deletable: false, selected: selectedId === METER_ID },
      ...assets.map((a) => ({ id: a.id, type: "asset", position: a.ui, data: {}, selected: a.id === selectedId })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, meterPos, selectedId, utilityPos.x, utilityPos.y],
  );
  const [nodes, setNodes] = useState<Node[]>(built);
  useEffect(() => setNodes(built), [built]);

  // Refit when the set of assets changes (new preset, add/remove) or the canvas is resized
  // (e.g. the results panel opens), but not on every parameter edit.
  const assetKey = assets.map((a) => a.id).join("|");
  const flowSize = useFlowStore((s) => `${Math.round(s.width)}x${Math.round(s.height)}`);
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.1 }), 60);
    return () => clearTimeout(t);
  }, [assetKey, flowSize, fitView]);

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
      addAsset(type, { x: Math.round(p.x - 100), y: Math.round(p.y - 30) });
    },
    [addAsset, screenToFlowPosition],
  );

  return (
    <div className="canvas" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
        <Background gap={24} size={1} color="var(--grid-dot)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      {assets.length === 0 && (
        <div className="canvas-empty">Drag a building, solar panels, a battery or an EV charger here to start.</div>
      )}
    </div>
  );
}
