// Ported 1:1 from the NPM tool (app/src/modules/companies/companyView.ts).
// What the company page shows depends on what the company is (`companies.company_types`) and on its tenant roles
// (`company_teams.roles`). A company we know nothing about yet (no type, no role) shows everything, as before.

const FLEET_TYPES = ["owner", "ship_manager", "technical_manager", "operator"];

export type CompanyView = {
  // Offers and orders for the company (deals_overview.customer_company_id): customer at one of our tenants. "Show Offers & Orders".
  customer: boolean;
  // Owner / manager / operator: the vessel overview (Business Partner tab), the big numbers, the maker chart, "Show Vessels".
  fleet: boolean;
  // Shipyard: "Show Newbuildings".
  shipyard: boolean;
};

export function companyView(types: string[] | null | undefined, tenantRoles: string[]): CompanyView {
  const t = types ?? [];
  if (t.length === 0 && tenantRoles.length === 0) return { fleet: true, customer: true, shipyard: false };
  return {
    fleet: t.some((type) => FLEET_TYPES.includes(type)),
    customer: tenantRoles.includes("customer"),
    shipyard: t.includes("shipyard"),
  };
}
