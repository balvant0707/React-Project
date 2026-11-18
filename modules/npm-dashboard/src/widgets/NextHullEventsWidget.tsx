// Ported 1:1 from the NPM tool (app/src/widgets/NextHullEventsWidget.tsx).
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { useGetIdentity } from "@rbp/core";
import { List, Tag, Typography } from "antd";
import { supabaseClient } from "@rbp/core";
import { WidgetCard } from "./WidgetCard";
import { buildFilterLink } from "./filterLink";
import { todayIso } from "@rbp/ui";

type EventRow = { id: string; vessel_name: string | null; type_code: string | null; event_date: string | null; status: string | null };

const LIMIT = 5;

// My next upcoming hull events (customers I am the sales rep for), soonest
// first. Lost and Report-only events are no upcoming work, so they are left out.
export const NextHullEventsWidget = () => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<EventRow[]>([]);

  useEffect(() => {
    if (!identity?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabaseClient
        .from("hull_events_overview")
        .select("id, vessel_name, type_code, event_date, status")
        .eq("resolved_group_company_sales_account_user_id", identity.id)
        .gte("event_date", todayIso())
        .not("status", "in", "(Lost,Report only)")
        .order("event_date", { ascending: true })
        .limit(LIMIT);
      if (cancelled) return;
      setRows((data ?? []) as EventRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [identity?.id]);

  return (
    <WidgetCard
      title="Next hull events"
      loading={loading}
      empty={!loading && rows.length === 0}
      emptyText="No upcoming hull events"
      extra={
        identity?.id && (
          <Link
            to={buildFilterLink("/hull-events", [
              { field: "resolved_group_company_sales_account_user_id", operator: "eq", value: identity.id },
              { field: "event_date", operator: "gte", value: todayIso() },
            ])}
          >
            View details →
          </Link>
        )
      }
    >
      <List
        size="small"
        dataSource={rows}
        renderItem={(r) => (
          <List.Item style={{ padding: "6px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0 }}>
              <Tag style={{ marginInlineEnd: 0 }}>{r.type_code ?? "?"}</Tag>
              <Link to={`/hull-events/${r.id}`} style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text ellipsis style={{ maxWidth: "100%" }}>
                  {r.vessel_name ?? "-"}
                </Typography.Text>
              </Link>
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {r.event_date ? dayjs(r.event_date).format("MMM YYYY") : "-"}
                {r.status ? ` | ${r.status}` : ""}
              </Typography.Text>
            </div>
          </List.Item>
        )}
      />
    </WidgetCard>
  );
};
