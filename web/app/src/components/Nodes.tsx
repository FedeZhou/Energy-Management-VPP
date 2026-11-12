import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Gauge, UtilityPole } from "lucide-react";
import type { Asset } from "../api";
import { ASSET_ICON } from "../icons";
import { METER_ID, useLive, useStore } from "../store";
import { ASSET_COLOR, kw, pct, perKwh, qty } from "../util";

const tone = (c: string) => ({ "--tone": c }) as React.CSSProperties;

export function Handles() {
  // Edges are routed by FlowEdge from node geometry; handles only satisfy React Flow.
  return (
    <>
      <Handle type="source" position={Position.Top} className="hidden-handle" isConnectable={false} />
      <Handle type="target" position={Position.Top} className="hidden-handle" isConnectable={false} />
    </>
  );
}

/** A rating as entered: whole numbers without decimals ("11 kW", "7.4 kW"). */
const rating = (v: unknown, unit: string) => qty(Number(v), unit, Number.isInteger(Number(v)) ? 0 : "auto");

export function spec(a: Asset, profileLabel: (id: string) => string): string {
  switch (a.type) {
    case "building":
      return `${profileLabel(String(a.load_profile))}${Number(a.scale) !== 1 ? ` × ${a.scale}` : ""}`;
    case "data_center":
      return `IT ${profileLabel(String(a.it_load_profile)).replace(/^Data center IT load, /, "")}${Number(a.it_scale) !== 1 ? ` × ${a.it_scale}` : ""} · PUE ${a.pue}`;
    case "pv":
      return rating(a.capacity_kwp, "kWp");
    case "battery":
      return `${rating(a.capacity_kwh, "kWh")} · ${rating(a.power_kw, "kW")}`;
    case "ev_charger":
      return `${rating(a.max_power_kw, "kW")} · ${a.phases === 1 ? `1-phase ${a.phase}` : "3-phase"}${a.bidirectional ? " · V2H" : ""}`;
    case "heat_pump":
      return `${qty(Number(a.annual_heat_kwh), "kWh", 0)} heat/yr · ${String(a.cop_profile).includes("gshp") ? "ground" : "air"} source`;
  }
}

/** Live reading at the playhead: [value, caption], plus the battery charge level. */
export function reading(a: Asset, live: ReturnType<typeof useLive>): { value: string; caption: string; soc?: number } | null {
  if (!live) return null;
  const s = live.r.result.assets[a.id];
  if (!s) return null;
  const p = s.power_kw[live.i];
  switch (a.type) {
    case "battery":
      return {
        value: kw(Math.abs(p)),
        caption: p > 0.05 ? "Charging" : p < -0.05 ? "Discharging" : "Idle",
        soc: s.soc[live.i],
      };
    case "ev_charger":
      return s.connected[live.i] > 0.5
        ? { value: kw(p), caption: `${qty(s.remaining_kwh[live.i], "kWh", 1)} left` }
        : { value: "—", caption: "No car" };
    case "pv":
      return { value: kw(Math.abs(p)), caption: "Generating" };
    case "heat_pump":
      return { value: kw(p), caption: `Tank ${pct(s.buffer?.[live.i] ?? 0)}` };
    default:
      return { value: kw(Math.abs(p)), caption: "Demand" };
  }
}

