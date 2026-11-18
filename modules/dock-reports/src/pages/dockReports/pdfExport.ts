// Ported 1:1 from the NPM tool (app/src/pages/dockReports/pdfExport.ts).
// Data-shaping for both Dock Report PDF exports (the compiled Dry Dock
// Report and a single day's Daily Report) - show.tsx stays responsible for
// gathering the current draft/reference-data state, calling these, and
// actually building/downloading the PDF blob (same split as
// pages/specifications/pdfExport.ts). Unlike that file, this one DOES do
// its own network/IndexedDB reads - resolving a photo/signature's
// storage_path or blobKey into an actual displayable URL is just as much
// "shaping the row into a renderable value" as an option-id-to-label
// lookup, and there's no other layer already doing it for these two
// exports the way show.tsx pre-fetches overcoating intervals for specs.
import { supabaseClient } from "@rbp/core";
import { optionLabel, type PhraseOption as Option } from "@rbp/core";
import { getBlob } from "./offline/draftStore";
import {
  isEmptyWeatherReading,
  isEmptyActivity,
  type DraftHeader,
  type DraftArea,
  type DraftDailyLog,
  type DraftPhoto,
  type DraftSignature,
} from "./offline/types";
import type { PackagingInfo } from "./areasEditor";
import { DOCK_REPORT_STATUS_OPTIONS } from "./statusOptions";
import type { DockReportPdfData, PdfDockReportArea, PdfDailyLog, PdfReportPhoto, PdfDockReportSignature } from "../../pdf/DockReportPdf";
import type { DailyReportPdfData } from "../../pdf/DailyReportPdf";
import { ATTACHMENT_BUCKET } from "@rbp/module-messaging/src/notes/attachments.ts";


const ROLE_LABELS: Record<string, string> = {
  owner_representative: "Owner Representative",
  npm_representative: "NPM Representative",
  shipyard_representative: "Shipyard Representative",
};


// Resolves a display URL for every row that has one: a signed Storage URL
// (batched in one call) for anything already uploaded, a local blob: URL
// (tracked in `revokeList` so the caller can free it once the PDF blob has
// actually been built) for anything still only in this device's IndexedDB -
// the same resolution PhotosPanel/SignaturesPanel do for on-screen display,
// reused here for the PDF. A row with neither (offline, and this device
// never captured it) resolves to no URL - the PDF renders a placeholder for
// it rather than failing the whole export.
// Exported so dailyJournalPanel.tsx's Daily tab can resolve the same day's
// photo thumbnails on-screen with this one implementation, instead of
// hand-rolling its own copy of this exact signed-URL/blob-fallback logic.
export async function resolveDisplayUrls<T extends { id: string }>(
  rows: T[],
  getStoragePath: (row: T) => string | null,
  getBlobKey: (row: T) => string | null,
  revokeList: string[],
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const withPath = rows.filter((r) => getStoragePath(r));
  if (withPath.length) {
    const { data: signed } = await supabaseClient.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(withPath.map((r) => getStoragePath(r)!) as string[], 3600);
    (signed ?? []).forEach((s, i) => {
      if (s.signedUrl) urls.set(withPath[i].id, s.signedUrl);
    });
  }
  for (const r of rows) {
    if (getStoragePath(r)) continue;
    const key = getBlobKey(r);
    if (!key) continue;
    const blob = await getBlob(key);
    if (blob) {
      const url = URL.createObjectURL(blob);
      revokeList.push(url);
      urls.set(r.id, url);
    }
  }
  return urls;
}

const buildWeatherReading = (w: any) => ({
  timeTaken: w.time_taken,
  airTemperatureC: w.air_temperature_c,
  surfaceTemperatureC: w.surface_temperature_c,
  dewPointC: w.dew_point_c,
  relativeHumidityPct: w.relative_humidity_pct,
  windConditionText: w.wind_condition_text,
});

const buildActivity = (a: any, savedAreaOptions: Option[], applicationMethodOptions: Option[]) => ({
  timeTaken: a.time_taken,
  activityText: a.activity_text,
  areaLabel: optionLabel(savedAreaOptions, a.dock_report_area_id),
  applicationMethodLabel: optionLabel(applicationMethodOptions, a.application_method_phrase_id),
});

