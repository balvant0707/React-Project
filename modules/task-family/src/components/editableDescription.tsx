// Ported 1:1 from COMPASS (app/src/components/editableDescription.tsx).
import { useState } from "react";
import { Button, Space } from "antd";
import { EditOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { RichTextEditor, RichTextView } from "@rbp/module-messaging/src/richText.tsx";

// Instructions / description that can be edited in place with the rich text editor. Read only (or no right to edit):
// just the formatted text. `flush`: no space above (inside a card).
export const EditableDescription = ({ value, editable, onSave, flush = false }: { value: string | null; editable: boolean; onSave: (value: string | null) => void | Promise<void>; flush?: boolean }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  if (!value && !editable) return null;

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = async () => {
    setEditing(false);
    if ((draft || null) !== (value || null)) await onSave(draft || null);
  };

  if (editing) {
    return (
      <div style={{ marginTop: flush ? 0 : 16 }}>
        <RichTextEditor autoFocus value={draft} onChange={setDraft} placeholder={t("richText.instructionsPlaceholder")} minHeight={160} />
        <Space style={{ marginTop: 6 }}>
          <Button size="small" type="primary" onClick={() => void save()}>{t("common.save")}</Button>
          <Button size="small" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
        </Space>
      </div>
    );
  }

  return (
    <div style={{ marginTop: flush ? 0 : 16, position: "relative" }}>
      {value ? <RichTextView value={value} /> : null}
      {editable && (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={start} style={{ paddingLeft: 0 }}>
          {value ? t("common.edit") : t("tasks.addDescription")}
        </Button>
      )}
    </div>
  );
};
