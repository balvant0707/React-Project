// Tests the code gate end to end against one app's build and its local Supabase stack (docs/code-gate.md):
//   npm run test:gate                      RADAR (Node 24; the local stack of apps/npm must run; see CLAUDE.md > Browser tests)
//   GATE_TEST_APP=compass npm run test:gate    COMPASS (its local stack)
// 1. builds the app with VITE_GATE=1 (output in apps/<app>/dist)
// 2. checks the Pages Function against that build: gate off, misconfigured, public and guarded files, cookie tampering
// 3. runs the real app in headless Chromium behind the function: sign-in page from public files only, sign-in, gate cookie, app
//    chunks, service worker warm-up, reload, offline start, refusal without cookie; then a chunk that does not load (retry screen),
//    (the order of preparation and load is unit-tested: npm run test:core);
// 4. last, builds the app again WITHOUT VITE_GATE and checks it starts at once and never calls the gate. That ungated build is what
//    stays in apps/<app>/dist afterwards: build again (npm run build:pages:<app>) before serving dist for anything else.
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { startGateServer } from "./serve-gate.mjs";
import { findChromium, launch } from "./cdp.mjs";

const APP = process.env.GATE_TEST_APP || "npm"; // "npm" (RADAR) or "compass"
assert.ok(["npm", "compass"].includes(APP), "GATE_TEST_APP is npm or compass");
const ROOT = `apps/${APP}/dist`;
const PORT = 8788;
const dotenv = Object.fromEntries(readFileSync(`apps/${APP}/.env.local`, "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const SUPA = process.env.VITE_SUPABASE_URL ?? dotenv.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? dotenv.VITE_SUPABASE_ANON_KEY;
// A dev user of apps/<app>/supabase/seed: signs in with the contact address.
const USER = process.env.GATE_TEST_USER ?? (APP === "npm" ? "spiros.dimopoulos@nipponpaint-marine.eu" : "anna.weber@example.com");
const PASSWORD = process.env.GATE_TEST_PASSWORD ?? "TestPass123!";
// The local database of the app; require_mfa is switched on for the second-factor checks and always put back.
const setRequireMfa = (value) => execFileSync("docker", ["exec", `supabase_db_rbp-${APP}`, "psql", "-U", "postgres", "-c", `insert into public.app_settings (key, value) values ('require_mfa', '${value}') on conflict (key) do update set value = excluded.value`], { stdio: "ignore" });
// Waits until the app has replaced the sign-in form (a slow machine needs more than a fixed pause), at most 25 seconds.
const waitForApp = async (ev, sleep) => {
  for (let i = 0; i < 50; i++) {
    if (!(await ev(`!!document.querySelector('#username')`)) && ((await ev(`document.body.innerText.length`)) ?? 0) > 50) return;
    await sleep(500);
  }
};
let failures = 0;
const ok = (condition, message) => { console.log(condition ? "ok  " : "FAIL", message); if (!condition) failures++; };

if (!SUPA || !ANON) throw new Error(`no local Supabase URL / anon key (apps/${APP}/.env.local)`);
if (!findChromium()) throw new Error("no headless Chromium (CLAUDE.md > Browser tests)");
try { await fetch(`${SUPA}/auth/v1/health`, { headers: { apikey: ANON } }); } catch { throw new Error(`local Supabase not reachable at ${SUPA} (start it in apps/${APP})`); }

console.log(`building apps/${APP} with VITE_GATE=1 ...`);
const build = spawnSync("npm", ["run", `build:pages:${APP}`], { env: { ...process.env, VITE_GATE: "1", VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: ANON }, encoding: "utf8" });
if (build.status !== 0) { console.error(build.stdout.slice(-1500), build.stderr.slice(-1500)); throw new Error("build failed"); }

const env = { GATE_ENABLED: "1", GATE_SECRET: "local-test-secret-0123456789abcdef-xyz", SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: ANON };

// ---- 2. the function -----------------------------------------------------------------------------------------------------
{
  const { onRequest } = await import(new URL("../../functions/_middleware.ts", import.meta.url).href);
  const list = JSON.parse(readFileSync(`${ROOT}/_gate.json`, "utf8")).public;
  const files = readdirSync(`${ROOT}/static`).map((f) => `/static/${f}`);
  const gatedJs = files.find((f) => f.endsWith(".js") && !list.includes(f));
  const publicJs = list.find((f) => f.endsWith(".js"));
  const image = files.find((f) => /\.(webp|jpg|png)$/.test(f));
  const fullEnv = (over = {}) => ({ ...env, ...over, ASSETS: { fetch: async (req) => { try { return new Response(readFileSync(ROOT + new URL(req.url).pathname)); } catch { return new Response("nf", { status: 404 }); } } } });
  const call = (path, { method = "GET", headers = {}, e = fullEnv() } = {}) =>
    onRequest({ request: new Request(`https://radar.test${path}`, { method, headers }), env: e, next: async () => { try { return new Response(readFileSync(ROOT + path), { headers: { "cache-control": "public, immutable" } }); } catch { return new Response("page"); } } });
  ok((await call(gatedJs, { e: fullEnv({ GATE_ENABLED: "0" }) })).status === 200, "function: gate off passes every request");
  const mis = await call(gatedJs, { e: fullEnv({ GATE_SECRET: "short" }) });
  ok(mis.status === 200 && mis.headers.get("x-gate") === "misconfigured", "function: enabled but misconfigured passes through with x-gate: misconfigured");
  const viteEnv = fullEnv({ SUPABASE_URL: undefined, SUPABASE_ANON_KEY: undefined, VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: ANON });
  ok((await call(gatedJs, { e: viteEnv })).status === 403, "function: the VITE_ Supabase variables are enough (gate active)");
  ok((await call("/_gate.json")).status === 404, "function: /_gate.json is not served");
  ok((await call(gatedJs)).status === 403, "function: guarded chunk without cookie is refused");
  ok((await call(publicJs)).status === 200 && (await call(image)).status === 200 && (await call("/sw.js")).status === 200, "function: public chunk, image and non-/static paths pass");
  ok((await call("/api/gate")).status === 405 && (await call("/api/gate", { method: "POST" })).status === 401, "function: /api/gate refuses GET and a missing token");
  ok((await call("/api/gate", { method: "POST", headers: { authorization: `Bearer ${"a".repeat(30)}` } })).status === 401, "function: an invalid token is refused");
  const token = (await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: USER, password: PASSWORD }) })).json()).access_token;
  assert.ok(token, "dev sign-in failed");
  const issued = await call("/api/gate", { method: "POST", headers: { authorization: `Bearer ${token}` } });
  const setCookie = issued.headers.get("set-cookie") ?? "";
  ok(issued.status === 204 && /^__Host-rbp_gate=v1\.\d+\.[0-9a-f-]{36}\.[\w-]+; Max-Age=43200; Path=\/; Secure; HttpOnly; SameSite=Lax$/.test(setCookie), "function: a real session gets a hardened cookie");
  const cookie = setCookie.split(";")[0];
  const withCookie = await call(gatedJs, { headers: { cookie } });
  ok(withCookie.status === 200 && withCookie.headers.get("cache-control") === "private, max-age=31536000, immutable" && /Cookie/.test(withCookie.headers.get("vary")), "function: guarded chunk with cookie, private cache, Vary: Cookie");
  const parts = cookie.split(".");
  ok((await call(gatedJs, { headers: { cookie: [parts[0], "99999999999", ...parts.slice(2)].join(".") } })).status === 403, "function: changed expiry is refused");
  ok((await call(gatedJs, { headers: { cookie: `${cookie.slice(0, -2)}xx` } })).status === 403, "function: changed signature is refused");
  ok((await call(gatedJs, { headers: { cookie }, e: fullEnv({ GATE_SECRET: "y".repeat(40) }) })).status === 403, "function: another secret is refused");
  setRequireMfa("true");
  try {
    const needsSecond = await call("/api/gate", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    ok(needsSecond.status === 403 && !needsSecond.headers.get("set-cookie"), "function: a password-only session (aal1) gets no cookie while require_mfa is on");
  } finally { setRequireMfa("false"); }
  ok((await call("/api/gate", { method: "DELETE" })).headers.get("set-cookie")?.includes("Max-Age=0"), "function: DELETE clears the cookie");
}

