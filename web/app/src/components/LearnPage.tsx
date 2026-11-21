import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { PAGES, SECTIONS, type Block, type Page } from "../learn/pages";
import { GENERAL, type GeneralChapter, type Target } from "../learn/general";
import { LearnLink, LearnNav, Markdown } from "./Markdown";
import { READ_LABEL, SOURCES } from "../learn/sources";
import { useStore } from "../store";
import katex from "katex";
import "katex/dist/katex.min.css";
import "./learn.css";

const CITE = /\{([a-z0-9_]+)\}/g;
// Inline math is written \( ... \) inside any text; display math uses a "math" block.
const INLINE_MATH = /\\\((.+?)\\\)/g;

function citationOrder(page: Page): string[] {
  const order: string[] = [];
  const texts = page.blocks.flatMap((b): string[] => {
    if (b.kind === "p" || b.kind === "note" || b.kind === "h" || b.kind === "code") return [b.text];
    if (b.kind === "math") return b.caption ? [b.caption] : [];
    if (b.kind === "list" || b.kind === "steps") return b.items;
    return b.rows.flat();
  });
  for (const t of texts) for (const m of t.replace(INLINE_MATH, "").matchAll(CITE)) if (!order.includes(m[1])) order.push(m[1]);
  return order;
}

/** KaTeX rendering of trusted, repository-authored TeX. Errors show the source in red instead of throwing. */
function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "htmlAndMathml" }), [tex, display]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A display formula that always fits: scaled down to 60% if needed, then scrolled sideways with a
 *  visible hint (never clipped). */
