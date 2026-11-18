// Ported 1:1 from the NPM tool (app/src/components/entityEmailsPanel.tsx).
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGetIdentity } from "@rbp/core";
import { Alert, App as AntdApp, Button, Dropdown, Empty, List, Space, Tag, Typography } from "antd";
import { DownOutlined, MailOutlined, PlusOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";
import { formatDateTime } from "@rbp/ui";
import { startDocumentEmail } from "../modules/email/documentEmail";

// The email conversations of a record: the threads linked to the offer or to any of its orders (the offer and its
// orders share them, rpc email_record_threads) plus a button to start a new one (a shared draft in Notes). Visibility is the mailbox's (row
// level security), so a user outside the sending mailbox sees an empty list. A row opens the thread in Notes (/inbox), where
// it can be answered. Reloads on focus and every 30 s so a reply that arrives shows up.

type ThreadRow = {
  email_thread_id: string;
  subject: string | null;
  status: string;
  last_message_at: string | null;
  last_direction: "inbound" | "outbound" | null;
  last_from: string | null;
};

export function EntityEmailsPanel({
  entityType,
  entityId,
  canEdit,
  contactCompanyId,
  subjectHint,
  documents,
}: {
  entityType: "specifications" | "orders";
  entityId: string;
  canEdit?: boolean;
  // The company whose email address prefills the recipient (the supplier of the deal).
  contactCompanyId?: string | null;
  // Prefills the subject, e.g. the specification or order number.
  subjectHint?: string | null;
  // PDFs of the record that can start the email as an attachment (built from the page when chosen).
  documents?: { key: string; label: string; build: () => Promise<{ blob: Blob; filename: string }> }[];
}) {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [rows, setRows] = useState<ThreadRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [contactEmail, setContactEmail] = useState("");

  const load = useCallback(
    () =>
      supabaseClient.rpc("email_record_threads", { p_entity_type: entityType, p_entity_id: entityId }).then(({ data, error }) => {
        setFailed(!!error);
        if (!error) setRows((data as ThreadRow[]) ?? []);
      }),
    [entityType, entityId],
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  useEffect(() => {
    if (!contactCompanyId) {
      setContactEmail("");
      return;
    }
    supabaseClient.from("companies").select("email").eq("id", contactCompanyId).maybeSingle().then(({ data }) => setContactEmail(data?.email ?? ""));
  }, [contactCompanyId]);

  // A new conversation about this record starts as a shared draft in Notes (saved, lockable, linked to the record).
  const newEmail = async (document?: NonNullable<typeof documents>[number]) => {
    if (!identity?.id) return;
    const result = await startDocumentEmail({
      userId: identity.id,
      link: { entity_type: entityType, entity_id: entityId },
      to: contactEmail ? [contactEmail] : [],
      subject: subjectHint ?? "",
      document,
    });
    if (result.error || !result.draftId) {
      message.error(result.error ?? "Could not start the email");
      return;
    }
    if (result.warning) message.warning(result.warning);
    navigate(`/inbox?draft=${result.draftId}`);
  };

  return (
    <>
      <Space style={{ marginBottom: 8 }}>
        {documents && documents.length > 0 ? (
          <Dropdown.Button
            icon={<DownOutlined />}
            disabled={!canEdit}
            onClick={() => newEmail()}
            menu={{ items: documents.map((d) => ({ key: d.key, label: `New email with ${d.label}`, onClick: () => newEmail(d) })) }}
          >
            <PlusOutlined /> New email
          </Dropdown.Button>
        ) : (
          <Button icon={<PlusOutlined />} disabled={!canEdit} onClick={() => newEmail()}>
            New email
          </Button>
        )}
      </Space>
      {failed ? (
        <Alert type="error" showIcon message="The emails of this record could not be loaded" />
      ) : rows === null ? null : rows.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No emails linked to this record" />
      ) : (
        <List
          size="small"
          dataSource={rows}
          renderItem={(r) => (
            <List.Item extra={<Tag color={r.last_direction === "inbound" ? "green" : undefined}>{r.last_direction === "inbound" ? "reply" : r.status}</Tag>}>
              <List.Item.Meta
                avatar={<MailOutlined />}
                title={<Link to={`/inbox?thread=${r.email_thread_id}`}>{r.subject || "(no subject)"}</Link>}
                description={
                  <Typography.Text type="secondary">
                    {formatDateTime(r.last_message_at)}
                    {r.last_direction === "inbound" && r.last_from ? ` - from ${r.last_from}` : ""}
                  </Typography.Text>
                }
              />
            </List.Item>
          )}
        />
      )}
    </>
  );
}
