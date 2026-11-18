// Ported 1:1 from COMPASS (app/src/components/sparkline.tsx).
import { useEffect, useRef, useState } from "react";
import { theme as antdTheme, Tooltip } from "antd";

// A tiny line without axes for a big number: the trend over the last points, calm in the secondary text colour (or
// `color`) with a light area below. Whether the change is good or bad is said next to it (BigNumber), not by the line.
// Hovering shows the value of the nearest point (`labels` = one caption per point, e.g. its date).
// `tone` says which direction is good; sparkDeltaTone turns a change into good | bad | neutral.
export type SparkTone = "up-good" | "down-good" | "neutral";
export const sparkDeltaTone = (delta: number, tone: SparkTone): "good" | "bad" | "neutral" =>
  tone === "neutral" || delta === 0 ? "neutral" : (delta > 0) === (tone === "up-good") ? "good" : "bad";

const W = 120;
const H = 32;
const PAD = 2;

export const Sparkline = ({ values, labels, label, color: lineColor, wide }: { values: number[]; labels: string[]; label: string; color?: string; wide?: boolean }) => {
  const { token } = antdTheme.useToken();
  const [hover, setHover] = useState<number | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [PAD + (i * (W - 2 * PAD)) / (values.length - 1), H - PAD - ((v - min) / span) * (H - 2 * PAD)] as const);
  const color = lineColor ?? token.colorTextSecondary;
  const shown = points[hover ?? points.length - 1];
  // Pointer events cover mouse, pen and finger: a touch shows the value of the touched point for a moment.
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    window.clearTimeout(hideTimer.current);
    setHover(Math.round(ratio * (values.length - 1)));
  };
  const onLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") hideTimer.current = window.setTimeout(() => setHover(null), 2500);
    else setHover(null);
  };
  return (
    <div
      role="img"
      aria-label={label}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={onLeave}
      // A tap on the line shows its value; it must not also open the list the tile links to.
      onClick={(e) => {
        if ((e.nativeEvent as PointerEvent).pointerType === "touch") e.stopPropagation();
      }}
      style={{ position: "relative", marginTop: 6, maxWidth: wide ? undefined : 160, height: H }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
        <polygon points={`${points[0][0]},${H} ${points.map(([x, y]) => `${x},${y}`).join(" ")} ${points[points.length - 1][0]},${H}`} fill={color} fillOpacity={0.14} />
        <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The dot is HTML, not SVG, because the SVG is stretched and would squash a circle. */}
      <Tooltip open={hover !== null} title={hover !== null ? `${labels[hover]}: ${values[hover]}` : undefined} placement="top">
        <span
          style={{
            position: "absolute",
            left: `${(shown[0] / W) * 100}%`,
            top: `${(shown[1] / H) * 100}%`,
            width: hover === null ? 5 : 7,
            height: hover === null ? 5 : 7,
            marginLeft: hover === null ? -2.5 : -3.5,
            marginTop: hover === null ? -2.5 : -3.5,
            borderRadius: "50%",
            background: color,
            pointerEvents: "none",
          }}
        />
      </Tooltip>
    </div>
  );
};
