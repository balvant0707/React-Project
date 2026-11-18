// Ported 1:1 from COMPASS (app/src/help/components.tsx).
import { useEffect, type ReactNode } from "react";
import { Empty, theme as antdTheme } from "antd";
import { useTranslation } from "react-i18next";
import { currentLanguage, type Language } from "@rbp/core";
import { normalize, type HelpChapter, type HelpHit } from "./content";
import { Blocks, idFor, type LinkHandler } from "./markdown";

const { useToken } = antdTheme;

// Re-renders when the language changes and returns the active one.
export const useHelpLanguage = (): Language => {
  useTranslation();
  return currentLanguage();
};

// The chapter text; scrolls to `section` (or to the top when there is none) whenever chapter or section change.
export function HelpArticle({ chapter, section, title, onLink }: { chapter: HelpChapter; section?: string; title?: ReactNode; onLink: LinkHandler }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      const target = section ? document.getElementById(idFor(section)) : null;
      if (target) target.scrollIntoView({ block: "start" });
      else document.getElementById(idFor("top"))?.scrollIntoView({ block: "start" });
    }, 0);
    return () => clearTimeout(timer);
  }, [chapter.slug, section]);
  return (
    <article>
      <span id={idFor("top")} style={{ display: "block", scrollMarginTop: 72 }} />
      {title}
      {chapter.sections.map((s) => (
        <Blocks key={s.id} blocks={s.blocks} onLink={onLink} />
      ))}
    </article>
  );
}

// Bolds every word of the query in `text`, accent- and case-insensitive.
function Highlighted({ text, query }: { text: string; query: string }) {
  const tokens = normalize(query).normalized.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return <>{text}</>;
  const { normalized, map } = normalize(text);
  const marked = new Array<boolean>(text.length).fill(false);
  for (const token of tokens) {
    for (let at = normalized.indexOf(token); at >= 0; at = normalized.indexOf(token, at + token.length)) {
      for (let k = at; k < at + token.length; k++) marked[map[k]] = true;
    }
  }
  const out: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && marked[j] === marked[i]) j++;
    const part = text.slice(i, j);
    out.push(marked[i] ? <b key={i}>{part}</b> : part);
    i = j;
  }
  return <>{out}</>;
}

export function HelpResults({ hits, query, onOpen }: { hits: HelpHit[]; query: string; onOpen: (chapter: string, section: string) => void }) {
  const { t } = useTranslation();
  const { token } = useToken();
  if (hits.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("help.noResults")} />;
  return (
    <div>
      {hits.map((hit) => {
        const isTop = hit.section.id === "top";
        return (
          <a
            key={`${hit.chapter.slug}#${hit.section.id}`}
            href={`/help/${hit.chapter.slug}${isTop ? "" : `#${hit.section.id}`}`}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              onOpen(hit.chapter.slug, isTop ? "" : hit.section.id);
            }}
            style={{ display: "block", padding: "10px 4px", borderBottom: `1px solid ${token.colorBorderSecondary}`, color: "inherit" }}
          >
            <div style={{ fontWeight: 500 }}>
              <Highlighted text={hit.section.title} query={query} />
              {!isTop && <span style={{ color: token.colorTextSecondary, fontWeight: 400 }}> · {hit.chapter.title}</span>}
            </div>
            <div style={{ color: token.colorTextSecondary, fontSize: 13 }}>
              <Highlighted text={hit.snippet} query={query} />
            </div>
          </a>
        );
      })}
    </div>
  );
}
