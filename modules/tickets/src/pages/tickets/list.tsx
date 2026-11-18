// Ported 1:1 from COMPASS (app/src/pages/tickets/list.tsx).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTable } from "@rbp/core";
import { Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { List, ListTable } from "@rbp/core";
import { PriorityTag, StatusTag, TicketTypeTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { ManageColumnsButton } from "@rbp/ui";
import { useColumnVisibility } from "@rbp/ui";
import { clickableRow } from "@rbp/ui";
import { formatDate } from "@rbp/ui";
import { PRIORITIES, TICKET_STATUSES, type TicketOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { localName, pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useTicketQueues } from "@rbp/module-task-family/src/hooks/useTicketQueues.ts";
import { useMe } from "@rbp/core";
import { FilterChip } from "@rbp/core";
import { MobileCardList } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { SortButton } from "@rbp/core";
import { TicketFormModal } from "./ticketForm";

const OPTIONAL_COLUMNS = ["queue", "type", "reporter", "assignee", "team", "created"] as const;
const DEFAULT_VISIBLE = ["queue", "type", "reporter", "created"];

export const TicketList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { userId } = useMe();
  const { queues, types } = useTicketQueues();
  const [creating, setCreating] = useState(false);
  const { tableProps, filters, setFilters, sorters, setSorters } = useTable<TicketOverviewRow>({
    resource: "tickets_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });
  const [visible, setVisible] = useColumnVisibility("compass.tickets.columns", [...OPTIONAL_COLUMNS], DEFAULT_VISIBLE);

  const filterDefs: ListFilterDef[] = [
    { kind: "text", key: "search", label: t("common.search"), fields: ["title", "asset_name", "reporter_display_name"] },
    { kind: "select", key: "status", label: t("fields.status"), field: "status", options: TICKET_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
    ...(queues.length > 1
      ? [{ kind: "select" as const, key: "queue", label: t("tickets.queue"), field: "queue_id", options: queues.map((q) => ({ value: q.id, label: localName(q) })) }]
      : []),
    // The same code can exist in several queues: one entry per code.
    { kind: "select", key: "type", label: t("fields.type"), field: "type", options: [...new Map(types.map((x) => [x.key, x])).values()].map((x) => ({ value: x.key, label: localName(x) })) },
    { kind: "select", key: "priority", label: t("fields.priority"), field: "priority", options: PRIORITIES.map((s) => ({ value: s, label: t(`priority.${s}`) })) },
    { kind: "dateRange", key: "created", label: t("fields.createdAt"), field: "created_at" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters, "search");
  const show = (key: (typeof OPTIONAL_COLUMNS)[number]) => visible.includes(key);
  const mine = filters.some((f) => "field" in f && f.field === "reporter_user_id" && f.operator === "in" && Array.isArray(f.value) && f.value[0] === userId);
  const toggleMine = (on: boolean) => setFilters([{ field: "reporter_user_id", operator: "in", value: on && userId ? [userId] : undefined }]);

  return (
    <List
      title={t("nav.tickets")}
      toolbar={filterBar.chips}
      headerButtons={
        <>
          {filterBar.search}
          {filterBar.picker}
          <FilterChip checked={mine} onChange={toggleMine} disabled={!userId}>{t("tickets.mine")}</FilterChip>
          {isMobile && (
            <SortButton
              options={[
                { key: "newest", label: t("common.sortOptions.newest"), field: "created_at", order: "desc" },
                { key: "oldest", label: t("common.sortOptions.oldest"), field: "created_at", order: "asc" },
                { key: "title", label: t("common.sortOptions.title"), field: "title", order: "asc" },
              ]}
              sorters={sorters}
              onChange={setSorters}
            />
          )}
          {!isMobile && (
            <ManageColumnsButton
              options={OPTIONAL_COLUMNS.map((key) => ({ key, label: t(`tickets.columns.${key}`) }))}
              visible={visible}
              onChange={setVisible}
            />
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t("tickets.new")}
          </Button>
        </>
      }
    >
      {isMobile ? (
        <MobileCardList<TicketOverviewRow>
          tableProps={tableProps}
          onOpen={(r) => navigate(`/tickets/${r.id}`)}
          render={(r) => ({
            title: <>#{r.ticket_number} {r.title}</>,
            subtitle: [queues.length > 1 ? pickName(r.queue_name, r.queue_name_de) : null, r.asset_name].filter(Boolean).join(" · ") || null,
            tags: (
              <>
                <StatusTag status={r.status} />
                <PriorityTag priority={r.priority} />
                <TicketTypeTag type={r.type} name={r.type_name} nameDe={r.type_name_de} />
              </>
            ),
            footer: [r.reporter_display_name, formatDate(r.created_at)].filter(Boolean).join(" · "),
          })}
        />
      ) : (
        <ListTable<TicketOverviewRow> {...tableProps} rowKey="id" onRow={clickableRow(navigate, "/tickets")} scroll={{ x: true }}>
          <ListTable.Column dataIndex="ticket_number" title="#" width={80} sorter render={(n) => `#${n}`} />
          <ListTable.Column dataIndex="title" title={t("fields.title")} sorter />
          <ListTable.Column dataIndex="asset_name" title={t("fields.asset")} render={(v) => v ?? "—"} />
          {show("queue") && queues.length > 1 && <ListTable.Column dataIndex="queue_name" title={t("tickets.queue")} render={(v, r: TicketOverviewRow) => pickName(v, r.queue_name_de)} />}
          {show("type") && <ListTable.Column dataIndex="type" title={t("fields.type")} render={(v, r: TicketOverviewRow) => <TicketTypeTag type={v} name={r.type_name} nameDe={r.type_name_de} />} />}
          <ListTable.Column dataIndex="priority" title={t("fields.priority")} sorter render={(v) => <PriorityTag priority={v} />} />
          <ListTable.Column dataIndex="status" title={t("fields.status")} sorter render={(v) => <StatusTag status={v} />} />
          {show("reporter") && <ListTable.Column dataIndex="reporter_display_name" title={t("fields.reporter")} render={(v) => v ?? "—"} />}
          {show("assignee") && <ListTable.Column dataIndex="assigned_user_name" title={t("fields.assignee")} render={(v) => v ?? "—"} />}
          {show("team") && <ListTable.Column dataIndex="assigned_team_name" title={t("fields.team")} render={(v) => v ?? "—"} />}
          {show("created") && <ListTable.Column dataIndex="created_at" title={t("fields.createdAt")} sorter render={formatDate} />}
        </ListTable>
      )}
      {filterBar.modal}
      <TicketFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/tickets/${id}`)} />
    </List>
  );
};
