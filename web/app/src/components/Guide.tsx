import { useEffect, useRef, useState, type ReactNode } from "react";
import { create } from "zustand";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useLayout } from "../layout";
import { useStore } from "../store";

/** Guided tour: a spotlight on one part of the interface at a time, with a short explanation.
 *  Targets are CSS selectors; a step whose target is missing is shown centred. */
interface Step {
  target?: string;
  side?: "right" | "left" | "bottom" | "top";
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Welcome to Site Lab",
    body: (
      <>
        <p>Site Lab simulates how energy flows through a site (a home, a building or a car park) one time step at a time. Use it to compare control strategies for batteries and EV charging.</p>
        <p>This tour shows the main parts in about a minute. Look for the <span className="help-btn static">?</span> buttons for more detail on any concept.</p>
      </>
    ),
  },
  {
    target: '[data-tour="mode"]', side: "bottom", title: "Plan or Operate",
    body: <p><b>Plan</b> covers months to a year in hourly steps, for cost and sizing. <b>Operate</b> covers a few days in minute steps, for EV charging, phases and fuses.</p>,
  },
  {
    target: '[data-tour="examples"]', side: "bottom", title: "Examples and files",
    body: <p>Start from a ready-made example site, or open and save your own site as a JSON file.</p>,
  },
  {
    target: '[data-tour="palette"]', side: "right", title: "Components",
    body: <p>The building blocks of a site: building demand, data centers, solar panels, a battery and EV chargers. Drag one onto the site, or click it to add it.</p>,
  },
  {
    target: '[data-tour="canvas"]', side: "bottom", title: "Site view",
    body: <p>A picture of the site: every component wires into the grid connection. After a run, labels show live power and moving dots show the direction of energy flow. Switch between an illustrated <b>Scene</b> and a compact <b>Diagram</b> at the top right.</p>,
  },
  {
    target: '.react-flow__node[data-id="__meter"]', side: "bottom", title: "Grid connection",
    body: <p>The site's meter: power bought from or sold to the grid. When an import limit or fuse is set, it shows how close the site is to it, per phase.</p>,
  },
  {
    target: '[data-tour="inspector"]', side: "left", title: "Settings",
    body: <p>With nothing selected, this panel holds the site settings: period, control strategy, grid limits and tariff. Click any card in the site view to edit that component instead. Hover <b>ⓘ</b> for a short hint and its data source.</p>,
  },
  {
    target: '[data-tour="run"]', side: "bottom", title: "Run",
    body: <p>Simulates the site, together with a baseline without smart control. Press it again after any change, or use <b>Ctrl+Enter</b>.</p>,
  },
  {
    target: '[data-tour="kpis"]', side: "top", title: "Headline numbers",
    body: <p>Cost, peaks, self-sufficiency, battery cycles and EV energy for the whole period. The arrows compare against the baseline: green is better, red is worse.</p>,
  },
  {
    target: '[data-tour="transport"]', side: "top", title: "Playback",
    body: <p>Play or scrub through time. The site view and the charts follow the playhead, so you can see what every component was doing at that moment.</p>,
  },
  {
    target: '[data-tour="tabs"]', side: "top", title: "Charts and details",
    body: <p><b>Charts</b> show power, battery charge, phase currents and price over time. <b>EV sessions</b> shows each car visit. <b>Data sources</b> lists the data behind this run.</p>,
  },
  {
    target: '[data-tour="learn"]', side: "bottom", title: "Learn",
    body: <p>Background reading: how Site Lab and its control strategies work, how the devices behave, and short digests of the research behind them, with sources.</p>,
  },
  {
    target: '[data-tour="data"]', side: "bottom", title: "Where the data comes from",
    body: <p>Every profile comes from public, open data. This panel lists each source with its licence, its resolution and its caveats.</p>,
  },
  {
    target: '[data-tour="guide"]', side: "bottom", title: "That's it",
    body: <p>Reopen this tour any time from here. Try changing the battery strategy and press Run to see what it changes.</p>,
  },
];

interface GuideState { step: number | null; start: () => void; go: (i: number | null) => void }
export const useGuide = create<GuideState>((set) => ({
  step: null,
  start() {
    // Results are part of the tour: make sure there is a run to point at.
    const st = useStore.getState();
    st.setPage("lab"); // the tour walks through the simulator view
    st.setCollapsed(false);
    useLayout.getState().setPalette(false); // the tour points at both side panels
    useLayout.getState().setInspector(false);
    if (!st.result && !st.running && st.site.assets.length) void st.run();
    set({ step: 0 });
  },
  go(i) {
    set({ step: i });
  },
}));

