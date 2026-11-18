import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App as AntdApp, Button, Dropdown, Input, Space, Spin, Typography, theme as antdTheme } from "antd";
import { DeleteOutlined, EditOutlined, MoreOutlined, RollbackOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useIdentity } from "@rbp/core";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import type { EntityType, UserRow } from "@rbp/core";
import type { FeedAttachmentRow } from "../lib/feedQueries";
import { isEditWindowError, markConversationRead, withinEditWindow } from "../lib/messaging";
import { refreshMessageCounts } from "../hooks/useMessages";
import { useUserMap } from "@rbp/core";
import { FeedAttachments } from "../feed/activityFeed";
import { FeedComposer, useTeamMentionTarget } from "../feed/composer";
import { MessageBody, useGroupName } from "../feed/messageBody";
import { eventSentence } from "../feed/eventText";
import { useFeedContext } from "../feed/useFeedContext";
import { SeenBy, seenByNames, useConversationReaders } from "../feed/seenBy";
import { LongPressReactions, ReactionBar, ReactionPicker, WithReactions } from "../feed/reactions";
import { applyPollUpdate, type Poll } from "../lib/polls";
import { isReactionUpdate, reactionRows, REACTIONS_COLUMN, splitReactions, type ReactionColumn, type ReactionMap } from "../lib/reactions";
import { editedBody, toDisplayBody, userDisplayName } from "../feed/mentions";
import { PersonAvatar } from "@rbp/core";
import { formatDate, formatDateTime } from "@rbp/ui";
import { errorText } from "@rbp/core";

const PAGE = 30;

type Item = {
  kind: "message" | "event";
  id: string;
  created_at: string;
  author_user_id: string | null;
  body: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
  event_type: string | null;
  metadata: Record<string, any>;
};
type Page = { items: Item[]; files: Record<string, FeedAttachmentRow[]>; reactions: ReactionMap; next: { at: string; id: string } | null };

