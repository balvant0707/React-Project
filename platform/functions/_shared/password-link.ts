// Ported 1:1 from COMPASS (supabase/functions/_shared/password-link.ts).
// Mails a "choose your password" link to a person's contact address (~/maintenance_tool/docs/username-login.md). GoTrue only makes the recovery token
// (admin generateLink, no mail; an account without a contact address has <username>@login.rbp.invalid, which never
// receives mail) and we send it with the app's SMTP settings. The link goes to the app address from
// the e-mail settings, never to an address the caller names: a reset link pointing elsewhere would hand the token over.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { brandColor, esc, smtpSend, type Settings } from "./smtp.ts";

const TEXTS = {
  de: {
    reset: {
      subject: "{APP}: Passwort zurücksetzen",
      title: "Passwort zurücksetzen",
      intro: (name: string, email: string) => `Hallo ${name},\n\nfür deinen {APP}-Zugang (${email}) wurde ein neues Passwort angefordert. Mit dem Button wählst du ein neues.`,
      button: "Neues Passwort wählen",
      outro: "Der Link gilt eine Stunde. Hast du nichts angefordert, kannst du diese E-Mail ignorieren; dein Passwort bleibt dann unverändert.",
    },
    welcome: {
      subject: "Willkommen bei {APP}: dein Zugang",
      title: "Willkommen bei {APP}",
      intro: (name: string, email: string) => `Hallo ${name},\n\nfür dich wurde ein Zugang zu {APP} eingerichtet.\n\nMelde dich künftig mit deiner E-Mail-Adresse an: ${email}\n\nLege jetzt dein Passwort fest:`,
      button: "Zugang einrichten",
      outro: "Der Link gilt eine Stunde. Ist er abgelaufen, nutze auf der Anmeldeseite „Passwort vergessen“.",
    },
  },
  en: {
    reset: {
      subject: "{APP}: reset your password",
      title: "Reset your password",
      intro: (name: string, email: string) => `Hello ${name},\n\na new password was requested for your {APP} account (${email}). Use the button to choose a new one.`,
      button: "Choose new password",
      outro: "The link is valid for one hour. If you did not ask for it, ignore this mail; your password stays as it is.",
    },
    welcome: {
      subject: "Welcome to {APP}: your account",
      title: "Welcome to {APP}",
      intro: (name: string, email: string) => `Hello ${name},\n\nan account for {APP} was set up for you.\n\nSign in with your e-mail address from now on: ${email}\n\nSet your password now:`,
      button: "Set up account",
      outro: "The link is valid for one hour. If it has expired, use \"Forgot password\" on the sign-in page.",
    },
  },
};

// Same look as the auth mails (scripts/build-auth-templates.mjs): white card, red top border, logo, red button.
// platform: the red is the app's colour (email_settings.brand_color), the logo its branding/mail-logo.png.

export type PasswordLinkTarget = { loginEmail: string; email: string; name: string | null; username: string; language: string | null };

export async function sendPasswordLink(admin: SupabaseClient, target: PasswordLinkTarget, kind: "reset" | "welcome") {
  const { data: s, error: settingsError } = await admin.rpc("email_runtime_settings");
  const settings = s as Settings | null;
  if (settingsError || !settings?.host || !settings.from_address || !settings.app_url) {
    throw new Error("E-mail settings incomplete (host, sender and app address are needed)");
  }
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: target.loginEmail });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(error?.message ?? "No recovery token");

  const base = settings.app_url.replace(/\/+$/, "");
  const RED = brandColor(settings);
  const url = `${base}/update-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  const l = target.language === "en" ? "en" : "de";
  // platform: the product name in the texts is the sender name of the app's e-mail settings (e.g. RADAR)
  const app = (settings as Settings & { from_name?: string | null }).from_name || "the platform";
  const t0 = TEXTS[l][kind];
  const t = { ...t0, subject: t0.subject.replaceAll("{APP}", app), title: t0.title.replaceAll("{APP}", app), intro: (n: string, e: string) => t0.intro(n, e).replaceAll("{APP}", app) };
  const intro = t.intro(target.name ?? target.username, target.email);
  const text = `${t.title}\n\n${intro}\n\n${t.button}: ${url}\n\n${t.outro}\n\n{APP}`.replaceAll("{APP}", app);
  const html = `<!doctype html>
<html lang="${l}"><body style="margin:0;padding:0;background:#f4f5f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;border-top:4px solid ${RED};font-family:Arial,Helvetica,sans-serif">
<tr><td style="padding:24px 32px 4px"><img src="${esc(base)}/mail-logo.png" alt="{APP}" width="150" style="display:block;border:0;width:150px;height:auto"></td></tr>
<tr><td style="padding:12px 32px 4px">
<h2 style="margin:0 0 12px;font-size:20px;line-height:26px;color:#1a2b3c">${esc(t.title)}</h2>
<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#333">${esc(intro).replace(/\n/g, "<br>")}</p>
<p style="margin:20px 0 18px"><a href="${esc(url)}" style="display:inline-block;background:${RED};color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:11px 22px;border-radius:6px">${esc(t.button)}</a></p>
<p style="margin:0 0 14px;font-size:13px;line-height:19px;color:#666">${esc(t.outro)}</p>
</td></tr>
<tr><td style="padding:8px 32px 26px;font-size:12px;line-height:18px;color:#8a8a8a">{APP}</td></tr>
</table></td></tr></table></body></html>`.replaceAll("{APP}", esc(app));
  await smtpSend(settings, target.email, t.subject, text, html);
}
