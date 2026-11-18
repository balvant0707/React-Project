// Ported 1:1 from the NPM tool (app/src/pages/specifications/mappers.ts).
// Specification rows between the database and the editor's state: stored rows -> editor rows (`fresh: true` for a
// copy, which gets new keys and no ids), the header form's dates, and the payload of replace_specification_children.
import { newAreaKey, type AreaRow, type AreaProductRow } from "./areasEditor";
import { newRowKey } from "@rbp/ui";
import dayjs, { type Dayjs } from "dayjs";
import { lineOrigin, type LineItemRow } from "./lineItemCalc";
import { newLineKey } from "./paintListRecompute";

export type DiscountRow = {
  key: string;
  id: string | null;
  name: string;
  discount_type: "pct" | "amount";
  pct: number | null;
  amount: number | null;
  sequence: number;
};

export function toDiscountRow(d: any, fresh: boolean): DiscountRow {
  return {
    key: fresh ? newRowKey("discount") : d.id,
    id: fresh ? null : d.id,
    name: d.name,
    discount_type: d.discount_type ?? "pct",
    pct: d.pct,
    amount: d.amount,
    sequence: d.sequence,
  };
}

function toAreaProductRow(p: any, fresh: boolean): AreaProductRow {
  return {
    key: fresh ? newAreaKey() : p.id,
    id: fresh ? null : p.id,
    sequence: p.sequence,
    product_packaging_id: p.product_packaging_id,
    coat_mode_phrase_id: p.coat_mode_phrase_id,
    coat_pct: p.coat_pct,
    application_method_phrase_id: p.application_method_phrase_id,
    loss_factor_pct: p.loss_factor_pct,
    size_m2: p.size_m2,
    dry_film_thickness_um: p.dry_film_thickness_um,
    overcoat_time_minimum_override: p.overcoat_time_minimum_override,
    overcoat_time_maximum_override: p.overcoat_time_maximum_override,
    theoretical_spreading_rate: p.theoretical_spreading_rate,
    coverage_practical: p.coverage_practical,
    quantity_l: p.quantity_l,
    price_per_l: p.price_per_l,
    price_per_m2: p.price_per_m2,
    total_price: p.total_price,
  };
}

// The packagings the coat lines give a quantity (same rule as recomputeLineItemsFromAreas): a stored line of such a
// packaging is an area line.
export function packagingIdsWithAreaQuantity(products: { product_packaging_id: string | null; quantity_l: number | null }[]): Set<string> {
  const set = new Set<string>();
  for (const p of products) {
    if (p.product_packaging_id && p.quantity_l != null) set.add(p.product_packaging_id);
  }
  return set;
}

export function toAreaRow(a: any, fresh: boolean): AreaRow {
  return {
    key: fresh ? newAreaKey() : a.id,
    id: fresh ? null : a.id,
    sequence: a.sequence,
    area_id: a.area_id,
    size_m2: a.size_m2,
    substrate_phrase_id: a.substrate_phrase_id,
    environment_standard_phrase_id: a.environment_standard_phrase_id,
    loss_factor_pct: a.loss_factor_pct,
    surface_preparation_text: a.surface_preparation_text,
    remarks_text: a.remarks_text,
    products: (a.specification_area_products ?? [])
      .slice()
      .sort((x: any, y: any) => x.sequence - y.sequence)
      .map((p: any) => toAreaProductRow(p, fresh)),
  };
}

// A stored line item. `usesAreaBreakdown` and the coat lines decide its origin (lineOrigin). A copy forgets the
// customer's choice: it belongs to the version it was made on.
export function toLineItemRow(r: any, fresh: boolean, areaQuantityPackagingIds: Set<string>, usesAreaBreakdown: boolean): LineItemRow {
  return {
    key: fresh ? newLineKey() : r.id,
    id: fresh ? null : r.id,
    sequence: r.sequence,
    product_packaging_id: r.product_packaging_id,
    quantity_product: r.quantity_product,
    thin_pct: r.thin_pct,
    sales_price: r.sales_price,
    discount_pct: r.discount_pct,
    cost_price: r.cost_price,
    real_quantity: r.real_quantity,
    offered_qty: r.offered_qty,
    offered_packs: r.offered_packs,
    net_price: r.net_price,
    gross_profit: r.gross_profit,
    gross_profit_pct: r.gross_profit_pct,
    total_price: r.total_price,
    total_gross_profit: r.total_gross_profit,
    comment: r.comment,
    is_requested: r.is_requested,
    is_offered: r.is_offered,
    is_accepted: fresh ? null : r.is_accepted,
    origin: lineOrigin(r, areaQuantityPackagingIds, usesAreaBreakdown),
  };
}

