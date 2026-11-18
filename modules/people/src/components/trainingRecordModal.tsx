// Ported 1:1 from COMPASS (app/src/components/trainingRecordModal.tsx).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, App as AntdApp, DatePicker, Form, Input, Modal, Select, Typography, Upload } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useTrainingTypes } from "../hooks/useTrainings";
import type { TrainingRecordRow } from "../lib/trainings";
import { addTrainingProofs, TrainingProofs } from "./trainingProofs";
import { errorText } from "@rbp/core";

type Values = { training_type_id: string; completed_on: Dayjs; trainer?: string; note?: string };

// Add or correct a training record of a person; proof files go in as attachments. A wrong record is corrected, never
// deleted (retention). Several people or several trainings at once are a training session (pages/trainings/sessionShow).
export const TrainingRecordModal = ({ open, onClose, personId, record, defaultTypeId }: { open: boolean; onClose: () => void; personId: string; record?: TrainingRecordRow | null; defaultTypeId?: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<Values>();
  const queryClient = useQueryClient();
  const { data: types } = useTrainingTypes();
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const typeId = Form.useWatch("training_type_id", form);
  const type = (types ?? []).find((x) => x.id === typeId);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    form.resetFields();
    form.setFieldsValue({
      training_type_id: record?.training_type_id ?? defaultTypeId,
      completed_on: record ? dayjs(record.completed_on) : dayjs(),
      trainer: record?.trainer ?? undefined,
      note: record?.note ?? undefined,
    });
  }, [open, record, defaultTypeId, form]);

  const submit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSaving(true);
    try {
      const row = {
        training_type_id: values.training_type_id,
        completed_on: values.completed_on.format("YYYY-MM-DD"),
        trainer: values.trainer?.trim() || null,
        note: values.note?.trim() || null,
      };
      if (record) {
        const { error } = await supabaseClient.from("training_records").update(row).eq("id", record.id);
        if (error) throw error;
        if (files.length) await addTrainingProofs(record.id, files);
      } else {
        const { data, error } = await supabaseClient.from("training_records").insert({ ...row, user_id: personId }).select("id").single();
        if (error) throw error;
        if (files.length) await addTrainingProofs(data.id as string, files);
      }
      for (const key of ["training-records", "training-status", "training-proofs"]) void queryClient.invalidateQueries({ queryKey: [key] });
      message.success(t("trainings.saved"));
      onClose();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const options = (types ?? []).filter((x) => x.active || x.id === record?.training_type_id).map((x) => ({ value: x.id, label: x.name }));

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} destroyOnClose width={560} title={record ? t("trainings.editRecord") : t("trainings.addRecord")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Form form={form} layout="vertical" requiredMark={false}>
        {record?.session_id && (
          <Alert type="info" showIcon style={{ marginBottom: 12 }} message={<Link to={`/trainings/sessions/${record.session_id}`}>{t("trainings.sessions.fromSession")}</Link>} />
        )}
        <Form.Item name="training_type_id" label={t("trainings.type")} rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={options} />
        </Form.Item>
        <Form.Item name="completed_on" label={t("trainings.completedOn")} rules={[{ required: true }]}>
          <DatePicker style={{ width: "100%" }} disabledDate={(d) => d.isAfter(dayjs(), "day")} />
        </Form.Item>
        {type && (
          <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
            {type.validity_months ? t("trainings.validForMonths", { count: type.validity_months }) : t("trainings.oneOff")}
          </Typography.Paragraph>
        )}
        <Form.Item name="trainer" label={t("trainings.trainer")}>
          <Input maxLength={120} />
        </Form.Item>
        <Form.Item name="note" label={t("trainings.note")}>
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        {type?.requires_certificate && files.length === 0 && !record?.proof_count && <Alert type="warning" showIcon message={t("trainings.certificateRequired")} style={{ marginBottom: 12 }} />}
        <Form.Item label={t("trainings.proof")}>
          {record ? (
            <TrainingProofs recordId={record.id} canAdd />
          ) : (
            <Upload.Dragger multiple beforeUpload={(file) => { setFiles((prev) => [...prev, file]); return false; }} onRemove={(file) => setFiles((prev) => prev.filter((f) => f.name !== file.name))} fileList={files.map((f, i) => ({ uid: String(i), name: f.name, status: "done" as const }))}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>{t("trainings.dropProof")}</p>
            </Upload.Dragger>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};
