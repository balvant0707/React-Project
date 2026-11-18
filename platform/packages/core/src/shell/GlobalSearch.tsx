import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Empty, Input, Spin, Tag, Tooltip, theme as antdTheme, type InputRef } from "antd";
import { ExportOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { BOTTOM_TABS_HEIGHT, useIsMobile, useVisualViewport } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { FOCUS_SEARCH_EVENT, takeSearchFocusRequest, useHideBottomTabs } from "./BottomTabs";
import { defaultSearchLine, searchTypeFor, searchTypes, type SearchResult } from "./searchTypes";

const { useToken } = antdTheme;

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
const SHORTCUT_LABEL = IS_MAC ? "⌘K" : "Ctrl+K";

const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

const detailPath = (r: SearchResult) => {
  const type = searchTypeFor(r.entity_type);
  if (type?.path) return type.path(r);
  // Routes use dashes ("task_types" -> /task-types).
  return `/${r.entity_type.replace("_", "-")}/${r.id}`;
};

function useSearch(term: string) {
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setRecords([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      const { data, error } = await supabaseClient.rpc("global_search", { p_search_term: trimmed, p_result_limit: 40 }).abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      setFailed(!!error);
      setRecords(error ? [] : ((data ?? []) as SearchResult[]));
      setLoading(false);
    })();
    return () => controller.abort();
  }, [term]);
  return { results: records, loading, failed };
}

// Results grouped by type (fixed order), the flat list is what keyboard navigation walks through.
function useGrouped(results: SearchResult[]) {
  return useMemo(() => {
    const known = searchTypes().map((t) => t.entityType);
    const rest = [...new Set(results.map((r) => r.entity_type))].filter((t) => !known.includes(t));
    const groups = [...known, ...rest].map((type) => ({ type, items: results.filter((r) => r.entity_type === type) })).filter((g) => g.items.length > 0);
    return { groups, flat: groups.flatMap((g) => g.items) };
  }, [results]);
}

