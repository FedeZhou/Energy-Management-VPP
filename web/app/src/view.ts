import { create } from "zustand";

/** Which picture of the site the canvas shows: an illustrated isometric scene, or the
 *  one-line diagram. Same site, same data; only the drawing differs. */
export type View = "scene" | "diagram";

const KEY = "sitelab.view";
/** The one-line diagram is the default (engineers draw sites this way); the scene is the alternative. */
function initial(): View {
  try { return localStorage.getItem(KEY) === "scene" ? "scene" : "diagram"; } catch { return "diagram"; }
}

export const useView = create<{ view: View; setView: (v: View) => void }>((set) => ({
  view: initial(),
  setView(v) {
    try { localStorage.setItem(KEY, v); } catch { /* storage unavailable: fine */ }
    set({ view: v });
  },
}));

/** The scene arranges itself on an isometric grid (saved positions belong to the diagram):
 *  grid connection in the middle, utility behind it on the left, buildings and solar on the
 *  row behind, batteries and chargers on the rows in front. Cables then share short runs
 *  along the grid lines, like a busbar. Returns node top-left corners in flow coordinates. */
const CELL = 150; // world units between grid points
const NODE = { w: 168, groundY: 100 }; // matches scene/iso.tsx

function cell(i: number, j: number) {
  const x = (i - j) * CELL * Math.cos(Math.PI / 6);
  const y = (i + j) * CELL * 0.5;
  return { x: Math.round(x - NODE.w / 2), y: Math.round(y - NODE.groundY) };
}

/** Grid cells (i along the right-down axis, j along the left-down axis), chosen so that every
 *  cable can run along j to the hub's row (j = 0) and then along that row into the hub without
 *  passing under another component. Row j = 0 holds only the hub; the back row (j = -1) holds
 *  loads, solar and overflow chargers from i = 1; the front row (j = 1) holds up to five chargers
 *  at i >= 0 and the batteries at i < 0. The utility sits straight behind the hub at (0, -3) and
 *  has its own cable: it is on the grid side of the meter, so it must not share the site busbar.
 *  FlowEdge's isoPath draws exactly this route (j first, then i). */
export function sceneLayout(assets: { id: string; type: string }[]) {
  const pos: Record<string, { x: number; y: number }> = {};
  const loads = assets.filter((a) => a.type === "building" || a.type === "data_center" || a.type === "heat_pump" || a.type === "pv");
  const batteries = assets.filter((a) => a.type === "battery");
  const chargers = assets.filter((a) => a.type === "ev_charger");
  const perRow = 5;
  const front = chargers.slice(0, perRow), overflow = chargers.slice(perRow);
  [...loads, ...overflow].forEach((a, k) => { pos[a.id] = cell(1 + k, -1); });
  front.forEach((a, k) => { pos[a.id] = cell(k, 1); });
  batteries.forEach((a, k) => { pos[a.id] = cell(-1 - k, 1); });
  // Three rows back (not two): its label then clears the illustration on the back row's first cell.
  return { assets: pos, meter: cell(0, 0), utility: cell(0, -3) };
}
