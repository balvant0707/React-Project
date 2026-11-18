import { createClient } from "@supabase/supabase-js";
// Taken over from the NPM tool supabaseClient.ts (deploy-time config, MFA signal, nulls-last sorting, account lock).

// A runtime config (window.__APP_CONFIG__, the NPM tool's container deploy) wins over the VITE_* values baked into the
// build; the Cloudflare Pages builds have none.
declare global {
  interface Window {
    __APP_CONFIG__?: {
      SUPABASE_URL?: string;
      SUPABASE_ANON_KEY?: string;
      VAPID_PUBLIC_KEY?: string;
    };
  }
}

export const SUPABASE_URL =
  window.__APP_CONFIG__?.SUPABASE_URL || (import.meta.env.VITE_SUPABASE_URL as string);
const SUPABASE_ANON_KEY =
  window.__APP_CONFIG__?.SUPABASE_ANON_KEY || (import.meta.env.VITE_SUPABASE_ANON_KEY as string);
// Web Push; not secret.
export const VAPID_PUBLIC_KEY =
  window.__APP_CONFIG__?.VAPID_PUBLIC_KEY || (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined);

// The database answers a session without the second factor with 403 "mfa_required"; caught here for every PostgREST call
// and passed to mfa/MfaGate.tsx as an event.
export const MFA_REQUIRED_EVENT = "rbp:mfa-required";

// Postgres puts NULL first on DESC: a bare `.desc` in a PostgREST `order` becomes `.desc.nullslast`.
function withNullsLast(url: string): string {
  if (!url.includes("/rest/v1/") || !url.includes("order=")) return url;
  const parsed = new URL(url);
  let changed = false;
  for (const [key, value] of Array.from(parsed.searchParams.entries())) {
    if (key !== "order" && !key.endsWith(".order")) continue;
    const next = value
      .split(",")
      .map((part) => (part.endsWith(".desc") ? `${part}.nullslast` : part))
      .join(",");
    if (next !== value) {
      parsed.searchParams.set(key, next);
      changed = true;
    }
  }
  return changed ? parsed.toString() : url;
}

// Whether the last request failed at network level (COMPASS supabaseClient.ts): offline queues keep a change only then.
let lastFailureAt = 0;
let lastSuccessAt = 0;
export const lastRequestFailedAtNetworkLevel = () => lastFailureAt > lastSuccessAt;

const fetchWithMfaSignal: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  // supabase-js passes the URL as a string; a Request object is sent untouched.
  let response: Response;
  try {
    response = await fetch(typeof input === "string" ? withNullsLast(url) : input, init);
  } catch (error) {
    lastFailureAt = Date.now();
    throw error;
  }
  if (response.status >= 502 && response.status <= 504) lastFailureAt = Date.now();
  else lastSuccessAt = Date.now();
  if (response.status === 403) {
    if (url.includes("/rest/v1/")) {
      response
        .clone()
        .text()
        .then((body) => {
          if (body.includes("mfa_required")) {
            window.dispatchEvent(new Event(MFA_REQUIRED_EVENT));
          }
          // An admin locked this account while it was signed in: the sessions are gone already, leave the app.
          if (body.includes("account_locked")) {
            void supabaseClient.auth.signOut().finally(() => window.location.assign("/login"));
          }
        })
        .catch(() => undefined);
    }
  }
  return response;
};

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "public" },
  auth: { persistSession: true },
  global: { fetch: fetchWithMfaSignal },
});

// Whether the UI asks for the second factor (the database enforces it through app_settings.require_mfa): everywhere but a
// local Supabase. A local stack under another host name sets VITE_MFA_ENFORCED=false (build time only).
export const MFA_ENFORCED =
  import.meta.env.VITE_MFA_ENFORCED !== "false" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(SUPABASE_URL).hostname);
