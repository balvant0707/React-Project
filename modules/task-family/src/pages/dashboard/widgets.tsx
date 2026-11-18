// Ported 1:1 from COMPASS (app/src/pages/dashboard/widgets.tsx).
import { useDecisionCount } from "../../hooks/useDecisions";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Col, Row, Skeleton, Tooltip, Typography, theme as antdTheme } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { TASK_STATUSES } from "../../lib/domain";
import { useMe } from "@rbp/core";
import { useIsMobile } from "@rbp/ui";
import { usePermissions } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { Sparkline, sparkDeltaTone, type SparkTone } from "../../components/sparkline";
import {
  IconAlertTriangle, IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconBeach, IconBuildingFactory2, IconCalendarCheck,
  IconCalendarEvent, IconCircleCheck, IconClockExclamation, IconListCheck, IconLock, IconBuildingWarehouse, IconPackage, IconScale, IconTicket, IconTruckDelivery, IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { IconTile } from "@rbp/ui";
import { CI_RED, STATUS_COLOR, usePalette, type ColorKey } from "@rbp/ui";

export const OPEN_TASK = "(done,cancelled)";
export const OPEN_TASK_STATUSES = TASK_STATUSES.filter((x) => x !== "done" && x !== "cancelled");
const DUE_SOON_DAYS = 7;

// URL of a list page with Refine's synced filters, so a tap on a tile opens the matching list.
export const filterQuery = (filters: [string, string, string | string[] | boolean][]) =>
  filters
    .flatMap(([field, operator, value], i) => [
      `filters[${i}][field]=${field}`,
      `filters[${i}][operator]=${operator}`,
      ...(Array.isArray(value) ? value.map((v, k) => `filters[${i}][value][${k}]=${v}`) : [`filters[${i}][value]=${value}`]),
    ])
    .join("&");

const TREND_WEEKS = 12;
// Both calls are one pass over the data each (RPC dashboard_counts / dashboard_trends): the row policy of the tasks costs
// per row, so one query per tile would pay it again and again.
const STALE = 120_000;

type Counts = { open_tasks: number; overdue_tasks: number; blocked_tasks: number; due_soon_mine: number; done_recent: number; team_pool: number; open_tickets: number; mine_open: number; mine_overdue: number; pool_overdue: number };
export const useCounts = () =>
  useQuery({
    queryKey: ["dashboard", "counts"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("dashboard_counts", { p_days: DUE_SOON_DAYS });
      if (error) throw error;
      return ((data as Counts[] | null)?.[0] ?? null) as Counts | null;
    },
  });

// Weekly values of the sparklines, computed from the timestamps.
type TrendMetric = "done" | "open_tasks" | "overdue_tasks" | "open_tickets";
const useTrends = (enabled: boolean) =>
  useQuery({
    queryKey: ["dashboard", "trends", dayjs().format("YYYY-MM-DD")],
    enabled,
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("dashboard_trends", { p_weeks: TREND_WEEKS });
      if (error) throw error;
      // A plain object, not a Map: the query cache is persisted as JSON.
      const byMetric: Record<string, { day: string; value: number }[]> = {};
      for (const r of (data ?? []) as { metric: string; day: string; value: number }[]) (byMetric[r.metric] ??= []).push({ day: r.day, value: r.value });
      for (const rows of Object.values(byMetric)) rows.sort((a, b) => a.day.localeCompare(b.day));
      return byMetric;
    },
  });

