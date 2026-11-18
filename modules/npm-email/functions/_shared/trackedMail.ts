// Ported 1:1 from the NPM tool (supabase/functions/_shared/trackedMail.ts).
// Mails sent by the app on behalf of a record (availability requests, forwarder mails), sent in a way that lets
// the replies find their way back: Graph's plain /sendMail answers 202 without any id, so the mail is created as a
// draft first (the draft carries the internet message id and the conversation id) and then sent. The thread is
// recorded with those ids, plus a random reference token (subject and body, referenceToken.ts) as the fallback for a reply that lost both
// (see email-webhook). ~/npm_tool/docs/email-outbound-connection-plan.md, "Mails the app sends for a record".

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getValidAccessToken } from "./msgraph.ts";
import { sendViaGraph, type MailAttachment } from "./graphMail.ts";
import { bodyWithToken, newReferenceToken, subjectWithToken } from "./referenceToken.ts";

export { bodyWithToken } from "./referenceToken.ts";
export { MAX_MAIL_ATTACHMENT_BYTES, type MailAttachment } from "./graphMail.ts";

export type TrackedMailInput = {
  mailboxId: string;
  mailboxAddress: string;
  mailboxDisplayName: string | null;
  to: string[];
  cc: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  attachments?: MailAttachment[];
  // Answering a message: the internet message id of the one answered. The mail is then made with Graph's createReply, so
  // it carries In-Reply-To / References and stays in the conversation of the original in Outlook too; falls back to a
  // plain draft when the original cannot be found in the mailbox.
  replyToInternetMessageId?: string;
  // A reply in an existing thread keeps the thread's token; otherwise a random one is made.
  referenceToken?: string;
};

export type SentMail = {
  subject: string;
  referenceToken: string;
  providerMessageId: string | null;
  internetMessageId: string | null;
  conversationId: string | null;
  sentAt: string;
};

// Throws when the mail could not be sent. A draft that was created but not sent is deleted again (graphMail.ts).
export async function sendTrackedMail(svc: SupabaseClient, input: TrackedMailInput): Promise<SentMail> {
  const accessToken = await getValidAccessToken(svc, input.mailboxId);
  const referenceToken = input.referenceToken ?? newReferenceToken();
  const subject = subjectWithToken(input.subject, referenceToken);
  const ids = await sendViaGraph({
    accessToken,
    mailboxAddress: input.mailboxAddress,
    subject,
    bodyHtml: bodyWithToken(input.bodyHtml, referenceToken),
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    attachments: input.attachments,
    replyToInternetMessageId: input.replyToInternetMessageId,
  });
  return { subject, referenceToken, ...ids, sentAt: new Date().toISOString() };
}

export type EntityLink = { entity_type: string; entity_id: string };

// Records a sent mail as a thread (a new one per mail unless existingThreadId is given) with its first message, recipients and the record links.
// Best effort like the callers expect: returns the thread id, or a warning when something could not be written.
export async function recordSentMail(
  svc: SupabaseClient,
  input: TrackedMailInput & { sent: SentMail; links: EntityLink[]; userId: string; existingThreadId?: string },
): Promise<{ threadId: string | null; messageId?: string; warning?: string }> {
  const { sent } = input;
  // A reply goes into its thread; anything else is a thread of its own.
  let thread: { id: string } | null = input.existingThreadId ? { id: input.existingThreadId } : null;
  if (!thread) {
    const { data, error: threadError } = await svc
      .from("email_threads")
      .insert({
        mailbox_id: input.mailboxId,
        subject: sent.subject,
        status: "open",
        provider_conversation_id: sent.conversationId,
        reference_token: sent.referenceToken,
        // A conversation about a record goes to the person who looks after the record (trigger on the links below);
        // one without a record belongs to its sender.
        ...(input.links.length === 0
          ? { responsible_user_id: input.userId, responsible_assigned_at: sent.sentAt, responsible_assigned_by_user_id: input.userId }
          : {}),
      })
      .select("id")
      .single();
    if (threadError || !data) return { threadId: null, warning: `Sent, but not recorded as an email thread: ${threadError?.message}` };
    thread = data;
  } else {
    // Answering an unassigned thread picks it up (~/npm_tool/docs/messaging-domain-model.md, "auto-assignment on pickup").
    await svc
      .from("email_threads")
      .update({ responsible_user_id: input.userId, responsible_assigned_at: sent.sentAt, responsible_assigned_by_user_id: input.userId })
      .eq("id", thread.id)
      .is("responsible_user_id", null);
    // A thread that began with an inbound mail has no token and maybe no conversation id yet: the reply just sent carries
    // them, so the thread learns them (otherwise a reply that loses its headers cannot be matched by the token).
    await svc.from("email_threads").update({ reference_token: sent.referenceToken }).eq("id", thread.id).is("reference_token", null);
    if (sent.conversationId) {
      await svc.from("email_threads").update({ provider_conversation_id: sent.conversationId }).eq("id", thread.id).is("provider_conversation_id", null);
    }
  }

  const problems: string[] = [];
  const { data: message, error: messageError } = await svc
    .from("email_messages")
    .insert({
      email_thread_id: thread.id,
      direction: "outbound",
      message_id_header: sent.internetMessageId,
      from_address: input.mailboxAddress,
      from_display_name: input.mailboxDisplayName,
      body_html: bodyWithToken(input.bodyHtml, sent.referenceToken),
      send_status: "sent",
      provider_message_id: sent.providerMessageId,
      provider_conversation_id: sent.conversationId,
      sent_at: sent.sentAt,
    })
    .select("id")
    .single();
  if (messageError || !message) {
    problems.push(`message: ${messageError?.message}`);
  } else {
    const { error } = await svc.from("email_message_recipients").insert([
      ...input.to.map((email_address, position) => ({ email_message_id: message.id, kind: "to", position, email_address })),
      ...input.cc.map((email_address, position) => ({ email_message_id: message.id, kind: "cc", position, email_address })),
    ]);
    if (error) problems.push(`recipients: ${error.message}`);
  }
  if (input.links.length > 0) {
    const { error } = await svc
      .from("email_thread_entity_links")
      .insert(input.links.map((l) => ({ email_thread_id: thread.id, ...l, linked_by_user_id: input.userId })));
    if (error) problems.push(`record links: ${error.message}`);
  }
  if (input.links.length > 0 && !input.existingThreadId) {
    // The record had nobody to take it: the sender keeps the conversation.
    await svc
      .from("email_threads")
      .update({ responsible_user_id: input.userId, responsible_assigned_at: sent.sentAt, responsible_assigned_by_user_id: input.userId })
      .eq("id", thread.id)
      .is("responsible_user_id", null);
  }
  return { threadId: thread.id, messageId: message?.id, warning: problems.length ? `Sent, but not fully recorded (${problems.join("; ")})` : undefined };
}
