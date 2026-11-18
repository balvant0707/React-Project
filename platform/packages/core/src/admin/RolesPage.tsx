// Admin > Roles. After COMPASS pages/admin/roles/list.tsx: roles with an English name and the translations; new, rename,
// copy (with its grants) and delete. What a role may do is set on Admin > Grants. The Admin role is built in.
// Modules add columns (slot `admin.roles.columns`: Component gets { roleId, disabled }, label = column title) and copy what
// they keep per role (slot `admin.roles.copy`: value = (fromRoleId, toRoleId) => Promise<string | null>, an error text or null);
// the tasks module puts COMPASS's "task types this role may start" there.
import { useState } from "react";
import { App as AntdApp, Button, Form, Input, Modal, Popconfirm, Space, Table } from "antd";
import { CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ListTable } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { errorText } from "../errors";
import { LANGUAGES } from "../i18n";
import { useRecordSlot } from "../shell/ShellContext";

type Role = { id: string; name: string; translations: Record<string, string> | null };
type Values = { name: string } & Record<string, string | undefined>;
type CopyRoleExtra = (fromRoleId: string, toRoleId: string) => Promise<string | null>;

export const RolesPage = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const extraColumns = useRecordSlot("admin.roles.columns");
  const copyExtras = useRecordSlot("admin.roles.copy");
  const { data: roles, isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => ((await supabaseClient.from("roles").select("id, name, translations").order("name")).data ?? []) as Role[],
  });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-roles"] }), queryClient.invalidateQueries({ queryKey: ["directory", "roles"] })]);

  const open = (role: Role | "new") => {
    setEditing(role);
    const current = role === "new" ? null : role;
    form.setFieldsValue({ name: current?.name ?? "", ...Object.fromEntries(LANGUAGES.map((l) => [`tr_${l}`, current?.translations?.[l] ?? ""])) });
  };

  const save = async () => {
    const values = await form.validateFields();
    const translations = Object.fromEntries(LANGUAGES.map((l) => [l, (values[`tr_${l}`] ?? "").trim()]).filter(([, v]) => v));
    setSaving(true);
    const row = { name: values.name.trim(), translations };
    const { error } = editing === "new" ? await supabaseClient.from("roles").insert(row) : await supabaseClient.from("roles").update(row).eq("id", (editing as Role).id);
    setSaving(false);
    if (error) return void message.error(errorText(error));
    setEditing(null);
    await refresh();
  };

  const copy = async (role: Role) => {
    const { data: created, error } = await supabaseClient.from("roles").insert({ name: `${role.name} (copy)`, translations: role.translations ?? {} }).select("id").single();
    if (error || !created) return void message.error(errorText(error));
    const { data: grants } = await supabaseClient.from("role_permissions").select("permission").eq("role_id", role.id);
    if (grants?.length) {
      const { error: grantError } = await supabaseClient.from("role_permissions").insert(grants.map((g) => ({ role_id: created.id, permission: g.permission })));
      if (grantError) message.error(errorText(grantError));
    }
    for (const extra of copyExtras) {
      const problem = await (extra.value as CopyRoleExtra)(role.id, created.id);
      if (problem) message.error(problem);
    }
    await refresh();
  };

  const remove = async (role: Role) => {
    const { error } = await supabaseClient.from("roles").delete().eq("id", role.id);
    if (error) return void message.error(errorText(error));
    await refresh();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open("new")}>{t("admin.newRole")}</Button>
      </div>
      <ListTable<Role> dataSource={roles} loading={isLoading} rowKey="id" pagination={false} onRow={(r) => ({ onClick: () => r.name !== "Admin" && open(r), style: { cursor: r.name === "Admin" ? "default" : "pointer" } })}>
        <Table.Column dataIndex="name" title={t("fields.name")} render={(v: string) => <b>{v}</b>} />
        {LANGUAGES.map((l) => <Table.Column key={l} title={t(`languages.${l}`)} render={(_, r: Role) => r.translations?.[l] ?? "—"} />)}
        {extraColumns.map((c) => c.Component ? (
          <Table.Column key={c.key} title={t(c.label ?? c.key)} render={(_, r: Role) => {
            const Cell = c.Component!;
            return <div onClick={(e) => e.stopPropagation()}><Cell roleId={r.id} disabled={r.name === "Admin"} /></div>;
          }} />
        ) : null)}
        <Table.Column title="" width={96} render={(_, r: Role) => r.name === "Admin" ? null : (
          <Space size={0} onClick={(e) => e.stopPropagation()}>
            <Button type="text" icon={<CopyOutlined />} aria-label={t("admin.copyRole")} onClick={() => void copy(r)} />
            <Popconfirm title={t("admin.deleteRoleTitle", { name: r.name })} description={t("admin.deleteRoleText")} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")} onConfirm={() => remove(r)}>
              <Button type="text" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} />
            </Popconfirm>
          </Space>
        )} />
      </ListTable>
      <Modal open={!!editing} title={editing === "new" ? t("admin.newRole") : (editing as Role | null)?.name} onCancel={() => setEditing(null)} onOk={save} okText={t("common.save")} cancelText={t("common.cancel")} confirmLoading={saving} destroyOnClose forceRender>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("fields.name")} rules={[{ required: true }]}><Input /></Form.Item>
          {LANGUAGES.map((l) => <Form.Item key={l} name={`tr_${l}`} label={t(`languages.${l}`)}><Input /></Form.Item>)}
        </Form>
      </Modal>
    </>
  );
};