const buildPhoto = (
  p: DraftPhoto,
  urls: Map<string, string>,
  savedAreaOptions: Option[],
  stageOptions: Option[],
  activityTextById: Map<string, string | null>,
): PdfReportPhoto => ({
  imageUrl: urls.get(p.id) ?? null,
  captionText: p.caption_text,
  stageLabel: optionLabel(stageOptions, p.stage_phrase_id),
  takenAt: p.taken_at,
  areaLabel: optionLabel(savedAreaOptions, p.dock_report_area_id),
  activityLabel: p.dock_report_activity_id ? activityTextById.get(p.dock_report_activity_id) ?? null : null,
});

export async function buildDockReportPdfData(params: {
  vesselName: string | null;
  vesselImo: string | null;
  hullEventTypeText: string | null;
  specificationNumber: string | null;
  header: DraftHeader;
  areas: DraftArea[];
  dailyLogs: DraftDailyLog[];
  photos: DraftPhoto[];
  signatures: DraftSignature[];
  packagingById: Map<string, PackagingInfo>;
  userOptions: Option[];
  areaOptions: Option[];
  savedAreaOptions: Option[];
  substrateOptions: Option[];
  environmentOptions: Option[];
  coatModeOptions: Option[];
  applicationMethodOptions: Option[];
  foulingEvaluationOptions: Option[];
  cathodicProtectionOptions: Option[];
  stageOptions: Option[];
}): Promise<{ data: DockReportPdfData; cleanup: () => void }> {
  const revokeList: string[] = [];
  const finalPhotos = params.photos.filter((p) => !p.deleted && p.include_in_final_report);
  const photoUrls = await resolveDisplayUrls(
    finalPhotos,
    (p) => p.storage_path,
    (p) => p.blobKey,
    revokeList,
  );
  const activeSignatures = params.signatures.filter((s) => !s.deleted);
  const signatureUrls = await resolveDisplayUrls(
    activeSignatures,
    (s) => s.signature_storage_path,
    (s) => s.blobKey,
    revokeList,
  );

  const areas: PdfDockReportArea[] = params.areas
    .filter((a) => !(a as any).deleted)
    .map((a) => ({
      areaLabel: optionLabel(params.areaOptions, a.area_id),
      sizeM2: a.size_m2,
      substrateLabel: optionLabel(params.substrateOptions, a.substrate_phrase_id),
      environmentLabel: optionLabel(params.environmentOptions, a.environment_standard_phrase_id),
      surfacePreparationText: a.surface_preparation_text,
      actualSurfacePreparationText: a.actual_surface_preparation_text,
      foulingExtentPct: a.fouling_extent_pct,
      foulingEvaluationLabel: optionLabel(params.foulingEvaluationOptions, a.fouling_evaluation_phrase_id),
      conditionCommentsText: a.condition_comments_text,
      products: a.products.map((p) => {
        const pkg = params.packagingById.get(p.product_packaging_id ?? "");
        return {
          productLabel: pkg?.label ?? "—",
          colourLabel: pkg?.colour ?? null,
          coatModeLabel: optionLabel(params.coatModeOptions, p.coat_mode_phrase_id),
          coatPct: p.coat_pct,
          applicationMethodLabel: optionLabel(params.applicationMethodOptions, p.application_method_phrase_id),
          specDryFilmThicknessUm: p.dry_film_thickness_um ?? pkg?.dry_film_thickness_um ?? null,
          measuredDryFilmThicknessUm: p.measured_dry_film_thickness_um,
          batches: p.batches.map((b) => ({
            batchNumber: b.batch_number,
            drumQuantity: b.drum_quantity,
            consumptionDate: b.consumption_date,
          })),
        };
      }),
    }));

  // Built across every day's activities so a photo linked to one (via
  // dock_report_activity_id) can be labelled with what it documents,
  // wherever in the compiled PDF that photo ends up.
  const activityTextById = new Map<string, string | null>(
    params.dailyLogs.flatMap((l) => l.activities.filter((a) => !a.deleted).map((a) => [a.id, a.activity_text] as const)),
  );

  const dailyLogs: PdfDailyLog[] = params.dailyLogs
    .filter((l) => !l.deleted)
    .map((l) => ({
      logDate: l.log_date,
      reportedByName: optionLabel(params.userOptions, l.created_by_user_id),
      narrativeText: l.narrative_text,
      weatherReadings: l.weatherReadings.filter((w) => !w.deleted && !isEmptyWeatherReading(w)).map(buildWeatherReading),
      activities: l.activities
        .filter((a) => !a.deleted && !isEmptyActivity(a))
        .map((a) => buildActivity(a, params.savedAreaOptions, params.applicationMethodOptions)),
    }));

  const signatures: PdfDockReportSignature[] = activeSignatures.map((s) => ({
    roleLabel: ROLE_LABELS[s.role] ?? s.role,
    signerName: s.signer_name,
    signedAt: s.signed_at,
    imageUrl: signatureUrls.get(s.id) ?? null,
  }));

  const data: DockReportPdfData = {
    reportNumber: params.header.report_number ?? "",
    statusLabel: DOCK_REPORT_STATUS_OPTIONS.find((o) => o.value === params.header.status)?.label ?? params.header.status,
    vesselName: params.vesselName,
    vesselImo: params.vesselImo,
    hullEventTypeText: params.hullEventTypeText,
    specificationNumber: params.specificationNumber,
    technicalServiceRepName: optionLabel(params.userOptions, params.header.technical_service_rep_user_id),
    salesAccountName: optionLabel(params.userOptions, params.header.sales_account_user_id),
    indockingDate: params.header.indocking_date,
    outdockingDate: params.header.outdocking_date,
    timeZone: params.header.time_zone,
    antifoulingLineFwdM: params.header.antifouling_line_fwd_m,
    antifoulingLineAftM: params.header.antifouling_line_aft_m,
    boottopLineFwdM: params.header.boottop_line_fwd_m,
    boottopLineAftM: params.header.boottop_line_aft_m,
    cathodicProtectionTypeLabel: optionLabel(params.cathodicProtectionOptions, params.header.cathodic_protection_type_phrase_id),
    cathodicProtectionAnodeCount: params.header.cathodic_protection_anode_count,
    areas,
    dailyLogs,
    photos: finalPhotos.map((p) => buildPhoto(p, photoUrls, params.savedAreaOptions, params.stageOptions, activityTextById)),
    signatures,
    remarksText: params.header.remarks_text,
    showDraftWatermark: params.header.status === "draft",
  };

  return { data, cleanup: () => revokeList.forEach((u) => URL.revokeObjectURL(u)) };
}

