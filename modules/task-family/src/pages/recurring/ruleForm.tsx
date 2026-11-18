// Ported 1:1 from COMPASS (app/src/pages/recurring/ruleForm.tsx).
import { useTypeItemCategories } from "../../hooks/useItems";
import { useEffect, useRef } from "react";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { ItemSelect } from "../../components/itemSelect";
import { usePermissions } from "@rbp/core";
import { RichTextEditor } from "@rbp/module-messaging/src/richText.tsx";
import { App as AntdApp, Button, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Space, Switch, Typography } from "antd";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../../lib/modules";
import { supabaseClient } from "@rbp/core";
import { PRIORITIES } from "../../lib/domain";
import { AssetSelect } from "../../components/assetSelect";
import { AssigneeSelect, TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useDefaultTaskTypes, useTaskTypes } from "../tasks/taskForm";
import { useChecklistTemplates } from "../../hooks/useChecklistTemplates";
import { templatesForType } from "../../lib/checklists";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { OwnChecklistField, ownListLabels, type OwnList } from "../../components/checklist/ownChecklist";
import { withKeys } from "../../components/checklist/itemsEditor";
import type { ItemDef } from "../../lib/checklists";
import { errorText } from "@rbp/core";

export const SCHEDULE_KINDS = ["daily", "weekly", "monthly", "yearly", "operating_hours"] as const;

export type RuleRow = {
  id: string;
  name: string;
  description: string | null;
  task_type_id: string;
  asset_id: string | null;
  priority: string;
  team_id: string | null;
  assigned_user_id: string | null;
  assignment_mode: "team" | "user" | "rotate";
  schedule_kind: (typeof SCHEDULE_KINDS)[number];
  interval_count: number;
  operating_hours_interval: number | null;
  start_date: string;
  end_date: string | null;
  next_due_date: string | null;
  lead_days: number;
  repeat_mode: "fixed_schedule" | "after_completion";
  skip_if_open: boolean;
  active: boolean;
  checklist_template_id: string | null;
  checklist_items: ItemDef[] | null;
  last_generated_at: string | null;
  last_error: string | null;
};

type Values = {
  name: string;
  description?: string | null;
  task_type_id: string;
  asset_id?: string;
  priority: string;
  team_id?: string | null;
  assigned_user_id?: string | null;
  assignment_mode: "team" | "user" | "rotate";
  schedule_kind: (typeof SCHEDULE_KINDS)[number];
  interval_count: number;
  operating_hours_interval?: number;
  start_date: dayjs.Dayjs;
  end_date?: dayjs.Dayjs | null;
  next_due_date?: dayjs.Dayjs | null;
  lead_days: number;
  repeat_mode: "fixed_schedule" | "after_completion";
  skip_if_open: boolean;
  active: boolean;
  checklist_template_id?: string | null;
  own_list?: OwnList | null;
  items?: PlannedItem[];
};

type PlannedItem = { item_id?: string; quantity: number };

// Items every task of the series needs or orders (recurring_task_rule_items); copied onto each task. categoryIds: what
// the rule's task type offers.
const PlannedItemsField = ({ value = [], onChange, categoryIds }: { value?: PlannedItem[]; onChange?: (v: PlannedItem[]) => void; categoryIds?: string[] }) => {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<PlannedItem>) => onChange?.(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {value.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ItemSelect value={p.item_id} onChange={(id) => set(i, { item_id: id })} categoryIds={categoryIds} style={{ flex: 1, minWidth: 0 }} />
          <InputNumber min={0.01} value={p.quantity} onChange={(q) => set(i, { quantity: Number(q ?? 1) })} style={{ width: 90 }} />
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange?.([...value, { quantity: 1 }])}>{t("items.addPlanned")}</Button>
    </Space>
  );
};

// The task a series is started from (the "Repeat" button on a task): its fields become the rule's template.
export type RuleSourceTask = {
  id: string;
  title: string;
  description: string | null;
  task_type_id: string;
  priority: string;
  asset_id: string | null;
  team_id: string | null;
  assigned_user_id: string | null;
  checklist_template_id?: string | null;
  own_list?: OwnList | null;
};

