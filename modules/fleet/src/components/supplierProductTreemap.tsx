// Ported 1:1 from the NPM tool (app/src/components/supplierProductTreemap.tsx).
import { useEffect, useState } from "react";
import { Treemap } from "@ant-design/plots";
import { FullWidthChart } from "./fullWidthChart";
import { supplierColorScale } from "../utils/chartDefaults";
import { loadCompanyChartColors, type CompanyChartColor } from "@rbp/module-companies/src/modules/companies/chartColors.ts";

export type SupplierSlice = {
  name: string;
  children: { name: string; value: number }[];
};
// The subset of G2's internal d3-hierarchy node fields the layout/encode/style
// callbacks below read - depth 0 is the root, 1 is each supplier, 2 is each
// product; y0/y1 are that node's own pixel span before any depth-specific
// override, and height is the node's distance from its furthest leaf (0 for a
// product, since only leaves are drawn by default - see the `layer` option).
// `value` is the node's summed vessel count and `path` its names from the root.
type TreemapHierarchyNode = {
  depth: number;
  height: number;
  y0: number;
  y1: number;
  x0: number;
  x1: number;
  y: [number, number];
  value: number;
  path: string[];
};

// Height of the reserved band at the top of each supplier's box that carries
// its name, separate from its products below.
const SUPPLIER_LABEL_HEIGHT = 12;
// Gap between a rectangle's left edge and its label.
const LABEL_INSET = 4;
// Color-scale key shared by every supplier header node (see below).
const HEADER_COLOR_KEY = "__supplier_header__";

// Two-level area chart shared by the vessel list and the company page: one
// group per supplier (a bare "Supplier: count (share %)" headline, no fill - grouping
// comes from the wider gap between suppliers than between their products),
// split into one colored rectangle per antifouling product ("Product: count"),
// colored by supplier (see supplierColorScale; admin-set company chart colors win).
//
// unknownShare (0-1), when given, adds a fixed-width outlined box to the right
// of the chart, same height, reading "Unknown: 46%". Its size is deliberately
// NOT proportional to the share - a large unknown share would otherwise
// squeeze the known suppliers - so it is outlined only (no fill) to not read
// as a tile; the tile areas show the known vessels only.
const UNKNOWN_BOX_WIDTH = 96;
// G2's theme puts a 16px margin on every side of a chart, so the colored
// blocks are 2 * this shorter than the chart's `height` and start this far down;
// the supplier name band sits on top of the product row, so the box skips it too.
const CHART_MARGIN = 16;

