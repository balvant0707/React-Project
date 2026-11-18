// Ported 1:1 from the NPM tool (app/src/utils/chartDefaults.tsx).
import type { ComponentProps } from "react";
import { Column } from "@ant-design/plots";

// Shared visual defaults for every bar/column chart in the app (see the
// dashboard widgets for where this look was first established) - rounded
// bars, no axis chrome, faint gridlines, a top-right legend, thousands-
// separated axis labels, and a restrained default palette, so a new chart
// gets this for free instead of every call site repeating the same
// style/axis/legend props. A chart with its own meaningful colors (e.g.
// status colors, or the Actual/Promising/50-50 series) still passes its own
// `scale`, which wins outright over the default palette below rather than
// merging - color is reserved for things that actually mean something,
// this default is just the fallback for a chart that has not earned a
// meaningful palette of its own yet.

// Two restrained tones, not a rainbow - this is the *fallback* used only
// when a chart supplies no scale of its own; every chart that has real
// categories to distinguish (status, Actual vs. pipeline) brings its own
// meaningful colors instead of reaching for this.
const CHART_PALETTE = ["#4f6ef7", "#94a3b8"];

// The app-wide standard palette for a chart that needs to tell apart more
// than a couple of categories with no other meaningful color of their own
// (e.g. a treemap sliced by ship type) - a light-to-dark blue progression,
// applied positionally (first category gets #d6ebff, second #a8d4ff, ...),
// not tied to any specific category. Established on the vessel list's
// ship-type treemap; use this same array for any future chart with the same
// need, rather than picking new colors per chart.
export const CATEGORICAL_CHART_PALETTE = [
  "#d6ebff",
  "#a8d4ff",
  "#7abdff",
  "#4da6ff",
  "#1f8fff",
  "#007af5",
  "#0063c7",
  "#004c99",
  "#00366b",
  "#001f3d",
];

// Ordinal color scale (domain + range) for a treemap colored by supplier
// name: the color an admin set on the company (companies.chart_color, passed
// in as overrides); a supplier without one still gets a distinct, stable
// color by cycling through CATEGORICAL_CHART_PALETTE.
export function supplierColorScale(names: string[], overrides?: Map<string, { color: string | null }>) {
  return {
    domain: names,
    range: names.map((name, i) => overrides?.get(name)?.color ?? CATEGORICAL_CHART_PALETTE[i % CATEGORICAL_CHART_PALETTE.length]),
  };
}

const formatAxisNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : String(value);
};

// X-axis labels for a chart whose x values are "YYYY-MM" months. The grain
// of the data stays monthly (one bar per month); only the labels thin out
// with the span: up to 12 months every month ("2026-03"), up to 48 months
// quarter starts ("Q1 2026" under Jan/Apr/Jul/Oct), beyond that January
// only ("2026"). Returns the axis.x props to pass to AppColumn.
export function monthAxisLabels(months: string[]) {
  const sorted = [...new Set(months)].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = first ? (Number(last.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(last.slice(5, 7)) - Number(first.slice(5, 7)) + 1 : 0;
  const grain = span <= 12 ? "month" : span <= 48 ? "quarter" : "year";
  const monthOf = (d: unknown) => Number(String(d).slice(5, 7));
  return {
    grain,
    labelFilter: (d: unknown) => grain === "month" || (grain === "quarter" ? (monthOf(d) - 1) % 3 === 0 : monthOf(d) === 1),
    labelFormatter: (d: unknown) => {
      const v = String(d);
      if (grain === "month") return v;
      return grain === "quarter" ? `Q${Math.floor((monthOf(v) - 1) / 3) + 1} ${v.slice(0, 4)}` : v.slice(0, 4);
    },
  };
}

// The "YYYY-MM" months an axis label from monthAxisLabels stands for: the
// month itself, the quarter ("Q1 2026") or the year ("2026"), limited to the
// months the chart actually has. Empty if the text is not such a label.
export function monthsForAxisLabel(text: string, months: string[]): string[] {
  const quarter = /^Q([1-4]) (\d{4})$/.exec(text);
  if (quarter) return months.filter((m) => m.slice(0, 4) === quarter[2] && Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1 === Number(quarter[1]));
  if (/^\d{4}$/.test(text)) return months.filter((m) => m.slice(0, 4) === text);
  return /^\d{4}-\d{2}$/.test(text) ? months.filter((m) => m === text) : [];
}

const defaultColumnStyle = { radius: 4, maxWidth: 40 };

const defaultColumnAxis = {
  y: {
    title: false,
    line: false,
    tickLine: false,
    grid: true,
    gridLineDash: [0, 0],
    gridStroke: "#f0f0f0",
    label: { style: { fontSize: 11 } },
    labelFormatter: formatAxisNumber,
  },
  x: { title: false, line: false, tickLine: false, label: { style: { fontSize: 12 } } },
};

const defaultLegend = {
  color: { position: "top" as const, layout: { justifyContent: "flex-end" as const }, itemLabelFill: "#595959" },
};

const defaultScale = { color: { range: CHART_PALETTE } };

// One level deeper than a flat spread, so a caller overriding just
// axis.y.label (e.g. to add a currency formatter) does not lose the
// default line/tickLine/grid settings sitting alongside it.
function mergeAxisSide(base: any, override: any) {
  if (!override) return base;
  return { ...base, ...override, label: { ...base.label, ...override.label } };
}

type ColumnProps = ComponentProps<typeof Column>;

// A (usually multi-series, often stacked) time-series chart - gets the
// top-right legend by default since colorField almost always means several
// series worth distinguishing.
export const AppColumn = ({ style, axis, legend, scale, ...rest }: ColumnProps) => {
  const mergedAxis = {
    y: mergeAxisSide(defaultColumnAxis.y, (axis as any)?.y),
    x: mergeAxisSide(defaultColumnAxis.x, (axis as any)?.x),
  };
  return (
    <Column
      style={{ ...defaultColumnStyle, ...style }}
      axis={mergedAxis}
      legend={legend ?? defaultLegend}
      scale={scale ?? defaultScale}
      {...rest}
    />
  );
};
