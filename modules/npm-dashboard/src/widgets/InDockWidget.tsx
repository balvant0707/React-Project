// Ported 1:1 from the NPM tool (app/src/widgets/InDockWidget.tsx).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { List, Typography } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { WidgetCard } from "./WidgetCard";
import { buildFilterLink } from "./filterLink";
import { todayIso } from "@rbp/ui";

const IN_DOCK_STATUSES = ["draft", "submitted"];

type DockRow = {
  id: string;
  hull_event_id: string | null;
  vessel_name: string | null;
  technical_service_rep_user_name: string | null;
};

// Vessels currently in dock: a dock report that has started (indocking date
// today or earlier) and is not finalized yet (draft or submitted). Finalizing
// the report is what takes a vessel off this list - the outdocking date is
// deliberately not used, it is often still empty while the ship is in dock.
// The "All dock reports" link applies exactly these two filters (both are
// chips on the Dock Reports list), so widget and list always agree. The report only knows the vessel and
// TSR, so the shipyard comes from the owning hull event.
export const InDockWidget = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<(DockRow & { shipyard: string | null })[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = todayIso();
      const { data } = await supabaseClient
        .from("dock_reports_overview")
        .select("id, hull_event_id, vessel_name, technical_service_rep_user_name")
        .lte("indocking_date", today)
        .in("status", IN_DOCK_STATUSES)
        .order("indocking_date", { ascending: false })
        .limit(5);
      const reports = (data ?? []) as DockRow[];
      const eventIds = reports.map((r) => r.hull_event_id).filter((id): id is string => !!id);
      const yards = new Map<string, string | null>();
      if (eventIds.length > 0) {
        const { data: events } = await supabaseClient.from("hull_events_overview").select("id, shipyard_name").in("id", eventIds);
        for (const e of (events ?? []) as { id: string; shipyard_name: string | null }[]) yards.set(e.id, e.shipyard_name);
      }
      if (cancelled) return;
      setRows(reports.map((r) => ({ ...r, shipyard: (r.hull_event_id && yards.get(r.hull_event_id)) || null })));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetCard
      title="Currently in-dock"
      loading={loading}
      empty={!loading && rows.length === 0}
      emptyText="No vessel in dock right now"
      extra={<Link
          to={buildFilterLink("/dock-reports", [
            { field: "status", operator: "in", value: IN_DOCK_STATUSES },
            { field: "indocking_date", operator: "lte", value: todayIso() },
          ])}
        >
          View details →
        </Link>}
    >
      <List
        size="small"
        dataSource={rows}
        renderItem={(r) => (
          <List.Item style={{ padding: "6px 0" }}>
            <List.Item.Meta
              avatar={<ToolOutlined style={{ color: "#0F9ED5", marginTop: 4 }} />}
              title={<Link to={`/dock-reports/${r.id}`}>{r.vessel_name ?? "-"}</Link>}
              description={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Shipyard: {r.shipyard ?? "-"} | TSR: {r.technical_service_rep_user_name ?? "-"}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </WidgetCard>
  );
};
