// Ported 1:1 from COMPASS (app/src/components/mobileSteps.tsx).
import { useState } from "react";
import { Steps, Typography, theme as antdTheme } from "antd";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

// Phone: the route of a task as one slim strip instead of a stepper whose titles wrap. One bar per step (done and
// current in the primary colour, the rest grey, red when cancelled), below it the current step with its position and
// who is up; a tap lists all steps.
export const MobileSteps = ({ items, current, status }: { items: { title: string; description?: string }[]; current: number; status: "process" | "error" | "done" }) => {
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  const [open, setOpen] = useState(false);
  const done = status === "done";
  const index = Math.min(current, items.length - 1);
  const now = items[index];
  const filled = (i: number) => done || i <= index;
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ display: "block", width: "100%", padding: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "inherit", font: "inherit" }}
      >
        <div style={{ display: "flex", gap: 4 }}>
          {items.map((_, i) => (
            <div
              key={i}
              style={{ flex: 1, height: 5, borderRadius: 3, background: filled(i) ? (status === "error" && i === index ? token.colorError : token.colorPrimary) : token.colorFillSecondary, opacity: filled(i) && i < index ? 0.55 : 1 }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
          <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
            {done ? t("tasks.stepsDone") : now?.title}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ flex: "none", fontSize: 12 }}>
            {Math.min(done ? items.length : index + 1, items.length)}/{items.length} {open ? <UpOutlined /> : <DownOutlined />}
          </Typography.Text>
        </div>
        {!done && now?.description && (
          <Typography.Text type="secondary" ellipsis style={{ display: "block", fontSize: 12 }}>
            {now.description}
          </Typography.Text>
        )}
      </button>
      {open && (
        <Steps
          direction="vertical"
          size="small"
          style={{ marginTop: 10 }}
          current={done ? items.length : index}
          status={status === "done" ? "process" : status}
          items={items.map((s) => ({ title: s.title, description: s.description }))}
        />
      )}
    </div>
  );
};
