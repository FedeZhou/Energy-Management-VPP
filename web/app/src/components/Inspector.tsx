import { AlertTriangle, ChevronRight, ChevronsDownUp, ChevronsUpDown, Info, PanelRightClose, PanelRightOpen, Settings2, Trash2 } from "lucide-react";
import type { Field, ProfileInfo, Site } from "../api";
import { ASSET_ICON } from "../icons";
import { METER_ID, useStore } from "../store";
import { ASSET_COLOR, num } from "../util";
import { TariffSuggestion } from "./TariffSuggestion";
import { Help } from "./Help";
import type { HelpTopic } from "../help";
import { useLayout } from "../layout";
import { spec as assetSpec } from "./Nodes";

// Short option labels; the field's help text (in the tooltip) explains each one.
const PRETTY: Record<string, string> = {
  idle: "Idle",
  self_consumption: "Self-consumption",
  price_arbitrage: "Price arbitrage",
  peak_shaving: "Peak shaving",
  as_fast_as_possible: "As fast as possible",
  spread_until_departure: "Spread until departure",
  cheapest_hours: "Cheapest hours",
  solar_surplus: "Solar surplus",
  on_demand: "On demand",
  cheap_hours: "Cheap hours",
  never: "Never",
  high_prices: "At high prices",
  off: "Off",
  perfect: "Perfect (knows the future)",
  realistic: "Realistic (what a controller would know)",
  lfp: "LFP (lithium iron phosphate)",
  nmc: "NMC (nickel manganese cobalt)",
  direct: "Direct (each device)",
  ems: "Via energy management (shared)",
  "1": "1 minute", "5": "5 minutes", "15": "15 minutes", "60": "1 hour",
};
const PHASES: Record<string, string> = { "1": "Single-phase", "3": "Three-phase" };

const resolution = (p: ProfileInfo) => (p.resolution_minutes >= 60 ? "hourly" : `${p.resolution_minutes}-min`);

function profileStat(p: ProfileInfo): string {
  const s = p.stats;
  if (p.kind === "load") return `${num(s.annual_total)} kWh/yr · peak ${num(s.peak, 1)} kW`;
  if (p.kind === "pv") return `${num(s.annual_total)} kWh/kWp/yr`;
  if (p.kind === "price") return `${s.min}–${s.max} ${p.currency ?? ""}/kWh · mean ${s.mean}`;
  if (p.kind === "netfee") return `${num(s.min * 100, 2)}–${num(s.max * 100, 2)} ct/kWh by time of day`;
  if (p.kind === "cop") return `COP ${num(s.min, 1)}–${num(s.max, 1)} · mean ${num(s.mean, 2)}`;
  if (p.kind === "heat") return "Hourly shape, scaled to the annual heat demand";
  if (p.kind === "demand") return `up to ${s.max} ${p.currency ?? ""} per kW-month`;
  return `${s.sessions} visits/yr · ${s.mean_session_kwh} kWh each`;
}

function coverage(p: ProfileInfo): string {
  const span = p.cyclic ? "typical year, repeats" : `${p.first.slice(0, 10)} to ${p.last.slice(0, 10)}`;
  return `Data: ${resolution(p)}, ${span}${p.licence ? `. Licence: ${p.licence}` : ""}`;
}

