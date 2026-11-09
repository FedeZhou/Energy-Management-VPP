import { Box, onLeft, onRight, poly, screen, type P3 } from "./iso";

/* Original flat isometric illustrations, one per component type. Colours come from CSS
   variables (--iso-*) so they follow the light and dark themes. Live state (lit windows,
   solar output, battery charge, a car plugged in) is passed in as plain props. */

const glass = (lit: boolean) => ({ fill: lit ? "var(--iso-lit)" : "var(--iso-glass)" });

export function House({ lit }: { lit: boolean }) {
  const X = -24, Y = -15, W = 48, D = 30, H = 24, R = 17, o = 3;
  const ridgeY = Y + D / 2;
  return (
    <g>
      {/* back roof plane first: its far edge shows above the gable */}
      <polygon points={poly([[X - o, ridgeY, H + R], [X + W + o, ridgeY, H + R], [X + W + o, Y - o, H - 2], [X - o, Y - o, H - 2]])} style={{ fill: "var(--iso-roof-dark)" }} />
      <Box x={X} y={Y} w={W} d={D} h={H} noTop />
      <polygon points={poly([[X + W, Y, H], [X + W, Y + D, H], [X + W, ridgeY, H + R]])} style={{ fill: "var(--iso-right)" }} />
      {/* windows and door on the front (left) face, one window on the gable side */}
      <polygon points={onLeft(Y + D, X + 6, X + 15, 9, 18)} style={glass(lit)} />
      <polygon points={onLeft(Y + D, X + 33, X + 42, 9, 18)} style={glass(lit)} />
      <polygon points={onLeft(Y + D, X + 20, X + 27, 0, 15)} style={{ fill: "var(--iso-door)" }} />
      <polygon points={onRight(X + W, Y + 9, Y + 21, 9, 17)} style={glass(lit)} />
      {/* front roof plane and its edge */}
      <polygon points={poly([[X - o, Y + D + o, H - 2], [X + W + o, Y + D + o, H - 2], [X + W + o, ridgeY, H + R], [X - o, ridgeY, H + R]])} style={{ fill: "var(--iso-roof)" }} />
      <polygon points={poly([[X + W + o, Y + D + o, H - 2], [X + W + o, ridgeY, H + R], [X + W + o, ridgeY, H + R - 3], [X + W + o, Y + D + o, H - 5]])} style={{ fill: "var(--iso-roof-dark)" }} />
      <polygon points={poly([[X + W + o, ridgeY, H + R], [X + W + o, Y - o, H - 2], [X + W + o, Y - o, H - 5], [X + W + o, ridgeY, H + R - 3]])} style={{ fill: "var(--iso-roof-dark)" }} />
    </g>
  );
}

export function Apartments({ lit }: { lit: boolean }) {
  const X = -22, Y = -17, W = 44, D = 34, H = 62;
  const floors = [6, 20, 34, 48];
  return (
    <g>
      <Box x={X} y={Y} w={W} d={D} h={H} />
      <Box x={X + 8} y={Y + 6} z={H} w={12} d={10} h={6} />
      {floors.map((z, f) => [0, 1, 2].map((k) => (
        <polygon key={`l${f}${k}`} points={onLeft(Y + D, X + 5 + k * 13, X + 13 + k * 13, z, z + 9)} style={glass(lit && (f + k) % 3 !== 1)} />
      )))}
      {floors.map((z, f) => [0, 1].map((k) => (
        <polygon key={`r${f}${k}`} points={onRight(X + W, Y + 7 + k * 14, Y + 15 + k * 14, z, z + 9)} style={glass(lit && (f + k) % 2 === 0)} />
      )))}
    </g>
  );
}

export function Office({ lit }: { lit: boolean }) {
  const X = -26, Y = -18, W = 52, D = 36, H = 52;
  const bands = [5, 18, 31];
  return (
    <g>
      <Box x={X} y={Y} w={W} d={D} h={H} />
      <Box x={X + 30} y={Y + 4} z={H} w={14} d={12} h={5} c={{ top: "var(--iso-right)" }} />
      {bands.map((z) => (
        <g key={z}>
          <polygon points={onLeft(Y + D, X + 3, X + W - 3, z, z + 9)} style={glass(lit)} />
          <polygon points={onRight(X + W, Y + 3, Y + D - 3, z, z + 9)} style={glass(lit)} />
        </g>
      ))}
    </g>
  );
}

