// Ported 1:1 from the NPM tool (app/src/pages/dockReports/show.tsx).
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetIdentity } from "@rbp/core";
import { Show } from "@rbp/core";
import {
  Descriptions,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Tabs,
  Button,
  Tag,
  Alert,
  Spin,
  Space,
  Popconfirm,
  App as AntdApp,
} from "antd";
import { EditOutlined, SaveOutlined, LockOutlined, UnlockOutlined, CompassOutlined, FileTextOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { pdf } from "@react-pdf/renderer";
import { usePdfPreview } from "@rbp/module-messaging/src/usePdfPreview.tsx";
import { supabaseClient } from "@rbp/core";
import { EntityDetailChrome } from "@rbp/module-messaging/src/notes/entityDetailChrome.tsx";
import { ENTITY_CONFIG } from "@rbp/module-dock-reports/src/entityTypes.ts";
import { fieldLabel, FIELD_LABELS } from "@rbp/module-dock-reports/src/fieldLabels.ts";
import { usePageBannerTitle, usePageBannerSubtitle } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { loadPhraseOptions, type PhraseOption as Option } from "@rbp/core";
import { loadSpecAreas } from "@rbp/module-offers/src/modules/specAreas/specAreas.ts";
import { loadUserOptions } from "@rbp/module-companies/src/modules/users/users.ts";
import { loadPackagingsByIds } from "@rbp/module-products/src/modules/products/packagings.ts";
import { loadOrCacheReference } from "./offline/referenceCache";
import { DOCK_REPORT_STATUS_OPTIONS, DOCK_REPORT_STATUS_COLOR } from "./statusOptions";
import { DockReportAreasEditor, type PackagingInfo } from "./areasEditor";
import { DailyJournalPanel } from "./dailyJournalPanel";
import { PhotosPanel } from "./photosPanel";
import { SignaturesPanel } from "./signaturesPanel";
import { useDockReportDraft } from "./offline/useDockReportDraft";
import { ConnectivityBadge, DraftSyncBanner } from "./offline/offlineStatus";
import { toDraftArea, toDraftDailyLog, toDraftPhoto, toDraftSignature } from "./offline/draftStore";
import type { DraftHeader } from "./offline/types";
import { DockReportPdf } from "../../pdf/DockReportPdf";
import { DailyReportPdf } from "../../pdf/DailyReportPdf";
import { buildDockReportPdfData, buildDailyReportPdfData } from "./pdfExport";
import { confirmAsync } from "@rbp/ui";
import { errorText } from "@rbp/core";
import { timeZoneOptions, todayIso } from "@rbp/ui";

const L = (field: keyof typeof FIELD_LABELS.dock_reports) => fieldLabel("dock_reports", field);

export const DockReportShow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [dockReport, setDockReport] = useState<any>(null);
  // Set when the initial server read itself failed (offline, or a genuine
  // error) - distinct from "loading". Drives the "resume offline" and
  // "never opened on this device before" states below.
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [zoneOptions] = useState(timeZoneOptions);
  const [editingMode, setEditingMode] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [cathodicProtectionOptions, setCathodicProtectionOptions] = useState<Option[]>([]);
  const [areaOptions, setAreaOptions] = useState<Option[]>([]);
  const [substrateOptions, setSubstrateOptions] = useState<Option[]>([]);
  const [environmentOptions, setEnvironmentOptions] = useState<Option[]>([]);
  const [coatModeOptions, setCoatModeOptions] = useState<Option[]>([]);
  const [applicationMethodOptions, setApplicationMethodOptions] = useState<Option[]>([]);
  const [foulingEvaluationOptions, setFoulingEvaluationOptions] = useState<Option[]>([]);
  const [surfacePrepOptions, setSurfacePrepOptions] = useState<Option[]>([]);
  const [packagings, setPackagings] = useState<PackagingInfo[]>([]);

  const offlineDraft = useDockReportDraft(id!, editingMode);

  const registerPackagings = async (list: PackagingInfo[]) => {
    if (!list.length) return;
    setPackagings((prev) => {
      const known = new Set(prev.map((p) => p.id));
      const added = list.filter((p) => !known.has(p.id));
      return added.length ? [...prev, ...added] : prev;
    });
  };

  // The read-only server view (vessel/hull event/specification names, lock
  // holder, can_edit) - used for the Overview tab's view mode and the
  // header buttons/banner. Deliberately separate from the offline draft:
  // this is live server truth when reachable, and the draft is what keeps
  // working when it isn't - see the catch branch below and
  // ~/npm_tool/docs/dock-report-offline-sync.md "Cold start / resuming offline".
  const load = async () => {
    setLoading(true);
    try {
      const { data: row, error } = (await supabaseClient
        .from("dock_reports")
        .select(
          "*, vessels(name, imo), hull_events(id, phrases(code, text_en)), specifications(specification_number, version), " +
            "tsr:users!dock_reports_technical_service_rep_user_id_fkey(name), sales_rep:users!dock_reports_sales_account_user_id_fkey(name), " +
            "locked_by:users!dock_reports_locked_by_user_id_fkey(name), " +
            "dock_report_areas(*, dock_report_area_products(*, dock_report_area_product_batches(*))), " +
            "dock_report_daily_logs(*, dock_report_weather_readings(*), dock_report_activities(*)), dock_report_photos(*), dock_report_signatures(*), " +
            "can_edit:dock_reports_can_edit",
        )
        .eq("id", id)
        .single()) as any;
      if (error) throw error;
      setDockReport(row);
      setServerUnreachable(false);
      setEditingMode(!!row?.locked_by_user_id && row.locked_by_user_id === identity?.id);
    } catch (e) {
      // Offline (or a real error) - fall back entirely to whatever's
      // already on this device. A local draft existing at all means "Start
      // Editing" already ran here once (which required being online to
      // acquire the lock) - continuing to trust that is the deliberate
      // trade-off documented in the design doc, not an oversight.
      setDockReport(null);
      setServerUnreachable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, identity?.id]);

  // Reference/lookup data - cached locally (offline/referenceCache.ts) so
  // these dropdowns still render correctly on a fully offline reload, not
  // just the draft's own already-picked values.
  useEffect(() => {
    loadOrCacheReference("users", loadUserOptions).then(setUserOptions);
    loadOrCacheReference("phrases:cathodic_protection_type", () => loadPhraseOptions("cathodic_protection_type")).then(setCathodicProtectionOptions);
    loadOrCacheReference("spec_areas", loadSpecAreas).then((rows) => setAreaOptions(rows.map((a) => ({ value: a.id, label: a.name_en }))));
    loadOrCacheReference("phrases:substrate", () => loadPhraseOptions("substrate")).then(setSubstrateOptions);
    loadOrCacheReference("phrases:environment_standard", () => loadPhraseOptions("environment_standard")).then(setEnvironmentOptions);
    loadOrCacheReference("phrases:coat_mode", () => loadPhraseOptions("coat_mode")).then(setCoatModeOptions);
    loadOrCacheReference("phrases:application_method", () => loadPhraseOptions("application_method")).then(setApplicationMethodOptions);
    loadOrCacheReference("phrases:condition_evaluation", () => loadPhraseOptions("condition_evaluation")).then(setFoulingEvaluationOptions);
    loadOrCacheReference("phrases:surface_preparation", () => loadPhraseOptions("surface_preparation")).then(setSurfacePrepOptions);
  }, []);

  // Read-only fallback for a viewer who isn't editing (or can't edit at
  // all) - a plain server fetch, converted through the same row shape the
  // draft uses so Areas/Daily Log/Photos/Signatures render identically
  // either way; the panels below just get `canEdit={false}` and no
  // mutators in this case.
  const readOnlyAreas = (dockReport?.dock_report_areas ?? []).map(toDraftArea);
  const readOnlyDailyLogs = (dockReport?.dock_report_daily_logs ?? []).map(toDraftDailyLog);
  const readOnlyPhotos = (dockReport?.dock_report_photos ?? []).map(toDraftPhoto);
  const readOnlySignatures = (dockReport?.dock_report_signatures ?? []).map(toDraftSignature);
  // Same read-only-fallback idea as the four above, for the header fields a
  // PDF export needs (report number, dates, AF/boottop lines, ...) - a
  // viewer who isn't editing has no draft at all, so these come straight
  // off the plain server row instead.
  const readOnlyHeader: DraftHeader | null = dockReport
    ? {
        report_number: dockReport.report_number,
        status: dockReport.status,
        indocking_date: dockReport.indocking_date,
        outdocking_date: dockReport.outdocking_date,
        time_zone: dockReport.time_zone,
        technical_service_rep_user_id: dockReport.technical_service_rep_user_id,
        sales_account_user_id: dockReport.sales_account_user_id,
        antifouling_line_fwd_m: dockReport.antifouling_line_fwd_m,
        antifouling_line_aft_m: dockReport.antifouling_line_aft_m,
        boottop_line_fwd_m: dockReport.boottop_line_fwd_m,
        boottop_line_aft_m: dockReport.boottop_line_aft_m,
        cathodic_protection_type_phrase_id: dockReport.cathodic_protection_type_phrase_id,
        cathodic_protection_anode_count: dockReport.cathodic_protection_anode_count,
        remarks_text: dockReport.remarks_text,
      }
    : null;

  const displayedAreas = editingMode && offlineDraft.draft ? offlineDraft.draft.areas : readOnlyAreas;
  const displayedDailyLogs = editingMode && offlineDraft.draft ? offlineDraft.draft.dailyLogs : readOnlyDailyLogs;
  const displayedPhotos = editingMode && offlineDraft.draft ? offlineDraft.draft.photos : readOnlyPhotos;
  const displayedSignatures = editingMode && offlineDraft.draft ? offlineDraft.draft.signatures : readOnlySignatures;
  const displayedHeader = editingMode && offlineDraft.draft ? offlineDraft.draft.header : readOnlyHeader;

  // Packagings already used by whichever area list is currently shown -
  // loaded once it's available (draft, online or from IndexedDB; or the
  // read-only server fetch). Adding a product this report has never used
  // before still needs a live catalog search (ProductPackagingSelect) - a
  // documented limitation while offline, see the design doc.
  useEffect(() => {
    const ids = Array.from(
      new Set(displayedAreas.flatMap((a: any) => a.products.map((p: any) => p.product_packaging_id).filter(Boolean) as string[])),
    ) as string[];
    if (!ids.length) return;
    loadOrCacheReference(`packagings:${id}`, () => loadPackagingsByIds(ids)).then(registerPackagings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedAreas.length, displayedAreas.map((a: any) => a.products.length).join(",")]);

  const startEditing = async () => {
    const { data, error } = await supabaseClient
      .from("dock_reports")
      .update({ locked_by_user_id: identity?.id, locked_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) {
      message.error(errorText(error, "Could not start editing"));
      return;
    }
    if (!data || data.length === 0) {
      message.error("Could not acquire the edit lock - it may have just been taken by someone else.");
      load();
      return;
    }
    setEditingMode(true);
    load();
  };

  const releaseLock = async () => {
    const pending = offlineDraft.pendingCount;
    if (pending > 0) {
      if (offlineDraft.online) {
        const proceed = await confirmAsync(modal, {
          title: "Sync before releasing the lock?",
          content: `${pending} change(s) haven't reached the server yet. Releasing lets someone else start editing - sync first so nothing is at risk.`,
          okText: "Sync and release",
        });
        if (!proceed) return;
        await offlineDraft.syncNow();
        if (offlineDraft.pendingCount > 0) {
          message.error("Sync didn't fully complete - try again once you have a stronger connection.");
          return;
        }
      } else {
        const proceed = await confirmAsync(modal, {
          title: "Release the lock while offline?",
          content: `${pending} change(s) are only saved on this device - they haven't reached the server. Releasing now lets someone else start editing before your changes sync, which can overwrite each other. It's safer to keep editing until you're back online.`,
          okText: "Release anyway",
          okButtonProps: { danger: true },
          cancelText: "Keep editing",
        });
        if (!proceed) return;
      }
    }
    setReleasing(true);
    try {
      const { error } = await supabaseClient.from("dock_reports").update({ locked_by_user_id: null, locked_at: null }).eq("id", id);
      if (error) throw error;
      setEditingMode(false);
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not release the lock"));
    } finally {
      setReleasing(false);
    }
  };

  // Clears someone else's lock without taking it over - for an admin who
  // just needs to unstick an abandoned lock (e.g. the locking user's device
  // went offline mid-edit) without being forced into "now I'm the editor"
  // mode themselves. Distinct from "Start Editing" while locked, which
  // already works for an admin (can_access_entity's dock_reports branch
  // bypasses the lock check for Admins) but implicitly steals the lock under
  // their own name - this is a cleaner path when that's not what's wanted.
  // The underlying update is gated by the exact same RLS check either way,
  // so this button being visible (dockReport?.can_edit while locked by
  // someone else) already implies the click will actually succeed.
  const forceReleaseLock = async () => {
    setReleasing(true);
    try {
      const { error } = await supabaseClient.from("dock_reports").update({ locked_by_user_id: null, locked_at: null }).eq("id", id);
      if (error) throw error;
      load();
    } catch (e: any) {
      message.error(errorText(e, "Could not release the lock"));
    } finally {
      setReleasing(false);
    }
  };

  const { showPdf, pdfPreviewModal } = usePdfPreview();

  const exportDockReportPdf = async () => {
    if (!displayedHeader) return;
    const stageOptions = await loadOrCacheReference("phrases:dock_photo_stage", () => loadPhraseOptions("dock_photo_stage"));
    const packagingById = new Map(packagings.map((p) => [p.id, p]));
    const { data, cleanup } = await buildDockReportPdfData({
      vesselName: dockReport?.vessels?.name ?? null,
      vesselImo: dockReport?.vessels?.imo ?? null,
      hullEventTypeText: dockReport?.hull_events?.phrases?.text_en ?? null,
      specificationNumber: dockReport?.specifications?.specification_number ?? null,
      header: displayedHeader,
      areas: displayedAreas,
      dailyLogs: displayedDailyLogs,
      photos: displayedPhotos,
      signatures: displayedSignatures,
      packagingById,
      userOptions,
      areaOptions,
      savedAreaOptions,
      substrateOptions,
      environmentOptions,
      coatModeOptions,
      applicationMethodOptions,
      foulingEvaluationOptions,
      cathodicProtectionOptions,
      stageOptions,
    });
    try {
      const blob = await pdf(<DockReportPdf data={data} />).toBlob();
      showPdf(blob, `Dock-Report-${data.reportNumber || "draft"}.pdf`);
    } finally {
      cleanup();
    }
  };

  const exportDailyReportPdf = async (logId: string) => {
    const log = displayedDailyLogs.find((l: any) => l.id === logId);
    if (!log) return;
    const stageOptions = await loadOrCacheReference("phrases:dock_photo_stage", () => loadPhraseOptions("dock_photo_stage"));
    const { data, cleanup } = await buildDailyReportPdfData({
      vesselName: dockReport?.vessels?.name ?? null,
      vesselImo: dockReport?.vessels?.imo ?? null,
      reportNumber: displayedHeader?.report_number ?? null,
      log,
      photos: displayedPhotos,
      userOptions,
      savedAreaOptions,
      applicationMethodOptions,
      stageOptions,
    });
    try {
      const blob = await pdf(<DailyReportPdf data={data} />).toBlob();
      showPdf(blob, `Daily-Report-${data.vesselName ?? "vessel"}-${data.logDate}.pdf`);
    } finally {
      cleanup();
    }
  };

  const vesselName = dockReport?.vessels?.name;
  usePageBannerTitle(vesselName ? `${ENTITY_CONFIG.dock_reports.label}: ${vesselName}` : undefined);
  usePageBannerSubtitle(dockReport?.report_number ? `${dockReport.report_number} - ${dockReport.status}` : undefined);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
        <Spin />
      </div>
    );
  }

  // Offline, and this device has never opened this report before (so there
  // is no local draft to fall back to) - nothing useful can be shown.
  if (serverUnreachable && !editingMode && !offlineDraft.draft) {
    return (
      <Alert
        type="warning"
        showIcon
        icon={<LockOutlined />}
        style={{ margin: 24 }}
        message="Can't reach the server, and this device has no offline copy of this Dock Report"
        description="Connect to the internet at least once to open it here - after that, this page keeps working offline."
      />
    );
  }

  const isLockedByOther = !!dockReport?.locked_by_user_id && dockReport.locked_by_user_id !== identity?.id;
  const header = offlineDraft.draft?.header;

  // Open straight on the Daily tab (today's day already selected, per
  // DailyJournalPanel's own default) once the docking is actually underway
  // - indocking_date has arrived and outdocking_date hasn't passed yet (or
  // isn't set at all). Otherwise Overview is still the more useful landing
  // tab (nothing to log yet, or the docking's already closed out).
  const today = todayIso();
  const defaultTabKey =
    dockReport?.indocking_date && dockReport.indocking_date <= today && (!dockReport.outdocking_date || dockReport.outdocking_date >= today)
      ? "daily"
      : "overview";

  const savedAreaOptions: Option[] = displayedAreas.map((a: any) => ({
    value: a.id,
    label: areaOptions.find((o) => o.value === a.area_id)?.label ?? "Area",
  }));

  return (
    <>
      {pdfPreviewModal}
    <Show
      title="Dock Report"
      isLoading={false}
      headerButtons={
        <Space wrap>
          <ConnectivityBadge online={offlineDraft.online} />
          {dockReport?.hull_events?.id && (
            <Button icon={<CompassOutlined />} onClick={() => navigate(`/hull-events/${dockReport.hull_events.id}`)}>
              Hull Event
            </Button>
          )}
          {dockReport?.specification_id && (
            <Button icon={<FileTextOutlined />} onClick={() => navigate(`/specifications/${dockReport.specification_id}`)}>
              Specification
            </Button>
          )}
          <Button icon={<FilePdfOutlined />} onClick={exportDockReportPdf} disabled={!displayedHeader}>
            Export PDF
          </Button>
          {!editingMode ? (
            <Button
              icon={<EditOutlined />}
              type="primary"
              onClick={startEditing}
              disabled={!dockReport?.can_edit}
              title={isLockedByOther ? `Locked by ${dockReport?.locked_by?.name ?? "someone else"}` : undefined}
            >
              Start Editing
            </Button>
          ) : (
            <>
              <Button icon={<SaveOutlined />} type="primary" onClick={offlineDraft.syncNow} loading={offlineDraft.syncStatus === "syncing"}>
                Save
              </Button>
              <Button icon={<UnlockOutlined />} onClick={releaseLock} loading={releasing}>
                Done Editing
              </Button>
            </>
          )}
        </Space>
      }
    >
      {isLockedByOther && (
        <Alert
          type="warning"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 16 }}
          message={`Locked for editing by ${dockReport?.locked_by?.name ?? "someone else"}${
            dockReport?.locked_at ? ` since ${formatDateTime(dockReport.locked_at)}` : ""
          }`}
          description="You can view this Dock Report, but it can't be edited until they release it."
          // can_edit already being true despite the lock means this user
          // bypasses it (currently only Admins, per can_access_entity's
          // dock_reports branch) - only they get an explicit way to clear a
          // stuck lock without also taking it over via Start Editing.
          action={
            dockReport?.can_edit ? (
              <Popconfirm
                title="Release this lock?"
                description={`${dockReport?.locked_by?.name ?? "Someone else"} will lose any unsynced local changes they haven't saved yet.`}
                onConfirm={forceReleaseLock}
              >
                <Button size="small" danger loading={releasing}>
                  Release lock
                </Button>
              </Popconfirm>
            ) : undefined
          }
        />
      )}
      {editingMode && !isLockedByOther && (
        <>
          {serverUnreachable && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="Resuming an offline editing session on this device"
              description="Couldn't confirm the edit lock with the server right now - continuing from this device's own saved copy."
            />
          )}
          <DraftSyncBanner
            online={offlineDraft.online}
            syncStatus={offlineDraft.syncStatus}
            pendingCount={offlineDraft.pendingCount}
            lastSyncError={offlineDraft.draft?.lastSyncError ?? null}
            onSyncNow={offlineDraft.syncNow}
          />
        </>
      )}

      <EntityDetailChrome entityType="dock_reports" entityId={id}>
        {editingMode && offlineDraft.loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : editingMode && offlineDraft.initError ? (
          <Alert type="error" showIcon message="Couldn't start editing" description={offlineDraft.initError} style={{ marginBottom: 16 }} />
        ) : (
          <Tabs
            defaultActiveKey={defaultTabKey}
            items={[
              {
                key: "overview",
                label: "Overview",
                children:
                  editingMode && header ? (
                    <Space direction="vertical" size="middle" style={{ width: "100%", marginBottom: 16 }}>
                      <Space wrap size="large" style={{ width: "100%" }}>
                        <LabeledField label={L("report_number")}>
                          <Input style={{ width: 200 }} value={header.report_number ?? ""} onChange={(e) => offlineDraft.updateHeader({ report_number: e.target.value || null })} />
                        </LabeledField>
                        <LabeledField label={L("status")}>
                          <Select
                            options={DOCK_REPORT_STATUS_OPTIONS}
                            style={{ width: 160 }}
                            value={header.status}
                            onChange={(v) => offlineDraft.updateHeader({ status: v })}
                          />
                        </LabeledField>
                        <LabeledField label={L("indocking_date")}>
                          <DatePicker
                            style={{ width: 160 }}
                            value={header.indocking_date ? dayjs(header.indocking_date) : null}
                            onChange={(d) => offlineDraft.updateHeader({ indocking_date: d ? d.format("YYYY-MM-DD") : null })}
                          />
                        </LabeledField>
                        <LabeledField label={L("outdocking_date")}>
                          <DatePicker
                            style={{ width: 160 }}
                            value={header.outdocking_date ? dayjs(header.outdocking_date) : null}
                            onChange={(d) => offlineDraft.updateHeader({ outdocking_date: d ? d.format("YYYY-MM-DD") : null })}
                          />
                        </LabeledField>
                        <LabeledField label={L("time_zone")}>
                          <Select
                            options={zoneOptions}
                            showSearch
                            optionFilterProp="label"
                            allowClear
                            style={{ width: 260 }}
                            value={header.time_zone ?? undefined}
                            onChange={(v) => offlineDraft.updateHeader({ time_zone: v ?? null })}
                          />
                        </LabeledField>
                        <LabeledField label={L("technical_service_rep_user_id")}>
                          <Select
                            options={userOptions}
                            showSearch
                            optionFilterProp="label"
                            allowClear
                            style={{ width: 200 }}
                            value={header.technical_service_rep_user_id ?? undefined}
                            onChange={(v) => offlineDraft.updateHeader({ technical_service_rep_user_id: v ?? null })}
                          />
                        </LabeledField>
                        <LabeledField label={L("sales_account_user_id")}>
                          <Select
                            options={userOptions}
                            showSearch
                            optionFilterProp="label"
                            allowClear
                            style={{ width: 200 }}
                            value={header.sales_account_user_id ?? undefined}
                            onChange={(v) => offlineDraft.updateHeader({ sales_account_user_id: v ?? null })}
                          />
                        </LabeledField>
                      </Space>
                      <Space wrap size="large" style={{ width: "100%" }}>
                        <LabeledField label={L("antifouling_line_fwd_m")}>
                          <InputNumber style={{ width: 140 }} value={header.antifouling_line_fwd_m} onChange={(v) => offlineDraft.updateHeader({ antifouling_line_fwd_m: v })} />
                        </LabeledField>
                        <LabeledField label={L("antifouling_line_aft_m")}>
                          <InputNumber style={{ width: 140 }} value={header.antifouling_line_aft_m} onChange={(v) => offlineDraft.updateHeader({ antifouling_line_aft_m: v })} />
                        </LabeledField>
                        <LabeledField label={L("boottop_line_fwd_m")}>
                          <InputNumber style={{ width: 140 }} value={header.boottop_line_fwd_m} onChange={(v) => offlineDraft.updateHeader({ boottop_line_fwd_m: v })} />
                        </LabeledField>
                        <LabeledField label={L("boottop_line_aft_m")}>
                          <InputNumber style={{ width: 140 }} value={header.boottop_line_aft_m} onChange={(v) => offlineDraft.updateHeader({ boottop_line_aft_m: v })} />
                        </LabeledField>
                        <LabeledField label={L("cathodic_protection_type_phrase_id")}>
                          <Select
                            options={cathodicProtectionOptions}
                            allowClear
                            style={{ width: 180 }}
                            value={header.cathodic_protection_type_phrase_id ?? undefined}
                            onChange={(v) => offlineDraft.updateHeader({ cathodic_protection_type_phrase_id: v ?? null })}
                          />
                        </LabeledField>
                        <LabeledField label={L("cathodic_protection_anode_count")}>
                          <InputNumber style={{ width: 140 }} value={header.cathodic_protection_anode_count} onChange={(v) => offlineDraft.updateHeader({ cathodic_protection_anode_count: v })} />
                        </LabeledField>
                      </Space>
                      <LabeledField label={L("remarks_text")} block>
                        <Input.TextArea rows={2} value={header.remarks_text ?? ""} onChange={(e) => offlineDraft.updateHeader({ remarks_text: e.target.value || null })} />
                      </LabeledField>
                    </Space>
                  ) : (
                    <Descriptions column={{ xs: 1, md: 2 }} bordered size="small" style={{ marginBottom: 16 }}>
                      <Descriptions.Item label={L("report_number")}>{dockReport?.report_number ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("status")}>
                        <Tag color={DOCK_REPORT_STATUS_COLOR[dockReport?.status]}>{DOCK_REPORT_STATUS_OPTIONS.find((o) => o.value === dockReport?.status)?.label}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label={L("indocking_date")}>{dockReport?.indocking_date ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("outdocking_date")}>{dockReport?.outdocking_date ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("time_zone")}>{dockReport?.time_zone ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("technical_service_rep_user_id")}>{dockReport?.tsr?.name ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("sales_account_user_id")}>{dockReport?.sales_rep?.name ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("antifouling_line_fwd_m")}>{dockReport?.antifouling_line_fwd_m ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("antifouling_line_aft_m")}>{dockReport?.antifouling_line_aft_m ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("boottop_line_fwd_m")}>{dockReport?.boottop_line_fwd_m ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("boottop_line_aft_m")}>{dockReport?.boottop_line_aft_m ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("cathodic_protection_type_phrase_id")}>
                        {cathodicProtectionOptions.find((o) => o.value === dockReport?.cathodic_protection_type_phrase_id)?.label ?? "—"}
                      </Descriptions.Item>
                      <Descriptions.Item label={L("cathodic_protection_anode_count")}>{dockReport?.cathodic_protection_anode_count ?? "—"}</Descriptions.Item>
                      <Descriptions.Item label={L("remarks_text")} span={2}>
                        {dockReport?.remarks_text ?? "—"}
                      </Descriptions.Item>
                    </Descriptions>
                  ),
              },
              {
                key: "areas",
                label: "Areas & Products",
                children: (
                  <DockReportAreasEditor
                    areas={displayedAreas}
                    onChange={editingMode ? offlineDraft.setAreas : () => {}}
                    packagings={packagings}
                    onPackagingsLoaded={registerPackagings}
                    areaOptions={areaOptions}
                    substrateOptions={substrateOptions}
                    environmentOptions={environmentOptions}
                    coatModeOptions={coatModeOptions}
                    applicationMethodOptions={applicationMethodOptions}
                    foulingEvaluationOptions={foulingEvaluationOptions}
                    surfacePrepOptions={surfacePrepOptions}
                    disabled={!editingMode}
                  />
                ),
              },
              {
                key: "daily",
                label: "Daily",
                children: (
                  <DailyJournalPanel
                    header={displayedHeader}
                    logs={displayedDailyLogs}
                    areas={displayedAreas}
                    photos={displayedPhotos}
                    areaOptions={savedAreaOptions}
                    coatModeOptions={coatModeOptions}
                    applicationMethodOptions={applicationMethodOptions}
                    foulingEvaluationOptions={foulingEvaluationOptions}
                    surfacePrepOptions={surfacePrepOptions}
                    packagings={packagings}
                    canEdit={editingMode}
                    onAddLog={offlineDraft.addDailyLog}
                    onRemoveLog={offlineDraft.removeDailyLog}
                    onUpdateLog={offlineDraft.updateDailyLog}
                    onAddWeatherReading={offlineDraft.addWeatherReading}
                    onUpdateWeatherReading={offlineDraft.updateWeatherReading}
                    onRemoveWeatherReading={offlineDraft.removeWeatherReading}
                    onAddActivity={offlineDraft.addActivity}
                    onUpdateActivity={offlineDraft.updateActivity}
                    onRemoveActivity={offlineDraft.removeActivity}
                    onChangeAreas={editingMode ? offlineDraft.setAreas : () => {}}
                    onAddPhoto={offlineDraft.addPhoto}
                    onRemovePhoto={offlineDraft.removePhoto}
                    onExportPdf={exportDailyReportPdf}
                  />
                ),
              },
              {
                key: "photos",
                label: "Photo library",
                children: (
                  <PhotosPanel
                    photos={displayedPhotos}
                    areaOptions={savedAreaOptions}
                    dailyLogOptions={displayedDailyLogs
                      .filter((l: any) => !l.deleted)
                      .map((l: any) => ({ value: l.id, label: dayjs(l.log_date).format("DD.MM.YYYY") }))}
                    canEdit={editingMode}
                    onAddPhoto={offlineDraft.addPhoto}
                    onUpdatePhoto={offlineDraft.updatePhoto}
                    onRemovePhoto={offlineDraft.removePhoto}
                  />
                ),
              },
              {
                key: "signatures",
                label: "Signatures",
                children: (
                  <SignaturesPanel
                    signatures={displayedSignatures}
                    canEdit={editingMode}
                    onSignBlob={offlineDraft.upsertSignatureBlob}
                    onUpdateField={offlineDraft.updateSignatureField}
                    onClear={offlineDraft.clearSignature}
                  />
                ),
              },
            ]}
          />
        )}
      </EntityDetailChrome>
    </Show>
    </>
  );
};

const LabeledField = ({ label, children, block }: { label: string; children: React.ReactNode; block?: boolean }) => (
  <div style={{ width: block ? "100%" : undefined }}>
    <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{label}</div>
    {children}
  </div>
);
