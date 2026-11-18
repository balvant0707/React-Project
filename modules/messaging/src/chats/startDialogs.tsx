import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App as AntdApp, Alert, Button, Checkbox, Empty, Form, Input, Modal, Select, Tag, Typography, theme as antdTheme } from "antd";
import { ArrowLeftOutlined, MessageOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { useUserMap, useUsers, usersFor } from "@rbp/core";
import { useAdminDelegation, usePermissions } from "@rbp/core";
import { errorText } from "@rbp/core";
import { openDirectConversation } from "../lib/messaging";
import { useInbox, useMessageGroups } from "../hooks/useMessages";
import { useIsMobile } from "@rbp/ui";
import { PersonAvatar } from "@rbp/core";
import { GroupAvatar } from "./groupAvatar";
import { matchesAllWords } from "@rbp/ui";
import { ICONS, IconTile } from "@rbp/ui";


// "New message": one search over my chats, teams (where I may post) and people; a choice opens the conversation, a team
// its new-post field. Picked people get "Open chat": the existing or a new chat of exactly them. Empty search: my latest
// chats and teams.
type ChatHit = { conversation_id: string; title: string | null; partner_user_id: string | null; last_excerpt: string | null };

export const NewMessageModal = ({ open, onClose, onOpenConversation, onOpenGroup }: { open: boolean; onClose: () => void; onOpenConversation: (conversationId: string) => void; onOpenGroup: (groupId: string) => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { token } = antdTheme.useToken();
  const isMobile = useIsMobile();
  const { identity } = useIdentity();
  const { data: users } = useUsers();
  const userMap = useUserMap();
  const { mine, discover } = useMessageGroups();
  const { data: recentPages } = useInbox({ view: "mine", kind: "direct", limit: 5, enabled: open });
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const searching = term.trim().length > 0;
  // My chats are searched on the server (all of them, by label), a short pause after typing.
  const [chatTerm, setChatTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setChatTerm(term.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [term]);
  const { data: foundChats } = useQuery({
    queryKey: ["chats-search", chatTerm],
    enabled: open && chatTerm.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("chats_search", { p_term: chatTerm, p_limit: 8 });
      if (error) throw error;
      return (data ?? []) as ChatHit[];
    },
  });
  const matches = (text: string | null | undefined) => matchesAllWords(text, term);
  const people = useMemo(() => usersFor(users).filter((u) => u.id !== identity?.id), [users, identity?.id]);
  const recent: ChatHit[] = (recentPages?.pages.flat() ?? []).map((r) => ({ conversation_id: r.conversation_id, title: r.title, partner_user_id: r.partner_user_id, last_excerpt: r.last_excerpt }));
  const chats = searching ? (chatTerm === term.trim() ? foundChats ?? [] : []) : picked.length ? [] : recent;
  const teams = picked.length ? [] : [...mine, ...discover].filter((g) => g.can_post && (searching ? matches(g.name) : g.is_member || g.is_owner));
  const persons = searching ? people.filter((u) => matches(u.name ?? u.email)).slice(0, 30) : [];
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? userMap.get(id)?.name ?? "—";

  const reset = () => {
    setTerm("");
    setPicked([]);
  };
  const close = () => {
    reset();
    onClose();
  };
  // A second tap while a conversation opens would start a second request or jump elsewhere afterwards.
  const openWith = async (getId: () => Promise<string> | string) => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await getId();
      reset();
      onOpenConversation(id);
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const openPicked = () =>
    openWith(async () => {
      if (picked.length === 1) return openDirectConversation(picked[0]);
      const { data, error } = await supabaseClient.rpc("conversation_get_or_create_group", { p_user_ids: picked });
      if (error) throw error;
      return data as string;
    });
  const toggle = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setTerm("");
  };

  const row = (key: string, avatar: ReactNode, label: string, sub: string | null, onClick: () => void, checked?: boolean) => (
    <div
      key={key}
      role="button"
      tabIndex={0}
      aria-disabled={busy}
      aria-pressed={checked}
      onClick={busy ? undefined : onClick}
      onKeyDown={(e) => !busy && e.key === "Enter" && onClick()}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${token.colorBorderSecondary}`, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.5 : 1 }}
    >
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {sub ? <Typography.Text type="secondary" ellipsis style={{ display: "block", fontSize: 13 }}>{sub}</Typography.Text> : null}
      </div>
      {checked !== undefined && <Checkbox checked={checked} tabIndex={-1} style={{ pointerEvents: "none" }} />}
    </div>
  );
  const heading = (text: string) => (
    <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 4px" }}>
      {text}
    </Typography.Text>
  );
  const chatAvatar = (c: ChatHit) =>
    c.partner_user_id ? (
      <PersonAvatar person={{ name: userMap.get(c.partner_user_id)?.name ?? "", photo_url: userMap.get(c.partner_user_id)?.photo_url ?? null }} size={40} />
    ) : (
      <IconTile icon={ICONS.users} size={40} />
    );

  return (
    <Modal
      open={open}
      onCancel={close}
      title={isMobile ? null : t("messages.toWhom")}
      closable={!isMobile}
      width={isMobile ? "100%" : 520}
      className={isMobile ? "modal-fullscreen" : undefined}
      style={isMobile ? undefined : { top: 48 }}
      styles={isMobile ? { content: { background: token.colorBgContainer }, footer: { background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}` } } : undefined}
      footer={
        picked.length ? (
          <Button type="primary" icon={<MessageOutlined />} loading={busy} onClick={() => void openPicked()}>
            {t(picked.length === 1 ? "messages.openChat" : "messages.openGroupChat", { count: picked.length + 1 })}
          </Button>
        ) : null
      }
      destroyOnClose
    >
      {isMobile ? (
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={close} style={{ marginBottom: 8 }}>{t("messages.toWhom")}</Button>
      ) : null}
      {picked.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, alignItems: "center" }}>
          <Typography.Text type="secondary">{t("messages.to")}</Typography.Text>
          {picked.map((id) => (
            <Tag key={id} closable onClose={() => setPicked((p) => p.filter((x) => x !== id))} style={{ marginInlineEnd: 0, fontSize: 14, padding: "2px 8px" }}>
              {nameOf(id)}
            </Tag>
          ))}
        </div>
      )}
      <Input size="large" allowClear autoFocus={!isMobile} prefix={<SearchOutlined />} placeholder={t(picked.length ? "messages.toWhomMore" : "messages.toWhomSearch")} value={term} onChange={(e) => setTerm(e.target.value)} />
      {!picked.length && <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: "8px 0 0" }}>{t("messages.toWhomHint")}</Typography.Paragraph>}
      {chats.length > 0 && (
        <>
          {heading(t("messages.toWhomChats"))}
          {chats.map((c) => row(c.conversation_id, chatAvatar(c), c.title ?? "—", c.last_excerpt, () => void openWith(() => c.conversation_id)))}
        </>
      )}
      {teams.length > 0 && (
        <>
          {heading(t("messages.toWhomTeams"))}
          {teams.map((g) => row(g.id, <GroupAvatar photoPath={g.photo_path} size={40} />, g.name, g.description, () => { reset(); onOpenGroup(g.id); }))}
        </>
      )}
      {persons.length > 0 && (
        <>
          {heading(t("messages.toWhomPeople"))}
          {persons.map((u) => row(u.id, <PersonAvatar person={{ name: u.name ?? "", photo_url: userMap.get(u.id)?.photo_url ?? null }} size={40} />, u.name ?? u.email ?? u.id, null, () => toggle(u.id), picked.includes(u.id)))}
        </>
      )}
      {searching && chats.length === 0 && teams.length === 0 && persons.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("messages.toWhomNone")} />}
    </Modal>
  );
};

