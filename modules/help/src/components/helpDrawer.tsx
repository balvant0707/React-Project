// Ported 1:1 from COMPASS (app/src/components/helpDrawer.tsx).
import { lazy, Suspense, useState } from "react";
import { Button, Drawer, Spin, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { loadHelpFiles } from "../help/sources";

// Header button of the context help. The manual itself (all chapter texts) is a lazy chunk, loaded on first open.
const Body = lazy(async () => {
  // Platform: the modules' chapters first (help/sources.ts), then the drawer that reads them.
  await loadHelpFiles();
  return import("./helpDrawerBody");
});

export const HelpButton = ({ size }: { size?: "large" }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title={t("help.contextHelp")}>
        <Button type="text" size={size} icon={<QuestionCircleOutlined />} aria-label={t("help.contextHelp")} onClick={() => setOpen(true)} />
      </Tooltip>
      <HelpDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
};

// The drawer alone, for opening it from elsewhere.
const HelpDrawer = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Drawer title={t("help.title")} open={open} onClose={onClose} width="min(560px, 100vw)" destroyOnClose>
      <Suspense fallback={<div style={{ textAlign: "center", padding: 24 }}><Spin /></div>}>
        <Body onClose={onClose} />
      </Suspense>
    </Drawer>
  );
};
