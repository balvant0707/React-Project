// Ported 1:1 from COMPASS (app/src/hooks/useDecisions.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { StepAction } from "../lib/domain";

// One task that waits for the signed-in user's decision (view tasks_to_decide): any route, any task type.
export type DecisionRow = {
  id: string;
  task_number: number;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  created_at: string;
  created_by_user_id: string | null;
  created_by_name: string | null;
  asset_name: string | null;
  task_type_name: string;
  task_type_name_de: string;
  purpose: string | null;
  current_step_name: string | null;
  current_step_name_de: string | null;
  step_actions: StepAction[];
  // Required checklist items of the current step that are still open.
  step_open_required: number;
};

export const DECISIONS_KEY = ["decisions"];

export function useDecisions() {
  return useQuery({
    queryKey: DECISIONS_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("tasks_to_decide").select("*").order("due_date", { nullsFirst: false }).order("created_at");
      if (error) throw error;
      return (data ?? []) as DecisionRow[];
    },
  });
}

// Number for the dashboard tile and the menu; counted on the server, no rows come over.
export function useDecisionCount() {
  return useQuery({
    queryKey: ["dashboard", "decision-count"],
    staleTime: 120_000,
    queryFn: async () => {
      const { count, error } = await supabaseClient.from("tasks_to_decide").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// "My requests": my own tasks of types flagged track_as_request, with who they wait for (view tasks_my_requests).
export type MyRequestRow = {
  id: string;
  task_number: number;
  title: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  task_type_name: string;
  task_type_name_de: string;
  purpose: string | null;
  current_step_name: string | null;
  current_step_name_de: string | null;
  with_user_name: string | null;
  with_team_name: string | null;
  with_role_name: string | null;
  with_role_name_de: string | null;
  in_step_since: string | null;
  awaiting_decision: boolean;
};

export function useMyRequests(enabled: boolean) {
  return useQuery({
    queryKey: ["decisions", "my-requests"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("tasks_my_requests").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as MyRequestRow[];
    },
  });
}

// "Decided by me": the decisions I took in a decision step (view tasks_decided_by_me), newest first.
export type DecidedRow = {
  id: string;
  task_id: string;
  task_number: number;
  title: string;
  status: string;
  task_type_name: string;
  task_type_name_de: string;
  purpose: string | null;
  action_key: string;
  action: StepAction;
  comment: string | null;
  decided_at: string | null;
};

export function useDecidedByMe(enabled: boolean) {
  return useQuery({
    queryKey: ["decisions", "decided"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("tasks_decided_by_me").select("*").order("decided_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as DecidedRow[];
    },
  });
}
