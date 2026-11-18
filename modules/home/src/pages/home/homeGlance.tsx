// Ported 1:1 from COMPASS (app/src/pages/home/homeGlance.tsx).
import { Link } from "react-router-dom";
import { Avatar, Tooltip, Typography, theme as antdTheme } from "antd";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { IconAlertTriangle, IconBeach, IconCertificate, IconFileText, IconLock, IconPackage, IconTicket, IconTruckDelivery, IconClockExclamation, type Icon } from "@tabler/icons-react";
import { supabaseClient } from "@rbp/core";
import { CI_RED } from "@rbp/ui";
import { useAdminDelegation, usePermissions } from "@rbp/core";
import { useMe } from "@rbp/core";
import { PersonAvatar } from "@rbp/core";
import { filterQuery, useCounts, useLeaveCounts } from "@rbp/module-task-family/src/pages/dashboard/widgets.tsx";

// "At a glance": one-line links with a number, only for what the person may use and only when the number is above zero
// (a link without something behind it is noise). Never lists: a tap opens the page that holds them. The rows of the
// task, item and training numbers each cost one counting query, so they only run for people who hold the right.

type Pill = { key: string; label: string; to: string; icon: Icon; count: number | undefined; danger?: boolean };

const STALE = 120_000;
const countOf = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

type Away = { user_id: string; name: string; photo_url: string | null; same_team: boolean };
const AWAY_MAX = 6;

// People away today as faces: colleagues of my own teams first (the function sorts them so), then the rest, at most six.
const useAwayToday = (enabled: boolean, userId: string | undefined) =>
  useQuery({
    queryKey: ["home", "glance", "away-today", userId],
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_away_today");
      if (error) throw error;
      return (data ?? []) as Away[];
    },
  });

const AwayFaces = ({ people }: { people: Away[] }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const shown = people.slice(0, AWAY_MAX);
  const rest = people.length - shown.length;
  return (
    <Link to="/leave" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 12px 4px 6px", borderRadius: 999, color: token.colorText, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, fontSize: 13 }}>
      <Avatar.Group size={26}>
        {shown.map((p) => (
          <Tooltip key={p.user_id} title={p.name}>
            <span style={{ display: "inline-flex" }}><PersonAvatar person={p} size={26} /></span>
          </Tooltip>
        ))}
      </Avatar.Group>
      {t("home.glance.away")}
      {rest > 0 && <strong>+{rest}</strong>}
    </Link>
  );
};

const LEAVE_PARTS = ["taken", "planned", "requested"] as const;

// Taken | planned | requested as one pill with a small stacked bar, so the year reads at a glance.
const MyLeave = ({ year, days }: { year: number; days: number[] }) => {
  const { t, i18n } = useTranslation();
  const { token } = antdTheme.useToken();
  const total = days.reduce((a, b) => a + b, 0);
  const colours = [token.colorTextSecondary, token.colorPrimary, token.colorWarning];
  return (
    <Link
      to="/leave?tab=mine"
      style={{ display: "inline-flex", flexDirection: "column", gap: 4, padding: "6px 12px", borderRadius: 16, color: token.colorText, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, fontSize: 13 }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <IconBeach size={16} stroke={1.8} color={token.colorTextSecondary} aria-hidden />
        {t("home.glance.leaveMine", { year })}
        {LEAVE_PARTS.map((part, i) => (
          <span key={part} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: colours[i] }} />
            <strong>{days[i].toLocaleString(i18n.language)}</strong> {t(`home.glance.leave.${part}`)}
          </span>
        ))}
      </span>
      <span aria-hidden style={{ display: "flex", height: 4, borderRadius: 2, overflow: "hidden", background: token.colorFillSecondary }}>
        {days.map((d, i) => d > 0 && <span key={i} style={{ width: `${(d / total) * 100}%`, background: colours[i] }} />)}
      </span>
    </Link>
  );
};

