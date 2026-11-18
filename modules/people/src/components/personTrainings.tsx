// Ported 1:1 from COMPASS (app/src/components/personTrainings.tsx).
import { useState } from "react";
import { App as AntdApp, Button, Empty, Input, List, Modal, Select, Space, Spin, Table, Tag, Typography } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { usePhraseText, usePhrases } from "@rbp/core";
import { useTrainingAccess, useTrainingExemptions, useTrainingRecords, useTrainingRequirements, useTrainingStatus, useTrainingTypes } from "../hooks/useTrainings";
import { STATUS_ORDER, type TrainingRecordRow, type TrainingStatusRow } from "../lib/trainings";
import { formatDate } from "@rbp/ui";
import { TrainingProofs } from "./trainingProofs";
import { TrainingRecordModal } from "./trainingRecordModal";
import { TrainingStatusTag } from "./trainingStatusTag";
import { errorText } from "@rbp/core";

// How long the record is kept: after the exit date once the person left, otherwise a rule of the type. Informational.
const RetentionNote = ({ r }: { r: TrainingRecordRow }) => {
  const { t } = useTranslation();
  const text = r.retain_until ? t("trainings.keepUntil", { date: formatDate(r.retain_until) }) : t("trainings.keepYears", { count: r.retention_years_after_exit });
  return <Typography.Text type="secondary" style={{ fontSize: 12 }}>{text}</Typography.Text>;
};

