// Types mirror emsbench.api.app responses and emsbench.sim.model.Site.

export type AssetType = "building" | "data_center" | "heat_pump" | "pv" | "battery" | "ev_charger";
export type Mode = "plan" | "operate";

export interface Field {
  name: string;
  label: string;
  type: "number" | "integer" | "string" | "boolean" | string;
  format: string;
  enum: (string | number)[] | null;
  default: unknown;
  unit: string;
  help: string;
  source: string;
  options: "" | "load" | "pv" | "price" | "demand" | "heat" | "cop" | "netfee" | "ev";
  min: number | null;
  max: number | null;
  nullable: boolean;
}

export interface Catalog {
  assets: Record<AssetType, { label: string; group: string; description: string; fields: Field[] }>;
  site: { grid: Field[]; tariff: Field[]; controller: Field[]; period: Field[]; max_steps: number };
}

export interface ProfileInfo {
  id: string;
  kind: string;
  label: string;
  source: string;
  note: string;
  licence: string;
  currency?: string;
  resolution_minutes: number;
  cyclic: boolean;
  first: string;
  last: string;
  stats: Record<string, number>;
}

export interface Profiles {
  warnings: string[];
  load: ProfileInfo[];
  pv: ProfileInfo[];
  price: ProfileInfo[];
  demand: ProfileInfo[];
  heat: ProfileInfo[];
  cop: ProfileInfo[];
  netfee: ProfileInfo[];
  ev: ProfileInfo[];
}

export interface Asset {
  type: AssetType;
  id: string;
  name: string;
  ui: { x: number; y: number };
  [param: string]: unknown;
}

export interface Site {
  name: string;
  mode: Mode;
  start: string; // ISO date
  days: number;
  step_minutes: number;
  grid: { import_limit_kw: number | null; export_limit_kw: number | null; fuse_a: number | null;
    dimming?: "off" | "direct" | "ems"; dimming_start_hour?: number; dimming_hours?: number };
  tariff: { price_profile: string; price_adder: number; export_price: number; demand_charge_per_kw_month: number;
    network_fee_profile?: string };
  controller: {
    battery: string; peak_threshold_kw: number; ev: string; heat_pump?: string; ev_discharge?: string;
    forecast?: "perfect" | "realistic"; mpc_execution?: "plan" | "hybrid" | "cautious";
  };
  assets: Asset[];
}

export interface Preset {
  id: string;
  label: string;
  mode: Mode;
  description: string;
  site: Site;
}

export interface Session {
  charger: string;
  ev: string;
  arrival: number;
  departure: number;
  requested_kwh: number;
  delivered_kwh: number;
  unmet_kwh: number | null;
}

export interface SourceUse {
  asset: string;
  profile: string;
  label: string;
  source_start: string;
  resampling: string;
}

export interface SimResponse {
  time: { start: string; step_minutes: number; steps: number };
  result: {
    kpis: Record<string, number>;
    warnings: string[];
    site: Record<string, number[]>;
    assets: Record<string, Record<string, number[]>>;
    sessions: Session[];
    sources: SourceUse[];
    currency: string;
  };
  baseline: { kpis: Record<string, number>; site: { grid_kw: number[] } };
  runtime_s: number;
}

export interface DataSource {
  id: string;
  name: string;
  provider: string;
  kind: "measured" | "modelled" | "statistics" | "mixed";
  what: string;
  used_for: string;
  resolution: string;
  coverage: string;
  licence: string;
  commercial_use: boolean;
  attribution: string;
  url: string;
  caveats: string;
  profiles: number;
}

export interface PvCheck {
  profile: string;
  place: string;
  orientation: string;
  ours_last_12_months: number;
  pvgis_mean: number;
  pvgis_sd: number;
  difference_pct: number;
  within_2_sd: boolean;
}

export interface DataSources {
  sources: DataSource[];
  excluded: { name: string; why: string }[];
  rules: string[];
  checks: { what: string; result: string }[];
  pv_checks: PvCheck[];
  warnings: string[];
}

export interface TariffComponents {
  id: string;
  country: string;
  country_name: string;
  consumer: "household" | "business";
  band: string;
  year: string;
  currency: string;
  energy_supply: number;
  network: number;
  taxes: number;
  vat_included: boolean;
  vat: number;
  total: number;
  adder: number;
  source: string;
  licence: string;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

/** Static demo (the public GitHub Pages site): there is no Python server, so the app reads the files written by
 *  scripts/export_static_demo.py. The example sites run with pre-computed results; anything else points to the
 *  live app. Built with VITE_STATIC_DEMO=1. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "1";
export const LIVE_APP_URL = "https://codespaces.new/FedeZhou/Energy-Management-VPP?quickstart=1";
const DEMO = `${import.meta.env.BASE_URL}demo/`;

/** Canonical JSON for comparing sites: sorted keys, canvas positions ignored. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (key, v) => {
    if (key === "ui") return undefined;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
    }
    return v;
  });
}

let demoIndex: Promise<{ presets: Preset[]; runs: string[] }> | null = null;

async function staticSimulate(site: Site): Promise<SimResponse> {
  demoIndex ??= Promise.all([get<Preset[]>(`${DEMO}presets.json`), get<string[]>(`${DEMO}runs.json`)])
    .then(([presets, runs]) => ({ presets, runs }));
  const { presets, runs } = await demoIndex;
  const battery = site.controller.battery;
  const forecast = site.controller.forecast ?? "perfect";
  const mine = canonical({ ...site, controller: { ...site.controller, battery, forecast } });
  for (const p of presets) {
    const ref = canonical({ ...p.site, controller: { ...p.site.controller, battery, forecast } });
    const key = `${p.id}__${battery}__${forecast}`;
    if (ref === mine && runs.includes(key)) return get<SimResponse>(`${DEMO}runs/${key}.json`);
  }
  throw new Error(
    "This public demo shows the example sites with pre-computed results (their own strategy or MPC, with perfect or " +
    `realistic forecasts). To change a site or a setting and simulate it, open the live app in GitHub Codespaces (${LIVE_APP_URL}) ` +
    "or run Site Lab on your computer (see the README).",
  );
}

export const api = STATIC_DEMO ? {
  catalog: () => get<Catalog>(`${DEMO}catalog.json`),
  profiles: () => get<Profiles>(`${DEMO}profiles.json`),
  presets: () => get<Preset[]>(`${DEMO}presets.json`),
  datasources: () => get<DataSources>(`${DEMO}datasources.json`),
  tariffs: () => get<TariffComponents[]>(`${DEMO}tariffs.json`),
  simulate: (site: Site, _signal?: AbortSignal): Promise<SimResponse> => staticSimulate(site),
} : {
  catalog: () => get<Catalog>("/api/catalog"),
  profiles: () => get<Profiles>("/api/profiles"),
  presets: () => get<Preset[]>("/api/presets"),
  datasources: () => get<DataSources>("/api/datasources"),
  tariffs: () => get<TariffComponents[]>("/api/tariffs"),
  async simulate(site: Site, signal?: AbortSignal): Promise<SimResponse> {
    const r = await fetch("/api/simulate", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(site),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({ detail: r.statusText }));
      const detail = Array.isArray(body.detail)
        ? body.detail.map((d: { loc: string[]; msg: string }) => `${d.loc.slice(1).join(".") || "site"}: ${d.msg.replace(/^Value error, /, "")}`).join("; ")
        : String(body.detail);
      throw new Error(detail);
    }
    return r.json() as Promise<SimResponse>;
  },
};
