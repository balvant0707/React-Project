import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GroupAvatar } from "../chats/groupAvatar";
import { App as AntdApp, Badge, Button, Card, Dropdown, Empty, Segmented, Tag, Typography, theme as antdTheme } from "antd";
import {
  ArrowLeftOutlined,
  BellOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CheckOutlined,
  CompassOutlined,
  EditOutlined,
  InboxOutlined,
  MessageOutlined,
  MoreOutlined,
  PlusOutlined,
  SettingOutlined,
  TeamOutlined,
  EllipsisOutlined,
  ReadOutlined,
  } from "@ant-design/icons";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { TeamDialog, type TeamDialogTab, useIdentity } from "@rbp/core";
import { FloatingAddButton } from "@rbp/ui";
import { PostComposer } from "../chats/postEditor";
import { InboxList } from "../chats/inboxList";
import { GroupFeed } from "../chats/groupFeed";

import { NewMessageModal, NewTeamModal, useCanCreateTeam } from "../chats/startDialogs";
import { ConversationPane, RecordPane } from "../chats/conversationPane";
import { supabaseClient } from "@rbp/core";
import { useIsMobile, useIsWide } from "@rbp/ui";
import {
  refreshMessageCounts,
  useGroupUnread,
  useInbox,
  useInboxUnread,
  useMessageGroups,
  useMessagesRealtime,
  type FollowLevel,
  type InboxRow,
  type MessageGroup,
} from "../hooks/useMessages";
import { useVisualViewport } from "@rbp/ui";
import { errorText } from "@rbp/core";
import type { EntityType } from "@rbp/core";

