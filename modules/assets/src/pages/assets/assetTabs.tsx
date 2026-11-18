// Ported 1:1 from COMPASS (app/src/pages/assets/assetTabs.tsx).
import { useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { Button, Card, Col, Empty, Row, Segmented, Space, Statistic, Table, Tooltip, Typography, theme } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import type { TaskOverviewRow, TicketOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";
import { PriorityTag, StatusTag, TicketTypeTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { PunctualityPanel } from "@rbp/module-task-family/src/components/punctuality.tsx";
import { formatDate } from "@rbp/ui";

const PAGE = 15;

type Filter = "open" | "closed" | "all";

// The tasks of this asset (not of its sub-assets): open by default, finished ones on demand.
export const AssetTasksTab = ({ assetId, onNew }: { assetId: string; onNew?: () => void }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("open");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["asset-tasks-tab", assetId, filter, page],
    queryFn: async () => {
      let q = supabaseClient
        .from("tasks_overview")
        .select("id, task_number, title, status, priority, due_date, is_overdue, assigned_user_name, team_name, completed_at, recurring_task_rule_id", { count: "exact" })
        .eq("asset_id", assetId);
      if (filter === "open") q = q.not("status", "in", "(done,cancelled)").order("due_date", { ascending: true, nullsFirst: false });
      else if (filter === "closed") q = q.in("status", ["done", "cancelled"]).order("completed_at", { ascending: false, nullsFirst: false });
      else q = q.order("created_at", { ascending: false });
      const { data, count, error } = await q.range((page - 1) * PAGE, page * PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as (TaskOverviewRow & { completed_at: string | null; recurring_task_rule_id: string | null })[], count: count ?? 0 };
    },
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Segmented
          value={filter}
          onChange={(v) => { setFilter(v as Filter); setPage(1); }}
          options={[{ value: "open", label: t("assets.filterOpen") }, { value: "closed", label: t("assets.filterClosed") }, { value: "all", label: t("assets.filterAll") }]}
        />
        {onNew && <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>{t("tasks.new")}</Button>}
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={data?.rows}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("assets.noTasks")} /> }}
        pagination={{ current: page, pageSize: PAGE, total: data?.count ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        columns={[
          { title: "#", dataIndex: "task_number", width: 70 },
          { title: t("fields.title"), dataIndex: "title", render: (v: string, r) => <Link to={`/tasks/${r.id}`}>{v}</Link> },
          { title: t("fields.status"), dataIndex: "status", render: (v: string) => <StatusTag status={v} /> },
          { title: t("fields.priority"), dataIndex: "priority", render: (v: string) => <PriorityTag priority={v} /> },
          {
            title: t("fields.dueDate"),
            dataIndex: "due_date",
            render: (v: string | null, r) => (v ? <Typography.Text type={r.is_overdue ? "danger" : undefined}>{formatDate(v)}</Typography.Text> : "—"),
          },
          { title: t("fields.assignee"), render: (_: unknown, r) => r.assigned_user_name ?? r.team_name ?? "—" },
          { title: t("assets.completedAt"), dataIndex: "completed_at", render: (v: string | null) => (v ? formatDate(v) : "—"), responsive: filter === "open" ? [] : ["md"] },
        ]}
      />
    </div>
  );
};

export const AssetTicketsTab = ({ assetId, onNew }: { assetId: string; onNew?: () => void }) => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("open");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["asset-tickets-tab", assetId, filter, page],
    queryFn: async () => {
      let q = supabaseClient
        .from("tickets_overview")
        .select("id, ticket_number, title, type, status, priority, reporter_display_name, assigned_user_name, assigned_team_name, task_id, task_number, created_at", { count: "exact" })
        .eq("asset_id", assetId);
      if (filter === "open") q = q.not("status", "in", "(resolved,closed)");
      else if (filter === "closed") q = q.in("status", ["resolved", "closed"]);
      const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as TicketOverviewRow[], count: count ?? 0 };
    },
  });
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Segmented
          value={filter}
          onChange={(v) => { setFilter(v as Filter); setPage(1); }}
          options={[{ value: "open", label: t("assets.filterOpen") }, { value: "closed", label: t("assets.filterClosed") }, { value: "all", label: t("assets.filterAll") }]}
        />
        {onNew && <Button type="primary" icon={<PlusOutlined />} onClick={onNew}>{t("tickets.new")}</Button>}
      </div>
      <Table
        size="small"
        rowKey="id"
        loading={isLoading}
        dataSource={data?.rows}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("assets.noTickets")} /> }}
        pagination={{ current: page, pageSize: PAGE, total: data?.count ?? 0, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: "max-content" }}
        columns={[
          { title: "#", dataIndex: "ticket_number", width: 70 },
          { title: t("fields.title"), dataIndex: "title", render: (v: string, r) => <Link to={`/tickets/${r.id}`}>{v}</Link> },
          { title: t("fields.type"), dataIndex: "type", render: (v: string) => <TicketTypeTag type={v} /> },
          { title: t("fields.status"), dataIndex: "status", render: (v: string) => <StatusTag status={v} /> },
          { title: t("fields.priority"), dataIndex: "priority", render: (v: string) => <PriorityTag priority={v} /> },
          { title: t("fields.assignee"), render: (_: unknown, r) => r.assigned_user_name ?? r.assigned_team_name ?? "—" },
          { title: t("assets.task"), render: (_: unknown, r) => (r.task_id ? <Link to={`/tasks/${r.task_id}`}>#{r.task_number}</Link> : "—") },
          { title: t("fields.createdAt"), dataIndex: "created_at", render: (v: string) => formatDate(v) },
        ]}
      />
    </div>
  );
};

