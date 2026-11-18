// Ported 1:1 from the NPM tool (app/src/pages/dockReports/createDockReport.ts).
import { supabaseClient } from "@rbp/core";
import { userTimeZone } from "@rbp/ui";

export type DockReportSpecCandidate = {
  id: string;
  specification_number: string;
  version: number;
  status: string;
};

// A hull_event_id is unique on dock_reports - if one already exists for this
// hull event, "New Dock Report" should just open it rather than fail on the
// unique constraint (or, worse, silently offer a second one the DB would
// reject).
export async function findExistingDockReportId(hullEventId: string): Promise<string | null> {
  const { data } = await supabaseClient.from("dock_reports").select("id").eq("hull_event_id", hullEventId).maybeSingle();
  return data?.id ?? null;
}

export async function loadHullEventSpecifications(hullEventId: string): Promise<DockReportSpecCandidate[]> {
  const { data } = await supabaseClient
    .from("specifications")
    .select("id, specification_number, version, status")
    .eq("hull_event_id", hullEventId)
    .order("specification_number")
    .order("version");
  return data ?? [];
}

// prepare_dock_report() (20260926090000) validates the hull event is DD/NB
// and the specification belongs to it, mirrors vessel_id, and defaults
// sales rep/TSR/team from the hull event plus AF-line/boottop/cathodic-
// protection from the vessel's own previous report - none of that is
// duplicated here, this is a plain insert. What IS this function's job:
// prefilling dock_report_areas/_area_products from the linked
// specification's own areas/products, which prepare_dock_report does NOT do
// (~/npm_tool/docs/dock-report-module.md "Spec/area/product duplication" - the two
// tables mirror each other's shape but are populated independently).
export async function createDockReport(hullEventId: string, specificationId: string): Promise<string> {
  const { data: created, error } = await supabaseClient
    .from("dock_reports")
    // The yard's zone for the daily times starts as the creator's; editable on Overview.
    .insert({ hull_event_id: hullEventId, specification_id: specificationId, time_zone: userTimeZone() })
    .select("id")
    .single();
  if (error) throw error;

  const { data: specAreas, error: areasError } = await supabaseClient
    .from("specification_areas")
    .select("*, specification_area_products(*)")
    .eq("specification_id", specificationId)
    .order("sequence");
  if (areasError) throw areasError;

  if (specAreas && specAreas.length > 0) {
    const payload = specAreas.map((a: any) => ({
      area_id: a.area_id,
      size_m2: a.size_m2,
      substrate_phrase_id: a.substrate_phrase_id,
      environment_standard_phrase_id: a.environment_standard_phrase_id,
      // Prefilled as the starting point; actual_* stays blank for the yard to
      // fill in fresh (see the schema migration's own column comment).
      surface_preparation_text: a.surface_preparation_text,
      actual_surface_preparation_text: null,
      remarks_text: a.remarks_text,
      fouling_extent_pct: null,
      fouling_evaluation_phrase_id: null,
      condition_comments_text: null,
      products: (a.specification_area_products ?? []).map((p: any) => ({
        product_packaging_id: p.product_packaging_id,
        coat_mode_phrase_id: p.coat_mode_phrase_id,
        coat_pct: p.coat_pct,
        application_method_phrase_id: p.application_method_phrase_id,
        dry_film_thickness_um: p.dry_film_thickness_um,
        measured_dry_film_thickness_um: null,
        batches: [],
      })),
    }));
    const { error: childrenError } = await supabaseClient.rpc("replace_dock_report_children", {
      p_dock_report_id: created.id,
      p_areas: payload,
    });
    if (childrenError) throw childrenError;
  }

  return created.id;
}
