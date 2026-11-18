// Ported 1:1 from COMPASS (app/src/pages/tasks/show.tsx).
import { useRef, useState } from "react";
import { useCanAccess as useCan} from "@rbp/core";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, App as AntdApp, Button, Card, DatePicker, Divider, Dropdown, Empty, Input, InputNumber, Segmented, Select, Space, Spin, Steps, Switch, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, FlagOutlined, MenuUnfoldOutlined, MessageOutlined, MoreOutlined, PlusOutlined, RetweetOutlined, StopOutlined, UndoOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../../lib/modules";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { PRIORITIES, FINAL_TASK_STATUSES, userLabel, type StepAction } from "../../lib/domain";
import { RecordChatButton } from "@rbp/module-messaging/src/feed/recordChatButton.tsx";
import { ChatResizeHandle, PanelChat, StickyPanelChat, useChatWidth } from "@rbp/module-messaging/src/feed/panelChat.tsx";
import { FieldBar } from "../../components/fieldBar";
import { AccessBadge } from "../../components/accessBadge";
import { PriorityTag, StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { AssigneeSelect, TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useMe } from "@rbp/core";
import { useTeams, useRoles, useUserMap } from "@rbp/core";
import { TaskForwardModal } from "@rbp/module-tasks/src/components/taskForwardModal.tsx";
import { RescheduleModal } from "../../components/rescheduleModal";
import { invalidateAfterReschedule, moveDueDate } from "../../lib/reschedule";
import { actionColor, actionLabel, isNegativeAction, stepAssigneeText } from "@rbp/module-tasks/src/lib/routing.ts";
import { fetchTaskChecklist, isAnswered } from "../../lib/checklists";
import { TaskRepeat } from "../recurring/taskRepeat";
import { formatDate, formatDateTime } from "@rbp/ui";
import { localName, pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { AssetSelect } from "../../components/assetSelect";
import { EditableDescription } from "../../components/editableDescription";
import { TaskChecklists } from "../../components/checklist/taskChecklists";
import { useIsMobile, useIsWide } from "@rbp/ui";
import { MobileSteps } from "../../components/mobileSteps";
import { ActionBar } from "../../components/actionBar";
import { TaskFormModal, useTaskTypes } from "./taskForm";
import { TaskProgress, TaskTree, useTaskTree } from "../../components/taskTree";
import { DateConflictPanel } from "../../components/dateConflicts";
import { BlockedPanel } from "../../components/blockedPanel";
import { purposeUi, usePurposeInvalidate } from "../../modules/purposes";
import { DECISIONS_KEY } from "../../hooks/useDecisions";
import { InitiativeBoard } from "../../components/initiativeBoard";
import { TaskGantt } from "../../components/taskGantt";
import { SubtaskQuickLinks, useCanAddSubtask } from "../../components/subtaskQuickLinks";
import { TaskCosts } from "../../components/taskCosts";
import { TaskItems } from "../../components/taskItems";
import { ItemUsageModal, useNeedsItemUsage } from "../../components/taskItemParts";
import type { ItemMode } from "../../lib/items";
import { usePermissions } from "@rbp/core";
import { GoalChain } from "../../components/goalChain";
import { GoalSelect } from "../../components/goalSelect";
import { PunctualityPanel, SeriesHistory } from "../../components/punctuality";
import { errorText } from "@rbp/core";
import { useTaskPageData } from "./useTaskPage";
import { ActionDialog, EffortModal, TaskBreadcrumb, itemAnswer, type ActionValues, type PendingAction } from "./taskPageParts";
import { usePageTitle } from "@rbp/core";
import { usePageBannerTitle } from "@rbp/core";

export const TaskShow = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const isWide = useIsWide();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { userId } = useMe();
  const { data: groups } = useTeams();
  const [forwardOpen, setForwardOpen] = useState(false);
  const userMap = useUserMap();
  const { data: canRecurring } = useCan({ resource: "recurring", action: "create" });
  const { data: roles } = useRoles();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<string | null>(null);
  const [quickLinkType, setQuickLinkType] = useState<string | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  // Completing without hours asks for them once; the answer can be skipped.
  const [effortFor, setEffortFor] = useState<StepAction | null>(null);
  // Then: which parts were installed? Also skippable.
  const [itemsFor, setItemsFor] = useState<StepAction | null>(null);
  const { has, hasAny } = usePermissions();
  // Moving a due date that was already set asks for a reason; the original date stays for the statistics.
  const [rescheduleTo, setRescheduleTo] = useState<string | null>(null);

  const { task, isLoading, steps, goalLink, originalDue, assigneeUserId, assigneeTeamId, hiddenFields, rights, rootTask } = useTaskPageData(id);

  const { data: tree } = useTaskTree(id);
  usePageTitle(task ? `${task.title} (#${task.task_number})` : undefined);
  // Platform: the page banner shows the record (as the tasks module's task page does).
  usePageBannerTitle(task ? `#${task.task_number} ${task.title}` : undefined);
  // Initiative: subtasks as tree table, bucket board or Gantt chart (the choice is remembered per browser).
  const [subtaskView, setSubtaskView] = useState<"tree" | "board" | "gantt">(() => {
    try {
      const stored = localStorage.getItem("compass.initiative.view");
      return stored === "board" || stored === "gantt" ? stored : "tree";
    } catch {
      return "tree";
    }
  });
  // Computer: the chat is a side panel next to the page that can be hidden (remembered per browser). Phone: the chat
  // button opens the task's conversation in the Messages module (RecordChatButton).
  const [panelOpen, setPanelOpen] = useState(() => {
    try {
      return localStorage.getItem("compass.task.chatPanel") !== "closed";
    } catch {
      return true;
    }
  });
  const chatWidth = useChatWidth();
  const changePanel = (open: boolean) => {
    setPanelOpen(open);
    try {
      localStorage.setItem("compass.task.chatPanel", open ? "open" : "closed");
    } catch {
      /* not remembered */
    }
  };
  const changeSubtaskView = (value: "tree" | "board" | "gantt") => {
    setSubtaskView(value);
    try {
      localStorage.setItem("compass.initiative.view", value);
    } catch {
      /* not remembered */
    }
  };
  const { data: taskTypes } = useTaskTypes(false);
  const canAddSubtaskType = useCanAddSubtask();
  const invalidatePurpose = usePurposeInvalidate();

  const finishedEarly = !!task && FINAL_TASK_STATUSES.includes(task.status);
  // Only task types that use spare parts (switch in the task type editor) offer them.
  const hasAssets = useHasModule("assets");
  const itemMode = ((taskTypes?.find((x) => x.id === task?.task_type_id)?.item_mode as ItemMode | undefined) ?? "none");
  // Only types that use items ask which ones were used when the task is completed.
  const askForItems = useNeedsItemUsage(task ? { id: task.id, asset_id: task.asset_id } : undefined, !!task && !finishedEarly && itemMode === "use" && has("items.view"));

  // The checklist (same cache as the checklist card): the action dialog asks for the step's open required items.
  const { data: checklist } = useQuery({ queryKey: ["task-checklists", id], queryFn: () => fetchTaskChecklist(id), enabled: !!id && !finishedEarly });

  // Phone: the asset stands on top when the task had one on opening, else under "More details". Decided once per task,
  // so setting or clearing it does not make the field jump between the two places while it is being edited.
  const assetOnTop = useRef<{ id: string; top: boolean } | null>(null);
  if (isLoading) return <Spin />;
  if (!task) return <Empty description={t("common.notFound")} />;
  if (assetOnTop.current?.id !== task.id) assetOnTop.current = { id: task.id, top: !!task.asset_id };

  const finished = FINAL_TASK_STATUSES.includes(task.status);
  // task_reopen refuses tasks whose finish had effects elsewhere: a special function, a ticket, a series, an order.
  const taskType = taskTypes?.find((x) => x.id === task.task_type_id);
  const PurposePanel = purposeUi(taskType?.purpose).TaskPanel;
  const mayEdit = !!rights?.edit;
  const canReopen = !!rights?.reopen;
  const hides = (field: string) => !!hiddenFields?.includes(field);
  const isInitiativeRoot = task.is_initiative && !task.parent_task_id;
  const currentStep = steps?.find((s) => s.step_key === task.current_step_key);
  // Required checklist items of the current step still open; they hold an action that moves the task on.
  const openStepItems = (action: StepAction) =>
    isNegativeAction(action) ? [] : (checklist?.items ?? []).filter((i) => i.step_key === task.current_step_key && i.required && i.kind !== "heading" && !isAnswered(i));
  const currentIndex = Math.max(0, steps?.findIndex((s) => s.step_key === task.current_step_key) ?? 0);
  // Who may act, forward, edit or record work comes from task_rights (the same checks as task_perform_action,
  // task_forward, the row policy and task_record_effort).
  const canAct = !!rights?.act && !!currentStep;
  const canForward = !!rights?.forward && !!currentStep;
  // A step with a rule has its own "who acts now"; without one the task's assignee is the one.
  const routedStep = !!(assigneeUserId || assigneeTeamId || task.current_assignee_role_id);
  // Series are managed by whoever may edit recurring rules (the database enforces it).
  const canEditTask = !!canRecurring?.can;
  const editableText = mayEdit && !finished;
  const effortEditable = !!rights?.check;
  // Hours are asked on completion only where they mean something: not for initiatives, types that hide the field, or
  // types with a special function (leave: nobody "works" on an approval).
  const asksHoursOnFinish = task.work_hours == null && effortEditable && !task.is_initiative && !hides("work_hours") && !taskType?.purpose;
  const stepRoleName = localName(roles?.find((r) => r.id === task.current_assignee_role_id));
  const stepTeamName = groups?.find((g) => g.id === assigneeTeamId)?.name;
  const assigneeRoleName = assigneeUserId
    ? userLabel(userMap.get(assigneeUserId))
    : assigneeTeamId && task.current_assignee_role_id
      ? t("tasks.roleInTeam", { role: stepRoleName, team: stepTeamName ?? "" })
      : assigneeTeamId
        ? stepTeamName
        : stepRoleName;

  const refresh = async () => {
    // A task with a special function also changes that module's lists and numbers.
    invalidatePurpose(taskType?.purpose);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["task", id] }),
      queryClient.invalidateQueries({ queryKey: ["task-assignee", id] }),
      queryClient.invalidateQueries({ queryKey: ["feed", "tasks", id] }),
      queryClient.invalidateQueries({ queryKey: ["asset-tasks-tab"] }),
      queryClient.invalidateQueries({ queryKey: ["asset-open-counts"] }),
      queryClient.invalidateQueries({ queryKey: ["asset-work-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["task-tree"] }),
      queryClient.invalidateQueries({ queryKey: ["task-goal", id] }),
      queryClient.invalidateQueries({ queryKey: ["task-contribution"] }),
      queryClient.invalidateQueries({ queryKey: ["task-original-due", id] }),
      queryClient.invalidateQueries({ queryKey: ["punctuality"] }),
      queryClient.invalidateQueries({ queryKey: ["series-runs"] }),
      queryClient.invalidateQueries({ queryKey: ["task-items", id] }),
      queryClient.invalidateQueries({ queryKey: DECISIONS_KEY }),
    ]);
  };

  const confirmReschedule = async (reason: string) => {
    const to = rescheduleTo!;
    setRescheduleTo(null);
    const error = await moveDueDate(id, task.due_date, to, reason, (v) => t("punctuality.rescheduleComment", v));
    if (error) message.error(errorText(error));
    await Promise.all([refresh(), invalidateAfterReschedule(queryClient, id)]);
  };

  const setGoal = async (goal_id: string | null) => {
    const { error } = await supabaseClient.from("tasks").update({ goal_id }).eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  const plan = async (patch: { team_id?: string | null; assigned_user_id?: string | null; planned_date?: string | null }) => {
    const next = {
      team_id: task.team_id,
      assigned_user_id: task.assigned_user_id,
      planned_date: task.planned_date,
      ...patch,
    };
    // Changing the team clears a person who is not in it.
    const { error } = await supabaseClient.rpc("task_plan", {
      p_task_id: id,
      p_team_id: next.team_id,
      p_assigned_user_id: next.assigned_user_id,
      p_planned_date: next.planned_date,
      p_sort_order: null,
    });
    if (error) message.error(errorText(error, { known: { task_needs_team_or_person: "tasks.needsTeamOrPerson" } }));
    await refresh();
  };

  const updateField = async (patch: { priority?: string; due_date?: string | null; asset_id?: string | null; title?: string; description?: string | null; blocks_parent?: boolean }) => {
    const { error } = await supabaseClient.from("tasks").update(patch).eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  // Work hours and downtime go through an RPC: the mechanic who may work the task needs no edit right.
  const saveEffort = async (patch: { work_hours?: number | null; downtime_from?: string | null; downtime_to?: string | null }) => {
    const next = { work_hours: task.work_hours, downtime_from: task.downtime_from, downtime_to: task.downtime_to, ...patch };
    const { error } = await supabaseClient.rpc("task_record_effort", {
      p_task_id: id,
      p_work_hours: next.work_hours,
      p_downtime_from: next.downtime_from,
      p_downtime_to: next.downtime_to,
    });
    if (error) message.error(errorText(error));
    await refresh();
    void queryClient.invalidateQueries({ queryKey: ["maintenance-stats"] });
    return !error;
  };

  const perform = async (action: StepAction, values: ActionValues, items: PendingAction["items"] = []) => {
    // Answers given in the action dialog first: the step guard checks them when the step is left.
    for (const item of items) {
      const { error } = await supabaseClient.from("task_checklist_items").update(itemAnswer(item, values[`item:${item.id}`])).eq("id", item.id);
      if (error) {
        message.error(errorText(error));
        return false;
      }
    }
    if (items.length) void queryClient.invalidateQueries({ queryKey: ["task-checklists", id] });
    const { error } = await supabaseClient.rpc("task_perform_action", {
      p_task_id: id,
      p_action_key: action.key,
      p_comment: values.comment ?? null,
    });
    if (error) {
      const open = /^Checklist incomplete: (\d+)/.exec(error.message);
      const stepOpen = /^Checklist step incomplete: (\d+)/.exec(error.message);
      message.error(
        open ? t("checklists.incompleteBlock", { count: Number(open[1]) })
          : stepOpen ? t("checklists.incompleteStepBlock", { count: Number(stepOpen[1]) })
          : errorText(error),
      );
      return false;
    }
    await refresh();
    queryClient.invalidateQueries({ queryKey: ["task-checklists", id] });
    return true;
  };

  const startAction = (action: StepAction) => {
    const openSubtasks = (tree ?? []).slice(1).filter((s) => !FINAL_TASK_STATUSES.includes(s.status)).length;
    // Finishing the task is allowed with open subtasks, but only after a confirmation.
    if (action.to === null && openSubtasks > 0) {
      modal.confirm({
        title: t("tasks.openSubtasksTitle"),
        content: t("tasks.openSubtasksHint", { count: openSubtasks }),
        okText: t("tasks.completeAnyway"),
        onOk: () => askEffort(action),
      });
      return;
    }
    // The action bar sits at the bottom of the screen on a phone, where a stray tap is easy: ask first, once, before the
    // hours / items questions. An action with a comment or fields has its own dialog and needs no extra question.
    const ownDialog = action.requires_comment || openStepItems(action).length > 0;
    // Hours or parts questions that follow are confirmation enough (both complete the task); only then no extra dialog.
    const asksEffort = action.to === null && asksHoursOnFinish;
    const asksParts = action.to === null && askForItems && effortEditable;
    if (isMobile && !ownDialog && !asksEffort && !asksParts) {
      modal.confirm({
        title: actionLabel(t, i18n.language, action),
        content: action.to === null ? t("tasks.confirmFinish") : t("tasks.confirmStep"),
        okText: actionLabel(t, i18n.language, action),
        onOk: () => askEffort(action),
      });
      return;
    }
    askEffort(action);
  };

  const askEffort = (action: StepAction) => {
    if (action.to === null && asksHoursOnFinish) {
      setEffortFor(action);
      return;
    }
    askParts(action);
  };

  const askParts = (action: StepAction) => {
    if (action.to === null && askForItems && effortEditable) {
      setItemsFor(action);
      return;
    }
    proceedAction(action);
  };

  const proceedAction = (action: StepAction) => {
    const step = currentStep!;
    const items = openStepItems(action);
    if (!action.requires_comment && items.length === 0) {
      void perform(action, {});
      return;
    }
    setPending({ action, step, items });
  };

  // The switch "initiative" (root tasks only); the database refuses clearing it while a goal or buckets hang on it.
  const setInitiative = async (value: boolean) => {
    const { error } = await supabaseClient.from("tasks").update({ is_initiative: value }).eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  // Somebody clicked "done" or "cancel" by mistake: back to the step the task was finished from (RPC task_reopen).
  const reopenTask = () => {
    let comment = "";
    modal.confirm({
      title: t("tasks.reopenTitle"),
      content: (
        <>
          <Typography.Paragraph type="secondary">{t("tasks.reopenHint")}</Typography.Paragraph>
          <Input.TextArea rows={2} placeholder={t("tasks.reopenComment")} onChange={(e) => { comment = e.target.value; }} />
        </>
      ),
      okText: t("tasks.reopen"),
      onOk: async () => {
        const { error } = await supabaseClient.rpc("task_reopen", { p_task_id: id, p_comment: comment.trim() || null });
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

  const inInitiative = task.is_initiative;
  const hasSubtasks = (task.subtask_count ?? 0) > 0 || (tree?.length ?? 0) > 1;
  // A task with subtasks (initiatives always) gets the progress bar and the view switch (tree, board, Gantt).
  const treeMode = isInitiativeRoot || hasSubtasks;
  const hasPunctuality = isInitiativeRoot || hasSubtasks;
  const punctuality = hasPunctuality && (
    <div style={{ marginTop: 16 }}>
      <PunctualityPanel scope={{ rootTaskId: task.id }} breakdown breakdownLabel={t("punctuality.task")} />
    </div>
  );
  const canAddSubtask = canAddSubtaskType(task.task_type_id);
  const quickLinks = !finished && <SubtaskQuickLinks taskTypeId={task.task_type_id} onPick={setQuickLinkType} />;
  const shownView = subtaskView === "board" && !isInitiativeRoot ? "tree" : subtaskView;
  const subtasks = (
    <>
      {treeMode && tree && tree.length > 1 && (
        <Segmented<"tree" | "board" | "gantt">
          style={{ marginTop: 16 }}
          value={shownView}
          onChange={changeSubtaskView}
          options={[
            { value: "tree", label: t("initiatives.board.viewTree") },
            // The board groups by the buckets of an initiative; other tasks have none.
            ...(isInitiativeRoot ? [{ value: "board" as const, label: t("initiatives.board.viewBoard") }] : []),
            { value: "gantt", label: t("initiatives.board.viewGantt") },
          ]}
        />
      )}
      {treeMode && tree && tree.length > 1 && shownView === "board" ? (
        <InitiativeBoard rootId={task.id} canEdit={mayEdit} />
      ) : treeMode && tree && tree.length > 1 && shownView === "gantt" ? (
        <TaskGantt rows={tree} />
      ) : isInitiativeRoot && (!tree || tree.length <= 1) ? (
        // An initiative always shows its tasks section; without tasks it offers the first one.
        <Empty style={{ marginTop: 16 }} image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("initiatives.noTasks")}>
          {!finished && canAddSubtask && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddingSubtaskTo(task.id)}>
              {t("tasks.addSubtask")}
            </Button>
          )}
        </Empty>
      ) : (
        tree && tree.length > 0 && <TaskTree rows={tree} onAdd={finished ? undefined : setAddingSubtaskTo} showProgress={!treeMode} />
      )}
    </>
  );
  // A type that hides the checklist shows it only when the task has items (step items, the type's default checklist).
  const checklistTab = !hides("checklist") || (task.checklist_items_total ?? 0) > 0;
  const checklists = checklistTab ? <TaskChecklists taskId={task.id} finished={finished} taskTypeId={task.task_type_id} currentStepKey={task.current_step_key ?? undefined} /> : null;
  const costs = has("costs.view") && <TaskCosts taskId={task.id} canEdit={has("costs.edit")} hideWhenEmpty={hides("costs")} />;
  // Items: what the task needs and used, or on an ordering type what it orders (lines that exist stay visible).
  const items = (
    <TaskItems task={{ id: task.id, title: task.title, asset_id: task.asset_id, task_type_id: task.task_type_id }} finished={finished} canWork={effortEditable} mode={itemMode} />
  );
  // Computer: the history next to the page (panel) or, on a narrower screen, below it.
  const sidePanel = !isMobile && isWide && panelOpen;
  const feed = <PanelChat entityType="tasks" entityId={task.id} height="70vh" />;

  // The menu entries phone and desktop share: repeat, switch to initiative, cancel (open tasks only).
  const taskMenuItems = finished
    ? []
    : [
        ...(canAddSubtask ? [{ key: "subtask", icon: <PlusOutlined />, label: t("tasks.addSubtask"), onClick: () => setAddingSubtaskTo(task.id) }] : []),
        ...(!task.recurring_task_rule_id && canEditTask ? [{ key: "repeat", icon: <RetweetOutlined />, label: t("recurring.repeat"), onClick: () => setRepeatOpen(true) }] : []),
        ...(!task.parent_task_id && canEditTask && hasAny("initiatives.edit.")
          ? [{ key: "initiative", icon: <FlagOutlined />, label: t(task.is_initiative ? "initiatives.switchOff" : "initiatives.switchOn"), onClick: () => void setInitiative(!task.is_initiative) }]
          : []),
        { key: "cancel", icon: <StopOutlined />, danger: true, label: t("tasks.cancel"), onClick: cancelTask },
      ];

  // The upper part of the page (route, fields, description). Phone: its own first tab, so the activity chat can fill the screen.
  const details = (
    <>
      {steps && steps.length > 1 && (() => {
        const stepItems = steps.map((s) => ({ title: localName(s), description: stepAssigneeText(t, s, roles, groups) }));
        return isMobile ? (
          <MobileSteps items={stepItems} current={currentIndex} status={task.status === "done" ? "done" : task.status === "cancelled" ? "error" : "process"} />
        ) : (
          <Steps size="small" style={{ marginBottom: 16 }} responsive current={task.status === "done" ? steps.length : currentIndex} status={task.status === "cancelled" ? "error" : "process"} items={stepItems} />
        );
      })()}
      {!finished && currentStep && steps && steps.length > 1 && currentStep.actions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary" style={{ marginRight: 8 }}>{t("tasks.nextSteps")}</Typography.Text>
          <Space size={[4, 4]} wrap>
            {currentStep.actions.map((a) => {
              const target = a.to === null ? null : steps.find((s) => s.step_key === a.to);
              return (
                <Tag key={a.key} color={actionColor(a)} style={{ marginInlineEnd: 0, whiteSpace: "normal", maxWidth: "100%", height: "auto", wordBreak: "break-word" }}>
                  {actionLabel(t, i18n.language, a)} → {target ? `${localName(target)}${stepAssigneeText(t, target, roles, groups) ? ` (${stepAssigneeText(t, target, roles, groups)})` : ""}` : t("taskTypes.finish")}
                </Tag>
              );
            })}
          </Space>
        </div>
      )}
      <GoalChain taskId={task.id} />
      {!finished && !canAct && currentStep && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("tasks.waitingFor", { role: assigneeRoleName ?? t("common.anyone") })} />
      )}
      {PurposePanel && <PurposePanel taskId={task.id} taskStatus={task.status} canAct={canAct} isRequester={task.created_by_user_id === userId} />}
      {!finished && task.is_blocked && <BlockedPanel taskId={task.id} />}
      {!finished && tree && tree.length > 0 && <DateConflictPanel rows={tree} />}

      <Card size="small" title={t("feed.tabDetails")} style={{ marginBottom: 16 }}>
      <FieldBar
        phone
        inCard
        fields={[
          { label: t("fields.taskType"), value: pickName(task.task_type_name, task.task_type_name_de), secondary: true },
          { label: t("recordAccess.field"), value: <AccessBadge entityType="tasks" id={task.id} />, secondary: true },
          { label: t("fields.step"), value: task.current_step_name ? pickName(task.current_step_name, task.current_step_name_de) : null },
          { label: t("fields.currentHandler"), value: assigneeRoleName ?? "—", hidden: finished || !routedStep },
          {
            label: t("fields.asset"),
            wide: true,
            secondary: !assetOnTop.current.top,
            // A finished task has nothing to set: without an asset the field goes.
            hidden: !hasAssets || ((hides("asset") || finished) && !task.asset_id),
            value: finished ? (
              task.asset_id ? <Link to={`/assets/${task.asset_id}`}>{task.asset_name}</Link> : "—"
            ) : (
              <Space size={6}>
                <AssetSelect value={task.asset_id ?? undefined} onChange={(asset_id) => updateField({ asset_id: asset_id ?? null })} style={{ width: 200 }} />
                {task.asset_id && <Link to={`/assets/${task.asset_id}`}>↗</Link>}
              </Space>
            ),
          },
          {
            label: t("blocked.field"),
            secondary: true,
            hidden: !task.parent_task_id || finished,
            value: <Switch size="small" checked={!!task.blocks_parent} onChange={(blocks_parent) => void updateField({ blocks_parent })} />,
          },
          { label: t("fields.recurringRule"), value: <Link to="/recurring">{t("recurring.title")}</Link>, hidden: !task.recurring_task_rule_id, secondary: true },
          { label: t("fields.ticket"), value: task.ticket_id ? <Link to={`/tickets/${task.ticket_id}`}>#{task.ticket_number}</Link> : "—", hidden: !task.ticket_id },
          {
            label: t("fields.priority"),
            value: finished ? <PriorityTag priority={task.priority} /> : (
              <Select value={task.priority} style={{ width: 110 }} onChange={(priority) => updateField({ priority })} options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
            ),
          },
          {
            label: t("fields.dueDate"),
            value: finished ? (
              <Space size={6}>{formatDate(task.due_date)}{originalDue && task.due_date && originalDue !== task.due_date && <Tag color="orange" style={{ marginInlineEnd: 0 }}>{t("punctuality.originalDue")} {formatDate(originalDue)}</Tag>}</Space>
            ) : (
              <Space size={6} wrap>
                <DatePicker
                  allowClear
                  value={task.due_date ? dayjs(task.due_date) : null}
                  status={task.is_overdue ? "error" : undefined}
                  onChange={(d) => {
                    const next = d ? d.format("YYYY-MM-DD") : null;
                    if (next && task.due_date && next !== task.due_date) setRescheduleTo(next);
                    else void updateField({ due_date: next });
                  }}
                />
                {originalDue && task.due_date && originalDue !== task.due_date && (
                  <Tooltip title={`${t("punctuality.originalDue")} ${formatDate(originalDue)}`}>
                    <Tag color="orange" style={{ marginInlineEnd: 0 }}>{t("punctuality.moved")}</Tag>
                  </Tooltip>
                )}
              </Space>
            ),
          },
          {
            label: t("fields.team"),
            hidden: hides("team") && !task.team_id,
            value: finished ? task.team_name ?? "—" : <TeamSelect value={task.team_id} onChange={(team_id) => plan({ team_id, assigned_user_id: team_id && task.assigned_user_id ? null : task.assigned_user_id })} style={{ width: 160 }} />,
          },
          {
            label: t("fields.assignee"),
            value: finished ? task.assigned_user_name ?? "—" : <AssigneeSelect teamId={task.team_id} value={task.assigned_user_id} onChange={(assigned_user_id) => plan({ assigned_user_id })} style={{ width: 170 }} />,
          },
          {
            label: t("fields.plannedDate"),
            secondary: true,
            value: finished ? formatDate(task.planned_date) : (
              <DatePicker allowClear value={task.planned_date ? dayjs(task.planned_date) : null} onChange={(d) => plan({ planned_date: d ? d.format("YYYY-MM-DD") : null })} />
            ),
          },
          {
            label: t("effort.workHours"),
            secondary: true,
            value: effortEditable ? (
              <InputNumber
                key={String(task.work_hours)}
                min={0}
                max={9999}
                step={0.5}
                precision={1}
                defaultValue={task.work_hours ?? undefined}
                addonAfter="h"
                style={{ width: 110 }}
                onBlur={(e) => {
                  const raw = e.target.value.replace(",", ".").trim();
                  const v = raw === "" ? null : Number(raw);
                  if (v !== null && Number.isNaN(v)) return;
                  if (v !== (task.work_hours == null ? null : Number(task.work_hours))) void saveEffort({ work_hours: v });
                }}
              />
            ) : task.work_hours != null ? `${task.work_hours} h` : "—",
            hidden: (!effortEditable && task.work_hours == null) || (hides("work_hours") && task.work_hours == null),
          },
          {
            label: t("effort.downtime"),
            secondary: true,
            wide: true,
            value: effortEditable ? (
              <DatePicker.RangePicker
                showTime={{ format: "HH:mm" }}
                format="L LT"
                allowEmpty={[true, true]}
                value={[task.downtime_from ? dayjs(task.downtime_from) : null, task.downtime_to ? dayjs(task.downtime_to) : null]}
                onChange={(range) => void saveEffort({ downtime_from: range?.[0] ? range[0].toISOString() : null, downtime_to: range?.[1] ? range[1].toISOString() : null })}
                style={{ width: 340 }}
              />
            ) : task.downtime_from ? `${formatDateTime(task.downtime_from)} – ${formatDateTime(task.downtime_to)}` : "—",
            hidden: (!effortEditable && !task.downtime_from) || (hides("downtime") && !task.downtime_from),
          },
          {
            label: t("goals.goal"),
            secondary: true,
            wide: true,
            value: <GoalSelect value={goalLink} onChange={setGoal} disabled={!mayEdit} placeholder={t("goals.noGoal")} style={{ width: 240 }} />,
            hidden: !(isInitiativeRoot && (has("goals.view.all") || has("goals.view.own"))) || (!mayEdit && !goalLink),
          },
          { label: t("fields.createdAt"), value: `${formatDateTime(task.created_at)}${task.created_by_name ? ` · ${task.created_by_name}` : ""}`, secondary: true, wide: true },
        ]}
      />
      {(task.description || editableText) && <Divider style={{ margin: "14px 0" }} />}
      <EditableDescription flush value={task.description} editable={editableText} onSave={(description) => updateField({ description })} />
      </Card>
      <TaskRepeat task={task} finished={finished} canManage={canEditTask} startOpen={repeatOpen} onStartClose={() => setRepeatOpen(false)} />
      {task.recurring_task_rule_id && (
        <Card size="small" title={t("punctuality.history")} style={{ marginTop: 16 }}>
          <SeriesHistory ruleId={task.recurring_task_rule_id} />
        </Card>
      )}
    </>
  );

  // The page in reading order: details with description, the checklist right under it, then subtasks, material, evaluation.
  const main = (
    <>
      {details}
      {checklists}
      {quickLinks}
      {treeMode && tree?.[0] && tree[0].descendants_total > 0 && (
        <div style={{ marginTop: 16 }}>
          <TaskProgress done={tree[0].descendants_done} total={tree[0].descendants_total} />
        </div>
      )}
      {(isInitiativeRoot || (tree && tree.length > 1)) && subtasks}
      {items}
      {punctuality}
      {costs}
    </>
  );
  const content = sidePanel ? (
    <div style={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) 14px ${chatWidth.width}px`, alignItems: "stretch" }}>
      <div style={{ paddingRight: 4 }}>{main}</div>
      <ChatResizeHandle width={chatWidth.width} onChange={chatWidth.setWidth} onCommit={chatWidth.commit} />
      <StickyPanelChat
        entityType="tasks"
        entityId={task.id}
        header={
          <Button type="text" size="small" icon={<MenuUnfoldOutlined />} onClick={() => changePanel(false)}>
            {t("feed.hidePanel")}
          </Button>
        }
      />
    </div>
  ) : (
    <>
      {main}
      {!isMobile && <div style={{ marginTop: 24 }}>{feed}</div>}
    </>
  );

  return (
    <div>
      <TaskBreadcrumb task={task} rootTask={rootTask} inInitiative={inInitiative} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <Space align="center" size={12} wrap>
          <Typography.Title
            level={3}
            style={{ margin: 0 }}
            editable={editableText ? { text: task.title, maxLength: 200, triggerType: ["icon", "text"], tooltip: t("common.edit"), onChange: (title) => title.trim() && title.trim() !== task.title && updateField({ title: title.trim() }) } : false}
          >
            #{task.task_number} {task.title}
          </Typography.Title>
          <StatusTag status={task.status} />
          {!isMobile && isWide && !panelOpen && (
            <Button size="small" icon={<MessageOutlined />} onClick={() => changePanel(true)}>
              {t("feed.title")}
            </Button>
          )}
          {!finished && (task.items_waiting ?? 0) > 0 && <Tag color="gold" style={{ marginInlineEnd: 0 }}>{t("items.waiting", { count: task.items_waiting })}</Tag>}
        </Space>
        {isMobile ? (
          <ActionBar back="/tasks">
            {(() => {
              // Phone: up to two decisions as buttons (the completing one first), everything else behind "...".
              const ordered = (finished || !canAct ? [] : [...(currentStep?.actions ?? [])]).sort((x, y) => Number(actionColor(y) === "green") - Number(actionColor(x) === "green"));
              const direct = ordered.slice(0, 2);
              const extra = ordered.slice(2);
              const menuItems = [
                ...extra.map((a) => ({ key: `action-${a.key}`, danger: actionColor(a) === "red", label: actionLabel(t, i18n.language, a), onClick: () => startAction(a) })),
                ...(canForward && direct.length > 0 ? [{ key: "forward", icon: <UserSwitchOutlined />, label: t("tasks.forward.button"), onClick: () => setForwardOpen(true) }] : []),
                ...taskMenuItems,
              ];
              return (
                <>
                  {direct.map((a) => (
                    <Button
                      key={a.key}
                      type={actionColor(a) === "green" ? "primary" : "default"}
                      danger={actionColor(a) === "red"}
                      icon={a.to === null && actionColor(a) === "green" ? <CheckOutlined /> : undefined}
                      onClick={() => startAction(a)}
                    >
                      {actionLabel(t, i18n.language, a)}
                    </Button>
                  ))}
                  {canForward && direct.length === 0 && (
                    <Button type={finished ? "default" : "primary"} icon={<UserSwitchOutlined />} onClick={() => setForwardOpen(true)}>
                      {t("tasks.forward.button")}
                    </Button>
                  )}
                  {canReopen && (
                    <Button icon={<UndoOutlined />} onClick={reopenTask}>
                      {t("tasks.reopen")}
                    </Button>
                  )}
                  <RecordChatButton entityType="tasks" entityId={task.id} title={`#${task.task_number} ${task.title}`} />
                  {menuItems.length > 0 && (
                    <Dropdown trigger={["click"]} placement="topRight" menu={{ items: menuItems }}>
                      <Button aria-label={t("common.more")} icon={<MoreOutlined />} />
                    </Dropdown>
                  )}
                </>
              );
            })()}
          </ActionBar>
        ) : (
        <ActionBar back="/tasks">
          {!finished &&
            (currentStep?.actions ?? []).map((a) => (
              <Tooltip key={a.key} title={!canAct ? t("tasks.notYourStep", { role: assigneeRoleName ?? "" }) : undefined}>
                <Button
                  type={actionColor(a) === "green" ? "primary" : "default"}
                  danger={actionColor(a) === "red"}
                  disabled={!canAct}
                  icon={a.to === null && actionColor(a) === "green" ? <CheckOutlined /> : undefined}
                  onClick={() => startAction(a)}
                >
                  {actionLabel(t, i18n.language, a)}
                </Button>
              </Tooltip>
            ))}
          {canForward && (
            <Button icon={<UserSwitchOutlined />} onClick={() => setForwardOpen(true)}>
              {t("tasks.forward.button")}
            </Button>
          )}
          {canReopen ? (
            <Button icon={<UndoOutlined />} onClick={reopenTask}>
              {t("tasks.reopen")}
            </Button>
          ) : null}
          {!finished && (
            <Dropdown
              menu={{ items: taskMenuItems }}
            >
              <Button icon={<MoreOutlined />} />
            </Dropdown>
          )}
        </ActionBar>
        )}
      </div>

      <TaskForwardModal
        open={forwardOpen}
        task={task}
        mode={routedStep ? "step" : "assignee"}
        approval={currentStep?.assignee_kind === "requester_supervisor"}
        onClose={() => setForwardOpen(false)}
        onDone={() => {
          setForwardOpen(false);
          void refresh();
        }}
      />

      {content}

      <TaskFormModal
        open={!!addingSubtaskTo}
        parent={addingSubtaskTo ? { id: addingSubtaskTo, asset_id: addingSubtaskTo === task.id ? task.asset_id : null } : null}
        onClose={() => setAddingSubtaskTo(null)}
        onSaved={(sid) => {
          setAddingSubtaskTo(null);
          void refresh();
          navigate(`/tasks/${sid}`);
        }}
      />

      <TaskFormModal
        open={!!quickLinkType}
        fixedTypeId={quickLinkType ?? undefined}
        parent={{ id: task.id, asset_id: task.asset_id }}
        initialTitle={task.title}
        onClose={() => setQuickLinkType(null)}
        onSaved={(sid) => {
          setQuickLinkType(null);
          void refresh();
          navigate(`/tasks/${sid}`);
        }}
      />

      {rescheduleTo && <RescheduleModal from={task.due_date} to={rescheduleTo} original={originalDue ?? null} onConfirm={(reason) => void confirmReschedule(reason)} onCancel={() => setRescheduleTo(null)} />}

      {effortFor && (
        <EffortModal
          onCancel={() => setEffortFor(null)}
          onSkip={() => {
            const a = effortFor;
            setEffortFor(null);
            askParts(a);
          }}
          onSave={async (hours) => {
            const a = effortFor;
            const saved = await saveEffort({ work_hours: hours });
            if (saved) {
              setEffortFor(null);
              askParts(a);
            }
            return saved;
          }}
        />
      )}

      <ItemUsageModal
        open={!!itemsFor}
        task={{ id: task.id, asset_id: task.asset_id }}
        onSkip={() => {
          const a = itemsFor!;
          setItemsFor(null);
          proceedAction(a);
        }}
        onSaved={() => {
          const a = itemsFor!;
          setItemsFor(null);
          proceedAction(a);
        }}
      />

      {pending && (
        <ActionDialog
          pending={pending}
          onCancel={() => setPending(null)}
          onSubmit={async (action, values) => {
            if (await perform(action, values, pending.items)) setPending(null);
          }}
        />
      )}
    </div>
  );
};
