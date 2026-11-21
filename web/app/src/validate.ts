import { WEEKDAYS, type Catalog, type ContractWindow, type Field, type Site, type Weekday } from "./api";
import { kw } from "./util";

// Time formats of sim/model.py ContractWindow (the catalog lists the fields but not their patterns).
const START_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const END_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const WINDOW_LABEL: Record<keyof WindowErrors, string> = { start: "from", end: "to", import_limit_kw: "limit" };

export interface WindowErrors { start?: string; end?: string; import_limit_kw?: string }

/** Why a contract window cannot be simulated, per field (empty when it is fine). The limit uses the engine's
 *  bounds from the catalog (`catalog.site.contract_window`), the times the engine's patterns. */
export function windowErrors(w: ContractWindow, fields: Field[] = []): WindowErrors {
  const e: WindowErrors = {};
  if (!START_RE.test(w.start)) e.start = "Use HH:MM, 00:00 to 23:59";
  if (!END_RE.test(w.end)) e.end = "Use HH:MM, 00:00 to 24:00";
  const f = fields.find((x) => x.name === "import_limit_kw");
  const lim = f ? fieldError(f, w.import_limit_kw)
    : w.import_limit_kw == null ? "Required" : !(w.import_limit_kw >= 0) ? "At least 0" : null;
  if (lim) e.import_limit_kw = lim;
  return e;
}

/** Lenient typing, strict storage: "8" or "8:00" or "0800" become "08:00" when the field is left. Anything
 *  else is kept as typed, so the error stays visible instead of the text silently changing. */
export function normalizeTime(text: string): string {
  const m = /^\s*(\d{1,2})(?::?(\d{2}))?\s*$/.exec(text);
  return m ? `${m[1].padStart(2, "0")}:${m[2] ?? "00"}` : text;
}

const DAY_SHORT: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const DAY_LONG: Record<Weekday, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/** "every day", "Mon–Fri", "Sat, Sun", "Mon–Wed, Fri": runs of three or more days joined with a dash. */
export function daysText(days: Weekday[]): string {
  const on = WEEKDAYS.map((d) => days.includes(d));
  if (on.every(Boolean)) return "every day";
  if (!on.some(Boolean)) return "no days";
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (!on[i]) continue;
    let j = i;
    while (j + 1 < 7 && on[j + 1]) j++;
    const a = DAY_SHORT[WEEKDAYS[i]], b = DAY_SHORT[WEEKDAYS[j]];
    parts.push(j - i >= 2 ? `${a}–${b}` : j === i ? a : `${a}, ${b}`);
    i = j;
  }
  return parts.join(", ");
}

const kwText = (v: number) => kw(v, Number.isInteger(v) ? 0 : "auto");

/** The limit a window actually sets: its own, or the firm limit when that is lower (as the engine does). */
export function windowLimit(w: ContractWindow, firm: number | null): number | null {
  if (w.import_limit_kw == null) return null;
  return firm != null ? Math.min(w.import_limit_kw, firm) : w.import_limit_kw;
}

/** One plain line for a grid contract: "110 kW Mon–Fri 08:00–12:00; 250 kW otherwise". */
export function contractSummary(grid: Site["grid"]): string {
  const firm = grid.import_limit_kw;
  const windows = grid.contract_windows ?? [];
  if (!windows.length) return firm != null ? `${kwText(firm)} at all times` : "No import limit";
  const parts = windows.map((w) => {
    const lim = windowLimit(w, firm);
    const days = daysText(w.days);
    const time = w.start === w.end ? "all day" : `${w.start}–${w.end}`;
    return `${lim == null ? "? kW" : kwText(lim)} ${days === "every day" && time !== "all day" ? `${time} every day` : `${days} ${time}`}`;
  });
  return `${parts.join("; ")}; ${firm != null ? kwText(firm) : "unlimited"} otherwise`;
}

/** Why a number field's value cannot be simulated, or null when it is fine. Uses the engine's own
 *  bounds from the catalog, so the app refuses exactly what the API would reject. */
export function fieldError(f: Field, v: unknown): string | null {
  if (f.type !== "number" && f.type !== "integer") return null;
  if (v == null || v === "") return f.nullable ? null : "Required";
  const n = Number(v);
  if (!Number.isFinite(n)) return "Not a number";
  if (f.min != null && n < f.min) return `At least ${f.min}`;
  if (f.max != null && n > f.max) return `At most ${f.max}`;
  return null;
}

/** Every problem that would stop a run, as "Where: what" lines (empty when the site can run). */
export function siteProblems(site: Site, catalog: Catalog): string[] {
  const out: string[] = [];
  const check = (where: string, fields: Field[], values: Record<string, unknown> | undefined) => {
    for (const f of fields) {
      const e = fieldError(f, values?.[f.name]);
      if (e) out.push(`${where}${f.label}: ${e.toLowerCase()}`);
    }
  };
  const s = site as unknown as Record<string, unknown>;
  check("", catalog.site.period, s);
  check("Grid connection · ", catalog.site.grid, s.grid as Record<string, unknown>);
  (site.grid.contract_windows ?? []).forEach((w, i) => {
    for (const [k, msg] of Object.entries(windowErrors(w, catalog.site.contract_window))) {
      out.push(`Grid connection · Contract window ${i + 1} ${WINDOW_LABEL[k as keyof WindowErrors]}: ${msg.toLowerCase()}`);
    }
  });
  check("Tariff · ", catalog.site.tariff, s.tariff as Record<string, unknown>);
  check("Control · ", catalog.site.controller, s.controller as Record<string, unknown>);
  for (const a of site.assets) {
    const spec = catalog.assets[a.type];
    if (spec) check(`${a.name || spec.label} · `, spec.fields, a as Record<string, unknown>);
  }
  if (out.length === 0) {
    const steps = (site.days * 1440) / site.step_minutes;
    if (steps > catalog.site.max_steps) out.push(`Period: ${steps} steps, the limit is ${catalog.site.max_steps}`);
  }
  return out;
}
