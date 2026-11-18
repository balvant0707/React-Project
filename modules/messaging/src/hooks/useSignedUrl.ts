import { useQueries, useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";

const BUCKET = "attachments";

// Files are in a private bucket: every view goes through a short-lived signed URL.
export function useSignedUrl(path: string | null | undefined, bucket = BUCKET) {
  return useQuery({
    queryKey: ["signed-url", bucket, path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

// Several files at once (a gallery); shares the cache with useSignedUrl. Missing URLs are null until signed.
export function useSignedUrls(paths: string[], bucket = BUCKET) {
  return useQueries({
    queries: paths.map((path) => ({
      queryKey: ["signed-url", bucket, path],
      staleTime: 50 * 60_000,
      queryFn: async () => {
        const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 3600);
        if (error) throw error;
        return data.signedUrl;
      },
    })),
    combine: (results) => results.map((r) => r.data ?? null),
  });
}

export async function downloadAttachment(path: string, fileName: string, bucket = BUCKET) {
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 60, { download: fileName });
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

const safeName = (name: string) => name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "_").slice(-120);

type UploadedFile = { storage_path: string; file_name: string; mime_type: string; size_bytes: number };

export async function uploadAttachmentFile(entityType: string, entityId: string, file: File): Promise<UploadedFile> {
  const storagePath = `${entityType}/${entityId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabaseClient.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return { storage_path: storagePath, file_name: file.name, mime_type: file.type, size_bytes: file.size };
}

// Invoices of cost items live in their own bucket, readable only with costs.view (path <task_id>/<file>).
export const INVOICE_BUCKET = "invoices";

export async function uploadInvoiceFile(taskId: string, file: File) {
  const path = `${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { error } = await supabaseClient.storage.from(INVOICE_BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}