export const SupplierProductTreemap = ({
  slices,
  height,
  unknownShare,
}: {
  slices: SupplierSlice[];
  height: number;
  unknownShare?: number;
}) => {
  const [chartColors, setChartColors] = useState<Map<string, CompanyChartColor>>(new Map());
  useEffect(() => {
    let cancelled = false;
    loadCompanyChartColors().then((colors) => {
      if (!cancelled) setChartColors(colors);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const totalVessels = slices.reduce((sum, slice) => sum + slice.children.reduce((n, child) => n + child.value, 0), 0);
  // Supplier shares are of all vessels, the unknown ones included.
  const shareBase = unknownShare !== undefined && unknownShare > 0 && unknownShare < 1 ? totalVessels / (1 - unknownShare) : totalVessels;
  const supplierColors = supplierColorScale(slices.map((slice) => slice.name), chartColors);
  // Supplier header nodes get their own, fully transparent color entry, so the
  // header carries only its text while the products below keep their
  // supplier's color.
  const colorScale = {
    domain: [...supplierColors.domain, HEADER_COLOR_KEY],
    range: [...supplierColors.range, "transparent"],
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <FullWidthChart height={height}>
          {(width) => (
            <Treemap
              width={width}
              autoFit={false}
              data={{ name: "root", children: slices }}
              valueField="value"
              height={height}
              marginLeft={0}
              marginRight={0}
              legend={false}
              scale={{ color: colorScale }}
              layout={{
                // d3-hierarchy calls this per node being subdivided, keyed by
                // that node's own depth: depth 0 is the root separating
                // suppliers, depth 1 is each supplier separating its products
                // - so a bigger gap between suppliers than between products of
                // the same supplier, like Superset's multi-dimension treemap.
                paddingInner: (d: TreemapHierarchyNode) =>
                  d.depth === 0 ? 8 : 2,
                // Reserve a thin band at the top of each supplier's own box
                // for its name, before laying out its products underneath -
                // same "keyed by the subdividing node's depth" mechanism as
                // paddingInner above (depth 1 = each supplier).
                paddingTop: (d: TreemapHierarchyNode) =>
                  d.depth === 1 ? SUPPLIER_LABEL_HEIGHT : 0,
                // Draw the supplier nodes themselves (depth 1), not just the
                // leaf products (the default: only childless nodes draw), so
                // that reserved band has a rect to carry the supplier's label.
                layer: (d: TreemapHierarchyNode) =>
                  d.height === 0 || d.depth === 1,
              }}
              encode={{
                // A supplier node's own x0/y0/x1/y1 span its whole group
                // (products included) - clip its drawn rect to just the
                // reserved label band above them, so it reads as a header
                // rather than a block sitting under its own products.
                y: (d: TreemapHierarchyNode) =>
                  d.depth === 1 ? [d.y0, d.y0 + SUPPLIER_LABEL_HEIGHT] : d.y,
                // G2's default colors a node by its top-level ancestor (d.path[1],
                // the supplier); headers are redirected to the transparent entry.
                color: (d: TreemapHierarchyNode) =>
                  d.depth === 1 ? HEADER_COLOR_KEY : d.path[1],
              }}
              // Title is the supplier / product path (no "root"); one row with the vessel count instead of "value".
              tooltip={{
                title: (d: TreemapHierarchyNode) => d.path.slice(1).join(" / "),
                items: [(d: TreemapHierarchyNode) => ({ name: "Vessels", value: d.value.toLocaleString() })],
              }}
              style={{
                // Supplier headers (depth 1) also carry their share of all vessels shown.
                labelText: (d: TreemapHierarchyNode) =>
                  `${d.path[d.path.length - 1]}: ${d.value.toLocaleString()}${
                    d.depth === 1 && shareBase > 0 ? ` (${Math.round((d.value / shareBase) * 100)}%)` : ""
                  }`,
                // A maker's admin-set text color (company page > Chart colors) on its product rectangles.
                labelFill: (d: TreemapHierarchyNode) =>
                  (d.depth === 2 ? chartColors.get(d.path[1])?.textColor : null) ?? undefined,
                labelFontWeight: (d: TreemapHierarchyNode) =>
                  d.depth === 1 ? 600 : 400,
                // Left-aligned at the rectangle's left edge (vertically centered), with a small inset.
                labelPosition: "left",
                labelTextBaseline: "middle",
                // No white outline around the rectangles; the layout padding separates them.
                lineWidth: 0,
                labelTextAlign: "start",
                labelDx: LABEL_INSET,
                // G2's default clips a label at its rectangle's width; shrink it by the inset on both sides so the shifted text stays inside.
                labelWordWrapWidth: (d: TreemapHierarchyNode) =>
                  Math.max(d.x1 - d.x0 - 2 * LABEL_INSET, 0),
              }}
            />
          )}
        </FullWidthChart>
      </div>
      {unknownShare !== undefined && unknownShare > 0 && (
        <div
          title="Share of vessels without a known supplier. The box size does not reflect the share."
          style={{
            width: UNKNOWN_BOX_WIDTH,
            height: height - 2 * CHART_MARGIN - SUPPLIER_LABEL_HEIGHT,
            marginTop: CHART_MARGIN + SUPPLIER_LABEL_HEIGHT,
            flexShrink: 0,
            boxSizing: "border-box",
            border: "1px dashed currentColor",
            opacity: 0.65,
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {/* Rounded down so any known supplier keeps it below 100%; the epsilon
              absorbs float noise (0.29 * 100 = 28.999...). */}
          Unknown: {unknownShare < 0.01 ? "<1" : Math.floor(unknownShare * 100 + 1e-9)}
          %
        </div>
      )}
    </div>
  );
};
