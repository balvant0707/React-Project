// Ported 1:1 from COMPASS (app/src/components/punctuality.tsx).
import { Link } from "react-router-dom";
import { Card, Empty, Skeleton, Space, Table, Tooltip, Typography, theme } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  fetchPunctualityBreakdown, fetchPunctualityStats, fetchSeriesRuns, pct, sumStats,
  type Outcome, type PunctualityBreakdownRow, type PunctualityScope, type PunctualityStatsRow,
} from "../lib/punctuality";
import { useUsers } from "@rbp/core";
import { userLabel } from "../lib/domain";
import { formatDate } from "@rbp/ui";

const useOutcomeColors = (): Record<Outcome, string> => {
  const { token } = theme.useToken();
  return { on_time: token.colorSuccess, rescheduled: token.colorWarning, late: token.colorError };
};

type Counts = { total: number; on_time: number; rescheduled: number; late: number };

// One stacked bar: on time / rescheduled / late.
const PunctualityBar = ({ counts, height = 10 }: { counts: Counts; height?: number }) => {
  const colors = useOutcomeColors();
  const { token } = theme.useToken();
  if (!counts.total) return <div style={{ height, borderRadius: height / 2, background: token.colorFillSecondary }} />;
  return (
    <div style={{ display: "flex", height, borderRadius: height / 2, overflow: "hidden", background: token.colorFillSecondary }}>
      {(["on_time", "rescheduled", "late"] as const).map((k) => (counts[k] ? <div key={k} style={{ width: `${(counts[k] / counts.total) * 100}%`, background: colors[k] }} /> : null))}
    </div>
  );
};

// "Last 12: 11 on time, 1 late (avg +2 days)" with the bar underneath.
const PunctualitySummary = ({ counts, avgDaysLate }: { counts: Counts; avgDaysLate: number | null }) => {
  const { t } = useTranslation();
  const colors = useOutcomeColors();
  if (!counts.total) return <Typography.Text type="secondary">{t("punctuality.none")}</Typography.Text>;
  return (
    <div>
      <Space size={16} wrap style={{ marginBottom: 6 }}>
        <Typography.Text strong style={{ fontSize: 20 }}>{pct(counts.on_time + counts.rescheduled, counts.total)} %</Typography.Text>
        <Typography.Text type="secondary">{t("punctuality.ofTotal", { count: counts.total })}</Typography.Text>
        <span><span style={{ color: colors.on_time }}>●</span> {t("punctuality.onTime")} {counts.on_time}</span>
        {counts.rescheduled > 0 && <span><span style={{ color: colors.rescheduled }}>●</span> {t("punctuality.rescheduled")} {counts.rescheduled}</span>}
        <span><span style={{ color: colors.late }}>●</span> {t("punctuality.late")} {counts.late}{counts.late > 0 && avgDaysLate != null ? ` (Ø ${avgDaysLate} ${t("punctuality.days")})` : ""}</span>
      </Space>
      <PunctualityBar counts={counts} />
    </div>
  );
};

