// From COMPASS app/src/components/hintIcon.tsx (was in the messaging module; the core list frame uses it).
import { useState, type ReactNode } from "react";
import { Modal, Tooltip, theme as antdTheme } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@rbp/ui";

// Small grey question mark for explanations that would otherwise sit as text on the page. Desktop: tooltip on hover or
// focus. Phone (no hover): a tap opens the text in a dialog.
export const HintIcon = ({ children, size = 15 }: { children: ReactNode; size?: number }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const icon = (
    <span
      role="button"
      tabIndex={0}
      aria-label={t("common.hint")}
      onClick={isMobile ? () => setOpen(true) : undefined}
      onKeyDown={isMobile ? (e) => (e.key === "Enter" || e.key === " ") && setOpen(true) : undefined}
      style={{ display: "inline-flex", alignItems: "center", color: token.colorTextTertiary, fontSize: size, cursor: isMobile ? "pointer" : "help", verticalAlign: "middle" }}
    >
      <QuestionCircleOutlined />
    </span>
  );
  if (!isMobile) return <Tooltip title={children}>{icon}</Tooltip>;
  return (
    <>
      {icon}
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={null} centered width={360} closable>
        <div style={{ paddingTop: 8 }}>{children}</div>
      </Modal>
    </>
  );
};
