// Ported 1:1 from the NPM tool (app/src/widgets/CompetitorChampionWidget.tsx).
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import { Link } from "react-router-dom";
import { Avatar, Typography } from "antd";
import { CrownOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { WidgetCard } from "./WidgetCard";
import { buildFilterLink } from "./filterLink";

dayjs.extend(quarterOfYear);

const ACCENT = "#d48806";
const TOP_N = 2;
const MIN_DWT = 5000;

type Row = { reported_by_user_id: string | null; count: number };

// Who reported the most competitor intelligence this quarter: "Report only"
// or Lost hull events on vessels above 5,000 DWT that carry competitor
// product info (an antifouling product on the event). Ranked on the server
// (one row per reporter), ranked per reporter with a server-side count.
export const CompetitorChampionWidget = () => {
  const [loading, setLoading] = useState(true);
  const [ranked, setRanked] = useState<{ name: string; count: number }[]>([]);

  const start = dayjs().startOf("quarter").format("YYYY-MM-DD");
  const end = dayjs().endOf("quarter").add(1, "day").format("YYYY-MM-DD");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data }, users] = await Promise.all([
        supabaseClient
          .from("hull_events_overview")
          .select("reported_by_user_id, id.count()")
          .in("status", ["Report only", "Lost"])
          .gt("vessel_deadweight_tonnage", MIN_DWT)
          .or("vertical_af_product_name.not.is.null,flat_bottom_af_product_name.not.is.null")
          .gte("event_date", start)
          .lt("event_date", end),
        loadUserOptions(),
      ]);
      if (cancelled) return;
      const nameById = new Map(users.map((u) => [u.value, u.label]));
      const top = ((data ?? []) as unknown as Row[])
        .filter((r) => r.reported_by_user_id)
        .map((r) => ({ name: nameById.get(r.reported_by_user_id!) ?? "Unknown", count: Number(r.count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_N);
      setRanked(top);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  return (
    <WidgetCard
      title={`Q${dayjs().quarter()} Competitor Insights Champion`}
      loading={loading}
      empty={!loading && ranked.length === 0}
      emptyText="No competitor reports this quarter"
      extra={
        <Link
          to={buildFilterLink("/hull-events", [
            { field: "status", operator: "in", value: ["Report only", "Lost"] },
            { field: "event_date", operator: "gte", value: start },
          ])}
        >
          View details →
        </Link>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ranked.map((r, i) => (
          <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar size={22} style={{ background: i === 0 ? ACCENT : "#bfbfbf" }} icon={i === 0 ? <CrownOutlined /> : undefined}>
              {i === 0 ? undefined : i + 1}
            </Avatar>
            <Typography.Text strong={i === 0} style={{ flex: 1 }} ellipsis>
              {r.name}
            </Typography.Text>
            <Typography.Text type="secondary">{r.count}</Typography.Text>
          </div>
        ))}
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          Report only / Lost with competitor product info, vessels above 5,000 DWT
        </Typography.Text>
      </div>
    </WidgetCard>
  );
};
