// Web Push:
//   POST {action:"config"}                                   -> the app: the VAPID public key
//   POST {action:"dispatch", ids?}  header x-dispatch-token  -> the database: sends pending notifications to every device
// VAPID keys are function secrets; the dispatch token and URL are in public.push_settings.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import TEXTS from "../_shared/notification-texts.json" with { type: "json" };
import { sameSecret } from "../_shared/secret.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@invalid.example";
if (PUBLIC_KEY && PRIVATE_KEY) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, x-dispatch-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Claimed = {
  id: string; user_id: string; language: string | null; type: string; title: string; body: string | null; link: string | null;
  params: Record<string, unknown> | null; dedupe_key: string | null; channels: string[]; created_at: string;
};
type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth_key: string };

const fill = (tpl: string, params: Record<string, unknown>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ""));
const texts = TEXTS as Record<"de" | "en", Record<string, string>>;

// The same sentence as the bell: notifications.types.<type> of the locale files of the modules; tools/compose.mjs collects them
// into _shared/notification-texts.json of the app.
const payload = (n: Claimed) => {
  const tpl = texts[n.language === "en" ? "en" : "de"][n.type];
  return JSON.stringify({
    title: tpl ? fill(tpl, n.params ?? {}) : n.title,
    body: n.body ?? "",
    url: n.link ?? "/",
    // One system notification per thread / group: a newer one replaces it instead of piling up.
    tag: n.dedupe_key ?? n.id,
    // Shown as a toast inside the app anyway: no system notification while the app is in front.
    skipIfFocused: n.channels.includes("toast"),
  });
};

async function dispatch(ids: string[] | null) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set");
  const { data: claimed, error } = await supabase.rpc("push_claim", { p_ids: ids });
  if (error) throw error;
  const rows = (claimed ?? []) as Claimed[];
  if (!rows.length) return { sent: 0 };

  const { data: subs, error: subError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", [...new Set(rows.map((r) => r.user_id))]);
  if (subError) {
    await supabase.rpc("push_release", { p_ids: rows.map((r) => r.id) });
    throw subError;
  }
  const byUser: Record<string, Subscription[]> = {};
  for (const s of (subs ?? []) as Subscription[]) (byUser[s.user_id] ??= []).push(s);

  let sent = 0;
  const retry: string[] = [];
  const dead = new Set<string>();
  const alive = new Set<string>();
  for (const n of rows) {
    const body = payload(n);
    let delivered = false;
    let transient = false;
    for (const s of byUser[n.user_id] ?? []) {
      if (dead.has(s.id)) continue;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, body, { TTL: 3600, urgency: "high" });
        delivered = true;
        alive.add(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Gone for good (unsubscribed, app removed, browser profile deleted): never try that device again.
        if (status === 404 || status === 410) dead.add(s.id);
        else {
          transient = true;
          console.error("send-push: send failed", status, e instanceof Error ? e.message : e);
        }
      }
    }
    if (delivered) sent++;
    else if (transient) retry.push(n.id);
  }
  if (dead.size) await supabase.from("push_subscriptions").delete().in("id", [...dead]);
  if (alive.size) await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).in("id", [...alive]);
  if (retry.length) await supabase.rpc("push_release", { p_ids: retry });
  return { sent, retry: retry.length, removed: dead.size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let input: { action?: string; ids?: string[] | null } = {};
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (input.action === "config") return json({ publicKey: PUBLIC_KEY || null });

  if (input.action === "dispatch") {
    const { data: s } = await supabase.rpc("push_runtime_settings");
    const token = req.headers.get("x-dispatch-token");
    if (!s || !token || !sameSecret(token, (s as { dispatch_token: string }).dispatch_token)) return json({ error: "Forbidden" }, 403);
    try {
      const result = await dispatch(Array.isArray(input.ids) && input.ids.length ? input.ids : null);
      await supabase.rpc("push_record_run", { p_sent: result.sent, p_error: null });
      return json(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("send-push:", message);
      await supabase.rpc("push_record_run", { p_sent: 0, p_error: message });
      return json({ error: message }, 500);
    }
  }
  return json({ error: "Unknown action" }, 400);
});