// A big number that opens the matching filtered list, optionally with its trend; `hint` explains what is counted, a
// loading state shows until the number arrives. `danger`: a number above 0 needs attention. `tone` says whether a
// change is good or bad; `lineColor` is the colour of what is counted.
const BigNumber = ({ title, value, to, danger, trend, tone = "neutral", hint, icon, lineColor }: { title: string; value: number | undefined; to: string; danger?: boolean; trend?: TrendMetric; tone?: SparkTone; hint?: string; icon: Icon; lineColor?: ColorKey }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const { swatch } = usePalette();
  const navigate = useNavigate();
  const mobile = useIsMobile();
  // The phone tile draws no trend line, so it does not ask for the trends either.
  const { data: trends } = useTrends(!!trend && !mobile);
  const points = trend ? trends?.[trend] : undefined;
  const delta = points && points.length > 1 ? points[points.length - 1].value - points[0].value : null;
  const alert = !!danger && !!value;
  const deltaTone = delta === null ? "neutral" : sparkDeltaTone(delta, tone);
  const deltaColor = deltaTone === "good" ? swatch("green").fg : deltaTone === "bad" ? swatch("red").fg : token.colorTextSecondary;
  const Arrow = delta === null || delta === 0 ? IconArrowRight : delta > 0 ? IconArrowUpRight : IconArrowDownRight;
  // Phone: a small tile in the swipe row (icon, number, one line of title); the trend line and its text stay on the computer.
  if (mobile) {
    return (
      <Col flex="0 0 128px" style={{ scrollSnapAlign: "start" }}>
        <Card size="small" hoverable role="link" tabIndex={0} onClick={() => navigate(to)} onKeyDown={(e) => e.key === "Enter" && navigate(to)} style={{ height: "100%" }} styles={{ body: { padding: "8px 10px" } }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconTile icon={icon} color={alert ? "red" : "navy"} size={24} />
            {value === undefined ? (
              <Skeleton.Input active size="small" style={{ width: 36, minWidth: 36 }} />
            ) : (
              <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: alert ? token.colorError : token.colorText }}>{value}</span>
            )}
          </div>
          <Typography.Text type="secondary" ellipsis={{ tooltip: false }} style={{ display: "block", fontSize: 12, marginTop: 4 }}>
            {title}
          </Typography.Text>
        </Card>
      </Col>
    );
  }
  return (
    <Col xs={12} md={8} xl={6}>
      <Card
        size="small"
        hoverable
        role="link"
        tabIndex={0}
        onClick={() => navigate(to)}
        onKeyDown={(e) => e.key === "Enter" && navigate(to)}
        style={{ height: "100%" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconTile icon={icon} color={alert ? "red" : "navy"} size={34} />
          <Typography.Text type="secondary" style={{ fontWeight: 500, lineHeight: 1.3 }}>
            {title}
            {hint && (
              <Tooltip title={hint}>
                <InfoCircleOutlined style={{ marginLeft: 6, fontSize: 12 }} onClick={(e) => e.stopPropagation()} />
              </Tooltip>
            )}
          </Typography.Text>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {value === undefined ? (
            <Skeleton.Input active size="small" style={{ width: 56, minWidth: 56 }} />
          ) : (
            <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: alert ? token.colorError : token.colorText }}>{value}</span>
          )}
          {delta !== null && (
            // Colour alone must not carry the message: the change is written out.
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600, color: deltaColor }}>
              <Arrow size={14} stroke={2.4} aria-hidden />
              {t("dashboard.trendDelta", { change: delta > 0 ? `+${delta}` : String(delta), weeks: TREND_WEEKS })}
            </span>
          )}
        </div>
        {points && points.length > 1 && (
          <Sparkline values={points.map((p) => p.value)} labels={points.map((p) => formatDate(p.day))} label={t("dashboard.trend", { weeks: TREND_WEEKS })} color={alert ? CI_RED : lineColor ? swatch(lineColor).dot : undefined} wide />
        )}
      </Card>
    </Col>
  );
};

const OpenTasks = () => {
  const { t } = useTranslation();
  const { data } = useCounts();
  return <BigNumber icon={IconListCheck} hint={t("dashboard.hints.openTasks")} title={t("dashboard.openTasks")} trend="open_tasks" value={data?.open_tasks} to={`/tasks?${filterQuery([["status", "in", OPEN_TASK_STATUSES]])}`} />;
};

