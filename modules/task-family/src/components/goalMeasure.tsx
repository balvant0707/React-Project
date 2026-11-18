// Ported 1:1 from COMPASS (app/src/components/goalMeasure.tsx).
import { useState } from "react";
import { Alert, App as AntdApp, Button, Card, Form, Input, InputNumber, Modal, Progress, Select, Space, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { GOAL_STATUSES, formatValue, hasMeasure, isStale, percent, type GoalRow } from "../lib/goals";
import { GoalStatusTag } from "./goalStatus";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

// The measure is the first thing under the title of a goal: what is measured, start -> now -> target in the unit,
// progress, last check-in, source. A goal without a measure says so explicitly (~/maintenance_tool/docs/goals.md).
export const GoalMeasure = ({ goal, canCheck, canEdit, onDefine }: { goal: GoalRow; canCheck: boolean; canEdit: boolean; onDefine: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ value?: number; status?: string; comment?: string }>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const measured = hasMeasure(goal);
  const pct = percent(goal.progress);
  const stale = isStale(goal);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const { error } = await supabaseClient.rpc("goal_check_in", {
      p_goal_id: goal.id,
      p_value: measured ? v.value ?? null : null,
      p_status: v.status ?? null,
      p_comment: v.comment ?? null,
    });
    setSaving(false);
    if (error) return message.error(errorText(error));
    setOpen(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["goal", goal.id] }),
      queryClient.invalidateQueries({ queryKey: ["goals"] }),
      queryClient.invalidateQueries({ queryKey: ["feed", "goals", goal.id] }),
      queryClient.invalidateQueries({ queryKey: ["task-contribution"] }),
    ]);
  };

  const openCheckIn = () => {
    form.resetFields();
    form.setFieldsValue({ value: goal.current_value ?? undefined, status: goal.status ?? undefined });
    setOpen(true);
  };

  return (
    <Card size="small" style={{ marginTop: 12 }} title={t("goals.measure")} extra={canCheck && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCheckIn}>{t("goals.addCheckIn")}</Button>}>
      {measured ? (
        <>
          <Typography.Text strong style={{ fontSize: 16 }}>{goal.measure_label}</Typography.Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 40px", margin: "12px 0" }}>
            <ValueBlock label={t("goals.start")} value={formatValue(goal.start_value, goal.measure_unit)} />
            <ValueBlock label={t("goals.now")} value={formatValue(goal.current_value, goal.measure_unit)} strong />
            <ValueBlock label={t("goals.target")} value={formatValue(goal.target_value, goal.measure_unit)} />
          </div>
          <Progress percent={pct ?? 0} status={pct === 100 ? "success" : "active"} />
          <Space size={16} wrap style={{ marginTop: 4 }}>
            <GoalStatusTag status={goal.status} />
            <Typography.Text type="secondary">
              {goal.last_check_in_at ? t("goals.lastCheckIn", { date: formatDate(goal.last_check_in_at) }) : t("goals.noCheckIn")}
            </Typography.Text>
            {stale && <Tag color="orange">{t("goals.stale")}</Tag>}
            <Typography.Text type="secondary">{t("goals.sourceManual")}</Typography.Text>
          </Space>
        </>
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            message={t("goals.noMeasure")}
            description={pct != null ? t("goals.derivedProgress", { percent: pct }) : t("goals.noProgress")}
            action={canEdit && <Button size="small" onClick={onDefine}>{t("goals.defineMeasure")}</Button>}
          />
          {pct != null && <Progress percent={pct} style={{ marginTop: 12 }} />}
        </>
      )}
      <Modal open={open} title={t("goals.addCheckIn")} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={saving} destroyOnClose>
        <Form form={form} layout="vertical">
          {measured && (
            <Form.Item name="value" label={`${t("goals.now")} (${goal.measure_unit})`} extra={t("goals.checkInHint", { measure: goal.measure_label })} rules={[{ required: true }]}>
              <InputNumber style={{ width: 200 }} precision={2} />
            </Form.Item>
          )}
          <Form.Item name="status" label={t("fields.status")}>
            <Select allowClear options={GOAL_STATUSES.map((s) => ({ value: s, label: t(`goals.status.${s}`) }))} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="comment" label={t("fields.comment")}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

const ValueBlock = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div>
    <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>{label}</Typography.Text>
    <Typography.Text strong={strong} style={{ fontSize: strong ? 22 : 16 }}>{value}</Typography.Text>
  </div>
);
