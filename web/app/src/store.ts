import { create } from "zustand";
import { api, type Asset, type AssetType, type Catalog, type Mode, type Preset, type Profiles, type SimResponse, type Site } from "./api";
import { MODE_DEFAULTS, timeAt } from "./util";

export const METER_ID = "__meter";
export const UTILITY_ID = "__utility";

interface State {
  catalog: Catalog | null;
  profiles: Profiles | null;
  presets: Preset[];
  site: Site;
  meterPos: { x: number; y: number };
  selectedId: string | null;
  result: SimResponse | null;
  stale: boolean;
  running: boolean;
  error: string | null;
  cursor: number;
  playing: boolean;
  speed: number; // simulated hours per second
  maxPower: number;
  collapsed: boolean;

  init: () => Promise<void>;
  setMode: (mode: Mode) => void;
  setCollapsed: (c: boolean) => void;
  loadSite: (site: Site) => void;
  updateSite: (patch: Partial<Site>) => void;
  updateSection: <K extends "grid" | "tariff" | "controller">(key: K, patch: Partial<Site[K]>) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  addAsset: (type: AssetType, pos: { x: number; y: number }) => void;
  removeAsset: (id: string) => void;
  moveAsset: (id: string, pos: { x: number; y: number }) => void;
  setMeterPos: (pos: { x: number; y: number }) => void;
  select: (id: string | null) => void;
  run: () => Promise<void>;
  setCursor: (i: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
}

const EMPTY_SITE: Site = {
  name: "New site",
  mode: "plan",
  start: "2024-08-01",
  days: 365,
  step_minutes: 60,
  grid: { import_limit_kw: null, export_limit_kw: null, fuse_a: null },
  tariff: { price_profile: "cl2022/tou", price_adder: 0, export_price: 0, demand_charge_per_kw_month: 0 },
  controller: { battery: "self_consumption", peak_threshold_kw: 10, ev: "as_fast_as_possible" },
  assets: [],
};

/** Where to put the grid-connection box: the centre of the assets, nudged outwards until it
 *  does not overlap any asset box (nodes are about 220 x 110 px). */
function centroid(assets: Asset[]): { x: number; y: number } {
  if (!assets.length) return { x: 300, y: 220 };
  const cx = assets.reduce((s, a) => s + a.ui.x, 0) / assets.length;
  const cy = assets.reduce((s, a) => s + a.ui.y, 0) / assets.length;
  const free = (x: number, y: number) =>
    assets.every((a) => Math.abs(a.ui.x - x) > 240 || Math.abs(a.ui.y - y) > 125);
  for (let r = 0; r <= 900; r += 30) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * 2 * Math.PI + Math.PI; // try the left side first
      const x = cx + r * Math.cos(ang);
      const y = cy + r * Math.sin(ang) * 0.6;
      if (free(x, y)) return { x: Math.round(x), y: Math.round(y) };
      if (r === 0) break;
    }
  }
  return { x: Math.round(cx), y: Math.round(cy) };
}

function maxPower(r: SimResponse): number {
  let m = 1;
  for (const s of Object.values(r.result.assets)) for (const v of s.power_kw ?? []) m = Math.max(m, Math.abs(v));
  for (const v of r.result.site.grid_kw) m = Math.max(m, Math.abs(v));
  return m;
}

