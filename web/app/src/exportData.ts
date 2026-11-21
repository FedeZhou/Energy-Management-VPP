/* Export of a run as files: the time series and the KPI summary as CSV (RFC 4180, dot decimals, no
   thousands separators, UTF-8 with a BOM so Excel detects the encoding), plus safe file names.
   Pure functions, no DOM: the download itself lives in components/Export.tsx. */
import { importLimitSeries, reliabilityOf, type AssetType, type LimitReliability, type SimResponse, type Site } from "./api";
import { timeAt } from "./util";

export interface Table { header: string[]; rows: (string | number | null | undefined)[][] }

/** A number as a spreadsheet reads it: dot decimal, no grouping, no exponent, at most 6 decimals,
 *  float noise trimmed (57.199999 -> 57.2), -0 as 0. Missing or non-finite values become an empty cell. */
export function csvNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  const rounded = Number(v.toFixed(6));
  if (rounded === 0) return "0";
  return Math.abs(rounded) >= 1e21 ? rounded.toFixed(0) : String(rounded);
}

/** One CSV cell (RFC 4180): quoted when it holds a comma, quote, CR or LF; quotes doubled. */
export function csvCell(v: string | number | null | undefined): string {
  if (typeof v === "number" || v == null) return csvNumber(v);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The whole file: CRLF line ends (RFC 4180), a UTF-8 BOM for Excel. */
export function toCsv(t: Table): string {
  const lines = [t.header, ...t.rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A file name that is safe on Windows, macOS and Linux: accents dropped, anything else odd -> "-". */
export function safeName(text: string, fallback = "site"): string {
  const clean = text.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return clean.slice(0, 80) || fallback;
}

/** `<site name>_<start date>_<mode>`, the stem shared by every exported file. */
export function fileStem(r: SimResponse, site: Site): string {
  return `${safeName(site.name)}_${r.time.start.slice(0, 10)}_${site.mode}`;
}

/** The step's start as ISO 8601 local time, as the app labels it (naive local time: CET for European data). */
export const isoAt = (r: SimResponse, i: number) => timeAt(r.time.start, r.time.step_minutes, i).toISOString().slice(0, 19);

const SITE_SERIES: { key: string; label: (cur: string) => string; scale?: number; device?: AssetType }[] = [
  { key: "grid_kw", label: () => "Grid power (kW, + import, - export)" },
  { key: "load_kw", label: () => "Base load, buildings and data centers (kW)" },
  { key: "pv_kw", label: () => "Solar total, used or exported (kW)", device: "pv" },
  { key: "pv_curtailed_kw", label: () => "Solar curtailed (kW)", device: "pv" },
  { key: "battery_kw", label: () => "Batteries total (kW, + charging, - discharging)", device: "battery" },
  { key: "soc", label: () => "Battery state of charge (%)", scale: 100, device: "battery" },
  { key: "ev_kw", label: () => "EV chargers total (kW, + charging, - discharging)", device: "ev_charger" },
  { key: "hp_kw", label: () => "Heat pumps total (kW)", device: "heat_pump" },
  { key: "dimmed_kw", label: () => "Held back by grid-operator dimming (kW)" },
  { key: "import_limit_kw", label: () => "Import limit (kW, firm or contract window; empty = unlimited)" },
  { key: "price", label: (cur) => `Import price (${cur || "currency"}/kWh)` },
  { key: "phase_l1_a", label: () => "Phase L1 current (A)" },
  { key: "phase_l2_a", label: () => "Phase L2 current (A)" },
  { key: "phase_l3_a", label: () => "Phase L3 current (A)" },
];
const PHASES = new Set(["phase_l1_a", "phase_l2_a", "phase_l3_a"]);

const ASSET_SIGN: Partial<Record<AssetType, string>> = {
  pv: ", - generation",
  battery: ", + charging, - discharging",
  ev_charger: ", + charging, - discharging",
};

/** One row per time step: time, site series, the baseline's grid power, then each asset's power.
 *  A device series appears when the site has that device or the series is non-zero; phase currents and
 *  dimming only when non-zero (or the site has a fuse / dimming), so a plain site does not get empty columns. */
export function timeSeriesTable(r: SimResponse, site: Site): Table {
  const T = r.time.steps;
  const s = r.result.site;
  const cur = r.result.currency;
  const typeOf = (id: string) => site.assets.find((a) => a.id === id)?.type;
  const simulatedTypes = new Set(Object.keys(r.result.assets).map(typeOf));
  const nonZero = (a: number[]) => a.some((v) => Math.abs(v) > 1e-9);
  const cols: { header: string; data: number[]; scale: number }[] = [];
  const known = new Set(SITE_SERIES.map((c) => c.key));

  for (const c of SITE_SERIES) {
    const data = s[c.key];
    if (!Array.isArray(data)) continue;
    const keep = c.device ? simulatedTypes.has(c.device) || nonZero(data)
      : PHASES.has(c.key) ? site.grid.fuse_a != null || nonZero(data)
      : c.key === "dimmed_kw" ? (site.grid.dimming ?? "off") !== "off" || nonZero(data)
      : c.key === "import_limit_kw" ? importLimitSeries(r) != null // null where unlimited: kept only if some limit
      : true;
    if (keep) cols.push({ header: c.label(cur), data, scale: c.scale ?? 1 });
    if (c.key === "grid_kw" && Array.isArray(r.baseline.site.grid_kw)) {
      cols.push({ header: "Grid power, baseline (kW, + import, - export)", data: r.baseline.site.grid_kw, scale: 1 });
    }
  }
  // Series the engine adds later still reach the file, under their own key.
  for (const [key, data] of Object.entries(s)) {
    if (!known.has(key) && Array.isArray(data)) cols.push({ header: key, data, scale: 1 });
  }

  const used = new Set(cols.map((c) => c.header));
  const unique = (h: string) => { let m = h, k = 2; while (used.has(m)) m = h.replace(/ \(/, ` ${k++} (`); used.add(m); return m; };
  // Assets in the order the site lists them, then any the result has that the site no longer does.
  const ids = [...site.assets.map((a) => a.id).filter((id) => id in r.result.assets),
    ...Object.keys(r.result.assets).filter((id) => !site.assets.some((a) => a.id === id))];
  for (const id of ids) {
    const data = r.result.assets[id]?.power_kw;
    if (!Array.isArray(data)) continue;
    const a = site.assets.find((x) => x.id === id);
    const sign = a ? ASSET_SIGN[a.type] ?? "" : "";
    cols.push({ header: unique(`${(a?.name || id).trim()} power (kW${sign})`), data, scale: 1 });
  }

  const rows = Array.from({ length: T }, (_, i) => [isoAt(r, i), ...cols.map((c) => {
    const v = c.data[i];
    return typeof v === "number" ? v * c.scale : null;
  })]);
  return { header: ["Time (local, step start)", ...cols.map((c) => c.header)], rows };
}

/** The KPI cards of the Results panel as raw numbers (same kpis fields and the same conditions as
 *  Kpis() in Results.tsx), with the baseline run's value alongside. Shares are in percent. */
export function kpiTable(r: SimResponse, site: Site): Table {
  const k = r.result.kpis;
  const b = r.baseline.kpis;
  const cur = r.result.currency || "currency";
  const has = (t: AssetType) => site.assets.some((a) => a.type === t);
  const rows: Table["rows"] = [];
  const add = (metric: string, key: string, unit: string, scale = 1, withBaseline = true) => {
    if (!(key in k)) return;
    rows.push([metric, k[key] * scale, withBaseline && key in b ? b[key] * scale : null, unit]);
  };
  const batteryKwh = site.assets.filter((a) => a.type === "battery").reduce((s, a) => s + (Number(a.capacity_kwh) || 0), 0);

  add("Total cost", "total_cost", cur);
  if (has("battery") && batteryKwh > 0 && k.battery_wear_priced) add("Cost incl. battery wear", "total_cost_with_wear", cur);
  if (k.demand_charge_cost > 0) add("Demand charges (included in total cost)", "demand_charge_cost", cur);
  add("Peak import", "peak_import_kw", "kW");
  if (site.grid.fuse_a != null) {
    add("Max phase current", "max_phase_current_a", "A");
    add("Energy over the fuse limit", "fuse_overload_kwh", "kWh");
  }
  if (has("pv") || k.self_sufficiency_share > 0.005 || b.self_sufficiency_share > 0.005) {
    add("Self-sufficiency", "self_sufficiency_share", "%", 100);
  }
  if (has("pv")) {
    add("Solar self-use", "self_consumption_share", "%", 100);
    add("Solar curtailed", "pv_curtailed_kwh", "kWh");
    add("Grid export", "grid_export_kwh", "kWh");
  }
  if (has("battery") && batteryKwh > 0) {
    if (k.battery_wear_priced) add("Battery wear cost", "battery_wear_cost", cur);
    add(k.battery_life_capped ? "Battery life (at the ageing model's cap)" : "Battery life", "battery_life_years", "years");
    add("Battery equivalent full cycles", "battery_equivalent_full_cycles", "cycles");
    add("Battery ageing from cycling", "battery_cycle_wear_share", "%", 100);
  }
  if (has("ev_charger")) {
    add("EV energy delivered", "ev_delivered_kwh", "kWh");
    add("EV energy short", "ev_unmet_kwh", "kWh");
    add("EV visits finished", "ev_sessions", "visits");
    add("EV visits left short", "ev_sessions_unmet", "visits");
  }
  if (has("heat_pump")) {
    add("Heat pump electricity", "hp_electric_kwh", "kWh");
    add("Heat delivered", "hp_heat_kwh", "kWh");
    add("Heat demand unmet", "hp_unmet_heat_kwh", "kWh");
    add("Heat pump seasonal COP", "hp_scop", "");
  }
  if (site.assets.some((a) => a.type === "ev_charger" && a.bidirectional)) add("Car to home", "ev_discharged_kwh", "kWh");
  if (site.grid.dimming && site.grid.dimming !== "off") add("Dimmed (Section 14a)", "dimmed_kwh", "kWh");
  // Contract reliability (benchmark/reliability.py): read through the typed accessor, since these can be null,
  // a boolean or a date. Same condition as the "Limit kept" card; its energy figure replaces the older one.
  const rel = reliabilityOf(k);
  const relB = reliabilityOf(b);
  if (rel) {
    const pair = (metric: string, f: (x: LimitReliability) => string | number | null, unit: string) =>
      rows.push([metric, f(rel), relB ? f(relB) : null, unit]);
    const p = `P${Math.round(rel.limit_reliability_target * 100)}`;
    pair("Days with an import limit (evaluated)", (x) => x.limit_days_evaluated, "days");
    pair("Days the import limit held at every step", (x) => x.limit_days_kept, "days");
    pair("Limit kept (share of days)", (x) => x.limit_days_kept_share * 100, "%");
    pair("Reliability target (share of days)", (x) => x.limit_reliability_target * 100, "%");
    pair("Reliability target met", (x) => (x.limit_target_met ? "yes" : "no"), "");
    pair("Energy above the import limit", (x) => x.limit_excess_kwh, "kWh");
    pair("Worst step above the import limit", (x) => x.limit_worst_excess_kw, "kW");
    pair("Date of the worst step", (x) => x.limit_worst_excess_date ?? "", "");
    pair(`Daily peak at the target share (${p}), as a multiple of the limit (<= 1 = target met)`,
      (x) => x.limit_daily_peak_ratio_at_target, "x limit");
  } else if (site.grid.import_limit_kw != null) add("Energy over the import limit", "grid_overload_kwh", "kWh");
  return { header: ["Metric", "Value", "Baseline", "Unit"], rows };
}
