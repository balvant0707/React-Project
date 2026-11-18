// Ported 1:1 from COMPASS (supabase/functions/send-emails/index.ts).
// Email delivery over SMTP. Two callers:
//   POST {action:"dispatch"}  header x-dispatch-token  -> the database schedule (once the daily digest time has passed):
//                                                         one digest per person with what is still unread, then marks it sent
//   POST {action:"test", to}  header Authorization     -> an admin on the Email settings page: one test mail
// The settings (host, user, password, sender) live in public.email_settings and are read with the service role.
import { createClient } from "npm:@supabase/supabase-js@2";
import NOTIFICATION_TEXTS from "../_shared/notification-texts.json" with { type: "json" };
import { brandColor, esc, isRelayed, smtpSend, type Settings } from "../_shared/smtp.ts";
import { sameSecret } from "../_shared/secret.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, x-dispatch-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Pending = { id: string; user_id: string; email: string; language: string | null; type: string; title: string; body: string | null; link: string | null; params: Record<string, unknown>; created_at: string };

// The same texts as notifications.types in the app's locale files (scripts/check-i18n.mjs keeps them equal; unknown
// types fall back to the title).
const TEXTS = NOTIFICATION_TEXTS as Record<"de" | "en", Record<string, string>>;
// Types whose line is only "somebody wrote": the digest adds the message excerpt.
// platform: {APP}'s group_post / group_comment are team_post / team_comment.
const MESSAGE_BODY_TYPES = ["mention", "comment", "direct_message", "group_post", "group_comment", "team_post", "team_comment", "team_mention"];
const UI = {
  de: { subject: (n: number) => (n === 1 ? "{APP}: 1 ungelesene Benachrichtigung" : `{APP}: ${n} ungelesene Benachrichtigungen`), open: "Öffnen", openApp: "{APP} öffnen", heading: (n: number) => (n === 1 ? "1 ungelesene Benachrichtigung" : `${n} ungelesene Benachrichtigungen`), intro: "Das hat sich getan, seit du zuletzt nachgesehen hast:", footer: "Das ist die Tageszusammenfassung deiner heute noch ungelesenen Benachrichtigungen. Im Profil kannst du E-Mails abschalten.", testSubject: "{APP}: Test-E-Mail", testBody: "Diese Test-E-Mail zeigt, dass der Versand funktioniert." },
  en: { subject: (n: number) => (n === 1 ? "{APP}: 1 unread notification" : `{APP}: ${n} unread notifications`), open: "Open", openApp: "Open {APP}", heading: (n: number) => (n === 1 ? "1 unread notification" : `${n} unread notifications`), intro: "This is what happened since you last looked:", footer: "This is the daily summary of your notifications that are still unread today. You can switch mails off in your profile.", testSubject: "{APP}: test email", testBody: "This test email shows that sending works." },
};

const fill = (tpl: string, params: Record<string, unknown>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ""));
const lang = (l: string | null): "de" | "en" => (l === "en" ? "en" : "de");
// platform: the product name in the texts is the sender name of the e-mail settings (e.g. RADAR), the language the
// settings' one when the person has none (email_settings.language).
type AppSettings = Settings & { from_name?: string | null; language?: string | null };
const appName = (s: Settings) => (s as AppSettings).from_name || "the platform";
const mailLang = (l: string | null, s: Settings) => lang(l ?? (s as AppSettings).language ?? null);


function digest(s: Settings, items: Pending[]) {
  const l = mailLang(items[0].language, s);
  // platform: the app's colour from the e-mail settings (unset: the red of the auth mails)
  const BRAND = brandColor(s);
  const ui = UI[l];
  const base = (s.app_url ?? "").replace(/\/+$/, "");
  const rows = items.map((n) => {
    const tpl = TEXTS[l][n.type];
    const line = tpl ? fill(tpl, n.params) : n.title;
    const url = n.link && base ? base + n.link : null;
    return { line, url, body: MESSAGE_BODY_TYPES.includes(n.type) ? n.body : null };
  });
  const text = rows.map((r) => `- ${r.line}${r.body ? `\n  ${r.body}` : ""}${r.url ? `\n  ${r.url}` : ""}`).join("\n") + `\n\n${ui.footer}`;
  const card = (r: (typeof rows)[number]) => `<tr><td style="padding:0 0 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;border-left:3px solid ${BRAND};border-radius:4px"><tr><td style="padding:12px 14px">
<div style="font-size:15px;line-height:21px;font-weight:bold;color:#1a2b3c">${esc(r.line)}</div>
${r.body ? `<div style="margin-top:4px;font-size:13px;line-height:19px;color:#666">${esc(r.body)}</div>` : ""}
${r.url ? `<div style="margin-top:8px"><a href="${esc(r.url)}" style="font-size:13px;font-weight:bold;color:${BRAND};text-decoration:none">${ui.open} &rarr;</a></div>` : ""}
</td></tr></table></td></tr>`;
  const html = `<!doctype html>
<html lang="${l}"><body style="margin:0;padding:0;background:#f4f5f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;border-top:4px solid ${BRAND};font-family:Arial,Helvetica,sans-serif">
${base ? `<tr><td style="padding:24px 32px 0"><img src="${esc(base)}/mail-logo.png" alt="{APP}" width="150" style="display:block;border:0;width:150px;height:auto"></td></tr>` : ""}
<tr><td style="padding:18px 32px 4px"><h2 style="margin:0 0 6px;font-size:20px;line-height:26px;color:#1a2b3c">${esc(ui.heading(items.length))}</h2>
<p style="margin:0 0 18px;font-size:14px;line-height:21px;color:#555">${esc(ui.intro)}</p></td></tr>
<tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(card).join("")}</table></td></tr>
${base ? `<tr><td style="padding:10px 32px 4px"><a href="${esc(base)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 22px;border-radius:6px">${esc(ui.openApp)}</a></td></tr>` : ""}
<tr><td style="padding:20px 32px 26px;font-size:12px;line-height:18px;color:#8a8a8a">${esc(ui.footer)}<br>{APP}</td></tr>
</table></td></tr></table></body></html>`;
  const app = appName(s);
  return { subject: ui.subject(items.length).replaceAll("{APP}", app), text: text.replaceAll("{APP}", app), html: html.replaceAll("{APP}", esc(app)) };
}

