// Ported 1:1 from the NPM tool (app/src/pages/specifications/paintListRecompute.ts).
// The DD/NB Paint List derived from the Areas: one line per packaging the coat lines use (quantity = sum of the
// coat lines), then the manual lines, then one thinner line per thinner packaging. Pure: show.tsx calls it on the
// Paint List tab, before saving and before the quotation PDF (~/npm_tool/docs/domain-model.md "Thinner lines on the DD/NB
// paint list").
import { computeLineItem, DEFAULT_THINNER_PCT, type LineItemRow } from "./lineItemCalc";
import type { AreaRow, PackagingInfo } from "./areasEditor";
import { newRowKey } from "@rbp/ui";

export const newLineKey = () => newRowKey("line");

export type DefaultThinner = { thinnerProductId: string | null; pct: number };

// A line that has nothing typed in yet.
export function blankLineItem(init: Partial<LineItemRow> & { sequence: number }): LineItemRow {
  return {
    key: newLineKey(),
    id: null,
    product_packaging_id: null,
    quantity_product: null,
    thin_pct: null,
    sales_price: null,
    discount_pct: null,
    cost_price: null,
    real_quantity: null,
    offered_qty: null,
    offered_packs: null,
    net_price: null,
    gross_profit: null,
    gross_profit_pct: null,
    total_price: null,
    total_gross_profit: null,
    comment: null,
    is_requested: false,
    is_offered: true,
    is_accepted: null,
    origin: "manual",
    ...init,
  };
}

// A derived line keeps the commercial fields and the line status of the line it replaces (same packaging).
function derivedLine(
  packagingId: string,
  quantity: number,
  thinPct: number | null,
  origin: "area" | "thinner",
  existing: LineItemRow | undefined,
  pkg: PackagingInfo | undefined,
): LineItemRow {
  const sales_price = existing?.sales_price ?? null;
  const discount_pct = existing?.discount_pct ?? null;
  const cost_price = existing?.cost_price ?? pkg?.cost_price ?? null;
  return {
    key: existing?.key ?? newLineKey(),
    id: existing?.id ?? null,
    sequence: 0,
    product_packaging_id: packagingId,
    quantity_product: quantity,
    thin_pct: thinPct,
    sales_price,
    discount_pct,
    cost_price,
    ...computeLineItem({ quantity_product: quantity, thin_pct: thinPct, sales_price, discount_pct, cost_price, pack_size: pkg?.pack_size ?? null }),
    comment: existing?.comment ?? null,
    is_requested: existing?.is_requested ?? false,
    is_offered: existing?.is_offered ?? true,
    is_accepted: existing?.is_accepted ?? null,
    origin,
  };
}

export function recomputeLineItemsFromAreas(input: {
  areas: AreaRow[];
  lineItems: LineItemRow[];
  packagingById: Map<string, PackagingInfo>;
  defaultThinnerByProductId: Map<string, DefaultThinner>;
  thinnerPackagingsByProductId: Map<string, PackagingInfo[]>;
}): LineItemRow[] {
  const { areas, lineItems, packagingById, defaultThinnerByProductId, thinnerPackagingsByProductId } = input;

  const areaQuantity = new Map<string, number>();
  for (const area of areas) {
    for (const p of area.products) {
      if (!p.product_packaging_id || p.quantity_l == null) continue;
      areaQuantity.set(p.product_packaging_id, (areaQuantity.get(p.product_packaging_id) ?? 0) + p.quantity_l);
    }
  }
  const existingByPackaging = new Map(lineItems.filter((li) => li.product_packaging_id).map((li) => [li.product_packaging_id as string, li]));

  const areaRows = [...areaQuantity].map(([packagingId, quantity]) =>
    derivedLine(packagingId, quantity, null, "area", existingByPackaging.get(packagingId), packagingById.get(packagingId)),
  );

  // Thinner demand per thinner packaging: the paints' quantity and the thinner litres (paint x default thinner %).
  // The thinner packaging is the one an earlier pass chose, else the smallest pack of the paint's supplier.
  const thinnerDemand = new Map<string, { quantity: number; thinnerLitres: number }>();
  for (const [packagingId, quantity] of areaQuantity) {
    const paintPkg = packagingById.get(packagingId);
    const link = paintPkg ? defaultThinnerByProductId.get(paintPkg.product_id) : undefined;
    if (!paintPkg || !link?.thinnerProductId) continue;
    const candidates = (thinnerPackagingsByProductId.get(link.thinnerProductId) ?? []).filter((c) => c.supplier_id === paintPkg.supplier_id);
    if (!candidates.length) continue;
    const kept = lineItems.find((li) => li.origin === "thinner" && candidates.some((c) => c.id === li.product_packaging_id));
    const chosen = kept ? candidates.find((c) => c.id === kept.product_packaging_id)! : [...candidates].sort((a, b) => a.pack_size - b.pack_size)[0];
    if (areaQuantity.has(chosen.id)) continue;
    const demand = thinnerDemand.get(chosen.id) ?? { quantity: 0, thinnerLitres: 0 };
    thinnerDemand.set(chosen.id, { quantity: demand.quantity + quantity, thinnerLitres: demand.thinnerLitres + quantity * (link.pct / 100) });
  }
  // Paints sharing a thinner can have different shares: the line carries the weighted average.
  const thinnerRows = [...thinnerDemand].map(([packagingId, { quantity, thinnerLitres }]) =>
    derivedLine(
      packagingId,
      quantity,
      quantity > 0 ? (thinnerLitres / quantity) * 100 : DEFAULT_THINNER_PCT,
      "thinner",
      existingByPackaging.get(packagingId),
      packagingById.get(packagingId),
    ),
  );

  // Manual lines stay. Area and thinner lines of an earlier pass that nothing produces any more are dropped, and a
  // manual line of a packaging that is now an area or thinner line is taken over by that line.
  const manualRows = lineItems
    .filter((li) => li.origin !== "area" && li.origin !== "thinner")
    .filter((li) => !li.product_packaging_id || (!areaQuantity.has(li.product_packaging_id) && !thinnerDemand.has(li.product_packaging_id)))
    .map((li) => ({ ...li, origin: "manual" as const }));

  return [...areaRows, ...manualRows, ...thinnerRows].map((row, i) => ({ ...row, sequence: i + 1 }));
}
