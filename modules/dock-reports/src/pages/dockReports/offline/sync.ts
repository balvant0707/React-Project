// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/sync.ts).
import { supabaseClient } from "@rbp/core";
import { getBlob, deleteBlob } from "./draftStore";
import {
  isEmptyWeatherReading,
  isEmptyActivity,
  type DockReportDraft,
  type DraftDailyLog,
  type DraftPhoto,
  type DraftSignature,
} from "./types";
import { ATTACHMENT_BUCKET } from "@rbp/module-messaging/src/notes/attachments.ts";


// `id` is the row's own dock_report_areas id (made on the client by blankArea(), so known before the first sync):
// replace_dock_report_children() upserts by it, so daily entries and photos tagged to the area stay linked.
const areaRowsToPayload = (areas: DockReportDraft["areas"]) =>
  areas.map((area) => ({
    id: area.id,
    area_id: area.area_id,
    size_m2: area.size_m2,
    substrate_phrase_id: area.substrate_phrase_id,
    environment_standard_phrase_id: area.environment_standard_phrase_id,
    surface_preparation_text: area.surface_preparation_text,
    actual_surface_preparation_text: area.actual_surface_preparation_text,
    remarks_text: area.remarks_text,
    fouling_extent_pct: area.fouling_extent_pct,
    fouling_evaluation_phrase_id: area.fouling_evaluation_phrase_id,
    condition_comments_text: area.condition_comments_text,
    products: area.products
      .filter((p) => p.product_packaging_id)
      .map((p) => ({
        product_packaging_id: p.product_packaging_id,
        coat_mode_phrase_id: p.coat_mode_phrase_id,
        coat_pct: p.coat_pct,
        application_method_phrase_id: p.application_method_phrase_id,
        dry_film_thickness_um: p.dry_film_thickness_um,
        measured_dry_film_thickness_um: p.measured_dry_film_thickness_um,
        batches: p.batches
          .filter((b) => b.batch_number)
          .map((b) => ({ batch_number: b.batch_number, drum_quantity: b.drum_quantity, consumption_date: b.consumption_date })),
      })),
  }));

// Daily logs/weather readings/activities, photos and signatures aren't
// covered by one atomic RPC (unlike areas) - each row is upserted or
// deleted individually, using its own client-generated id as the upsert
// key. A row that was created and then deleted again without ever reaching
// the server (`!synced`) just drops out locally - no server call needed for
// it at all.
//
// `photos` is passed in (not synced yet at this point - see
// syncDraftToServer's ordering) so an activity that's otherwise still blank
// but already has a photo pointing at it (tech snapped a photo before
// typing anything) is kept and synced anyway - the photo upsert right after
// this needs a real parent row to reference, not a client-only id that
// never made it to the server.
async function syncDailyLogs(dockReportId: string, logs: DraftDailyLog[], photos: DraftPhoto[]): Promise<DraftDailyLog[]> {
  const kept: DraftDailyLog[] = [];
  for (const log of logs) {
    if (log.deleted) {
      if (log.synced) await supabaseClient.from("dock_report_daily_logs").delete().eq("id", log.id);
      continue;
    }
    // created_by_user_id is intentionally not sent - it's a read-only audit
    // column (DB default auth.uid() at insert), not something this client
    // ever sets or overrides.
    const { error } = await supabaseClient.from("dock_report_daily_logs").upsert({
      id: log.id,
      dock_report_id: dockReportId,
      log_date: log.log_date,
      narrative_text: log.narrative_text,
    });
    if (error) throw error;

    const keptWeatherReadings = [];
    for (const w of log.weatherReadings) {
      if (w.deleted) {
        if (w.synced) await supabaseClient.from("dock_report_weather_readings").delete().eq("id", w.id);
        continue;
      }
      if (isEmptyWeatherReading(w)) {
        // The always-present blank trailing row (dailyJournalPanel.tsx) -
        // never persisted while still blank; if it WAS previously saved and
        // got cleared back to blank since, remove it from the server too.
        if (w.synced) await supabaseClient.from("dock_report_weather_readings").delete().eq("id", w.id);
        keptWeatherReadings.push({ ...w, synced: false });
        continue;
      }
      const { error: wError } = await supabaseClient.from("dock_report_weather_readings").upsert({
        id: w.id,
        dock_report_daily_log_id: log.id,
        time_taken: w.time_taken,
        air_temperature_c: w.air_temperature_c,
        surface_temperature_c: w.surface_temperature_c,
        dew_point_c: w.dew_point_c,
        relative_humidity_pct: w.relative_humidity_pct,
        wind_condition_text: w.wind_condition_text,
      });
      if (wError) throw wError;
      keptWeatherReadings.push({ ...w, synced: true });
    }

    const keptActivities = [];
    for (const a of log.activities) {
      if (a.deleted) {
        if (a.synced) await supabaseClient.from("dock_report_activities").delete().eq("id", a.id);
        continue;
      }
      const hasPhoto = photos.some((p) => !p.deleted && p.dock_report_activity_id === a.id);
      if (isEmptyActivity(a) && !hasPhoto) {
        if (a.synced) await supabaseClient.from("dock_report_activities").delete().eq("id", a.id);
        keptActivities.push({ ...a, synced: false });
        continue;
      }
      const { error: aError } = await supabaseClient.from("dock_report_activities").upsert({
        id: a.id,
        dock_report_daily_log_id: log.id,
        dock_report_area_id: a.dock_report_area_id,
        time_taken: a.time_taken,
        activity_text: a.activity_text,
        application_method_phrase_id: a.application_method_phrase_id,
      });
      if (aError) throw aError;
      keptActivities.push({ ...a, synced: true });
    }
    kept.push({ ...log, synced: true, weatherReadings: keptWeatherReadings, activities: keptActivities });
  }
  return kept;
}

