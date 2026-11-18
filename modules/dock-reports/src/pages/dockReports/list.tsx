// Ported 1:1 from the NPM tool (app/src/pages/dockReports/list.tsx).
import { useTable } from "@rbp/core";
import { List } from "@rbp/core";
import { useNavigate } from "react-router-dom";
import { Tag, Tooltip } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useListRowProps, rowLabel, useListKeyNav, attachmentsColumn, notesColumn } from "@rbp/module-messaging/src/notes/tableFilter.tsx";
import { formatDate, formatDateTime } from "@rbp/ui";
import { ENTITY_CONFIG } from "@rbp/module-dock-reports/src/entityTypes.ts";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-dock-reports/src/fieldLabels.ts";
import { useNotesPanel, useListNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { usePageBannerSubtitle } from "@rbp/core";
import { listCountSubtitle } from "@rbp/core";
import { ListTable, ListColumn } from "@rbp/ui";
import { DOCK_REPORT_STATUS_OPTIONS, DOCK_REPORT_STATUS_COLOR } from "./statusOptions";
import { CreateDockReportButton } from "./createDockReportButton";

const L = (field: keyof typeof FIELD_LABELS.dock_reports) => fieldLabel("dock_reports", field);

type DockReportOverviewRow = {
  id: string;
  report_number: string | null;
  status: "draft" | "submitted" | "finalized";
  indocking_date: string | null;
  outdocking_date: string | null;
  locked_by_user_id: string | null;
  locked_by_user_name: string | null;
  locked_at: string | null;
  vessel_name: string | null;
  vessel_imo: string | null;
  hull_event_type_code: string | null;
  hull_event_type_text: string | null;
  specification_number: string | null;
  technical_service_rep_user_name: string | null;
  sales_account_user_name: string | null;
  created_at: string;
  has_attachments: boolean;
  has_messages: boolean;
};

const FILTER_DEFS: ListFilterDef[] = [
  { key: "vessel_name", label: "Vessel", kind: "text", fields: ["vessel_name", "vessel_imo"] },
  { key: "report_number", label: L("report_number"), kind: "text", fields: ["report_number"] },
  { key: "status", label: L("status"), kind: "select", field: "status", options: DOCK_REPORT_STATUS_OPTIONS },
  { key: "indocking_date", label: L("indocking_date"), kind: "dateRange", field: "indocking_date" },
];

// Reached both from here (a real sidebar nav entry, for overview/management -
// which report is locked and by whom, across every vessel) and from a
// button on the owning Hull Event's own page (~/npm_tool/docs/dock-report-module.md
// "Navigation") - the two are complementary, not redundant: this page is for
// finding/monitoring a report, the Hull Event button is for the common case
// of "I'm on this hull event, open/create its report".
export const DockReportList = () => {
  const navigate = useNavigate();
  const { openEntity } = useNotesPanel();
  useListNotes();
  const listRowProps = useListRowProps<DockReportOverviewRow>(navigate, ENTITY_CONFIG.dock_reports.listPath!, "dock_reports");
  const { tableProps, filters, setFilters } = useTable<DockReportOverviewRow>({
    resource: "dock_reports_overview",
    syncWithLocation: true,
    pagination: { pageSize: 100 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });
  useListKeyNav(tableProps.dataSource, "dock_reports");
  usePageBannerSubtitle(listCountSubtitle("dock reports", tableProps.pagination));
  const filterBar = useListFilterBar(FILTER_DEFS, filters, setFilters);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <>
          {filterBar.picker}
          <CreateDockReportButton />
        </>
      }
    >
      {filterBar.modal}
      <ListTable<DockReportOverviewRow>
        {...tableProps}
        rowKey="id"
        onRow={listRowProps}
      >
        <ListColumn<DockReportOverviewRow>
          minWidth={180}
          title={L("vessel_id")}
          key="vessel"
          sorter={{ multiple: 1 }}
          render={(_, r) => (
            <div>
              <strong>{r.vessel_name ?? "—"}</strong>
              {r.vessel_imo && <div style={{ fontSize: 12, color: "#888" }}>IMO {r.vessel_imo}</div>}
            </div>
          )}
        />
        <ListColumn<DockReportOverviewRow> minWidth={130} dataIndex="report_number" title={L("report_number")} sorter />
        <ListColumn<DockReportOverviewRow>
          minWidth={100}
          title="Type"
          dataIndex="hull_event_type_text"
        />
        <ListColumn<DockReportOverviewRow>
          minWidth={140}
          title={L("specification_id")}
          dataIndex="specification_number"
          render={(v: string | null) => v ?? "—"}
        />
        <ListColumn<DockReportOverviewRow>
          title={L("status")}
          dataIndex="status"
          sorter
          render={(v: DockReportOverviewRow["status"]) => <Tag color={DOCK_REPORT_STATUS_COLOR[v]}>{DOCK_REPORT_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v}</Tag>}
        />
        <ListColumn<DockReportOverviewRow> dataIndex="indocking_date" title={L("indocking_date")} sorter render={formatDate} />
        <ListColumn<DockReportOverviewRow> dataIndex="outdocking_date" title={L("outdocking_date")} sorter render={formatDate} />
        <ListColumn<DockReportOverviewRow> minWidth={150} dataIndex="technical_service_rep_user_name" title={L("technical_service_rep_user_id")} />
        <ListColumn<DockReportOverviewRow>
          minWidth={120}
          title="Locked"
          key="locked"
          render={(_, r) =>
            r.locked_by_user_id ? (
              <Tooltip title={r.locked_at ? `Since ${formatDateTime(r.locked_at)}` : undefined}>
                <Tag icon={<LockOutlined />} color="orange">
                  {r.locked_by_user_name ?? "someone"}
                </Tag>
              </Tooltip>
            ) : null
          }
        />
        {notesColumn<DockReportOverviewRow>((r) => openEntity({ type: "dock_reports", id: r.id, label: rowLabel("dock_reports", r) }))}
        {attachmentsColumn<DockReportOverviewRow>()}
        <ListColumn<DockReportOverviewRow> dataIndex="created_at" title="Created" sorter render={formatDate} />
      </ListTable>
    </List>
  );
};
