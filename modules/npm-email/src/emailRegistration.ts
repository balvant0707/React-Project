// Hands the real email parts to the offer and order pages (offers' emailBridge, see modules/offers/src/emailBridge/emailBridge.tsx).
// Imported by this module's manifest, so it runs once when the email module is part of the app.
import { registerOfferEmail } from "@rbp/module-offers/src/emailBridge/emailBridge.tsx";
import { startCustomerDocumentEmail } from "./modules/email/documentEmail";
import { DocumentEmailModal } from "./components/documentEmailModal";
import { EntityEmailsPanel } from "./components/entityEmailsPanel";

registerOfferEmail({ startCustomerDocumentEmail, DocumentEmailModal, EntityEmailsPanel });
