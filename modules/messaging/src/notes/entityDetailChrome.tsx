// Moved from npm-base into messaging on 2026-11-13; from the NPM tool (app/src/components/entityDetailChrome.tsx). Hand-owned now.
import type { PropsWithChildren } from "react";
import { useEntityNotes } from "./notesPanelContext";
import { requireEntityType } from "@rbp/core";
import { AttachmentsPanel } from "./attachmentsPanel";

// Wraps a detail page's content: registers the record with the notes panel and puts Attachments at the bottom (per
// entityConfig.ts). A page that places Attachments itself (e.g. a tab on the company page) passes
// renderAttachments={false}.
export const EntityDetailChrome = ({
  entityType,
  entityId,
  isNew,
  renderAttachments = true,
  children,
}: PropsWithChildren<{
  entityType: string;
  entityId: string | null | undefined;
  isNew?: boolean;
  renderAttachments?: boolean;
}>) => {
  const id = isNew ? null : (entityId ?? null);
  useEntityNotes(entityType, id);
  const config = requireEntityType(entityType);

  return (
    <>
      {children}
      {renderAttachments && id && config?.attachments && <AttachmentsPanel entityType={entityType} entityId={id} />}
    </>
  );
};
