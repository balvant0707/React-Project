// Ported 1:1 from the NPM tool (app/src/modules/companies/companyVesselRelation.ts).
import type { CrudFilter } from "@rbp/core";
import { COMPANY_ROLE_FIELDS } from "../../utils/crossFilterNav";

// The company ITSELF in each of the four vessel roles (direct assignment), as
// columns on hull_events_overview - what the hull events tab on a company page
// shows as direct matches (the tab also lists subsidiaries via RELATED_FIELDS).
export const HULL_EVENT_DIRECT_ROLE_FIELDS = [
  "resolved_group_owner_company_id",
  "resolved_ship_manager_company_id",
  "resolved_technical_manager_company_id",
  "resolved_operator_company_id",
] as const;

// "Anything this company - or a subsidiary of it - is involved with, in any of
// the four vessel roles" as a query filter: the group-rollup columns (see
// 20260917120000_role_group_company_rollups.sql) match a vessel assigned to the
// company or to a company whose group_company_id points at it, the direct
// columns additionally match the company itself when it is a subsidiary (its
// vessels roll up to its parent, never to itself). Same set the company page's
// big numbers count - see VESSEL_COMPANY_ROLES in crossFilterNav.ts.
const RELATED_FIELDS = [...COMPANY_ROLE_FIELDS, ...HULL_EVENT_DIRECT_ROLE_FIELDS];

// PostgREST .or() string form, for direct supabaseClient queries.
export const companyRelatedOrClause = (companyId: string) => RELATED_FIELDS.map((f) => `${f}.eq.${companyId}`).join(",");

// Refine form, for useList-based components (e.g. the hull events status chart).
export const companyRelatedFilter = (companyId: string): CrudFilter => ({
  operator: "or",
  value: RELATED_FIELDS.map((field) => ({ field, operator: "eq" as const, value: companyId })),
});
