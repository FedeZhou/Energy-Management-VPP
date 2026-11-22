import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2 } from "lucide-react";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { reliabilityOf, STATIC_DEMO, type Site } from "../api";
import {
  batteryBasis, contractOptions, costKey, defaultSizes, MAX_CONTRACTS, MAX_RUNS, paretoFront, parsePercents,
  parseSizes, round3, siteKey, usePlanner, type ContractOption, type PlanRun,
} from "../planner";
import { useStore } from "../store";
import { useTheme } from "../theme";
import { kw, money, num, pct, qty, readVar } from "../util";
import { Help } from "./Help";
import { PRETTY } from "./Inspector";

echarts.use([ScatterChart, LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

/** Contract colours: the three categorical slots of Compare.tsx OVERLAY (validated all-pairs for colour-vision
 *  deficiency in both themes, dataviz reference palette), then a neutral ink for a fourth option. Every contract
 *  also has its own marker shape, so identity never rests on colour alone. */
const SLOTS = { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] };
const SHAPES = ["circle", "rect", "triangle", "diamond"] as const;
const contractColor = (i: number, theme: "light" | "dark") => SLOTS[theme][i] ?? readVar("--ink-2");

/** A size as typed: whole numbers without decimals ("75 kWh", not "75.0 kWh"). */
const n = (v: number) => num(v, Number.isInteger(v) ? 0 : "auto");
const sizeText = (r: Pick<PlanRun, "kwh" | "kw">) => (r.kwh > 0 ? `${n(r.kwh)} kWh / ${n(r.kw)} kW` : "No battery");
const sizeShort = (r: Pick<PlanRun, "kwh">) => (r.kwh > 0 ? `${n(r.kwh)} kWh` : "none");
const periodText = (days: number) => (days >= 365 && days <= 366 ? "per year" : `over ${num(days)} days`);

function Marker({ i, theme }: { i: number; theme: "light" | "dark" }) {
  const c = contractColor(i, theme);
  const shape = SHAPES[i] ?? "circle";
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="pl-marker">
      {shape === "circle" && <circle cx="5" cy="5" r="4.5" fill={c} />}
      {shape === "rect" && <rect x="1" y="1" width="8" height="8" fill={c} />}
      {shape === "triangle" && <path d="M5 0.5 L9.5 9 L0.5 9 Z" fill={c} />}
      {shape === "diamond" && <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={c} />}
    </svg>
  );
}

