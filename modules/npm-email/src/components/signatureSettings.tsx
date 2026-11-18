// Profile card "Email signature", taken over from NPM's profile page (app/src/pages/profile/index.tsx: loadSignature,
// saveSignature and the card). email_signatures stores html, the card edits plain text: escaping + newline-to-<br> is the
// only writer, so htmlToText only has to undo its own output. Shown through the core's profileSections.
import { useEffect, useState } from "react";
import { App as AntdApp, Button, Card, Form, Input, Typography } from "antd";
import { supabaseClient, errorText } from "@rbp/core";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textToHtml = (s: string) => escapeHtml(s).replace(/\n/g, "<br>");
const htmlToText = (html: string) =>
  html.replace(/<br\s*\/?>/gi, "\n").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

export const SignatureSettings = ({ userId }: { userId: string }) => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void supabaseClient.from("email_signatures").select("new_message_html, reply_html").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        const row = data as { new_message_html: string | null; reply_html: string | null } | null;
        setNewMessage(row?.new_message_html ? htmlToText(row.new_message_html) : "");
        setReply(row?.reply_html ? htmlToText(row.reply_html) : "");
        setLoading(false);
      });
  }, [userId]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabaseClient.from("email_signatures").upsert(
        { user_id: userId, new_message_html: newMessage ? textToHtml(newMessage) : null, reply_html: reply ? textToHtml(reply) : null },
        { onConflict: "user_id" },
      );
      if (error) throw error;
      message.success("Signature saved");
    } catch (e) {
      message.error(errorText(e as Error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Email signature" size="small" style={{ marginBottom: 16 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        Seeded into a new outbound email or a reply when you start one - edit or remove it there before sending, this doesn't send
        anything itself.
      </Typography.Text>
      <Form layout="vertical">
        <Form.Item label="New message">
          <Input.TextArea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} rows={5} disabled={loading} />
        </Form.Item>
        <Form.Item label="Reply">
          <Input.TextArea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} disabled={loading} />
        </Form.Item>
        <Button type="primary" onClick={() => void save()} loading={saving} disabled={loading}>Save signature</Button>
      </Form>
    </Card>
  );
};
