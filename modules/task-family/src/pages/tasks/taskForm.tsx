// Ported 1:1 from COMPASS (app/src/pages/tasks/taskForm.tsx).
import { useEffect, useMemo, useRef, useState } from "react";
import { RichTextEditor } from "@rbp/module-messaging/src/richText.tsx";
import { Alert, Button, Checkbox, Col, Collapse, DatePicker, Form, Input, Modal, Row, Select, Typography, theme as antdTheme } from "antd";
import { CheckOutlined, DownOutlined } from "@ant-design/icons";
import { PageBand } from "@rbp/core";
import { DEFAULT_TASK_TYPE_ICON, IconTile, iconFor } from "@rbp/ui";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../../lib/modules";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { PRIORITIES } from "../../lib/domain";
import { AssetSelect } from "../../components/assetSelect";
import { AssigneeSelect, TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { localName, taskTypeShortDescription } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useChecklistTemplates } from "../../hooks/useChecklistTemplates";
import { useMe } from "@rbp/core";
import { useTeamMembers } from "@rbp/core";
import { templatesForType } from "../../lib/checklists";
import { OwnChecklistField, ownListLabels, type OwnList } from "../../components/checklist/ownChecklist";
import { errorText } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useTypeItemCategories } from "../../hooks/useItems";
import { useIsMobile } from "@rbp/ui";
import { ITEM_ERRORS } from "../../components/taskItemParts";
import { OfferTiles, type Offer } from "../../components/offerTiles";
import { useAllowedSubtaskTypes, useParentTypeId } from "../../components/subtaskQuickLinks";
import { NewTaskItemsField, newTaskItemRows, type NewTaskItem } from "../../components/newTaskItems";

type Values = {
  task_type_id: string;
  title: string;
  description?: string | null;
  asset_id?: string;
  priority: string;
  due_date?: dayjs.Dayjs;
  team_id?: string | null;
  assigned_user_id?: string | null;
  checklist_template_id?: string;
  own_list?: OwnList | null;
  blocks_parent?: boolean;
  items?: NewTaskItem[];
};

// forCreate: only the types the user's roles may start (a role without a restriction may start all of them).
export function useTaskTypes(activeOnly = true, forCreate = false) {
  return useQuery({
    queryKey: ["task-types", activeOnly, forCreate],
    queryFn: async () => {
      let q = supabaseClient
        .from("task_types")
        .select("*")
        .order("name");
      if (activeOnly) q = q.eq("active", true);
      // Platform: item_mode comes with the items module, purpose with workflows; without them a type has neither.
      const rows = ((await q).data ?? []).map((x) => ({ ...x, item_mode: (x.item_mode ?? "none") as string, purpose: (x.purpose ?? null) as string | null }));
      if (!forCreate) return rows;
      const allowed = new Set(((await supabaseClient.rpc("rls_my_task_type_ids")).data ?? []) as string[]);
      // A system-created type (leave request) has its own entry point and is never picked by hand.
      return rows.filter((x) => allowed.has(x.id) && !x.system_created);
    },
  });
}

// The task types a new task starts with (Admin > Settings): one without an asset, one for work on an asset (started
// from the asset or from a ticket with an asset). `pickDefaultType` falls back to the first type the user may use.
export function useDefaultTaskTypes() {
  const { data } = useQuery({
    queryKey: ["default-task-types"],
    staleTime: 60_000,
    queryFn: async () =>
      Object.fromEntries(
        (((await supabaseClient.from("app_settings").select("key, value").in("key", ["default_task_type_id", "default_asset_task_type_id"])).data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value || null]),
      ) as { default_task_type_id?: string | null; default_asset_task_type_id?: string | null },
  });
  return {
    ready: data !== undefined,
    pickDefaultType: <T extends { id: string }>(types: T[], hasAsset: boolean): T | undefined => {
      const wanted = hasAsset ? data?.default_asset_task_type_id : data?.default_task_type_id;
      return types.find((x) => x.id === wanted) ?? types.find((x) => x.id === data?.default_task_type_id) ?? types[0];
    },
  };
}

