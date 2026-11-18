// Security check of the Cloudflare Pages output. Runs at the end of `npm run build:pages -- <app>`, so a failing check
// fails the Pages build and nothing is published.
//   node tools/pages/check-pages-output.mjs <app>                checks apps/<app>/dist (files, _headers, secrets)
//   node tools/pages/check-pages-output.mjs <app> --url <base>   checks a deployment (production or a branch preview)
// The header policy is kept apart from write-pages-config.mjs on purpose: a weakened header must get past both.
// From COMPASS app/scripts/check-pages-output.mjs. Changed: one script for both apps; no config.js (origin and anon key
// from the VITE_* or plain SUPABASE_* variables); per-app wide sources (APP_EXTRA); no Docker comparison; TypeScript
// build output in dist fails.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const errors = [];
const app = process.argv[2];
if (!["compass", "npm"].includes(app)) {
  console.error("usage: node tools/pages/check-pages-output.mjs <compass|npm> [--url <base>]");
  process.exit(1);
}
// Wide sources an app may add to the common policy (keep in step with write-pages-config.mjs).
const APP_EXTRA = { npm: { "img-src": ["https:"], "frame-src": ["'self'", "blob:"] } }[app] ?? {};
// Cloudflare Turnstile (core login/captcha.tsx): the one extra origin of script-src, frame-src and connect-src, required when
// the build has VITE_TURNSTILE_SITE_KEY and otherwise allowed (a deployment is checked without the build variables).
const TURNSTILE = "https://challenges.cloudflare.com";
const TURNSTILE_BUILD = Boolean(process.env.VITE_TURNSTILE_SITE_KEY);
const fail = (message) => errors.push(message);

// --- Header policy ------------------------------------------------------------------------------------------

const ORIGIN_RE = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/;

function parseCsp(value) {
  const directives = {};
  for (const part of value.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    if (directives[name]) fail(`CSP: directive ${name} appears twice (browsers use the first one)`);
    directives[name] = sources;
  }
  return directives;
}

// origin = the Supabase origin the CSP must name (null: no build variables set, skip that part).
function checkCsp(value, origin, where) {
  const csp = parseCsp(value);
  const exact = {
    "default-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  for (const [name, expected] of Object.entries(exact)) {
    if (JSON.stringify(csp[name]) !== JSON.stringify(expected))
      fail(`${where}: CSP ${name} must be ${expected.join(" ")}, is ${csp[name]?.join(" ") ?? "missing"}`);
  }
  const script = csp["script-src"];
  if (!script) fail(`${where}: CSP script-src missing`);
  else {
    const allowed = new Set(["'self'", "'wasm-unsafe-eval'", TURNSTILE]);
    for (const source of script)
      if (!allowed.has(source)) fail(`${where}: CSP script-src must not contain ${source}`);
  }
  for (const [name, sources] of Object.entries(csp)) {
    for (const source of sources) {
      if (APP_EXTRA[name]?.includes(source)) continue;
      if (source === TURNSTILE) {
        if (!["script-src", "frame-src", "connect-src"].includes(name)) fail(`${where}: CSP ${name} contains ${TURNSTILE}`);
        continue;
      }
      if (source === "*" || source === "http:" || source === "https:" || source === "ws:" || source === "wss:" || source.includes("*"))
        fail(`${where}: CSP ${name} contains the wildcard ${source}`);
      if (source === "'unsafe-eval'") fail(`${where}: CSP ${name} contains 'unsafe-eval'`);
      if (source === "data:" && !["img-src", "font-src"].includes(name)) fail(`${where}: CSP ${name} allows data:`);
    }
  }
  if (TURNSTILE_BUILD)
    for (const name of ["script-src", "frame-src", "connect-src"])
      if (!(csp[name] ?? []).includes(TURNSTILE)) fail(`${where}: CSP ${name} must name ${TURNSTILE} (the build has a Turnstile site key)`);
  if (origin) {
    const ws = origin.replace(/^http/, "ws");
    const connect = new Set(csp["connect-src"] ?? []);
    const expected = new Set(["'self'", origin, ws, ...(connect.has(TURNSTILE) ? [TURNSTILE] : [])]);
    if (connect.size !== expected.size || [...expected].some((s) => !connect.has(s)))
      fail(`${where}: CSP connect-src must be exactly 'self' ${origin} ${ws}, is ${[...connect].join(" ")}`);
  }
}

