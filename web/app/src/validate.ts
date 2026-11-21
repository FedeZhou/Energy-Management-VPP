import type { Catalog, Field, Site } from "./api";

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