/** Server hall: low wide building with rack panels and rooftop cooling units. */
export function DataCenter({ lit }: { lit: boolean }) {
  const X = -30, Y = -20, W = 60, D = 40, H = 24;
  return (
    <g>
      <Box x={X} y={Y} w={W} d={D} h={H} />
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k}>
          <polygon points={onLeft(Y + D, X + 4 + k * 11, X + 12 + k * 11, 4, 19)} style={{ fill: "var(--iso-dark)" }} />
          {[7, 11, 15].map((z) => <polygon key={z} points={onLeft(Y + D, X + 6 + k * 11, X + 7.5 + k * 11, z, z + 1.2)}
            style={{ fill: lit || k % 2 === 0 ? "var(--c-batt)" : "var(--iso-vent)" }} />)}
        </g>
      ))}
      {[6, 11, 16].map((z) => <polygon key={z} points={onRight(X + W, Y + 6, Y + D - 6, z, z + 1.6)} style={{ fill: "var(--iso-vent)" }} />)}
      {[-20, -2, 16].map((x) => <Fan key={x} x={x} y={-8} z={H} />)}
    </g>
  );
}

/** Cooling plant: a low block covered in fans. */
export function Cooling() {
  const X = -26, Y = -18, W = 52, D = 36, H = 18;
  return (
    <g>
      <Box x={X} y={Y} w={W} d={D} h={H} />
      {[5, 10].map((z) => <polygon key={z} points={onRight(X + W, Y + 5, Y + D - 5, z, z + 1.6)} style={{ fill: "var(--iso-vent)" }} />)}
      {[5, 10].map((z) => <polygon key={`l${z}`} points={onLeft(Y + D, X + 5, X + W - 5, z, z + 1.6)} style={{ fill: "var(--iso-vent)" }} />)}
      {[[-14, -8], [8, -8], [-14, 8], [8, 8]].map(([x, y]) => <Fan key={`${x}${y}`} x={x} y={y} z={H} flat />)}
    </g>
  );
}

function Fan({ x, y, z, flat }: { x: number; y: number; z: number; flat?: boolean }) {
  const h = flat ? 1 : 6;
  const [cx, cy] = screen([x + 6, y + 6, z + h]);
  return (
    <g>
      {!flat && <Box x={x} y={y} z={z} w={12} d={12} h={h} />}
      <ellipse cx={cx} cy={cy} rx={8.5} ry={4.9} style={{ fill: "var(--iso-dark)" }} />
      <ellipse cx={cx} cy={cy} rx={2} ry={1.2} style={{ fill: "var(--iso-steel)" }} />
    </g>
  );
}

/** Solar array: 2-3 tilted panels per row, one or two rows. `shine` 0-1 brightens them. */
export function Solar({ panels, rows, shine }: { panels: number; rows: number; shine: number }) {
  const totalW = 58, gap = 3, pw = (totalW - gap * (panels - 1)) / panels;
  const rowYs = rows === 2 ? [-20, 8] : [-6];
  return (
    <g>
      {rowYs.map((ry) => Array.from({ length: panels }, (_, k) => {
        const x0 = -totalW / 2 + k * (pw + gap), x1 = x0 + pw;
        const back: P3[] = [[x0, ry, 22], [x1, ry, 22]];
        const front: P3[] = [[x1, ry + 14, 9], [x0, ry + 14, 9]];
        const leg = (p: P3) => { const [a, b] = screen(p); const [c, d] = screen([p[0], p[1], 0]); return <line x1={a} y1={b} x2={c} y2={d} className="iso-leg" />; };
        const cells = [1, 2].map((t) => {
          const xa = x0 + (pw * t) / 3;
          const [a, b] = screen([xa, ry, 22]); const [c, d] = screen([xa, ry + 14, 9]);
          return <line key={t} x1={a} y1={b} x2={c} y2={d} className="iso-cell" />;
        });
        const [m1, m2] = screen([x0, ry + 7, 15.5]); const [m3, m4] = screen([x1, ry + 7, 15.5]);
        return (
          <g key={`${ry}-${k}`}>
            {leg([x0 + 2, ry + 1, 21])}{leg([x1 - 2, ry + 1, 21])}
            <polygon points={poly([...back, ...front])} className="iso-panel" />
            {cells}
            <line x1={m1} y1={m2} x2={m3} y2={m4} className="iso-cell" />
            {shine > 0.02 && <polygon points={poly([...back, ...front])} style={{ fill: "#fff", opacity: 0.08 + 0.22 * shine }} />}
            {leg([x0 + 2, ry + 13, 10])}{leg([x1 - 2, ry + 13, 10])}
          </g>
        );
      }))}
    </g>
  );
}

