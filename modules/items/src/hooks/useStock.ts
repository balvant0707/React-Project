// Ported 1:1 from COMPASS (app/src/hooks/useStock.ts).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { buildLocationTree, type LocationNode, type StockBalance, type StockLocation } from "../lib/stock";
import { usePermissions } from "@rbp/core";

// All stock locations (a handful to a few hundred: a whole warehouse tree is small) with their paths in tree order.
export function useStockLocations() {
  const { has } = usePermissions();
  const query = useQuery({
    queryKey: ["stock-locations"],
    enabled: has("stock.view"),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("stock_locations").select("id, parent_id, name, code, team_id, note, is_active").limit(2000);
      if (error) throw error;
      return (data ?? []) as StockLocation[];
    },
  });
  const nodes = useMemo<LocationNode[]>(() => buildLocationTree(query.data ?? []), [query.data]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  return { ...query, locations: query.data ?? [], nodes, byId };
}

// The balances of some items (the usage dialog) or of one item.
export function useItemBalances(itemIds: string[], enabled = true) {
  const key = [...itemIds].sort().join(",");
  return useQuery({
    queryKey: ["stock-balances", key],
    enabled: enabled && itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("stock_balances").select("item_id, stock_location_id, quantity").in("item_id", itemIds);
      if (error) throw error;
      return (data ?? []) as StockBalance[];
    },
  });
}

type StockHistoryPoint = { day: string; value: number };

// Weekly stock per item for the chart (one item, many weeks) and the sparkline column (a page of items, 12 weeks): one
// call either way. The server works backwards from today's balances; a day is the end of that day.
export function useStockHistory(itemIds: string[], weeks: number, enabled = true) {
  const key = [...itemIds].sort().join(",");
  return useQuery({
    queryKey: ["stock-history", key, weeks, new Date().toDateString()],
    enabled: enabled && itemIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("stock_history", { p_item_ids: itemIds, p_weeks: weeks });
      if (error) throw error;
      return (data ?? []) as { item_id: string; day: string; quantity: number | string }[];
    },
    // The cache is persisted as JSON, so it holds the rows; the Map is built here (offline/persistCache.ts).
    select: groupHistory,
  });
}

function groupHistory(rows: { item_id: string; day: string; quantity: number | string }[]) {
  const byItem = new Map<string, StockHistoryPoint[]>();
  for (const r of rows) {
    byItem.set(r.item_id, [...(byItem.get(r.item_id) ?? []), { day: r.day, value: Number(r.quantity) }]);
  }
  for (const points of byItem.values()) points.sort((a, b) => a.day.localeCompare(b.day));
  return byItem;
}
