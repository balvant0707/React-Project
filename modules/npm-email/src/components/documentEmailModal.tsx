// Ported 1:1 from the NPM tool (app/src/components/documentEmailModal.tsx).
import { Modal } from "antd";
import { EmailDraftPanel } from "./emailDraftPanel";

// A record's document email (offer, order confirmation) edited and sent in a dialog on the record's page, like the
// availability request emails - the same shared draft the inbox shows (modules/email/documentEmail.ts starts it).
// Closing the dialog keeps the draft; it stays in the inbox until it is sent or discarded.
export function DocumentEmailModal({
  draftId,
  title,
  onClose,
  onSent,
}: {
  draftId: string | null;
  title: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  return (
    <Modal open={!!draftId} title={title} onCancel={onClose} footer={null} width={900} destroyOnHidden styles={{ body: { padding: 0 } }}>
      {draftId && (
        <div style={{ height: "70vh", display: "flex", flexDirection: "column" }}>
          <EmailDraftPanel
            key={draftId}
            draftId={draftId}
            onSent={() => {
              onSent?.();
              onClose();
            }}
            onDiscarded={onClose}
          />
        </div>
      )}
    </Modal>
  );
}
