// Ported 1:1 from the NPM tool (app/src/components/emailThreadPanel.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { FollowToggle } from "./followToggle";
import { Alert, App as AntdApp, Avatar, Button, Input, Select, Space, Spin, Tabs, Tag, Typography, theme as antdTheme } from "antd";
import { LockOutlined, SendOutlined, ShareAltOutlined, UndoOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { RichTextEditor } from "@rbp/module-messaging/src/richText.tsx";
import { EmailThreadLinks } from "./emailThreadLinks";
import { splitAddresses } from "@rbp/module-offers/src/pages/specifications/availabilityPanel.tsx";
import { DraftAttachments, MessageAttachments } from "./emailAttachments";
import {
  copyAttachmentsToDraft,
  createNewEmailDraft,
  isLockedByOther,
  writerLabel,
  type DraftWriter,
  type MailAttachmentRow,
} from "../modules/email/drafts";
import { selectInChunks } from "@rbp/ui";
import { asReactions } from "@rbp/module-messaging/src/lib/reactions.ts";
import { displayName } from "@rbp/module-companies/src/modules/users/users.ts";
// Platform: the internal notes are shown and written with the messaging module's parts, as the record notes are
// (docs/shared-parts.md): text with mentions and record cards, reactions, the composer with mentions, emoji and files.
import { MessageBody } from "@rbp/module-messaging/src/feed/messageBody.tsx";
import { ColumnReactions } from "@rbp/module-messaging/src/feed/reactions.tsx";
import { FeedComposer } from "@rbp/module-messaging/src/feed/composer.tsx";
import type { ReactionColumn } from "@rbp/module-messaging/src/lib/reactions.ts";
import { FileLink } from "@rbp/module-messaging/src/fileLink.tsx";
import { errorText } from "@rbp/core";

// The conversation of a record, if it has one (from NPM's modules/messaging/messages.ts, the one function of it still used).
// Concurrent first posts can briefly leave two; the one holding the messages wins.
async function findConversationId(entityType: string, entityId: string): Promise<string | null> {
  const { data } = await supabaseClient
    .from("conversations")
    .select("id")
    .eq("kind", "record")
    .eq("anchor_type", entityType)
    .eq("anchor_id", entityId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// One email thread as a ticket: the emails and the internal notes of the team in one timeline (notes are marked
// "internal"), the status, the records it belongs to, and a composer with two tabs - Reply (sent to the outside by
// the Edge Function compose-email) and Internal note (a message of the thread's internal conversation, a conversations
// row with entity_type 'email_threads', visible to the mailbox members only, @mentions limited to them). Opening the
// thread marks it read (email_thread_reads). Used by the Notes page (/inbox).
//
// The reply is a shared draft (email_thread_drafts, one per thread): saved on a short debounce, which doubles as the
// lock heartbeat - while someone types the draft is locked to them for 2 minutes (check_email_thread_draft_lock) and
// others see "Someone else is writing a reply"; starting a draft on an unassigned thread claims it
// (claim_email_thread_on_draft_lock). Sending clears the draft.

type EmailRow = {
  id: string;
  direction: "inbound" | "outbound";
  from_address: string;
  from_display_name: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
  send_status: string;
  error_message: string | null;
};
type NoteRow = { id: string; body: string; created_at: string; reactions?: unknown; author_user_id: string; users: { name: string | null; email: string | null } | null };
type ThreadHead = {
  id: string;
  subject: string | null;
  status: string;
  mailbox_id: string;
  responsible_user_id: string | null;
  responsible: { name: string | null; email: string | null } | null;
};
type Draft = {
  id: string;
  to_addresses: string[];
  cc_addresses: string[];
  body_html: string | null;
  locked_by_user_id: string | null;
  locked_at: string | null;
  locked_by?: DraftWriter;
};

const DRAFT_SELECT =
  "id, to_addresses, cc_addresses, body_html, locked_by_user_id, locked_at, locked_by:users!email_thread_drafts_locked_by_user_id_fkey(name, email)";

type TimelineItem = { kind: "email"; at: string; email: EmailRow } | { kind: "note"; at: string; note: NoteRow };

// Inline images already downloaded, by attachment id: a reload of the thread (new message, realtime) must not fetch them again.
const inlineImageCache = new Map<string, string>();

const senderInitials = (name: string) => {
  const parts = name.replace(/<.*>/, "").trim().split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

export function EmailThreadPanel({
  threadId,
  onChanged,
  onOpenDraft,
  onClosed,
}: {
  threadId: string;
  onChanged?: () => void;
  // The thread was closed with the Close buttons; goNext = "Close and next" (the page opens the next thread of its list).
  onClosed?: (threadId: string, goNext: boolean) => void;
  // A forward starts as a new draft; the page opens it.
  onOpenDraft?: (draftId: string) => void;
}) {
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [head, setHead] = useState<ThreadHead | null>(null);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  // Files of the internal notes (the composer attaches them to the thread), by message id.
  const [noteFiles, setNoteFiles] = useState<Record<string, { id: string; storage_path: string; file_name: string; mime_type: string | null }[]>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [replyHtml, setReplyHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const endRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const toTouchedRef = useRef(false);
  const quotedRef = useRef(false);
  const ensureDraftRef = useRef<Promise<string | null> | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [quoteHtml, setQuoteHtml] = useState("");
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Record<string, MailAttachmentRow[]>>({});
  const [inlineHtml, setInlineHtml] = useState<Record<string, string>>({});
  draftRef.current = draft;

  // Files of the messages; inline images (cid:) of an HTML body are swapped for the stored files so they show.
  const loadAttachments = async (ids: string[], rows: EmailRow[]) => {
    if (ids.length === 0) {
      setAttachmentsByMessage({});
      return;
    }
    const data = await selectInChunks<any>(ids, (chunk) =>
      supabaseClient
        .from("attachments")
        .select("id, entity_id, filename:file_name, mime_type, size_bytes, storage_path, content_id, is_inline")
        .eq("entity_type", "email_messages")
        .in("entity_id", chunk),
    );
    const by: Record<string, MailAttachmentRow[]> = {};
    for (const a of data) (by[a.entity_id] ??= []).push(a);
    setAttachmentsByMessage(by);
    const swapped: Record<string, string> = {};
    for (const m of rows) {
      const inline = (by[m.id] ?? []).filter((a) => a.is_inline && a.content_id && (a.size_bytes ?? 0) <= 2 * 1024 * 1024);
      if (!m.body_html || inline.length === 0) continue;
      let html = m.body_html;
      // Inline images of a message load in parallel (and come from the cache when seen before).
      const urls = await Promise.all(
        inline.map(async (a) => {
          let dataUrl = inlineImageCache.get(a.id);
          if (!dataUrl) {
            const { data: blob } = await supabaseClient.storage.from("attachments").download(a.storage_path);
            if (!blob) return null;
            dataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.readAsDataURL(blob);
            });
            inlineImageCache.set(a.id, dataUrl);
          }
          return dataUrl;
        }),
      );
      inline.forEach((a, i) => {
        if (urls[i]) html = html.split(`cid:${a.content_id}`).join(urls[i]!);
      });
      swapped[m.id] = html;
    }
    setInlineHtml(swapped);
  };

  const load = useCallback(async () => {
    const [{ data: h }, { data: e }, c] = await Promise.all([
      supabaseClient
        .from("email_threads")
        .select("id, subject, status, mailbox_id, responsible_user_id, responsible:users!email_threads_responsible_user_id_fkey(name, email)")
        .eq("id", threadId)
        .maybeSingle(),
      supabaseClient
        .from("email_messages")
        .select("id, direction, from_address, from_display_name, body_html, body_text, sent_at, send_status, error_message")
        .eq("email_thread_id", threadId)
        .order("sent_at"),
      findConversationId("email_threads", threadId),
    ]);
    setHead((h as unknown as ThreadHead) ?? null);
    setEmails((e as EmailRow[]) ?? []);
    loadAttachments(((e as EmailRow[]) ?? []).map((m) => m.id), (e as EmailRow[]) ?? []);
    setConversationId(c);
    if (c) {
      const { data: n } = await supabaseClient
        .from("messages")
        .select("id, body, created_at, reactions, author_user_id, users:author_user_id(name, email)")
        .eq("conversation_id", c)
        .is("deleted_at", null)
        .order("created_at");
      setNotes((n as unknown as NoteRow[]) ?? []);
      const ids = ((n as { id: string }[] | null) ?? []).map((x) => x.id);
      const files = ids.length
        ? await selectInChunks<{ id: string; message_id: string; storage_path: string; file_name: string; mime_type: string | null }>(ids, (chunk) =>
            supabaseClient.from("attachments").select("id, message_id, storage_path, file_name, mime_type").in("message_id", chunk),
          )
        : [];
      const byMessage: Record<string, typeof files> = {};
      for (const f of files) byMessage[f.message_id] = [...(byMessage[f.message_id] ?? []), f];
      setNoteFiles(byMessage);
    } else {
      setNotes([]);
      setNoteFiles({});
    }
    setLoading(false);
  }, [threadId]);

  useEffect(() => {
    setLoading(true);
    setReplyHtml("");
    setCc("");
    setDraft(null);
    toTouchedRef.current = false;
    quotedRef.current = false;
    ensureDraftRef.current = null;
    setDraftLoaded(false);
    setQuoteHtml("");
    setAttachmentsByMessage({});
    setInlineHtml({});
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    load();
    supabaseClient
      .from("email_thread_drafts")
      .select(DRAFT_SELECT)
      .eq("email_thread_id", threadId)
      .maybeSingle()
      .then(({ data }) => {
        const d = data as unknown as Draft | null;
        setDraft(d);
        setDraftLoaded(true);
        if (d) {
          if (d.to_addresses.length > 0) {
            setTo(d.to_addresses.join(", "));
            toTouchedRef.current = true;
          }
          setCc(d.cc_addresses.join(", "));
          setReplyHtml(d.body_html ?? "");
          quotedRef.current = true;
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, identity?.id]);

  // Live: a new email or note (a burst is one reload) and the reactions of the notes (patched). Only this thread's rows
  // are subscribed (filters).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, 500);
    };
    let channel = supabaseClient
      .channel(`thread:${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "email_messages", filter: `email_thread_id=eq.${threadId}` }, reload)
      // Files of a note are attached after the note itself (with the thread as their record).
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attachments", filter: `entity_id=eq.${threadId}` }, reload);
    if (conversationId) {
      // The reactions column is rewritten by an UPDATE of the message.
      const filter = `conversation_id=eq.${conversationId}`;
      channel = channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, reload)
        // A reaction changes only the column; patch it instead of reloading the thread with all its mails.
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter }, (payload: any) => {
          const row = payload.new as { id: string; reactions?: unknown };
          setNotes((prev) => prev.map((n) => (n.id === row.id ? { ...n, reactions: asReactions(row.reactions) } : n)));
        });
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabaseClient.removeChannel(channel);
    };
  }, [threadId, conversationId, load]);

  // Reply defaults: the last sender from outside, else the recipients of our first mail; the "reply" signature.
  useEffect(() => {
    if (!identity?.id) return;
    supabaseClient
      .from("email_signatures")
      .select("reply_html")
      .eq("user_id", identity.id)
      .maybeSingle()
      .then(({ data }) => setSignatureHtml(data?.reply_html ?? ""));
  }, [identity?.id]);
  useEffect(() => {
    if (toTouchedRef.current) return;
    const lastInbound = [...emails].reverse().find((m) => m.direction === "inbound");
    if (lastInbound) {
      setTo(lastInbound.from_address);
      return;
    }
    const firstOutbound = emails.find((m) => m.direction === "outbound");
    if (!firstOutbound) return;
    supabaseClient
      .from("email_message_recipients")
      .select("email_address")
      .eq("email_message_id", firstOutbound.id)
      .eq("kind", "to")
      .order("position")
      .then(({ data }) => setTo(((data as any[]) ?? []).map((r) => r.email_address).join(", ")));
  }, [emails]);

  const timeline: TimelineItem[] = [
    ...emails.map((email) => ({ kind: "email" as const, at: email.sent_at, email })),
    ...notes.map((note) => ({ kind: "note" as const, at: note.created_at, note })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [timeline.length]);

  const setStatus = async (status: string): Promise<boolean> => {
    const { error } = await supabaseClient.from("email_threads").update({ status }).eq("id", threadId);
    if (error) {
      message.error(errorText(error));
      return false;
    }
    setHead((h) => (h ? { ...h, status } : h));
    onChanged?.();
    return true;
  };

  const close = async (goNext: boolean) => {
    if (await setStatus("closed")) onClosed?.(threadId, goNext);
  };

  // Debounced save of the shared draft; each save refreshes the lock lease.
  const scheduleSave = (next: { to?: string; cc?: string; html?: string }) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!identity?.id) return;
      const payload = {
        to_addresses: splitAddresses(next.to ?? to),
        cc_addresses: splitAddresses(next.cc ?? cc),
        body_html: next.html ?? replyHtml,
        updated_by_user_id: identity.id,
        locked_by_user_id: identity.id,
        locked_at: new Date().toISOString(),
      };
      const current = draftRef.current;
      const select = DRAFT_SELECT;
      const { data, error } = current
        ? await supabaseClient.from("email_thread_drafts").update(payload).eq("id", current.id).select(select).single()
        : await supabaseClient
            .from("email_thread_drafts")
            .insert({ email_thread_id: threadId, created_by_user_id: identity.id, ...payload })
            .select(select)
            .single();
      if (error) {
        message.error(`Couldn't save the draft: ${error.message}`);
        // Probably somebody else holds the lock now: learn who (the typed text stays where it is).
        const { data: fresh } = await supabaseClient.from("email_thread_drafts").select(DRAFT_SELECT).eq("email_thread_id", threadId).maybeSingle();
        if (fresh) setDraft(fresh as unknown as Draft);
      } else setDraft(data as unknown as Draft);
    }, 600);
  };

  const lockedByOther = isLockedByOther(draft, identity?.id, now);

  // While somebody else holds the lock the clock keeps moving (their lease lapses, then the fields open up) and the
  // draft is re-read so their name and the lock state stay current.
  useEffect(() => {
    if (!lockedByOther) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      supabaseClient
        .from("email_thread_drafts")
        .select(DRAFT_SELECT)
        .eq("email_thread_id", threadId)
        .maybeSingle()
        .then(({ data }) => setDraft((data as unknown as Draft | null) ?? null));
    }, 5000);
    return () => clearInterval(timer);
  }, [lockedByOther, threadId]);

  // The message an answer refers to: the newest one.
  const lastMessage = emails.length > 0 ? emails[emails.length - 1] : null;

  const quoteOf = (m: EmailRow) => {
    const body = m.body_html ?? `<p>${(m.body_text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`;
    return `<p></p><blockquote><p>On ${formatDateTime(m.sent_at)}, ${m.from_display_name ?? m.from_address} wrote:</p>${body}</blockquote>`;
  };

  // Reading marks the thread read, with the server's clock: when it opens and again whenever a newer message shows up while
  // it is open (rpc mark_email_thread_read).
  useEffect(() => {
    if (loading || !head || !lastMessage) return;
    supabaseClient.rpc("mark_email_thread_read", { p_thread_id: threadId }).then(() => onChanged?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, !!head, lastMessage?.id, threadId]);

  // A new reply starts with the quoted last message (nothing is saved until somebody types or attaches).
  useEffect(() => {
    if (!draftLoaded || draft || quotedRef.current || replyHtml || !lastMessage) return;
    quotedRef.current = true;
    const q = quoteOf(lastMessage);
    setQuoteHtml(q);
    setReplyHtml(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoaded, draft, lastMessage?.id]);

  // To / Cc for "Reply all": the sender, plus everybody on the message, minus this mailbox.
  const replyAll = async () => {
    if (!lastMessage || !head) return;
    const [{ data: recipients }, { data: box }] = await Promise.all([
      supabaseClient.from("email_message_recipients").select("kind, email_address").eq("email_message_id", lastMessage.id),
      supabaseClient.from("mailboxes").select("address").eq("id", head.mailbox_id).maybeSingle(),
    ]);
    const own = (box?.address ?? "").toLowerCase();
    const rec = ((recipients as any[]) ?? []).filter((r) => r.kind !== "bcc");
    const main = lastMessage.direction === "inbound" ? [lastMessage.from_address] : rec.filter((r) => r.kind === "to").map((r) => r.email_address);
    const toList = [...new Set(main.filter((a) => a && a.toLowerCase() !== own))];
    const ccList = [
      ...new Set(
        [...(lastMessage.direction === "inbound" ? rec.filter((r) => r.kind === "to") : []), ...rec.filter((r) => r.kind === "cc")]
          .map((r) => r.email_address as string)
          .filter((a) => a && a.toLowerCase() !== own && !toList.includes(a)),
      ),
    ];
    toTouchedRef.current = true;
    setTo(toList.join(", "));
    setCc(ccList.join(", "));
    scheduleSave({ to: toList.join(", "), cc: ccList.join(", ") });
  };

  const insertQuote = () => {
    if (!lastMessage) return;
    const q = quoteOf(lastMessage);
    setQuoteHtml(q);
    const next = (replyHtml || "<p></p>") + q;
    setReplyHtml(next);
    scheduleSave({ html: next });
  };

  // The reply draft is created when somebody first attaches a file (or types).
  const ensureDraft = (): Promise<string | null> => {
    if (draftRef.current) return Promise.resolve(draftRef.current.id);
    // Several files chosen at once call this together: they share one insert (the draft is unique per thread).
    if (ensureDraftRef.current) return ensureDraftRef.current;
    const create = async (): Promise<string | null> => {
      if (!identity?.id) return null;
      const { data, error } = await supabaseClient
        .from("email_thread_drafts")
        .insert({
          email_thread_id: threadId,
          created_by_user_id: identity.id,
          updated_by_user_id: identity.id,
          to_addresses: splitAddresses(to),
          cc_addresses: splitAddresses(cc),
          body_html: replyHtml,
          locked_by_user_id: identity.id,
          locked_at: new Date().toISOString(),
        })
        .select(DRAFT_SELECT)
        .single();
      if (error || !data) {
        message.error(errorText(error, "Could not start the draft"));
        return null;
      }
      setDraft(data as unknown as Draft);
      draftRef.current = data as unknown as Draft;
      return (data as any).id as string;
    };
    ensureDraftRef.current = create().finally(() => {
      ensureDraftRef.current = null;
    });
    return ensureDraftRef.current;
  };

  // Forward: a new draft with the message quoted below a header and its files attached; the links of the thread carry over.
  const forward = async (m: EmailRow) => {
    if (!identity?.id) return;
    const { data: links } = await supabaseClient.from("email_thread_entity_links").select("entity_type, entity_id").eq("email_thread_id", threadId);
    const stripToken = (t: string) => t.replace(/\s*\[[A-HJ-NP-Z2-9]{10}\]/g, "");
    const subject = `Fwd: ${stripToken(head?.subject ?? "").replace(/^(fwd?|aw|wg|re):\s*/i, "")}`;
    const { id, error } = await createNewEmailDraft(identity.id, { links: (links as any[]) ?? [], subject, mailboxId: head?.mailbox_id });
    if (error || !id) {
      message.error(error ?? "Could not start the forward");
      return;
    }
    const body = stripToken(m.body_html ?? `<p>${(m.body_text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`);
    await supabaseClient
      .from("email_thread_drafts")
      .update({
        body_html: `<p></p><p>---------- Forwarded message ----------<br>From: ${m.from_display_name ?? m.from_address} &lt;${m.from_address}&gt;<br>Date: ${formatDateTime(m.sent_at)}<br>Subject: ${stripToken(head?.subject ?? "")}</p>${body}`,
      })
      .eq("id", id);
    const files = (attachmentsByMessage[m.id] ?? []).filter((a) => !a.is_inline);
    const copied = await copyAttachmentsToDraft(id, files, identity.id);
    if (copied.error) message.warning(`Forwarded without the files: ${copied.error}`);
    onOpenDraft?.(id);
  };

  // "I'll take it": an unassigned thread becomes mine (the follower row follows by trigger).
  const takeOver = async () => {
    if (!identity?.id) return;
    const { error } = await supabaseClient
      .from("email_threads")
      .update({ responsible_user_id: identity.id, responsible_assigned_at: new Date().toISOString(), responsible_assigned_by_user_id: identity.id })
      .eq("id", threadId)
      .is("responsible_user_id", null);
    if (error) {
      message.error(errorText(error));
      return;
    }
    await load();
    onChanged?.();
  };

  const sendReply = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSending(true);
    try {
      const { data, error } = await supabaseClient.functions.invoke("compose-email", {
        body: { thread_id: threadId, to: splitAddresses(to), cc: splitAddresses(cc), body_html: replyHtml + (signatureHtml ? `<br>${signatureHtml}` : "") },
      });
      const serverMessage = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => undefined);
      if (error || !data?.ok) throw new Error(data?.error ?? serverMessage ?? error?.message ?? "Could not send the reply");
      if (data.warning) message.warning(data.warning);
      setReplyHtml("");
      setCc("");
      setDraft(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      message.error(errorText(e, "Could not send the reply"));
    } finally {
      setSending(false);
    }
  };

  // An internal note: a message of the thread's own conversation (created by the first note).
  if (loading) return <Spin style={{ margin: 32 }} />;
  if (!head) return <Alert type="warning" showIcon style={{ margin: 16 }} message="This thread is not available to you" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Typography.Text strong>{head.subject || "(no subject)"}</Typography.Text>
            <Space size={6} wrap>
            <FollowToggle targetType="email_threads" targetId={threadId} />
            {head.status === "closed" || head.status === "spam" ? (
              <Button size="small" onClick={() => setStatus("open")}>
                Reopen
              </Button>
            ) : (
              <>
                <Button size="small" onClick={() => close(false)}>
                  Close
                </Button>
                {onClosed && (
                  <Button size="small" type="primary" onClick={() => close(true)}>
                    Close &amp; next
                  </Button>
                )}
              </>
            )}
            <Select
              size="small"
              value={head.status}
              style={{ width: 110 }}
              onChange={setStatus}
              options={["open", "pending", "closed", "spam"].map((v) => ({ value: v, label: v }))}
            />
            </Space>
          </Space>
          <Space wrap>
            {head.responsible_user_id ? (
              <Tag>Assigned to {displayName(head.responsible)}</Tag>
            ) : (
              <>
                <Tag color="orange">Unassigned</Tag>
                <Button size="small" type="primary" onClick={takeOver}>
                  I'll take it
                </Button>
              </>
            )}
          </Space>
          <EmailThreadLinks threadId={threadId} />
        </Space>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 16px", background: token.colorBgLayout }}>
        {timeline.length === 0 && <Typography.Text type="secondary">No messages yet</Typography.Text>}
        {timeline.map((item) =>
          item.kind === "email" ? (
            <div key={`e${item.email.id}`} style={{ display: "flex", justifyContent: item.email.direction === "outbound" ? "flex-end" : "flex-start", margin: "12px 0" }}>
              <div style={{ display: "flex", gap: 8, maxWidth: "94%", minWidth: 0, flexDirection: item.email.direction === "outbound" ? "row-reverse" : "row" }}>
                <Avatar
                  size={32}
                  style={{ flexShrink: 0, background: item.email.direction === "outbound" ? token.colorPrimary : token.colorFillSecondary, color: item.email.direction === "outbound" ? "#fff" : token.colorText }}
                >
                  {senderInitials(item.email.from_display_name ?? item.email.from_address)}
                </Avatar>
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    border: `1px solid ${item.email.direction === "outbound" ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: token.colorBgContainer,
                    boxShadow: token.boxShadowTertiary,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 6,
                      padding: "8px 12px",
                      background: item.email.direction === "outbound" ? token.colorPrimaryBg : token.colorFillQuaternary,
                    }}
                  >
                    <Typography.Text strong>{item.email.from_display_name ?? item.email.from_address}</Typography.Text>
                    {item.email.direction === "outbound" && <Tag color="blue" style={{ margin: 0 }}>sent</Tag>}
                    {item.email.send_status === "failed" && <Tag color="error" style={{ margin: 0 }}>failed</Tag>}
                    <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>{formatDateTime(item.email.sent_at)}</Typography.Text>
                  </div>
                  <div style={{ padding: "4px 12px 0" }}>
                    {item.email.body_html ? (
                      <iframe
                        title={item.email.id}
                        sandbox=""
                        srcDoc={inlineHtml[item.email.id] ?? item.email.body_html}
                        style={{ width: "100%", minHeight: 80, border: "none", background: "#fff", borderRadius: 6 }}
                        onLoad={(e) => {
                          const h = (e.target as HTMLIFrameElement).contentDocument?.body?.scrollHeight;
                          if (h) (e.target as HTMLIFrameElement).style.height = `${h + 16}px`;
                        }}
                      />
                    ) : (
                      <div style={{ whiteSpace: "pre-wrap", padding: "8px 0", overflowWrap: "anywhere" }}>{item.email.body_text}</div>
                    )}
                    <MessageAttachments attachments={attachmentsByMessage[item.email.id] ?? []} />
                  </div>
                  <div style={{ padding: "0 8px 6px" }}>
                    <Button size="small" type="text" icon={<ShareAltOutlined />} onClick={() => forward(item.email)}>
                      Forward
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div key={`n${item.note.id}`} className="chat-row" style={{ margin: "12px auto", maxWidth: "88%", padding: "8px 12px", background: token.colorWarningBg, border: `1px solid ${token.colorWarningBorder}`, borderRadius: 12 }}>
              <Space>
                <LockOutlined />
                <Typography.Text strong>{displayName(item.note.users)}</Typography.Text>
                <Tag color="warning">internal</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(item.note.created_at)}</Typography.Text>
              </Space>
              <MessageBody body={item.note.body} />
              {(noteFiles[item.note.id] ?? []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {noteFiles[item.note.id].map((f) => <FileLink key={f.id} path={f.storage_path} name={f.file_name} mimeType={f.mime_type} />)}
                </div>
              )}
              <ColumnReactions messageId={item.note.id} column={item.note.reactions as ReactionColumn} />
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
        <Tabs
          size="small"
          activeKey={tab}
          onChange={(k) => setTab(k as "reply" | "note")}
          items={[
            {
              key: "reply",
              label: "Reply",
              children: (
                lockedByOther ? (
                  <Alert type="info" showIcon message={`${writerLabel(draft?.locked_by ?? null)} is writing a reply to this thread`} description="The reply opens for you when they stop for two minutes." />
                ) : (
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Space wrap>
                      <Button size="small" icon={<UndoOutlined />} onClick={replyAll} disabled={!lastMessage}>
                        Reply all
                      </Button>
                      <Button size="small" onClick={insertQuote} disabled={!lastMessage}>
                        Insert quote
                      </Button>
                    </Space>
                    <Input
                      addonBefore="To"
                      value={to}
                      onChange={(e) => {
                        toTouchedRef.current = true;
                        setTo(e.target.value);
                        scheduleSave({ to: e.target.value });
                      }}
                    />
                    <Input
                      addonBefore="Cc"
                      value={cc}
                      onChange={(e) => {
                        setCc(e.target.value);
                        scheduleSave({ cc: e.target.value });
                      }}
                    />
                    <RichTextEditor
                      variant="email"
                      value={replyHtml}
                      onChange={(html) => {
                        setReplyHtml(html);
                        scheduleSave({ html });
                      }}
                      // What the editor makes of a value set from outside (the quote) is what is sent.
                      onNormalize={(html, raw) => {
                        setReplyHtml(html);
                        setQuoteHtml((q) => (q === raw ? html : q));
                      }}
                      minHeight={100}
                    />
                    <DraftAttachments draftId={draft?.id ?? null} getDraftId={ensureDraft} />
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      loading={sending}
                      disabled={!replyHtml.trim() || replyHtml === quoteHtml || !to.trim()}
                      onClick={sendReply}
                      block
                    >
                      Send reply
                    </Button>
                  </Space>
                )
              ),
            },
            {
              key: "note",
              label: (
                <span>
                  <LockOutlined /> Internal note
                </span>
              ),
              children: (
                <Space direction="vertical" style={{ width: "100%" }}>
                  <Typography.Text type="secondary">
                    <LockOutlined /> Only the members of this mailbox see this. Type @ to mention someone.
                  </Typography.Text>
                  <FeedComposer key={threadId} entityType="email_threads" entityId={threadId} onSent={() => void load()} />
                </Space>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
