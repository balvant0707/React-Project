// Ported 1:1 from COMPASS (app/src/components/actionBar.tsx).
import type { ReactNode } from "react";
import { Button, Space, theme as antdTheme } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@rbp/ui";
import { bottomBarStyle, useHideBottomTabs } from "@rbp/core";

// The main actions of a detail page. Desktop: inline (top right). Phone: pinned to the bottom in place of the bottom
// tabs, with "Back" on the left (the page saves every field at once). `back` is the page to go to when there is no
// history.
export const ActionBar = ({ children, back }: { children: ReactNode; back?: string }) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = antdTheme.useToken();
  useHideBottomTabs(isMobile);
  if (!isMobile) return <Space wrap>{children}</Space>;
  // React Router keeps the position in its own history in `idx`; 0 means the page was opened directly (link, push).
  const goBack = () => ((window.history.state?.idx ?? 0) > 0 || !back ? navigate(-1) : navigate(back));
  return (
    <>
      <div
        data-bottom-bar
        style={{
          ...bottomBarStyle(token),
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "flex-end",
          padding: "10px 14px",
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={goBack} style={{ marginRight: "auto" }}>
          {t("common.back")}
        </Button>
        {children}
      </div>
    </>
  );
};