type WorkOverview = {
  open_tasks: number; overdue_tasks: number; tickets_open: number; tickets_in_progress: number; tickets_converted: number;
  tickets_resolved: number; tickets_closed: number; avg_open_ticket_age_days: number | null; oldest_open_ticket_age_days: number | null;
};
type FlowRow = { period: string; opened: number; resolved: number; avg_hours_to_resolve: number | null };

type Range = "12m" | "year" | "all";

// Statistics of this asset including everything below it: maintenance punctuality, ticket status and flow.
export const AssetStatisticsTab = ({ assetId }: { assetId: string }) => {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const [range, setRange] = useState<Range>("12m");
  const from = range === "12m" ? dayjs().subtract(11, "month").startOf("month") : range === "year" ? dayjs().startOf("year") : dayjs("2000-01-01");
  const fromStr = from.format("YYYY-MM-DD");
  const flowFrom = range === "all" ? dayjs().subtract(23, "month").startOf("month") : from;

  const { data: work } = useQuery({
    queryKey: ["asset-work-overview", assetId],
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("asset_work_overview", { p_asset_id: assetId });
      if (error) throw error;
      const r = (data as any[])[0] ?? {};
      return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : Number(v)])) as WorkOverview;
    },
  });
  const { data: flow } = useQuery({
    queryKey: ["ticket-flow", assetId, flowFrom.format("YYYY-MM-DD")],
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("ticket_flow", { p_from: flowFrom.format("YYYY-MM-DD"), p_to: dayjs().format("YYYY-MM-DD"), p_asset_id: assetId, p_bucket: "month" });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ period: r.period, opened: Number(r.opened), resolved: Number(r.resolved), avg_hours_to_resolve: r.avg_hours_to_resolve == null ? null : Number(r.avg_hours_to_resolve) })) as FlowRow[];
    },
  });

  const ticketTotal = work ? work.tickets_open + work.tickets_in_progress + work.tickets_converted + work.tickets_resolved + work.tickets_closed : 0;
  const statuses = work
    ? ([["open", work.tickets_open], ["in_progress", work.tickets_in_progress], ["converted_to_task", work.tickets_converted], ["resolved", work.tickets_resolved], ["closed", work.tickets_closed]] as const)
    : [];
  const flowMax = Math.max(1, ...(flow ?? []).flatMap((r) => [r.opened, r.resolved]));
  const resolvedRows = (flow ?? []).filter((r) => r.avg_hours_to_resolve != null);
  const days = (h: number) => (h >= 48 ? `${Math.round(h / 24)} ${t("punctuality.days")}` : `${Math.round(h)} h`);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Space wrap>
        <Segmented value={range} onChange={(v) => setRange(v as Range)} options={[{ value: "12m", label: t("statistics.last12") }, { value: "year", label: t("statistics.thisYear") }, { value: "all", label: t("assets.allTime") }]} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("assets.statsScopeHint")}</Typography.Text>
      </Space>

      <Card size="small" title={t("assets.maintenanceTitle")}>
        <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}><Statistic title={t("assets.openTasks")} value={work?.open_tasks ?? 0} /></Col>
          <Col xs={12} md={6}><Statistic title={t("assets.overdueTasks")} value={work?.overdue_tasks ?? 0} valueStyle={work?.overdue_tasks ? { color: token.colorError } : undefined} /></Col>
        </Row>
      </Card>
      <PunctualityPanel scope={{ assetId, from: range === "all" ? null : fromStr }} breakdown breakdownLabel={t("punctuality.series")} title={t("assets.punctualityTitle")} />

      <Card size="small" title={t("assets.ticketsTitle")}>
        {ticketTotal === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("assets.noTickets")} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Row gutter={[16, 8]}>
              {statuses.map(([s, n]) => (
                <Col key={s} xs={12} md={4}><Statistic title={t(`status.${s}`)} value={n} /></Col>
              ))}
              <Col xs={12} md={4}>
                <Statistic title={t("assets.avgOpenAge")} value={work?.avg_open_ticket_age_days ?? "—"} suffix={work?.avg_open_ticket_age_days != null ? t("punctuality.days") : undefined} />
              </Col>
            </Row>
            {flow && flow.length > 0 && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("assets.flowTitle")}</Typography.Text>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", overflowX: "auto", marginTop: 6 }}>
                  {flow.map((r) => (
                    <Tooltip key={r.period} title={`${dayjs(r.period).locale(i18n.language).format("MMMM YYYY")}: ${t("assets.flowTooltip", { opened: r.opened, resolved: r.resolved })}${r.avg_hours_to_resolve != null ? ` · Ø ${days(r.avg_hours_to_resolve)}` : ""}`}>
                      <div style={{ flex: "1 0 34px", maxWidth: 64, textAlign: "center" }}>
                        <div style={{ height: 80, display: "flex", gap: 3, alignItems: "flex-end", justifyContent: "center" }}>
                          <div style={{ width: 14, height: Math.max(r.opened ? 3 : 0, (r.opened / flowMax) * 80), background: token.colorPrimary, borderRadius: 2 }} />
                          <div style={{ width: 14, height: Math.max(r.resolved ? 3 : 0, (r.resolved / flowMax) * 80), background: token.colorTextQuaternary, borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>{dayjs(r.period).locale(i18n.language).format("MMM YY")}</div>
                      </div>
                    </Tooltip>
                  ))}
                </div>
                <Space size={16} style={{ marginTop: 6, fontSize: 12 }}>
                  <span><span style={{ color: token.colorPrimary }}>■</span> {t("assets.opened")}</span>
                  <span><span style={{ color: token.colorTextQuaternary }}>■</span> {t("assets.resolved")}</span>
                  {resolvedRows.length > 0 && <Typography.Text type="secondary">{t("assets.avgResolve")}: {days(resolvedRows.reduce((s, r) => s + r.avg_hours_to_resolve! * r.resolved, 0) / resolvedRows.reduce((s, r) => s + r.resolved, 0))}</Typography.Text>}
                </Space>
              </div>
            )}
          </Space>
        )}
      </Card>
    </Space>
  );
};
