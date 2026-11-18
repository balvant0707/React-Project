// Ported 1:1 from COMPASS (app/src/lib/goals.ts).
import { supabaseClient } from "@rbp/core";
import { fetchAllPages } from "@rbp/ui";

export const GOAL_STATUSES = ["on_track", "at_risk", "off_track", "achieved", "dropped"] as const;
type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_COLORS: Record<string, string> = {
  on_track: "green",
  at_risk: "orange",
  off_track: "red",
  achieved: "blue",
  dropped: "default",
};

// A check-in older than this is flagged as stale.
const STALE_CHECK_IN_DAYS = 35;

export type GoalRow = {
  id: string;
  goal_number: number;
  title: string;
  description: string | null;
  parent_goal_id: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  team_id: string | null;
  team_name: string | null;
  status: GoalStatus | null;
  measure_label: string | null;
  measure_unit: string | null;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  due_date: string | null;
  progress: number | null;
  progress_is_derived: boolean;
  sub_goal_count: number;
  initiative_count: number;
  last_check_in_at: string | null;
  created_at: string;
};

const num = (v: unknown) => (v == null ? null : Number(v));

const normalize = (r: any): GoalRow => ({
  ...r,
  start_value: num(r.start_value),
  target_value: num(r.target_value),
  current_value: num(r.current_value),
  progress: num(r.progress),
  sub_goal_count: Number(r.sub_goal_count ?? 0),
  initiative_count: Number(r.initiative_count ?? 0),
});

export const hasMeasure = (g: Pick<GoalRow, "start_value">) => g.start_value != null;

// All goals the caller may open (a company has tens to hundreds of goals, so one paged fetch is fine).
export const fetchGoals = async () =>
  (await fetchAllPages<any>((from, to) => supabaseClient.from("goals_overview").select("*").order("goal_number").range(from, to))).map(normalize);

export const fetchGoal = async (id: string) => {
  const { data } = await supabaseClient.from("goals_overview").select("*").eq("id", id).maybeSingle();
  return data ? normalize(data) : null;
};

export type ContributionRow = {
  step: number;
  kind: "initiative" | "goal";
  id: string;
  number: number;
  title: string;
  status: string | null;
  owner_name: string | null;
  measure_label: string | null;
  measure_unit: string | null;
  start_value: number | null;
  target_value: number | null;
  current_value: number | null;
  progress: number | null;
  can_open: boolean;
};

// The initiative and goal chain a task contributes to (rpc task_contribution; empty without goals.view.*).
export const fetchContribution = async (taskId: string) => {
  const { data, error } = await supabaseClient.rpc("task_contribution", { p_task_id: taskId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, start_value: num(r.start_value), target_value: num(r.target_value), current_value: num(r.current_value), progress: num(r.progress) })) as ContributionRow[];
};

export type GoalTreeNode = GoalRow & { children: GoalTreeNode[] };

// Goals whose parent the caller cannot open become roots of their own.
export const buildGoalTree = (rows: GoalRow[]): GoalTreeNode[] => {
  const byId = new Map<string, GoalTreeNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: GoalTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_goal_id ? byId.get(node.parent_goal_id) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
};

export const formatValue = (v: number | null | undefined, unit?: string | null) =>
  v == null ? "—" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v)}${unit ? ` ${unit}` : ""}`;

export const percent = (p: number | null | undefined) => (p == null ? null : Math.round(p * 100));

export const isStale = (g: Pick<GoalRow, "start_value" | "last_check_in_at" | "created_at" | "status">) => {
  if (!hasMeasure(g) || g.status === "achieved" || g.status === "dropped") return false;
  const since = new Date(g.last_check_in_at ?? g.created_at).getTime();
  return Date.now() - since > STALE_CHECK_IN_DAYS * 86_400_000;
};
