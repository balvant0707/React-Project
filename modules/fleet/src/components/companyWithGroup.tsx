// Ported 1:1 from the NPM tool (app/src/components/companyWithGroup.tsx).
import { Link } from "react-router-dom";

// A resolved company, with its own group company (companies.group_company_id)
// linked in brackets when it's actually a different company - shared by
// hullEvents/show.tsx (Descriptions.Item), hullEvents/list.tsx and
// vessels/list.tsx (their Ownership/Companies columns), which all need the
// same "primary company, falling back to a snapshot company if nothing
// resolves live" chaining - see each call site for how they combine two
// calls with ??. Returns null (not a "—" placeholder) when there's no
// company at all, so call sites can chain.
//
// Country is always shown alongside the name ("Name, Country"), same
// convention as everywhere else a company appears (dropdown options,
// vessels/edit.tsx's ownership fields) - omitted only when the company
// itself has none set (most auto-created ones do, via
// get_or_create_seaweb_company's own country resolution, but a manually
// entered company might not).
//
// The links stop click propagation - without it, a click here also
// triggers the table row's own onClick (see clickableRow in
// utils/tableFilter.tsx) and navigates to the row's own record instead of
// the company just clicked.
const label = (name: string, country: string | null | undefined) => (country ? `${name}, ${country}` : name);

export const companyWithGroup = (
  id: string | null | undefined,
  name: string | null | undefined,
  country: string | null | undefined,
  groupId: string | null | undefined,
  groupName: string | null | undefined,
  groupCountry: string | null | undefined,
) => {
  if (!id || !name) return null;
  const showGroup = groupId && groupName && groupId !== id;
  return (
    <>
      <Link to={`/companies/${id}`} onClick={(e) => e.stopPropagation()}>
        {label(name, country)}
      </Link>
      {showGroup && (
        <>
          {" ("}
          <Link to={`/companies/${groupId}`} onClick={(e) => e.stopPropagation()}>
            {label(groupName, groupCountry)}
          </Link>
          {")"}
        </>
      )}
    </>
  );
};