export function Tip({ text }: { text: string }) {
  if (!text) return null;
  return <span className="tip" title={text} aria-label={text} role="img"><Info size={13} /></span>;
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const profiles = useStore((s) => s.profiles);
  const step = useStore((s) => s.site.step_minutes);
  const id = `f-${f.name}`;
  let input: React.ReactNode;
  let chosen: ProfileInfo | undefined;
  let wide = true;

  if (f.options && profiles) {
    const list = profiles[f.options];
    chosen = list.find((p) => p.id === value);
    // Data at the current step or finer first: it is real at this resolution.
    const fine = list.filter((p) => p.resolution_minutes <= step);
    const coarse = list.filter((p) => p.resolution_minutes > step);
    const opts = (ps: ProfileInfo[]) => ps.map((p) => <option key={p.id} value={p.id}>{p.label}</option>);
    input = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {f.default === "" && <option value="">None</option>}
        {fine.length > 0 && <optgroup label={`Measured at ${step >= 60 ? "1 hour" : `${step} min`} or finer`}>{opts(fine)}</optgroup>}
        {coarse.length > 0 && <optgroup label="Coarser data (values repeated within each data step)">{opts(coarse)}</optgroup>}
      </select>
    );
  } else if (f.type === "boolean") {
    input = (
      <label className="check">
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{value ? "Yes" : "No"}</span>
      </label>
    );
  } else if (f.enum) {
    const labels = f.name === "phases" ? PHASES : PRETTY;
    wide = f.enum.length > 2 || f.name !== "phases";
    input = (
      <select id={id} value={String(value)} onChange={(e) => {
        const raw = e.target.value;
        onChange(typeof f.enum![0] === "number" ? Number(raw) : raw);
      }}>
        {f.enum.map((v) => <option key={String(v)} value={String(v)}>{labels[String(v)] ?? String(v)}</option>)}
      </select>
    );
  } else if (f.format === "date") {
    wide = false;
    input = <input id={id} type="date" value={String(value ?? "")} onChange={(e) => e.target.value && onChange(e.target.value)} />;
  } else if (f.type === "number" || f.type === "integer") {
    wide = false;
    input = (
      <div className="affix">
        <input
          id={id}
          type="number"
          step={f.type === "integer" ? 1 : "any"}
          min={f.min ?? undefined}
          max={f.max ?? undefined}
          value={value == null ? "" : String(value)}
          placeholder={f.nullable ? "None" : ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(f.nullable ? null : 0);
            const v = Number(raw);
            if (Number.isFinite(v)) onChange(f.type === "integer" ? Math.round(v) : v);
          }}
        />
        {f.unit && <span className="unit">{f.unit}</span>}
      </div>
    );
  } else {
    input = <input id={id} type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }

  const source = chosen?.source || f.source;
  const tip = [f.help, chosen ? coverage(chosen) : "", source ? `Source: ${source}` : ""].filter(Boolean).join("\n\n");
  return (
    <div className={`field ${wide ? "wide" : ""}`}>
      <div className="field-label">
        <label htmlFor={id} title={f.label}>{f.label}</label>
        <Tip text={tip} />
      </div>
      {input}
      {chosen && <span className="field-meta">{profileStat(chosen)} · {resolution(chosen)}</span>}
      {chosen?.note && <span className="field-note"><AlertTriangle size={12} />{chosen.note}</span>}
    </div>
  );
}

/** A settings section whose header folds it away. Collapsed, the header shows a one-line
 *  summary of the current values so nothing is hidden without a trace. */
function Collapsible({ id, title, help, summary, forceOpen, children }: {
  id: string; title: string; help?: HelpTopic; summary?: string; forceOpen?: boolean; children: React.ReactNode;
}) {
  const stored = useLayout((s) => !!s.closed[id]);
  const toggle = useLayout((s) => s.toggleSection);
  const closed = stored && !forceOpen;
  const bodyId = `sec-${id}`;
  return (
    <section className={`insp-section ${closed ? "closed" : ""}`}>
      <div className="sect-head">
        <button type="button" className="sect-toggle" aria-expanded={!closed} aria-controls={bodyId} onClick={() => toggle(id)}>
          <ChevronRight size={14} className="chev" />
          <span className="sect-title">{title}</span>
          {closed && summary && <span className="sect-summary" title={summary}>{summary}</span>}
        </button>
        {help && <Help topic={help} />}
      </div>
      {!closed && <div id={bodyId} className="sect-body">{children}</div>}
    </section>
  );
}

function Section({ id, title, help, summary, forceOpen, fields, values, onChange, children }: {
  id: string; title: string; help?: HelpTopic; summary?: string; forceOpen?: boolean;
  fields: Field[]; values: Record<string, unknown>; onChange: (name: string, v: unknown) => void;
  children?: React.ReactNode;
}) {
  return (
    <Collapsible id={id} title={title} help={help} summary={summary} forceOpen={forceOpen}>
      {children}
      <div className="fields">
        {fields.map((f) => <FieldInput key={f.name} f={f} value={values[f.name]} onChange={(v) => onChange(f.name, v)} />)}
      </div>
    </Collapsible>
  );
}

