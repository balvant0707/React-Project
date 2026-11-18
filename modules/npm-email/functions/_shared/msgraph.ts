// Ported 1:1 from the NPM tool (supabase/functions/_shared/msgraph.ts).
// Shared helpers for the Microsoft Graph outbound/connection Edge Functions
// (email-oauth-authorize, email-oauth-callback, refresh-mailbox-connections,
// send-email, email-webhook). See ~/npm_tool/docs/email-outbound-connection-plan.md for
// the decision this implements: delegated `.Shared` scopes, connected
// per-mailbox via a real user's OAuth grant - never application
// permissions, never the plain (non-.Shared) Mail.* scopes.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const MS_GRAPH_TENANT_ID = Deno.env.get("MS_GRAPH_TENANT_ID") ?? "";
export const MS_GRAPH_CLIENT_ID = Deno.env.get("MS_GRAPH_CLIENT_ID") ?? "";
export const MS_GRAPH_CLIENT_SECRET = Deno.env.get("MS_GRAPH_CLIENT_SECRET") ?? "";
export const MS_GRAPH_REDIRECT_URI = Deno.env.get("MS_GRAPH_REDIRECT_URI") ?? "";
export const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "";
export const OAUTH_STATE_SECRET = Deno.env.get("OAUTH_STATE_SECRET") ?? "";
export const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? "";
// Public HTTPS URL Microsoft calls with change notifications - see
// ensureWebhookSubscription below. Must be reachable from the internet, so
// this can't be exercised end-to-end against a local dev stack (same
// limitation as the rest of the OAuth flow needing a real Entra app - see
// ~/npm_tool/docs/email-outbound-connection-plan.md).
export const GRAPH_WEBHOOK_URL = Deno.env.get("GRAPH_WEBHOOK_URL") ?? "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Never plain Mail.Send/Mail.ReadWrite/Mail.Read - only the .Shared variants
// (see the plan doc's rationale). offline_access is what gets us a refresh
// token at all.
export const GRAPH_SCOPES = "openid offline_access Mail.Send.Shared Mail.ReadWrite.Shared";

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

// A client that acts as the calling user (their JWT forwarded as-is), so
// reads/writes still go through that user's normal RLS - used wherever we
// want "can this user see this row" answered by the same policies the rest
// of the app already trusts, instead of re-deriving it here.
export function userClient(authHeader: string | null): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
  });
}

async function isAdmin(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await client
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);
  return (data ?? []).some((r: any) => r.roles?.name === "Admin");
}

// Resolves the calling user from a bearer token (query-string-carried for
// the authorize redirect, since a full-page browser navigation can't set a
// custom Authorization header) and confirms they're an Admin with a session that
// satisfies the second factor - connecting a mailbox is admin-only, same as
// creating one (mailboxes/list.tsx).
export async function requireAdminFromToken(
  token: string | null,
): Promise<{ id: string } | null> {
  if (!token) return null;
  const svc = serviceClient();
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) return null;
  if (!(await isAdmin(svc, data.user.id))) return null;
  // The service-role client above bypasses the database's second-factor rule, so ask the database itself, as the
  // caller: api_pre_request() refuses an aal1 session outright, and mfa_satisfied() applies the same settings
  // (require_mfa, sso_satisfies_mfa) as every table policy. A password-only admin session must not get through here.
  const { data: mfaOk, error: mfaError } = await userClient(`Bearer ${token}`).rpc("mfa_satisfied");
  if (mfaError || mfaOk !== true) return null;
  return { id: data.user.id };
}

// ---------------------------------------------------------------------
// State token: signed, not encrypted (nothing secret in it) - carries the
// target mailbox and connecting user across the redirect to Microsoft and
// back, and is the only thing standing in for a server-side session across
// that hop. HMAC-SHA256 over base64url(JSON), short expiry.
// ---------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  if (!OAUTH_STATE_SECRET) throw new Error("OAUTH_STATE_SECRET not configured");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(OAUTH_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type OAuthState = { mailbox_id: string; user_id: string; nonce: string; exp: number };

