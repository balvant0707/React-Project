// Ported 1:1 from COMPASS (app/src/components/initiativeBoard.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { App as AntdApp, Button, Dropdown, Empty, Input, Segmented, Space, Typography, theme as antdTheme } from "antd";
import { CalendarOutlined, MoreOutlined, PlusOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { FINAL_TASK_STATUSES, TASK_STATUSES, type InitiativeBucket, type TaskOverviewRow } from "../lib/domain";
import { PriorityTag, StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";

// Board of an initiative: the tasks below it (all levels) as cards in columns. Columns are the initiative's own
// buckets (phases / work packages, editable by whoever may edit the initiative) or, read-only, status or person.
// A card moves between buckets by drag and drop; that only sets tasks.bucket_id, never a routing or planning field.

type Grouping = "bucket" | "status" | "person";
const GROUP_STORAGE = "compass.initiativeBoard.group";
const NO_BUCKET = "none";
const NO_PERSON = "nobody";
const SUGGESTED_BUCKET_KEYS = ["planning", "execution", "acceptance"] as const;

type Column = { key: string; title: string; tasks: TaskOverviewRow[]; bucket?: InitiativeBucket };

const useBoardData = (rootId: string) => {
  const tasks = useQuery({
    queryKey: ["initiative-board", rootId, "tasks"],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("tasks_overview")
        .select("*")
        .eq("root_task_id", rootId)
        .neq("id", rootId)
        .order("task_number")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as TaskOverviewRow[];
    },
  });
  const buckets = useQuery({
    queryKey: ["initiative-board", rootId, "buckets"],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("initiative_buckets")
        .select("*")
        .eq("initiative_task_id", rootId)
        .order("position");
      if (error) throw error;
      return (data ?? []) as InitiativeBucket[];
    },
  });
  return { tasks, buckets };
};

