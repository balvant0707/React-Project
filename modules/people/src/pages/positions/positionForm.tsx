// Ported 1:1 from COMPASS (app/src/pages/positions/positionForm.tsx).
import { useEffect, useState } from "react";
import { App as AntdApp, Form, Input, Modal, Radio, Select, Switch } from "antd";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { teamsFor, useTeams } from "@rbp/core";
import { usePositionTeams, usePositionsRefresh } from "../../hooks/usePositions";
import type { PositionKind, PositionRow } from "../../lib/positions";
import { errorText } from "@rbp/core";
import { HOLDER_ERRORS } from "../../components/holderPeriods";

type Values = { name: string; kind: PositionKind; code?: string; site?: string; active: boolean; group_ids: string[] };

// Create or edit a position (kind, name, code, site) and the teams whose members hold it. Holders are managed on the
// page. An appointment has no teams: it is always given to a person directly.
export const PositionFormModal = ({ open, position, onClose, onSaved }: { open: boolean; position?: PositionRow | null; onClose: () => void; onSaved?: (id: string) => void }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const { data: groups } = useTeams();
  const { data: teams } = usePositionTeams();
  const refresh = usePositionsRefresh();
  const kind = Form.useWatch("kind", form);
  const current = (teams ?? []).filter((x) => position && x.position_id === position.id).map((x) => x.team_id);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ kind: position?.kind ?? "job", name: position?.name ?? "", code: position?.code ?? undefined, site: position?.site ?? undefined, active: position?.active ?? true, group_ids: current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position, form, teams]);

  const submit = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    setSaving(true);
    try {
      const row = { kind: v.kind, name: v.name.trim(), code: v.code?.trim() || null, site: v.site?.trim() || null, active: v.active !== false };
      const wanted = new Set(v.kind === "appointment" ? [] : v.group_ids ?? []);
      const have = new Set(current);
      const remove = [...have].filter((g) => !wanted.has(g));
      const add = [...wanted].filter((g) => !have.has(g));
      let id = position?.id;
      if (id) {
        // The database refuses to turn a position with teams into an appointment. So: save everything but the kind
        // first (a taken name fails here, before any team is touched), then remove the teams, then change the kind.
        const { kind: newKind, ...rest } = row;
        const { error } = await supabaseClient.from("positions").update(rest).eq("id", id);
        if (error) throw error;
        if (remove.length) {
          const { error: teamError } = await supabaseClient.from("position_teams").delete().eq("position_id", id).in("team_id", remove);
          if (teamError) throw teamError;
        }
        if (newKind !== position?.kind) {
          const { error: kindError } = await supabaseClient.from("positions").update({ kind: newKind }).eq("id", id);
          if (kindError) throw kindError;
        }
      } else {
        const { data, error } = await supabaseClient.from("positions").insert(row).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      if (add.length) {
        const { error } = await supabaseClient.from("position_teams").insert(add.map((team_id) => ({ position_id: id, team_id })));
        if (error) throw error;
      }
      refresh();
      message.success(t("positions.saved"));
      onSaved?.(id!);
      onClose();
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      message.error(msg.includes("positions_name_key") ? t("positions.nameTaken") : errorText(e, { known: HOLDER_ERRORS }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} onOk={submit} confirmLoading={saving} destroyOnClose title={position ? t("positions.edit") : t("positions.add")} okText={t("common.save")} cancelText={t("common.cancel")}>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="kind" label={t("positions.kind.label")} extra={kind === "appointment" ? t("positions.kind.appointmentHint") : undefined}>
          <Radio.Group optionType="button" options={[{ value: "job", label: t("positions.kind.job") }, { value: "appointment", label: t("positions.kind.appointment") }]} />
        </Form.Item>
        <Form.Item name="name" label={t("fields.name")} rules={[{ required: true, whitespace: true }]}><Input maxLength={120} /></Form.Item>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", columnGap: 16 }}>
          <Form.Item name="code" label={t("positions.code")}><Input maxLength={30} /></Form.Item>
          <Form.Item name="site" label={t("people.site")}><Input maxLength={60} /></Form.Item>
        </div>
        <Form.Item name="group_ids" label={t("positions.teams")} extra={t("positions.teamsHint")} hidden={kind === "appointment"}>
          <Select mode="multiple" optionFilterProp="label" options={teamsFor(groups, "positions").map((g) => ({ value: g.id, label: g.name }))} />
        </Form.Item>
        {position && <Form.Item name="active" label={t("fields.active")} valuePropName="checked"><Switch /></Form.Item>}
      </Form>
    </Modal>
  );
};