export async function signState(payload: OAuthState): Promise<string> {
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifyState(state: string): Promise<OAuthState | null> {
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    base64UrlDecode(sigB64),
    new TextEncoder().encode(payloadB64),
  );
  if (!ok) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as OAuthState;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Token ciphertext: AES-256-GCM, iv (12 bytes) || ciphertext+tag, stored
// as-is in a bytea column. Key is a base64-encoded 32-byte value that lives
// only in Edge Function secrets (see supabase/functions/.env.example) -
// generate with `openssl rand -base64 32`.
// ---------------------------------------------------------------------

async function aesKey(): Promise<CryptoKey> {
  if (!TOKEN_ENCRYPTION_KEY) throw new Error("TOKEN_ENCRYPTION_KEY not configured");
  const raw = Uint8Array.from(atob(TOKEN_ENCRYPTION_KEY), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return out;
}

export async function decryptSecret(bytes: Uint8Array): Promise<string> {
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await aesKey(), ciphertext);
  return new TextDecoder().decode(plaintext);
}

// Supabase-js hands bytea columns back as a "\x<hex>" string over PostgREST,
// not a Uint8Array - convert both ways at the boundary.
export function byteaToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("\\x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function bytesToBytea(bytes: Uint8Array): string {
  return "\\x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------
// Microsoft identity platform (v2.0) - authorization code + refresh grants.
// ---------------------------------------------------------------------

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/token`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MS_GRAPH_CLIENT_ID,
    response_type: "code",
    redirect_uri: MS_GRAPH_REDIRECT_URI,
    response_mode: "query",
    scope: GRAPH_SCOPES,
    state,
  });
  return `https://login.microsoftonline.com/${MS_GRAPH_TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: MS_GRAPH_CLIENT_ID,
    client_secret: MS_GRAPH_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: MS_GRAPH_REDIRECT_URI,
    scope: GRAPH_SCOPES,
  });
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshWithToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: MS_GRAPH_CLIENT_ID,
    client_secret: MS_GRAPH_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES,
  });
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

type MailboxConnectionRow = {
  mailbox_id: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
};