const OverdueTasks = () => {
  const { t } = useTranslation();
  const { data } = useCounts();
  return <BigNumber icon={IconClockExclamation} hint={t("dashboard.hints.overdueTasks")} title={t("dashboard.overdueTasks")} trend="overdue_tasks" tone="down-good" value={data?.overdue_tasks} danger to={`/tasks?${filterQuery([["is_overdue", "eq", true]])}`} />;
};

const DueSoon = () => {
  const { t } = useTranslation();
  const { userId } = useMe();
  const { data } = useCounts();
  const from = dayjs().format("YYYY-MM-DD");
  const to = dayjs().add(DUE_SOON_DAYS, "day").format("YYYY-MM-DD");
  return (
    <BigNumber
      icon={IconCalendarEvent}
      hint={t("dashboard.hints.dueSoon")}
      title={t("dashboard.dueSoon", { days: DUE_SOON_DAYS })}
      value={data?.due_soon_mine}
      to={`/tasks?${filterQuery([["assigned_user_id", "in", [userId ?? ""]], ["status", "in", OPEN_TASK_STATUSES], ["due_date", "gte", from], ["due_date", "lte", to]])}`}
    />
  );
};

const DoneThisWeek = () => {
  const { t } = useTranslation();
  const { data } = useCounts();
  return <BigNumber icon={IconCircleCheck} lineColor={STATUS_COLOR.done} hint={t("dashboard.hints.doneThisWeek")} title={t("dashboard.doneThisWeek")} trend="done" tone="up-good" value={data?.done_recent} to={`/tasks?${filterQuery([["status", "in", ["done"]]])}&sorters[0][field]=completed_at&sorters[0][order]=desc`} />;
};

// Tasks that wait for a prerequisite subtask (still counted as open, and as overdue when their due date has passed).
const BlockedTasks = () => {
  const { t } = useTranslation();
  const { data } = useCounts();
  return <BigNumber icon={IconLock} hint={t("dashboard.hints.blockedTasks")} title={t("dashboard.blockedTasks")} value={data?.blocked_tasks} to={`/tasks?${filterQuery([["is_blocked", "eq", true]])}`} />;
};

// Open tasks of my teams without a person ("I take it" waits in the list the tile opens).
const TeamPool = () => {
  const { t } = useTranslation();
  const { teamIds } = useMe();
  const { data: counts } = useCounts();
  if (!teamIds.length) return null;
  const to = `/tasks?${filterQuery([["assigned_user_id", "null", true], ["team_id", "in", teamIds], ["status", "in", OPEN_TASK_STATUSES]])}`;
  return <BigNumber icon={IconUsers} hint={t("dashboard.hints.teamPool")} title={t("dashboard.teamPool")} value={counts?.team_pool} to={to} />;
};

// Assets whose next open task is overdue (the same condition as the chip "Overdue" on the asset list).
const AssetsOverdue = () => {
  const { t } = useTranslation();
  const today = dayjs().format("YYYY-MM-DD");
  const { data } = useQuery({
    queryKey: ["dashboard", "count", "assets-overdue", today],
    queryFn: async () => (await supabaseClient.from("assets_overview").select("id", { count: "exact", head: true }).eq("is_grouping", false).lt("next_task_due_date", today)).count ?? 0,
  });
  return <BigNumber icon={IconBuildingFactory2} hint={t("dashboard.hints.assetsOverdue")} title={t("dashboard.assetsOverdue")} value={data} danger to={`/assets?view=flat&${filterQuery([["is_grouping", "eq", false], ["next_task_due_date", "lt", today]])}`} />;
};

// Items kept in stock whose total is below the minimum (item_stock_overview is null without stock.view).
const BelowMinimumStock = () => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["dashboard", "count", "stock-below"],
    queryFn: async () => (await supabaseClient.from("item_stock_overview").select("item_id", { count: "exact", head: true }).eq("is_active", true).eq("below_minimum", true)).count ?? 0,
  });
  return <BigNumber icon={IconPackage} hint={t("dashboard.hints.stockBelow")} title={t("stock.belowMinimumWidget")} value={data} danger to="/items?view=stock&below=1" />;
};

