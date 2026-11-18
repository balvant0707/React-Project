// Ported 1:1 from COMPASS (app/src/components/checklist/itemsEditor.tsx).
import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { Button, Dropdown, Input, InputNumber, Select, Space, Switch, Typography, theme as antdTheme } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { ITEM_KINDS, newItem, type ItemDef, type ItemKind } from "../../lib/checklists";

// Edits the item list of a template or of an ad hoc checklist. Controlled: the parent keeps the array and saves it.
export type EditorItem = ItemDef & { key: string };

export const withKeys = (items: ItemDef[]): EditorItem[] => items.map((i) => ({ ...i, key: i.id ?? crypto.randomUUID() }));

// `simple` = a plain to-do list (own items on a task or series): ticks only, never required.
// `steps` = the route steps of the template's task type: each item can then be assigned to one (null = the whole task).
export const ItemsEditor = ({ value, onChange, focusFirst, simple, steps }: { value: EditorItem[]; onChange: (items: EditorItem[]) => void; focusFirst?: boolean; simple?: boolean; steps?: { value: string; label: string }[] }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();

  const patch = (index: number, change: Partial<ItemDef>) => onChange(value.map((item, i) => (i === index ? { ...item, ...change } : item)));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...value];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const fresh = (kind: ItemKind, label = ""): EditorItem => ({ ...newItem(kind), label, required: simple ? false : newItem(kind).required, key: crypto.randomUUID() });
  const add = (kind: ItemKind) => onChange([...value, fresh(kind)]);

  // Typing flow like a to-do list: Enter in a text starts the next tick item below it, Backspace in an empty one removes
  // it, pasting several lines makes one item per line.
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    if (focusKey.current) fields.current.get(focusKey.current)?.focus();
    focusKey.current = null;
  }, [value]);
  useEffect(() => {
    if (focusFirst && value.length) fields.current.get(value[0].key)?.focus();
    // only when the editor appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFirst]);
  const insertAfter = (index: number, labels: string[]) => {
    const created = labels.map((label) => fresh("check", label));
    focusKey.current = created[created.length - 1].key;
    onChange([...value.slice(0, index + 1), ...created, ...value.slice(index + 1)]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.nativeEvent.isComposing) return;
    const item = value[index];
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (item.label.trim()) insertAfter(index, [""]);
    } else if (e.key === "Backspace" && item.label === "" && value.length > 1) {
      e.preventDefault();
      focusKey.current = value[index > 0 ? index - 1 : 1].key;
      onChange(value.filter((_, i) => i !== index));
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>, index: number) => {
    const lines = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\[[ xX]?\])\s*/, "").trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const [first, ...rest] = lines;
    const current = value[index];
    if (current.label.trim()) insertAfter(index, lines);
    else {
      const created = rest.map((label) => fresh("check", label));
      if (created.length) focusKey.current = created[created.length - 1].key;
      onChange([...value.slice(0, index), { ...current, label: first }, ...created, ...value.slice(index + 1)]);
    }
  };

  return (
    <div>
      {value.length === 0 && <Typography.Paragraph type="secondary">{t("checklists.noItems")}</Typography.Paragraph>}
      {value.map((item, index) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            padding: "8px 0",
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            flexWrap: "wrap",
          }}
        >
          {!simple && <Select<ItemKind>
            value={item.kind}
            style={{ width: 150 }}
            onChange={(kind) => patch(index, { kind, required: kind === "heading" ? false : item.required })}
            options={ITEM_KINDS.map((k) => ({ value: k, label: t(`checklists.kinds.${k}`) }))}
          />}
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <Input.TextArea
              ref={(r) => {
                const el = r?.resizableTextArea?.textArea;
                if (el) fields.current.set(item.key, el);
                else fields.current.delete(item.key);
              }}
              onKeyDown={(e) => onKeyDown(e, index)}
              onPaste={(e) => onPaste(e, index)}
              autoSize={{ minRows: 1, maxRows: 4 }}
              value={item.label}
              maxLength={500}
              placeholder={item.kind === "heading" ? t("checklists.headingPlaceholder") : t("checklists.labelPlaceholder")}
              onChange={(e) => patch(index, { label: e.target.value })}
              style={item.kind === "heading" ? { fontWeight: 600 } : undefined}
            />
            {!simple && item.kind === "number" && (
              <Space size={6} style={{ marginTop: 6 }} wrap>
                <Input style={{ width: 80 }} placeholder={t("checklists.unit")} value={item.unit ?? ""} onChange={(e) => patch(index, { unit: e.target.value || null })} />
                <InputNumber style={{ width: 110 }} placeholder={t("checklists.min")} value={item.min_value} onChange={(v) => patch(index, { min_value: v })} />
                <InputNumber style={{ width: 110 }} placeholder={t("checklists.max")} value={item.max_value} onChange={(v) => patch(index, { max_value: v })} />
              </Space>
            )}
          </div>
          {!simple && steps && steps.length > 0 && (
            <Select
              allowClear
              size="small"
              style={{ width: 160 }}
              placeholder={t("checklists.stepWholeTask")}
              value={item.step_key ?? undefined}
              options={steps}
              onChange={(step_key) => patch(index, { step_key: step_key ?? null })}
            />
          )}
          {!simple && item.kind !== "heading" && (
            <Space size={4}>
              <Switch size="small" checked={item.required} onChange={(required) => patch(index, { required })} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t("checklists.required")}</Typography.Text>
            </Space>
          )}
          <Space size={0}>
            <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} aria-label={t("checklists.moveUp")} />
            <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={index === value.length - 1} onClick={() => move(index, 1)} aria-label={t("checklists.moveDown")} />
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(value.filter((_, i) => i !== index))} aria-label={t("common.delete")} />
          </Space>
        </div>
      ))}
      {value.length > 0 && <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>{t("checklists.enterHint")}</Typography.Paragraph>}
      {simple ? (
        <Button style={{ marginTop: 12 }} icon={<PlusOutlined />} onClick={() => { const item = fresh("check"); focusKey.current = item.key; onChange([...value, item]); }}>{t("checklists.addItem")}</Button>
      ) : (
        <Dropdown
          trigger={["click"]}
          menu={{ items: ITEM_KINDS.map((k) => ({ key: k, label: t(`checklists.kinds.${k}`), onClick: () => add(k) })) }}
        >
          <Button style={{ marginTop: 12 }} icon={<PlusOutlined />}>{t("checklists.addItem")}</Button>
        </Dropdown>
      )}
    </div>
  );
};

// A freshly started list: one empty tick item to type into.
export const blankItems = (simple = false): EditorItem[] => [{ ...newItem("check"), required: simple ? false : newItem("check").required, key: crypto.randomUUID() }];

// Empty rows that were never saved are simply dropped (the editor keeps one open to type into).
export const dropBlank = (items: EditorItem[]) => items.filter((i) => i.id || i.label.trim());

// Items without text cannot be saved.
export const validItems = (items: EditorItem[]) => items.length > 0 && items.every((i) => i.label.trim().length > 0);
