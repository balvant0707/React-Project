// Ported 1:1 from the NPM tool (app/src/pages/orders/orderApi.ts).
// Database access of the order page (show.tsx): every read and write it makes goes through here.
import { supabaseClient } from "@rbp/core";
import type { PhraseOption as Option } from "@rbp/core";
import type { DiscountRow } from "../specifications/mappers";
import { orderLinePricing, type OrderLineRow } from "./orderLines";

// The order status phrases: options, code per phrase id (status color, delete rule) and the "confirmed" one (the
// status of a new order; only a confirmed order may be deleted).
export async function loadOrderStatuses(): Promise<{ options: Option[]; codeById: Map<string, string>; confirmedId: string | null }> {
  const { data } = await supabaseClient.from("phrases").select("id, code, text_en").eq("category", "order_status").order("sequence");
  const rows = data ?? [];
  return {
    options: rows.map((p) => ({ value: p.id, label: p.text_en })),
    codeById: new Map(rows.map((p) => [p.id, p.code])),
    confirmedId: rows.find((p) => p.code === "confirmed")?.id ?? null,
  };
}

// orders references companies twice (supplier_id, customer_company_id), so the supplier embed must name its key.
export async function loadOrder(id: string): Promise<any> {
  const { data, error } = (await supabaseClient
    .from("orders")
    .select(
      "*, order_lines(*), order_discounts(*), vessels(name, imo), specifications(specification_number, version), supplier:companies!orders_supplier_id_fkey(name)",
    )
    .eq("id", id)
    .order("sequence", { referencedTable: "order_lines" })
    .order("sequence", { referencedTable: "order_discounts" })
    .single()) as any;
  if (error) throw error;
  return data;
}

// What a picked hull event fills on a new order.
export async function loadHullEventDefaults(hullEventId: string): Promise<{ vessel_id: string | null; customer_company_id: string | null } | null> {
  const { data } = await supabaseClient.from("hull_events").select("vessel_id, customer_company_id").eq("id", hullEventId).single();
  return data;
}

// Saves header, lines and discounts; a new order gets its number here (generate_manual_order_number). Returns the
// order id. Lines and discounts go in one transaction (replace_order_children); lines keep their id and with it the
// link to the offer line they came from.
export async function saveOrder(params: { id: string | null; header: Record<string, any>; lines: OrderLineRow[]; discounts: DiscountRow[] }): Promise<string> {
  const { header, lines, discounts } = params;
  let orderId = params.id;
  if (!orderId) {
    const { data: orderNumber, error: numberError } = await supabaseClient.rpc("generate_manual_order_number");
    if (numberError) throw numberError;
    const { data, error } = await supabaseClient.from("orders").insert({ ...header, order_number: orderNumber }).select("id").single();
    if (error) throw error;
    orderId = data.id as string;
  } else {
    const { data, error } = await supabaseClient.from("orders").update(header).eq("id", orderId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Could not save - this Order may have been deleted, or you no longer have permission to edit it.");
  }

  const { error } = await supabaseClient.rpc("replace_order_children", {
    p_order_id: orderId,
    p_lines: lines.map((r, i) => {
      const { net_price, total_price } = orderLinePricing(r);
      return {
        id: r.id,
        seq: i + 1,
        product_packaging_id: r.product_packaging_id,
        ordered_qty: r.ordered_qty,
        ordered_packs: r.ordered_packs,
        sales_price: r.sales_price,
        discount_pct: r.discount_pct,
        cost_price: r.cost_price,
        net_price,
        total_price,
      };
    }),
    p_discounts: discounts.map((d, i) => ({
      name: d.name,
      seq: i + 1,
      discount_type: d.discount_type,
      pct: d.discount_type === "pct" ? d.pct : null,
      amount: d.discount_type === "amount" ? d.amount : null,
    })),
  });
  if (error) throw error;
  return orderId;
}

// Stamps the MOF as printed / sent now.
export async function stampOrder(id: string, field: "mof_printed_at" | "mof_sent_at") {
  const { error } = await supabaseClient.from("orders").update({ [field]: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// Soft delete (deleted_at); the lists leave the order out.
export async function deleteOrder(id: string) {
  const { error } = await supabaseClient.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
