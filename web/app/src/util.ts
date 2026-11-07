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
export const money = (v: number) =>
  v.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const num = (v: number, d = 0) =>
  v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });

/** Calendar label for a global step. CityLearn labels hours 1..24 and step 0 is hour 24
 *  of the day before start_date, so day = floor((g - 1) / 24). Dates are inferred. */
export function stepLabel(startDate: string, globalStep: number, hourLabel: number): string {
  const day = Math.floor((globalStep - 1) / 24);
  const base = startDate ? new Date(`${startDate}T00:00:00Z`) : new Date(Date.UTC(2024, 7, 1));
  base.setUTCDate(base.getUTCDate() + day);
  const date = base.toLocaleDateString(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
  const h0 = String(hourLabel - 1).padStart(2, "0");
  const h1 = String(hourLabel).padStart(2, "0");
  return `${date}, ${h0}:00–${h1}:00`;
}

export function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
