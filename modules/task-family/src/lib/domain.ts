// Ported 1:1 from COMPASS (app/src/lib/domain.ts).
// Fixed vocabularies of the data model. The database stores these English codes; the UI labels
// them through i18n keys (`<group>.<code>`), never the other way round.

export const TICKET_STATUSES = ["open", "in_progress", "waiting_for_requester", "converted_to_task", "resolved", "closed"] as const;
// Platform: the task vocabularies come from the tasks module (one copy for both apps).
export { PRIORITIES, TASK_STATUSES, STEP_STATUSES, FINAL_TASK_STATUSES } from "@rbp/module-tasks/src/lib/domain.ts";
export const ASSET_STATUSES = ["active", "inactive", "decommissioned"] as const;



export type EntityType = "assets" | "tickets" | "tasks" | "goals" | "groups" | "conversations";

type AssetRow = {
  id: string;
  parent_asset_id: string | null;
  path: string;
  name: string;
  asset_type_id: string | null;
  status: string;
  manufacturer: string | null;
  serial_number: string | null;
  location: string | null;
  responsible_user_id: string | null;
  operating_hours: number | null;
  // Own icon key (lib/icons.tsx); null = inherited, see AssetOverviewRow.effective_icon.
  icon?: string | null;
  qr_code_token: string;
  created_at: string;
  updated_at: string;
};

export type AssetOverviewRow = AssetRow & {
  asset_type_name: string | null;
  asset_type_name_de: string | null;
  responsible_user_name: string | null;
  ancestor_path_label: string | null;
  is_grouping: boolean;
  ancestor_asset_ids: string[];
  child_count: number;
  open_ticket_count: number;
  open_task_count: number;
  // Earliest open task on this asset (by due date) the caller may see; null without task rights.
  next_task_id: string | null;
  next_task_title: string | null;
  next_task_due_date: string | null;
  // attributeKey(attribute id) -> value (lib/assetAttributes.ts)
  attribute_values: Record<string, string | number | boolean>;
  // The asset's icon, else the nearest ancestor's, else the asset type's.
  effective_icon?: string | null;
};

export type TicketOverviewRow = {
  id: string;
  ticket_number: number;
  asset_id: string | null;
  asset_name: string | null;
  type: string;
  type_name: string | null;
  type_name_de: string | null;
  queue_id: string;
  queue_key: string;
  queue_name: string;
  queue_name_de: string;
  status: string;
  priority: string;
  title: string;
  description: string | null;
  source: string;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  reporter_display_name: string | null;
  assigned_team_id: string | null;
  assigned_team_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  task_id: string | null;
  task_number: number | null;
  created_at: string;
  updated_at: string;
};

export type TaskOverviewRow = {
  // Top of the task's tree (the task itself without a parent); bucket = column on an initiative's board.
  root_task_id: string;
  is_initiative: boolean;
  bucket_id: string | null;
  work_hours: number | null;
  downtime_from: string | null;
  downtime_to: string | null;
  parent_task_id?: string | null;
  parent_task_number?: number | null;
  parent_title?: string | null;
  subtask_count?: number;
  open_subtask_count?: number;
  // Open subtask that ends after its open parent is due ('later') or is overdue past the parent's date ('overdue').
  date_conflict?: DateConflict | null;
  parent_due_date?: string | null;
  // Missing parts that have not arrived yet (task_items, state needed).
  items_waiting?: number;
  // A prerequisite subtask (tasks.blocks_parent) is still open: the task waits for it.
  blocking_subtask_count?: number;
  is_blocked?: boolean;
  blocks_parent?: boolean;
  checklist_items_total?: number;
  checklist_items_done?: number;
  id: string;
  task_number: number;
  task_type_id: string;
  task_type_name: string;
  task_type_name_de: string;
  current_step_key: string | null;
  current_step_name: string | null;
  current_step_name_de: string | null;
  current_assignee_role_id: string | null;
  current_assignee_user_id?: string | null;
  current_assignee_team_id?: string | null;
  status: string;
  title: string;
  description: string | null;
  priority: string;
  asset_id: string | null;
  asset_name: string | null;
  ticket_id: string | null;
  ticket_number: number | null;
  due_date: string | null;
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
  recurring_task_rule_id: string | null;
};

// Who works a step (task_type_steps.assignee_kind); see resolve_step_assignee.
export type StepAssigneeKind = "role" | "team" | "task_team" | "task_owner" | "requester" | "requester_supervisor";
// Rules that can find nobody and then go to the fallback role (else the admins).
export const FALLBACK_KINDS: (string | undefined)[] = ["requester_supervisor", "requester", "task_owner", "task_team"];

// A special function of a step: hook = key of the registry workflow_hooks, event = when it runs.
type StepHookEvent = "enter" | "action" | "leave" | "done" | "cancelled";
export type StepHook = { hook: string; event: StepHookEvent };

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
  // Special functions of the step (registry workflow_hooks): which one runs on which event.
  hooks: StepHook[];
  fallback_role_id: string | null;
  assignee_team_id: string | null;
  // Only with assignee_kind "role": the holders of the role in the task's team, a team of the requester or a fixed
  // team (assignee_team_id). The task then carries both the role and the team of the step.
  assignee_team_scope: StepTeamScope | null;
  actions: StepAction[];
  // A person chooses between the actions; the task shows up under "To decide" for whoever the step waits for.
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

// photo_url only where it was read (useUserMap): a path in the avatars bucket.
export type UserRow = { id: string; name: string | null; email: string | null; photo_url?: string | null; locked_at?: string | null };
export { userLabel } from "@rbp/core";

// Row of the RPC task_tree: one task of a subtree (depth 0 = the root) with progress counts of its descendants.
type DateConflict = "later" | "overdue";

export type TaskTreeRow = {
  id: string;
  parent_task_id: string | null;
  depth: number;
  task_number: number;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  is_overdue: boolean;
  task_type_name: string;
  task_type_name_de: string;
  task_type_id: string;
  assigned_user_name: string | null;
  team_name: string | null;
  descendants_total: number;
  descendants_done: number;
  planned_date: string | null;
  team_id: string | null;
  assigned_user_id: string | null;
  // Due date of the parent and the date conflict against it (lib/taskDates.ts); expected_end = earliest finish day.
  parent_due_date: string | null;
  date_conflict: DateConflict | null;
  expected_end: string | null;
};

// Row of initiatives_overview: a task with the initiative switch with the progress of everything below it.
export type InitiativeOverviewRow = TaskOverviewRow & { tasks_total: number; tasks_done: number; tasks_overdue: number };

export type InitiativeBucket = {
  id: string;
  initiative_task_id: string;
  name: string;
  position: number;
};
