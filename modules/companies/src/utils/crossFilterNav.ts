// Ported 1:1 from the NPM tool (app/src/utils/crossFilterNav.ts).
// Builds a URL query string in the exact bracket-index shape Refine's own
// syncWithLocation produces/parses (qs, arrayFormat "indices" - see
// @refinedev/core's stringifyTableParams/parseTableParams), so navigating
// straight to e.g. `/vessels?${...}` lands on that list with the filter
// already applied via its existing useTable - no special-casing needed on
// the receiving list page.
export type ListFilterTriple = { field: string; operator: string; value: string };

export function buildFilteredListUrl(path: string, filters: ListFilterTriple[]): string {
  const query = filters
    .map(
      (f, i) =>
        `filters[${i}][field]=${encodeURIComponent(f.field)}&filters[${i}][operator]=${encodeURIComponent(f.operator)}&filters[${i}][value]=${encodeURIComponent(f.value)}`,
    )
    .join("&");
  return `${path}?${query}`;
}

// The four SeaWeb ownership roles' GROUP-rollup columns on vessels_overview
// (resolved_group_company_id / resolved_ship_manager_group_company_id /
// resolved_technical_manager_group_company_id /
// resolved_operator_group_company_id - see 20260917120000_role_group_company_rollups.sql)
// - deliberately the walked-up column, not the direct *_company_id one on
// vessels itself: a company whose group_company_id is left at its own
// default (the common case) walks up to itself, so this still matches
// direct assignment too, while a company with subordinates (others whose
// group_company_id points at it) also picks up vessels assigned to THEM.
// "Show Vessels" from a company page is meant to answer "every vessel this
// corporate group is involved with", same as "Show Hull Events" already
// does via resolved_group_company_id - this brings Show Vessels in line
// with that, not a new concept.
export const COMPANY_ROLE_FIELDS = [
  "resolved_group_company_id",
  "resolved_ship_manager_group_company_id",
  "resolved_technical_manager_group_company_id",
  "resolved_operator_group_company_id",
] as const;
// The same four roles by the DIRECT company columns on vessels (no group
// walk-up).
export const COMPANY_OWN_ROLE_FIELDS = [
  "group_owner_company_id",
  "ship_manager_company_id",
  "technical_manager_company_id",
  "operator_company_id",
] as const;
export const COMPANY_ROLES_FILTER_KEY = "companyRoles";

// "Assigned to this company or to any of its subsidiaries", per vessel role.
// One such filter exists for every role, for every company alike (a group head,
// a standalone company and a subsidiary are not told apart): the vessel's
// direct company column matches the company itself, the group-rollup column
// matches the vessels of every company whose group_company_id points at it.
// Neither alone is enough - a subsidiary's vessels roll up to its parent, never
// to itself - so each role is an "or" of both columns. `key` is the id of the
// vessels list's own filter chip for that role (pages/vessels/list.tsx), which
// is what makes the filter visible and removable there.
export const VESSEL_COMPANY_ROLES = {
  owner: { key: "group_owner", fields: ["resolved_group_company_id", "group_owner_company_id"] },
  shipManager: { key: "ship_manager", fields: ["resolved_ship_manager_group_company_id", "ship_manager_company_id"] },
  technicalManager: {
    key: "technical_manager",
    fields: ["resolved_technical_manager_group_company_id", "technical_manager_company_id"],
  },
  operator: { key: "operator", fields: ["resolved_operator_group_company_id", "operator_company_id"] },
} as const;
export type VesselCompanyRole = keyof typeof VESSEL_COMPANY_ROLES;

// A Refine "or" LogicalFilter (one filter whose own value is an array of
// field/operator/value triples, evaluated as OR) at position `index`, encoded in
// the same qs bracket-index shape syncWithLocation itself produces so the
// receiving list's useTable picks it up with no special-casing. It needs a
// `key`: a later setFilters([...]) finds and clears it by key+operator, since a
// LogicalFilter has no single field of its own (see compareFilters in
// @refinedev/core).
function orFilterParts(index: number, key: string, fields: readonly string[], companyId: string): string[] {
  const parts = [`filters[${index}][operator]=or`, `filters[${index}][key]=${key}`];
  fields.forEach((field, i) => {
    parts.push(`filters[${index}][value][${i}][field]=${field}`);
    parts.push(`filters[${index}][value][${i}][operator]=eq`);
    parts.push(`filters[${index}][value][${i}][value]=${encodeURIComponent(companyId)}`);
  });
  return parts;
}

