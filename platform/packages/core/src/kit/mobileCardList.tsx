// Phone card list of both apps, 1:1 from COMPASS (app/src/components/mobileCardList.tsx). From the NPM tool's version:
// ResponsiveList and the optional `sort` (shown as COMPASS's SortButton).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Empty, Spin, theme as antdTheme } from "antd";
import type { TableProps } from "antd";
import { useTranslation } from "react-i18next";
import type { CrudSorting } from "@refinedev/core";
import { useIsMobile } from "@rbp/ui";
import { SortButton, type SortOption } from "./sortButton";

export type CardContent = {
  title: ReactNode;
  subtitle?: ReactNode;
  tags?: ReactNode;
  footer?: ReactNode;
  // Colour of a stripe on the left edge: the card needs attention (overdue, blocked).
  accent?: string;
  // Top right, outside the tap area of the card (menu button).
  corner?: ReactNode;
  // Actions revealed by swiping the card to the left (e.g. "Tomorrow", "Forward"); null = the card does not move.
  swipe?: ReactNode;
};

// Swipe left uncovers the actions; a tap closes an open card. One card open at a time (`openId`).
const SwipeCard = ({ actions, open, onOpenChange, children }: { actions: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) => {
  const { token } = antdTheme.useToken();
  const actionsRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const width = actionsRef.current?.offsetWidth ?? 0;
  const offset = drag ?? (open ? -width : 0);
  return (
    <div style={{ position: "relative", marginBottom: 6, borderRadius: token.borderRadiusLG, overflow: "hidden" }}>
      <div ref={actionsRef} onClick={() => onOpenChange(false)} style={{ position: "absolute", top: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 8px", background: token.colorFillSecondary }}>
        {actions}
      </div>
      <div
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, horizontal: null };
        }}
        onTouchMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.touches[0].clientX - s.x;
          const dy = e.touches[0].clientY - s.y;
          if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy);
          if (!s.horizontal) return;
          const w = actionsRef.current?.offsetWidth ?? 0;
          setDrag(Math.max(-w, Math.min(0, (open ? -w : 0) + dx)));
        }}
        onTouchEnd={() => {
          if (start.current?.horizontal && drag !== null) onOpenChange(drag < -(actionsRef.current?.offsetWidth ?? 0) / 3);
          start.current = null;
          setDrag(null);
        }}
        onClickCapture={(e) => {
          // An open card closes on a tap instead of opening the record.
          if (open) {
            e.stopPropagation();
            onOpenChange(false);
          }
        }}
        style={{ position: "relative", transform: `translateX(${offset}px)`, transition: drag === null ? "transform 0.2s ease" : "none", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
};

// Sort control for a card list, bound to the list's `useTable` sorters.
export type CardSort = {
  options: { value: string; label: string }[];
  sorters: CrudSorting;
  setSorters: (sorters: CrudSorting) => void;
  // A new order starts at page 1 (`setCurrentPage` of the list's `useTable`).
  setCurrentPage?: (page: number) => void;
};

type CardListProps<T> = {
  tableProps: TableProps<T>;
  // NPM pages: the sort options, shown as a SortButton above the cards.
  sort?: CardSort;
  onOpen: (row: T) => void;
  render: (row: T) => CardContent;
};

// Cards on a phone, `children()` (the desktop view, a function so a phone never builds it) elsewhere.
export function ResponsiveList<T extends { id: string }>({ children, ...cards }: CardListProps<T> & { children: () => ReactNode }) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileCardList<T> {...cards} /> : <>{children()}</>;
}

