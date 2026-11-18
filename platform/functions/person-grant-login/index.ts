// Ported 1:1 from COMPASS (supabase/functions/person-grant-login/index.ts).
// Gives a person without a login an account (~/maintenance_tool/docs/people.md, ~/maintenance_tool/docs/username-login.md). Admins and holders of
// users.manage.
//   POST { person_id, send_mail? }  -> creates the auth user with the SAME id as the person (so every record that
//   points at the person keeps working). A password account gets its contact address as the sign-in
//   address, or without one the address of its username (<username>@login.rbp.invalid); with a contact address and send_mail (default true) a "choose your password"
//   mail goes there, otherwise the app asks for an activation sheet next (login_activation_create).
//   An SSO account gets the contact address (Entra links by it) and no password.
// The caller is checked with their own JWT (may_manage_login(): a user manager, not for themselves, and only an admin for
// a person holding the Admin role; the PostgREST hook also enforces the second factor); the account itself is created
// with the service role. Without that check a user manager could put their own address on a person without a login who
// holds Admin (e.g. after "Revoke login", roles stay) and receive that person's welcome link.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPasswordLink } from "../_shared/password-link.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => null);
  const personId = typeof body?.person_id === "string" ? body.person_id : null;
  if (!personId) return json({ error: "person_id_required" }, 400);
  const { data: mayManage } = await caller.rpc("may_manage_login", { p_user_id: personId });
  if (mayManage !== true) return json({ error: "not_allowed" }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: person } = await admin.from("users").select("id, email, name, username, language, has_login, sign_in_method, has_left, locked_at").eq("id", personId).maybeSingle();
  if (!person) return json({ error: "not_found" }, 404);
  if (person.has_login) return json({ error: "already_has_login" }, 409);
  if (person.has_left) return json({ error: "has_left" }, 409);
  if (person.locked_at) return json({ error: "locked" }, 409);
  const sso = person.sign_in_method === "sso";
  if (sso && !person.email) return json({ error: "email_required" }, 422);
  // The same address public.expected_login_email gives: the contact address, a username's own only without one.
  const contact = person.email?.trim().toLowerCase() || null;
  const loginEmail = contact ?? `${person.username}@login.rbp.invalid`;

  // GoTrue accepts a custom id; the trigger handle_new_user then claims the existing person row (has_login = true).
  const { error: createError } = await admin.auth.admin.createUser({
    id: person.id,
    email: loginEmail,
    email_confirm: true,
    user_metadata: { name: person.name },
  } as never);
  if (createError) return json({ error: "create_failed", message: createError.message }, 400);
  // Who gave the login, as the caller (role_assignment_log, kind login_grant). The account exists either way; a failed
  // entry is reported, not undone.
  const { error: logError } = await caller.rpc("role_assignment_log_login_grant", { p_person_id: person.id });
  if (logError) console.error("role_assignment_log_login_grant", logError.message);

  if (sso) return json({ ok: true, mail_sent: false, sign_in_method: "sso" });
  if (!person.email || body?.send_mail === false) return json({ ok: true, mail_sent: false, needs_activation: true });

  try {
    await sendPasswordLink(admin, { loginEmail, email: person.email, name: person.name, username: person.username, language: person.language }, "welcome");
    return json({ ok: true, mail_sent: true });
  } catch (e) {
    return json({ ok: true, mail_sent: false, needs_activation: true, mail_error: (e as Error).message });
  }
});
