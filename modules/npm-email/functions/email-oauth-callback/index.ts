// Ported 1:1 from the NPM tool (supabase/functions/email-oauth-callback/index.ts).
// Step 2b of ~/npm_tool/docs/email-outbound-connection-plan.md. Microsoft redirects
// here after the admin grants (or denies) consent. Exchanges the auth code
// for tokens, encrypts them, and upserts mailbox_connections -
// connected_by_user_id is whoever's state token this was (the admin who
// clicked "Connect"), never a synthetic identity. Also kicks off the
// mailbox's inbound webhook subscription (step 5) right away, so a freshly
// connected mailbox doesn't have to wait for the next refresh-mailbox-
// connections cron tick to start receiving mail. Always ends in a redirect
// back to the admin UI, success or failure, so the browser never dead-ends
// on a bare JSON response mid-flow.
import {
  APP_BASE_URL,
  bytesToBytea,
  encryptSecret,
  ensureWebhookSubscription,
  exchangeCodeForTokens,
  serviceClient,
  verifyState,
} from "../_shared/msgraph.ts";

function redirectToAdmin(query: Record<string, string>): Response {
  const url = new URL("/admin/mailboxes", APP_BASE_URL || "http://localhost:5173");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToAdmin({ connect_error: url.searchParams.get("error_description") ?? oauthError });
  }
  if (!code || !stateParam) {
    return redirectToAdmin({ connect_error: "Missing code or state from Microsoft" });
  }

  const state = await verifyState(stateParam);
  if (!state) {
    return redirectToAdmin({ connect_error: "This connection link expired or is invalid - try again" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // offline_access should always yield one; if it doesn't, the
      // connection is useless (nothing to refresh with) - fail loudly
      // rather than silently storing an access-token-only row that dies in
      // an hour.
      throw new Error("Microsoft did not return a refresh_token (offline_access scope missing or denied?)");
    }

    const svc = serviceClient();
    const { error } = await svc.from("mailbox_connections").upsert({
      mailbox_id: state.mailbox_id,
      connected_by_user_id: state.user_id,
      provider: "microsoft_graph",
      refresh_token_enc: bytesToBytea(await encryptSecret(tokens.refresh_token)),
      access_token_enc: bytesToBytea(await encryptSecret(tokens.access_token)),
      access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      status: "ok",
      last_synced_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
      connected_at: new Date().toISOString(),
    });
    if (error) throw error;

    const { data: mailbox } = await svc
      .from("mailboxes")
      .select("address")
      .eq("id", state.mailbox_id)
      .maybeSingle();
    if (mailbox) {
      try {
        await ensureWebhookSubscription(svc, state.mailbox_id, tokens.access_token, mailbox.address);
      } catch (err) {
        // Don't fail the whole connect over this - the token side is live
        // either way, and the refresh-mailbox-connections cron will retry
        // the subscription on its next tick.
        console.error("email-oauth-callback: initial webhook subscription failed", err);
      }
    }

    return redirectToAdmin({ connected: state.mailbox_id });
  } catch (err) {
    console.error("email-oauth-callback: failed", err);
    return redirectToAdmin({ connect_error: err instanceof Error ? err.message : "Connection failed" });
  }
});
