// After COMPASS app/src/pages/tasks/taskForm.tsx: useTaskTypes and TaskFormModal kept (type choice, default due date from
// the type, team + assignee, priority, description, task_create in one call). Cut with the module: asset, checklist template and own checklist, items, initiative, the type tiles (a plain select instead).
// New: the record a task belongs to (anchor), passed by the record's Tasks tab.
import { useEffect, useRef } from "react";
import { Checkbox, Col, DatePicker, Form, Input, Modal, Row, Select, Typography } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { errorText, supabaseClient } from "@rbp/core";
import { PRIORITIES } from "../../lib/domain";
import { AssigneeSelect, TeamSelect } from "../../components/assigneeFields";
import { localName, sortByName } from "../../lib/masterData";

type Values = {
  task_type_id: string;
  title: string;
  description?: string | null;
  priority: string;
  due_date?: dayjs.Dayjs;
  team_id?: string | null;
  assigned_user_id?: string | null;
  blocks_parent?: boolean;
};

export type TaskTypeRow = {
  id: string;
  key: string;
  name: string;
  name_de: string;
  description: string | null;
  short_description: string | null;
  active: boolean;
  default_team_id: string | null;
  blocks_parent: boolean;
  system_created: boolean;
  hidden_fields: string[];
};

// forCreate: only the types the user's roles may start (a role without a restriction may start all of them).
export function useTaskTypes(activeOnly = true, forCreate = false) {
  return useQuery({
    queryKey: ["task-types", activeOnly, forCreate],
    queryFn: async () => {
      let q = supabaseClient
        .from("task_types")
        .select("id, key, name, name_de, description, short_description, active, default_team_id, blocks_parent, system_created, hidden_fields")
        .order("name");
      if (activeOnly) q = q.eq("active", true);
      const rows = ((await q).data ?? []) as TaskTypeRow[];
      if (!forCreate) return rows;
      const allowed = new Set(((await supabaseClient.rpc("rls_my_task_type_ids")).data ?? []) as string[]);
      // A system-created type has its own entry point and is never picked by hand.
      return rows.filter((x) => allowed.has(x.id) && !x.system_created);
    },
  });
}

// The task type a new task starts with (setting default_task_type_id), else the first type the user may use.
function useDefaultTaskTypeId() {
  return useQuery({
    queryKey: ["default-task-type"],
    staleTime: 60_000,
    queryFn: async () =>
      ((await supabaseClient.from("app_settings").select("value").eq("key", "default_task_type_id").maybeSingle()).data?.value || null) as string | null,
  });
}

