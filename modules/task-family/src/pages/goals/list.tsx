// Ported 1:1 from COMPASS (app/src/pages/goals/list.tsx).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Progress, Space, Switch, Table, Tag, Typography } from "antd";
import { FlagOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { Page } from "@rbp/core";
import { GoalStatusTag } from "../../components/goalStatus";
import { TaskProgress } from "../../components/taskTree";
import { usePermissions } from "@rbp/core";
import { buildGoalTree, fetchGoals, formatValue, hasMeasure, isStale, percent, type GoalTreeNode } from "../../lib/goals";
import { GoalFormModal } from "./goalForm";

type InitiativeLeaf = { id: string; task_number: number; title: string; goal_id: string; status: string; tasks_total: number; tasks_done: number };
type Row = (Omit<GoalTreeNode, "children"> & { kind: "goal"; key: string; children?: Row[] }) | (InitiativeLeaf & { kind: "initiative"; key: string });

// The initiatives that point at a goal, with their task progress (tasks and the overview view are filtered by RLS).
const fetchInitiativeLeaves = async (): Promise<InitiativeLeaf[]> => {
  const { data: tasks } = await supabaseClient.from("tasks").select("id, task_number, title, goal_id, status").not("goal_id", "is", null).limit(1000);
  const rows = (tasks ?? []) as any[];
  if (!rows.length) return [];
  const { data: prog } = await supabaseClient.from("initiatives_overview").select("id, tasks_total, tasks_done").in("id", rows.map((r) => r.id));
  const byId = new Map((prog ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => ({ ...r, tasks_total: Number(byId.get(r.id)?.tasks_total ?? 0), tasks_done: Number(byId.get(r.id)?.tasks_done ?? 0) }));
};

export const GoalList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { has } = usePermissions();
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const { data: goals, isLoading, refetch } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
  const { data: leaves } = useQuery({ queryKey: ["goal-initiatives"], queryFn: fetchInitiativeLeaves });

  const rows = useMemo(() => {
    const byGoal = new Map<string, InitiativeLeaf[]>();
    for (const l of leaves ?? []) byGoal.set(l.goal_id, [...(byGoal.get(l.goal_id) ?? []), l]);
    const closed = (g: GoalTreeNode) => g.status === "achieved" || g.status === "dropped";
    const convert = (n: GoalTreeNode): Row => {
      const kids: Row[] = [
        ...n.children.filter((c) => showClosed || !closed(c)).map(convert),
        ...(byGoal.get(n.id) ?? []).map((l) => ({ ...l, kind: "initiative" as const, key: `i-${l.id}` })),
      ];
      return { ...n, kind: "goal", key: n.id, children: kids.length ? kids : undefined };
    };
    return buildGoalTree(goals ?? []).filter((g) => showClosed || !closed(g)).map(convert);
  }, [goals, leaves, showClosed]);

  return (
    <Page
      title={t("goals.title")}
      headerButtons={
        <Space>
          <Space size={6}>
            <Switch size="small" checked={showClosed} onChange={setShowClosed} />
            <Typography.Text type="secondary">{t("goals.showClosed")}</Typography.Text>
          </Space>
          {has("goals.create.all") && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              {t("goals.new")}
            </Button>
          )}
        </Space>
      }
    >
      <Table<Row>
        size="small"
        rowKey="key"
        loading={isLoading}
        dataSource={rows}
        pagination={false}
        expandable={{ defaultExpandAllRows: true }}
        locale={{ emptyText: t("goals.empty") }}
        scroll={{ x: "max-content" }}
        columns={[
          {
            title: t("goals.title"),
            render: (_: unknown, r) =>
              r.kind === "goal" ? (
                <Link to={`/goals/${r.id}`}>
                  #{r.goal_number} {r.title}
                </Link>
              ) : (
                <Link to={`/tasks/${r.id}`}>
                  <FlagOutlined /> #{r.task_number} {r.title}
                </Link>
              ),
          },
          { title: t("goals.owner"), render: (_: unknown, r) => (r.kind === "goal" ? r.owner_name ?? "—" : "") },
          { title: t("fields.status"), render: (_: unknown, r) => (r.kind === "goal" ? <GoalStatusTag status={r.status} /> : <Tag>{t("goals.initiative")}</Tag>) },
          {
            title: t("goals.measure"),
            render: (_: unknown, r) =>
              r.kind === "goal" && hasMeasure(r) ? (
                <span title={r.measure_label ?? undefined}>
                  {formatValue(r.current_value, r.measure_unit)} / {formatValue(r.target_value, r.measure_unit)}
                  {isStale(r) && <Tag color="orange" style={{ marginLeft: 8 }}>{t("goals.stale")}</Tag>}
                </span>
              ) : r.kind === "goal" ? (
                <Typography.Text type="secondary">{t("goals.noMeasureShort")}</Typography.Text>
              ) : null,
          },
          {
            title: t("goals.progress"),
            render: (_: unknown, r) =>
              r.kind === "goal" ? (
                r.progress != null ? (
                  <Space size={6}>
                    <Progress percent={percent(r.progress) ?? 0} size="small" style={{ width: 140, margin: 0 }} format={(p) => `${p}%`} strokeColor={r.progress_is_derived ? "#bfbfbf" : undefined} />
                    {r.progress_is_derived && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("goals.derived")}</Typography.Text>}
                  </Space>
                ) : (
                  "—"
                )
              ) : (
                <TaskProgress done={r.tasks_done} total={r.tasks_total} />
              ),
          },
        ]}
      />
      <GoalFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => {
          setCreating(false);
          void refetch();
          navigate(`/goals/${id}`);
        }}
      />
    </Page>
  );
};
