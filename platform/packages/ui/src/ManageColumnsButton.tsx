import { useState } from "react";
import { Button, Modal, Checkbox } from "antd";
import { useTranslation } from "react-i18next";
import { SettingOutlined } from "@ant-design/icons";
import { useIsMobile } from "./hooks/useIsMobile";

// Button + modal to pick a list's optional columns ({key, label} pairs; the page renders them). Texts as in COMPASS
// (components/manageColumnsButton.tsx).
export function ManageColumnsButton({
  options,
  visible,
  onChange,
}: {
  options: { key: string; label: string }[];
  visible: string[];
  onChange: (keys: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // A phone shows cards, not columns: nothing to choose there (as in COMPASS).
  const isMobile = useIsMobile();
  if (isMobile) return null;

  return (
    <>
      <Button icon={<SettingOutlined />} onClick={() => setOpen(true)}>
        {t("filters.columns", { defaultValue: "Columns" })}
      </Button>
      <Modal
        title={t("filters.manageColumns", { defaultValue: "Manage columns" })}
        open={open}
        onCancel={() => setOpen(false)}
        footer={<Button type="primary" onClick={() => setOpen(false)}>{t("filters.done", { defaultValue: "Done" })}</Button>}
      >
        <Checkbox.Group
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          options={options.map((o) => ({ label: o.label, value: o.key }))}
          value={visible}
          onChange={(v) => onChange(v as string[])}
        />
      </Modal>
    </>
  );
}
