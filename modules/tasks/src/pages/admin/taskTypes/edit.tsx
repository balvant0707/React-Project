// Ported from COMPASS app/src/pages/admin/taskTypes/edit.tsx (cut parts listed there).
import { useEffect, useState } from "react";
import { App as AntdApp, Button, Card, Checkbox, Collapse, Divider, Form, Input, InputNumber, Select, Space, Spin, Switch, Tabs, Tag, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Show, errorText, supabaseClient, usePageBannerTitle, useRoles, useTeams, useWarnAboutChange } from "@rbp/core";
import { FALLBACK_KINDS, STEP_STATUSES, STEP_TEAM_SCOPES, type StepTeamScope, type StepAction, type StepAssigneeKind, type TaskTypeStep } from "../../../lib/domain";
import { OwnerSelect, TeamSelect } from "../../../components/assigneeFields";
import { useTaskTypes } from "../../tasks/taskForm";
import { localName, pickName, sortByName } from "../../../lib/masterData";
import { stepAssigneeText } from "../../../lib/routing";
import { RouteOverview, WhoCanStart } from "./routeOverview";

// The tab a form field lives on, to show it when validation fails there.
const GENERAL_FIELDS = ["name", "name_de", "key", "active", "track_as_request", "description", "owner_user_id"];
const START_FIELDS = ["show_on_start_page", "short_description", "keywords"];
const tabOfField = (field: string | number) => (field === "steps" ? "route" : GENERAL_FIELDS.includes(String(field)) ? "general" : START_FIELDS.includes(String(field)) ? "start" : "defaults");

export type TypeRow = {
  id: string;
  key: string;
  name: string;
  name_de: string;
  description: string | null;
  short_description: string | null;
  keywords: string | null;
  show_on_start_page: boolean;
  blocks_parent: boolean;
  active: boolean;
  default_due_days: number | null;
  default_team_id: string | null;
  owner_user_id: string | null;
  hidden_fields: string[];
  track_as_request: boolean;
  icon: string | null;
  color: string | null;
};

// The steps that can find nobody and so take a fallback role: the person rules, and a role within a team.
const hasFallback = (s?: Pick<FormStep, "assignee_kind" | "assignee_team_scope" | "assignee_role_id">) =>
  !!s && (FALLBACK_KINDS.includes(s.assignee_kind) || (s.assignee_kind === "role" && !!s.assignee_role_id && !!s.assignee_team_scope));

export type FormStep = {
  id?: string;
  step_key: string;
  name: string;
  name_de: string;
  status: string;
  assignee_role_id?: string | null;
  assignee_kind: StepAssigneeKind;
  assignee_level: number;
  fallback_role_id?: string | null;
  assignee_team_id?: string | null;
  assignee_team_scope?: StepTeamScope | null;
  actions: (StepAction & { to: string | null })[];
  is_decision?: boolean;
};

type FormValues = {
  key: string;
  track_as_request?: boolean;
  name: string;
  name_de: string;
  description?: string;
  short_description?: string;
  keywords?: string;
  show_on_start_page: boolean;
  blocks_parent: boolean;
  active: boolean;
  default_due_days?: number | null;
  default_team_id?: string | null;
  owner_user_id?: string | null;
  hidden_fields?: string[];
  // Quick links: task types offered as one-click subtasks on a task of this type.
  subtask_type_ids?: string[];
  steps: FormStep[];
};

// Optional fields of the task page a type can hide (planning date, title, due date, priority and assignee always show).
const HIDEABLE_FIELDS = ["team"] as const;
const FINISH = "__finish__";

const KEY_RULE = { pattern: /^[a-z][a-z0-9_]*$/, message: "a-z, 0-9, _" };
const ACTION_GRID = { display: "grid", gridTemplateColumns: "140px 230px 110px 90px 1fr 1fr 24px", gap: 8, alignItems: "center", marginBottom: 8 } as const;

