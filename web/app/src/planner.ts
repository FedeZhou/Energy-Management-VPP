import { create } from "zustand";
import { api, reliabilityOf, type Asset, type Catalog, type ContractWindow, type SimResponse, type Site } from "./api";
import { useStore } from "./store";
import { contractSummary, siteProblems } from "./validate";

/** Size & contract planner (the guide's planning pillar, chapters 8 and 13.3): replay the site's period once per
 *  battery size × contract option and put cost next to reliability (days the import limit held). Every run is a
 *  normal simulation of a variant of the current site, so it uses the site's own controller, forecasts and
 *  battery wear model; nothing here adds a price or a parameter of its own. */

export const MAX_RUNS = 30;
/** Contract options a chart can tell apart: three validated colours plus a neutral, each with its own marker. */
export const MAX_CONTRACTS = 4;

export interface ContractOption {
  id: string;
  label: string;
  /** One plain line for the contract ("110 kW Mon–Fri 08:00–12:00; 250 kW otherwise"). */
  detail: string;
  grid: Site["grid"];
}

export interface PlanRun {
  id: string;
  /** Total battery capacity (0 = no battery) and power of the variant. */
  kwh: number;
  kw: number;
  contract: string; // ContractOption.id
  site: Site;
  result: SimResponse;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Three significant figures, so ½× of 13.5 kWh stays 6.75 and 1.5× of 150 stays 225. */
export function round3(v: number): number {
  if (!(v > 0)) return 0;
  return Number(v.toPrecision(3));
}

/** A site as text for comparing (canvas positions ignored). */
export function siteKey(site: Site): string {
  return JSON.stringify(site, (k, v) => (k === "ui" ? undefined : v));
}

const batteries = (site: Site) => site.assets.filter((a) => a.type === "battery");

/** What the planner scales: the site's total battery capacity and its power per kWh (C-rate). Without a battery
 *  the C-rate comes from the catalog's default battery (sim/model.py, cited there). */
export function batteryBasis(site: Site, catalog: Catalog | null): { kwh: number; cRate: number; fromCatalog: boolean } {
  const bs = batteries(site);
  const kwh = bs.reduce((s, b) => s + Number(b.capacity_kwh ?? 0), 0);
  const kwTotal = bs.reduce((s, b) => s + Number(b.power_kw ?? 0), 0);
  if (kwh > 0) return { kwh, cRate: kwTotal / kwh, fromCatalog: false };
  const f = catalog?.assets.battery.fields ?? [];
  const dc = Number(f.find((x) => x.name === "capacity_kwh")?.default ?? 0);
  const dp = Number(f.find((x) => x.name === "power_kw")?.default ?? 0);
  return { kwh: 0, cRate: dc > 0 ? dp / dc : 0, fromCatalog: true };
}

/** 0, ½×, 1×, 1.5× and 2× the current capacity; just "0" when the site has no battery (type sizes to try). */
export function defaultSizes(site: Site, catalog: Catalog | null): number[] {
  const { kwh } = batteryBasis(site, catalog);
  if (!(kwh > 0)) return [0];
  return [...new Set([0, 0.5, 1, 1.5, 2].map((f) => round3(kwh * f)))];
}

/** "0, 75, 150" -> [0, 75, 150]; null when something is not a number. */
export function parseSizes(text: string): number[] | null {
  const parts = text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = parts.map(Number);
  if (out.some((v) => !Number.isFinite(v) || v < 0)) return null;
  return [...new Set(out)].sort((a, b) => a - b);
}

/** The site with `kwh` of battery: 0 removes every battery; otherwise each battery is scaled in proportion and
 *  keeps its own C-rate, or (no battery yet) one battery with the catalog's defaults is added. */
export function withBattery(site: Site, kwh: number, catalog: Catalog | null): { site: Site; kw: number } {
  const s = clone(site);
  const bs = batteries(s);
  if (kwh <= 0) {
    s.assets = s.assets.filter((a) => a.type !== "battery");
    return { site: s, kw: 0 };
  }
  const total = bs.reduce((sum, b) => sum + Number(b.capacity_kwh ?? 0), 0);
  if (bs.length && total > 0) {
    let kwSum = 0;
    for (const b of bs) {
      const cap = Number(b.capacity_kwh ?? 0), pw = Number(b.power_kw ?? 0);
      b.capacity_kwh = round3((cap * kwh) / total);
      b.power_kw = cap > 0 ? round3((b.capacity_kwh as number) * (pw / cap)) : pw;
      kwSum += b.power_kw as number;
    }
    return { site: s, kw: round3(kwSum) };
  }
  // No battery to scale: add one with the catalog's (cited) defaults.
  s.assets = s.assets.filter((a) => a.type !== "battery");
  const spec = catalog?.assets.battery;
  const { cRate } = batteryBasis(site, catalog);
  const asset: Asset = { type: "battery", id: "battery_plan", name: "Battery", ui: { x: 80, y: 400 } };
  for (const f of spec?.fields ?? []) if (f.name !== "name") asset[f.name] = f.default;
  asset.capacity_kwh = kwh;
  asset.power_kw = round3(kwh * cRate);
  s.assets.push(asset);
  return { site: s, kw: asset.power_kw as number };
}

const scaleWindows = (ws: ContractWindow[], f: number): ContractWindow[] =>
  ws.map((w) => ({ ...w, import_limit_kw: w.import_limit_kw == null ? null : round3(w.import_limit_kw * f) }));

/** The contracts to try: today's, the firm limit without windows, and the windows' reduced limit at each of
 *  `percents` of today's value. A site without windows varies its firm limit instead. These are variants to
 *  explore, not offers from a grid operator. */
export function contractOptions(site: Site, opts: { current: boolean; firmOnly: boolean; percents: number[] }): ContractOption[] {
  const g = site.grid;
  const ws = g.contract_windows ?? [];
  const out: ContractOption[] = [];
  const add = (id: string, label: string, grid: Site["grid"]) => out.push({ id, label, detail: contractSummary(grid), grid });
  if (opts.current) add("current", "Current contract", clone(g));
  if (ws.length) {
    if (opts.firmOnly) add("firm", "Firm limit only", { ...clone(g), contract_windows: [] });
    for (const p of opts.percents) {
      add(`win${p}`, `Window limit ${p}%`, { ...clone(g), contract_windows: scaleWindows(ws, p / 100) });
    }
  } else if (g.import_limit_kw != null) {
    for (const p of opts.percents) add(`firm${p}`, `Firm limit ${p}%`, { ...clone(g), import_limit_kw: round3(g.import_limit_kw * p / 100) });
  }
  return out;
}

/** "80, 120" -> [80, 120]; null when something is not a positive number. */
export function parsePercents(text: string): number[] | null {
  const parts = text.split(/[,;\s%]+/).map((s) => s.trim()).filter(Boolean);
  const out = parts.map(Number);
  if (out.some((v) => !Number.isFinite(v) || v <= 0)) return null;
  return [...new Set(out)];
}

/** The cost a run is ranked by: cost including battery wear when any run priced wear, else the energy bill. */
export function costKey(runs: PlanRun[]): "total_cost_with_wear" | "total_cost" {
  return runs.some((r) => r.result.result.kpis.battery_wear_priced) ? "total_cost_with_wear" : "total_cost";
}

/** Runs on the cost-reliability front: no cheaper run keeps the limit on as many days or more. Sorted by cost. */
export function paretoFront(runs: PlanRun[], key: string): PlanRun[] {
  const pts = runs.map((r) => ({ r, cost: r.result.result.kpis[key], kept: reliabilityOf(r.result.result.kpis)?.limit_days_kept_share }))
    .filter((p): p is { r: PlanRun; cost: number; kept: number } => typeof p.kept === "number" && Number.isFinite(p.cost))
    .sort((a, b) => a.cost - b.cost || b.kept - a.kept);
  const front: PlanRun[] = [];
  let best = -Infinity;
  for (const p of pts) if (p.kept > best + 1e-9) { front.push(p.r); best = p.kept; }
  return front;
}

interface PlanState {
  runs: PlanRun[];
  contracts: ContractOption[];
  /** The site the plan was made from (siteKey), to tell when the plan no longer matches the site on screen. */
  baseKey: string | null;
  /** How many runs the last plan asked for (more than `runs.length` when it was stopped early). */
  planned: number;
  progress: { done: number; total: number } | null;
  error: string | null;
  run: (sizes: number[], contracts: ContractOption[]) => Promise<void>;
  cancel: () => void;
  clear: () => void;
  /** Make this variant the site and result on screen. */
  open: (id: string) => void;
}

let ctrl: AbortController | null = null;
let seq = 0;
const newId = () => `pl${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Every variant to run, or the first reason one could not run (the engine's own bounds, via siteProblems). */
export function planVariants(site: Site, sizes: number[], contracts: ContractOption[], catalog: Catalog | null):
  { variants: { kwh: number; kw: number; contract: string; site: Site }[]; problem: string | null } {
  const variants = contracts.flatMap((c) => sizes.map((kwh) => {
    const { site: s, kw } = withBattery(site, kwh, catalog);
    s.grid = clone(c.grid);
    return { kwh, kw, contract: c.id, site: s };
  }));
  if (catalog) {
    for (const v of variants) {
      const p = siteProblems(v.site, catalog);
      if (p.length) {
        const c = contracts.find((x) => x.id === v.contract);
        return { variants, problem: `${v.kwh} kWh · ${c?.label ?? v.contract}: ${p[0]}` };
      }
    }
  }
  return { variants, problem: null };
}

export const usePlanner = create<PlanState>((set) => ({
  runs: [],
  contracts: [],
  baseKey: null,
  planned: 0,
  progress: null,
  error: null,

  async run(sizes, contracts) {
    const { site, catalog } = useStore.getState();
    const { variants, problem } = planVariants(site, sizes, contracts, catalog);
    if (problem) { set({ error: problem }); return; }
    if (!variants.length || variants.length > MAX_RUNS) return;
    ctrl?.abort();
    const mine = new AbortController();
    ctrl = mine;
    set({ progress: { done: 0, total: variants.length }, error: null, runs: [], contracts, baseKey: siteKey(site), planned: variants.length });
    try {
      // Two at a time, like Compare: year-long runs are heavy and the server shares one machine.
      const out: (PlanRun | null)[] = new Array(variants.length).fill(null);
      let next = 0;
      const worker = async () => {
        while (next < variants.length) {
          const k = next++;
          const v = variants[k];
          const result = await api.simulate(v.site, mine.signal);
          out[k] = { id: newId(), ...v, result };
          if (ctrl === mine) {
            set((st) => ({ runs: out.filter((x): x is PlanRun => x !== null),
              progress: st.progress && { ...st.progress, done: st.progress.done + 1 } }));
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (ctrl !== mine) return;
      set({ runs: out.filter((x): x is PlanRun => x !== null), progress: null });
    } catch (e) {
      if (ctrl !== mine) return;
      set({ progress: null, error: (e as Error).name === "AbortError" ? null : (e as Error).message });
    } finally {
      if (ctrl === mine) ctrl = null;
    }
  },
  cancel() {
    ctrl?.abort();
    ctrl = null;
    set({ progress: null }); // keep the runs that finished
  },
  clear() { set({ runs: [], contracts: [], baseKey: null, planned: 0, error: null }); },
  open(id) {
    const r = usePlanner.getState().runs.find((x) => x.id === id);
    if (!r) return;
    useStore.getState().loadSite(clone(r.site));
    useStore.setState({ result: r.result, stale: false, compare: null, cursor: 0 });
  },
}));
