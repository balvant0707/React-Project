import { Suspense, lazy, useState } from "react";
import { Button } from "antd";
import { DownloadOutlined, FilePdfOutlined, FileOutlined } from "@ant-design/icons";
import { downloadAttachment } from "./hooks/useSignedUrl";

// pdf.js is large: the viewer is its own chunk, fetched the first time a PDF is opened.
const PdfPreviewDrawer = lazy(() => import("./pdfPreview"));

const isPdf = (name: string, mimeType?: string | null) => mimeType === "application/pdf" || /\.pdf$/i.test(name);

// A file in the private bucket: PDFs open in the in-app viewer, everything else downloads.
export const FileLink = ({ path, name, mimeType, asButton = true, bucket }: { path: string; name: string; mimeType?: string | null; asButton?: boolean; bucket?: string }) => {
  const [open, setOpen] = useState(false);
  const pdf = isPdf(name, mimeType);
  const onClick = () => (pdf ? setOpen(true) : void downloadAttachment(path, name, bucket));
  return (
    <>
      {asButton ? (
        <Button size="small" icon={pdf ? <FilePdfOutlined /> : <FileOutlined />} onClick={onClick}>
          {name} {!pdf && <DownloadOutlined />}
        </Button>
      ) : (
        <a onClick={onClick}>{pdf && <FilePdfOutlined />} {name}</a>
      )}
      {pdf && open && (
        <Suspense fallback={null}>
          <PdfPreviewDrawer path={path} name={name} bucket={bucket} open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
};