// Line items of a stored specification (or a copy source) with their coat lines.
export function toLineItemRows(lineItems: any[], areas: any[], fresh: boolean, usesAreaBreakdown: boolean): LineItemRow[] {
  const areaQuantityPackagingIds = packagingIdsWithAreaQuantity(areas.flatMap((a) => a.specification_area_products ?? []));
  return lineItems.map((r) => toLineItemRow(r, fresh, areaQuantityPackagingIds, usesAreaBreakdown));
}

// The packagings a stored specification uses (line items and coat lines).
export function usedPackagingIds(lineItems: any[], areas: any[]): string[] {
  const ids = [
    ...lineItems.map((r) => r.product_packaging_id),
    ...areas.flatMap((a) => (a.specification_area_products ?? []).map((p: any) => p.product_packaging_id)),
  ];
  return Array.from(new Set<string>(ids.filter(Boolean)));
}

const HEADER_DATE_FIELDS = ["specification_date", "delivery_date_from", "delivery_date"] as const;
// Moments (timestamptz): picked with a time, stored as an ISO instant.
const HEADER_TIMESTAMP_FIELDS = ["request_received_at", "valid_until_at"] as const;

// Stored header -> form values (dates and moments as dayjs).
export function toHeaderFormValues(row: Record<string, any>): Record<string, any> {
  const values: Record<string, any> = { ...row };
  for (const f of [...HEADER_DATE_FIELDS, ...HEADER_TIMESTAMP_FIELDS]) values[f] = row[f] ? dayjs(row[f]) : null;
  return values;
}

// Form values -> stored header (dates as YYYY-MM-DD, moments as ISO instants). Only fields present in the values are
// converted, so a form without a moment field does not clear it.
export function toHeaderPayload(
  values: Record<string, any>,
  dateFields: readonly string[] = HEADER_DATE_FIELDS,
  timestampFields: readonly string[] = HEADER_TIMESTAMP_FIELDS,
): Record<string, any> {
  const payload: Record<string, any> = { ...values };
  for (const f of dateFields) payload[f] = values[f] ? (values[f] as Dayjs).format("YYYY-MM-DD") : null;
  for (const f of timestampFields) if (f in values) payload[f] = values[f] ? (values[f] as Dayjs).toISOString() : null;
  return payload;
}

// Arguments of replace_specification_children. Line ids are kept, so availability answers and order lines stay
// linked across saves. A coat line without a product is a placeholder and is not stored.
export function toChildrenPayload(lineItems: LineItemRow[], discounts: DiscountRow[], areas: AreaRow[]) {
  return {
    p_line_items: lineItems.map((r, i) => ({
      id: r.id,
      comment: r.comment,
      is_requested: r.is_requested,
      is_offered: r.is_offered,
      seq: i + 1,
      product_packaging_id: r.product_packaging_id,
      quantity_product: r.quantity_product,
      thin_pct: r.thin_pct,
      sales_price: r.sales_price,
      discount_pct: r.discount_pct,
      cost_price: r.cost_price,
      real_quantity: r.real_quantity,
      offered_qty: r.offered_qty,
      offered_packs: r.offered_packs,
      net_price: r.net_price,
      gross_profit: r.gross_profit,
      gross_profit_pct: r.gross_profit_pct,
      total_price: r.total_price,
      total_gross_profit: r.total_gross_profit,
    })),
    p_discounts: discounts.map((d, i) => ({
      seq: i + 1,
      name: d.name,
      discount_type: d.discount_type,
      pct: d.discount_type === "pct" ? d.pct : null,
      amount: d.discount_type === "amount" ? d.amount : null,
    })),
    p_areas: areas.map((area) => ({
      area_id: area.area_id,
      size_m2: area.size_m2,
      substrate_phrase_id: area.substrate_phrase_id,
      environment_standard_phrase_id: area.environment_standard_phrase_id,
      loss_factor_pct: area.loss_factor_pct,
      surface_preparation_text: area.surface_preparation_text,
      remarks_text: area.remarks_text,
      products: area.products
        .filter((p) => p.product_packaging_id)
        .map((p, i) => ({
          seq: i + 1,
          product_packaging_id: p.product_packaging_id,
          coat_mode_phrase_id: p.coat_mode_phrase_id,
          coat_pct: p.coat_pct,
          application_method_phrase_id: p.application_method_phrase_id,
          loss_factor_pct: p.loss_factor_pct,
          size_m2: p.size_m2,
          dry_film_thickness_um: p.dry_film_thickness_um,
          overcoat_time_minimum_override: p.overcoat_time_minimum_override,
          overcoat_time_maximum_override: p.overcoat_time_maximum_override,
          theoretical_spreading_rate: p.theoretical_spreading_rate,
          coverage_practical: p.coverage_practical,
          quantity_l: p.quantity_l,
          price_per_l: p.price_per_l,
          price_per_m2: p.price_per_m2,
          total_price: p.total_price,
        })),
    })),
  };
}
