// 1:1 from the NPM tool (app/src/dataProvider.ts). Changed: RPC_RESOURCES comes from the modules' `listRpcs`.
import { dataProvider as supabaseDataProvider, generateFilter, handleError } from "@refinedev/supabase";
import type { DataProvider } from "@refinedev/core";
import type { SupabaseClient } from "@supabase/supabase-js";

// A listed resource is read through its rpc while one of its filters is set (PostgREST still filters, sorts and
// paginates the rows), else through the cheaper plain view; descending sorts put NULLs last to match the rollup indexes.
// `argFilters` turns a filter field into an rpc argument; `orKeyArgs` does the same for an "or" filter by key (its first
// column's values), e.g. the company chips of vessels / hull events answered from indexes instead of the view's joins.

/** A list resource read through an rpc while one of the named filters is set (declared by modules: manifest `listRpcs`). */
export interface ListRpc { rpc: string; argFilters: Record<string, string>; orKeyArgs?: Record<string, string> }

export const dataProvider = (client: SupabaseClient, RPC_RESOURCES: Record<string, ListRpc> = {}): DataProvider => {
  const base = supabaseDataProvider(client);
  return {
    ...base,
    getList: async (params) => {
      const config = RPC_RESOURCES[params.resource];
      const filters = params.filters ?? [];
      const args: Record<string, unknown> = {};
      const rest = filters.filter((f) => {
        if (!("field" in f)) {
          const orArg = f.operator === "or" && "key" in f && f.key ? config?.orKeyArgs?.[f.key] : undefined;
          if (!orArg) return true;
          const conditions = f.value as { field: string; value: unknown }[];
          const ids = [...new Set(conditions.filter((c) => c.field === conditions[0]?.field).map((c) => String(c.value)))];
          if (ids.length > 0) args[orArg] = ids;
          return false;
        }
        const arg = config?.argFilters[f.field];
        if (!arg) return true;
        const value = f.value;
        if (Array.isArray(value) && value.length > 0) args[arg] = value;
        return false;
      });
      if (!config) return base.getList({ ...params, filters: rest });

      const { currentPage = 1, pageSize = 10, mode = "server" } = params.pagination ?? {};
      const countMode = params.meta?.count ?? "exact";
      const select = params.meta?.select ?? "*";
      const query = Object.keys(args).length > 0
        ? client.rpc(config.rpc, args, { count: countMode }).select(select)
        : client.from(params.resource).select(select, { count: countMode });
      if (mode === "server") query.range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
      params.sorters?.forEach((s) => {
        // same "table.field" convention as the package's getList: a dotted field sorts an embedded table
        const [foreignTable, field] = s.field.split(/\.(?=[^.]+$)/);
        const ascending = s.order === "asc";
        if (foreignTable && field) query.order(field, { ascending, nullsFirst: false, foreignTable });
        else query.order(s.field, { ascending, nullsFirst: false });
      });
      rest.forEach((f) => generateFilter(f, query));
      const { data, count, error } = await query;
      if (error) return handleError(error);
      // the rpc rows are untyped here, like the package's own getList
      return { data: (data ?? []) as never[], total: count ?? 0 };
    },
  };
};
