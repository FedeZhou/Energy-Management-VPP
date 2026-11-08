import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, X } from "lucide-react";
import { api, type DataSource, type DataSources } from "../api";
import { useStore } from "../store";
import "./data-panel.css";

const KIND: Record<DataSource["kind"], { label: string; hint: string }> = {
  measured: { label: "Measured", hint: "Recorded by meters or markets" },
  modelled: { label: "Modelled", hint: "Computed by a validated model" },
  statistics: { label: "Official statistics", hint: "Published averages" },
  mixed: { label: "Mixed", hint: "Partly synthetic, origin partly undocumented" },
};

function SourceCard({ s }: { s: DataSource }) {
  return (
    <article className="dp-card">
      <header className="dp-card-head">
        <div>
          <h4>{s.name}</h4>
          <span className="dp-provider">{s.provider}</span>
        </div>
        <span className={`dp-kind ${s.kind}`} title={KIND[s.kind].hint}>{KIND[s.kind].label}</span>
      </header>
      <p>{s.what}</p>
      <dl className="dp-facts">
        <div><dt>Used for</dt><dd>{s.used_for}</dd></div>
        <div><dt>Resolution</dt><dd>{s.resolution}</dd></div>
        <div><dt>Period</dt><dd>{s.coverage}</dd></div>
        <div><dt>Profiles</dt><dd>{s.profiles}</dd></div>
        <div><dt>Licence</dt><dd>{s.licence}{!s.commercial_use && <span className="dp-flag">Non-commercial only</span>}</dd></div>
      </dl>
      {s.caveats && <p className="dp-caveat"><AlertTriangle size={13} />{s.caveats}</p>}
      <p className="dp-attrib">{s.attribution}</p>
      <a href={s.url} target="_blank" rel="noreferrer" className="dp-link">Open source <ExternalLink size={12} /></a>
    </article>
  );
}

/** "Where the data comes from": every source with its trust level, licence and attribution,
 *  the checks we ran against independent references, and the sources we rejected and why. */
export function DataPanel() {
  const open = useStore((s) => s.dataPanelOpen);
  const setOpen = useStore((s) => s.setDataPanel);
  const [data, setData] = useState<DataSources | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A link ending in #data opens the panel directly.
  useEffect(() => {
    if (location.hash.includes("data")) setOpen(true);
  }, [setOpen]);

  useEffect(() => {
    if (!open || data) return;
    api.datasources().then(setData).catch((e: Error) => setError(e.message));
  }, [open, data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="dp-overlay" onClick={() => setOpen(false)}>
      <div className="dp-dialog" role="dialog" aria-modal="true" aria-labelledby="dp-title" onClick={(e) => e.stopPropagation()}>
        <header className="dp-head">
          <div>
            <h2 id="dp-title">Where the data comes from</h2>
            <p>Simulations are only as realistic as their inputs. These are the sources behind every profile, how much
              to trust each one, and the licence it comes with.</p>
          </div>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="dp-body">
          {error && <p className="dp-error">Could not load the data sources: {error}</p>}
          {!data && !error && <p className="muted">Loading…</p>}
          {data && (
            <>
              {data.warnings.length > 0 && (
                <p className="dp-error"><AlertTriangle size={13} /> Some sources could not be loaded: {data.warnings.join("; ")}</p>
              )}
              <section>
                <h3>Sources</h3>
                <div className="dp-grid">{data.sources.map((s) => <SourceCard key={s.id} s={s} />)}</div>
              </section>

              <section>
                <h3>Checks against independent references</h3>
                <ul className="dp-checks">
                  {data.checks.map((c) => (
                    <li key={c.what}><CheckCircle2 size={14} className="ok" /><span><strong>{c.what}.</strong> {c.result}</span></li>
                  ))}
                </ul>
                {data.pv_checks.length > 0 && (
                  <div className="dp-table-wrap">
                    <table className="dp-table">
                      <caption>Solar model vs PVGIS (EU Joint Research Centre), yearly yield in kWh per kWp</caption>
                      <thead><tr><th>Location</th><th>Panels</th><th>Our model, last 12 months</th><th>PVGIS long-term</th><th>Difference</th></tr></thead>
                      <tbody>
                        {data.pv_checks.map((c) => (
                          <tr key={c.profile}>
                            <td>{c.place}</td>
                            <td>{c.orientation}</td>
                            <td className="num">{c.ours_last_12_months.toLocaleString("en-GB")}</td>
                            <td className="num">{c.pvgis_mean.toLocaleString("en-GB")} ± {c.pvgis_sd}</td>
                            <td className={`num ${c.within_2_sd ? "" : "warn"}`}>
                              {c.difference_pct > 0 ? "+" : ""}{c.difference_pct}%{c.within_2_sd ? "" : " (outside normal weather range)"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3>Rules the simulator follows</h3>
                <ul className="dp-rules">{data.rules.map((r) => <li key={r}>{r}</li>)}</ul>
              </section>

              <section>
                <h3>Checked and not used</h3>
                <ul className="dp-excluded">
                  {data.excluded.map((x) => <li key={x.name}><strong>{x.name}.</strong> {x.why}</li>)}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
