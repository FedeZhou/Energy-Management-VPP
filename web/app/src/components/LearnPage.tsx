import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, Search } from "lucide-react";
import { PAGES, SECTIONS, type Block, type Page } from "../learn/pages";
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

function Cited({ text, order, k }: { text: string; order: string[]; k: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    const before = text.slice(last, m.index).replace(/\s+$/, "");
    parts.push(<Fragment key={`${k}t${m.index}`}>{before}</Fragment>);
    const n = order.indexOf(m[1]) + 1;
    const src = SOURCES[m[1]];
    parts.push(
      <a key={`${k}c${m.index}`} className="ln-cite" href={`#src-${m[1]}`} title={src ? src.title : m[1]}
        onClick={(e) => { e.preventDefault(); document.getElementById(`src-${m[1]}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
        {n}
      </a>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Fragment key={`${k}end`}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}

function Rich({ text, order }: { text: string; order: string[] }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_MATH)) {
    parts.push(<Cited key={`s${m.index}`} k={`s${m.index}`} text={text.slice(last, m.index)} order={order} />);
    parts.push(<Tex key={`m${m.index}`} tex={m[1]} />);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(<Cited key="rest" k="rest" text={text.slice(last)} order={order} />);
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
          <Tex tex={b.tex} display />
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

function pageFromHash(): string {
  const m = /^#learn-([a-z0-9-]+)$/.exec(location.hash);
  return m && PAGES.some((p) => p.id === m[1]) ? m[1] : PAGES[0].id;
}

/** The Learn page: how Site Lab works, how the systems behave, and research digests, all cited. */
export function LearnPage() {
  const setPage = useStore((s) => s.setPage);
  const [current, setCurrent] = useState(pageFromHash);
  const [query, setQuery] = useState("");
  const page = PAGES.find((p) => p.id === current) ?? PAGES[0];
  const order = useMemo(() => citationOrder(page), [page]);

  useEffect(() => {
    history.replaceState(null, "", `#learn-${page.id}`);
    document.querySelector(".ln-article")?.scrollTo({ top: 0 });
  }, [page.id]);

  const q = query.trim().toLowerCase();
  const visible = PAGES.filter((p) => !q || `${p.title} ${p.summary}`.toLowerCase().includes(q));

  return (
    <div className="ln-root">
      <nav className="ln-nav" aria-label="Learn pages">
        <button className="btn ghost ln-back" onClick={() => { history.replaceState(null, "", " "); setPage("lab"); }}>
          <ArrowLeft size={15} /> Back to the lab
        </button>
        <label className="ln-search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter pages" aria-label="Filter pages" />
        </label>
        {(Object.keys(SECTIONS) as Page["section"][]).map((sec) => {
          const items = visible.filter((p) => p.section === sec);
          if (!items.length) return null;
          return (
            <div key={sec} className="ln-group">
              <h2>{SECTIONS[sec].title}</h2>
              {items.map((p) => (
                <button key={p.id} className={`ln-link ${p.id === page.id ? "on" : ""}`} onClick={() => setCurrent(p.id)}
                  aria-current={p.id === page.id ? "page" : undefined}>
                  {p.title}
                  {p.status === "planned" && <span className="ln-pill planned">Planned</span>}
                </button>
              ))}
            </div>
          );
        })}
        <p className="ln-rule">Only statements backed by a cited source, this repository or our own runs. Each source shows how deeply it was read.</p>
      </nav>

      <article className="ln-article">
        <div className="ln-inner">
          <p className="ln-section"><BookOpen size={14} /> {SECTIONS[page.section].title}</p>
          <h1>{page.title}
            {page.status && <span className={`ln-pill ${page.status}`}>{page.status === "built" ? "Built in Site Lab" : "Planned, not built"}</span>}
          </h1>
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
                      <span className="ln-src-meta">
                        {[s.authors, s.venue, s.year].filter(Boolean).join(" · ")}
                      </span>
                      <span className={`ln-read ${s.read}`}>{READ_LABEL[s.read]}</span>
                      {s.note && <span className="ln-src-note">{s.note}</span>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}
