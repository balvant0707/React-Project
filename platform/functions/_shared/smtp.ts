// Ported 1:1 from COMPASS (supabase/functions/_shared/smtp.ts).
// SMTP sending with the app's e-mail settings (public.email_settings, read with the service role through
// email_runtime_settings). Used by send-emails (digest, test mail) and by the password links (login-help,
// person-grant-login).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export type Settings = {
  enabled: boolean; host: string | null; port: number; security: "starttls" | "ssl" | "none"; username: string | null;
  password: string | null; from_address: string | null; from_name: string; app_url: string | null; dispatch_token: string;
  // platform: how mails leave (public.email_transports): 'smtp' here, any other key is relayed to the Edge Function
  // mail-transport-<key> of the module that registered it (npm-email: 'graph', a Microsoft 365 mailbox).
  transport?: string; transport_config?: Record<string, unknown>;
  // platform: the app's mail colour (email_settings.brand_color); the logo is the app's branding/mail-logo.png.
  brand_color?: string | null;
};

// platform: top border, buttons and links of the app's mails; without a setting the red the mails had before.
export const brandColor = (s: Settings) => (/^#[0-9a-f]{6}$/i.test(s.brand_color ?? "") ? s.brand_color! : "#ed1c29");

// platform: a transport other than SMTP. The function gets the mail and the transport's settings, answers {ok, error}.
async function relaySend(s: Settings, to: string, subject: string, text: string, html: string) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/mail-transport-${s.transport}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ to, subject, text, html, from_name: s.from_name, config: s.transport_config ?? {} }),
  });
  const body = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `mail-transport-${s.transport}: HTTP ${res.status}`);
}

// platform: whether mails go through a relayed transport (the digest paces those, see send-emails).
export const isRelayed = (s: Settings) => !!s.transport && s.transport !== "smtp";

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function smtpSend(s: Settings, to: string, subject: string, text: string, html: string) {
  if (isRelayed(s)) return relaySend(s, to, subject, text, html);
  if (!s.host || !s.from_address) throw new Error("SMTP host or sender address missing");
  const client = new SMTPClient({
    connection: {
      hostname: s.host,
      port: s.port,
      tls: s.security === "ssl",
      auth: s.username ? { username: s.username, password: s.password ?? "" } : undefined,
    },
    // "none" is an explicit admin choice (local test inbox, internal relay); otherwise denomailer insists on TLS
    // (implicit for ssl, STARTTLS upgrade for starttls).
    debug: { allowUnsecure: s.security === "none" },
  });
  try {
    await client.send({ from: `${s.from_name} <${s.from_address}>`, to, subject, content: text, html });
  } catch (e) {
    console.error("smtp send failed", e instanceof Error ? e.stack : e);
    throw e;
  } finally {
    try {
      await client.close();
    } catch {
      /* closing a connection that is already gone */
    }
  }
}
