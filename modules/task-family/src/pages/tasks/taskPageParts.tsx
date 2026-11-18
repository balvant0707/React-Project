// Ported 1:1 from COMPASS (app/src/pages/tasks/taskPageParts.tsx).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Radio, Typography } from "antd";
import dayjs from "dayjs";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { StepAction, TaskTypeStep } from "../../lib/domain";
import type { ChecklistItem } from "../../lib/checklists";
import { actionLabel } from "@rbp/module-tasks/src/lib/routing.ts";
import type { TaskPageRow } from "./useTaskPage";

export type ActionValues = Record<string, any>;
// items = the required checklist items of the step that are still open (asked for an action that moves the task on).
export type PendingAction = { action: StepAction; step: TaskTypeStep; items: ChecklistItem[] };

// Breadcrumb: a task somewhere below an initiative belongs to the initiatives menu, not to the task list.
export const TaskBreadcrumb = ({ task, rootTask, inInitiative }: { task: TaskPageRow; rootTask?: { id: string; task_number: number; title: string; is_initiative: boolean } | null; inInitiative: boolean }) => {
  const { t } = useTranslation();
  const isInitiativeChild = !!task.parent_task_id && !!rootTask?.is_initiative;
  return (
    <div style={{ marginBottom: 8 }}>
      {inInitiative || isInitiativeChild ? <Link to="/initiatives">{t("nav.initiatives")}</Link> : <Link to="/tasks">{t("nav.tasks")}</Link>}
      {/* A task below an initiative: the initiative first (its page), then the direct parent. */}
      {isInitiativeChild && rootTask && (
        <>
          {" / "}
          <Link to={`/tasks/${rootTask.id}`}>#{rootTask.task_number} {rootTask.title}</Link>
        </>
      )}
      {task.parent_task_id && (task.parent_task_id !== task.root_task_id || !isInitiativeChild) && (
        <>
          {" / "}
          <Link to={`/tasks/${task.parent_task_id}`}>#{task.parent_task_number} {task.parent_title}</Link>
        </>
      )}
    </div>
  );
};

// Completing without hours asks for them once; the answer can be skipped.
export const EffortModal = ({ onSkip, onSave, onCancel }: { onSkip: () => void; onSave: (hours: number) => Promise<boolean>; onCancel: () => void }) => {
  const { t } = useTranslation();
  const [hours, setHours] = useState<number | null>(null);
  return (
    <Modal
      open
      title={t("effort.askTitle")}
      onCancel={onCancel}
      footer={[
        <Button key="skip" onClick={onSkip}>
          {t("effort.skip")}
        </Button>,
        <Button key="save" type="primary" disabled={hours == null} onClick={() => void onSave(hours!)}>
          {t("effort.saveAndComplete")}
        </Button>,
      ]}
    >
      <Typography.Paragraph strong>{t("effort.completesHint")}</Typography.Paragraph>
      <Typography.Paragraph type="secondary">{t("effort.askHint")}</Typography.Paragraph>
      <InputNumber autoFocus min={0} max={9999} step={0.5} precision={1} addonAfter="h" value={hours} onChange={(v) => setHours(v)} style={{ width: 140 }} />
    </Modal>
  );
};

// The dialog of an action with a required comment or with required checklist items of the step still open: the items
// are answered here (saved before the action runs), the full list stays in the checklist.
export const ActionDialog = ({ pending, onCancel, onSubmit }: { pending: PendingAction; onCancel: () => void; onSubmit: (action: StepAction, values: ActionValues) => Promise<void> }) => {
  const { t, i18n } = useTranslation();
  const [form] = Form.useForm<ActionValues>();
  return (
    <Modal
      open
      title={actionLabel(t, i18n.language, pending.action)}
      onCancel={onCancel}
      onOk={async () => {
        const values = await form.validateFields().catch(() => null);
        if (values) await onSubmit(pending.action, values);
      }}
    >
      <Form form={form} layout="vertical">
        {pending.items.length > 0 && <Typography.Paragraph type="secondary">{t("checklists.stepItemsAsk")}</Typography.Paragraph>}
        {pending.items.map((item) => (
          <Form.Item
            key={item.id}
            name={`item:${item.id}`}
            label={item.kind === "check" ? undefined : item.label}
            extra={item.hint ?? undefined}
            valuePropName={item.kind === "check" ? "checked" : "value"}
            rules={[item.kind === "check" ? { validator: (_, v) => (v ? Promise.resolve() : Promise.reject(new Error(t("checklists.stepItemRequired")))) } : { required: true, message: t("checklists.stepItemRequired") }]}
          >
            {itemInput(item, t)}
          </Form.Item>
        ))}
        <Form.Item name="comment" label={t("fields.comment")} rules={[{ required: !!pending.action.requires_comment }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const itemInput = (item: ChecklistItem, t: TFunction) => {
  switch (item.kind) {
    case "check":
      return <Checkbox>{item.label}</Checkbox>;
    case "pass_fail":
      return (
        <Radio.Group optionType="button" buttonStyle="solid">
          <Radio.Button value="ok">{t("checklists.ok")}</Radio.Button>
          <Radio.Button value="defect">{t("checklists.defect")}</Radio.Button>
          <Radio.Button value="na">{t("checklists.na")}</Radio.Button>
        </Radio.Group>
      );
    case "number":
      return <InputNumber style={{ width: "100%" }} addonAfter={item.unit ?? undefined} />;
    case "date":
      return <DatePicker style={{ width: "100%" }} />;
    default:
      return <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} />;
  }
};

// The answer columns of an item from the dialog value.
export const itemAnswer = (item: ChecklistItem, value: unknown) => {
  switch (item.kind) {
    case "check":
      return { done: !!value };
    case "pass_fail":
      return { result: value as string };
    case "number":
      return { value_number: value as number };
    case "date":
      return { value_text: dayjs.isDayjs(value) ? value.format("YYYY-MM-DD") : null };
    default:
      return { value_text: String(value ?? "").trim() || null };
  }
};
