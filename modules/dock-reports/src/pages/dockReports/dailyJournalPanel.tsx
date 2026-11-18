// Ported 1:1 from the NPM tool (app/src/pages/dockReports/dailyJournalPanel.tsx).
import { useEffect, useState } from "react";
import { Card, Button, Select, Input, InputNumber, Modal, Table, Tag, Popconfirm, Typography, Space, Row, Col, Upload, App as AntdApp } from "antd";
import { LeftOutlined, RightOutlined, EditOutlined, PlusOutlined, DeleteOutlined, CameraOutlined, FilePdfOutlined } from "@ant-design/icons";
import type { UploadRequestOption } from "@rbp/module-messaging/src/notes/uploadTypes.ts";
import dayjs from "dayjs";
import { formatDate } from "@rbp/ui";
import { uuidv7 } from "@rbp/ui";
import { resolveDisplayUrls } from "./pdfExport";
import { DisplayField } from "./displayField";
import { SurfacePrepPicker } from "@rbp/module-offers/src/components/surfacePrepPicker.tsx";
import type { PhraseOption as Option } from "@rbp/core";
import type { PackagingInfo } from "@rbp/module-offers/src/pages/specifications/areasEditor.tsx";
import { isEmptyWeatherReading, isEmptyActivity } from "./offline/types";
import type {
  DraftArea as AreaRow,
  DraftDailyLog,
  DraftWeatherReading,
  DraftActivity,
  DraftPhoto,
  DraftHeader,
} from "./offline/types";
import { errorText } from "@rbp/core";
import { todayIso } from "@rbp/ui";

// Defensive cap on the day pager - a header with a garbage/reversed date
// range shouldn't try to render thousands of empty days.
const MAX_DAYS = 180;

const buildDayRange = (header: DraftHeader | null, logs: DraftDailyLog[]): string[] => {
  const today = todayIso();
  const logDates = logs.filter((l) => !l.deleted).map((l) => l.log_date);
  // Start at the EARLIEST of indocking_date and any actual log date, not
  // just indocking_date - a log dated before it (entered before the header
  // date was finalized/corrected, or old free-date-picker data) must still
  // be reachable by paging back, not silently excluded from the range.
  const startCandidates = [header?.indocking_date, ...logDates].filter(Boolean) as string[];
  const start = startCandidates.length ? startCandidates.reduce((min, d) => (d < min ? d : min)) : today;
  const candidates = [header?.outdocking_date, today, ...logDates].filter(Boolean) as string[];
  const end = candidates.reduce((max, d) => (d > max ? d : max), start);
  const days: string[] = [];
  let cursor = dayjs(start).startOf("day");
  const endDay = dayjs(end).startOf("day");
  while ((cursor.isSame(endDay) || cursor.isBefore(endDay)) && days.length < MAX_DAYS) {
    days.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "day");
  }
  return days.length ? days : [today];
};

