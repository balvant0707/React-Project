// Ported 1:1 from the NPM tool (app/src/modules/vessels/vessels.ts).
import { supabaseClient } from "@rbp/core";
import { orFilterTerm } from "@rbp/ui";

// Distinct vessels.ship_type_group values - the group an admin mapped the
// SeaWeb ship type to (Admin > Configuration > Ship type groups), else the
// SeaWeb ship type itself - used as the options for the Ship Type filter on
// Vessels, Hull Events and Newbuilding. Read from the vessel_ship_type_groups
// view (one row per distinct value): selecting the column from `vessels`
// itself and de-duplicating here only ever saw the first max_rows = 1000
// vessels, which at ~175k vessels missed most values.
export async function loadDistinctShipTypeGroups(): Promise<{ value: string; label: string }[]> {
  const { data } = await supabaseClient.from("vessel_ship_type_groups").select("ship_type_group").order("ship_type_group");
  return (data ?? []).map((r) => ({ value: r.ship_type_group as string, label: r.ship_type_group as string }));
}

// Same shape as loadDistinctShipTypeGroups, for vessels.status - SeaWeb's own
// status values ("In Service/Commission", "In Casualty Or Repairing", ...).
// No authoritative full list of SeaWeb's possible values exists, so the
// filter's options are derived from whatever's actually present in the
// data (vessel_statuses view), not a hardcoded enum.
export async function loadDistinctVesselStatuses(): Promise<{ value: string; label: string }[]> {
  const { data } = await supabaseClient.from("vessel_statuses").select("status").order("status");
  return (data ?? []).map((r) => ({ value: r.status as string, label: r.status as string }));
}

const VESSEL_SEARCH_LIMIT = 50;

const vesselLabel = (v: { name: string | null; imo: string }) => `${v.name ?? "?"} (${v.imo})`;

// Vessels whose name or IMO contains `term` (server-side, capped) - for the
// vessel pickers. There are ~175k vessels, so a picker must never load them
// all (see components/remoteSelect.tsx).
export async function searchVesselOptions(term: string): Promise<{ value: string; label: string }[]> {
  // The term is embedded in a PostgREST or() expression, where , ( ) are
  // syntax; LIKE wildcards are escaped so they match literally.
  const safe = orFilterTerm(term);
  if (!safe) return [];
  // vessel_search_options + name_sort (lower-cased name) rather than
  // vessels + name: ordering by the plain column lets the planner walk the
  // name index and scan every vessel for a rare term (~450 ms).
  const { data } = await supabaseClient
    .from("vessel_search_options")
    .select("id, name, imo")
    .or(`name.ilike.%${safe}%,imo.ilike.%${safe}%`)
    .order("name_sort")
    .limit(VESSEL_SEARCH_LIMIT);
  return (data ?? []).map((v) => ({ value: v.id as string, label: vesselLabel(v as { name: string | null; imo: string }) }));
}

// Labels for specific vessel ids.
export async function loadVesselOptionsByIds(ids: string[]): Promise<{ value: string; label: string }[]> {
  if (!ids.length) return [];
  const { data } = await supabaseClient.from("vessels").select("id, name, imo").in("id", ids);
  return (data ?? []).map((v) => ({ value: v.id as string, label: vesselLabel(v as { name: string | null; imo: string }) }));
}
