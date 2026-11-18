// Ported 1:1 from COMPASS (app/src/lib/punctuality.ts).
import { supabaseClient } from "@rbp/core";

export type Outcome = "on_time" | "rescheduled" | "late";

// Which finished tasks count: asset (incl. everything below it), series, initiative tree, team, task type, completion range.
export type PunctualityScope = {
  from?: string | null;
  to?: string | null;
  assetId?: string | null;
  ruleId?: string | null;
  rootTaskId?: string | null;
  teamId?: string | null;
  taskTypeId?: string | null;
};

export type PunctualityStatsRow = {
  period: string | null;
  total: number;
  on_time: number;
  rescheduled: number;
  late: number;
  avg_days_late: number | null;
  max_days_late: number | null;
};

export type PunctualityBreakdownRow = {
  group_key: string;
  title: string;
  is_series: boolean;
  asset_id: string | null;
  last_task_id: string;
  last_completed_on: string;
  total: number;
  on_time: number;
  rescheduled: number;
  late: number;
  avg_days_late: number | null;
};

type SeriesRun = {
  task_id: string;
  task_number: number;
  title: string;
  original_due_date: string;
  due_date: string | null;
  completed_on: string;
  outcome: Outcome;
  days_late: number;
  assigned_user_id: string | null;
};

const num = (v: unknown) => (v == null ? null : Number(v));

export const fetchPunctualityStats = async (scope: PunctualityScope, bucket: "month" | "quarter" | "year" | "all") => {
  const { data, error } = await supabaseClient.rpc("punctuality_stats", {
    p_from: scope.from ?? null,
    p_to: scope.to ?? null,
    p_asset_id: scope.assetId ?? null,
    p_rule_id: scope.ruleId ?? null,
    p_root_task_id: scope.rootTaskId ?? null,
    p_team_id: scope.teamId ?? null,
    p_task_type_id: scope.taskTypeId ?? null,
    p_bucket: bucket,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    period: r.period,
    total: Number(r.total),
    on_time: Number(r.on_time),
    rescheduled: Number(r.rescheduled),
    late: Number(r.late),
    avg_days_late: num(r.avg_days_late),
    max_days_late: num(r.max_days_late),
  })) as PunctualityStatsRow[];
};

export const fetchPunctualityBreakdown = async (scope: PunctualityScope) => {
  const { data, error } = await supabaseClient.rpc("punctuality_breakdown", {
    p_from: scope.from ?? null,
    p_to: scope.to ?? null,
    p_asset_id: scope.assetId ?? null,
    p_root_task_id: scope.rootTaskId ?? null,
    p_team_id: scope.teamId ?? null,
    p_task_type_id: scope.taskTypeId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    total: Number(r.total),
    on_time: Number(r.on_time),
    rescheduled: Number(r.rescheduled),
    late: Number(r.late),
    avg_days_late: num(r.avg_days_late),
  })) as PunctualityBreakdownRow[];
};

// The last runs of one series, oldest first.
export const fetchSeriesRuns = async (ruleId: string, limit = 24) => {
  const { data, error } = await supabaseClient
    .from("task_punctuality")
    .select("task_id, task_number, title, original_due_date, due_date, completed_on, outcome, days_late, assigned_user_id")
    .eq("recurring_task_rule_id", ruleId)
    .order("completed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as SeriesRun[]).reverse();
};

export const sumStats = (rows: PunctualityStatsRow[]) => {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const late = rows.reduce((s, r) => s + r.late, 0);
  const lateDays = rows.reduce((s, r) => s + (r.avg_days_late ?? 0) * r.late, 0);
  return {
    total,
    on_time: rows.reduce((s, r) => s + r.on_time, 0),
    rescheduled: rows.reduce((s, r) => s + r.rescheduled, 0),
    late,
    avg_days_late: late ? Math.round((lateDays / late) * 10) / 10 : null,
  };
};

export const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
