// Copied from COMPASS app/src/hooks/useTaskRights.ts. Change: import of the platform client.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";

// What I may do with a task, as the database computes it (RPC task_rights). The UI reads these flags instead of
// rebuilding the rules; the RPCs check again on their own.
export type TaskRights = {
  task_id: string;
  view: boolean;
  check: boolean;
  edit: boolean;
  act: boolean;
  decision: boolean;
  forward: boolean;
  claim: boolean;
  reopen: boolean;
};

const fetchTaskRights = async (ids: string[]) => {
  const { data, error } = await supabaseClient.rpc("task_rights", { p_task_ids: ids });
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as TaskRights[]).map((r) => [r.task_id, r])) as Record<string, TaskRights>;
};

// One task (task page). The key starts with ["task", id] so every refresh of the task refreshes it too.
export const useTaskRights = (taskId: string | undefined) =>
  useQuery({
    queryKey: ["task", taskId, "rights"],
    enabled: !!taskId,
    queryFn: async () => (await fetchTaskRights([taskId!]))[taskId!] ?? null,
  });

// The rows of a list page (at most 200 per call), as a plain object by task id; answers are kept across pages.
export const useTaskRightsFor = (taskIds: string[]) => {
  const ids = [...new Set(taskIds)].sort();
  const { data } = useQuery({
    queryKey: ["task", "rights", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: () => fetchTaskRights(ids.slice(0, 200)),
  });
  const [all, setAll] = useState<Record<string, TaskRights>>({});
  useEffect(() => {
    if (data) setAll((old) => ({ ...old, ...data }));
  }, [data]);
  return all;
};
