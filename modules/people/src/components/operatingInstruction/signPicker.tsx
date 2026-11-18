// Ported 1:1 from COMPASS (app/src/components/operatingInstruction/signPicker.tsx).
import { useState } from "react";
import { Button, Modal, Space, Tooltip, Typography, theme } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { SIGN_GROUPS, SIGNS, SafetySign, type SignGroup } from "../../lib/safetySigns";

// The pictograms of one section: the chosen ones in a row, a dialog with every sign by group to click on and off.
// The groups the section suggests come first. Codes are language-independent.
export const SignPicker = ({
  value,
  onChange,
  groups,
  disabled,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  groups: SignGroup[];
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const order = [...groups, ...SIGN_GROUPS.filter((g) => !groups.includes(g))];
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <>
      <Space wrap size={6} align="center">
        {value.map((code) => (
          <Tooltip key={code} title={`${code} · ${t(`safetySigns.codes.${code}`)}`}>
            <span style={{ position: "relative", display: "inline-block" }}>
              <SafetySign code={code} size={40} />
              {!disabled && (
                <Button
                  size="small"
                  shape="circle"
                  icon={<CloseOutlined style={{ fontSize: 9 }} />}
                  aria-label={t("common.delete")}
                  onClick={() => toggle(code)}
                  style={{ position: "absolute", top: -6, right: -8, width: 18, height: 18, minWidth: 18 }}
                />
              )}
            </span>
          </Tooltip>
        ))}
        {!disabled && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            {t("operatingInstructions.signs.choose")}
          </Button>
        )}
      </Space>
      <Modal open={open} onCancel={() => setOpen(false)} footer={<Button type="primary" onClick={() => setOpen(false)}>{t("common.close")}</Button>} title={t("operatingInstructions.signs.title")} width={760}>
        {order.map((g) => (
          <div key={g} style={{ marginBottom: 16 }}>
            <Typography.Text strong>{t(`safetySigns.groups.${g}`)}</Typography.Text>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8, marginTop: 6 }}>
              {SIGNS.filter((s) => s.group === g).map((s) => {
                const on = value.includes(s.code);
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => toggle(s.code)}
                    aria-pressed={on}
                    title={t(`safetySigns.codes.${s.code}`)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 6, cursor: "pointer",
                      background: on ? token.colorPrimaryBg : "transparent",
                      border: `2px solid ${on ? token.colorPrimary : token.colorBorderSecondary}`, borderRadius: 8,
                    }}
                  >
                    <SafetySign code={s.code} size={44} />
                    <span style={{ fontSize: 11, color: token.colorText, lineHeight: 1.2, textAlign: "center" }}>{s.code}</span>
                    <span style={{ fontSize: 10, color: token.colorTextSecondary, lineHeight: 1.2, textAlign: "center" }}>{t(`safetySigns.codes.${s.code}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </Modal>
    </>
  );
};
