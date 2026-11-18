// Task parts of COMPASS app/src/lib/domain.ts. Changes: TaskOverviewRow without the cut columns (asset, ticket, checklist,
// items, series, goal, bucket, effort) and with the anchor (modules/tasks/sql/migrations/20261110200000_tasks.sql);
// TaskTypeStep without hooks.

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const TASK_STATUSES = [
  "open",
  "in_progress",
  "waiting_for_approval",
  "waiting_for_procurement",
  "waiting_for_delivery",
  "done",
  "cancelled",
] as const;
export const FINAL_TASK_STATUSES: string[] = ["done", "cancelled"];
export const STEP_STATUSES = TASK_STATUSES.filter((s) => s !== "done" && s !== "cancelled");

export type TaskOverviewRow = {
  id: string;
  task_number: number;
  task_type_id: string;
  task_type_name: string;
  task_type_name_de: string;
  current_step_key: string | null;
  current_step_name: string | null;
  current_step_name_de: string | null;
  current_assignee_role_id: string | null;
  current_assignee_user_id: string | null;
  current_assignee_team_id: string | null;
  current_assignee_user_name: string | null;
  current_assignee_team_name: string | null;
  current_assignee_role_name: string | null;
  status: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  original_due_date: string | null;
  is_overdue: boolean;
  team_id: string | null;
  team_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  planned_date: string | null;
  sort_order: string;
  created_at: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  completed_at: string | null;
  root_task_id: string;
  parent_task_id: string | null;
  parent_task_number: number | null;
  parent_title: string | null;
  subtask_count: number;
  open_subtask_count: number;
  date_conflict: "later" | "overdue" | null;
  parent_due_date: string | null;
  blocking_subtask_count: number;
  is_blocked: boolean;
  blocks_parent: boolean;
  // The record the task belongs to (a specification, an order, ...); its label only for who may view it (task_anchor_label).
  anchor_type: string | null;
  anchor_id: string | null;
};

// Who works a step (task_type_steps.assignee_kind); see resolve_step_assignee.
export type StepAssigneeKind = "role" | "team" | "task_team" | "task_owner" | "requester" | "requester_supervisor";
// Rules that can find nobody and then go to the fallback role.
export const FALLBACK_KINDS: (string | undefined)[] = ["requester_supervisor", "requester", "task_owner", "task_team"];
export const STEP_TEAM_SCOPES = ["task_team", "requester_team", "fixed"] as const;
export type StepTeamScope = (typeof STEP_TEAM_SCOPES)[number];

export type TaskTypeStep = {
  id: string;
  task_type_id: string;
  step_key: string;
  step_order: number;
  name: string;
  name_de: string;
  status: string;
  assignee_role_id: string | null;
  assignee_kind: StepAssigneeKind;
  assignee_level: number;
  fallback_role_id: string | null;
  assignee_team_id: string | null;
  assignee_team_scope: StepTeamScope | null;
  actions: StepAction[];
  is_decision: boolean;
};

// A decision on a route step. label (per language) and kind only shape the button; the engine uses key and to.
export type StepAction = {
  key: string;
  to: string | null;
  requires_comment?: boolean;
  label?: { de?: string; en?: string };
  kind?: "positive" | "neutral" | "negative";
};
