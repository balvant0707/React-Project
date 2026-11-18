// Ported 1:1 from COMPASS (app/src/components/checklist/itemTicket.tsx).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { App as AntdApp, Button, Input, Modal, Select, Tag, Typography } from "antd";
import { AlertOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useHasModule } from "../../lib/modules";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { uploadAttachmentFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { useOutboxCount } from "../../hooks/useOutboxCount";
import { isDefect, type ChecklistItem } from "../../lib/checklists";
import { PRIORITIES } from "../../lib/domain";
import { TaskFormModal } from "../../pages/tasks/taskForm";
import type { ItemPhoto } from "./itemPhotos";
import { errorText } from "@rbp/core";

// A defect item: shows the linked ticket, or offers "Create ticket". Needs a connection (it creates a record); the
// photos of the item are copied onto the ticket so whoever repairs it sees them without access to the task.
// Platform: the ticket from a defect needs the tickets module.
export const ItemTicket = (props: Parameters<typeof ItemTicketInner>[0]) => (useHasModule("tickets") ? <ItemTicketInner {...props} /> : null);

const ItemTicketInner = ({ item, taskId, photos, canAct }: { item: ChecklistItem; taskId: string; photos: ItemPhoto[]; canAct: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const queued = useOutboxCount();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.label);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal");
  const [busy, setBusy] = useState(false);
  const [followUp, setFollowUp] = useState(false);
  const navigate = useNavigate();

  const { data: ticket } = useQuery({
    queryKey: ["ticket-ref", item.ticket_id],
    enabled: !!item.ticket_id,
    queryFn: async () => (await supabaseClient.from("tickets").select("id, ticket_number, status").eq("id", item.ticket_id!).maybeSingle()).data as { id: string; ticket_number: number; status: string } | null,
  });

  const { data: assetId = null } = useQuery({
    queryKey: ["task-asset", taskId],
    queryFn: async () => ((await supabaseClient.from("tasks").select("asset_id").eq("id", taskId).maybeSingle()).data?.asset_id ?? null) as string | null,
  });

  if (item.ticket_id) {
    return ticket ? (
      <Link to={`/tickets/${ticket.id}`}>
        <Tag icon={<AlertOutlined />} color="blue" style={{ cursor: "pointer", marginTop: 6 }}>{t("checklists.ticketTag", { number: ticket.ticket_number })}</Tag>
      </Link>
    ) : (
      <Tag icon={<AlertOutlined />} style={{ marginTop: 6 }}>{t("checklists.ticketExists")}</Tag>
    );
  }
  if (!isDefect(item) || !canAct) return null;

  const create = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabaseClient.rpc("checklist_item_create_ticket", { p_item_id: item.id, p_title: title, p_priority: priority });
      if (error) throw error;
      const ticketId = data as string;
      for (const photo of photos) {
        try {
          const { data: blob } = await supabaseClient.storage.from("attachments").download(photo.storage_path);
          if (!blob) continue;
          const uploaded = await uploadAttachmentFile("tickets", ticketId, new File([blob], photo.file_name, { type: blob.type }));
          await supabaseClient.from("attachments").insert({ entity_type: "tickets", entity_id: ticketId, ...uploaded });
        } catch {
          /* a photo that cannot be copied does not undo the ticket */
        }
      }
      setOpen(false);
      message.success(t("checklists.ticketCreated"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["task-checklists", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["feed", "tasks", taskId] }),
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
      ]);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const disabled = !navigator.onLine || queued > 0;
  return (
    <>
      <Button size="small" icon={<PlusOutlined />} disabled={disabled} title={disabled ? t("checklists.ticketNeedsConnection") : undefined} style={{ marginTop: 6, marginRight: 8 }} onClick={() => setFollowUp(true)}>
        {t("checklists.createFollowUp")}
      </Button>
      <TaskFormModal
        open={followUp}
        parent={{ id: taskId, asset_id: assetId }}
        initialTitle={item.label}
        onClose={() => setFollowUp(false)}
        onSaved={(id) => {
          setFollowUp(false);
          void queryClient.invalidateQueries({ queryKey: ["task-tree", taskId] });
          navigate(`/tasks/${id}`);
        }}
      />
      <Button size="small" icon={<AlertOutlined />} danger disabled={disabled} title={disabled ? t("checklists.ticketNeedsConnection") : undefined} style={{ marginTop: 6 }} onClick={() => { setTitle(item.label); setOpen(true); }}>
        {t("checklists.createTicket")}
      </Button>
      <Modal open={open} onCancel={() => setOpen(false)} onOk={create} confirmLoading={busy} title={t("checklists.createTicket")} okText={t("checklists.createTicketOk")} destroyOnClose>
        <Typography.Paragraph type="secondary">{t("checklists.createTicketHint")}</Typography.Paragraph>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} style={{ marginBottom: 12 }} />
        <Select value={priority} onChange={setPriority} style={{ width: "100%" }} options={PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
      </Modal>
    </>
  );
};