async function syncPhotos(dockReportId: string, photos: DraftPhoto[]): Promise<DraftPhoto[]> {
  const kept: DraftPhoto[] = [];
  for (const photo of photos) {
    if (photo.deleted) {
      if (photo.synced) {
        if (photo.storage_path) await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove([photo.storage_path]);
        await supabaseClient.from("dock_report_photos").delete().eq("id", photo.id);
      }
      if (photo.blobKey) await deleteBlob(photo.blobKey);
      continue;
    }
    let storagePath = photo.storage_path;
    if (!storagePath && photo.blobKey) {
      const blob = await getBlob(photo.blobKey);
      if (blob) {
        storagePath = `dock_reports/${dockReportId}/photos/${photo.id}.png`; // platform: files are authorized by <entity_type>/<id>/ (storage_path_access)
        const { error: uploadError } = await supabaseClient.storage.from(ATTACHMENT_BUCKET).upload(storagePath, blob, { upsert: true });
        if (uploadError) throw uploadError;
        await deleteBlob(photo.blobKey);
      }
    }
    const { error } = await supabaseClient.from("dock_report_photos").upsert({
      id: photo.id,
      dock_report_id: dockReportId,
      dock_report_area_id: photo.dock_report_area_id,
      dock_report_daily_log_id: photo.dock_report_daily_log_id,
      dock_report_activity_id: photo.dock_report_activity_id,
      stage_phrase_id: photo.stage_phrase_id,
      taken_at: photo.taken_at,
      caption_text: photo.caption_text,
      include_in_daily_report: photo.include_in_daily_report,
      include_in_final_report: photo.include_in_final_report,
      storage_path: storagePath,
    });
    if (error) throw error;
    kept.push({ ...photo, storage_path: storagePath, blobKey: storagePath ? null : photo.blobKey, synced: true });
  }
  return kept;
}

async function syncSignatures(dockReportId: string, signatures: DraftSignature[]): Promise<DraftSignature[]> {
  const kept: DraftSignature[] = [];
  for (const sig of signatures) {
    if (sig.deleted) {
      if (sig.synced) {
        if (sig.signature_storage_path) await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove([sig.signature_storage_path]);
        await supabaseClient.from("dock_report_signatures").delete().eq("id", sig.id);
      }
      if (sig.blobKey) await deleteBlob(sig.blobKey);
      continue;
    }
    let storagePath = sig.signature_storage_path;
    if (!storagePath && sig.blobKey) {
      const blob = await getBlob(sig.blobKey);
      if (blob) {
        storagePath = `dock_reports/${dockReportId}/signatures/${sig.role}-${sig.id}.png`;
        const { error: uploadError } = await supabaseClient.storage.from(ATTACHMENT_BUCKET).upload(storagePath, blob, { upsert: true });
        if (uploadError) throw uploadError;
        await deleteBlob(sig.blobKey);
      }
    }
    const { error } = await supabaseClient.from("dock_report_signatures").upsert({
      id: sig.id,
      dock_report_id: dockReportId,
      role: sig.role,
      signer_name: sig.signer_name,
      signed_at: sig.signed_at,
      signature_storage_path: storagePath,
    });
    if (error) throw error;
    kept.push({ ...sig, signature_storage_path: storagePath, blobKey: storagePath ? null : sig.blobKey, synced: true });
  }
  return kept;
}

// Pushes the whole draft to Supabase, in dependency order (header -> areas
// -> daily logs/weather readings/activities -> photos -> signatures -
// photos depend on activities for their optional dock_report_activity_id
// link, so daily logs must sync first; nothing else here depends on
// something later, so a failure partway through just leaves the remaining
// pieces to retry on the next sync attempt). Returns the updated draft
// (synced flags flipped, deleted rows dropped, uploaded blobs cleared) -
// the caller (useDockReportDraft.ts) is responsible for persisting it back
// to IndexedDB.
export async function syncDraftToServer(draft: DockReportDraft): Promise<DockReportDraft> {
  const { error: headerError } = await supabaseClient.from("dock_reports").update(draft.header).eq("id", draft.id);
  if (headerError) throw headerError;

  const { error: areasError } = await supabaseClient.rpc("replace_dock_report_children", {
    p_dock_report_id: draft.id,
    p_areas: areaRowsToPayload(draft.areas),
  });
  if (areasError) throw areasError;

  const dailyLogs = await syncDailyLogs(draft.id, draft.dailyLogs, draft.photos);
  const photos = await syncPhotos(draft.id, draft.photos);
  const signatures = await syncSignatures(draft.id, draft.signatures);

  return {
    ...draft,
    dirty: false,
    dailyLogs,
    photos,
    signatures,
    lastSyncedAt: new Date().toISOString(),
    lastSyncError: null,
  };
}
