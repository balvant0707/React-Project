// Ported 1:1 from the NPM tool (app/src/modules/specAreas/specAreas.ts).
import { supabaseClient } from "@rbp/core";

export type SpecArea = {
  id: string;
  code: string | null;
  name_en: string;
  is_immersed: boolean;
  af_zone: "flat_bottom" | "boottop" | "vertical" | null;
  sequence: number;
};

export async function loadSpecAreas(): Promise<SpecArea[]> {
  const { data } = await supabaseClient
    .from("spec_areas")
    .select("id, code, name_en, is_immersed, af_zone, sequence")
    .order("sequence");
  return data ?? [];
}
