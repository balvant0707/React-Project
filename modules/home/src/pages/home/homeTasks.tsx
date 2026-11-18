// Ported 1:1 from COMPASS (app/src/pages/home/homeTasks.tsx).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Card, Col, Empty, Row, Skeleton, Tabs, Typography, theme as antdTheme } from "antd";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { ClaimTaskButton } from "@rbp/module-task-family/src/components/claimTaskButton.tsx";
import { useTaskRightsFor } from "@rbp/module-tasks/src/hooks/useTaskRights.ts";
import { TaskRow } from "../../components/taskRow";
import { useIsMobile } from "@rbp/ui";
import { useMe } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { CI_RED } from "@rbp/ui";
import type { TaskOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { OPEN_TASK, OPEN_TASK_STATUSES, filterQuery, useCounts } from "@rbp/module-task-family/src/pages/dashboard/widgets.tsx";

// Four short lists on the start page, each with its number: my overdue tasks, my tasks due today, my other open tasks
// and the open tasks of my teams that nobody has taken. The numbers come from dashboard_counts (one pass) except
// "Today", which its own list query counts; a list is only fetched when its number is above zero ("Today" always). A
// tab (a column on a computer) without tasks is left out. The lists never overlap, so the numbers add up: "Coming up" =
// my open tasks minus the overdue ones and today's. Each list shows two tasks (four on a computer) and scrolls inside,
// stopping at the next task.

type TabKey = "overdue" | "today" | "open" | "pool";
const FETCH = 25;

// A list that is `visible` rows high and scrolls inside, snapping to the start of the next row.
const SnapList = ({ visible, children }: { visible: number; children: ReactNode[] }) => {
  const { token } = antdTheme.useToken();
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const rows = Array.from(ref.current?.children ?? []) as HTMLElement[];
    if (rows.length > visible) setHeight(rows.slice(0, visible).reduce((sum, r) => sum + r.offsetHeight, 0));
    else setHeight(undefined);
  }, [children.length, visible]);
  return (
    <div ref={ref} style={{ maxHeight: height, overflowY: height ? "auto" : undefined, scrollSnapType: "y mandatory", overscrollBehavior: "contain" }}>
      {children.map((child, i) => (
        <div key={i} style={{ scrollSnapAlign: "start", padding: "8px 0", borderBottom: i < children.length - 1 ? `1px solid ${token.colorSplit}` : undefined }}>
          {child}
        </div>
      ))}
    </div>
  );
};
const COLUMNS = "id, task_number, task_type_id, title, status, priority, team_id, assigned_user_id, asset_name, due_date, team_name";

