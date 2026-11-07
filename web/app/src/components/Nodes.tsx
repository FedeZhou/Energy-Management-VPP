import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BatteryCharging, Building2, PlugZap, Sun, UtilityPole, Gauge } from "lucide-react";
import type { Asset, AssetType } from "../api";
import { METER_ID, useLive, useStore } from "../store";
import { ASSET_COLOR, kw, pct } from "../util";

const ICONS: Record<AssetType, typeof Sun> = {
  building: Building2,
  pv: Sun,
  battery: BatteryCharging,
  ev_charger: PlugZap,
};

function Handles() {
  // Edges are drawn centre to centre (see FlowEdge); handles only satisfy React Flow.
  return (
    <>
      <Handle type="source" position={Position.Top} className="hidden-handle" isConnectable={false} />
      <Handle type="target" position={Position.Top} className="hidden-handle" isConnectable={false} />
    </>
  );
}

function spec(a: Asset, profileLabel: (id: string) => string): string {
  switch (a.type) {
    case "building":
      return `${profileLabel(String(a.load_profile))}${Number(a.scale) !== 1 ? ` × ${a.scale}` : ""}`;
    case "pv":
      return `${a.capacity_kwp} kWp`;
    case "battery":
      return `${a.capacity_kwh} kWh · ${a.power_kw} kW`;
    case "ev_charger":
      return `${a.max_power_kw} kW · ${String(a.sessions).split("/").pop()?.replace("charger_", "sessions ")}`;
  }
}

function LiveLine({ a }: { a: Asset }) {
  const live = useLive();
  if (!live) return null;
  const s = live.r.result.assets[a.id];
  if (!s) return null;
  const p = s.power_kw[live.i];
  if (a.type === "battery") {
    const soc = s.soc[live.i];
    const state = p > 0.05 ? `charging ${kw(p)}` : p < -0.05 ? `discharging ${kw(-p)}` : "idle";
    return (
      <div className="live">
        <div className="soc"><div style={{ width: pct(soc), background: ASSET_COLOR.battery }} /></div>
        <span>{pct(soc)} · {state}</span>
      </div>
    );
  }
  if (a.type === "ev_charger") {
    const on = s.connected[live.i] > 0.5;
    return (
      <div className="live">
        {on ? <span>Car plugged · {kw(p)} · {s.remaining_kwh[live.i].toFixed(1)} kWh to go</span> : <span className="muted">No car</span>}
      </div>
    );
  }
  return <div className="live"><span>{kw(Math.abs(p))}</span></div>;
}

export function AssetNode({ id, selected }: NodeProps) {
  const a = useStore((s) => s.site.assets.find((x) => x.id === id));
  const profiles = useStore((s) => s.profiles);
  if (!a) return null;
  const Icon = ICONS[a.type];
  const label = (pid: string) => profiles?.load.find((p) => p.id === pid)?.label.split(" (")[0] ?? pid;
  return (
    <div className={`node asset ${selected ? "selected" : ""}`}>
      <Handles />
      <div className="node-head">
        <span className="chip" style={{ color: ASSET_COLOR[a.type] }}><Icon size={18} strokeWidth={2} /></span>
        <div className="node-titles">
          <strong>{a.name || a.id}</strong>
          <span className="spec">{spec(a, label)}</span>
        </div>
      </div>
      <LiveLine a={a} />
    </div>
  );
}

export function MeterNode({ selected }: NodeProps) {
  const grid = useStore((s) => s.site.grid);
  const live = useLive();
  const g = live ? live.r.result.site.grid_kw[live.i] : null;
  const limit = grid.import_limit_kw != null ? `limit ${grid.import_limit_kw} kW` : "no import limit";
  return (
    <div className={`node meter ${selected ? "selected" : ""}`}>
      <Handles />
      <div className="node-head">
        <span className="chip" style={{ color: ASSET_COLOR.grid }}><Gauge size={18} /></span>
        <div className="node-titles">
          <strong>Grid connection</strong>
          <span className="spec">{limit}</span>
        </div>
      </div>
      {g != null && (
        <div className="live">
          <span className={grid.import_limit_kw != null && g > grid.import_limit_kw + 0.01 ? "bad" : ""}>
            {g >= 0 ? `Importing ${kw(g)}` : `Exporting ${kw(-g)}`}
          </span>
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
  const label = profiles?.price.find((p) => p.id === tariff.price_profile)?.label ?? tariff.price_profile;
  return (
    <div className="node utility">
      <Handles />
      <div className="node-head">
        <span className="chip" style={{ color: ASSET_COLOR.grid }}><UtilityPole size={18} /></span>
        <div className="node-titles">
          <strong>Utility grid</strong>
          <span className="spec">{price != null ? `${price.toFixed(3)} per kWh now` : label}</span>
        </div>
      </div>
    </div>
  );
}

export const nodeTypes = { asset: AssetNode, meter: MeterNode, utility: UtilityNode };
export { METER_ID };
