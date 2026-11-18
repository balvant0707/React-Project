// Ported 1:1 from COMPASS (app/src/pages/admin/ticketQueues/list.tsx).
import { useState } from "react";
import { App as AntdApp, Button, Form, Input, InputNumber, Modal, Select, Switch, Table, Typography } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { List } from "@rbp/core";
import { supabaseClient } from "@rbp/core";
import { useTeams } from "@rbp/core";
import { useTicketQueues, type TicketQueue, type TicketTypeRow } from "@rbp/module-task-family/src/hooks/useTicketQueues.ts";
import { localName } from "@rbp/module-tasks/src/lib/masterData.ts";
import { errorText } from "@rbp/core";
import { TeamSearchSelect } from "@rbp/module-task-family/src/components/teamSearchSelect.tsx";
import { ColorSelect, IconSelect } from "@rbp/module-task-family/src/components/lookPickers.tsx";
import { DEFAULT_TICKET_QUEUE_ICON, IconTile, iconFor } from "@rbp/ui";

// Ticket queues = service desks (Maintenance, IT, ...). A queue owns its ticket types and its teams: the teams work the
// queue (the broad ticket rights count only there; none = every holder), ~/maintenance_tool/docs/permissions.md.
const KEY_RULE = { pattern: /^[a-z][a-z0-9_]*$/, message: "a-z, 0-9, _" };
// Platform (andon): the priorities a type may start its tickets with (tickets_priority_check).
const TYPE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const TicketQueueList = () => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { queues, types } = useTicketQueues();
  const { data: groups } = useTeams();
  const { data: queueTeams } = useQuery({
    queryKey: ["ticket-queue-teams"],
    queryFn: async () => ((await supabaseClient.from("ticket_queue_teams").select("queue_id, team_id")).data ?? []) as { queue_id: string; team_id: string }[],
  });
  const teamsOf = (queueId: string) => (queueTeams ?? []).filter((x) => x.queue_id === queueId).map((x) => x.team_id);
  const [queueForm] = Form.useForm<TicketQueue & { team_ids: string[] }>();
  const [typeForm] = Form.useForm<TicketTypeRow>();
  const [editingQueue, setEditingQueue] = useState<Partial<TicketQueue> | null>(null);
  const [editingType, setEditingType] = useState<Partial<TicketTypeRow> | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ticket-queues"] });
    queryClient.invalidateQueries({ queryKey: ["ticket-queue-teams"] });
  };

  const saveQueue = async () => {
    const v = await queueForm.validateFields().catch(() => null);
    if (!v || !editingQueue) return;
    const payload = {
      name: v.name.trim(),
      name_de: v.name_de.trim(),
      description: v.description?.trim() || null,
      open_to_everyone: !!v.open_to_everyone,
      icon: v.icon ?? null,
      color: v.color ?? null,
      default_team_id: v.default_team_id ?? null,
      sort_order: v.sort_order ?? 0,
      active: v.active,
    };
    const saved = editingQueue.id
      ? await supabaseClient.from("ticket_queues").update(payload).eq("id", editingQueue.id).select("id").single()
      : await supabaseClient.from("ticket_queues").insert({ ...payload, key: v.key }).select("id").single();
    if (saved.error) return message.error(errorText(saved.error));
    const queueId = saved.data.id as string;
    const teamIds: string[] = v.team_ids ?? [];
    const wasIds = teamsOf(queueId);
    const removed = wasIds.filter((id) => !teamIds.includes(id));
    const added = teamIds.filter((id) => !wasIds.includes(id));
    if (removed.length) {
      const { error } = await supabaseClient.from("ticket_queue_teams").delete().eq("queue_id", queueId).in("team_id", removed);
      if (error) return message.error(errorText(error));
    }
    if (added.length) {
      const { error } = await supabaseClient.from("ticket_queue_teams").insert(added.map((team_id) => ({ queue_id: queueId, team_id })));
      if (error) return message.error(errorText(error));
    }
    setEditingQueue(null);
    refresh();
  };

  const saveType = async () => {
    const v = await typeForm.validateFields().catch(() => null);
    if (!v || !editingType?.queue_id) return;
    const payload = {
      name: v.name.trim(),
      name_de: v.name_de.trim(),
      sort_order: v.sort_order ?? 0,
      active: v.active,
      // Platform (andon): kiosk fields of a type.
      group_key: v.group_key?.trim() || null,
      default_priority: v.default_priority ?? null,
      public_report: !!v.public_report,
    };
    const { error } = editingType.id
      ? await supabaseClient.from("ticket_types").update(payload).eq("id", editingType.id)
      : await supabaseClient.from("ticket_types").insert({ ...payload, queue_id: editingType.queue_id, key: v.key });
    if (error) return message.error(errorText(error));
    setEditingType(null);
    refresh();
  };

  const openQueue = (q: Partial<TicketQueue>) => {
    queueForm.resetFields();
    queueForm.setFieldsValue({ open_to_everyone: false, sort_order: (queues.at(-1)?.sort_order ?? 0) + 1, active: true, ...q, team_ids: q.id ? teamsOf(q.id) : [] });
    setEditingQueue(q);
  };
  const openType = (queueId: string, type?: TicketTypeRow) => {
    typeForm.resetFields();
    const inQueue = types.filter((x) => x.queue_id === queueId);
    typeForm.setFieldsValue({ sort_order: (inQueue.at(-1)?.sort_order ?? 0) + 1, active: true, ...type });
    setEditingType(type ?? { queue_id: queueId });
  };

  return (
    <List headerButtons={<Button type="primary" icon={<PlusOutlined />} onClick={() => openQueue({})}>{t("common.new")}</Button>}>
      <Typography.Paragraph type="secondary">{t("admin.ticketQueues.hint")}</Typography.Paragraph>
      <Table<TicketQueue>
        dataSource={queues}
        rowKey="id"
        pagination={false}
        expandable={{
          expandedRowRender: (q) => (
            <Table<TicketTypeRow>
              dataSource={types.filter((x) => x.queue_id === q.id)}
              rowKey="id"
              size="small"
              pagination={false}
              footer={() => <Button size="small" icon={<PlusOutlined />} onClick={() => openType(q.id)}>{t("admin.ticketQueues.addType")}</Button>}
            >
              <Table.Column dataIndex="name" title={t("fields.name")} render={(_, r: TicketTypeRow) => localName(r)} />
              <Table.Column dataIndex="key" title={t("fields.key")} />
              <Table.Column dataIndex="group_key" title={t("admin.ticketQueues.groupKey")} render={(v) => v ?? "—"} />
              <Table.Column dataIndex="default_priority" title={t("fields.priority")} render={(v) => (v ? t(`priority.${v}`) : "—")} />
              <Table.Column dataIndex="public_report" title={t("admin.ticketQueues.publicReport")} render={(v) => (v ? t("common.yes") : t("common.no"))} />
              <Table.Column dataIndex="active" title={t("fields.active")} render={(v) => (v ? t("common.yes") : t("common.no"))} />
              <Table.Column width={60} render={(_, r: TicketTypeRow) => <Button type="text" icon={<EditOutlined />} onClick={() => openType(q.id, r)} />} />
            </Table>
          ),
        }}
      >
        <Table.Column
          dataIndex="name"
          title={t("fields.name")}
          render={(_, r: TicketQueue) => (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <IconTile icon={iconFor(r.icon, DEFAULT_TICKET_QUEUE_ICON)} color={r.color} size={24} />
              {localName(r)}
            </span>
          )}
        />
        <Table.Column dataIndex="key" title={t("fields.key")} />
        <Table.Column
          title={t("admin.ticketQueues.teams")}
          render={(_, r: TicketQueue) => {
            const names = teamsOf(r.id).map((id) => groups?.find((g) => g.id === id)?.name).filter(Boolean);
            return names.length ? names.join(", ") : t("admin.ticketQueues.noTeams");
          }}
        />
        <Table.Column dataIndex="open_to_everyone" title={t("admin.ticketQueues.openToEveryone")} render={(v) => (v ? t("common.yes") : t("common.no"))} />
        <Table.Column dataIndex="default_team_id" title={t("admin.ticketQueues.defaultTeam")} render={(v) => groups?.find((g) => g.id === v)?.name ?? "—"} />
        <Table.Column dataIndex="active" title={t("fields.active")} render={(v) => (v ? t("common.yes") : t("common.no"))} />
        <Table.Column width={60} render={(_, r: TicketQueue) => <Button type="text" icon={<EditOutlined />} onClick={() => openQueue(r)} />} />
      </Table>

      <Modal open={!!editingQueue} title={editingQueue?.id ? t("common.edit") : t("common.new")} onCancel={() => setEditingQueue(null)} onOk={saveQueue} destroyOnClose>
        <Form form={queueForm} layout="vertical">
          <Form.Item name="key" label={t("fields.key")} rules={[{ required: true }, KEY_RULE]}>
            <Input disabled={!!editingQueue?.id} />
          </Form.Item>
          <Form.Item name="name" label={t("fields.nameEn")} rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name_de" label={t("fields.nameDe")} rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t("fields.description")}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: "flex", gap: 16 }}>
            <Form.Item name="icon" label={t("looks.icon")} style={{ flex: 1 }}>
              <IconSelect fallback={DEFAULT_TICKET_QUEUE_ICON} />
            </Form.Item>
            <Form.Item name="color" label={t("looks.color")} extra={t("looks.ticketQueueLooksHint")} style={{ flex: 1 }}>
              <ColorSelect />
            </Form.Item>
          </div>
          <Form.Item name="team_ids" label={t("admin.ticketQueues.teams")} extra={t("admin.ticketQueues.teamsHint")}>
            <Select mode="multiple" showSearch optionFilterProp="label" options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))} />
          </Form.Item>
          <Form.Item name="open_to_everyone" label={t("admin.ticketQueues.openToEveryone")} valuePropName="checked" extra={t("admin.ticketQueues.openToEveryoneHint")}>
            <Switch />
          </Form.Item>
          <Form.Item name="default_team_id" label={t("admin.ticketQueues.defaultTeam")} extra={t("admin.ticketQueues.defaultTeamHint")}>
            <TeamSearchSelect use="tasks" />
          </Form.Item>
          <Form.Item name="sort_order" label={t("fields.order")}>
            <InputNumber />
          </Form.Item>
          <Form.Item name="active" label={t("fields.active")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!editingType} title={editingType?.id ? t("common.edit") : t("common.new")} onCancel={() => setEditingType(null)} onOk={saveType} destroyOnClose>
        <Form form={typeForm} layout="vertical">
          <Form.Item name="key" label={t("fields.key")} rules={[{ required: true }, KEY_RULE]}>
            <Input disabled={!!editingType?.id} />
          </Form.Item>
          <Form.Item name="name" label={t("fields.nameEn")} rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name_de" label={t("fields.nameDe")} rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="group_key" label={t("admin.ticketQueues.groupKey")} extra={t("admin.ticketQueues.groupKeyHint")} rules={[KEY_RULE]}>
            <Input allowClear />
          </Form.Item>
          <Form.Item name="default_priority" label={t("admin.ticketQueues.defaultPriority")} extra={t("admin.ticketQueues.defaultPriorityHint")}>
            <Select allowClear options={TYPE_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))} />
          </Form.Item>
          <Form.Item name="public_report" label={t("admin.ticketQueues.publicReport")} valuePropName="checked" extra={t("admin.ticketQueues.publicReportHint")}>
            <Switch />
          </Form.Item>
          <Form.Item name="sort_order" label={t("fields.order")}>
            <InputNumber />
          </Form.Item>
          <Form.Item name="active" label={t("fields.active")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </List>
  );
};
