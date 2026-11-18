// The email parts of the offer and order pages belong to npm-email, above offers. The pages import them from here;
// npm-email registers the real ones (registerOfferEmail). Without it: no Emails
// content, and "email is not set up" for the document email.
import type { ComponentType } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import { Empty } from "antd";

export type EmailLink = { entity_type: string; entity_id: string };
export type PdfDocument = { build: () => Promise<{ blob: Blob; filename: string }> };

export type StartCustomerDocumentEmail = (
  args: {
    userId: string;
    link: EmailLink;
    customerCompanyId: string | null | undefined;
    contactPerson: string | null | undefined;
    subject: string;
    text: string;
    document: PdfDocument;
  },
  ui: { message: MessageInstance },
) => Promise<string | null>;

export type DocumentEmailModalProps = { draftId: string | null; title: string; onClose: () => void; onSent?: () => void };

export type EntityEmailsPanelProps = {
  entityType: "specifications" | "orders";
  entityId: string;
  canEdit?: boolean;
  contactCompanyId?: string | null;
  subjectHint?: string | null;
  documents?: { key: string; label: string; build: () => Promise<{ blob: Blob; filename: string }> }[];
};

type OfferEmail = {
  startCustomerDocumentEmail: StartCustomerDocumentEmail;
  DocumentEmailModal: ComponentType<DocumentEmailModalProps>;
  EntityEmailsPanel: ComponentType<EntityEmailsPanelProps>;
};

let impl: OfferEmail | null = null;

/** Called once by the email module when it loads (its module.tsx). */
export const registerOfferEmail = (email: OfferEmail) => {
  impl = email;
};

export const startCustomerDocumentEmail: StartCustomerDocumentEmail = async (args, ui) => {
  if (!impl) {
    ui.message.info("Email is not set up in this app.");
    return null;
  }
  return impl.startCustomerDocumentEmail(args, ui);
};

export function DocumentEmailModal(props: DocumentEmailModalProps) {
  const C = impl?.DocumentEmailModal;
  return C ? <C {...props} /> : null;
}

export function EntityEmailsPanel(props: EntityEmailsPanelProps) {
  const C = impl?.EntityEmailsPanel;
  return C ? <C {...props} /> : <Empty description="Email is not set up in this app" />;
}
