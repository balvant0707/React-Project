// Ported 1:1 from COMPASS (app/src/components/offerTiles.tsx).
import { useState } from "react";
import { Card, Col, Empty, Input, Row, Typography, theme as antdTheme } from "antd";
import { RightOutlined, SearchOutlined } from "@ant-design/icons";
import { useIsMobile } from "@rbp/ui";
import { DEFAULT_TASK_TYPE_ICON, DEFAULT_TICKET_QUEUE_ICON, IconTile, iconFor } from "@rbp/ui";
import { usePalette } from "@rbp/ui";
import { matchesAllWords } from "@rbp/ui";


// A card: a task type, or a ticket queue the user may report in.
export type Offer = { kind: "task" | "ticket"; id: string; name: string; keywords: string | null; icon: string | null; color: string | null; label: string; summary: string | null };

// A searchable grid of cards with description, shared by "New request" and the task type choice of the task form.
// Enter opens the only hit. `caption` is the grey line under the title of a card (the start page marks ticket queues).
export const OfferTiles = ({
  offers,
  loading,
  placeholder,
  emptyText,
  noMatchText,
  caption,
  onPick,
}: {
  offers: Offer[];
  loading?: boolean;
  placeholder: string;
  emptyText: string;
  noMatchText: string;
  caption?: (o: Offer) => string | null;
  onPick: (o: Offer) => void;
}) => {
  const { swatch } = usePalette();
  const { token } = antdTheme.useToken();
  const isMobile = useIsMobile();
  const [term, setTerm] = useState("");
  const shown = offers.filter((x) => matchesAllWords([x.label, x.name, x.summary, x.keywords].join(" "), term));
  return (
    <>
      <Input
        size="large"
        allowClear
        // A phone would open its keyboard over the cards.
        autoFocus={!isMobile}
        prefix={<SearchOutlined />}
        placeholder={placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onPressEnter={() => shown.length === 1 && onPick(shown[0])}
        style={{ maxWidth: 640, marginBottom: isMobile ? 12 : 24 }}
      />
      {shown.length && isMobile ? (
        // Phone: one card per line, icon on the left, a chevron on the right.
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map((x) => {
            const line = caption?.(x);
            return (
              <div
                key={`${x.kind}-${x.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onPick(x)}
                onKeyDown={(e) => e.key === "Enter" && onPick(x)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 12px 14px 14px", cursor: "pointer", background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderLeft: `3px solid ${swatch(x.color).dot}`, borderRadius: 12 }}
              >
                <IconTile icon={iconFor(x.icon, x.kind === "ticket" ? DEFAULT_TICKET_QUEUE_ICON : DEFAULT_TASK_TYPE_ICON)} color={x.color} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.3 }}>{x.label}</div>
                  {line ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{line}</Typography.Text> : null}
                  {x.summary ? <div style={{ color: token.colorTextSecondary, fontSize: 14, marginTop: 2 }}>{x.summary}</div> : null}
                </div>
                <RightOutlined style={{ color: token.colorTextTertiary }} />
              </div>
            );
          })}
        </div>
      ) : shown.length ? (
        <Row gutter={[16, 16]}>
          {shown.map((x) => {
            const line = caption?.(x);
            return (
              <Col key={`${x.kind}-${x.id}`} xs={24} sm={12} lg={8} xxl={6}>
                {/* The icon in its colour (task type or ticket queue), and a thin edge in the same colour: told apart at a glance, still quiet. */}
                <Card hoverable style={{ height: "100%", borderLeft: `3px solid ${swatch(x.color).dot}` }} onClick={() => onPick(x)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: x.summary ? 8 : 0 }}>
                    <IconTile icon={iconFor(x.icon, x.kind === "ticket" ? DEFAULT_TICKET_QUEUE_ICON : DEFAULT_TASK_TYPE_ICON)} color={x.color} size={36} />
                    <div>
                      <Typography.Title level={5} style={{ margin: 0 }}>{x.label}</Typography.Title>
                      {line ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{line}</Typography.Text> : null}
                    </div>
                  </div>
                  {x.summary ? <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>{x.summary}</Typography.Paragraph> : null}
                </Card>
              </Col>
            );
          })}
        </Row>
      ) : loading ? null : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={term ? noMatchText : emptyText} />
      )}
    </>
  );
};
