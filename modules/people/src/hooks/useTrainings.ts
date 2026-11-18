// Ported 1:1 from COMPASS (app/src/hooks/useTrainings.ts).
import { useQuery } from "@tanstack/react-query";
import { useGetIdentity } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { fetchAllPages } from "@rbp/ui";
import type { TrainingExemption, TrainingRecordRow, TrainingRequirement, TrainingSessionParticipant, TrainingSessionRow, TrainingStatusRow, TrainingType } from "../lib/trainings";
import { usePermissions } from "@rbp/core";

export function useTrainingTypes() {
  return useQuery({
    queryKey: ["training-types"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_types").select("*").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as TrainingType[];
    },
  });
}

// The latest record per person and type (what counts today), for everyone the signed-in user may see.
export function useTrainingStatus() {
  return useQuery({
    queryKey: ["training-status"],
    staleTime: 30_000,
    queryFn: () =>
      fetchAllPages<TrainingStatusRow>((from, to) =>
        supabaseClient.from("training_status").select("*").order("user_id").order("training_type_id").range(from, to) as unknown as PromiseLike<{ data: TrainingStatusRow[] | null }>,
      ),
  });
}

// Which teams, roles and positions a training is required for (readable by everybody; HR edits).
export function useTrainingRequirements() {
  return useQuery({
    queryKey: ["training-requirements"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_requirements").select("id, training_type_id, team_id, role_id, position_id, user_id");
      if (error) throw error;
      return (data ?? []) as TrainingRequirement[];
    },
  });
}

export function useTrainingExemptions(userId: string | undefined) {
  return useQuery({
    queryKey: ["training-exemptions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_exemptions").select("user_id, training_type_id, reason").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as TrainingExemption[];
    },
  });
}

export function useTrainingRecords(userId: string | undefined) {
  return useQuery({
    queryKey: ["training-records", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_records_overview").select("*").eq("user_id", userId!).order("completed_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingRecordRow[];
    },
  });
}

type TrainingProof = { id: string; storage_path: string; file_name: string; mime_type: string | null; entity_type: string };

// Proof files of a record (its own and those of the session that wrote it) or of a session alone.
export function useTrainingProofs(target: { recordId?: string; sessionId?: string }) {
  const { recordId, sessionId } = target;
  return useQuery({
    queryKey: ["training-proofs", recordId ?? null, sessionId ?? null],
    enabled: !!recordId || !!sessionId,
    queryFn: async () => {
      let session = sessionId;
      if (recordId && !session) {
        const { data, error } = await supabaseClient.from("training_records").select("session_id").eq("id", recordId).maybeSingle();
        if (error) throw error;
        session = (data?.session_id as string | null) ?? undefined;
      }
      const parts = [
        ...(recordId ? [`and(entity_type.eq.training_records,entity_id.eq.${recordId})`] : []),
        ...(session ? [`and(entity_type.eq.training_sessions,entity_id.eq.${session})`] : []),
      ];
      const { data, error } = await supabaseClient
        .from("attachments")
        .select("id, storage_path, file_name, mime_type, entity_type")
        .or(parts.join(","))
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as TrainingProof[];
    },
  });
}

export function useTrainingSessions() {
  return useQuery({
    queryKey: ["training-sessions"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_sessions_overview").select("*").order("held_on", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as TrainingSessionRow[];
    },
  });
}

export function useTrainingSession(id: string | undefined) {
  return useQuery({
    queryKey: ["training-sessions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_sessions_overview").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as TrainingSessionRow | null;
    },
  });
}

export function useTrainingSessionParticipants(id: string | undefined) {
  return useQuery({
    queryKey: ["training-session-participants", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("training_session_participants").select("session_id, user_id, attended").eq("session_id", id!);
      if (error) throw error;
      return (data ?? []) as TrainingSessionParticipant[];
    },
  });
}

// The people I supervise (at any level) or stand in for a supervisor of: RPC my_report_ids(), same relation as the database.
export function useMyReportIds() {
  const { data: identity } = useGetIdentity<{ id: string }>();
  return useQuery({
    queryKey: ["my-report-ids", identity?.id],
    enabled: !!identity?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("my_report_ids");
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
}

// Mirrors user_training_access() for the UI (the database decides): own records, the people below me, everybody.
export function useTrainingAccess() {
  const { has } = usePermissions();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { data: reportIds } = useMyReportIds();
  const me = identity?.id;
  const reports = new Set(reportIds ?? []);
  return {
    canView: (personId: string) => has("trainings.view.all") || (has("trainings.view.reports") && reports.has(personId)) || (has("trainings.view.own") && personId === me),
    canEdit: (personId: string) => has("trainings.edit.all") || (has("trainings.edit.reports") && reports.has(personId)),
    canEditCatalogue: has("training_types.edit"),
  };
}
