// Types mirror emsbench.api.app responses and emsbench.sim.model.Site.

export type AssetType = "building" | "pv" | "battery" | "ev_charger";

export interface Field {
  name: string;
  label: string;
  type: "number" | "integer" | "string" | "boolean" | string;
  enum: string[] | null;
  default: unknown;
  unit: string;
  help: string;
  source: string;
  options: "" | "load" | "pv" | "price" | "ev";
  min: number | null;
  max: number | null;
  nullable: boolean;
}

export interface Catalog {
  assets: Record<AssetType, { label: string; group: string; description: string; fields: Field[] }>;
  site: { grid: Field[]; tariff: Field[]; controller: Field[]; period: Field[] };
}

export interface ProfileInfo {
  id: string;
  kind: string;
  label: string;
  source: string;
  note: string;
  stats: Record<string, number>;
}

export interface Profiles {
  start_date: string;
  steps: number;
  load: ProfileInfo[];
  pv: ProfileInfo[];
  price: ProfileInfo[];
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
  days: number;
  start_day: number;
  grid: { import_limit_kw: number | null; export_limit_kw: number | null };
  tariff: { price_profile: string; export_price: number; demand_charge_per_kw_month: number };
  controller: { battery: string; peak_threshold_kw: number; ev: string };
  assets: Asset[];
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  site: Site;
}

export interface SimResponse {
  time: { start_date: string; first_step: number; step_hours: number; month: number[]; hour: number[] };
  result: {
    kpis: Record<string, number>;
    warnings: string[];
    site: Record<string, number[]>;
    assets: Record<string, Record<string, number[]>>;
  };
  baseline: { kpis: Record<string, number>; site: { grid_kw: number[] } };
  runtime_s: number;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  catalog: () => get<Catalog>("/api/catalog"),
  profiles: () => get<Profiles>("/api/profiles"),
  presets: () => get<Preset[]>("/api/presets"),
  async simulate(site: Site): Promise<SimResponse> {
    const r = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(site),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({ detail: r.statusText }));
      const detail = Array.isArray(body.detail)
        ? body.detail.map((d: { loc: string[]; msg: string }) => `${d.loc.slice(1).join(".")}: ${d.msg}`).join("; ")
        : String(body.detail);
      throw new Error(detail);
    }
    return r.json() as Promise<SimResponse>;
  },
};