function MathBlock({ tex }: { tex: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [wide, setWide] = useState(false);
  const applied = useRef(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let adjustments = 0; // KaTeX does not scale perfectly linearly: settle after a few steps
    const fit = () => {
      const html = el.querySelector<HTMLElement>(".katex-display .katex-html");
      if (!html) return;
      const range = document.createRange();
      range.selectNodeContents(html);
      const shown = range.getBoundingClientRect().width;
      const style = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (room <= 0 || shown <= 0) return;
      const natural = shown / applied.current; // the formula's width at full size
      const next = natural > room ? Math.max(0.6, Math.floor((room / natural) * 100) / 100) : 1;
      if (Math.abs(next - applied.current) > 0.015 && adjustments < 6) {
        adjustments++;
        applied.current = next;
        setScale(next);
      }
      setWide(natural * applied.current > room + 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    void document.fonts?.ready.then(fit); // KaTeX's fonts change the width once they arrive
    return () => ro.disconnect();
  }, [tex]);
  return (
    <>
      <div ref={box} className={`ln-math-body ${wide ? "wide" : ""}`} style={{ "--fit": scale } as React.CSSProperties}
        tabIndex={0} aria-label="Formula">
        <Tex tex={tex} display />
      </div>
      {wide && <p className="ln-math-hint">Wide formula: scroll sideways to see all of it.</p>}
    </>
  );
}

function Cited({ text, order, k, afterMath = false }: { text: string; order: string[]; k: string; afterMath?: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let prevCite = false;
  for (const m of text.matchAll(CITE)) {
    const before = text.slice(last, m.index).replace(/\s+$/, "");
    parts.push(<Fragment key={`${k}t${m.index}`}>{before}</Fragment>);
    // Back-to-back citations ("{a} {b}") read as superscript 1,2 like a paper.
    if (prevCite && before === "") parts.push(<sup key={`${k}s${m.index}`} className="ln-cite-sep">,</sup>);
    prevCite = true;
    const n = order.indexOf(m[1]) + 1;
    const src = SOURCES[m[1]];
    // Straight after a formula a bare superscript would read as an exponent: bracket it.
    const bracket = afterMath && last === 0 && before === "";
    parts.push(
      <a key={`${k}c${m.index}`} className={`ln-cite ${bracket ? "bracket" : ""}`} href={`#src-${m[1]}`} title={src ? src.title : m[1]}
        aria-label={`Source ${n}`}
        onClick={(e) => { e.preventDefault(); document.getElementById(`src-${m[1]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
        {bracket ? `[${n}]` : n}
      </a>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Fragment key={`${k}end`}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

// Links to other Learn pages inside block text: [label](#learn-page-id) or [label](#learn-page-id/anchor).
const LEARN_LINK = /\[([^\]]+)\]\(#learn-([a-z0-9-]+)(?:\/([a-z0-9-]+))?\)/g;

function Linked({ text, order, k, afterMath }: { text: string; order: string[]; k: string; afterMath: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LEARN_LINK)) {
    parts.push(<Cited key={`${k}t${m.index}`} k={`${k}t${m.index}`} text={text.slice(last, m.index)} order={order} afterMath={afterMath && last === 0} />);
    parts.push(<LearnLink key={`${k}l${m.index}`} to={{ id: m[2], anchor: m[3] }}>{m[1]}</LearnLink>);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Cited key={`${k}end`} k={`${k}end`} text={text.slice(last)} order={order} afterMath={afterMath && last === 0} />);
  return <>{parts}</>;
}

function Rich({ text, order }: { text: string; order: string[] }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_MATH)) {
    parts.push(<Linked key={`s${m.index}`} k={`s${m.index}`} text={text.slice(last, m.index)} order={order} afterMath={last > 0} />);
    parts.push(<Tex key={`m${m.index}`} tex={m[1]} />);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Linked key="rest" k="rest" text={text.slice(last)} order={order} afterMath={last > 0} />);
  return <>{parts}</>;
}

function BlockView({ b, order }: { b: Block; order: string[] }) {
  switch (b.kind) {
    case "p": return <p><Rich text={b.text} order={order} /></p>;
    case "h": return <h3>{b.text}</h3>;
    case "list": return <ul>{b.items.map((t) => <li key={t}><Rich text={t} order={order} /></li>)}</ul>;
    case "steps": return <ol>{b.items.map((t) => <li key={t}><Rich text={t} order={order} /></li>)}</ol>;
    case "code": return <pre className="ln-code"><code>{b.text}</code></pre>;
    case "math":
      return (
        <div className="ln-math">
          <MathBlock tex={b.tex} />
          {b.caption && <p className="ln-math-cap"><Rich text={b.caption} order={order} /></p>}
        </div>
      );
    case "note": return <p className={`ln-note ${b.tone}`}><Rich text={b.text} order={order} /></p>;
    case "facts":
      return (
        <dl className="ln-facts">
          {b.rows.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd><Rich text={v} order={order} /></dd></div>
          ))}
        </dl>
      );
  }
}


// ---- The two parts of Learn ----------------------------------------------------------------------------------
// Part 1, general knowledge: the guide "Grid Congestion and Site Flexibility" (Markdown, learn/general).
// Part 2, how Site Lab works: the simulator and how it is built (block pages, learn/pages.ts).

const PARTS = [
  { title: "General knowledge", intro: "Grid congestion and site flexibility: the grid, flexible connection contracts, the state of the art, the market and where the field is heading." },
  { title: "How Site Lab works", intro: "The simulator: how it models each system, how it is built, how its controllers decide, worked examples and its limits." },
] as const;

interface Entry {
  id: string;
  part: 0 | 1;
  group: string;
  num: string | null; // "7", "A" or null
  title: string; // without the number
  search: string;
  md?: GeneralChapter;
  page?: Page;
}

/** "13. The control problem" -> ("13", "The control problem"). */
function numbered(title: string): { num: string | null; title: string } {
  const m = /^(\d+)\.\s+(.*)$/.exec(title);
  return m ? { num: m[1], title: m[2] } : { num: null, title };
}

const SECTION_ORDER = Object.keys(SECTIONS) as Page["section"][];
const ENTRIES: Entry[] = [
  ...GENERAL.map((c): Entry => ({ id: c.id, part: 0, group: c.group, num: c.num, title: c.short, search: c.text, md: c })),
  ...[...PAGES]
    .sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section)
      || (a.section === "guide" ? Number(numbered(a.title).num ?? 999) - Number(numbered(b.title).num ?? 999) : 0))
    .map((p): Entry => ({
      id: p.id, part: 1, group: SECTIONS[p.section].title, ...numbered(p.title), page: p,
      search: `${p.title} ${p.summary} ${JSON.stringify(p.blocks)}`.toLowerCase(),
    })),
];
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

/** Pages removed when Learn was split into two parts, and where their topic lives now (old links keep working). */
const MOVED: Record<string, string> = {
  loop: "g-engine", "battery-strategies": "g-rules", "ev-strategies": "g-ev", mpc: "g-mpc", planned: "m-roadmap",
  uncertainty: "g-uncertainty", layers: "optimisation-and-control-under-uncertainty", learning: "optimisation-and-control-under-uncertainty",
  "use-cases": "industry-practice", batteries: "appendix-a-batteries", solar: "g-solar", "ev-charging": "g-ev",
  grid: "how-the-electricity-grid-works", tariffs: "g-markets", buildings: "g-data", "data-centers": "g-heat-dc",
  forecasting: "quantifying-flexibility-under-uncertainty", "m-landscape": "startups-and-companies",
  "m-compare": "startups-and-companies", "m-scales": "industry-practice", "s-heat-pumps": "g-heat-dc", "s-v2h": "g-ev",
  "s-14a": "g-markets", "t-dynamic-tariffs": "g-markets", "t-reserves": "how-the-electricity-grid-works",
  "t-vpp-fleets": "startups-and-companies", "t-local-flex": "grid-congestion-and-flexible-contracts",
  "t-energy-sharing": "grid-congestion-and-flexible-contracts",
};

function fromHash(): Target {
  const m = /^#learn-([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/.exec(location.hash);
  if (!m) return { id: ENTRIES[0].id };
  if (BY_ID.has(m[1])) return { id: m[1], anchor: m[2] };
  const moved = MOVED[m[1]] ?? (m[1].startsWith("c-") ? "optimisation-and-control-under-uncertainty"
    : m[1].startsWith("b-") ? "appendix-a-batteries" : m[1].startsWith("d-") ? "trends-and-research-gaps" : null);
  return { id: moved && BY_ID.has(moved) ? moved : ENTRIES[0].id };
}

const NAV_KEY = "emsbench.learn.nav";

/** The Learn page: general knowledge first, then how Site Lab works. */
export function LearnPage() {
  const setPage = useStore((s) => s.setPage);
  const [loc, setLoc] = useState<Target>(fromHash);
  const [query, setQuery] = useState("");
  const entry = BY_ID.get(loc.id) ?? ENTRIES[0];
  const page = entry.page;
  const order = useMemo(() => (page ? citationOrder(page) : []), [page]);

  const go = useCallback((t: Target) => setLoc(BY_ID.has(t.id) ? { ...t } : { id: ENTRIES[0].id }), []);
  useEffect(() => {
    const onHash = () => { if (/^#learn/.test(location.hash)) setLoc(fromHash()); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    history.replaceState(null, "", `#learn-${entry.id}${loc.anchor ? `/${loc.anchor}` : ""}`);
    const target = loc.anchor ? document.getElementById(loc.anchor) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else document.querySelector(".ln-article")?.scrollTo({ top: 0 });
  }, [loc, entry.id]);
  // The sidebar can be hidden for reading; the choice is remembered in this browser (a convenience only).
  const [navOpen, setNavOpen] = useState(() => { try { return localStorage.getItem(NAV_KEY) !== "closed"; } catch { return true; } });
  const toggleNav = useCallback((open: boolean) => {
    setNavOpen(open);
    try { localStorage.setItem(NAV_KEY, open ? "open" : "closed"); } catch { /* storage blocked: still works for this visit */ }
  }, []);
  // Keep the current page visible in the sidebar (Part 2 starts far down the list).
  useEffect(() => { if (navOpen) document.querySelector(".ln-nav .ln-link.on")?.scrollIntoView({ block: "nearest" }); }, [entry.id, navOpen]);

  const q = query.trim().toLowerCase();
  const visible = ENTRIES.filter((e) => !q || e.search.includes(q));
  const siblings = ENTRIES.filter((e) => e.part === entry.part);
  const at = siblings.indexOf(entry);
  const prev = at > 0 ? siblings[at - 1] : null;
  const next = at < siblings.length - 1 ? siblings[at + 1] : null;
  const label = entry.num == null ? null : /^\d/.test(entry.num) ? `Chapter ${entry.num}` : `Appendix ${entry.num}`;

  return (
    <LearnNav.Provider value={go}>
      <div className={`ln-root ${navOpen ? "" : "collapsed"}`}>
        {!navOpen && (
          <button className="btn ghost ln-nav-toggle ln-nav-open" onClick={() => toggleNav(true)} aria-expanded={false}
            aria-controls="ln-nav" title="Show the page list">
            <PanelLeftOpen size={16} /> <span>Pages</span>
          </button>
        )}
        <nav id="ln-nav" className="ln-nav" aria-label="Learn pages" hidden={!navOpen}>
          <div className="ln-nav-top">
            <button className="btn ghost ln-back" onClick={() => { history.replaceState(null, "", " "); setPage("lab"); }}>
              <ArrowLeft size={15} /> Back to the lab
            </button>
            <button className="btn ghost ln-nav-toggle" onClick={() => toggleNav(false)} aria-expanded aria-controls="ln-nav"
              title="Hide the page list" aria-label="Hide the page list">
              <PanelLeftClose size={16} />
            </button>
          </div>
          <label className="ln-search">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Learn" aria-label="Search Learn" />
          </label>
          {PARTS.map((part, pi) => {
            const items = visible.filter((e) => e.part === pi);
            if (!items.length) return null;
            const groups = [...new Set(items.map((e) => e.group))];
            return (
              <section key={part.title} className="ln-part">
                <h2 className="ln-part-title" title={part.intro}><span className="ln-part-num">{pi + 1}</span>{part.title}</h2>
                {groups.map((g) => (
                  <div key={g} className="ln-group">
                    <h3>{g}</h3>
                    {items.filter((e) => e.group === g).map((e) => (
                      <button key={e.id} className={`ln-link ${e.id === entry.id ? "on" : ""}`} onClick={() => go({ id: e.id })}
                        aria-current={e.id === entry.id ? "page" : undefined}>
                        <span className="ln-num">{e.num ?? ""}</span>
                        <span className="ln-link-title">{e.title}</span>
                        {e.page?.status === "planned" && <span className="ln-pill planned">Planned</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </section>
            );
          })}
          {!visible.length && <p className="ln-rule">Nothing matches “{query}”.</p>}
          <p className="ln-rule">Every statement is backed by a linked source, this repository or our own runs.</p>
        </nav>

        <article className="ln-article">
          <div className="ln-inner">
            <p className="ln-section">{PARTS[entry.part].title} · {entry.group}{label ? ` · ${label}` : ""}</p>
            <h1>{entry.title}</h1>

            {entry.md && (
              <>
                {entry.md.sections.length > 1 && (
                  <nav className="ln-toc" aria-label="On this page">
                    <p>On this page</p>
                    <ol>
                      {entry.md.sections.map((s) => (
                        <li key={s.anchor}>
                          <LearnLink to={{ id: entry.id, anchor: s.anchor }}>
                            {s.num && <span className="ln-toc-num">{s.num}</span>}{s.title}
                          </LearnLink>
                        </li>
                      ))}
                    </ol>
                  </nav>
                )}
                <Markdown source={entry.md.body} glossary={entry.id === "glossary"} />
                <p className="ln-provenance">
                  From the guide “Grid Congestion and Site Flexibility: State of the Art, Market and Direction”, with sources up to
                  November 2026. Every factual claim links to its source; numbers labelled illustrative are examples, not data.
                </p>
              </>
            )}

            {page && (
              <>
                {page.status && <p className="ln-status"><span className={`ln-pill ${page.status}`}>{page.status === "built" ? "Built in Site Lab" : "Planned, not built"}</span></p>}
                <p className="ln-summary">{page.summary}</p>
                {page.blocks.map((b, i) => <BlockView key={i} b={b} order={order} />)}
                {order.length > 0 && (
                  <section className="ln-sources">
                    <h3>Sources</h3>
                    <ol>
                      {order.map((id) => {
                        const s = SOURCES[id];
                        if (!s) return <li key={id} id={`src-${id}`}>Missing source: {id}</li>;
                        return (
                          <li key={id} id={`src-${id}`}>
                            <span className="ln-src-title">
                              {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} <ExternalLink size={11} /></a> : s.title}
                            </span>
                            <span className="ln-src-meta">{[s.authors, s.venue, s.year].filter(Boolean).join(" · ")}</span>
                            <span className={`ln-read ${s.read}`}>{READ_LABEL[s.read]}</span>
                            {s.note && <span className="ln-src-note">{s.note}</span>}
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                )}
              </>
            )}

            {(prev || next) && (
              <nav className="ln-pager" aria-label="Previous and next page">
                {prev ? (
                  <button className="ln-page-link" onClick={() => go({ id: prev.id })}>
                    <span className="ln-page-dir"><ArrowLeft size={13} /> Previous</span>
                    <span className="ln-page-title">{prev.title}</span>
                  </button>
                ) : <span />}
                {next && (
                  <button className="ln-page-link next" onClick={() => go({ id: next.id })}>
                    <span className="ln-page-dir">Next <ArrowRight size={13} /></span>
                    <span className="ln-page-title">{next.title}</span>
                  </button>
                )}
              </nav>
            )}
          </div>
        </article>
      </div>
    </LearnNav.Provider>
  );
}
