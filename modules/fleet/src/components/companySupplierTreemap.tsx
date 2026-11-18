// Ported 1:1 from the NPM tool (app/src/components/companySupplierTreemap.tsx).
import { useEffect, useState } from "react";
import { Card, Spin, Empty } from "antd";
import dayjs from "dayjs";
import { SupplierProductTreemap, type SupplierSlice } from "./supplierProductTreemap";
import { supabaseClient } from "@rbp/core";
import { companyRelatedOrClause } from "@rbp/module-companies/src/modules/companies/companyVesselRelation.ts";
import { todayIso } from "@rbp/ui";

type Row = {
  id: string;
  vessel_imo: string | null;
  event_date: string | null;
  maker_name: string | null;
  service_period_months: number | null;
};
type EventProduct = { id: string; vertical_af: { name: string } | null };
type Slice = SupplierSlice;

const UNKNOWN_PRODUCT = "Unknown product";
const ID_CHUNK_SIZE = 100;

const PAGE_SIZE = 1000;
// Chart height; the card body reserves it while loading and when empty so the page below does not jump.
const CHART_HEIGHT = 200;

// Area chart of who supplied the coating on each related vessel's most recent
// drydock or newbuilding: one rectangle per supplier, sized by vessel count.
// "Related" is the same set as the overview's big numbers (any of the four
// vessel roles, subordinate companies included - see companyVesselRelation.ts).
//
// Only the LATEST DD/NB event per vessel counts, and events dated after today
// are ignored (a future event is a plan, not a known current product) - so the
// latest event is picked first, and if it has no supplier recorded the vessel
// simply counts as unknown rather than falling back to an older event, which
// would show a product that has since been replaced. A latest event whose service
// period (event_date + service_period_months) is over also counts as unknown,
// matching the overview's "currently with Nippon Paint" number. Vessels are keyed by IMO;
// a newbuilding not yet linked to a vessel falls back to its own event id.
// Each supplier rectangle is split by the vertical-sides antifouling product of
// that same latest event (hull_events.vertical_af_product_id); vessels with a
// supplier but no recorded product form an "Unknown product" sub-rectangle.
//
// totalVessels is the overview's unique-vessel count, used only for the
// "known for X of N" caption; null while that number is still loading.
export const CompanySupplierTreemap = ({ companyId, totalVessels }: { companyId: string; totalVessels: number | null }) => {
  const [slices, setSlices] = useState<Slice[] | null>(null);
  const [knownVessels, setKnownVessels] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSlices(null);
    (async () => {
      const rows: Row[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabaseClient
          .from("hull_events_overview")
          .select("id, vessel_imo, event_date, maker_name, service_period_months")
          .or(companyRelatedOrClause(companyId))
          .in("type_code", ["DD", "NB"])
          .lte("event_date", todayIso())
          .order("event_date", { ascending: false })
          .order("id")
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data) break;
        rows.push(...(data as Row[]));
        if (data.length < PAGE_SIZE) break;
      }
      if (cancelled) return;

      // rows arrive newest first, so the first one seen per vessel is its latest event.
      const latestByVessel = new Map<string, { eventId: string; supplier: string | null }>();
      for (const row of rows) {
        const key = row.vessel_imo ?? row.id;
        if (latestByVessel.has(key)) continue;
        // Same rule as vessels_overview.current_maker: once the latest event's service period is over, the system is unknown.
        const expired =
          row.event_date != null &&
          row.service_period_months != null &&
          dayjs(row.event_date).add(row.service_period_months, "month").isBefore(dayjs(), "day");
        latestByVessel.set(key, { eventId: row.id, supplier: expired ? null : (row.maker_name ?? null) });
      }

      // The overview view has no product columns, so fetch them for the latest events only.
      const eventIds = Array.from(latestByVessel.values(), (latest) => latest.eventId);
      const productByEvent = new Map<string, string>();
      for (let i = 0; i < eventIds.length; i += ID_CHUNK_SIZE) {
        const { data } = await supabaseClient
          .from("hull_events")
          .select("id, vertical_af:antifouling_products!hull_events_vertical_af_product_fkey(name)")
          .in("id", eventIds.slice(i, i + ID_CHUNK_SIZE));
        for (const row of (data ?? []) as unknown as EventProduct[]) {
          if (row.vertical_af?.name) productByEvent.set(row.id, row.vertical_af.name);
        }
      }
      if (cancelled) return;

      const countsBySupplier = new Map<string, Map<string, number>>();
      for (const { eventId, supplier } of latestByVessel.values()) {
        if (!supplier) continue;
        const productCounts = countsBySupplier.get(supplier) ?? new Map<string, number>();
        const product = productByEvent.get(eventId) ?? UNKNOWN_PRODUCT;
        productCounts.set(product, (productCounts.get(product) ?? 0) + 1);
        countsBySupplier.set(supplier, productCounts);
      }
      const total = (slice: Slice) => slice.children.reduce((sum, child) => sum + child.value, 0);
      const built = Array.from(countsBySupplier, ([name, productCounts]) => ({
        name,
        children: Array.from(productCounts, ([productName, value]) => ({ name: productName, value })).sort((a, b) => b.value - a.value),
      })).sort((a, b) => total(b) - total(a));
      setKnownVessels(built.reduce((sum, slice) => sum + total(slice), 0));
      setSlices(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const caption =
    totalVessels && totalVessels > 0
      ? `Current supplier known for ${knownVessels} of ${totalVessels} ships (${Math.round((knownVessels / totalVessels) * 100)}%) in the current fleet`
      : "Current supplier and product by ship";

  return (
    <Card title={caption} size="small" style={{ marginTop: 16 }}>
      <Spin spinning={slices === null}>
        {slices && slices.length > 0 ? (
          <SupplierProductTreemap
            slices={slices}
            height={CHART_HEIGHT}
            unknownShare={totalVessels && totalVessels > knownVessels ? (totalVessels - knownVessels) / totalVessels : undefined}
          />
        ) : (
          <div style={{ minHeight: CHART_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {slices && <Empty description="No drydock or newbuilding with a known supplier yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </div>
        )}
      </Spin>
    </Card>
  );
};
