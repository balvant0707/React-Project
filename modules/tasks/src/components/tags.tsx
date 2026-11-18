// Copied 1:1 from COMPASS (app/src/components/tags.tsx); the one copy for both apps (task-family and the COMPASS modules import it). Changed: imports (formatDate and the palette from @rbp/ui); DueDate counts from today in the user's time zone. It replaces the tasks module's own
// antd-coloured StatusTag / PriorityTag (docs/shared-parts.md, status and priority tags).
import type { CSSProperties, ReactNode } from "react";
import { Tag } from "antd";
import dayjs from "dayjs";
import { IconClock } from "@tabler/icons-react";
import { formatDate, PRIORITY_LEVEL, STATUS_COLOR, todayIso, usePalette, type ColorKey } from "@rbp/ui";
import { useTranslation } from "react-i18next";
import { pickName } from "../lib/masterData";

// Codes are stored in English; labels come from i18n keys (`status.<code>`, `priority.<code>`, ...). Colours come from
// lib/palette.ts and follow the colour mode; colour never carries the message alone (there is always a label).

// A rounded label on a tinted background, with a dot or an icon in front.
export const Pill = ({ color, children, icon, dot = true, title, style }: { color: ColorKey | string | null | undefined; children: ReactNode; icon?: ReactNode; dot?: boolean; title?: string; style?: CSSProperties }) => {
  const { swatch } = usePalette();
  const s = swatch(color);
  return (
    <span
      title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "1px 10px 1px 8px", borderRadius: 999, background: s.bg, color: s.fg, fontSize: 12, fontWeight: 600, lineHeight: "20px", whiteSpace: "nowrap", marginInlineEnd: 6, verticalAlign: "middle", ...style }}
    >
      {icon ?? (dot ? <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, flex: "none" }} /> : null)}
      {children}
    </span>
  );
};

export const StatusTag = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  return <Pill color={STATUS_COLOR[status] ?? "gray"}>{t(`status.${status}`, { defaultValue: status })}</Pill>;
};

// Four bars like a signal meter (more bars = more urgent) and the label next to it.
export const PriorityBars = ({ priority, size = 14 }: { priority: string; size?: number }) => {
  const { swatch, mode } = usePalette();
  const level = PRIORITY_LEVEL[priority] ?? PRIORITY_LEVEL.normal;
  const on = swatch(level.color).dot;
  const off = mode === "dark" ? "#33424F" : "#E3E8EE";
  return (
    <svg width={size} height={Math.round(size * 0.86)} viewBox="0 0 14 12" aria-hidden style={{ flex: "none" }}>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 3.8} y={8 - i * 2.67} width={2.5} height={4 + i * 2.67} rx={1} fill={i < level.bars ? on : off} />
      ))}
    </svg>
  );
};

export const PriorityTag = ({ priority }: { priority: string }) => {
  const { t } = useTranslation();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", marginInlineEnd: 6, fontSize: 13, verticalAlign: "middle" }}>
      <PriorityBars priority={priority} />
      {t(`priority.${priority}`, { defaultValue: priority })}
    </span>
  );
};

// `name` is the type's name in its queue (tickets_overview.type_name / type_name_de); without it the code is labelled.
export const TicketTypeTag = ({ type, name, nameDe }: { type: string; name?: string | null; nameDe?: string | null }) => {
  const { t } = useTranslation();
  return <Tag>{name ? pickName(name, nameDe) : t(`ticketTypes.${type}`, { defaultValue: type })}</Tag>;
};

// A due date as a pill: overdue in red ("3 days overdue"), today and tomorrow warm, the next days counted, later the date.
// Finished work (`done`) shows the plain date.
export const DueDate = ({ date, done }: { date: string | null | undefined; done?: boolean }) => {
  const { t } = useTranslation();
  if (!date) return <span>—</span>;
  // Platform: today in the user's time zone (as the filter bar and the reminders), not the device's.
  const days = dayjs(date).startOf("day").diff(dayjs(todayIso()).startOf("day"), "day");
  if (done) return <span style={{ whiteSpace: "nowrap" }}>{formatDate(date)}</span>;
  const [color, text]: [ColorKey, string] =
    days < 0 ? ["red", t("due.overdue", { count: -days })]
    : days === 0 ? ["orange", t("due.today")]
    : days === 1 ? ["orange", t("due.tomorrow")]
    : days < 7 ? ["gray", t("due.inDays", { count: days })]
    : ["gray", formatDate(date)];
  return (
    <Pill color={color} dot={false} title={formatDate(date)} icon={<IconClock size={13} stroke={2.2} aria-hidden />}>
      {text}
    </Pill>
  );
};
