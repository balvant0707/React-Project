// Admin > Users, after COMPASS pages/admin/users/list.tsx: a sortable list on users_admin_overview; a row opens the edit
// modal (person fields, sign-in method, roles, teams, LoginAccess); "Add person" adds one without a login.
import { useEffect, useState } from "react";
import { App as AntdApp, Button, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ListTable } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { errorText } from "../errors";
import { LoginAccess } from "../login/LoginAccess";
import { useAdminDelegation, usePermissions, useRoles, useTeams, useUsers, usersFor } from "../directory";
import { useListTable } from "../kit/useListTable";
import { useListFilterBar, type ListFilterDef } from "../kit/listFilterBar";
import { ResponsiveList } from "../kit/mobileCardList";
import { SuggestInput } from "../kit/suggestInput";
import { currentLanguage } from "../i18n";
import { useRecordSlot } from "../shell/ShellContext";

type SignInMethod = "password" | "sso";
type Row = {
  id: string; name: string | null; email: string | null; position: string | null; site: string | null; username: string;
  supervisor_user_id: string | null; deputy_user_id: string | null; sign_in_method: SignInMethod; has_login: boolean;
  supervisor_name: string | null; deputy_name: string | null;
  role_ids: string[]; role_names: string | null; team_ids: string[]; team_names: string | null;
  locked_at: string | null;
  // Columns of modules (slot "admin.users.fields", e.g. NPM short code and office), read from users_admin_overview.
  [column: string]: unknown;
};
type Draft = { name: string; username: string; email: string; position: string; site: string; supervisor: string | null; deputy: string | null; method: SignInMethod; roleIds: string[]; teamIds: string[]; extra: Record<string, unknown> };

// A field a module adds to the edit dialog: slot "admin.users.fields", value = { column, label } (a users column the view
// users_admin_overview also carries), Component = the input ({ value, onChange, disabled }). Saved with the person fields.
export type UserFieldSlotValue = { column: string; label: string };

export const roleLabel = (role: { name: string; translations: Record<string, string> | null }) => role.translations?.[currentLanguage()] ?? role.name;

export const LoginStateTags = ({ person }: { person: Pick<Row, "has_login" | "locked_at"> }) => {
  const { t } = useTranslation();
  if (!person.has_login) return <Tag>{t("admin.noLogin")}</Tag>;
  return person.locked_at ? <Tag color="red">{t("admin.locked")}</Tag> : <Tag color="green">{t("admin.hasLogin")}</Tag>;
};