export function Planner() {
  const site = useStore((s) => s.site);
  const catalog = useStore((s) => s.catalog);
  const result = useStore((s) => s.result);
  const theme = useTheme((s) => s.theme);
  const runs = usePlanner((s) => s.runs);
  const contracts = usePlanner((s) => s.contracts);
  const baseKey = usePlanner((s) => s.baseKey);
  const planned = usePlanner((s) => s.planned);
  const progress = usePlanner((s) => s.progress);
  const error = usePlanner((s) => s.error);
  const { run, cancel, clear, open } = usePlanner.getState();

  // Inputs start from the site on screen and reset when another site is loaded (not when a variant is opened).
  const [sizesText, setSizesText] = useState(() => defaultSizes(site, catalog).join(", "));
  const [useCurrent, setUseCurrent] = useState(true);
  const [useFirm, setUseFirm] = useState(true);
  const [pctText, setPctText] = useState("80, 120");
  const resetInputs = () => { setSizesText(defaultSizes(site, catalog).join(", ")); setUseCurrent(true); setUseFirm(true); setPctText("80, 120"); };
  const lastName = useRef(site.name);
  useEffect(() => {
    if (site.name !== lastName.current) { lastName.current = site.name; resetInputs(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.name]);

  const basis = batteryBasis(site, catalog);
  const sizes = parseSizes(sizesText);
  const percents = parsePercents(pctText);
  const hasWindows = (site.grid.contract_windows ?? []).length > 0;
  const options = useMemo(() => contractOptions(site, { current: useCurrent, firmOnly: useFirm, percents: parsePercents(pctText) ?? [] }),
    [site, useCurrent, useFirm, pctText]);
  const nRuns = (sizes?.length ?? 0) * options.length;
  const blocked = STATIC_DEMO ? "The public demo cannot run new simulations; open the live app to plan."
    : !sizes ? "Battery sizes: type kWh values separated by commas, e.g. 0, 75, 150"
    : !percents ? "Reduced limit: type percentages separated by commas, e.g. 80, 120"
    : !options.length ? "Pick at least one contract option"
    : options.length > MAX_CONTRACTS ? `At most ${MAX_CONTRACTS} contract options, so the chart can tell them apart (now ${options.length})`
    : nRuns > MAX_RUNS ? `${nRuns} runs is too many: at most ${MAX_RUNS}. Try fewer sizes or contracts.`
    : null;

  const curKey = siteKey(site);
  const planStale = !!baseKey && runs.length > 0 && curKey !== baseKey && !runs.some((r) => siteKey(r.site) === curKey);
  const key = costKey(runs);
  const wearPriced = key === "total_cost_with_wear";
  const cur = runs[0]?.result.result.currency ?? result?.result.currency ?? "";
  const m = (v: number) => money(v, cur, 0);
  const cIndex = (id: string) => contracts.findIndex((c) => c.id === id);
  const cLabel = (id: string) => contracts.find((c) => c.id === id)?.label ?? id;
  const sorted = [...runs].sort((a, b) => a.result.result.kpis[key] - b.result.result.kpis[key]);
  const front = paretoFront(runs, key);
  const frontIds = new Set(front.map((r) => r.id));
  const anyLimit = runs.some((r) => reliabilityOf(r.result.result.kpis));
  const days = runs[0]?.site.days ?? site.days;
  const idle = site.controller.battery === "idle";

  return (
    <div className="tab-pane pl">
      <p className="pane-intro">
        Replays this site once per battery size and contract option, then puts yearly cost next to the days the grid
        limit held. Contract options are variants to explore, not offers. <Help topic="planner" />
      </p>

      <div className="pl-inputs">
        <label className="pl-row">
          <span className="pl-label">Battery sizes</span>
          <input type="text" value={sizesText} onChange={(e) => setSizesText(e.target.value)} disabled={!!progress}
            aria-label="Battery sizes to try, in kWh" aria-invalid={!sizes} className={!sizes ? "pl-bad" : ""} />
          <span className="pl-unit">kWh</span>
          <span className="pl-note">
            0 = no battery. Power scales at {num(basis.cRate, 2)} kW per kWh
            {basis.fromCatalog ? " (the default battery's ratio)" : ` (today: ${kw(basis.kwh * basis.cRate)} for ${qty(basis.kwh, "kWh")})`}.
          </span>
        </label>
        <div className="pl-row">
          <span className="pl-label">Contracts</span>
          <label className="pl-check"><input type="checkbox" checked={useCurrent} onChange={(e) => setUseCurrent(e.target.checked)} disabled={!!progress} /> Current</label>
          {hasWindows && <label className="pl-check"><input type="checkbox" checked={useFirm} onChange={(e) => setUseFirm(e.target.checked)} disabled={!!progress} /> Firm limit only (no windows)</label>}
          {(hasWindows || site.grid.import_limit_kw != null) && (
            <label className="pl-check">
              {hasWindows ? "Window limit at" : "Firm limit at"}
              <input type="text" value={pctText} onChange={(e) => setPctText(e.target.value)} disabled={!!progress} className={`pl-pct ${!percents ? "pl-bad" : ""}`}
                aria-label="Reduced limit variants, percent of today's value" aria-invalid={!percents} />
              % of today
            </label>
          )}
        </div>
        {options.length > 0 && (
          <ul className="pl-options" aria-label="Contract options to try">
            {options.map((o, i) => (
              <li key={o.id}><Marker i={i} theme={theme} /><b>{o.label}</b><span>{o.detail}</span></li>
            ))}
          </ul>
        )}
        <div className="pl-row pl-run">
          {progress ? (
            <button className="btn" onClick={cancel} title="Stop; finished runs are kept">
              <Loader2 size={14} className="spin" /> Running {progress.done}/{progress.total} · Stop
            </button>
          ) : (
            <button className="btn primary" onClick={() => void run(sizes ?? [], options)} disabled={!!blocked}
              title={blocked ?? `Runs ${nRuns} simulations of this site, two at a time`}>
              Run {nRuns || ""} {nRuns === 1 ? "run" : "runs"}
            </button>
          )}
          <span className="pl-count">{sizes?.length ?? 0} sizes × {options.length} contracts = {nRuns} runs</span>
          {!progress && <button className="btn ghost" onClick={resetInputs} title="Reset the inputs to the defaults for this site">Defaults</button>}
          {runs.length > 0 && !progress && <button className="btn ghost" onClick={clear}>Clear</button>}
        </div>
        {blocked && !progress && <p className="alert warn"><AlertTriangle size={13} /><span>{blocked}</span></p>}
        {idle && <p className="alert warn"><AlertTriangle size={13} /><span>The battery strategy is Idle, so no battery size will change anything. Pick a strategy under Control first.</span></p>}
      </div>

      {error && <p className="alert bad"><AlertTriangle size={13} /><span>{error}</span></p>}
      {planStale && <p className="alert warn"><AlertTriangle size={13} /><span>The site has changed since this plan ran. Run again to plan for it.</span></p>}
      {runs.length > 0 && !wearPriced && runs.some((r) => r.kwh > 0) && (
        <p className="alert warn"><AlertTriangle size={13} /><span>Battery wear is not priced (no replacement cost for this currency), so the costs below leave out the battery and bigger batteries look free. Set a replacement cost on the battery to compare fairly.</span></p>
      )}

      {runs.length > 0 && (
        <>
          {progress ? (
            <div className="pl-rec">
              <span className="panel-title">Recommendation</span>
              <p className="pl-rec-base">{progress.done} of {progress.total} runs done. The recommendation appears when all runs have finished; the points below fill in as they do.</p>
            </div>
          ) : (
            <Recommendation runs={runs} sorted={sorted} costKey={key} fmt={m} days={days} label={cLabel} site={site}
              partial={runs.length < planned ? `Stopped early: based on ${runs.length} of ${planned} runs.` : null} />
          )}
          {anyLimit ? (
            <Scatter runs={runs} front={front} contracts={contracts} costKey={key} fmt={m} theme={theme} />
          ) : (
            <p className="pane-intro">This site has no import limit, so there is no reliability to plot: the table ranks the options by cost.</p>
          )}
          <div className="table-wrap">
            <table className="table pl-table">
              <thead>
                <tr>
                  <th>Battery</th>
                  <th>Contract</th>
                  <th>{wearPriced ? "Cost incl. wear" : "Total cost"}<br /><span className="pl-th-sub">{periodText(days)}</span></th>
                  <th>Days kept</th>
                  <th>Target</th>
                  <th>Over limit</th>
                  <th>EV short</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const k = r.result.result.kpis;
                  const rel = reliabilityOf(k);
                  return (
                    <tr key={r.id} className={r.result === result ? "current" : ""}>
                      <td>{sizeText(r)}{frontIds.has(r.id) && <span className="pl-tag" title="On the front: no cheaper option keeps the limit on as many days">front</span>}</td>
                      <td><span className="pl-contract"><Marker i={cIndex(r.contract)} theme={theme} />{cLabel(r.contract)}</span></td>
                      <td>{m(k[key])}</td>
                      <td>{rel ? `${pct(rel.limit_days_kept_share)} · ${num(rel.limit_days_kept)}/${num(rel.limit_days_evaluated)}` : "—"}</td>
                      <td>
                        {rel ? (
                          <span className={`kpi-status ${rel.limit_target_met ? "good" : "bad"}`}>
                            {rel.limit_target_met ? <CheckCircle2 size={12} aria-hidden /> : <AlertTriangle size={12} aria-hidden />}
                            <span>{rel.limit_target_met ? "met" : "missed"}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td>{rel ? qty(rel.limit_excess_kwh, "kWh", 0) : "—"}</td>
                      <td>{typeof k.ev_unmet_kwh === "number" ? qty(k.ev_unmet_kwh, "kWh", 0) : "—"}</td>
                      <td className="cmp-row-actions">
                        <button className="icon-btn sm" onClick={() => open(r.id)} title="Open: make this variant the site and result on screen" aria-label={`Open ${sizeText(r)}, ${cLabel(r.contract)}`}>
                          <FolderOpen size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="pl-foot">
            Strategy: {PRETTY[site.controller.battery] ?? site.controller.battery} battery, {PRETTY[site.controller.ev] ?? site.controller.ev} charging,
            {" "}{site.controller.forecast === "realistic" ? "realistic" : "perfect"} forecasts. One replay of the simulated period: days kept is
            a count over these days, not a probability.
            {wearPriced && " Cost incl. wear counts the battery as the share of its replacement value this period used up (Figgener et al. 2023 prices unless set)."}
          </p>
        </>
      )}
      {runs.length === 0 && !progress && <p className="empty-note">Pick sizes and contracts, then run.</p>}
    </div>
  );
}

/** One plain sentence: the cheapest option that meets the reliability target, or the most reliable one. */
function Recommendation({ runs, sorted, costKey: key, fmt, days, label, site, partial }: {
  runs: PlanRun[]; sorted: PlanRun[]; costKey: string; fmt: (v: number) => string; days: number; label: (id: string) => string; site: Site;
  partial: string | null;
}) {
  const per = periodText(days);
  const what = key === "total_cost_with_wear" ? "including battery wear" : "energy bill only";
  const name = (r: PlanRun) => `${r.kwh > 0 ? `${n(r.kwh)} kWh / ${n(r.kw)} kW of battery` : "no battery"} with ${r.contract === "current" ? "the current contract" : `“${label(r.contract)}”`}`;
  const evNote = (r: PlanRun) => {
    const ev = r.result.result.kpis.ev_unmet_kwh;
    return typeof ev === "number" && ev >= 0.5 ? ` Cars were left ${qty(ev, "kWh", 0)} short: the simulator slows charging to keep the limit.` : "";
  };
  const rels = runs.map((r) => ({ r, rel: reliabilityOf(r.result.result.kpis) }));
  const today = round3(batteryBasis(site, null).kwh);
  const base = runs.find((r) => r.contract === "current" && r.kwh === today);
  const target = rels.find((x) => x.rel)?.rel?.limit_reliability_target ?? 0.9;

  let text: string;
  if (!rels.some((x) => x.rel)) {
    const c = sorted[0];
    text = `This site has no import limit, so only cost is compared. The cheapest option is ${name(c)}: ${fmt(c.result.result.kpis[key])} ${per} (${what}).${evNote(c)}`;
  } else {
    const met = sorted.filter((r) => reliabilityOf(r.result.result.kpis)?.limit_target_met);
    if (met.length) {
      const c = met[0];
      const rel = reliabilityOf(c.result.result.kpis)!;
      text = `The cheapest option that keeps the limit on at least ${pct(target)} of days is ${name(c)}: ${fmt(c.result.result.kpis[key])} ${per} (${what}), limit kept on ${pct(rel.limit_days_kept_share)} of days.${evNote(c)}`;
      // Slowing cars also lowers the bill, so a cheaper option may simply have delivered less. Name the cheapest
      // option that met the target with the least EV shortfall, so the two can be weighed.
      const ev = (r: PlanRun) => r.result.result.kpis.ev_unmet_kwh;
      if (typeof ev(c) === "number") {
        const least = Math.min(...met.map((r) => ev(r) ?? Infinity));
        const alt = met.find((r) => (ev(r) ?? Infinity) <= least + 0.5);
        if (alt && alt !== c && ev(c) - least >= 0.5) {
          text += ` Part of the saving is energy the cars did not get: ${name(alt)} leaves them ${qty(least, "kWh", 0)} short, for ${fmt(alt.result.result.kpis[key])} ${per}.`;
        }
      }
    } else {
      const best = [...rels].filter((x) => x.rel).sort((a, b) => b.rel!.limit_days_kept_share - a.rel!.limit_days_kept_share
        || a.r.result.result.kpis[key] - b.r.result.result.kpis[key])[0];
      text = `No option meets the ${pct(target)} target. The most reliable is ${name(best.r)}: limit kept on ${pct(best.rel!.limit_days_kept_share)} of days, ${fmt(best.r.result.result.kpis[key])} ${per} (${what}).${evNote(best.r)}`;
    }
  }
  const baseRel = base && reliabilityOf(base.result.result.kpis);
  return (
    <div className="pl-rec">
      <span className="panel-title">Recommendation</span>
      <p>{text}</p>
      {partial && <p className="pl-rec-base">{partial}</p>}
      {base && (
        <p className="pl-rec-base">
          Today's set-up ({base.kwh > 0 ? `${n(base.kwh)} kWh` : "no battery"}, current contract): {fmt(base.result.result.kpis[key])} {per}
          {baseRel ? `, limit kept on ${pct(baseRel.limit_days_kept_share)} of days` : ""}.
        </p>
      )}
    </div>
  );
}

/** Cost against days kept, one point per run; colour and shape = contract, label = battery size. The line joins
 *  the front (cheapest for each reliability level); the dashed line is the reliability target. */
function Scatter({ runs, front, contracts, costKey: key, fmt, theme }: {
  runs: PlanRun[]; front: PlanRun[]; contracts: ContractOption[]; costKey: string; fmt: (v: number) => string; theme: "light" | "dark";
}) {
  const box = useRef<HTMLDivElement>(null);
  const sig = runs.map((r) => r.id).join("|") + key + theme;
  useEffect(() => {
    if (!box.current || !runs.length) return;
    const c = echarts.init(box.current, undefined, { renderer: "canvas" });
    const v = readVar, muted = v("--muted"), mono = v("--font-mono"), font = v("--font-ui"), ink = v("--ink"), surface = v("--surface");
    const kept = (r: PlanRun) => (reliabilityOf(r.result.result.kpis)?.limit_days_kept_share ?? NaN) * 100;
    const target = (reliabilityOf(runs.find((r) => reliabilityOf(r.result.result.kpis))!.result.result.kpis)?.limit_reliability_target ?? 0.9) * 100;
    const ys = runs.map(kept).filter(Number.isFinite);
    const yMin = Math.max(0, Math.floor((Math.min(...ys, target) - 5) / 10) * 10);
    const byId = new Map(runs.map((r) => [r.id, r]));
    const frontSet = new Set(front.map((r) => r.id));
    const label = (id: string) => contracts.find((x) => x.id === id)?.label ?? id;
    const tip = (r: PlanRun) => {
      const k = r.result.result.kpis;
      const rel = reliabilityOf(k);
      const row = (a: string, b: string) => `<tr><td style="color:${muted};padding-right:12px">${a}</td><td style="text-align:right;font-family:${mono}">${b}</td></tr>`;
      return `<b>${sizeText(r)}</b> · ${label(r.contract)}<table style="margin-top:4px;font-size:12px">`
        + (key === "total_cost_with_wear" ? row("Cost incl. wear", fmt(k.total_cost_with_wear)) + row("of which wear", fmt(k.battery_wear_cost)) : "")
        + row("Energy cost", fmt(k.total_cost))
        + (rel ? row("Days kept", `${pct(rel.limit_days_kept_share)} (${num(rel.limit_days_kept)}/${num(rel.limit_days_evaluated)})`)
          + row("Target", rel.limit_target_met ? "met" : "missed")
          + row("Over the limit", qty(rel.limit_excess_kwh, "kWh", 0))
          + (rel.limit_daily_peak_ratio_at_target != null ? row(`P${Math.round(rel.limit_reliability_target * 100)} daily peak`, `${num(rel.limit_daily_peak_ratio_at_target, 2)}× limit`) : "") : "")
        + row("Peak import", kw(k.peak_import_kw))
        + (typeof k.ev_unmet_kwh === "number" ? row("EV short", qty(k.ev_unmet_kwh, "kWh", 0)) : "")
        + (r.kwh > 0 && k.battery_life_years ? row("Battery life", `${k.battery_life_capped ? "> " : ""}${qty(k.battery_life_years, "yr", 1)}`) : "")
        + "</table>";
    };
    c.setOption({
      animation: false,
      textStyle: { fontFamily: font },
      grid: { left: 52, right: 72, top: 60, bottom: 44 },
      legend: { top: 0, left: 48, itemWidth: 10, itemHeight: 10, itemGap: 16, textStyle: { color: v("--ink-2"), fontSize: 12, fontFamily: font },
        data: [...contracts.map((x) => x.label), "Cheapest for its reliability"] },
      tooltip: { trigger: "item", backgroundColor: surface, borderColor: v("--border"), textStyle: { color: ink, fontSize: 12, fontFamily: font },
        formatter: (p: { data?: { id?: string } }) => { const r = p.data?.id ? byId.get(p.data.id) : undefined; return r ? tip(r) : ""; } },
      xAxis: { type: "value", scale: true, name: key === "total_cost_with_wear" ? "Cost incl. wear" : "Total cost", nameLocation: "middle", nameGap: 28,
        nameTextStyle: { color: muted, fontSize: 10.5, fontFamily: mono }, splitNumber: 5,
        axisLabel: { color: muted, fontSize: 10.5, fontFamily: mono, formatter: (x: number) => fmt(x) },
        axisLine: { lineStyle: { color: v("--border-strong") } }, axisTick: { show: false }, splitLine: { lineStyle: { color: v("--chart-grid") } } },
      yAxis: { type: "value", min: yMin, max: 100, name: "Days kept (%)", nameGap: 14, nameTextStyle: { color: muted, fontSize: 10.5, fontFamily: mono, align: "left" },
        axisLabel: { color: muted, fontSize: 10.5, fontFamily: mono, formatter: (y: number) => `${y}%` }, splitLine: { lineStyle: { color: v("--chart-grid") } } },
      series: [
        {
          name: "Cheapest for its reliability", type: "line", z: 1, silent: true, tooltip: { show: false },
          data: front.map((r) => [r.result.result.kpis[key], kept(r)]),
          lineStyle: { color: ink, width: 1 }, symbol: "circle", symbolSize: 18, showSymbol: true,
          itemStyle: { color: "transparent", borderColor: ink, borderWidth: 1 }, emphasis: { disabled: true },
          markLine: { silent: true, symbol: "none", lineStyle: { color: muted, type: [4, 4], width: 1 },
            label: { formatter: `target ${Math.round(target)}%`, position: "insideStartTop", color: muted, fontSize: 10.5, fontFamily: mono },
            data: [{ yAxis: target }] },
        },
        ...contracts.map((ct, i) => ({
          name: ct.label, type: "scatter", z: 2, symbol: SHAPES[i] ?? "circle", symbolSize: SHAPES[i] === "triangle" ? 12 : 10,
          itemStyle: { color: contractColor(i, theme), borderColor: surface, borderWidth: 1 },
          emphasis: { scale: 1.4 },
          data: runs.filter((r) => r.contract === ct.id && Number.isFinite(kept(r)))
            .map((r) => ({ id: r.id, value: [r.result.result.kpis[key], kept(r)], name: sizeShort(r) })),
          label: { show: true, position: "right", distance: 10, formatter: (p: { name: string }) => p.name, color: v("--ink-2"), fontSize: 10.5, fontFamily: mono },
        })),
      ],
    });
    // Label a point with its battery size only where the label clears every marker and every label already
    // placed (front points first, then by cost): crowded clusters keep their tooltips and table rows instead.
    const placeLabels = () => {
      const pts = runs.filter((r) => Number.isFinite(kept(r)))
        .map((r) => ({ r, p: c.convertToPixel({ gridIndex: 0 }, [r.result.result.kpis[key], kept(r)]) as number[] }));
      const order = [...pts].sort((a, b) => Number(frontSet.has(b.r.id)) - Number(frontSet.has(a.r.id))
        || a.r.result.result.kpis[key] - b.r.result.result.kpis[key]);
      const boxes: number[][] = [];
      const show = new Set<string>();
      const hit = (b: number[], o: number[]) => b[0] < o[2] && o[0] < b[2] && b[1] < o[3] && o[1] < b[3];
      const right = c.getWidth() - 4;
      for (const { r, p } of order) {
        const w = sizeShort(r).length * 6.4;
        const b = [p[0] + 9, p[1] - 7, p[0] + 11 + w, p[1] + 7];
        if (b[2] > right) continue;
        const marks = pts.filter((q) => q.r !== r).map((q) => [q.p[0] - 6, q.p[1] - 6, q.p[0] + 6, q.p[1] + 6]);
        if (marks.some((m) => hit(b, m)) || boxes.some((o) => hit(b, o))) continue;
        boxes.push(b);
        show.add(r.id);
      }
      c.setOption({ series: [{}, ...contracts.map((ct) => ({
        data: runs.filter((r) => r.contract === ct.id && Number.isFinite(kept(r)))
          .map((r) => ({ id: r.id, value: [r.result.result.kpis[key], kept(r)], name: sizeShort(r), label: { show: show.has(r.id) } })),
      }))] });
    };
    placeLabels();
    const ro = new ResizeObserver(() => { c.resize(); placeLabels(); });
    ro.observe(box.current);
    return () => { ro.disconnect(); c.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return (
    <figure className="pl-chart" aria-label="Cost against days the limit was kept, one point per run">
      <div ref={box} style={{ height: 320, width: "100%" }} />
    </figure>
  );
}
