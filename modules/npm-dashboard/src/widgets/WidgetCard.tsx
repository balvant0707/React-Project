// Ported 1:1 from the NPM tool (app/src/widgets/WidgetCard.tsx).
import type { ReactNode } from "react";
import { InboxOutlined } from "@ant-design/icons";
import { Card, Skeleton, Typography } from "antd";

type WidgetCardProps = {
  title: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  extra?: ReactNode;
  // "chart" (default) is the standard titled card every chart/table widget
  // uses. "kpi" is a compact tile for a single big number - small muted
  // label, optional accent icon, no separate header bar - the shape a
  // dashboard's top KPI row wants as more of these get added later.
  variant?: "chart" | "kpi";
  icon?: ReactNode;
  accentColor?: string;
  children: ReactNode;
};

const SHADOW = "0 1px 2px rgba(16, 24, 40, 0.04), 0 2px 8px rgba(16, 24, 40, 0.06)";

// Shared chrome for every dashboard widget - a widget only ever needs to
// bring its own data fetch plus content; the card shell and the
// loading/empty states are handled once here so every widget looks and
// behaves the same regardless of what it renders (chart, big number,
// table), and so a widget dropped onto a different page (not just the
// dashboard) looks consistent with the rest without extra wiring.
//
// Skeleton placeholders rather than a spinner over stale/blank content -
// shape roughly matches what is about to render (a couple of short lines
// for a KPI number, a taller block for a chart) so the loading state does
// not visually jump once real content arrives.
export const WidgetCard = ({
  title,
  loading,
  empty,
  emptyText = "No data yet",
  extra,
  variant = "chart",
  icon,
  accentColor = "#2f54eb",
  children,
}: WidgetCardProps) => {
  const skeletonRows = variant === "kpi" ? 1 : 5;
  // The chart variant's content needs to actually stretch to fill whatever
  // height the mosaic grid gave this card (see dashboard/index.tsx) - a
  // chart using autoFit only resizes to match its own immediate DOM
  // parent, so that parent needs a real, flex-derived height, not just
  // "whatever the content naturally takes." Skeleton renders children
  // as-is (no wrapper of its own) once loading is false, so this div is
  // the thing that actually becomes the flex child of the card body.
  const body = (
    <Skeleton active loading={!!loading} title={false} paragraph={{ rows: skeletonRows }}>
      {empty ? (
        // Compact on purpose: antd's <Empty> image is ~100px tall and overflowed
        // the small dashboard tiles. A flex child that can shrink (minHeight 0)
        // and clips, so it can never spill out of the card.
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "4px 0",
          }}
        >
          <InboxOutlined style={{ fontSize: 14, color: "rgba(0,0,0,0.25)" }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {emptyText}
          </Typography.Text>
        </div>
      ) : variant === "chart" ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      ) : (
        children
      )}
    </Skeleton>
  );

  if (variant === "kpi") {
    return (
      <Card
        hoverable
        variant="borderless"
        style={{ borderRadius: 14, boxShadow: SHADOW, height: "100%" }}
        styles={{ body: { padding: "18px 20px" } }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {title}
          </Typography.Text>
          {icon && (
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: `${accentColor}1a`,
                color: accentColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: 15,
              }}
            >
              {icon}
            </div>
          )}
        </div>
        <div style={{ marginTop: 8 }}>{body}</div>
        {extra && (
          <div style={{ marginTop: 10 }}>
            <Typography.Text style={{ fontSize: 12 }}>{extra}</Typography.Text>
          </div>
        )}
      </Card>
    );
  }

  return (
    <Card
      hoverable
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>}
      variant="borderless"
      extra={extra}
      style={{ borderRadius: 14, boxShadow: SHADOW, height: "100%", display: "flex", flexDirection: "column" }}
      styles={{
        body: { paddingTop: 8, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" },
        header: { flex: "0 0 auto" },
      }}
    >
      {body}
    </Card>
  );
};
