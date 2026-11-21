import { createContext, useContext, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { figureAnchor, figureUrl, headingAnchor, learnHref, resolveRef, slug, type Target } from "../learn/general";

// A small renderer for the general-knowledge chapters (learn/general.ts). Their Markdown uses a fixed subset:
// ## and ### headings, paragraphs, - and 1. lists (not nested), GitHub tables, images followed by an italic
// caption line, **bold**, *italic*, [links](url) and backslash escapes. Output is React elements, never raw HTML.

/** How a Learn link navigates (set by LearnPage), so links work even when the hash would not change. */
export const LearnNav = createContext<(t: Target) => void>(() => {});

export function LearnLink({ to, children }: { to: Target; children: ReactNode }) {
  const go = useContext(LearnNav);
  return (
    <a href={learnHref(to)} onClick={(e) => { e.preventDefault(); go(to); }}>{children}</a>
  );
}

// ---- Inline ------------------------------------------------------------------------------------------------

const ATOM = String.raw`(?:[AB](?:\.?\d+)*|\d+(?:\.\d+)*)`;
const XREF = new RegExp(String.raw`\b(Chapters?|Sections?|Appendix|Figures?)\s+(${ATOM}(?:(?:\s*[–-]\s*|,\s*|\s+and\s+)${ATOM})*)`, "g");

/** Plain text with "Chapter 8", "Sections 5.1, 6.2", "Appendix A.3" and "Figure A6" turned into links. */
function linkRefs(text: string, key: string, noFigures: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(XREF)) {
    const kind = m[1];
    if (noFigures && kind.startsWith("Figure")) continue;
    const start = m.index ?? 0;
    out.push(text.slice(last, start), `${kind} `);
    // Link each number in "2–3" or "4, 7 and 8" on its own.
    let i = 0;
    for (const a of m[2].matchAll(new RegExp(ATOM, "g"))) {
      const ai = a.index ?? 0;
      out.push(m[2].slice(i, ai));
      // "Section A.6" and "Appendix A" point into an appendix; a bare letter is only an appendix after "Appendix".
      const ref = a[0];
      const target = /^[AB]$/.test(ref) && kind !== "Appendix" ? null : resolveRef(kind, ref);
      out.push(target ? <LearnLink key={`${key}-${start}-${ai}`} to={target}>{ref}</LearnLink> : ref);
      i = ai + ref.length;
    }
    out.push(m[2].slice(i));
    last = start + m[0].length;
  }
  out.push(text.slice(last));
  return out.filter((n) => n !== "");
}

/** Find the closing marker, skipping escaped characters. */
function closing(s: string, from: number, marker: string): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") { i++; continue; }
    if (s.startsWith(marker, i) && (marker !== "*" || s[i + 1] !== "*")) return i;
    if (marker === "*" && s.startsWith("**", i)) { const j = closing(s, i + 2, "**"); if (j < 0) return -1; i = j + 1; }
  }
  return -1;
}

export function inline(s: string, key = "i", noFigures = false): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = "";
  const flush = (k: string) => { if (buf) out.push(...linkRefs(buf, k, noFigures)); buf = ""; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) { buf += s[++i]; continue; }
    if (s.startsWith("**", i)) {
      const j = closing(s, i + 2, "**");
      if (j > i + 2) { flush(`${key}${i}`); out.push(<strong key={`${key}b${i}`}>{inline(s.slice(i + 2, j), `${key}b${i}`, noFigures)}</strong>); i = j + 1; continue; }
    }
    if (c === "*" && s[i + 1] !== " ") {
      const j = closing(s, i + 1, "*");
      if (j > i + 1) { flush(`${key}${i}`); out.push(<em key={`${key}e${i}`}>{inline(s.slice(i + 1, j), `${key}e${i}`, noFigures)}</em>); i = j; continue; }
    }
    if (c === "[") {
      const m = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m) {
        flush(`${key}${i}`);
        const href = m[2];
        const internal = /^#learn-([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/.exec(href);
        if (internal) {
          out.push(<LearnLink key={`${key}l${i}`} to={{ id: internal[1], anchor: internal[2] }}>{inline(m[1], `${key}l${i}`, true)}</LearnLink>);
        } else {
          // Keep the external-link icon on the same line as the link's last word.
          const text = m[1].replace(/\s+$/, "");
          const cut = Math.max(text.lastIndexOf(" ") + 1, 0);
          out.push(
            <a key={`${key}l${i}`} href={href} target="_blank" rel="noreferrer">
              {inline(text.slice(0, cut), `${key}l${i}a`, true)}
              <span className="ln-nowrap">{inline(text.slice(cut), `${key}l${i}b`, true)}<ExternalLink size={10} className="ln-ext" aria-hidden /></span>
            </a>,
          );
        }
        i += m[0].length - 1;
        continue;
      }
    }
    buf += c;
  }
  flush(`${key}end`);
  return out;
}

