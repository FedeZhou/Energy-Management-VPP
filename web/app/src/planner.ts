import { create } from "zustand";
import { api, reliabilityOf, STATIC_DEMO, type Asset, type Catalog, type ContractWindow, type SimResponse, type Site } from "./api";
import { useStore } from "./store";
import { pctFine } from "./util";
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

/** Service-level rule (the owner's decision, a setting and not a sourced number): delivering the cars' energy is
 *  part of the promise, so an option counts as feasible only if the cars' energy left undelivered is at most this
 *  share of what they asked for. */
export const DEFAULT_EV_TOLERANCE = 0.01;

export interface EvService {
  /** Energy the cars asked for (delivered + left short at departure), delivered, and left short (kWh). */
  requested: number;
  delivered: number;
  unmet: number;
  /** delivered / requested, and its complement. */
  served: number;
  short: number;
  /** The floor subtracted (kWh short even with no grid limit, see evFloor) and the share of requested energy left
   *  undelivered beyond it: what the rule judges. */
  floor: number;
  added: number;
  feasible: boolean;
}

/** How well a run served the cars, against the tolerance; null when there is nothing to serve (no EVs, or no car
 *  asked for energy), in which case the rule does not apply. Requested = ev_delivered_kwh + ev_unmet_kwh (cars
 *  still plugged in at the end count what they got so far and no shortfall). Feasible when
 *  (unmet - floor) <= tolerance x requested: cars that would be short even with no grid limit (the floor) are not
 *  the contract's doing. */
export function evService(kpis: Record<string, number>, tolerance: number, floorKwh = 0): EvService | null {
  const d = kpis.ev_delivered_kwh, u = kpis.ev_unmet_kwh;
  if (typeof d !== "number" || typeof u !== "number") return null;
  const requested = d + u;
  if (!(requested > 1e-6)) return null;
  const short = Math.max(u, 0) / requested;
  const floor = Math.max(floorKwh, 0);
  const added = Math.max(u - floor, 0) / requested;
  return { requested, delivered: d, unmet: u, served: 1 - short, short, floor, added, feasible: added <= tolerance + 1e-9 };
}

/** "5.3% of car energy undelivered" (the reason an option is not feasible); with a floor, only the part beyond it. */
export const shortReason = (ev: EvService) => ev.floor > 0.05
  ? `${pctFine(ev.added)} more car energy undelivered than with no grid limit`
  : `${pctFine(ev.short)} of car energy undelivered`;

/* ---- The floor: what the cars would miss even with no grid limit ----
   Charging records are replayed at the time step, so with hourly steps a stay is rounded to whole hours and some
   cars cannot get all their energy whatever the contract (2.8% on the time-block car park, 5.3% on the Leeds depot,
   our runs of 22 Nov 2026). The rule should judge what the contract and the control add, so every batch runs one
   reference: the same site with no import limit, no contract windows, no battery and every car charged at full power
   from arrival. It depends on neither battery size, contract nor strategy (checked on both EV examples: the same
   shortfall as with the site's own strategy), so one run serves a whole planner batch and every Compare row on the
   same site. */

export interface EvFloor { unmetKwh: number; requestedKwh: number }

/** The reference site behind the floor. */
export function floorSite(site: Site): Site {
  const s = clone(site);
  s.grid = { ...s.grid, import_limit_kw: null, contract_windows: [] };
  s.assets = s.assets.filter((a) => a.type !== "battery");
  s.controller = { ...s.controller, battery: "idle", ev: "as_fast_as_possible" };
  return s;
}
export const floorKey = (site: Site) => siteKey(floorSite(site));
const hasEv = (site: Site) => site.assets.some((a) => a.type === "ev_charger");

interface FloorState {
  /** By floorKey: the floor, "pending" while its reference run is going, or "error" (the rule then uses no floor). */
  floors: Record<string, EvFloor | "pending" | "error">;
  /** Run the reference for this site unless it is known or running; resolves to the floor (null without chargers,
   *  in the static demo, or on error). */
  ensure: (site: Site) => Promise<EvFloor | null>;
}

const floorRuns = new Map<string, Promise<EvFloor | null>>();

export const useFloors = create<FloorState>((set, get) => ({
  floors: {},
  ensure(site) {
    if (!hasEv(site) || STATIC_DEMO) return Promise.resolve(null);
    const key = floorKey(site);
    const known = get().floors[key];
    if (known && typeof known === "object") return Promise.resolve(known);
    const running = floorRuns.get(key);
    if (running) return running;
    set((s) => ({ floors: { ...s.floors, [key]: "pending" } }));
    const p = api.simulate(floorSite(site)).then((r) => {
      const k = r.result.kpis;
      const f: EvFloor = { unmetKwh: Math.max(k.ev_unmet_kwh ?? 0, 0), requestedKwh: (k.ev_delivered_kwh ?? 0) + (k.ev_unmet_kwh ?? 0) };
      set((s) => ({ floors: { ...s.floors, [key]: f } }));
      return f;
    }).catch(() => {
      set((s) => ({ floors: { ...s.floors, [key]: "error" } }));
      return null;
    }).finally(() => floorRuns.delete(key));
    floorRuns.set(key, p);
    return p;
  },
}));

/** The floor state for a site (undefined = not asked for yet). */
export const floorOf = (floors: FloorState["floors"], site: Site) => floors[floorKey(site)];
/** The floor in kWh to subtract, 0 while unknown. */
export const floorKwh = (f: EvFloor | "pending" | "error" | undefined) => (f && typeof f === "object" ? f.unmetKwh : 0);

/** "1" -> 0.01; null when not a share between 0 and 100%. */
export function parseTolerance(text: string): number | null {
  const v = Number(text.replace(/%/g, "").trim());
  return text.trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100 ? v / 100 : null;
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
  /** Service-level rule: the largest share of the cars' requested energy an option may leave undelivered and still
   *  count as feasible. Shared with the Compare tab. */
  evTolerance: number;
  setEvTolerance: (v: number) => void;
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
  evTolerance: DEFAULT_EV_TOLERANCE,
  setEvTolerance(v) { set({ evTolerance: v }); },

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
      // The no-limit reference for the service-level floor runs alongside (one extra run per batch; it fails soft).
      await Promise.all([worker(), worker(), useFloors.getState().ensure(site)]);
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