export const useStore = create<State>((set, get) => ({
  catalog: null,
  profiles: null,
  presets: [],
  site: EMPTY_SITE,
  meterPos: centroid([]),
  selectedId: null,
  result: null,
  stale: false,
  running: false,
  error: null,
  cursor: 0,
  playing: false,
  speed: 4,
  maxPower: 1,
  collapsed: false,

  setCollapsed(c) {
    set({ collapsed: c });
  },

  async init() {
    try {
      const [catalog, profiles, presets] = await Promise.all([api.catalog(), api.profiles(), api.presets()]);
      set({ catalog, profiles, presets });
      const first = presets.find((p) => p.mode === "plan") ?? presets[0];
      if (first) get().loadSite(first.site);
    } catch (e) {
      set({ error: `Could not reach the simulator API. Is it running? (${(e as Error).message})` });
    }
  },

  setMode(mode) {
    const preset = get().presets.find((p) => p.mode === mode);
    if (preset) get().loadSite(preset.site);
    else set((s) => ({ site: { ...s.site, mode, ...MODE_DEFAULTS[mode] }, result: null, stale: false }));
  },

  loadSite(site) {
    set({ site, meterPos: centroid(site.assets), selectedId: null, result: null, stale: false, playing: false, cursor: 0 });
  },

  updateSite(patch) {
    set((s) => ({ site: { ...s.site, ...patch }, stale: s.result !== null }));
  },

  updateSection(key, patch) {
    set((s) => ({ site: { ...s.site, [key]: { ...s.site[key], ...patch } }, stale: s.result !== null }));
  },

  updateAsset(id, patch) {
    set((s) => ({
      site: { ...s.site, assets: s.site.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) },
      stale: s.result !== null || s.stale,
    }));
  },

  addAsset(type, pos) {
    const { catalog, site, profiles } = get();
    if (!catalog) return;
    const spec = catalog.assets[type];
    let n = 1;
    while (site.assets.some((a) => a.id === `${type}_${n}`)) n++;
    const asset: Asset = { type, id: `${type}_${n}`, name: `${spec.label} ${n}`, ui: pos };
    for (const f of spec.fields) if (f.name !== "name") asset[f.name] = f.default;
    if (profiles) {
      // Default to data that is real at the site's time step, and give each new charger
      // its own cars where possible.
      const used = new Set(site.assets.map((a) => a.sessions ?? a.load_profile ?? a.profile));
      for (const f of spec.fields) {
        if (!f.options) continue;
        const fits = profiles[f.options].filter((p) => p.resolution_minutes <= site.step_minutes);
        const pool = fits.length ? fits : profiles[f.options];
        const current = pool.find((p) => p.id === asset[f.name]);
        const pick = (f.options === "ev" ? pool.find((p) => !used.has(p.id)) : undefined) ?? current ?? pool[0];
        if (pick) asset[f.name] = pick.id;
      }
    }
    set((s) => ({ site: { ...s.site, assets: [...s.site.assets, asset] }, selectedId: asset.id, stale: s.result !== null }));
  },

  removeAsset(id) {
    set((s) => ({
      site: { ...s.site, assets: s.site.assets.filter((a) => a.id !== id) },
      selectedId: s.selectedId === id ? null : s.selectedId,
      stale: s.result !== null,
    }));
  },

  moveAsset(id, pos) {
    set((s) => ({ site: { ...s.site, assets: s.site.assets.map((a) => (a.id === id ? { ...a, ui: pos } : a)) } }));
  },

  setMeterPos(pos) {
    set({ meterPos: pos });
  },

  select(id) {
    set({ selectedId: id });
  },

  async run() {
    set({ running: true, error: null, playing: false });
    try {
      const result = await api.simulate(get().site);
      const { start, step_minutes: step, steps: T } = result.time;
      // Start the playhead at 18:00 on the first (operate) or second (plan) day: evening peak.
      const day = get().site.mode === "operate" ? 0 : 1;
      let cursor = 0;
      for (let i = 0; i < T; i++) {
        const d = timeAt(start, step, i);
        if (d.getUTCHours() === 18 && d.getUTCMinutes() === 0 && Math.floor((i * step) / 1440) === day) { cursor = i; break; }
      }
      set({ result, stale: false, running: false, cursor, maxPower: maxPower(result) });
    } catch (e) {
      set({ running: false, error: (e as Error).message });
    }
  },

  setCursor(i) {
    const r = get().result;
    if (!r) return;
    const T = r.result.site.grid_kw.length;
    set({ cursor: Math.max(0, Math.min(T - 1, Math.round(i))) });
  },
  setPlaying(p) {
    set({ playing: p });
  },
  setSpeed(s) {
    set({ speed: s });
  },
}));

// Live values for the current playhead position. Undefined when no fresh result.
export function useLive(): { r: SimResponse; i: number } | null {
  const result = useStore((s) => s.result);
  const stale = useStore((s) => s.stale);
  const cursor = useStore((s) => s.cursor);
  if (!result || stale) return null;
  return { r: result, i: cursor };
}