export const TaskFormModal = ({
  open,
  assetId,
  parent,
  initialTitle,
  initiative,
  fixedTypeId,
  onClose,
  onSaved,
}: {
  open: boolean;
  assetId?: string | null;
  // Creates a subtask / follow-up of this task; the asset and a title hint come from it.
  parent?: { id: string; asset_id: string | null } | null;
  // Title the form starts with (e.g. the checklist item a follow-up comes from).
  initialTitle?: string;
  // The Initiatives list opens the form for a new initiative; any other task becomes one later (task menu).
  initiative?: boolean;
  // Started from the start page: the type is fixed and the planning fields fold away under "More details", the route
  // decides who works the task.
  fixedTypeId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { data: templates } = useChecklistTemplates();
  const [form] = Form.useForm<Values>();
  const { data: types } = useTaskTypes(true, true);
  // Type choice (several types, no type given by the caller): tiles with search and description come first. A new
  // subtask offers only the types its parent's type allows (task type editor); a single choice is taken without asking.
  const [pickedTypeId, setPickedTypeId] = useState<string | null>(null);
  const { ready: parentReady, typeId: parentTypeId } = useParentTypeId(open ? parent?.id : null);
  const allowed = useAllowedSubtaskTypes(parentTypeId);
  const choicesReady = !!types && parentReady && (!parent || allowed.ready);
  const choices = useMemo(() => (parent ? allowed.types : types ?? []), [parent, allowed.types, types]);
  useEffect(() => {
    if (open) {
      setPickedTypeId(null);
    }
  }, [open]);
  const teamId = Form.useWatch("team_id", form);
  const typeId = Form.useWatch("task_type_id", form);
  const title = Form.useWatch("title", form);
  const isMobile = useIsMobile();
  const { token } = antdTheme.useToken();
  // Items (spare parts, an order's lines) right on the form for types that use or order them, so they land as lines
  // and not as text in the description.
  const { has } = usePermissions();
  const itemMode = types?.find((x) => x.id === typeId)?.item_mode ?? "none";
  const showItems = has("items.view") && itemMode !== "none";
  const { data: itemCategoryIds } = useTypeItemCategories(showItems ? typeId : null);
  // The database adds the type's default checklist to every new task. The picker starts with it; choosing another one
  // (or none) replaces it.
  const defaultTemplateId = types?.find((x) => x.id === typeId)?.default_checklist_template_id ?? null;
  const templateTouched = useRef(false);
  useEffect(() => {
    if (open) templateTouched.current = false;
  }, [open]);
  useEffect(() => {
    if (open && !templateTouched.current) form.setFieldValue("checklist_template_id", defaultTemplateId ?? undefined);
  }, [open, defaultTemplateId, form]);

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ priority: "normal", asset_id: assetId ?? parent?.asset_id ?? undefined, title: initialTitle });
    }
  }, [open, assetId, parent, initialTitle, form]);

  // A task needs a team or a person: it starts with the type's default team plus the signed-in user as person when
  // they are a member of it; without a default team the user alone. Once the user touched either field, a change of
  // the type no longer overwrites them.
  const { userId: meId } = useMe();
  const defaultTeamId = types?.find((x) => x.id === typeId)?.default_team_id ?? null;
  const { data: members } = useTeamMembers();
  const inDefaultTeam = !!defaultTeamId && !!members?.some((m) => m.team_id === defaultTeamId && m.user_id === meId);
  const ownerTouched = useRef(false);
  useEffect(() => {
    if (open) ownerTouched.current = false;
  }, [open]);
  useEffect(() => {
    if (open && !ownerTouched.current) form.setFieldsValue({ team_id: defaultTeamId ?? undefined, assigned_user_id: !defaultTeamId || inDefaultTeam ? meId : undefined });
  }, [open, defaultTeamId, inDefaultTeam, meId, form]);

  // A subtask can be a prerequisite of its parent (the parent shows as blocked until it is done). The checkbox
  // starts with the type's default until the user touched it.
  const typeBlocksParent = !!types?.find((x) => x.id === typeId)?.blocks_parent;
  const blocksTouched = useRef(false);
  useEffect(() => {
    if (open) blocksTouched.current = false;
  }, [open]);
  useEffect(() => {
    if (open && parent && !blocksTouched.current) form.setFieldValue("blocks_parent", typeBlocksParent);
  }, [open, parent, typeBlocksParent, form]);

  // The due date starts with the type's default; it is required but editable, and once touched a change of the type
  // no longer overwrites it.
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
    if (open && fixedTypeId) {
      form.setFieldValue("task_type_id", fixedTypeId);
      return;
    }
    if (open && pickedTypeId) {
      form.setFieldValue("task_type_id", pickedTypeId);
      return;
    }
    // With several types the user chooses on the tiles first; a single type is taken without asking.
    if (open && !fixedTypeId && choicesReady && choices.length === 1 && !form.getFieldValue("task_type_id")) form.setFieldValue("task_type_id", choices[0].id);
  }, [open, choices, choicesReady, form, fixedTypeId, pickedTypeId]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    // One call: the insert under my rights plus the setup of the form (blocking switch, official checklist, material,
    // own steps), which a creator who may only read the task afterwards could not write in separate calls.
    const { data: taskId, error } = await supabaseClient.rpc("task_create", {
      p_task_type_id: v.task_type_id,
      p_title: v.title.trim(),
      p_description: v.description?.trim() || null,
      // Platform: task_create takes the asset once the assets module is in the app.
      ...(v.asset_id ? { p_asset_id: v.asset_id } : {}),
      p_priority: v.priority,
      p_due_date: v.due_date!.format("YYYY-MM-DD"),
      p_team_id: v.team_id ?? null,
      p_assigned_user_id: v.assigned_user_id ?? null,
      p_parent_task_id: parent?.id ?? null,
      p_is_initiative: !parent && !!initiative,
      // The database gives a new subtask the default of its type; only a different choice is passed.
      p_blocks_parent: parent && !!v.blocks_parent !== typeBlocksParent ? !!v.blocks_parent : null,
      p_set_checklist: (v.checklist_template_id ?? null) !== defaultTemplateId,
      p_checklist_template_id: v.checklist_template_id ?? null,
      // Platform: and the material lines once the items module is.
      ...(showItems ? { p_items: newTaskItemRows(v.items ?? []) } : {}),
      // The own steps typed on this form belong to this task only.
      p_own_items: ownListLabels(v.own_list),
    });
    if (error) {
      form.setFields([{ name: "title", errors: [errorText(error, { known: ITEM_ERRORS })] }]);
      return;
    }
    onSaved(taskId as string);
  };

  const choosing = open && !fixedTypeId && !pickedTypeId && choicesReady && choices.length > 1;
  const noChoices = open && !fixedTypeId && choicesReady && choices.length === 0;
  const offers: Offer[] = choices.map((x): Offer => ({
    kind: "task", id: x.id, name: x.name, keywords: x.keywords, icon: x.icon, color: x.color, label: localName(x), summary: taskTypeShortDescription(t, x),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const currentType = types?.find((x) => x.id === typeId);

  const fixedType = fixedTypeId ? types?.find((x) => x.id === fixedTypeId) : undefined;
  // Fields the type hides (task type editor): the form does not offer them. An asset given by the caller stays.
  const typeHides = (field: string) => !!types?.find((x) => x.id === typeId)?.hidden_fields?.includes(field);
  const hasAssets = useHasModule("assets");
  const showAsset = hasAssets && (!!assetId || !typeHides("asset"));
  const showChecklist = !typeHides("checklist");
  const checklistFields = showChecklist ? (
    <>
      <Form.Item
        name="checklist_template_id"
        label={t("checklists.official")}
        extra={t("checklists.onCreateHint")}
      >
        <Select allowClear showSearch optionFilterProp="label" placeholder={t("checklists.chooseTemplate")} options={templatesForType(templates ?? [], typeId).map((x) => ({ value: x.id, label: x.name }))} onChange={() => { templateTouched.current = true; }} />
      </Form.Item>
      <Form.Item name="own_list">
        <OwnChecklistField defaultName={title?.trim()} hint={t("checklists.ownHint")} />
      </Form.Item>
    </>
  ) : null;
  // Who works it and by when come first: they decide the task. The asset follows further down.
  const planningFields = (
    <>
      <div style={{ display: "flex", gap: 16 }}>
        <Form.Item name="team_id" label={t("fields.team")} style={{ flex: 1 }}>
          <TeamSelect onChange={() => { ownerTouched.current = true; form.setFieldValue("assigned_user_id", undefined); }} />
        </Form.Item>
        <Form.Item
          name="assigned_user_id"
          label={t("fields.assignee")}
          style={{ flex: 1 }}
          dependencies={["team_id"]}
          rules={[({ getFieldValue }) => ({ validator: (_, value) => (getFieldValue("team_id") || value ? Promise.resolve() : Promise.reject(new Error(t("tasks.needsTeamOrPerson")))) })]}
        >
          <AssigneeSelect teamId={teamId} onChange={() => { ownerTouched.current = true; }} />
        </Form.Item>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <Form.Item name="due_date" label={t("fields.dueDate")} rules={[{ required: true }]} style={{ flex: 1 }}>
          <DatePicker style={{ width: "100%" }} onChange={() => { dueTouched.current = true; }} />
        </Form.Item>
        <Form.Item name="priority" label={t("fields.priority")} style={{ flex: 1 }}>
          <Select options={PRIORITIES.map((x) => ({ value: x, label: t(`priority.${x}`) }))} />
        </Form.Item>
      </div>
    </>
  );
  const assetField = showAsset ? (
    <Form.Item name="asset_id" label={t("fields.asset")}>
      <AssetSelect disabled={!!assetId} />
    </Form.Item>
  ) : null;
  // Started from the start page, the asset (unless given) and the checklist sit behind "More details", if the type has them.
  const moreFields = (assetId ? false : showAsset) || showChecklist;

  const itemsField = showItems ? (
    <Form.Item name="items" label={t(itemMode === "order" ? "items.formOrderLabel" : "items.formUseLabel")}>
      <NewTaskItemsField categoryIds={itemCategoryIds} />
    </Form.Item>
  ) : null;

  const titleField = (
    <Form.Item name="title" label={t("fields.title")} rules={[{ required: true, max: 200 }]}>
      <Input autoFocus={!isMobile} />
    </Form.Item>
  );
  // Phone: the form is a grey page with white cards, like the other pages.
  const card = isMobile ? { background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 12, padding: "16px 14px 4px", marginBottom: 12 } : undefined;
  const heading = choosing ? t("tasks.pickType") : fixedType ? localName(fixedType) : t(parent ? "tasks.newSubtask" : initiative ? "initiatives.new" : "tasks.new");

  // A full-size dialog (a whole screen on a phone): description, checklist and items need room. Two columns on a
  // computer: what is to be done on the left, who / when / where and the items on the right. Started from the start
  // page (fixed type), the asset and the checklist sit behind "More details".
  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      width={isMobile ? "100%" : 1100}
      className={isMobile ? "modal-fullscreen" : undefined}
      style={isMobile ? undefined : { top: 24 }}
      // Phone: the dark band of the pages instead of the dialog title, Back closes; the buttons stay at the foot.
      title={isMobile ? null : heading}
      closable={!isMobile}
      okText={fixedType ? t("start.submit") : isMobile ? t(parent ? "tasks.newSubtask" : initiative ? "initiatives.new" : "tasks.create") : undefined}
      okButtonProps={isMobile ? { icon: <CheckOutlined /> } : undefined}
      footer={choosing || noChoices ? null : undefined}
      styles={isMobile ? { content: { background: token.colorBgLayout }, footer: { background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}` } } : undefined}
      destroyOnClose
    >
      {isMobile ? <PageBand title={heading} onBack={onClose} /> : null}
      {choosing ? (
        <OfferTiles
          offers={offers}
          placeholder={t("tasks.pickTypeSearch")}
          emptyText={t("start.nothingOffered")}
          noMatchText={t("tasks.pickTypeNoMatch")}
          onPick={(o) => setPickedTypeId(o.id)}
        />
      ) : null}
      {noChoices ? <Alert type="info" showIcon message={t(parent ? "tasks.noSubtaskTypes" : "start.nothingOffered")} /> : null}
      <div hidden={choosing || noChoices}>
      {fixedType?.short_description ? <Typography.Paragraph type="secondary" style={isMobile ? { margin: "0 0 12px" } : undefined}>{taskTypeShortDescription(t, fixedType)}</Typography.Paragraph> : null}
      <Form form={form} layout="vertical">
        <Row gutter={32}>
          <Col xs={24} lg={14}>
            <div style={card}>
            {isMobile ? null : titleField}
            <Form.Item name="task_type_id" rules={[{ required: true }]} hidden>
              <Input />
            </Form.Item>
            {!fixedTypeId && currentType && isMobile ? (
              // Phone: the type as a field with its icon at the top; a tap goes back to the type choice.
              <Form.Item label={t("fields.taskType")}>
                <div
                  role={choices.length > 1 ? "button" : undefined}
                  tabIndex={choices.length > 1 ? 0 : undefined}
                  onClick={choices.length > 1 ? () => setPickedTypeId(null) : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: 4, paddingRight: 12, border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius, cursor: choices.length > 1 ? "pointer" : undefined }}
                >
                  <IconTile icon={iconFor(currentType.icon, DEFAULT_TASK_TYPE_ICON)} color={currentType.color} size={36} />
                  <span style={{ flex: 1, fontSize: 16 }}>{localName(currentType)}</span>
                  {choices.length > 1 ? <DownOutlined style={{ color: token.colorTextTertiary, fontSize: 12 }} /> : null}
                </div>
              </Form.Item>
            ) : !fixedTypeId && currentType ? (
              <Form.Item label={t("fields.taskType")}>
                <Typography.Text strong>{localName(currentType)}</Typography.Text>
                {choices.length > 1 ? <Button type="link" size="small" onClick={() => setPickedTypeId(null)}>{t("tasks.changeType")}</Button> : null}
              </Form.Item>
            ) : null}
            {isMobile ? titleField : null}
            {parent && (
              <Form.Item name="blocks_parent" valuePropName="checked" extra={t("blocked.formHint")}>
                <Checkbox onChange={() => { blocksTouched.current = true; }}>{t("blocked.formLabel")}</Checkbox>
              </Form.Item>
            )}
            <Form.Item name="description" label={t(fixedTypeId ? "start.details" : "richText.instructions")}>
              <RichTextEditor placeholder={t(fixedTypeId ? "start.detailsPlaceholder" : "richText.instructionsPlaceholder")} minHeight={160} />
            </Form.Item>
            {fixedTypeId ? null : checklistFields}
            </div>
          </Col>
          <Col xs={24} lg={10}>
            <div style={card}>
            {planningFields}
            {fixedTypeId && !assetId ? null : assetField}
            {itemsField}
            </div>
            {fixedTypeId && moreFields ? (
              <div style={card}>
                <Collapse ghost size="small" items={[{ key: "more", label: t("start.moreDetails"), forceRender: true, children: <>{assetId ? null : assetField}{checklistFields}</> }]} />
              </div>
            ) : null}
          </Col>
        </Row>
      </Form>
      </div>
    </Modal>
  );
};
