// Ported 1:1 from the NPM tool (app/src/components/vesselSupplierTreemap.tsx).
import { useEffect, useState } from "react";
import { Spin } from "antd";
import { useDataProvider, type CrudFilters } from "@rbp/core";
import { SupplierProductTreemap, type SupplierSlice } from "./supplierProductTreemap";

type Row = { last_hull_event_supplier_name: string | null; last_hull_event_vertical_af_product_name: string | null; service_period_expired: boolean; count: number };
type Slice = SupplierSlice;

const UNKNOWN_PRODUCT = "Unknown product";
const PAGE_SIZE = 1000;
// Chart height; the wrapper reserves it while loading and when empty so the page below does not jump.
const CHART_HEIGHT = 70;

// Area chart of the current supplier (and antifouling product) recorded on
// each filtered vessel's latest drydock/newbuilding event: one rectangle per
// supplier, sized by vessel count, split by product. Mirrors
// CompanySupplierTreemap but scoped to the list's current filters rather than
// one company's related vessels, and reads the supplier/product already
// resolved onto vessels_overview (last_hull_event_supplier_name /
// last_hull_event_vertical_af_product_name, same lateral join that already
// backs the list's "Last Hull Event" column) instead of paging hull events
// itself - grouped server-side via a PostgREST aggregate, same technique as
// VesselShipTypeTreemap, since the vessels table is far too large to fetch.
//
export const VesselSupplierTreemap = ({ filters }: { filters: CrudFilters }) => {
  const dataProvider = useDataProvider()();
  const [slices, setSlices] = useState<Slice[] | null>(null);
  const [unknownShare, setUnknownShare] = useState(0);
  // Filters are a fresh array every render; key the effect on their content.
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setSlices(null);
    (async () => {
      const { data } = await dataProvider.getList<Row>({
        resource: "vessels_overview",
        filters: JSON.parse(filtersKey),
        pagination: { currentPage: 1, pageSize: PAGE_SIZE },
        meta: { select: "last_hull_event_supplier_name, last_hull_event_vertical_af_product_name, service_period_expired, id.count()" },
      });
      if (cancelled) return;

      const countsBySupplier = new Map<string, Map<string, number>>();
      let unknownCount = 0;
      let totalCount = 0;
      for (const row of data) {
        totalCount += Number(row.count);
        // An expired service period means the current system is unknown (same rule as vessels_overview.current_maker).
        if (!row.last_hull_event_supplier_name || row.service_period_expired) {
          unknownCount += Number(row.count);
          continue;
        }
        const productCounts = countsBySupplier.get(row.last_hull_event_supplier_name) ?? new Map<string, number>();
        const product = row.last_hull_event_vertical_af_product_name ?? UNKNOWN_PRODUCT;
        productCounts.set(product, (productCounts.get(product) ?? 0) + Number(row.count));
        countsBySupplier.set(row.last_hull_event_supplier_name, productCounts);
      }
      const total = (slice: Slice) => slice.children.reduce((sum, child) => sum + child.value, 0);
      const built = Array.from(countsBySupplier, ([name, productCounts]) => ({
        name,
        children: Array.from(productCounts, ([productName, value]) => ({ name: productName, value })).sort((a, b) => b.value - a.value),
      })).sort((a, b) => total(b) - total(a));
      setUnknownShare(totalCount > 0 ? unknownCount / totalCount : 0);
      setSlices(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataProvider, filtersKey]);

  // No card. A filtered selection with no known supplier (e.g. a ship type
  // that's never had a DD/NB) keeps the chart's space with a muted note, so the
  // list below never moves.
  return (
    <div style={{ marginBottom: 4, minHeight: CHART_HEIGHT }}>
      <Spin spinning={slices === null}>
        {slices && slices.length > 0 ? (
          <SupplierProductTreemap slices={slices} height={CHART_HEIGHT} unknownShare={unknownShare} />
        ) : (
          <div style={{ height: CHART_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.45 }}>
            {slices && "No known supplier for these vessels"}
          </div>
        )}
      </Spin>
    </div>
  );
};
