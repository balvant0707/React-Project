// Ported 1:1 from the NPM tool (app/src/modules/email/drafts.ts).
import { supabaseClient } from "@rbp/core";

// Shared email drafts (email_thread_drafts): a reply to a thread, or a new composition that lives in a mailbox.
// While somebody types, the draft is locked to them for LOCK_LEASE_MS (each autosave refreshes it; the database
// refuses edits and deletes by anyone else until it lapses) and the others see who is writing.

const LOCK_LEASE_MS = 2 * 60 * 1000;

export type DraftWriter = { name: string | null; email: string | null } | null;

export type DraftLock = { locked_by_user_id: string | null; locked_at: string | null };

export const isLockedByOther = (draft: DraftLock | null, myUserId: string | undefined, now = Date.now()) =>
  !!draft?.locked_by_user_id &&
  draft.locked_by_user_id !== myUserId &&
  !!draft.locked_at &&
  now - new Date(draft.locked_at).getTime() < LOCK_LEASE_MS;

export const writerLabel = (u: DraftWriter) => u?.name ?? u?.email ?? "Someone";

export type EmailLink = { entity_type: string; entity_id: string };

// Starts a new composition in the first connected mailbox of the user (else the first one). Returns the draft id, or
// an error text when the user has no mailbox.
export async function createNewEmailDraft(
  userId: string,
  init: { links?: EmailLink[]; to?: string[]; subject?: string; mailboxId?: string } = {},
): Promise<{ id?: string; error?: string }> {
  let mailboxId = init.mailboxId;
  if (!mailboxId) {
    const [{ data: boxes }, { data: connections }] = await Promise.all([
      supabaseClient.from("mailboxes").select("id").order("display_name"),
      supabaseClient.from("mailbox_connections").select("mailbox_id, status"),
    ]);
    const ok = new Set(((connections as any[]) ?? []).filter((c) => c.status === "ok").map((c) => c.mailbox_id));
    const list = ((boxes as any[]) ?? []).map((b) => b.id as string);
    mailboxId = list.find((id) => ok.has(id)) ?? list[0];
  }
  if (!mailboxId) return { error: "You have no mailbox to write from" };
  const { data, error } = await supabaseClient
    .from("email_thread_drafts")
    .insert({
      mailbox_id: mailboxId,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      to_addresses: init.to ?? [],
      subject: init.subject ?? null,
      entity_links: init.links ?? [],
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not start the email" };
  return { id: data.id };
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type MailAttachmentRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  content_id?: string | null;
  is_inline?: boolean | null;
};

// Stores a file as an attachment of a draft (storage object + attachments row). Sending moves the row to the sent message.
export async function uploadDraftAttachment(draftId: string, file: Blob, filename: string, userId: string): Promise<{ error?: string }> {
  // The storage key accepts a strict ASCII set only; the real name stays in the row (same as attachmentsPanel.tsx).
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const storagePath = `email_thread_drafts/${draftId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabaseClient.storage.from("attachments").upload(storagePath, file);
  if (uploadError) return { error: uploadError.message };
  const { error } = await supabaseClient.from("attachments").insert({
    entity_type: "email_thread_drafts",
    entity_id: draftId,
    file_name: filename,
    mime_type: file.type || null,
    size_bytes: file.size,
    storage_path: storagePath,
    uploaded_by_user_id: userId,
  });
  return error ? { error: error.message } : {};
}

// A forward / "attach from" copy: a new attachments row on the draft pointing at the same stored file.
export async function copyAttachmentsToDraft(draftId: string, rows: MailAttachmentRow[], userId: string): Promise<{ error?: string }> {
  if (rows.length === 0) return {};
  const { error } = await supabaseClient.from("attachments").insert(
    rows.map((r) => ({
      entity_type: "email_thread_drafts",
      entity_id: draftId,
      file_name: r.filename,
      mime_type: r.mime_type,
      size_bytes: r.size_bytes,
      storage_path: r.storage_path,
      uploaded_by_user_id: userId,
    })),
  );
  return error ? { error: error.message } : {};
}
