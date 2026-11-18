// Ported 1:1 from COMPASS (app/src/help/content.ts).
import { matchPath } from "react-router-dom";
import { blockText, parseBlocks, plainText, type Block } from "./markdown";
import { foldText } from "@rbp/ui";
import { helpFiles } from "./sources";

// The manual: one Markdown file per chapter and language (src/help/<language>/NN-slug.md, NN = order). A chapter starts
// with optional front matter, `routes:` = the pages it explains (comma separated; `/tasks/:id#task-page` also names
// the section the context help scrolls to), then `# Title`, an intro and `##` sections with stable ids (`{#id}`, the
// same in both languages: scripts/check-i18n.mjs compares them).

type Lang = "de" | "en";

type HelpSection = {
  id: string; // "top" = the intro before the first heading
  title: string;
  blocks: Block[];
  text: string; // plain text for search
  normalized: string;
  map: number[]; // normalized index -> index in `text`
};

export type HelpChapter = {
  slug: string;
  title: string;
  summary: string;
  routes: { pattern: string; section?: string }[];
  sections: HelpSection[];
};

// Platform: the chapters of every module in the app, loaded before this file (help/sources.ts).
const files = helpFiles();

// Lower case, without accents, "ß" as "ss". `map` keeps the way back to the original text for snippets.
export function normalize(text: string): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const folded = foldText(text[i]);
    for (const c of folded) {
      normalized += c;
      map.push(i);
    }
  }
  return { normalized, map };
}

const normalizeQuery = (q: string) => normalize(q).normalized.trim();

function parseChapter(slug: string, raw: string): HelpChapter {
  let source = raw.replace(/\r\n/g, "\n");
  const routes: HelpChapter["routes"] = [];
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (front) {
    source = source.slice(front[0].length);
    const line = /^routes:\s*(.*)$/m.exec(front[1]);
    for (const entry of (line?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const [pattern, section] = entry.split("#");
      routes.push({ pattern, section });
    }
  }
  const { title, blocks } = parseBlocks(source);

  const sections: HelpSection[] = [];
  let current: { id: string; title: string; blocks: Block[] } = { id: "top", title, blocks: [] };
  const flush = () => {
    const text = current.blocks.map(blockText).join(" ");
    sections.push({ ...current, text, ...normalize(text) });
  };
  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) {
      flush();
      current = { id: block.id, title: block.text, blocks: [block] };
    } else current.blocks.push(block);
  }
  flush();

  const intro = blocks.find((b) => b.type === "paragraph");
  return { slug, title, summary: intro ? plainText(intro.text) : "", routes, sections: sections.filter((s) => s.id !== "top" || s.text) };
}

const cache: Partial<Record<Lang, HelpChapter[]>> = {};

export function getChapters(lang: Lang): HelpChapter[] {
  if (cache[lang]) return cache[lang]!;
  const chapters = Object.entries(files)
    .filter(([path]) => path.startsWith(`./${lang}/`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => parseChapter(path.replace(/^.*\/\d+-/, "").replace(/\.md$/, ""), raw));
  cache[lang] = chapters;
  return chapters;
}

export const getChapter = (lang: Lang, slug: string | undefined) => getChapters(lang).find((c) => c.slug === slug);

// Which chapter (and section) explains the page the user is on. The most specific pattern wins.
export function chapterForPath(lang: Lang, pathname: string): { chapter: HelpChapter; section?: string } | null {
  let best: { chapter: HelpChapter; section?: string; score: number } | null = null;
  for (const chapter of getChapters(lang)) {
    for (const route of chapter.routes) {
      if (!matchPath({ path: route.pattern, end: true }, pathname)) continue;
      const segments = route.pattern.split("/").filter(Boolean);
      const score = segments.filter((s) => !s.startsWith(":")).length * 100 + segments.length;
      if (!best || score > best.score) best = { chapter, section: route.section, score };
    }
  }
  return best;
}

export type HelpHit = {
  chapter: HelpChapter;
  section: HelpSection;
  score: number;
  snippet: string;
};

const isWordStart = (text: string, index: number) => index === 0 || !/[a-z0-9]/.test(text[index - 1]);

export function searchHelp(lang: Lang, query: string, limit = 20): HelpHit[] {
  const tokens = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.every((t) => t.length < 2)) return [];
  const hits: HelpHit[] = [];
  for (const chapter of getChapters(lang)) {
    const chapterTitle = normalize(chapter.title).normalized;
    for (const section of chapter.sections) {
      const title = normalize(section.title).normalized;
      let score = 0;
      let firstBodyHit = -1;
      let all = true;
      for (const token of tokens) {
        let tokenScore = 0;
        const inTitle = title.indexOf(token);
        if (inTitle >= 0) tokenScore += isWordStart(title, inTitle) ? 8 : 4;
        if (chapterTitle.includes(token)) tokenScore += 2;
        const inBody = section.normalized.indexOf(token);
        if (inBody >= 0) {
          tokenScore += isWordStart(section.normalized, inBody) ? 2 : 1;
          if (firstBodyHit < 0 || inBody < firstBodyHit) firstBodyHit = inBody;
        }
        if (tokenScore === 0) {
          all = false;
          break;
        }
        score += tokenScore;
      }
      if (!all) continue;
      if (section.id === "top") score += 1;
      hits.push({ chapter, section, score, snippet: snippetAround(section, firstBodyHit) });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function snippetAround(section: HelpSection, normalizedIndex: number, radius = 80): string {
  const text = section.text;
  if (!text) return "";
  const at = normalizedIndex >= 0 ? section.map[normalizedIndex] ?? 0 : 0;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius * 2);
  return `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${end < text.length ? " …" : ""}`;
}
