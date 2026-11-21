// General knowledge: the guide "Grid Congestion and Site Flexibility: State of the Art, Market and Direction",
// kept as its own Markdown chapters in ./general (one file per chapter, figures in ./general/figures as SVG).
// Rules for editing those files:
//  1. Do not change facts, numbers or sources; every factual claim keeps its inline link. Shorten wording, not content.
//  2. Values marked illustrative or assumed stay labelled as such.
//  3. Figure numbers and captions stay in sync with the text, which refers to them by number.
//  4. The guide reflects sources up to November 2026.
//  5. Passages about the owner personally or their employer were left out on purpose (the repo is public).
// Front matter: title, sidebar_position and, where a new part begins, part. One # title per file, ## sections
// numbered "7.3 ...", ### subsections. The SVGs have a white background: never invert them in dark mode.
// This module reads the files, works out each chapter's number, part, headings and figures, and resolves the
// guide's plain-text cross-references ("Section 5.1", "Figure A6") to Learn links.

const RAW = import.meta.glob("./general/*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const FIGURES = import.meta.glob("./general/figures/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export interface GeneralChapter {
  id: string; // learn page id, from the file name without its number: "how-the-electricity-grid-works"
  file: string;
  title: string; // full title as in the file: "2. How the electricity grid works"
  num: string | null; // "2", "A", or null for the executive summary and glossary
  short: string; // title without its number: "How the electricity grid works"
  group: string; // "Introduction", "Part I · Foundations", ..., "Appendices"
  body: string; // Markdown after the front matter and the single # title
  sections: { num: string | null; title: string; anchor: string }[]; // the ## headings, for the page's contents
  text: string; // lower-case plain text, for search
}

/** "## 5.1 Asset models" -> s5-1, "## A.3 ..." -> sa-3; other headings get a slug. */
export function headingAnchor(text: string): { num: string | null; title: string; anchor: string } {
  const m = /^((?:\d+|[AB])(?:\.\d+)+)\s+(.*)$/.exec(text);
  if (m) return { num: m[1], title: m[2], anchor: `s${m[1].toLowerCase().replace(/\./g, "-")}` };
  return { num: null, title: text, anchor: `h-${slug(text)}` };
}

export function slug(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** "Figure 12." -> fig-12, "Figure A6." -> fig-a6 */
export function figureAnchor(caption: string): string | null {
  const m = /^Figure\s+([AB]?\d+)/.exec(caption);
  return m ? `fig-${m[1].toLowerCase()}` : null;
}

function frontMatter(raw: string): { meta: Record<string, string>; rest: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw);
  if (!m) return { meta: {}, rest: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*"?(.*?)"?\s*$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, rest: raw.slice(m[0].length) };
}

function load(): GeneralChapter[] {
  const files = Object.keys(RAW).sort((a, b) => order(a) - order(b));
  let group = "Introduction";
  return files.map((path) => {
    const file = path.split("/").pop() ?? path;
    const { meta, rest } = frontMatter(RAW[path].replace(/\r\n/g, "\n"));
    if (meta.part) group = meta.part;
    const title = meta.title ?? file;
    const body = rest.replace(/^\s*# .*\n/, "");
    const num = /^(\d+)\.\s/.exec(title)?.[1] ?? /^Appendix ([AB])\./.exec(title)?.[1] ?? null;
    const short = title.replace(/^(\d+\.|Appendix [AB]\.)\s+/, "");
    const sections = [...body.matchAll(/^## (.+)$/gm)].map((m) => headingAnchor(m[1].trim()));
    const text = `${title} ${body}`.replace(/\]\([^)]*\)/g, "]").replace(/[*_\\#|[\]]/g, " ").toLowerCase();
    return { id: file.replace(/\.md$/, "").replace(/^\d+-/, ""), file, title, num, short, group, body, sections, text };
  });
}

/** Chapter files first in number order, then the appendices, then the glossary. */
function order(path: string): number {
  const f = path.split("/").pop() ?? "";
  const n = /^(\d+)-/.exec(f);
  if (n) return Number(n[1]);
  if (f.startsWith("appendix-a")) return 100;
  if (f.startsWith("appendix-b")) return 101;
  return 200;
}

export const GENERAL: GeneralChapter[] = load();

export function figureUrl(src: string): string | undefined {
  return FIGURES[`./general/${src.replace(/^\.\//, "")}`];
}

// ---- Cross-references -------------------------------------------------------------------------------------

const byNum = new Map(GENERAL.filter((c) => c.num).map((c) => [c.num as string, c]));
const anchors = new Map<string, Set<string>>(GENERAL.map((c) => [c.id, new Set(anchorsIn(c.body))]));
const figurePage = new Map<string, string>();
for (const c of GENERAL) for (const m of c.body.matchAll(/^!\[(Figure [AB]?\d+)/gm)) figurePage.set(figureAnchor(m[1]) as string, c.id);

function anchorsIn(body: string): string[] {
  return [...body.matchAll(/^#{2,3} (.+)$/gm)].map((m) => headingAnchor(m[1].trim()).anchor);
}

export interface Target { id: string; anchor?: string }

/** Resolve one reference such as ("Section", "5.1"), ("Appendix", "A.3") or ("Figure", "A6"). */
export function resolveRef(kind: string, ref: string): Target | null {
  if (/^Figure/.test(kind)) {
    const a = `fig-${ref.toLowerCase()}`;
    const id = figurePage.get(a);
    return id ? { id, anchor: a } : null;
  }
  const parts = ref.split(".");
  const chapter = byNum.get(parts[0]);
  if (!chapter) return null;
  // Try the most specific heading first: 7.2.1, then 7.2, then the chapter page itself.
  for (let n = parts.length; n >= 2; n--) {
    const a = `s${parts.slice(0, n).join("-").toLowerCase()}`;
    if (anchors.get(chapter.id)?.has(a)) return { id: chapter.id, anchor: a };
  }
  return { id: chapter.id };
}

export function learnHref(t: Target): string {
  return `#learn-${t.id}${t.anchor ? `/${t.anchor}` : ""}`;
}
