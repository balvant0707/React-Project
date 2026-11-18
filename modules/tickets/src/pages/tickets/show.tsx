// Ported 1:1 from COMPASS (app/src/pages/tickets/show.tsx).
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert, App as AntdApp, Button, Empty, Form, Modal, DatePicker, Select, Space, Spin, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { supabaseClient } from "@rbp/core";
import { TICKET_STATUSES } from "@rbp/module-task-family/src/lib/domain.ts";
import { fetchCanEdit, fetchTicket } from "@rbp/module-task-family/src/lib/queries.ts";
import { pickName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { useMe } from "@rbp/core";
import { useTeamMembers } from "@rbp/core";
import { ActivityFeed } from "@rbp/module-messaging/src/feed/activityFeed.tsx";
import { RecordChatButton } from "@rbp/module-messaging/src/feed/recordChatButton.tsx";
import { useIsMobile } from "@rbp/ui";
import { FieldBar } from "@rbp/module-task-family/src/components/fieldBar.tsx";
import { AccessBadge } from "@rbp/module-task-family/src/components/accessBadge.tsx";
import { PriorityTag, StatusTag, TicketTypeTag } from "@rbp/module-tasks/src/components/tags.tsx";
import { AssigneeSelect, TeamSelect } from "@rbp/module-tasks/src/components/assigneeFields.tsx";
import { useDefaultTaskTypes, useTaskTypes } from "@rbp/module-task-family/src/pages/tasks/taskForm.tsx";
import { formatDateTime } from "@rbp/ui";
import { ActionBar } from "@rbp/module-task-family/src/components/actionBar.tsx";
import { errorText } from "@rbp/core";
import { usePageTitle } from "@rbp/core";

type ConvertValues = { task_type_id: string; team_id?: string | null; assigned_user_id?: string | null; due_date: dayjs.Dayjs; planned_date?: dayjs.Dayjs };

export const TicketShow = () => {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState(false);
  const dueTouched = useRef(false);
  const [form] = Form.useForm<ConvertValues>();
  const teamId = Form.useWatch("team_id", form);
  const { data: taskTypes } = useTaskTypes(true, true);
  const { pickDefaultType } = useDefaultTaskTypes();
  const { userId } = useMe();
  // Team starts with the type's default team; the signed-in user is the person when the type has no default team or
  // they are a member of it. Once touched, a change of the type no longer overwrites them.
  const typeId = Form.useWatch("task_type_id", form);
  const defaultTeamId = taskTypes?.find((x) => x.id === typeId)?.default_team_id ?? null;
  const { data: members } = useTeamMembers();
  const inDefaultTeam = !!defaultTeamId && !!members?.some((m) => m.team_id === defaultTeamId && m.user_id === userId);
  const ownerTouched = useRef(false);
  useEffect(() => {
    if (converting && !ownerTouched.current && typeId) form.setFieldsValue({ team_id: defaultTeamId ?? undefined, assigned_user_id: !defaultTeamId || inDefaultTeam ? userId : undefined });
  }, [converting, typeId, defaultTeamId, inDefaultTeam, userId, form]);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => fetchTicket(id),
  });

  usePageTitle(ticket ? `${ticket.title} (#${ticket.ticket_number})` : undefined);

  // Editing the ticket needs edit rights; a requester can only write notes: read it and answer in the feed.
  const { data: canEdit } = useQuery({ queryKey: ["can-edit", "tickets", id], queryFn: () => fetchCanEdit("tickets", id) });
  const { data: canWriteNotes } = useQuery({
    queryKey: ["can-write-notes", "tickets", id],
    queryFn: async () => (await supabaseClient.rpc("can_access_entity", { p_entity_type: "tickets", p_entity_id: id, p_grant_type: "write_notes" })).data === true,
  });

  if (isLoading) return <Spin />;
  if (!ticket) return <Empty description={t("common.notFound")} />;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ticket", id] });

  const update = async (patch: Partial<{ status: string; assigned_user_id: string | null; assigned_team_id: string | null; priority: string }>) => {
    const { error } = await supabaseClient.from("tickets").update(patch).eq("id", id);
    if (error) message.error(errorText(error));
    await refresh();
    await queryClient.invalidateQueries({ queryKey: ["feed", "tickets", id] });
  };

  // The due date starts with the default of the task type and follows a change of the type until the user sets it.
  const fillDefaultDue = async (typeId?: string) => {
    if (!typeId) return;
    const { data } = await supabaseClient.rpc("default_due_date", { p_task_type_id: typeId });
    if (data && !dueTouched.current) form.setFieldValue("due_date", dayjs(data as string));
  };

  const convert = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const { data, error } = await supabaseClient.rpc("ticket_convert_to_task", {
      p_ticket_id: id,
      p_task_type_id: v.task_type_id,
      p_due_date: v.due_date.format("YYYY-MM-DD"),
      p_team_id: v.team_id ?? null,
      p_assigned_user_id: v.assigned_user_id ?? null,
      p_planned_date: v.planned_date ? v.planned_date.format("YYYY-MM-DD") : null,
    });
    if (error) {
      message.error(errorText(error));
      return;
    }
    setConverting(false);
    navigate(`/tasks/${(data as { id: string }).id}`);
  };

  const canConvert = !ticket.task_id && ticket.status !== "closed";

  const details = (
    <>
      {ticket.status === "waiting_for_requester" && ticket.reporter_user_id === userId && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t("tickets.waitingForYou")} />
      )}
      {ticket.source === "qr_public" && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t("tickets.fromPublicForm")} />}

      <FieldBar
        fields={[
          { label: t("fields.asset"), value: ticket.asset_id ? <Link to={`/assets/${ticket.asset_id}`}>{ticket.asset_name}</Link> : t("tickets.noAsset") },
          { label: t("tickets.queue"), value: pickName(ticket.queue_name, ticket.queue_name_de) },
          { label: t("fields.type"), value: <TicketTypeTag type={ticket.type} name={ticket.type_name} nameDe={ticket.type_name_de} /> },
          { label: t("fields.priority"), value: <PriorityTag priority={ticket.priority} /> },
          { label: t("fields.reporter"), value: ticket.reporter_display_name ?? "—" },
          { label: t("fields.contact"), value: ticket.reporter_contact, hidden: !ticket.reporter_contact },
          {
            label: t("fields.team"),
            value: canEdit ? <TeamSelect value={ticket.assigned_team_id} onChange={(v) => update({ assigned_team_id: v })} style={{ width: 160 }} /> : (ticket.assigned_team_name ?? "—"),
          },
          {
            label: t("fields.assignee"),
            value: canEdit ? <AssigneeSelect teamId={ticket.assigned_team_id} value={ticket.assigned_user_id} onChange={(v) => update({ assigned_user_id: v })} style={{ width: 180 }} /> : (ticket.assigned_user_name ?? "—"),
          },
          { label: t("fields.createdAt"), value: formatDateTime(ticket.created_at) },
          { label: t("recordAccess.field"), value: <AccessBadge entityType="tickets" id={ticket.id} /> },
        ]}
      />
      {ticket.description && (
        <Typography.Paragraph style={{ whiteSpace: "pre-wrap", marginTop: 16 }}>{ticket.description}</Typography.Paragraph>
      )}
    </>
  );

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Link to="/tickets">{t("nav.tickets")}</Link>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <Space align="center" size={12} wrap>
          <Typography.Title level={3} style={{ margin: 0 }}>
            #{ticket.ticket_number} {ticket.title}
          </Typography.Title>
          <StatusTag status={ticket.status} />
          {isMobile && <RecordChatButton entityType="tickets" entityId={ticket.id} title={`#${ticket.ticket_number} ${ticket.title}`} />}
        </Space>
        {canEdit && <ActionBar back="/tickets">
          {ticket.task_id ? (
            <Button onClick={() => navigate(`/tasks/${ticket.task_id}`)}>{t("tickets.openTask", { number: ticket.task_number })}</Button>
          ) : (
            <Button
              type="primary"
              disabled={!canConvert}
              onClick={() => {
                form.resetFields();
                const typeId = pickDefaultType(taskTypes ?? [], !!ticket.asset_id)?.id;
                dueTouched.current = false;
                ownerTouched.current = false;
                form.setFieldsValue({ task_type_id: typeId });
                setConverting(true);
                void fillDefaultDue(typeId);
              }}
            >
              {t("tickets.convert")}
            </Button>
          )}
          <Select
            value={ticket.status}
            style={{ minWidth: 170 }}
            onChange={(status) => update({ status })}
            options={TICKET_STATUSES.filter((s) => s !== "converted_to_task" || ticket.status === s).map((s) => ({ value: s, label: t(`status.${s}`) }))}
          />
        </ActionBar>}
      </div>

      {details}
      {/* Phone: the chat button opens the conversation in the Messages module. */}
      {!isMobile && (
        <div style={{ marginTop: 24 }}>
          <ActivityFeed entityType="tickets" entityId={ticket.id} canComment={canWriteNotes ?? false} />
        </div>
      )}

      <Modal open={converting} onCancel={() => setConverting(false)} onOk={convert} title={t("tickets.convert")} destroyOnClose>
        <Typography.Paragraph type="secondary">{t("tickets.convertHint")}</Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="task_type_id" label={t("fields.taskType")} rules={[{ required: true }]}>
            <Select onChange={(v) => void fillDefaultDue(v)} options={(taskTypes ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          </Form.Item>
          <Form.Item name="team_id" label={t("fields.team")}>
            <TeamSelect onChange={() => { ownerTouched.current = true; form.setFieldValue("assigned_user_id", undefined); }} />
          </Form.Item>
          <Form.Item
            name="assigned_user_id"
            label={t("fields.assignee")}
            dependencies={["team_id"]}
            rules={[({ getFieldValue }) => ({ validator: (_, value) => (getFieldValue("team_id") || value ? Promise.resolve() : Promise.reject(new Error(t("tasks.needsTeamOrPerson")))) })]}
          >
            <AssigneeSelect teamId={teamId} onChange={() => { ownerTouched.current = true; }} />
          </Form.Item>
          <Form.Item name="due_date" label={t("fields.dueDate")} rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} onChange={() => { dueTouched.current = true; }} />
          </Form.Item>
          <Form.Item name="planned_date" label={t("fields.plannedDate")}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
