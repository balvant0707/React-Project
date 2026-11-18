import { Badge, Button, Empty, Spin, Typography, theme as antdTheme } from "antd";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { InboxRow } from "../hooks/useMessages";
import { formatDateTime } from "@rbp/ui";
import { useTeams, useUserMap } from "@rbp/core";
import { PersonAvatar } from "@rbp/core";
import { ICONS, IconTile } from "@rbp/ui";
import { useIsMobile } from "@rbp/ui";
import { conversationTile } from "../lib/entityIcons";

dayjs.extend(relativeTime);

// One line per conversation: what it is about, the last message, when, and how much is unread. A click selects it
// (onSelect: the Messages page shows it next to the list) or opens the record or post.
export const InboxList = ({
  rows,
  isLoading,
  hasMore,
  loadingMore,
  onLoadMore,
  empty,
  showGroup = true,
  onSelect,
  selectedId,
}: {
  rows: InboxRow[];
  isLoading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  empty: string;
  showGroup?: boolean;
  onSelect?: (row: InboxRow) => void;
  selectedId?: string | null;
}) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const navigate = useNavigate();
  const userMap = useUserMap();
  const { data: groups } = useTeams();
  const isMobile = useIsMobile();

  if (isLoading) return <Spin style={{ margin: 24 }} />;
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  const avatar = (row: InboxRow) => {
    const partner = row.partner_user_id ? userMap.get(row.partner_user_id) : undefined;
    return partner ? (
      <PersonAvatar person={{ name: partner.name, photo_url: partner.photo_url ?? null }} size={40} />
    ) : (
      // A post takes the colour of its team; records stay grey.
      <IconTile icon={ICONS[conversationTile(row.kind === "post" ? "teams" : row.anchor_type ?? "")]} color={row.kind === "post" ? groups?.find((g) => g.id === row.team_id)?.color : null} size={40} />
    );
  };
  // One compact row everywhere: title and time; then group, author and text (two lines on a computer, one on a phone),
  // an @ for a mention and the unread count. Unread = bold title and the count; the selected row is tinted.
  const content = (row: InboxRow, unread: boolean) => {
    const prefix = [showGroup && row.kind !== "direct" ? row.team_name : null, row.last_author_name].filter(Boolean);
    return (
      <>
        {avatar(row)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <Typography.Text strong={unread} ellipsis style={{ flex: 1, minWidth: 0, fontSize: isMobile ? 15 : 14 }}>{row.title ?? "—"}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12, flex: "none" }} title={formatDateTime(row.sort_at)}>{dayjs(row.sort_at).fromNow()}</Typography.Text>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            {/* CSS line clamp: no measuring per row. */}
            <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: token.colorTextSecondary, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: isMobile ? 1 : 2, wordBreak: "break-word" }}>
              {prefix.length ? `${prefix.join(" · ")}: ` : ""}
              {row.last_excerpt ?? ""}
            </div>
            {row.mentioned && <span title={t("messages.mentioned")} style={{ color: token.colorError, fontWeight: 700, flex: "none" }}>@</span>}
            {unread && <Badge count={row.unread_count} size="small" style={{ flex: "none" }} />}
          </div>
        </div>
      </>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row) => {
        const unread = (row.unread_count ?? 0) > 0;
        const open = () => (onSelect ? onSelect(row) : navigate(row.link));
        return (
          <div
            key={row.conversation_id}
            role="link"
            tabIndex={0}
            onClick={open}
            onKeyDown={(e) => e.key === "Enter" && open()}
            className={isMobile ? undefined : "inbox-row"}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: isMobile ? "10px 4px" : "8px 12px",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              cursor: "pointer",
              background: row.conversation_id === selectedId ? token.controlItemBgActive : undefined,
            }}
          >
            {content(row, unread)}
          </div>
        );
      })}
      {hasMore && (
        <Button loading={loadingMore} onClick={onLoadMore} style={{ alignSelf: "center", marginTop: 8 }}>
          {t("messages.loadMoreInbox")}
        </Button>
      )}
    </div>
  );
};
