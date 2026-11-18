import { useEffect, useState } from "react";
import { App as AntdApp, Button, Dropdown, Empty, Image, Input, Segmented, Space, Spin, Typography, theme as antdTheme } from "antd";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  SwapOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import type { EntityType } from "@rbp/core";
import { useUserMap } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useSignedUrl } from "../hooks/useSignedUrl";
import { FileLink } from "../fileLink";
import { fetchCanEdit, fetchFeed, type FeedAttachmentRow, type FeedEntryRow } from "../lib/feedQueries";
import { formatDateTime } from "@rbp/ui";
import { FeedComposer, useTeamMentionTarget } from "./composer";
import { FollowButton } from "../chats/followButton";
import { isEditWindowError, markConversationRead, withinEditWindow } from "../lib/messaging";
import { refreshMessageCounts } from "../hooks/useMessages";
import { eventSentence } from "./eventText";
import { useFeedContext } from "./useFeedContext";
import { editedBody, toDisplayBody, userDisplayName } from "./mentions";
import { MessageBody, useGroupName } from "./messageBody";
import { isImage } from "../lib/image";
import { PersonAvatar } from "@rbp/core";
import { errorText } from "@rbp/core";
import { LongPressReactions, ReactionBar, ReactionPicker, WithReactions } from "../feed/reactions";
import { SeenBy, seenByNames, useConversationReaders } from "./seenBy";
import { isReactionUpdate, reactionRows, type ReactionColumn } from "../lib/reactions";

type FeedData = Awaited<ReturnType<typeof fetchFeed>>;

type Filter = "all" | "comments" | "history";

type AttachmentRow = FeedAttachmentRow;
type EntryRow = FeedEntryRow;

type Props = {
  entityType: EntityType;
  entityId: string;
  // Whether the user may add comments (edit grant on the record).
  canComment?: boolean;
  // Task pages pass the route's step names so events can say "from Approval to Purchasing" (else they are read).
};


const ImageAttachment = ({ attachment }: { attachment: AttachmentRow }) => {
  const { data: url } = useSignedUrl(attachment.storage_path);
  if (!url) return <Spin size="small" />;
  return <Image src={url} alt={attachment.file_name} height={96} style={{ objectFit: "cover", borderRadius: 4 }} />;
};

const FileAttachment = ({ attachment }: { attachment: AttachmentRow }) => (
  <FileLink path={attachment.storage_path} name={attachment.file_name} mimeType={attachment.mime_type} />
);

export const FeedAttachments = ({ items }: { items: AttachmentRow[] }) => {
  if (!items.length) return null;
  return (
    <Space wrap size={8} style={{ marginTop: 8 }}>
      {items.map((a) => (isImage(a) ? <ImageAttachment key={a.id} attachment={a} /> : <FileAttachment key={a.id} attachment={a} />))}
    </Space>
  );
};

