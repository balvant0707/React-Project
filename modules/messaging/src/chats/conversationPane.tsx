import { useState } from "react";
import { Alert, Button, Spin, Tag, Typography, theme as antdTheme } from "antd";
import { ArrowLeftOutlined, ExportOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEntityType, useIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import type { EntityType } from "@rbp/core";
import { fetchPostFiles } from "../lib/messaging";
import { useConversationHeader, useMessageGroups, type GroupPost } from "../hooks/useMessages";
import { usePageTitle } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { useRecordConversation } from "../hooks/useRecordConversation";
import { ChatView } from "./chatView";
import { FollowButton } from "./followButton";
import { PostCard } from "./postCard";
import { EditPostModal } from "./postEditor";
import { conversationIcon } from "../lib/entityIcons";
import { GroupChatMenu, useConversationPeople } from "./groupChatMenu";

// The right side of the Messages page: what the conversation is about (title, group, link to the record, follow) and
// the conversation itself as a chat. A post shows its text above the comments.
export const ConversationPane = ({ conversationId, onBack, onDeleted }: { conversationId: string; onBack?: () => void; onDeleted: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { identity } = useIdentity();
  const isMobile = useIsMobile();
  const { groupOf } = useMessageGroups();
  const [editing, setEditing] = useState<GroupPost | null>(null);
  const { data: header, isLoading } = useConversationHeader(conversationId);
  const isPost = header?.kind === "post";
  const isDirect = header?.kind === "direct";
  // A group chat behaves like a direct conversation (no mentions, only the author deletes) and has its own ⋯ menu.
  const isGroupChat = header?.kind === "group";
  const isChat = isDirect || isGroupChat;
  const { data: people } = useConversationPeople(conversationId, isGroupChat);
  usePageTitle(header?.title ?? undefined);

  const { data: post } = useQuery({
    queryKey: ["group-post", conversationId],
    enabled: isPost,
    queryFn: async () => ((await supabaseClient.from("team_posts_overview").select("*").eq("id", conversationId).maybeSingle()).data ?? null) as GroupPost | null,
  });
  const { data: files } = useQuery({ queryKey: ["post-files", conversationId], enabled: !!post, queryFn: () => fetchPostFiles([post!.root_message_id]) });

  if (isLoading) return <Spin style={{ margin: 24 }} />;
  if (!header) return <Alert type="warning" showIcon message={t("messages.notFound")} style={{ margin: 12 }} />;
  const group = groupOf(header.team_id);
  const canModerate = header.can_moderate || !!group?.can_moderate;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {onBack && <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label={t("common.back")} />}
        <span style={{ fontSize: 18, color: token.colorTextSecondary }}>{isGroupChat ? <TeamOutlined /> : isDirect ? <UserOutlined /> : conversationIcon(isPost ? "teams" : header.anchor_type ?? "")}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* A record's title leads to the record. */}
          {!isPost && !isChat ? (
            <Link to={header.link} style={{ display: "block", color: "inherit" }}>
              <Typography.Text strong ellipsis style={{ display: "block" }}>{header.title ?? "—"}</Typography.Text>
            </Link>
          ) : (
            <Typography.Text strong ellipsis style={{ display: "block" }}>{header.title ?? "—"}</Typography.Text>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {isGroupChat ? t("messages.groupChat.people", { count: people?.length ?? 0 }) : t(`messages.anchor.${isPost ? "teams" : isDirect ? "direct" : header.anchor_type}`, { defaultValue: getEntityType(header.anchor_type ?? "")?.label ?? header.anchor_type ?? "" })}
            </Typography.Text>
            {header.team_name && <Tag style={{ marginInlineEnd: 0 }}>{header.team_name}</Tag>}
          </div>
        </div>
        <FollowButton conversationId={conversationId} iconOnly={isMobile} direct={isChat} />
        {isGroupChat && <GroupChatMenu conversationId={conversationId} title={header.title} onLeft={onDeleted} />}
        {!isPost && !isChat && (
          <Link to={header.link}>
            <Button size="small" icon={<ExportOutlined />} aria-label={t("messages.open")}>{isMobile ? null : t("messages.open")}</Button>
          </Link>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, background: token.colorFillQuaternary }}>
        <ChatView
          key={conversationId}
          conversationId={conversationId}
          entityType={(isPost ? "teams" : isChat ? "conversations" : header.anchor_type) as EntityType}
          entityId={header.anchor_id ?? conversationId}
          withEvents={!isPost && !isChat && !!header.anchor_type}
          direct={isChat}
          excludeMessageId={isPost ? header.first_message_id : null}
          canComment={header.can_post}
          top={
            isPost && post ? (
              <div style={{ marginBottom: 8 }}>
                <PostCard post={post} files={files?.[post.root_message_id] ?? []} meId={identity?.id} canModerate={canModerate} showGroup={false} full onEdit={setEditing} onDeleted={onDeleted} />
              </div>
            ) : undefined
          }
        />
      </div>
      <EditPostModal post={editing} onClose={() => setEditing(null)} />
    </div>
  );
};

// A record's chat opened by `/messages?record=<type>:<id>` (phone chat button). Without a conversation yet it shows the
// record's events and the first message creates one; the title comes as router state.
export const RecordPane = ({ entityType, entityId, title, onBack }: { entityType: EntityType; entityId: string; title?: string; onBack?: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data: conversationId, isLoading } = useRecordConversation(entityType, entityId);
  // Writing the first message needs write_notes on the record (conversation_get_or_create).
  const { data: canComment } = useQuery({
    queryKey: ["can-write-notes", entityType, entityId],
    enabled: !isLoading && !conversationId,
    queryFn: async () => (await supabaseClient.rpc("can_access_entity", { p_entity_type: entityType, p_entity_id: entityId, p_grant_type: "write_notes" })).data === true,
  });
  usePageTitle(title);
  if (isLoading) return <Spin style={{ margin: 24 }} />;
  if (conversationId) return <ConversationPane conversationId={conversationId} onBack={onBack} onDeleted={() => onBack?.()} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {onBack && <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label={t("common.back")} />}
        <span style={{ fontSize: 18, color: token.colorTextSecondary }}>{conversationIcon(entityType)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/${entityType}/${entityId}`} style={{ display: "block", color: "inherit" }}>
            <Typography.Text strong ellipsis style={{ display: "block" }}>{title ?? "—"}</Typography.Text>
          </Link>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t(`messages.anchor.${entityType}`, { defaultValue: getEntityType(entityType)?.label ?? entityType })}</Typography.Text>
        </div>
        <Link to={`/${entityType}/${entityId}`}>
          <Button size="small" icon={<ExportOutlined />} aria-label={t("messages.open")}>{isMobile ? null : t("messages.open")}</Button>
        </Link>
      </div>
      <div style={{ flex: 1, minHeight: 0, background: token.colorFillQuaternary }}>
        <ChatView
          conversationId={null}
          entityType={entityType}
          entityId={entityId}
          withEvents
          canComment={canComment ?? false}
          onSent={() => void queryClient.invalidateQueries({ queryKey: ["record-conversation", entityType, entityId] })}
        />
      </div>
    </div>
  );
};
