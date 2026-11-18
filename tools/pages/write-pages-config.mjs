// Cloudflare Pages: writes apps/<app>/dist/_headers after `vite build` (npm run build:pages -- <app>).
// From COMPASS app/scripts/write-pages-config.mjs. Changed: one script for both apps; no config.js (the CSP origin comes
// from the build's VITE_* variables, plain SUPABASE_* still work); RADAR adds NPM's img-src https: (received emails) and
// frame-src blob: (PDFs), without NPM's form-action. Replaces NPM's pages-headers Vite plugin and public/_headers.
import { existsSync, writeFileSync } from "node:fs";

function fail(message) {
  console.error(`write-pages-config: ${message}`);
  process.exit(1);
}

const app = process.argv[2];
if (!["compass", "npm"].includes(app)) fail("usage: node tools/pages/write-pages-config.mjs <compass|npm>");
const dist = `apps/${app}/dist`;
if (!existsSync(`${dist}/index.html`)) fail(`${dist}/index.html missing: build the app first`);

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

// Only scheme://host[:port] goes into the CSP; anything else would widen or break it, so the build fails instead.
const match = /^(https?:\/\/[A-Za-z0-9.-]+(:[0-9]+)?)\/?$/.exec(url);
if (!match) fail(`SUPABASE_URL must look like https://<host>[:port], got: '${url}'`);
if (!/^[A-Za-z0-9._-]+$/.test(anonKey)) fail("SUPABASE_ANON_KEY is missing or has unexpected characters");

// Cloudflare Turnstile on the sign-in form (core login/captcha.tsx): only when the build has a site key. It needs the script,
// its frame and its verification calls from this one origin.
const siteKey = process.env.VITE_TURNSTILE_SITE_KEY ?? "";
if (siteKey && !/^[A-Za-z0-9_-]+$/.test(siteKey)) fail("VITE_TURNSTILE_SITE_KEY has unexpected characters");
const TURNSTILE = "https://challenges.cloudflare.com";
const ts = siteKey ? ` ${TURNSTILE}` : "";

const origin = match[1];
const wsOrigin = origin.replace(/^http/, "ws");

// What an app adds to the common policy (tools/pages/check-pages-output.mjs allows exactly these).
const extra = { npm: { "img-src": ["https:"], "frame-src": ["'self'", "blob:"] } }[app] ?? {};
const add = (name) => (extra[name] ? ` ${extra[name].join(" ")}` : "");

const csp = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval'${ts}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${origin}${add("img-src")}`,
  `media-src 'self' blob: ${origin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${origin} ${wsOrigin}${ts}`,
  ...(extra["frame-src"] || siteKey ? [`frame-src${extra["frame-src"] ? add("frame-src") : " 'self'"}${ts}`] : []),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Pages joins the values of several matching rules, so Cache-Control is never set by /*; everything else (index.html
// too) gets Pages' default "public, max-age=0, must-revalidate".
const headers = `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: same-origin
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()
  X-Robots-Tag: noindex, nofollow

/sw.js
  Cache-Control: no-cache

/static/*
  Cache-Control: public, max-age=31536000, immutable
`;

writeFileSync(`${dist}/_headers`, headers);

// Code gate (docs/code-gate.md): the Pages Function (functions/_middleware.ts) is deployed with every build, so _routes.json decides
// which requests reach it. A gate build lets it guard /static/*; any other build lets only /api/gate reach it (a path nothing
// calls), so the Function is not run, and not counted, for the files of the app.
const routes = process.env.VITE_GATE === "1" ? ["/static/*", "/api/*", "/_gate.json"] : ["/api/gate"];
writeFileSync(`${dist}/_routes.json`, JSON.stringify({ version: 1, include: routes, exclude: [] }));
