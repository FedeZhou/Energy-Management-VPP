// Learn, part 2 ("How Site Lab works"): pages written as blocks. Part 1 (general knowledge) is Markdown, see general.ts.
import { EXAMPLE_PAGES } from "./examples";
import { GUIDE_CONTROL_PAGES } from "./guide_control";
import { GUIDE_IMPL_PAGES } from "./guide_impl";
import { GUIDE_RELIABILITY_PAGES } from "./guide_reliability";
import { GUIDE_SYSTEMS_PAGES } from "./guide_systems";
import { ROADMAP_PAGES } from "./roadmap";

// Text may cite sources inline with {sourceId}; every id must exist in sources.ts. Link another Learn page with
// [text](#learn-page-id) or [text](#learn-page-id/anchor).
// Rule: only statements backed by a cited source (or by this repository / our own runs, labelled as such).

export type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "facts"; rows: [string, string][] }
  | { kind: "code"; text: string }
  | { kind: "math"; tex: string; caption?: string }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  | { kind: "h"; text: string };

export interface Page {
  id: string;
  section: "guide" | "examples" | "roadmap";
  title: string;
  summary: string;
  status?: "built" | "planned";
  blocks: Block[];
}

export const SECTIONS: Record<Page["section"], { title: string; intro: string }> = {
  guide: { title: "The complete guide", intro: "How Site Lab works, chapter by chapter: how it models each system, how it is built, how its controllers decide and how they are judged." },
  examples: { title: "Worked examples", intro: "Real-world situations worked through in Site Lab, each teaching one idea, with numbers from our own runs and a link to try it." },
  roadmap: { title: "Limits and roadmap", intro: "What Site Lab simplifies, what it cannot simulate yet, and the next steps." },
};

export const PAGES: Page[] = [
  ...GUIDE_SYSTEMS_PAGES,
  ...GUIDE_IMPL_PAGES,
  ...GUIDE_CONTROL_PAGES,
  ...GUIDE_RELIABILITY_PAGES,
  ...EXAMPLE_PAGES,
  ...ROADMAP_PAGES,
];