// Loads a mailbox's connection, refreshing the access token first if it's
// missing or within 5 minutes of expiry. Always re-persists a fresh refresh
// token when Microsoft returns one (rotation is common and the old one may
// already be invalid). Throws (after marking the connection status='error')
// if there's no connection or the refresh itself fails - callers decide
// what "can't send/sync for this mailbox" means for them.
export async function getValidAccessToken(svc: SupabaseClient, mailboxId: string): Promise<string> {
  const { data, error } = await svc
    .from("mailbox_connections")
    .select("mailbox_id, refresh_token_enc, access_token_enc, access_token_expires_at")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();
  if (error || !data) throw new Error(`no mailbox_connections row for mailbox ${mailboxId}`);
  const row = data as MailboxConnectionRow;

  const expiresAt = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;
  const stillFresh = row.access_token_enc && expiresAt - Date.now() > 5 * 60 * 1000;
  if (stillFresh) return decryptSecret(byteaToBytes(row.access_token_enc!));

  try {
    const refreshToken = await decryptSecret(byteaToBytes(row.refresh_token_enc));
    const tokens = await refreshWithToken(refreshToken);
    const accessTokenEnc = bytesToBytea(await encryptSecret(tokens.access_token));
    const refreshTokenEnc = tokens.refresh_token
      ? bytesToBytea(await encryptSecret(tokens.refresh_token))
      : undefined;
    await svc
      .from("mailbox_connections")
      .update({
        access_token_enc: accessTokenEnc,
        ...(refreshTokenEnc ? { refresh_token_enc: refreshTokenEnc } : {}),
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        status: "ok",
        last_error: null,
        last_error_at: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("mailbox_id", mailboxId);
    return tokens.access_token;
  } catch (err) {
    await svc
      .from("mailbox_connections")
      .update({
        status: "error",
        last_error: err instanceof Error ? err.message : String(err),
        last_error_at: new Date().toISOString(),
      })
      .eq("mailbox_id", mailboxId);
    throw err;
  }
}

// ---------------------------------------------------------------------
// Inbound: Graph change-notification subscription per mailbox (step 5 +
// step 3's webhook-renewal half). Subscriptions on the messages resource
// max out at ~4230 minutes (~2.94 days) - request a bit under that and
// renew well before expiry (called from both the refresh-mailbox-connections
// cron and right after a fresh connect in email-oauth-callback) rather than
// cutting it close.
// ---------------------------------------------------------------------

const SUBSCRIPTION_LIFETIME_MS = 4200 * 60 * 1000;
const SUBSCRIPTION_RENEW_WINDOW_MS = 12 * 60 * 60 * 1000; // renew once <12h remain

type SubscriptionRow = {
  webhook_subscription_id: string | null;
  webhook_expires_at: string | null;
  webhook_client_state: string | null;
};

// Creates a subscription if none exists, renews (PATCH) one that's close to
// expiring, or does nothing if it's still fresh. Re-creates from scratch if
// a renewal PATCH 404s (Microsoft drops a subscription server-side if a
// renewal is ever missed for too long). Failure here sets status='error'
// just like a token-refresh failure - a dead subscription means inbound
// mail silently stops flowing, which must surface, not fail quietly.
export async function ensureWebhookSubscription(
  svc: SupabaseClient,
  mailboxId: string,
  accessToken: string,
  mailboxAddress: string,
): Promise<void> {
  if (!GRAPH_WEBHOOK_URL) throw new Error("GRAPH_WEBHOOK_URL not configured");

  const { data, error } = await svc
    .from("mailbox_connections")
    .select("webhook_subscription_id, webhook_expires_at, webhook_client_state")
    .eq("mailbox_id", mailboxId)
    .maybeSingle();
  if (error || !data) throw new Error(`no mailbox_connections row for mailbox ${mailboxId}`);
  const row = data as SubscriptionRow;

  const expiresAt = row.webhook_expires_at ? new Date(row.webhook_expires_at).getTime() : 0;
  if (row.webhook_subscription_id && expiresAt - Date.now() > SUBSCRIPTION_RENEW_WINDOW_MS) {
    return; // still fresh, nothing to do
  }

  const newExpiration = new Date(Date.now() + SUBSCRIPTION_LIFETIME_MS).toISOString();

  try {
    if (row.webhook_subscription_id) {
      const res = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${row.webhook_subscription_id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expirationDateTime: newExpiration }),
      });
      if (res.ok) {
        await svc
          .from("mailbox_connections")
          .update({ webhook_expires_at: newExpiration })
          .eq("mailbox_id", mailboxId);
        return;
      }
      // Fall through to create a fresh one (e.g. 404 - Graph already
      // dropped this subscription).
    }

    const clientState = row.webhook_client_state ?? crypto.randomUUID();
    const res = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: GRAPH_WEBHOOK_URL,
        resource: `/users/${mailboxAddress}/mailFolders('inbox')/messages`,
        expirationDateTime: newExpiration,
        clientState,
      }),
    });
    if (!res.ok) throw new Error(`subscription create failed: ${res.status} ${await res.text()}`);
    const created = await res.json();
    await svc
      .from("mailbox_connections")
      .update({
        webhook_subscription_id: created.id,
        webhook_expires_at: newExpiration,
        webhook_client_state: clientState,
      })
      .eq("mailbox_id", mailboxId);
  } catch (err) {
    await svc
      .from("mailbox_connections")
      .update({
        status: "error",
        last_error: err instanceof Error ? err.message : String(err),
        last_error_at: new Date().toISOString(),
      })
      .eq("mailbox_id", mailboxId);
    throw err;
  }
}

// ---------------------------------------------------------------------
// Inbound: fetching a notified message's full detail + its attachments.
// A change notification only ever carries the changed message's id - the
// rest is fetched separately, same as Graph's own documented pattern.
// ---------------------------------------------------------------------

const MESSAGE_SELECT =
  "id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,bccRecipients," +
  "body,receivedDateTime,hasAttachments,internetMessageHeaders";

export async function fetchGraphMessage(
  accessToken: string,
  mailboxAddress: string,
  messageId: string,
): Promise<any> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/messages/${messageId}?$select=${MESSAGE_SELECT}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`fetch message failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Only fileAttachment (contentBytes inline, <3MB) is handled by the caller -
// itemAttachment/referenceAttachment are rarer and skipped for now, see
// email-webhook/index.ts.
export async function fetchGraphAttachments(
  accessToken: string,
  mailboxAddress: string,
  messageId: string,
): Promise<any[]> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxAddress)}/messages/${messageId}/attachments`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`fetch attachments failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.value ?? [];
}
