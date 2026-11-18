import { Suspense, useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, InputNumber, Space, Spin, Typography } from "antd";
import { DownloadOutlined, LeftOutlined, MinusOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { downloadAttachment } from "./hooks/useSignedUrl";
import { downloadBlob } from "@rbp/ui";

// A plain static file served by the core Vite plugin pdfWorker() (apps/*/vite.config.ts): the dev server would inject its
// HMR client into a module worker.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

// The PDF viewer of both apps (pdf.js through react-pdf, loaded lazily): a file from a private bucket, or a `blob` made
// in the browser (an offer, a dock report; see usePdfPreview.tsx). Works on phones, unlike the browser's own viewer.
export default function PdfPreviewDrawer({ path, blob: givenBlob, name, bucket = "attachments", open, onClose }: { path?: string; blob?: Blob; name: string; bucket?: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [width, setWidth] = useState(600);
  const box = useRef<HTMLDivElement>(null);

  const { data: storedBlob, isLoading, error } = useQuery({
    queryKey: ["pdf-blob", path],
    enabled: open && !!path && !givenBlob,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error: downloadError } = await supabaseClient.storage.from(bucket).download(path!);
      if (downloadError) throw downloadError;
      return data;
    },
  });
  const blob = givenBlob ?? storedBlob;
  // react-pdf compares the file prop by identity and pdf.js takes ownership of the buffer:
  // keep one stable object per opened blob.
  const [fileData, setFileData] = useState<{ data: Uint8Array } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!blob) return;
    void blob.arrayBuffer().then((buffer) => !cancelled && setFileData({ data: new Uint8Array(buffer) }));
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    if (!open) {
      setPage(1);
      setZoomIndex(2);
      setPages(0);
      setFileData(null);
    }
  }, [open]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => el.clientWidth > 0 && setWidth(Math.max(240, el.clientWidth - 32));
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [open, fileData]);

  const go = (next: number) => setPage(Math.min(Math.max(1, next), Math.max(1, pages)));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") setPage((p) => Math.min(p + 1, Math.max(1, pages)));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pages]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={Math.min(1000, window.innerWidth)}
      title={<Typography.Text ellipsis style={{ maxWidth: "60vw" }}>{name}</Typography.Text>}
      extra={
        <Button icon={<DownloadOutlined />} onClick={() => (givenBlob ? downloadBlob(givenBlob, name) : path && downloadAttachment(path, name, bucket))}>
          {t("pdf.download")}
        </Button>
      }
      styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      destroyOnClose
    >
      <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(128,128,128,0.2)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Space size={4}>
          <Button icon={<LeftOutlined />} disabled={page <= 1} onClick={() => go(page - 1)} aria-label={t("pdf.previous")} />
          <InputNumber min={1} max={Math.max(1, pages)} value={page} onChange={(v) => v && go(Number(v))} style={{ width: 70 }} />
          <Typography.Text type="secondary">/ {pages || "–"}</Typography.Text>
          <Button icon={<RightOutlined />} disabled={page >= pages} onClick={() => go(page + 1)} aria-label={t("pdf.next")} />
        </Space>
        <Space size={4}>
          <Button icon={<MinusOutlined />} disabled={zoomIndex <= 0} onClick={() => setZoomIndex((z) => z - 1)} aria-label={t("pdf.zoomOut")} />
          <Typography.Text style={{ minWidth: 48, textAlign: "center", display: "inline-block" }}>{Math.round(ZOOM_STEPS[zoomIndex] * 100)}%</Typography.Text>
          <Button icon={<PlusOutlined />} disabled={zoomIndex >= ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((z) => z + 1)} aria-label={t("pdf.zoomIn")} />
        </Space>
      </div>
      <div ref={box} style={{ flex: 1, overflow: "auto", background: "rgba(128,128,128,0.12)", padding: 16 }}>
        {((isLoading && !givenBlob) || (blob && !fileData)) && <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>}
        {error && <Alert type="error" showIcon message={t("pdf.loadFailed")} />}
        {fileData && (
          // Own boundary: a page re-render may suspend, and hiding the measured container would feed back into the width.
          <Suspense fallback={<div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>}>
          <Document
            file={fileData}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            loading={<div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>}
            error={<Alert type="error" showIcon message={t("pdf.loadFailed")} />}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Page pageNumber={page} width={width * ZOOM_STEPS[zoomIndex]} />
            </div>
          </Document>
          </Suspense>
        )}
      </div>
    </Drawer>
  );
}
