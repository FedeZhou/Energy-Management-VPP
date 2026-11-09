import type { NodeProps } from "@xyflow/react";
import type { Asset } from "../../api";
import { useLive, useStore } from "../../store";
import { ASSET_COLOR, kw, money, pct, timeAt } from "../../util";
import { Handles, reading, spec } from "../Nodes";
import { Apartments, Battery, Charger, Cooling, DataCenter, HeatPumpArt, House, Office, Pylon, Solar, Transformer } from "./Art";
import { Tile, VIEW_H, VIEW_W } from "./iso";

/** Live playhead is at night (windows lit). Simulation times are local, kept in UTC. */
function useNight(): boolean {
  const live = useLive();
  if (!live) return false;
  const h = timeAt(live.r.time.start, live.r.time.step_minutes, live.i).getUTCHours();
  return h < 7 || h >= 19;
}

function Art({ children, selected, tint }: { children: React.ReactNode; selected?: boolean; tint?: string }) {
  return (
    <svg className="scene-art" width={VIEW_W} height={VIEW_H} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden>
      <Tile selected={selected} tint={tint} />
      {children}
    </svg>
  );
}

function Label({ name, value, tone, selected, children }: {
  name: string; value: string; tone: string; selected?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`scene-label ${selected ? "selected" : ""}`}>
      <span className="sl-name"><i style={{ background: tone }} />{name}</span>
      <span className="sl-value">{value}</span>
      {children}
    </div>
  );
}

function buildingArt(a: Asset, label: string, lit: boolean) {
  const text = `${a.name} ${label} ${a.load_profile}`.toLowerCase();
  if (/server|data ?cent|it hall/.test(text)) return <DataCenter lit={lit} />;
  if (/cooling|chiller|hvac/.test(text)) return <Cooling />;
  if (text.includes("office") || text.includes("commercial")) return <Office lit={lit} />;
  if (Number(a.scale) >= 3 || text.includes("apartment") || text.includes("flats")) return <Apartments lit={lit} />;
  return <House lit={lit} />;
}

export function SceneAsset({ id, selected }: NodeProps) {
  const a = useStore((s) => s.site.assets.find((x) => x.id === id));
  const profiles = useStore((s) => s.profiles);
  const live = useLive();
  const night = useNight();
  if (!a) return null;
  const tone = ASSET_COLOR[a.type];
  const label = (pid: string) => profiles?.load.find((p) => p.id === pid)?.label.split(" (")[0] ?? pid;
  const now = reading(a, live);
  const series = live?.r.result.assets[a.id];
  const p = series ? series.power_kw[live!.i] : 0;

  let art: React.ReactNode;
  switch (a.type) {
    case "building":
      art = buildingArt(a, label(String(a.load_profile)), night);
      break;
    case "data_center":
      art = <DataCenter lit={night} />;
      break;
    case "pv": {
      const kwp = Number(a.capacity_kwp) || 1;
      art = <Solar panels={kwp <= 10 ? 2 : 3} rows={kwp > 60 ? 2 : 1} shine={series ? Math.min(1, Math.abs(p) / kwp) : 0} />;
      break;
    }
    case "battery": {
      const cap = Number(a.capacity_kwh) || 0;
      const soc = now?.soc ?? Number(a.soc_initial ?? 0.5);
      art = <Battery cabinets={cap <= 20 ? 1 : cap <= 100 ? 2 : 3} soc={soc} active={Math.abs(p) > 0.05} />;
      break;
    }
    case "heat_pump":
      art = <HeatPumpArt running={series ? p > 0.05 : false} tank={series?.buffer ? series.buffer[live!.i] : Number(a.buffer_initial ?? 0.5)} />;
      break;
    case "ev_charger": {
      const car = series ? series.connected[live!.i] > 0.5 : true;
      art = <Charger car={car} charging={series ? p > 0.05 : false} />;
      break;
    }
  }
  const value = !now ? spec(a, label)
    : now.value === "—" ? now.caption
      : [now.value, now.caption, now.soc != null ? pct(now.soc) : ""].filter(Boolean).join(" · ");
  return (
    <div className="scene-node">
      <Handles />
      <Art selected={selected}>{art}</Art>
      <Label name={a.name || a.id} value={value} tone={tone} selected={selected} />
    </div>
  );
}

export function SceneMeter({ selected }: NodeProps) {
  const grid = useStore((s) => s.site.grid);
  const live = useLive();
  const g = live ? live.r.result.site.grid_kw[live.i] : null;
  const limits = [grid.import_limit_kw != null ? `${grid.import_limit_kw} kW` : "", grid.fuse_a != null ? `3 × ${grid.fuse_a} A` : ""].filter(Boolean);
  const over = g != null && grid.import_limit_kw != null && g > grid.import_limit_kw + 0.01;
  const phases = live && grid.fuse_a != null
    ? (["phase_l1_a", "phase_l2_a", "phase_l3_a"] as const).map((k) => live.r.result.site[k][live.i])
    : null;
  const value = g == null
    ? (limits.length ? `Limit ${limits.join(" · ")}` : "No limit")
    : `${kw(Math.abs(g))} · ${Math.abs(g) < 0.05 ? "Balanced" : g > 0 ? "Import" : "Export"}`;
  return (
    <div className="scene-node">
      <Handles />
      <Art selected={selected} tint="var(--c-grid)"><Transformer /></Art>
      <Label name="Grid connection" value={value} tone={over ? "var(--bad)" : ASSET_COLOR.grid} selected={selected}>
        {phases && (
          <div className="sl-phases" title={phases.map((a, k) => `L${k + 1}: ${a.toFixed(1)} A of ${grid.fuse_a} A`).join("\n")}>
            {phases.map((amps, k) => (
              <div key={k} className="track"><div className={amps > grid.fuse_a! * 0.95 ? "hot" : ""}
                style={{ width: `${Math.min(100, (Math.max(amps, 0) / grid.fuse_a!) * 100)}%` }} /></div>
            ))}
          </div>
        )}
      </Label>
    </div>
  );
}

export function SceneUtility() {
  const live = useLive();
  const tariff = useStore((s) => s.site.tariff);
  const profiles = useStore((s) => s.profiles);
  const price = live ? live.r.result.site.price[live.i] : null;
  const info = profiles?.price.find((p) => p.id === tariff.price_profile);
  return (
    <div className="scene-node utility">
      <Handles />
      <Art><Pylon /></Art>
      <Label name="Utility grid" tone={ASSET_COLOR.grid}
        value={price != null ? `${money(price, info?.currency, 3)} / kWh` : info?.label.split(" (")[0] ?? tariff.price_profile} />
    </div>
  );
}

export const sceneNodeTypes = { asset: SceneAsset, meter: SceneMeter, utility: SceneUtility };