// ---- 3. the browser ------------------------------------------------------------------------------------------------------
const server = await startGateServer({ root: ROOT, port: PORT, env });
const browser = await launch();
try {
  const { ev, send, sleep, goto, responses, clearEvents, type, consoleErrors } = browser;
  const staticFiles = () => responses().filter(([, p]) => p.startsWith("/static/") && /\.(js|css)$/.test(p));

  await goto(`${server.url}/`, 4000);
  const first = staticFiles();
  ok(first.length > 0 && first.every(([c]) => c === 200), `browser: first visit loads ${first.length} public JS/CSS files, all 200`);
  ok(await ev(`!!document.querySelector('#username') && !!document.querySelector('#password')`), "browser: the sign-in form is shown from the public entry");
  ok(!responses().some(([, p]) => p === "/api/gate"), "browser: no gate call before sign-in");

  if (APP === "compass") {
    // The QR report form needs no sign-in: it is part of the public entry, so a visitor without a session gets it (and no more).
    const publicList = JSON.parse(readFileSync(`${ROOT}/_gate.json`, "utf8")).public;
    clearEvents();
    await goto(`${server.url}/report/not-a-real-token`, 4000);
    ok(!(await ev(`!!document.querySelector('#username')`)) && (await ev("location.pathname")) === "/report/not-a-real-token", "browser: /report/<token> is shown without a session, not sent to the sign-in page");
    ok(staticFiles().every(([c, p]) => c === 200 && publicList.includes(p)), "browser: the report page loaded public files only");
    await goto(`${server.url}/`, 3000);
  }

  await type("#username", USER);
  await type("#password", PASSWORD);
  clearEvents();
  await ev(`document.querySelector('button[type=submit]').click()`);
  await sleep(10000);
  ok(responses().some(([c, p]) => p === "/api/gate" && c === 204), "browser: POST /api/gate answered 204 after sign-in");
  const loaded = staticFiles();
  ok(loaded.length > 0 && loaded.every(([c]) => c === 200), `browser: ${loaded.length} more JS/CSS files (the app) loaded after sign-in, all 200`);
  const cookies = (await send("Network.getAllCookies")).result.cookies.filter((c) => c.name === "__Host-rbp_gate");
  ok(cookies.length === 1 && cookies[0].httpOnly && cookies[0].secure, "browser: the gate cookie is set, HttpOnly and Secure");
  ok(!(await ev(`!!document.querySelector('#username')`)) && (await ev("location.pathname")) === "/", "browser: the app replaced the sign-in page and the URL left /login");

  await sleep(8000);
  const sw = await ev(`(async () => { const r = await navigator.serviceWorker.getRegistration(); const keys = await caches.keys(); const n = keys.length ? (await (await caches.open(keys[keys.length - 1])).keys()).length : 0; return { active: !!(r && r.active), files: n }; })()`);
  ok(sw?.active && sw.files > first.length + 20, `browser: service worker active, cache holds ${sw?.files} files (${first.length} public + the gated ones warmed after sign-in)`);

  clearEvents();
  await goto(`${server.url}/`, 5000);
  ok(!(await ev(`!!document.querySelector('#username')`)), "browser: reload with a session goes straight to the app");

  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await goto(`${server.url}/`, 6000);
  ok(new RegExp(APP === "npm" ? "Dashboard|RADAR" : "COMPASS").test((await ev(`document.body.innerText`)) ?? "") && !(await ev(`!!document.querySelector('#username')`)), "browser: offline start renders the app from the service worker cache");
  await send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  const gated = loaded.map(([, p]) => p).find((p) => p.endsWith(".js") && !p.includes("/index-"));
  await send("Network.clearBrowserCookies");
  await send("Network.setBypassServiceWorker", { bypass: true });
  ok((await ev(`fetch(${JSON.stringify(gated)}, { credentials: 'omit', cache: 'no-store' }).then((r) => r.status)`)) === 403, `browser: ${gated} without the cookie is refused by the server`);
  // Second factor: with require_mfa on, a password-only session gets the authenticator page and no app code.
  setRequireMfa("true");
  try {
    await send("Network.setBypassServiceWorker", { bypass: true });
    clearEvents();
    await goto(`${server.url}/`, 6000);
    const loadedMfa = staticFiles();
    ok(await ev(`/two-factor/i.test(document.body.innerText)`) && (await ev("location.pathname")) === "/mfa", "browser: a password-only session is sent to the authenticator page");
    ok(!loadedMfa.some(([c, p]) => c === 200 && p.includes("/app-")), "browser: no app code was loaded for it");
    if (APP === "compass") {
      await goto(`${server.url}/report/not-a-real-token`, 4000);
      ok((await ev("location.pathname")) === "/report/not-a-real-token" && !(await ev(`/two-factor/i.test(document.body.innerText)`)), "browser: the report form stays public for a password-only session");
    }
  } finally { setRequireMfa("false"); }
  // A deployment whose gate is switched off (the Function is deployed, GATE_ENABLED is not set; a static asset answers the POST to
  // /api/gate with 405): the app must still start after sign-in.
  const off = await startGateServer({ root: ROOT, port: PORT + 1, env: { ...env, GATE_ENABLED: "0" } });
  try {
    await goto(`${off.url}/`, 4000);
    await type("#username", USER);
    await type("#password", PASSWORD);
    clearEvents();
    await ev(`document.querySelector('button[type=submit]').click()`);
    await waitForApp(ev, sleep);
    const text = (await ev(`document.body.innerText`)) ?? "";
    ok(!(await ev(`!!document.querySelector('#username')`)) && !/could not be opened/i.test(text), "browser: with the gate switched off the app starts after sign-in (a 405 from /api/gate is no fault)");
  } finally { off.close(); }
  const errors = consoleErrors().filter((t) => !/favicon|Failed to load resource/.test(t));
  ok(errors.length === 0, `browser: no console errors${errors.length ? ` (${errors[0].slice(0, 160)})` : ""}`);

  // A chunk of the app that does not load (503): a message and a retry button, not an empty page.
  const broken = await startGateServer({ root: ROOT, port: PORT + 3, env: { ...env, GATE_ENABLED: "0" }, failPattern: /^\/static\/app-[^/]*\.js$/ });
  try {
    await goto(`${broken.url}/`, 4000);
    await type("#username", USER);
    await type("#password", PASSWORD);
    await ev(`document.querySelector('button[type=submit]').click()`);
    for (let i = 0; i < 50 && !/could not be opened/i.test((await ev(`document.body.innerText`)) ?? ""); i++) await sleep(500);
    ok(/could not be opened/i.test((await ev(`document.body.innerText`)) ?? "") && (await ev(`[...document.querySelectorAll('button')].some((b) => /try again/i.test(b.innerText))`)), "browser: an app chunk that does not load shows a message and a retry button, not an empty page");
  } finally { broken.close(); }

  // A build without VITE_GATE starts the app at once and never calls the gate. Last: it replaces the build in apps/<app>/dist.
  console.log(`building apps/${APP} without VITE_GATE ...`);
  const plain = spawnSync("npm", ["run", `build:pages:${APP}`], { env: { ...process.env, VITE_GATE: "", VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: ANON }, encoding: "utf8" });
  if (plain.status !== 0) { console.error(plain.stdout.slice(-1500), plain.stderr.slice(-1500)); throw new Error("ungated build failed"); }
  ok(!existsSync(`${ROOT}/_gate.json`), "ungated build: no _gate.json");
  const plainServer = await startGateServer({ root: ROOT, port: PORT + 2, env });
  try {
    await goto(`${plainServer.url}/`, 1000);
    for (let i = 0; i < 50 && !(await ev(`!!document.querySelector('#username')`)); i++) await sleep(500);
    ok(await ev(`!!document.querySelector('#username')`), "ungated build: the app starts at once and shows its own sign-in page");
    clearEvents();
    await type("#username", USER);
    await type("#password", PASSWORD);
    await ev(`document.querySelector('button[type=submit]').click()`);
    await waitForApp(ev, sleep);
    const plainText = (await ev(`document.body.innerText`)) ?? "";
    ok(!(await ev(`!!document.querySelector('#username')`)) && !/could not be opened/i.test(plainText), "ungated build: signing in opens the app");
    ok(!responses().some(([, p]) => p === "/api/gate"), "ungated build: the gate is never called");
  } finally { plainServer.close(); }
} finally {
  browser.close();
  server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall gate checks passed");
process.exit(failures ? 1 : 0);
