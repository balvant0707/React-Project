// Ported 1:1 from the NPM tool (app/src/modules/companies/companies.ts).
import { supabaseClient } from "@rbp/core";
import { fetchAllPages } from "@rbp/ui";
import { escapeLike } from "@rbp/ui";

export type CompanyOption = { value: string; label: string };
// Tenant-specific relations (company_teams.roles) ...
export type CompanyRole = "customer" | "supplier";
// ... and company types (companies.company_types): properties of the company itself, valid for every tenant. The
// vessel-role types are added automatically as soon as a vessel uses the company in that role.
export type CompanyType = "shipyard" | "maker" | "dealer" | "facilitating_partner" | "owner" | "ship_manager" | "technical_manager" | "operator" | "forwarder";
export const COMPANY_TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: "shipyard", label: "Shipyard" },
  { value: "maker", label: "Maker" },
  { value: "dealer", label: "Dealer" },
  { value: "facilitating_partner", label: "Facilitating Partner" },
  { value: "owner", label: "Owner" },
  { value: "ship_manager", label: "Ship Manager" },
  { value: "technical_manager", label: "Technical Manager" },
  { value: "operator", label: "Operator" },
  { value: "forwarder", label: "Forwarder" },
];
const COMPANY_TYPES = COMPANY_TYPE_OPTIONS.map((o) => o.value) as string[];
const isCompanyType = (role: string): role is CompanyType => COMPANY_TYPES.includes(role);

// Every option label includes the company's own country ("Name, Country"),
// same convention as everywhere else a company is shown (companyWithGroup) -
// omitted only when the company has none set.
const withCountry = (name: string, country: string | null | undefined) => (country ? `${name}, ${country}` : name);