// `simple` = the task-level view (Planner style): only what / how often / who. The next task is created
// when the current one is done; calendar mode, lead time and the "wait while open" switch stay hidden.
export const RuleFormModal = ({
  open,
  rule,
  assetId,
  task,
  simple = !!task,
  onClose,
  onSaved,
}: {
  open: boolean;
  rule?: RuleRow | null;
  assetId?: string | null;
  task?: RuleSourceTask | null;
  simple?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<Values>();
  const { message } = AntdApp.useApp();
  // The rule's planned items could not be read: saving must not replace them with the empty list in the form.
  const itemsLoadFailed = useRef(false);
  const { data: types } = useTaskTypes(true, true);
  const { ready: defaultsReady, pickDefaultType } = useDefaultTaskTypes();
  const { data: checklistTemplates } = useChecklistTemplates();
  const ruleTypeId = Form.useWatch("task_type_id", form);
  const kind = Form.useWatch("schedule_kind", form);
  const name = Form.useWatch("name", form);
  const mode = Form.useWatch("assignment_mode", form);
  const teamId = Form.useWatch("team_id", form);
  const hoursBased = kind === "operating_hours";
  const { has } = usePermissions();
  const hasAssets = useHasModule("assets");
  // Planned items only for task types that use or order items.
  const ruleItemMode = types?.find((x) => x.id === ruleTypeId)?.item_mode ?? "none";
  const showItems = has("items.view") && ruleItemMode !== "none";
  const { data: ruleCategoryIds } = useTypeItemCategories(showItems ? ruleTypeId : null);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    itemsLoadFailed.current = false;
    if (rule) {
      form.setFieldsValue({
        ...rule,
        description: rule.description ?? undefined,
        asset_id: rule.asset_id ?? undefined,
        checklist_template_id: rule.checklist_template_id ?? undefined,
        own_list: rule.checklist_items?.length ? { items: withKeys(rule.checklist_items) } : null,
        operating_hours_interval: rule.operating_hours_interval ?? undefined,
        start_date: dayjs(rule.start_date),
        end_date: rule.end_date ? dayjs(rule.end_date) : null,
        next_due_date: rule.next_due_date ? dayjs(rule.next_due_date) : null,
      });
      void supabaseClient
        .from("recurring_task_rule_items")
        .select("item_id, quantity")
        .eq("recurring_task_rule_id", rule.id)
        .then(({ data, error }) => {
          if (error) {
            itemsLoadFailed.current = true;
            message.error(t("recurring.itemsLoadFailed"));
            return;
          }
          form.setFieldValue("items", data.map((p) => ({ item_id: p.item_id, quantity: Number(p.quantity) })));
        });
    } else if (task) {
      form.setFieldsValue({
        name: task.title,
        description: task.description ?? undefined,
        task_type_id: task.task_type_id,
        priority: task.priority,
        asset_id: task.asset_id ?? undefined,
        checklist_template_id: task.checklist_template_id ?? undefined,
        own_list: task.own_list ?? null,
        team_id: task.team_id,
        assigned_user_id: task.assigned_user_id,
        assignment_mode: task.assigned_user_id && !task.team_id ? "user" : task.team_id ? "team" : "team",
        schedule_kind: "monthly",
        interval_count: 1,
        start_date: dayjs(),
        lead_days: 0,
        repeat_mode: "after_completion",
        skip_if_open: true,
        active: true,
      });
    } else {
      form.setFieldsValue({
        priority: "normal",
        assignment_mode: "team",
        schedule_kind: "monthly",
        interval_count: 1,
        start_date: dayjs(),
        lead_days: 0,
        repeat_mode: "fixed_schedule",
        skip_if_open: true,
        active: true,
        asset_id: assetId ?? undefined,
      });
    }
  }, [open, rule, assetId, task, form]);

  useEffect(() => {
    if (open && !rule && types?.length && defaultsReady && !form.getFieldValue("task_type_id")) {
      form.setFieldValue("task_type_id", pickDefaultType(types, !!assetId)?.id);
    }
  }, [open, rule, types, assetId, form, defaultsReady]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const payload = {
      name: v.name.trim(),
      description: v.description?.trim() || null,
      task_type_id: v.task_type_id,
      asset_id: v.asset_id ?? null,
      priority: v.priority,
      team_id: v.team_id ?? null,
      assignment_mode: v.assignment_mode,
      assigned_user_id: v.assignment_mode === "user" ? v.assigned_user_id ?? null : null,
      schedule_kind: v.schedule_kind,
      interval_count: hoursBased ? 1 : v.interval_count,
      operating_hours_interval: hoursBased ? v.operating_hours_interval ?? null : null,
      start_date: v.start_date.format("YYYY-MM-DD"),
      end_date: v.end_date ? v.end_date.format("YYYY-MM-DD") : null,
      // The next due date is editable for an existing time-based rule (e.g. to move an inspection).
      ...(rule && !hoursBased ? { next_due_date: v.next_due_date ? v.next_due_date.format("YYYY-MM-DD") : null } : {}),
      lead_days: hoursBased ? 0 : v.lead_days,
      repeat_mode: hoursBased ? "fixed_schedule" : task ? "after_completion" : v.repeat_mode,
      skip_if_open: v.skip_if_open,
      active: v.active,
      checklist_template_id: v.checklist_template_id ?? null,
      checklist_items: ownListLabels(v.own_list).length ? ownListLabels(v.own_list).map((label) => ({ label, kind: "check", required: false })) : null,
    };
    let error: { message: string } | null;
    let ruleId = rule?.id ?? null;
    if (rule) {
      ({ error } = await supabaseClient.from("recurring_task_rules").update(payload).eq("id", rule.id));
    } else if (task) {
      // The task becomes the first task of the series: link it, the rule then waits for its completion.
      const created = await supabaseClient.from("recurring_task_rules").insert(payload).select("id").single();
      error = created.error;
      if (created.data) {
        ruleId = created.data.id;
        ({ error } = await supabaseClient.from("recurring_task_rules").update({ next_due_date: null }).eq("id", created.data.id));
        if (!error) ({ error } = await supabaseClient.from("tasks").update({ recurring_task_rule_id: created.data.id }).eq("id", task.id));
      }
    } else {
      const created = await supabaseClient.from("recurring_task_rules").insert(payload).select("id").single();
      error = created.error;
      ruleId = created.data?.id ?? null;
    }
    if (!error && ruleId && showItems && !itemsLoadFailed.current) error = await savePlannedItems(ruleId, v.items ?? []);
    if (error) {
      form.setFields([{ name: "name", errors: [errorText(error)] }]);
      return;
    }
    onSaved();
  };

  // Replaces the rule's planned parts with the list in the form (the same part twice is added up).
  const savePlannedItems = async (ruleId: string, parts: PlannedItem[]) => {
    const merged = new Map<string, number>();
    for (const p of parts) if (p.item_id) merged.set(p.item_id, (merged.get(p.item_id) ?? 0) + (p.quantity || 1));
    const del = await supabaseClient.from("recurring_task_rule_items").delete().eq("recurring_task_rule_id", ruleId);
    if (del.error) return del.error;
    if (!merged.size) return null;
    const ins = await supabaseClient
      .from("recurring_task_rule_items")
      .insert([...merged].map(([item_id, quantity]) => ({ recurring_task_rule_id: ruleId, item_id, quantity })));
    return ins.error;
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} width={720} title={rule ? t("recurring.edit") : t("recurring.new")} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("fields.title")} rules={[{ required: true, max: 200 }]} extra={t("recurring.nameHint")}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="description" label={t("richText.instructions")}>
          <RichTextEditor placeholder={t("richText.instructionsPlaceholder")} minHeight={110} />
        </Form.Item>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="task_type_id" label={t("fields.taskType")} rules={[{ required: true }]} style={{ flex: "1 1 200px" }}>
            <Select options={sortByName(types).map((x) => ({ value: x.id, label: localName(x) }))} />
          </Form.Item>
          <Form.Item name="priority" label={t("fields.priority")} style={{ flex: "1 1 140px" }}>
            <Select options={PRIORITIES.map((x) => ({ value: x, label: t(`priority.${x}`) }))} />
          </Form.Item>
        </div>
        <Form.Item name="checklist_template_id" label={t("checklists.official")} extra={t("checklists.ruleHint")}>
          <Select allowClear showSearch optionFilterProp="label" placeholder={t("checklists.chooseTemplate")} options={templatesForType(checklistTemplates ?? [], ruleTypeId).map((x) => ({ value: x.id, label: x.name }))} />
        </Form.Item>
        <Form.Item name="own_list">
          <OwnChecklistField defaultName={name?.trim()} hint={t("checklists.seriesHint")} />
        </Form.Item>
        <Form.Item hidden={!hasAssets} name="asset_id" label={t("fields.asset")} rules={[{ required: hoursBased, message: t("recurring.hoursNeedAsset") }]} extra={t("tickets.assetOptional")}>
          <AssetSelect />
        </Form.Item>
        {showItems && (
          <Form.Item name="items" label={t("items.plannedItems")} extra={t(ruleItemMode === "order" ? "items.plannedItemsOrderHint" : "items.plannedItemsHint")}>
            <PlannedItemsField categoryIds={ruleCategoryIds} />
          </Form.Item>
        )}

        <Typography.Title level={5}>{t("recurring.when")}</Typography.Title>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="schedule_kind" label={t("recurring.kind")} style={{ flex: "1 1 200px" }}>
            <Select options={SCHEDULE_KINDS.filter((k) => hasAssets || k !== "operating_hours").map((k) => ({ value: k, label: t(`recurring.kinds.${k}`) }))} />
          </Form.Item>
          {hoursBased ? (
            <Form.Item name="operating_hours_interval" label={t("recurring.everyHours")} rules={[{ required: true }]} style={{ flex: "1 1 160px" }}>
              <InputNumber min={1} style={{ width: "100%" }} addonAfter="h" />
            </Form.Item>
          ) : (
            <Form.Item name="interval_count" label={t("recurring.every")} rules={[{ required: true }]} style={{ flex: "1 1 120px" }}>
              <InputNumber min={1} max={1000} style={{ width: "100%" }} />
            </Form.Item>
          )}
        </div>
        {hoursBased && <Typography.Paragraph type="secondary">{t("recurring.hoursHint")}</Typography.Paragraph>}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item name="start_date" label={t("recurring.startDate")} rules={[{ required: true }]} hidden={simple} style={{ flex: "1 1 160px" }}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="end_date" label={t("recurring.endDate")} style={{ flex: "1 1 160px" }}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          {rule && !hoursBased && !simple && (
            <Form.Item name="next_due_date" label={t("recurring.nextDue")} style={{ flex: "1 1 160px" }}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          )}
          {!hoursBased && !simple && (
            <Form.Item name="lead_days" label={t("recurring.leadDays")} tooltip={t("recurring.leadDaysHint")} style={{ flex: "1 1 140px" }}>
              <InputNumber min={0} max={365} style={{ width: "100%" }} />
            </Form.Item>
          )}
        </div>
        {!hoursBased && !simple && (
          <Form.Item name="repeat_mode" label={t("recurring.repeatMode")}>
            <Radio.Group>
              <Radio value="fixed_schedule">{t("recurring.modes.fixed_schedule")}</Radio>
              <Radio value="after_completion">{t("recurring.modes.after_completion")}</Radio>
            </Radio.Group>
          </Form.Item>
        )}
        {simple && !hoursBased && <Typography.Paragraph type="secondary">{t("recurring.afterCompletionHint")}</Typography.Paragraph>}
        <Form.Item hidden={simple} name="skip_if_open" label={t("recurring.skipIfOpen")} valuePropName="checked" extra={t("recurring.skipIfOpenHint")}>
          <Switch />
        </Form.Item>

        <Typography.Title level={5}>{t("recurring.who")}</Typography.Title>
        <Typography.Paragraph type="secondary">{t("recurring.whoHint")}</Typography.Paragraph>
        <Form.Item name="assignment_mode" label={t("recurring.assignment")}>
          <Radio.Group>
            <Radio value="team">{t("recurring.assignModes.team")}</Radio>
            <Radio value="user">{t("recurring.assignModes.user")}</Radio>
            <Radio value="rotate">{t("recurring.assignModes.rotate")}</Radio>
          </Radio.Group>
        </Form.Item>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Form.Item
            name="team_id"
            label={t("fields.team")}
            rules={[{ required: mode === "rotate", message: t("recurring.teamRequired") }]}
            style={{ flex: "1 1 220px" }}
          >
            <TeamSelect />
          </Form.Item>
          {mode === "user" && (
            <Form.Item name="assigned_user_id" label={t("fields.assignee")} rules={[{ required: true }]} style={{ flex: "1 1 220px" }}>
              <AssigneeSelect teamId={teamId} />
            </Form.Item>
          )}
        </div>
        <Form.Item name="active" label={t("fields.active")} valuePropName="checked" hidden={!rule}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};
