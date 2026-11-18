// Ported 1:1 from the NPM tool (app/src/pages/dockReports/photosPanel.tsx).
import { useEffect, useState } from "react";
import { Card, Upload, Segmented, Select, DatePicker, Input, Checkbox, Popconfirm, Typography, Row, Col, App as AntdApp } from "antd";
import { DeleteOutlined, CameraOutlined } from "@ant-design/icons";
import type { UploadRequestOption } from "@rbp/module-messaging/src/notes/uploadTypes.ts";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { loadPhraseOptions, type PhraseOption as Option } from "@rbp/core";
import { getBlob } from "./offline/draftStore";
import type { DraftPhoto } from "./offline/types";
import { ATTACHMENT_BUCKET } from "@rbp/module-messaging/src/notes/attachments.ts";
import { errorText } from "@rbp/core";

type FilterMode = "all" | "daily" | "final";

// A purely controlled component, same as dailyLogPanel.tsx - mutations go
// through the offline draft (show.tsx/useDockReportDraft.ts), this panel
// only handles displaying whatever it's given: a signed URL for an already-
// uploaded photo (storage_path set), or a local object URL for one still
// only in this device's IndexedDB blob store (blobKey set, storage_path
// null - see the schema's own "nullable until upload completes" design).
export const PhotosPanel = ({
  photos,
  areaOptions,
  dailyLogOptions,
  canEdit,
  onAddPhoto,
  onUpdatePhoto,
  onRemovePhoto,
}: {
  photos: DraftPhoto[];
  areaOptions: Option[];
  dailyLogOptions: Option[];
  canEdit: boolean;
  onAddPhoto: (blob: Blob) => void;
  onUpdatePhoto: (id: string, patch: Partial<DraftPhoto>) => void;
  onRemovePhoto: (id: string) => void;
}) => {
  const { message } = AntdApp.useApp();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [stageOptions, setStageOptions] = useState<Option[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    loadPhraseOptions("dock_photo_stage").then(setStageOptions).catch(() => setStageOptions([]));
  }, []);

  const visiblePhotos = photos.filter((p) => !p.deleted);

  // Resolves a display URL for every visible photo: a signed Storage URL
  // for uploaded ones, a local blob: URL (revoked on cleanup) for anything
  // still pending. Re-runs whenever the actual set of photos/paths/blobKeys
  // changes, not on every render.
  useEffect(() => {
    let cancelled = false;
    const localUrls: string[] = [];

    (async () => {
      const next: Record<string, string> = {};
      const withPath = visiblePhotos.filter((p) => p.storage_path);
      if (withPath.length) {
        const { data: signed } = await supabaseClient.storage
          .from(ATTACHMENT_BUCKET)
          .createSignedUrls(withPath.map((p) => p.storage_path!) as string[], 3600);
        (signed ?? []).forEach((s, i) => {
          if (s.signedUrl) next[withPath[i].id] = s.signedUrl;
        });
      }
      for (const p of visiblePhotos) {
        if (p.storage_path || !p.blobKey) continue;
        const blob = await getBlob(p.blobKey);
        if (blob) {
          const url = URL.createObjectURL(blob);
          localUrls.push(url);
          next[p.id] = url;
        }
      }
      if (!cancelled) setUrls(next);
    })();

    return () => {
      cancelled = true;
      localUrls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePhotos.map((p) => `${p.id}:${p.storage_path ?? ""}:${p.blobKey ?? ""}`).join(",")]);

  const customUpload = async ({ file, onSuccess, onError }: UploadRequestOption) => {
    try {
      onAddPhoto(file as File);
      onSuccess?.({});
    } catch (e: any) {
      onError?.(e);
      message.error(errorText(e, "Could not add photo"));
    }
  };

  const visible = visiblePhotos.filter((p) =>
    filter === "all" ? true : filter === "daily" ? p.include_in_daily_report : p.include_in_final_report,
  );

  return (
    <Card title="Photos" size="small" style={{ marginBottom: 16 }}>
      {canEdit && (
        // `capture="environment"` opens the tablet/phone's own camera
        // directly (rear camera) instead of only offering a file picker -
        // "capture freely" from the original brief, without needing a
        // custom camera UI. Falls back to a normal file picker on desktop.
        <Upload.Dragger
          customRequest={customUpload}
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

      <Segmented
        style={{ marginBottom: 12 }}
        value={filter}
        onChange={(v) => setFilter(v as FilterMode)}
        options={[
          { label: `All (${visiblePhotos.length})`, value: "all" },
          { label: `Daily report set (${visiblePhotos.filter((p) => p.include_in_daily_report).length})`, value: "daily" },
          { label: `Final report set (${visiblePhotos.filter((p) => p.include_in_final_report).length})`, value: "final" },
        ]}
      />

      {visible.length === 0 && <Typography.Text type="secondary">No photos in this set</Typography.Text>}

      <Row gutter={[12, 12]}>
        {visible.map((p) => (
          <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
            <Card
              size="small"
              cover={
                urls[p.id] ? (
                  <img src={urls[p.id]} alt={p.caption_text ?? ""} style={{ height: 160, objectFit: "cover" }} />
                ) : (
                  <div style={{ height: 160, background: "#f0f0f0" }} />
                )
              }
              actions={
                canEdit
                  ? [
                      <Popconfirm key="delete" title="Delete this photo?" onConfirm={() => onRemovePhoto(p.id)}>
                        <DeleteOutlined />
                      </Popconfirm>,
                    ]
                  : undefined
              }
            >
              {!p.storage_path && <Typography.Text type="warning" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>Not uploaded yet</Typography.Text>}
              <Input
                placeholder="Caption"
                size="small"
                value={p.caption_text ?? ""}
                onChange={(e) => onUpdatePhoto(p.id, { caption_text: e.target.value || null })}
                disabled={!canEdit}
                style={{ marginBottom: 6 }}
              />
              <Select
                placeholder="Stage"
                size="small"
                value={p.stage_phrase_id ?? undefined}
                options={stageOptions}
                onChange={(v) => onUpdatePhoto(p.id, { stage_phrase_id: v ?? null })}
                allowClear
                disabled={!canEdit}
                style={{ width: "100%", marginBottom: 6 }}
              />
              <DatePicker
                placeholder="Taken"
                size="small"
                value={p.taken_at ? dayjs(p.taken_at) : null}
                onChange={(d) => onUpdatePhoto(p.id, { taken_at: d ? d.format("YYYY-MM-DD") : null })}
                disabled={!canEdit}
                style={{ width: "100%", marginBottom: 6 }}
              />
              <Select
                placeholder="Area"
                size="small"
                value={p.dock_report_area_id ?? undefined}
                options={areaOptions}
                onChange={(v) => onUpdatePhoto(p.id, { dock_report_area_id: v ?? null })}
                allowClear
                disabled={!canEdit}
                style={{ width: "100%", marginBottom: 6 }}
              />
              <Select
                placeholder="Daily log"
                size="small"
                value={p.dock_report_daily_log_id ?? undefined}
                options={dailyLogOptions}
                onChange={(v) => onUpdatePhoto(p.id, { dock_report_daily_log_id: v ?? null })}
                allowClear
                disabled={!canEdit}
                style={{ width: "100%", marginBottom: 6 }}
              />
              <Checkbox
                checked={p.include_in_daily_report}
                onChange={(e) => onUpdatePhoto(p.id, { include_in_daily_report: e.target.checked })}
                disabled={!canEdit}
              >
                Daily report
              </Checkbox>
              <br />
              <Checkbox
                checked={p.include_in_final_report}
                onChange={(e) => onUpdatePhoto(p.id, { include_in_final_report: e.target.checked })}
                disabled={!canEdit}
              >
                Final report
              </Checkbox>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
};
