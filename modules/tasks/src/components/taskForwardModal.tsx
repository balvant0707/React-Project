// Copied from COMPASS app/src/components/taskForwardModal.tsx. Change: imports from @rbp/core; destroyOnHidden (antd 5.25+).
import { useState } from "react";
import { App as AntdApp, Form, Input, Modal, Select, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { errorText, supabaseClient, useUsers, userLabel, usersFor } from "@rbp/core";

type Values = { user_id: string; comment?: string };

// "Forward": hands the current step to another person (RPC task_forward). On a step with a rule the task's assignee
// stays accountable; on a step without one the task gets a new assignee. Forwarding to oneself takes the step over.
export const TaskForwardModal = ({
  open,
  task,
  mode,
  approval,
  onClose,
  onDone,
}: {
  open: boolean;
  task: { id: string; created_by_user_id: string | null };
  mode: "step" | "assignee";
  // An approval by the supervisor never goes to the requester.
  approval: boolean;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { data: users } = useUsers();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const { error } = await supabaseClient.rpc("task_forward", { p_task_id: task.id, p_user_id: v.user_id, p_comment: v.comment?.trim() || null });
    setSaving(false);
    if (error) {
      const known: Record<string, string> = {
        "The step is already with this person": "tasks.forward.errors.already",
        "The task is already assigned to this person": "tasks.forward.errors.already",
        "An approval cannot be forwarded to the requester": "tasks.forward.errors.requester",
        "You are not allowed to forward this task": "tasks.forward.errors.notAllowed",
      };
      return message.error(errorText(error, { known }));
    }
    message.success(t("tasks.forward.done"));
    form.resetFields();
    onDone();
  };

  return (
    <Modal open={open} title={t("tasks.forward.title")} okText={t("tasks.forward.ok")} confirmLoading={saving} onOk={() => void save()} onCancel={onClose} destroyOnHidden>
      <Typography.Paragraph type="secondary">{t(mode === "step" ? "tasks.forward.hintStep" : "tasks.forward.hintAssignee")}</Typography.Paragraph>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="user_id" label={t("tasks.forward.to")} rules={[{ required: true }]}>
          <Select
            autoFocus
            showSearch
            optionFilterProp="label"
            options={usersFor(users).filter((u) => !(approval && u.id === task.created_by_user_id)).map((u) => ({ value: u.id, label: userLabel(u) }))}
          />
        </Form.Item>
        <Form.Item name="comment" label={t("tasks.forward.comment")} rules={[{ max: 2000 }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={t("tasks.forward.commentPlaceholder")} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
