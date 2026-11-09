import { BatteryCharging, Building2, Heater, PlugZap, Server, Sun } from "lucide-react";
import type { AssetType } from "./api";

export const ASSET_ICON: Record<AssetType, typeof Sun> = {
  building: Building2,
  data_center: Server,
  heat_pump: Heater,
  pv: Sun,
  battery: BatteryCharging,
  ev_charger: PlugZap,
};