// One conversation as a chat (~/maintenance_tool/docs/messaging.md "Messages page"): newest at the bottom, older pages of 30 load at the top;
// on a record its history events show as grey lines.
export const ChatView = ({
  conversationId,
  entityType,
  entityId,
  withEvents,
  excludeMessageId,
  canComment,
  top,
  direct = false,
  onSent,
}: {
  // null: a record nobody has written on yet (only its history events show; the first message creates the conversation).
  conversationId: string | null;
  // The anchor: where files and mentions belong (the record, or the group of a post).
  entityType: EntityType;
  entityId: string;
  withEvents: boolean;
  // The text of a post is shown by `top`, not as a message.
  excludeMessageId?: string | null;
  canComment: boolean;
  // Shown above the first message once everything is loaded (the post itself).
  top?: ReactNode;
  // A direct conversation: the author deletes their own messages, no mentions, a hint about what does not belong here.
  direct?: boolean;
  onSent?: () => void;
}) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { message, modal } = AntdApp.useApp();
  // Deleting is the exception: only with messages.delete (~/maintenance_tool/docs/messaging.md "Editing and deleting").
  const canDelete = usePermissions().has("messages.delete");
  const queryClient = useQueryClient();
  const { identity } = useIdentity();
  // For the Realtime handler, which subscribes once per conversation.
  const meRef = useRef<string | undefined>(undefined);
  meRef.current = identity?.id;
  const users = useUserMap();
  const groupName = useGroupName();
  const { data: team } = useTeamMentionTarget(entityType, entityId);
  const [replyTo, setReplyTo] = useState<Item | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  // A message that becomes a task (menu "Create task from message").
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const restore = useRef<{ height: number; top: number } | null>(null);
  const stickToBottom = useRef(true);
  const queryKey = ["chat", conversationId ?? `${entityType}:${entityId}`];

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    // Safety net for a Realtime socket that dropped unnoticed: read again on focus and once a minute while the tab is visible.
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }): Promise<Page> => {
      if (!conversationId) {
        const { data: evs } = await supabaseClient.from("activity_events").select("id, event_type, metadata, author_user_id, created_at").eq("entity_type", entityType).eq("entity_id", entityId);
        const events = ((evs ?? []) as any[]).map((ev) => ({ ...ev, kind: "event" as const, body: null, edited_at: null, deleted_at: null, reply_to_message_id: null }));
        return { items: events.sort((a, b) => b.created_at.localeCompare(a.created_at)), files: {}, reactions: {}, next: null };
      }
      let q = supabaseClient
        .from("messages")
        .select(`id, body, author_user_id, created_at, edited_at, deleted_at, reply_to_message_id, ${REACTIONS_COLUMN}`)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE);
      if (excludeMessageId) q = q.neq("id", excludeMessageId);
      if (pageParam) q = q.or(`created_at.lt."${pageParam.at}",and(created_at.eq."${pageParam.at}",id.lt.${pageParam.id})`);
      const { data: rows, error } = await q;
      if (error) throw error;
      const { messages, reactions } = splitReactions((rows ?? []) as (Omit<Item, "kind" | "event_type" | "metadata"> & { reactions?: ReactionColumn })[]);
      const full = messages.length === PAGE;
      const oldest = messages[messages.length - 1];
      let events: Item[] = [];
      if (withEvents) {
        let e = supabaseClient
          .from("activity_events")
          .select("id, event_type, metadata, author_user_id, created_at")
          .eq("entity_type", entityType)
          .eq("entity_id", entityId);
        if (pageParam) e = e.lt("created_at", pageParam.at);
        if (full) e = e.gte("created_at", oldest.created_at);
        const { data: evs } = await e;
        events = ((evs ?? []) as any[]).map((ev) => ({ ...ev, kind: "event" as const, body: null, edited_at: null, deleted_at: null, reply_to_message_id: null }));
      }
      const ids = [...messages.map((m) => m.id), ...events.map((e) => e.id)];
      const files: Record<string, FeedAttachmentRow[]> = {};
      if (ids.length) {
        const { data: atts } = await supabaseClient
          .from("attachments")
          .select("id, message_id, event_id, storage_path, file_name, mime_type, size_bytes")
          .or(`message_id.in.(${ids.join(",")}),event_id.in.(${ids.join(",")})`);
        for (const a of (atts ?? []) as any[]) {
          const key = a.message_id ?? a.event_id;
          files[key] = [...(files[key] ?? []), { ...a, entry_id: key }];
        }
      }
      const items = [...messages.map((m) => ({ ...m, kind: "message" as const, event_type: null, metadata: {} })), ...events].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      );
      return { items, files, reactions, next: full ? { at: oldest.created_at, id: oldest.id } : null };
    },
    getNextPageParam: (last) => last.next ?? undefined,
  });

  // Oldest first for display; files of every loaded page in one lookup.
  const items = useMemo(() => [...(data?.pages ?? [])].flatMap((p) => p.items).reverse(), [data]);
  const files = useMemo(() => Object.assign({}, ...(data?.pages ?? []).map((p) => p.files)) as Record<string, FeedAttachmentRow[]>, [data]);
  const reactions = useMemo(() => Object.assign({}, ...(data?.pages ?? []).map((p) => p.reactions ?? {})) as ReactionMap, [data]);
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])) as Record<string, Item>, [items]);
  const newestMessageId = [...items].reverse().find((i) => i.kind === "message")?.id ?? null;
  const myNewest = identity?.id ? [...items].reverse().find((i) => i.kind === "message" && i.author_user_id === identity.id && !i.deleted_at) : undefined;

  const readers = useConversationReaders(conversationId, queryKey);
  // The Realtime handler below is set up once per conversation; it reads the current messages through this ref.
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  // New reactions on one message, straight from the Realtime event, into the loaded page that holds it.
  const patchReactions = (id: string, column: ReactionColumn) =>
    queryClient.setQueryData<InfiniteData<Page>>(queryKey, (old) =>
      old && { ...old, pages: old.pages.map((p) => (p.items.some((i) => i.id === id) ? { ...p, reactions: { ...p.reactions, [id]: reactionRows(id, column) } } : p)) },
    );

  // Realtime: new or edited messages and their reactions (message_reactions_sync rewrites the message).
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabaseClient
      .channel(`chat:${conversationId}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const row = (payload.new ?? {}) as { id?: string; author_user_id?: string | null; body?: string | null; edited_at?: string | null; deleted_at?: string | null; reactions?: ReactionColumn; poll?: Poll | null };
        if (payload.eventType === "UPDATE" && row.id && row.id === excludeMessageId) {
          // A post's text: the post card shows its reactions and poll; a vote changes only the poll.
          if (!applyPollUpdate(queryClient, row.id, row.poll, !!meRef.current && row.author_user_id === meRef.current)) {
            void queryClient.invalidateQueries({ queryKey: ["reactions", row.id] });
          }
        } else if (payload.eventType === "UPDATE" && row.id && isReactionUpdate(byIdRef.current[row.id], row)) {
          patchReactions(row.id, row.reactions);
        } else {
          void queryClient.invalidateQueries({ queryKey });
        }
      })
      .subscribe();
    return () => {
      void supabaseClient.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Seen = read (again whenever a new message arrives while it is open; a post without comments too).
  useEffect(() => {
    if (isLoading || !conversationId) return;
    void markConversationRead(conversationId).then(() => refreshMessageCounts(queryClient));
  }, [conversationId, newestMessageId, isLoading, queryClient]);

  // Scrolling: start at the bottom, stay there while new messages come in, keep the place when older ones are added on top.
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (restore.current) {
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items.length, newestMessageId]);
  // Stay at the bottom while the layout settles (keyboard, images).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stay = () => {
      if (stickToBottom.current && !restore.current) el.scrollTop = el.scrollHeight;
    };
    const observer = new ResizeObserver(stay);
    observer.observe(el);
    const timer = window.setTimeout(stay, 300);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [conversationId, isLoading]);
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          restore.current = { height: root.scrollHeight, top: root.scrollTop };
          void fetchNextPage();
        }
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  const nameOf = (id: string | null) => {
    const u: UserRow | undefined = id ? users.get(id) : undefined;
    return u ? userDisplayName(u) : t("feed.unknownUser");
  };
  const ctx = useFeedContext(entityType, entityId, items);

  const saveEdit = async () => {
    if (!editing) return;
    const body = editedBody(byId[editing.id]?.body ?? "", editing.text, users, groupName, team);
    const { error } = await supabaseClient.from("messages").update({ body }).eq("id", editing.id);
    if (error) return message.error(isEditWindowError(error) ? t("feed.editWindowOver") : errorText(error));
    setEditing(null);
    await queryClient.invalidateQueries({ queryKey });
  };
  const remove = (item: Item) =>
    modal.confirm({
      title: t("feed.deleteTitle"),
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error } = await supabaseClient.rpc("message_delete", { p_message_id: item.id });
        if (error) message.error(errorText(error));
        await queryClient.invalidateQueries({ queryKey });
      },
    });

  const bubble = (item: Item, index: number) => {
    const mine = !!identity?.id && item.author_user_id === identity.id;
    const prev = items[index - 1];
    // A run of messages of one person within five minutes shares the name and avatar.
    const first = !prev || prev.kind !== "message" || prev.author_user_id !== item.author_user_id || dayjs(item.created_at).diff(prev.created_at, "minute") > 5;
    const quoted = item.reply_to_message_id ? byId[item.reply_to_message_id] : undefined;
    const actions = [
      ...(mine && !item.deleted_at && withinEditWindow(item.created_at) ? [{ key: "edit", icon: <EditOutlined />, label: t("common.edit"), onClick: () => setEditing({ id: item.id, text: toDisplayBody(item.body ?? "", users, groupName).text }) }] : []),
      ...((direct ? mine : canDelete) && !item.deleted_at ? [{ key: "delete", icon: <DeleteOutlined />, danger: true, label: t("common.delete"), onClick: () => remove(item) }] : []),
    ];
    return (
      <div key={item.id} className="chat-row" style={{ display: "flex", gap: 8, justifyContent: mine ? "flex-end" : "flex-start", marginTop: first ? 10 : 2 }}>
        {!mine && <div style={{ width: 32, flex: "none" }}>{first && <PersonAvatar person={{ name: nameOf(item.author_user_id), photo_url: users.get(item.author_user_id ?? "")?.photo_url ?? null }} size={32} />}</div>}
        <div style={{ maxWidth: "78%", minWidth: 0 }}>
          {!mine && first && (
            <Typography.Text type="secondary" style={{ fontSize: 12, marginInlineStart: 4 }}>
              {nameOf(item.author_user_id)}
            </Typography.Text>
          )}
          <WithReactions messageId={item.id} rows={reactions[item.id]}>
          {(state) => (
          <>
          <LongPressReactions state={state} enabled={!item.deleted_at && editing?.id !== item.id}>
          <div
            style={{
              background: mine ? token.colorPrimaryBg : token.colorBgContainer,
              border: `1px solid ${mine ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
              borderRadius: 12,
              borderStartEndRadius: mine && first ? 4 : 12,
              borderStartStartRadius: !mine && first ? 4 : 12,
              padding: "6px 10px",
            }}
          >
            {item.reply_to_message_id && (
              <div style={{ borderInlineStart: `3px solid ${token.colorBorder}`, paddingInlineStart: 8, marginBottom: 4, color: token.colorTextSecondary, fontSize: 13 }}>
                {quoted ? (
                  <>
                    <strong>{nameOf(quoted.author_user_id)}</strong>: {quoted.deleted_at ? t("feed.deleted") : toDisplayBody(quoted.body ?? "", users, groupName).text.slice(0, 140)}
                  </>
                ) : (
                  t("messages.replyOlder")
                )}
              </div>
            )}
            {item.deleted_at ? (
              <Typography.Text type="secondary" italic>{t("feed.deleted")}</Typography.Text>
            ) : editing?.id === item.id ? (
              <div style={{ minWidth: 240 }}>
                <Input.TextArea autoSize value={editing.text} onChange={(e) => setEditing({ id: item.id, text: e.target.value })} />
                <Space style={{ marginTop: 6 }}>
                  <Button size="small" type="primary" onClick={() => void saveEdit()}>{t("common.save")}</Button>
                  <Button size="small" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                </Space>
              </div>
            ) : (
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <MessageBody body={item.body ?? ""} />
              </div>
            )}
            <FeedAttachments items={files[item.id] ?? []} />
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 2 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }} title={formatDateTime(item.created_at)}>
                {item.edited_at ? `${t("feed.edited")} · ` : ""}
                {dayjs(item.created_at).format("HH:mm")}
              </Typography.Text>
              {item.id === myNewest?.id && <SeenBy readers={seenByNames(readers, item, nameOf)} />}
              {!item.deleted_at && <ReactionPicker state={state} />}
              {canComment && !item.deleted_at && (
                <Button type="text" size="small" className="chat-action" icon={<RollbackOutlined />} title={t("feed.reply")} onClick={() => setReplyTo(item)} style={{ height: 20, width: 20 }} />
              )}
              {actions.length > 0 && editing?.id !== item.id && (
                <Dropdown trigger={["click"]} menu={{ items: actions }}>
                  <Button type="text" size="small" className="chat-action" icon={<MoreOutlined />} style={{ height: 20, width: 20 }} />
                </Dropdown>
              )}
            </div>
          </div>
          </LongPressReactions>
          {!item.deleted_at && <ReactionBar state={state} canReact style={{ justifyContent: mine ? "flex-end" : "flex-start" }} />}
          </>
          )}
          </WithReactions>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px" }}>
        <div ref={sentinelRef} style={{ height: 1 }} />
        {isLoading || isFetchingNextPage ? <div style={{ textAlign: "center", padding: 8 }}><Spin size="small" /></div> : null}
        {!hasNextPage && !isLoading && (top ?? <div style={{ textAlign: "center", color: token.colorTextTertiary, fontSize: 12, padding: 8 }}>{t("messages.conversationStart")}</div>)}
        {items.map((item, i) => {
          const day = formatDate(item.created_at);
          const newDay = i === 0 || formatDate(items[i - 1].created_at) !== day;
          return (
            <Fragment key={item.id}>
              {newDay && (
                <div style={{ textAlign: "center", margin: "12px 0 4px" }}>
                  <span style={{ fontSize: 12, color: token.colorTextSecondary, background: token.colorFillTertiary, borderRadius: 10, padding: "2px 10px" }}>{day}</span>
                </div>
              )}
              {item.kind === "event" ? (
                <div style={{ textAlign: "center", color: token.colorTextTertiary, fontSize: 12, margin: "6px 24px" }}>
                  {eventSentence(t, item.event_type!, item.metadata, item.author_user_id ? nameOf(item.author_user_id) : null, ctx, entityType)} · {dayjs(item.created_at).format("HH:mm")}
                  <FeedAttachments items={files[item.id] ?? []} />
                </div>
              ) : (
                bubble(item, i)
              )}
            </Fragment>
          );
        })}
      </div>
      {canComment && (
        <div style={{ flex: "none", padding: "8px 12px", borderTop: `1px solid ${token.colorBorderSecondary}` }}>
          {direct && <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 4 }}>{t("messages.directHint")}</Typography.Text>}
          <FeedComposer
            direct={direct}
            entityType={entityType}
            entityId={entityId}
            conversationId={conversationId ?? undefined}
            compact
            replyTo={replyTo ? { id: replyTo.id, name: nameOf(replyTo.author_user_id) } : null}
            onClearReply={() => setReplyTo(null)}
            onSent={() => {
              stickToBottom.current = true;
              void queryClient.invalidateQueries({ queryKey });
              onSent?.();
            }}
          />
        </div>
      )}
    </div>
  );
};
