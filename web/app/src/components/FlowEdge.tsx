import { getSmoothStepPath, Position, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import type { AssetType } from "../api";
import { UTILITY_ID, useLive, useStore } from "../store";
import { ASSET_COLOR } from "../util";
import { useView } from "../view";
import { GROUND } from "./scene/iso";

function box(n: InternalNode) {
  const { x, y } = n.internals.positionAbsolute;
  const w = n.measured.width ?? 0;
  const h = n.measured.height ?? 0;
  return { cx: x + w / 2, cy: y + h / 2, w, h };
}

/** Where a feeder enters the hub's side: straight across when the asset faces that side,
 *  otherwise spread along it so neighbouring feeders do not merge into one line. */
const entry = (d: number, lim: number) => (Math.abs(d) <= lim ? d : Math.max(-lim, Math.min(lim, d * 0.35)));

/** Right-angle route from an asset to the grid connection, like a single-line diagram.
 *  Assets above or below the hub (boxes overlap horizontally) wire into its top or bottom;
 *  everything else wires into its left or right side. */
function route(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const dx = a.cx - b.cx;
  const dy = a.cy - b.cy;
  const vertical = Math.abs(dx) < (a.w + b.w) / 2 && Math.abs(dy) > (a.h + b.h) / 2;
  if (vertical) {
    const above = dy < 0;
    return {
      sourceX: a.cx, sourceY: above ? a.cy + a.h / 2 : a.cy - a.h / 2,
      sourcePosition: above ? Position.Bottom : Position.Top,
      targetX: b.cx + entry(dx, b.w / 2 - 20), targetY: above ? b.cy - b.h / 2 : b.cy + b.h / 2,
      targetPosition: above ? Position.Top : Position.Bottom,
    };
  }
  const left = dx < 0;
  return {
    sourceX: left ? a.cx + a.w / 2 : a.cx - a.w / 2, sourceY: a.cy,
    sourcePosition: left ? Position.Right : Position.Left,
    targetX: left ? b.cx - b.w / 2 : b.cx + b.w / 2, targetY: b.cy + entry(dy, b.h / 2 - 12),
    targetPosition: left ? Position.Left : Position.Right,
  };
}

/** Scene cable: along the ground on the two isometric axes, between the ground points of
 *  the two illustrations (each drawn with its ground point at GROUND inside the node).
 *  It runs first along the left-down axis (j) to the hub's row, then along the right-down axis
 *  (i) into the hub, so cables share the hub's row like a busbar and never pass under another
 *  component (sceneLayout keeps that row free). */
function isoPath(s: InternalNode, t: InternalNode): string {
  const ground = (n: InternalNode) => ({
    x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
    y: n.internals.positionAbsolute.y + GROUND.y,
  });
  const a = ground(s), b = ground(t);
  const cos = Math.cos(Math.PI / 6);
  const dx = b.x - a.x, dy = b.y - a.y;
  // Screen offset = di * (cos, 0.5) + dj * (-cos, 0.5), in world units; solve for the j part.
  const dj = (2 * dy - dx / cos) / 2;
  const cx = a.x - dj * cos, cy = a.y + dj * 0.5;
  return `M${a.x},${a.y} L${cx},${cy} L${b.x},${b.y}`;
}

/** Wire between an asset and the grid connection. During playback the wire is tinted in the
 *  asset's colour, moving dots show the direction and their weight scales with power. */
export function FlowEdge({ id, source, target, data }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const live = useLive();
  const maxPower = useStore((st) => st.maxPower);
  const assetType = (data?.assetType as AssetType | "grid") ?? "grid";
  const scene = useView((v) => v.view) === "scene";
  if (!s || !t) return null;

  const d = scene ? isoPath(s, t) : getSmoothStepPath({ ...route(box(s), box(t)), borderRadius: 10, offset: 18 })[0];

  // Power on this edge. Assets: + = takes from the bus (flow target -> source).
  // Utility edge: grid_kw + = import (flow source -> target).
  let p = 0;
  if (live) {
    p = source === UTILITY_ID
      ? live.r.result.site.grid_kw[live.i]
      : -(live.r.result.assets[String(data?.assetId)]?.power_kw[live.i] ?? 0);
  }
  const on = live !== null && Math.abs(p) > 0.05;
  const width = 3 + 4 * Math.min(1, Math.abs(p) / maxPower);
  const color = ASSET_COLOR[assetType];

  return (
    <g>
      <path id={id} d={d} className={scene ? "edge-base cable" : "edge-base"} />
      {on && (
        <>
          <path d={d} className="edge-tint" stroke={color} strokeWidth={2} />
          <path d={d} className="edge-flow" stroke={color} strokeWidth={width}
            style={{ animationDirection: p > 0 ? "normal" : "reverse" }} />
        </>
      )}
    </g>
  );
}

export const edgeTypes = { flow: FlowEdge };
