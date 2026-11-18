// Ported 1:1 from COMPASS (app/src/components/holderPeriods.tsx).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, DatePicker, Empty, Form, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import dayjs, { type Dayjs } from "dayjs";
import { supabaseClient } from "@rbp/core";
import { uploadAttachmentFile } from "@rbp/module-messaging/src/hooks/useSignedUrl.ts";
import { usersFor, useUserMap } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { useAppointmentLetters, useHolderPeriods, usePositionAccess, usePositionsRefresh } from "../hooks/usePositions";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { PERIOD_COLOR, periodState, type AppointmentLetter, type HolderPeriod, type PositionKind } from "../lib/positions";
import { errorText } from "@rbp/core";
import { formatDate } from "@rbp/ui";
import { FileLink } from "@rbp/module-messaging/src/fileLink.tsx";

// Errors raised by the position_holders triggers (migration 20261216120000_position_appointments.sql).
export const HOLDER_ERRORS = {
  position_holder_has_letter: "positions.errors.hasLetter",
  appointment_without_teams: "positions.errors.appointmentWithoutTeams",
};

type Values = { user_id?: string; valid_from: Dayjs; valid_to?: Dayjs | null; appointed_by_user_id?: string | null };

// Add a person to a position for a period, or change a period (dates, who appointed). Person and position of a period
// never change: end it and add a new one.
const HolderPeriodModal = ({ open, positionId, kind, period, onClose }: { open: boolean; positionId: string; kind: PositionKind; period: HolderPeriod | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const { data: people } = usePeople();
  const refresh = usePositionsRefresh();
  const appointment = kind === "appointment";

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      user_id: period?.user_id,
      valid_from: period ? dayjs(period.valid_from) : dayjs(),
      valid_to: period?.valid_to ? dayjs(period.valid_to) : null,
      appointed_by_user_id: period?.appointed_by_user_id ?? null,
    });
    // Keyed on the id: a refetch while the dialog is open gives the row a new identity and must not reset the edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period?.id, form]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const row = {
        valid_from: v.valid_from.format("YYYY-MM-DD"),
        valid_to: v.valid_to ? v.valid_to.format("YYYY-MM-DD") : null,
        // A job has no "appointed by" field; keep what an earlier appointment recorded.
        appointed_by_user_id: appointment ? v.appointed_by_user_id ?? null : period?.appointed_by_user_id ?? null,
      };
      const { error } = period
        ? await supabaseClient.from("position_holders").update(row).eq("id", period.id)
        : await supabaseClient.from("position_holders").insert({ ...row, position_id: positionId, user_id: v.user_id });
      if (error) throw error;
      refresh();
      onClose();
    } catch (e) {
      message.error(errorText(e, { known: HOLDER_ERRORS }));
    } finally {
      setSaving(false);
    }
  };

  const active = (people ?? []).filter((p) => !p.has_left);
  // Whoever signed stays selectable after leaving.
  const signers = (people ?? []).filter((p) => !p.has_left || p.id === period?.appointed_by_user_id);
  const options = (list: typeof active) => list.map((p) => ({ value: p.id, label: personName(p) }));
  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      destroyOnClose
      title={period ? t("positions.periods.edit") : appointment ? t("positions.periods.appoint") : t("positions.addHolder")}
      okText={t("common.save")}
      cancelText={t("common.cancel")}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="user_id" label={t("positions.person")} rules={[{ required: !period }]}>
          <Select showSearch optionFilterProp="label" disabled={!!period} options={options(active)} />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", columnGap: 16 }}>
          <Form.Item name="valid_from" label={t("positions.periods.from")} rules={[{ required: true }]} extra={t("positions.periods.fromHint")}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="valid_to"
            label={t("positions.periods.to")}
            extra={t("positions.periods.toHint")}
            dependencies={["valid_from"]}
            rules={[({ getFieldValue }) => ({
              validator: (_, value: Dayjs | null) => (!value || !getFieldValue("valid_from") || !value.isBefore(getFieldValue("valid_from"), "day") ? Promise.resolve() : Promise.reject(new Error(t("positions.periods.toBeforeFrom")))),
            })]}
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </div>
        {appointment && (
          <Form.Item name="appointed_by_user_id" label={t("positions.periods.appointedBy")} extra={t("positions.periods.appointedByHint")}>
            <Select showSearch allowClear optionFilterProp="label" options={options(usersFor(signers, period?.appointed_by_user_id))} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

type Letter = AppointmentLetter;

// "01.03.2022 – open-ended" for a period (log entries without a period, i.e. the team route, give "").
export function periodLabel(t: (key: string) => string, from: string | null, to: string | null) {
  if (!from) return "";
  return `${formatDate(from)} – ${to ? formatDate(to) : t("positions.periods.openEnded")}`;
}

// The appointment letters of one period: links, plus upload and delete for whoever manages positions. The letters are
// loaded once for all rows (useAppointmentLetters) and handed in.
export const AppointmentLetters = ({ holderId, letters, canManage }: { holderId: string; letters: Letter[]; canManage: boolean }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const refresh = usePositionsRefresh();

  const add = async (file: File) => {
    try {
      const uploaded = await uploadAttachmentFile("position_holders", holderId, file);
      const { error } = await supabaseClient.from("attachments").insert({ entity_type: "position_holders", entity_id: holderId, ...uploaded });
      if (error) throw error;
      refresh();
    } catch (e) {
      message.error(errorText(e));
    }
    return false;
  };
  const remove = async (letter: Letter) => {
    const { error, count } = await supabaseClient.from("attachments").delete({ count: "exact" }).eq("id", letter.id);
    if (error || !count) return void message.error(error ? errorText(error) : t("errors.forbidden"));
    await supabaseClient.storage.from("attachments").remove([letter.storage_path]);
    refresh();
  };

  return (
    <Space size={[8, 4]} wrap>
      {letters.map((l) => (
        <span key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
          <FileLink path={l.storage_path} name={l.file_name} mimeType={l.mime_type} />
          {canManage && (
            <Popconfirm title={t("positions.periods.deleteLetter")} onConfirm={() => remove(l)} okText={t("common.yes")} cancelText={t("common.no")}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} />
            </Popconfirm>
          )}
        </span>
      ))}
      {canManage && (
        <Upload beforeUpload={add} showUploadList={false}>
          <a><UploadOutlined /> {t("positions.periods.addLetter")}</a>
        </Upload>
      )}
    </Space>
  );
};

// All direct periods of a position (current, planned, ended), with add / change / delete for whoever manages positions.
export const HolderPeriods = ({ positionId, kind }: { positionId: string; kind: PositionKind }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const access = usePositionAccess();
  const refresh = usePositionsRefresh();
  const users = useUserMap();
  const { data: periods } = useHolderPeriods({ positionId });
  const { data: letters } = useAppointmentLetters(kind === "appointment" ? (periods ?? []).map((r) => r.id) : []);
  const [editing, setEditing] = useState<HolderPeriod | null | undefined>(undefined);
  const appointment = kind === "appointment";

  const remove = async (id: string) => {
    const { error } = await supabaseClient.from("position_holders").delete().eq("id", id);
    if (error) return void message.error(errorText(error, { known: HOLDER_ERRORS }));
    refresh();
  };
  const name = (id: string | null) => (id ? users.get(id)?.name ?? "—" : "—");

  return (
    <div>
      <Typography.Paragraph type="secondary">{appointment ? t("positions.periods.appointmentHint") : t("positions.periods.hint")}</Typography.Paragraph>
      {(periods ?? []).length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("positions.periods.none")} /> : (
        <Table<HolderPeriod>
          rowKey="id"
          size="small"
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          dataSource={periods}
          columns={[
            { title: t("positions.person"), render: (_: unknown, r) => <Link to={`/people/${r.user_id}`}>{name(r.user_id)}</Link> },
            { title: t("positions.periods.from"), dataIndex: "valid_from", render: (d: string) => formatDate(d), width: 120 },
            { title: t("positions.periods.to"), dataIndex: "valid_to", render: (d: string | null) => (d ? formatDate(d) : t("positions.periods.openEnded")), width: 120 },
            { title: t("fields.status"), render: (_: unknown, r) => { const s = periodState(r); return <Tag color={PERIOD_COLOR[s]}>{t(`positions.periods.state.${s}`)}</Tag>; } },
            ...(appointment ? [
              { title: t("positions.periods.appointedBy"), render: (_: unknown, r: HolderPeriod) => name(r.appointed_by_user_id) },
              { title: t("positions.periods.letter"), render: (_: unknown, r: HolderPeriod) => <AppointmentLetters holderId={r.id} letters={(letters ?? []).filter((l) => l.entity_id === r.id)} canManage={access.canManage} /> },
            ] : []),
            ...(access.canManage ? [{
              title: "",
              width: 90,
              render: (_: unknown, r: HolderPeriod) => (
                <Space size={4}>
                  <Button size="small" type="text" icon={<EditOutlined />} aria-label={t("common.edit")} onClick={() => setEditing(r)} />
                  <Popconfirm title={t("positions.periods.deleteConfirm")} onConfirm={() => remove(r.id)} okText={t("common.yes")} cancelText={t("common.no")}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t("common.delete")} />
                  </Popconfirm>
                </Space>
              ),
            }] : []),
          ]}
        />
      )}
      {access.canManage && (
        <Button icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => setEditing(null)}>
          {appointment ? t("positions.periods.appoint") : t("positions.addHolder")}
        </Button>
      )}
      <HolderPeriodModal open={editing !== undefined} positionId={positionId} kind={kind} period={editing ?? null} onClose={() => setEditing(undefined)} />
    </div>
  );
};
