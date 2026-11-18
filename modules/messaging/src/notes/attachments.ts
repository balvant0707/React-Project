// Moved from npm-base into messaging on 2026-11-13; from the NPM tool (app/src/utils/attachments.ts). Hand-owned now.
// The storage bucket of every uploaded file (attachments, message files, dock report photos and signatures) and the
// file-type tests the viewers share.
export const ATTACHMENT_BUCKET = "attachments";

type FileLike = { mime_type: string | null; filename: string };

export const isPdfFile = (a: FileLike) => a.mime_type === "application/pdf" || /\.pdf$/i.test(a.filename);

export const isImageFile = (a: FileLike) => !!a.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.filename);
