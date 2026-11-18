// Task list (RADAR desktop list pattern: useTable on tasks_overview, ListTable, filter chips). After COMPASS
// app/src/pages/tasks/list.tsx: same view, columns and status/priority/due vocabulary; the phone cards, tabs, dashboard
// numbers, gantt and checklist/item columns of COMPASS are not part of the tasks port.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Space, Tag, Tooltip, Typography } from "antd";
import { LockOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { List, ResponsiveList, useGetIdentity, useListFilterBar, useTable, useTeams, useUsers, userLabel, usePageBannerSubtitle, type ListFilterDef } from "@rbp/core";
import { ListColumn, ListTable, formatDate } from "@rbp/ui";
import { FINAL_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type TaskOverviewRow } from "../../lib/domain";
import { pickName, sortByName } from "../../lib/masterData";
import { TaskFormModal, useTaskTypes } from "./taskForm";
import { AssigneeCell } from "../../components/taskTags";
import { DueDate, PriorityTag, StatusTag } from "../../components/tags";

const OPEN_STATUSES = TASK_STATUSES.filter((s) => !FINAL_TASK_STATUSES.includes(s));

export const TaskList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useGetIdentity<{ id: string }>();
  const { data: users } = useUsers();
  const { data: teams } = useTeams();
  const { data: types } = useTaskTypes(false);
  const [creating, setCreating] = useState(false);

  const { tableProps, filters, setFilters, sorters, setSorters } = useTable<TaskOverviewRow>({
    resource: "tasks_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "due_date", order: "asc" }] },
    filters: { initial: [{ field: "status", operator: "in", value: OPEN_STATUSES }] },
  });
  usePageBannerSubtitle(tableProps.pagination && typeof tableProps.pagination === "object" ? t("tasks.count", { count: tableProps.pagination.total ?? 0 }) : undefined);

  const userOptions = (users ?? []).map((u) => ({ value: u.id, label: userLabel(u) }));
  const filterDefs: ListFilterDef[] = [
    { key: "title", label: t("tasks.fields.title"), kind: "text", fields: ["title"] },
    { key: "status", label: t("tasks.fields.status"), kind: "select", field: "status", options: TASK_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
    { key: "person", label: t("tasks.filters.person"), kind: "select", field: "assigned_user_id", alsoFields: ["current_assignee_user_id", "created_by_user_id"], options: userOptions },
    { key: "assigned_user_id", label: t("tasks.fields.assignee"), kind: "select", field: "assigned_user_id", options: userOptions },
    { key: "team_id", label: t("tasks.fields.team"), kind: "select", field: "team_id", options: (teams ?? []).map((g) => ({ value: g.id, label: g.name })) },
    { key: "task_type_id", label: t("tasks.fields.type"), kind: "select", field: "task_type_id", options: sortByName(types).map((x) => ({ value: x.id, label: pickName(x.name, x.name_de) })) },
    { key: "priority", label: t("tasks.fields.priority"), kind: "select", field: "priority", options: PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })) },
    { key: "due_date", label: t("tasks.fields.dueDate"), kind: "dateRange", field: "due_date" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);
  // "Mine": the person chip with me (assignee, current step or creator), open tasks.
  const showMine = () =>
    me?.id &&
    setFilters([
      { field: "status", operator: "in", value: OPEN_STATUSES },
      { key: "person", operator: "or", value: ["assigned_user_id", "current_assignee_user_id", "created_by_user_id"].map((field) => ({ field, operator: "in", value: [me.id] })) },
    ] as never);

  return (
    <List
      toolbar={filterBar.chips}
      headerButtons={
        <Space wrap>
          <Button onClick={showMine}>{t("tasks.mine")}</Button>
          {filterBar.picker}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t("tasks.new")}
          </Button>
        </Space>
      }
    >
      {filterBar.modal}
      {/* Phone: cards (COMPASS's task cards: number, title, type and step, due date, status, priority, who has it). */}
      <ResponsiveList<TaskOverviewRow>
        tableProps={tableProps}
        sort={{ options: ["due_date", "priority", "task_number"].map((f) => ({ value: f, label: t(`tasks.sortBy.${f}`) })), sorters, setSorters }}
        onOpen={(r) => navigate(`/tasks/${r.id}`)}
        render={(r) => ({
          title: `#${r.task_number} ${r.title}`,
          subtitle: [pickName(r.task_type_name, r.task_type_name_de), !FINAL_TASK_STATUSES.includes(r.status) && r.current_step_name ? pickName(r.current_step_name, r.current_step_name_de) : null, r.due_date ? formatDate(r.due_date) : null]
            .filter(Boolean)
            .join(" · "),
          tags: (
            <>
              <StatusTag status={r.status} />
              <PriorityTag priority={r.priority} />
              {r.is_overdue && <Tag color="red">{t("tasks.overdue")}</Tag>}
            </>
          ),
          footer: <AssigneeCell task={r} />,
          accent: r.is_overdue ? "#cf1322" : undefined,
        })}
      >
        {() => (
      <ListTable<TaskOverviewRow> {...tableProps} rowKey="id" onRow={(r) => ({ onClick: () => navigate(`/tasks/${r.id}`), style: { cursor: "pointer" } })}>
        <ListColumn<TaskOverviewRow>
          minWidth={320}
          title={t("tasks.fields.title")}
          dataIndex="title"
          sorter
          render={(v: string, r) => (
            <div>
              <Space size={6}>
                <Typography.Text type="secondary">#{r.task_number}</Typography.Text>
                <span>{v}</span>
                {r.is_blocked && (
                  <Tooltip title={t("tasks.blocked", { count: r.blocking_subtask_count })}>
                    <LockOutlined />
                  </Tooltip>
                )}
              </Space>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {[pickName(r.task_type_name, r.task_type_name_de), r.parent_task_number ? `↳ #${r.parent_task_number} ${r.parent_title ?? ""}` : null].filter(Boolean).join(" | ")}
                </Typography.Text>
              </div>
            </div>
          )}
        />
        <ListColumn<TaskOverviewRow>
          minWidth={150}
          title={t("tasks.fields.status")}
          dataIndex="status"
          sorter
          render={(v: string, r) => (
            <div>
              <StatusTag status={v} />
              {r.current_step_name && !FINAL_TASK_STATUSES.includes(v) && (
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{pickName(r.current_step_name, r.current_step_name_de)}</Typography.Text>
                </div>
              )}
            </div>
          )}
        />
        <ListColumn<TaskOverviewRow> minWidth={180} title={t("tasks.fields.worksOn")} dataIndex="current_assignee_user_name" render={(_: unknown, r) => <AssigneeCell task={r} />} />
        <ListColumn<TaskOverviewRow>
          minWidth={120}
          title={t("tasks.fields.dueDate")}
          dataIndex="due_date"
          sorter
          render={(v: string | null, r) => <DueDate date={v} done={r.status === "done" || r.status === "cancelled"} />}
        />
        <ListColumn<TaskOverviewRow> minWidth={100} title={t("tasks.fields.priority")} dataIndex="priority" sorter render={(v: string) => <PriorityTag priority={v} />} />
        <ListColumn<TaskOverviewRow>
          minWidth={140}
          title={t("tasks.fields.record")}
          dataIndex="anchor_type"
          render={(v: string | null) => (v ? <Tag>{t(`tasks.recordTypes.${v}`, { defaultValue: v })}</Tag> : "—")}
        />
        <ListColumn<TaskOverviewRow> minWidth={140} title={t("tasks.fields.createdBy")} dataIndex="created_by_name" sorter render={(v: string | null) => v ?? "—"} />
      </ListTable>
        )}
      </ResponsiveList>
      <TaskFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/tasks/${id}`)} />
    </List>
  );
};