// Create / edit a task type on its own page (/admin/task-types/new, /admin/task-types/:id): start page texts,
// defaults, who may start it, and the route - an ordered list of steps with who works each, the required fields and
// the named decisions that lead to other steps.
export const TaskTypeEdit = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { setWarnWhen } = useWarnAboutChange();
  const { data: roles } = useRoles();
  const { data: groups } = useTeams();
  const { data: allTypes } = useTaskTypes(true);
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  const { data: loaded, isLoading } = useQuery({
    queryKey: ["admin-task-type", id],
    enabled: !isNew,
    queryFn: async () => {
      const [{ data: type, error }, { data: steps }, { data: links }] = await Promise.all([
        supabaseClient.from("task_types").select("id, key, name, name_de, description, short_description, keywords, show_on_start_page, blocks_parent, active, default_due_days, default_team_id, owner_user_id, hidden_fields, track_as_request").eq("id", id!).single(),
        supabaseClient.from("task_type_steps").select("*").eq("task_type_id", id!).order("step_order"),
        supabaseClient.from("task_type_subtask_types").select("subtask_type_id").eq("task_type_id", id!).order("sort_order"),
      ]);
      if (error) throw error;
      return { type: type as TypeRow, steps: (steps ?? []) as TaskTypeStep[], subtaskTypeIds: (links ?? []).map((l) => l.subtask_type_id as string) };
    },
  });

  useEffect(() => {
    form.resetFields();
    if (isNew) {
      form.setFieldsValue({
        key: "",
        name: "",
        name_de: "",
        active: true,
        show_on_start_page: false,
        blocks_parent: false,
        track_as_request: false,
        steps: [{ step_key: "work", name: "Work", name_de: "Bearbeitung", status: "open", assignee_kind: "role", assignee_level: 1, actions: [{ key: "complete", to: null }], is_decision: false }],
      });
      return;
    }
    if (!loaded) return;
    const { type, steps, subtaskTypeIds } = loaded;
    form.setFieldsValue({
      key: type.key,
      name: type.name,
      name_de: type.name_de,
      description: type.description ?? undefined,
      short_description: type.short_description ?? undefined,
      keywords: type.keywords ?? undefined,
      show_on_start_page: type.show_on_start_page,
      blocks_parent: type.blocks_parent,
      active: type.active,
      default_due_days: type.default_due_days,
      default_team_id: type.default_team_id,
      owner_user_id: type.owner_user_id,
      hidden_fields: type.hidden_fields ?? [],
      track_as_request: type.track_as_request,
      subtask_type_ids: subtaskTypeIds,
      steps: steps.map((s) => ({
        id: s.id,
        step_key: s.step_key,
        name: s.name,
        name_de: s.name_de,
        status: s.status,
        assignee_role_id: s.assignee_role_id,
        assignee_kind: s.assignee_kind ?? "role",
        assignee_level: s.assignee_level ?? 1,
        fallback_role_id: s.fallback_role_id,
        assignee_team_id: s.assignee_team_id,
        assignee_team_scope: s.assignee_team_scope,
        actions: s.actions,
        is_decision: s.is_decision,
      })),
    });
  }, [isNew, loaded, form]);

  const stepsWatch = Form.useWatch("steps", form) as FormStep[] | undefined;
  usePageBannerTitle(isNew ? t("taskTypes.new") : localName(loaded?.type) || undefined);

  const validate = (v: FormValues): string | null => {
    if (!v.steps?.length) return t("taskTypes.errors.noSteps");
    const keys = v.steps.map((s) => s.step_key);
    if (new Set(keys).size !== keys.length) return t("taskTypes.errors.duplicateStepKey");
    for (const s of v.steps) {
      if (!s.actions?.length) return t("taskTypes.errors.noActions", { step: s.name });
      if (s.is_decision && s.assignee_kind === "role" && !s.assignee_role_id) return t("taskTypes.errors.decisionNeedsAssignee", { step: s.name });
      // A scope left over after the role was cleared is hidden and not saved (see the rows below), so only a visible
      // "fixed team" without a team is an error.
      if (s.assignee_kind === "role" && s.assignee_role_id && s.assignee_team_scope === "fixed" && !s.assignee_team_id) return t("taskTypes.errors.teamScopeNeedsTeam", { step: s.name });
      if (s.is_decision && (s.assignee_kind === "task_team" || (s.assignee_kind === "role" && s.assignee_role_id && s.assignee_team_scope === "task_team"))) return t("taskTypes.errors.decisionTaskTeam", { step: s.name });
      if (s.is_decision && s.actions.length < 2) return t("taskTypes.errors.decisionNeedsChoice", { step: s.name });
      for (const a of s.actions) {
        // An untouched "Leads to" is undefined and shows as "Finish the task": the same as null.
        if (a.to != null && !keys.includes(a.to)) return t("taskTypes.errors.unknownTarget", { step: s.name, action: a.key });
      }
    }
    // Every step must be reachable from the first one, and every step must have a way to finish the task.
    const targets = (key: string) => v.steps.find((s) => s.step_key === key)?.actions.map((a) => a.to ?? null) ?? [];
    const reached = new Set<string>([keys[0]]);
    for (const queue = [keys[0]]; queue.length; ) {
      for (const to of targets(queue.pop()!)) {
        if (to !== null && !reached.has(to)) {
          reached.add(to);
          queue.push(to);
        }
      }
    }
    const unreachable = v.steps.find((s) => !reached.has(s.step_key));
    if (unreachable) return t("taskTypes.errors.unreachable", { step: unreachable.name });
    const finishing = new Set(v.steps.filter((s) => s.actions.some((a) => a.to == null)).map((s) => s.step_key));
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of v.steps) {
        if (!finishing.has(s.step_key) && s.actions.some((a) => a.to != null && finishing.has(a.to))) {
          finishing.add(s.step_key);
          grew = true;
        }
      }
    }
    const stuck = v.steps.find((s) => !finishing.has(s.step_key));
    if (stuck) return t("taskTypes.errors.noWayOut", { step: stuck.name });
    return null;
  };

  const [activeTab, setActiveTab] = useState("general");

  const save = async () => {
    const v = await form.validateFields().catch((e: { errorFields?: { name: (string | number)[] }[] }) => {
      const first = e?.errorFields?.[0]?.name;
      // A failing field may sit in a folded step card: open every step with an error, then scroll once it is shown.
      const failing = new Set((e?.errorFields ?? []).filter((f) => f.name[0] === "steps" && typeof f.name[1] === "number").map((f) => f.name[1] as number));
      setErrorSteps([...failing]);
      if (first) setActiveTab(tabOfField(first[0]));
      if (first) setTimeout(() => form.scrollToField(first, { behavior: "smooth", block: "center" }), 150);
      return null;
    });
    if (!v) return;
    const problem = validate(v);
    if (problem) {
      message.error(problem);
      return;
    }
    setSaving(true);
    try {
      const typeFields = {
        name: v.name.trim(),
        name_de: v.name_de.trim(),
        description: v.description?.trim() || null,
        short_description: v.short_description?.trim() || null,
        keywords: v.keywords?.trim() || null,
        show_on_start_page: v.show_on_start_page,
        blocks_parent: v.blocks_parent,
        active: v.active,
        track_as_request: !!v.track_as_request,
        default_due_days: v.default_due_days ?? null,
        default_team_id: v.default_team_id ?? null,
        hidden_fields: v.hidden_fields ?? [],
        ...(isNew ? {} : { owner_user_id: v.owner_user_id ?? null }),
      };
      let typeId: string;
      if (isNew) {
        const { data, error } = await supabaseClient.from("task_types").insert({ key: v.key, ...typeFields }).select("id").single();
        if (error) throw error;
        typeId = data.id;
      } else {
        typeId = id!;
        const { error } = await supabaseClient.from("task_types").update(typeFields).eq("id", typeId);
        if (error) throw error;
      }

      const { data: existing } = await supabaseClient.from("task_type_steps").select("id, step_key").eq("task_type_id", typeId);
      const keep = new Set(v.steps.map((s) => s.step_key));
      const removed = (existing ?? []).filter((s) => !keep.has(s.step_key));
      if (removed.length) {
        const { count } = await supabaseClient
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("task_type_id", typeId)
          .in("current_step_key", removed.map((s) => s.step_key))
          .not("status", "in", "(done,cancelled)");
        if (count) throw new Error(t("taskTypes.errors.stepInUse", { count }));
        const { error: removeError } = await supabaseClient.from("task_type_steps").delete().in("id", removed.map((s) => s.id));
        if (removeError) throw removeError;
      }
      const rows = v.steps.map((s, i) => ({
        task_type_id: typeId,
        step_key: s.step_key,
        step_order: i + 1,
        name: s.name.trim(),
        name_de: s.name_de.trim(),
        status: s.status,
        assignee_kind: s.assignee_kind,
        assignee_role_id: s.assignee_kind === "role" ? s.assignee_role_id ?? null : null,
        assignee_level: s.assignee_level ?? 1,
        assignee_team_id: s.assignee_kind === "team" || (s.assignee_kind === "role" && s.assignee_team_scope === "fixed") ? s.assignee_team_id ?? null : null,
        assignee_team_scope: s.assignee_kind === "role" && s.assignee_role_id ? s.assignee_team_scope ?? null : null,
        fallback_role_id: hasFallback(s) ? s.fallback_role_id ?? null : null,
        is_decision: !!s.is_decision,
        actions: s.actions.map((a) => {
          const label = Object.fromEntries(Object.entries(a.label ?? {}).filter(([, text]) => text?.trim()));
          return {
            key: a.key,
            to: a.to ?? null,
            ...(a.requires_comment ? { requires_comment: true } : {}),
            ...(Object.keys(label).length ? { label } : {}),
            ...(a.kind && a.kind !== "neutral" ? { kind: a.kind } : {}),
          };
        }),
      }));
      const { error } = await supabaseClient.from("task_type_steps").upsert(rows, { onConflict: "task_type_id,step_key" }).select("id, step_key");
      if (error) throw error;

      // Quick links: replace the whole list (a handful of rows, the order is the order of the picker).
      const links = (v.subtask_type_ids ?? []).map((subtask_type_id, i) => ({ task_type_id: typeId, subtask_type_id, sort_order: i }));
      const { error: unlinkError } = await supabaseClient.from("task_type_subtask_types").delete().eq("task_type_id", typeId);
      if (unlinkError) throw unlinkError;
      if (links.length) {
        const { error: linkError } = await supabaseClient.from("task_type_subtask_types").insert(links);
        if (linkError) throw linkError;
      }

      for (const key of ["admin-task-types", "subtask-links", "task-type-item-categories", "admin-task-type-step-counts", "admin-task-type", "task-types", "task-steps", "subtask-types", "default-task-type"]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      setWarnWhen(false);
      message.success(t("taskTypes.saved"));
      if (isNew) navigate(`/admin/task-types/${typeId}`, { replace: true });
    } catch (e: any) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  // Steps are folded in the editor; a step that was just added (no id yet) is open, and with a single step everything is open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [errorSteps, setErrorSteps] = useState<number[]>([]);
  const stepOptions = (stepsWatch ?? []).filter((s) => s?.step_key).map((s) => ({ value: s.step_key, label: `${s.name || s.step_key} (${s.step_key})` }));

  if (!isNew && isLoading) return <Spin />;

  return (
    <Show
      breadcrumb={false}
      headerButtons={
        <>
          <Button onClick={() => navigate("/admin/task-types")}>{t("common.cancel")}</Button>
          <Button type="primary" loading={saving} onClick={save}>{t("common.save")}</Button>
        </>
      }
    >
      <Form form={form} layout="vertical" onValuesChange={() => setWarnWhen(true)}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "general",
              label: t("taskTypes.general"),
              forceRender: true,
              children: (
                <Card size="small" title={t("taskTypes.general")}>
              <Space style={{ display: "flex" }} align="start" wrap>
                <Form.Item name="name" label={t("fields.nameEn")} rules={[{ required: true, whitespace: true }]}>
                  <Input style={{ width: 280 }} />
                </Form.Item>
                <Form.Item name="name_de" label={t("fields.nameDe")} rules={[{ required: true, whitespace: true }]}>
                  <Input style={{ width: 280 }} />
                </Form.Item>
                <Form.Item name="key" label={t("fields.key")} rules={[{ required: true }, KEY_RULE]}>
                  <Input disabled={!isNew} />
                </Form.Item>
                <Form.Item name="active" label={t("fields.active")} valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="track_as_request" label={t("taskTypes.trackAsRequest")} valuePropName="checked" tooltip={t("taskTypes.trackAsRequestHint")}>
                  <Switch />
                </Form.Item>
              </Space>
              <Form.Item name="description" label={t("taskTypes.internalNote")} extra={t("taskTypes.internalNoteHint")}>
                <Input.TextArea rows={2} />
              </Form.Item>
              {!isNew && (
                <Form.Item name="owner_user_id" label={t("fields.owner")} extra={t("taskTypes.ownerHint")}>
                  <OwnerSelect />
                </Form.Item>
              )}
            </Card>

              ),
            },
            {
              key: "defaults",
              label: t("taskTypes.defaults"),
              forceRender: true,
              children: (
                <Card size="small" title={t("taskTypes.defaults")}>
              <Form.Item name="default_due_days" label={t("appSettings.typeDueDays")} extra={t("appSettings.typeDueDaysHint")}>
                <InputNumber min={0} max={365} addonAfter={t("appSettings.days")} placeholder={t("appSettings.general")} />
              </Form.Item>
              <Form.Item name="default_team_id" label={t("taskTypes.defaultTeam")} extra={t("taskTypes.defaultTeamHint")}>
                <TeamSelect />
              </Form.Item>
              <Form.Item name="hidden_fields" label={t("taskTypes.hiddenFields")} extra={t("taskTypes.hiddenFieldsHint")}>
                <Select mode="multiple" allowClear options={HIDEABLE_FIELDS.map((f) => ({ value: f, label: t(`taskTypes.hideable.${f}`) }))} />
              </Form.Item>
              <Form.Item name="blocks_parent" valuePropName="checked" extra={t("taskTypes.blocksParentHint")}>
                <Checkbox>{t("taskTypes.blocksParent")}</Checkbox>
              </Form.Item>
              <Form.Item name="subtask_type_ids" label={t("taskTypes.quickLinks")} extra={t("taskTypes.quickLinksHint")}>
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  placeholder={t("taskTypes.noSubtasks")}
                  optionFilterProp="label"
                  options={sortByName(allTypes).map((x) => ({ value: x.id, label: localName(x) }))}
                />
              </Form.Item>
            </Card>

              ),
            },
            {
              key: "start",
              label: t("taskTypes.startPage"),
              forceRender: true,
              children: (
                <Space direction="vertical" size={16} style={{ display: "flex" }}>
                  <Card size="small" title={t("taskTypes.startPage")}>
              <Form.Item name="show_on_start_page" valuePropName="checked" extra={t("taskTypes.showOnStartPageHint")}>
                <Checkbox>{t("taskTypes.showOnStartPage")}</Checkbox>
              </Form.Item>
              <Form.Item name="short_description" label={t("taskTypes.shortDescription")} extra={t("taskTypes.shortDescriptionHint")}>
                <Input.TextArea rows={2} maxLength={300} showCount />
              </Form.Item>
              <Form.Item name="keywords" label={t("taskTypes.keywords")} extra={t("taskTypes.keywordsHint")}>
                <Input maxLength={500} />
              </Form.Item>
            </Card>

                  <WhoCanStart typeId={isNew ? null : id!} />
                </Space>
              ),
            },
            {
              key: "route",
              label: t("taskTypes.route"),
              forceRender: true,
              children: (
                <Card size="small" title={t("taskTypes.route")}>
              <Typography.Paragraph type="secondary">{t("taskTypes.routeHint")}</Typography.Paragraph>
              <Form.List name="steps">
                {(steps, { add, remove: removeStep, move }) => (
                  <>
                    <RouteOverview steps={stepsWatch ?? []} />
                    {steps.map((step, index) => {
                      const current = stepsWatch?.[step.name];
                      const isOpen = errorSteps.includes(index) || (expanded[step.key] ?? (steps.length === 1 || !form.getFieldValue(["steps", step.name, "id"])));
                      return (
                      <Collapse
                        key={step.key}
                        style={{ marginBottom: 12 }}
                        activeKey={isOpen ? ["step"] : []}
                        onChange={(keys) => {
                          setErrorSteps((prev) => prev.filter((i) => i !== index));
                          setExpanded((prev) => ({ ...prev, [step.key]: (keys as string[]).length > 0 }));
                        }}
                        items={[
                          {
                            key: "step",
                            forceRender: true,
                            label: (
                              <Space wrap>
                                <Typography.Text strong>{index + 1}. {current ? pickName(current.name, current.name_de) || t("taskTypes.unnamedStep") : ""}</Typography.Text>
                                {current?.is_decision && <Tag color="orange">{t("taskTypes.decisionStep")}</Tag>}
                                <Typography.Text type="secondary">{current ? stepAssigneeText(t, current as unknown as TaskTypeStep, roles, groups) : ""}</Typography.Text>
                              </Space>
                            ),
                            extra: (
                              <Space onClick={(e) => e.stopPropagation()}>
                                <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, index - 1)} />
                                <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === steps.length - 1} onClick={() => move(index, index + 1)} />
                                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => removeStep(step.name)} />
                              </Space>
                            ),
                            children: (
                      <div>
                        <Typography.Text type="secondary">{t("taskTypes.whoWorks")}</Typography.Text>
                        <Space style={{ display: "flex" }} align="start" wrap>
                          <Form.Item name={[step.name, "name"]} label={t("fields.nameEn")} rules={[{ required: true }]}>
                            <Input />
                          </Form.Item>
                          <Form.Item name={[step.name, "name_de"]} label={t("fields.nameDe")} rules={[{ required: true }]}>
                            <Input />
                          </Form.Item>
                          <Form.Item name={[step.name, "step_key"]} label={t("fields.key")} rules={[{ required: true }, KEY_RULE]}>
                            <Input disabled={!!form.getFieldValue(["steps", step.name, "id"])} />
                          </Form.Item>
                          <Form.Item name={[step.name, "status"]} label={t("fields.status")} rules={[{ required: true }]}>
                            <Select style={{ minWidth: 200 }} options={STEP_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} />
                          </Form.Item>
                          <Form.Item name={[step.name, "assignee_kind"]} label={t("taskTypes.assigneeKind")}>
                            <Select
                              style={{ minWidth: 220 }}
                              popupMatchSelectWidth={false}
                              options={[
                                { value: "role", label: t("taskTypes.kindRole") },
                                { value: "team", label: t("taskTypes.kindTeam") },
                                { value: "task_team", label: t("taskTypes.kindTaskTeam") },
                                { value: "task_owner", label: t("taskTypes.kindTaskOwner") },
                                { value: "requester", label: t("taskTypes.kindRequester") },
                                { value: "requester_supervisor", label: t("taskTypes.kindSupervisor") },
                              ]}
                            />
                          </Form.Item>
                          {stepsWatch?.[step.name]?.assignee_kind === "requester_supervisor" && (
                            <Form.Item name={[step.name, "assignee_level"]} label={t("taskTypes.supervisorLevel")} tooltip={t("taskTypes.supervisorLevelHint")}>
                              <InputNumber min={1} max={5} />
                            </Form.Item>
                          )}
                          {stepsWatch?.[step.name]?.assignee_kind === "team" && (
                            <Form.Item name={[step.name, "assignee_team_id"]} label={t("fields.team")} rules={[{ required: true }]}>
                              <TeamSelect style={{ minWidth: 180 }} />
                            </Form.Item>
                          )}
                          {(stepsWatch?.[step.name]?.assignee_kind ?? "role") === "role" && (
                            <Form.Item name={[step.name, "assignee_role_id"]} label={t("fields.role")} tooltip={t("taskTypes.roleHint")}>
                              <Select allowClear style={{ minWidth: 180 }} placeholder={t("common.anyone")} options={sortByName(roles).map((r) => ({ value: r.id, label: localName(r) }))} />
                            </Form.Item>
                          )}
                          {(stepsWatch?.[step.name]?.assignee_kind ?? "role") === "role" && stepsWatch?.[step.name]?.assignee_role_id && (
                            <Form.Item name={[step.name, "assignee_team_scope"]} label={t("taskTypes.teamScope")} tooltip={t("taskTypes.teamScopeHint")}>
                              <Select
                                allowClear
                                style={{ minWidth: 220 }}
                                popupMatchSelectWidth={false}
                                placeholder={t("taskTypes.teamScopeNone")}
                                // the task's team is chosen by the requester, so it never decides (task_type_steps_decision_team)
                                options={STEP_TEAM_SCOPES.filter((x) => !(x === "task_team" && stepsWatch?.[step.name]?.is_decision)).map((x) => ({ value: x, label: t(`taskTypes.teamScopes.${x}`) }))}
                              />
                            </Form.Item>
                          )}
                          {(stepsWatch?.[step.name]?.assignee_kind ?? "role") === "role" && stepsWatch?.[step.name]?.assignee_role_id && stepsWatch?.[step.name]?.assignee_team_scope === "fixed" && (
                            <Form.Item name={[step.name, "assignee_team_id"]} label={t("fields.team")} rules={[{ required: true }]}>
                              <TeamSelect style={{ minWidth: 180 }} />
                            </Form.Item>
                          )}
                          {hasFallback(stepsWatch?.[step.name]) && (
                            <Form.Item name={[step.name, "fallback_role_id"]} label={t("taskTypes.fallbackRole")} tooltip={t(`taskTypes.fallbackRoleHints.${stepsWatch?.[step.name]?.assignee_team_scope ? "role_in_team" : stepsWatch?.[step.name]?.assignee_kind}`)}>
                              <Select allowClear style={{ minWidth: 180 }} placeholder={t("taskTypes.fallbackDefault")} options={sortByName(roles).map((r) => ({ value: r.id, label: localName(r) }))} />
                            </Form.Item>
                          )}
                        </Space>

                        <Divider style={{ margin: "12px 0" }} />
                        <Typography.Text type="secondary">{t("taskTypes.actions")}</Typography.Text>
                        <Form.Item name={[step.name, "is_decision"]} valuePropName="checked" extra={t("taskTypes.decisionStepHint")} style={{ margin: "8px 0" }}>
                          <Switch checkedChildren={t("taskTypes.decisionStep")} unCheckedChildren={t("taskTypes.noDecisionStep")} />
                        </Form.Item>
                        <Form.List name={[step.name, "actions"]}>
                          {(actions, { add: addAction, remove: removeAction }) => (
                            <div style={{ overflowX: "auto" }}>
                              <div style={{ minWidth: 900 }}>
                                {actions.length > 0 && (
                                  <div style={ACTION_GRID}>
                                    {["actionKey", "actionGoesTo", "actionKind", "requiresComment", "labelDe", "labelEn", ""].map((h) => (
                                      <Typography.Text key={h} type="secondary" style={{ fontSize: 12 }}>{h ? t(`taskTypes.${h}`) : ""}</Typography.Text>
                                    ))}
                                  </div>
                                )}
                                {actions.map((action) => (
                                  <div key={action.key} style={ACTION_GRID}>
                                    <Form.Item name={[action.name, "key"]} rules={[{ required: true }, KEY_RULE]} style={{ marginBottom: 0 }}>
                                      <Input />
                                    </Form.Item>
                                    <Form.Item name={[action.name, "to"]} getValueProps={(v) => ({ value: v === null || v === undefined ? FINISH : v })} getValueFromEvent={(v) => (v === FINISH ? null : v)} style={{ marginBottom: 0 }}>
                                      <Select options={[...stepOptions, { value: FINISH, label: t("taskTypes.finish") }]} />
                                    </Form.Item>
                                    <Form.Item name={[action.name, "kind"]} style={{ marginBottom: 0 }}>
                                      <Select options={["positive", "neutral", "negative"].map((k) => ({ value: k, label: t(`taskTypes.kinds.${k}`) }))} />
                                    </Form.Item>
                                    <Form.Item name={[action.name, "requires_comment"]} valuePropName="checked" style={{ marginBottom: 0 }}>
                                      <Checkbox />
                                    </Form.Item>
                                    <Form.Item name={[action.name, "label", "de"]} style={{ marginBottom: 0 }}>
                                      <Input />
                                    </Form.Item>
                                    <Form.Item name={[action.name, "label", "en"]} style={{ marginBottom: 0 }}>
                                      <Input />
                                    </Form.Item>
                                    <MinusCircleOutlined onClick={() => removeAction(action.name)} />
                                  </div>
                                ))}
                              </div>
                              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => addAction({ key: "", to: null })}>
                                {t("taskTypes.addAction")}
                              </Button>
                            </div>
                          )}
                        </Form.List>

                      </div>
                            ),
                          },
                        ]}
                      />
                      );
                    })}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ step_key: "", name: "", name_de: "", status: "open", assignee_kind: "role", assignee_level: 1, actions: [], is_decision: false })}>
                      {t("taskTypes.addStep")}
                    </Button>
                  </>
                )}
              </Form.List>
            </Card>

              ),
            },
          ]}
        />
      </Form>
    </Show>
  );
};

// The route at a glance: every step as a row with what its actions lead to, so branches and loops are visible without
// opening the step cards. A step where a person decides is marked.