// ---- Blocks ------------------------------------------------------------------------------------------------

function cells(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && i + 1 < t.length) { cur += t[i] + t[i + 1]; i++; continue; }
    if (t[i] === "|") { out.push(cur.trim()); cur = ""; continue; }
    cur += t[i];
  }
  out.push(cur.trim());
  return out;
}

const LIST = /^(?:[-*]|\d+\.)\s+/;
const startsBlock = (l: string) => /^#{1,6}\s/.test(l) || l.startsWith("![") || l.startsWith("|") || LIST.test(l);

export function Markdown({ source, glossary = false }: { source: string; glossary?: boolean }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    const k = `b${i}`;
    if (!line.trim()) { i++; continue; }

    const h = /^(#{2,6})\s+(.*)$/.exec(line);
    if (h) {
      const { anchor } = headingAnchor(h[2].trim());
      out.push(h[1].length === 2
        ? <h2 key={k} id={anchor} className="ln-h2">{inline(h[2], k)}</h2>
        : <h3 key={k} id={anchor} className="ln-h3">{inline(h[2], k)}</h3>);
      i++;
      continue;
    }

    const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (img) {
      i++;
      while (i < lines.length && !lines[i].trim()) i++;
      let caption: string | null = null;
      if (i < lines.length && /^\*[^*].*\*\s*$/.test(lines[i].trim())) { caption = lines[i].trim().slice(1, -1); i++; }
      const id = figureAnchor(caption ?? img[1]) ?? undefined;
      out.push(
        <figure key={k} id={id} className="ln-figure">
          <img src={figureUrl(img[2])} alt={img[1]} loading="lazy" />
          {caption && <figcaption>{inline(caption, k, true)}</figcaption>}
        </figure>,
      );
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const r = cells(lines[i]);
        if (!r.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(r);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={k} className="ln-table" tabIndex={0}>
          <table>
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} id={glossary ? `term-${slug(r[0])}` : undefined}>
                  {r.map((c, j) => <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (LIST.test(line)) {
      const ordered = /^\d+\./.test(line);
      const start = ordered ? Number(/^(\d+)/.exec(line)?.[1]) : undefined;
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const l = lines[i].trim();
        if (LIST.test(l)) items.push(l.replace(LIST, ""));
        else if (startsBlock(l)) break;
        else items[items.length - 1] += ` ${l}`;
        i++;
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${k}i${j}`)}</li>);
      out.push(ordered ? <ol key={k} start={start}>{lis}</ol> : <ul key={k}>{lis}</ul>);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i].trim()))) para.push(lines[i++].trim());
    const text = para.join(" ");
    // Plain-language summaries and worked examples get their own look, so learners can find them.
    const cls = text.startsWith("**In simple terms.**") ? "ln-simple" : /^\*\*Worked example/.test(text) ? "ln-worked" : undefined;
    out.push(<p key={k} className={cls}>{inline(text, k)}</p>);
  }
  return <>{out}</>;
}
