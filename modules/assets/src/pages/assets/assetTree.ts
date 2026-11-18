// Ported 1:1 from COMPASS (app/src/pages/assets/assetTree.ts).
import { useQueries, useQuery } from "@tanstack/react-query";
import { useDataProvider, type CrudFilter, type CrudSort } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { selectInChunks } from "@rbp/ui";
import type { AssetOverviewRow } from "@rbp/module-task-family/src/lib/domain.ts";

// Data of the asset tree table (list.tsx). Everything is asked of the server page by page:
// - browsing: one page of top rows (assets_overview.is_visible_root: the parent is out of the caller's reach), and the
//   children of each opened row when it is opened;
// - filtering: one page of matches, plus the visible ancestors of those matches as grey context rows.

export type AssetTreeRow = AssetOverviewRow & {
  children?: AssetTreeRow[];
  // An ancestor shown only so a match keeps its place in the tree.
  context?: boolean;
  // Stands in for children that are not loaded yet; it gives the row its fold arrow.
  placeholder?: boolean;
};

export const ASSET_TREE_KEY = "assets-tree";

// A total order, so pages neither overlap nor skip rows.
const withTiebreak = (sorters: CrudSort[]): CrudSort[] => [
  ...sorters,
  ...(sorters.some((s) => s.field === "name") ? [] : [{ field: "name", order: "asc" as const }]),
  { field: "id", order: "asc" },
];

const placeholder = (parentId: string) => ({ id: `${parentId}:loading`, placeholder: true }) as AssetTreeRow;

// One page of a level: the top rows (parentId null) or the children of one asset.
export const useAssetLevel = (parentId: string | null, sorters: CrudSort[], page: number, pageSize: number, enabled: boolean) => {
  const dataProvider = useDataProvider()();
  return useQuery({
    queryKey: [ASSET_TREE_KEY, "level", parentId, sorters, page, pageSize],
    enabled,
    queryFn: async () => {
      const filter: CrudFilter = parentId
        ? { field: "parent_asset_id", operator: "eq", value: parentId }
        : { field: "is_visible_root", operator: "eq", value: true };
      const { data, total } = await dataProvider.getList<AssetOverviewRow>({
        resource: "assets_overview",
        filters: [filter],
        sorters: withTiebreak(sorters),
        pagination: { currentPage: page, pageSize, mode: "server" },
      });
      return { rows: data, total };
    },
  });
};

// The children of every opened row, in the table's order. One request per opened row; a row has at most a few
// hundred children (more than 1000 would be cut by PostgREST's row limit).
const useChildren = (openIds: string[], sorters: CrudSort[]) => {
  const dataProvider = useDataProvider()();
  const results = useQueries({
    queries: openIds.map((id) => ({
      queryKey: [ASSET_TREE_KEY, "children", id, sorters],
      queryFn: async () =>
        (
          await dataProvider.getList<AssetOverviewRow>({
            resource: "assets_overview",
            filters: [{ field: "parent_asset_id", operator: "eq", value: id }],
            sorters: withTiebreak(sorters),
            pagination: { mode: "off" },
          })
        ).data,
    })),
  });
  const byParent: Record<string, AssetOverviewRow[]> = {};
  results.forEach((r, i) => {
    if (r.data) byParent[openIds[i]] = r.data;
  });
  return byParent;
};

// Browsing: the top rows with the children of the opened rows hung below them. `open` null = nothing chosen yet:
// up to three top rows (a site or two) start open, more start closed.
export const useBrowseTree = (sorters: CrudSort[], page: number, pageSize: number, open: string[] | null, enabled: boolean) => {
  const level = useAssetLevel(null, sorters, page, pageSize, enabled);
  const top = level.data?.rows ?? [];
  const openIds = open ?? (top.length <= 3 ? top.filter((r) => r.child_count > 0).map((r) => r.id) : []);
  const children = useChildren(enabled ? openIds : [], sorters);
  const hang = (row: AssetOverviewRow): AssetTreeRow =>
    row.child_count > 0 ? { ...row, children: children[row.id]?.map(hang) ?? [placeholder(row.id)] } : row;
  return { rows: top.map(hang), openIds, total: level.data?.total ?? 0, isLoading: level.isLoading };
};

// Filtering: one page of matches in their tree, with the visible ancestors as context rows. A row the caller cannot
// see is left out, so a match hangs below its nearest visible ancestor.
export const useFilteredTree = (filters: CrudFilter[], sorters: CrudSort[], page: number, pageSize: number, enabled: boolean) => {
  const dataProvider = useDataProvider()();
  const query = useQuery({
    queryKey: [ASSET_TREE_KEY, "filtered", filters, sorters, page, pageSize],
    enabled,
    queryFn: async () => {
      const { data: matches, total } = await dataProvider.getList<AssetOverviewRow>({
        resource: "assets_overview",
        filters,
        sorters: withTiebreak(sorters),
        pagination: { currentPage: page, pageSize, mode: "server" },
      });
      const matchIds = new Set(matches.map((m) => m.id));
      const ancestorIds = [...new Set(matches.flatMap((m) => m.ancestor_asset_ids))].filter((id) => !matchIds.has(id));
      const ancestors = await selectInChunks<AssetOverviewRow>(ancestorIds, (chunk) =>
        supabaseClient.from("assets_overview").select("*").in("id", chunk),
      );
      return { matches, ancestors, total };
    },
  });
  const rows = query.data ? buildFilteredTree(query.data.matches, query.data.ancestors) : [];
  return { rows, matches: query.data?.matches ?? [], total: query.data?.total ?? 0, isLoading: query.isLoading };
};

const buildFilteredTree = (matches: AssetOverviewRow[], ancestors: AssetOverviewRow[]): AssetTreeRow[] => {
  const known = new Map<string, AssetOverviewRow>([...ancestors, ...matches].map((r) => [r.id, r]));
  const matchIds = new Set(matches.map((m) => m.id));
  const nodes = new Map<string, AssetTreeRow>();
  const roots: AssetTreeRow[] = [];
  // Matches come in the table's order; a context row takes the place of its first match.
  for (const match of matches) {
    let parent: AssetTreeRow | null = null;
    for (const id of [...match.ancestor_asset_ids, match.id]) {
      const row = known.get(id);
      if (!row) continue;
      let node = nodes.get(id);
      if (!node) {
        node = { ...row, context: !matchIds.has(id) };
        nodes.set(id, node);
        if (parent) (parent.children ??= []).push(node);
        else roots.push(node);
      }
      parent = node;
    }
  }
  return roots;
};

// Ids of the rows that have children in a built tree (to open all of them).
export const parentIds = (rows: AssetTreeRow[]): string[] =>
  rows.flatMap((r) => (r.children?.length ? [r.id, ...parentIds(r.children)] : []));
