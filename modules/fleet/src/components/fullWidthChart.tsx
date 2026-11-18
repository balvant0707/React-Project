// Ported 1:1 from the NPM tool (app/src/components/fullWidthChart.tsx).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Renders a chart at exactly its container's current width, and re-renders it
// whenever that width changes. G2's own autoFit measures the container once
// at mount and can be left stuck at that width (e.g. a chart first drawn
// while the page layout was still settling, or inside a tab pane, then never
// stretching to the full card afterwards), so the width is tracked here
// instead and passed to the chart explicitly. Renders nothing until the
// first measurement, so a chart never draws at a guessed width. `height`
// reserves the chart's vertical space from the first render, so the page does
// not shift when the chart appears after that measurement.
export const FullWidthChart = ({ children, height }: { children: (width: number) => ReactNode; height?: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.floor(el.getBoundingClientRect().width));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: "100%", minWidth: 0, minHeight: height }}>
      {width > 0 && children(width)}
    </div>
  );
};
