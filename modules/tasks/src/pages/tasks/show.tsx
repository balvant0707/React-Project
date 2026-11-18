// Task page (RADAR desktop pattern: Show, cards), logic after COMPASS app/src/pages/tasks/show.tsx (task_rights, step
// actions, forward, plan, reopen, cancel, subtasks). COMPASS's checklists, items, effort, goals, series and the like come
// with task-family.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { App as AntdApp, Button, Card, Col, theme, DatePicker, Descriptions, Dropdown, Empty, Form, Input, Modal, Row, Select, Space, Spin, Steps, Table, Timeline, Typography } from "antd";
import { MoreOutlined, PlusOutlined, StopOutlined, UndoOutlined, UserSwitchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Show, bottomBarStyle, errorText, supabaseClient, useHideBottomTabs, usePageBannerTitle, useRoles, useTeams, useUserMap, userLabel } from "@rbp/core";
import { formatDate, formatDateTime, useIsMobile } from "@rbp/ui";
import { FINAL_TASK_STATUSES, PRIORITIES, type StepAction, type TaskOverviewRow } from "../../lib/domain";
import { actionColor, actionLabel, stepAssigneeText } from "../../lib/routing";
import { pickName } from "../../lib/masterData";
import { anchorPath } from "../../lib/anchors";
import { useEntityNotes } from "@rbp/module-messaging/src/notes/notesPanelContext.tsx";
import { useTaskPageData } from "./useTaskPage";
import { TaskForwardModal } from "../../components/taskForwardModal";
import { AssigneeSelect, TeamSelect } from "../../components/assigneeFields";
import { AssigneeCell } from "../../components/taskTags";
import { DueDate, StatusTag } from "../../components/tags";
import { TaskFormModal } from "./taskForm";