const BoardCard = ({ task, rootId, draggable, overlay = false, moveMenu }: { task: TaskOverviewRow; rootId: string; draggable: boolean; overlay?: boolean; moveMenu?: React.ReactNode }) => {
  const { token } = antdTheme.useToken();
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task }, disabled: !draggable || overlay });
  const finished = FINAL_TASK_STATUSES.includes(task.status);
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(draggable && !overlay ? { ...listeners, ...attributes } : {})}
      onClick={() => !overlay && navigate(`/tasks/${task.id}`)}
      style={{
        opacity: isDragging && !overlay ? 0.35 : finished ? 0.6 : 1,
        background: token.colorBgContainer,
        border: `1px solid ${task.is_overdue ? token.colorError : token.colorBorderSecondary}`,
        borderRadius: token.borderRadius,
        padding: "8px 10px",
        marginBottom: 8,
        cursor: draggable ? "grab" : "pointer",
        boxShadow: overlay ? token.boxShadow : undefined,
        touchAction: draggable ? "none" : undefined,
        position: "relative",
      }}
    >
      {moveMenu && (
        <div style={{ position: "absolute", top: 0, right: 0 }} onClick={(e) => e.stopPropagation()}>
          {moveMenu}
        </div>
      )}
      <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
        #{task.task_number}
        {task.parent_task_id && task.parent_task_id !== rootId && task.parent_title ? ` · ↳ ${task.parent_title}` : ""}
      </div>
      <div style={{ fontWeight: 500, textDecoration: task.status === "cancelled" ? "line-through" : undefined }}>{task.title}</div>
      <Space size={4} wrap style={{ marginTop: 4 }}>
        <StatusTag status={task.status} />
        <PriorityTag priority={task.priority} />
      </Space>
      {(task.assigned_user_name ?? task.team_name) || task.due_date ? (
        <div style={{ marginTop: 4, fontSize: 12, color: token.colorTextSecondary, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{task.assigned_user_name ?? task.team_name}</span>
          {task.due_date && (
            <span style={{ color: task.is_overdue ? token.colorError : undefined, whiteSpace: "nowrap" }}>
              <CalendarOutlined /> {formatDate(task.due_date)}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
};

// Field + button that adds a bucket (column) to the board.
const NewBucketInput = ({ value, onChange, onAdd, style }: { value: string; onChange: (v: string) => void; onAdd: (name: string) => void; style?: React.CSSProperties }) => {
  const { t } = useTranslation();
  const add = () => {
    if (!value.trim()) return;
    onAdd(value);
    onChange("");
  };
  return (
    <Space.Compact style={{ width: "100%", ...style }}>
      <Input value={value} maxLength={80} placeholder={t("initiatives.board.newBucket")} onChange={(e) => onChange(e.target.value)} onPressEnter={add} />
      <Button icon={<PlusOutlined />} disabled={!value.trim()} onClick={add} />
    </Space.Compact>
  );
};

const BoardColumn = ({
  column,
  rootId,
  droppable,
  draggable,
  menu,
  fullWidth,
  moveMenu,
}: {
  column: Column;
  rootId: string;
  droppable: boolean;
  draggable: boolean;
  menu?: React.ReactNode;
  // Phone: the one chosen column across the screen; cards move through their menu.
  fullWidth?: boolean;
  moveMenu?: (task: TaskOverviewRow) => React.ReactNode;
}) => {
  const { token } = antdTheme.useToken();
  const { setNodeRef, isOver } = useDroppable({ id: column.key, disabled: !droppable });
  return (
    <div style={fullWidth ? { flex: "1 1 100%", minWidth: 0 } : { flex: "0 0 280px", width: 280 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 6px" }}>
        <Typography.Text strong ellipsis style={{ maxWidth: 220 }}>
          {column.title} <Typography.Text type="secondary">({column.tasks.length})</Typography.Text>
        </Typography.Text>
        {menu}
      </div>
      <div
        ref={setNodeRef}
        style={{
          minHeight: 120,
          padding: 8,
          borderRadius: token.borderRadius,
          background: isOver ? token.colorPrimaryBg : token.colorFillAlter,
          border: `1px solid ${isOver ? token.colorPrimary : token.colorBorderSecondary}`,
        }}
      >
        {column.tasks.map((task) => (
          <BoardCard key={task.id} task={task} rootId={rootId} draggable={draggable} moveMenu={moveMenu?.(task)} />
        ))}
      </div>
    </div>
  );
};

export const InitiativeBoard = ({ rootId, canEdit }: { rootId: string; canEdit: boolean }) => {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { tasks, buckets } = useBoardData(rootId);
  const isMobile = useIsMobile();
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [group, setGroup] = useState<Grouping>(() => {
    try {
      const stored = localStorage.getItem(GROUP_STORAGE);
      return stored === "status" || stored === "person" ? stored : "bucket";
    } catch {
      return "bucket";
    }
  });
  const [active, setActive] = useState<TaskOverviewRow | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<InitiativeBucket | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const bucketList = useMemo(() => buckets.data ?? [], [buckets.data]);
  const taskList = useMemo(() => tasks.data ?? [], [tasks.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["initiative-board", rootId] });
  const fail = (error: { message: string }) => {
    message.error(errorText(error));
    void refresh();
  };

  const changeGroup = (value: Grouping) => {
    setGroup(value);
    try {
      localStorage.setItem(GROUP_STORAGE, value);
    } catch {
      /* private mode: the choice just is not remembered */
    }
  };

  const columns = useMemo<Column[]>(() => {
    if (group === "bucket") {
      return [
        { key: NO_BUCKET, title: t("initiatives.board.noBucket"), tasks: taskList.filter((x) => !x.bucket_id) },
        ...bucketList.map((b) => ({ key: b.id, title: b.name, bucket: b, tasks: taskList.filter((x) => x.bucket_id === b.id) })),
      ];
    }
    if (group === "status") {
      return TASK_STATUSES.map((s) => ({ key: s, title: t(`status.${s}`), tasks: taskList.filter((x) => x.status === s) })).filter((c) => c.tasks.length > 0);
    }
    const names = new Map<string, string>();
    for (const x of taskList) {
      const label = x.assigned_user_name ?? x.team_name;
      if (label) names.set(label, label);
    }
    return [
      ...[...names.keys()].sort((a, b) => a.localeCompare(b)).map((n) => ({ key: n, title: n, tasks: taskList.filter((x) => (x.assigned_user_name ?? x.team_name) === n) })),
      { key: NO_PERSON, title: t("initiatives.board.nobody"), tasks: taskList.filter((x) => !x.assigned_user_name && !x.team_name) },
    ].filter((c) => c.tasks.length > 0);
  }, [group, taskList, bucketList, t]);

  const moveTask = async (task: TaskOverviewRow, columnKey: string) => {
    const bucketId = columnKey === NO_BUCKET ? null : columnKey;
    if (bucketId === task.bucket_id) return;
    queryClient.setQueryData<TaskOverviewRow[]>(["initiative-board", rootId, "tasks"], (old) => (old ?? []).map((x) => (x.id === task.id ? { ...x, bucket_id: bucketId } : x)));
    // An update RLS does not allow touches no row and raises no error, so ask for the row back.
    const { data, error } = await supabaseClient.from("tasks").update({ bucket_id: bucketId }).eq("id", task.id).select("id");
    if (error) return fail(error);
    if (!data?.length) return fail({ message: t("initiatives.board.notAllowed") });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const task = (e.active.data.current as { task: TaskOverviewRow } | undefined)?.task;
    if (task && e.over) void moveTask(task, String(e.over.id));
  };

  const addBucket = async (name: string) => {
    const position = bucketList.reduce((m, b) => Math.max(m, b.position), 0) + 1;
    const { error } = await supabaseClient.from("initiative_buckets").insert({ initiative_task_id: rootId, name: name.trim(), position });
    if (error) return fail(error);
    void refresh();
  };

  const addSuggested = async () => {
    const rows = SUGGESTED_BUCKET_KEYS.map((key, i) => ({ initiative_task_id: rootId, name: t(`initiatives.board.suggested.${key}`), position: i + 1 }));
    const { error } = await supabaseClient.from("initiative_buckets").insert(rows);
    if (error) return fail(error);
    void refresh();
  };

  const renameBucket = async () => {
    if (!renaming || !renameValue.trim()) return;
    const { error } = await supabaseClient.from("initiative_buckets").update({ name: renameValue.trim() }).eq("id", renaming.id);
    setRenaming(null);
    if (error) return fail(error);
    void refresh();
  };

  const shiftBucket = async (bucket: InitiativeBucket, by: -1 | 1) => {
    const i = bucketList.findIndex((b) => b.id === bucket.id);
    const other = bucketList[i + by];
    if (!other) return;
    const results = await Promise.all([
      supabaseClient.from("initiative_buckets").update({ position: other.position }).eq("id", bucket.id),
      supabaseClient.from("initiative_buckets").update({ position: bucket.position }).eq("id", other.id),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) return fail(failed.error);
    void refresh();
  };

  const deleteBucket = async (bucket: InitiativeBucket) => {
    const { error } = await supabaseClient.from("initiative_buckets").delete().eq("id", bucket.id);
    if (error) return fail(error);
    void refresh();
  };

  const bucketMenu = (bucket: InitiativeBucket) => {
    const i = bucketList.findIndex((b) => b.id === bucket.id);
    return (
      <Space size={0}>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "rename", label: t("initiatives.board.rename"), onClick: () => { setRenaming(bucket); setRenameValue(bucket.name); } },
              { key: "left", label: t("initiatives.board.moveLeft"), disabled: i <= 0, onClick: () => void shiftBucket(bucket, -1) },
              { key: "right", label: t("initiatives.board.moveRight"), disabled: i >= bucketList.length - 1, onClick: () => void shiftBucket(bucket, 1) },
              { type: "divider" },
              {
                key: "delete",
                danger: true,
                label: t("common.delete"),
                onClick: () =>
                  modal.confirm({
                    title: t("initiatives.board.deleteConfirm", { name: bucket.name }),
                    okText: t("common.delete"),
                    cancelText: t("common.cancel"),
                    okButtonProps: { danger: true },
                    onOk: () => deleteBucket(bucket),
                  }),
              },
            ],
          }}
        >
          <Button type="text" size="small" icon={<MoreOutlined />} />
        </Dropdown>
      </Space>
    );
  };

  const bucketMode = group === "bucket";
  const movable = bucketMode && canEdit;
  const shown = columns.find((c) => c.key === shownKey) ?? columns.find((c) => c.tasks.length > 0) ?? columns[0];
  const moveMenu = (task: TaskOverviewRow) => (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: columns.filter((c) => c.key !== (task.bucket_id ?? NO_BUCKET)).map((c) => ({ key: c.key, label: t("initiatives.board.moveTo", { name: c.title }), onClick: () => void moveTask(task, c.key) })),
      }}
    >
      <Button type="text" aria-label={t("initiatives.board.move")} icon={<MoreOutlined />} style={{ width: 40, height: 40 }} />
    </Dropdown>
  );
  return (
    <div style={{ marginTop: 16 }}>
      <Space style={{ marginBottom: 8 }} size={12} wrap>
        <Segmented<Grouping>
          value={group}
          onChange={changeGroup}
          options={[
            { value: "bucket", label: t("initiatives.board.byBucket") },
            { value: "status", label: t("initiatives.board.byStatus") },
            { value: "person", label: t("initiatives.board.byPerson") },
          ]}
        />
        <Link to={`/tasks?filters[0][field]=root_task_id&filters[0][operator]=eq&filters[0][value]=${rootId}&sorters[0][field]=due_date&sorters[0][order]=asc`}>
          <Button type="link" size="small" icon={<UnorderedListOutlined />}>
            {t("initiatives.board.openList")}
          </Button>
        </Link>
        <Link to={`/planning?initiative=${rootId}`}>
          <Button type="link" size="small" icon={<CalendarOutlined />}>
            {t("initiatives.board.openPlanning")}
          </Button>
        </Link>
        {bucketMode && canEdit && bucketList.length === 0 && (
          <Button size="small" onClick={() => void addSuggested()}>
            {t("initiatives.board.addSuggested")}
          </Button>
        )}
      </Space>
      {tasks.isSuccess && taskList.length === 0 ? (
        <Empty description={t("initiatives.board.empty")} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(e: DragStartEvent) => setActive((e.active.data.current as { task: TaskOverviewRow }).task)}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActive(null)}
        >
          {isMobile ? (
            <>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4 }}>
                {columns.map((c) => (
                  <Button key={c.key} size="small" type={c.key === shown?.key ? "primary" : "default"} onClick={() => setShownKey(c.key)} style={{ flex: "none" }}>
                    {c.title} ({c.tasks.length})
                  </Button>
                ))}
              </div>
              {shown && (
                <BoardColumn
                  key={shown.key}
                  column={shown}
                  rootId={rootId}
                  droppable={false}
                  draggable={false}
                  fullWidth
                  menu={movable && shown.bucket ? bucketMenu(shown.bucket) : undefined}
                  moveMenu={movable ? moveMenu : undefined}
                />
              )}
              {movable && <NewBucketInput value={newName} onChange={setNewName} onAdd={(name) => void addBucket(name)} style={{ marginTop: 8 }} />}
            </>
          ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", overflowX: "auto", paddingBottom: 8 }}>
            {columns.map((c) => (
              <BoardColumn key={c.key} column={c} rootId={rootId} droppable={bucketMode && canEdit} draggable={bucketMode && canEdit} menu={bucketMode && canEdit && c.bucket ? bucketMenu(c.bucket) : undefined} />
            ))}
            {bucketMode && canEdit && (
              <div style={{ flex: "0 0 240px" }}>
                <NewBucketInput value={newName} onChange={setNewName} onAdd={(name) => void addBucket(name)} />
              </div>
            )}
          </div>
          )}
          <DragOverlay>{active ? <BoardCard task={active} rootId={rootId} draggable={false} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
      {renaming && (
        <div style={{ marginTop: 8 }}>
          <Space.Compact style={{ maxWidth: 360, width: "100%" }}>
            <Input autoFocus value={renameValue} maxLength={80} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={() => void renameBucket()} />
            <Button type="primary" onClick={() => void renameBucket()}>{t("common.save")}</Button>
            <Button onClick={() => setRenaming(null)}>{t("common.cancel")}</Button>
          </Space.Compact>
        </div>
      )}
    </div>
  );
};
