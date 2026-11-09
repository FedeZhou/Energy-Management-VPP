/** Tiny isometric toolkit for the scene illustrations.
 *  World axes: X runs right-down, Y runs left-down, Z is up (1 unit = 1 px on screen).
 *  Every illustration is drawn in a 168 x 140 viewBox around a ground point at (84, 100). */
export const VIEW_W = 168;
export const VIEW_H = 140;
export const GROUND = { x: 84, y: 100 };

const C = Math.cos(Math.PI / 6);
const S = 0.5;
export type P3 = [number, number, number];

export function screen([x, y, z]: P3): [number, number] {
  return [GROUND.x + (x - y) * C, GROUND.y + (x + y) * S - z];
}
export const poly = (ps: P3[]) => ps.map((p) => screen(p).map((v) => v.toFixed(1)).join(",")).join(" ");

interface Faces { top?: string; left?: string; right?: string }
const DEFAULT: Required<Faces> = { top: "var(--iso-top)", left: "var(--iso-left)", right: "var(--iso-right)" };

/** A box from (x, y, z) with size w (along X), d (along Y), h (up). Only the three faces
 *  that face the viewer are drawn: top, "left" (the +Y face) and "right" (the +X face). */
export function Box({ x, y, z = 0, w, d, h, c = {}, noTop }: {
  x: number; y: number; z?: number; w: number; d: number; h: number; c?: Faces; noTop?: boolean;
}) {
  const f = { ...DEFAULT, ...c };
  return (
    <g>
      <polygon points={poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} style={{ fill: f.left }} />
      <polygon points={poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} style={{ fill: f.right }} />
      {!noTop && <polygon points={poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} style={{ fill: f.top }} />}
    </g>
  );
}

/** A rectangle lying on a "left" face (the plane Y = yf). */
export const onLeft = (yf: number, x0: number, x1: number, z0: number, z1: number) =>
  poly([[x0, yf, z0], [x1, yf, z0], [x1, yf, z1], [x0, yf, z1]]);
/** A rectangle lying on a "right" face (the plane X = xf). */
export const onRight = (xf: number, y0: number, y1: number, z0: number, z1: number) =>
  poly([[xf, y0, z0], [xf, y1, z0], [xf, y1, z1], [xf, y0, z1]]);

/** Ground slab every object stands on. */
export function Tile({ selected, tint }: { selected?: boolean; tint?: string }) {
  const T = 38;
  return (
    <g className={`iso-tile ${selected ? "on" : ""}`}>
      <Box x={-T} y={-T} z={-4} w={2 * T} d={2 * T} h={4}
        c={{ top: tint ? `color-mix(in srgb, ${tint} 10%, var(--iso-ground))` : "var(--iso-ground)", left: "var(--iso-ground-edge)", right: "var(--iso-ground-side)" }} />
      <polygon className="iso-tile-ring" points={poly([[-T, -T, 0], [T, -T, 0], [T, T, 0], [-T, T, 0]])} />
    </g>
  );
}
