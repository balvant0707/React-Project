// "Tasks" tab of a record (a specification, an order, a company, a hull event): the record's tasks and "New task" with
// the record as anchor. Plugged into the record pages through record slots (module.tsx); the record modules do not
// import this module. NEW (plan phase 6: tasks anchored to NPM records).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ConfigProvider, Space, Switch, Table, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient, usePermissions } from "@rbp/core";
import { FINAL_TASK_STATUSES, type TaskOverviewRow } from "../lib/domain";
import { pickName } from "../lib/masterData";
import { AssigneeCell } from "./taskTags";
import { DueDate, PriorityTag, StatusTag } from "./tags";
import { TaskFormModal } from "../pages/tasks/taskForm";

export const RecordTasks = ({ entityType, entityId }: { entityType: string; entityId: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasAny } = usePermissions();
  const canCreate = hasAny("tasks.create.");
  const [creating, setCreating] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["record-tasks", entityType, entityId],
    queryFn: async () =>
      ((await supabaseClient.from("tasks_overview").select("*").eq("anchor_type", entityType).eq("anchor_id", entityId).order("task_number", { ascending: false })).data ??
        []) as TaskOverviewRow[],
  });
  const { data: label } = useQuery({
    queryKey: ["record-label", entityType, entityId],
    queryFn: async () => ((await supabaseClient.rpc("task_anchor_label", { p_anchor_type: entityType, p_anchor_id: entityId })).data ?? null) as string | null,
  });
  const shown = (tasks ?? []).filter((x) => showFinished || !FINAL_TASK_STATUSES.includes(x.status));
  const finishedCount = (tasks ?? []).length - (tasks ?? []).filter((x) => !FINAL_TASK_STATUSES.includes(x.status)).length;

  // The record page may sit inside a disabled form (view mode); tasks have their own rights, so the tab is never disabled by it.
  return (
    <ConfigProvider componentDisabled={false}>
      <Space style={{ marginBottom: 12, width: "100%", justifyContent: "space-between" }} wrap>
        <Space>
          <Switch size="small" checked={showFinished} onChange={setShowFinished} />
          <Typography.Text>{t("tasks.showFinished", { count: finishedCount })}</Typography.Text>
        </Space>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            {t("tasks.new")}
          </Button>
        )}
      </Space>
      <Table<TaskOverviewRow>
        size="small"
        rowKey="id"
        loading={isLoading}
        pagination={false}
        dataSource={shown}
        locale={{ emptyText: t("tasks.noneForRecord") }}
        onRow={(r) => ({ onClick: () => navigate(`/tasks/${r.id}`), style: { cursor: "pointer" } })}
        columns={[
          {
            title: t("tasks.fields.title"),
            dataIndex: "title",
            render: (v: string, r) => (
              <div>
                <span>#{r.task_number} {v}</span>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{pickName(r.task_type_name, r.task_type_name_de)}</Typography.Text>
                </div>
              </div>
            ),
          },
          { title: t("tasks.fields.status"), dataIndex: "status", render: (v: string) => <StatusTag status={v} /> },
          { title: t("tasks.fields.worksOn"), render: (_: unknown, r) => <AssigneeCell task={r} /> },
          {
            title: t("tasks.fields.dueDate"),
            dataIndex: "due_date",
            render: (v: string | null, r) => <DueDate date={v} done={r.status === "done" || r.status === "cancelled"} />,
          },
          { title: t("tasks.fields.priority"), dataIndex: "priority", render: (v: string) => <PriorityTag priority={v} /> },
        ]}
      />
      <TaskFormModal
        open={creating}
        anchor={{ type: entityType, id: entityId, label }}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          void queryClient.invalidateQueries({ queryKey: ["record-tasks", entityType, entityId] });
        }}
      />
    </ConfigProvider>
  );
};

// Slot components: each record page passes its own id prop.
export const SpecificationTasks = ({ entityId }: { entityId: string }) => <RecordTasks entityType="specifications" entityId={entityId} />;
export const OrderTasks = ({ entityId }: { entityId: string }) => <RecordTasks entityType="orders" entityId={entityId} />;
export const CompanyTasks = ({ entityId }: { entityId: string }) => <RecordTasks entityType="companies" entityId={entityId} />;
export const HullEventTasks = ({ hullEventId }: { hullEventId: string }) => {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: 24 }}>
      <Typography.Title level={5}>{t("nav.tasks")}</Typography.Title>
      <RecordTasks entityType="hull_events" entityId={hullEventId} />
    </div>
  );
};
