import { create } from "zustand";
import { api, type Asset, type AssetType, type Catalog, type Preset, type Profiles, type SimResponse, type Site } from "./api";

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
  days: 365,
  start_day: 0,
  grid: { import_limit_kw: null, export_limit_kw: null },
  tariff: { price_profile: "cl2022/tou", export_price: 0, demand_charge_per_kw_month: 0 },
  controller: { battery: "self_consumption", peak_threshold_kw: 10, ev: "as_fast_as_possible" },
  assets: [],
};

function centroid(assets: Asset[]): { x: number; y: number } {
  if (!assets.length) return { x: 300, y: 220 };
  const x = assets.reduce((s, a) => s + a.ui.x, 0) / assets.length;
  const y = assets.reduce((s, a) => s + a.ui.y, 0) / assets.length;
  return { x: Math.round(x), y: Math.round(y) };
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
      if (presets.length) get().loadSite(presets[0].site);
    } catch (e) {
      set({ error: `Could not reach the simulator API. Is it running? (${(e as Error).message})` });
    }
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
    if (type === "ev_charger" && profiles) {
      // Give each new charger its own car sessions where possible.
      const used = new Set(site.assets.filter((a) => a.type === "ev_charger").map((a) => a.sessions));
      const free = profiles.ev.find((p) => !used.has(p.id));
      if (free) asset.sessions = free.id;
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
      const T = result.result.site.grid_kw.length;
      // Start the playhead at 18:00 on the second day, when solar is gone and prices are often high.
      const cursor = Math.min(T - 1, result.time.hour.findIndex((h, i) => i > 24 && h === 18));
      set({ result, stale: false, running: false, cursor: Math.max(0, cursor), maxPower: maxPower(result) });
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
