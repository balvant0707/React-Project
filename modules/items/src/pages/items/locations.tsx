// Ported 1:1 from COMPASS (app/src/pages/items/locations.tsx).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useTeams } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useStockLocations } from "../../hooks/useStock";
import { STOCK_ERRORS, subtreeIds, type LocationNode, type StockLocation } from "../../lib/stock";
import { errorText } from "@rbp/core";

type Values = { name: string; parent_id?: string | null; code?: string; team_id?: string | null; note?: string; is_active: boolean };

// Create or edit a location. A blank code gets the next free one (L0001 ...).
const LocationFormModal = ({ open, location, parentId, onClose }: { open: boolean; location?: StockLocation | null; parentId?: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { locations, nodes } = useStockLocations();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(location ? { ...location, note: location.note ?? undefined } : { is_active: true, parent_id: parentId ?? null });
  }, [open, location, parentId, form]);
  // A location cannot move below itself.
  const blocked = location ? new Set(subtreeIds(locations, location.id)) : new Set<string>();

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const payload = {
      name: v.name.trim(),
      parent_id: v.parent_id ?? null,
      team_id: v.team_id ?? null,
      note: v.note?.trim() || null,
      is_active: v.is_active,
      ...(v.code?.trim() ? { code: v.code.trim() } : {}),
    };
    const res = location
      ? await supabaseClient.from("stock_locations").update(payload).eq("id", location.id)
      : await supabaseClient.from("stock_locations").insert(payload);
    setSaving(false);
    if (res.error) {
      if (res.error.code === "23505") return form.setFields([{ name: "code", errors: [t("stock.codeTaken")] }]);
      if (res.error.code === "23514") return form.setFields([{ name: "code", errors: [t("stock.codeInvalid")] }]);
      return message.error(errorText(res.error, { known: STOCK_ERRORS }));
    }
    await queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
    onClose();
  };

  return (
    <Modal open={open} title={location ? t("stock.editLocation") : t("stock.newLocation")} okText={t("common.save")} confirmLoading={saving} onOk={() => void submit()} onCancel={onClose} destroyOnClose>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true, max: 120 }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="parent_id" label={t("stock.parent")} extra={t("stock.parentHint")}>
          <Select allowClear showSearch optionFilterProp="label" options={nodes.filter((n) => !blocked.has(n.id)).map((n) => ({ value: n.id, label: n.path }))} />
        </Form.Item>
        <Form.Item name="code" label={t("stock.code")} extra={t("stock.codeHint")} rules={[{ max: 40 }]}>
          <Input placeholder={location ? undefined : t("stock.codeAuto")} />
        </Form.Item>
        <Form.Item name="team_id" label={t("stock.team")} extra={t("stock.teamHint")}>
          <TeamSelect />
        </Form.Item>
        <Form.Item name="note" label={t("stock.note")} rules={[{ max: 500 }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="is_active" label={t("fields.active")} valuePropName="checked" tooltip={t("stock.inactiveHint")}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export const LocationList = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const { data: groups } = useTeams();
  const { nodes, isLoading } = useStockLocations();
  const canEdit = has("stock.edit.all");
  const [editing, setEditing] = useState<{ location?: StockLocation | null; parentId?: string | null } | null>(null);
  const teamName = (id: string | null) => (id ? groups?.find((g) => g.id === id)?.name ?? "—" : "—");

  const remove = async (n: LocationNode) => {
    const { error } = await supabaseClient.from("stock_locations").delete().eq("id", n.id);
    if (error) return message.error(error.code === "23503" ? t("stock.inUse") : errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Link to="/items/locations/labels"><Button icon={<PrinterOutlined />}>{t("stock.labels")}</Button></Link>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>{t("stock.newLocation")}</Button>}
      </div>
      <Table<LocationNode>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={nodes}
        pagination={false}
        scroll={{ x: "max-content" }}
        locale={{ emptyText: t("stock.noLocations") }}
        columns={[
          {
            title: t("fields.name"),
            render: (_: unknown, n) => (
              <span style={{ paddingLeft: n.depth * 20 }}>
                <Link to={`/items/locations/${n.id}`}>{n.name}</Link>
                {!n.is_active && <Tag style={{ marginLeft: 8 }}>{t("items.inactive")}</Tag>}
              </span>
            ),
          },
          { title: t("stock.code"), dataIndex: "code" },
          { title: t("stock.team"), render: (_: unknown, n) => teamName(n.team_id) },
          { title: t("stock.note"), dataIndex: "note", render: (v: string | null) => v ?? "—" },
          ...(canEdit
            ? [{
                title: "",
                align: "right" as const,
                render: (_: unknown, n: LocationNode) => (
                  <Space size={4}>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => setEditing({ parentId: n.id })}>{t("stock.addBelow")}</Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ location: n })} />
                    <Popconfirm title={t("stock.deleteConfirm")} onConfirm={() => void remove(n)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ),
              }]
            : []),
        ]}
      />
      <LocationFormModal open={!!editing} location={editing?.location} parentId={editing?.parentId} onClose={() => setEditing(null)} />
    </>
  );
};