// Active items kept in stock (stock_managed): the size of the stock list.
const StockManagedItems = () => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["dashboard", "count", "stock-managed"],
    queryFn: async () => (await supabaseClient.from("item_stock_overview").select("item_id", { count: "exact", head: true }).eq("is_active", true)).count ?? 0,
  });
  return <BigNumber icon={IconBuildingWarehouse} hint={t("dashboard.hints.stockManaged")} title={t("stock.managedWidget")} value={data} to="/items?view=stock" />;
};

// Open tasks that wait for material that has not arrived (RPC items_waiting_tasks, the condition of
// tasks_overview.items_waiting); the tile opens exactly these tasks.
const MaterialWaiting = () => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["dashboard", "count", "material-waiting"],
    queryFn: async () => {
      const { data: n, error } = await supabaseClient.rpc("items_waiting_tasks");
      if (error) throw error;
      return (n as number | null) ?? 0;
    },
  });
  return <BigNumber icon={IconTruckDelivery} hint={t("dashboard.hints.materialWaiting")} title={t("items.waitingWidget")} value={data} to={`/tasks?${filterQuery([["items_waiting", "gt", "0"], ["status", "in", OPEN_TASK_STATUSES]])}`} />;
};

// Leave (~/maintenance_tool/docs/leave.md): all tiles from one RPC, like the task numbers.
type LeaveCounts = { pending_decisions: number; away_today: number; violation_days: number; my_days_taken: number; my_days_planned: number; my_days_requested: number };
export const useLeaveCounts = () =>
  useQuery({
    queryKey: ["dashboard", "leave-counts"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_dashboard_counts");
      if (error) throw error;
      return ((data as LeaveCounts[] | null)?.[0] ?? null) as LeaveCounts | null;
    },
  });

const Decisions = () => {
  const { t } = useTranslation();
  const { data } = useDecisionCount();
  // Only people something waits for get this tile.
  if (!data) return null;
  return <BigNumber icon={IconScale} hint={t("dashboard.hints.decisions")} title={t("dashboard.decisions")} value={data} danger to="/decisions" />;
};

const LeaveAwayToday = () => {
  const { t } = useTranslation();
  const { data } = useLeaveCounts();
  return <BigNumber icon={IconBeach} hint={t("dashboard.hints.leaveAwayToday")} title={t("dashboard.leaveAwayToday")} value={data?.away_today} to="/leave" />;
};

// Team days over the absence limit in the next six months; only for the supervisors above and HR.
const LeaveViolationDays = () => {
  const { t } = useTranslation();
  const { data } = useLeaveCounts();
  if (data && data.violation_days === 0) return null;
  return <BigNumber icon={IconAlertTriangle} hint={t("dashboard.hints.leaveViolations")} title={t("dashboard.leaveViolations")} value={data?.violation_days} danger to="/leave?tab=violations" />;
};

const LeaveMyDays = () => {
  const { t } = useTranslation();
  const { data } = useLeaveCounts();
  // Every approved day of the year, taken or still ahead.
  const taken = data ? Number(data.my_days_taken) + Number(data.my_days_planned) : undefined;
  return (
    <BigNumber
      icon={IconCalendarCheck}
      hint={t("dashboard.hints.leaveMyDays", { requested: data?.my_days_requested ?? 0 })}
      title={t("dashboard.leaveMyDays", { year: dayjs().year() })}
      value={taken}
      to="/leave?tab=mine"
    />
  );
};

