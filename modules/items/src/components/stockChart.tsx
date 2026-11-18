// Ported 1:1 from COMPASS (app/src/components/stockChart.tsx).
import { useState } from "react";
import { theme as antdTheme, Typography } from "antd";

// The stock of one item over the last weeks as a line with a light area below, and the minimum stock as a dashed line.
// Hovering (or touching) shows the value of the nearest weekly point above the chart.
const W = 640;
const H = 170;
const LEFT = 44;
const RIGHT = 8;
const TOP = 10;
const BOTTOM = 22;

type StockPoint = { day: string; value: number };

export const StockChart = ({
  points,
  minimum,
  format,
  formatDay,
  minimumLabel,
  label,
}: {
  points: StockPoint[];
  minimum: number | null;
  format: (value: number) => string;
  formatDay: (day: string) => string;
  minimumLabel: string;
  label: string;
}) => {
  const { token } = antdTheme.useToken();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const low = Math.min(0, ...values, minimum ?? 0);
  const high = Math.max(1, ...values, minimum ?? 0);
  const span = high - low;
  const x = (i: number) => LEFT + (i * (W - LEFT - RIGHT)) / (points.length - 1);
  const y = (v: number) => TOP + (1 - (v - low) / span) * (H - TOP - BOTTOM);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${x(0)},${y(low)} ${line} ${x(points.length - 1)},${y(low)}`;
  const shown = hover ?? points.length - 1;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = Math.min(1, Math.max(0, (svgX - LEFT) / (W - LEFT - RIGHT)));
    setHover(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {formatDay(points[shown].day)}: <Typography.Text strong>{format(points[shown].value)}</Typography.Text>
      </Typography.Text>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
        style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* Axis: zero line and the top value; the labels sit in the left margin. */}
        <line x1={LEFT} x2={W - RIGHT} y1={y(0)} y2={y(0)} stroke={token.colorBorder} strokeWidth={1} />
        <text x={LEFT - 6} y={y(0) + 4} textAnchor="end" fontSize={11} fill={token.colorTextTertiary}>0</text>
        <text x={LEFT - 6} y={y(high) + 4} textAnchor="end" fontSize={11} fill={token.colorTextTertiary}>{format(high)}</text>
        {minimum != null && (
          <>
            <line x1={LEFT} x2={W - RIGHT} y1={y(minimum)} y2={y(minimum)} stroke={token.colorError} strokeWidth={1} strokeDasharray="4 3" />
            <text x={W - RIGHT} y={y(minimum) - 4} textAnchor="end" fontSize={11} fill={token.colorError}>{minimumLabel}</text>
          </>
        )}
        <polygon points={area} fill={token.colorPrimary} fillOpacity={0.1} />
        <polyline points={line} fill="none" stroke={token.colorPrimary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <text x={x(0)} y={H - 6} textAnchor="start" fontSize={11} fill={token.colorTextTertiary}>{formatDay(points[0].day)}</text>
        <text x={x(points.length - 1)} y={H - 6} textAnchor="end" fontSize={11} fill={token.colorTextTertiary}>{formatDay(points[points.length - 1].day)}</text>
        <circle cx={x(shown)} cy={y(points[shown].value)} r={hover === null ? 3.5 : 5} fill={token.colorPrimary} />
      </svg>
    </div>
  );
};
