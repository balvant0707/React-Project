// Ported 1:1 from COMPASS (app/src/pages/tasks/list.tsx).
import { useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { useTable } from "@rbp/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { Button, Space, Tabs, Tooltip, Typography, theme as antdTheme } from "antd";
import { IconAlertTriangle, IconLock, IconPackage } from "@tabler/icons-react";
import { PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../../lib/modules";
import { FloatingAddButton, List, ListTable } from "@rbp/core";
import { DueDate, Pill, PriorityTag, StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { TaskTypeIcon, TeamDot, TeamPersonBadge } from "../../components/masterLooks";
import { BLOCKED_COLOR } from "@rbp/ui";
import { useListFilterBar, type ListFilterDef } from "@rbp/core";
import { ManageColumnsButton } from "@rbp/ui";
import { useColumnVisibility } from "@rbp/ui";
import { clickableRow } from "@rbp/ui";
import { formatDate } from "@rbp/ui";
import { PRIORITIES, TASK_STATUSES, type TaskOverviewRow, userLabel } from "../../lib/domain";
import { ChecklistTag } from "../../components/checklist/checklistTag";
import { MobileCardList } from "@rbp/core";
import { FilterChips } from "../../components/filterChips";
import type { SortOption } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { useUserMap, useUsers } from "@rbp/core";
import { FilterSheet } from "@rbp/core";
import { PersonAvatar } from "@rbp/core";
import { useMe } from "@rbp/core";
import { TaskFormModal, useTaskTypes } from "./taskForm";
import { localName, pickName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { DashboardNumbers } from "../dashboard/widgets";
import { ClaimTaskButton } from "../../components/claimTaskButton";
import { useTaskRightsFor } from "@rbp/module-tasks/src/hooks/useTaskRights.ts";
import { loadTeamLabels, searchTeams } from "../../components/teamSearchSelect";
import { useTaskRowActions } from "../../components/taskRowActions";

// The tabs above the list are presets of the filters below (nothing of their own): the filters stay editable, and the tab
// is derived from them. "Today" = due today, "Important" = high or urgent, "Later" = planned for a later day.
const VIEWS = ["all", "open", "today", "important", "later", "done"] as const;
type View = (typeof VIEWS)[number];
const OPEN_STATUSES = TASK_STATUSES.filter((s) => s !== "done" && s !== "cancelled");

// The filter bar key of each field a tab sets (see `setByTab`).
const FILTER_KEY: Record<string, string> = { status: "status", priority: "priority", due_date: "due", planned_date: "planned" };

const OPTIONAL_COLUMNS = ["type", "step", "team", "created"] as const;
const DEFAULT_VISIBLE = ["step", "team"];

export const TaskList = () => {
  const hasAssets = useHasModule("assets");
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { userId, teamIds } = useMe();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data: users } = useUsers();
  const userMap = useUserMap();
  const { data: types } = useTaskTypes(false);
  const [creating, setCreating] = useState(false);
  // Filter "Initiative" (root_task_id): all tasks below one initiative, e.g. linked from the initiative page.
  const { data: initiatives } = useQuery({
    queryKey: ["task-list-initiatives"],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("initiatives_overview")
        .select("id, task_number, title")
        .order("task_number", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; task_number: number; title: string }[];
    },
  });
  // Initiatives (always roots) have their own page /initiatives; their tasks and subtasks stay in this list.
  const { tableProps, filters, setFilters, sorters, setSorters, tableQuery, setCurrentPage } = useTable<TaskOverviewRow>({
    resource: "tasks_overview",
    // Done and cancelled tasks stay out unless asked for (tab "All" or "Done", or a link that brings its own filters).
    filters: { permanent: [{ field: "is_initiative", operator: "eq", value: false }], initial: [{ field: "status", operator: "in", value: OPEN_STATUSES }] },
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });
  const { token } = antdTheme.useToken();
  // After an action the list starts again at its first page (the phone list keeps the pages it has loaded).
  // What I may do with the rows on screen (task_rights), for "I take it", "Tomorrow" and "Forward".
  const rights = useTaskRightsFor((tableProps.dataSource ?? []).map((r) => r.id));
  const reload = () => {
    setCurrentPage(1);
    void tableQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ["task", "rights"] });
  };
  const rowActions = useTaskRowActions(reload, rights);
  const [visible, setVisible] = useColumnVisibility("compass.tasks.columns", [...OPTIONAL_COLUMNS], DEFAULT_VISIBLE);

  const filterDefs: ListFilterDef[] = [
    { kind: "text", key: "search", label: t("common.search"), fields: ["title", "asset_name"] },
    { kind: "select", key: "status", label: t("fields.status"), field: "status", options: TASK_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })) },
    { kind: "select", key: "priority", label: t("fields.priority"), field: "priority", options: PRIORITIES.map((s) => ({ value: s, label: t(`priority.${s}`) })) },
    { kind: "select", key: "task_type", label: t("fields.taskType"), field: "task_type_id", options: sortByName(types).map((x) => ({ value: x.id, label: localName(x) })) },
    { kind: "select", key: "initiative", label: t("fields.initiative"), field: "root_task_id", multiple: false, options: (initiatives ?? []).map((i) => ({ value: i.id, label: `#${i.task_number} ${i.title}` })) },
    { kind: "select", key: "assignee", label: t("fields.assignee"), field: "assigned_user_id", options: (users ?? []).map((u) => ({ value: u.id, label: userLabel(u) })) },
    { kind: "select", key: "team", label: t("fields.team"), field: "team_id", loadOptions: searchTeams("filters"), loadLabels: loadTeamLabels, minChars: 0 },
    { kind: "dateRange", key: "planned", label: t("fields.plannedDate"), field: "planned_date" },
    { kind: "dateRange", key: "due", label: t("fields.dueDate"), field: "due_date" },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters, "search");
  // Phone: the cards have no column headers to click, so the main orders sit behind a button.
  const sortOptions: SortOption[] = [
    { key: "newest", label: t("common.sortOptions.newest"), field: "created_at", order: "desc" },
    { key: "due", label: t("common.sortOptions.due"), field: "due_date", order: "asc" },
    { key: "planned", label: t("common.sortOptions.planned"), field: "planned_date", order: "asc" },
    { key: "changed", label: t("common.sortOptions.changed"), field: "updated_at", order: "desc" },
    { key: "title", label: t("common.sortOptions.title"), field: "title", order: "asc" },
  ];
  const show = (key: (typeof OPTIONAL_COLUMNS)[number]) => visible.includes(key);

  const today = dayjs().format("YYYY-MM-DD");
  const has = (field: string, operator?: string) => filters.some((f) => "field" in f && f.field === field && (!operator || f.operator === operator) && f.value !== undefined && !(Array.isArray(f.value) && f.value.length === 0));
  const statusValue = filters.find((f) => "field" in f && f.field === "status" && f.operator === "in");
  const view: View | undefined = (() => {
    const onlyDone = Array.isArray(statusValue?.value) && statusValue.value.length === 1 && statusValue.value[0] === "done";
    const openStatus = Array.isArray(statusValue?.value) && statusValue.value.length > 0 && !statusValue.value.includes("done");
    if (onlyDone) return "done";
    if (!has("status") && !has("due_date") && !has("priority") && !has("planned_date")) return "all";
    if (!openStatus) return undefined;
    const others = ["due_date", "priority", "planned_date"].filter((f) => has(f));
    if (others.length === 0) return "open";
    if (others.length > 1) return undefined;
    if (others[0] === "due_date") return has("due_date", "gte") && has("due_date", "lte") ? "today" : undefined;
    if (others[0] === "priority") return "important";
    return "later";
  })();
  // The filters a tab sets.
  const presetFor = (next: View): { field: string; operator: string; value: unknown }[] => {
    const open = { field: "status", operator: "in", value: OPEN_STATUSES };
    return {
      all: [{ field: "status", operator: "in", value: undefined }],
      open: [open],
      today: [open, { field: "due_date", operator: "gte", value: today }, { field: "due_date", operator: "lte", value: today }],
      important: [open, { field: "priority", operator: "in", value: ["high", "urgent"] }],
      later: [open, { field: "planned_date", operator: "gte", value: dayjs().add(1, "day").format("YYYY-MM-DD") }],
      done: [{ field: "status", operator: "in", value: ["done"] }],
    }[next];
  };
  // Filter columns whose value is exactly what the active tab sets: the tab shows them already, so they light no dot on
  // "Filter". A value of one's own (priority "low" counts as the tab "Important" too) still does.
  const setByTab = (() => {
    if (!view) return [];
    const preset = presetFor(view).filter((p) => p.value !== undefined);
    const current = filters.filter((f): f is typeof f & { field: string; operator: string } => "field" in f && f.value !== undefined && !(Array.isArray(f.value) && f.value.length === 0));
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    return Object.keys(FILTER_KEY)
      .filter((field) => {
        const mine = current.filter((f) => f.field === field);
        const tab = preset.filter((p) => p.field === field);
        return tab.length > 0 && mine.length === tab.length && tab.every((p) => mine.some((f) => f.operator === p.operator && same(f.value, p.value)));
      })
      .map((field) => FILTER_KEY[field]);
  })();
  const setView = (next: View) => {
    const clear = [
      { field: "priority", operator: "in", value: undefined },
      ...["due_date", "planned_date"].flatMap((field) => ["gte", "lte"].map((operator) => ({ field, operator, value: undefined }))),
    ];
    const preset = presetFor(next);
    // Refine keeps the first filter of a field+operator pair, so a cleared entry must not precede the preset's own.
    const kept = clear.filter((c) => !preset.some((p) => p.field === c.field && p.operator === c.operator));
    setFilters([...kept, ...preset] as typeof filters);
  };

  const mine = filters.some((f) => "field" in f && f.field === "assigned_user_id" && f.operator === "in" && Array.isArray(f.value) && f.value[0] === userId);
  const toggleMine = (on: boolean) =>
    setFilters([{ field: "assigned_user_id", operator: "in", value: on && userId ? [userId] : undefined }]);
  // Pool of my teams: tasks of my teams that have no person yet ("I take it" shows on these rows).
  const pool = filters.some((f) => "field" in f && f.field === "assigned_user_id" && f.operator === "null");
  const togglePool = (on: boolean) =>
    setFilters([
      { field: "assigned_user_id", operator: "null", value: on ? true : undefined },
      { field: "team_id", operator: "in", value: on && teamIds.length ? teamIds : undefined },
      { field: "status", operator: "in", value: on ? TASK_STATUSES.filter((s) => s !== "done" && s !== "cancelled") : undefined },
    ]);
  const overdueOnly = filters.some((f) => "field" in f && f.field === "is_overdue" && String(f.value) === "true");
  const toggleOverdue = (on: boolean) => setFilters([{ field: "is_overdue", operator: "eq", value: on ? true : undefined }]);
  const blockedOnly = filters.some((f) => "field" in f && f.field === "is_blocked" && String(f.value) === "true");
  const toggleBlocked = (on: boolean) => setFilters([{ field: "is_blocked", operator: "eq", value: on ? true : undefined }]);
  const conflictOnly = filters.some((f) => "field" in f && f.field === "date_conflict");
  const toggleConflict = (on: boolean) => setFilters([{ field: "date_conflict", operator: "in", value: on ? ["later", "overdue"] : undefined }]);

  const quickFilters = [
    { key: "mine", label: t("tasks.mine"), checked: mine, onChange: toggleMine, disabled: !userId },
    ...(teamIds.length > 0 ? [{ key: "pool", label: t("tasks.claim.pool"), checked: pool, onChange: togglePool }] : []),
    { key: "overdue", label: t("tasks.overdue"), checked: overdueOnly, onChange: toggleOverdue },
    { key: "blocked", label: t("blocked.chip"), checked: blockedOnly, onChange: toggleBlocked },
    { key: "conflict", label: t("dateConflicts.chip"), checked: conflictOnly, onChange: toggleConflict },
  ];

  // Phone: search box and one "Filter" button (quick filters, sorting, the other filters) below the band.
  return (
    <List
      title={t("nav.tasks")}
      // Phone: the round + button at the bottom right (as on Messages), not a wide button in the band.
      action={
        isMobile ? undefined : (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t("tasks.new")}
          </Button>
        )
      }
      toolbar={
        isMobile ? (
          <>
            <div className="phone-search-row">
              {filterBar.search}
                            <FilterSheet quick={quickFilters} sort={{ options: sortOptions, sorters, onChange: setSorters }} fields={filterBar.fields} onEdit={filterBar.edit} ignore={setByTab} />
            </div>
            {filterBar.chips}
          </>
        ) : (
          filterBar.chips
        )
      }
      headerButtons={
        isMobile ? undefined : (
          <>
            {filterBar.search}
            {filterBar.picker}
            <FilterChips items={quickFilters} />
            <ManageColumnsButton options={OPTIONAL_COLUMNS.map((key) => ({ key, label: t(`tasks.columns.${key}`) }))} visible={visible} onChange={setVisible} />
          </>
        )
      }
    >
      {filterBar.modal}
      <DashboardNumbers />
      <Tabs
        activeKey={view ?? ""}
        onChange={(k) => setView(k as View)}
        items={VIEWS.map((key) => ({ key, label: t(`tasks.views.${key}`) }))}
        style={{ marginBottom: 4 }}
      />
      {isMobile ? (
        <MobileCardList<TaskOverviewRow>
          tableProps={tableProps}
          onOpen={(r) => navigate(`/tasks/${r.id}`)}
          render={(r) => {
            const done = r.status === "done" || r.status === "cancelled";
            const mark = (title: string, color: string, icon: ReactNode) => (
              <span key={title} title={title} style={{ display: "inline-flex", color, marginInlineEnd: 6 }}>{icon}</span>
            );
            return {
              accent: done ? undefined : r.is_overdue ? token.colorError : r.is_blocked || r.date_conflict ? token.colorWarning : undefined,
              corner: rowActions.menu(r),
              swipe: rowActions.swipeActions(r),
              title: (
                <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8 }}>
                  <TaskTypeIcon typeId={r.task_type_id} size={24} />
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>#{r.task_number} {r.title}</span>
                </span>
              ),
              subtitle: [r.asset_name, r.team_name].filter(Boolean).join(" · ") || undefined,
              tags: (
                <>
                  <StatusTag status={r.status} />
                  <DueDate date={r.due_date} done={done} />
                  {(r.priority === "high" || r.priority === "urgent") && <PriorityTag priority={r.priority} />}
                  <ChecklistTag row={r} />
                  {r.is_blocked && mark(t("blocked.tag"), token.colorWarning, <IconLock size={16} />)}
                  {r.date_conflict && mark(t("dateConflicts.tag"), token.colorWarning, <IconAlertTriangle size={16} />)}
                  {(r.items_waiting ?? 0) > 0 && mark(t("items.waiting", { count: r.items_waiting }), token.colorWarning, <IconPackage size={16} />)}
                  {/* Right end of the row: the assignee's photo, or "I take it" as a dashed circle. */}
                  <span style={{ marginLeft: "auto", display: "inline-flex" }} title={r.assigned_user_name ?? undefined}>
                    {rights[r.id]?.claim ? (
                      <ClaimTaskButton taskId={r.id} onClaimed={reload} round />
                    ) : r.assigned_user_id ? (
                      <PersonAvatar person={{ name: r.assigned_user_name ?? "", photo_url: userMap.get(r.assigned_user_id)?.photo_url ?? null }} size={32} />
                    ) : null}
                  </span>
                </>
              ),
            };
          }}
        />
      ) : (
        <ListTable<TaskOverviewRow> {...tableProps} rowKey="id" onRow={clickableRow(navigate, "/tasks")} scroll={{ x: true }}>
          <ListTable.Column
            dataIndex="title"
            title={t("fields.title")}
            sorter
            render={(v: string, r: TaskOverviewRow) => (
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TaskTypeIcon typeId={r.task_type_id} size={32} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>{v}</span>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>#{r.task_number} · {pickName(r.task_type_name, r.task_type_name_de)}</Typography.Text>
                </span>
              </span>
            )}
          />
          {hasAssets && <ListTable.Column dataIndex="asset_name" title={t("fields.asset")} render={(v) => v ?? "—"} />}
          {show("type") && <ListTable.Column dataIndex="task_type_name" title={t("fields.taskType")} render={(v, r: TaskOverviewRow) => pickName(v, r.task_type_name_de)} />}
          {show("step") && <ListTable.Column dataIndex="current_step_name" title={t("fields.step")} render={(v, r: TaskOverviewRow) => (v ? pickName(v, r.current_step_name_de) : "—")} />}
          <ListTable.Column
            dataIndex="status"
            title={t("fields.status")}
            sorter
            render={(v, r: TaskOverviewRow) => (
              <>
                <StatusTag status={v} />
                {r.is_blocked && <Pill color={BLOCKED_COLOR}>{t("blocked.tag")}</Pill>}
                {(r.items_waiting ?? 0) > 0 && <Pill color="amber">{t("items.waiting", { count: r.items_waiting })}</Pill>}
              </>
            )}
          />
          <ListTable.Column dataIndex="priority" title={t("fields.priority")} sorter render={(v) => <PriorityTag priority={v} />} />
          <ListTable.Column title={t("checklists.title")} width={110} render={(_, r: TaskOverviewRow) => <ChecklistTag row={r} />} />
          <ListTable.Column
            dataIndex="assigned_user_name"
            title={t("fields.assignee")}
            render={(v, r: TaskOverviewRow) =>
              rights[r.id]?.claim ? (
                <Space size={8}>
                  <TeamPersonBadge teamId={r.team_id} personName={null} />
                  <ClaimTaskButton taskId={r.id} onClaimed={reload} />
                </Space>
              ) : (
                <TeamPersonBadge teamId={r.team_id} personName={v} teamName={show("team") ? null : r.team_name} />
              )
            }
          />
          {show("team") && (
            <ListTable.Column
              dataIndex="team_name"
              title={t("fields.team")}
              render={(v, r: TaskOverviewRow) => (v ? <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><TeamDot teamId={r.team_id} />{v}</span> : "—")}
            />
          )}
          <ListTable.Column dataIndex="planned_date" title={t("fields.plannedDate")} sorter render={formatDate} />
          <ListTable.Column
            dataIndex="due_date"
            title={t("fields.dueDate")}
            sorter
            render={(v, r: TaskOverviewRow) => (
              <Space size={4}>
                <DueDate date={v} done={r.status === "done" || r.status === "cancelled"} />
                {r.date_conflict && (
                  <Tooltip title={t(`dateConflicts.list.${r.date_conflict}`, { parent: formatDate(r.parent_due_date) })}>
                    <WarningOutlined style={{ color: "#faad14" }} />
                  </Tooltip>
                )}
              </Space>
            )}
          />
          <ListTable.Column
            title=""
            width={190}
            render={(_, r: TaskOverviewRow) => (
              <Space size={4}>
                {rowActions.tomorrowButton(r)}
                {rowActions.menu(r)}
              </Space>
            )}
          />
          {show("created") && <ListTable.Column dataIndex="created_at" title={t("fields.createdAt")} sorter render={formatDate} />}
        </ListTable>
      )}
      {rowActions.dialogs}
      {isMobile && <FloatingAddButton label={t("tasks.new")} onClick={() => setCreating(true)} />}
      <TaskFormModal open={creating} onClose={() => setCreating(false)} onSaved={(id) => navigate(`/tasks/${id}`)} />
    </List>
  );
};
