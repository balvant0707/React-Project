// Ported 1:1 from COMPASS (app/src/pages/items/suppliers.tsx).
import { useState } from "react";
import { App as AntdApp, Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useSuppliers } from "@rbp/module-task-family/src/hooks/useItems.ts";
import type { Supplier } from "@rbp/module-task-family/src/lib/items.ts";
import { errorText } from "@rbp/core";

type Values = Omit<Supplier, "id">;

// Suppliers of parts and cost items. Holders of items.edit or costs.edit add and edit them; a supplier that is used
// cannot be deleted (the database refuses it), it is deactivated instead.
export const SupplierList = ({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: suppliers, isLoading } = useSuppliers();
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [form] = Form.useForm<Values>();

  const open = (row: Supplier | "new") => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(row === "new" ? { is_active: true } : row);
  };

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !editing) return;
    const payload = {
      name: v.name.trim(),
      customer_number: v.customer_number?.trim() || null,
      erp_supplier_number: v.erp_supplier_number?.trim() || null,
      email: v.email?.trim() || null,
      phone: v.phone?.trim() || null,
      website: v.website?.trim() || null,
      notes: v.notes?.trim() || null,
      is_active: v.is_active ?? true,
    };
    const { error } = editing === "new" ? await supabaseClient.from("suppliers").insert(payload) : await supabaseClient.from("suppliers").update(payload).eq("id", editing.id);
    if (error) {
      form.setFields([{ name: "name", errors: [error.code === "23505" ? t("items.supplierTaken") : error.message] }]);
      return;
    }
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const remove = async (row: Supplier) => {
    const { error } = await supabaseClient.from("suppliers").delete().eq("id", row.id);
    if (error) return message.error(error.code === "23503" ? t("items.supplierInUse") : errorText(error));
    void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
  };

  const term = search.trim().toLowerCase();
  const rows = (suppliers ?? []).filter((s) => !term || s.name.toLowerCase().includes(term) || (s.customer_number ?? "").toLowerCase().includes(term) || (s.erp_supplier_number ?? "").toLowerCase().includes(term));

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, justifyContent: "space-between" }}>
        <Input.Search allowClear placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>{t("items.addSupplier")}</Button>}
      </div>
      <Table<Supplier>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={rows}
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        columns={[
          { title: t("fields.name"), dataIndex: "name", render: (v: string, r) => <>{v}{!r.is_active && <Tag style={{ marginLeft: 8 }}>{t("items.inactive")}</Tag>}</> },
          { title: t("items.customerNumber"), dataIndex: "customer_number", render: (v: string | null) => v ?? "—" },
          { title: t("items.erp.supplierNumber"), dataIndex: "erp_supplier_number", render: (v: string | null) => v ?? "—" },
          { title: t("fields.email"), dataIndex: "email", render: (v: string | null) => (v ? <a href={`mailto:${v}`}>{v}</a> : "—") },
          { title: t("items.phone"), dataIndex: "phone", render: (v: string | null) => (v ? <a href={`tel:${v}`}>{v}</a> : "—") },
          { title: t("items.website"), dataIndex: "website", render: (v: string | null) => (v ? <a href={/^https?:\/\//.test(v) ? v : `https://${v}`} target="_blank" rel="noreferrer">{v}</a> : "—") },
          ...(canEdit
            ? [{
                title: "",
                render: (_: unknown, r: Supplier) => (
                  <Space size={4}>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => open(r)} />
                    {canDelete && (
                      <Popconfirm title={t("common.deleteConfirm")} onConfirm={() => remove(r)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </Space>
                ),
              }]
            : []),
        ]}
      />
      <Modal open={!!editing} title={editing === "new" ? t("items.addSupplier") : t("items.editSupplier")} onCancel={() => setEditing(null)} onOk={save} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true, max: 100 }]}>
            <Input autoFocus />
          </Form.Item>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Form.Item name="customer_number" label={t("items.customerNumber")} tooltip={t("items.customerNumberHint")} rules={[{ max: 60 }]} style={{ flex: "1 1 200px" }}>
              <Input />
            </Form.Item>
            <Form.Item name="erp_supplier_number" label={t("items.erp.supplierNumber")} rules={[{ max: 60 }]} style={{ flex: "1 1 200px" }}>
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Form.Item name="email" label={t("fields.email")} rules={[{ type: "email", max: 200 }]} style={{ flex: "1 1 200px" }}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label={t("items.phone")} rules={[{ max: 60 }]} style={{ flex: "1 1 160px" }}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="website" label={t("items.website")} rules={[{ max: 300 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="notes" label={t("items.notes")} rules={[{ max: 2000 }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          {editing !== "new" && (
            <Form.Item name="is_active" label={t("fields.active")} valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
};