const OpenTickets = () => {
  const { t } = useTranslation();
  const { data } = useCounts();
  return <BigNumber icon={IconTicket} hint={t("dashboard.hints.openTickets")} title={t("dashboard.openTickets")} trend="open_tickets" tone="down-good" value={data?.open_tickets} to={`/tickets?${filterQuery([["status", "in", ["open", "in_progress"]]])}`} />;
};

// One entry per dashboard widget. `anyOf`: the widget shows when the user holds at least one literal starting with one of
// these prefixes (empty = everybody), so nobody sees a widget for a module they may not open. A widget fetches only
// when it is mounted, i.e. when it passes this check.
type DashboardWidget = { id: string; anyOf: string[]; render: () => ReactNode };
const TASKS = ["tasks.view.", "initiatives.view."];
const NUMBER_WIDGETS: DashboardWidget[] = [
  { id: "teamPool", anyOf: TASKS, render: () => <TeamPool key="teamPool" /> },
  { id: "dueSoon", anyOf: TASKS, render: () => <DueSoon key="dueSoon" /> },
  { id: "openTasks", anyOf: TASKS, render: () => <OpenTasks key="openTasks" /> },
  { id: "blockedTasks", anyOf: TASKS, render: () => <BlockedTasks key="blockedTasks" /> },
  { id: "overdueTasks", anyOf: TASKS, render: () => <OverdueTasks key="overdueTasks" /> },
  { id: "openTickets", anyOf: ["tickets.view."], render: () => <OpenTickets key="openTickets" /> },
  { id: "decisions", anyOf: [], render: () => <Decisions key="decisions" /> },
  { id: "leaveViolations", anyOf: ["leave.view."], render: () => <LeaveViolationDays key="leaveViolations" /> },
  { id: "leaveAwayToday", anyOf: ["leave.view."], render: () => <LeaveAwayToday key="leaveAwayToday" /> },
  { id: "leaveMyDays", anyOf: ["leave.view."], render: () => <LeaveMyDays key="leaveMyDays" /> },
  { id: "doneThisWeek", anyOf: TASKS, render: () => <DoneThisWeek key="doneThisWeek" /> },
];

// The row of big numbers (with the trend lines) above the task list: a tile shows when the user holds a literal of its
// module, so nobody sees one for a module they may not open.
const NumberRow = ({ widgets }: { widgets: DashboardWidget[] }) => {
  const perms = usePermissions();
  const mobile = useIsMobile();
  if (!perms.ready) return null;
  const visible = (w: DashboardWidget) => w.anyOf.length === 0 || w.anyOf.some((prefix) => perms.hasAny(prefix));
  // Phone: one row you swipe sideways (two tiles in view) instead of a tall stack.
  return (
    <Row gutter={[mobile ? 12 : 16, 16]} wrap={!mobile} style={mobile ? { marginBottom: 8, overflowX: "auto", scrollSnapType: "x proximity", paddingBottom: 4 } : { marginBottom: 16 }}>
      {widgets.filter(visible).map((w) => w.render())}
    </Row>
  );
};
export const DashboardNumbers = () => <NumberRow widgets={NUMBER_WIDGETS} />;
export const ItemNumbers = () => <NumberRow widgets={ITEM_WIDGETS} />;

// The numbers above the asset list.
const ASSET_WIDGETS: DashboardWidget[] = [
  { id: "assetsOverdue", anyOf: ["assets.view."], render: () => <AssetsOverdue key="assetsOverdue" /> },
];
export const AssetNumbers = () => <NumberRow widgets={ASSET_WIDGETS} />;

// The numbers above the items list (same tiles and rules as the ones above the task list).
const ITEM_WIDGETS: DashboardWidget[] = [
  { id: "stockBelowMinimum", anyOf: ["stock.view"], render: () => <BelowMinimumStock key="stockBelowMinimum" /> },
  { id: "stockManaged", anyOf: ["stock.view"], render: () => <StockManagedItems key="stockManaged" /> },
  { id: "materialWaiting", anyOf: ["items.view"], render: () => <MaterialWaiting key="materialWaiting" /> },
];
