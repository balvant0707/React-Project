// Ported 1:1 from COMPASS (app/src/components/checklist/ownChecklist.tsx).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App as AntdApp, Button, Card, Input, Modal, Typography } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { itemsJson, templateRights } from "../../lib/checklists";
import { blankItems, ItemsEditor, type EditorItem } from "./itemsEditor";
import { errorText } from "@rbp/core";

// Own steps typed on the spot for one task or one series (plain ticks, never required). Anyone who may create tasks can
// add them; turning them into a reusable official checklist is a separate button that needs the checklist_templates
// create grant.
export type OwnList = { items: EditorItem[] };

const newOwnList = (): OwnList => ({ items: blankItems(true) });
export const ownListLabels = (list: OwnList | null | undefined) => (list?.items ?? []).map((i) => i.label.trim()).filter(Boolean);

export const OwnChecklistField = ({
  value,
  onChange,
  defaultName,
  hint,
}: {
  value?: OwnList | null;
  onChange?: (value: OwnList | null) => void;
  defaultName?: string;
  hint?: string;
}) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: rights } = useQuery({ queryKey: ["template-rights"], queryFn: templateRights, staleTime: 5 * 60_000 });

  if (!value) {
    return (
      <Button icon={<PlusOutlined />} onClick={() => onChange?.(newOwnList())}>
        {t("checklists.addSteps")}
      </Button>
    );
  }

  const labels = ownListLabels(value);
  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    setBusy(true);
    const items = itemsJson(value.items.filter((i) => i.label.trim()).map((i) => ({ ...i, required: false })));
    const { error } = await supabaseClient.rpc("checklist_template_create", { p_name: templateName.trim(), p_items: items });
    setBusy(false);
    if (error) return message.error(errorText(error));
    await queryClient.invalidateQueries({ queryKey: ["checklist-templates"] });
    message.success(t("checklists.templateSaved"));
    setNaming(false);
  };

  return (
    <Card size="small" extra={<Button type="text" icon={<CloseOutlined />} onClick={() => onChange?.(null)} aria-label={t("checklists.remove")} />} title={t("checklists.ownSteps")}>
      <ItemsEditor simple value={value.items} onChange={(next) => onChange?.({ items: next })} focusFirst />
      {hint && <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>{hint}</Typography.Paragraph>}
      {rights?.canCreate && (
        <Button style={{ marginTop: 12 }} disabled={labels.length === 0} onClick={() => { setTemplateName(defaultName || ""); setNaming(true); }}>
          {t("checklists.saveAsTemplate")}
        </Button>
      )}
      <Modal open={naming} onCancel={() => setNaming(false)} onOk={saveTemplate} confirmLoading={busy} title={t("checklists.saveAsTemplate")} destroyOnClose>
        <Typography.Paragraph type="secondary">{t("checklists.saveAsTemplateHint")}</Typography.Paragraph>
        <Input autoFocus value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={200} onPressEnter={saveTemplate} />
      </Modal>
    </Card>
  );
};
