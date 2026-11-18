// Ported 1:1 from the NPM tool (app/src/pages/specifications/specificationApi.ts).
// Database access of the specification page (show.tsx): every read and write it makes goes through here.
import { supabaseClient } from "@rbp/core";
import { loadDefaultTenantId } from "@rbp/module-companies/src/modules/users/users.ts";
import { normalizeProductName } from "@rbp/module-products/src/components/antifoulingProductSelect.tsx";
import { toChildrenPayload } from "./mappers";
import type { LineItemRow } from "./lineItemCalc";
import type { AreaRow } from "./areasEditor";
import type { DiscountRow } from "./mappers";
import type { OvercoatingIntervalRecord } from "./pdfExport";

// A specification with its children (line items, discounts, areas with coat lines) and the caller's rights.
const SPECIFICATION_SELECT =
  "*, hull_events(type_phrase_id, event_date, phrases(code, text_en)), vessels(name, imo), specification_line_items(*), specification_discounts(*), specification_areas(*, specification_area_products(*)), " +
  "can_edit:specifications_can_edit, can_approve:specifications_can_approve, is_latest_version:specifications_is_latest_version";

export async function loadSpecification(id: string): Promise<any> {
  const { data } = await supabaseClient
    .from("specifications")
    .select(SPECIFICATION_SELECT)
    .eq("id", id)
    .order("sequence", { referencedTable: "specification_line_items" })
    .order("sequence", { referencedTable: "specification_discounts" })
    .order("sequence", { referencedTable: "specification_areas" })
    .single();
  return data;
}

// A fresh specification number: per hull event for DD/NB, the Seastock series otherwise.
export async function nextSpecificationNumber(hullEventId: string | null): Promise<string> {
  const { data } = hullEventId
    ? await supabaseClient.rpc("generate_specification_number_for_hull_event", { p_hull_event_id: hullEventId })
    : await supabaseClient.rpc("generate_seastock_specification_number");
  return data;
}

