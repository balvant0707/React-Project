// Ported 1:1 from the NPM tool (app/src/pages/hullEvents/statusChart.tsx).
import { useMemo, useRef, useState } from "react";
import { useList } from "@rbp/core";
import type { CrudFilter } from "@rbp/core";
import { Card, DatePicker, Segmented, Spin, Empty } from "antd";
import { AppColumn, monthAxisLabels, monthsForAxisLabel } from "../../utils/chartDefaults";
import { FullWidthChart } from "../../components/fullWidthChart";
import dayjs, { type Dayjs } from "dayjs";
import { HULL_EVENT_STATUS_OPTIONS, HULL_EVENT_STATUS_HEX } from "./statusOptions";

const { RangePicker } = DatePicker;

type EventRow = { event_date: string | null; status: string | null; count: number };
type ChartDatum = { month: string; status: string; count: number };
type LitresRow = { event_date: string | null; opportunity: number | string | null; ordered: number | string | null };
type LitresDatum = { month: string; kind: "Opportunity" | "Ordered"; litres: number };

// Litres mode (hull_events_overview.opportunity_litres, 20261025100000 / ordered_litres, 20261005120000): opportunity = the
// stored litres of the event (typed, imported, or taken over from an approved specification); ordered = litres on the
// hull event's orders. The mode is switched off in the toggle (LITRES_MODE_ENABLED) until opportunity_litres is filled by
// the import; flip the constant to bring it back.
const LITRES_MODE_ENABLED = false;
const LITRES_KINDS = ["Opportunity", "Ordered"] as const;
const LITRES_COLORS = ["#4f6ef7", "#45c28a"];
type ChartMode = "count" | "litres";

// "Not set" is an ordinary status option (the column is not null).
const STATUS_DOMAIN = HULL_EVENT_STATUS_OPTIONS.map((o) => o.value);
const STATUS_RANGE = STATUS_DOMAIN.map((s) => HULL_EVENT_STATUS_HEX[s] ?? "#d9d9d9");

// Stacked bar chart of Hull Events by status, grouped by month (event_date
// is always the 1st of its month - see the migration comment on that
// column). filters is the Hull Events list's own currently-active Refine
// filters, forwarded here so this chart always reflects whatever the list
// below it is showing; the month range (see range below) is applied on top
// of that. Any status/event_date filter coming from the
// list's own selection state (see selectedStatuses/selectedMonths below) is
// deliberately dropped before it reaches this chart's own query - clicking
// a series or a month label filters the list below, but the chart itself
// always shows every status/month side by side (dimming the non-selected
// ones instead), otherwise clicking one would immediately collapse the
// chart down to just that with nothing left to click to get back.
//
// The selection props are optional: a host with no list underneath to
// filter (the company overview) passes only `filters`, and the chart then
// ignores clicks instead of toggling anything.
//
// range/onRangeChange make the month range controlled: the Hull Events list
// passes the range of its own Event Date chip, so the picker here and the
// list below always cover the same period. Without them (company overview)
// the range is local state.
export const DEFAULT_CHART_RANGE = (): [Dayjs, Dayjs] => [
  dayjs().subtract(6, "month").startOf("month"),
  dayjs().add(12, "month").startOf("month"),
];

