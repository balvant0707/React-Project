// Ported 1:1 from the NPM tool (supabase/functions/_shared/draftAccess.ts).
// A draft may only feed a mail that goes out from its own mailbox, and only as a new composition (a reply's draft is found
// through its thread instead). Used by compose-email on the draft it read with the caller's own client (row level security).
export function usableAsNewComposition(
  draft: { mailbox_id: string | null; email_thread_id: string | null } | null | undefined,
  mailboxId: string,
): boolean {
  return !!draft && draft.email_thread_id === null && draft.mailbox_id === mailboxId;
}