export function AssetNode({ id, selected }: NodeProps) {
  const a = useStore((s) => s.site.assets.find((x) => x.id === id));
  const profiles = useStore((s) => s.profiles);
  const now = useLive();
  if (!a) return null;
  const live = reading(a, now);
  const Icon = ASSET_ICON[a.type];
  const label = (pid: string) => profiles?.load.find((p) => p.id === pid)?.label.split(" (")[0] ?? pid;
  return (
    <div className={`node ${selected ? "selected" : ""}`} style={tone(ASSET_COLOR[a.type])}>
      <Handles />
      <div className="node-row">
        <span className="tile lg"><Icon size={17} /></span>
        <div className="node-text">
          <span className="node-name">{a.name || a.id}</span>
          <span className="node-spec">{spec(a, label)}</span>
        </div>
        {live && (
          <div className="node-value">
            <b>{live.value}</b>
            <span>{live.caption}</span>
          </div>
        )}
      </div>
      {live?.soc != null && (
        <div className="node-foot">
          <div className="bar-row">
            <div className="track"><div style={{ width: pct(live.soc) }} /></div>
            <span>{pct(live.soc)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MeterNode({ selected }: NodeProps) {
  const grid = useStore((s) => s.site.grid);
  const live = useLive();
  const g = live ? live.r.result.site.grid_kw[live.i] : null;
  const limits = [grid.import_limit_kw != null ? rating(grid.import_limit_kw, "kW") : "", grid.fuse_a != null ? `3 × ${qty(grid.fuse_a, "A", 0)}` : ""].filter(Boolean);
  const over = g != null && grid.import_limit_kw != null && g > grid.import_limit_kw + 0.01;
  const phases = live && grid.fuse_a != null
    ? (["phase_l1_a", "phase_l2_a", "phase_l3_a"] as const).map((k) => live.r.result.site[k][live.i])
    : null;
  const load = g != null && grid.import_limit_kw ? Math.min(1, Math.max(g, 0) / grid.import_limit_kw) : null;
  return (
    <div className={`node hub ${selected ? "selected" : ""}`} style={tone(ASSET_COLOR.grid)}>
      <Handles />
      <div className="node-row">
        <span className="tile lg"><Gauge size={17} /></span>
        <div className="node-text">
          <span className="node-name">Grid connection</span>
          <span className="node-spec">{limits.length ? `Limit ${limits.join(" · ")}` : "No limit"}</span>
        </div>
        {g != null && (
          <div className={`node-value ${over ? "over" : ""}`}>
            <b>{kw(Math.abs(g))}</b>
            <span>{Math.abs(g) < 0.05 ? "Balanced" : g > 0 ? "Import" : "Export"}</span>
          </div>
        )}
      </div>
      {(load != null || phases) && (
        <div className="node-foot">
          {load != null && !phases && (
            <div className="bar-row" title={`Import vs ${grid.import_limit_kw} kW limit`}>
              <div className="track"><div className={over ? "hot" : ""} style={{ width: `${load * 100}%` }} /></div>
              <span>{pct(load)} of limit</span>
            </div>
          )}
          {phases?.map((amps, k) => (
            <div key={k} className="bar-row labelled" title={`L${k + 1}: ${qty(amps, "A", 1)} of ${qty(grid.fuse_a!, "A", 0)}`}>
              <span>L{k + 1}</span>
              <div className="track"><div className={amps > grid.fuse_a! * 0.95 ? "hot" : ""}
                style={{ width: `${Math.min(100, (Math.max(amps, 0) / grid.fuse_a!) * 100)}%` }} /></div>
              <span>{qty(Math.max(amps, 0), "A", 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UtilityNode() {
  const live = useLive();
  const tariff = useStore((s) => s.site.tariff);
  const profiles = useStore((s) => s.profiles);
  const price = live ? live.r.result.site.price[live.i] : null;
  const info = profiles?.price.find((p) => p.id === tariff.price_profile);
  return (
    <div className="node utility" style={tone(ASSET_COLOR.grid)}>
      <Handles />
      <div className="node-row">
        <span className="tile lg"><UtilityPole size={17} /></span>
        <div className="node-text">
          <span className="node-name">Utility grid</span>
          <span className="node-spec" title={info?.label}>
            {price != null ? perKwh(price, info?.currency) : info?.label.split(" (")[0] ?? tariff.price_profile}
          </span>
        </div>
      </div>
    </div>
  );
}

export const nodeTypes = { asset: AssetNode, meter: MeterNode, utility: UtilityNode };
export { METER_ID };