export const UsersPage = () => {
  const { t } = useTranslation();
  const { admin } = usePermissions();
  const { canManageUsers, canManageTeams } = useAdminDelegation();
  const rights = { admin, users: canManageUsers, teams: canManageTeams };
  const { tableProps, filters, setFilters, tableQuery } = useListTable<Row>({
    resource: "users_admin_overview",
    syncWithLocation: true,
    pagination: { pageSize: 50 },
    sorters: { initial: [{ field: "name", order: "asc" }] },
  });
  const { data: people } = useUsers();
  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const [editing, setEditing] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);

  const filterDefs: ListFilterDef[] = [
    { kind: "text", key: "search", label: t("common.search"), fields: ["name", "username", "email", "position", "site"] },
    { kind: "select", key: "role", label: t("admin.roles"), field: "role_ids", arrayField: true, options: (roles ?? []).map((r) => ({ value: r.id, label: roleLabel(r) })) },
    { kind: "select", key: "team", label: t("admin.teams"), field: "team_ids", arrayField: true, options: (teams ?? []).map((g) => ({ value: g.id, label: g.name })) },
    { kind: "select", key: "signIn", label: t("admin.signIn"), field: "sign_in_method", options: [{ value: "password", label: t("admin.signInPassword") }, { value: "sso", label: t("admin.signInSso") }] },
  ];
  const filterBar = useListFilterBar(filterDefs, filters, setFilters);

  const reload = async () => {
    const { data } = await tableQuery.refetch();
    setEditing((current) => (current ? (data?.data.find((r) => r.id === current.id) as Row | undefined) ?? current : current));
  };

  const roleNames = (ids: string[]) => ids.map((id) => roles?.find((r) => r.id === id)).filter((r) => !!r).map((r) => roleLabel(r!)).sort().join(", ");
  const tagList = (names: string | null) => (names ? <Space size={[4, 4]} wrap>{names.split(", ").map((n) => <Tag key={n} style={{ marginInlineEnd: 0 }}>{n}</Tag>)}</Space> : "—");
  const methodLabel = (m: SignInMethod) => (m === "sso" ? t("admin.signInSso") : t("admin.signInPassword"));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        {filterBar.picker}
        {rights.users && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>{t("admin.addPerson")}</Button>}
      </div>
      <AddPersonModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={async (id) => {
          setAdding(false);
          const { data } = await tableQuery.refetch();
          const row = data?.data.find((r) => r.id === id) as Row | undefined;
          if (row) setEditing(row);
        }}
      />
      <div style={{ marginBottom: 12 }}>{filterBar.chips}</div>
      <ResponsiveList<Row>
        tableProps={tableProps}
        onOpen={setEditing}
        render={(r) => ({
          title: r.name ?? r.email ?? r.id,
          subtitle: [r.username, r.email, r.position].filter(Boolean).join(" · ") || null,
          tags: <LoginStateTags person={r} />,
          footer: [methodLabel(r.sign_in_method), r.team_names].filter(Boolean).join(" · "),
        })}
      >
        {() => (
        <ListTable<Row> {...tableProps} rowKey="id" onRow={(r) => ({ onClick: () => setEditing(r), style: { cursor: "pointer" } })}>
          <Table.Column dataIndex="name" title={t("fields.name")} sorter render={(v: string | null) => <span style={{ fontWeight: 600 }}>{v ?? "—"}</span>} />
          <Table.Column dataIndex="username" title={t("login.username")} sorter render={(v: string) => <span style={{ fontFamily: "monospace" }}>{v}</span>} />
          <Table.Column dataIndex="email" title={t("fields.email")} sorter render={(v: string | null) => v ?? "—"} />
          <Table.Column dataIndex="position" title={t("fields.position")} sorter responsive={["xxl"]} render={(v) => v ?? "—"} />
          <Table.Column dataIndex="sign_in_method" title={t("admin.signIn")} sorter responsive={["xl"]} render={(v: SignInMethod) => methodLabel(v)} />
          <Table.Column dataIndex="has_login" title={t("admin.login")} sorter render={(_: boolean, r: Row) => <LoginStateTags person={r} />} />
          <Table.Column dataIndex="role_names" title={t("admin.roles")} render={(_: string | null, r: Row) => tagList(roleNames(r.role_ids))} />
          <Table.Column dataIndex="team_names" title={t("admin.teams")} responsive={["lg"]} render={(v: string | null) => tagList(v)} />
        </ListTable>
        )}
      </ResponsiveList>
      {filterBar.modal}
      <UserEditModal record={editing} rights={rights} people={people ?? []} onChanged={reload} onClose={() => setEditing(null)} />
    </>
  );
};

