// Ported 1:1 from COMPASS (app/src/pages/admin/assetAttributes/list.tsx).
import { useState } from "react";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { useAssetAttributes } from "../../../hooks/useAssetAttributes";
import { ATTRIBUTE_DATA_TYPES, type AssetAttribute, type AttributeDataType } from "../../../lib/assetAttributes";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { errorText } from "@rbp/core";

type FormValues = { name: string; data_type: AttributeDataType; unit?: string; description?: string; asset_type_ids: string[] };

// The global list of asset attributes (technical data) and the asset types that offer each one.
// A list attribute is a self-learning choice list: free text with suggestions from the values in use.
export const AssetAttributeList = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<AssetAttribute | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const dataType = Form.useWatch("data_type", form);
  const { data: attributes, isLoading } = useAssetAttributes();
  const { data: types } = useQuery({
    queryKey: ["asset-types"],
    queryFn: async () => ((await supabaseClient.from("asset_types").select("id, name, name_de").order("name")).data ?? []) as { id: string; name: string; name_de: string }[],
  });
  // How many assets hold a value, so deleting or retyping a used attribute is a visible decision.
  const { data: usage } = useQuery({
    queryKey: ["asset-attribute-usage"],
    queryFn: async () => {
      const { data } = await supabaseClient.from("asset_attributes").select("id, asset_attribute_values(count)");
      return Object.fromEntries(((data ?? []) as { id: string; asset_attribute_values: { count: number }[] }[]).map((r) => [r.id, r.asset_attribute_values[0]?.count ?? 0]));
    },
  });
  const typeName = (id: string) => {
    const type = types?.find((x) => x.id === id);
    return type ? localName(type) : id;
  };
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["asset-attributes"] }), queryClient.invalidateQueries({ queryKey: ["asset-attribute-usage"] })]);

  const open = (attribute: AssetAttribute | "new") => {
    form.resetFields();
    form.setFieldsValue(
      attribute === "new"
        ? { data_type: "text", asset_type_ids: [] }
        : { name: attribute.name, data_type: attribute.data_type, unit: attribute.unit ?? undefined, description: attribute.description ?? undefined, asset_type_ids: attribute.asset_type_ids },
    );
    setEditing(attribute);
  };

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !editing) return;
    setSaving(true);
    try {
      const row = { name: v.name.trim(), data_type: v.data_type, unit: v.data_type === "number" ? v.unit?.trim() || null : null, description: v.description?.trim() || null };
      const saved =
        editing === "new"
          ? await supabaseClient.from("asset_attributes").insert(row).select("id").single()
          : await supabaseClient.from("asset_attributes").update(row).eq("id", editing.id).select("id").single();
      if (saved.error) {
        form.setFields([{ name: saved.error.message.includes("asset_attribute_in_use") ? "data_type" : "name", errors: [saved.error.message.includes("asset_attribute_in_use") ? t("assetAttributes.typeInUse") : saved.error.message] }]);
        return;
      }
      const id = saved.data.id as string;
      const before = editing === "new" ? [] : editing.asset_type_ids;
      const removed = before.filter((x) => !v.asset_type_ids.includes(x));
      const added = v.asset_type_ids.filter((x) => !before.includes(x));
      if (removed.length) {
        const { error } = await supabaseClient.from("asset_type_attributes").delete().eq("asset_attribute_id", id).in("asset_type_id", removed);
        if (error) throw error;
      }
      if (added.length) {
        const { error } = await supabaseClient.from("asset_type_attributes").insert(added.map((asset_type_id) => ({ asset_type_id, asset_attribute_id: id })));
        if (error) throw error;
      }
      await refresh();
      setEditing(null);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("asset_attributes").delete().eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
  };

  return (
    <List
      hint={t("configuration.asset_attributes.description")}
      headerButtons={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>
          {t("common.new")}
        </Button>
      }
    >
      <Table<AssetAttribute> dataSource={attributes ?? []} loading={isLoading} rowKey="id" pagination={false}>
        <Table.Column dataIndex="name" title={t("fields.name")} />
        <Table.Column dataIndex="data_type" title={t("assetAttributes.dataType")} render={(v: AttributeDataType) => t(`assetAttributes.types.${v}`)} />
        <Table.Column dataIndex="unit" title={t("assetAttributes.unit")} render={(v) => v ?? "—"} />
        <Table.Column
          dataIndex="asset_type_ids"
          title={t("assetAttributes.assetTypes")}
          render={(ids: string[]) => (ids.length ? ids.map((id) => <Tag key={id}>{typeName(id)}</Tag>) : "—")}
        />
        <Table.Column title={t("assetAttributes.usage")} align="right" render={(_, r: AssetAttribute) => usage?.[r.id] ?? "—"} />
        <Table.Column
          title={t("common.actions")}
          width={120}
          render={(_, r: AssetAttribute) => (
            <Space size={0}>
              <Button icon={<EditOutlined />} type="text" onClick={() => open(r)} />
              <Popconfirm
                title={usage?.[r.id] ? t("assetAttributes.deleteUsed", { count: usage[r.id] }) : t("common.deleteConfirm")}
                onConfirm={() => remove(r.id)}
              >
                <Button icon={<DeleteOutlined />} type="text" danger />
              </Popconfirm>
            </Space>
          )}
        />
      </Table>
      <Modal open={!!editing} title={editing === "new" ? t("common.new") : t("common.edit")} onCancel={() => setEditing(null)} onOk={save} confirmLoading={saving} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true, max: 100 }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="data_type" label={t("assetAttributes.dataType")} extra={dataType === "list" ? t("assetAttributes.listHint") : undefined}>
            <Select options={ATTRIBUTE_DATA_TYPES.map((x) => ({ value: x, label: t(`assetAttributes.types.${x}`) }))} />
          </Form.Item>
          {dataType === "number" && (
            <Form.Item name="unit" label={t("assetAttributes.unit")} rules={[{ max: 20 }]}>
              <Input placeholder="kW" style={{ width: 160 }} />
            </Form.Item>
          )}
          <Form.Item name="asset_type_ids" label={t("assetAttributes.assetTypes")} extra={t("assetAttributes.assetTypesHint")}>
            <Select mode="multiple" optionFilterProp="label" options={sortByName(types).map((x) => ({ value: x.id, label: localName(x) }))} />
          </Form.Item>
          <Form.Item name="description" label={t("fields.description")}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