function checkSecurityHeaders(headers, origin, where) {
  const get = (name) => headers[name.toLowerCase()];
  const csp = get("Content-Security-Policy");
  if (!csp) fail(`${where}: Content-Security-Policy missing`);
  else checkCsp(csp, origin, where);
  const hsts = /max-age=(\d+)/.exec(get("Strict-Transport-Security") ?? "");
  if (!hsts || Number(hsts[1]) < 31536000) fail(`${where}: Strict-Transport-Security needs max-age >= 31536000`);
  if (get("X-Content-Type-Options") !== "nosniff") fail(`${where}: X-Content-Type-Options must be nosniff`);
  if (get("X-Frame-Options") !== "DENY") fail(`${where}: X-Frame-Options must be DENY`);
  if (!["same-origin", "no-referrer", "strict-origin"].includes(get("Referrer-Policy")))
    fail(`${where}: Referrer-Policy must be same-origin, no-referrer or strict-origin`);
  if (get("Cross-Origin-Opener-Policy") !== "same-origin") fail(`${where}: Cross-Origin-Opener-Policy must be same-origin`);
  const permissions = get("Permissions-Policy") ?? "";
  for (const feature of ["microphone", "geolocation", "payment", "usb"])
    if (!permissions.includes(`${feature}=()`)) fail(`${where}: Permissions-Policy must switch off ${feature}`);
  if (!(get("X-Robots-Tag") ?? "").includes("noindex")) fail(`${where}: X-Robots-Tag must contain noindex`);
}

// --- build variables and secrets -------------------------------------------------------------------------------

function jwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Returns the Supabase origin of the build's variables, or null.
function checkEnv(where) {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
  if (!url && !key) return null;
  const origin = url.replace(/\/$/, "");
  if (!ORIGIN_RE.test(origin)) fail(`${where}: VITE_SUPABASE_URL is not an origin`);
  if (key.startsWith("sb_publishable_")) return origin;
  const payload = key.split(".").length === 3 ? jwtPayload(key) : null;
  if (payload?.role !== "anon")
    fail(`${where}: VITE_SUPABASE_ANON_KEY is neither an anon JWT nor a publishable key (role: ${payload?.role ?? "not a JWT"}). Never put the service role key into the Pages settings.`);
  return origin;
}

const SECRET_ROLES = new Set(["service_role", "supabase_admin", "postgres"]);

function scanForSecrets(text, where) {
  for (const [token] of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g)) {
    const role = jwtPayload(token)?.role;
    if (SECRET_ROLES.has(role)) fail(`${where}: contains a JWT with role ${role}`);
  }
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) fail(`${where}: contains a Supabase secret key (sb_secret_...)`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) fail(`${where}: contains a private key`);
  if (/SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY/.test(text)) fail(`${where}: names a server-side secret variable`);
}

// --- dist/ --------------------------------------------------------------------------------------------------

