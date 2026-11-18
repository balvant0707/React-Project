// Cloudflare Pages Function: the code gate (docs/code-gate.md).
// With GATE_ENABLED=1 the JavaScript and CSS under /static/ is served only to a browser that carries the gate cookie, except the
// files the public sign-in entry needs (listed in /_gate.json by the build). The cookie is set by POST /api/gate after the
// Supabase session has been checked, including its second factor. Without GATE_ENABLED=1 this file passes every request through, so deploying it changes nothing.
//
// Environment (Pages project > Settings > Variables): GATE_ENABLED, GATE_SECRET (random, at least 32 characters; secret),
// SUPABASE_URL and SUPABASE_ANON_KEY (optional when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set for the project).
// If the gate is enabled but this is incomplete, requests pass through with the header "x-gate: misconfigured".

export interface Env {
  GATE_ENABLED?: string;
  GATE_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}
type Context = { request: Request; env: Env; next: () => Promise<Response> };

const COOKIE = "__Host-rbp_gate";
const TTL_SECONDS = 12 * 60 * 60;
// Images and fonts are no business code; everything else under /static/ is gated unless the build lists it as public.
const OPEN = /\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i;
const encoder = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

const sign = async (secret: string, payload: string) => b64url(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload)));

// "v1.<expires epoch seconds>.<user id>.<signature>"
const makeCookie = async (secret: string, userId: string) => {
  const payload = `v1.${Math.floor(Date.now() / 1000) + TTL_SECONDS}.${userId}`;
  return `${payload}.${await sign(secret, payload)}`;
};

const cookieValid = async (secret: string, header: string | null) => {
  const raw = header?.split(/;\s*/).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const match = raw && /^(v1\.(\d+)\.[0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match || Number(match[2]) < Date.now() / 1000) return false;
  try {
    // verify() compares in constant time
    return await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromB64url(match[3]), encoder.encode(match[1]));
  } catch {
    return false;
  }
};

const cookieHeader = (value: string, maxAge: number) => `${COOKIE}=${value}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`;
const text = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers } });

// The public files of this build. Loaded once per isolate; a missing list stops the gate closed (503) instead of serving everything.
let publicFiles: Promise<Set<string> | null> | null = null;
const loadPublic = (env: Env, origin: string) =>
  (publicFiles ??= env.ASSETS.fetch(new Request(`${origin}/_gate.json`))
    .then(async (res) => (res.ok ? new Set<string>(((await res.json()) as { public: string[] }).public) : null))
    .catch(() => null));

const handleGate = async (request: Request, env: Env) => {
  if (request.method === "DELETE") return new Response(null, { status: 204, headers: { "cache-control": "no-store", "set-cookie": cookieHeader("", 0) } });
  if (request.method !== "POST") return text("Method not allowed", 405);
  const auth = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._-]{20,4000}$/.test(auth)) return text("Unauthorized", 401);
  // Supabase decides whether the token is valid (signature, expiry, a locked account): one call, no keys to keep here.
  const user = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY ?? "", authorization: auth } }).catch(() => null);
  if (!user) return text("Sign-in service unreachable", 503);
  if (user.status === 401 || user.status === 403) return text("Unauthorized", 401);
  if (!user.ok) return text("Sign-in service error", 503);
  const id = ((await user.json().catch(() => null)) as { id?: string } | null)?.id;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return text("Unauthorized", 401);
  // The same rule the database applies to every table (restrictive policy mfa_required): second factor done (aal2), Microsoft
  // sign-in where the settings accept it, the setting off, and the account not locked. Password only gets the sign-in pages.
  const mfa = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mfa_satisfied`, {
    method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY ?? "", authorization: auth, "content-type": "application/json" }, body: "{}",
  }).catch(() => null);
  if (!mfa) return text("Sign-in service unreachable", 503);
  // Without the second factor the API refuses even this call (403 "mfa_required"), which is the answer.
  if (mfa.status === 403) return text("Second factor required", 403);
  if (!mfa.ok) return text("Sign-in service error", 503);
  if ((await mfa.json().catch(() => null)) !== true) return text("Second factor required", 403);
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "set-cookie": cookieHeader(await makeCookie(env.GATE_SECRET!, id), TTL_SECONDS) } });
};

export const onRequest = async ({ request, env, next }: Context): Promise<Response> => {
  if (env.GATE_ENABLED !== "1") return next();
  // The same public values the build gets; the VITE_ names work too, so they need be set only once.
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  // Misconfigured: serve the app instead of taking the site down (a blank page for everyone), and say so in a header.
  if (!env.GATE_SECRET || env.GATE_SECRET.length < 32 || !supabaseUrl || !anonKey) {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set("x-gate", "misconfigured");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  env = { ...env, SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: anonKey };
  const url = new URL(request.url);

  if (url.pathname === "/_gate.json") return text("Not found", 404);
  if (url.pathname === "/api/gate") return handleGate(request, env);
  if (!url.pathname.startsWith("/static/") || OPEN.test(url.pathname)) return next();

  const open = await loadPublic(env, url.origin);
  if (!open) return text("Gate list missing", 503);
  if (open.has(url.pathname)) return next();
  if (!(await cookieValid(env.GATE_SECRET, request.headers.get("cookie")))) return text("Sign in first", 403);

  // Served to this browser only: no shared cache may keep it for the next visitor.
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.append("vary", "Cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
