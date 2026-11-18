// Ported 1:1 from COMPASS (app/src/hooks/usePositions.ts).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import type { AppointmentLetter, AssignmentLogRow, HolderPeriod, HolderRow, JobDescriptionVersion, PositionRow } from "../lib/positions";
import { useTeamMembers } from "@rbp/core";
import { usePermissions } from "@rbp/core";

// Positions, their teams and holders are organisational information readable by everybody; the versions are filtered by
// the database (published for holders and their supervisors, drafts for editors).
export function usePositions() {
  return useQuery({
    queryKey: ["positions", "list"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("positions").select("id, name, code, site, active, kind").order("name");
      if (error) throw error;
      return (data ?? []) as PositionRow[];
    },
  });
}

export function usePositionTeams() {
  return useQuery({
    queryKey: ["positions", "teams"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("position_teams").select("position_id, team_id");
      if (error) throw error;
      return (data ?? []) as { position_id: string; team_id: string }[];
    },
  });
}

// Direct holders and team members together (people who left are already left out by the view).
export function usePositionHolders() {
  return useQuery({
    queryKey: ["positions", "holders"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("position_holders_effective").select("position_id, user_id, source, team_id, valid_from, valid_to, holder_id");
      if (error) throw error;
      return (data ?? []) as HolderRow[];
    },
  });
}

// The direct periods (past, current, planned) of a position or a person, newest first.
export function useHolderPeriods(filter: { positionId?: string; userId?: string }) {
  return useQuery({
    queryKey: ["positions", "periods", filter.positionId ?? null, filter.userId ?? null],
    enabled: !!(filter.positionId || filter.userId),
    queryFn: async () => {
      let q = supabaseClient.from("position_holders").select("id, position_id, user_id, valid_from, valid_to, appointed_by_user_id");
      if (filter.positionId) q = q.eq("position_id", filter.positionId);
      if (filter.userId) q = q.eq("user_id", filter.userId);
      const { data, error } = await q.order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HolderPeriod[];
    },
  });
}

// Appointment letters: attachments of a position_holders row (the person, HR and holders of view.all read them).
export function useAppointmentLetters(holderIds: string[]) {
  return useQuery({
    queryKey: ["positions", "letters", [...holderIds].sort().join(",")],
    enabled: holderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from("attachments")
        .select("id, entity_id, storage_path, file_name, mime_type")
        .eq("entity_type", "position_holders")
        .in("entity_id", holderIds)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as AppointmentLetter[];
    },
  });
}

// One row per version, no text: for the list (current version, open draft).
export function useVersionSummaries() {
  return useQuery({
    queryKey: ["positions", "version-summaries"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("job_description_versions").select("id, position_id, version_no, status");
      if (error) throw error;
      return (data ?? []) as Pick<JobDescriptionVersion, "id" | "position_id" | "version_no" | "status">[];
    },
  });
}

export function usePositionVersions(positionId: string | undefined) {
  return useQuery({
    queryKey: ["positions", "versions", positionId],
    enabled: !!positionId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("job_description_versions").select("*").eq("position_id", positionId!).order("version_no", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobDescriptionVersion[];
    },
  });
}

// The assignment log: everything for HR, otherwise only the entries about oneself (the policy decides).
export function usePositionLog(filter: { positionId?: string; userId?: string }) {
  return useQuery({
    queryKey: ["positions", "log", filter.positionId ?? null, filter.userId ?? null],
    enabled: !!(filter.positionId || filter.userId),
    queryFn: async () => {
      let q = supabaseClient.from("position_assignment_log").select("id, position_id, user_id, action, source, team_name, happened_at, by_user_id, valid_from, valid_to");
      if (filter.positionId) q = q.eq("position_id", filter.positionId);
      if (filter.userId) q = q.eq("user_id", filter.userId);
      const { data, error } = await q.order("happened_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as AssignmentLogRow[];
    },
  });
}

// Who held the position on a date, replayed from the log.
export function usePositionHoldersAt(positionId: string | undefined, date: string | null) {
  return useQuery({
    queryKey: ["positions", "holders-at", positionId, date],
    enabled: !!positionId && !!date,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("position_holders_at", { p_position: positionId, p_date: date });
      if (error) throw error;
      return (data ?? []) as { user_id: string; source: "direct" | "team" }[];
    },
  });
}

// Mirrors job_description_access() for the UI (the database decides): edit.all, or edit.team for a position that has
// one of my teams.
export function usePositionAccess() {
  const { has } = usePermissions();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { data: members } = useTeamMembers();
  const { data: teams } = usePositionTeams();
  const me = identity?.id;
  const myTeams = new Set((members ?? []).filter((m) => m.user_id === me).map((m) => m.team_id));
  const sharesTeam = (positionId: string) => (teams ?? []).some((t) => t.position_id === positionId && myTeams.has(t.team_id));
  return {
    // create positions, manage holders and teams, return and publish versions
    canManage: has("job_descriptions.edit.all"),
    canWrite: (positionId: string) => has("job_descriptions.edit.all") || (has("job_descriptions.edit.team") && sharesTeam(positionId)),
    canSeeLog: has("job_descriptions.view.all"),
  };
}

export function usePositionsRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["positions"] });
    void queryClient.invalidateQueries({ queryKey: ["training-requirements"] });
    void queryClient.invalidateQueries({ queryKey: ["training-status"] });
  };
}

// Admins only (the database refuses anybody else): remove an old version or a wrong entry of the assignment log.
export function usePositionCleanup() {
  const refresh = usePositionsRefresh();
  return {
    deleteVersion: async (versionId: string) => {
      const { error, count } = await supabaseClient.from("job_description_versions").delete({ count: "exact" }).eq("id", versionId);
      if (error) throw error;
      if (!count) throw new Error("Not deleted");
      refresh();
    },
    deleteLogEntry: async (entryId: string) => {
      const { error, count } = await supabaseClient.from("position_assignment_log").delete({ count: "exact" }).eq("id", entryId);
      if (error) throw error;
      if (!count) throw new Error("Not deleted");
      refresh();
    },
  };
}
