// Ported 1:1 from COMPASS (app/src/components/checklist/taskChecklists.tsx).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Card, Checkbox, Collapse, DatePicker, Dropdown, Input, InputNumber, Modal, Radio, Select, Space, Tag, Tooltip, Typography, theme as antdTheme } from "antd";
import dayjs from "dayjs";
import { CheckCircleFilled, CheckOutlined, CloseCircleFilled, CloseOutlined, DeleteOutlined, MessageOutlined, MoreOutlined, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useGetIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { useTaskRights } from "@rbp/module-tasks/src/hooks/useTaskRights.ts";
import type { ItemPhoto } from "./itemPhotos";
import { addTaskItems, fetchChecklistPhotos, fetchTaskChecklist, isAnswered, outOfRange, progress, templateRights, templatesForType, type ChecklistItem, type TaskChecklist } from "../../lib/checklists";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useChecklistTemplates } from "../../hooks/useChecklistTemplates";
import { useUserMap } from "@rbp/core";
import { userDisplayName } from "@rbp/module-messaging/src/feed/mentions.ts";
import { formatDateTime } from "@rbp/ui";
import { useIsMobile } from "@rbp/ui";
import { saveAnswer } from "../../offline/checklistOutbox";
import { ItemPhotos } from "./itemPhotos";
import { ItemTicket } from "./itemTicket";
import { errorText } from "@rbp/core";

const key = (taskId: string) => ["task-checklists", taskId];
const GENERAL = "__general__";
let queuedHinted = false; // tell the user once per visit that answers wait for the connection

