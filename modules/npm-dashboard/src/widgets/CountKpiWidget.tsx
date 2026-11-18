// Ported 1:1 from the NPM tool (app/src/widgets/CountKpiWidget.tsx).
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGetIdentity } from "@rbp/core";
import { Statistic, Typography } from "antd";
import { WidgetCard } from "./WidgetCard";

type CountKpiWidgetProps = {
  title: string;
  // Muted line under the number, e.g. what exactly is being counted.
  caption?: string;
  icon: ReactNode;
  accentColor: string;
  // Receives the signed-in user's id; resolves to the number to show.
  loadCount: (userId: string) => Promise<number>;
  // List page that shows exactly the counted rows (see filterLink.ts).
  detailsLink?: string | null;
};

// One big number about "my" records. Every count tile on the dashboard
// (To quote, To chase, To celebrate, Develop/Target accounts) is this widget
// with a different query, so they all look and load the same way.
export const CountKpiWidget = ({ title, caption, icon, accentColor, loadCount, detailsLink }: CountKpiWidgetProps) => {
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!identity?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const value = await loadCount(identity.id);
      if (cancelled) return;
      setCount(value);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // loadCount is a module-level function at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.id]);

  return (
    <WidgetCard
      title={title}
      loading={loading}
      variant="kpi"
      icon={icon}
      accentColor={accentColor}
      extra={detailsLink && <Link to={detailsLink}>View details →</Link>}
    >
      <Statistic value={count} formatter={(v) => Number(v).toLocaleString()} valueStyle={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2 }} />
      {caption && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {caption}
        </Typography.Text>
      )}
    </WidgetCard>
  );
};