// Pages ignores a malformed line or a rule beyond its limits silently, so the parser is strict.
function parseHeadersFile(text) {
  const rules = new Map();
  let current = null;
  text.split("\n").forEach((line, i) => {
    const at = `_headers line ${i + 1}`;
    if (line.length > 2000) fail(`${at}: longer than 2000 characters (Pages drops it)`);
    if (!line.trim() || line.trim().startsWith("#")) return;
    if (!/^\s/.test(line)) {
      if (!line.startsWith("/")) return fail(`${at}: a rule must start with /`);
      if (rules.has(line.trim())) fail(`${at}: rule ${line.trim()} appears twice`);
      current = {};
      rules.set(line.trim(), current);
      return;
    }
    const header = /^\s+([A-Za-z0-9-]+):\s*(.+)$/.exec(line);
    if (!current || !header) return fail(`${at}: not a header line of a rule`);
    const name = header[1].toLowerCase();
    if (current[name]) fail(`${at}: header ${header[1]} set twice in one rule (Pages joins them)`);
    current[name] = header[2].trim();
  });
  if (rules.size > 100) fail(`_headers: ${rules.size} rules, Pages applies only 100`);
  return rules;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function checkDist() {
  const dist = `apps/${app}/dist`;
  for (const file of ["index.html", "_headers", "sw.js", "manifest.webmanifest", "pdf.worker.min.mjs"])
    if (!existsSync(join(dist, file))) fail(`dist/${file} missing`);
  if (!existsSync(join(dist, "static")) || !readdirSync(join(dist, "static")).some((f) => f.endsWith(".js")))
    fail("dist/static has no JavaScript (Vite build incomplete)");
  // 404.html ends the SPA fallback; _worker.js, functions, _redirects add server behaviour; wrangler.toml overrides the dashboard.
  for (const file of ["404.html", "_worker.js", "_redirects"])
    if (existsSync(join(dist, file))) fail(`dist/${file} must not exist`);
  // The one server-side piece is the code gate (docs/code-gate.md): functions/_middleware.ts, nothing else under functions/, and the
  // _routes.json that decides which requests reach it. It does nothing unless the Pages project sets GATE_ENABLED=1; a build with
  // VITE_GATE=1 guards /static/* and needs the public list, any other build lets only /api/gate reach it and has no public list.
  if (existsSync("functions")) {
    const found = readdirSync("functions");
    if (found.length !== 1 || found[0] !== "_middleware.ts") fail(`functions/ may only hold _middleware.ts (the code gate), found: ${found.join(", ")}`);
  }
  const gateBuild = Boolean(process.env.VITE_GATE);
  const expectedRoutes = JSON.stringify({ version: 1, include: gateBuild ? ["/static/*", "/api/*", "/_gate.json"] : ["/api/gate"], exclude: [] });
  const routesFile = join(dist, "_routes.json");
  if (!existsSync(routesFile)) fail("dist/_routes.json missing (write-pages-config.mjs writes it: it keeps the Pages Function away from the app's files)");
  else if (readFileSync(routesFile, "utf8").trim() !== expectedRoutes) fail(`dist/_routes.json must be exactly ${expectedRoutes} for a build ${gateBuild ? "with" : "without"} VITE_GATE`);
  if (gateBuild !== existsSync(join(dist, "_gate.json"))) fail(`dist/_gate.json must ${gateBuild ? "exist" : "not exist"} for a build ${gateBuild ? "with" : "without"} VITE_GATE`);
  if (gateBuild && !existsSync("functions/_middleware.ts")) fail("a build with VITE_GATE needs functions/_middleware.ts");
  for (const file of ["wrangler.toml", "wrangler.json", "wrangler.jsonc", `apps/${app}/functions`, `apps/${app}/wrangler.toml`])
    if (existsSync(file)) fail(`${file} must not exist (the Pages project is configured in the dashboard only, docs/deploy.md)`);
  if (errors.length) return;

  const files = walk(dist);
  for (const path of files) {
    const rel = relative(dist, path);
    if (/\.map$/.test(rel)) fail(`dist/${rel}: source maps must not be published`);
    if (/(^|\/)\.(env|git)/.test(rel)) fail(`dist/${rel}: must not be published`);
    if (/\.d\.[cm]?ts$|\.tsbuildinfo$/.test(rel)) fail(`dist/${rel}: TypeScript build output must not be published (vite build only)`);
    if (/\.(js|mjs|html|json|webmanifest|css|txt|svg)$/.test(rel) || rel === "_headers")
      scanForSecrets(readFileSync(path, "utf8"), `dist/${rel}`);
  }

  const origin = checkEnv("build variables");
  const index = readFileSync(join(dist, "index.html"), "utf8");
  // The CSP allows no inline script.
  for (const [, attrs] of index.matchAll(/<script([^>]*)>/g))
    if (!/\ssrc=/.test(attrs)) fail("index.html contains an inline <script>");

  const rules = parseHeadersFile(readFileSync(join(dist, "_headers"), "utf8"));
  const root = rules.get("/*");
  if (!root) return fail("_headers: rule /* missing");
  checkSecurityHeaders(root, origin, "_headers /*");
  if (root["cache-control"]) fail("_headers /*: no Cache-Control here (Pages joins it with the specific rules)");
  const cache = { "/sw.js": "no-cache", "/static/*": "public, max-age=31536000, immutable" };
  for (const [path, value] of Object.entries(cache))
    if (rules.get(path)?.["cache-control"] !== value) fail(`_headers ${path}: Cache-Control must be "${value}"`);
  for (const [path, rule] of rules)
    for (const name of Object.keys(rule))
      if (path !== "/*" && name !== "cache-control") fail(`_headers ${path}: sets ${name}; security headers belong to /* only`);
}

// --- deployment ---------------------------------------------------------------------------------------------

async function checkUrl(base) {
  base = base.replace(/\/$/, "");
  const get = async (path, init) => {
    const response = await fetch(base + path, { redirect: "manual", ...init });
    const headers = Object.fromEntries([...response.headers].map(([k, v]) => [k.toLowerCase(), v]));
    return { response, headers, body: init?.method === "HEAD" ? "" : await response.text() };
  };

  const origin = checkEnv("build variables");

  const home = await get("/");
  if (home.response.status !== 200) fail(`/: status ${home.response.status}`);
  if (/immutable/.test(home.headers["cache-control"] ?? "")) fail("/: index.html must not be cached as immutable");

  // Every kind of response carries the security headers.
  const deep = await get("/tasks/00000000-0000-0000-0000-000000000000");
  if (deep.response.status !== 200 || !(deep.headers["content-type"] ?? "").includes("text/html"))
    fail(`SPA fallback: /tasks/<id> answers ${deep.response.status} ${deep.headers["content-type"]}`);
  const script = /src="(\/static\/[^"]+\.js)"/.exec(home.body)?.[1];
  const asset = script ? await get(script) : null;
  if (!asset) fail("/: no /static/ script found in index.html");
  else if (!/immutable/.test(asset.headers["cache-control"] ?? "")) fail(`${script}: not cached as immutable`);
  const sw = await get("/sw.js");
  if (sw.headers["cache-control"] !== "no-cache") fail(`/sw.js: Cache-Control is "${sw.headers["cache-control"]}"`);
  for (const [path, r] of [["/", home], ["/tasks/<id>", deep], ["/sw.js", sw], [script, asset]])
    if (r) checkSecurityHeaders(r.headers, origin, path);
  if (home.headers["content-security-policy"] !== deep.headers["content-security-policy"])
    fail("the SPA fallback sends another CSP than /");

  // Pages consumes _headers and does not serve it; a raw copy would show the build's configuration.
  const raw = await get("/_headers");
  if (raw.body.includes("Content-Security-Policy:")) fail("/_headers is served as a file");
  for (const path of ["/.env", "/.git/config", "/index.html.map"]) {
    const r = await get(path);
    if (r.response.status === 200 && !(r.headers["content-type"] ?? "").includes("text/html")) fail(`${path} is served`);
  }

  const url = new URL(base);
  if (url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    const plain = await fetch(`http://${url.host}/`, { redirect: "manual" });
    const location = plain.headers.get("location") ?? "";
    if (![301, 302, 307, 308].includes(plain.status) || !location.startsWith("https://"))
      fail(`http:// is not redirected to https:// (status ${plain.status})`);
  }
}

// --- main ---------------------------------------------------------------------------------------------------

const urlArg = process.argv.indexOf("--url");
if (urlArg > -1) {
  const base = process.argv[urlArg + 1];
  if (!base) fail("--url needs the base address of the deployment");
  else await checkUrl(base).catch((error) => fail(`${base}: ${error.message}`));
} else {
  checkDist();
}

if (errors.length) {
  console.error(`check-pages-output: ${errors.length} problem(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`check-pages-output: ${urlArg > -1 ? process.argv[urlArg + 1] : `apps/${app}/dist`} passes`);
