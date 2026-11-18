// Ported 1:1 from COMPASS (app/src/modules/absences/useAbsenceTypes.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";

// Absence types (master data, ~/maintenance_tool/docs/leave.md "Absences"): each names the task type whose route handles it.
export type AbsenceType = {
  id: string;
  name: string;
  name_de: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  task_type_id: string;
  counts_as_leave: boolean;
  sort_order: number;
  active: boolean;
};

export const ABSENCE_TYPES_KEY = ["absence-types"];

// All types in their order; inactive ones too, because old entries still name them.
export function useAbsenceTypes() {
  return useQuery({
    queryKey: ABSENCE_TYPES_KEY,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.from("absence_types").select("*").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as AbsenceType[];
    },
  });
}
