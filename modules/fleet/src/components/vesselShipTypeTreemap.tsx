// Ported 1:1 from the NPM tool (app/src/components/vesselShipTypeTreemap.tsx).
import { useEffect, useState } from "react";
import { Spin } from "antd";
import { Treemap } from "@ant-design/plots";
import { useDataProvider, type CrudFilters } from "@rbp/core";
import { FullWidthChart } from "./fullWidthChart";
import { CATEGORICAL_CHART_PALETTE } from "../utils/chartDefaults";

type Slice = { name: string; value: number };
// G2's treemap datum: the node's own name is the last entry of its path.
type TreemapNode = { path: string[]; value: number };
const name = (d: TreemapNode) => d.path[d.path.length - 1];

const UNKNOWN_SHIP_TYPE = "Unknown";
const PAGE_SIZE = 1000;
// Rectangles narrower than this (px) get no label at all; wider ones get a
// label that G2 clips to the rectangle's width (one line, no wrapping).
const MIN_LABEL_WIDTH = 30;
// Chart height; the wrapper reserves it while loading so the page below does not jump.
const CHART_HEIGHT = 60;

// One row-wide strip of rectangles, one per ship type group, sized by vessel count.
// Counts the vessels matching the list table's current filters (the same
// Refine filters passed to useTable), ignoring its pagination and sorting, so
// the chart always describes the whole filtered result, not just the page.
// Counted on the server: there are ~175k vessels, so fetching them (PostgREST
// caps a response at 1000 rows) and tallying here took ~176 requests.
export const VesselShipTypeTreemap = ({ filters }: { filters: CrudFilters }) => {
  const dataProvider = useDataProvider()();
  const [slices, setSlices] = useState<Slice[] | null>(null);
  // Filters are a fresh array every render; key the effect on their content.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setSlices(null);
    (async () => {
      // One grouped request (PostgREST aggregate), so the server returns one
      // row per ship type instead of this component paging through every
      // vessel. Needs pgrst.db_aggregates_enabled - see
      // 20260921130000_enable_postgrest_aggregates.sql. Count a column
      // (`id.count()`), not a bare `count()`: that compiles to COUNT(view.*),
      // a whole-row reference that forces every join in the view to be
      // evaluated (~2 s vs ~0.1 s).
      const { data } = await dataProvider.getList<{ ship_type_group: string | null; count: number }>({
        resource: "vessels_overview",
        filters: JSON.parse(filtersKey),
        pagination: { currentPage: 1, pageSize: PAGE_SIZE },
        meta: { select: "ship_type_group, id.count()" },
      });
      const counts = new Map<string, number>();
      for (const row of data) {
        const type = row.ship_type_group ?? UNKNOWN_SHIP_TYPE;
        counts.set(type, (counts.get(type) ?? 0) + Number(row.count));
      }
      if (cancelled) return;
      setSlices(Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
    })();
    return () => {
      cancelled = true;
    };
  }, [dataProvider, filtersKey]);

  return (
    <div style={{ marginBottom: 4, minHeight: CHART_HEIGHT }}>
      <Spin spinning={slices === null}>
        {slices && slices.length > 0 ? (
          <FullWidthChart height={CHART_HEIGHT}>
            {(width) => {
              const total = slices.reduce((sum, slice) => sum + slice.value, 0);
              const fits = (d: TreemapNode) => (d.value / total) * width >= MIN_LABEL_WIDTH;
              return (
              <Treemap
                width={width}
                height={CHART_HEIGHT}
                marginLeft={0}
                marginRight={0}
                autoFit={false}
                data={{ name: "root", children: slices }}
                valueField="value"
                legend={false}
                layout={{ tile: "treemapDice", paddingInner: 2 }}
                scale={{ color: { range: CATEGORICAL_CHART_PALETTE } }}
                style={{ labelText: (d: TreemapNode) => (fits(d) ? name(d) + ": " + d.value : ""), labelPosition: "left", labelTextAlign: "start", labelTextBaseline: "middle", labelDx: 4, lineWidth: 0 }}
              />
              );
            }}
          </FullWidthChart>
        ) : (
          <div style={{ height: CHART_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.45 }}>
            {slices && "No vessels match the current filters"}
          </div>
        )}
      </Spin>
    </div>
  );
};
