import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge, Button, Empty, List, Popover, Typography, theme as antdTheme } from "antd";
import { BellOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useTranslation } from "react-i18next";
import { supabaseClient, useIdentity } from "@rbp/core";
import { notificationTitle } from "./notificationText";

dayjs.extend(relativeTime);

const { useToken } = antdTheme;
const PAGE_SIZE = 20;

// New-message notifications (message_notification_types(), without "reaction") show in the Inbox, not the bell; their rows
// stay for push and the mail digest. Reactions stay in the bell.
const CONVERSATION_TYPES = ["mention", "team_mention", "comment", "team_post", "team_comment", "direct_message"];
const NOT_CONVERSATION = `(${CONVERSATION_TYPES.join(",")})`;

type NotificationRow = {
  id: string;
  type: string;
  params: Record<string, unknown> | null;
  title: string;
  body: string | null;
  link: string | null;
  occurrences: number;
  created_at: string;
  read_at: string | null;
};

// The bell (~/maintenance_tool/docs/notifications.md): a header popover on a computer, /notifications on a phone. Realtime, plus a
// recheck on route change and focus (a channel has no backfill).
function useNotifications(close: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const { identity } = useIdentity();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabaseClient
        .from("notifications")
        .select("id, type, params, title, body, link, occurrences, created_at, read_at")
        .contains("channels", ["in_app"])
        .not("type", "in", NOT_CONVERSATION)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE),
      supabaseClient
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .contains("channels", ["in_app"])
        .not("type", "in", NOT_CONVERSATION)
        .is("read_at", null),
    ]);
    setRows((data as NotificationRow[]) ?? []);
    setUnreadCount(count ?? 0);
  }, []);

  useEffect(() => {
    if (identity?.id) refresh();
  }, [identity?.id, location.pathname, refresh]);

  useEffect(() => {
    if (!identity?.id) return;
    window.addEventListener("focus", refresh);
    const channel = supabaseClient
      // One channel per hook: the tab badge and the page may both be mounted, and two channels must not share a name.
      .channel(`notifications:user_id=eq.${identity.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${identity.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("focus", refresh);
      supabaseClient.removeChannel(channel);
    };
  }, [identity?.id, refresh]);

  const openNotification = async (row: NotificationRow) => {
    close();
    if (!row.read_at) {
      await supabaseClient.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", row.id);
      refresh();
    }
    if (row.link) navigate(row.link);
  };

  const markAllRead = async () => {
    await supabaseClient
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .contains("channels", ["in_app"])
      .not("type", "in", NOT_CONVERSATION)
      .is("read_at", null);
    refresh();
  };

  return { rows, unreadCount, openNotification, markAllRead };
}

type Feed = ReturnType<typeof useNotifications>;

const MarkAllRead = ({ feed }: { feed: Feed }) => {
  const { t } = useTranslation();
  return (
    <Button type="link" size="small" disabled={feed.unreadCount === 0} onClick={feed.markAllRead}>
      {t("notifications.markAllRead")}
    </Button>
  );
};

const NotificationList = ({ feed, maxHeight }: { feed: Feed; maxHeight?: number }) => {
  const { token } = useToken();
  const { t } = useTranslation();
  const { rows, openNotification } = feed;
  return rows.length === 0 ? (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("notifications.empty")} />
  ) : (
    <List
      size="small"
      dataSource={rows}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
      renderItem={(row) => (
        <List.Item
          onClick={() => openNotification(row)}
          style={{ cursor: "pointer", alignItems: "flex-start", gap: 8 }}
        >
          <Badge dot={!row.read_at} offset={[4, 6]} style={{ visibility: row.read_at ? "hidden" : "visible" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text strong={!row.read_at}>
              {notificationTitle(t, row)}
              {row.occurrences > 1 && (
                <Typography.Text type="secondary"> ({row.occurrences})</Typography.Text>
              )}
            </Typography.Text>
            {row.body && (
              <Typography.Paragraph
                type="secondary"
                ellipsis={{ rows: 2 }}
                style={{ margin: 0, fontSize: 12 }}
              >
                {row.body}
              </Typography.Paragraph>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 11, color: token.colorTextTertiary }}>
              {dayjs(row.created_at).fromNow()}
            </Typography.Text>
          </div>
        </List.Item>
      )}
    />
  );
};

export const NotificationBell = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const feed = useNotifications(() => setOpen(false));
  const content = (
    <div style={{ width: 340, maxWidth: "80vw" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Typography.Text strong>{t("notifications.title")}</Typography.Text>
        <MarkAllRead feed={feed} />
      </div>
      <NotificationList feed={feed} maxHeight={400} />
    </div>
  );
  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen}>
      <Badge count={feed.unreadCount} size="small" overflowCount={99}>
        <Button type="text" icon={<BellOutlined />} aria-label={t("notifications.title")} />
      </Badge>
    </Popover>
  );
};

// Phone: the number on the bell.
export const useUnreadNotifications = () => useNotifications(() => undefined).unreadCount;

// Phone: the notifications as a page of their own (/notifications).
export const NotificationsPage = () => {
  const feed = useNotifications(() => undefined);
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <MarkAllRead feed={feed} />
      </div>
      <NotificationList feed={feed} />
    </>
  );
};
