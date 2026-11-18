// Started as a 1:1 port of the NPM tool (app/src/pages/inbox/smartViews.tsx); hand-maintained since 2026-11-12.
// Changed: record notes are no longer on the Mail page (they are on the Messages page), so a
// view holds email threads only and its badge counts threads only.
import type { ReactNode } from "react";
import { Badge, theme as antdTheme } from "antd";
import {
  ApartmentOutlined,
  BellOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  CompassOutlined,
  FileTextOutlined,
  InboxOutlined,
  MailOutlined,
  QuestionCircleOutlined,
  RocketOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";

// The smart views of the Mail page (left column on a wide screen, a drawer on narrower ones and on phones).
// Threads come from the rpc email_view_threads(view, ...) with the same keys, counters from email_view_counts().
export type SmartView = {
  key: string;
  label: string;
  icon: ReactNode;
  group: "top" | "attention" | "topics";
  // "total": the badge counts every thread of the view (a queue), otherwise only those unread for me
  badge: "unread" | "total";
  emptyText: string;
};

export const SMART_VIEWS: SmartView[] = [
  { key: "unread", label: "Unread for me", icon: <BellOutlined />, group: "top", badge: "unread", emptyText: "Nothing unread for you" },
  { key: "mine", label: "Mine", icon: <InboxOutlined />, group: "top", badge: "unread", emptyText: "No email threads of yours yet" },
  { key: "unassigned", label: "Unassigned", icon: <QuestionCircleOutlined />, group: "attention", badge: "total", emptyText: "Every conversation has somebody looking after it" },
  { key: "waiting", label: "Waiting for reply", icon: <ClockCircleOutlined />, group: "attention", badge: "total", emptyText: "Nobody owes you an answer - your last mails have all been answered" },
  { key: "deliveries", label: "Deliveries next week", icon: <CalendarOutlined />, group: "attention", badge: "total", emptyText: "No conversation about a delivery planned in the next 7 days" },
  { key: "availability", label: "Availability requests", icon: <CheckSquareOutlined />, group: "topics", badge: "unread", emptyText: "No availability requests" },
  { key: "quotes", label: "Forwarder quotes", icon: <CarOutlined />, group: "topics", badge: "unread", emptyText: "No forwarder quote requests" },
  { key: "offers", label: "Offers", icon: <FileTextOutlined />, group: "topics", badge: "unread", emptyText: "No conversations about offers" },
  { key: "orders", label: "Orders", icon: <ShoppingCartOutlined />, group: "topics", badge: "unread", emptyText: "No conversations about orders" },
  { key: "companies", label: "Companies", icon: <ApartmentOutlined />, group: "topics", badge: "unread", emptyText: "No conversations about companies" },
  { key: "vessels", label: "Vessels", icon: <RocketOutlined />, group: "topics", badge: "unread", emptyText: "No conversations about vessels" },
  { key: "hull_events", label: "Hull events", icon: <CompassOutlined />, group: "topics", badge: "unread", emptyText: "No conversations about hull events" },
  { key: "free", label: "Free conversations", icon: <CommentOutlined />, group: "topics", badge: "unread", emptyText: "No conversations without a record" },
];

const MAILBOX_VIEW_PREFIX = "mailbox:";
export const viewMailboxId = (view: string) => (view.startsWith(MAILBOX_VIEW_PREFIX) ? view.slice(MAILBOX_VIEW_PREFIX.length) : null);

type ViewCount = { u: number; t: number };
export type ViewCounts = { views: Record<string, ViewCount>; mailboxes: Record<string, ViewCount> };

export type NavMailbox = { id: string; display_name: string; color: string | null };

const GROUP_TITLES: Record<SmartView["group"], string | null> = { top: null, attention: "Needs attention", topics: "Topics" };

// The number on a view's badge: its threads from the server, all or only the unread ones.
export function badgeCount(view: SmartView, counts: ViewCounts | null) {
  const server = counts?.views?.[view.key];
  return server ? (view.badge === "total" ? server.t : server.u) : 0;
}

// One list of views, the same component in the side column, the drawer of a narrow screen and the phone's bottom sheet.
export const SmartViewNav = ({
  views,
  mailboxes,
  counts,
  active,
  onSelect,
  touch,
}: {
  views: SmartView[];
  mailboxes: NavMailbox[];
  counts: ViewCounts | null;
  active: string;
  onSelect: (key: string) => void;
  // bigger rows for a finger
  touch?: boolean;
}) => {
  const { token } = antdTheme.useToken();
  const row = (key: string, icon: ReactNode, label: string, count: number, color?: string | null) => {
    const isActive = active === key;
    return (
      <div
        key={key}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(key)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: touch ? "12px 12px" : "6px 10px",
          borderRadius: 6,
          cursor: "pointer",
          background: isActive ? token.colorFillSecondary : undefined,
          fontWeight: isActive ? 600 : 400,
        }}
      >
        <span style={{ color: color ?? token.colorTextSecondary, width: 16, display: "inline-flex", justifyContent: "center" }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {count > 0 && <Badge count={count} overflowCount={99} size="small" />}
      </div>
    );
  };
  const heading = (title: string) => (
    <div key={`h-${title}`} style={{ padding: "12px 10px 4px", fontSize: 12, color: token.colorTextTertiary, textTransform: "uppercase", letterSpacing: 0.4 }}>
      {title}
    </div>
  );
  const out: ReactNode[] = [];
  (["top", "attention", "topics"] as const).forEach((group) => {
    const inGroup = views.filter((v) => v.group === group);
    if (inGroup.length === 0) return;
    const title = GROUP_TITLES[group];
    if (title) out.push(heading(title));
    for (const v of inGroup) out.push(row(v.key, v.icon, v.label, badgeCount(v, counts)));
  });
  if (mailboxes.length > 0) {
    out.push(heading("Mailboxes"));
    for (const m of mailboxes) out.push(row(MAILBOX_VIEW_PREFIX + m.id, <MailOutlined />, m.display_name, counts?.mailboxes?.[m.id]?.u ?? 0, m.color));
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{out}</div>;
};
