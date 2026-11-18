// Ported 1:1 from COMPASS (app/src/hooks/useOperatingInstructions.ts).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { InstructionLogRow, InstructionOverview, InstructionText, InstructionVersion } from "../lib/operatingInstructions";
import { fetchAllPages } from "@rbp/ui";
import { usePermissions } from "@rbp/core";

// Operating instructions (~/maintenance_tool/docs/operating-instructions.md). The database decides what is visible: published versions
// for everybody with view.all, drafts for whoever may write or approve them.

const KEY = "operating-instructions";

export function useInstructionAccess() {
  const { has } = usePermissions();
  return {
    canView: has("operating_instructions.view.all"),
    canCreate: has("operating_instructions.edit.all"),
    canApprove: has("operating_instructions.approve"),
    // May write some instruction (the import; the database checks each one).
    canWrite: has("operating_instructions.edit.own") || has("operating_instructions.edit.all") || has("operating_instructions.approve"),
  };
}

export function useInstructions() {
  return useQuery({
    queryKey: [KEY, "list"],
    staleTime: 60_000,
    // Hundreds of instructions are expected; paged so the PostgREST cap of 1000 rows never cuts the list.
    queryFn: () => fetchAllPages<InstructionOverview>((from, to) => supabaseClient.from("operating_instructions_overview").select("*").order("number").range(from, to)),
  });
}

export function useInstruction(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("operating_instructions_overview").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as InstructionOverview | null;
    },
  });
}

export function useInstructionVersions(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "versions", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("operating_instruction_versions").select("*").eq("instruction_id", id!).order("version_no", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InstructionVersion[];
    },
  });
}

export function useInstructionTexts(versionId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "texts", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("operating_instruction_texts").select("version_id, language, title, work_area, subject, sections, needs_check").eq("version_id", versionId!);
      if (error) throw error;
      return (data ?? []) as InstructionText[];
    },
  });
}

export function useInstructionLog(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "log", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("operating_instruction_log").select("id, version_id, action, language, note, happened_at, by_user_id").eq("instruction_id", id!).order("happened_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as InstructionLogRow[];
    },
  });
}

export type InstructionLinks = {
  assets: { id: string; asset_id: string; name: string }[];
  assetTypes: { id: string; asset_type_id: string; name: string; name_de: string }[];
};

export function useInstructionLinks(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, "links", id],
    enabled: !!id,
    queryFn: async (): Promise<InstructionLinks> => {
      const assets = await supabaseClient.from("operating_instruction_assets").select("id, asset_id, asset_type_id, asset:assets(name), asset_type:asset_types(name, name_de)").eq("instruction_id", id!);
      if (assets.error) throw assets.error;
      type AssetRow = { id: string; asset_id: string | null; asset_type_id: string | null; asset: { name: string } | null; asset_type: { name: string; name_de: string } | null };
      const rows = (assets.data ?? []) as unknown as AssetRow[];
      return {
        assets: rows.filter((r) => r.asset_id).map((r) => ({ id: r.id, asset_id: r.asset_id!, name: r.asset?.name ?? "—" })),
        assetTypes: rows.filter((r) => r.asset_type_id).map((r) => ({ id: r.id, asset_type_id: r.asset_type_id!, name: r.asset_type?.name ?? "—", name_de: r.asset_type?.name_de ?? "—" })),
      };
    },
  });
}

// The instructions of an asset: its own, those of its asset type and those of the assets above it.
export function useAssetInstructions(assetId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "asset", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data: found, error: findError } = await supabaseClient.rpc("operating_instructions_for_asset", { p_asset: assetId! });
      if (findError) throw findError;
      const ids = ((found ?? []) as { instruction_id: string; source: string }[]).map((r) => ({ id: r.instruction_id, source: r.source }));
      if (!ids.length) return [];
      const { data, error } = await supabaseClient.from("operating_instructions_overview").select("*").in("id", ids.map((x) => x.id)).order("number");
      if (error) throw error;
      const source = new Map(ids.map((x) => [x.id, x.source]));
      return ((data ?? []) as InstructionOverview[]).map((r) => ({ ...r, source: source.get(r.id) ?? "asset" }));
    },
  });
}

// Which instructions a training type teaches (all links: a small table).
export function useTrainingTypeInstructions() {
  return useQuery({
    queryKey: [KEY, "training-types"],
    staleTime: 60_000,
    queryFn: () =>
      fetchAllPages<{ training_type_id: string; instruction_id: string; sort_order: number }>((from, to) =>
        supabaseClient.from("training_type_operating_instructions").select("training_type_id, instruction_id, sort_order").order("training_type_id").order("instruction_id").range(from, to),
      ),
  });
}

export type InstructionStatusRow = {
  user_id: string;
  instruction_id: string;
  training_type_id: string;
  required: boolean;
  status: string;
  record_id: string | null;
  completed_on: string | null;
  taught_version_no: number | null;
  baseline_no: number;
  current_no: number;
  covered: boolean;
};

// Per person (whose trainings I may see), instruction and training type: what the latest record taught.
export function useInstructionStatus(userId: string | undefined) {
  return useQuery({
    queryKey: [KEY, "status", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("operating_instruction_status_for_me").eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as InstructionStatusRow[];
    },
  });
}

// The languages offered in the editor (Admin > Settings; German first).
export function useInstructionLanguages() {
  return useQuery({
    queryKey: ["app-settings", "operating-instruction-languages"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Platform: app_settings is key/value; the value is the JSON text of the language list.
      const { data } = await supabaseClient.from("app_settings").select("value").eq("key", "operating_instruction_languages").maybeSingle();
      return (data?.value ? (JSON.parse(data.value) as string[]) : ["de", "en"]);
    },
  });
}

export function useInstructionsRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [KEY] });
}