// Messages (~/maintenance_tool/docs/messaging.md "Messages page"). The layout follows the screen:
//   wide (xl and up)   three columns: For me / my groups / discover | the conversations of the choice | the conversation
//   narrower desktop   a tree (For me and every group with its newest conversations) | the conversation
//   phone              a swipeable strip of channel tiles (unread first) above the conversations of the choice; a conversation opens full screen with a back arrow
// URL: ?c=<conversation> (also /messages/:id, the link of a post), ?group=<id>, ?view=discover, ?new=<group> (write a post).
export const MessagesPage = () => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { id: routeId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isWide = useIsWide();
  const wide = !isMobile && isWide;
  const { groupOf } = useMessageGroups();
  const [settingsGroup, setSettingsGroup] = useState<MessageGroup | null>(null);
  const [settingsTab, setSettingsTab] = useState<TeamDialogTab>("members");
  const [directOpen, setDirectOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const canCreateTeam = useCanCreateTeam();
  useMessagesRealtime();

  const location = useLocation();
  // A record's chat opened from its page (`?record=tasks:<id>`); the page passes its title as router state.
  const recordParam = /^([a-z_]+):([0-9a-f-]{36})$/.exec(params.get("record") ?? "");
  const record = recordParam ? { type: recordParam[1] as EntityType, id: recordParam[2] } : null;
  const recordTitle = (location.state as { recordTitle?: string } | null)?.recordTitle;
  const selected = record ? null : (params.get("c") ?? routeId ?? null);
  const newPostGroup = record ? null : groupOf(params.get("new"));
  const open = !!record || !!selected || !!newPostGroup;
  // Changes the URL, keeping what is not named (null removes it).
  const go = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    if (routeId && !merged.has("c")) merged.set("c", routeId);
    for (const [k, v] of Object.entries(next)) (v === null ? merged.delete(k) : merged.set(k, v));
    const query = merged.toString();
    navigate(`/messages${query ? `?${query}` : ""}`, { replace: !!routeId });
  };
  const select = (row: InboxRow) => go({ c: row.conversation_id, new: null });

  // A team on a wide screen is a stream over the middle and the right; an opened post stands beside it and closes again.
  const stream = wide && !!params.get("group") && params.get("view") !== "discover";
  const closable = isMobile || stream;
  // Back from a record's chat leads to the record (the history when it came from there, else its page).
  const leaveRecord = () => {
    if (!record) return;
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(`/${record.type}/${record.id}`, { replace: true });
  };
  const pane: ReactNode = record ? (
    <RecordPane key={`${record.type}:${record.id}`} entityType={record.type} entityId={record.id} title={recordTitle} onBack={closable ? leaveRecord : undefined} />
  ) : newPostGroup ? (
    <NewPostPane group={newPostGroup} onDone={(id) => go({ new: null, c: id })} onCancel={() => go({ new: null })} onBack={closable ? () => go({ new: null }) : undefined} />
  ) : selected ? (
    <ConversationPane conversationId={selected} onBack={closable ? () => go({ c: null }) : undefined} onDeleted={() => go({ c: null })} />
  ) : (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Empty image={<MessageOutlined style={{ fontSize: 48, color: token.colorTextQuaternary }} />} description={t("messages.choose")} />
    </div>
  );

  const frame = { height: "calc(100vh - 150px)", minHeight: 420 };
  const box = { background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: "hidden" };
  const actions = { onNewPost: (g: MessageGroup) => go({ new: g.id, c: null }), onSettings: (g: MessageGroup, tab: TeamDialogTab = "members") => { setSettingsTab(tab); setSettingsGroup(g); } };

  let body: ReactNode;
  if (isMobile) {
    const groupId = params.get("group");
    const discover = params.get("view") === "discover";
    body =
      open ? (
        <PhoneFullScreen>{pane}</PhoneFullScreen>
      ) : (
        // Room at the foot so the round "New message" button never covers the last line.
        <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 200px)", paddingBottom: 72 }}>
          <ChannelStrip groupId={groupId} discover={discover} onMine={() => go({ group: null, view: null })} onGroup={(id) => go({ group: id, view: null })} onDiscover={() => go({ group: null, view: "discover" })} onNewTeam={canCreateTeam ? () => setTeamOpen(true) : undefined} />
          <div style={{ ...(discover ? box : {}), display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <MiddleColumn groupId={groupId} discover={discover} selectedId={selected} onSelect={select} onOpenConversation={(id) => go({ c: id, new: null })} onOpenGroup={(id) => go({ group: id, view: null })} {...actions} />
          </div>
        </div>
      );
  } else if (stream) {
    // A team on a wide screen: its posts span middle and right; an opened or new post stands beside them.
    const groupId = params.get("group");
    body = (
      <div style={{ ...frame, ...box, display: "flex" }}>
        <div style={{ width: 220, flex: "none", borderInlineEnd: `1px solid ${token.colorBorderSecondary}`, overflowY: "auto", padding: 8 }}>
          <GroupNav groupId={groupId} discover={false} onMine={() => go({ group: null, view: null })} onGroup={(id) => go({ group: id, view: null, c: null, new: null })} onDiscover={() => go({ group: null, view: "discover" })} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, borderInlineEnd: open ? `1px solid ${token.colorBorderSecondary}` : undefined }}>
          <MiddleColumn stream groupId={groupId} discover={false} selectedId={selected} onSelect={select} onOpenConversation={(id) => go({ c: id, new: null })} onOpenGroup={(id) => go({ group: id, view: null })} {...actions} />
        </div>
        {open && <div style={{ width: 480, flex: "none", minWidth: 0 }}>{pane}</div>}
      </div>
    );
  } else if (wide) {
    const groupId = params.get("group");
    const discover = params.get("view") === "discover";
    body = (
      <div style={{ ...frame, ...box, display: "flex" }}>
        <div style={{ width: 220, flex: "none", borderInlineEnd: `1px solid ${token.colorBorderSecondary}`, overflowY: "auto", padding: 8 }}>
          <GroupNav groupId={groupId} discover={discover} onMine={() => go({ group: null, view: null })} onGroup={(id) => go({ group: id, view: null })} onDiscover={() => go({ group: null, view: "discover" })} />
        </div>
        <div style={{ width: 380, flex: "none", borderInlineEnd: `1px solid ${token.colorBorderSecondary}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <MiddleColumn groupId={groupId} discover={discover} selectedId={selected} onSelect={select} onOpenConversation={(id) => go({ c: id, new: null })} onOpenGroup={(id) => go({ group: id, view: null })} {...actions} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{pane}</div>
      </div>
    );
  } else {
    body = (
      <div style={{ ...frame, ...box, display: "flex" }}>
        <div style={{ width: 340, flex: "none", borderInlineEnd: `1px solid ${token.colorBorderSecondary}`, overflowY: "auto" }}>
          <ConversationTree selectedId={selected} onSelect={select} {...actions} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{pane}</div>
      </div>
    );
  }

  return (
    <>
      {/* Phone: "New message" is a round button at the bottom right, as in Teams; "New team" is rarely needed and sits at
          the end of the team strip. */}
      {!isMobile && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
          {canCreateTeam && <Button icon={<TeamOutlined />} onClick={() => setTeamOpen(true)}>{t("messages.newTeam")}</Button>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setDirectOpen(true)}>{t("messages.newDirect")}</Button>
        </div>
      )}
      {body}
      {isMobile && !open && (
        <FloatingAddButton label={t("messages.newDirect")} onClick={() => setDirectOpen(true)} />
      )}
      <TeamDialog teamId={settingsGroup?.id ?? null} tab={settingsTab} onClose={() => setSettingsGroup(null)} />
      <NewMessageModal
        open={directOpen}
        onClose={() => setDirectOpen(false)}
        onOpenConversation={(id) => { setDirectOpen(false); go({ c: id, new: null, group: null, view: null }); }}
        // A team opens the field for a new post in its channel.
        onOpenGroup={(id) => { setDirectOpen(false); go({ group: id, view: null, c: null, new: id }); }}
      />
      <NewTeamModal open={teamOpen} onClose={() => setTeamOpen(false)} onCreated={(id) => { setTeamOpen(false); go({ group: id, view: null, c: null, new: null }); }} />
    </>
  );
};

type GroupActionProps = { onNewPost: (g: MessageGroup) => void; onSettings: (g: MessageGroup, tab?: TeamDialogTab) => void };

// Follow level, mark read, unfollow for a group (the same in the tree and above the middle column).
const useGroupActions = () => {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { identity } = useIdentity();
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["message-groups"] }), refreshMessageCounts(queryClient)]);
  return {
    // Following is implicit for members, owners and in a group with "follow automatically" on: they only change the level.
    implicit: (g: MessageGroup) => g.is_member || g.is_owner || g.auto_follow,
    setLevel: async (g: MessageGroup, next: FollowLevel | null) => {
      const { error } =
        next === null
          ? await supabaseClient.from("team_follows").delete().eq("team_id", g.id).eq("user_id", identity!.id)
          : await supabaseClient.from("team_follows").upsert({ team_id: g.id, user_id: identity?.id, level: next });
      if (error) message.error(errorText(error));
      await refresh();
    },
    markRead: async (g: MessageGroup) => {
      await supabaseClient.rpc("team_mark_read", { p_team_id: g.id });
      await refresh();
    },
  };
};

const GroupMenu = ({ group, onNewPost, onSettings, button }: { group: MessageGroup; button?: ReactNode } & GroupActionProps) => {
  const { t } = useTranslation();
  const { implicit, setLevel, markRead } = useGroupActions();
  const mark = (l: FollowLevel) => (group.level === l ? <CheckOutlined /> : <span style={{ width: 14, display: "inline-block" }} />);
  return (
    <>
    <Dropdown
      trigger={["click"]}
      menu={{
        onClick: (e) => e.domEvent.stopPropagation(),
        items: [
          ...(group.can_post ? [{ key: "new", icon: <EditOutlined />, label: t("messages.newPostButton"), onClick: () => onNewPost(group) }, { type: "divider" as const }] : []),
          ...(["all", "mentions", "mute"] as FollowLevel[]).map((l) => ({ key: l, icon: mark(l), label: t(`messages.level.${l}`), onClick: () => void setLevel(group, l) })),
          ...(!implicit(group) && group.level !== null ? [{ key: "leave", label: t("messages.unfollow"), onClick: () => void setLevel(group, null) }] : []),
          { type: "divider" as const },
          { key: "read", icon: <CheckOutlined />, label: t("messages.markGroupRead"), onClick: () => void markRead(group) },
          { key: "members", icon: <TeamOutlined />, label: t("messages.members"), onClick: () => onSettings(group, "members") },
          ...(group.can_moderate ? [{ key: "settings", icon: <SettingOutlined />, label: t("messages.settings"), onClick: () => onSettings(group, "settings") }] : []),
        ],
      }}
    >
      {button ?? <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} aria-label={t("messages.groupMenu")} />}
    </Dropdown>
    </>
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// Wide screens: left column and middle column
// ---------------------------------------------------------------------------------------------------------------------

const NavButton = ({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count: number; onClick: () => void }) => (
  <Button type={active ? "primary" : "text"} icon={icon} onClick={onClick} block style={{ justifyContent: "flex-start", display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    {count > 0 && <Badge count={count} size="small" />}
  </Button>
);

const GroupNav = ({ groupId, discover, onMine, onGroup, onDiscover }: { groupId: string | null; discover: boolean; onMine: () => void; onGroup: (id: string) => void; onDiscover: () => void }) => {
  const { t } = useTranslation();
  const { mine, discover: discoverable } = useMessageGroups();
  const groupUnread = useGroupUnread();
  const inboxUnread = useInboxUnread();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <NavButton active={!groupId && !discover} icon={<InboxOutlined />} label={t("messages.forMe")} count={inboxUnread} onClick={onMine} />
      {mine.length > 0 && <Typography.Text type="secondary" style={{ fontSize: 12, margin: "10px 6px 2px" }}>{t("messages.myGroups")}</Typography.Text>}
      {mine.map((g) => (
        <NavButton key={g.id} active={groupId === g.id} icon={<GroupAvatar photoPath={g.photo_path} size={22} />} label={g.name} count={g.level === "mute" ? 0 : groupUnread[g.id] ?? 0} onClick={() => onGroup(g.id)} />
      ))}
      {discoverable.length > 0 && <NavButton active={discover} icon={<CompassOutlined />} label={t("messages.discover")} count={0} onClick={onDiscover} />}
    </div>
  );
};

// Phone: channel tiles to swipe through (For me first, then groups with unread, then the rest, then Discover).
// `onNewTeam`: a quiet dashed tile at the end of the strip (phone; the band holds only "New message").
const ChannelStrip = ({ groupId, discover, onMine, onGroup, onDiscover, onNewTeam }: { groupId: string | null; discover: boolean; onMine: () => void; onGroup: (id: string) => void; onDiscover: () => void; onNewTeam?: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { mine, discover: discoverable } = useMessageGroups();
  const groupUnread = useGroupUnread();
  const inboxUnread = useInboxUnread();
  const groups = useMemo(() => {
    const unread = (g: MessageGroup) => (g.level === "mute" ? 0 : groupUnread[g.id] ?? 0);
    return [...mine].sort((a, b) => Number(unread(b) > 0) - Number(unread(a) > 0));
  }, [mine, groupUnread]);
  const tile = (key: string, active: boolean, icon: ReactNode, label: string, count: number, onClick: () => void) => (
    <button
      key={key}
      type="button"
      ref={(el) => {
        if (el && active) el.scrollIntoView({ inline: "center", block: "nearest" });
      }}
      onClick={onClick}
      style={{
        flex: "none",
        scrollSnapAlign: "start",
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: 200,
        padding: "8px 12px",
        borderRadius: token.borderRadiusLG,
        border: `1px solid ${active ? token.colorPrimary : token.colorBorderSecondary}`,
        background: active ? token.colorPrimary : token.colorBgContainer,
        color: active ? token.colorTextLightSolid : token.colorText,
        fontWeight: count > 0 ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {count > 0 && <Badge count={count} size="small" />}
    </button>
  );
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x proximity", padding: "0 0 10px", scrollbarWidth: "none" }}>
      {tile("mine", !groupId && !discover, <InboxOutlined />, t("messages.forMe"), inboxUnread, onMine)}
      {groups.map((g) => tile(g.id, groupId === g.id, <GroupAvatar photoPath={g.photo_path} size={22} />, g.name, g.level === "mute" ? 0 : groupUnread[g.id] ?? 0, () => onGroup(g.id)))}
      {discoverable.length > 0 && tile("discover", discover, <CompassOutlined />, t("messages.discover"), 0, onDiscover)}
      {onNewTeam && (
        <button
          type="button"
          onClick={onNewTeam}
          style={{ flex: "none", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: token.borderRadiusLG, border: `1px dashed ${token.colorBorder}`, background: "transparent", color: token.colorTextSecondary, cursor: "pointer" }}
        >
          <PlusOutlined />
          {t("messages.newTeam")}
        </button>
      )}
    </div>
  );
};

const MiddleColumn = ({
  groupId,
  discover,
  selectedId,
  onSelect,
  onOpenConversation,
  onOpenGroup,
  onNewPost,
  onSettings,
  stream = false,
}: { groupId: string | null; discover: boolean; selectedId: string | null; onSelect: (row: InboxRow) => void; onOpenConversation: (id: string) => void; onOpenGroup: (id: string) => void; stream?: boolean } & GroupActionProps) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { groupOf } = useMessageGroups();
  const group = groupOf(groupId);
  // A team: its posts as a feed, or everything (posts and the conversations on the team's tasks, tickets and goals).
  const [teamView, setTeamView] = useState<"posts" | "all">("posts");
  if (discover) {
    return (
      <div style={{ overflowY: "auto", padding: 12 }}>
        <DiscoverList onOpen={onOpenGroup} />
      </div>
    );
  }
  if (group) {
    return (
      <>
        <div style={{ flex: "none", padding: 12, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <GroupAvatar photoPath={group.photo_path} size={36} />
            <Typography.Text strong style={{ fontSize: 16, flex: 1, minWidth: 0 }} ellipsis>{group.name}</Typography.Text>
            {group.can_post && <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => onNewPost(group)}>{t("messages.newPostButton")}</Button>}
            <Button size="small" icon={<TeamOutlined />} onClick={() => onSettings(group, "members")}>{t("messages.team")}</Button>
            <GroupMenu group={group} onNewPost={onNewPost} onSettings={onSettings} button={<Button size="small" icon={<BellOutlined />}>{group.level ? t(`messages.levelShort.${group.level}`) : t("messages.follow")}</Button>} />
          </div>
          <GroupTags group={group} />
          {group.description && <Typography.Text type="secondary" style={{ fontSize: 12 }}>{group.description}</Typography.Text>}
          <Segmented<"posts" | "all">
            block
            size="small"
            value={teamView}
            onChange={setTeamView}
            style={{ marginTop: 8 }}
            options={[
              { value: "posts", label: t("messages.teamViewPosts") },
              { value: "all", label: t("messages.teamViewAll") },
            ]}
          />
        </div>
        {/* "Comment" on a card opens the post with its chat. As a stream (wide screen) the column is at most 720 px wide. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: teamView === "posts" ? (stream ? "16px 24px" : "12px 0") : 4, background: stream && teamView === "posts" ? token.colorBgLayout : undefined }}>
          <div style={stream ? { maxWidth: 720, margin: "0 auto" } : undefined}>
            {teamView === "posts" ? <GroupFeed group={group} onOpen={onOpenConversation} selectedId={selectedId} /> : <GroupConversations group={group} selectedId={selectedId} onSelect={onSelect} limit={30} />}
          </div>
        </div>
      </>
    );
  }
  return <ForMe selectedId={selectedId} onSelect={onSelect} />;
};

const GroupTags = ({ group }: { group: MessageGroup }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
      {group.audience === "everyone" && <Tag>{t("messages.everyoneReads")}</Tag>}
      {group.posting === "owners" && <Tag>{t("messages.ownersPost")}</Tag>}
    </div>
  );
};

// "For me" with its filters. Phone: the kinds and a ⋯ menu (unread only, mark all read) in one row, no frame.
const ForMe = ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (row: InboxRow) => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"all" | "records" | "posts" | "direct">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInbox({ view: "mine", unreadOnly, kind: kind === "all" ? null : kind });
  const rows = useMemo(() => data?.pages.flat() ?? [], [data]);
  const markAll = async () => {
    await supabaseClient.rpc("inbox_mark_all_read");
    await refreshMessageCounts(queryClient);
  };
  const kinds = (
    <Segmented<"all" | "records" | "posts" | "direct">
      block
      size="small"
      value={kind}
      onChange={setKind}
      style={{ flex: 1, minWidth: 0 }}
      options={[
        { value: "all", label: t("messages.kindAll") },
        { value: "records", label: t("messages.kindRecords") },
        { value: "posts", label: t("messages.kindPosts") },
        { value: "direct", label: t("messages.kindDirect") },
      ]}
    />
  );
  // One row: the kinds and a ⋯ with "unread only" (a dot while on) and "mark all read".
  const filters = (
    <div style={isMobile ? { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } : { flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      {kinds}
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            { key: "unread", icon: unreadOnly ? <CheckOutlined /> : <span style={{ display: "inline-block", width: 14 }} />, label: t("messages.unreadOnly"), onClick: () => setUnreadOnly(!unreadOnly) },
            { key: "read", icon: <ReadOutlined />, label: t("messages.markAllRead"), onClick: () => void markAll() },
          ],
        }}
      >
        <Badge dot={unreadOnly} offset={[-4, 4]} color={token.colorError}>
          <Button size={isMobile ? "middle" : "small"} aria-label={t("common.more")} icon={<EllipsisOutlined />} />
        </Badge>
      </Dropdown>
    </div>
  );
  const list = <InboxList rows={rows} isLoading={isLoading} hasMore={!!hasNextPage} loadingMore={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} empty={t("messages.inboxEmpty")} onSelect={onSelect} selectedId={selectedId} />;
  if (isMobile) {
    return (
      <>
        {filters}
        {list}
      </>
    );
  }
  return (
    <>
      {filters}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{list}</div>
    </>
  );
};

const GroupConversations = ({ group, selectedId, onSelect, limit }: { group: MessageGroup; selectedId: string | null; onSelect: (row: InboxRow) => void; limit: number }) => {
  const { t } = useTranslation();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInbox({ view: "group", groupId: group.id, limit });
  const rows = useMemo(() => data?.pages.flat() ?? [], [data]);
  return <InboxList rows={rows} isLoading={isLoading} hasMore={!!hasNextPage} loadingMore={isFetchingNextPage} onLoadMore={() => void fetchNextPage()} empty={t("messages.groupEmpty")} showGroup={false} onSelect={onSelect} selectedId={selectedId} />;
};

// Groups everybody reads that I do not follow yet.
const DiscoverList = ({ onOpen }: { onOpen?: (id: string) => void }) => {
  const { t } = useTranslation();
  const { discover } = useMessageGroups();
  const { setLevel } = useGroupActions();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>{t("messages.discoverHint")}</Typography.Text>
      {discover.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("messages.discoverEmpty")} />
      ) : (
        discover.map((g) => (
          <Card key={g.id} size="small">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <GroupAvatar photoPath={g.photo_path} size={40} />
              <div style={{ minWidth: 0, flex: 1, cursor: onOpen ? "pointer" : undefined }} onClick={() => onOpen?.(g.id)}>
                <Typography.Text strong>{g.name}</Typography.Text>
                {g.description && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{g.description}</Typography.Text></div>}
              </div>
              <Button size="small" icon={<BellOutlined />} onClick={() => void setLevel(g, "all").then(() => onOpen?.(g.id))}>
                {t("messages.follow")}
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------------
// Narrower screens and phones: the tree
// ---------------------------------------------------------------------------------------------------------------------

const TreeNode = ({
  icon,
  label,
  count,
  open,
  onToggle,
  extra,
  children,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  extra?: ReactNode;
  children: ReactNode;
}) => {
  const { token } = antdTheme.useToken();
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer", borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillQuaternary }}
      >
        <span style={{ color: token.colorTextTertiary, width: 12 }}>{open ? <CaretDownOutlined /> : <CaretRightOutlined />}</span>
        <span style={{ color: token.colorTextSecondary }}>{icon}</span>
        <Typography.Text strong={count > 0} style={{ flex: 1, minWidth: 0 }} ellipsis>{label}</Typography.Text>
        {count > 0 && <Badge count={count} size="small" />}
        {extra}
      </div>
      {open && <div style={{ padding: "2px 0 6px 12px" }}>{children}</div>}
    </div>
  );
};

const TREE_LIMIT = 6;

const ConversationTree = ({ selectedId, onSelect, onNewPost, onSettings }: { selectedId: string | null; onSelect: (row: InboxRow) => void } & GroupActionProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mine, discover } = useMessageGroups();
  const groupUnread = useGroupUnread();
  const inboxUnread = useInboxUnread();
  const [unreadOnly, setUnreadOnly] = useState(false);
  // Open: "For me" and every group that had something new during this visit, until the person folds them (a group stays
  // open when its last unread conversation is read).
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [hadUnread, setHadUnread] = useState<Record<string, true>>({});
  useEffect(() => {
    const fresh = mine.filter((g) => g.level !== "mute" && (groupUnread[g.id] ?? 0) > 0 && !hadUnread[g.id]);
    if (fresh.length) setHadUnread((prev) => ({ ...prev, ...Object.fromEntries(fresh.map((g) => [g.id, true as const])) }));
  }, [mine, groupUnread, hadUnread]);
  const isOpen = (key: string, byDefault: boolean) => toggled[key] ?? byDefault;
  const toggle = (key: string, byDefault: boolean) => setToggled((prev) => ({ ...prev, [key]: !(prev[key] ?? byDefault) }));
  const inbox = useInbox({ view: "mine", unreadOnly, limit: TREE_LIMIT, enabled: isOpen("mine", true) });
  const inboxRows = useMemo(() => inbox.data?.pages.flat() ?? [], [inbox.data]);

  return (
    <div>
      <TreeNode
        icon={<InboxOutlined />}
        label={t("messages.forMe")}
        count={inboxUnread}
        open={isOpen("mine", true)}
        onToggle={() => toggle("mine", true)}
        extra={
          <Dropdown
            trigger={["click"]}
            menu={{
              onClick: (e) => e.domEvent.stopPropagation(),
              items: [
                { key: "unread", icon: unreadOnly ? <CheckOutlined /> : <span style={{ width: 14, display: "inline-block" }} />, label: t("messages.unreadOnly"), onClick: () => setUnreadOnly((v) => !v) },
                {
                  key: "read",
                  icon: <CheckOutlined />,
                  label: t("messages.markAllRead"),
                  onClick: () => void supabaseClient.rpc("inbox_mark_all_read").then(() => refreshMessageCounts(queryClient)),
                },
              ],
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} onClick={(e) => e.stopPropagation()} aria-label={t("messages.groupMenu")} />
          </Dropdown>
        }
      >
        <InboxList
          rows={inboxRows}
          isLoading={inbox.isLoading}
          hasMore={!!inbox.hasNextPage}
          loadingMore={inbox.isFetchingNextPage}
          onLoadMore={() => void inbox.fetchNextPage()}
          empty={t("messages.inboxEmpty")}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      </TreeNode>
      {mine.map((g) => {
        const count = g.level === "mute" ? 0 : groupUnread[g.id] ?? 0;
        return (
          <TreeNode
            key={g.id}
            icon={<GroupAvatar photoPath={g.photo_path} size={20} />}
            label={g.name}
            count={count}
            open={isOpen(g.id, count > 0 || !!hadUnread[g.id])}
            onToggle={() => toggle(g.id, count > 0 || !!hadUnread[g.id])}
            extra={<GroupMenu group={g} onNewPost={onNewPost} onSettings={onSettings} />}
          >
            <GroupConversations group={g} selectedId={selectedId} onSelect={onSelect} limit={TREE_LIMIT} />
          </TreeNode>
        );
      })}
      {discover.length > 0 && (
        <TreeNode icon={<CompassOutlined />} label={t("messages.discover")} count={0} open={isOpen("discover", false)} onToggle={() => toggle("discover", false)}>
          <div style={{ padding: "6px 8px 0 0" }}>
            <DiscoverList />
          </div>
        </TreeNode>
      )}
    </div>
  );
};

// Phone: an open conversation fills the visible viewport, so the keyboard shrinks the chat instead of hiding the composer.
const PhoneFullScreen = ({ children }: { children: ReactNode }) => {
  const { token } = antdTheme.useToken();
  const viewport = useVisualViewport();
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: viewport.top,
        height: viewport.height,
        zIndex: 100,
        background: token.colorBgContainer,
        paddingTop: "env(safe-area-inset-top)",
        // The composer is a round pill: it needs only to clear the home bar, not the whole safe area.
        paddingBottom: "max(0px, calc(env(safe-area-inset-bottom) - 20px))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
};

// Writing a new post in a group (right side).
const NewPostPane = ({ group, onDone, onCancel, onBack }: { group: MessageGroup; onDone: (id: string) => void; onCancel: () => void; onBack?: () => void }) => {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {onBack && <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label={t("common.back")} />}
        <Typography.Title level={5} style={{ margin: 0 }}>{t("messages.newPostIn", { name: group.name })}</Typography.Title>
      </div>
      <PostComposer groups={[group]} defaultGroupId={group.id} startOpen onPosted={onDone} onCancel={onCancel} />
    </div>
  );
};
