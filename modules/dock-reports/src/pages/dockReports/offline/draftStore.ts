// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/draftStore.ts).
import { supabaseClient } from "@rbp/core";
import { idbGet, idbPut, idbDelete, DRAFTS_STORE, BLOBS_STORE } from "./db";
import type { DockReportDraft, DraftArea, DraftDailyLog, DraftPhoto, DraftSignature, StoredBlob } from "./types";

export const loadLocalDraft = (dockReportId: string): Promise<DockReportDraft | undefined> =>
  idbGet<DockReportDraft>(DRAFTS_STORE, dockReportId);

export const saveLocalDraft = async (draft: DockReportDraft): Promise<DockReportDraft> => {
  const next = { ...draft, updatedAt: new Date().toISOString() };
  await idbPut(DRAFTS_STORE, next);
  return next;
};

export const putBlob = (key: string, blob: Blob): Promise<void> => idbPut(BLOBS_STORE, { key, blob } satisfies StoredBlob);
export const getBlob = (key: string): Promise<Blob | undefined> => idbGet<StoredBlob>(BLOBS_STORE, key).then((r) => r?.blob);
export const deleteBlob = (key: string): Promise<void> => idbDelete(BLOBS_STORE, key);

// Exported too - show.tsx reuses these to render Areas/Daily Log/Photos/
// Signatures read-only (from a plain server fetch) for a viewer who isn't
// editing, so the same row shape backs both the draft and the read-only
// view without a second parallel set of types.
export const toDraftArea = (a: any): DraftArea => ({
  key: a.id,
  id: a.id,
  area_id: a.area_id,
  size_m2: a.size_m2,
  substrate_phrase_id: a.substrate_phrase_id,
  environment_standard_phrase_id: a.environment_standard_phrase_id,
  surface_preparation_text: a.surface_preparation_text,
  actual_surface_preparation_text: a.actual_surface_preparation_text,
  remarks_text: a.remarks_text,
  fouling_extent_pct: a.fouling_extent_pct,
  fouling_evaluation_phrase_id: a.fouling_evaluation_phrase_id,
  condition_comments_text: a.condition_comments_text,
  products: (a.dock_report_area_products ?? []).map((p: any) => ({
    key: p.id,
    id: p.id,
    product_packaging_id: p.product_packaging_id,
    coat_mode_phrase_id: p.coat_mode_phrase_id,
    coat_pct: p.coat_pct,
    application_method_phrase_id: p.application_method_phrase_id,
    dry_film_thickness_um: p.dry_film_thickness_um,
    measured_dry_film_thickness_um: p.measured_dry_film_thickness_um,
    batches: (p.dock_report_area_product_batches ?? []).map((b: any) => ({
      key: b.id,
      id: b.id,
      batch_number: b.batch_number ?? "",
      drum_quantity: b.drum_quantity,
      consumption_date: b.consumption_date,
    })),
  })),
});

export const toDraftDailyLog = (l: any): DraftDailyLog => ({
  id: l.id,
  log_date: l.log_date,
  created_by_user_id: l.created_by_user_id,
  narrative_text: l.narrative_text,
  synced: true,
  weatherReadings: (l.dock_report_weather_readings ?? []).map((w: any) => ({ ...w, synced: true })),
  activities: (l.dock_report_activities ?? []).map((a: any) => ({ ...a, synced: true })),
});

export const toDraftPhoto = (p: any): DraftPhoto => ({
  id: p.id,
  dock_report_area_id: p.dock_report_area_id,
  dock_report_daily_log_id: p.dock_report_daily_log_id,
  dock_report_activity_id: p.dock_report_activity_id,
  stage_phrase_id: p.stage_phrase_id,
  taken_at: p.taken_at,
  caption_text: p.caption_text,
  include_in_daily_report: p.include_in_daily_report,
  include_in_final_report: p.include_in_final_report,
  storage_path: p.storage_path,
  blobKey: null,
  synced: true,
});

export const toDraftSignature = (s: any): DraftSignature => ({
  id: s.id,
  role: s.role,
  signer_name: s.signer_name,
  signed_at: s.signed_at,
  signature_storage_path: s.signature_storage_path,
  blobKey: null,
  synced: true,
});

// Pulls the dock report's full current server state into a fresh local
// draft - called when "Start Editing" acquires the lock (see
// useDockReportDraft.ts). Anything already staged locally and not yet
// synced is intentionally NOT overwritten by this - see mergeWithExisting.
export async function fetchDraftFromServer(dockReportId: string): Promise<DockReportDraft> {
  const { data: row, error } = (await supabaseClient
    .from("dock_reports")
    .select(
      "report_number, status, indocking_date, outdocking_date, time_zone, technical_service_rep_user_id, sales_account_user_id, " +
        "antifouling_line_fwd_m, antifouling_line_aft_m, boottop_line_fwd_m, boottop_line_aft_m, " +
        "cathodic_protection_type_phrase_id, cathodic_protection_anode_count, remarks_text, " +
        "dock_report_areas(*, dock_report_area_products(*, dock_report_area_product_batches(*))), " +
        "dock_report_daily_logs(*, dock_report_weather_readings(*), dock_report_activities(*)), " +
        "dock_report_photos(*), dock_report_signatures(*)",
    )
    .eq("id", dockReportId)
    .single()) as any;
  if (error) throw error;

  return {
    id: dockReportId,
    dirty: false,
    updatedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    lastSyncError: null,
    header: {
      report_number: row.report_number,
      status: row.status,
      indocking_date: row.indocking_date,
      outdocking_date: row.outdocking_date,
      time_zone: row.time_zone,
      technical_service_rep_user_id: row.technical_service_rep_user_id,
      sales_account_user_id: row.sales_account_user_id,
      antifouling_line_fwd_m: row.antifouling_line_fwd_m,
      antifouling_line_aft_m: row.antifouling_line_aft_m,
      boottop_line_fwd_m: row.boottop_line_fwd_m,
      boottop_line_aft_m: row.boottop_line_aft_m,
      cathodic_protection_type_phrase_id: row.cathodic_protection_type_phrase_id,
      cathodic_protection_anode_count: row.cathodic_protection_anode_count,
      remarks_text: row.remarks_text,
    },
    areas: (row.dock_report_areas ?? []).map(toDraftArea),
    dailyLogs: (row.dock_report_daily_logs ?? []).map(toDraftDailyLog),
    photos: (row.dock_report_photos ?? []).map(toDraftPhoto),
    signatures: (row.dock_report_signatures ?? []).map(toDraftSignature),
  };
}
