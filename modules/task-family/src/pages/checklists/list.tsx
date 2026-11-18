// Ported 1:1 from COMPASS (app/src/pages/checklists/list.tsx).
import { useState } from "react";
import { Alert, App as AntdApp, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { List } from "@rbp/core";
import { blankItems, dropBlank, ItemsEditor, validItems, withKeys, type EditorItem } from "../../components/checklist/itemsEditor";
import { saveItems, templateRights, type ItemDef } from "../../lib/checklists";
import { useTaskTypes } from "../tasks/taskForm";
import { OwnerSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useUserMap } from "@rbp/core";
import { useMe } from "@rbp/core";
import { userDisplayName } from "@rbp/module-messaging/src/feed/mentions.ts";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { formatDate } from "@rbp/ui";
import { errorText } from "@rbp/core";

type Row = { id: string; name: string; description: string | null; active: boolean; updated_at: string; task_type_id: string | null; owner_user_id: string | null; items: { count: number }[]; rules: { count: number }[] };

// Library of reusable checklists. Many maintenance tasks use the same list: build it once here, pick it on a task or on a
// recurring task, and every task made from it gets its own copy to fill in.
export const ChecklistTemplateList = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const { data: rights } = useQuery({ queryKey: ["template-rights"], queryFn: templateRights, staleTime: 5 * 60_000 });
  const { data: types } = useTaskTypes(false);
  const users = useUserMap();
  const { userId: meId } = useMe();
  // Edit: any template with edit.all, the own ones with edit.own (the database checks the same).
  const canEditRow = (r: Row) => !!rights?.editAll || (!!rights?.editOwn && !!meId && r.owner_user_id === meId);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["checklist-templates", "all"],
    queryFn: async () =>
      ((await supabaseClient.from("checklist_templates").select("*, items:checklist_template_items(count), rules:recurring_task_rules(count)").order("name")).data ?? []) as Row[],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });

  const duplicate = async (row: Row) => {
    const { error } = await supabaseClient.rpc("checklist_template_duplicate", { p_template_id: row.id, p_name: `${row.name} (${t("checklists.copy")})` });
    if (error) return message.error(errorText(error));
    await refresh();
  };

  const remove = async (row: Row) => {
    const { error } = await supabaseClient.from("checklist_templates").delete().eq("id", row.id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  return (
    <List
      title={t("checklists.templatesTitle")}
      hint={t("checklists.templatesHint")}
      headerButtons={rights?.canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>{t("checklists.newTemplate")}</Button> : null}
    >
      <Table<Row> rowKey="id" loading={isLoading} dataSource={rows ?? []} pagination={false} scroll={{ x: 1100 }}>
        <Table.Column dataIndex="name" title={t("fields.name")} width={300} render={(v, r: Row) => <Space direction="vertical" size={0}><Typography.Text strong>{v}</Typography.Text>{r.description && <Typography.Text type="secondary">{r.description}</Typography.Text>}</Space>} />
        <Table.Column title={t("fields.taskType")} width={160} render={(_, r: Row) => (r.task_type_id ? localName(types?.find((x) => x.id === r.task_type_id)) : "—")} />
        <Table.Column title={t("fields.owner")} width={150} render={(_, r: Row) => (r.owner_user_id && users.get(r.owner_user_id) ? userDisplayName(users.get(r.owner_user_id)!) : "—")} />
        <Table.Column title={t("checklists.items")} render={(_, r: Row) => r.items?.[0]?.count ?? 0} width={90} />
        <Table.Column title={t("checklists.usedByRules")} render={(_, r: Row) => r.rules?.[0]?.count ?? 0} width={150} />
        <Table.Column dataIndex="active" title={t("fields.active")} width={90} render={(v) => (v ? <Tag color="green">{t("status.active")}</Tag> : <Tag>{t("status.inactive")}</Tag>)} />
        <Table.Column dataIndex="updated_at" title={t("fields.updatedAt")} width={120} render={formatDate} />
        <Table.Column
          title=""
          width={150}
          render={(_, r: Row) => (
            <Space size={0}>
              {canEditRow(r) && <Button type="text" icon={<EditOutlined />} aria-label={t("common.edit")} onClick={() => setEditing(r)} />}
              {rights?.canCreate && <Button type="text" icon={<CopyOutlined />} aria-label={t("checklists.duplicate")} onClick={() => duplicate(r)} />}
              {rights?.canDelete && (
                <Popconfirm title={t("checklists.deleteConfirm")} description={t("checklists.deleteHint")} onConfirm={() => remove(r)}>
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} />
                </Popconfirm>
              )}
            </Space>
          )}
        />
      </Table>
      <TemplateModal editing={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />
    </List>
  );
};

const TemplateModal = ({ editing, onClose, onSaved }: { editing: Row | "new" | null; onClose: () => void; onSaved: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [items, setItems] = useState<EditorItem[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const { data: types } = useTaskTypes(false);
  const { data: steps } = useQuery({
    queryKey: ["task-type-steps", typeId],
    enabled: !!typeId,
    queryFn: async () => ((await supabaseClient.from("task_type_steps").select("step_key, name, name_de, step_order").eq("task_type_id", typeId!).order("step_order")).data ?? []) as { step_key: string; name: string; name_de: string; step_order: number }[],
  });

  const id = editing === "new" ? "new" : editing?.id ?? null;
  if (id !== loadedFor) {
    setLoadedFor(id);
    if (editing === "new") {
      setName("");
      setDescription("");
      setActive(true);
      setTypeId(null);
      setOwnerId(null);
      setItems(blankItems());
      setOriginalIds([]);
    } else if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setActive(editing.active);
      setTypeId(editing.task_type_id);
      setOwnerId(editing.owner_user_id);
      setItems([]);
      setOriginalIds([]);
      void supabaseClient.from("checklist_template_items").select("*").eq("template_id", editing.id).order("sort_order").then(({ data }) => {
        setItems(withKeys((data ?? []) as ItemDef[]));
        setOriginalIds((data ?? []).map((i) => i.id as string));
      });
    }
  }

  const save = async () => {
    const kept = dropBlank(items);
    if (!name.trim() || !validItems(kept)) return message.warning(t("checklists.incompleteForm"));
    setBusy(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || null, active, task_type_id: typeId, ...(editing === "new" && !ownerId ? {} : { owner_user_id: ownerId }) };
      let templateId: string;
      if (editing === "new") {
        const { data, error } = await supabaseClient.from("checklist_templates").insert(payload).select("id").single();
        if (error) throw error;
        templateId = data.id;
      } else {
        templateId = (editing as Row).id;
        const { error } = await supabaseClient.from("checklist_templates").update(payload).eq("id", templateId);
        if (error) throw error;
      }
      await saveItems("checklist_template_items", "template_id", templateId, kept, originalIds);
      onSaved();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!editing} onCancel={onClose} onOk={save} confirmLoading={busy} width={820} title={editing === "new" ? t("checklists.newTemplate") : t("checklists.editTemplate")} destroyOnClose>
      {editing !== "new" && editing && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("checklists.editHint")} />}
      <Form layout="vertical">
        <div style={{ display: "flex", gap: 16 }}>
          <Form.Item label={t("fields.name")} required style={{ flex: 1 }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus />
          </Form.Item>
          <Form.Item label={t("fields.active")}>
            <Switch checked={active} onChange={setActive} />
          </Form.Item>
        </div>
        <Form.Item label={t("fields.description")}>
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Form.Item>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Form.Item label={t("fields.taskType")} extra={t("checklists.templateTypeHint")} style={{ flex: "1 1 300px" }}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t("checklists.allTaskTypes")}
            value={typeId ?? undefined}
            options={sortByName(types).map((x) => ({ value: x.id, label: localName(x) }))}
            // Another type has other steps: the step of every item is cleared (the database does the same).
            onChange={(v) => { setTypeId(v ?? null); setItems((cur) => cur.map((i) => ({ ...i, step_key: null }))); }}
          />
        </Form.Item>
        {editing !== "new" && (
          <Form.Item label={t("fields.owner")} extra={t("checklists.ownerHint")} style={{ flex: "1 1 300px" }}>
            <OwnerSelect value={ownerId} onChange={setOwnerId} />
          </Form.Item>
        )}
        </div>
      </Form>
      <Typography.Title level={5}>{t("checklists.items")}</Typography.Title>
      <ItemsEditor value={items} onChange={setItems} focusFirst={editing === "new"} steps={(steps ?? []).map((s) => ({ value: s.step_key, label: localName(s) }))} />
    </Modal>
  );
};