// May the signed-in user create a team here? (team_create decides.)
export const useCanCreateTeam = () => {
  const { has } = usePermissions();
  const { canManageTeams } = useAdminDelegation();
  return canManageTeams || has("groups.create");
};

// A team of one's own: the creator becomes its owner and first member; the others can be picked here or added later in the team settings.
export const NewTeamModal = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (groupId: string) => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name: string; description?: string; member_ids?: string[] }>();
  const { identity } = useIdentity();
  const { data: users } = useUsers();
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const values = await form.validateFields();
    setBusy(true);
    const { data, error } = await supabaseClient.rpc("team_create", { p_name: values.name, p_description: values.description ?? null });
    if (error) {
      setBusy(false);
      return message.error(errorText(error));
    }
    const others = (values.member_ids ?? []).filter((id) => id !== identity?.id);
    if (others.length > 0) {
      const { error: addError } = await supabaseClient.from("user_teams").insert(others.map((user_id) => ({ user_id, team_id: data as string })));
      if (addError) message.error(errorText(addError));
    }
    setBusy(false);
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["message-groups"] }), queryClient.invalidateQueries({ queryKey: ["directory", "teams"] })]);
    form.resetFields();
    onCreated(data as string);
  };
  return (
    <Modal open={open} title={t("messages.newTeamTitle")} onCancel={onClose} onOk={create} okText={t("messages.newTeamCreate")} confirmLoading={busy} destroyOnClose>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, min: 2, max: 60 }]}>
          <Input autoFocus maxLength={60} />
        </Form.Item>
        <Form.Item name="description" label={t("messages.description")}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={500} />
        </Form.Item>
        <Form.Item name="member_ids" label={t("messages.members")}>
          <Select mode="multiple" showSearch optionFilterProp="label" options={usersFor(users).filter((u) => u.id !== identity?.id).map((u) => ({ value: u.id, label: u.name ?? u.email ?? u.id }))} />
        </Form.Item>
      </Form>
      <Alert type="info" showIcon message={t("messages.newTeamHint")} />
    </Modal>
  );
};
