// Ported 1:1 from the NPM tool (app/src/modules/products/packagings.ts).
import { supabaseClient } from "@rbp/core";
import { selectInChunks } from "@rbp/ui";
// PackagingInfo moved here from pages/specifications/areasEditor.tsx (offers), which re-exports it: products sits below offers.
export type PackagingInfo = {
  id: string;
  // The underlying product this packaging belongs to - needed to look up
  // product_overcoating_intervals, which is keyed by product pair, not by
  // packaging (see pdfExport.ts).
  product_id: string;
  label: string;
  // Bare product name/group code, alongside the compound `label` above
  // (code + name + pack size, used for the Paint List's Select) - the
  // Technical Spec PDF's cover page needs the plain name and a way to spot
  // antifouling products specifically (see pdf/antifoulingSummary.ts).
  name: string;
  groupCode: string | null;
  pack_size: number;
  unit: string;
  cost_price: number | null;
  colour: string | null;
  solids_volume_pct: number | null;
  dry_film_thickness_um: number | null;
  // The supplier this packaging is bought from (a spec's lines follow the supplier of its header).
  supplier_id: string | null;
};
import { orFilterTerm } from "@rbp/ui";

// The product catalog for pickers, never loaded whole: it has one row per (product, supplier, pack size) and passes
// the API's 1000-row cap. A specification loads the packagings it uses; others are searched on the server and added
// as they are picked.

const SEARCH_LIMIT = 50;

const toPackagingInfo = (p: any): PackagingInfo => ({
  id: p.id,
  product_id: p.product_id,
  // The colour shade is part of the label: the same product often comes in several shades.
  label: `${p.product_code ?? "?"} - ${p.product_name ?? "?"}${p.colour ? `, ${p.colour}` : ""} (${p.pack_size} ${p.unit})`,
  name: p.product_name ?? "?",
  groupCode: p.product_group_code ?? null,
  pack_size: p.pack_size,
  unit: p.unit ?? "L",
  cost_price: p.latest_cost_price,
  colour: p.colour,
  solids_volume_pct: p.solids_volume_pct,
  dry_film_thickness_um: p.dry_film_thickness_um,
  supplier_id: p.supplier_id ?? null,
});

export async function loadPackagingsByIds(ids: string[]): Promise<PackagingInfo[]> {
  const rows = await selectInChunks<any>(ids, (chunk) =>
    supabaseClient.from("product_packagings_overview").select("*").in("id", chunk),
  );
  return rows.map(toPackagingInfo);
}

// Packagings whose product code or name contains `term`.
// `supplierId` limits the result to that supplier's packagings (a specification offers only its own supplier's products).
export async function searchPackagings(term: string, supplierId?: string | null): Promise<PackagingInfo[]> {
  // The term sits in a PostgREST or() expression, where , ( ) are syntax; LIKE
  // wildcards are escaped so they match literally.
  const safe = orFilterTerm(term);
  if (!safe) return [];
  let query = supabaseClient
    .from("product_packagings_overview")
    .select("*")
    .or(`product_code.ilike.%${safe}%,product_name.ilike.%${safe}%`);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  const { data } = await query
    .order("product_code")
    .order("id")
    .limit(SEARCH_LIMIT);
  return (data ?? []).map(toPackagingInfo);
}

// The default Technical Service line a new DD/NB spec starts with.
export async function findPackagingByProductCode(code: string): Promise<PackagingInfo | null> {
  const { data } = await supabaseClient
    .from("product_packagings_overview")
    .select("*")
    .eq("product_code", code)
    .order("id")
    .limit(1)
    .maybeSingle();
  return data ? toPackagingInfo(data) : null;
}

// Maximum DFT per coat (um) of products that have DFT coefficients (the other products have no limit). The coefficients
// themselves stay on the server (rpc product_max_dft, see dftProposal.ts).
export async function loadMaxDftForProducts(productIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < productIds.length; i += 200) {
    const { data } = await supabaseClient.rpc("product_max_dft", { p_product_ids: productIds.slice(i, i + 200) });
    for (const row of (data ?? []) as { product_id: string; maximum_dft_per_coat_um: number }[]) result.set(row.product_id, Number(row.maximum_dft_per_coat_um));
  }
  return result;
}

// searchSpecificationOptions (reads specifications_overview) moved to offers: modules/offers/src/modules/products/specificationOptions.ts.

const toProductOption = (p: any): { value: string; label: string } => ({ value: p.id, label: `${p.code} - ${p.name}` });

// Bare products (not packagings), searched on the server: the base product a thinner / mix component / overcoating
// "applied over" field points to.
export async function searchProductOptions(term: string): Promise<{ value: string; label: string }[]> {
  const safe = orFilterTerm(term);
  if (!safe) return [];
  const { data } = await supabaseClient
    .from("products")
    .select("id, code, name")
    .or(`code.ilike.%${safe}%,name.ilike.%${safe}%`)
    .order("code")
    .limit(SEARCH_LIMIT);
  return (data ?? []).map(toProductOption);
}

export async function loadProductOptionsByIds(ids: string[]): Promise<{ value: string; label: string }[]> {
  const rows = await selectInChunks<any>(ids, (chunk) => supabaseClient.from("products").select("id, code, name").in("id", chunk));
  return rows.map(toProductOption);
}

// The packagings of `supplierId` for the given products (a supplier switch on a specification looks for the same product
// and pack size at the new supplier).
export async function loadSupplierPackagingsForProducts(productIds: string[], supplierId: string): Promise<PackagingInfo[]> {
  const rows = await selectInChunks<any>(productIds, (chunk) =>
    supabaseClient.from("product_packagings_overview").select("*").eq("supplier_id", supplierId).in("product_id", chunk),
  );
  return rows.map(toPackagingInfo);
}

// The default thinner of products (the id of another product), for the thinner lines of a DD/NB paint list.
export async function loadDefaultThinnerLinks(productIds: string[]): Promise<{ id: string; default_thinner_product_id: string | null; default_thinner_pct: number }[]> {
  return selectInChunks<any>(productIds, (chunk) =>
    supabaseClient.from("products").select("id, default_thinner_product_id, default_thinner_pct").in("id", chunk),
  );
}

// Every packaging of the given products (any supplier).
export async function loadPackagingsForProducts(productIds: string[]): Promise<PackagingInfo[]> {
  const rows = await selectInChunks<any>(productIds, (chunk) =>
    supabaseClient.from("product_packagings_overview").select("*").in("product_id", chunk),
  );
  return rows.map(toPackagingInfo);
}