// Stacked column per period.
const PunctualityTrend = ({ rows }: { rows: PunctualityStatsRow[] }) => {
  const { t, i18n } = useTranslation();
  const colors = useOutcomeColors();
  const { token } = theme.useToken();
  const max = Math.max(1, ...rows.map((r) => r.total));
  const H = 90;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", overflowX: "auto", paddingBottom: 2 }}>
      {rows.map((r) => (
        <Tooltip
          key={r.period}
          title={`${dayjs(r.period).locale(i18n.language).format("MMMM YYYY")}: ${t("punctuality.tooltipCounts", { total: r.total, onTime: r.on_time, rescheduled: r.rescheduled, late: r.late })}`}
        >
          <div style={{ flex: "1 0 28px", maxWidth: 56, textAlign: "center" }}>
            <div style={{ height: H, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 1 }}>
              {(["late", "rescheduled", "on_time"] as const).map((k) =>
                r[k] ? <div key={k} style={{ height: (r[k] / max) * H, minHeight: 3, background: colors[k], borderRadius: 2 }} /> : null,
              )}
            </div>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginTop: 2 }}>{dayjs(r.period).locale(i18n.language).format("MMM YY")}</div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
};

const PunctualityBreakdownTable = ({ rows, titleLabel }: { rows: PunctualityBreakdownRow[]; titleLabel: string }) => {
  const { t } = useTranslation();
  return (
    <Table<PunctualityBreakdownRow>
      size="small"
      rowKey="group_key"
      dataSource={rows}
      pagination={{ pageSize: 10, hideOnSinglePage: true }}
      scroll={{ x: "max-content" }}
      columns={[
        {
          title: titleLabel,
          dataIndex: "title",
          render: (v: string, r) => <Link to={r.is_series ? `/tasks/${r.last_task_id}` : `/tasks/${r.group_key}`}>{v}</Link>,
        },
        { title: t("punctuality.done"), dataIndex: "total", align: "right", sorter: (a, b) => a.total - b.total },
        { title: t("punctuality.share"), width: 160, render: (_: unknown, r) => <PunctualityBar counts={r} height={8} /> },
        { title: `% ${t("punctuality.late")}`, align: "right", defaultSortOrder: "descend", sorter: (a, b) => pct(a.late, a.total) - pct(b.late, b.total), render: (_: unknown, r) => `${pct(r.late, r.total)} %` },
        { title: t("punctuality.avgDaysLate"), dataIndex: "avg_days_late", align: "right", render: (v: number | null) => v ?? "–" },
        { title: t("punctuality.lastDone"), dataIndex: "last_completed_on", render: (v: string) => formatDate(v) },
      ]}
    />
  );
};

// Summary + trend (last 12 months) + breakdown for one scope: an asset, an initiative, a series, a team ...
export const PunctualityPanel = ({
  scope,
  trend = true,
  breakdown = false,
  breakdownLabel,
  title,
}: {
  scope: PunctualityScope;
  trend?: boolean;
  breakdown?: boolean;
  breakdownLabel?: string;
  title?: string;
}) => {
  const { t } = useTranslation();
  const key = JSON.stringify(scope);
  const { data: all, isLoading } = useQuery({ queryKey: ["punctuality", "all", key], queryFn: () => fetchPunctualityStats(scope, "all") });
  const from = scope.from ?? dayjs().subtract(11, "month").startOf("month").format("YYYY-MM-DD");
  const { data: months } = useQuery({
    queryKey: ["punctuality", "month", key],
    enabled: trend,
    queryFn: () => fetchPunctualityStats({ ...scope, from }, "month"),
  });
  const { data: rows } = useQuery({ queryKey: ["punctuality", "breakdown", key], enabled: breakdown, queryFn: () => fetchPunctualityBreakdown(scope) });

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;
  const sum = sumStats(all ?? []);
  return (
    <Card size="small" title={title ?? t("punctuality.title")}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>{t("punctuality.hint")}</Typography.Paragraph>
      {sum.total === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("punctuality.none")} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <PunctualitySummary counts={sum} avgDaysLate={sum.avg_days_late} />
          {trend && months && months.length > 1 && <PunctualityTrend rows={months} />}
          {breakdown && rows && rows.length > 0 && <PunctualityBreakdownTable rows={rows} titleLabel={breakdownLabel ?? t("punctuality.series")} />}
        </Space>
      )}
    </Card>
  );
};

// History of one series: one dot per past run (oldest left), colour = outcome, tooltip = the details.
export const SeriesHistory = ({ ruleId }: { ruleId: string }) => {
  const { t } = useTranslation();
  const colors = useOutcomeColors();
  const { data: users } = useUsers();
  const { data: runs, isLoading } = useQuery({ queryKey: ["series-runs", ruleId], queryFn: () => fetchSeriesRuns(ruleId, 24) });
  if (isLoading) return <Skeleton active paragraph={{ rows: 1 }} />;
  if (!runs?.length) return <Typography.Text type="secondary">{t("punctuality.noRuns")}</Typography.Text>;
  const counts = {
    total: runs.length,
    on_time: runs.filter((r) => r.outcome === "on_time").length,
    rescheduled: runs.filter((r) => r.outcome === "rescheduled").length,
    late: runs.filter((r) => r.outcome === "late").length,
  };
  const lateRuns = runs.filter((r) => r.outcome === "late");
  const avgLate = lateRuns.length ? Math.round((lateRuns.reduce((s, r) => s + r.days_late, 0) / lateRuns.length) * 10) / 10 : null;
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("punctuality.lastRuns", { count: runs.length })}</Typography.Text>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 10px" }}>
        {runs.map((r) => (
          <Tooltip
            key={r.task_id}
            title={
              <div>
                <div>#{r.task_number} · {t(`punctuality.outcome.${r.outcome}`)}{r.outcome === "late" ? ` (+${r.days_late} ${t("punctuality.days")})` : ""}</div>
                <div>{t("fields.dueDate")}: {formatDate(r.due_date ?? r.original_due_date)}{r.due_date && r.due_date !== r.original_due_date ? ` (${t("punctuality.originally")} ${formatDate(r.original_due_date)})` : ""}</div>
                <div>{t("punctuality.doneOn")}: {formatDate(r.completed_on)}</div>
                {r.assigned_user_id && <div>{userLabel(users?.find((u) => u.id === r.assigned_user_id))}</div>}
              </div>
            }
          >
            <Link to={`/tasks/${r.task_id}`} aria-label={`#${r.task_number}`} style={{ width: 16, height: 16, borderRadius: "50%", background: colors[r.outcome], display: "inline-block" }} />
          </Tooltip>
        ))}
      </div>
      <PunctualitySummary counts={counts} avgDaysLate={avgLate} />
    </div>
  );
};
