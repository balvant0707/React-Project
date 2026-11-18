// Facade over Refine's table hook for list pages (modules never import Refine). Pair it with ListTable from @rbp/ui,
// useListFilterBar and NameSearchInput.
//
// Changed from Refine's useTable: `setFilters` also goes back to page 1. Refine keeps the current page, so a search
// typed on page 3 asked the server for page 3 of the matches (empty, or missing the first matches) and looked as if it
// filtered only the page shown. Refine's own table onChange and search form already reset the page; this covers the
// direct calls (search box, filter chips, the lists' switches).
import { useCallback } from 'react';
import { useTable as useRefineTable } from '@refinedev/antd';

export const useTable = ((props) => {
  const result = useRefineTable(props);
  const { setFilters: setRefineFilters, setCurrentPage } = result;
  const setFilters = useCallback(
    (...args: unknown[]) => {
      (setRefineFilters as (...a: unknown[]) => void)(...args);
      setCurrentPage(1);
    },
    [setRefineFilters, setCurrentPage],
  ) as typeof setRefineFilters;
  return { ...result, setFilters };
}) as typeof useRefineTable;

export { useTable as useListTable };
export type { CrudFilters as ListFilters, CrudSorting as ListSorting } from '@refinedev/core';
