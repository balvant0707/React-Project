// Mail transport 'graph' (platform/functions/_shared/smtp.ts relays here when email_settings.transport = 'graph'): one mail
// through the mailbox in transport_config.mailbox_id, not saved to Sent Items; a 401/403 flags its connection. From NPM's
// sendViaGraph (_shared/systemEmail.ts). Service role only; MAIL_TRANSPORT_DRY_RUN=true only logs.
import { getValidAccessToken, serviceClient } from "../_shared/msgraph.ts";
import { sameSecret } from "../_shared/secret.ts";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DRY_RUN = (Deno.env.get("MAIL_TRANSPORT_DRY_RUN") ?? "").toLowerCase() === "true";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Body = { to?: string; subject?: string; text?: string; html?: string; config?: { mailbox_id?: string } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !sameSecret(token, SERVICE_ROLE_KEY)) return json({ ok: false, error: "Forbidden" }, 403);
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const to = (body.to ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || !body.subject) return json({ ok: false, error: "Recipient or subject missing" }, 400);
  const mailboxId = body.config?.mailbox_id;
  if (!mailboxId) return json({ ok: false, error: "No sender mailbox chosen (Admin > Configuration > Email)" });

  const svc = serviceClient();
  const { data: mailbox } = await svc.from("mailboxes").select("address").eq("id", mailboxId).maybeSingle();
  if (!mailbox) return json({ ok: false, error: "Sender mailbox not found" });
  if (DRY_RUN) {
    console.log(`mail-transport-graph dry run: ${mailbox.address} -> ${to}: ${body.subject}`);
    return json({ ok: true, dry_run: true });
  }

  try {
    const accessToken = await getValidAccessToken(svc, mailboxId);
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox.address)}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: body.subject,
          body: { contentType: "HTML", content: body.html || `<pre>${(body.text ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>` },
          // Exactly one recipient, never Cc/Bcc: a system mail is addressed to one person.
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: false,
      }),
    });
    if (res.ok) return json({ ok: true });
    const detail = `Graph sendMail failed: ${res.status} ${await res.text()}`;
    if (res.status === 401 || res.status === 403) {
      await svc.from("mailbox_connections").update({ status: "error", last_error: detail, last_error_at: new Date().toISOString() }).eq("mailbox_id", mailboxId);
    }
    return json({ ok: false, error: detail });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
