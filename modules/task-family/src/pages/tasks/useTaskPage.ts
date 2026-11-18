// Ported 1:1 from COMPASS (app/src/pages/tasks/useTaskPage.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { fetchTask, fetchTaskSteps } from "../../lib/queries";
import { useTaskRights } from "@rbp/module-tasks/src/hooks/useTaskRights.ts";

export type TaskPageRow = NonNullable<Awaited<ReturnType<typeof fetchTask>>>;

// Everything the task page reads about one task (several columns are read straight from the table).
export const useTaskPageData = (id: string) => {
  const { data: task, isLoading } = useQuery({
    queryKey: ["task", id],
    queryFn: () => fetchTask(id),
  });
  const { data: steps } = useQuery({
    queryKey: ["task-steps", task?.task_type_id],
    enabled: !!task?.task_type_id,
    queryFn: () => fetchTaskSteps(task!.task_type_id),
  });

  // The goal an initiative points at.
  const { data: goalLink } = useQuery({
    queryKey: ["task-goal", id],
    enabled: !!id,
    queryFn: async () => ((await supabaseClient.from("tasks").select("goal_id").eq("id", id).maybeSingle()).data?.goal_id ?? null) as string | null,
  });

  const { data: originalDue } = useQuery({
    queryKey: ["task-original-due", id],
    enabled: !!id,
    queryFn: async () => ((await supabaseClient.from("tasks").select("original_due_date").eq("id", id).maybeSingle()).data?.original_due_date ?? null) as string | null,
  });

  // The person or team the current step was resolved to.
  const { data: currentAssignee } = useQuery({
    queryKey: ["task-assignee", id],
    enabled: !!id,
    queryFn: async () =>
      ((await supabaseClient.from("tasks").select("current_assignee_user_id, current_assignee_team_id").eq("id", id).maybeSingle()).data ?? null) as
        | { current_assignee_user_id: string | null; current_assignee_team_id: string | null }
        | null,
  });

  // Optional fields the task type hides; one that already holds a value stays visible.
  const { data: hiddenFields } = useQuery({
    queryKey: ["task-type-hidden-fields", task?.task_type_id],
    enabled: !!task?.task_type_id,
    staleTime: 60_000,
    queryFn: async () => ((await supabaseClient.from("task_types").select("hidden_fields").eq("id", task!.task_type_id).maybeSingle()).data?.hidden_fields ?? []) as string[],
  });

  // What I may do here, computed by the database (task_rights); the page only reads the flags.
  const { data: rights } = useTaskRights(id);

  const { data: rootTask } = useQuery({
    queryKey: ["task-root", task?.root_task_id],
    enabled: !!task?.parent_task_id && !!task?.root_task_id,
    queryFn: async () => {
      const { data } = await supabaseClient
        .from("tasks")
        .select("id, task_number, title, is_initiative")
        .eq("id", task!.root_task_id)
        .maybeSingle();
      return data as { id: string; task_number: number; title: string; is_initiative: boolean } | null;
    },
  });

  return {
    task,
    isLoading,
    steps,
    goalLink,
    originalDue,
    assigneeUserId: currentAssignee?.current_assignee_user_id ?? null,
    assigneeTeamId: currentAssignee?.current_assignee_team_id ?? null,
    hiddenFields,
    rights,
    rootTask,
  };
};
