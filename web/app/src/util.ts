import type { AssetType } from "./api";

export const ASSET_COLOR: Record<AssetType | "grid", string> = {
  building: "var(--c-load)",
  data_center: "var(--c-load)", // a load: same token as buildings, told apart by name and icon
  heat_pump: "var(--c-heat)", // the one warm hue: distinguishable from every blue/grey token
  pv: "var(--c-solar)",
  battery: "var(--c-batt)",
  ev_charger: "var(--c-ev)",
  grid: "var(--c-grid)",
};

// One number/date format for the whole (English) interface, whatever the OS locale.
export const LOCALE = "en-GB";

/* ---- Numbers: one formatter for the whole interface ----
   Thousands separators, a real minus sign, decimals that suit the size, and a narrow
   no-break space between a value and its unit ("7.5 kW", "1,234 kWh", "€0.312/kWh"). */
export const UNIT_SPACE = " ";
const MINUS = "−";

/** Decimals that suit the magnitude: 1,234 · 123 · 12.3 · 1.2 · 0.12 */
export function autoDigits(v: number): number {
  const a = Math.abs(v);
  if (a >= 100) return 0;
  if (a >= 1 || a === 0) return 1;
  return 2;
}

/** A plain number. `d` fixes the decimals; "auto" picks them from the magnitude. */
export const num = (v: number, d: number | "auto" = 0) => {
  const digits = d === "auto" ? autoDigits(v) : d;
  const text = v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // "-0.0" (a tiny negative rounded away) reads as zero.
  return /^-[0.,]*$/.test(text) ? text.slice(1) : text.replace(/^-/, MINUS);
};
/** A number with its unit. */
export const qty = (v: number, unit: string, d: number | "auto" = "auto") => `${num(v, d)}${UNIT_SPACE}${unit}`;
/** Power: tiny values snap to zero so idle devices do not flicker between 0.0 and −0.0. */
export const kw = (v: number, d: number | "auto" = "auto") => qty(Math.abs(v) < 0.05 ? 0 : v, "kW", d);
export const pct = (v: number) => `${num(Math.round(v * 100))}%`;
/** A difference between two percentages, in percentage points. */
export const pts = (v: number) => `${num(Math.round(v * 100))}${UNIT_SPACE}pts`;
/** A signed difference: "+1.2 kW", "−€3.40". */
export const signed = (d: number, fmt: (v: number) => string) => `${d < 0 ? MINUS : "+"}${fmt(Math.abs(d))}`;

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };
export const money = (v: number, currency = "", d?: number) => {
  const digits = d ?? (Math.abs(v) < 100 ? 2 : 0);
  const body = Math.abs(v).toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sym = SYMBOL[currency];
  const zero = Number(body.replace(/,/g, "")) === 0;
  const sign = v < 0 && !zero ? MINUS : "";
  return sym || !currency ? `${sign}${sym ?? ""}${body}` : `${sign}${body}${UNIT_SPACE}${currency}`;
};
/** An energy price: "€0.312/kWh". */
export const perKwh = (v: number, currency = "") => `${money(v, currency, 3)}/kWh`;

// Simulation times are naive local times (CET for European data). We do all
// arithmetic and display in UTC so the browser's own time zone never shifts them.
export function timeAt(startIso: string, stepMinutes: number, i: number): Date {
  const base = new Date(`${startIso.slice(0, 19)}Z`);
  return new Date(base.getTime() + i * stepMinutes * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

export function dayLabel(d: Date, withWeekday = true): string {
  return d.toLocaleDateString(LOCALE, { weekday: withWeekday ? "short" : undefined, day: "numeric", month: "short", timeZone: "UTC" });
}

export function stepLabel(startIso: string, stepMinutes: number, i: number): string {
  const a = timeAt(startIso, stepMinutes, i);
  const b = timeAt(startIso, stepMinutes, i + 1);
  return `${dayLabel(a)}, ${hm(a)}–${hm(b) === "00:00" ? "24:00" : hm(b)}`;
}

export function timeText(startIso: string, stepMinutes: number, i: number): string {
  const d = timeAt(startIso, stepMinutes, i);
  return `${dayLabel(d)} ${hm(d)}`;
}

export function isMidnight(startIso: string, stepMinutes: number, i: number): boolean {
  const d = timeAt(startIso, stepMinutes, i);
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
}

export function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export const MODE_DEFAULTS = {
  plan: { days: 365, step_minutes: 60 },
  operate: { days: 3, step_minutes: 15 },
} as const;
