// Ported 1:1 from COMPASS (app/src/pages/trainings/sessionForm.tsx).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App as AntdApp, DatePicker, Form, Input, Modal, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useTrainingTypes } from "../../hooks/useTrainings";
import { RichTextEditor } from "@rbp/module-messaging/src/richText.tsx";
import { errorText } from "@rbp/core";
import type { TrainingSessionRow } from "../../lib/trainings";
import { PeoplePicker } from "./sessionParts";

type Values = { held_on: Dayjs; training_type_ids: string[]; trainer?: string; location?: string; extra_content?: string | null; note?: string; person_ids?: string[] };

// Plan a training session (several trainings, several people) or change a planned one. The people of an existing session
// are kept on its page; a new one takes them here and opens its page.
export const TrainingSessionModal = ({ open, onClose, session }: { open: boolean; onClose: () => void; session?: TrainingSessionRow | null }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const { data: types } = useTrainingTypes();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      held_on: session ? dayjs(session.held_on) : dayjs(),
      training_type_ids: session?.training_type_ids ?? [],
      trainer: session?.trainer ?? undefined,
      location: session?.location ?? undefined,
      extra_content: session?.extra_content ?? null,
      note: session?.note ?? undefined,
      person_ids: [],
    });
  }, [open, session, form]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const row = {
        held_on: v.held_on.format("YYYY-MM-DD"),
        trainer: v.trainer?.trim() || null,
        location: v.location?.trim() || null,
        extra_content: v.extra_content || null,
        note: v.note?.trim() || null,
      };
      let id = session?.id;
      if (id) {
        const { error } = await supabaseClient.from("training_sessions").update(row).eq("id", id);
        if (error) throw error;
        const before = new Set(session!.training_type_ids);
        const after = new Set(v.training_type_ids);
        const removed = [...before].filter((x) => !after.has(x));
        const added = [...after].filter((x) => !before.has(x));
        if (removed.length) {
          const { error: e } = await supabaseClient.from("training_session_types").delete().eq("session_id", id).in("training_type_id", removed);
          if (e) throw e;
        }
        if (added.length) {
          const { error: e } = await supabaseClient.from("training_session_types").insert(added.map((training_type_id) => ({ session_id: id, training_type_id })));
          if (e) throw e;
        }
      } else {
        const { data, error } = await supabaseClient.from("training_sessions").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
        const { error: e1 } = await supabaseClient.from("training_session_types").insert(v.training_type_ids.map((training_type_id) => ({ session_id: id, training_type_id })));
        if (e1) throw e1;
        if (v.person_ids?.length) {
          const { error: e2 } = await supabaseClient.from("training_session_participants").insert(v.person_ids.map((user_id) => ({ session_id: id, user_id })));
          if (e2) throw e2;
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["training-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["training-session-participants", id] });
      message.success(t("trainings.saved"));
      onClose();
      if (!session) navigate(`/trainings/sessions/${id}`);
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const options = (types ?? []).filter((x) => x.active || session?.training_type_ids.includes(x.id)).map((x) => ({ value: x.id, label: x.name }));

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} destroyOnClose width={640} title={session ? t("trainings.sessions.edit") : t("trainings.sessions.plan")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="training_type_ids" label={t("trainings.sessions.types")} rules={[{ required: true, type: "array", min: 1, message: t("trainings.sessions.typesRequired") }]}>
          <Select mode="multiple" showSearch optionFilterProp="label" options={options} />
        </Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 12px" }}>
          <Form.Item name="held_on" label={t("trainings.sessions.heldOn")} rules={[{ required: true }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="trainer" label={t("trainings.trainer")}><Input maxLength={120} /></Form.Item>
          <Form.Item name="location" label={t("trainings.sessions.location")}><Input maxLength={120} /></Form.Item>
        </div>
        {!session && (
          <Form.Item name="person_ids" label={t("trainings.people")} extra={t("trainings.sessions.peopleHint")}>
            <PeoplePicker />
          </Form.Item>
        )}
        <Form.Item name="extra_content" label={t("trainings.sessions.extraContent")} extra={t("trainings.sessions.extraContentHint")}>
          <RichTextEditor minHeight={100} />
        </Form.Item>
        <Form.Item name="note" label={t("trainings.note")}>
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
