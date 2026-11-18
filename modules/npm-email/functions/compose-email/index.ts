// Ported 1:1 from the NPM tool (supabase/functions/compose-email/index.ts).
// Sends a mail composed in the app - a new conversation about a record (offer / order) or a reply in a thread - from a
// mailbox the caller has access to, and records it as an email thread (_shared/trackedMail.ts).
//   { mailbox_id, to, cc?, subject, body_html, links?: [{ entity_type, entity_id }] }   new conversation
//   { thread_id, to, cc?, body_html }                                                    reply (mailbox, subject and token come from the thread)
// Either form may carry draft_id (a new-composition draft, deleted once the mail is sent).
// A link is a specification or an order the caller may edit; an order is also linked to its specification so the offer
// and its orders share the conversation (email_record_threads). Response: { ok, email_thread_id?, warning?, error? }.
import { serviceClient, userClient } from "../_shared/msgraph.ts";
import { usableAsNewComposition } from "../_shared/draftAccess.ts";
import {
  MAX_MAIL_ATTACHMENT_BYTES,
  recordSentMail,
  sendTrackedMail,
  type EntityLink,
  type MailAttachment,
  type TrackedMailInput,
} from "../_shared/trackedMail.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINKABLE = ["specifications", "orders"];

type Body = {
  mailbox_id?: string;
  thread_id?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  body_html?: string;
  links?: EntityLink[];
  draft_id?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  const uc = userClient(req.headers.get("Authorization"));
  const { data: authData, error: authError } = await uc.auth.getUser();
  if (authError || !authData.user) return json({ ok: false, error: "Unauthorized" }, 401);
  const userId = authData.user.id;
  const svc = serviceClient();

  const to = (body.to ?? []).map((a) => a.trim()).filter(Boolean);
  const cc = (body.cc ?? []).map((a) => a.trim()).filter(Boolean);
  const invalid = [...to, ...cc].filter((a) => !EMAIL_PATTERN.test(a));
  if (to.length === 0) return json({ ok: false, error: "Add at least one recipient" }, 422);
  if (invalid.length > 0) return json({ ok: false, error: `Not an email address: ${invalid.join(", ")}` }, 422);
  if (to.length + cc.length > 20) return json({ ok: false, error: "Too many recipients" }, 422);
  if (!body.body_html?.trim()) return json({ ok: false, error: "Write a text first" }, 422);

  let mailboxId = body.mailbox_id ?? null;
  let subject = body.subject?.trim() ?? "";
  let referenceToken: string | undefined;
  let existingThreadId: string | undefined;
  let replyToInternetMessageId: string | undefined;
  if (body.thread_id) {
    const { data: mayRead } = await uc.rpc("can_access_email_thread", { p_email_thread_id: body.thread_id });
    if (mayRead !== true) return json({ ok: false, error: "You have no access to this thread" }, 403);
    const { data: thread } = await svc.from("email_threads").select("mailbox_id, subject, reference_token").eq("id", body.thread_id).maybeSingle();
    if (!thread) return json({ ok: false, error: "Thread not found" }, 404);
    mailboxId = thread.mailbox_id;
    subject = thread.subject || subject;
    referenceToken = thread.reference_token ?? undefined;
    existingThreadId = body.thread_id;
    const { data: last } = await svc
      .from("email_messages")
      .select("message_id_header")
      .eq("email_thread_id", body.thread_id)
      .not("message_id_header", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    replyToInternetMessageId = last?.message_id_header ?? undefined;
  }
  if (!mailboxId) return json({ ok: false, error: "Choose a mailbox" }, 422);
  if (!subject) return json({ ok: false, error: "Subject is required" }, 422);

  const { data: mayUseMailbox } = await uc.rpc("can_access_mailbox", { p_mailbox_id: mailboxId });
  if (mayUseMailbox !== true) return json({ ok: false, error: "You have no access to this mailbox" }, 403);
  const { data: mailbox } = await svc.from("mailboxes").select("address, display_name").eq("id", mailboxId).maybeSingle();
  if (!mailbox) return json({ ok: false, error: "Mailbox not found" }, 404);

  // Links of a new conversation: only records the caller may edit; an order also links its specification.
  const links = new Map<string, EntityLink>();
  if (!existingThreadId) {
    for (const l of body.links ?? []) {
      if (!LINKABLE.includes(l.entity_type) || !l.entity_id) return json({ ok: false, error: "Cannot link this kind of record" }, 422);
      const { data: mayEdit } = await uc.rpc("can_access_entity", { p_entity_type: l.entity_type, p_entity_id: l.entity_id, p_grant_type: "edit" });
      if (mayEdit !== true) return json({ ok: false, error: "Not allowed" }, 403);
      links.set(`${l.entity_type}:${l.entity_id}`, l);
      if (l.entity_type === "orders") {
        const { data: order } = await svc.from("orders").select("specification_id").eq("id", l.entity_id).maybeSingle();
        if (order?.specification_id) {
          links.set(`specifications:${order.specification_id}`, { entity_type: "specifications", entity_id: order.specification_id });
        }
      }
    }
  }

  // Attachments are the files of the draft (a new composition's draft_id, or the draft of the thread being answered).
  let draftId: string | null = null;
  if (existingThreadId) {
    const { data: d } = await svc.from("email_thread_drafts").select("id").eq("email_thread_id", existingThreadId).maybeSingle();
    draftId = d?.id ?? null;
  } else if (body.draft_id) {
    // Read with the caller's own client (row level security) and bound to the mailbox the mail goes out from: the id comes
    // from the browser, and the files are read and moved with the service role below.
    const { data: d } = await uc.from("email_thread_drafts").select("id, mailbox_id, email_thread_id").eq("id", body.draft_id).maybeSingle();
    if (!usableAsNewComposition(d, mailboxId)) return json({ ok: false, error: "This draft does not belong to the mailbox" }, 403);
    draftId = d!.id;
  }
  const attachments: MailAttachment[] = [];
  if (draftId) {
    const { data: rows } = await svc.from("attachments").select("filename:file_name, mime_type, size_bytes, storage_path").eq("entity_type", "email_thread_drafts").eq("entity_id", draftId);
    const total = ((rows as any[]) ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0);
    if (total > MAX_MAIL_ATTACHMENT_BYTES) return json({ ok: false, error: "The attachments are larger than 25 MB together" }, 422);
    for (const r of (rows as any[]) ?? []) {
      const { data: blob, error } = await svc.storage.from("attachments").download(r.storage_path);
      if (error || !blob) return json({ ok: false, error: `Could not read the attachment ${r.filename}` }, 500);
      attachments.push({ name: r.filename, contentType: r.mime_type ?? "application/octet-stream", bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
  }

  const mail: TrackedMailInput = {
    mailboxId,
    mailboxAddress: mailbox.address,
    mailboxDisplayName: mailbox.display_name,
    to,
    cc,
    subject,
    bodyHtml: body.body_html,
    attachments,
    referenceToken,
    replyToInternetMessageId,
  };
  try {
    const sent = await sendTrackedMail(svc, mail);
    const { threadId, messageId, warning } = await recordSentMail(svc, { ...mail, sent, userId, links: [...links.values()], existingThreadId });
    // The files now belong to the sent message; the draft goes only once they are moved, so a failed record keeps them.
    let filesMoved = true;
    if (draftId) {
      if (!messageId) filesMoved = false;
      else {
        // Platform: storage access goes by path (<entity_type>/<id>/), so each file is copied under email_messages/<id>/ and its row
        // moved; a file the draft only borrowed (forward: a path of another message) stays where it is.
        const { data: rows } = await svc.from("attachments").select("id, storage_path").eq("entity_type", "email_thread_drafts").eq("entity_id", draftId);
        for (const r of (rows as { id: string; storage_path: string }[] | null) ?? []) {
          const target = `email_messages/${messageId}/${r.storage_path.split("/").pop()}`;
          const { error: copyError } = await svc.storage.from("attachments").copy(r.storage_path, target);
          if (copyError) { filesMoved = false; continue; }
          const { error } = await svc.from("attachments").update({ entity_type: "email_messages", entity_id: messageId, storage_path: target }).eq("id", r.id);
          if (error) { filesMoved = false; continue; }
          if (r.storage_path.startsWith("email_thread_drafts/")) await svc.storage.from("attachments").remove([r.storage_path]);
        }
      }
    }
    if (filesMoved) {
      // A sent reply ends the shared draft of its thread.
      if (existingThreadId) await svc.from("email_thread_drafts").delete().eq("email_thread_id", existingThreadId);
      else if (draftId) await svc.from("email_thread_drafts").delete().eq("id", draftId).eq("mailbox_id", mailboxId);
    }
    return json({ ok: true, email_thread_id: threadId, warning });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