// The checklist of a task: ONE flat list. It can start from an official checklist (template items, fixed) and can carry
// own steps (plain ticks) typed on the spot. Who may do what:
//   tick items, comment, attach photos : edit access, the assignee, holders of the current step's role ("check")
//   choose / remove the official list, add / delete own steps : whoever may edit the task
//   save the own steps as an official checklist : holders of the checklist_templates create grant
// Items of a template with a task type can belong to a route step: they are grouped by step, the current step open.
export const TaskChecklists = ({ taskId, finished, taskTypeId, currentStepKey }: { taskId: string; finished: boolean; taskTypeId?: string; currentStepKey?: string }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [choosing, setChoosing] = useState(false);
  const [savingAs, setSavingAs] = useState(false);
  const [newStep, setNewStep] = useState("");

  const { data: taskRights } = useTaskRights(taskId);
  const canEditTask = taskRights?.edit;
  const canCheckTask = taskRights?.check;
  const { data: rights } = useQuery({ queryKey: ["template-rights"], queryFn: templateRights, staleTime: 5 * 60_000 });
  const { data: list } = useQuery({ queryKey: key(taskId), queryFn: () => fetchTaskChecklist(taskId) });
  const { data: photos } = useQuery({ queryKey: ["checklist-photos", taskId], queryFn: () => fetchChecklistPhotos(taskId) });
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { data: routeSteps } = useQuery({
    queryKey: ["task-type-steps", taskTypeId],
    enabled: !!taskTypeId,
    staleTime: 60_000,
    queryFn: async () => ((await supabaseClient.from("task_type_steps").select("step_key, name, name_de, step_order").eq("task_type_id", taskTypeId!).order("step_order")).data ?? []) as { step_key: string; name: string; name_de: string; step_order: number }[],
  });
  const photosByItem = new Map<string, ItemPhoto[]>();
  for (const p of photos ?? []) photosByItem.set(p.checklist_item_id, [...(photosByItem.get(p.checklist_item_id) ?? []), p]);

  const canFill = !!canCheckTask && !finished;
  const canEditList = !!canEditTask && !finished;
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key(taskId) }),
      queryClient.invalidateQueries({ queryKey: ["task", taskId] }),
      queryClient.invalidateQueries({ queryKey: ["feed", "tasks", taskId] }),
    ]);
  };

  // Answer one item: the screen updates at once, the database confirms (or the old value comes back).
  const answer = async (item: ChecklistItem, change: Partial<Pick<ChecklistItem, "done" | "result" | "value_number" | "value_text" | "note">>) => {
    queryClient.setQueryData<TaskChecklist>(key(taskId), (old) => old && { ...old, items: old.items.map((i) => (i.id === item.id ? { ...i, ...change } : i)) });
    const res = await saveAnswer(taskId, item.id, change);
    if (res.error) message.error(res.error);
    else if (res.queued && !queuedHinted) {
      queuedHinted = true;
      message.info(t("checklists.answerQueued"));
    }
    await refresh();
  };

  const addStep = async () => {
    const label = newStep.trim();
    if (!label) return;
    setNewStep("");
    try {
      await addTaskItems(taskId, [label]);
    } catch (e) {
      message.error(errorText(e));
    }
    await refresh();
  };
  const removeStep = async (item: ChecklistItem) => {
    const { error } = await supabaseClient.from("task_checklist_items").delete().eq("id", item.id);
    if (error) message.error(errorText(error));
    await refresh();
  };
  const removeTemplate = async () => {
    const { error } = await supabaseClient.rpc("task_set_checklist_template", { p_task_id: taskId, p_template_id: null });
    if (error) message.error(errorText(error));
    await refresh();
  };

  const items = list?.items ?? [];
  const hasOwn = items.some((i) => !i.from_template && !i.from_step && i.kind !== "heading");
  if (items.length === 0 && !list?.templateId && !canEditList) return null;

  const renderItem = (item: ChecklistItem) => (
    <ItemRow
      key={item.id}
      item={item}
      taskId={taskId}
      photos={photosByItem.get(item.id) ?? []}
      disabled={!canFill}
      isMobile={isMobile}
      userId={identity?.id}
      isAdmin={!!rights?.canEdit}
      onAnswer={(change) => answer(item, change)}
      onRemove={canEditList && !item.from_template && !item.from_step ? () => removeStep(item) : undefined}
    />
  );
  // Without any item on a step the list stays flat. An item whose step no longer exists counts as "whole task".
  const stepKeys = new Set((routeSteps ?? []).map((s) => s.step_key));
  const stepOf = (i: ChecklistItem) => (i.step_key && stepKeys.has(i.step_key) ? i.step_key : GENERAL);
  // The current step comes first, the other steps follow in route order, items of the whole task come last.
  const groups = items.some((i) => stepOf(i) !== GENERAL)
    ? [
        ...(routeSteps ?? []).map((s) => ({ key: s.step_key, name: localName(s), items: items.filter((i) => stepOf(i) === s.step_key) })).sort((a, b) => Number(b.key === currentStepKey) - Number(a.key === currentStepKey)),
        { key: GENERAL, name: "", items: items.filter((i) => stepOf(i) === GENERAL) },
      ].filter((g) => g.items.length > 0)
    : null;

  // Open: the whole-task group and the current step; when neither exists, the first group, so a list is never all folded.
  const wanted = [GENERAL, currentStepKey ?? GENERAL];
  const openGroups = groups && !groups.some((g) => wanted.includes(g.key)) ? [groups[0].key] : wanted;
  const listHasRequired = items.some((i) => i.kind !== "heading" && i.required);
  const p = progress(items);
  const menu = [
    ...(canEditList ? [{ key: "choose", label: list?.templateId ? t("checklists.change") : t("checklists.choose"), onClick: () => setChoosing(true) }] : []),
    ...(canEditList && list?.templateId ? [{ key: "remove", danger: true, label: t("checklists.removeOfficial"), onClick: removeTemplate }] : []),
    ...(rights?.canCreate && hasOwn ? [{ key: "template", label: t("checklists.saveAsTemplate"), onClick: () => setSavingAs(true) }] : []),
  ];

  return (
    <div style={{ marginTop: 24 }}>
      <Card
        size="small"
        title={
          <Space size={8} wrap>
            {list?.completedAt && <CheckCircleFilled style={{ color: token.colorSuccess }} />}
            <span>{t("checklists.title")}</span>
            {p.total > 0 && <Tag color={p.done === p.total ? "green" : "default"} style={{ marginInlineEnd: 0 }}>{p.done}/{p.total}</Tag>}
            {list?.templateName && <Tag style={{ marginInlineEnd: 0 }}>{list.templateName}</Tag>}
          </Space>
        }
        extra={menu.length > 0 ? <Dropdown menu={{ items: menu }} trigger={["click"]}><Button type="text" icon={<MoreOutlined />} /></Dropdown> : null}
      >
        {items.length === 0 && <Typography.Text type="secondary">{t("checklists.noItems")}</Typography.Text>}
        {groups ? (
          <Collapse
            ghost
            size="small"
            key={currentStepKey}
            defaultActiveKey={openGroups}
            items={groups.map((g) => {
              const gp = progress(g.items, listHasRequired);
              return {
                key: g.key,
                label: (
                  <Space size={8} wrap>
                    <Typography.Text strong>{g.key === GENERAL ? t("checklists.stepWholeTask") : g.name}</Typography.Text>
                    {gp.total > 0 && <Tag color={gp.done === gp.total ? "green" : "default"} style={{ marginInlineEnd: 0 }}>{gp.done}/{gp.total}</Tag>}
                    {g.key === currentStepKey && <Tag color="blue" style={{ marginInlineEnd: 0 }}>{t("checklists.currentStep")}</Tag>}
                  </Space>
                ),
                children: g.items.map(renderItem),
              };
            })}
          />
        ) : (
          items.map(renderItem)
        )}
        {canEditList && (
          <Input
            style={{ marginTop: 12 }}
            prefix={<PlusOutlined />}
            size={isMobile ? "large" : "middle"}
            placeholder={t("checklists.addStep")}
            maxLength={500}
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onPressEnter={addStep}
            onBlur={addStep}
          />
        )}
      </Card>

      <ChooseTemplateModal open={choosing} taskId={taskId} taskTypeId={taskTypeId} current={list?.templateId ?? null} hasAnswers={items.some((i) => i.from_template && i.kind !== "heading" && (i.done || i.result || i.value_number !== null || i.value_text))} onClose={() => setChoosing(false)} onDone={async () => { setChoosing(false); await refresh(); }} />
      <SaveAsTemplateModal open={savingAs} taskId={taskId} onClose={() => setSavingAs(false)} />
    </div>
  );
};

