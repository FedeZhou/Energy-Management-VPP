import { Info, Trash2 } from "lucide-react";
import type { Field, ProfileInfo } from "../api";
import { METER_ID, useStore } from "../store";
import { num } from "../util";

const PRETTY: Record<string, string> = {
  idle: "Idle (never use the battery)",
  self_consumption: "Self-consumption (store spare solar)",
  price_arbitrage: "Price arbitrage (buy cheap, use at dear hours)",
  peak_shaving: "Peak shaving (cap grid import)",
  as_fast_as_possible: "As fast as possible",
  spread_until_departure: "Spread until departure",
};

function profileStat(p: ProfileInfo): string {
  const s = p.stats;
  if (p.kind === "load") return `${num(s.annual_total)} kWh/yr, peak ${num(s.peak, 1)} kW`;
  if (p.kind === "pv") return `${num(s.annual_total)} kWh per kWp per year`;
  if (p.kind === "price") return `min ${s.min} · mean ${s.mean} · max ${s.max} per kWh`;
  return `${s.sessions} sessions, ${num(s.annual_energy_kwh)} kWh/yr, ${s.mean_session_kwh} kWh per visit`;
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const profiles = useStore((s) => s.profiles);
  const id = `f-${f.name}`;
  let input: React.ReactNode;
  let chosen: ProfileInfo | undefined;

  if (f.options && profiles) {
    const list = profiles[f.options];
    chosen = list.find((p) => p.id === value);
    input = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {list.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    );
  } else if (f.enum) {
    input = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {f.enum.map((v) => <option key={v} value={v}>{PRETTY[v] ?? v}</option>)}
      </select>
    );
  } else if (f.type === "number" || f.type === "integer") {
    input = (
      <div className="with-unit">
        <input
          id={id}
          type="number"
          step={f.type === "integer" ? 1 : "any"}
          min={f.min ?? undefined}
          max={f.max ?? undefined}
          value={value == null ? "" : String(value)}
          placeholder={f.nullable ? "unlimited" : ""}
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

  return (
    <div className="field">
      <label htmlFor={id}>{f.label}</label>
      {input}
      {chosen && <span className="small muted">{profileStat(chosen)}</span>}
      {f.help && <span className="small help">{f.help}</span>}
      {(f.source || chosen?.source) && (
        <span className="small source" title={chosen?.source ?? f.source}>
          <Info size={12} /> Source: {f.source || chosen?.source}
        </span>
      )}
      {chosen?.note && <span className="small note">{chosen.note}</span>}
    </div>
  );
}

function Section({ title, fields, values, onChange }: {
  title: string; fields: Field[]; values: Record<string, unknown>; onChange: (name: string, v: unknown) => void;
}) {
  return (
    <section className="insp-section">
      <h4>{title}</h4>
      {fields.map((f) => <FieldInput key={f.name} f={f} value={values[f.name]} onChange={(v) => onChange(f.name, v)} />)}
    </section>
  );
}

export function Inspector() {
  const catalog = useStore((s) => s.catalog);
  const site = useStore((s) => s.site);
  const selectedId = useStore((s) => s.selectedId);
  const { updateAsset, removeAsset, updateSection, updateSite } = useStore.getState();
  if (!catalog) return <aside className="inspector" />;

  const asset = site.assets.find((a) => a.id === selectedId);
  if (asset) {
    const spec = catalog.assets[asset.type];
    return (
      <aside className="inspector">
        <div className="insp-head">
          <div>
            <span className="eyebrow">{spec.label}</span>
            <h3>{asset.name || asset.id}</h3>
          </div>
          <button className="icon-btn danger" onClick={() => removeAsset(asset.id)} title="Remove from site" aria-label="Remove from site">
            <Trash2 size={16} />
          </button>
        </div>
        <p className="small muted">{spec.description}</p>
        <Section title="Parameters" fields={spec.fields} values={asset} onChange={(n, v) => updateAsset(asset.id, { [n]: v })} />
      </aside>
    );
  }

  const ctrlFields = catalog.site.controller.filter((f) => f.name !== "peak_threshold_kw" || site.controller.battery === "peak_shaving");
  return (
    <aside className="inspector">
      <div className="insp-head">
        <div>
          <span className="eyebrow">{selectedId === METER_ID ? "Grid connection" : "Site settings"}</span>
          <h3>{site.name}</h3>
        </div>
      </div>
      <div className="field">
        <label htmlFor="site-name">Site name</label>
        <input id="site-name" value={site.name} onChange={(e) => updateSite({ name: e.target.value })} />
      </div>
      <Section title="Controller" fields={ctrlFields} values={site.controller} onChange={(n, v) => updateSection("controller", { [n]: v })} />
      <Section title="Grid connection" fields={catalog.site.grid} values={site.grid} onChange={(n, v) => updateSection("grid", { [n]: v })} />
      <Section title="Tariff" fields={catalog.site.tariff} values={site.tariff} onChange={(n, v) => updateSection("tariff", { [n]: v })} />
      <Section title="Period" fields={catalog.site.period} values={site as unknown as Record<string, unknown>} onChange={(n, v) => updateSite({ [n]: v })} />
    </aside>
  );
}
