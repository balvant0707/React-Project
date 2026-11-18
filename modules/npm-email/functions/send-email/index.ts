// Ported 1:1 from the NPM tool (supabase/functions/send-email/index.ts).
// Step 4 of ~/npm_tool/docs/email-outbound-connection-plan.md - "outgoing emails soon".
// Sends a queued email_thread_drafts row via Microsoft Graph
// (/users/{mailbox-address}/sendMail, using the mailbox's own delegated
// token from mailbox_connections) and records the result as an
// email_messages row. No compose UI calls this yet (that's the separate,
// not-yet-built "Inbox UI integration" step in
// ~/npm_tool/docs/email-integration-build-plan.md) - this is the backend half only,
// callable today with `{ email_thread_draft_id, subject? }`.
//
// The mail is created as a draft and then sent (_shared/trackedMail.ts), because Graph's plain sendMail hands back
// no ids: the thread and message record the conversation id and the internet message id, so replies find the
// thread (email-webhook), and the subject carries a "[token]" as the fallback. Replying with createReply on the
// original inbound message is still not used.
import { serviceClient, userClient } from "../_shared/msgraph.ts";
import { bodyWithToken, sendTrackedMail, type SentMail } from "../_shared/trackedMail.ts";

type SendRequest = { email_thread_draft_id: string; subject?: string };

type DraftRow = {
  id: string;
  email_thread_id: string | null;
  mailbox_id: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  body_text: string | null;
  body_html: string | null;
};

function graphRecipients(addresses: string[]) {
  return addresses.map((address) => ({ emailAddress: { address } }));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let body: SendRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  if (!body.email_thread_draft_id) return new Response("email_thread_draft_id is required", { status: 400 });

  // Read the draft (and confirm the caller may access it) through a client
  // scoped to the caller's own JWT - reuses email_thread_drafts' existing
  // RLS instead of re-deriving mailbox access rules here.
  const uc = userClient(req.headers.get("Authorization"));
  const { data: authData, error: authError } = await uc.auth.getUser();
  if (authError || !authData.user) return new Response("Unauthorized", { status: 401 });

  const { data: draft, error: draftError } = await uc
    .from("email_thread_drafts")
    .select("id, email_thread_id, mailbox_id, to_addresses, cc_addresses, bcc_addresses, body_text, body_html")
    .eq("id", body.email_thread_draft_id)
    .maybeSingle();
  if (draftError || !draft) return new Response("Draft not found or not accessible", { status: 404 });
  const d = draft as DraftRow;

  if (!d.to_addresses || d.to_addresses.length === 0) {
    return new Response("Draft has no recipients", { status: 400 });
  }

  const svc = serviceClient();

  let mailboxId = d.mailbox_id;
  let subject = body.subject;
  let existingToken: string | null = null;
  let existingConversationId: string | null = null;
  if (d.email_thread_id) {
    const { data: thread } = await svc
      .from("email_threads")
      .select("mailbox_id, subject, reference_token, provider_conversation_id")
      .eq("id", d.email_thread_id)
      .maybeSingle();
    if (!thread) return new Response("Draft's thread no longer exists", { status: 404 });
    mailboxId = thread.mailbox_id;
    subject = subject ?? thread.subject ?? undefined;
    existingToken = thread.reference_token;
    existingConversationId = thread.provider_conversation_id;
  }
  if (!mailboxId) return new Response("Draft has no mailbox", { status: 400 });

  const { data: mailbox } = await svc.from("mailboxes").select("address, display_name").eq("id", mailboxId).maybeSingle();
  if (!mailbox) return new Response("Mailbox not found", { status: 404 });

  let sent: SentMail | null = null;
  let sendError: string | null = null;
  try {
    sent = await sendTrackedMail(svc, {
      mailboxId,
      mailboxAddress: mailbox.address,
      mailboxDisplayName: mailbox.display_name,
      to: d.to_addresses,
      cc: d.cc_addresses ?? [],
      bcc: d.bcc_addresses ?? [],
      subject: subject ?? "(no subject)",
      bodyHtml: d.body_html ?? d.body_text ?? "",
      referenceToken: existingToken ?? undefined,
    });
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
  }
  const sentAt = sent?.sentAt ?? new Date().toISOString();

  // Brand-new composition (no thread yet): create the thread first so the
  // message below has somewhere to attach, regardless of whether the send
  // itself succeeded - a failed send is still something the user sent (and
  // needs to see failed), not something that never happened.
  let emailThreadId = d.email_thread_id;
  if (!emailThreadId) {
    const { data: newThread, error: threadError } = await svc
      .from("email_threads")
      .insert({
        mailbox_id: mailboxId,
        subject: sent?.subject ?? subject ?? "(no subject)",
        status: "open",
        provider_conversation_id: sent?.conversationId ?? null,
        reference_token: sent?.referenceToken ?? null,
      })
      .select("id")
      .single();
    if (threadError || !newThread) {
      return new Response(`Failed to create thread: ${threadError?.message}`, { status: 500 });
    }
    emailThreadId = newThread.id;
  } else if (sent) {
    // A thread that started before tokens / ids were recorded learns them from its first tracked send.
    const patch: Record<string, string> = {};
    if (!existingToken) patch.reference_token = sent.referenceToken;
    if (!existingConversationId && sent.conversationId) patch.provider_conversation_id = sent.conversationId;
    if (Object.keys(patch).length > 0) await svc.from("email_threads").update(patch).eq("id", emailThreadId);
  }

  const { data: message, error: messageError } = await svc
    .from("email_messages")
    .insert({
      email_thread_id: emailThreadId,
      direction: "outbound",
      from_address: mailbox.address,
      from_display_name: mailbox.display_name,
      message_id_header: sent?.internetMessageId ?? null,
      provider_message_id: sent?.providerMessageId ?? null,
      body_text: d.body_text,
      body_html: d.body_html && sent ? bodyWithToken(d.body_html, sent.referenceToken) : d.body_html,
      provider_conversation_id: sent?.conversationId ?? null,
      send_status: sendError ? "failed" : "sent",
      error_message: sendError,
      sent_at: sentAt,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    return new Response(`Failed to record message: ${messageError?.message}`, { status: 500 });
  }

  const recipientRows = [
    ...d.to_addresses.map((email_address, position) => ({ kind: "to", position, email_address })),
    ...(d.cc_addresses ?? []).map((email_address, position) => ({ kind: "cc", position, email_address })),
    ...(d.bcc_addresses ?? []).map((email_address, position) => ({ kind: "bcc", position, email_address })),
  ];
  if (recipientRows.length > 0) {
    await svc
      .from("email_message_recipients")
      .insert(recipientRows.map((r) => ({ ...r, email_message_id: message.id })));
  }

  // Sent (or terminally failed, same as a bounce) - the draft's job is
  // done, clear it so a stale composition doesn't linger in the shared
  // draft slot.
  await svc.from("email_thread_drafts").delete().eq("id", d.id);

  if (sendError) {
    return new Response(JSON.stringify({ success: false, email_thread_id: emailThreadId, error: sendError }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({ success: true, email_thread_id: emailThreadId, email_message_id: message.id }),
    { headers: { "Content-Type": "application/json" } },
  );
});