// The trainings of one person: what counts today (required and recorded trainings with their status), exemptions and the
// full history with proof files.
export const PersonTrainings = ({ personId }: { personId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: records, isLoading } = useTrainingRecords(personId);
  const { data: statusRows } = useTrainingStatus();
  const { data: types } = useTrainingTypes();
  const { data: categories } = usePhrases("training_category");
  const categoryText = usePhraseText();
  const categoryOf = (id?: string | null) => { const c = categories?.find((x) => x.id === id); return c ? categoryText(c) : null; };
  const { data: exemptions } = useTrainingExemptions(personId);
  const { data: requirements } = useTrainingRequirements();
  const { data: people } = usePeople();
  const access = useTrainingAccess();
  const canEdit = access.canEdit(personId);
  const [editing, setEditing] = useState<{ record?: TrainingRecordRow | null; typeId?: string } | null>(null);
  const [exempting, setExempting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [requiring, setRequiring] = useState(false);
  const [requireType, setRequireType] = useState<string | undefined>();

  if (isLoading) return <Spin />;
  const typeById = new Map((types ?? []).map((x) => [x.id, x]));
  const reasonOf = new Map((exemptions ?? []).map((e) => [e.training_type_id, e.reason]));
  const current = (statusRows ?? [])
    .filter((r) => r.user_id === personId && typeById.get(r.training_type_id)?.active !== false)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (typeById.get(a.training_type_id)?.name ?? "").localeCompare(typeById.get(b.training_type_id)?.name ?? ""));

  // Supervisor kind resolves to this person's own supervisor.
  const responsibleOf = (typeId: string) => {
    const x = typeById.get(typeId);
    if (x?.responsible_kind === "external") return x.responsible_external;
    const id = x?.responsible_kind === "supervisor" ? (people ?? []).find((q) => q.id === personId)?.supervisor_user_id : x?.responsible_kind === "person" ? x.responsible_user_id : null;
    const who = (people ?? []).find((q) => q.id === id);
    return who ? personName(who) : null;
  };

  // A requirement set for this person alone (not through a team, role or position); the lead or HR can take it back.
  const ownRequirementOf = new Map((requirements ?? []).filter((r) => r.user_id === personId).map((r) => [r.training_type_id, r.id]));
  const requireOptions = (types ?? []).filter((x) => x.active && !ownRequirementOf.has(x.id));

  const refresh = () => {
    for (const key of ["training-status", "training-exemptions", "training-requirements"]) void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const saveExemption = async () => {
    if (!exempting || !reason.trim()) return;
    const { error } = await supabaseClient.from("training_exemptions").upsert({ user_id: personId, training_type_id: exempting, reason: reason.trim() });
    if (error) {
      message.error(errorText(error));
      return;
    }
    setExempting(null);
    setReason("");
    refresh();
  };
  const saveRequirement = async () => {
    if (!requireType) return;
    const { error } = await supabaseClient.from("training_requirements").insert({ training_type_id: requireType, user_id: personId });
    if (error) {
      message.error(errorText(error));
      return;
    }
    setRequiring(false);
    setRequireType(undefined);
    refresh();
  };
  const removeRequirement = async (reqId: string) => {
    const { error } = await supabaseClient.from("training_requirements").delete().eq("id", reqId);
    if (error) message.error(errorText(error));
    else refresh();
  };
  const removeExemption = async (typeId: string) => {
    const { error } = await supabaseClient.from("training_exemptions").delete().eq("user_id", personId).eq("training_type_id", typeId);
    if (error) message.error(errorText(error));
    else refresh();
  };

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        {canEdit && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setEditing({})}>{t("trainings.addRecord")}</Button>}
        {canEdit && <Button size="small" onClick={() => { setRequireType(undefined); setRequiring(true); }}>{t("trainings.requireForPerson")}</Button>}
      </Space>
      {current.length === 0 ? (
        <Empty description={t("trainings.noRecords")} />
      ) : (
        <>
          <Table<TrainingStatusRow>
            size="small"
            pagination={false}
            rowKey={(r) => r.training_type_id}
            dataSource={current}
            scroll={{ x: "max-content" }}
            columns={[
              {
                title: t("trainings.type"),
                render: (_, r) => {
                  const x = typeById.get(r.training_type_id);
                  return (
                    <div>
                      {x?.name} {r.required && <Tag style={{ marginLeft: 4 }}>{t("trainings.required")}</Tag>}
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{categoryOf(x?.category_phrase_id)}</div>
                      {responsibleOf(r.training_type_id) && <div style={{ fontSize: 12, opacity: 0.65 }}>{t("trainings.responsible")}: {responsibleOf(r.training_type_id)}</div>}
                    </div>
                  );
                },
              },
              {
                title: t("trainings.statusLabel"),
                render: (_, r) => (
                  <div>
                    <TrainingStatusTag status={r.status} />
                    {r.exempt && <div style={{ fontSize: 12, opacity: 0.65 }}>{reasonOf.get(r.training_type_id)}</div>}
                  </div>
                ),
              },
              { title: t("trainings.completedOn"), dataIndex: "completed_on", render: (v) => (v ? formatDate(v) : "—") },
              { title: t("trainings.validUntil"), dataIndex: "valid_until", render: (v, r) => (r.record_id ? (v ? formatDate(v) : t("trainings.noExpiry")) : "—") },
              { title: t("trainings.proof"), render: (_, r) => (r.record_id ? <TrainingProofs recordId={r.record_id} canAdd={canEdit} /> : "—") },
              ...(canEdit
                ? [{
                    title: "",
                    render: (_: unknown, r: TrainingStatusRow) => (
                      <Space size={4} wrap>
                        {!r.exempt && <Button size="small" onClick={() => setEditing({ typeId: r.training_type_id })}>{r.record_id ? t("trainings.renew") : t("trainings.record")}</Button>}
                        {r.exempt ? (
                          <Button size="small" type="text" onClick={() => void removeExemption(r.training_type_id)}>{t("trainings.removeExemption")}</Button>
                        ) : r.required ? (
                          <Button size="small" type="text" onClick={() => { setReason(""); setExempting(r.training_type_id); }}>{t("trainings.exempt")}</Button>
                        ) : null}
                        {ownRequirementOf.has(r.training_type_id) && <Button size="small" type="text" onClick={() => void removeRequirement(ownRequirementOf.get(r.training_type_id)!)}>{t("trainings.removeRequirement")}</Button>}
                      </Space>
                    ),
                  }]
                : []),
            ]}
          />
          <Typography.Title level={5} style={{ marginTop: 16 }}>{t("trainings.history")}</Typography.Title>
          <List
            size="small"
            locale={{ emptyText: t("trainings.noRecords") }}
            dataSource={records ?? []}
            renderItem={(r) => (
              <List.Item actions={canEdit ? [<Button key="edit" size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing({ record: r })} aria-label={t("common.edit")} />] : []}>
                <List.Item.Meta
                  title={<Space wrap size={8}>{r.type_name}<span style={{ fontWeight: 400 }}>{formatDate(r.completed_on)}</span>{r.trainer && <Typography.Text type="secondary">{r.trainer}</Typography.Text>}</Space>}
                  description={<Space size={12} wrap><RetentionNote r={r} />{r.note && <span>{r.note}</span>}<span>{t("trainings.proofCount", { count: r.proof_count })}</span></Space>}
                />
              </List.Item>
            )}
          />
        </>
      )}
      <TrainingRecordModal open={!!editing} onClose={() => setEditing(null)} personId={personId} record={editing?.record} defaultTypeId={editing?.typeId} />
      <Modal open={requiring} onCancel={() => setRequiring(false)} onOk={() => void saveRequirement()} okButtonProps={{ disabled: !requireType }} okText={t("common.save")} cancelText={t("common.cancel")} title={t("trainings.requireForPerson")}>
        <Typography.Paragraph type="secondary">{t("trainings.requireForPersonHint")}</Typography.Paragraph>
        <Select showSearch optionFilterProp="label" style={{ width: "100%" }} value={requireType} onChange={setRequireType} placeholder={t("trainings.type")} options={requireOptions.map((x) => ({ value: x.id, label: x.name }))} />
      </Modal>
      <Modal open={!!exempting} onCancel={() => setExempting(null)} onOk={() => void saveExemption()} okButtonProps={{ disabled: !reason.trim() }} okText={t("common.save")} cancelText={t("common.cancel")} title={t("trainings.exempt")}>
        <Typography.Paragraph type="secondary">{t("trainings.exemptHint")}</Typography.Paragraph>
        <Input.TextArea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("trainings.exemptReason")} />
      </Modal>
    </div>
  );
};
