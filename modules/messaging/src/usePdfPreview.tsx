// The NPM tool's usePdfPreview (components/pdfPreviewModal.tsx) with the same call form, shown
// in the pdf.js drawer (pdfPreview.tsx) instead of the browser's viewer.
import { lazy, Suspense, useCallback, useState, type ReactNode } from "react";

const PdfPreviewDrawer = lazy(() => import("./pdfPreview"));

export function usePdfPreview(): { showPdf: (blob: Blob, filename: string) => void; pdfPreviewModal: ReactNode } {
  const [preview, setPreview] = useState<{ blob: Blob; filename: string } | null>(null);
  const showPdf = useCallback((blob: Blob, filename: string) => setPreview({ blob, filename }), []);
  const pdfPreviewModal = preview ? (
    <Suspense fallback={null}>
      <PdfPreviewDrawer blob={preview.blob} name={preview.filename} open onClose={() => setPreview(null)} />
    </Suspense>
  ) : null;
  return { showPdf, pdfPreviewModal };
}
