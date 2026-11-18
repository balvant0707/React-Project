// Ported 1:1 from COMPASS (app/src/components/newTaskItems.tsx).
import { useState } from "react";
import { Button, Input, InputNumber, Space, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ItemSelect } from "./itemSelect";
import { usePhrases, usePhraseText } from "@rbp/core";
import { parseQuickLine } from "../lib/items";

// A line typed on the new-task form before the task exists: a catalogue item or free text ("3 Pakete Toilettenpapier").
export type NewTaskItem = { item_id?: string; description?: string; unit_phrase_id?: string | null; quantity: number };

// Items of a task that is still being created (task form): catalogue lines with a picker, free-text lines through the
// quick field. Sent with the new task as `p_items` of the RPC task_create (rows from `newTaskItemRows`).
export const NewTaskItemsField = ({ value = [], onChange, categoryIds }: { value?: NewTaskItem[]; onChange?: (v: NewTaskItem[]) => void; categoryIds?: string[] }) => {
  const { t } = useTranslation();
  const { data: units } = usePhrases("item_unit");
  const phraseText = usePhraseText();
  const [quick, setQuick] = useState("");
  const set = (i: number, patch: Partial<NewTaskItem>) => onChange?.(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addQuick = () => {
    const parsed = parseQuickLine(quick, units ?? []);
    if (!parsed.description) return;
    onChange?.([...value, { description: parsed.description.slice(0, 300), unit_phrase_id: parsed.unitId, quantity: parsed.quantity }]);
    setQuick("");
  };
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {value.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {p.description !== undefined ? (
            <Input value={p.description} onChange={(e) => set(i, { description: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
          ) : (
            <ItemSelect value={p.item_id} onChange={(id) => set(i, { item_id: id })} categoryIds={categoryIds} style={{ flex: 1, minWidth: 0 }} />
          )}
          <InputNumber min={0.01} value={p.quantity} onChange={(q) => set(i, { quantity: Number(q ?? 1) })} style={{ width: 80 }} />
          {p.unit_phrase_id && <Typography.Text type="secondary">{phraseText(units?.find((u) => u.id === p.unit_phrase_id) ?? { id: "", code: null, text_en: "", text_de: null })}</Typography.Text>}
          <Button type="text" danger aria-label={t("common.delete")} icon={<DeleteOutlined />} onClick={() => onChange?.(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Input
        value={quick}
        onChange={(e) => setQuick(e.target.value)}
        onPressEnter={(e) => {
          e.preventDefault();
          addQuick();
        }}
        onBlur={addQuick}
        placeholder={t("items.quickPlaceholderNew")}
      />
      <Button size="small" icon={<PlusOutlined />} onClick={() => onChange?.([...value, { quantity: 1 }])}>
        {t("items.addFromCatalogue")}
      </Button>
    </Space>
  );
};

// The lines of the form as rows for the new task (a line without item or text is skipped; task_create_finish stores
// them as "needed").
export const newTaskItemRows = (lines: NewTaskItem[]) =>
  lines
    .filter((l) => l.item_id || l.description?.trim())
    .map((l) => ({
      quantity: l.quantity || 1,
      ...(l.item_id ? { item_id: l.item_id } : { description: l.description!.trim(), unit_phrase_id: l.unit_phrase_id ?? null }),
    }));
