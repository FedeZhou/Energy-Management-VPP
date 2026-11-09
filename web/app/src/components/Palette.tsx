import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import type { AssetType } from "../api";
import { ASSET_ICON } from "../icons";
import { useLayout } from "../layout";
import { useStore } from "../store";
import { ASSET_COLOR } from "../util";
import { DRAG_MIME } from "./Canvas";
import { Help } from "./Help";

const ITEMS: AssetType[] = ["building", "data_center", "heat_pump", "pv", "battery", "ev_charger"];

export function Palette() {
  const catalog = useStore((s) => s.catalog);
  const meterPos = useStore((s) => s.meterPos);
  const addAsset = useStore((s) => s.addAsset);
  const count = useStore((s) => s.site.assets.length);
  const closed = useLayout((s) => s.paletteClosed);
  const setClosed = useLayout((s) => s.setPalette);
  return (
    <aside className={`palette ${closed ? "rail" : ""}`} aria-label="Components" data-tour="palette">
      {closed ? (
        <button className="icon-btn rail-toggle" onClick={() => setClosed(false)} title="Show components" aria-label="Show components panel">
          <PanelLeftOpen size={15} />
        </button>
      ) : (
        <div className="panel-head">
          <h2 className="panel-title">Components <Help topic="components" /></h2>
          <button className="icon-btn" onClick={() => setClosed(true)} title="Hide panel" aria-label="Hide components panel">
            <PanelLeftClose size={15} />
          </button>
        </div>
      )}
      {ITEMS.map((type) => {
        const Icon = ASSET_ICON[type];
        const spec = catalog?.assets[type];
        return (
          <button
            key={type}
            className="palette-item"
            draggable
            title={`${closed ? `${spec?.label ?? type}\n` : ""}${spec?.description ?? ""}\nDrag onto the site, or click to add.`.trim()}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_MIME, type);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => addAsset(type, { x: meterPos.x + 300, y: meterPos.y - 120 + (count % 5) * 90 })}
            disabled={!catalog}
          >
            <span className="tile" style={{ "--tone": ASSET_COLOR[type] } as React.CSSProperties}><Icon size={15} /></span>
            {!closed && <span>{spec?.label ?? type}</span>}
            {!closed && <Plus size={14} className="plus" />}
          </button>
        );
      })}
    </aside>
  );
}
