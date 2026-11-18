// From COMPASS pages/admin/configuration: one card per configuration page, as a scannable grid instead of a flat menu entry per
// table. The core brings the pages of the platform (settings, email, phrases); modules add theirs through configurationCards.
import { Card, Col, Row, Typography } from "antd";
import { MailOutlined, SettingOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconTile } from "@rbp/ui";
import { IconSettings } from "@tabler/icons-react";
import { useShell } from "../shell/ShellContext";

export const ConfigurationPage = () => {
  const { t } = useTranslation();
  const { configurationCards } = useShell();
  const cards = [
    { key: "settings", to: "/admin/settings", title: t("admin.settings.title"), description: t("admin.settings.description"), icon: <SettingOutlined /> },
    { key: "email", to: "/admin/email", title: t("admin.email.title"), description: t("admin.email.description"), icon: <MailOutlined /> },
    { key: "phrases", to: "/admin/phrases", title: t("admin.phrases.title"), description: t("admin.phrases.description"), icon: <SettingOutlined /> },
    // A module card's title and description are i18n keys or plain text.
    ...configurationCards.map((c) => ({ ...c, title: t(c.title, { defaultValue: c.title }), description: c.description && t(c.description, { defaultValue: c.description }) })),
  ];
  return (
    <Row gutter={[16, 16]}>
      {cards.map((card) => (
        <Col key={card.key} xs={24} sm={12} lg={8}>
          <Link to={card.to} style={{ display: "block" }}>
            <Card hoverable size="small">
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <IconTile icon={IconSettings} color="navy" size={44} />
                <div>
                  <Typography.Text strong>{card.title}</Typography.Text>
                  <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{card.description}</Typography.Text></div>
                </div>
              </div>
            </Card>
          </Link>
        </Col>
      ))}
    </Row>
  );
};
