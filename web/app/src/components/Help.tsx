import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { X } from "lucide-react";
import { HELP, type HelpTopic } from "../help";

const WIDTH = 360;
const GAP = 8;

function topicFromHash(): HelpTopic | null {
  const m = /^#help-([A-Za-z0-9_]+)$/.exec(location.hash);
  return m && m[1] in HELP ? (m[1] as HelpTopic) : null;
}

/** One explanation open at a time. `anchor` is the "?" button it belongs to; null centres it
 *  (a #help-<topic> link whose button is not on screen, e.g. a results panel before a run). */
interface HelpState {
  topic: HelpTopic | null;
  anchor: HTMLElement | null;
  open: (topic: HelpTopic, anchor: HTMLElement | null) => void;
  close: () => void;
}
export const useHelp = create<HelpState>((set) => ({
  topic: topicFromHash(), // #help-<topic> opens that explanation on load, whatever is on screen
  anchor: null,
  open(topic, anchor) { set({ topic, anchor }); },
  close() { set({ topic: null, anchor: null }); },
}));

/** A small "?" button that opens a longer explanation of a component or concept. */
export function Help({ topic }: { topic: HelpTopic }) {
  const btn = useRef<HTMLButtonElement>(null);
  const on = useHelp((s) => s.topic === topic && (s.anchor === null || s.anchor === btn.current));
  const entry = HELP[topic];

  // A popover opened from a link has no anchor yet: attach it to this button once it exists.
  useEffect(() => {
    const s = useHelp.getState();
    if (s.topic === topic && s.anchor === null && btn.current?.offsetParent) s.open(topic, btn.current);
  }, [topic]);

  return (
    <button ref={btn} type="button" className={`help-btn ${on ? "on" : ""}`} aria-label={`Help: ${entry.title}`}
      aria-expanded={on} aria-controls={on ? "help-pop" : undefined} title={entry.title}
      onClick={(e) => {
        e.stopPropagation();
        const s = useHelp.getState();
        if (s.topic === topic && s.anchor === btn.current) s.close();
        else s.open(topic, btn.current);
      }}>
      ?
    </button>
  );
}

/** The explanation popover, mounted once by the app so any topic can open from a link. */
export function HelpPopover() {
  const topic = useHelp((s) => s.topic);
  const anchor = useHelp((s) => s.anchor);
  const close = useHelp((s) => s.close);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!topic) return;
    const place = () => {
      const h = pop.current?.offsetHeight ?? 240;
      const w = Math.min(WIDTH, window.innerWidth - 24);
      if (!anchor || !anchor.isConnected) {
        setPos({ left: (window.innerWidth - w) / 2, top: Math.max(12, Math.min(96, (window.innerHeight - h) / 2)) });
        return;
      }
      const b = anchor.getBoundingClientRect();
      const left = Math.max(12, Math.min(window.innerWidth - w - 12, b.left + b.width / 2 - 28));
      const below = b.bottom + GAP;
      const top = below + h > window.innerHeight - 12 ? Math.max(12, b.top - GAP - h) : below;
      setPos({ left, top });
    };
    place();
    const raf = requestAnimationFrame(place); // again once the popover has its real height
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); };
  }, [topic, anchor]);

  useEffect(() => {
    if (!topic) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || (t instanceof Element && t.closest(".help-btn"))) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const a = useHelp.getState().anchor;
      close();
      a?.focus();
    };
    const onScroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [topic, close]);

  if (!topic) return null;
  const entry = HELP[topic];
  return createPortal(
    <div ref={pop} id="help-pop" className="help-pop" role="dialog" aria-label={entry.title}
      style={{ width: Math.min(WIDTH, window.innerWidth - 24), left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      <div className="help-pop-head">
        <h4>{entry.title}</h4>
        <button className="icon-btn sm" onClick={close} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="help-pop-body">{entry.body}</div>
    </div>,
    document.body,
  );
}
