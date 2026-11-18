// Ported 1:1 from the NPM tool (supabase/functions/email-oauth-authorize/index.ts).
// Step 2a of ~/npm_tool/docs/email-outbound-connection-plan.md. Kicks off the
// "Connect"/"Reconnect" flow from the mailbox admin UI: a full-page browser
// navigation (not a fetch - Microsoft's consent screen needs the real
// browser, cookies and all), so the caller's Supabase JWT rides along in a
// form-encoded POST body rather than an Authorization header. Verifies the caller is
// an Admin, then 302s to Microsoft's consent screen with a signed state
// token carrying which mailbox this connection is for.
import { requireAdminFromToken, serviceClient, signState } from "../_shared/msgraph.ts";
import { authorizeUrl } from "../_shared/msgraph.ts";

Deno.serve(async (req) => {
  // The caller's JWT arrives in a form-encoded POST body (the page submits a form), never in the URL, so it
  // cannot end up in proxy logs or browser history.
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const form = await req.formData().catch(() => null);
  const mailboxId = form?.get("mailbox_id")?.toString() ?? null;
  const token = form?.get("token")?.toString() ?? null;

  if (!mailboxId) return new Response("mailbox_id is required", { status: 400 });

  const admin = await requireAdminFromToken(token);
  if (!admin) return new Response("Admin access required", { status: 403 });

  const { data: mailbox } = await serviceClient()
    .from("mailboxes")
    .select("id")
    .eq("id", mailboxId)
    .maybeSingle();
  if (!mailbox) return new Response("Mailbox not found", { status: 404 });

  const state = await signState({
    mailbox_id: mailboxId,
    user_id: admin.id,
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  });

  return new Response(null, { status: 302, headers: { Location: authorizeUrl(state) } });
});