// The central element of every detail page: comments, attachments and the (database-written)
// history in one chronological stream, newest at the bottom, composer last.
export const ActivityFeed = ({ entityType, entityId, canComment: canCommentProp }: Props) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { message, modal } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { identity } = useIdentity();
  const users = useUserMap();
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<EntryRow | null>(null);
  const groupName = useGroupName();
  const { data: team } = useTeamMentionTarget(entityType, entityId);
  // Commenting needs edit rights on the record (the database enforces it; this hides the composer).
  const { data: canEdit } = useQuery({
    queryKey: ["can-edit", entityType, entityId],
    enabled: canCommentProp === undefined,
    queryFn: () => fetchCanEdit(entityType, entityId),
  });
  const canComment = canCommentProp ?? canEdit ?? false;
  const queryKey = ["feed", entityType, entityId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchFeed(entityType, entityId),
  });

  // Deleting is the exception: only with messages.delete (~/maintenance_tool/docs/messaging.md "Editing and deleting"); the database checks it again.
  const canDelete = usePermissions().has("messages.delete");

  // Looking at the feed marks the conversation read (again whenever a new message arrives while it is open).
  const conversationId = data?.conversationId ?? null;
  const lastMessageId = [...(data?.entries ?? [])].reverse().find((e) => e.kind === "comment")?.id ?? null;
  useEffect(() => {
    if (!conversationId) return;
    void markConversationRead(conversationId).then(() => refreshMessageCounts(queryClient));
  }, [conversationId, lastMessageId, queryClient]);

  useEffect(() => {
    const channel = supabaseClient
      .channel(`feed:${entityType}:${entityId}:${conversationId ?? "new"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_events", filter: `entity_id=eq.${entityId}` }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      // A new message changes its conversation's counters; this also catches the first one, which creates the conversation.
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `anchor_id=eq.${entityId}` }, () =>
        queryClient.invalidateQueries({ queryKey }),
      );
    // Edits and deletions change only the message; a new reaction count (text unchanged) reloads only its reactions.
    if (conversationId) {
      channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const row = (payload.new ?? {}) as { id?: string; body?: string | null; edited_at?: string | null; deleted_at?: string | null; reactions?: ReactionColumn };
        const cached = queryClient.getQueryData<FeedData>(queryKey)?.entries.find((e) => e.id === row.id);
        if (row.id && isReactionUpdate(cached, row)) {
          const id = row.id;
          // The event carries the new reactions: nothing to fetch.
          queryClient.setQueryData<FeedData>(queryKey, (old) => old && { ...old, reactions: { ...old.reactions, [id]: reactionRows(id, row.reactions) } });
        } else {
          void queryClient.invalidateQueries({ queryKey });
        }
      });
    }
    channel.subscribe();
    return () => {
      void supabaseClient.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, conversationId]);

  const ctx = useFeedContext(entityType, entityId, data?.entries ?? []);
  // Read receipts: the eye on one's own newest comment, refreshed with the feed.
  const readers = useConversationReaders(conversationId, queryKey);
  const myNewestId = [...(data?.entries ?? [])].reverse().find((e) => e.kind === "comment" && e.author_user_id === identity?.id && !e.deleted_at)?.id;


  // Newest on top; the composer sits above the list.
  const entries = (data?.entries ?? [])
    .filter((e) => (filter === "all" ? true : filter === "comments" ? e.kind === "comment" : e.kind === "system_event"))
    .reverse();
  const attachmentsByEntry = new Map<string, AttachmentRow[]>();
  for (const a of data?.attachments ?? []) {
    if (a.entry_id) attachmentsByEntry.set(a.entry_id, [...(attachmentsByEntry.get(a.entry_id) ?? []), a]);
  }

  const startEdit = (entry: EntryRow) => {
    setEditingId(entry.id);
    setEditText(toDisplayBody(entry.body ?? "", users, groupName).text);
  };

  const saveEdit = async (entry: EntryRow) => {
    const body = editedBody(entry.body ?? "", editText, users, groupName, team);
    const { error } = await supabaseClient.from("messages").update({ body }).eq("id", entry.id);
    if (error) {
      message.error(isEditWindowError(error) ? t("feed.editWindowOver") : errorText(error));
      return;
    }
    setEditingId(null);
    await queryClient.invalidateQueries({ queryKey });
  };

  const remove = (entry: EntryRow) =>
    modal.confirm({
      title: t("feed.deleteTitle"),
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error } = await supabaseClient.rpc("message_delete", { p_message_id: entry.id });
        if (error) message.error(errorText(error));
        await queryClient.invalidateQueries({ queryKey });
      },
    });

  const byId = new Map((data?.entries ?? []).map((e) => [e.id, e]));
  const quote = (entry: EntryRow) => {
    const original = entry.reply_to_message_id ? byId.get(entry.reply_to_message_id) : undefined;
    if (!original) return null;
    const who = original.author_user_id && users.get(original.author_user_id) ? userDisplayName(users.get(original.author_user_id)!) : t("feed.unknownUser");
    return (
      <div style={{ borderInlineStart: `3px solid ${token.colorBorder}`, paddingInlineStart: 8, margin: "2px 0 4px", color: token.colorTextSecondary, fontSize: 13 }}>
        <strong>{who}</strong>: {original.deleted_at ? t("feed.deleted") : toDisplayBody(original.body ?? "", users, groupName).text.slice(0, 140)}
      </div>
    );
  };

  const renderBody = (entry: EntryRow) => <MessageBody body={entry.body ?? ""} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {t("feed.title")}
        </Typography.Title>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {conversationId && <FollowButton conversationId={conversationId} />}
        <Segmented<Filter>
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("feed.filterAll") },
            { value: "comments", label: t("feed.filterComments") },
            { value: "history", label: t("feed.filterHistory") },
          ]}
        />
        </div>
      </div>

      {canComment && (
        <div style={{ marginBottom: 16 }}>
          <FeedComposer
            entityType={entityType}
            entityId={entityId}
            replyTo={replyTo ? { id: replyTo.id, name: replyTo.author_user_id && users.get(replyTo.author_user_id) ? userDisplayName(users.get(replyTo.author_user_id)!) : "?" } : null}
            onClearReply={() => setReplyTo(null)}
          />
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin />
        </div>
      ) : entries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("feed.empty")} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.map((entry, index) => {
            const prev = entries[index - 1];
            // As in the chat: a run of messages of one person within five minutes shares the name and avatar.
            const first = !prev || prev.kind === "system_event" || prev.author_user_id !== entry.author_user_id || dayjs(entry.created_at).diff(prev.created_at, "minute") > 5;
            const author = entry.author_user_id ? users.get(entry.author_user_id) : undefined;
            const authorName = author ? userDisplayName(author) : null;

            if (entry.kind === "system_event") {
              return (
                <div key={entry.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", color: token.colorTextSecondary, fontSize: 13, marginTop: 10 }}>
                  <span style={{ width: 24, textAlign: "center", marginTop: 2 }}>
                    {entry.event_type === "task_completed" ? <CheckCircleOutlined style={{ color: token.colorSuccess }} /> : <SwapOutlined />}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span>{eventSentence(t, entry.event_type!, entry.metadata, authorName, ctx, entityType)}</span>
                    {entry.metadata?.comment ? (
                      <div style={{ color: token.colorText, whiteSpace: "pre-wrap", marginTop: 2 }}>“{entry.metadata.comment}”</div>
                    ) : null}
                    <FeedAttachments items={attachmentsByEntry.get(entry.id) ?? []} />
                    <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{formatDateTime(entry.created_at)}</div>
                  </div>
                </div>
              );
            }

            const mine = entry.author_user_id === identity?.id;
            return (
              <WithReactions key={entry.id} messageId={entry.id} rows={data?.reactions?.[entry.id]}>
              {(state) => (
              <div className="chat-row" style={{ display: "flex", gap: 8, justifyContent: mine ? "flex-end" : "flex-start", marginTop: first ? 10 : 2 }}>
                {!mine && <div style={{ width: 32, flex: "none" }}>{first && <PersonAvatar person={{ name: authorName ?? "?", photo_url: author?.photo_url ?? null }} size={32} />}</div>}
                <div style={{ maxWidth: "78%", minWidth: 0 }}>
                  {!mine && first && (
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginInlineStart: 4 }}>
                      {authorName ?? t("feed.unknownUser")}
                    </Typography.Text>
                  )}
                  <LongPressReactions state={state} enabled={!entry.deleted_at && editingId !== entry.id}>
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
                      {quote(entry)}
                      {entry.deleted_at ? (
                        <Typography.Text type="secondary" italic>{t("feed.deleted")}</Typography.Text>
                      ) : editingId === entry.id ? (
                        <div style={{ minWidth: 240 }}>
                          <Input.TextArea autoSize value={editText} onChange={(e) => setEditText(e.target.value)} />
                          <Space style={{ marginTop: 6 }}>
                            <Button size="small" type="primary" onClick={() => saveEdit(entry)}>{t("common.save")}</Button>
                            <Button size="small" onClick={() => setEditingId(null)}>{t("common.cancel")}</Button>
                          </Space>
                        </div>
                      ) : (
                        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{renderBody(entry)}</div>
                      )}
                      <FeedAttachments items={attachmentsByEntry.get(entry.id) ?? []} />
                      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }} title={formatDateTime(entry.created_at)}>
                          {entry.edited_at ? `${t("feed.edited")} · ` : ""}
                          {formatDateTime(entry.created_at)}
                        </Typography.Text>
                        {entry.id === myNewestId && (
                          <SeenBy readers={seenByNames(readers, entry, (id) => (users.get(id) ? userDisplayName(users.get(id)!) : t("feed.unknownUser")))} />
                        )}
                        {!entry.deleted_at && <ReactionPicker state={state} />}
                        {canComment && !entry.deleted_at && (
                          <Button type="text" size="small" className="chat-action" icon={<RollbackOutlined />} title={t("feed.reply")} onClick={() => setReplyTo(entry)} style={{ height: 20, width: 20 }} />
                        )}
                        {!entry.deleted_at && editingId !== entry.id && ((mine && withinEditWindow(entry.created_at)) || canDelete) && (
                          <Dropdown
                            trigger={["click"]}
                            menu={{
                              items: [
                                ...(mine && withinEditWindow(entry.created_at) ? [{ key: "edit", icon: <EditOutlined />, label: t("common.edit"), onClick: () => startEdit(entry) }] : []),
                                ...(canDelete ? [{ key: "delete", icon: <DeleteOutlined />, danger: true, label: t("common.delete"), onClick: () => remove(entry) }] : []),
                              ],
                            }}
                          >
                            <Button type="text" size="small" className="chat-action" icon={<MoreOutlined />} style={{ height: 20, width: 20 }} />
                          </Dropdown>
                        )}
                      </div>
                    </div>
                  </LongPressReactions>
                  {!entry.deleted_at && <ReactionBar state={state} canReact style={{ justifyContent: mine ? "flex-end" : "flex-start" }} />}
                </div>
              </div>
              )}
              </WithReactions>
            );
          })}
        </div>
      )}

    </div>
  );
};

