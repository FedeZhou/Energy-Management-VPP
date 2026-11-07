import { useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import type { AssetType } from "../api";
import { UTILITY_ID, useLive, useStore } from "../store";
import { ASSET_COLOR, kw } from "../util";

function box(n: InternalNode) {
  const { x, y } = n.internals.positionAbsolute;
  const w = n.measured.width ?? 0;
  const h = n.measured.height ?? 0;
  return { cx: x + w / 2, cy: y + h / 2, w, h };
}

// Point where the line from a's centre towards b leaves a's rectangle.
function exitPoint(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (!dx && !dy) return { x: a.cx, y: a.cy };
  const s = Math.min(dx ? a.w / 2 / Math.abs(dx) : Infinity, dy ? a.h / 2 / Math.abs(dy) : Infinity);
  return { x: a.cx + dx * s, y: a.cy + dy * s };
}

/** Straight edge between an asset and the grid connection.
 *  During playback: thickness = power, moving dashes = direction, label = kW. */
export function FlowEdge({ id, source, target, data }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const live = useLive();
  const maxPower = useStore((st) => st.maxPower);
  const assetType = (data?.assetType as AssetType | "grid") ?? "grid";
  if (!s || !t) return null;

  const a = box(s);
  const b = box(t);
  const p1 = exitPoint(a, b);
  const p2 = exitPoint(b, a);
  const d = `M${p1.x},${p1.y} L${p2.x},${p2.y}`;

  // Power on this edge. Assets: + = takes from the bus (flow target -> source).
  // Utility edge: grid_kw + = import (flow source -> target).
  let p = 0;
  if (live) {
    p = source === UTILITY_ID
      ? live.r.result.site.grid_kw[live.i]
      : -(live.r.result.assets[String(data?.assetId)]?.power_kw[live.i] ?? 0);
  }
  const on = live !== null && Math.abs(p) > 0.05;
  const width = 2 + 9 * Math.min(1, Math.abs(p) / maxPower);
  const color = ASSET_COLOR[assetType];

  return (
    <g>
      <path id={id} d={d} className="edge-base" />
      {on && (
        <>
          <path d={d} className="edge-flow" stroke={color} strokeWidth={width}
            style={{ animationDirection: p > 0 ? "normal" : "reverse" }} />
          <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 8} className="edge-label" textAnchor="middle">
            {kw(Math.abs(p))}
          </text>
        </>
      )}
    </g>
  );
}

export const edgeTypes = { flow: FlowEdge };
