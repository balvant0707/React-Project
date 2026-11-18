import { useEffect } from "react";
import { Button, Empty, Spin, Typography, theme as antdTheme } from "antd";
import dayjs from "dayjs";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "@rbp/core";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { fetchPostFiles } from "../lib/messaging";
import { refreshMessageCounts, type GroupPost, type MessageGroup } from "../hooks/useMessages";
import { PostCard } from "./postCard";
import { PersonAvatar } from "@rbp/core";
import { useUserMap } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";

type LastComment = { conversation_id: string; message_id: string; author_user_id: string | null; author_name: string | null; excerpt: string; created_at: string };

const PAGE = 15;

// The posts of a team as a feed, newest first and the pinned ones on top: picture, text, poll, reactions, the comment
// count and the newest comment on each card (the state of the conversation at a glance); "Comment" or the comment opens
// the post with its chat (`onOpen`). Showing the feed reads the team (team_mark_read), as the Inbox reads what it shows.
export const GroupFeed = ({ group, onOpen, selectedId }: { group: MessageGroup; onOpen: (conversationId: string) => void; selectedId?: string | null }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const userMap = useUserMap();
  const queryClient = useQueryClient();
  const { identity } = useIdentity();
  const { data: pinned } = useQuery({
    queryKey: ["group-posts", group.id, "pinned"],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("team_posts_overview").select("*").eq("team_id", group.id).eq("pinned", true).order("pinned_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GroupPost[];
    },
  });
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["group-posts", group.id, "feed"],
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      // Keyset on (created_at, id): a page boundary never repeats or skips a post.
      let query = supabaseClient.from("team_posts_overview").select("*").eq("team_id", group.id).eq("pinned", false);
      if (pageParam) query = query.or(`created_at.lt.${pageParam.at},and(created_at.eq.${pageParam.at},id.lt.${pageParam.id})`);
      const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE);
      if (error) throw error;
      return (data ?? []) as GroupPost[];
    },
    getNextPageParam: (last) => (last.length === PAGE ? { at: last[last.length - 1].created_at, id: last[last.length - 1].id } : undefined),
  });
  const posts = [...(pinned ?? []), ...(data?.pages.flat() ?? [])];
  const rootIds = posts.map((p) => p.root_message_id);
  const { data: files } = useQuery({ queryKey: ["group-posts", group.id, "files", rootIds], enabled: rootIds.length > 0, queryFn: () => fetchPostFiles(rootIds) });
  // The newest comment of each post that has one (one call per 50 posts).
  const commented = posts.filter((p) => p.comment_count > 0).map((p) => p.id);
  const { data: lastComments } = useQuery({
    queryKey: ["group-posts", group.id, "last-comments", commented],
    enabled: commented.length > 0,
    queryFn: async () => {
      const byPost: Record<string, LastComment> = {};
      for (let i = 0; i < commented.length; i += 50) {
        const { data, error } = await supabaseClient.rpc("team_post_last_comments", { p_conversation_ids: commented.slice(i, i + 50) });
        if (error) throw error;
        for (const c of (data ?? []) as LastComment[]) byPost[c.conversation_id] = c;
      }
      return byPost;
    },
  });
  const lastComment = (postId: string) => {
    const c = lastComments?.[postId];
    if (!c) return null;
    const author = c.author_user_id ? userMap.get(c.author_user_id) : undefined;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(postId)}
        onKeyDown={(e) => e.key === "Enter" && onOpen(postId)}
        style={{ display: "flex", gap: 8, marginTop: 8, padding: "8px 10px", borderRadius: token.borderRadius, background: token.colorFillQuaternary, cursor: "pointer" }}
      >
        <PersonAvatar person={{ name: c.author_name ?? "", photo_url: author?.photo_url ?? null }} size={24} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
            <Typography.Text strong style={{ fontSize: 13 }}>{c.author_name ?? t("feed.unknownUser")}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }} title={formatDateTime(c.created_at)}>{dayjs(c.created_at).fromNow()}</Typography.Text>
          </div>
          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ fontSize: 13, margin: 0 }}>{c.excerpt}</Typography.Paragraph>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!data) return;
    void supabaseClient.rpc("team_mark_read", { p_team_id: group.id }).then(() => refreshMessageCounts(queryClient));
  }, [data, group.id, queryClient]);

  if (isLoading) return <Spin style={{ margin: 24 }} />;
  if (!posts.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("messages.groupEmpty")} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          files={files?.[post.root_message_id] ?? []}
          meId={identity?.id}
          canModerate={group.can_moderate}
          showGroup={false}
          onOpen={() => onOpen(post.id)}
          // Editing happens on the post itself, where the editor lives.
          onEdit={() => onOpen(post.id)}
          selected={post.id === selectedId}
          extra={lastComment(post.id)}
        />
      ))}
      {hasNextPage && (
        <Button loading={isFetchingNextPage} onClick={() => void fetchNextPage()} style={{ alignSelf: "center" }}>
          {t("messages.loadMoreInbox")}
        </Button>
      )}
    </div>
  );
};
