import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { HELP, type HelpTopic } from "../help";

const WIDTH = 340;
const GAP = 8;

/** A small "?" button that opens a longer explanation of a component or concept. */
export function Help({ topic }: { topic: HelpTopic }) {
  // #help-<topic> opens this explanation on load (linkable from docs and demos).
  const [open, setOpen] = useState(() => location.hash === `#help-${topic}`);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const entry = HELP[topic];
  const id = `help-${topic}`;

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const b = btn.current!.getBoundingClientRect();
      const h = pop.current?.offsetHeight ?? 240;
      const left = Math.max(12, Math.min(window.innerWidth - WIDTH - 12, b.left + b.width / 2 - 28));
      const below = b.bottom + GAP;
      const top = below + h > window.innerHeight - 12 ? Math.max(12, b.top - GAP - h) : below;
      setPos({ left, top });
    };
    place();
    const raf = requestAnimationFrame(place); // again once the popover has its real height
    window.addEventListener("resize", place);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    const onScroll = (e: Event) => { if (!pop.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className={`help-btn ${open ? "on" : ""}`} aria-label={`Help: ${entry.title}`}
        aria-expanded={open} aria-controls={open ? id : undefined} title={`What is this? ${entry.title}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        ?
      </button>
      {open && createPortal(
        <div ref={pop} id={id} className="help-pop" role="dialog" aria-label={entry.title}
          style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
          <div className="help-pop-head">
            <h4>{entry.title}</h4>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={14} /></button>
          </div>
          <div className="help-pop-body">{entry.body}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
