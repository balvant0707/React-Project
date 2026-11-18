// Ported 1:1 from COMPASS (app/src/pages/initiatives/list.tsx).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTable } from "@rbp/core";
import { Button, Tag, theme as antdTheme } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { List, ListTable } from "@rbp/core";
import { DueDate, PriorityTag, StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { clickableRow } from "@rbp/ui";
import { formatDate } from "@rbp/ui";
import { TASK_STATUSES, type InitiativeOverviewRow, userLabel } from "../../lib/domain";
import { MobileCardList } from "@rbp/core";
import { FilterChip } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { SortButton } from "@rbp/core";
import { useUsers } from "@rbp/core";
import { useMe } from "@rbp/core";
import { TaskProgress } from "../../components/taskTree";
import { TaskFormModal } from "../tasks/taskForm";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { loadTeamLabels, searchTeams } from "../../components/teamSearchSelect";

// Initiatives are tasks with the switch is_initiative (root tasks with a tree of tasks below). The list reads the
// read model initiatives_overview; a row opens the ordinary task page, which shows the task tree.
export const InitiativeList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId } = useMe();
  const isMobile = useIsMobile();
  const { data: users } = useUsers();
  const [creating, setCreating] = useState(false);
  const { token } = antdTheme.useToken();
  const { tableProps, filters, setFilters, sorters, setSorters } = useTable<InitiativeOverviewRow>({
    resource: "initiatives_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "due_date", order: "asc" }] },
  });

  const filterDefs: ListFilterDef[] = [
    { kind: "text", key: "search", label: t("common.search"), fields: ["title"] },
    { kind: "select", key: "status", label: t("fields.status"), field: "status", options: TASK_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
    { kind: "select", key: "assignee", label: t("fields.assignee"), field: "assigned_user_id", options: (users ?? []).map((u) => ({ value: u.id, label: userLabel(u) })) },
    { kind: "select", key: "team", label: t("fields.team"), field: "team_id", loadOptions: searchTeams("filters"), loadLabels: loadTeamLabels, minChars: 0 },
    { kind: "dateRange", key: "due", label: t("fields.dueDate"), field: "due_date" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters, "search");

  const mine = filters.some((f) => "field" in f && f.field === "assigned_user_id" && f.operator === "in" && Array.isArray(f.value) && f.value[0] === userId);
  const toggleMine = (on: boolean) => setFilters([{ field: "assigned_user_id", operator: "in", value: on && userId ? [userId] : undefined }]);
  const openOnly = filters.some((f) => "field" in f && f.field === "status" && f.operator === "in" && Array.isArray(f.value) && !f.value.includes("done"));
  const toggleOpenOnly = (on: boolean) =>
    setFilters([{ field: "status", operator: "in", value: on ? TASK_STATUSES.filter((s) => s !== "done" && s !== "cancelled") : undefined }]);

  return (
    <List
      title={t("nav.initiatives")}
      toolbar={filterBar.chips}
      headerButtons={
        <>
          {filterBar.search}
          {filterBar.picker}
          <FilterChip checked={mine} onChange={toggleMine} disabled={!userId}>{t("tasks.mine")}</FilterChip>
          <FilterChip checked={openOnly} onChange={toggleOpenOnly}>{t("tasks.openOnly")}</FilterChip>
          {isMobile && (
            <SortButton
              options={[
                { key: "due", label: t("common.sortOptions.due"), field: "due_date", order: "asc" },
                { key: "newest", label: t("common.sortOptions.newest"), field: "task_number", order: "desc" },
                { key: "title", label: t("common.sortOptions.title"), field: "title", order: "asc" },
              ]}
              sorters={sorters}
              onChange={setSorters}
            />
          )}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t("initiatives.new")}
          </Button>
        </>
      }
    >
      {filterBar.modal}
      {isMobile ? (
        <MobileCardList<InitiativeOverviewRow>
          tableProps={tableProps}
          onOpen={(r) => navigate(`/tasks/${r.id}`)}
          render={(r) => {
            const done = r.status === "done" || r.status === "cancelled";
            return {
              accent: !done && (r.is_overdue || r.tasks_overdue > 0) ? token.colorError : undefined,
              title: <>#{r.task_number} {r.title}</>,
              subtitle: r.tasks_total ? <TaskProgress done={r.tasks_done} total={r.tasks_total} width={100} /> : undefined,
              tags: (
                <>
                  <StatusTag status={r.status} />
                  <DueDate date={r.due_date} done={done} />
                  {(r.priority === "high" || r.priority === "urgent") && <PriorityTag priority={r.priority} />}
                  {r.tasks_overdue > 0 && <Tag color="red" style={{ marginInlineEnd: 0 }}>{t("initiatives.overdueTasks", { count: r.tasks_overdue })}</Tag>}
                </>
              ),
              footer: r.assigned_user_name ?? r.team_name,
            };
          }}
        />
      ) : (
        <ListTable<InitiativeOverviewRow> {...tableProps} rowKey="id" onRow={clickableRow(navigate, "/tasks")} scroll={{ x: true }} locale={{ emptyText: t("initiatives.empty") }}>
          <ListTable.Column dataIndex="task_number" title="#" width={80} sorter render={(n) => `#${n}`} />
          <ListTable.Column dataIndex="title" title={t("fields.title")} sorter />
          <ListTable.Column dataIndex="status" title={t("fields.status")} sorter render={(v, r: InitiativeOverviewRow) => <><StatusTag status={v} /> {r.current_step_name && <span style={{ fontSize: 12, opacity: 0.65 }}>{pickName(r.current_step_name, r.current_step_name_de)}</span>}</>} />
          <ListTable.Column title={t("initiatives.progress")} width={230} render={(_, r: InitiativeOverviewRow) => (r.tasks_total ? <TaskProgress done={r.tasks_done} total={r.tasks_total} width={110} /> : "—")} />
          <ListTable.Column
            dataIndex="tasks_overdue"
            title={t("initiatives.tasks")}
            width={140}
            render={(v: number) => (v > 0 ? <Tag color="red">{t("initiatives.overdueTasks", { count: v })}</Tag> : null)}
          />
          <ListTable.Column dataIndex="priority" title={t("fields.priority")} sorter render={(v) => <PriorityTag priority={v} />} />
          <ListTable.Column dataIndex="assigned_user_name" title={t("fields.assignee")} render={(v) => v ?? "—"} />
          <ListTable.Column dataIndex="team_name" title={t("fields.team")} render={(v) => v ?? "—"} />
          <ListTable.Column
            dataIndex="due_date"
            title={t("fields.dueDate")}
            sorter
            render={(v, r: InitiativeOverviewRow) => (r.is_overdue ? <Tag color="red">{formatDate(v)}</Tag> : formatDate(v))}
          />
        </ListTable>
      )}
      <TaskFormModal open={creating} initiative onClose={() => setCreating(false)} onSaved={(id) => navigate(`/tasks/${id}`)} />
    </List>
  );
};