export const HomeGlance = () => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const perms = usePermissions();
  const { userId } = useMe();
  const { canManageUsers } = useAdminDelegation();
  const { data: counts } = useCounts();
  const { data: leave } = useLeaveCounts();
  const { data: away } = useAwayToday(perms.ready && !!userId && perms.hasAny("leave.view."), userId);
  const may = (prefix: string) => perms.ready && perms.hasAny(prefix);
  const head = (table: string) => supabaseClient.from(table).select("*", { count: "exact", head: true });
  const trainingDue = ["due_soon", "reinstruction", "expired", "missing"];

  // [key, enabled, query]: each runs only when the person holds the matching right.
  const jobs: [string, boolean, () => Promise<number>][] = [
    ["trainingsMine", !!userId, () => countOf(head("training_status").eq("user_id", userId!).in("status", trainingDue))],
    ["trainingsTeam", !!userId && may("trainings.edit."), () => countOf(head("training_status").neq("user_id", userId!).in("status", trainingDue))],
    ["materialWaiting", may("items.view"), async () => ((await supabaseClient.rpc("items_waiting_tasks")).data as number | null) ?? 0],
    ["stockBelow", may("stock.view"), () => countOf(head("item_stock_overview").eq("is_active", true).eq("below_minimum", true))],
    ["jobReview", may("job_descriptions.edit.all"), () => countOf(head("job_description_versions").eq("status", "submitted"))],
    ["ticketsUnassigned", may("tickets.view.team") || may("tickets.view.all"), () => countOf(head("tickets_overview").in("status", ["open", "in_progress"]).is("assigned_user_id", null))],
    ["lockedAccounts", canManageUsers, () => countOf(head("users").not("locked_at", "is", null))],
  ];
  const results = useQueries({
    queries: jobs.map(([key, enabled, queryFn]) => ({ queryKey: ["home", "glance", key, userId], enabled: enabled && perms.ready, staleTime: STALE, queryFn })),
  });
  const n = (key: string) => results[jobs.findIndex(([k]) => k === key)]?.data;

  const leader = may("tasks.view.team") || may("tasks.view.all");
  const year = dayjs().year();
  const pills: Pill[] = [
    { key: "trainingsMine", label: t("home.glance.trainingsMine"), to: `/people/${userId}`, icon: IconCertificate, count: n("trainingsMine"), danger: true },
    { key: "trainingsTeam", label: t("home.glance.trainingsTeam"), to: "/trainings", icon: IconCertificate, count: n("trainingsTeam"), danger: true },
    { key: "overdue", label: t("home.glance.overdue"), to: `/tasks?${filterQuery([["is_overdue", "eq", true]])}`, icon: IconClockExclamation, count: leader ? counts?.overdue_tasks : undefined, danger: true },
    { key: "blocked", label: t("home.glance.blocked"), to: `/tasks?${filterQuery([["is_blocked", "eq", true]])}`, icon: IconAlertTriangle, count: leader ? counts?.blocked_tasks : undefined },
    { key: "violations", label: t("home.glance.violations"), to: "/leave?tab=violations", icon: IconAlertTriangle, count: may("leave.view.") ? leave?.violation_days : undefined, danger: true },
    { key: "materialWaiting", label: t("home.glance.materialWaiting"), to: `/tasks?${filterQuery([["items_waiting", "gt", "0"]])}`, icon: IconTruckDelivery, count: n("materialWaiting") },
    { key: "stockBelow", label: t("home.glance.stockBelow"), to: "/items?view=stock&below=1", icon: IconPackage, count: n("stockBelow"), danger: true },
    { key: "jobReview", label: t("home.glance.jobReview"), to: "/positions", icon: IconFileText, count: n("jobReview") },
    { key: "ticketsUnassigned", label: t("home.glance.ticketsUnassigned"), to: `/tickets?${filterQuery([["assigned_user_id", "null", true]])}`, icon: IconTicket, count: n("ticketsUnassigned") },
    { key: "lockedAccounts", label: t("home.glance.lockedAccounts"), to: "/admin/users", icon: IconLock, count: n("lockedAccounts") },
  ].filter((p) => (p.count ?? 0) > 0);

  // My leave of the year in three numbers (taken, approved but ahead, waiting for the decision), shown once any is above zero.
  const myLeave = may("leave.view.") && leave ? [Number(leave.my_days_taken), Number(leave.my_days_planned), Number(leave.my_days_requested)] : null;
  const showLeave = !!myLeave && myLeave.some((x) => x > 0);

  if (pills.length === 0 && !away?.length && !showLeave) return null;
  return (
    <section>
      <Typography.Title level={4} style={{ margin: "0 0 12px", fontSize: 18 }}>{t("home.glance.title")}</Typography.Title>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {!!away?.length && <AwayFaces people={away} />}
        {showLeave && <MyLeave year={year} days={myLeave!} />}
        {pills.map((p) => (
          <Link
            key={p.key}
            to={p.to}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, color: token.colorText, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, fontSize: 13 }}
          >
            <p.icon size={16} stroke={1.8} color={p.danger ? CI_RED : token.colorTextSecondary} aria-hidden />
            {p.label}
            <strong style={{ color: p.danger ? CI_RED : token.colorText }}>{p.count}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
};