// Companies are shared across all tenants. 'customer' and 'supplier' are assigned per tenant (company_teams.roles):
// pass tenantId to scope to one tenant's assignment (e.g. a specification's own tenant); omit it for "any tenant".
// A company type (maker, dealer, ...) belongs to the company itself, so tenantId does not apply to it.
// Loads every company with the role/type - fine for a short list (makers, dealers, partners, suppliers); for a
// large one (shipyards, owners, operators ...) search on the server with searchCompanyOptions(term, type).
export async function loadCompanyOptions(role: CompanyRole | CompanyType, tenantId?: string | null): Promise<CompanyOption[]> {
  // The API returns at most 1000 rows per request: read every page.
  const byId = new Map<string, string>();
  if (isCompanyType(role)) {
    const data = await fetchAllPages<any>((from, to) =>
      supabaseClient
        .from("companies")
        .select("id, name, countries(name_en)")
        .contains("company_types", [role])
        .order("id")
        .range(from, to),
    );
    for (const row of data) byId.set(row.id, withCountry(row.name, row.countries?.name_en));
  } else {
    const data = await fetchAllPages<any>((from, to) => {
      let query = supabaseClient
        .from("company_teams")
        .select("company_id, companies(name, countries(name_en))")
        .contains("roles", [role])
        .order("id")
        .range(from, to);
      if (tenantId) query = query.eq("team_id", tenantId);
      return query;
    });
    for (const row of data) {
      const name = row.companies?.name;
      if (name) byId.set(row.company_id, withCountry(name, row.companies?.countries?.name_en));
    }
  }
  return Array.from(byId, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

// (There is deliberately no "load every company" loader: with tens of
// thousands of companies and the API's 1000-row response cap it would return
// only the first 1000 alphabetically. Use the server-side search below.)

// Every known country (public.countries, prepopulated with the full ISO
// 3166-1 list - see 20260913100000_countries_table.sql) - used as the
// country half of every compound name+country filter (Vessels' Operator/
// Ship Manager/Technical Manager - still plain SeaWeb free text, unlinked -
// and Companies' City/Country, which IS FK'd to this table). Previously
// derived from companies.country's own distinct values, which only ever
// reflected whatever text happened to already exist; sourcing from
// countries directly gives every filter the full list instead.
export async function loadDistinctCountries(): Promise<CompanyOption[]> {
  const { data } = await supabaseClient.from("countries").select("name_en").order("name_en");
  return (data ?? []).map((c) => ({ value: c.name_en, label: c.name_en }));
}

// --- Server-side company search --------------------------------------------
// There are tens of thousands of companies (every SeaWeb owner/manager/
// operator becomes one), and the API returns at most max_rows = 1000 rows per
// request, so the load-everything loaders above silently return only the
// first 1000 alphabetically. Dropdowns over companies therefore search on the
// server as the user types (see components/remoteSelect.tsx) and resolve the
// labels of already-selected ids separately.

const SEARCH_LIMIT = 50;

// Escape LIKE wildcards so a typed "%" or "_" is matched literally.

type OverviewRow = { id: string; name: string; country: string | null; group_company_name: string | null };

// Label "Name, Country (Group)" - the group in brackets when the company has
// one, so a Select shows it on the selected value too.
const groupLabel = (c: OverviewRow) => {
  const base = withCountry(c.name, c.country);
  return c.group_company_name ? `${base} (${c.group_company_name})` : base;
};

// Both lookups read company_search_options, not companies_overview: the
// latter also computes each company's vessel roll-up, which a dropdown label
// doesn't need and which is slow for large groups.

// Companies whose name contains `term`, best alphabetical first, capped.
// `role` restricts to companies holding that role in any tenant, or - with
// `tenantId` - in that one tenant (same semantics as loadCompanyOptions).
async function searchCompanyRows(term: string, role?: CompanyRole | CompanyType, tenantId?: string | null): Promise<OverviewRow[]> {
  let query = supabaseClient
    .from("company_search_options")
    .select("id, name, country, group_company_name")
    .ilike("name", `%${escapeLike(term)}%`)
    // name_sort (lower-cased name), not name: ordering by the plain column
    // makes the planner walk the name index and scan everything for rare terms.
    .order("name_sort")
    .limit(SEARCH_LIMIT);
  if (role && isCompanyType(role)) query = query.contains("company_types", [role]);
  else if (role && tenantId) query = query.contains("team_roles", [`${tenantId}:${role}`]);
  else if (role) query = query.contains("all_roles", [role]);
  const { data } = await query;
  return (data ?? []) as OverviewRow[];
}

async function loadCompanyRowsByIds(ids: string[]): Promise<OverviewRow[]> {
  if (!ids.length) return [];
  const { data } = await supabaseClient.from("company_search_options").select("id, name, country, group_company_name").in("id", ids);
  return (data ?? []) as OverviewRow[];
}

// Labels "Name, Country (Group)".
export async function searchCompanyOptionsWithGroup(
  term: string,
  role?: CompanyRole | CompanyType,
  tenantId?: string | null,
): Promise<CompanyOption[]> {
  return (await searchCompanyRows(term, role, tenantId)).map((c) => ({ value: c.id, label: groupLabel(c) }));
}

// Labels for specific company ids (values restored from the URL or a record).
export async function loadCompanyOptionsWithGroupByIds(ids: string[]): Promise<CompanyOption[]> {
  return (await loadCompanyRowsByIds(ids)).map((c) => ({ value: c.id, label: groupLabel(c) }));
}

// Same lookups with the plain "Name, Country" label (no group suffix) - for
// pickers where the group is irrelevant or shown separately.
export async function searchCompanyOptions(term: string, role?: CompanyRole | CompanyType): Promise<CompanyOption[]> {
  return (await searchCompanyRows(term, role)).map((c) => ({ value: c.id, label: withCountry(c.name, c.country) }));
}

export async function loadCompanyOptionsByIds(ids: string[]): Promise<CompanyOption[]> {
  return (await loadCompanyRowsByIds(ids)).map((c) => ({ value: c.id, label: withCountry(c.name, c.country) }));
}

// The customer fields an offer or order prints, filled from a picked company (still editable afterwards).
export async function loadCustomerAddressFields(companyId: string) {
  const { data: company } = await supabaseClient
    .from("companies")
    .select("name, address_line, city, postal_code, country_id, telephone")
    .eq("id", companyId)
    .single();
  if (!company) return null;
  return {
    customer_name: company.name,
    customer_address_line: company.address_line,
    customer_city: company.city,
    customer_postal_code: company.postal_code,
    customer_country_id: company.country_id,
    customer_telephone: company.telephone,
  };
}
