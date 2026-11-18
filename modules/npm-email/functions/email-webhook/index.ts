// Ported 1:1 from the NPM tool (supabase/functions/email-webhook/index.ts).
// Step 5 of ~/npm_tool/docs/email-outbound-connection-plan.md - inbound ingestion.
// Microsoft calls this URL two different ways:
//   1. Validation handshake, whenever a subscription is created or renewed
//      via ensureWebhookSubscription (_shared/msgraph.ts): a request
//      carrying ?validationToken=... that must be echoed back as plain text
//      within 10s. No auth, no meaningful body.
//   2. Real change notifications: POST { value: [ {subscriptionId,
//      clientState, resourceData: {id}, ...} ] } - one call can batch
//      several items, each naming only the changed message's id; the full
//      message is fetched separately via Graph.
// Every mailbox's subscription is scoped to its inbox folder's "created"
// events only (see ensureWebhookSubscription), so every notification here
// is necessarily inbound mail - direction is never ambiguous.
//
// Not handled (documented gaps, not oversights):
//   - itemAttachment/referenceAttachment (only fileAttachment is synced).
//   - Bounce detection is a heuristic (from/subject pattern + first email
//     address found in the body), not a real NDR/DSN parser.
import {
  fetchGraphAttachments,
  fetchGraphMessage,
  getValidAccessToken,
  serviceClient,
} from "../_shared/msgraph.ts";
import { findReferenceTokens } from "../_shared/referenceToken.ts";
import { sameSecret } from "../_shared/secret.ts";

