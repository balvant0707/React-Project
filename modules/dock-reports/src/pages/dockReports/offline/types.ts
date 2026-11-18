// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/types.ts).
// The local, offline-first working copy of one Dock Report - the actual
// source of truth while `editingMode` is on (see useDockReportDraft.ts).
// Every edit, from any tab, mutates this object and persists it to
// IndexedDB immediately; syncing to Supabase happens opportunistically and
// is never required for an edit to "count" locally.
//
// Areas/products/batches are re-sent as a WHOLE tree on every sync (via
// replace_dock_report_children, same as the online-only version) - they
// don't need per-row synced/deleted tracking, a locally deleted row is just
// removed from the array. Daily logs/entries, photos and signatures are
// NOT covered by one atomic RPC, so each row tracks its own `synced`/
// `deleted` state and is upserted (or deleted) individually on sync - see
// sync.ts.

export type DraftHeader = {
  report_number: string | null;
  status: "draft" | "submitted" | "finalized";
  indocking_date: string | null;
  outdocking_date: string | null;
  // IANA zone of the yard; time_taken of weather readings and activities is wall-clock time in it.
  time_zone: string | null;
  technical_service_rep_user_id: string | null;
  sales_account_user_id: string | null;
  antifouling_line_fwd_m: number | null;
  antifouling_line_aft_m: number | null;
  boottop_line_fwd_m: number | null;
  boottop_line_aft_m: number | null;
  cathodic_protection_type_phrase_id: string | null;
  cathodic_protection_anode_count: number | null;
  remarks_text: string | null;
};

export type DraftBatch = {
  key: string;
  id: string;
  batch_number: string;
  drum_quantity: number | null;
  consumption_date: string | null;
};

export type DraftAreaProduct = {
  key: string;
  id: string;
  product_packaging_id: string | null;
  coat_mode_phrase_id: string | null;
  coat_pct: number | null;
  application_method_phrase_id: string | null;
  dry_film_thickness_um: number | null;
  measured_dry_film_thickness_um: number | null;
  batches: DraftBatch[];
};

export type DraftArea = {
  key: string;
  id: string;
  area_id: string | null;
  size_m2: number | null;
  substrate_phrase_id: string | null;
  environment_standard_phrase_id: string | null;
  surface_preparation_text: string | null;
  actual_surface_preparation_text: string | null;
  remarks_text: string | null;
  fouling_extent_pct: number | null;
  fouling_evaluation_phrase_id: string | null;
  condition_comments_text: string | null;
  products: DraftAreaProduct[];
};

// Two tables, not one merged "activity+weather" row (that was the original
// design - see 20260926090000 - corrected by 20260927220000 once our own
// ATLAS S Daily Report template turned out to have them as two separate
// tables, not one). Both are repeatable per day, independently.
export type DraftWeatherReading = {
  id: string;
  time_taken: string | null;
  air_temperature_c: number | null;
  surface_temperature_c: number | null;
  dew_point_c: number | null;
  relative_humidity_pct: number | null;
  wind_condition_text: string | null;
  synced: boolean;
  deleted?: boolean;
};

export type DraftActivity = {
  id: string;
  dock_report_area_id: string | null;
  time_taken: string | null;
  activity_text: string | null;
  application_method_phrase_id: string | null;
  synced: boolean;
  deleted?: boolean;
};

// A row with none of its actual content fields touched yet - the always-
// present trailing blank row in the Daily tab's Weather/Activity log tables
// (see dailyJournalPanel.tsx) is this, and it's never synced to the server
// (see sync.ts) - only what the tech actually filled in gets saved.
export const isEmptyWeatherReading = (w: DraftWeatherReading): boolean =>
  !w.time_taken &&
  w.air_temperature_c == null &&
  w.surface_temperature_c == null &&
  w.dew_point_c == null &&
  w.relative_humidity_pct == null &&
  !w.wind_condition_text;

// An activity with no content of its own can still be worth keeping if a
// photo already points at it (the tech snapped a photo before typing
// anything) - that's decided where photos are known about (sync.ts), not
// here, so this only looks at the row's own fields.
export const isEmptyActivity = (a: DraftActivity): boolean =>
  !a.dock_report_area_id && !a.time_taken && !a.activity_text && !a.application_method_phrase_id;

export type DraftDailyLog = {
  id: string;
  log_date: string;
  // Who "reported" this day is just created_by_user_id - the DB defaults it
  // to auth.uid() at insert (same audit column every major entity has), so
  // there's nothing to pick and no UI for it. Read-only here: never sent by
  // sync.ts, only ever populated by a fetch from the server. Used solely to
  // resolve a name for PDF exports (pdfExport.ts).
  created_by_user_id: string | null;
  narrative_text: string | null;
  weatherReadings: DraftWeatherReading[];
  activities: DraftActivity[];
  synced: boolean;
  deleted?: boolean;
};

export type DraftPhoto = {
  id: string;
  dock_report_area_id: string | null;
  dock_report_daily_log_id: string | null;
  // The specific activity this photo documents, if any - separate from (and
  // narrower than) the day/area links above, which stay generic.
  dock_report_activity_id: string | null;
  stage_phrase_id: string | null;
  taken_at: string | null;
  caption_text: string | null;
  include_in_daily_report: boolean;
  include_in_final_report: boolean;
  // Null until the blob (see blobKey) has actually reached Storage -
  // mirrors dock_report_photos.storage_path's own nullability, which the
  // schema already designed for exactly this (see the migration's column
  // comment: "nullable until upload completes - offline capture").
  storage_path: string | null;
  blobKey: string | null;
  synced: boolean;
  deleted?: boolean;
};

export type SignatureRole = "owner_representative" | "npm_representative" | "shipyard_representative";

export type DraftSignature = {
  id: string;
  role: SignatureRole;
  signer_name: string | null;
  signed_at: string | null;
  signature_storage_path: string | null;
  blobKey: string | null;
  synced: boolean;
  deleted?: boolean;
};

export type SyncStatus = "synced" | "pending" | "syncing" | "offline" | "error";

export type DockReportDraft = {
  id: string;
  // Header/areas sync as a whole on every attempt (cheap: one update + one
  // RPC call) rather than tracking per-field state, but the UI still needs
  // to know "is there anything of THIS kind waiting" - this flag is it,
  // set on every header/area mutation and cleared once a sync succeeds.
  dirty: boolean;
  updatedAt: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  header: DraftHeader;
  areas: DraftArea[];
  dailyLogs: DraftDailyLog[];
  photos: DraftPhoto[];
  signatures: DraftSignature[];
};

// A stored blob, keyed by an opaque string (see photosPanel.tsx/
// signaturesPanel.tsx) - IndexedDB stores Blob values natively, no base64
// encoding needed.
export type StoredBlob = {
  key: string;
  blob: Blob;
};