export const HullEventsStatusChart = ({
  filters,
  selectedStatuses = [],
  onToggleStatus,
  selectedMonths = [],
  onToggleMonth,
  onToggleMonths,
  range: controlledRange,
  onRangeChange,
}: {
  filters: CrudFilter[];
  selectedStatuses?: string[];
  onToggleStatus?: (status: string) => void;
  selectedMonths?: string[];
  onToggleMonth?: (month: string) => void;
  onToggleMonths?: (months: string[]) => void;
  range?: [Dayjs, Dayjs];
  onRangeChange?: (range: [Dayjs, Dayjs]) => void;
}) => {
  const [localRange, setLocalRange] = useState<[Dayjs, Dayjs]>(DEFAULT_CHART_RANGE);
  const range = controlledRange ?? localRange;
  const setRange = onRangeChange ?? setLocalRange;

  const [mode, setMode] = useState<ChartMode>("count");

  const chartFilters = useMemo(
    () => filters.filter((f) => !("field" in f && (f.field === "status" || f.field === "event_date"))),
    [filters],
  );

  // Grouped on the server (PostgREST aggregate: id.count(), not a bare
  // count() - see 20260921130000_enable_postgrest_aggregates.sql) instead of
  // fetching every matching hull event and tallying here - with 10k+ hull
  // events, a wide enough date range could plausibly exceed PostgREST's
  // 1000-row response cap and silently undercount the chart. event_date is
  // always the 1st of its month (see the comment above), so grouping by the
  // raw column already groups by month - no separate truncation needed.
  // pageSize covers up to 1000 distinct (month, status) pairs, far more than
  // this chart's date range × status count will ever produce.
  const rangeFilters: CrudFilter[] = [
    ...chartFilters,
    { field: "event_date", operator: "gte", value: range[0].format("YYYY-MM-DD") },
    { field: "event_date", operator: "lt", value: range[1].add(1, "month").format("YYYY-MM-DD") },
  ];
  const { result, query } = useList<EventRow>({
    resource: "hull_events_overview",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    meta: { select: "event_date,status,id.count()" },
    filters: rangeFilters,
    queryOptions: { enabled: mode === "count" },
  });
  // Summed on the server like the count (a month has at most one row here: no status in the grouping).
  const { result: litresResult, query: litresQuery } = useList<LitresRow>({
    resource: "hull_events_overview",
    pagination: { mode: "server", currentPage: 1, pageSize: 1000 },
    meta: { select: "event_date,opportunity:opportunity_litres.sum(),ordered:ordered_litres.sum()" },
    filters: rangeFilters,
    queryOptions: { enabled: mode === "litres" },
  });

  const chartData = useMemo(() => {
    const buckets = new Map<string, Map<string, number>>();
    for (const row of result.data) {
      if (!row.event_date) continue;
      const month = dayjs(row.event_date).format("YYYY-MM");
      const status = row.status ?? "Not set";
      if (!buckets.has(month)) buckets.set(month, new Map());
      const byStatus = buckets.get(month)!;
      byStatus.set(status, (byStatus.get(status) ?? 0) + Number(row.count));
    }

    const rows: ChartDatum[] = [];
    for (let m = range[0].clone(); m.isBefore(range[1].add(1, "month")); m = m.add(1, "month")) {
      const monthKey = m.format("YYYY-MM");
      const byStatus = buckets.get(monthKey);
      if (!byStatus || byStatus.size === 0) {
        rows.push({ month: monthKey, status: "Not set", count: 0 });
      } else {
        for (const [status, count] of byStatus) rows.push({ month: monthKey, status, count });
      }
    }
    return rows;
  }, [result.data, range]);

  const litresData = useMemo(() => {
    const byMonth = new Map<string, { Opportunity: number; Ordered: number }>();
    for (const row of litresResult.data ?? []) {
      if (!row.event_date) continue;
      const month = dayjs(row.event_date).format("YYYY-MM");
      const bucket = byMonth.get(month) ?? { Opportunity: 0, Ordered: 0 };
      bucket.Opportunity += Number(row.opportunity ?? 0);
      bucket.Ordered += Number(row.ordered ?? 0);
      byMonth.set(month, bucket);
    }
    const rows: LitresDatum[] = [];
    for (let m = range[0].clone(); m.isBefore(range[1].add(1, "month")); m = m.add(1, "month")) {
      const monthKey = m.format("YYYY-MM");
      const bucket = byMonth.get(monthKey) ?? { Opportunity: 0, Ordered: 0 };
      for (const kind of LITRES_KINDS) rows.push({ month: monthKey, kind, litres: bucket[kind] });
    }
    return rows;
  }, [litresResult.data, range]);

  // Labels thin out with the range (months -> quarters -> years); the bars stay monthly. A quarter/year label
  // stands for all the months it covers: clicking it toggles them together, and it is bold when all are selected.
  const allMonths = useMemo(() => [...new Set(chartData.map((d) => d.month))], [chartData]);
  const monthAxisProps = useMemo(() => {
    const { grain: _grain, ...props } = monthAxisLabels(allMonths);
    return {
      ...props,
      labelFontWeight: (d: string) => {
        const covered = monthsForAxisLabel(props.labelFormatter(d), allMonths);
        return covered.length > 0 && covered.every((m) => selectedMonths.includes(m)) ? 700 : 400;
      },
    };
  }, [allMonths, selectedMonths]);

  // Month selection from a clicked axis label: one month, or every month a quarter/year label covers.
  // The chart's onEvent handler is bound once and never rebinds, so it reads the current months through a ref.
  const allMonthsRef = useRef(allMonths);
  allMonthsRef.current = allMonths;
  const toggleLabelMonths = (text: string) => {
    const covered = monthsForAxisLabel(text, allMonthsRef.current);
    if (covered.length === 1 && /^\d{4}-\d{2}$/.test(text)) onToggleMonth?.(covered[0]);
    else if (covered.length > 0) onToggleMonths?.(covered);
  };

  const hasData = mode === "count" ? chartData.some((d) => d.count > 0) : litresData.some((d) => d.litres > 0);

  // React StrictMode (dev only) double-mounts this component, and each
  // mount's own AppColumn ends up with a live onEvent listener of its own -
  // both fire, as separate event objects, for the same physical click. Since
  // every duplicate firing for one physical click happens synchronously
  // within the same browser event-dispatch turn, a Set that's cleared on the
  // next microtask dedupes exactly "the same click", with no guessed time
  // window that could either double-fire under load or swallow a genuine
  // fast second click.
  const handledThisTickRef = useRef<Set<string> | null>(null);

  return (
    <Card
      title={mode === "count" ? "Hull Events by status" : "Litres opportunity and ordered"}
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        <>
          <Segmented<ChartMode>
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: "count", label: "Events" },
              { value: "litres", label: "Litres", disabled: !LITRES_MODE_ENABLED },
            ]}
            style={{ marginRight: 12 }}
          />
          <RangePicker
            picker="month"
            value={range}
            allowClear={false}
            onChange={(value) => {
              if (value?.[0] && value?.[1]) setRange([value[0], value[1]]);
            }}
          />
        </>
      }
    >
      <Spin spinning={mode === "count" ? query.isFetching : litresQuery.isFetching}>
        {hasData && mode === "litres" ? (
          <FullWidthChart>
            {(width) => (
              <AppColumn
                width={width}
                autoFit={false}
                data={litresData}
                xField="month"
                yField="litres"
                colorField="kind"
                group
                height={260}
                scale={{ color: { domain: [...LITRES_KINDS], range: LITRES_COLORS } }}
                axis={{ x: monthAxisProps }}
                tooltip={{ items: [{ channel: "y", valueFormatter: (v: number) => `${Number(v).toLocaleString()} L` }] }}
                style={{ fillOpacity: (datum: LitresDatum) => (selectedMonths.length === 0 || selectedMonths.includes(datum.month) ? 1 : 0.25) }}
                onEvent={(_chart, event) => {
                  if (event?.type !== "click" || !(onToggleMonth || onToggleMonths)) return;
                  const attrs = event.target?.attributes as Record<string, unknown> | undefined;
                  if (typeof attrs?.class === "string" && attrs.class.includes("axis-label-item") && typeof attrs.text === "string" && monthsForAxisLabel(attrs.text, allMonthsRef.current).length > 0) {
                    const text = attrs.text;
                    const key = `month:${text}`;
                    if (!handledThisTickRef.current) {
                      handledThisTickRef.current = new Set();
                      queueMicrotask(() => {
                        handledThisTickRef.current = null;
                      });
                    }
                    if (handledThisTickRef.current.has(key)) return;
                    handledThisTickRef.current.add(key);
                    toggleLabelMonths(text);
                  }
                }}
              />
            )}
          </FullWidthChart>
        ) : hasData ? (
          <FullWidthChart>
            {(width) => (
          <AppColumn
            width={width}
            autoFit={false}
            data={chartData}
            xField="month"
            yField="count"
            colorField="status"
            stack
            height={260}
            scale={{ color: { domain: STATUS_DOMAIN, range: STATUS_RANGE } }}
            axis={{ x: monthAxisProps }}
            style={{
              fillOpacity: (datum: ChartDatum) => {
                const statusOk = selectedStatuses.length === 0 || selectedStatuses.includes(datum.status);
                const monthOk = selectedMonths.length === 0 || selectedMonths.includes(datum.month);
                return statusOk && monthOk ? 1 : 0.25;
              },
            }}
            onEvent={(_chart, event) => {
              if (event?.type !== "click") return;
              const attrs = event.target?.attributes as Record<string, unknown> | undefined;
              if (!attrs) return;
              let key: string | null = null;
              let action: (() => void) | null = null;
              // G2 attaches the nearest datum to click/pointer events as
              // event.data.data (the same lookup its own tooltip uses) - read
              // the status straight off it instead of reverse-mapping the
              // clicked shape's rendered fill color back to a name, which
              // breaks the moment two statuses ever share a color.
              const datum = (event as { data?: { data?: ChartDatum } }).data?.data;
              if (onToggleStatus && attrs.class === "element" && datum?.status) {
                const status = datum.status;
                key = `status:${status}`;
                action = () => onToggleStatus(status);
              } else if ((onToggleMonth || onToggleMonths) && typeof attrs.class === "string" && attrs.class.includes("axis-label-item") && typeof attrs.text === "string") {
                if (monthsForAxisLabel(attrs.text, allMonthsRef.current).length > 0) {
                  const text = attrs.text;
                  key = `month:${text}`;
                  action = () => toggleLabelMonths(text);
                }
              }
              if (!key || !action) return;
              if (!handledThisTickRef.current) {
                handledThisTickRef.current = new Set();
                queueMicrotask(() => {
                  handledThisTickRef.current = null;
                });
              }
              if (handledThisTickRef.current.has(key)) return;
              handledThisTickRef.current.add(key);
              action();
            }}
          />
            )}
          </FullWidthChart>
        ) : (
          <Empty description={mode === "count" ? "No hull events in this range" : "No opportunity or ordered litres in this range"} style={{ padding: "40px 0" }} />
        )}
      </Spin>
    </Card>
  );
};
