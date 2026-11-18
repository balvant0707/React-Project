// Ported 1:1 from the NPM tool (app/src/pages/orders/orderLines.ts).
// An order line as the order page edits it, and its prices: the same definitions as the offer lines
// (lineItemCalc.ts), on the ordered quantity.
import { dealTotals, linePricing, type DiscountInput } from "../specifications/lineItemCalc";
import { newRowKey } from "@rbp/ui";

export type OrderLineRow = {
  key: string;
  id: string | null;
  sequence: number;
  product_packaging_id: string | null;
  // Quantity in the packaging unit (L / kg) and the number of packs; prices are per unit.
  ordered_qty: number | null;
  ordered_packs: number | null;
  sales_price: number | null;
  discount_pct: number | null;
  cost_price: number | null;
};

export const newOrderLineKey = () => newRowKey("orderline");

export const blankOrderLine = (init: Partial<OrderLineRow> & { sequence: number }): OrderLineRow => ({
  key: newOrderLineKey(),
  id: null,
  product_packaging_id: null,
  ordered_qty: null,
  ordered_packs: null,
  sales_price: null,
  discount_pct: null,
  cost_price: null,
  ...init,
});

type PricedLine = Pick<OrderLineRow, "sales_price" | "discount_pct" | "cost_price" | "ordered_qty">;

export const orderLinePricing = (r: PricedLine) =>
  linePricing({ sales_price: r.sales_price, discount_pct: r.discount_pct, cost_price: r.cost_price, quantity: r.ordered_qty });

export const orderTotals = (lines: PricedLine[], discounts: DiscountInput[], transportSurcharge: number | null | undefined) =>
  dealTotals(
    lines.map((r) => ({ total_price: orderLinePricing(r).total_price, sales_price: r.sales_price, cost_price: r.cost_price, quantity: r.ordered_qty })),
    discounts,
    transportSurcharge,
  );
