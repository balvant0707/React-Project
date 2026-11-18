// List page frame of both apps (docs/shared-parts.md): COMPASS's page head (app/src/components/crud.tsx) with the NPM
// tool's table (@rbp/ui ListTable). Changed from COMPASS: imports; the head is not sticky (freeze panes pin it); the band
// uses the app's primary colour; RedPrimary / FloatingAddButton -> @rbp/ui's FloatingAddButton.
import { useContext, useEffect, type ComponentProps, type ReactNode } from "react";
import { Button, ConfigProvider, Space, Typography, theme as antdTheme } from "antd";
import { ArrowLeftOutlined, PlusOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { Show as RefineShow } from "@refinedev/antd";
import { useResourceParams } from "@refinedev/core";
import { ColorModeContext, FloatingAddButton, useIsMobile } from "@rbp/ui";
import { HintIcon } from "./hintIcon";
import { usePageTitle } from "../shell/usePageTitle";
import { usePageBannerTitle } from "../shell/pageBannerContext";

type PageProps = {
  // Defaults to the current resource's (translated) nav label; pass `false` to hide.
  title?: ReactNode | false;
  subtitle?: ReactNode;
  // Explanation of the page, shown as a small question mark next to the title (tooltip, dialog on a phone). Prefer it over a subtitle.
  hint?: ReactNode;
  headerButtons?: ReactNode;
  // Main action: last header button on a computer, first button below the band on a phone (a "new" action uses
  // `FloatingAddButton` instead).
  action?: ReactNode;
  // Phone: an arrow in the band that leads back (a page reached from another one).
  onBack?: () => void;
  // Row under the title (e.g. filter chips); makes the page a list page.
  toolbar?: ReactNode;
  children?: ReactNode;
};

// Phone: the page head as a full-width dark band (back arrow, title, hint, subtitle); controls stay below it. Used by
// `Page` and full-screen dialogs.
export const PageBand = ({ title, hint, subtitle, onBack }: { title?: ReactNode; hint?: ReactNode; subtitle?: ReactNode; onBack?: () => void }) => {
  const { t } = useTranslation();
  const { mode } = useContext(ColorModeContext);
  // Dark mode: the raised surface of the dark theme (the CI blue would sink into the dark page).
  const { token } = antdTheme.useToken();
  return (
    <ConfigProvider theme={{ token: { colorLink: "#ffffff", colorLinkHover: "#ffffff" } }}>
      <div className="page-band" style={{ background: mode === "dark" ? token.colorBgElevated : token.colorPrimary }}>
        {(title || onBack) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {onBack && (
              <button type="button" className="page-band-back" aria-label={t("common.back")} onClick={onBack}>
                <ArrowLeftOutlined />
              </button>
            )}
            {title ? (
              <Typography.Title level={3} style={{ margin: 0, color: "#ffffff", minWidth: 0, overflowWrap: "anywhere" }}>
                {title}
                {hint ? <span className="page-band-hint" style={{ marginLeft: 8 }}><HintIcon>{hint}</HintIcon></span> : null}
              </Typography.Title>
            ) : null}
          </div>
        )}
        {subtitle ? <div className="page-band-subtitle">{subtitle}</div> : null}
      </div>
    </ConfigProvider>
  );
};

// Plain page chrome: title row with actions on the right, content below. On a phone the head is a `PageBand`.
export const Page = ({ title, subtitle, hint, headerButtons, action, onBack, toolbar, children }: PageProps) => {
  const { resource } = useResourceParams();
  usePageTitle(typeof title === "string" ? title : undefined);
  const isMobile = useIsMobile();
  // Platform: the shell's page banner carries the title, the page draws no heading of its own.
  const heading = title === undefined ? resource?.meta?.label : title;
  usePageBannerTitle(heading === false ? undefined : heading);
  if (isMobile) {
    return (
      <div>
        {(onBack || subtitle || hint) && <PageBand title={hint ? <HintIcon>{hint}</HintIcon> : null} subtitle={subtitle} onBack={onBack} />}
        {action || headerButtons ? <div style={{ marginBottom: 12 }}><Space wrap>{action}{headerButtons}</Space></div> : null}
        {toolbar ? <div style={{ marginBottom: 12 }}>{toolbar}</div> : null}
        {children}
      </div>
    );
  }
  // Not sticky here: ListTable's freeze panes pin the head on a tall screen.
  return (
    <div>
      {(hint || subtitle || headerButtons || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: toolbar ? 12 : 16 }}>
          <div>
            {hint ? <HintIcon>{hint}</HintIcon> : null}
            {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
          </div>
          {headerButtons || action ? <Space wrap>{headerButtons}{action}</Space> : null}
        </div>
      )}
      {toolbar ? <div style={{ marginBottom: 12 }}>{toolbar}</div> : null}
      {children}
    </div>
  );
};

// A list page. NPM pages' filter chips (their old `title`) arrive as `toolbar`.
export const List = Page;

// Detail pages keep Refine's Show (the NPM tool's crud.tsx) until the editing style is decided (docs/shared-parts.md).
export const Show = (props: ComponentProps<typeof RefineShow>) => <RefineShow {...props} title={false} />;

// A list page's "new" action: a primary button on a computer, the round + button on a phone (which reserves bottom
// padding so the last card stays clear).
export const NewButton = ({ label, onClick }: { label: string; onClick: () => void }) => {
  const isMobile = useIsMobile();
  useEffect(() => {
    const content = document.getElementById("page-content");
    if (!isMobile || !content) return;
    content.style.paddingBottom = "72px";
    return () => {
      content.style.paddingBottom = "";
    };
  }, [isMobile]);
  if (!isMobile) {
    return (
      <Button type="primary" icon={<PlusOutlined />} onClick={onClick}>
        {label}
      </Button>
    );
  }
  return <FloatingAddButton label={label} onClick={onClick} spacer={false} />;
};
