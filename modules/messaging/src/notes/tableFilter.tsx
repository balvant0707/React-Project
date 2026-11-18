// Moved from npm-base into messaging on 2026-11-13; from the NPM tool (app/src/utils/tableFilter.tsx). Hand-owned now.
import { Table, theme } from "antd";
import { useNotesPanel } from "./notesPanelContext";
import { PaperClipOutlined, MessageOutlined } from "@ant-design/icons";
import { useEffect } from "react";

// A list row that navigates to `${pathPrefix}/${record.id}` on click - the
// same `<Table onRow={...}>` handler repeated identically on every list page.
// Used to open notes on a sustained hover (3s) - removed (2026-09-14):
// irritating on both desktop (an unwanted delay before you get what you
// clicked for) and mobile (touch has no hover at all, so it either never
// fired or fired on the wrong gesture). Opening notes is now a deliberate
// click on the notes icon itself - see notesColumn below.
// Platform: one copy for both apps in @rbp/ui (COMPASS had the same function in utils/tableRow.ts).
import { clickableRow } from "@rbp/ui";
export { clickableRow };

// How a list row is named in the Notes panel header.
const ROW_LABELS: Partial<Record<string, (r: Record<string, unknown>) => unknown>> = {
  hull_events: (r) => r.vessel_name,
  vessels: (r) => r.name,
  companies: (r) => r.name,
  specifications: (r) => [r.specification_number, r.vessel_name].filter(Boolean).join(" · "),
  orders: (r) => r.order_number ?? r.vessel_name,
  dock_reports: (r) => r.report_number ?? r.vessel_name,
  newbuilding_projects: (r) => r.title,
};
export const rowLabel = (entityType: string, record: object) => {
  const v = ROW_LABELS[entityType]?.(record as Record<string, unknown>);
  return typeof v === "string" && v ? v : undefined;
};

// Row props for a list page: with the list's Notes panel on, a click selects the row (its notes show in the panel,
// the row is highlighted) instead of navigating; ctrl/cmd-click still opens the record. Panel off: same as clickableRow.
export function useListRowProps<T extends { id: string }>(
  navigate: (path: string) => void,
  pathPrefix: string,
  entityType: string,
) {
  const { listNotesActive, openEntity, effectiveEntity } = useNotesPanel();
  const { token } = theme.useToken();
  return (record: T) => {
    if (!listNotesActive) return clickableRow<T>(navigate, pathPrefix)(record);
    const selected = effectiveEntity?.type === entityType && effectiveEntity.id === record.id;
    return {
      style: { cursor: "pointer" as const, background: selected ? token.colorPrimaryBg : undefined },
      onClick: (e: React.MouseEvent) =>
        e.ctrlKey || e.metaKey
          ? navigate(`${pathPrefix}/${record.id}`)
          : openEntity({ type: entityType, id: record.id, label: rowLabel(entityType, record) }),
    };
  };
}

// Up/down arrow keys step the selected row through the list's current page while list notes are on (not while typing in
// a field). Call with the table's loaded rows (`tableProps.dataSource`).
export function useListKeyNav<T extends { id: string }>(rows: readonly T[] | undefined, entityType: string) {
  const { listNotesActive, openEntity, effectiveEntity } = useNotesPanel();
  const selectedId = effectiveEntity?.type === entityType ? effectiveEntity.id : null;
  useEffect(() => {
    if (!listNotesActive || !rows?.length) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='menu'], .ant-modal, .ant-drawer, .ant-dropdown, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover")) return;
      // Only when nothing specific has focus (page body) or focus is inside a table, so keyboard scrolling elsewhere keeps working.
      if (el && el !== document.body && !el.closest(".ant-table-wrapper")) return;
      const current = rows.findIndex((r) => r.id === selectedId);
      const next = e.key === "ArrowDown" ? (current < 0 ? 0 : current + 1) : current < 0 ? 0 : current - 1;
      if (next < 0 || next >= rows.length) return;
      e.preventDefault();
      const row = rows[next];
      openEntity({ type: entityType, id: row.id, label: rowLabel(entityType, row) });
      document.querySelector(`tr[data-row-key="${row.id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listNotesActive, rows, selectedId, entityType, openEntity]);
}

// The trailing paperclip column shown on every list page backed by an
// *_overview view's `has_attachments` flag.
export function attachmentsColumn<T extends { has_attachments: boolean }>() {
  return (
    <Table.Column<T>
      title=""
      width={46}
      render={(_: unknown, record: T) =>
        record.has_attachments ? <PaperClipOutlined title="Has attachments" style={{ color: "#888" }} /> : null
      }
    />
  );
}

// The trailing note-icon column shown on list pages (and on the
// comparable child-record tables inside a parent's own detail page - a hull
// event's Specifications table, a vessel's Seastock Offers panel) backed by
// an *_overview view's `has_messages` flag. Shown on every row (never
// hover-gated - see clickableRow above): blue when the record has notes,
// grey when it has none, so a first note can be started from the list
// too (the panel creates the conversation on the first post). Clicking it
// opens that record's notes (stopPropagation so the click doesn't also
// fire the row's own onClick and navigate away).
export function notesColumn<T extends { has_messages: boolean }>(onOpen: (record: T) => void) {
  return (
    <Table.Column<T>
      title=""
      width={46}
      render={(_: unknown, record: T) => (
        <MessageOutlined
          title={record.has_messages ? "Open notes" : "Add a note"}
          style={{ color: record.has_messages ? "#2952E3" : "#d9d9d9", cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(record);
          }}
        />
      )}
    />
  );
}
