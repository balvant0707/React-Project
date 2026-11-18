import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { parseTableParams, type CrudFilters } from "@refinedev/core";

// Refine's useTable reads the URL's filters only on mount, so a query-string change on the same list (a link, Back) left
// the table stale. This reads the URL back into state; Refine's own `replace` writes are ignored, so nothing echoes.
export function useUrlFilterSync(
  filters: CrudFilters,
  setFilters: (filters: CrudFilters, behavior: "replace") => void,
  setCurrentPage: (page: number) => void,
) {
  const { search } = useLocation();
  const navigationType = useNavigationType();
  // Read inside the effect without being a dependency: only a URL change syncs.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const previousSearch = useRef(search);

  useEffect(() => {
    if (search === previousSearch.current) return;
    previousSearch.current = search;
    if (navigationType === "REPLACE") return;
    const urlFilters = parseTableParams(search || "?").parsedFilters;
    if (JSON.stringify(urlFilters) === JSON.stringify(filtersRef.current)) return;
    setFilters(urlFilters, "replace");
    setCurrentPage(1);
  }, [search, navigationType, setFilters, setCurrentPage]);
}