/** Collapse or expand every section in view at once, and fold the panel itself away. */
function HeadTools({ ids }: { ids: string[] }) {
  const closed = useLayout((s) => s.closed);
  const setSections = useLayout((s) => s.setSections);
  const setInspector = useLayout((s) => s.setInspector);
  const allClosed = ids.every((i) => closed[i]);
  return (
    <div className="head-tools">
      <button className="icon-btn" onClick={() => setSections(ids, !allClosed)}
        title={allClosed ? "Expand all sections" : "Collapse all sections"} aria-label={allClosed ? "Expand all sections" : "Collapse all sections"}>
        {allClosed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
      </button>
      <button className="icon-btn" onClick={() => setInspector(true)} title="Hide panel" aria-label="Hide settings panel">
        <PanelRightClose size={15} />
      </button>
    </div>
  );
}

const QUICK: { label: string; days: number }[] = [
  { label: "1D", days: 1 }, { label: "3D", days: 3 }, { label: "1W", days: 7 },
  { label: "1M", days: 30 }, { label: "1Y", days: 365 },
];

function Period({ site }: { site: Site }) {
  const catalog = useStore((s) => s.catalog)!;
  const updateSite = useStore((s) => s.updateSite);
  const steps = (site.days * 1440) / site.step_minutes;
  const tooMany = steps > catalog.site.max_steps;
  const stepTxt = PRETTY[String(site.step_minutes)] ?? `${site.step_minutes} min`;
  return (
    <Collapsible id="period" title="Period" help="period" summary={`${num(site.days)} day${site.days === 1 ? "" : "s"} from ${site.start} · ${stepTxt}`}>
      <div className="segmented fill" role="group" aria-label="Quick period">
        {QUICK.map((q) => (
          <button key={q.days} className={site.days === q.days ? "on" : ""} onClick={() => updateSite({ days: q.days })}
            title={`${q.days} day${q.days > 1 ? "s" : ""}`}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="fields">
        {catalog.site.period.map((f) => (
          <FieldInput key={f.name} f={f} value={(site as unknown as Record<string, unknown>)[f.name]}
            onChange={(v) => updateSite({ [f.name]: v } as Partial<Site>)} />
        ))}
      </div>
      <span className={`foot-note ${tooMany ? "bad" : ""}`}>
        {num(steps)} steps{tooMany ? ` · limit is ${num(catalog.site.max_steps)}. Use a longer step or fewer days.` : ""}
      </span>
    </Collapsible>
  );
}

export function Inspector() {
  const catalog = useStore((s) => s.catalog);
  const site = useStore((s) => s.site);
  const selectedId = useStore((s) => s.selectedId);
  const profiles = useStore((s) => s.profiles);
  const panelClosed = useLayout((s) => s.inspectorClosed);
  const setInspector = useLayout((s) => s.setInspector);
  const { updateAsset, removeAsset, updateSection, updateSite } = useStore.getState();
  if (!catalog) return <aside className="inspector" data-tour="inspector" />;

  const asset = site.assets.find((a) => a.id === selectedId);
  if (panelClosed) {
    const Icon = asset ? ASSET_ICON[asset.type] : Settings2;
    return (
      <aside className="inspector rail" data-tour="inspector" aria-label="Settings (hidden)">
        <button className="icon-btn" onClick={() => setInspector(false)} title="Show panel" aria-label="Show settings panel">
          <PanelRightOpen size={15} />
        </button>
        <button className="tile lg rail-tile" onClick={() => setInspector(false)} title={asset ? `Edit ${asset.name || asset.id}` : "Site settings"}
          style={{ "--tone": asset ? ASSET_COLOR[asset.type] : "var(--ink-2)" } as React.CSSProperties}>
          <Icon size={17} />
        </button>
      </aside>
    );
  }
  if (asset) {
    const spec = catalog.assets[asset.type];
    const Icon = ASSET_ICON[asset.type];
    return (
      <aside className="inspector" data-tour="inspector" aria-label="Properties">
        <div className="insp-head">
          <span className="tile lg" style={{ "--tone": ASSET_COLOR[asset.type] } as React.CSSProperties}><Icon size={17} /></span>
          <div className="titles">
            <span className="insp-kind" title={spec.description}>{spec.label}</span>
            <input className="name-input" aria-label="Name" value={asset.name} placeholder={asset.id}
              onChange={(e) => updateAsset(asset.id, { name: e.target.value })} />
          </div>
          <button className="icon-btn danger" onClick={() => removeAsset(asset.id)} title="Remove" aria-label="Remove from site">
            <Trash2 size={16} />
          </button>
          <HeadTools ids={["params"]} />
        </div>
        <Section id="params" title="Parameters" help={asset.type} fields={spec.fields.filter((f) => f.name !== "name")} values={asset}
          summary={assetSpec(asset, (pid) => profiles?.load.find((p) => p.id === pid)?.label.split(" (")[0] ?? pid)}
          onChange={(n, v) => updateAsset(asset.id, { [n]: v })} />
      </aside>
    );
  }

  // Show only the settings that apply to this site.
  const hasHp = site.assets.some((a) => a.type === "heat_pump");
  const hasBidi = site.assets.some((a) => a.type === "ev_charger" && a.bidirectional);
  const ctrlFields = catalog.site.controller.filter((f) =>
    (f.name !== "peak_threshold_kw" || site.controller.battery === "peak_shaving")
    && (!f.name.startsWith("mpc_") || site.controller.battery === "mpc")
    && (f.name !== "heat_pump" || hasHp)
    && (f.name !== "ev_discharge" || hasBidi));
  const gridFields = catalog.site.grid.filter((f) =>
    !f.name.startsWith("dimming_") || (site.grid.dimming ?? "off") !== "off");
  const limits = [
    site.grid.import_limit_kw != null ? `import ${site.grid.import_limit_kw} kW` : "",
    site.grid.export_limit_kw != null ? `export ${site.grid.export_limit_kw} kW` : "",
    site.grid.fuse_a != null ? `fuse 3 × ${site.grid.fuse_a} A` : "",
  ].filter(Boolean).join(" · ");
  const price = profiles?.price.find((p) => p.id === site.tariff.price_profile)?.label.split(" (")[0] ?? site.tariff.price_profile;
  const grid = <Section key="grid" id="grid" title="Grid connection" help="grid" fields={gridFields} values={site.grid}
    summary={limits ? limits.charAt(0).toUpperCase() + limits.slice(1) : "No limits"} forceOpen={selectedId === METER_ID}
    onChange={(n, v) => updateSection("grid", { [n]: v })} />;
  return (
    <aside className="inspector" data-tour="inspector" aria-label="Site settings">
      <div className="insp-head">
        <span className="tile lg" style={{ "--tone": "var(--ink-2)" } as React.CSSProperties}><Settings2 size={17} /></span>
        <div className="titles">
          <span className="insp-kind">Site · {site.mode === "plan" ? "Plan" : "Operate"}</span>
          <input className="name-input" aria-label="Site name" value={site.name} onChange={(e) => updateSite({ name: e.target.value })} />
        </div>
        <HeadTools ids={["period", "controller", "grid", "tariff"]} />
      </div>
      {selectedId === METER_ID && grid}
      <Period site={site} />
      <Section id="controller" title="Control strategy" help="controller" fields={ctrlFields}
        summary={`Battery: ${PRETTY[site.controller.battery] ?? site.controller.battery} · EV: ${PRETTY[site.controller.ev] ?? site.controller.ev}`} values={site.controller} onChange={(n, v) => updateSection("controller", { [n]: v })} />
      {selectedId !== METER_ID && grid}
      <Section id="tariff" title="Tariff" help="tariff" summary={price} fields={catalog.site.tariff} values={site.tariff} onChange={(n, v) => updateSection("tariff", { [n]: v })}>
        <TariffSuggestion />
      </Section>
    </aside>
  );
}
