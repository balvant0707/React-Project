// Ported 1:1 from COMPASS (app/src/components/requirementsList.tsx).
import { useState } from "react";
import { App as AntdApp, AutoComplete, Button, Space } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabaseClient } from "@rbp/core";
import { useRequirementPhrases, useVersionRequirements } from "../hooks/useFitReviews";
import { errorText } from "@rbp/core";

// The requirements of a version as a list (read-only). Renders nothing when the list is empty.
export const RequirementsView = ({ versionId }: { versionId: string }) => {
  const { data: items } = useVersionRequirements(versionId);
  if (!items?.length) return null;
  return <ul style={{ margin: 0, paddingLeft: 20 }}>{items.map((r) => <li key={r.id}>{r.text}</li>)}</ul>;
};

// Edits the list of a draft: type a requirement (suggestions come from the texts already in use, a new text is learned),
// remove one with the cross.
export const RequirementsEditor = ({ versionId }: { versionId: string }) => {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { data: items } = useVersionRequirements(versionId);
  const { data: phrases } = useRequirementPhrases();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const used = new Set((items ?? []).map((i) => i.text.toLowerCase()));
  const term = text.trim().toLowerCase();
  const options = (phrases ?? []).filter((p) => !used.has(p.text.toLowerCase()) && (!term || p.text.toLowerCase().includes(term))).slice(0, 30).map((p) => ({ value: p.text }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["positions", "requirements", versionId] });
    void queryClient.invalidateQueries({ queryKey: ["positions", "requirement-phrases"] });
    void queryClient.invalidateQueries({ queryKey: ["positions", "versions"] });
  };
  const add = async (texts: string[]) => {
    setBusy(true);
    const { error } = await supabaseClient.rpc("job_description_requirement_add", { p_version: versionId, p_texts: texts });
    setBusy(false);
    if (error) {
      message.error(errorText(error));
      return false;
    }
    refresh();
    return true;
  };
  const addTyped = async () => {
    if (!text.trim()) return;
    if (await add([text])) setText("");
  };
  const remove = async (id: string) => {
    const { error } = await supabaseClient.rpc("job_description_requirement_remove", { p_item: id });
    if (error) message.error(errorText(error));
    else refresh();
  };

  return (
    <div>
      {(items ?? []).length > 0 && (
        <ul style={{ margin: "0 0 8px", paddingLeft: 0, listStyle: "none" }}>
          {(items ?? []).map((r) => (
            <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
              <span style={{ flex: 1 }}>• {r.text}</span>
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => void remove(r.id)} aria-label={t("common.delete")} />
            </li>
          ))}
        </ul>
      )}
      <Space.Compact style={{ width: "100%", maxWidth: 560 }}>
        <AutoComplete
          style={{ width: "100%" }}
          value={text}
          options={options}
          onChange={setText}
          onSelect={(v) => void add([v]).then((ok) => ok && setText(""))}
          placeholder={t("positions.requirementPlaceholder")}
          maxLength={300}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTyped(); } }}
        />
        <Button icon={<PlusOutlined />} loading={busy} onClick={() => void addTyped()}>{t("common.add")}</Button>
      </Space.Compact>
    </div>
  );
};