async function dispatch() {
  const { data: s } = await supabase.rpc("email_runtime_settings");
  const settings = s as Settings | null;
  if (!settings?.enabled) return { sent: 0, skipped: "disabled" };
  const { data: pending, error } = await supabase.rpc("email_claim");
  if (error) throw error;
  const byUser = new Map<string, Pending[]>();
  for (const n of (pending ?? []) as Pending[]) byUser.set(n.user_id, [...(byUser.get(n.user_id) ?? []), n]);

  let sent = 0;
  const errors: string[] = [];
  // platform: a relayed transport (Microsoft 365 allows ~30 mails a minute per mailbox) sends one mail every 2 s, and a
  // run stops after 100 s (the function's time limit): the rest is handed back and the next 15-minute tick goes on.
  const started = Date.now();
  const paceMs = isRelayed(settings) ? 2000 : 0;
  let stopped = false;
  for (const items of byUser.values()) {
    if (stopped || Date.now() - started > 100_000) {
      stopped = true;
      await supabase.rpc("email_release", { p_ids: items.map((i) => i.id) });
      continue;
    }
    if (paceMs && sent > 0) await new Promise((r) => setTimeout(r, paceMs));
    try {
      const mail = digest(settings, items);
      await smtpSend(settings, items[0].email, mail.subject, mail.text, mail.html);
      sent++;
    } catch (e) {
      // hand the rows back so the next run tries again
      await supabase.rpc("email_release", { p_ids: items.map((i) => i.id) });
      errors.push(`${items[0].email}: ${(e as Error).message}`);
    }
  }
  // The day's digest is done unless every single mail failed (then the server is probably down: try again).
  const done = !stopped && (byUser.size === 0 || sent > 0);
  const { error: recordError } = await supabase.rpc("email_record_run", { p_sent: sent, p_error: errors.length ? errors.join("; ").slice(0, 500) : null, p_done: done });
  if (recordError) console.error("email_record_run failed", recordError);
  return { sent, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: { action?: string; to?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.action === "dispatch") {
    const { data: s } = await supabase.rpc("email_runtime_settings");
    const token = req.headers.get("x-dispatch-token");
    if (!s || !token || !sameSecret(token, (s as Settings).dispatch_token)) return json({ error: "Forbidden" }, 403);
    try {
      return json({ ok: true, ...(await dispatch()) });
    } catch (e) {
      await supabase.rpc("email_record_run", { p_sent: 0, p_error: (e as Error).message.slice(0, 500), p_done: false });
      return json({ ok: false, error: (e as Error).message }, 500);
    }
  }

  if (body.action === "test") {
    const auth = req.headers.get("authorization");
    if (!auth) return json({ error: "Not signed in" }, 401);
    const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: isAdmin } = await asUser.rpc("is_admin");
    if (isAdmin !== true) return json({ error: "Admins only" }, 403);
    const to = (body.to ?? "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ ok: false, error: "Invalid recipient" }, 400);
    const { data: s } = await supabase.rpc("email_runtime_settings");
    const l = mailLang(body.language ?? null, s as Settings);
    const app = appName(s as Settings);
    try {
      // The test works with the saved settings even while email is switched off.
      await smtpSend(s as Settings, to, UI[l].testSubject.replaceAll("{APP}", app), UI[l].testBody, `<p>${esc(UI[l].testBody)}</p>`);
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }
  return json({ error: "Unknown action" }, 400);
});
