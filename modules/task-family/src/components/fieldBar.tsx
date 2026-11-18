// Ported 1:1 from COMPASS (app/src/components/fieldBar.tsx).
import { useState, type ReactNode } from "react";
import { Button, Typography, theme as antdTheme } from "antd";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@rbp/ui";

// `secondary`: folded behind "More details" on a phone. `wide`: takes the whole row on a phone (wide inputs).
type BarField = { label: string; value: ReactNode; hidden?: boolean; secondary?: boolean; wide?: boolean };

// Compact row of label/value pairs at the top of a detail page. Detail pages have few fields;
// the activity feed below is the main area. On a phone: two columns, the rarely needed fields folded away.
// `phone`: opt in to the phone layout (inputs must then fill their cell); other pages keep the wrapping row.
// `inCard`: sits inside a card that brings its own frame; on a computer the fields form a grid that fills the width
// (a `wide` field takes two cells).
export const FieldBar = ({ fields, phone = false, inCard = false }: { fields: BarField[]; phone?: boolean; inCard?: boolean }) => {
  const { token } = antdTheme.useToken();
  const { t } = useTranslation();
  const isMobile = useIsMobile() && phone;
  const [expanded, setExpanded] = useState(false);
  const shown = fields.filter((f) => !f.hidden);
  const folded = isMobile ? shown.filter((f) => f.secondary) : [];
  // On a phone the folded fields open below the others, never in between: the card only grows downwards. The toggle sits
  // between the two groups, so it stays where it was tapped.
  const primary = isMobile ? shown.filter((f) => !f.secondary) : shown;
  const grid = inCard && !isMobile;
  const renderField = (f: BarField) => (
    <div key={f.label} style={{ minWidth: isMobile || grid ? 0 : 100, gridColumn: f.wide ? (isMobile ? "1 / -1" : grid ? "span 2" : undefined) : undefined }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
        {f.label}
      </Typography.Text>
      <div>{f.value ?? "—"}</div>
    </div>
  );
  return (
    <div
      className={isMobile ? "field-bar-phone" : undefined}
      style={{
        display: isMobile || grid ? "grid" : "flex",
        gridTemplateColumns: isMobile ? "minmax(0, 1fr) minmax(0, 1fr)" : grid ? "repeat(auto-fill, minmax(200px, 1fr))" : undefined,
        flexWrap: "wrap",
        gap: isMobile ? "10px 12px" : grid ? "14px 24px" : "12px 32px",
        ...(inCard ? {} : { padding: isMobile ? "10px 12px" : "12px 16px", background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }),
      }}
    >
      {primary.map(renderField)}
      {folded.length > 0 && (
        <Button type="link" size="small" style={{ gridColumn: "1 / -1", justifySelf: "start", padding: 0 }} onClick={() => setExpanded(!expanded)}>
          {expanded ? t("common.fewerDetails") : t("common.moreDetails", { count: folded.length })}
        </Button>
      )}
      {expanded && folded.map(renderField)}
    </div>
  );
};
