import type { ReactNode } from "react";
import { FileTextOutlined } from "@ant-design/icons";

// A row of public.global_search(text, integer) (sources: search_source_register). The module owning a type registers here
// how a hit shows and where it leads.
export type SearchResult = {
  entity_type: string;
  id: string;
  rank: number;
  number: number | null;
  title: string | null;
  subtitle: string | null;
  status: string | null;
  parent_type: string | null;
  parent_id: string | null;
  parent_title: string | null;
  snippet: string | null;
  event_at: string | null;
  author_user_id: string | null;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bolds every occurrence of any word of the query. A typo match that does not literally appear stays unhighlighted. */
export function highlight(text: string | null | undefined, query: string): ReactNode {
  if (!text) return null;
  const tokens = query.trim().replace(/^#/, "").split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (tokens.length === 0) return text;
  return text.split(new RegExp(`(${tokens.join("|")})`, "i")).map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part));
}

/** The part of a long text around the first hit, with ellipses. */
export function excerpt(text: string, query: string, radius = 70): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const tokens = query.trim().replace(/^#/, "").split(/\s+/).filter(Boolean);
  const lower = flat.toLowerCase();
  const hit = tokens.map((tk) => lower.indexOf(tk.toLowerCase())).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hit - radius);
  const end = Math.min(flat.length, hit + radius * 2);
  return `${start > 0 ? "… " : ""}${flat.slice(start, end)}${end < flat.length ? " …" : ""}`;
}

export interface SearchType {
  entityType: string;
  /** Position of the group in the result list; lower first. */
  order: number;
  icon: ReactNode;
  /** i18n key of the group heading (default `search.groups.<entityType>`). */
  groupLabel?: string;
  /** Where a hit leads; default `/<entity_type>/<id>`. Return null for a hit without a page. */
  path?: (r: SearchResult) => string | null;
  /** The two lines of a hit; default "#number title" and the subtitle. */
  line?: (r: SearchResult, term: string) => { primary: ReactNode; secondary: ReactNode };
  /** A tag at the right of the hit (e.g. the status). */
  badge?: (r: SearchResult) => ReactNode;
  /** A hit that is a comment-like text (wraps instead of cutting). */
  textual?: boolean;
}

const types = new Map<string, SearchType>();
export const registerSearchType = (type: SearchType) => void types.set(type.entityType, type);
export const searchTypes = () => [...types.values()].sort((a, b) => a.order - b.order);
export const searchTypeFor = (entityType: string) => types.get(entityType);

export const defaultSearchLine = (r: SearchResult, term: string) => ({
  primary: <>{r.number ? `#${r.number} ` : ""}{highlight(r.title, term)}</>,
  secondary: r.subtitle ? highlight(r.subtitle, term) : null,
});

// Attachments (search_documents) belong to the platform: a hit leads to the record the file hangs on.
registerSearchType({
  entityType: "documents",
  order: 900,
  icon: <FileTextOutlined />,
  path: (r) => (r.parent_type && r.parent_id ? `/${r.parent_type.replace("_", "-")}/${r.parent_id}` : null),
  line: (r, term) => ({ primary: highlight(r.title, term), secondary: <>{r.parent_title}</> }),
});