export const HomeTasks = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = antdTheme.useToken();
  const isMobile = useIsMobile();
  const perms = usePermissions();
  const { userId, teamIds } = useMe();
  const { data: counts, isLoading } = useCounts();
  const visibleRows = isMobile ? 2 : 4;
  const today = dayjs().format("YYYY-MM-DD");
  const [selected, setSelected] = useState<TabKey>();

  const base = () => supabaseClient.from("tasks_overview").select(COLUMNS, { count: "exact" }).eq("is_initiative", false).not("status", "in", OPEN_TASK);
  const mineFilter = () => base().eq("assigned_user_id", userId!);
  // Today's list counts itself (dashboard_counts has no "today"); the open list leaves today's tasks out.
  const todayList = useQuery({
    queryKey: ["home", "tasks", "today", userId, today],
    enabled: !!userId,
    queryFn: async () => {
      const r = await mineFilter().eq("is_overdue", false).eq("due_date", today).order("created_at").limit(FETCH);
      return { rows: (r.data ?? []) as TaskOverviewRow[], count: r.count ?? 0 };
    },
  });
  const n = {
    overdue: counts?.mine_overdue ?? 0,
    today: todayList.data?.count ?? 0,
    open: Math.max((counts?.mine_open ?? 0) - (counts?.mine_overdue ?? 0) - (todayList.data?.count ?? 0), 0),
    pool: teamIds.length > 0 ? counts?.team_pool ?? 0 : 0,
  };
  // Platform: named as a hook (the platform lint enforces the rules of hooks by name; always called, in the same order).
  const useTaskList = (key: Exclude<TabKey, "today">, enabled: boolean, run: () => PromiseLike<{ data: unknown }>) =>
    useQuery({
      queryKey: ["home", "tasks", key, userId, teamIds, n[key]],
      enabled: enabled && !!userId && n[key] > 0,
      queryFn: async () => ((await run()).data ?? []) as TaskOverviewRow[],
    });
  const overdue = useTaskList("overdue", true, () => mineFilter().eq("is_overdue", true).order("due_date").limit(FETCH));
  const open = useTaskList("open", !!todayList.data, () => mineFilter().eq("is_overdue", false).or(`due_date.is.null,due_date.gt.${today}`).order("due_date", { nullsFirst: false }).limit(FETCH));
  const pool = useTaskList("pool", teamIds.length > 0, () => base().in("team_id", teamIds).is("assigned_user_id", null).order("due_date", { nullsFirst: false }).limit(FETCH));

  // "I take it" where task_rights allows it (pool rows only).
  const rights = useTaskRightsFor((pool.data ?? []).map((r) => r.id));

  if (!perms.ready || !(perms.hasAny("tasks.view.") || perms.hasAny("initiatives.view."))) return null;

  const to = {
    overdue: `/tasks?${filterQuery([["assigned_user_id", "in", [userId ?? ""]], ["is_overdue", "eq", true]])}`,
    today: `/tasks?${filterQuery([["assigned_user_id", "in", [userId ?? ""]], ["status", "in", OPEN_TASK_STATUSES], ["due_date", "gte", today], ["due_date", "lte", today]])}`,
    open: `/tasks?${filterQuery([["assigned_user_id", "in", [userId ?? ""]], ["status", "in", OPEN_TASK_STATUSES]])}`,
    pool: `/tasks?${filterQuery([["assigned_user_id", "null", true], ["team_id", "in", teamIds], ["status", "in", OPEN_TASK_STATUSES]])}`,
  };
  const rows: Record<TabKey, TaskOverviewRow[] | undefined> = { overdue: overdue.data, today: todayList.data?.rows, open: open.data, pool: pool.data };
  const tabs = (["overdue", "today", "open", "pool"] as TabKey[]).filter((k) => n[k] > 0);
  // With nothing at all the section says so.
  const nothing = counts && todayList.data && n.overdue + n.today + n.open + n.pool === 0;
  const current = tabs.includes(selected as TabKey) ? (selected as TabKey) : tabs[0];

  const body = (key: TabKey) => {
    const data = rows[key];
    if (n[key] === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("home.tasks.nothing")} />;
    if (!data) return <Skeleton active paragraph={{ rows: 3 }} />;
    return (
      <>
        <SnapList visible={visibleRows}>
          {data.map((task) => (
            <div key={task.id} role="link" tabIndex={0} onClick={() => navigate(`/tasks/${task.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/tasks/${task.id}`)} style={{ cursor: "pointer" }}>
              <TaskRow
                task={task}
                extra={key === "pool" && rights[task.id]?.claim ? <ClaimTaskButton taskId={task.id} onClaimed={() => void queryClient.invalidateQueries({ queryKey: ["dashboard"] }).then(() => queryClient.invalidateQueries({ queryKey: ["home", "tasks"] }))} /> : undefined}
              />
            </div>
          ))}
        </SnapList>
        {n[key] > data.length && (
          <div style={{ paddingTop: 8 }}>
            <Link to={to[key]}>{t("home.tasks.showAll", { count: n[key] })}</Link>
          </div>
        )}
      </>
    );
  };
  const count = (key: TabKey) => (
    <Badge count={n[key]} showZero overflowCount={999} color={key === "overdue" ? CI_RED : token.colorFillSecondary} style={key === "overdue" ? undefined : { color: token.colorText, boxShadow: "none" }} />
  );
  const label = (key: TabKey) => t(`home.tasks.${key}`);
  const poolOverdue = counts?.pool_overdue ?? 0;

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0, fontSize: 18 }}>{t("home.tasks.title")}</Typography.Title>
        <Link to="/tasks">{t("common.showAll")}</Link>
      </div>
      {isLoading || !counts || !todayList.data ? (
        <Card size="small"><Skeleton active paragraph={{ rows: 3 }} /></Card>
      ) : nothing ? (
        <Card size="small"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("home.tasks.allClear")} /></Card>
      ) : isMobile ? (
        <Card size="small">
          <Tabs
            activeKey={current}
            onChange={(k) => setSelected(k as TabKey)}
            items={tabs.map((key) => ({
              key,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {label(key)} {count(key)}
                </span>
              ),
              children: body(key),
            }))}
          />
          {current === "pool" && poolOverdue > 0 && <Typography.Text type="danger" style={{ fontSize: 12 }}>{t("home.tasks.poolOverdue", { count: poolOverdue })}</Typography.Text>}
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {tabs.map((key) => (
            <Col key={key} xs={24} lg={24 / tabs.length}>
              <Card
                size="small"
                style={{ height: "100%" }}
                title={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    {label(key)} {count(key)}
                  </span>
                }
                extra={<Link to={to[key]}>{t("common.showAll")}</Link>}
              >
                {body(key)}
                {key === "pool" && poolOverdue > 0 && <Typography.Text type="danger" style={{ fontSize: 12 }}>{t("home.tasks.poolOverdue", { count: poolOverdue })}</Typography.Text>}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </section>
  );
};