export const TaskFormModal = ({
  open,
  parent,
  anchor,
  onClose,
  onSaved,
}: {
  open: boolean;
  // Creates a subtask of this task (the anchor follows the parent's).
  parent?: { id: string; task_type_id: string; anchor_type: string | null; anchor_id: string | null } | null;
  // The record the new task belongs to (a specification, an order, ...).
  anchor?: { type: string; id: string; label?: string | null } | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<Values>();
  const { data: types } = useTaskTypes(true, true);
  const { data: defaultTypeId } = useDefaultTaskTypeId();
  // A new subtask offers only the types its parent's type allows (task_type_subtask_types).
  const { data: allowedSubtypes } = useQuery({
    queryKey: ["subtask-types", parent?.task_type_id],
    enabled: !!parent?.task_type_id,
    queryFn: async () =>
      ((await supabaseClient.from("task_type_subtask_types").select("subtask_type_id").eq("task_type_id", parent!.task_type_id)).data ?? []).map(
        (r) => r.subtask_type_id as string,
      ),
  });
  const choices = sortByName((types ?? []).filter((x) => !parent || (allowedSubtypes ?? []).includes(x.id)));
  const typeId = Form.useWatch("task_type_id", form);
  const teamId = Form.useWatch("team_id", form);
  const currentType = types?.find((x) => x.id === typeId);
  const typeBlocksParent = !!currentType?.blocks_parent;

  useEffect(() => {
    if (!open || form.getFieldValue("task_type_id") || choices.length === 0) return;
    form.setFieldValue("task_type_id", (choices.find((x) => x.id === defaultTypeId) ?? choices[0]).id);
  }, [open, choices, defaultTypeId, form]);

  // The due date starts with the type's default; once touched a change of the type no longer overwrites it.
  const dueTouched = useRef(false);
  useEffect(() => {
    if (open) dueTouched.current = false;
  }, [open]);
  useEffect(() => {
    if (!open || !typeId || dueTouched.current) return;
    let alive = true;
    void supabaseClient.rpc("default_due_date", { p_task_type_id: typeId }).then(({ data }) => {
      if (alive && !dueTouched.current) form.setFieldValue("due_date", data ? dayjs(data as string) : undefined);
    });
    return () => {
      alive = false;
    };
  }, [open, typeId, form]);
  useEffect(() => {
    if (open && parent) form.setFieldValue("blocks_parent", typeBlocksParent);
  }, [open, parent, typeBlocksParent, form]);

  const anchorType = anchor?.type ?? parent?.anchor_type ?? null;
  const anchorId = anchor?.id ?? parent?.anchor_id ?? null;

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const { data: taskId, error } = await supabaseClient.rpc("task_create", {
      p_task_type_id: v.task_type_id,
      p_title: v.title.trim(),
      p_due_date: v.due_date ? v.due_date.format("YYYY-MM-DD") : null,
      p_priority: v.priority,
      p_description: v.description?.trim() || null,
      p_anchor_type: anchorType,
      p_anchor_id: anchorId,
      p_team_id: v.team_id ?? null,
      p_assigned_user_id: v.assigned_user_id ?? null,
      p_parent_task_id: parent?.id ?? null,
      // The database gives a new subtask the default of its type; only a different choice is passed.
      p_blocks_parent: parent && !!v.blocks_parent !== typeBlocksParent ? !!v.blocks_parent : null,
    });
    if (error) {
      form.setFields([{ name: "title", errors: [errorText(error, { known: { "You are not allowed to create tasks of this type": "tasks.errors.typeNotAllowed" } })] }]);
      return;
    }
    form.resetFields();
    onSaved(taskId as string);
  };

  return (
    // forceRender: the form stays connected while closed, so the type preselection (an effect) always reaches it.
    <Modal
      open={open}
      forceRender
      title={parent ? t("tasks.newSubtask") : t("tasks.new")}
      okText={t("tasks.create")}
      onOk={() => void submit()}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      width={640}
    >
      {anchor?.label && <Typography.Paragraph type="secondary">{t("tasks.forRecord", { record: anchor.label })}</Typography.Paragraph>}
      {open && types && choices.length === 0 && <Typography.Paragraph type="warning">{t("tasks.noTypes")}</Typography.Paragraph>}
      <Form<Values> form={form} layout="vertical" initialValues={{ priority: "normal" }}>
        <Form.Item name="task_type_id" label={t("tasks.fields.type")} rules={[{ required: true }]} extra={currentType?.short_description ?? currentType?.description ?? undefined}>
          <Select options={choices.map((x) => ({ value: x.id, label: localName(x) }))} />
        </Form.Item>
        <Form.Item name="title" label={t("tasks.fields.title")} rules={[{ required: true, whitespace: true, max: 200 }]}>
          <Input autoFocus maxLength={200} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="due_date" label={t("tasks.fields.dueDate")}>
              <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" onChange={() => (dueTouched.current = true)} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="priority" label={t("tasks.fields.priority")}>
              <Select options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          {!currentType?.hidden_fields?.includes("team") && (
            <Col xs={24} sm={12}>
              <Form.Item name="team_id" label={t("tasks.fields.team")}>
                <TeamSelect onChange={() => form.setFieldValue("assigned_user_id", null)} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12}>
            <Form.Item name="assigned_user_id" label={t("tasks.fields.assignee")} extra={t("tasks.assigneeHint")}>
              <AssigneeSelect teamId={teamId} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label={t("tasks.fields.description")}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} />
        </Form.Item>
        {parent && (
          <Form.Item name="blocks_parent" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>{t("tasks.blocksParent")}</Checkbox>
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};
