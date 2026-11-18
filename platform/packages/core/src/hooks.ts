// The facade modules use instead of Refine. Grows as modules need it (see docs/architecture.md section 4).
import { useCallback } from 'react';
import { useGetIdentity, useLogout as useRefineLogout, useCan as useRefineCan } from '@refinedev/core';

export interface Identity { id: string; email?: string }

export function useIdentity(): { identity: Identity | undefined; isLoading: boolean } {
  const { data, isLoading } = useGetIdentity<Identity>();
  return { identity: data, isLoading };
}

export function useLogout() {
  const { mutate } = useRefineLogout();
  return useCallback(() => mutate(), [mutate]);
}

export function useCan(resource: string, action: string) {
  const { data } = useRefineCan({ resource, action });
  return { can: data?.can ?? false };
}

// Refine hooks used by the pages taken over from the NPM tool, passed through under their own names so the ported code only
// changes its import path. Refine's useCan is `useCanAccess` here: `useCan` above is the facade's own.
export {
  useGetIdentity, useDataProvider, useNotification, useDelete, useList, useOne, useWarnAboutChange, useBreadcrumb,
  useNavigation, useResourceParams, useInvalidate, useCan as useCanAccess,
  // COMPASS asset list (a list URL with Refine's synced filters).
  stringifyTableParams,
} from '@refinedev/core';
export type { CrudFilters, CrudFilter, LogicalFilter, ConditionalFilter, CrudSorting, CrudSort, BaseRecord, HttpError } from '@refinedev/core';
export { useModalForm, useForm, useSelect } from '@refinedev/antd';
// useTable goes back to page 1 when the filters change (kit/useListTable.ts).
export { useTable } from './kit/useListTable';
