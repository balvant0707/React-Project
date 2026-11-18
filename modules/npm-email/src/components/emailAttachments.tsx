// Ported 1:1 from the NPM tool (app/src/components/emailAttachments.tsx).
import { useCallback, useEffect, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { App as AntdApp, Button, Space, Tag, Upload } from "antd";
import { PaperClipOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { usePdfPreview } from "@rbp/module-messaging/src/usePdfPreview.tsx";
import { MAX_ATTACHMENT_BYTES, uploadDraftAttachment, type MailAttachmentRow } from "../modules/email/drafts";
import { formatBytes } from "@rbp/ui";
import { ATTACHMENT_BUCKET, isPdfFile } from "@rbp/module-messaging/src/notes/attachments.ts";
import { errorText } from "@rbp/core";

// Files of an email: chips that open (PDF in the preview, anything else as a download) and, for a draft, add / remove.


function useOpenAttachment() {
  const { message } = AntdApp.useApp();
  const { showPdf, pdfPreviewModal } = usePdfPreview();
  const open = async (a: MailAttachmentRow) => {
    if (isPdfFile(a)) {
      const { data, error } = await supabaseClient.storage.from(ATTACHMENT_BUCKET).download(a.storage_path);
      if (error || !data) {
        message.error(errorText(error, "Could not load the file"));
        return;
      }
      showPdf(new Blob([data], { type: "application/pdf" }), a.filename);
      return;
    }
    const { data, error } = await supabaseClient.storage.from(ATTACHMENT_BUCKET).createSignedUrl(a.storage_path, 60, { download: a.filename });
    if (error || !data) {
      message.error(errorText(error, "Could not create the download link"));
      return;
    }
    window.open(data.signedUrl, "_blank");
  };
  return { open, pdfPreviewModal };
}

const Chip = ({ a, onOpen, onRemove }: { a: MailAttachmentRow; onOpen: (a: MailAttachmentRow) => void; onRemove?: () => void }) => (
  <Tag icon={<PaperClipOutlined />} closable={!!onRemove} onClose={(e) => { e.preventDefault(); onRemove?.(); }} style={{ cursor: "pointer" }} onClick={() => onOpen(a)}>
    {a.filename} {a.size_bytes != null && <span style={{ opacity: 0.6 }}>({formatBytes(a.size_bytes)})</span>}
  </Tag>
);

// Read-only list of the (non-inline) files of one received or sent message.
export function MessageAttachments({ attachments }: { attachments: MailAttachmentRow[] }) {
  const { open, pdfPreviewModal } = useOpenAttachment();
  const files = attachments.filter((a) => !a.is_inline);
  if (files.length === 0) return null;
  return (
    <Space size={[4, 4]} wrap style={{ margin: "4px 0" }}>
      {files.map((a) => (
        <Chip key={a.id} a={a} onOpen={open} />
      ))}
      {pdfPreviewModal}
    </Space>
  );
}

// Files of a draft. `getDraftId` creates the draft first when it does not exist yet (a reply starts as an empty row only
// once somebody types or attaches).
export function DraftAttachments({
  draftId,
  getDraftId,
  disabled,
  onChanged,
}: {
  draftId: string | null;
  getDraftId: () => Promise<string | null>;
  disabled?: boolean;
  onChanged?: () => void;
}) {
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const { open, pdfPreviewModal } = useOpenAttachment();
  const [rows, setRows] = useState<MailAttachmentRow[]>([]);

  const load = useCallback(async () => {
    if (!draftId) {
      setRows([]);
      return;
    }
    const { data } = await supabaseClient
      .from("attachments")
      .select("id, filename:file_name, mime_type, size_bytes, storage_path")
      .eq("entity_type", "email_thread_drafts")
      .eq("entity_id", draftId)
      .order("created_at");
    setRows((data as MailAttachmentRow[]) ?? []);
  }, [draftId]);

  useEffect(() => {
    load();
  }, [load]);

  const total = rows.reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);

  const add = async (file: File) => {
    if (!identity?.id) return false;
    if (total + file.size > MAX_ATTACHMENT_BYTES) {
      message.error("The attachments of one email may not exceed 25 MB together");
      return false;
    }
    const id = await getDraftId();
    if (!id) return false;
    const { error } = await uploadDraftAttachment(id, file, file.name, identity.id);
    if (error) message.error(error);
    else {
      await load();
      onChanged?.();
    }
    return false; // handled here; antd must not upload by itself
  };

  const remove = async (a: MailAttachmentRow) => {
    const { error } = await supabaseClient.from("attachments").delete().eq("id", a.id);
    if (error) message.error(errorText(error));
    else {
      // A file this draft uploaded itself is removed from storage too; a copied one (forward) still belongs to its mail.
      if (draftId && a.storage_path.startsWith(`email_thread_drafts/${draftId}/`)) await supabaseClient.storage.from(ATTACHMENT_BUCKET).remove([a.storage_path]);
      load();
      onChanged?.();
    }
  };

  return (
    <Space size={[4, 4]} wrap>
      <Upload multiple showUploadList={false} beforeUpload={add} disabled={disabled}>
        <Button size="small" icon={<PaperClipOutlined />} disabled={disabled}>
          Attach
        </Button>
      </Upload>
      {rows.map((a) => (
        <Chip key={a.id} a={a} onOpen={open} onRemove={disabled ? undefined : () => remove(a)} />
      ))}
      {pdfPreviewModal}
    </Space>
  );
}