/** Battery cabinets with a charge gauge on the front face. */
export function Battery({ cabinets, soc, active }: { cabinets: number; soc: number; active: boolean }) {
  const w = cabinets === 1 ? 24 : 18, gap = 3, total = cabinets * w + (cabinets - 1) * gap;
  return (
    <g>
      {Array.from({ length: cabinets }, (_, k) => {
        const x = -total / 2 + k * (w + gap), y = -13, d = 26, h = cabinets === 1 ? 30 : 34;
        return (
          <g key={k}>
            <Box x={x} y={y} w={w} d={d} h={h} />
            {[8, 13, 18, 23].map((z) => <polygon key={z} points={onRight(x + w, y + 5, y + d - 5, z, z + 1.6)} style={{ fill: "var(--iso-vent)" }} />)}
            <polygon points={onLeft(y + d, x + 5, x + w - 5, 6, h - 6)} style={{ fill: "var(--iso-dark)" }} />
            <polygon points={onLeft(y + d, x + 6.5, x + w - 6.5, 7.5, 7.5 + (h - 15) * Math.max(0, Math.min(1, soc)))}
              style={{ fill: "var(--c-batt)", opacity: active ? 1 : 0.85 }} />
          </g>
        );
      })}
    </g>
  );
}

/** Charging post, plus a car when one is plugged in (otherwise an empty bay). */
export function Charger({ car, charging }: { car: boolean; charging: boolean }) {
  const bay = poly([[-12, -14, 0], [30, -14, 0], [30, 14, 0], [-12, 14, 0]]);
  const [px, py] = screen([-24, -12, 19]);
  const [cx, cy] = screen([-12, 2, 9]);
  const [gx, gy] = screen([-20, 4, 0]);
  return (
    <g>
      <polygon points={bay} className="iso-bay" />
      <Box x={-28} y={-16} w={6} d={7} h={32} c={{ top: "var(--iso-top)" }} />
      <polygon points={onLeft(-9, -27, -23, 20, 28)} style={{ fill: charging ? "var(--c-batt)" : "var(--iso-dark)" }} />
      {car && (
        <>
          <path d={`M${px},${py} Q${gx},${gy} ${cx},${cy}`} className="iso-cable" />
          <Car />
        </>
      )}
    </g>
  );
}

function Car() {
  const body = { top: "color-mix(in srgb, var(--c-ev) 78%, white)", left: "var(--c-ev)", right: "color-mix(in srgb, var(--c-ev) 72%, black)" };
  const wheel = (p: P3) => { const [x, y] = screen(p); return <ellipse cx={x} cy={y} rx={3.6} ry={4.2} style={{ fill: "var(--iso-tyre)" }} />; };
  return (
    <g>
      {wheel([-6, 1, 3])}{wheel([20, 1, 3])}
      <Box x={-12} y={-9} z={3} w={42} d={20} h={9} c={body} />
      {/* cabin: a box whose front and back faces are glass */}
      <Box x={-3} y={-7} z={12} w={22} d={16} h={8} c={{ top: body.top, left: "var(--iso-car-glass)", right: "var(--iso-car-glass)" }} />
      <polygon points={onLeft(11, -12, 30, 7, 8.5)} style={{ fill: "color-mix(in srgb, var(--c-ev) 60%, black)" }} />
      {wheel([-6, 11, 3])}{wheel([20, 11, 3])}
    </g>
  );
}

/** Transformer / meter cabinet for the grid connection. */
export function Transformer() {
  const X = -20, Y = -14, W = 40, D = 28, H = 26;
  const [bx, by] = screen([X + 20, Y + D, 14]);
  return (
    <g>
      <Box x={X} y={Y} w={W} d={D} h={H} />
      {[-12, -2, 8].map((x) => <Box key={x} x={x} y={-3} z={H} w={4} d={4} h={7} c={{ top: "var(--iso-steel)", left: "var(--iso-dark)", right: "var(--iso-dark)" }} />)}
      {[6, 11, 16, 21].map((z) => <polygon key={z} points={onRight(X + W, Y + 5, Y + D - 5, z, z + 1.6)} style={{ fill: "var(--iso-vent)" }} />)}
      <polygon points={onLeft(Y + D, X + 4, X + 15, 5, 22)} style={{ fill: "var(--iso-vent)" }} />
      <path d={`M${bx + 2},${by - 7} l-5,7 h4 l-2,6 l6,-8 h-4 z`} style={{ fill: "var(--c-grid)" }} />
    </g>
  );
}

