// Ported 1:1 from COMPASS (app/src/hooks/useChecklistTemplates.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { TemplateRow } from "../lib/checklists";

// Active checklist templates (for the pickers on tasks and recurring rules).
export function useChecklistTemplates(enabled = true) {
  return useQuery({
    queryKey: ["checklist-templates", "active"],
    enabled,
    staleTime: 60_000,
    queryFn: async () =>
      ((await supabaseClient.from("checklist_templates").select("id, name, description, active, updated_at, task_type_id").eq("active", true).order("name")).data ?? []) as TemplateRow[],
  });
}