export const DailyJournalPanel = ({
  header,
  logs,
  areas,
  photos,
  areaOptions,
  coatModeOptions,
  applicationMethodOptions,
  foulingEvaluationOptions,
  surfacePrepOptions,
  packagings,
  canEdit,
  onAddLog,
  onRemoveLog,
  onUpdateLog,
  onRemoveWeatherReading,
  onAddWeatherReading,
  onUpdateWeatherReading,
  onRemoveActivity,
  onAddActivity,
  onUpdateActivity,
  onChangeAreas,
  onAddPhoto,
  onRemovePhoto,
  onExportPdf,
}: {
  header: DraftHeader | null;
  logs: DraftDailyLog[];
  areas: AreaRow[];
  photos: DraftPhoto[];
  areaOptions: Option[];
  coatModeOptions: Option[];
  applicationMethodOptions: Option[];
  foulingEvaluationOptions: Option[];
  surfacePrepOptions: Option[];
  packagings: PackagingInfo[];
  canEdit: boolean;
  onAddLog: (logDate: string) => void;
  onRemoveLog: (logId: string) => void;
  onUpdateLog: (logId: string, patch: Partial<DraftDailyLog>) => void;
  onRemoveWeatherReading: (logId: string, readingId: string) => void;
  onAddWeatherReading: (logId: string) => void;
  onUpdateWeatherReading: (logId: string, readingId: string, patch: Partial<DraftWeatherReading>) => void;
  onRemoveActivity: (logId: string, activityId: string) => void;
  onAddActivity: (logId: string) => void;
  onUpdateActivity: (logId: string, activityId: string, patch: Partial<DraftActivity>) => void;
  onChangeAreas: (areas: AreaRow[]) => void;
  onAddPhoto: (blob: Blob, initial?: Partial<DraftPhoto>) => Promise<string>;
  onRemovePhoto: (id: string) => void;
  onExportPdf: (logId: string) => void;
}) => {
  const { message } = AntdApp.useApp();
  const today = todayIso();
  const days = buildDayRange(header, logs);

  // Tracked as the DATE itself, not an array position - `days` is recomputed
  // fresh every render from header/logs, so a plain index would silently
  // point at a different day if the range's start/length ever changes while
  // this panel stays mounted (e.g. indocking_date corrected on Overview).
  const [viewedDate, setViewedDate] = useState(() => {
    const idx = days.indexOf(today);
    if (!canEdit && idx >= 0) {
      // View-only landing (e.g. the Show page auto-opening straight to
      // here): today might not have a log yet, which would show as an
      // empty "no log recorded" placeholder - fall back to the most recent
      // day that does have one instead, so there's something to actually
      // see. Editing always wants "today" regardless (that's the day
      // that's about to get lazily created for direct input below).
      const loggedDates = new Set(logs.filter((l) => !l.deleted).map((l) => l.log_date));
      if (!loggedDates.has(today)) {
        const priorLogged = days.filter((d) => d <= today && loggedDates.has(d)).pop();
        if (priorLogged) return priorLogged;
      }
    }
    return idx >= 0 ? today : days[days.length - 1];
  });
  const [openDayDate, setOpenDayDate] = useState<string | null>(null);
  const [conditionModalKey, setConditionModalKey] = useState<string | null>(null);
  // Which activity row's photo modal is open, if any - keyed by activity id.
  const [activityPhotosKey, setActivityPhotosKey] = useState<string | null>(null);
  // Which area's paint-consumption modal is open, if any - keyed by area id,
  // reached from the "Report paint consumption" button on an activity row
  // that has that area selected (see the Activity log's Area column below).
  const [consumptionAreaKey, setConsumptionAreaKey] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Snap back onto the range if it shifted and dropped the day we were on.
  useEffect(() => {
    if (!days.includes(viewedDate)) setViewedDate(days[days.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(",")]);

  const viewedIndex = Math.max(days.indexOf(viewedDate), 0);
  const isToday = viewedDate === today;

  // Default to "today" open for direct editing as soon as editing starts;
  // clear it again once editing stops. Explicitly opening a past day (below)
  // overrides this until you navigate away and back.
  useEffect(() => {
    if (canEdit && openDayDate === null) {
      setOpenDayDate(days.includes(today) ? today : days[days.length - 1]);
    }
    if (!canEdit) setOpenDayDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  const currentLog = logs.find((l) => l.log_date === viewedDate && !l.deleted);
  const isOpenForEdit = canEdit && viewedDate === openDayDate;

  // Lazily create the day's log row the moment it becomes the open-for-edit
  // day and doesn't exist yet - the tech never has to explicitly "add a day"
  // first, only fresh past days they deliberately open.
  useEffect(() => {
    if (isOpenForEdit && !currentLog) onAddLog(viewedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenForEdit, viewedDate, currentLog]);

  // Keep exactly one blank row at the end of the Weather and Activity log
  // tables while editing, so there's always somewhere to type the next
  // reading/entry without an explicit "Add" click. The moment that row
  // gains any real content it stops counting as blank, so this fires again
  // and appends a fresh one behind it. Never persisted while still blank -
  // see isEmptyWeatherReading/isEmptyActivity in sync.ts.
  useEffect(() => {
    if (!isOpenForEdit || !currentLog) return;
    const readings = currentLog.weatherReadings.filter((w) => !w.deleted);
    const last = readings[readings.length - 1];
    if (!last || !isEmptyWeatherReading(last)) onAddWeatherReading(currentLog.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenForEdit, currentLog?.id, currentLog?.weatherReadings]);

  useEffect(() => {
    if (!isOpenForEdit || !currentLog) return;
    const activities = currentLog.activities.filter((a) => !a.deleted);
    const last = activities[activities.length - 1];
    if (!last || !isEmptyActivity(last)) onAddActivity(currentLog.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpenForEdit, currentLog?.id, currentLog?.activities]);

  // Photo URL resolution, scoped to whichever photos belong to the viewed
  // day's log - shares one implementation with pdfExport.ts/photosPanel.tsx
  // rather than re-deriving the same signed-URL/blob-fallback logic here.
  const dayPhotos = photos.filter((p) => !p.deleted && p.dock_report_daily_log_id === currentLog?.id);
  useEffect(() => {
    let cancelled = false;
    const revokeList: string[] = [];
    (async () => {
      const resolved = await resolveDisplayUrls(
        dayPhotos,
        (p) => p.storage_path,
        (p) => p.blobKey,
        revokeList,
      );
      if (!cancelled) setUrls(Object.fromEntries(resolved));
    })();
    return () => {
      cancelled = true;
      revokeList.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayPhotos.map((p) => `${p.id}:${p.storage_path ?? ""}:${p.blobKey ?? ""}`).join(",")]);

  const updateArea = (key: string, patch: Partial<AreaRow>) => onChangeAreas(areas.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const addBatchToday = (areaKey: string, productKey: string, batchNumber: string, drumQty: number | null) => {
    const trimmed = batchNumber.trim();
    if (!trimmed) return;
    const id = uuidv7();
    onChangeAreas(
      areas.map((a) =>
        a.key === areaKey
          ? {
              ...a,
              products: a.products.map((p) =>
                p.key === productKey
                  ? { ...p, batches: [...p.batches, { key: id, id, batch_number: trimmed, drum_quantity: drumQty, consumption_date: viewedDate }] }
                  : p,
              ),
            }
          : a,
      ),
    );
  };
  const removeBatch = (areaKey: string, productKey: string, batchKey: string) =>
    onChangeAreas(
      areas.map((a) =>
        a.key === areaKey
          ? { ...a, products: a.products.map((p) => (p.key === productKey ? { ...p, batches: p.batches.filter((b) => b.key !== batchKey) } : p)) }
          : a,
      ),
    );

  const areaLabel = (a: AreaRow) => areaOptions.find((o) => o.value === a.id)?.label ?? "Area";
  // Batches consumed against an area on the viewed day (the Activity log's per-row subline and the paint
  // consumption modal; an activity row's Area field is where an area's prep/condition and consumption show).
  const batchesForArea = (area: AreaRow) =>
    area.products.flatMap((p) => p.batches.filter((b) => b.consumption_date === viewedDate).map((b) => ({ product: p, batch: b })));

  const visibleWeatherReadings = currentLog?.weatherReadings.filter((w) => !w.deleted) ?? [];
  // "Latest" by time_taken, not by array/insertion order - readings can be
  // added out of chronological order (e.g. a missed morning reading logged
  // after an afternoon one already exists). Readings with no time recorded
  // sort first (via the "" fallback) so they never mask a timed reading.
  const lastReading = [...visibleWeatherReadings].sort((a, b) => (a.time_taken ?? "").localeCompare(b.time_taken ?? ""))[
    visibleWeatherReadings.length - 1
  ];
  const visibleActivities = currentLog?.activities.filter((a) => !a.deleted) ?? [];

  const customUpload = async ({ file, onSuccess, onError }: UploadRequestOption) => {
    try {
      await onAddPhoto(file as File, currentLog ? { dock_report_daily_log_id: currentLog.id } : undefined);
      onSuccess?.({});
    } catch (e: any) {
      onError?.(e);
      message.error(errorText(e, "Could not add photo"));
    }
  };

  const customUploadForActivity = (activity: DraftActivity) => async ({ file, onSuccess, onError }: UploadRequestOption) => {
    try {
      await onAddPhoto(file as File, {
        dock_report_daily_log_id: currentLog?.id ?? null,
        dock_report_area_id: activity.dock_report_area_id,
        dock_report_activity_id: activity.id,
      });
      onSuccess?.({});
    } catch (e: any) {
      onError?.(e);
      message.error(errorText(e, "Could not add photo"));
    }
  };

  const conditionArea = areas.find((a) => a.key === conditionModalKey) ?? null;
  const consumptionArea = areas.find((a) => a.key === consumptionAreaKey) ?? null;
  const activityForPhotos = visibleActivities.find((a) => a.id === activityPhotosKey) ?? null;
  const activityPhotos = dayPhotos.filter((p) => p.dock_report_activity_id === activityPhotosKey);

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Button icon={<LeftOutlined />} disabled={viewedIndex === 0} onClick={() => setViewedDate(days[Math.max(0, viewedIndex - 1)])} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            Day {viewedIndex + 1} of {days.length} <span style={{ fontSize: 12, fontWeight: 400, color: "#888" }}>· {formatDate(viewedDate)}</span>
          </div>
          <div style={{ fontSize: 12, color: isOpenForEdit ? "#389e0d" : "#888" }}>
            {isToday ? "Today" : "Past day"}
            {isOpenForEdit ? " · editing" : " · view only"}
          </div>
        </div>
        <Button icon={<RightOutlined />} disabled={viewedIndex === days.length - 1} onClick={() => setViewedDate(days[Math.min(days.length - 1, viewedIndex + 1)])} />
      </div>

      {canEdit && !isOpenForEdit && (
        <Button icon={<EditOutlined />} style={{ marginBottom: 16 }} onClick={() => setOpenDayDate(viewedDate)}>
          Edit this day
        </Button>
      )}
      {currentLog && (
        <Button icon={<FilePdfOutlined />} style={{ marginBottom: 16, marginLeft: canEdit && !isOpenForEdit ? 8 : 0 }} onClick={() => onExportPdf(currentLog.id)}>
          Export PDF
        </Button>
      )}
      {isOpenForEdit && currentLog && (
        <Popconfirm title="Delete this day's whole log? All its entries and this narrative are removed." onConfirm={() => onRemoveLog(currentLog.id)}>
          <Button icon={<DeleteOutlined />} danger style={{ marginBottom: 16, marginLeft: 8 }}>
            Delete this day
          </Button>
        </Popconfirm>
      )}

      {!currentLog && !isOpenForEdit && <Typography.Text type="secondary">No log recorded for this day.</Typography.Text>}

      {currentLog && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Narrative</div>
            <Input.TextArea
              value={currentLog.narrative_text ?? ""}
              rows={2}
              onChange={(e) => onUpdateLog(currentLog.id, { narrative_text: e.target.value || null })}
              readOnly={!isOpenForEdit}
            />
          </div>

          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
            Weather
          </Typography.Text>
          <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
            {(["air_temperature_c", "surface_temperature_c", "dew_point_c", "relative_humidity_pct"] as const).map((field) => (
              <Col key={field} span={6}>
                <div style={{ background: "#fafafa", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#888" }}>{WEATHER_LABEL[field]}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{lastReading?.[field] ?? "—"}</div>
                </div>
              </Col>
            ))}
          </Row>
          <Table dataSource={visibleWeatherReadings} rowKey="id" pagination={false} size="small" scroll={{ x: "max-content" }} style={{ marginBottom: 16 }}>
            <Table.Column
              title={header?.time_zone ? `Time (${header.time_zone.replace(/_/g, " ")})` : "Time"}
              width={90}
              render={(_, r: DraftWeatherReading) => (
                <Input size="small" value={r.time_taken ?? ""} placeholder="HH:mm" onChange={(e) => onUpdateWeatherReading(currentLog.id, r.id, { time_taken: e.target.value || null })} readOnly={!isOpenForEdit} />
              )}
            />
            <Table.Column
              title="Air °C"
              width={80}
              render={(_, r: DraftWeatherReading) => (
                <InputNumber size="small" value={r.air_temperature_c} onChange={(v) => onUpdateWeatherReading(currentLog.id, r.id, { air_temperature_c: v })} readOnly={!isOpenForEdit} style={{ width: "100%" }} />
              )}
            />
            <Table.Column
              title="Surface °C"
              width={90}
              render={(_, r: DraftWeatherReading) => (
                <InputNumber size="small" value={r.surface_temperature_c} onChange={(v) => onUpdateWeatherReading(currentLog.id, r.id, { surface_temperature_c: v })} readOnly={!isOpenForEdit} style={{ width: "100%" }} />
              )}
            />
            <Table.Column
              title="Dew Point"
              width={90}
              render={(_, r: DraftWeatherReading) => (
                <InputNumber size="small" value={r.dew_point_c} onChange={(v) => onUpdateWeatherReading(currentLog.id, r.id, { dew_point_c: v })} readOnly={!isOpenForEdit} style={{ width: "100%" }} />
              )}
            />
            <Table.Column
              title="Humidity %"
              width={90}
              render={(_, r: DraftWeatherReading) => (
                <InputNumber size="small" value={r.relative_humidity_pct} onChange={(v) => onUpdateWeatherReading(currentLog.id, r.id, { relative_humidity_pct: v })} readOnly={!isOpenForEdit} style={{ width: "100%" }} />
              )}
            />
            <Table.Column
              title="Wind"
              width={120}
              render={(_, r: DraftWeatherReading) => (
                <Input size="small" value={r.wind_condition_text ?? ""} onChange={(e) => onUpdateWeatherReading(currentLog.id, r.id, { wind_condition_text: e.target.value || null })} readOnly={!isOpenForEdit} />
              )}
            />
            {isOpenForEdit && (
              <Table.Column title="" width={40} render={(_, r: DraftWeatherReading) => <Button icon={<DeleteOutlined />} danger type="text" size="small" onClick={() => onRemoveWeatherReading(currentLog.id, r.id)} />} />
            )}
          </Table>

          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
            Activity log
          </Typography.Text>
          <Table dataSource={visibleActivities} rowKey="id" pagination={false} size="small" scroll={{ x: "max-content" }} style={{ marginBottom: 8 }}>
            <Table.Column
              title={header?.time_zone ? `Time (${header.time_zone.replace(/_/g, " ")})` : "Time"}
              width={90}
              onCell={() => ({ style: { verticalAlign: "top" } })}
              render={(_, r: DraftActivity) => (
                <Input size="small" value={r.time_taken ?? ""} placeholder="HH:mm" onChange={(e) => onUpdateActivity(currentLog.id, r.id, { time_taken: e.target.value || null })} readOnly={!isOpenForEdit} />
              )}
            />
            <Table.Column
              title="Activity"
              width={240}
              onCell={() => ({ style: { verticalAlign: "top" } })}
              render={(_, r: DraftActivity) => (
                <Input.TextArea
                  size="small"
                  autoSize={{ minRows: 1, maxRows: 6 }}
                  value={r.activity_text ?? ""}
                  onChange={(e) => onUpdateActivity(currentLog.id, r.id, { activity_text: e.target.value || null })}
                  readOnly={!isOpenForEdit}
                />
              )}
            />
            <Table.Column
              title="Area"
              width={220}
              onCell={() => ({ style: { verticalAlign: "top" } })}
              render={(_, r: DraftActivity) => {
                const area = areas.find((a) => a.id === r.dock_report_area_id) ?? null;
                const batches = area ? batchesForArea(area) : [];
                return (
                  <div>
                    {isOpenForEdit ? (
                      <Select
                        size="small"
                        value={r.dock_report_area_id ?? undefined}
                        options={areaOptions}
                        onChange={(v) => onUpdateActivity(currentLog.id, r.id, { dock_report_area_id: v ?? null })}
                        allowClear
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <DisplayField value={areaOptions.find((o) => o.value === r.dock_report_area_id)?.label} />
                    )}
                    {area && (
                      <Space size={4} wrap style={{ marginTop: 4 }}>
                        <Button size="small" onClick={() => setConditionModalKey(area.key)}>
                          Condition &amp; prep
                        </Button>
                        <Button size="small" onClick={() => setConsumptionAreaKey(area.key)}>
                          Report paint consumption
                        </Button>
                      </Space>
                    )}
                    {batches.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {batches.map(({ product, batch }) => (
                          <Tag key={batch.key} style={{ fontSize: 11, margin: 0 }} color="blue">
                            {packagings.find((p) => p.id === product.product_packaging_id)?.label ?? "Product"}
                            {batch.drum_quantity != null && ` · ${batch.drum_quantity} drums`}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }}
            />
            <Table.Column
              title="Application"
              width={140}
              onCell={() => ({ style: { verticalAlign: "top" } })}
              render={(_, r: DraftActivity) =>
                isOpenForEdit ? (
                  <Select
                    size="small"
                    value={r.application_method_phrase_id ?? undefined}
                    options={applicationMethodOptions}
                    onChange={(v) => onUpdateActivity(currentLog.id, r.id, { application_method_phrase_id: v ?? null })}
                    allowClear
                    style={{ width: "100%" }}
                  />
                ) : (
                  <DisplayField value={applicationMethodOptions.find((o) => o.value === r.application_method_phrase_id)?.label} />
                )
              }
            />
            <Table.Column
              title="Photos"
              width={70}
              onCell={() => ({ style: { verticalAlign: "top" } })}
              render={(_, r: DraftActivity) => {
                const count = dayPhotos.filter((p) => p.dock_report_activity_id === r.id).length;
                return (
                  <Button size="small" icon={<CameraOutlined />} onClick={() => setActivityPhotosKey(r.id)}>
                    {count > 0 ? count : ""}
                  </Button>
                );
              }}
            />
            {isOpenForEdit && (
              <Table.Column
                title=""
                width={40}
                onCell={() => ({ style: { verticalAlign: "top" } })}
                render={(_, r: DraftActivity) => <Button icon={<DeleteOutlined />} danger type="text" size="small" onClick={() => onRemoveActivity(currentLog.id, r.id)} />}
              />
            )}
          </Table>

          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
            Photos {isToday ? "today" : "that day"}
          </Typography.Text>
          {isOpenForEdit && (
            <Upload.Dragger customRequest={customUpload} showUploadList={false} multiple accept="image/*" capture="environment" style={{ padding: "6px 0", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                <CameraOutlined style={{ marginRight: 8 }} />
                Tap to take a photo, or click/drag to upload one
              </p>
            </Upload.Dragger>
          )}
          <Row gutter={[8, 8]}>
            {dayPhotos.length === 0 && <Typography.Text type="secondary">No photos yet</Typography.Text>}
            {dayPhotos.map((p) => (
              <Col key={p.id}>
                <div style={{ position: "relative" }}>
                  {urls[p.id] ? (
                    <img src={urls[p.id]} alt={p.caption_text ?? ""} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: 96, height: 96, background: "#f0f0f0", borderRadius: 6 }} />
                  )}
                  {isOpenForEdit && (
                    <Popconfirm title="Delete this photo?" onConfirm={() => onRemovePhoto(p.id)}>
                      <Button icon={<DeleteOutlined />} danger size="small" style={{ position: "absolute", top: 2, right: 2 }} />
                    </Popconfirm>
                  )}
                </div>
              </Col>
            ))}
          </Row>
        </>
      )}

      <Modal
        title={conditionArea ? `${areaLabel(conditionArea)} — condition & prep` : undefined}
        open={!!conditionArea}
        onCancel={() => setConditionModalKey(null)}
        footer={<Button onClick={() => setConditionModalKey(null)}>Close</Button>}
      >
        {conditionArea && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Surface prep (from specification)</div>
              <DisplayField value={conditionArea.surface_preparation_text} multiline />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Actual surface prep</div>
              {/* Gated on canEdit, not isOpenForEdit - these are area-level
                  fields (one value for the whole docking, not per-day), so
                  they're editable whenever editing is on at all, regardless
                  of which single day the pager happens to have "open". */}
              <SurfacePrepPicker
                value={conditionArea.actual_surface_preparation_text}
                onChange={(text) => updateArea(conditionArea.key, { actual_surface_preparation_text: text })}
                options={surfacePrepOptions}
                readOnly={!canEdit}
              />
            </div>
            <Space wrap style={{ width: "100%" }}>
              <div style={{ width: 140 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Fouling extent %</div>
                {canEdit ? (
                  <InputNumber value={conditionArea.fouling_extent_pct} onChange={(v) => updateArea(conditionArea.key, { fouling_extent_pct: v })} addonAfter="%" style={{ width: "100%" }} />
                ) : (
                  <DisplayField value={conditionArea.fouling_extent_pct != null ? `${conditionArea.fouling_extent_pct}%` : undefined} />
                )}
              </div>
              <div style={{ width: 180 }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Fouling evaluation</div>
                {canEdit ? (
                  <Select
                    value={conditionArea.fouling_evaluation_phrase_id ?? undefined}
                    options={foulingEvaluationOptions}
                    onChange={(v) => updateArea(conditionArea.key, { fouling_evaluation_phrase_id: v ?? null })}
                    allowClear
                    style={{ width: "100%" }}
                  />
                ) : (
                  <DisplayField value={foulingEvaluationOptions.find((o) => o.value === conditionArea.fouling_evaluation_phrase_id)?.label} />
                )}
              </div>
            </Space>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>Condition comments</div>
              <Input.TextArea
                value={conditionArea.condition_comments_text ?? ""}
                rows={2}
                onChange={(e) => updateArea(conditionArea.key, { condition_comments_text: e.target.value })}
                readOnly={!canEdit}
              />
            </div>
          </Space>
        )}
      </Modal>

      <Modal
        title={consumptionArea ? `${areaLabel(consumptionArea)} — paint consumption` : undefined}
        open={!!consumptionArea}
        onCancel={() => setConsumptionAreaKey(null)}
        footer={<Button onClick={() => setConsumptionAreaKey(null)}>Close</Button>}
      >
        {consumptionArea && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {batchesForArea(consumptionArea).map(({ product, batch }) => (
                <Tag key={batch.key} closable={isOpenForEdit} onClose={() => removeBatch(consumptionArea.key, product.key, batch.key)} color="blue">
                  {packagings.find((p) => p.id === product.product_packaging_id)?.label ?? "Product"}
                  {product.coat_mode_phrase_id && ` · ${coatModeOptions.find((o) => o.value === product.coat_mode_phrase_id)?.label ?? ""}`}
                  {product.coat_pct != null && ` ${product.coat_pct}%`}
                  {` · ${batch.batch_number}`}
                  {batch.drum_quantity != null && ` · ${batch.drum_quantity} drums`}
                </Tag>
              ))}
              {batchesForArea(consumptionArea).length === 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }}>No consumption logged yet</Typography.Text>}
            </div>
            {isOpenForEdit && consumptionArea.products.length > 0 && (
              <ConsumptionQuickAdd
                area={consumptionArea}
                packagings={packagings}
                onAdd={(productKey, batchNumber, qty) => addBatchToday(consumptionArea.key, productKey, batchNumber, qty)}
              />
            )}
            {isOpenForEdit && consumptionArea.products.length === 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                No coat lines set up for this area yet - add one in Areas &amp; Products first.
              </Typography.Text>
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title={activityForPhotos ? `Photos — ${activityForPhotos.activity_text || activityForPhotos.time_taken || "activity"}` : undefined}
        open={!!activityForPhotos}
        onCancel={() => setActivityPhotosKey(null)}
        footer={<Button onClick={() => setActivityPhotosKey(null)}>Close</Button>}
      >
        {activityForPhotos && (
          <>
            {isOpenForEdit && (
              <Upload.Dragger
                customRequest={customUploadForActivity(activityForPhotos)}
                showUploadList={false}
                multiple
                accept="image/*"
                capture="environment"
                style={{ padding: "6px 0", marginBottom: 12 }}
              >
                <p style={{ margin: 0, fontSize: 13 }}>
                  <CameraOutlined style={{ marginRight: 8 }} />
                  Tap to take a photo, or click/drag to upload one
                </p>
              </Upload.Dragger>
            )}
            <Row gutter={[8, 8]}>
              {activityPhotos.length === 0 && <Typography.Text type="secondary">No photos linked to this activity yet</Typography.Text>}
              {activityPhotos.map((p) => (
                <Col key={p.id}>
                  <div style={{ position: "relative" }}>
                    {urls[p.id] ? (
                      <img src={urls[p.id]} alt={p.caption_text ?? ""} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 6 }} />
                    ) : (
                      <div style={{ width: 96, height: 96, background: "#f0f0f0", borderRadius: 6 }} />
                    )}
                    {isOpenForEdit && (
                      <Popconfirm title="Delete this photo?" onConfirm={() => onRemovePhoto(p.id)}>
                        <Button icon={<DeleteOutlined />} danger size="small" style={{ position: "absolute", top: 2, right: 2 }} />
                      </Popconfirm>
                    )}
                  </div>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Modal>
    </Card>
  );
};

const WEATHER_LABEL: Record<"air_temperature_c" | "surface_temperature_c" | "dew_point_c" | "relative_humidity_pct", string> = {
  air_temperature_c: "Air °C",
  surface_temperature_c: "Surface °C",
  dew_point_c: "Dew point °C",
  relative_humidity_pct: "Humidity %",
};

// A per-product-line "add a batch dated today" row - the same tag-not-grid
// gesture as batchTagInput.tsx, but scoped: only lets you log against a coat
// line that already exists on this area (adding a new coat line stays in
// Areas & Products), and the date is implicit (whichever day is open).
const ConsumptionQuickAdd = ({
  area,
  packagings,
  onAdd,
}: {
  area: AreaRow;
  packagings: PackagingInfo[];
  onAdd: (productKey: string, batchNumber: string, qty: number | null) => void;
}) => {
  const [productKey, setProductKey] = useState<string | undefined>(area.products[0]?.key);
  const [batchNumber, setBatchNumber] = useState("");
  const [qty, setQty] = useState<number | null>(null);

  // area.products can change out from under this component (e.g. the coat
  // line it's pointing at gets removed in Areas & Products while this tab
  // stays mounted in the background) - fall back to the first remaining
  // product rather than silently submitting against a key that's gone.
  const validKey = area.products.some((p) => p.key === productKey) ? productKey : area.products[0]?.key;
  // Show the actual product name, not "Coat line N" - a tech picking where
  // to log a batch cares which product, not the position of the coat line
  // in the list. Only append "coat N" when the same product has more than
  // one line on this area (e.g. two coats of the same AF), so there's
  // still a way to tell them apart; a lone line just shows the product.
  const productOptions = area.products.map((p) => {
    const name = packagings.find((pk) => pk.id === p.product_packaging_id)?.label ?? "Product";
    const sameProduct = area.products.filter((q) => q.product_packaging_id === p.product_packaging_id);
    const label = sameProduct.length > 1 ? `${name} coat ${sameProduct.indexOf(p) + 1}` : name;
    return { value: p.key, label };
  });

  return (
    <Space.Compact size="small" style={{ width: "100%" }}>
      {/* Grows to fill whatever room's left in the row - product labels run
          long (e.g. "PSPC 3309 - ECOLOFLEX SPC 200 (20 L)"), so a fixed
          width here either truncates them or forces the row to overflow;
          Batch #/Drums stay narrow and fixed since they're short by nature. */}
      <Select value={validKey} options={productOptions} showSearch optionFilterProp="label" style={{ flex: 1, minWidth: 200 }} onChange={setProductKey} />
      <Input placeholder="Batch #" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} style={{ width: 90, flex: "none" }} />
      <InputNumber placeholder="Drums" value={qty} onChange={setQty} min={0} style={{ width: 70, flex: "none" }} />
      <Button
        icon={<PlusOutlined />}
        onClick={() => {
          if (!validKey) return;
          onAdd(validKey, batchNumber, qty);
          setBatchNumber("");
          setQty(null);
        }}
      />
    </Space.Compact>
  );
};
