// After COMPASS app/src/pages/tasks/useTaskPage.ts (fetchTask / fetchTaskSteps from lib/queries.ts). Cut: goal link and
// initiative root. The current-step assignee, the original due date and the hidden fields come with the overview row here.
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { TaskOverviewRow, TaskTypeStep } from "../../lib/domain";
import { useTaskRights } from "../../hooks/useTaskRights";

export const fetchTask = async (id: string) =>
  (await supabaseClient.from("tasks_overview").select("*").eq("id", id).maybeSingle()).data as TaskOverviewRow | null;

export const fetchTaskSteps = async (taskTypeId: string) =>
  ((await supabaseClient.from("task_type_steps").select("*").eq("task_type_id", taskTypeId).order("step_order")).data ?? []) as TaskTypeStep[];

export type TaskPageRow = NonNullable<Awaited<ReturnType<typeof fetchTask>>>;

export type StepHistoryRow = { id: string; step_key: string; actor_user_id: string | null; action_key: string | null; comment: string | null; entered_at: string; left_at: string | null };

// Everything the task page reads about one task.
export const useTaskPageData = (id: string) => {
  // A malformed id in the URL is "not found" without asking the database.
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data: task, isLoading } = useQuery({ queryKey: ["task", id], enabled: valid, queryFn: () => fetchTask(id) });
  const { data: steps } = useQuery({
    queryKey: ["task-steps", task?.task_type_id],
    enabled: !!task?.task_type_id,
    queryFn: () => fetchTaskSteps(task!.task_type_id),
  });
  // Optional fields the task type hides; one that already holds a value stays visible.
  const { data: hiddenFields } = useQuery({
    queryKey: ["task-type-hidden-fields", task?.task_type_id],
    enabled: !!task?.task_type_id,
    staleTime: 60_000,
    queryFn: async () => ((await supabaseClient.from("task_types").select("hidden_fields").eq("id", task!.task_type_id).maybeSingle()).data?.hidden_fields ?? []) as string[],
  });
  // What I may do here, computed by the database (task_rights); the page only reads the flags.
  const { data: rights } = useTaskRights(valid ? id : undefined);
  const { data: history } = useQuery({
    queryKey: ["task", id, "history"],
    enabled: valid,
    queryFn: async () =>
      ((await supabaseClient.from("task_step_history").select("id, step_key, actor_user_id, action_key, comment, entered_at, left_at").eq("task_id", id).order("entered_at")).data ??
        []) as StepHistoryRow[],
  });
  const { data: subtasks } = useQuery({
    queryKey: ["task", id, "subtasks"],
    enabled: valid,
    queryFn: async () => ((await supabaseClient.from("tasks_overview").select("*").eq("parent_task_id", id).order("task_number")).data ?? []) as TaskOverviewRow[],
  });
  // The record the task belongs to, labelled only for who may view it.
  const { data: anchorLabel } = useQuery({
    queryKey: ["task", id, "anchor", task?.anchor_type, task?.anchor_id],
    enabled: !!task?.anchor_id,
    queryFn: async () => ((await supabaseClient.rpc("task_anchor_label", { p_anchor_type: task!.anchor_type, p_anchor_id: task!.anchor_id })).data ?? null) as string | null,
  });
  return { task, isLoading: valid && isLoading, steps, hiddenFields, rights, history, subtasks, anchorLabel };
};
