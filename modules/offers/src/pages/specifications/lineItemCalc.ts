// Ported 1:1 from the NPM tool (app/src/pages/specifications/lineItemCalc.ts).
// Formulas reverse-engineered from the legacy Calculation tab, see
// ~/npm_tool/docs/domain-model.md "Quantity formula". Computed client-side by design
// (not a DB trigger) - see ~/npm_tool/docs/security-findings.md for why.

export type LineItemInputs = {
  quantity_product: number | null;
  thin_pct: number | null;
  sales_price: number | null;
  discount_pct: number | null;
  cost_price: number | null;
  pack_size: number | null;
};

export type LineItemComputed = {
  real_quantity: number | null;
  // Offered quantity in the packaging unit (whole packs) and the number of packs; stored together so the offer
  // keeps its meaning if the product's pack size changes later.
  offered_qty: number | null;
  offered_packs: number | null;
  net_price: number | null;
  gross_profit: number | null;
  gross_profit_pct: number | null;
  total_price: number | null;
  total_gross_profit: number | null;
};

// The Paint List's own editable row shape - computed fields plus the raw
// inputs a user can type into, and the bits needed to persist/key it.
export type LineItemRow = LineItemComputed & {
  key: string;
  id: string | null;
  sequence: number;
  product_packaging_id: string | null;
  quantity_product: number | null;
  thin_pct: number | null;
  sales_price: number | null;
  discount_pct: number | null;
  cost_price: number | null;
  // Line status (migration 20261022100000): a short note, part of the customer's initial request (Seastock
  // only), part of the offer (only these count in totals, PDFs and orders), and the customer's choice (null
  // until accepted / ordered; never sent on save, set by accept_specification / create_order_from_specification).
  comment: string | null;
  is_requested: boolean;
  is_offered: boolean;
  is_accepted: boolean | null;
  // Client-only, never stored: "area" = derived from the Areas tab, "thinner" = the thinner of area paints, "manual" =
  // typed in (Add line, the default Technical Service line). The recompute (paintListRecompute.ts) drops stale area and
  // thinner rows and keeps manual ones; undefined counts as manual.
  origin?: "area" | "manual" | "thinner";
};

// The thinner share of a paint quantity a DD/NB thinner line starts with (the legacy system used 10 % everywhere).
export const DEFAULT_THINNER_PCT = 10;

// Origin of a saved or copied line: "area" if its packaging gets a quantity from the Areas; on a DD/NB specification a
// line with a thinner % that is not an area line is a thinner line (recompute keeps or drops it with the paints).
export function lineOrigin(
  row: { product_packaging_id: string | null; thin_pct: number | null },
  areaQuantityPackagingIds: Set<string>,
  usesAreaBreakdown: boolean,
): "area" | "manual" | "thinner" {
  if (row.product_packaging_id && areaQuantityPackagingIds.has(row.product_packaging_id)) return "area";
  return usesAreaBreakdown && row.thin_pct != null ? "thinner" : "manual";
}

// Pack arithmetic of an offer / order line: a quantity in the packaging unit (L / kg) is ordered in whole packs, so it
// rounds up to the next pack, and the quantity of n packs is n x pack size. The same rule is written out in
// create_order_from_specification (pack count of an offer line saved before offered_packs existed) and in the
// supplier-api Edge Function (packsOf), which cannot import this module: change all three together.
export const packsOfQuantity = (quantity: number, packSize: number) => Math.ceil(quantity / packSize);

export const quantityOfPacks = (packs: number | null | undefined, packSize: number | null | undefined) =>
  packs == null || !packSize ? null : packs * packSize;

export type LinePricing = Pick<LineItemComputed, "net_price" | "gross_profit" | "gross_profit_pct" | "total_price" | "total_gross_profit">;

