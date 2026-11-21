import { create } from "zustand";

/** Light or dark appearance. "system" follows the operating system until the user picks one.
 *  The resolved theme is written to <html data-theme="light|dark">, which styles.css keys on.
 *  index.html applies the saved choice before the first paint, so the page never flashes. */
export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const KEY = "sitelab.theme";
const query = () => matchMedia("(prefers-color-scheme: dark)");

function saved(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}

const resolve = (c: ThemeChoice): Theme => (c === "system" ? (query().matches ? "dark" : "light") : c);

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
}

interface ThemeState {
  choice: ThemeChoice;
  theme: Theme;
  /** Pick a theme. `remember: false` applies it for this visit only (demo links). */
  setTheme: (c: ThemeChoice, remember?: boolean) => void;
  toggle: () => void;
}

/** "dark" or "light" in the URL hash (#run-dark) picks the theme for this visit, not remembered. */
function fromHash(): Theme | null {
  const m = /(^|[#-])(dark|light)($|-)/.exec(location.hash);
  return m ? (m[2] as Theme) : null;
}

export const useTheme = create<ThemeState>((set, get) => {
  const choice: ThemeChoice = fromHash() ?? saved();
  const theme = resolve(choice);
  apply(theme);
  // While following the system, track its changes live.
  query().addEventListener("change", () => {
    if (get().choice !== "system") return;
    const t = resolve("system");
    apply(t);
    set({ theme: t });
  });
  return {
    choice,
    theme,
    setTheme(c, remember = true) {
      if (remember) {
        try {
          if (c === "system") localStorage.removeItem(KEY);
          else localStorage.setItem(KEY, c);
        } catch { /* storage unavailable: fine */ }
      }
      const t = resolve(c);
      apply(t);
      set({ choice: c, theme: t });
    },
    toggle() {
      get().setTheme(get().theme === "dark" ? "light" : "dark");
    },
  };
});
