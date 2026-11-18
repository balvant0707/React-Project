// Ported 1:1 from the NPM tool (app/src/pages/orders/pdfExport.ts).
import { incotermText } from "../../modules/phrases/incoterm";
import type { MofPdfData } from "../../pdf/MofPdf";
import type { QuotationPdfData } from "../../pdf/QuotationPdf";
import { orderLinePricing, orderTotals, type OrderLineRow } from "./orderLines";
import type { DiscountRow } from "../specifications/mappers";
import type { PackagingInfo } from "../specifications/areasEditor";
import type { PhraseOption as Option } from "@rbp/core";

type OrderLineLike = Pick<OrderLineRow, "product_packaging_id" | "ordered_qty" | "ordered_packs" | "sales_price" | "discount_pct" | "cost_price">;

export function buildMofPdfData(args: {
  values: any;
  order: any;
  lines: OrderLineLike[];
  packagingById: Map<string, PackagingInfo>;
  countryOptions: Option[];
  incotermOptions: Option[];
}): MofPdfData {
  const { values, order, lines, packagingById, countryOptions, incotermOptions } = args;
  const countryLabel = countryOptions.find((c) => c.value === values.customer_country_id)?.label ?? null;

  return {
    orderReference: order?.order_number ?? order?.id ?? "draft",
    requestedDateFrom: values.requested_date_from ? values.requested_date_from.format("YYYY-MM-DD") : null,
    requestedDate: values.requested_date ? values.requested_date.format("YYYY-MM-DD") : null,
    supplierName: order?.supplier?.name ?? null,
    vesselName: order?.vessels?.name ?? null,
    vesselImo: order?.vessels?.imo ?? null,
    deliveryPort: values.delivery_port ?? null,
    incoterm: incotermText(incotermOptions, values.incoterm_phrase_id, values.incoterm_place),
    customerName: values.customer_name ?? null,
    customerAddressLine: values.customer_address_line ?? null,
    customerCity: values.customer_city ?? null,
    customerPostalCode: values.customer_postal_code ?? null,
    customerCountryLabel: countryLabel,
    customerPoNumber: values.customer_po_number ?? null,
    lines: lines
      .filter((l) => l.product_packaging_id)
      .map((l) => {
        const pkg = packagingById.get(l.product_packaging_id!);
        return {
          productLabel: pkg?.label ?? pkg?.name ?? "—",
          packSize: pkg?.pack_size ?? null,
          unit: pkg?.unit ?? null,
          orderedPacks: l.ordered_packs,
          orderedQty: l.ordered_qty,
        };
      }),
  };
}

// The customer's order confirmation: the quotation layout with the order's lines (prices per unit, so the line
// total is the net price x the ordered quantity), discounts and surcharge.
export function buildOrderConfirmationPdfData(args: {
  values: Record<string, any>;
  order: any;
  lines: OrderLineLike[];
  discounts: DiscountRow[];
  packagingById: Map<string, PackagingInfo>;
  tenantOptions: Option[];
  countryOptions: Option[];
  incotermOptions: Option[];
  termsAndConditionsText: string | null;
}): QuotationPdfData {
  const { values, order, lines, discounts, packagingById, tenantOptions, countryOptions, incotermOptions, termsAndConditionsText } = args;
  const items = lines
    .filter((l) => l.product_packaging_id && l.ordered_qty)
    .map((l) => {
      const pkg = packagingById.get(l.product_packaging_id!);
      return {
        productLabel: pkg?.label ?? pkg?.name ?? "—",
        offeredQty: l.ordered_qty,
        offeredPacks: l.ordered_packs,
        packSize: pkg?.pack_size ?? null,
        unit: pkg?.unit ?? null,
        salesPrice: l.sales_price ?? null,
        discountPct: l.discount_pct ?? null,
        totalPrice: orderLinePricing(l).total_price,
      };
    });
  const surcharge = values.transport_customs_surcharge ?? null;
  const { price: specPrice, priceAfterDiscounts, netSales } = orderTotals(
    lines.filter((l) => l.product_packaging_id && l.ordered_qty),
    discounts,
    surcharge,
  );
  const date = (v: any) => (v ? v.format("YYYY-MM-DD") : null);
  return {
    documentTitle: "Order Confirmation",
    customerPoNumber: values.customer_po_number ?? null,
    specificationNumber: order?.order_number ?? "",
    version: null,
    specificationDate: order?.created_at ? String(order.created_at).slice(0, 10) : null,
    deliveryDateFrom: date(values.requested_date_from),
    deliveryDate: date(values.requested_date),
    validUntilText: null,
    tenantName: tenantOptions.find((o) => o.value === (order?.team_id ?? values.team_id))?.label ?? null,
    supplierName: order?.supplier?.name ?? null,
    vesselName: order?.vessels?.name ?? null,
    vesselImo: order?.vessels?.imo ?? null,
    deliveryPort: values.delivery_port ?? null,
    incoterm: incotermText(incotermOptions, values.incoterm_phrase_id, values.incoterm_place),
    placeOfApplication: null,
    currency: values.currency ?? null,
    customerName: values.customer_name ?? null,
    customerAddressLine: values.customer_address_line ?? null,
    customerCity: values.customer_city ?? null,
    customerPostalCode: values.customer_postal_code ?? null,
    customerCountry: countryOptions.find((c) => c.value === values.customer_country_id)?.label ?? null,
    customerTelephone: values.customer_telephone ?? null,
    contactPerson: values.contact_person ?? null,
    remarksText: null,
    termsAndConditionsText,
    isDrydock: false,
    areas: [],
    lineItems: items,
    discounts: discounts.map((d) => ({ name: d.name, discount_type: d.discount_type, pct: d.pct, amount: d.amount })),
    specPrice,
    priceAfterDiscounts,
    transportSurcharge: surcharge,
    netSales,
    showDraftWatermark: false,
  };
}
