// Ported 1:1 from COMPASS (app/src/pages/goals/show.tsx).
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { App as AntdApp, Button, Card, Dropdown, Empty, Popconfirm, Segmented, Space, Spin, Table, Typography } from "antd";
import { ApartmentOutlined, BarsOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { ActivityFeed } from "@rbp/module-messaging/src/feed/activityFeed.tsx";
import { RecordChatButton } from "@rbp/module-messaging/src/feed/recordChatButton.tsx";
import { useIsMobile } from "@rbp/ui";
import { FieldBar } from "../../components/fieldBar";
import { GoalMeasure } from "../../components/goalMeasure";
import { GoalStatusTag } from "../../components/goalStatus";
import { TaskProgress } from "../../components/taskTree";
import { EditableDescription } from "../../components/editableDescription";
import { usePermissions } from "@rbp/core";
import { GoalOrgChart } from "../../components/goalOrgChart";
import { buildGoalTree, fetchGoal, fetchGoals, percent, type GoalTreeNode } from "../../lib/goals";
import { formatDate } from "@rbp/ui";
import { GoalFormModal } from "./goalForm";
import { errorText } from "@rbp/core";
import { usePageTitle } from "@rbp/core";
import { usePageBannerTitle } from "@rbp/core";

// The list is what people expect first; the chart is opt-in and the choice is remembered.
const VIEW_KEY = "compass.goals.subGoalsView";
const storedView = (): "chart" | "list" => {
  try {
    return localStorage.getItem(VIEW_KEY) === "chart" ? "chart" : "list";
  } catch {
    return "list";
  }
};

// An empty children array would still show an expand icon on the leaves.
const withoutEmptyChildren = (n: GoalTreeNode): GoalTreeNode =>
  n.children.length ? { ...n, children: n.children.map(withoutEmptyChildren) } : ({ ...n, children: undefined } as unknown as GoalTreeNode);

const canDo = async (id: string, grant: string) =>
  (await supabaseClient.rpc("can_access_entity", { p_entity_type: "goals", p_entity_id: id, p_grant_type: grant })).data === true;

export const GoalShow = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const [editing, setEditing] = useState<{ measure: boolean } | null>(null);
  const [addingChild, setAddingChild] = useState(false);
  const [subView, setSubView] = useState<"chart" | "list">(storedView);

  const { data: goal, isLoading } = useQuery({ queryKey: ["goal", id], queryFn: () => fetchGoal(id) });
  const { data: all } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals });
  const { data: canEdit } = useQuery({ queryKey: ["goal-can", id, "edit"], queryFn: () => canDo(id, "edit") });
  const { data: canCheck } = useQuery({ queryKey: ["goal-can", id, "check"], queryFn: () => canDo(id, "check") });
  const { data: canDelete } = useQuery({ queryKey: ["goal-can", id, "delete"], queryFn: () => canDo(id, "delete") });
  const { data: initiatives } = useQuery({
    queryKey: ["goal-initiatives", id],
    queryFn: async () => {
      const { data: tasks } = await supabaseClient.from("tasks").select("id, task_number, title, status").eq("goal_id", id);
      const rows = (tasks ?? []) as any[];
      if (!rows.length) return [];
      const { data: prog } = await supabaseClient.from("initiatives_overview").select("id, tasks_total, tasks_done").in("id", rows.map((r) => r.id));
      const byId = new Map((prog ?? []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({ ...r, tasks_total: Number(byId.get(r.id)?.tasks_total ?? 0), tasks_done: Number(byId.get(r.id)?.tasks_done ?? 0) }));
    },
  });

  usePageTitle(goal ? `${goal.title} (#${goal.goal_number})` : undefined);
  // Platform: the page banner shows the record (as the tasks module's task page does).
  usePageBannerTitle(goal ? `#${goal.goal_number} ${goal.title}` : undefined);
  if (isLoading) return <Spin />;
  if (!goal) return <Empty description={t("common.notFound")} />;

  const parent = all?.find((g) => g.id === goal.parent_goal_id);
  // This goal with everything below it, at any depth.
  const subtree: GoalTreeNode | undefined = (() => {
    const find = (nodes: GoalTreeNode[]): GoalTreeNode | undefined => {
      for (const n of nodes) {
        if (n.id === goal.id) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
    };
    return find(buildGoalTree(all ?? []));
  })();
  const children = subtree?.children ?? [];
  const chooseSubView = (v: "chart" | "list") => {
    setSubView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* the choice just is not remembered */
    }
  };
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["goal", id] }),
      queryClient.invalidateQueries({ queryKey: ["goals"] }),
      queryClient.invalidateQueries({ queryKey: ["feed", "goals", id] }),
      queryClient.invalidateQueries({ queryKey: ["task-contribution"] }),
    ]);
  };
  const saveDescription = async (description: string | null) => {
    const { error } = await supabaseClient.from("goals").update({ description }).eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
  };
  const remove = async () => {
    const { error } = await supabaseClient.from("goals").delete().eq("id", id);
    if (error) return message.error(error.code === "23503" ? t("goals.deleteBlocked") : errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["goals"] });
    navigate(parent ? `/goals/${parent.id}` : "/goals");
  };

  const details = (
    <>
      <GoalMeasure goal={goal} canCheck={!!canCheck} canEdit={!!canEdit} onDefine={() => setEditing({ measure: true })} />

      <div style={{ marginTop: 12 }}>
        <FieldBar
          fields={[
            { label: t("goals.owner"), value: goal.owner_name },
            { label: t("fields.team"), value: goal.team_name, hidden: !goal.team_name },
            { label: t("goals.dueDate"), value: formatDate(goal.due_date), hidden: !goal.due_date },
            { label: t("fields.createdAt"), value: formatDate(goal.created_at) },
          ]}
        />
      </div>
      <EditableDescription value={goal.description} editable={!!canEdit} onSave={saveDescription} />

      {children.length > 0 && (
        <Card
          size="small"
          title={t("goals.subGoals")}
          style={{ marginTop: 16 }}
          extra={
            <Segmented
              size="small"
              value={subView}
              onChange={(v) => chooseSubView(v as "chart" | "list")}
              options={[
                { value: "list", icon: <BarsOutlined />, label: t("goals.viewList") },
                { value: "chart", icon: <ApartmentOutlined />, label: t("goals.viewChart") },
              ]}
            />
          }
        >
          {subView === "chart" && subtree ? (
            <GoalOrgChart roots={[subtree]} />
          ) : (
            <Table<GoalTreeNode>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={children.map(withoutEmptyChildren)}
              showHeader={false}
              expandable={{ defaultExpandAllRows: true }}
              columns={[
                { render: (_: unknown, g) => <Link to={`/goals/${g.id}`}>#{g.goal_number} {g.title}</Link> },
                { render: (_: unknown, g) => <GoalStatusTag status={g.status} /> },
                { align: "right" as const, render: (_: unknown, g) => (g.progress != null ? `${percent(g.progress)} %` : "—") },
              ]}
            />
          )}
        </Card>
      )}

      {(initiatives ?? []).length > 0 && (
        <Card size="small" title={t("goals.initiatives")} style={{ marginTop: 16 }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            showHeader={false}
            dataSource={initiatives}
            columns={[
              { render: (_: unknown, r: any) => <Link to={`/tasks/${r.id}`}>#{r.task_number} {r.title}</Link> },
              { render: (_: unknown, r: any) => <TaskProgress done={r.tasks_done} total={r.tasks_total} /> },
            ]}
          />
        </Card>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link to="/goals">{t("goals.title")}</Link>
        {parent && (
          <>
            {" / "}
            <Link to={`/goals/${parent.id}`}>#{parent.goal_number} {parent.title}</Link>
          </>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <Space align="center" size={12} wrap>
          <Typography.Title level={3} style={{ margin: 0 }}>#{goal.goal_number} {goal.title}</Typography.Title>
          <GoalStatusTag status={goal.status} />
          {isMobile && <RecordChatButton entityType="goals" entityId={goal.id} title={`#${goal.goal_number} ${goal.title}`} />}
        </Space>
        <Space>
          {canEdit && <Button icon={<EditOutlined />} onClick={() => setEditing({ measure: false })}>{t("common.edit")}</Button>}
          {has("goals.create.all") && <Button icon={<PlusOutlined />} onClick={() => setAddingChild(true)}>{t("goals.newSubGoal")}</Button>}
          {canDelete && (
            <Dropdown
              menu={{ items: [{ key: "delete", danger: true, icon: <DeleteOutlined />, label: <Popconfirm title={t("goals.deleteConfirm")} onConfirm={remove}>{t("common.delete")}</Popconfirm> }] }}
            >
              <Button icon={<MoreOutlined />} />
            </Dropdown>
          )}
        </Space>
      </div>

      {details}
      {/* Phone: the chat button opens the conversation in the Messages module. */}
      {!isMobile && (
        <div style={{ marginTop: 24 }}>
          <ActivityFeed entityType="goals" entityId={goal.id} />
        </div>
      )}

      <GoalFormModal
        open={!!editing}
        goal={goal}
        forceMeasure={editing?.measure}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
      />
      <GoalFormModal
        open={addingChild}
        parentId={goal.id}
        onClose={() => setAddingChild(false)}
        onSaved={(newId) => {
          setAddingChild(false);
          void refresh();
          navigate(`/goals/${newId}`);
        }}
      />
    </div>
  );
};