export async function buildDailyReportPdfData(params: {
  vesselName: string | null;
  vesselImo: string | null;
  reportNumber: string | null;
  log: DraftDailyLog;
  photos: DraftPhoto[];
  userOptions: Option[];
  savedAreaOptions: Option[];
  applicationMethodOptions: Option[];
  stageOptions: Option[];
}): Promise<{ data: DailyReportPdfData; cleanup: () => void }> {
  const revokeList: string[] = [];
  const dayPhotos = params.photos.filter(
    (p) => !p.deleted && p.include_in_daily_report && p.dock_report_daily_log_id === params.log.id,
  );
  const photoUrls = await resolveDisplayUrls(
    dayPhotos,
    (p) => p.storage_path,
    (p) => p.blobKey,
    revokeList,
  );

  const activityTextById = new Map<string, string | null>(
    params.log.activities.filter((a) => !a.deleted).map((a) => [a.id, a.activity_text] as const),
  );

  const data: DailyReportPdfData = {
    reportNumber: params.reportNumber ?? "",
    vesselName: params.vesselName,
    vesselImo: params.vesselImo,
    logDate: params.log.log_date,
    reportedByName: optionLabel(params.userOptions, params.log.created_by_user_id),
    narrativeText: params.log.narrative_text,
    weatherReadings: params.log.weatherReadings.filter((w) => !w.deleted && !isEmptyWeatherReading(w)).map(buildWeatherReading),
    activities: params.log.activities
      .filter((a) => !a.deleted && !isEmptyActivity(a))
      .map((a) => buildActivity(a, params.savedAreaOptions, params.applicationMethodOptions)),
    photos: dayPhotos.map((p) => buildPhoto(p, photoUrls, params.savedAreaOptions, params.stageOptions, activityTextById)),
  };

  return { data, cleanup: () => revokeList.forEach((u) => URL.revokeObjectURL(u)) };
}
