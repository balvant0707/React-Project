// Ported 1:1 from COMPASS (app/src/components/taskTree.tsx).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Progress, Space, Table, Typography, theme as antdTheme } from "antd";
import { CaretDownOutlined, CaretRightOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { TaskTreeRow } from "../lib/domain";
import { DueDate, PriorityTag, StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { formatDate } from "@rbp/ui";
import { DateConflictTag } from "./dateConflicts";
import { useIsMobile } from "@rbp/ui";
import { useCanAddSubtask } from "./subtaskQuickLinks";

// The whole subtree of a task (RPC task_tree, depth first). The first row is the task itself.
export const useTaskTree = (rootId: string) =>
  useQuery({
    queryKey: ["task-tree", rootId],
    enabled: !!rootId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("task_tree", { p_root_id: rootId });
      if (error) throw error;
      return (data ?? []) as TaskTreeRow[];
    },
  });

export const TaskProgress = ({ done, total, width }: { done: number; total: number; width?: number }) => {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <Space size={8}>
      <Progress percent={Math.round((done / total) * 100)} size="small" style={{ width: width ?? 160, margin: 0 }} showInfo={false} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t("tasks.progressOf", { done, total })}
      </Typography.Text>
    </Space>
  );
};

type Props = {
  rows: TaskTreeRow[];
  // Adds a subtask below the given task; omitted when the user may not add (finished root).
  onAdd?: (parentId: string) => void;
  // The progress bar of the whole tree; off where the page already shows it above (tabbed pages).
  showProgress?: boolean;
};

type Node = TaskTreeRow & { children?: Node[] };

// The visible rows of a tree in display order with their depth (children of a folded row are left out).
const flatten = (nodes: Node[], collapsed: Set<string>, depth = 0): { node: Node; depth: number }[] =>
  nodes.flatMap((node) => [{ node, depth }, ...(node.children && !collapsed.has(node.id) ? flatten(node.children, collapsed, depth + 1) : [])]);

