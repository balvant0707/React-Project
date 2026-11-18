// Ported 1:1 from COMPASS (app/src/lib/maintenanceStats.ts).
import { supabaseClient } from "@rbp/core";

export type MaintenanceStatsRow = {
  asset_id: string;
  asset_name: string;
  tasks_done: number;
  corrective_tasks: number;
  work_hours: number;
  downtime_hours: number;
  external_cost: number;
  // Parts installed from stock (not ordered for the task) x current unit price; 0 without costs.view.
  items_cost: number;
};

// Per-asset roll-up (rpc maintenance_stats, SECURITY INVOKER: only what the user may see is counted;
// the cost column is 0 without costs.view). p_from/p_to are inclusive dates (YYYY-MM-DD).
export const fetchMaintenanceStats = async (from: string, to: string, rootAssetId?: string | null) => {
  const { data, error } = await supabaseClient.rpc("maintenance_stats", { p_from: from, p_to: to, p_root_asset_id: rootAssetId ?? null });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    tasks_done: Number(r.tasks_done),
    corrective_tasks: Number(r.corrective_tasks),
    work_hours: Number(r.work_hours),
    downtime_hours: Number(r.downtime_hours),
    external_cost: Number(r.external_cost),
    items_cost: Number(r.items_cost),
  })) as MaintenanceStatsRow[];
};

export type CostBreakdownRow = { group_key: string; group_label: string; asset_id: string | null; items: number; amount: number };
export type CostGroupBy = "asset" | "supplier" | "month";

export const fetchCostBreakdown = async (from: string, to: string, groupBy: CostGroupBy, rootAssetId?: string | null, supplierId?: string | null) => {
  const { data, error } = await supabaseClient.rpc("maintenance_cost_breakdown", {
    p_from: from,
    p_to: to,
    p_group_by: groupBy,
    p_root_asset_id: rootAssetId ?? null,
    p_supplier_id: supplierId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, items: Number(r.items), amount: Number(r.amount) })) as CostBreakdownRow[];
};