export const TaskShow = () => {
  const { id = "" } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const userMap = useUserMap();
  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const [forwardOpen, setForwardOpen] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [pending, setPending] = useState<StepAction | null>(null);
  const [comment, setComment] = useState("");
  const { task, isLoading, steps, hiddenFields, rights, history, subtasks, anchorLabel } = useTaskPageData(id);
  usePageBannerTitle(task ? `#${task.task_number} ${task.title}` : undefined);
  // RADAR's notes panel beside the page (messaging; an app without the panel's opt-in pages shows nothing). COMPASS replaces this page.
  useEntityNotes("tasks", id || null);
  // Phone (COMPASS): the step's decisions sit in a bar at the bottom of the screen, which replaces the bottom tabs.
  const isMobile = useIsMobile();
  const { token } = theme.useToken();
  const phoneBar = isMobile && !!task && !FINAL_TASK_STATUSES.includes(task.status) && (!!rights?.act || !!rights?.forward);
  useHideBottomTabs(phoneBar);

  if (isLoading) return <Spin />;
  if (!task) return <Empty description={t("tasks.notFound")} />;

  const finished = FINAL_TASK_STATUSES.includes(task.status);
  const mayEdit = !!rights?.edit && !finished;
  const currentStep = steps?.find((s) => s.step_key === task.current_step_key);
  const currentIndex = Math.max(0, steps?.findIndex((s) => s.step_key === task.current_step_key) ?? 0);
  const canAct = !!rights?.act && !!currentStep;
  const canForward = !!rights?.forward && !!currentStep;
  // A step with a rule has its own "who acts now"; without one the task's assignee is the one.
  const routedStep = !!(task.current_assignee_user_id || task.current_assignee_team_id || task.current_assignee_role_id);
  const hides = (field: string) => !!hiddenFields?.includes(field);
  const recordLink = anchorPath(task.anchor_type, task.anchor_id);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task", id] }),
      queryClient.invalidateQueries({ queryKey: ["record-tasks"] }),
    ]);
  };

  const plan = async (patch: { team_id?: string | null; assigned_user_id?: string | null }) => {
    const next = { team_id: task.team_id, assigned_user_id: task.assigned_user_id, ...patch };
    // Changing the team clears a person who is not in it.
    const { error } = await supabaseClient.rpc("task_plan", {
      p_task_id: id,
      p_team_id: next.team_id,
      p_assigned_user_id: next.assigned_user_id,
      p_planned_date: task.planned_date,
      p_sort_order: null,
    });
    if (error) message.error(errorText(error, { known: { task_needs_team_or_person: "tasks.needsTeamOrPerson" } }));
    await refresh();
  };

  const updateField = async (patch: { priority?: string; due_date?: string | null; title?: string; description?: string | null }) => {
    const { error } = await supabaseClient.from("tasks").update(patch).eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  const perform = async (action: StepAction, actionComment: string | null) => {
    const { error } = await supabaseClient.rpc("task_perform_action", { p_task_id: id, p_action_key: action.key, p_comment: actionComment });
    if (error) {
      message.error(errorText(error));
      return false;
    }
    await refresh();
    return true;
  };

  const proceed = (action: StepAction) => {
    if (isMobile && !action.requires_comment) {
      modal.confirm({
        title: actionLabel(t, i18n.language, action),
        content: action.to === null ? t("tasks.confirmFinish") : t("tasks.confirmStep"),
        okText: actionLabel(t, i18n.language, action),
        onOk: () => perform(action, null),
      });
      return;
    }
    if (action.requires_comment) {
      setComment("");
      setPending(action);
      return;
    }
    void perform(action, null);
  };

  const startAction = (action: StepAction) => {
    const openSubtasks = (subtasks ?? []).filter((s) => !FINAL_TASK_STATUSES.includes(s.status)).length;
    // Finishing the task is allowed with open subtasks, but only after a confirmation.
    if (action.to === null && openSubtasks > 0) {
      modal.confirm({
        title: t("tasks.openSubtasksTitle"),
        content: t("tasks.openSubtasksHint", { count: openSubtasks }),
        okText: t("tasks.completeAnyway"),
        onOk: () => proceed(action),
      });
      return;
    }
    proceed(action);
  };

  // Somebody clicked "done" or "cancel" by mistake: back to the step the task was finished from (RPC task_reopen).
  const reopenTask = () => {
    let reopenComment = "";
    modal.confirm({
      title: t("tasks.reopenTitle"),
      content: (
        <>
          <Typography.Paragraph type="secondary">{t("tasks.reopenHint")}</Typography.Paragraph>
          <Input.TextArea rows={2} placeholder={t("tasks.reopenComment")} onChange={(e) => { reopenComment = e.target.value; }} />
        </>
      ),
      okText: t("tasks.reopen"),
      onOk: async () => {
        const { error } = await supabaseClient.rpc("task_reopen", { p_task_id: id, p_comment: reopenComment.trim() || null });
        if (error) message.error(errorText(error));
        await refresh();
      },
    });
  };

  const cancelTask = () =>
    modal.confirm({
      title: t("tasks.cancelTitle"),
      content: t("tasks.cancelHint"),
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error } = await supabaseClient.rpc("task_cancel", { p_task_id: id, p_comment: null });
        if (error) message.error(errorText(error));
        await refresh();
      },
    });

  const menuItems = [
    ...(mayEdit ? [{ key: "subtask", icon: <PlusOutlined />, label: t("tasks.newSubtask"), onClick: () => setAddingSubtask(true) }] : []),
    ...(rights?.reopen ? [{ key: "reopen", icon: <UndoOutlined />, label: t("tasks.reopen"), onClick: reopenTask }] : []),
    ...(mayEdit ? [{ key: "cancel", icon: <StopOutlined />, danger: true, label: t("tasks.cancel"), onClick: cancelTask }] : []),
  ];

  const actionButtons = canAct
    ? currentStep!.actions.map((a) => (
        <Button key={a.key} type={actionColor(a) === "green" ? "primary" : "default"} danger={actionColor(a) === "red"} onClick={() => startAction(a)} block={isMobile}>
          {actionLabel(t, i18n.language, a)}
        </Button>
      ))
    : [];
  const headerButtons = (
    <Space wrap>
      {!isMobile && actionButtons}
      {!isMobile && canForward && (
        <Button icon={<UserSwitchOutlined />} onClick={() => setForwardOpen(true)}>
          {t("tasks.forward.button")}
        </Button>
      )}
      {menuItems.length > 0 && (
        <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
          <Button icon={<MoreOutlined />} />
        </Dropdown>
      )}
    </Space>
  );

  return (
    <Show headerButtons={headerButtons} breadcrumb={false}>
      {phoneBar && (
        <div style={{ ...bottomBarStyle(token), display: "flex", gap: 8, padding: "8px 12px" }}>
          {actionButtons}
          {canForward && <Button icon={<UserSwitchOutlined />} onClick={() => setForwardOpen(true)} aria-label={t("tasks.forward.button")} />}
        </div>
      )}
      <Row gutter={[16, 16]} style={phoneBar ? { paddingBottom: 72 } : undefined}>
        <Col xs={24} xl={16}>
          <Card size="small" title={<Space><Typography.Text type="secondary">#{task.task_number}</Typography.Text><StatusTag status={task.status} /></Space>}>
            <Form layout="vertical">
              <Form.Item label={t("tasks.fields.title")} style={{ marginBottom: 12 }}>
                {mayEdit ? (
                  <Typography.Title level={4} style={{ margin: 0 }} editable={{ onChange: (v) => v.trim() && v.trim() !== task.title && void updateField({ title: v.trim() }) }}>
                    {task.title}
                  </Typography.Title>
                ) : (
                  <Typography.Title level={4} style={{ margin: 0 }}>{task.title}</Typography.Title>
                )}
              </Form.Item>
              <Form.Item label={t("tasks.fields.description")} style={{ marginBottom: 0 }}>
                {mayEdit ? (
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }} editable={{ onChange: (v) => v !== (task.description ?? "") && void updateField({ description: v.trim() || null }) }}>
                    {task.description ?? ""}
                  </Typography.Paragraph>
                ) : (
                  <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{task.description || "—"}</Typography.Paragraph>
                )}
              </Form.Item>
            </Form>
          </Card>

          {steps && steps.length > 1 && (
            <Card size="small" title={t("tasks.route")} style={{ marginTop: 16 }}>
              <Steps
                size="small"
                current={finished ? steps.length : currentIndex}
                status={task.status === "cancelled" ? "error" : undefined}
                items={steps.map((s) => ({ title: pickName(s.name, s.name_de), description: stepAssigneeText(t, s, roles, teams) }))}
              />
            </Card>
          )}

          <Card
            size="small"
            title={t("tasks.subtasks")}
            style={{ marginTop: 16 }}
            extra={mayEdit && <Button size="small" icon={<PlusOutlined />} onClick={() => setAddingSubtask(true)}>{t("tasks.newSubtask")}</Button>}
          >
            {(subtasks ?? []).length === 0 ? (
              <Typography.Text type="secondary">{t("tasks.noSubtasks")}</Typography.Text>
            ) : (
              <Table<TaskOverviewRow>
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={subtasks}
                onRow={(r) => ({ onClick: () => navigate(`/tasks/${r.id}`), style: { cursor: "pointer" } })}
                columns={[
                  { title: t("tasks.fields.title"), dataIndex: "title", render: (v: string, r) => <span>#{r.task_number} {v}</span> },
                  { title: t("tasks.fields.status"), dataIndex: "status", render: (v: string) => <StatusTag status={v} /> },
                  { title: t("tasks.fields.worksOn"), render: (_: unknown, r) => <AssigneeCell task={r} /> },
                  { title: t("tasks.fields.dueDate"), dataIndex: "due_date", render: (v: string | null, r) => <DueDate date={v} done={r.status === "done" || r.status === "cancelled"} /> },
                ]}
              />
            )}
          </Card>

          <Card size="small" title={t("tasks.history")} style={{ marginTop: 16 }}>
            <Timeline
              items={(history ?? []).map((h) => {
                const step = steps?.find((s) => s.step_key === h.step_key);
                const action = step?.actions.find((a) => a.key === h.action_key);
                return {
                  color: h.left_at ? "gray" : "blue",
                  children: (
                    <div>
                      <Typography.Text strong>{step ? pickName(step.name, step.name_de) : h.step_key}</Typography.Text>{" "}
                      <Typography.Text type="secondary">{formatDateTime(h.entered_at)}</Typography.Text>
                      {h.left_at && (
                        <div>
                          {h.action_key === "cancel" ? t("tasks.cancelled") : action ? actionLabel(t, i18n.language, action) : h.action_key}
                          {h.actor_user_id && ` · ${userLabel(userMap.get(h.actor_user_id))}`}
                          {` · ${formatDateTime(h.left_at)}`}
                          {h.comment && <div><Typography.Text type="secondary">{h.comment}</Typography.Text></div>}
                        </div>
                      )}
                    </div>
                  ),
                };
              })}
            />
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Card size="small">
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t("tasks.fields.type")}>{pickName(task.task_type_name, task.task_type_name_de)}</Descriptions.Item>
              {!finished && currentStep && (
                <Descriptions.Item label={t("tasks.fields.step")}>{pickName(task.current_step_name, task.current_step_name_de)}</Descriptions.Item>
              )}
              {!finished && <Descriptions.Item label={t("tasks.fields.worksOn")}><AssigneeCell task={task} /></Descriptions.Item>}
              {task.anchor_type && (
                <Descriptions.Item label={t("tasks.fields.record")}>
                  {anchorLabel ? (recordLink ? <Link to={recordLink}>{anchorLabel}</Link> : anchorLabel) : <Typography.Text type="secondary">{t("tasks.recordHidden")}</Typography.Text>}
                </Descriptions.Item>
              )}
              {task.parent_task_id && (
                <Descriptions.Item label={t("tasks.fields.parent")}>
                  <Link to={`/tasks/${task.parent_task_id}`}>#{task.parent_task_number} {task.parent_title}</Link>
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t("tasks.fields.createdBy")}>
                {task.created_by_name ?? "—"} · {formatDateTime(task.created_at)}
              </Descriptions.Item>
              {task.completed_at && <Descriptions.Item label={t("tasks.fields.completedAt")}>{formatDateTime(task.completed_at)}</Descriptions.Item>}
            </Descriptions>
            <Form layout="vertical" style={{ marginTop: 8 }}>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label={t("tasks.fields.priority")}>
                    <Select disabled={!mayEdit} value={task.priority} onChange={(v) => void updateField({ priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={t("tasks.fields.dueDate")} extra={task.original_due_date && task.original_due_date !== task.due_date ? t("tasks.originallyDue", { date: formatDate(task.original_due_date) }) : undefined}>
                    <DatePicker
                      disabled={!mayEdit}
                      style={{ width: "100%" }}
                      format="DD.MM.YYYY"
                      value={task.due_date ? dayjs(task.due_date) : null}
                      onChange={(d) => void updateField({ due_date: d ? d.format("YYYY-MM-DD") : null })}
                    />
                  </Form.Item>
                </Col>
              </Row>
              {(!hides("team") || task.team_id) && (
                <Form.Item label={t("tasks.fields.team")}>
                  <TeamSelect disabled={!mayEdit} value={task.team_id} onChange={(v) => void plan({ team_id: v, assigned_user_id: null })} />
                </Form.Item>
              )}
              <Form.Item label={t("tasks.fields.assignee")} style={{ marginBottom: 0 }} extra={task.is_overdue ? <Typography.Text type="danger">{t("tasks.overdue")}</Typography.Text> : undefined}>
                <AssigneeSelect disabled={!mayEdit} teamId={task.team_id} value={task.assigned_user_id} onChange={(v) => void plan({ assigned_user_id: v })} />
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <TaskForwardModal
        open={forwardOpen}
        task={task}
        mode={routedStep ? "step" : "assignee"}
        approval={!!rights?.decision}
        onClose={() => setForwardOpen(false)}
        onDone={() => {
          setForwardOpen(false);
          void refresh();
        }}
      />
      <TaskFormModal
        open={addingSubtask}
        parent={task}
        onClose={() => setAddingSubtask(false)}
        onSaved={(newId) => {
          setAddingSubtask(false);
          void refresh();
          navigate(`/tasks/${newId}`);
        }}
      />
      <Modal
        open={!!pending}
        title={pending ? actionLabel(t, i18n.language, pending) : ""}
        okButtonProps={{ disabled: !!pending?.requires_comment && !comment.trim() }}
        onCancel={() => setPending(null)}
        onOk={async () => {
          if (pending && (await perform(pending, comment.trim() || null))) setPending(null);
        }}
      >
        <Input.TextArea autoFocus rows={3} placeholder={t("tasks.actionComment")} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </Show>
  );
};