// The subtasks of a task as a table: the expand / collapse arrow sits in the first column beside the title.
export const TaskTree = ({ rows, onAdd, showProgress = true }: Props) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { token } = antdTheme.useToken();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const canAddBelow = useCanAddSubtask();
  const root = rows[0];

  const { data, withChildren } = useMemo(() => {
    const nodes = new Map<string, Node>();
    const top: Node[] = [];
    const parents: string[] = [];
    for (const row of rows.slice(1)) {
      const node: Node = { ...row };
      nodes.set(row.id, node);
      const parent = row.parent_task_id ? nodes.get(row.parent_task_id) : undefined;
      if (parent) {
        (parent.children ??= []).push(node);
        if (parent.children.length === 1) parents.push(parent.id);
      } else top.push(node);
    }
    return { data: top, withChildren: parents };
  }, [rows]);

  const expandedKeys = useMemo(() => withChildren.filter((id) => !collapsed.has(id)), [withChildren, collapsed]);

  if (!root) return null;
  const finishedRoot = root.status === "done" || root.status === "cancelled";
  // Nothing to show and nothing to add: no empty heading.
  if (data.length === 0 && (!onAdd || finishedRoot)) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <Space style={{ marginBottom: 8 }} size={12} wrap>
        <Typography.Text strong>
          {t("tasks.subtasks")}
          {root.descendants_total ? ` (${rows.length - 1})` : ""}
        </Typography.Text>
        {showProgress && <TaskProgress done={root.descendants_done} total={root.descendants_total} />}
        {onAdd && !finishedRoot && canAddBelow(root.task_type_id) && (
          <Button type={isMobile ? "default" : "link"} size="small" icon={<PlusOutlined />} onClick={() => onAdd(root.id)}>
            {t("tasks.addSubtask")}
          </Button>
        )}
        {withChildren.length > 0 && (
          <>
            <Button type="link" size="small" onClick={() => setCollapsed(new Set())}>{t("tasks.expandAll")}</Button>
            <Button type="link" size="small" onClick={() => setCollapsed(new Set(withChildren))}>{t("tasks.collapseAll")}</Button>
          </>
        )}
      </Space>
      {data.length > 0 && isMobile && (
        <div>
          {flatten(data, collapsed).map(({ node: row, depth }) => {
            const closed = row.status === "done" || row.status === "cancelled";
            const open = !collapsed.has(row.id);
            return (
              <div
                key={row.id}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  marginLeft: Math.min(depth, 4) * 14,
                  marginBottom: 6,
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderLeft: !closed && row.is_overdue ? `4px solid ${token.colorError}` : undefined,
                  borderRadius: token.borderRadiusLG,
                }}
              >
                {row.children?.length ? (
                  <Button type="text" aria-label={open ? t("tasks.collapseAll") : t("tasks.expandAll")} icon={open ? <CaretDownOutlined /> : <CaretRightOutlined />} style={{ width: 40, height: "auto", flex: "none" }} onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (open) next.add(row.id); else next.delete(row.id); return next; })} />
                ) : (
                  <span style={{ width: 12, flex: "none" }} />
                )}
                <Link to={`/tasks/${row.id}`} style={{ flex: 1, minWidth: 0, padding: "8px 8px 8px 0", color: "inherit" }}>
                  <div style={{ fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word", textDecoration: row.status === "cancelled" ? "line-through" : undefined }}>#{row.task_number} {row.title}</div>
                  <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 4 }}>
                    <StatusTag status={row.status} />
                    <DueDate date={row.due_date} done={closed} />
                    <DateConflictTag row={row} />
                    {row.descendants_total > 0 && <TaskProgress done={row.descendants_done} total={row.descendants_total} width={50} />}
                  </div>
                  {(row.assigned_user_name ?? row.team_name) && <div style={{ marginTop: 2, fontSize: 12, color: token.colorTextSecondary }}>{row.assigned_user_name ?? row.team_name}</div>}
                </Link>
                {onAdd && !closed && canAddBelow(row.task_type_id) && (
                  <Button type="text" aria-label={t("tasks.addSubtask")} icon={<PlusOutlined />} style={{ width: 44, height: "auto", flex: "none" }} onClick={() => onAdd(row.id)} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {data.length > 0 && !isMobile && (
        <Table<Node>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={data}
          scroll={{ x: "max-content" }}
          indentSize={20}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpand: (open, row) =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (open) next.delete(row.id);
                else next.add(row.id);
                return next;
              }),
          }}
        >
          <Table.Column<Node>
            title={t("fields.title")}
            dataIndex="title"
            render={(_, row) => (
              <Link to={`/tasks/${row.id}`} style={row.status === "cancelled" ? { textDecoration: "line-through" } : undefined}>
                #{row.task_number} {row.title}
              </Link>
            )}
          />
          <Table.Column<Node> title={t("fields.status")} dataIndex="status" render={(v) => <StatusTag status={v} />} />
          <Table.Column<Node> title={t("fields.priority")} dataIndex="priority" render={(v) => <PriorityTag priority={v} />} />
          <Table.Column<Node> responsive={["lg"]} title={t("fields.taskType")} dataIndex="task_type_name" render={(v, r) => pickName(v, r.task_type_name_de)} />
          <Table.Column<Node> title={t("fields.assignee")} render={(_, row) => row.assigned_user_name ?? row.team_name ?? "—"} />
          <Table.Column<Node> responsive={["lg"]} title={t("fields.plannedDate")} dataIndex="planned_date" render={(v) => (v ? formatDate(v) : "—")} />
          <Table.Column<Node>
            title={t("fields.dueDate")}
            dataIndex="due_date"
            render={(v, row) => (
              <>
                {v ? row.is_overdue ? <Typography.Text type="danger">{formatDate(v)}</Typography.Text> : formatDate(v) : "—"}
                <DateConflictTag row={row} />
              </>
            )}
          />
          <Table.Column<Node> title={t("tasks.progress")} render={(_, row) => (row.descendants_total > 0 ? <TaskProgress done={row.descendants_done} total={row.descendants_total} width={60} /> : null)} />
          {onAdd && (
            <Table.Column<Node>
              width={48}
              className="row-action"
              render={(_, row) =>
                row.status === "done" || row.status === "cancelled" || !canAddBelow(row.task_type_id) ? null : (
                  <Button type="text" size="small" icon={<PlusOutlined />} title={t("tasks.addSubtask")} onClick={() => onAdd(row.id)} />
                )
              }
            />
          )}
        </Table>
      )}
    </div>
  );
};