const ItemRow = ({ item, taskId, photos, disabled, isMobile, userId, isAdmin, onAnswer, onRemove }: { item: ChecklistItem; taskId: string; photos: ItemPhoto[]; disabled: boolean; isMobile: boolean; userId?: string; isAdmin: boolean; onAnswer: (change: Partial<ChecklistItem>) => void; onRemove?: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const [noteOpen, setNoteOpen] = useState(!!item.note);
  const [text, setText] = useState(item.value_text ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [number, setNumber] = useState<number | null>(item.value_number);
  const size = isMobile ? "middle" : "small";
  const users = useUserMap();

  if (item.kind === "heading") {
    return <div style={{ fontWeight: 600, marginTop: 8, padding: "4px 0", borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillQuaternary }}>{item.label}</div>;
  }

  const showNote = noteOpen || item.result === "defect";
  const bad = outOfRange({ ...item, value_number: number });
  const answered = isAnswered(item);

  // First column: the tick for tick items, a status mark for the others.
  const lead =
    item.kind === "check" ? (
      <Checkbox checked={item.done} disabled={disabled} onChange={(e) => onAnswer({ done: e.target.checked })} style={{ marginInlineEnd: 0 }} />
    ) : item.result === "defect" ? (
      <CloseCircleFilled style={{ color: token.colorError, fontSize: 16 }} />
    ) : answered ? (
      <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 16 }} />
    ) : (
      <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1px solid ${token.colorBorder}`, display: "inline-block" }} />
    );

  const answeredBy = item.answered_by_user_id ? users.get(item.answered_by_user_id) : undefined;
  const answeredText = answered && item.answered_at ? t("checklists.answeredBy", { name: answeredBy ? userDisplayName(answeredBy) : t("feed.unknownUser"), when: formatDateTime(item.answered_at) }) : null;

  const label = (
    <div style={{ minWidth: 0, lineHeight: 1.3 }}>
      <Tooltip title={isMobile ? undefined : answeredText}><span style={{ wordBreak: "break-word", textDecoration: item.kind === "check" && item.done ? "line-through" : undefined, color: item.kind === "check" && item.done ? token.colorTextSecondary : undefined }}>
        {item.label}
        {item.required && <span style={{ color: token.colorError }}> *</span>}
      </span></Tooltip>
      {item.hint && <div style={{ color: token.colorTextSecondary, fontSize: 12 }}>{item.hint}</div>}
      {isMobile && answeredText && <div style={{ color: token.colorTextSecondary, fontSize: 12 }}>{answeredText}</div>}
      {item.kind === "number" && (item.min_value !== null || item.max_value !== null) && (
        <div style={{ color: token.colorTextSecondary, fontSize: 12 }}>{t("checklists.limits", { min: item.min_value ?? "–", max: item.max_value ?? "–", unit: item.unit ?? "" })}</div>
      )}
    </div>
  );

  const control =
    item.kind === "pass_fail" ? (
      <Radio.Group size={size} disabled={disabled} value={item.result} onChange={(e) => onAnswer({ result: e.target.value })} optionType="button" buttonStyle="solid">
        <Radio.Button value="ok" style={item.result === "ok" ? { background: token.colorSuccess, borderColor: token.colorSuccess } : undefined}><CheckOutlined /> {t("checklists.ok")}</Radio.Button>
        <Radio.Button value="defect" style={item.result === "defect" ? { background: token.colorError, borderColor: token.colorError } : undefined}><CloseOutlined /> {t("checklists.defect")}</Radio.Button>
        <Radio.Button value="na">{t("checklists.na")}</Radio.Button>
      </Radio.Group>
    ) : item.kind === "date" ? (
      <DatePicker
        size={size}
        disabled={disabled}
        value={item.value_text ? dayjs(item.value_text) : null}
        onChange={(d) => onAnswer({ value_text: d ? d.format("YYYY-MM-DD") : null })}
      />
    ) : item.kind === "number" ? (
      <Space size={4}>
        {bad && <WarningOutlined style={{ color: token.colorWarning }} title={t("checklists.outOfRange")} />}
        <InputNumber
          size={size}
          style={{ width: 120 }}
          disabled={disabled}
          status={bad ? "warning" : undefined}
          addonAfter={item.unit ?? undefined}
          inputMode="decimal"
          value={number}
          onChange={(v) => setNumber(v)}
          onBlur={() => number !== item.value_number && onAnswer({ value_number: number })}
          onPressEnter={() => number !== item.value_number && onAnswer({ value_number: number })}
        />
      </Space>
    ) : null;

  return (
    <ItemPhotos
      taskId={taskId}
      itemId={item.id}
      photos={photos}
      disabled={disabled}
      userId={userId}
      isAdmin={isAdmin}
      render={({ button, thumbs }) => (
        <div style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: isMobile ? "8px 0" : "4px 0", minHeight: 34 }}>
            <span style={{ width: 22, flex: "none", display: "inline-flex", justifyContent: "center" }}>{lead}</span>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>{label}</div>
            {control}
            <Space size={0} style={{ marginLeft: "auto" }}>
              {item.kind !== "text" && (!disabled || item.note) && (
                <Button
                  type="text"
                  size="small"
                  icon={<MessageOutlined />}
                  title={t("checklists.addNote")}
                  aria-label={t("checklists.addNote")}
                  style={{ color: item.note ? token.colorPrimary : token.colorTextSecondary }}
                  onClick={() => setNoteOpen((v) => !v)}
                />
              )}
              {button}
              {onRemove && <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onRemove} aria-label={t("common.delete")} />}
            </Space>
          </div>
          {item.kind === "text" && (
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 5 }}
              size="small"
              style={{ margin: "0 0 6px 30px", width: "calc(100% - 30px)" }}
              disabled={disabled}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text !== (item.value_text ?? "") && onAnswer({ value_text: text.trim() || null })}
            />
          )}
          {item.kind !== "text" && showNote && (
            <Input.TextArea
              autoSize={{ minRows: 1, maxRows: 4 }}
              size="small"
              style={{ margin: "0 0 6px 30px", width: "calc(100% - 30px)" }}
              disabled={disabled}
              value={note}
              placeholder={item.result === "defect" ? t("checklists.defectNote") : t("checklists.note")}
              status={item.result === "defect" && !note.trim() ? "warning" : undefined}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (item.note ?? "") && onAnswer({ note: note.trim() || null })}
            />
          )}
          {thumbs}
          {(item.kind === "pass_fail" || item.kind === "number") && <div style={{ margin: "0 0 6px 30px" }}><ItemTicket item={item} taskId={taskId} photos={photos} canAct={!disabled} /></div>}
        </div>
      )}
    />
  );
};

const ChooseTemplateModal = ({ open, taskId, taskTypeId, current, hasAnswers, onClose, onDone }: { open: boolean; taskId: string; taskTypeId?: string; current: string | null; hasAnswers: boolean; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { data: templates } = useChecklistTemplates(open);
  const [templateId, setTemplateId] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!templateId) return;
    setBusy(true);
    const { error } = await supabaseClient.rpc("task_set_checklist_template", { p_task_id: taskId, p_template_id: templateId });
    setBusy(false);
    if (error) return message.error(errorText(error));
    setTemplateId(undefined);
    onDone();
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={busy} okButtonProps={{ disabled: !templateId }} title={current ? t("checklists.change") : t("checklists.choose")} okText={t("common.add")} destroyOnClose>
      <Select
        showSearch
        optionFilterProp="label"
        style={{ width: "100%" }}
        placeholder={t("checklists.chooseTemplate")}
        value={templateId}
        onChange={setTemplateId}
        options={templatesForType(templates ?? [], taskTypeId).filter((x) => x.id !== current).map((x) => ({ value: x.id, label: x.name }))}
        notFoundContent={t("checklists.noTemplates")}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>{current ? t("checklists.changeHint") : t("checklists.chooseHint")}</Typography.Paragraph>
      {current && hasAnswers && <Typography.Paragraph type="warning">{t("checklists.changeWarning")}</Typography.Paragraph>}
    </Modal>
  );
};

const SaveAsTemplateModal = ({ open, taskId, onClose }: { open: boolean; taskId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const submit = async () => {
    if (!name.trim()) return;
    const { error } = await supabaseClient.rpc("task_checklist_save_as_template", { p_task_id: taskId, p_name: name.trim() });
    if (error) return message.error(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
    message.success(t("checklists.templateSaved"));
    setName("");
    onClose();
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} title={t("checklists.saveAsTemplate")} destroyOnClose>
      <Typography.Paragraph type="secondary">{t("checklists.saveAsTemplateHint")}</Typography.Paragraph>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={200} onPressEnter={submit} />
    </Modal>
  );
};
