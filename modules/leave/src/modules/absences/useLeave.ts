// Ported 1:1 from COMPASS (app/src/modules/absences/useLeave.ts).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { LeaveRequest, LeaveViolation, LeaveYear, PlannerDay, PlannerLoadDay, PlannerScope, RuleViolationDay, TeamLoadDay } from "./leave";

// The signed-in user's own applications, newest first. (Team views come with the planner.)
export function useMyLeave(userId: string | undefined) {
  return useQuery({
    queryKey: ["leave-requests", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("leave_requests").select("*").eq("user_id", userId!).order("from_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaveRequest[];
    },
  });
}

export function useMyLeaveYears(userId: string | undefined) {
  return useQuery({
    queryKey: ["leave-years", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("leave_year_overview").select("*").eq("user_id", userId!).order("year");
      if (error) throw error;
      return (data ?? []) as LeaveYear[];
    },
  });
}

// ---- Planner ----

type PlannerTeam = { id: string; name: string; member_count: number };

export function useLeavePlannerTeams() {
  return useQuery({
    queryKey: ["leave-planner-teams"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_planner_teams");
      if (error) throw error;
      return (data ?? []) as PlannerTeam[];
    },
  });
}

export function useLeavePlannerPeople(scope: PlannerScope) {
  return useQuery({
    queryKey: ["leave-planner-people", scope],
    queryFn: async () => {
      const isTeam = scope.startsWith("team:");
      const { data, error } = await supabaseClient.rpc("leave_planner_people", {
        p_scope: isTeam ? "team" : scope,
        p_team_id: isTeam ? scope.slice(5) : null,
      });
      if (error) throw error;
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
  });
}

// The planner window grows to the right; the previous data stays on screen while a longer window loads.
export function useLeavePlannerDays(userIds: string[] | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ["leave-planner-days", userIds, from, to],
    enabled: !!userIds && userIds.length > 0,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_planner_days", { p_user_ids: userIds, p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as PlannerDay[];
    },
  });
}

export function useTeamLoad(teamId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["leave-team-load", teamId, from, to],
    enabled: !!teamId,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_team_load", { p_team_id: teamId, p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as TeamLoadDay[];
    },
  });
}

// Days on which a period would break the absence rule (empty = fine).
export function useLeaveCheck(args: { from?: string; to?: string; startHalf?: boolean; endHalf?: boolean; userId?: string; excludeRequestId?: string }) {
  return useQuery({
    queryKey: ["leave-check", args],
    enabled: !!args.from && !!args.to && args.to >= args.from,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_check_period", {
        p_from: args.from,
        p_to: args.to,
        p_start_half: !!args.startHalf,
        p_end_half: !!args.endHalf,
        p_user_id: args.userId ?? null,
        p_exclude_request: args.excludeRequestId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as RuleViolationDay[];
    },
  });
}

// The team days that break the rule now, for the next ~6 months (live, nothing is stored).
export function useLeaveViolations() {
  return useQuery({
    queryKey: ["leave-violations"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_violations", { p_days: 180 });
      if (error) throw error;
      return (data ?? []) as LeaveViolation[];
    },
  });
}

// The worst team per day for the people shown (the rule is per team, so the row is too).
export function useLeavePlannerLoad(userIds: string[] | undefined, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ["leave-planner-load", userIds, from, to],
    enabled: enabled && !!userIds && userIds.length > 0,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_planner_load", { p_user_ids: userIds, p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as PlannerLoadDay[];
    },
  });
}

// The last day a public holiday is stored for: beyond it working days are counted without holidays.
export function useHolidayCoverage() {
  return useQuery({
    queryKey: ["public-holidays-last"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("public_holidays").select("holiday_date").order("holiday_date", { ascending: false }).limit(1);
      if (error) throw error;
      return (data?.[0]?.holiday_date ?? null) as string | null;
    },
  });
}

// After anything that changes leave: every list, the planner, the rule checks, the dashboard tiles and the task pages.
export function useInvalidateLeave() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["leave-requests", "leave-years", "leave-planner-days", "leave-planner-load", "leave-team-load", "leave-request-of-task", "leave-check", "leave-pending", "leave-violations", "dashboard", "data"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
    void queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("task") });
  };
}

export function useLeaveRequestOfTask(taskId: string | undefined, status?: string) {
  return useQuery({
    queryKey: ["leave-request-of-task", taskId, status],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("leave_requests").select("*").eq("task_id", taskId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as LeaveRequest | null;
    },
  });
}

export type LeavePending = { id: string; task_id: string; user_id: string; absence_type_id: string; from_date: string; to_date: string; start_half: boolean; end_half: boolean; working_days: number };

// Waiting requests the signed-in user decides.
export function useLeavePending() {
  return useQuery({
    queryKey: ["leave-pending"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_pending_for_me");
      if (error) throw error;
      return (data ?? []) as LeavePending[];
    },
  });
}

const toSet = (ids: string[]) => new Set(ids);

// The people the signed-in user may enter leave for: the ones they approve leave for (supervisor, deputy), everybody for HR.
export function useLeaveEnterable() {
  return useQuery({
    queryKey: ["leave-enterable"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_enterable_users");
      if (error) throw error;
      return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
    },
    // The cache is persisted as JSON, so it holds the array; the Set is built here (offline/persistCache.ts).
    select: toSet,
  });
}

// The absence types the signed-in user may enter for this person (first step of the type's route, or HR).
export function useLeaveEnterableTypes(userId: string | undefined) {
  return useQuery({
    queryKey: ["leave-enterable-types", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("leave_enterable_types", { p_user_id: userId! });
      if (error) throw error;
      return ((data ?? []) as { absence_type_id: string }[]).map((r) => r.absence_type_id);
    },
  });
}
