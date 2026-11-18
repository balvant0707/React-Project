// Ported 1:1 from the NPM tool (app/src/components/responsibleHandover.tsx).
import { useEffect, useState } from "react";
import { useGetIdentity } from "@rbp/core";
import { App as AntdApp, Button, Form, Input, Modal, Select, Space, Tooltip, Typography } from "antd";
import { SwapOutlined, UserOutlined } from "@ant-design/icons";
import { supabaseClient } from "@rbp/core";

// The person who currently has an offer or order on their desk ("Responsible"), with the handover dialog.
// A handover goes through the rpc hand_over(): it changes the responsible person, posts a note on the record
// (Notes panel) and notifies the recipient. Only users who can edit the record can receive it.

const REASONS = ["Check availability", "Check prices", "Organise transport", "Prepare the order", "Cover for absence", "Other"];

type Candidate = { id: string; name: string | null; email: string };

export function ResponsibleHandover({
  entityType,
  entityId,
  responsibleUserId,
  onChanged,
  blockedReason,
}: {
  entityType: "specifications" | "orders";
  entityId: string;
  responsibleUserId: string | null | undefined;
  // Called after a successful handover; the page reloads the record.
  onChanged: () => void;
  // Set while the page cannot hand over (e.g. unsaved changes).
  blockedReason?: string;
}) {
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!responsibleUserId) {
      setName(null);
      return;
    }
    let cancelled = false;
    supabaseClient
      .from("users")
      .select("name, email")
      .eq("id", responsibleUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setName(data ? ((data as any).name ?? (data as any).email) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [responsibleUserId]);

  const submit = async (toUserId: string, reason: string, note?: string) => {
    setSaving(true);
    const { error } = await supabaseClient.rpc("hand_over", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_to_user_id: toUserId,
      p_reason: reason,
      p_note: note ?? null,
    });
    setSaving(false);
    if (error) {
      message.error(`Couldn't hand over: ${error.message}`);
      return false;
    }
    onChanged();
    return true;
  };

  const openDialog = async () => {
    form.resetFields();
    setOpen(true);
    const { data } = await supabaseClient.rpc("assignable_users", { p_entity_type: entityType, p_entity_id: entityId });
    setCandidates(((data ?? []) as Candidate[]).filter((c) => c.id !== responsibleUserId));
  };

  const mine = !!identity?.id && identity.id === responsibleUserId;

  return (
    <>
      <Space size={4} wrap>
        <Typography.Text type="secondary">
          <UserOutlined /> Responsible:
        </Typography.Text>
        <Typography.Text strong>{responsibleUserId ? (name ?? "...") : "Nobody"}</Typography.Text>
        <Tooltip title={blockedReason}>
          {/* A disabled button swallows hover; the span carries the tooltip. */}
          <span>
            {identity?.id && !mine && (
              <Button size="small" disabled={!!blockedReason} onClick={() => submit(identity.id, "Taken over")} loading={saving}>
                Take over
              </Button>
            )}{" "}
            <Button size="small" icon={<SwapOutlined />} disabled={!!blockedReason} onClick={openDialog}>
              Hand over
            </Button>
          </span>
        </Tooltip>
      </Space>
      <Modal
        title="Hand over"
        open={open}
        onCancel={() => setOpen(false)}
        okText="Hand over"
        confirmLoading={saving}
        onOk={async () => {
          const values = await form.validateFields();
          if (await submit(values.to_user_id, values.reason, values.note)) setOpen(false);
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Hand over to" name="to_user_id" rules={[{ required: true }]} extra="Everyone who can edit this record.">
            <Select
              showSearch
              optionFilterProp="label"
              options={candidates.map((c) => ({ value: c.id, label: c.name ?? c.email }))}
              placeholder="Select a colleague"
            />
          </Form.Item>
          <Form.Item label="Reason" name="reason" rules={[{ required: true }]}>
            <Select options={REASONS.map((r) => ({ value: r, label: r }))} />
          </Form.Item>
          <Form.Item label="Note" name="note" extra="Appears in the Notes of this record and in the recipient's notification.">
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
