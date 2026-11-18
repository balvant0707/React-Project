// Ported 1:1 from the NPM tool (supabase/functions/refresh-mailbox-connections/index.ts).
// Step 3 of ~/npm_tool/docs/email-outbound-connection-plan.md - both halves. Meant to
// run on a schedule (pg_cron, Supabase's Cron Jobs, or any external cron
// hitting this URL every few hours - see infra/deploy-guide.md for how the
// equivalent dispatch-push-notifications sweep is wired up) so that:
//   - every connection's refresh token gets used regularly (they expire on
//     inactivity, not a fixed clock, so a mailbox nobody sends through for
//     weeks would otherwise silently go stale), and
//   - every mailbox's Graph change-notification subscription (step 5's
//     inbound webhook) gets renewed before it expires (~2.94 days, see
//     ensureWebhookSubscription in _shared/msgraph.ts) - without this,
//     inbound mail would silently stop arriving a few days after any
//     connect/renewal.
//
// Restricted to service_role callers only (checked explicitly below,
// on top of the platform's own JWT verification) - this isn't something an
// ordinary authenticated user should be able to trigger, even though it
// can't leak secrets through its response either way.
import { ensureWebhookSubscription, getValidAccessToken, serviceClient } from "../_shared/msgraph.ts";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// A connection is refreshed if its access token is missing/near expiry, or
// simply hasn't been touched in a while - the latter is what keeps a
// low-traffic mailbox's refresh token alive even when nothing is being sent
// through it.
const STALE_AFTER_MS = 20 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response("service role only", { status: 403 });
  }

  const svc = serviceClient();
  const { data: connections, error } = await svc
    .from("mailbox_connections")
    .select("mailbox_id, access_token_expires_at, last_synced_at, mailboxes(address)");
  if (error) {
    console.error("refresh-mailbox-connections: load failed", error);
    return new Response("load failed", { status: 500 });
  }

  const now = Date.now();
  const due = (connections ?? []).filter((c) => {
    const expiresAt = c.access_token_expires_at ? new Date(c.access_token_expires_at).getTime() : 0;
    const lastSynced = c.last_synced_at ? new Date(c.last_synced_at).getTime() : 0;
    return expiresAt - now < 5 * 60 * 1000 || now - lastSynced > STALE_AFTER_MS;
  });

  let refreshed = 0;
  let refreshFailed = 0;
  for (const c of due) {
    try {
      await getValidAccessToken(svc, c.mailbox_id);
      refreshed++;
    } catch (err) {
      // getValidAccessToken already wrote status='error'/last_error for this
      // row - fails loudly per-mailbox, doesn't stop the sweep.
      console.error("refresh-mailbox-connections: refresh failed", c.mailbox_id, err);
      refreshFailed++;
    }
  }

  // Webhook-subscription renewal: independent of token staleness above -
  // ensureWebhookSubscription itself no-ops for a connection whose
  // subscription still has plenty of life left, so it's cheap to call for
  // every connection on every sweep.
  let webhooksChecked = 0;
  let webhooksFailed = 0;
  for (const c of connections ?? []) {
    const address = (c as any).mailboxes?.address;
    if (!address) continue;
    webhooksChecked++;
    try {
      const accessToken = await getValidAccessToken(svc, c.mailbox_id);
      await ensureWebhookSubscription(svc, c.mailbox_id, accessToken, address);
    } catch (err) {
      console.error("refresh-mailbox-connections: webhook renewal failed", c.mailbox_id, err);
      webhooksFailed++;
    }
  }

  return new Response(
    JSON.stringify({
      checked: connections?.length ?? 0,
      refreshed,
      refresh_failed: refreshFailed,
      webhooks_checked: webhooksChecked,
      webhooks_failed: webhooksFailed,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
