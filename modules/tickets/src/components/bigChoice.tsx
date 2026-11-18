import type { ReactNode } from "react";
import { Button, theme } from "antd";

// Big buttons to choose from (queue, ticket type): the first step of a new ticket in the app, on the kiosk board and on the public
// QR page. Platform (andon), new. `accent` colours the left edge by priority so a stop-the-line type reads at a glance.
export type Choice = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  accent?: string | null; // 'urgent' | 'high' | 'normal' | 'low'
  note?: ReactNode;
  disabled?: boolean;
};

export const BigChoice = ({
  choices,
  onPick,
  minWidth = 160,
  height = 88,
  fontSize = 17,
}: {
  choices: Choice[];
  onPick: (key: string) => void;
  minWidth?: number;
  height?: number;
  fontSize?: number;
}) => {
  const { token } = theme.useToken();
  const accentColor = (accent?: string | null) =>
    accent === "urgent" ? token.colorError : accent === "high" ? token.colorWarning : accent === "low" ? token.colorBorder : token.colorPrimary;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 12 }}>
      {choices.map((c) => (
        <Button
          key={c.key}
          block
          disabled={c.disabled}
          onClick={() => onPick(c.key)}
          style={{
            height,
            fontSize,
            whiteSpace: "normal",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 10,
            borderLeft: `6px solid ${accentColor(c.accent)}`,
          }}
        >
          {c.icon}
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.25 }}>
            <span>{c.label}</span>
            {c.note && <span style={{ fontSize: Math.max(12, fontSize - 5), opacity: 0.75 }}>{c.note}</span>}
          </span>
        </Button>
      ))}
    </div>
  );
};