// The rows of a `useTable` result as cards. No page numbers: the next page loads when the end comes into view (or with
// the button) and loaded pages stay; going back to page 1 (filter, sort, `onChanged`) starts over.
export function MobileCardList<T extends { id: string }>({ tableProps, onOpen, render, sort }: CardListProps<T>) {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const pagination = tableProps.pagination === false ? undefined : tableProps.pagination || undefined;
  const current = pagination?.current ?? 1;
  const pageSize = pagination?.pageSize ?? 50;
  const total = pagination?.total ?? 0;
  const loading = !!tableProps.loading;
  const data = tableProps.dataSource;

  // Rows per loaded page, taken over when `data` changes (the table keeps old rows while the next page loads).
  const [pages, setPages] = useState<Record<number, T[]>>({});
  const [fetchingMore, setFetchingMore] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;
  useEffect(() => {
    if (!data) return;
    const page = currentRef.current;
    // The same rows again (a re-render with an equal result) change nothing, so this can never loop.
    setPages((prev) => {
      const old = prev[page];
      if (old && old.length === data.length && old.every((r, i) => r === data[i]) && (page !== 1 || Object.keys(prev).length === 1)) return prev;
      return page === 1 ? { 1: [...data] } : { ...prev, [page]: [...data] };
    });
    setFetchingMore(false);
  }, [data]);
  // The URL keeps the page number, not the loaded pages: always start at page 1.
  const startedAt = useRef(current);
  useEffect(() => {
    if (startedAt.current > 1) pagination?.onChange?.(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A page request that fails or brings nothing new must not leave the button spinning for good.
  useEffect(() => {
    if (!fetchingMore) return;
    const timer = window.setTimeout(() => setFetchingMore(false), 10000);
    return () => window.clearTimeout(timer);
  }, [fetchingMore]);

  const rows = Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((p) => pages[p]);
  const hasMore = !!pagination && rows.length < total && current * pageSize < total;
  const loadMore = () => {
    if (!hasMore || loading || fetchingMore) return;
    setFetchingMore(true);
    pagination?.onChange?.(current + 1, pageSize);
  };

  const sentinel = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMoreRef.current(), { rootMargin: "200px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, rows.length]);

  const sortBar = sort && (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
      <SortButton
        options={sortOptions(sort)}
        sorters={sort.sorters}
        onChange={(next) => {
          sort.setSorters(next);
          sort.setCurrentPage?.(1);
        }}
      />
    </div>
  );
  if (rows.length === 0) {
    return (
      <>
        {sortBar}
        {loading ? <div style={{ textAlign: "center", padding: 24 }}><Spin /></div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </>
    );
  }
  return (
    <div>
      {sortBar}
      {rows.map((row) => {
        const card = render(row);
        const body = (
          <div
            key={row.id}
            role="link"
            tabIndex={0}
            onClick={() => onOpen(row)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(row)}
            style={{
              position: "relative",
              padding: "8px 12px",
              paddingRight: card.corner ? 44 : 12,
              marginBottom: card.swipe ? 0 : 6,
              cursor: "pointer",
              background: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderLeft: card.accent ? `4px solid ${card.accent}` : undefined,
              borderRadius: token.borderRadiusLG,
            }}
          >
            {card.corner && (
              <div style={{ position: "absolute", top: 2, right: 2 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                {card.corner}
              </div>
            )}
            <div style={{ fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word" }}>{card.title}</div>
            {card.subtitle && <div style={{ color: token.colorTextSecondary, fontSize: 13, marginTop: 2 }}>{card.subtitle}</div>}
            {card.tags && <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 4 }}>{card.tags}</div>}
            {card.footer && <div style={{ color: token.colorTextSecondary, fontSize: 12, marginTop: 6 }}>{card.footer}</div>}
          </div>
        );
        return card.swipe ? (
          <SwipeCard key={row.id} actions={card.swipe} open={swiped === row.id} onOpenChange={(o) => setSwiped(o ? row.id : null)}>
            {body}
          </SwipeCard>
        ) : (
          body
        );
      })}
      {hasMore && (
        <div ref={sentinel} style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <Button loading={fetchingMore} onClick={loadMore}>
            {t("common.loadMore", { shown: rows.length, total })}
          </Button>
        </div>
      )}
    </div>
  );
}

// An NPM sort option (a column) as COMPASS's two orders: ascending and descending.
const sortOptions = (sort: CardSort): SortOption[] =>
  sort.options.flatMap((o) => [
    { key: `${o.value}-asc`, label: `${o.label} ↑`, field: o.value, order: "asc" as const },
    { key: `${o.value}-desc`, label: `${o.label} ↓`, field: o.value, order: "desc" as const },
  ]);
