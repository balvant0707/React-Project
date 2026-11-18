// Ported 1:1 from COMPASS (supabase/functions/login-help/index.ts).
// Before sign-in (~/maintenance_tool/docs/username-login.md), called without a session:
//   POST {action:"forgot", login}                    -> login is the e-mail address or the username. Mails a recovery link to the person's contact address, if
//                                                      they have one (login_reset_target: password account, not
//                                                      locked, at most three an hour). Always answers ok.
//   POST {action:"activate", username, code, password} -> redeems an activation code from the printed sheet and sets
//                                                      the password; answers {ok, login}: the address the person signs
//                                                      in with (contact address, or the username's own), and the app
//                                                      signs in with it (second factor next). A wrong code counts against the code (five tries).
// Neither answer tells whether a username exists.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPasswordLink } from "../_shared/password-link.ts";
import { clientIp, sha256 } from "../_shared/clientIp.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

// The work behind "forgot" runs after the answer (no timing hint on existing usernames: sending a mail can take
// seconds). Without EdgeRuntime (older local runtimes) it simply runs on.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;
const inBackground = (work: Promise<unknown>) => {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else void work;
};

// A failed code check takes as long as a good one.
const atLeast = async <T,>(ms: number, work: PromiseLike<T>) => {
  const [result] = await Promise.all([work, new Promise((r) => setTimeout(r, ms))]);
  return result;
};

// Per client address and action, so one address cannot hammer the forms (an activation code allows five wrong tries, so
// guessing a username's code would otherwise lock a person out of activating). The limits sit well above what a shop
// floor handing out activation sheets from one network needs. A failing limiter does not block sign-in help.
const LIMITS = { forgot: { max: 10, seconds: 3600 }, activate: { max: 30, seconds: 3600 } } as const;
const withinLimit = async (req: Request, action: keyof typeof LIMITS) => {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_bucket_key: `login-help:${action}:${await sha256(clientIp(req))}`,
    p_window_seconds: LIMITS[action].seconds,
    p_max_requests: LIMITS[action].max,
  });
  if (error) console.error("rate_limit_hit", error.message);
  return error ? true : data === true;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.json().catch(() => null);

  if (body?.action === "forgot") {
    // "username" is what an app opened before this change still sends.
    const login = text(body.login ?? body.username, 200);
    if (!login) return json({ error: "username_required" }, 400);
    // Over the limit looks like any other answer: the page says "if the name exists, a mail is on its way".
    if (!(await withinLimit(req, "forgot"))) return json({ ok: true });
    inBackground((async () => {
      const { data } = await admin.rpc("login_reset_target", { p_username: login });
      const target = (data as { user_id: string; login_email: string; email: string; name: string | null; language: string | null; username?: string }[] | null)?.[0];
      if (!target) return;
      try {
        await sendPasswordLink(admin, { loginEmail: target.login_email, email: target.email, name: target.name, username: target.username ?? login.toLowerCase(), language: target.language }, "reset");
      } catch (e) {
        console.error("password link", (e as Error).message);
      }
    })());
    return json({ ok: true });
  }

  if (body?.action === "activate") {
    const username = text(body.username, 100);
    const code = text(body.code, 40);
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !code) return json({ error: "code_invalid" }, 400);
    if (!(await withinLimit(req, "activate"))) return json({ error: "rate_limited" }, 429);
    if (password.length < 10 || password.length > 72) return json({ error: "password_length" }, 400);
    const result = await atLeast(800, admin.rpc("login_activation_check", { p_username: username, p_code: code }));
    const hit = (result.data as { code_id: string; user_id: string; login_email: string }[] | null)?.[0];
    if (!hit) return json({ error: "code_invalid" }, 400);
    const { error } = await admin.auth.admin.updateUserById(hit.user_id, { password });
    if (error) return json({ error: "password_rejected", message: error.message }, 400);
    await admin.rpc("login_activation_consume", { p_code_id: hit.code_id });
    return json({ ok: true, login: hit.login_email });
  }

  return json({ error: "unknown_action" }, 400);
});
