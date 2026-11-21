import { create } from "zustand";
import { api, type SimResponse, type Site } from "./api";
import { useStore } from "./store";

/** Scenarios: finished runs kept side by side, like HOMER's or REopt's scenario comparison.
 *  Pin the current run, change anything, run again and compare. "Benchmark strategies" fills the
 *  list in one go: every battery strategy (or EV strategy when the site has no battery) with perfect
 *  and with realistic forecasts. That is the project's question: which control holds up when the
 *  forecasts are only as good as a real system's. */
export interface Scenario {
  id: string;
  name: string;
  site: Site;
  result: SimResponse;
}

export const MAX_SCENARIOS = 8;

interface ScenarioState {
  list: Scenario[];
  /** Progress of a running benchmark (runs finished / total), or null. */
  progress: { done: number; total: number } | null;
  error: string | null;
  pin: () => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  clear: () => void;
  /** Make this scenario the site and result on screen (its own site replaces the current one). */
  open: (id: string) => void;
  benchmark: () => Promise<void>;
  cancel: () => void;
}

let ctrl: AbortController | null = null;
let seq = 0;
const newId = () => `sc${Date.now().toString(36)}${(seq++).toString(36)}`;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The controller choices a benchmark varies: battery strategies when there is a battery, else EV ones. */
export function benchmarkAxis(site: Site): { key: "battery" | "ev"; values: string[] } | null {
  const catalog = useStore.getState().catalog;
  if (!catalog) return null;
  const field = (name: string) => catalog.site.controller.find((f) => f.name === name);
  const has = (t: string) => site.assets.some((a) => a.type === t);
  if (has("battery")) {
    const values = (field("battery")?.enum ?? []).map(String).filter((v) => v !== "idle"); // idle = no battery use; the baseline covers it
    return values.length ? { key: "battery", values } : null;
  }
  if (has("ev_charger")) {
    const values = (field("ev")?.enum ?? []).map(String);
    return values.length ? { key: "ev", values } : null;
  }
  return null;
}

export const useScenarios = create<ScenarioState>((set, get) => ({
  list: [],
  progress: null,
  error: null,

  pin() {
    const { result, site, stale } = useStore.getState();
    if (!result || stale) return;
    if (get().list.some((s) => s.result === result)) return; // already pinned
    const list = [...get().list, { id: newId(), name: "", site: clone(site), result }];
    set({ list: list.slice(-MAX_SCENARIOS), error: null });
  },
  remove(id) { set({ list: get().list.filter((s) => s.id !== id) }); },
  rename(id, name) { set({ list: get().list.map((s) => (s.id === id ? { ...s, name } : s)) }); },
  clear() { set({ list: [], error: null }); },
  open(id) {
    const sc = get().list.find((s) => s.id === id);
    if (!sc) return;
    const st = useStore.getState();
    st.loadSite(clone(sc.site));
    useStore.setState({ result: sc.result, stale: false, compare: null, cursor: 0 });
  },

  async benchmark() {
    const site = useStore.getState().site;
    const axis = benchmarkAxis(site);
    if (!axis) return;
    ctrl?.abort();
    const mine = new AbortController();
    ctrl = mine;
    const variants = axis.values.flatMap((v) => (["perfect", "realistic"] as const).map((forecast) => ({ v, forecast })));
    set({ progress: { done: 0, total: variants.length }, error: null });
    try {
      // Two at a time: year-long MPC runs are heavy, and the server shares one machine.
      const out: (Scenario | null)[] = new Array(variants.length).fill(null);
      let next = 0;
      const worker = async () => {
        while (next < variants.length) {
          const k = next++;
          const { v, forecast } = variants[k];
          const s: Site = clone(site);
          s.controller = { ...s.controller, [axis.key]: v, forecast };
          const result = await api.simulate(s, mine.signal);
          out[k] = { id: newId(), name: "", site: s, result };
          if (ctrl === mine) set((st) => ({ progress: st.progress && { ...st.progress, done: st.progress.done + 1 } }));
        }
      };
      await Promise.all([worker(), worker()]);
      if (ctrl !== mine) return;
      set({ list: out.filter((x): x is Scenario => x !== null).slice(0, MAX_SCENARIOS * 2), progress: null });
    } catch (e) {
      if (ctrl !== mine) return;
      set({ progress: null, error: (e as Error).name === "AbortError" ? null : (e as Error).message });
    } finally {
      if (ctrl === mine) ctrl = null;
    }
  },
  cancel() {
    ctrl?.abort();
    ctrl = null;
    set({ progress: null });
  },
}));
