// Ported 1:1 from COMPASS (app/src/pages/goals/goalForm.tsx).
import { useEffect, useMemo } from "react";
import { App as AntdApp, Alert, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Switch } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { GoalSelect } from "../../components/goalSelect";
import { TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useUsers, usersFor } from "@rbp/core";
import { fetchGoals, hasMeasure, type GoalRow } from "../../lib/goals";
import { errorText } from "@rbp/core";

type Values = {
  title: string;
  description?: string;
  parent_goal_id?: string | null;
  owner_user_id?: string | null;
  team_id?: string | null;
  due_date?: dayjs.Dayjs | null;
  has_measure: boolean;
  measure_label?: string;
  measure_unit?: string;
  start_value?: number;
  target_value?: number;
};

// Create or edit a goal. The measure switch makes label, unit, start and target required (~/maintenance_tool/docs/goals.md).
export const GoalFormModal = ({
  open,
  goal,
  parentId,
  forceMeasure,
  onClose,
  onSaved,
}: {
  open: boolean;
  goal?: GoalRow | null;
  parentId?: string | null;
  forceMeasure?: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<Values>();
  const { data: users } = useUsers();
  const { data: goals } = useQuery({ queryKey: ["goals"], queryFn: fetchGoals, staleTime: 30_000 });
  const withMeasure = Form.useWatch("has_measure", form);
  const ownerId = Form.useWatch("owner_user_id", form);

  // A goal cannot move below itself or its own sub-goals.
  const blocked = useMemo(() => {
    const out = new Set<string>();
    if (!goal) return out;
    out.add(goal.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of goals ?? []) if (g.parent_goal_id && out.has(g.parent_goal_id) && !out.has(g.id)) (out.add(g.id), (grew = true));
    }
    return out;
  }, [goal, goals]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      goal
        ? {
            title: goal.title,
            description: goal.description ?? undefined,
            parent_goal_id: goal.parent_goal_id,
            owner_user_id: goal.owner_user_id,
            team_id: goal.team_id,
            due_date: goal.due_date ? dayjs(goal.due_date) : null,
            has_measure: hasMeasure(goal) || !!forceMeasure,
            measure_label: goal.measure_label ?? undefined,
            measure_unit: goal.measure_unit ?? undefined,
            start_value: goal.start_value ?? undefined,
            target_value: goal.target_value ?? undefined,
          }
        : { has_measure: false, parent_goal_id: parentId ?? null },
    );
  }, [open, goal, parentId, forceMeasure, form]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const measure: Record<string, unknown> = v.has_measure
      ? {
          measure_label: v.measure_label!.trim(),
          measure_unit: v.measure_unit!.trim(),
          start_value: v.start_value!,
          target_value: v.target_value!,
          // A new measure starts at its start value; an existing one keeps the latest check-in value.
          current_value: goal && hasMeasure(goal) ? goal.current_value : v.start_value!,
        }
      : { measure_label: null, measure_unit: null, start_value: null, target_value: null, current_value: null };
    const row: Record<string, unknown> = {
      title: v.title.trim(),
      description: v.description?.trim() || null,
      parent_goal_id: v.parent_goal_id ?? null,
      owner_user_id: v.owner_user_id ?? null,
      team_id: v.team_id ?? null,
      due_date: v.due_date ? v.due_date.format("YYYY-MM-DD") : null,
      ...measure,
    };
    const { data, error } = goal
      ? await supabaseClient.from("goals").update(row).eq("id", goal.id).select("id").single()
      : await supabaseClient.from("goals").insert(row).select("id").single();
    if (error) {
      message.error(errorText(error));
      return;
    }
    onSaved(data.id);
  };

  return (
    <Modal open={open} title={goal ? t("goals.edit") : t("goals.new")} onCancel={onClose} onOk={submit} destroyOnClose width={620}>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label={t("fields.title")} rules={[{ required: true, max: 200 }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t("fields.description")}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Space size={16} wrap style={{ width: "100%" }} align="start">
          <Form.Item name="parent_goal_id" label={t("goals.parent")} style={{ minWidth: 260 }}>
            <GoalSelect exclude={blocked} placeholder={t("goals.noParent")} />
          </Form.Item>
          <Form.Item name="owner_user_id" label={t("goals.owner")} style={{ minWidth: 220 }}>
            <Select allowClear showSearch optionFilterProp="label" options={usersFor(users, ownerId).map((u) => ({ value: u.id, label: u.name ?? u.email }))} />
          </Form.Item>
          <Form.Item name="team_id" label={t("fields.team")} style={{ minWidth: 200 }}>
            <TeamSelect />
          </Form.Item>
          <Form.Item name="due_date" label={t("goals.dueDate")}>
            <DatePicker />
          </Form.Item>
        </Space>
        <Form.Item name="has_measure" label={t("goals.hasMeasure")} valuePropName="checked">
          <Switch />
        </Form.Item>
        {withMeasure ? (
          <>
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("goals.measureHint")} />
            <Form.Item name="measure_label" label={t("goals.measureLabel")} extra={t("goals.measureLabelHint")} rules={[{ required: true, max: 200 }]}>
              <Input />
            </Form.Item>
            <Space size={16} wrap align="start">
              <Form.Item name="measure_unit" label={t("goals.unit")} rules={[{ required: true, max: 20 }]}>
                <Input style={{ width: 100 }} placeholder="h, %, EUR" />
              </Form.Item>
              <Form.Item name="start_value" label={t("goals.start")} rules={[{ required: true }]}>
                <InputNumber precision={2} style={{ width: 140 }} />
              </Form.Item>
              <Form.Item name="target_value" label={t("goals.target")} rules={[{ required: true }]}>
                <InputNumber precision={2} style={{ width: 140 }} />
              </Form.Item>
            </Space>
          </>
        ) : (
          <Alert type="warning" showIcon message={t("goals.noMeasureHint")} />
        )}
      </Form>
    </Modal>
  );
};
