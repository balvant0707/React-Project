// Ported 1:1 from COMPASS (app/src/pages/home/homeNews.tsx).
import { Link, useNavigate } from "react-router-dom";
import { Typography, theme as antdTheme } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { IconPinFilled } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { supabaseClient } from "@rbp/core";
import { useMessageGroups } from "@rbp/module-messaging/src/hooks/useMessages.ts";
import { useIsMobile } from "@rbp/ui";
import { useSignedUrl } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { GroupAvatar } from "@rbp/module-messaging/src/chats/groupAvatar.tsx";
import { fetchPostFiles } from "@rbp/module-messaging/src/lib/messaging.ts";
import { isImage } from "@rbp/module-messaging/src/lib/image.ts";
import { CI_RED } from "@rbp/ui";

dayjs.extend(relativeTime);

// "News": pinned posts and the posts of the last two weeks from the groups I follow (not the muted ones), as cards
// that swipe sideways. The row is left out when there is nothing.

const NEWS_DAYS = 14;
const NEWS_MAX = 12;

type NewsPost = { id: string; root_message_id: string; team_id: string; team_name: string; title: string | null; body: string; pinned: boolean; author_name: string | null; created_at: string };

// The post text is rich text with mention tokens: a plain line for the card.
const excerpt = (body: string) => {
  const text = new DOMParser().parseFromString(body.replace(/@\[(?:user|group):[^\]]+\]/g, "@…").replace(/\[\[task:[^\]]+\]\]/g, ""), "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
};

export const HomeNews = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mine } = useMessageGroups();
  const isMobile = useIsMobile();
  const ids = mine.filter((g) => g.level !== "mute").map((g) => g.id);
  const { data } = useQuery({
    queryKey: ["home", "news", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const since = dayjs().subtract(NEWS_DAYS, "day").toISOString();
      const { data: rows } = await supabaseClient
        .from("team_posts_overview")
        .select("id, root_message_id, team_id, team_name, title, body, pinned, author_name, created_at")
        .in("team_id", ids)
        .or(`pinned.eq.true,created_at.gte.${since}`)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(NEWS_MAX);
      return (rows ?? []) as NewsPost[];
    },
  });
  // The first picture of each post (the post's own files, not those of its comments).
  const { data: files } = useQuery({
    queryKey: ["home", "news-pictures", (data ?? []).map((p) => p.root_message_id)],
    enabled: !!data?.length,
    staleTime: 60_000,
    queryFn: async () => {
      const byMessage = await fetchPostFiles(data!.map((p) => p.root_message_id));
      return Object.fromEntries(Object.entries(byMessage).flatMap(([id, list]) => (list.find(isImage) ? [[id, list.find(isImage)!.storage_path]] : [])));
    },
  });
  if (!data?.length) return null;

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 18 }}>{t("home.news.title")}</Typography.Title>
        <Link to="/messages">{t("common.showAll")}</Link>
      </div>
      {/* Phone: one row you swipe sideways. Computer: a grid that shows as many cards as the width allows. */}
      <div
        style={
          isMobile
            ? { display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -4px", padding: "0 4px 8px" }
            : { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }
        }
      >
        {data.map((post) => (
          <NewsCard key={post.id} post={post} picture={files?.[post.root_message_id]} photoPath={mine.find((g) => g.id === post.team_id)?.photo_path} onOpen={() => navigate(`/messages/${post.id}`)} />
        ))}
      </div>
    </section>
  );
};

// One card: the first picture of the post on top (when there is one), the group (with its picture) and a pin mark,
// the title and a two-line excerpt, who wrote it and when.
const NewsCard = ({ post, picture, photoPath, onOpen }: { post: NewsPost; picture: string | undefined; photoPath: string | null | undefined; onOpen: () => void }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { data: url } = useSignedUrl(picture);
  return (
    <article
      onClick={onOpen}
      style={{
        flex: "0 0 min(300px, 82%)",
        minWidth: 0,
        scrollSnapAlign: "start",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 12,
      }}
    >
      {picture && (
        <div style={{ aspectRatio: "16 / 9", background: token.colorFillTertiary }}>
          {url && <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        </div>
      )}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: CI_RED }}>
          {photoPath && <GroupAvatar photoPath={photoPath} size={18} />}
          {post.pinned && <IconPinFilled size={13} aria-label={t("home.news.pinned")} />}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.team_name}</span>
        </div>
        <Typography.Text strong style={{ fontSize: 16, lineHeight: 1.3 }}>
          {post.title || excerpt(post.body).slice(0, 80)}
        </Typography.Text>
        {post.title && (
          <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
            {excerpt(post.body)}
          </Typography.Paragraph>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: "auto" }}>
          {[post.author_name, dayjs(post.created_at).fromNow()].filter(Boolean).join(" · ")}
        </Typography.Text>
      </div>
    </article>
  );
};
