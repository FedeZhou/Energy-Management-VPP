import type { AssetType } from "./api";

export const ASSET_COLOR: Record<AssetType | "grid", string> = {
  building: "var(--c-load)",
  pv: "var(--c-solar)",
  battery: "var(--c-batt)",
  ev_charger: "var(--c-ev)",
  grid: "var(--c-grid)",
};

// One number/date format for the whole (English) interface, whatever the OS locale.
export const LOCALE = "en-GB";

export const kw = (v: number, d = 1) => `${(Math.abs(v) < 0.05 ? 0 : v).toFixed(d)} kW`;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const num = (v: number, d = 0) =>
  v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$" };
export const money = (v: number, currency = "", d?: number) => {
  const digits = d ?? (Math.abs(v) < 100 ? 2 : 0);
  return `${SYMBOL[currency] ?? ""}${v.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

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
