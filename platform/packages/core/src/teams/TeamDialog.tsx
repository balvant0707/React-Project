// One dialog for a team, on the Messages page and on Admin > Teams. Merges the former Messages dialogs (settings, members;
// modules/messaging chats/groupSettings.tsx, chats/groupMembers.tsx) with Admin > Teams' edit modal:
//  - Members tab: everybody who sees the team reads it; the owner (and a team manager) removes and adds people.
//  - Settings tab: picture, name, description, posting, audience, mentions for the owner / moderators; the owners and
//    the uses (team_use_registry) only for a team manager; handing the ownership over for the owner.
//  - Delete (team manager only) and the "kept on its own page" note of a team a module manages.
import { useEffect, useRef, useState } from "react";
import { Alert, App as AntdApp, Button, Checkbox, Empty, Form, Input, List, Modal, Popconfirm, Radio, Select, Space, Tabs, Typography, Upload } from "antd";
import { DeleteOutlined, UploadOutlined, UserAddOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "../supabase";
import { errorText } from "../errors";
import { useIdentity } from "../hooks";
import { useAdminDelegation, useTeams, useUserMap, useUsers, usersFor } from "../directory";
import { PersonAvatar } from "../people/PersonAvatar";
import { GroupAvatar, removeGroupPhoto, setGroupPhoto } from "./groupPhoto";

// What team_create switches on for every new team (the dialog shows it, so saving does not add it a second time).
const NEW_TEAM_USES = ["tasks", "filters"];

export type TeamDialogTab = "members" | "settings";
type Team = { id: string; name: string; description: string | null; photo_path: string | null; posting: "everyone" | "owners"; audience: "members" | "everyone"; team_mentions: "owners" | "members"; auto_follow: boolean };
type Values = { name: string; description: string | null; posting: Team["posting"]; audience: Team["audience"]; team_mentions: Team["team_mentions"]; auto_follow: boolean; owner_ids: string[]; uses: string[] };

/** `teamId`: a team, "new" (Admin > Teams: a new team) or null (closed). */
export const TeamDialog = ({ teamId, tab = "members", onClose }: { teamId: string | "new" | null; tab?: TeamDialogTab; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { identity } = useIdentity();
  const { canManageTeams } = useAdminDelegation();
  const { data: users } = useUsers();
  const people = useUserMap();
  const { data: directory } = useTeams();
  const [form] = Form.useForm<Values>();
  const isNew = teamId === "new";
  const id = teamId && teamId !== "new" ? teamId : null;
  const [active, setActive] = useState<TeamDialogTab>(tab);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // A new team is created by the first step of a save; when a later step fails, a second click must continue with that team, not create another.
  const createdId = useRef<string | null>(null);
  const [heir, setHeir] = useState<string | undefined>();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const { data: team } = useQuery({
    queryKey: ["team-dialog", id, "team"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("teams").select("id, name, description, photo_path, posting, audience, team_mentions, auto_follow").eq("id", id!).single();
      if (error) throw error;
      return data as Team;
    },
  });
  const { data: crew, isLoading: crewLoading } = useQuery({
    queryKey: ["team-dialog", id, "people"],
    enabled: !!id,
    queryFn: async () => {
      const [members, owners] = await Promise.all([
        supabaseClient.from("user_teams").select("user_id").eq("team_id", id!),
        supabaseClient.from("team_owners").select("user_id").eq("team_id", id!),
      ]);
      if (members.error) throw members.error;
      if (owners.error) throw owners.error;
      return { members: (members.data ?? []).map((r) => r.user_id as string), owners: (owners.data ?? []).map((r) => r.user_id as string) };
    },
  });
  // May I change the settings of this team (owner, moderator, team manager)? The same rule team_message_settings_save applies.
  const { data: moderate } = useQuery({
    queryKey: ["team-dialog", id, "moderate"],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("team_message_can", { p_team_id: id!, p_action: "moderate" });
      if (error) throw error;
      return !!data;
    },
  });
  const { data: useRegistry } = useQuery({
    queryKey: ["team-use-registry"],
    queryFn: async () => ((await supabaseClient.from("team_use_registry").select("use, description, managed_path").order("use")).data ?? []) as { use: string; description: string | null; managed_path: string | null }[],
  });

  const isOwner = !!identity?.id && !!crew?.owners.includes(identity.id);
  const canEditMembers = isOwner || canManageTeams;
  const canSettings = isNew || !!moderate || canManageTeams;
  const canRename = isNew || isOwner || canManageTeams;
  const usesOf = (teamId2: string) => directory?.find((d) => d.id === teamId2)?.uses ?? [];
  const managed = (useRegistry ?? []).filter((u) => u.managed_path && id && usesOf(id).includes(u.use));
  const editableUses = (useRegistry ?? []).filter((u) => !u.managed_path);
  const labelOfUse = (u: { use: string; description: string | null }) => t(`admin.teamUse.${u.use}`, { defaultValue: u.description ?? u.use });
  const usersById = (userId: string) => people.get(userId);
  const userOption = (u: { id: string; name: string | null; email?: string | null }) => ({ value: u.id, label: u.name ?? u.email ?? u.id });

  // Reset when another team opens.
  useEffect(() => {
    createdId.current = null;
    if (teamId) setActive(isNew || !canSettings ? (isNew ? "settings" : "members") : tab);
    setAdding(false);
    setPicked([]);
    setHeir(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, tab]);
  useEffect(() => {
    if (id && !canSettings && active === "settings") setActive("members");
  }, [id, canSettings, active]);
  // A new team: an empty form. Not tied to the directory, so a background refetch cannot wipe what is being typed.
  useEffect(() => {
    if (!isNew) return;
    setPhotoPath(null);
    form.setFieldsValue({ name: "", description: null, posting: "everyone", audience: "members", team_mentions: "owners", auto_follow: false, owner_ids: [], uses: editableUses.map((u) => u.use).filter((u) => NEW_TEAM_USES.includes(u)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, teamId, useRegistry]);
  useEffect(() => {
    if (isNew || !team || !crew) return;
    setPhotoPath(team.photo_path);
    form.setFieldsValue({
      name: team.name, description: team.description, posting: team.posting, audience: team.audience, team_mentions: team.team_mentions, auto_follow: team.auto_follow,
      owner_ids: crew.owners, uses: usesOf(team.id).filter((u) => editableUses.some((e) => e.use === u)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, team, crew, useRegistry, directory]);

  const refresh = () =>
    Promise.all(["team-dialog", "admin-teams", "admin-team-owners", "directory", "message-groups"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));

  // --- Settings tab ---
  const changePhoto = async (file: File) => {
    if (!id) return;
    setPhotoBusy(true);
    try {
      setPhotoPath(await setGroupPhoto(id, file, photoPath));
      await refresh();
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setPhotoBusy(false);
    }
  };
  const deletePhoto = async () => {
    if (!id || !photoPath) return;
    setPhotoBusy(true);
    try {
      await removeGroupPhoto(id, photoPath);
      setPhotoPath(null);
      await refresh();
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      let teamIdNow = id ?? createdId.current;
      const name = values.name.trim();
      if (!teamIdNow) {
        const { data, error } = await supabaseClient.rpc("team_create", { p_name: name, p_description: values.description });
        if (error) throw error;
        teamIdNow = data as string;
        createdId.current = teamIdNow;
      } else if (id && team && canRename && team.name !== name) {
        // The owner renames through team_rename; a team manager who does not own the team changes the row (policy: team managers manage teams).
        const { error } = isOwner
          ? await supabaseClient.rpc("team_rename", { p_team_id: teamIdNow, p_name: name })
          : await supabaseClient.from("teams").update({ name }).eq("id", teamIdNow);
        if (error) throw error;
      }
      const { error: settingsError } = await supabaseClient.rpc("team_message_settings_save", {
        p_team_id: teamIdNow, p_posting: values.posting, p_audience: values.audience, p_description: values.description, p_team_mentions: values.team_mentions, p_auto_follow: canManageTeams ? values.audience === "everyone" && values.auto_follow : null,
      });
      if (settingsError) throw settingsError;
      if (canManageTeams) {
        // Owners and uses: diff against the saved state.
        // Read the saved owners (a new team starts with its creator as owner, team_create).
        const { data: ownerRows } = await supabaseClient.from("team_owners").select("user_id").eq("team_id", teamIdNow);
        const saved = (ownerRows ?? []).map((r) => r.user_id as string);
        const added = values.owner_ids.filter((u) => !saved.includes(u));
        const removed = saved.filter((u) => !values.owner_ids.includes(u));
        if (removed.length) { const { error } = await supabaseClient.from("team_owners").delete().eq("team_id", teamIdNow).in("user_id", removed); if (error) throw error; }
        if (added.length) { const { error } = await supabaseClient.from("team_owners").insert(added.map((user_id) => ({ team_id: teamIdNow, user_id }))); if (error) throw error; }
        // The saved uses are read, not assumed: team_create has already switched some on.
        const { data: useRows } = await supabaseClient.from("team_uses").select("use").eq("team_id", teamIdNow);
        const usesBefore = (useRows ?? []).map((r) => r.use as string).filter((u) => editableUses.some((e) => e.use === u));
        const usesAdded = values.uses.filter((u) => !usesBefore.includes(u));
        const usesRemoved = usesBefore.filter((u) => !values.uses.includes(u));
        if (usesRemoved.length) { const { error } = await supabaseClient.from("team_uses").delete().eq("team_id", teamIdNow).in("use", usesRemoved); if (error) throw error; }
        if (usesAdded.length) { const { error } = await supabaseClient.from("team_uses").insert(usesAdded.map((use) => ({ team_id: teamIdNow, use }))); if (error) throw error; }
      }
      await refresh();
      onClose();
    } catch (error) {
      message.error(errorText(error, { known: { "Only an owner changes the settings of a group": "team.settingsOwnerOnly", "Only an administrator can switch on automatic following": "team.autoFollowAdminOnly" } }));
    }
    setSaving(false);
  };

  const remove = async () => {
    if (!id) return;
    const { error } = await supabaseClient.from("teams").delete().eq("id", id);
    if (error) return void message.error(errorText(error));
    await refresh();
    onClose();
  };

  const handOver = async () => {
    if (!id || !heir) return;
    const { error } = await supabaseClient.rpc("team_owner_transfer", { p_team_id: id, p_user_id: heir });
    if (error) return void message.error(errorText(error));
    setHeir(undefined);
    await refresh();
    message.success(t("team.handedOver"));
    onClose();
  };

  // --- Members tab ---
  const memberRows = (crew?.members ?? [])
    .map((userId) => ({ id: userId, owner: crew!.owners.includes(userId), person: usersById(userId) }))
    .sort((a, b) => Number(b.owner) - Number(a.owner) || (a.person?.name ?? "").localeCompare(b.person?.name ?? ""));
  const removeMember = async (userId: string) => {
    const { error } = await supabaseClient.from("user_teams").delete().eq("team_id", id!).eq("user_id", userId);
    if (error) return void message.error(errorText(error));
    await refresh();
  };
  const addMembers = async () => {
    if (!id || picked.length === 0) return;
    const { error } = await supabaseClient.from("user_teams").insert(picked.map((user_id) => ({ user_id, team_id: id })));
    if (error) return void message.error(errorText(error));
    await refresh();
    setPicked([]);
    setAdding(false);
  };

  const membersTab = (
    <>
      <div style={{ marginBottom: 8, opacity: 0.65 }}>{t("team.membersCount", { count: memberRows.length })}</div>
      <List
        loading={crewLoading}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("team.membersNone")} /> }}
        dataSource={memberRows}
        renderItem={(r) => (
          <List.Item
            extra={canEditMembers && !r.owner ? (
              <Popconfirm title={t("team.memberRemoveConfirm")} onConfirm={() => void removeMember(r.id)} okText={t("common.yes")} cancelText={t("common.no")}>
                <Button size="small" danger type="text" icon={<DeleteOutlined />}>{t("team.memberRemove")}</Button>
              </Popconfirm>
            ) : undefined}
          >
            <List.Item.Meta avatar={<PersonAvatar person={{ name: r.person?.name ?? null, photo_url: r.person?.photo_url ?? null }} size={32} />} title={r.person?.name ?? r.person?.email ?? r.id} />
          </List.Item>
        )}
      />
      {canEditMembers && (
        <div style={{ marginTop: 12 }}>
          {adding ? (
            <Space.Compact style={{ width: "100%" }}>
              <Select
                autoFocus mode="multiple" showSearch optionFilterProp="label" style={{ width: "100%" }}
                placeholder={t("team.membersAddPlaceholder")} value={picked} onChange={setPicked}
                options={usersFor(users).filter((u) => !(crew?.members ?? []).includes(u.id)).map(userOption)}
              />
              <Button type="primary" disabled={picked.length === 0} onClick={() => void addMembers()}>{t("common.add")}</Button>
              <Button onClick={() => { setAdding(false); setPicked([]); }}>{t("common.cancel")}</Button>
            </Space.Compact>
          ) : (
            <Button icon={<UserAddOutlined />} onClick={() => setAdding(true)} disabled={!crew}>{t("team.membersAdd")}</Button>
          )}
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{t("team.membersHint")}</div>
        </div>
      )}
    </>
  );

  const ownerOptions = usersFor(users, form.getFieldValue("owner_ids")).map(userOption);
  const settingsTab = (
    <>
      {managed.map((u) => (
        <Alert key={u.use} type="info" showIcon style={{ marginBottom: 12 }}
          message={<>{t("admin.teamUseManaged", { use: labelOfUse(u) })} <Link to={u.managed_path!}>{t("admin.teamUseManagedLink")}</Link></>} />
      ))}
      <Form form={form} layout="vertical">
        {!isNew && (
          <Form.Item label={t("team.photo")}>
            <Space>
              <GroupAvatar photoPath={photoPath} size={64} />
              <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={(file) => { void changePhoto(file); return false; }}>
                <Button icon={<UploadOutlined />} loading={photoBusy}>{t("team.photoChange")}</Button>
              </Upload>
              {photoPath && <Button danger icon={<DeleteOutlined />} disabled={photoBusy} onClick={() => void deletePhoto()}>{t("team.photoRemove")}</Button>}
            </Space>
          </Form.Item>
        )}
        {canRename && (
          <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, min: 2, max: 60 }]}>
            <Input maxLength={60} />
          </Form.Item>
        )}
        <Form.Item name="description" label={t("admin.description")}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} />
        </Form.Item>
        <Form.Item name="posting" label={t("team.posting")}>
          <Radio.Group options={[{ value: "everyone", label: t("team.postingEveryone") }, { value: "owners", label: t("team.postingOwners") }]} />
        </Form.Item>
        <Form.Item name="audience" label={t("team.audience")}>
          <Radio.Group options={[{ value: "members", label: t("team.audienceMembers") }, { value: "everyone", label: t("team.audienceEveryone") }]} />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(a, b) => a.audience !== b.audience}>
          {({ getFieldValue }) => getFieldValue("audience") === "everyone" && (
            <Form.Item name="auto_follow" valuePropName="checked" extra={t("team.autoFollowHint")}>
              <Checkbox disabled={!canManageTeams}>{t("team.autoFollow")}</Checkbox>
            </Form.Item>
          )}
        </Form.Item>
        <Form.Item name="team_mentions" label={t("team.mentions")} extra={t("team.mentionsHint")}>
          <Radio.Group options={[{ value: "owners", label: t("team.mentionsOwners") }, { value: "members", label: t("team.mentionsMembers") }]} />
        </Form.Item>
        {canManageTeams && (
          <Form.Item name="owner_ids" label={t("admin.owners")}><Select mode="multiple" options={ownerOptions} optionFilterProp="label" /></Form.Item>
        )}
        {canManageTeams && editableUses.length > 0 && (
          <Form.Item name="uses" label={t("admin.teamUses")} extra={<Typography.Text type="secondary">{t("admin.teamUsesHint")}</Typography.Text>}>
            <Select mode="multiple" options={editableUses.map((u) => ({ value: u.use, label: labelOfUse(u) }))} />
          </Form.Item>
        )}
      </Form>
      {isOwner && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 4 }}>{t("team.handOver")}</div>
          <Space.Compact style={{ width: "100%" }}>
            <Select
              showSearch style={{ flex: 1 }} placeholder={t("team.handOverPick")} optionFilterProp="label" value={heir} onChange={setHeir}
              options={usersFor(users).filter((u) => (crew?.members ?? []).includes(u.id) && u.id !== identity?.id).map(userOption)}
            />
            <Popconfirm title={t("team.handOverConfirm")} onConfirm={() => void handOver()} okText={t("common.yes")} cancelText={t("common.no")} disabled={!heir}>
              <Button disabled={!heir}>{t("team.handOverButton")}</Button>
            </Popconfirm>
          </Space.Compact>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{t("team.handOverHint")}</div>
        </div>
      )}
      {!canManageTeams && <Alert type="info" showIcon message={t("team.settingsHint")} />}
    </>
  );

  const footer = active !== "settings" && !isNew ? null : (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span>
        {canManageTeams && id && managed.length === 0 && (
          <Popconfirm title={t("admin.deleteTeamTitle", { name: team?.name ?? "" })} description={t("admin.deleteTeamText")} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")} onConfirm={() => void remove()}>
            <Button danger icon={<DeleteOutlined />}>{t("common.delete")}</Button>
          </Popconfirm>
        )}
      </span>
      <Space>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="primary" loading={saving} onClick={() => void save()}>{t("common.save")}</Button>
      </Space>
    </div>
  );

  return (
    <Modal open={!!teamId} title={isNew ? t("admin.newTeam") : team?.name ?? ""} onCancel={onClose} footer={footer} destroyOnClose forceRender>
      {isNew ? settingsTab : (
        <Tabs
          activeKey={active}
          onChange={(k) => setActive(k as TeamDialogTab)}
          items={[
            { key: "members", label: t("team.members"), children: membersTab },
            ...(canSettings ? [{ key: "settings", label: t("team.settings"), children: settingsTab, forceRender: true }] : []),
          ]}
        />
      )}
    </Modal>
  );
};
