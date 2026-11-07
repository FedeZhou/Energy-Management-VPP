import { BatteryCharging, Building2, PlugZap, Sun } from "lucide-react";
import type { AssetType } from "../api";
import { useStore } from "../store";
import { ASSET_COLOR } from "../util";
import { DRAG_MIME } from "./Canvas";

const ITEMS: { type: AssetType; icon: typeof Sun; hint: string }[] = [
  { type: "building", icon: Building2, hint: "Fixed demand from a recorded profile" },
  { type: "pv", icon: Sun, hint: "Solar panels" },
  { type: "battery", icon: BatteryCharging, hint: "Stationary storage" },
  { type: "ev_charger", icon: PlugZap, hint: "Charger plus the cars that visit it" },
];

export function Palette() {
  const catalog = useStore((s) => s.catalog);
  const meterPos = useStore((s) => s.meterPos);
  const addAsset = useStore((s) => s.addAsset);
  const count = useStore((s) => s.site.assets.length);
  return (
    <aside className="palette">
      <h3>Elements</h3>
      <p className="muted small">Drag onto the canvas, or click to add.</p>
      {ITEMS.map(({ type, icon: Icon, hint }) => (
        <button
          key={type}
          className="palette-item"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_MIME, type);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => addAsset(type, { x: meterPos.x + 260, y: meterPos.y - 120 + (count % 5) * 90 })}
          disabled={!catalog}
        >
          <span className="chip" style={{ color: ASSET_COLOR[type] }}><Icon size={18} /></span>
          <span>
            <strong>{catalog?.assets[type].label ?? type}</strong>
            <span className="muted small block">{hint}</span>
          </span>
        </button>
      ))}
      <div className="palette-soon">
        <h3>Coming later</h3>
        <p className="muted small">Data center load, heat pump, wind, generator.</p>
      </div>
    </aside>
  );
}
