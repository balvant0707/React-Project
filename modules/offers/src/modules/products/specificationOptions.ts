// Cut 1:1 out of the NPM tool's modules/products/packagings.ts: it reads specifications_overview,
// which belongs to offers, and products sits below offers. Only renames applied (tenant_name -> team_name).
import { supabaseClient } from "@rbp/core";
import { orFilterTerm } from "@rbp/ui";

const SEARCH_LIMIT = 50;

// Specifications to copy from: matched on number or vessel name, most recent
// first, one small page - not every specification.
export async function searchSpecificationOptions(term: string): Promise<{ value: string; label: string }[]> {
  const safe = orFilterTerm(term);
  if (!safe) return [];
  const { data } = await supabaseClient
    .from("specifications_overview")
    .select("id, specification_number, version, team_name, vessel_name")
    .or(`specification_number.ilike.%${safe}%,vessel_name.ilike.%${safe}%`)
    .order("specification_date", { ascending: false })
    .order("id")
    .limit(SEARCH_LIMIT);
  return (data ?? []).map((s: any) => ({
    value: s.id,
    label: `${s.specification_number} - v${s.version} (${s.vessel_name ?? "?"}, ${s.team_name ?? "?"})`,
  }));
}
