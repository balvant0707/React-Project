// Ported 1:1 from COMPASS (app/src/pages/trainings/typeModal.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Form, Input, InputNumber, Modal, Select, Switch } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useTeams, useRoles, teamsFor } from "@rbp/core";
import { usePeople } from "@rbp/module-task-family/src/hooks/usePeople.ts";
import { personName } from "@rbp/module-messaging/src/lib/people.ts";
import { usePositions } from "../../hooks/usePositions";
import { usePhraseText, usePhrases } from "@rbp/core";
import { useTrainingRequirements } from "../../hooks/useTrainings";
import { localName, sortByName } from "@rbp/module-tasks/src/lib/masterData.ts";
import type { TrainingType } from "../../lib/trainings";
import { errorText } from "@rbp/core";
import { RichTextEditor } from "@rbp/module-messaging/src/richText.tsx";
import { useInstructionAccess, useInstructions, useTrainingTypeInstructions } from "../../hooks/useOperatingInstructions";
import { instructionNumber } from "../../lib/operatingInstructions";

type Values = Omit<TrainingType, "id" | "sort_order"> & { group_ids?: string[]; role_ids?: string[]; position_ids?: string[]; instruction_ids?: string[] };

// Catalogue entry. Retention is informational: it is shown on the records and never triggers a deletion.
export const TrainingTypeModal = ({ open, type, onClose }: { open: boolean; type?: TrainingType | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<Values>();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const { data: groups } = useTeams();
  const { data: roles } = useRoles();
  const { data: positions } = usePositions();
  const { data: people } = usePeople();
  const { data: requirements } = useTrainingRequirements();
  const { data: categories = [] } = usePhrases("training_category");
  const categoryText = usePhraseText();
  const instructionAccess = useInstructionAccess();
  const { data: instructions } = useInstructions();
  const { data: links } = useTrainingTypeInstructions();
  const linked = (links ?? []).filter((l) => type && l.training_type_id === type.id).sort((a, b) => a.sort_order - b.sort_order).map((l) => l.instruction_id);
  // Requirements for single people are set on the person page and stay untouched here.
  const existing = (requirements ?? []).filter((r) => type && r.training_type_id === type.id && !r.user_id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({
      ...(type ?? { reminder_days_before: 60, retention_years_after_exit: 30, requires_certificate: false, active: true, validity_months: 12 }),
      group_ids: existing.filter((r) => r.team_id).map((r) => r.team_id!),
      role_ids: existing.filter((r) => r.role_id).map((r) => r.role_id!),
      position_ids: existing.filter((r) => r.position_id).map((r) => r.position_id!),
      instruction_ids: linked,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type, form, requirements, links]);

  const responsibleKind = Form.useWatch("responsible_kind", form);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const row = {
        name: v.name.trim(),
        category_phrase_id: v.category_phrase_id ?? null,
        description: v.description?.trim() || null,
        content: v.content || null,
        provider: v.provider?.trim() || null,
        responsible_kind: v.responsible_kind ?? null,
        responsible_user_id: v.responsible_kind === "person" ? v.responsible_user_id ?? null : null,
        responsible_external: v.responsible_kind === "external" ? v.responsible_external?.trim() || null : null,
        validity_months: v.validity_months ?? null,
        reminder_days_before: v.reminder_days_before ?? 60,
        requires_certificate: !!v.requires_certificate,
        retention_years_after_exit: v.retention_years_after_exit ?? 30,
        active: v.active !== false,
      };
      let id = type?.id;
      if (id) {
        const { error } = await supabaseClient.from("training_types").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from("training_types").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      // Required for: add the new teams, roles and positions, remove the ones taken off.
      const wanted: { team_id?: string; role_id?: string; position_id?: string }[] = [
        ...(v.group_ids ?? []).map((g) => ({ team_id: g })),
        ...(v.role_ids ?? []).map((r) => ({ role_id: r })),
        ...(v.position_ids ?? []).map((p) => ({ position_id: p })),
      ];
      const keyOf = (w: { team_id?: string | null; role_id?: string | null; position_id?: string | null }) => (w.team_id ? `g:${w.team_id}` : w.role_id ? `r:${w.role_id}` : `p:${w.position_id}`);
      const keep = new Set(wanted.map(keyOf));
      const have = new Map(existing.map((r) => [keyOf(r), r.id]));
      const remove = [...have].filter(([k]) => !keep.has(k)).map(([, rid]) => rid);
      const add = wanted.filter((w) => !have.has(keyOf(w)));
      if (remove.length) {
        const { error } = await supabaseClient.from("training_requirements").delete().in("id", remove);
        if (error) throw error;
      }
      if (add.length) {
        const { error } = await supabaseClient.from("training_requirements").insert(add.map((w) => ({ training_type_id: id, ...w })));
        if (error) throw error;
      }
      // Operating instructions taught: add the new ones, remove the ones taken off (the order is the order picked).
      if (instructionAccess.canView) {
        const wantedIds = v.instruction_ids ?? [];
        const drop = linked.filter((x) => !wantedIds.includes(x));
        if (drop.length) {
          const { error } = await supabaseClient.from("training_type_operating_instructions").delete().eq("training_type_id", id).in("instruction_id", drop);
          if (error) throw error;
        }
        const added = wantedIds.filter((x) => !linked.includes(x));
        if (added.length) {
          const { error } = await supabaseClient.from("training_type_operating_instructions").insert(added.map((x) => ({ training_type_id: id, instruction_id: x, sort_order: wantedIds.indexOf(x) })));
          if (error) throw error;
        }
      }
      for (const key of ["training-types", "training-requirements", "training-status", "operating-instructions"]) void queryClient.invalidateQueries({ queryKey: [key] });
      message.success(t("trainings.saved"));
      onClose();
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} destroyOnClose width={600} title={type ? t("trainings.editType") : t("trainings.addType")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true }]}><Input maxLength={120} /></Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", columnGap: 16 }}>
          <Form.Item name="category_phrase_id" label={t("trainings.category")}><Select allowClear showSearch optionFilterProp="label" options={categories.map((c) => ({ value: c.id, label: categoryText(c) }))} /></Form.Item>
          <Form.Item name="provider" label={t("trainings.provider")}><Input maxLength={120} /></Form.Item>
          <Form.Item name="responsible_kind" label={t("trainings.responsible")} extra={t("trainings.responsibleHint")}>
            <Select allowClear options={(["supervisor", "person", "external"] as const).map((k) => ({ value: k, label: t(`trainings.responsibleKind.${k}`) }))} />
          </Form.Item>
          {responsibleKind === "person" && (
            <Form.Item name="responsible_user_id" label={t("trainings.responsiblePerson")} rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={(people ?? []).filter((p) => !p.has_left || p.id === type?.responsible_user_id).map((p) => ({ value: p.id, label: personName(p) }))} />
            </Form.Item>
          )}
          {responsibleKind === "external" && (
            <Form.Item name="responsible_external" label={t("trainings.responsibleExternal")} rules={[{ required: true, whitespace: true }]}>
              <Input maxLength={120} />
            </Form.Item>
          )}
          <Form.Item name="validity_months" label={t("trainings.validityMonths")} extra={t("trainings.validityHint")}><InputNumber min={1} max={240} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="reminder_days_before" label={t("trainings.reminderDays")} extra={t("trainings.reminderHint")}><InputNumber min={0} max={730} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="retention_years_after_exit" label={t("trainings.retentionYears")} extra={t("trainings.retentionHint")}><InputNumber min={0} max={100} style={{ width: "100%" }} /></Form.Item>
          <span />
          <Form.Item name="requires_certificate" label={t("trainings.requiresCertificate")} valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="active" label={t("fields.active")} valuePropName="checked"><Switch /></Form.Item>
        </div>
        <Form.Item name="group_ids" label={t("trainings.requiredForTeams")}>
          <Select mode="multiple" optionFilterProp="label" options={teamsFor(groups, "trainings").map((g) => ({ value: g.id, label: g.name }))} />
        </Form.Item>
        <Form.Item name="role_ids" label={t("trainings.requiredForRoles")} extra={t("trainings.requiredHint")}>
          <Select mode="multiple" optionFilterProp="label" options={sortByName(roles).map((r) => ({ value: r.id, label: localName(r) }))} />
        </Form.Item>
        <Form.Item name="position_ids" label={t("trainings.requiredForPositions")}>
          <Select mode="multiple" optionFilterProp="label" options={(positions ?? []).filter((p) => p.active || existing.some((r) => r.position_id === p.id)).map((p) => ({ value: p.id, label: p.name }))} />
        </Form.Item>
        {instructionAccess.canView && (
          <Form.Item name="instruction_ids" label={t("trainings.operatingInstructions")} extra={t("trainings.operatingInstructionsHint")}>
            <Select
              mode="multiple"
              optionFilterProp="label"
              options={(instructions ?? []).filter((x) => (x.active && x.published_version_id) || linked.includes(x.id)).map((x) => ({ value: x.id, label: `${instructionNumber(x.number)} ${x.title}` }))}
            />
          </Form.Item>
        )}
        <Form.Item name="description" label={t("fields.description")}><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
        <Form.Item name="content" label={t("trainings.content")} extra={t("trainings.contentHint")}><RichTextEditor minHeight={120} /></Form.Item>
      </Form>
    </Modal>
  );
};