/** Lattice transmission tower with cables running out of the frame. */
export function Pylon() {
  const seg = (a: P3, b: P3, k: string, cls = "iso-steel") => {
    const [x1, y1] = screen(a); const [x2, y2] = screen(b);
    return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} className={cls} />;
  };
  const half = (z: number) => 11 - (8 * z) / 86; // tower narrows towards the top
  const levels = [0, 18, 34, 48, 60, 72, 86];
  const lines: React.ReactNode[] = [];
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    lines.push(seg([sx * half(0), sy * half(0), 0], [sx * half(86), sy * half(86), 86], `leg${sx}${sy}`, "iso-steel thick"));
  }
  levels.slice(0, -1).forEach((z, i) => {
    const z2 = levels[i + 1];
    lines.push(seg([-half(z), half(z), z], [half(z2), half(z2), z2], `fl${i}`));   // front-left face
    lines.push(seg([half(z), half(z), z], [-half(z2), half(z2), z2], `fl2${i}`));
    lines.push(seg([half(z), half(z), z], [half(z2), -half(z2), z2], `fr${i}`));   // front-right face
    lines.push(seg([half(z), -half(z), z], [half(z2), half(z2), z2], `fr2${i}`));
  });
  const arms = [62, 76];
  arms.forEach((z, i) => {
    const reach = i === 0 ? 26 : 20;
    lines.push(seg([-reach, 0, z], [reach, 0, z], `arm${z}`, "iso-steel thick"));
    for (const x of [-reach, reach]) {
      lines.push(seg([x, 0, z], [x, 0, z - 6], `ins${z}${x}`, "iso-insulator"));
    }
  });
  const wire = (x: number, z: number) => {
    const [a, b] = screen([x, 0, z - 6]);
    return <path key={`w${x}${z}`} d={`M${a},${b} q-30,${-4} -60,${-30}`} className="iso-wire" />;
  };
  return <g>{lines}{arms.flatMap((z, i) => [-1, 1].map((s) => wire(s * (i === 0 ? 26 : 20), z)))}</g>;
}


/** Heat pump: outdoor unit with a fan (spinning while it runs) next to a hot-water tank whose gauge shows
 *  how full of heat it is. */
export function HeatPumpArt({ running, tank }: { running: boolean; tank: number }) {
  const X = -30, Y = -10, W = 24, D = 16, H = 20;
  const face = Y + D; // the unit's front (left) face
  const ring = (r: number) => poly(Array.from({ length: 20 }, (_, k) => {
    const a = (k / 20) * 2 * Math.PI;
    return [X + W / 2 + r * Math.cos(a), face, H / 2 + r * Math.sin(a)] as P3;
  }));
  const [hx, hy] = screen([X + W / 2, face, H / 2]);
  const level = Math.max(0, Math.min(1, tank));
  const TX = 4, TY = -12, TW = 14, TD = 14, TH = 34;
  return (
    <g>
      <Box x={X} y={Y} w={W} d={D} h={H} />
      <polygon points={ring(7.5)} style={{ fill: "var(--iso-dark)" }} />
      <polygon points={ring(6)} style={{ fill: "var(--iso-vent)" }} />
      <g className={running ? "hp-fan on" : "hp-fan"} style={{ transformOrigin: `${hx}px ${hy}px` }}>
        <line x1={hx - 5} y1={hy} x2={hx + 5} y2={hy} className="iso-steel thick" />
        <line x1={hx} y1={hy - 5} x2={hx} y2={hy + 5} className="iso-steel thick" />
      </g>
      {[4, 8, 12, 16].map((z) => <polygon key={z} points={onRight(X + W, Y + 3, Y + D - 3, z, z + 1.4)} style={{ fill: "var(--iso-vent)" }} />)}
      <Box x={TX} y={TY} w={TW} d={TD} h={TH} c={{ top: "var(--iso-top)" }} />
      <polygon points={onLeft(TY + TD, TX + 4, TX + TW - 4, 4, TH - 4)} style={{ fill: "var(--iso-dark)" }} />
      <polygon points={onLeft(TY + TD, TX + 5, TX + TW - 5, 5, 5 + (TH - 10) * level)} style={{ fill: "var(--c-heat)" }} />
    </g>
  );
}