// The next version of a specification number (max + 1).
export async function nextVersion(specificationNumber: string): Promise<number> {
  const { data } = await supabaseClient
    .from("specifications")
    .select("version")
    .eq("specification_number", specificationNumber)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

// A new, unsaved specification: always version 1 with a fresh number, tenant = the user's default tenant. A DD/NB
// specification belongs to a hull event (its vessel and customer are copied as defaults; the insert trigger
// copy_hull_event_vessel_to_specification does the real vessel copy), a Seastock offer to a vessel only.
export async function newSpecificationDraft(params: { hullEventId: string | null; vesselId: string | null; userId?: string }): Promise<any> {
  const { hullEventId, vesselId, userId } = params;
  if (hullEventId) {
    const { data: hullEvent } = await supabaseClient
      .from("hull_events")
      .select("id, vessel_id, type_phrase_id, event_date, customer_company_id, phrases(code, text_en), vessels(name, imo)")
      .eq("id", hullEventId)
      .single();
    if (!hullEvent) return null;
    const [specificationNumber, tenantId] = await Promise.all([nextSpecificationNumber(hullEventId), loadDefaultTenantId(userId)]);
    return {
      hull_event_id: hullEvent.id,
      vessel_id: hullEvent.vessel_id,
      specification_number: specificationNumber,
      version: 1,
      status: "draft",
      team_id: tenantId,
      customer_company_id: hullEvent.customer_company_id ?? null,
      hull_events: { phrases: hullEvent.phrases, event_date: hullEvent.event_date },
      vessels: hullEvent.vessels,
    };
  }
  const { data: vessel } = await supabaseClient.from("vessels").select("id, name, imo").eq("id", vesselId).single();
  if (!vessel) return null;
  const [specificationNumber, tenantId] = await Promise.all([nextSpecificationNumber(null), loadDefaultTenantId(userId)]);
  return { vessel_id: vessel.id, specification_number: specificationNumber, version: 1, status: "draft", team_id: tenantId, vessels: vessel };
}

// Everything a copy takes over from a source specification.
export async function loadCopySource(sourceId: string) {
  const [{ data: spec }, { data: lineItems }, { data: discounts }, { data: areas }] = await Promise.all([
    supabaseClient.from("specifications").select("*").eq("id", sourceId).single(),
    supabaseClient.from("specification_line_items").select("*").eq("specification_id", sourceId).order("sequence"),
    supabaseClient.from("specification_discounts").select("*").eq("specification_id", sourceId).order("sequence"),
    supabaseClient.from("specification_areas").select("*, specification_area_products(*)").eq("specification_id", sourceId).order("sequence"),
  ]);
  return { spec, lineItems: lineItems ?? [], discounts: discounts ?? [], areas: areas ?? [] };
}

// Saves header and children; the children go in one transaction (replace_specification_children), so a failure
// leaves them as they were. Returns the specification id.
export async function saveSpecification(params: {
  id: string | null;
  header: Record<string, any>;
  hullEventId: string | null;
  vesselId: string | null;
  lineItems: LineItemRow[];
  discounts: DiscountRow[];
  areas: AreaRow[];
}): Promise<string> {
  const { header, lineItems, discounts, areas } = params;
  let specId = params.id;
  if (!specId) {
    const { data: created, error } = await supabaseClient
      .from("specifications")
      .insert({ ...header, hull_event_id: params.hullEventId, vessel_id: params.vesselId, version: header.version ?? 1 })
      .select()
      .single();
    if (error) throw error;
    specId = created.id as string;
  } else {
    await updateSpecification(specId, header, "Could not save - this Specification may have been deleted, or you no longer have permission to edit it.");
  }
  const { error } = await supabaseClient.rpc("replace_specification_children", {
    p_specification_id: specId,
    ...toChildrenPayload(lineItems, discounts, areas),
  });
  if (error) throw error;
  return specId;
}

// An update that RLS silently filters out returns no row: that is reported as `notFoundMessage`.
async function updateSpecification(id: string, patch: Record<string, any>, notFoundMessage: string) {
  const { data, error } = await supabaseClient.from("specifications").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(notFoundMessage);
}

export const setSpecificationStatus = (id: string, status: "under_review" | "approved" | "draft") =>
  updateSpecification(id, { status }, "Could not update - this Specification may have been deleted, or you no longer have permission.");

// Accepts the chosen lines (pack counts only for Seastock, where accepting creates the order). Throws the
// PostgREST error, code 23505 = another version is already accepted for the hull event.
export async function acceptSpecification(id: string, lineItemIds: string[], packs: Record<string, number> | null) {
  const { error } = await supabaseClient.rpc("accept_specification", {
    p_specification_id: id,
    p_line_item_ids: lineItemIds,
    p_quantities: packs,
  });
  if (error) throw error;
}

export async function createOrderFromSpecification(id: string, lineItemIds: string[], packs: Record<string, number> | null): Promise<string> {
  const { data, error } = await supabaseClient.rpc("create_order_from_specification", {
    p_specification_id: id,
    p_line_item_ids: lineItemIds,
    p_quantities: packs,
  });
  if (error) throw error;
  return data;
}

export async function latestOrderId(specificationId: string): Promise<string | null> {
  const { data } = await supabaseClient
    .from("orders")
    .select("id")
    .eq("specification_id", specificationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// Accepting writes the specification's antifoulings onto the hull event (apply_specification_af_products). Returns
// one line per hull event product that would be replaced: another maker's, or a different product of ours.
export async function antifoulingOverwrites(hullEventId: string, specificationId: string): Promise<string[]> {
  const [heResult, namesResult, ownResult] = await Promise.all([
    supabaseClient
      .from("hull_events")
      .select(
        "vertical_af:antifouling_products!hull_events_vertical_af_product_fkey(name, supplier_id), " +
          "flat_bottom_af:antifouling_products!hull_events_flat_bottom_af_product_fkey(name, supplier_id)",
      )
      .eq("id", hullEventId)
      .single(),
    supabaseClient.rpc("specification_antifouling_names", { p_specification_id: specificationId }),
    supabaseClient.rpc("own_maker_company_id"),
  ]);
  if (heResult.error) throw heResult.error;
  if (namesResult.error) throw namesResult.error;
  if (ownResult.error) throw ownResult.error;
  const he: any = heResult.data;
  const derived: any = Array.isArray(namesResult.data) ? namesResult.data[0] : namesResult.data;
  const rows: [string, { name: string; supplier_id: string } | null, string | null][] = [
    ["Vertical sides", he?.vertical_af ?? null, derived?.vertical_name ?? null],
    ["Flat bottom", he?.flat_bottom_af ?? null, derived?.flat_bottom_name ?? null],
  ];
  return rows
    .filter(([, current, next]) => current && (current.supplier_id !== ownResult.data || (next && normalizeProductName(current.name) !== normalizeProductName(next))))
    .map(([label, current, next]) => `${label}: ${current!.name} → ${next ?? "(cleared)"}`);
}

// Overcoating intervals are per supplier: the specification's header supplier, never each coat's packaging supplier.
export async function loadOvercoatingIntervals(productIds: string[], supplierId: string | null | undefined): Promise<OvercoatingIntervalRecord[]> {
  if (!productIds.length || !supplierId) return [];
  const { data } = await supabaseClient.from("product_overcoating_intervals").select("*").in("product_id", productIds).eq("supplier_id", supplierId);
  return data ?? [];
}

// Marks the offer as sent to the customer (or takes the mark back); also possible on an approved offer the user may
// not edit (rpc mark_specification_sent, migration 20261105100000).
export async function markSpecificationSent(id: string, sent: boolean, sentAt?: string | null) {
  const { error } = await supabaseClient.rpc("mark_specification_sent", { p_specification_id: id, p_sent: sent, p_sent_at: sentAt ?? null });
  if (error) throw error;
}

// The offer's "valid until" moment on its own (from the availability response dialog).
export const saveSpecificationValidUntil = (id: string, validUntilAt: string | null) =>
  updateSpecification(id, { valid_until_at: validUntilAt }, "Could not save - you may no longer have permission to edit this offer.");

// The default supplier for a delivery country (Configuration > Default suppliers): the tenant's own row, else the
// row for all tenants (team_id null), else null.
export async function loadDefaultSupplierId(tenantId: string | null | undefined, countryId: string | null | undefined): Promise<string | null> {
  if (!countryId) return null;
  let query = supabaseClient.from("country_default_suppliers").select("team_id, supplier_company_id").eq("country_id", countryId);
  query = tenantId ? query.or(`team_id.eq.${tenantId},team_id.is.null`) : query.is("team_id", null);
  const { data } = await query;
  const rows = (data ?? []) as { team_id: string | null; supplier_company_id: string }[];
  return (rows.find((r) => r.team_id === tenantId) ?? rows.find((r) => r.team_id === null))?.supplier_company_id ?? null;
}