// Prices of one offer or order line: the line discount gives the net price, the gross profit is per unit on the net
// price, and the totals multiply by the packed quantity. Offer lines (computeLineItem) and order lines use this.
export function linePricing(input: {
  sales_price: number | null;
  discount_pct: number | null;
  cost_price: number | null;
  quantity: number | null;
}): LinePricing {
  const { sales_price, discount_pct, cost_price, quantity } = input;
  const net_price = sales_price == null ? null : sales_price * (1 - (discount_pct ?? 0) / 100);
  const gross_profit = net_price == null || cost_price == null ? null : net_price - cost_price;
  const gross_profit_pct = gross_profit == null || !net_price ? null : (gross_profit / net_price) * 100;
  const total_price = net_price == null || quantity == null ? null : net_price * quantity;
  const total_gross_profit = gross_profit == null || quantity == null ? null : gross_profit * quantity;
  return { net_price, gross_profit, gross_profit_pct, total_price, total_gross_profit };
}

export function computeLineItem(input: LineItemInputs): LineItemComputed {
  const { quantity_product, thin_pct, sales_price, discount_pct, cost_price, pack_size } = input;

  const real_quantity =
    quantity_product == null
      ? null
      : thin_pct
        ? quantity_product * (thin_pct / 100)
        : quantity_product;

  const offered_packs = real_quantity == null || !pack_size ? null : packsOfQuantity(real_quantity, pack_size);
  const offered_qty = quantityOfPacks(offered_packs, pack_size);

  return {
    real_quantity,
    offered_qty,
    offered_packs,
    ...linePricing({ sales_price, discount_pct, cost_price, quantity: offered_qty }),
  };
}

// Only offered lines are part of the offer: they alone count in totals, PDFs, mails and orders.
export const offeredLines = <T extends { is_offered: boolean }>(lines: T[]): T[] => lines.filter((l) => l.is_offered);

// grossPrice: the lines at their sales price before the line discounts; price: after the line discounts (the base the
// header discounts apply to). The totals card shows grossPrice and grossPrice - priceAfterDiscounts as the discount.
export type DealTotals = { grossPrice: number; price: number; priceAfterDiscounts: number; netSales: number; totalCost: number };

// Totals of an offer or an order. The gross profit base is the price after discounts; net sales add the transport /
// customs surcharge. The cost is the lines at their snapshotted cost price.
export function dealTotals(
  lines: { total_price: number | null; sales_price?: number | null; cost_price: number | null; quantity: number | null }[],
  discounts: DiscountInput[],
  transportSurcharge: number | null | undefined,
): DealTotals {
  const price = lines.reduce((sum, r) => sum + (r.total_price ?? 0), 0);
  const grossPrice = lines.reduce(
    (sum, r) => sum + (r.sales_price != null && r.quantity != null ? r.sales_price * r.quantity : (r.total_price ?? 0)),
    0,
  );
  const priceAfterDiscounts = applyDiscounts(price, discounts);
  return {
    grossPrice,
    price,
    priceAfterDiscounts,
    netSales: priceAfterDiscounts + (transportSurcharge ?? 0),
    totalCost: lines.reduce((sum, r) => sum + (r.cost_price ?? 0) * (r.quantity ?? 0), 0),
  };
}

// The offer's totals: its offered lines on the offered quantity.
export const offerTotals = (lines: LineItemRow[], discounts: DiscountInput[], transportSurcharge: number | null | undefined) =>
  dealTotals(
    offeredLines(lines).map((r) => ({ total_price: r.total_price, sales_price: r.sales_price, cost_price: r.cost_price, quantity: r.offered_qty })),
    discounts,
    transportSurcharge,
  );

// Gross profit of a deal: net sales - cost of goods - freight cost (actual, else quoted, else estimated), in % of net sales.
export function grossProfit(netSales: number, totalCost: number, freightCost: number) {
  const value = netSales - totalCost - freightCost;
  return { value, pct: netSales > 0 ? (value / netSales) * 100 : null };
}

// Sequential discount application, per domain-model.md: each named discount
// applies to the running total, not all to the original spec_price. A
// discount is either a percentage of the running total or a fixed amount
// subtracted from it - real legacy/competitor documents use both (e.g. a
// named "Discount on Antifoulings" as a flat amount alongside a percentage
// discount elsewhere).
export type DiscountInput = { discount_type: "pct" | "amount"; pct: number | null; amount: number | null };

export function applyDiscounts(specPrice: number, discountList: DiscountInput[]): number {
  return discountList.reduce(
    (running, d) => (d.discount_type === "amount" ? running - (d.amount ?? 0) : running * (1 - (d.pct ?? 0) / 100)),
    specPrice,
  );
}
