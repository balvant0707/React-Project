// Ported 1:1 from the NPM tool (app/src/components/emailDraftPanel.tsx).
import { useCallback, useEffect, useRef, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { Alert, App as AntdApp, Button, Form, Input, Popconfirm, Select, Space, Spin, Tag, Typography, theme as antdTheme } from "antd";
import { DeleteOutlined, EditOutlined, SendOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { RichTextEditor, sanitizeSignatureHtml } from "@rbp/module-messaging/src/richText.tsx";
import { DraftAttachments } from "./emailAttachments";
import { loadMailboxOptions, splitAddresses, type MailboxOption } from "@rbp/module-offers/src/pages/specifications/availabilityPanel.tsx";
import { isLockedByOther, writerLabel, type DraftWriter, type EmailLink } from "../modules/email/drafts";
import { errorText } from "@rbp/core";

// A new email as a shared draft (email_thread_drafts without a thread, in a mailbox): saved while typing, locked to the
// writer for 2 minutes (the autosave is the heartbeat), shown in Notes to everybody who may use the mailbox with the
// name of whoever is writing. Send goes through the Edge Function compose-email (links = the records of the draft) and
// removes the draft; Discard deletes it.

type DraftRow = {
  id: string;
  mailbox_id: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_html: string | null;
  entity_links: EmailLink[];
  locked_by_user_id: string | null;
  locked_at: string | null;
  updated_at: string;
  locked_by: DraftWriter;
};

const SELECT =
  "id, mailbox_id, to_addresses, cc_addresses, subject, body_html, entity_links, locked_by_user_id, locked_at, updated_at, locked_by:users!email_thread_drafts_locked_by_user_id_fkey(name, email)";

export function EmailDraftPanel({
  draftId,
  onChanged,
  onSent,
  onDiscarded,
}: {
  draftId: string;
  onChanged?: () => void;
  onSent: (threadId: string | null) => void;
  onDiscarded: () => void;
}) {
  const { token } = antdTheme.useToken();
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [mailboxes, setMailboxes] = useState<MailboxOption[]>([]);
  const [signatureHtml, setSignatureHtml] = useState("");
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<DraftRow | null>(null);
  draftRef.current = draft;

  const apply = (d: DraftRow) => {
    setDraft(d);
    setMailboxId(d.mailbox_id);
    setTo(d.to_addresses.join(", "));
    setCc(d.cc_addresses.join(", "));
    setSubject(d.subject ?? "");
    setHtml(d.body_html ?? "");
  };

  const load = useCallback(async () => {
    const { data } = await supabaseClient.from("email_thread_drafts").select(SELECT).eq("id", draftId).maybeSingle();
    if (data) apply(data as unknown as DraftRow);
    else setDraft(null);
    setLoading(false);
  }, [draftId]);

  useEffect(() => {
    setLoading(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    load();
    loadMailboxOptions().then(setMailboxes);
  }, [load]);

  useEffect(() => {
    if (!identity?.id) return;
    supabaseClient
      .from("email_signatures")
      .select("new_message_html")
      .eq("user_id", identity.id)
      .maybeSingle()
      .then(({ data }) => setSignatureHtml(data?.new_message_html ?? ""));
  }, [identity?.id]);

  const lockedByOther = isLockedByOther(draft, identity?.id, now);

  // The clock moves while somebody else holds the lock (their lease lapses, then the fields open up), and their text is
  // re-read so the read-only view follows their typing.
  useEffect(() => {
    if (!lockedByOther) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      load();
    }, 5000);
    return () => clearInterval(timer);
  }, [lockedByOther, load]);

  const scheduleSave = (next: { mailbox?: string | null; to?: string; cc?: string; subject?: string; html?: string }) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!identity?.id || !draftRef.current) return;
      const { data, error } = await supabaseClient
        .from("email_thread_drafts")
        .update({
          mailbox_id: next.mailbox === undefined ? mailboxId : next.mailbox,
          to_addresses: splitAddresses(next.to ?? to),
          cc_addresses: splitAddresses(next.cc ?? cc),
          subject: next.subject ?? subject,
          body_html: next.html ?? html,
          updated_by_user_id: identity.id,
          locked_by_user_id: identity.id,
          locked_at: new Date().toISOString(),
        })
        .eq("id", draftRef.current.id)
        .select(SELECT)
        .single();
      if (error) {
        message.error(`Couldn't save the draft: ${error.message}`);
        // Probably somebody else holds the lock now: learn who, but keep the text typed here (load() would overwrite it).
        const { data: fresh } = await supabaseClient.from("email_thread_drafts").select(SELECT).eq("id", draftRef.current.id).maybeSingle();
        if (fresh) setDraft(fresh as unknown as DraftRow);
        return;
      }
      setDraft(data as unknown as DraftRow);
      onChanged?.();
    }, 600);
  };

  const send = async () => {
    if (!draft) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSending(true);
    try {
      const { data, error } = await supabaseClient.functions.invoke("compose-email", {
        body: {
          draft_id: draft.id,
          mailbox_id: mailboxId,
          to: splitAddresses(to),
          cc: splitAddresses(cc),
          subject,
          body_html: html + (signatureHtml ? `<br>${signatureHtml}` : ""),
          links: draft.entity_links,
        },
      });
      const serverMessage = await (error as any)?.context?.json?.().then((b: any) => b?.error).catch(() => undefined);
      if (error || !data?.ok) throw new Error(data?.error ?? serverMessage ?? error?.message ?? "Could not send the email");
      if (data.warning) message.warning(data.warning);
      else message.success("Email sent");
      onSent(data.email_thread_id ?? null);
    } catch (e: any) {
      message.error(errorText(e, "Could not send the email"));
    } finally {
      setSending(false);
    }
  };

  const discard = async () => {
    if (!draft) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const { error } = await supabaseClient.from("email_thread_drafts").delete().eq("id", draft.id);
    if (error) message.error(errorText(error));
    else onDiscarded();
  };

  if (loading) return <Spin style={{ margin: 32 }} />;
  if (!draft) return <Alert type="warning" showIcon style={{ margin: 16 }} message="This draft no longer exists (sent or discarded)" />;

  const noMailbox = mailboxes.length > 0 && !mailboxes.some((m) => m.connected);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
        <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
          <Space>
            <EditOutlined />
            <Typography.Text strong>New email</Typography.Text>
            <Tag color="gold">draft</Tag>
            {lockedByOther && <Tag color="processing">{writerLabel(draft.locked_by)} is writing</Tag>}
          </Space>
          <Popconfirm title="Discard this draft?" okText="Discard" onConfirm={discard} disabled={lockedByOther}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled={lockedByOther}>
              Discard
            </Button>
          </Popconfirm>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Last change {formatDateTime(draft.updated_at)}
        </Typography.Text>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        {lockedByOther && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`${writerLabel(draft.locked_by)} is writing this email right now`}
            description="You can read along; the draft opens for you when they stop for two minutes."
          />
        )}
        {noMailbox && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="No connected mailbox - ask an admin to connect one." />}
        <Form layout="vertical" component={false}>
          <Form.Item label="From mailbox">
            <Select
              value={mailboxId ?? undefined}
              disabled={lockedByOther}
              options={mailboxes.map((m) => ({ value: m.value, label: m.label, disabled: !m.connected }))}
              onChange={(v) => {
                setMailboxId(v);
                scheduleSave({ mailbox: v });
              }}
            />
          </Form.Item>
          <Form.Item label="To">
            <Input
              value={to}
              readOnly={lockedByOther}
              placeholder="name@example.com; second@example.com"
              onChange={(e) => {
                setTo(e.target.value);
                scheduleSave({ to: e.target.value });
              }}
            />
          </Form.Item>
          <Form.Item label="Cc">
            <Input
              value={cc}
              readOnly={lockedByOther}
              onChange={(e) => {
                setCc(e.target.value);
                scheduleSave({ cc: e.target.value });
              }}
            />
          </Form.Item>
          <Form.Item label="Subject">
            <Input
              value={subject}
              readOnly={lockedByOther}
              onChange={(e) => {
                setSubject(e.target.value);
                scheduleSave({ subject: e.target.value });
              }}
            />
          </Form.Item>
          <Form.Item label="Attachments">
            <DraftAttachments draftId={draft.id} getDraftId={async () => draft.id} disabled={lockedByOther} />
          </Form.Item>
          <Form.Item label="Text">
            {lockedByOther ? (
              <iframe
                title="Draft text"
                sandbox=""
                srcDoc={html}
                style={{ width: "100%", minHeight: 160, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: "#fff" }}
              />
            ) : (
              <RichTextEditor
                      variant="email"
                value={html}
                onChange={(v) => {
                  setHtml(v);
                  scheduleSave({ html: v });
                }}
                onNormalize={(v) => setHtml(v)}
              />
            )}
          </Form.Item>
        </Form>
        {signatureHtml && !lockedByOther && (
          <div style={{ color: "gray", fontSize: 12 }} dangerouslySetInnerHTML={{ __html: sanitizeSignatureHtml(signatureHtml) }} />
        )}
      </div>
      <div style={{ padding: 16, borderTop: `1px solid ${token.colorBorderSecondary}`, flexShrink: 0 }}>
        <Button
          type="primary"
          icon={<SendOutlined />}
          loading={sending}
          disabled={lockedByOther || !mailboxId || !to.trim() || !subject.trim() || !html.trim()}
          onClick={send}
          block
        >
          Send
        </Button>
      </div>
    </div>
  );
}
