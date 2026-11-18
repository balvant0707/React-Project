// The header's Notes button, 1:1 from the NPM tool's components/header.tsx (desktop part): primary = panel open; hidden on
// pages without notes (admin); on lists it drives the separate list flag. Put into the platform header by the messaging module's
// headerItems.
import { Button } from "antd";
import { MessageOutlined } from "@ant-design/icons";
import { useIsMobile } from "@rbp/ui";
import { useNotesPanel } from "./notesPanelContext";

export const NotesHeaderButton = () => {
  const { open, toggle, effectiveEntity, pageKind } = useNotesPanel();
  const isMobile = useIsMobile();
  if (isMobile || !(effectiveEntity || pageKind === "list")) return null;
  return (
    <Button icon={<MessageOutlined />} type={open ? "primary" : "default"} onClick={toggle}>
      Notes
    </Button>
  );
};