type NotificationItem = {
  subscriptionId?: string;
  clientState?: string;
  resourceData?: { id?: string };
};

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mailerdaemon)@/i;
const BOUNCE_SUBJECT = /^(undeliverable|delivery (status notification|has failed)|mail delivery failed|returned mail)/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function headerValue(headers: any[] | undefined, name: string): string | null {
  const h = (headers ?? []).find((entry: any) => entry.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function ingestOneMessage(
  svc: ReturnType<typeof serviceClient>,
  mailboxId: string,
  mailboxAddress: string,
  accessToken: string,
  graphMessageId: string,
): Promise<void> {
  const msg = await fetchGraphMessage(accessToken, mailboxAddress, graphMessageId);

  // Idempotency: Graph can and does redeliver the same notification.
  if (msg.internetMessageId) {
    const { data: existing } = await svc
      .from("email_messages")
      .select("id")
      .eq("message_id_header", msg.internetMessageId)
      .maybeSingle();
    if (existing) return;
  }

  const inReplyTo = headerValue(msg.internetMessageHeaders, "In-Reply-To");
  const referencesHeader = headerValue(msg.internetMessageHeaders, "References");
  const referencesList = referencesHeader ? referencesHeader.split(/\s+/).filter(Boolean) : [];

  // Thread matching: prefer Graph's own conversationId (reliable within a
  // mailbox once any message in the thread has one recorded); fall back to
  // In-Reply-To/References against message_id_header for a thread whose
  // first message never got a conversationId recorded (e.g. a thread started by send-email, which still
  // uses plain sendMail - see its header comment).
  let emailThreadId: string | null = null;

  if (msg.conversationId) {
    const { data: byConversation } = await svc
      .from("email_threads")
      .select("id")
      .eq("mailbox_id", mailboxId)
      .eq("provider_conversation_id", msg.conversationId)
      .maybeSingle();
    if (byConversation) emailThreadId = byConversation.id;
    if (!emailThreadId) {
      // A reply sent from a thread started its own Graph conversation; every message records its own id.
      const { data: byMessage } = await svc
        .from("email_messages")
        .select("email_thread_id, email_threads!inner(mailbox_id)")
        .eq("provider_conversation_id", msg.conversationId)
        .eq("email_threads.mailbox_id", mailboxId)
        .limit(1);
      if (byMessage && byMessage.length > 0) emailThreadId = byMessage[0].email_thread_id;
    }
  }

  if (!emailThreadId && (inReplyTo || referencesList.length > 0)) {
    const candidates = [inReplyTo, ...referencesList].filter(Boolean) as string[];
    const { data: byHeaderRows } = await svc
      .from("email_messages")
      .select("email_thread_id")
      .in("message_id_header", candidates);
    const threadIds = [...new Set((byHeaderRows ?? []).map((r: any) => r.email_thread_id))];
    if (threadIds.length > 0) {
      const { data: matchingThreads } = await svc
        .from("email_threads")
        .select("id")
        .eq("mailbox_id", mailboxId)
        .in("id", threadIds)
        .limit(1);
      if (matchingThreads && matchingThreads.length > 0) emailThreadId = matchingThreads[0].id;
    }
  }

  // Last resort for a reply that lost the conversation id and the headers: the random "[XXXXXXXXXX]" token the app put
  // into the subject and at the end of the body of the mail it sent (see _shared/referenceToken.ts). The subject is
  // searched first, then the body (a reply quotes the original, so the token usually survives there even when the
  // subject was rewritten); the first token that belongs to a thread of this mailbox wins.
  if (!emailThreadId) {
    const tokens = findReferenceTokens(String(msg.subject ?? ""), stripHtml(typeof msg.body?.content === "string" ? msg.body.content : ""));
    if (tokens.length > 0) {
      const { data: byToken } = await svc
        .from("email_threads")
        .select("id, reference_token")
        .eq("mailbox_id", mailboxId)
        .in("reference_token", tokens);
      const hit = tokens.map((t) => byToken?.find((r: any) => r.reference_token === t)).find(Boolean);
      if (hit) emailThreadId = hit.id;
    }
  }

  if (!emailThreadId) {
    const { data: newThread, error: threadError } = await svc
      .from("email_threads")
      .insert({
        mailbox_id: mailboxId,
        subject: msg.subject ?? "(no subject)",
        status: "open",
        provider_conversation_id: msg.conversationId ?? null,
      })
      .select("id")
      .single();
    if (threadError || !newThread) throw new Error(`failed to create thread: ${threadError?.message}`);
    emailThreadId = newThread.id;
  } else if (msg.conversationId) {
    // Backfill provider_conversation_id if this thread didn't have one yet
    // (e.g. it started from our own first outbound send).
    await svc
      .from("email_threads")
      .update({ provider_conversation_id: msg.conversationId })
      .eq("id", emailThreadId)
      .is("provider_conversation_id", null);
  }

  const fromAddress = msg.from?.emailAddress?.address ?? "unknown";
  const fromName = msg.from?.emailAddress?.name ?? null;
  const bodyHtml = msg.body?.contentType === "html" ? msg.body.content : null;
  const bodyText = msg.body?.contentType === "text" ? msg.body.content : bodyHtml ? stripHtml(bodyHtml) : null;

  const { data: messageRow, error: messageError } = await svc
    .from("email_messages")
    .insert({
      email_thread_id: emailThreadId,
      direction: "inbound",
      message_id_header: msg.internetMessageId ?? null,
      provider_conversation_id: msg.conversationId ?? null,
      in_reply_to_header: inReplyTo,
      references_headers: referencesList.length > 0 ? referencesList : null,
      from_address: fromAddress,
      from_display_name: fromName,
      body_text: bodyText,
      body_html: bodyHtml,
      send_status: "received",
      provider_message_id: msg.id,
      sent_at: msg.receivedDateTime ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (messageError || !messageRow) throw new Error(`failed to record message: ${messageError?.message}`);

  const recipientRows = [
    ...(msg.toRecipients ?? []).map((r: any, position: number) => ({
      kind: "to",
      position,
      email_address: r.emailAddress?.address,
      display_name: r.emailAddress?.name ?? null,
    })),
    ...(msg.ccRecipients ?? []).map((r: any, position: number) => ({
      kind: "cc",
      position,
      email_address: r.emailAddress?.address,
      display_name: r.emailAddress?.name ?? null,
    })),
    ...(msg.bccRecipients ?? []).map((r: any, position: number) => ({
      kind: "bcc",
      position,
      email_address: r.emailAddress?.address,
      display_name: r.emailAddress?.name ?? null,
    })),
  ].filter((r) => r.email_address);
  if (recipientRows.length > 0) {
    await svc
      .from("email_message_recipients")
      .insert(recipientRows.map((r) => ({ ...r, email_message_id: messageRow.id })));
  }

  if (msg.hasAttachments) {
    try {
      const attachments = await fetchGraphAttachments(accessToken, mailboxAddress, graphMessageId);
      for (const att of attachments) {
        if (att["@odata.type"] !== "#microsoft.graph.fileAttachment" || !att.contentBytes) continue;
        const bytes = Uint8Array.from(atob(att.contentBytes), (c) => c.charCodeAt(0));
        const safeName = (att.name ?? "attachment").replace(/[^A-Za-z0-9._-]/g, "_");
        const storagePath = `email_messages/${messageRow.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await svc.storage.from("attachments").upload(storagePath, bytes, {
          contentType: att.contentType ?? "application/octet-stream",
        });
        if (uploadError) throw uploadError;
        await svc.from("attachments").insert({
          entity_type: "email_messages",
          entity_id: messageRow.id,
          file_name: att.name ?? "attachment",
          mime_type: att.contentType ?? null,
          size_bytes: att.size ?? bytes.length,
          storage_path: storagePath,
          content_id: att.contentId ?? null,
          is_inline: !!att.isInline,
        });
      }
    } catch (err) {
      console.error("email-webhook: attachment sync failed", messageRow.id, err);
      // The message itself is already recorded - don't fail the whole
      // ingestion over an attachment problem.
    }
  }

  // Bounce heuristic (best-effort, not a real NDR/DSN parser): a message
  // from a mailer-daemon/postmaster address, or with a typical bounce
  // subject, is treated as a delivery failure notice - the first email
  // address found in its body (the failed recipient, in every common NDR
  // format) is suppressed.
  if (BOUNCE_FROM.test(fromAddress) || (msg.subject && BOUNCE_SUBJECT.test(msg.subject))) {
    const haystack = bodyText ?? (bodyHtml ? stripHtml(bodyHtml) : "");
    const match = haystack.match(EMAIL_RE);
    if (match) {
      await svc.from("email_suppressions").upsert(
        { email_address: match[0].toLowerCase(), reason: `bounce detected in thread ${emailThreadId}` },
        { onConflict: "email_address" },
      );
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken !== null) {
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  let payload: { value?: NotificationItem[] };
  try {
    payload = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }

  const svc = serviceClient();

  for (const item of payload.value ?? []) {
    const graphMessageId = item.resourceData?.id;
    if (!item.subscriptionId || !graphMessageId) continue;

    const { data: connection } = await svc
      .from("mailbox_connections")
      .select("mailbox_id, webhook_client_state")
      .eq("webhook_subscription_id", item.subscriptionId)
      .maybeSingle();
    if (!connection) {
      console.error("email-webhook: unknown subscription", item.subscriptionId);
      continue;
    }
    // Fail closed: a connection without a stored clientState cannot be verified, so its notifications are ignored.
    if (!connection.webhook_client_state || !sameSecret(connection.webhook_client_state, item.clientState ?? "")) {
      console.error("email-webhook: clientState missing or mismatched", item.subscriptionId);
      continue;
    }

    const { data: mailbox } = await svc
      .from("mailboxes")
      .select("address")
      .eq("id", connection.mailbox_id)
      .maybeSingle();
    if (!mailbox) continue;

    try {
      const accessToken = await getValidAccessToken(svc, connection.mailbox_id);
      await ingestOneMessage(svc, connection.mailbox_id, mailbox.address, accessToken, graphMessageId);
    } catch (err) {
      console.error("email-webhook: ingestion failed", connection.mailbox_id, graphMessageId, err);
      // Continue with the rest of the batch - one bad message shouldn't
      // block others notified in the same call.
    }
  }

  // Graph only cares about a 2xx within a few seconds - the body is ignored.
  return new Response(null, { status: 202 });
});