const ResultList = ({ term, results, loading, failed, activeIndex, setActiveIndex, onPick, onPickNewTab, compact }: {
  term: string;
  results: SearchResult[];
  loading: boolean;
  failed: boolean;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPick: (r: SearchResult) => void;
  onPickNewTab: (r: SearchResult) => void;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const { token } = useToken();
  const { groups, flat } = useGrouped(results);

  if (!navigator.onLine && results.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("search.offline")} style={{ padding: 16 }} />;
  if (loading && results.length === 0) return <div style={{ padding: 16, textAlign: "center" }}><Spin size="small" /></div>;
  if (failed) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("search.failed")} style={{ padding: 16 }} />;
  if (results.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("search.noMatches")} style={{ padding: 16 }} />;

  const line = (r: SearchResult) => (searchTypeFor(r.entity_type)?.line ?? defaultSearchLine)(r, term);

  let index = -1;
  return (
    <>
      {groups.map((group) => (
        <div key={group.type}>
          <div style={{ padding: "6px 12px 2px", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: token.colorTextSecondary, background: token.colorFillQuaternary }}>
            {t(searchTypeFor(group.type)?.groupLabel ?? `search.groups.${group.type}`, { defaultValue: searchTypeFor(group.type)?.groupLabel ?? group.type })} ({group.items.length})
          </div>
          {group.items.map((r) => {
            index += 1;
            const i = index;
            const { primary, secondary } = line(r);
            const active = i === activeIndex && flat[i] === r;
            return (
              <div
                key={`${r.entity_type}:${r.id}`}
                data-index={i}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => (e.ctrlKey || e.metaKey ? undefined : onPick(r))}
                onMouseUp={(e: MouseEvent) => {
                  if (e.button === 1 || (e.button === 0 && (e.ctrlKey || e.metaKey))) {
                    e.preventDefault();
                    onPickNewTab(r);
                  }
                }}
                onAuxClick={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  display: "flex",
                  alignItems: compact ? "center" : "flex-start",
                  gap: 8,
                  padding: compact ? "5px 12px" : "10px 12px",
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: 1.35,
                  borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  background: active ? token.colorFillTertiary : "transparent",
                }}
              >
                <span style={{ color: token.colorTextSecondary, marginTop: compact ? 0 : 2 }}>{searchTypeFor(r.entity_type)?.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={searchTypeFor(r.entity_type)?.textual ? { wordBreak: "break-word" } : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: compact ? "nowrap" : "normal" }}>{primary}</div>
                  {secondary && <div style={{ color: token.colorTextSecondary, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{secondary}</div>}
                </div>
                {searchTypeFor(r.entity_type)?.badge?.(r)}
                {compact && (
                  <Tooltip title={t("search.openNewTab")}>
                    <span
                      role="button"
                      aria-label={t("search.openNewTab")}
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPickNewTab(r);
                      }}
                      style={{ color: token.colorTextSecondary, padding: "2px 4px" }}
                    >
                      <ExportOutlined />
                    </span>
                  </Tooltip>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
};

// Shared behaviour of the desktop dropdown and the phone page: debounced term, arrow keys, Enter, new tab.
function useSearchState(onNavigate: () => void) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [term, setTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  const { results, loading, failed } = useSearch(term);
  const { flat } = useGrouped(results);
  useEffect(() => setActiveIndex(-1), [results]);
  useEffect(() => {
    if (activeIndex >= 0) listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const reset = () => {
    setValue("");
    setTerm("");
  };
  const pick = (r: SearchResult) => {
    const path = detailPath(r);
    if (!path) return;
    reset();
    onNavigate();
    navigate(path);
  };
  const pickNewTab = (r: SearchResult) => {
    const path = detailPath(r);
    if (path) window.open(path, "_blank", "noopener");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, close: () => void) => {
    if (e.key === "Escape") return close();
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(activeIndex + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(activeIndex - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[Math.max(activeIndex, 0)];
      if (!r) return;
      if (e.shiftKey || e.ctrlKey || e.metaKey) pickNewTab(r);
      else pick(r);
    }
  };
  return { value, setValue, term, results, loading, failed, activeIndex, setActiveIndex, listRef, pick, pickNewTab, onKeyDown, reset };
}

const DesktopSearch = () => {
  const { t } = useTranslation();
  const { token } = useToken();
  const inputRef = useRef<InputRef>(null);
  const [focused, setFocused] = useState(false);
  const s = useSearchState(() => setFocused(false));

  // Ctrl/Cmd+K anywhere, or "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const combo = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target);
      if (!combo && !slash) return;
      e.preventDefault();
      inputRef.current?.focus({ cursor: "all" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = focused && s.value.trim().length >= MIN_QUERY_LENGTH;
  return (
    <div style={{ position: "relative", flex: "1 1 520px", maxWidth: 640, minWidth: 180, marginRight: "auto" }}>
      <Input
        ref={inputRef}
        allowClear
        placeholder={t("search.placeholder", { shortcut: SHORTCUT_LABEL })}
        prefix={<SearchOutlined style={{ color: token.colorTextPlaceholder }} />}
        value={s.value}
        onChange={(e) => s.setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => s.onKeyDown(e, () => { inputRef.current?.blur(); setFocused(false); })}
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
      />
      {open && (
        <div
          id="global-search-results"
          ref={s.listRef}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            width: "100%",
            minWidth: 560,
            maxWidth: "calc(100vw - 280px)",
            lineHeight: 1.4, // the header sets a 64px line height that would be inherited
            maxHeight: "75vh",
            overflowY: "auto",
            background: token.colorBgElevated,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
            zIndex: 1050,
          }}
        >
          <ResultList term={s.term} results={s.results} loading={s.loading} failed={s.failed} activeIndex={s.activeIndex} setActiveIndex={s.setActiveIndex} onPick={s.pick} onPickNewTab={s.pickNewTab} compact />
        </div>
      )}
    </div>
  );
};

// Phone: the search is a page of its own (/search, a bottom tab): results fill the page, the field sits above the
// tabs and, while typing, right above the keyboard. The term stays in the address (?q=).
export const PhoneSearch = () => {
  const { t } = useTranslation();
  const { token } = useToken();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const initial = useRef(params.get("q") ?? "");
  const inputRef = useRef<InputRef>(null);
  // After a pick the term is reset; syncing that into ?q= would navigate back to /search (the setter resolves
  // against this route) and undo the navigation to the result.
  const leaving = useRef(false);
  const s = useSearchState(() => {
    leaving.current = true;
  });
  const [focused, setFocused] = useState(false);
  useHideBottomTabs(isMobile && focused);
  useEffect(() => {
    if (initial.current) s.setValue(initial.current);
    // A tap on the magnifier (bottomTabs.tsx) asked for the field; a fresh page without a term gets it anyway.
    if (takeSearchFocusRequest() || !initial.current) inputRef.current?.focus();
    const refocus = () => inputRef.current?.focus();
    window.addEventListener(FOCUS_SEARCH_EVENT, refocus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, refocus);
  }, []);
  useEffect(() => {
    if (leaving.current || s.term === (params.get("q") ?? "")) return;
    setParams(s.term ? { q: s.term } : {}, { replace: true });
  }, [s.term]);

  const field = (
    <Input
      ref={inputRef}
      allowClear
      size="large"
      enterKeyHint="search"
      placeholder={t("search.placeholderShort")}
      prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
      value={s.value}
      onChange={(e) => s.setValue(e.target.value)}
      onKeyDown={(e) => s.onKeyDown(e, () => inputRef.current?.blur())}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ borderRadius: 999, background: token.colorFillTertiary, border: "none" }}
    />
  );
  const results = (
    <div ref={s.listRef}>
      {s.value.trim().length < MIN_QUERY_LENGTH ? (
        <div style={{ padding: 24, textAlign: "center" }}><Tag>{t("search.hint")}</Tag></div>
      ) : (
        <ResultList term={s.term} results={s.results} loading={s.loading} failed={s.failed} activeIndex={s.activeIndex} setActiveIndex={s.setActiveIndex} onPick={s.pick} onPickNewTab={s.pickNewTab} />
      )}
    </div>
  );
  if (!isMobile) {
    return (
      <div>
        <div style={{ marginBottom: 12 }}>{field}</div>
        {results}
      </div>
    );
  }
  return <PhoneSearchLayer focused={focused} field={field} results={results} title={t("search.open")} />;
};

// Phone: the search fills the visible screen (useVisualViewport), so the results stay in view when iOS pans the page
// for the keyboard.
const PhoneSearchLayer = ({ focused, field, results, title }: { focused: boolean; field: ReactNode; results: ReactNode; title: string }) => {
  const { token } = useToken();
  const viewport = useVisualViewport();
  const below = focused ? "0px" : `calc(${BOTTOM_TABS_HEIGHT}px + 1px + var(--bar-gap))`;
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: viewport.top,
        height: `calc(${viewport.height}px - ${below})`,
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        background: token.colorBgLayout,
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div style={{ flex: "none", padding: "12px 16px 4px", fontSize: 20, fontWeight: 600 }}>{title}</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 8px" }}>{results}</div>
      <div style={{ flex: "none", padding: "8px 12px", background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        {field}
      </div>
    </div>
  );
};

// Header search on a computer; on a phone the search is the page /search (bottom tab).
export const GlobalSearch = () => (useIsMobile() ? null : <DesktopSearch />);
