// Ported 1:1 from COMPASS (app/src/modules/absences/typesAdmin.tsx).
import { useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Form, Input, InputNumber, Modal, Select, Switch, Table, Typography } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { List } from "@rbp/core";
import { ColorSelect, IconSelect } from "@rbp/module-task-family/src/components/lookPickers.tsx";
import { DEFAULT_ABSENCE_TYPE_ICON } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { supabaseClient } from "@rbp/core";
import { AbsenceTypeOption } from "./absenceTypeLabel";
import { ABSENCE_TYPES_KEY, useAbsenceTypes, type AbsenceType } from "./useAbsenceTypes";

type Route = { id: string; name: string; name_de: string; active: boolean };
type FormValues = Omit<AbsenceType, "id">;

// Absence types (Admin > Configuration): name, look, the route that handles them and whether they count as leave. A
// route is a task type with the special function "leave", designed in the task type editor (approval, booking, ...).
export const AbsenceTypeList = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: types, isLoading } = useAbsenceTypes();
  const { data: routes } = useQuery({
    queryKey: ["absence-routes"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("task_types").select("id, name, name_de, active").eq("purpose", "leave").order("name");
      if (error) throw error;
      return (data ?? []) as Route[];
    },
  });
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<Partial<AbsenceType> | null>(null);

  const open = (type: Partial<AbsenceType>) => {
    form.resetFields();
    form.setFieldsValue({ counts_as_leave: false, active: true, sort_order: (types?.at(-1)?.sort_order ?? 0) + 10, task_type_id: routes?.[0]?.id, ...type });
    setEditing(type);
  };

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !editing) return;
    const payload = {
      name: v.name.trim(),
      name_de: v.name_de.trim(),
      description: v.description?.trim() || null,
      icon: v.icon ?? null,
      color: v.color ?? null,
      task_type_id: v.task_type_id,
      counts_as_leave: !!v.counts_as_leave,
      sort_order: v.sort_order ?? 0,
      active: !!v.active,
    };
    const { error } = editing.id
      ? await supabaseClient.from("absence_types").update(payload).eq("id", editing.id)
      : await supabaseClient.from("absence_types").insert(payload);
    if (error) return void message.error(errorText(error));
    setEditing(null);
    void queryClient.invalidateQueries({ queryKey: ABSENCE_TYPES_KEY });
  };

  const routeName = (id: string) => localName(routes?.find((r) => r.id === id));

  return (
    <List headerButtons={<Button type="primary" icon={<PlusOutlined />} onClick={() => open({})}>{t("common.new")}</Button>}>
      <Typography.Paragraph type="secondary">{t("admin.absenceTypes.hint")}</Typography.Paragraph>
      <Table<AbsenceType> dataSource={types ?? []} rowKey="id" loading={isLoading} pagination={false}>
        <Table.Column title={t("fields.name")} render={(_, r: AbsenceType) => <AbsenceTypeOption type={r} />} />
        <Table.Column
          dataIndex="task_type_id"
          title={t("admin.absenceTypes.route")}
          render={(id: string) => <Link to={`/admin/task-types/${id}`}>{routeName(id) || "—"}</Link>}
        />
        <Table.Column dataIndex="counts_as_leave" title={t("admin.absenceTypes.countsAsLeave")} render={(v) => (v ? t("common.yes") : t("common.no"))} />
        <Table.Column dataIndex="active" title={t("fields.active")} render={(v) => (v ? t("common.yes") : t("common.no"))} />
        <Table.Column width={60} render={(_, r: AbsenceType) => <Button type="text" icon={<EditOutlined />} onClick={() => open(r)} />} />
      </Table>

      <Modal open={!!editing} title={editing?.id ? t("common.edit") : t("common.new")} onCancel={() => setEditing(null)} onOk={save} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("fields.nameEn")} rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name_de" label={t("fields.nameDe")} rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t("fields.description")}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
          <div style={{ display: "flex", gap: 16 }}>
            <Form.Item name="icon" label={t("looks.icon")} style={{ flex: 1 }}>
              <IconSelect fallback={DEFAULT_ABSENCE_TYPE_ICON} />
            </Form.Item>
            <Form.Item name="color" label={t("looks.color")} style={{ flex: 1 }}>
              <ColorSelect />
            </Form.Item>
          </div>
          <Form.Item
            name="task_type_id"
            label={t("admin.absenceTypes.route")}
            rules={[{ required: true }]}
            extra={<>{t("admin.absenceTypes.routeHint")} <Link to="/admin/task-types/new">{t("admin.absenceTypes.newRoute")}</Link></>}
          >
            <Select options={(routes ?? []).map((r) => ({ value: r.id, label: localName(r) + (r.active ? "" : ` (${t("admin.absenceTypes.inactive")})`) }))} />
          </Form.Item>
          <Form.Item name="counts_as_leave" label={t("admin.absenceTypes.countsAsLeave")} valuePropName="checked" extra={t("admin.absenceTypes.countsAsLeaveHint")}>
            <Switch />
          </Form.Item>
          <Form.Item name="sort_order" label={t("fields.order")}>
            <InputNumber />
          </Form.Item>
          <Form.Item name="active" label={t("fields.active")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
