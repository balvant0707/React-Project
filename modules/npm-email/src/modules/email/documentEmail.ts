// Ported 1:1 from the NPM tool (app/src/modules/email/documentEmail.ts).
import type { MessageInstance } from "antd/es/message/interface";
import { supabaseClient } from "@rbp/core";
import { paragraphs } from "@rbp/ui";
import { createNewEmailDraft, uploadDraftAttachment, type EmailLink } from "./drafts";

// Starts a shared email draft about a record with its PDF attached and the text prefilled; the caller opens it in
// the inbox (/inbox?draft=<id>), where it is checked and sent (the mailbox signature is added on sending).
// warning: the draft exists but the PDF or the text could not be added.
export async function startDocumentEmail(args: {
  userId: string;
  link: EmailLink;
  to: string[];
  subject: string;
  bodyHtml?: string;
  document?: { build: () => Promise<{ blob: Blob; filename: string }> };
}): Promise<{ draftId?: string; error?: string; warning?: string }> {
  const { id, error } = await createNewEmailDraft(args.userId, { links: [args.link], to: args.to, subject: args.subject });
  if (error || !id) return { error: error ?? "Could not start the email" };
  const warnings: string[] = [];
  if (args.bodyHtml) {
    const { error: bodyError } = await supabaseClient.from("email_thread_drafts").update({ body_html: args.bodyHtml, updated_by_user_id: args.userId }).eq("id", id);
    if (bodyError) warnings.push(`the text could not be added: ${bodyError.message}`);
  }
  if (args.document) {
    try {
      const { blob, filename } = await args.document.build();
      const { error: attachError } = await uploadDraftAttachment(id, blob, filename, args.userId);
      if (attachError) warnings.push(`the PDF could not be attached: ${attachError}`);
    } catch (e: any) {
      warnings.push(`the PDF could not be built: ${e.message ?? "unknown error"}`);
    }
  }
  return { draftId: id, warning: warnings.length > 0 ? `The email is started, but ${warnings.join("; ")}` : undefined };
}

// The company's email address, as a recipient list.
export async function companyEmailAddresses(companyId: string | null | undefined): Promise<string[]> {
  if (!companyId) return [];
  const { data } = await supabaseClient.from("companies").select("email").eq("id", companyId).maybeSingle();
  return data?.email ? [data.email] : [];
}

// The email of an offer or an order to its customer: To = the customer company's address, a short letter around
// `text` ("Dear <contact person>, ... Kind regards," - the mailbox signature follows on sending) and the PDF
// attached. Starts the draft and returns its id; the page opens it in components/documentEmailModal.tsx. Failures and
// warnings go to the message bar (null = no draft).
export async function startCustomerDocumentEmail(
  args: {
    userId: string;
    link: EmailLink;
    customerCompanyId: string | null | undefined;
    contactPerson: string | null | undefined;
    subject: string;
    text: string;
    document: { build: () => Promise<{ blob: Blob; filename: string }> };
  },
  ui: { message: MessageInstance },
): Promise<string | null> {
  const result = await startDocumentEmail({
    userId: args.userId,
    link: args.link,
    to: await companyEmailAddresses(args.customerCompanyId),
    subject: args.subject,
    bodyHtml: paragraphs(`Dear ${args.contactPerson?.trim() || "Sir or Madam"},\n\n${args.text}\n\nKind regards,`),
    document: args.document,
  });
  if (result.error || !result.draftId) {
    ui.message.error(result.error ?? "Could not start the email");
    return null;
  }
  if (result.warning) ui.message.warning(result.warning);
  return result.draftId;
}