// "Add person": a person without a login (NPM "Add user", COMPASS "Add person" without the HR fields). Roles, teams and
// "Give login" follow in the edit dialog, which opens right after.
const AddPersonModal = ({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (id: string) => Promise<void> }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<{ name: string; email?: string; username: string }>();
  const [saving, setSaving] = useState(false);
  const suggest = (name: string) => name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    const { data, error } = await supabaseClient.from("users").insert({ name: v.name.trim(), email: v.email?.trim() || null, username: v.username.trim() }).select("id").single();
    setSaving(false);
    if (error) return void message.error(errorText(error));
    form.resetFields();
    await onAdded((data as { id: string }).id);
  };
  return (
    <Modal open={open} title={t("admin.addPerson")} onCancel={onClose} onOk={() => void submit()} okText={t("common.save")} cancelText={t("common.cancel")} confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" onValuesChange={(changed: { name?: string }) => {
        if (changed.name !== undefined && !form.isFieldTouched("username")) form.setFieldValue("username", suggest(changed.name));
      }}>
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true }]}><Input autoFocus /></Form.Item>
        <Form.Item name="email" label={t("fields.email")} rules={[{ type: "email" }]}><Input type="email" /></Form.Item>
        <Form.Item name="username" label={t("login.username")} rules={[{ required: true }]} extra={t("admin.addPersonHint")}>
          <Input autoCapitalize="none" spellCheck={false} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const UserEditModal = ({ record, rights, people, onChanged, onClose }: {
  record: Row | null; rights: { admin: boolean; users: boolean; teams: boolean }; people: { id: string; name: string | null; email: string | null; locked_at?: string | null }[];
  onChanged: () => Promise<void>; onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const extraFields = useRecordSlot("admin.users.fields");

  useEffect(() => {
    if (record) setDraft({ name: record.name ?? "", username: record.username, email: record.email ?? "", position: record.position ?? "", site: record.site ?? "", supervisor: record.supervisor_user_id, deputy: record.deputy_user_id, method: record.sign_in_method, roleIds: record.role_ids, teamIds: record.team_ids, extra: Object.fromEntries(extraFields.map((s) => { const c = (s.value as UserFieldSlotValue).column; return [c, record[c] ?? null]; })) });
    // Re-seed only when another person is opened, not when the lists reload underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  if (!record || !draft) return <Modal open={false} />;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const options = usersFor(people, [draft.supervisor, draft.deputy].filter((id): id is string => !!id)).filter((p) => p.id !== record.id).map((p) => ({ label: p.name ?? p.email ?? p.id, value: p.id }));

  // Diff of a join table against the saved state.
  const syncJoin = async (table: "user_roles" | "user_teams", column: "role_id" | "team_id", previous: string[], next: string[]) => {
    const toAdd = next.filter((id) => !previous.includes(id));
    if (toAdd.length > 0) {
      const { error } = await supabaseClient.from(table).insert(toAdd.map((id) => ({ user_id: record.id, [column]: id })));
      if (error) throw error;
    }
    for (const id of previous.filter((p) => !next.includes(p))) {
      const { error } = await supabaseClient.from(table).delete().eq("user_id", record.id).eq(column, id);
      if (error) throw error;
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (rights.users) {
        const patch = { name: draft.name.trim() || null, ...(draft.username.trim() !== record.username ? { username: draft.username.trim() } : {}), ...(record.has_login ? {} : { email: draft.email.trim() || null }), position: draft.position.trim() || null, site: draft.site.trim() || null, supervisor_user_id: draft.supervisor, deputy_user_id: draft.deputy, ...draft.extra };
        const { error } = await supabaseClient.from("users").update(patch).eq("id", record.id);
        if (error) throw error;
      }
      if (rights.admin) await syncJoin("user_roles", "role_id", record.role_ids, draft.roleIds);
      if (rights.teams) await syncJoin("user_teams", "team_id", record.team_ids, draft.teamIds);
      // Sign-in method last: the database ends the user's sessions on a switch.
      if (rights.admin && draft.method !== record.sign_in_method) {
        const { error } = await supabaseClient.from("users").update({ sign_in_method: draft.method }).eq("id", record.id);
        if (error) throw error;
      }
      onClose();
    } catch (error) {
      message.error(errorText(error));
    }
    setSaving(false);
    await onChanged();
  };

  const submit = () => {
    if (draft.method === record.sign_in_method) return void save();
    // A switch deletes the password or the Microsoft link and ends sessions, so it is confirmed separately.
    modal.confirm({
      title: t("admin.signInSwitchTitle", { who: record.email ?? record.name ?? "" }),
      content: draft.method === "sso" ? t("admin.signInSwitchToSso") : t("admin.signInSwitchToPassword"),
      okText: t("admin.signInSwitch"), cancelText: t("common.cancel"), onOk: save,
    });
  };

  return (
    <Modal open title={record.name ?? record.email ?? ""} onCancel={onClose} onOk={submit} okText={t("common.save")} cancelText={t("common.cancel")} confirmLoading={saving} width={560} destroyOnClose>
      <Form layout="vertical">
        <Form.Item label={t("fields.name")}><Input value={draft.name} disabled={!rights.users} onChange={(e) => set({ name: e.target.value })} /></Form.Item>
        <Form.Item label={t("fields.email")} extra={record.has_login ? t("admin.emailLocked") : undefined}>
          <Input type="email" value={record.has_login ? record.email ?? "" : draft.email} disabled={record.has_login || !rights.users} onChange={(e) => set({ email: e.target.value })} />
        </Form.Item>
        <Form.Item label={t("login.username")}>
          <Input value={draft.username} disabled={!rights.users} autoCapitalize="none" spellCheck={false} onChange={(e) => set({ username: e.target.value.toLowerCase() })} />
        </Form.Item>
        <Form.Item label={t("admin.login")}>
          {rights.users ? <LoginAccess person={record} showUsername={false} onChanged={() => void onChanged()} /> : <LoginStateTags person={record} />}
        </Form.Item>
        <Form.Item label={t("fields.position")}><Input value={draft.position} disabled={!rights.users} onChange={(e) => set({ position: e.target.value })} /></Form.Item>
        <Form.Item label={t("fields.site")}><SuggestInput table="users" column="site" value={draft.site} disabled={!rights.users} onChange={(site) => set({ site })} /></Form.Item>
        {extraFields.map((s) => {
          const { column, label } = s.value as UserFieldSlotValue;
          return s.Component ? (
            <Form.Item key={s.key} label={label}>
              <s.Component value={draft.extra[column] ?? null} disabled={!rights.users} onChange={(v: unknown) => set({ extra: { ...draft.extra, [column]: v === "" || v === undefined ? null : v } })} />
            </Form.Item>
          ) : null;
        })}
        <Form.Item label={t("admin.supervisor")}>
          <Select allowClear showSearch disabled={!rights.users} placeholder={t("common.notSet")} value={draft.supervisor ?? undefined} onChange={(v) => set({ supervisor: v ?? null })} options={options} optionFilterProp="label" />
        </Form.Item>
        <Form.Item label={t("admin.deputy")}>
          <Select allowClear showSearch disabled={!rights.users} placeholder={t("common.notSet")} value={draft.deputy ?? undefined} onChange={(v) => set({ deputy: v ?? null })} options={options} optionFilterProp="label" />
        </Form.Item>
        <Form.Item label={t("admin.signIn")} extra={rights.admin ? undefined : t("admin.adminOnlyField")}>
          <Select value={draft.method} disabled={!rights.admin} onChange={(v: SignInMethod) => set({ method: v })} options={[{ label: t("admin.signInPassword"), value: "password" }, { label: t("admin.signInSso"), value: "sso" }]} />
        </Form.Item>
        <Form.Item label={t("admin.roles")} extra={rights.admin ? undefined : t("admin.adminOnlyField")}>
          <Select mode="multiple" disabled={!rights.admin} placeholder={t("admin.noRoles")} value={draft.roleIds} onChange={(v) => set({ roleIds: v })} options={(roles ?? []).map((r) => ({ label: roleLabel(r), value: r.id }))} optionFilterProp="label" />
        </Form.Item>
        <Form.Item label={t("admin.teams")} style={{ marginBottom: 0 }}>
          <Select mode="multiple" disabled={!rights.teams} placeholder={t("admin.noTeams")} value={draft.teamIds} onChange={(v) => set({ teamIds: v })} options={(teams ?? []).map((g) => ({ label: g.name, value: g.id }))} optionFilterProp="label" />
        </Form.Item>
      </Form>
    </Modal>
  );
};
