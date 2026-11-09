import { create } from "zustand";

/** What the viewer has collapsed: the side panels and individual settings sections.
 *  Remembered per browser; it is a viewing preference, not part of the site. */
interface Layout {
  paletteClosed: boolean;
  inspectorClosed: boolean;
  closed: Record<string, boolean>; // settings section id -> collapsed
  setPalette: (closed: boolean) => void;
  setInspector: (closed: boolean) => void;
  toggleSection: (id: string) => void;
  setSections: (ids: string[], closed: boolean) => void;
}

const KEY = "sitelab.layout";
type Saved = Pick<Layout, "paletteClosed" | "inspectorClosed" | "closed">;

function load(): Saved {
  const empty: Saved = { paletteClosed: false, inspectorClosed: false, closed: {} };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<Saved>) } : empty;
  } catch {
    return empty;
  }
}

export const useLayout = create<Layout>((set, get) => {
  const save = () => {
    const { paletteClosed, inspectorClosed, closed } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ paletteClosed, inspectorClosed, closed })); } catch { /* storage unavailable: fine */ }
  };
  return {
    ...load(),
    setPalette(c) { set({ paletteClosed: c }); save(); },
    setInspector(c) { set({ inspectorClosed: c }); save(); },
    toggleSection(id) { set((s) => ({ closed: { ...s.closed, [id]: !s.closed[id] } })); save(); },
    setSections(ids, c) {
      set((s) => ({ closed: { ...s.closed, ...Object.fromEntries(ids.map((i) => [i, c])) } }));
      save();
    },
  };
});