const SEEN_KEY = "sitelab.guide.seen";
export function guideSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable: fine */ }
}

interface Rect { left: number; top: number; width: number; height: number }
const CARD_W = 340;
const PAD = 6;

function cardPosition(r: Rect | null, side: Step["side"], h: number): { left: number; top: number } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const clampX = (x: number) => Math.max(12, Math.min(vw - CARD_W - 12, x));
  const clampY = (y: number) => Math.max(12, Math.min(vh - h - 12, y));
  if (!r) return { left: (vw - CARD_W) / 2, top: Math.max(12, (vh - h) / 2) };
  const gap = 14;
  switch (side) {
    case "right": return { left: clampX(r.left + r.width + gap), top: clampY(r.top) };
    case "left": return { left: clampX(r.left - CARD_W - gap), top: clampY(r.top) };
    case "top": return r.top - h - gap > 12
      ? { left: clampX(r.left), top: r.top - h - gap }
      : { left: clampX(r.left), top: clampY(r.top + r.height + gap) };
    default: return r.top + r.height + gap + h < vh - 12
      ? { left: clampX(r.left + r.width / 2 - CARD_W / 2), top: r.top + r.height + gap }
      : { left: clampX(r.left + r.width / 2 - CARD_W / 2), top: clampY(r.top - h - gap) };
  }
}

export function Guide() {
  const step = useGuide((s) => s.step);
  const go = useGuide((s) => s.go);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(200);
  const card = useRef<HTMLDivElement>(null);
  const s = step != null ? STEPS[step] : null;

  // Follow the target: layouts move (results appear after a run, panels resize, the
  // diagram re-zooms). Measured every frame, plus a timer for when frames are throttled.
  useEffect(() => {
    if (!s) return;
    let raf = 0;
    let last = "";
    const measure = () => {
      const el = s.target ? document.querySelector(s.target) : null;
      const b = el?.getBoundingClientRect();
      const r = b && b.width > 0 ? { left: b.left - PAD, top: b.top - PAD, width: b.width + 2 * PAD, height: b.height + 2 * PAD } : null;
      const key = JSON.stringify(r) + (card.current?.offsetHeight ?? 0);
      if (key !== last) {
        last = key;
        setRect(r);
        if (card.current) setCardH(card.current.offsetHeight);
      }
    };
    const tick = () => { measure(); raf = requestAnimationFrame(tick); };
    tick();
    const timer = setInterval(measure, 150);
    return () => { cancelAnimationFrame(raf); clearInterval(timer); };
  }, [s]);

  useEffect(() => {
    if (step == null) return;
    card.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft" && step > 0) go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (step == null || !s) return null;
  const last = step === STEPS.length - 1;
  function close() { markSeen(); go(null); }
  function next() { if (step == null) return; if (step >= STEPS.length - 1) close(); else go(step + 1); }
  const pos = cardPosition(rect, s.side, cardH);

  return (
    <div className="guide" role="presentation">
      <div className="guide-block" onClick={close} />
      {rect
        ? <div className="guide-spot" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
        : <div className="guide-dim" />}
      <div ref={card} className="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-title" tabIndex={-1}
        style={{ width: CARD_W, left: pos.left, top: pos.top }}>
        <div className="guide-head">
          <span className="guide-count">{step + 1} of {STEPS.length}</span>
          <button className="icon-btn" onClick={close} aria-label="Close the guide"><X size={14} /></button>
        </div>
        <h3 id="guide-title">{s.title}</h3>
        <div className="guide-body">{s.body}</div>
        <div className="guide-foot">
          <div className="guide-dots" aria-hidden>
            {STEPS.map((_, i) => <i key={i} className={i === step ? "on" : ""} />)}
          </div>
          {step > 0 && <button className="btn" onClick={() => go(step - 1)}><ArrowLeft size={14} /> Back</button>}
          <button className="btn primary" onClick={next}>{last ? "Done" : step === 0 ? "Start" : "Next"}{!last && <ArrowRight size={14} />}</button>
        </div>
      </div>
    </div>
  );
}