// Plain AND-ed filters after the or-filter at index 0 (the company page's "of
// which Nippon Paint applied" link adds current_maker_is_own).
function extraFilterParts(extraFilters: ListFilterTriple[], startIndex = 1): string[] {
  return extraFilters.flatMap((f, i) => [
    `filters[${i + startIndex}][field]=${encodeURIComponent(f.field)}`,
    `filters[${i + startIndex}][operator]=${encodeURIComponent(f.operator)}`,
    `filters[${i + startIndex}][value]=${encodeURIComponent(f.value)}`,
  ]);
}

// vessels_overview.current_maker_is_own: the vessel's current maker (supplier of
// its latest DD/NB event dated up to today) is our own maker company. The
// "of which Nippon Paint applied" link on the company page and the companies list.
export const NP_FILTER: ListFilterTriple = { field: "current_maker_is_own", operator: "eq", value: "true" };

// Vessels list filtered to one role of a company (and its subsidiaries).
export function buildVesselCompanyRoleUrl(role: VesselCompanyRole, companyId: string, extraFilters: ListFilterTriple[] = []): string {
  const { key, fields } = VESSEL_COMPANY_ROLES[role];
  return `/vessels?${[...orFilterParts(0, key, fields, companyId), ...extraFilterParts(extraFilters)].join("&")}`;
}

// Vessels list filtered to vessels where the company (or a subsidiary) holds ANY
// of the four roles. Shown as the vessels list's "Company (any role)" chip.
export function buildCompanyRolesFilterUrl(companyId: string, extraFilters: ListFilterTriple[] = []): string {
  const fields = [...COMPANY_ROLE_FIELDS, ...COMPANY_OWN_ROLE_FIELDS];
  return `/vessels?${[...orFilterParts(0, COMPANY_ROLES_FILTER_KEY, fields, companyId), ...extraFilterParts(extraFilters)].join("&")}`;
}

// Vessels list filtered by several roles at once (each role AND-ed, each with
// its own chip), e.g. the company page's group-owner/technical-manager/operator
// combination rows.
export function buildVesselCompanyRolesUrl(
  entries: { role: VesselCompanyRole; companyId: string }[],
  extraFilters: ListFilterTriple[] = [],
): string {
  const parts = entries.flatMap(({ role, companyId }, i) =>
    orFilterParts(i, VESSEL_COMPANY_ROLES[role].key, VESSEL_COMPANY_ROLES[role].fields, companyId),
  );
  return `/vessels?${[...parts, ...extraFilterParts(extraFilters, entries.length)].join("&")}`;
}

// Hull events list filtered to one vessel, as the list's "Vessel name / IMO" text
// chip (an or-filter over vessel_name/vessel_imo, key "vessel"). The IMO is unique,
// so the term goes into both fields; the chip reads it back from the first.
export function buildVesselHullEventsUrl(term: string): string {
  const parts = [`filters[0][operator]=or`, `filters[0][key]=vessel`];
  ["vessel_name", "vessel_imo"].forEach((field, i) => {
    parts.push(`filters[0][value][${i}][field]=${field}`);
    parts.push(`filters[0][value][${i}][operator]=contains`);
    parts.push(`filters[0][value][${i}][value]=${encodeURIComponent(term)}`);
  });
  return `/hull-events?${parts.join("&")}`;
}

// List URL with "is one of" filters (what a select chip reads back: operator "in", array value).
export function buildInFiltersUrl(path: string, filters: { field: string; values: string[] }[]): string {
  const parts = filters.flatMap((f, i) => [
    `filters[${i}][field]=${encodeURIComponent(f.field)}`,
    `filters[${i}][operator]=in`,
    ...f.values.map((v, j) => `filters[${i}][value][${j}]=${encodeURIComponent(v)}`),
  ]);
  return `${path}?${parts.join("&")}`;
}

// Hull events list filtered to events where the company (or the owner group it heads) appears in any role: owner,
// ship manager, technical manager or operator (as at the event), customer, shipyard, dealer, facilitating partner or
// maker. Shown as the hull events list's "Company (any role)" chip.
export const HULL_EVENT_COMPANY_ANY_KEY = "companyAny";
export const HULL_EVENT_COMPANY_ANY_FIELDS = [
  "resolved_group_company_id",
  "snapshot_group_owner_company_id",
  "snapshot_ship_manager_company_id",
  "snapshot_technical_manager_company_id",
  "snapshot_operator_company_id",
  "customer_company_id",
  "shipyard_company_id",
  "dealer_company_id",
  "facilitating_partner_company_id",
  "maker_company_id",
] as const;
export function buildCompanyHullEventsUrl(companyId: string): string {
  return `/hull-events?${orFilterParts(0, HULL_EVENT_COMPANY_ANY_KEY, HULL_EVENT_COMPANY_ANY_FIELDS, companyId).join("&")}`;
}
