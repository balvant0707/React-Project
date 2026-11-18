// Ported 1:1 from COMPASS (app/src/components/taskItems.tsx).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { App as AntdApp, Button, Form, Input, InputNumber, Modal, Popconfirm, Radio, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { CheckOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FileAddOutlined, PlusOutlined, ShoppingCartOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { ItemSelect } from "@rbp/module-task-family/src/components/itemSelect.tsx";
import { ItemThumb } from "@rbp/module-task-family/src/components/itemPhoto.tsx";
import { SupplierSelect } from "@rbp/module-task-family/src/components/supplierSelect.tsx";
import { StatusTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { useQuantityText, useTypeItemCategories, useUnitText } from "@rbp/module-task-family/src/hooks/useItems.ts";
import { usePhrases, usePhraseText } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { TaskFormModal, useTaskTypes } from "@rbp/module-task-family/src/pages/tasks/taskForm.tsx";
import { useAllowedSubtaskTypes } from "@rbp/module-task-family/src/components/subtaskQuickLinks.tsx";
import { ItemFormModal } from "../pages/items/itemForm";
import { formatMoney } from "@rbp/module-task-family/src/lib/money.ts";
import { erpRows, fetchAssetItems, itemLabel, orderStage, parseQuickLine, type ItemMode, type TaskItem } from "@rbp/module-task-family/src/lib/items.ts";
import { errorText } from "@rbp/core";
import { ITEM_ERRORS, ItemPicker, useLines } from "./taskItemParts";

// Where a line stands: planned (from the series), missing / ordered / arrived (needed), installed (used). A line an
// ordering task orders itself is requested until the order is completed.
export const TaskItemStateTag = ({ line }: { line: Pick<TaskItem, "state" | "purchase_task_id" | "arrived_at" | "task_id"> }) => {
  const { t } = useTranslation();
  if (line.purchase_task_id && line.purchase_task_id === line.task_id)
    return line.arrived_at ? <Tag color="cyan">{t("items.stages.arrived")}</Tag> : <Tag color="gold">{t("items.stages.requested")}</Tag>;
  if (line.state === "used") return <Tag color="green">{t("items.states.used")}</Tag>;
  if (line.state === "planned") return <Tag color="blue">{t("items.states.planned")}</Tag>;
  const stage = orderStage(line);
  return <Tag color={stage === "arrived" ? "cyan" : stage === "ordered" ? "gold" : "red"}>{t(`items.stages.${stage}`)}</Tag>;
};

// The lines a task shows: its own; on an ordering task everything it orders (its own lines and those of the task it
// was started from).

type LineValues = {
  kind: "catalogue" | "text";
  item_id?: string;
  description?: string;
  unit_phrase_id?: string | null;
  supplier_id?: string | null;
  quantity: number;
  state: "needed" | "used" | "planned";
  note?: string;
};

// The items of a task. mode "use" (maintenance, inspection): what is missing, planned or was installed; missing
// items are ordered with a purchase request subtask. mode "order" (purchase request): what the task orders, its own
// lines and the lines of the task it was started from, with a copy view for the ERP. Writing needs the check right on
// the task (whoever works it); RLS and the trigger task_items_guard decide.
export const TaskItems = ({
  task,
  finished,
  canWork,
  mode,
}: {
  task: { id: string; title: string; asset_id: string | null; task_type_id: string };
  finished: boolean;
  canWork: boolean;
  // task_types.item_mode; with "none" lines that exist stay visible, read-only.
  mode: ItemMode;
}) => {
  const { t, i18n } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const quantity = useQuantityText();
  const unitText = useUnitText();
  const { has } = usePermissions();
  const { data: units } = usePhrases("item_unit");
  const phraseText = usePhraseText();
  const { data: lines } = useLines(task.id, mode);
  const { data: categoryIds } = useTypeItemCategories(task.task_type_id);
  const { data: types } = useTaskTypes(true, true);
  // The type a missing item is ordered with: the purchase request, else any type that orders items. The order is a
  // subtask, so only a type this task's type allows as a subtask counts; without one there is no order button.
  const { types: allowedSubtaskTypes } = useAllowedSubtaskTypes(task.task_type_id);
  const orderTypes = (types ?? []).filter((x) => x.item_mode === "order" && allowedSubtaskTypes.some((a) => a.id === x.id));
  const orderType = orderTypes.find((x) => x.key === "purchase_request") ?? orderTypes[0];
  const [editing, setEditing] = useState<TaskItem | "new" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [ordering, setOrdering] = useState<string[] | null>(null);
  const [quick, setQuick] = useState("");
  const [toCatalogue, setToCatalogue] = useState<TaskItem | null>(null);
  const [form] = Form.useForm<LineValues>();
  const kind = Form.useWatch("kind", form);
  const editable = canWork && mode !== "none" && has("items.view");
  const ownLine = (l: TaskItem) => l.task_id === task.id;

  // The asset's spare parts list comes first in the picker.
  const { data: assetItems } = useQuery({
    queryKey: ["asset-items", task.asset_id, false],
    enabled: !!task.asset_id && !!editing && mode === "use",
    queryFn: () => fetchAssetItems(task.asset_id!, false),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["task-items"] });
    void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
    void queryClient.invalidateQueries({ queryKey: ["item-tasks"] });
  };

  const newState = finished ? "used" : "needed";
  const open = (row: TaskItem | "new") => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(
      row === "new"
        ? { kind: "catalogue", quantity: 1, state: newState }
        : {
            kind: row.item_id ? "catalogue" : "text",
            item_id: row.item_id ?? undefined,
            description: row.description ?? undefined,
            unit_phrase_id: row.line_unit_phrase_id,
            supplier_id: row.line_supplier_id,
            quantity: Number(row.quantity),
            state: row.state,
            note: row.note ?? undefined,
          },
    );
  };

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !editing) return;
    const catalogue = v.kind === "catalogue";
    const patch = {
      item_id: catalogue ? v.item_id : null,
      description: catalogue ? null : v.description?.trim(),
      unit_phrase_id: catalogue ? null : v.unit_phrase_id ?? null,
      supplier_id: v.supplier_id ?? null,
      quantity: v.quantity,
      ...(mode === "use" ? { state: v.state } : {}),
      note: v.note?.trim() || null,
    };
    const { error } =
      editing === "new"
        ? await supabaseClient.from("task_items").insert({ ...patch, task_id: task.id })
        : await supabaseClient.from("task_items").update(patch).eq("id", editing.id);
    if (error) return message.error(errorText(error, { known: ITEM_ERRORS }));
    setEditing(null);
    await refresh();
  };

  // "3 Pakete Toilettenpapier" + Enter: a free-text line; an exact item number takes the catalogue item instead.
  const addQuick = async () => {
    const parsed = parseQuickLine(quick, units ?? []);
    if (!parsed.description) return;
    // ilike without wildcards: escape backslash, % and _ of what the user typed. Exactly one hit takes the catalogue item.
    const exact = parsed.description.replace(/[\\%_]/g, "\\$&");
    const { data: hits } = await supabaseClient.from("items").select("id").eq("is_active", true).ilike("item_number", exact).limit(2);
    const match = hits?.length === 1 ? hits[0] : null;
    const { error } = await supabaseClient.from("task_items").insert({
      task_id: task.id,
      quantity: parsed.quantity,
      ...(match ? { item_id: match.id } : { description: parsed.description.slice(0, 300), unit_phrase_id: parsed.unitId }),
      ...(mode === "use" ? { state: newState } : {}),
    });
    if (error) return message.error(errorText(error, { known: ITEM_ERRORS }));
    setQuick("");
    await refresh();
  };

  const setState = async (row: TaskItem, state: TaskItem["state"]) => {
    const { error } = await supabaseClient.from("task_items").update({ state }).eq("id", row.id);
    if (error) message.error(errorText(error, { known: ITEM_ERRORS }));
    await refresh();
  };

  const remove = async (row: TaskItem) => {
    const { error } = await supabaseClient.from("task_items").delete().eq("id", row.id);
    if (error) message.error(errorText(error, { known: ITEM_ERRORS }));
    await refresh();
  };

  // A free-text line becomes a catalogue item (purchasing keeps the catalogue): the line then points to the new item.
  const linkToCatalogue = async (itemId: string) => {
    const line = toCatalogue;
    setToCatalogue(null);
    if (!line) return;
    const { error } = await supabaseClient.from("task_items").update({ item_id: itemId, description: null, unit_phrase_id: null }).eq("id", line.id);
    if (error) message.error(errorText(error, { known: ITEM_ERRORS }));
    await refresh();
  };

  const missing = (lines ?? []).filter((l) => ownLine(l) && l.state === "needed" && !l.purchase_task_id);
  const toOrder = selected.filter((id) => missing.some((l) => l.id === id));
  const canOrder = editable && mode === "use" && !finished && !!orderType && missing.length > 0;

  // The purchase request is created with the normal task form (approval route, team, due date); then the lines are linked.
  const linkOrder = async (purchaseTaskId: string, lineIds: string[]) => {
    const { error } = await supabaseClient.rpc("task_items_order", { p_purchase_task_id: purchaseTaskId, p_line_ids: lineIds });
    setOrdering(null);
    // The order task exists already (the form made it); without the link it would stay empty, so stay here and say so.
    if (error) {
      message.error(errorText(error, { known: ITEM_ERRORS }));
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["task-tree"] });
      return;
    }
    setSelected([]);
    await refresh();
    void queryClient.invalidateQueries({ queryKey: ["task-tree"] });
    navigate(`/tasks/${purchaseTaskId}`);
  };

  // Copy view for purchasing: tab-separated for pasting into the ERP or Excel, or as a CSV file.
  const erpHeader = [
    t("items.erp.supplierNumber"),
    t("items.supplier"),
    t("items.erp.itemNumber"),
    t("items.itemNumber"),
    t("fields.description"),
    t("items.quantity"),
    t("items.unit"),
    t("items.unitPrice"),
    t("items.forTask"),
    t("items.note"),
  ];
  const copyForErp = async () => {
    try {
      await navigator.clipboard.writeText(erpRows(lines ?? [], unitText, erpHeader));
      message.success(t("items.erp.copied", { count: lines?.length ?? 0 }));
    } catch {
      message.error(t("items.erp.copyFailed"));
    }
  };
  const downloadCsv = () => {
    const tsv = erpRows(lines ?? [], unitText, erpHeader);
    const csv = tsv
      .split("\n")
      .map((row) => row.split("\t").map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-${task.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!editable && (lines ?? []).length === 0) return null;

  const pickerOptions = (assetItems ?? [])
    .filter((p) => p.is_active && (!categoryIds?.length || (p.category_phrase_id && categoryIds.includes(p.category_phrase_id))))
    .map((p) => ({ value: p.item_id, label: itemLabel(p), name: p.item_name, number: p.item_number, thumb: p.photo_thumbnail_path, position: p.position_note }));
  const lineEditable = (r: TaskItem) => editable && ownLine(r);

  return (
    <div style={{ marginTop: 16 }}>
      <Space style={{ marginBottom: 8 }} align="center" wrap>
        <Typography.Text strong>{t(mode === "order" ? "items.orderTitle" : "items.taskTitle")}</Typography.Text>
        {editable && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => open("new")}>
            {t("items.addLine")}
          </Button>
        )}
        {canOrder && (
          <Button size="small" type="primary" icon={<ShoppingCartOutlined />} onClick={() => setOrdering(toOrder.length ? toOrder : missing.map((l) => l.id))}>
            {toOrder.length ? t("items.orderSelected", { count: toOrder.length }) : t("items.orderMissing", { count: missing.length })}
          </Button>
        )}
        {mode === "order" && (lines ?? []).length > 0 && (
          <>
            <Tooltip title={t("items.erp.copyHint")}>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void copyForErp()}>
                {t("items.erp.copy")}
              </Button>
            </Tooltip>
            <Button size="small" icon={<DownloadOutlined />} onClick={downloadCsv}>
              CSV
            </Button>
          </>
        )}
      </Space>
      {editable && (!finished || mode === "use") && (
        <Input
          size="small"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onPressEnter={() => void addQuick()}
          placeholder={t("items.quickPlaceholder")}
          prefix={<PlusOutlined style={{ opacity: 0.45 }} />}
          maxLength={320}
          style={{ marginBottom: 8, maxWidth: 520 }}
        />
      )}
      {(lines ?? []).length > 0 && (
        <Table<TaskItem>
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={lines}
          scroll={{ x: "max-content" }}
          rowSelection={
            canOrder && missing.length > 1
              ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]), getCheckboxProps: (r) => ({ disabled: !(ownLine(r) && r.state === "needed" && !r.purchase_task_id) }) }
              : undefined
          }
          columns={[
            {
              title: t("items.item"),
              render: (_: unknown, r) => (
                <Space size={8}>
                  {r.item_id && <ItemThumb path={r.photo_thumbnail_path} size={32} />}
                  {r.item_id ? <Link to={`/items/${r.item_id}`}>{itemLabel(r)}</Link> : <span>{r.item_name}</span>}
                  {!r.item_id && <Tag style={{ marginInlineEnd: 0 }}>{t("items.freeText")}</Tag>}
                  {r.is_critical && <Tooltip title={t("items.criticalHint")}><WarningOutlined style={{ color: "#cf1322" }} /></Tooltip>}
                </Space>
              ),
            },
            { title: t("items.manufacturerNumber"), dataIndex: "manufacturer_item_number", render: (v: string | null) => v ?? "—", responsive: ["md"] },
            { title: t("items.quantity"), render: (_: unknown, r) => quantity(r.quantity, r.unit_phrase_id) },
            ...(mode === "order"
              ? [
                  { title: t("items.supplier"), dataIndex: "supplier_name", render: (v: string | null) => v ?? "—" },
                  ...(has("costs.view")
                    ? [{ title: t("items.unitPrice"), align: "right" as const, render: (_: unknown, r: TaskItem) => (r.unit_price == null ? "—" : formatMoney(r.unit_price, i18n.language)) }]
                    : []),
                ]
              : []),
            { title: t("fields.status"), render: (_: unknown, r) => <TaskItemStateTag line={r} /> },
            mode === "order"
              ? {
                  title: t("items.forTask"),
                  render: (_: unknown, r: TaskItem) => (!ownLine(r) && r.task_number ? <Link to={`/tasks/${r.task_id}`}>#{r.task_number} {r.task_title}</Link> : "—"),
                }
              : {
                  title: t("items.order"),
                  render: (_: unknown, r: TaskItem) =>
                    r.purchase_task_id ? (
                      <Space size={4}>
                        <Link to={`/tasks/${r.purchase_task_id}`}>#{r.purchase_task_number}</Link>
                        {r.purchase_task_status && <StatusTag status={r.purchase_task_status} />}
                      </Space>
                    ) : r.lead_time_days != null && r.state !== "used" ? (
                      <Typography.Text type="secondary">{t("items.leadTimeShort", { count: r.lead_time_days })}</Typography.Text>
                    ) : (
                      "—"
                    ),
                },
            { title: t("items.note"), dataIndex: "note", render: (v: string | null) => v ?? "", responsive: ["lg"] },
            ...(editable
              ? [
                  {
                    title: "",
                    render: (_: unknown, r: TaskItem) =>
                      lineEditable(r) && (
                        <Space size={4}>
                          {mode === "use" && r.state !== "used" && (
                            <Tooltip title={t("items.markUsed")}>
                              <Button size="small" type="text" icon={<CheckOutlined />} onClick={() => setState(r, "used")} />
                            </Tooltip>
                          )}
                          {mode === "use" && r.state === "planned" && !finished && (
                            <Button size="small" type="link" onClick={() => setState(r, "needed")}>{t("items.markMissing")}</Button>
                          )}
                          {!r.item_id && has("items.edit") && (
                            <Tooltip title={t("items.toCatalogue")}>
                              <Button size="small" type="text" icon={<FileAddOutlined />} onClick={() => setToCatalogue(r)} />
                            </Tooltip>
                          )}
                          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => open(r)} />
                          {!(r.purchase_task_id && r.purchase_task_id !== r.task_id && !r.arrived_at) && (
                            <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove(r)}>
                              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          )}
                        </Space>
                      ),
                  },
                ]
              : []),
          ]}
        />
      )}

      <Modal open={!!editing} title={editing === "new" ? t("items.addLine") : t("items.editLine")} onCancel={() => setEditing(null)} onOk={save} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="kind" hidden={editing !== "new"}>
            <Segmented block options={[{ value: "catalogue", label: t("items.fromCatalogue") }, { value: "text", label: t("items.freeText") }]} />
          </Form.Item>
          {kind === "text" ? (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Form.Item name="description" label={t("items.description")} rules={[{ required: true, whitespace: true, max: 300 }]} extra={t("items.freeTextHint")} style={{ flex: "2 1 260px" }}>
                <Input autoFocus />
              </Form.Item>
              <Form.Item name="unit_phrase_id" label={t("items.unit")} style={{ flex: "1 1 120px" }}>
                <Select allowClear options={(units ?? []).map((u) => ({ value: u.id, label: phraseText(u) }))} />
              </Form.Item>
            </div>
          ) : (
            <Form.Item
              name="item_id"
              label={t("items.item")}
              rules={[{ required: true }]}
              extra={categoryIds?.length ? t("items.categoriesLimited") : pickerOptions.length ? undefined : t("items.pickerHint")}
            >
              {pickerOptions.length && editing === "new" ? <ItemPicker assetOptions={pickerOptions} categoryIds={categoryIds} /> : <ItemSelect autoFocus categoryIds={categoryIds} />}
            </Form.Item>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Form.Item name="quantity" label={t("items.quantity")} rules={[{ required: true }]} style={{ flex: "0 0 140px" }}>
              <InputNumber min={0.01} step={1} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="supplier_id" label={t("items.supplier")} extra={kind === "text" ? undefined : t("items.supplierOverride")} style={{ flex: "1 1 220px" }}>
              <SupplierSelect canCreate={has("items.edit") || has("costs.edit")} />
            </Form.Item>
          </div>
          {mode === "use" && (
            <Form.Item name="state" label={t("fields.status")}>
              <Radio.Group disabled={editing !== "new" && editing !== null && !!editing.purchase_task_id}>
                <Radio value="needed">{t("items.states.needed")}</Radio>
                <Radio value="used">{t("items.states.used")}</Radio>
                {editing !== "new" && editing?.state === "planned" && <Radio value="planned">{t("items.states.planned")}</Radio>}
              </Radio.Group>
            </Form.Item>
          )}
          <Form.Item name="note" label={t("items.note")} rules={[{ max: 500 }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <ItemFormModal
        open={!!toCatalogue}
        initial={toCatalogue ? { name: toCatalogue.description ?? "", unit_phrase_id: toCatalogue.line_unit_phrase_id, supplier_id: toCatalogue.line_supplier_id } : undefined}
        onClose={() => setToCatalogue(null)}
        onSaved={(id) => void linkToCatalogue(id)}
      />

      <TaskFormModal
        open={!!ordering}
        fixedTypeId={orderType?.id}
        parent={{ id: task.id, asset_id: task.asset_id }}
        initialTitle={t("items.orderTaskTitle", { title: task.title })}
        onClose={() => setOrdering(null)}
        onSaved={(sid) => void linkOrder(sid, ordering ?? [])}
      />
    </div>
  );
};
