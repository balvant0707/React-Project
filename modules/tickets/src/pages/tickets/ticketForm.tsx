// Adapted from COMPASS (app/src/pages/tickets/ticketForm.tsx), ported; since 2026-11-14 hand-maintained
//. Changed: the queue (when the user may report in several) and the
// type are chosen on big buttons first, then the inputs; the title is optional (the type's name), the priority starts from the type
// (ticket_types.default_priority), the insert is createTicket (shared with the kiosk board). Files, pasting and shrinking as before.
import { postRecordMessage } from "@rbp/module-messaging/src/lib/messaging.ts";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { App as AntdApp, Button, Form, Input, Modal, Select, Tag, Typography } from "antd";
import { CloseOutlined, PaperClipOutlined } from "@ant-design/icons";
import { useGetIdentity } from "@rbp/core";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { PRIORITIES } from "@rbp/module-task-family/src/lib/domain.ts";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { AssetSelect } from "@rbp/module-task-family/src/components/assetSelect.tsx";
import { useTicketQueues } from "@rbp/module-task-family/src/hooks/useTicketQueues.ts";
import { usePermissions } from "@rbp/core";
import { uploadAttachmentFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { shrinkImage } from "@rbp/module-messaging/src/lib/image.ts";
import { errorText } from "@rbp/core";
import { DEFAULT_TICKET_QUEUE_ICON, IconTile, iconFor } from "@rbp/ui";
import { BigChoice } from "../../components/bigChoice";
import { createTicket } from "../../lib/createTicket";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type Values = { title?: string; description?: string; priority: string; asset_id?: string };

export const TicketFormModal = ({
  open,
  assetId,
  queueId: fixedQueueId,
  onClose,
  onSaved,
}: {
  open: boolean;
  assetId?: string | null;
  // Started for one queue (page "New request"): the queue is set and not offered.
  queueId?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const { data: identity } = useGetIdentity<{ id: string }>();
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm<Values>();
  const { creatable, typesOf } = useTicketQueues();
  const { hasAny } = usePermissions();
  const [queueId, setQueueId] = useState<string | undefined>();
  const [typeKey, setTypeKey] = useState<string | undefined>();
  const queue = creatable.find((q) => q.id === queueId);
  const types = typesOf(queueId);
  const type = types.find((x) => x.key === typeKey);

  // From an asset page the ticket is about that asset: Maintenance. Started for one queue, or with one queue to choose from, there is
  // nothing to pick; otherwise the first step is the queue.
  const startQueue = () =>
    creatable.find((q) => q.id === fixedQueueId)?.id ??
    (assetId ? creatable.find((q) => q.key === "maintenance")?.id : undefined) ??
    (creatable.length === 1 ? creatable[0].id : undefined);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setFiles([]);
    setQueueId(startQueue());
    setTypeKey(undefined);
    form.setFieldsValue({ priority: "normal", asset_id: assetId ?? undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assetId, fixedQueueId, form, creatable.length]);

  // A queue with one type has nothing to choose.
  useEffect(() => {
    if (queueId && !typeKey && types.length === 1) setTypeKey(types[0].key);
  }, [queueId, typeKey, types]);

  // The type sets the priority the ticket starts with; it stays changeable below.
  useEffect(() => {
    if (typeKey) form.setFieldValue("priority", types.find((x) => x.key === typeKey)?.default_priority ?? "normal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeKey]);

  const step = !queueId ? "queue" : !typeKey ? "type" : "inputs";
  const canChangeQueue = !fixedQueueId && !assetId && creatable.length > 1;
  const canChangeType = types.length > 1;

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter((f) => {
      if (f.size > MAX_FILE_BYTES) {
        message.warning(t("feed.fileTooLarge", { name: f.name }));
        return false;
      }
      return true;
    });
    if (accepted.length) setFiles((prev) => [...prev, ...accepted]);
  };

  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !queueId || !type) return;
    let data: { id: string };
    try {
      data = await createTicket({
        queueId,
        type: type.key,
        assetId: v.asset_id,
        title: v.title?.trim() || localName(type),
        description: v.description,
        priority: v.priority,
      });
    } catch (error) {
      form.setFields([{ name: "title", errors: [errorText(error)] }]);
      return;
    }
    // The files go into one comment on the new ticket, like attachments of a comment on the feed.
    if (files.length && identity?.id) {
      const failed: string[] = [];
      let messageId: string | null = null;
      try {
        messageId = (await postRecordMessage("tickets", data.id, "")).messageId;
      } catch {
        failed.push(...files.map((f) => f.name));
      }
      if (messageId) {
        for (const file of files) {
          try {
            // Phone photos are several MB: shrink them like the public QR form does.
            const shrunk = await shrinkImage(file);
            const toSend = shrunk === file ? file : new File([shrunk], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
            const uploaded = await uploadAttachmentFile("tickets", data.id, toSend);
            const { error: attachError } = await supabaseClient.from("attachments").insert({
              entity_type: "tickets",
              entity_id: data.id,
              message_id: messageId,
              uploaded_by_user_id: identity.id,
              ...uploaded,
            });
            if (attachError) throw attachError;
          } catch {
            failed.push(file.name);
          }
        }
      }
      if (failed.length) message.error(t("feed.uploadFailed", { names: failed.join(", ") }));
    }
    onSaved(data.id);
  };

  // People who cannot see any asset (a requester) are not offered the asset field; from an asset page it stays.
  const showAsset = !!assetId || hasAny("assets.view.");

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      footer={step === "inputs" ? undefined : null}
      title={queue && (fixedQueueId || creatable.length > 1) ? `${t("tickets.new")} · ${localName(queue)}` : t("tickets.new")}
      destroyOnClose
    >
      {step === "queue" && (
        <>
          <Typography.Paragraph strong>{t("tickets.pickQueue")}</Typography.Paragraph>
          <BigChoice
            choices={creatable.map((q) => ({ key: q.id, label: localName(q), icon: <IconTile icon={iconFor(q.icon, DEFAULT_TICKET_QUEUE_ICON)} color={q.color} size={32} /> }))}
            onPick={setQueueId}
          />
        </>
      )}
      {step === "type" && (
        <>
          <Typography.Paragraph strong>{t("tickets.pickType")}</Typography.Paragraph>
          <BigChoice choices={types.map((x) => ({ key: x.key, label: localName(x), accent: x.default_priority }))} onPick={setTypeKey} />
          {canChangeQueue && (
            <Button type="link" style={{ paddingLeft: 0, marginTop: 12 }} onClick={() => setQueueId(undefined)}>
              {t("common.back")}
            </Button>
          )}
        </>
      )}
      <Form form={form} layout="vertical" style={{ display: step === "inputs" ? undefined : "none" }}>
        {step === "inputs" && type && (
          <div style={{ marginBottom: 16 }}>
            <Tag color="blue" style={{ fontSize: 14, padding: "2px 10px" }}>{localName(type)}</Tag>
            {canChangeType && (
              <Button type="link" size="small" onClick={() => setTypeKey(undefined)}>
                {t("tickets.change")}
              </Button>
            )}
          </div>
        )}
        <Form.Item name="title" label={t("tickets.titleOptional")} rules={[{ max: 200 }]}>
          <Input autoFocus placeholder={type ? localName(type) : undefined} />
        </Form.Item>
        <Form.Item name="description" label={t("fields.description")}>
          <Input.TextArea rows={4} onPaste={onPaste} />
        </Form.Item>
        <Form.Item extra={t("tickets.attachHint")}>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <Button size="small" icon={<PaperClipOutlined />} onClick={() => fileInput.current?.click()}>
            {t("feed.attach")}
          </Button>
          <div style={{ marginTop: 4 }}>
            {files.map((f, i) => (
              <Tag key={`${f.name}-${i}`} closable closeIcon={<CloseOutlined />} onClose={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                {f.name}
              </Tag>
            ))}
          </div>
        </Form.Item>
        {showAsset && (
          <Form.Item name="asset_id" label={t("fields.asset")} extra={t("tickets.assetOptional")}>
            <AssetSelect disabled={!!assetId} />
          </Form.Item>
        )}
        <Form.Item name="priority" label={t("fields.priority")}>
          <Select options={PRIORITIES.map((x) => ({ value: x, label: t(`priority.${x}`) }))} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
