import type { ReactNode } from "react";
import { App as AntdApp, Button, Card, Dropdown, Tag, Typography, theme as antdTheme } from "antd";
import { CommentOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PushpinFilled, PushpinOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { PersonAvatar } from "@rbp/core";
import { PostText } from "../feed/postText";
import { PostFiles, PostHero } from "./postFiles";
import { PollCard } from "./pollCard";
import { ReactionBar, ReactionPicker, useMessageReactions } from "../feed/reactions";
import { fetchReactions } from "../lib/reactions";
import { isImage } from "../lib/image";
import { supabaseClient } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { refreshMessageCounts, type GroupPost } from "../hooks/useMessages";
import { withinEditWindow, type PostFile } from "../lib/messaging";
import { errorText } from "@rbp/core";
import { usePermissions } from "@rbp/core";

dayjs.extend(relativeTime);

const LONG = 700;

// One post: the pictures as a hero on top, then author, time, group, pin mark, title, text, poll, other files and the comment count. In the stream a long text is
// cut (`full` shows it all, on the post page).
export const PostCard = ({
  post,
  files,
  meId,
  canModerate,
  showGroup,
  full = false,
  onEdit,
  onDeleted,
  onOpen,
  extra,
  selected = false,
}: {
  post: GroupPost;
  files: PostFile[];
  meId: string | undefined;
  canModerate: boolean;
  showGroup: boolean;
  full?: boolean;
  onEdit: (post: GroupPost) => void;
  onDeleted?: () => void;
  // Opens the post with its comments; default: its page /messages/:id.
  onOpen?: () => void;
  // Below the actions (the stream shows the newest comment there).
  extra?: ReactNode;
  // The post that is open beside the stream.
  selected?: boolean;
}) => {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const { token } = antdTheme.useToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mine = !!meId && post.author_user_id === meId;
  const canDelete = usePermissions().has("messages.delete");
  const long = !full && post.body.length > LONG;
  // The Inbox lists too: Realtime sends nothing for a deleted post (the policies hide it).
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ["group-posts"] }), queryClient.invalidateQueries({ queryKey: ["group-post"] }), refreshMessageCounts(queryClient)]);

  const pin = async () => {
    const { error } = await supabaseClient.rpc("team_post_pin", { p_conversation_id: post.id, p_pinned: !post.pinned });
    if (error) message.error(errorText(error));
    await refresh();
  };
  const remove = () =>
    modal.confirm({
      title: t("messages.deleteTitle"),
      content: t("messages.deleteText"),
      okButtonProps: { danger: true },
      onOk: async () => {
        const { error } = await supabaseClient.rpc("team_post_delete", { p_conversation_id: post.id });
        if (error) return message.error(errorText(error));
        await refresh();
        onDeleted?.();
      },
    });

  const items = [
    ...(canModerate ? [{ key: "pin", icon: post.pinned ? <PushpinOutlined /> : <PushpinFilled />, label: post.pinned ? t("messages.unpin") : t("messages.pin"), onClick: pin }] : []),
    ...(mine && withinEditWindow(post.created_at) ? [{ key: "edit", icon: <EditOutlined />, label: t("common.edit"), onClick: () => onEdit(post) }] : []),
    ...(canDelete ? [{ key: "delete", icon: <DeleteOutlined />, danger: true, label: t("common.delete"), onClick: remove }] : []),
  ];
  const open = onOpen ?? (() => navigate(`/messages/${post.id}`));
  const { data: reactionMap } = useQuery({ queryKey: ["reactions", post.root_message_id], queryFn: () => fetchReactions([post.root_message_id]) });
  // Refreshed by the chat below the post when the text's reactions change (Realtime, chatView.tsx).
  const reactions = useMessageReactions(post.root_message_id, reactionMap?.[post.root_message_id]);

  return (
    <Card size="small" styles={{ body: { padding: 14 } }} style={selected ? { borderColor: token.colorPrimary, boxShadow: `0 0 0 1px ${token.colorPrimary}` } : undefined} cover={files.some(isImage) ? <PostHero files={files} tall={full} /> : undefined}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <PersonAvatar person={{ name: post.author_name, photo_url: post.author_photo_url }} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
            <Typography.Text strong>{post.author_name ?? t("feed.unknownUser")}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} title={formatDateTime(post.created_at)}>
              {dayjs(post.created_at).fromNow()}
              {post.edited_at ? ` · ${t("feed.edited")}` : ""}
            </Typography.Text>
            {showGroup && <Tag style={{ marginInlineEnd: 0 }}>{post.team_name}</Tag>}
            {post.pinned && (
              <Tag icon={<PushpinFilled />} color="gold" style={{ marginInlineEnd: 0 }}>
                {t("messages.pinned")}
              </Tag>
            )}
          </div>
          {post.title && (
            <Typography.Title level={5} style={{ margin: "6px 0 2px", cursor: full ? undefined : "pointer" }} onClick={full ? undefined : open}>
              {post.title}
            </Typography.Title>
          )}
          <div style={long ? { maxHeight: 190, overflow: "hidden", position: "relative" } : undefined}>
            <PostText body={post.body} />
          </div>
          {long && (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={open}>
              {t("messages.readMore")}
            </Button>
          )}
          {post.poll && <PollCard messageId={post.root_message_id} initial={post.poll} isAuthor={mine} />}
          <PostFiles files={files} />
          <ReactionBar state={reactions} canReact />
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <ReactionPicker state={reactions} size={24} />
            {!full && (
              <Button type="text" size="small" icon={<CommentOutlined />} onClick={open} style={{ paddingInline: 4 }}>
                {post.comment_count > 0 ? t("messages.comments", { count: post.comment_count }) : t("messages.comment")}
              </Button>
            )}
          </div>
          {extra}
        </div>
        {items.length > 0 && (
          <Dropdown trigger={["click"]} menu={{ items }}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        )}
      </div>
    </Card>
  );
};
