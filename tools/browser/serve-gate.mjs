// Local stand-in for Cloudflare Pages, for testing the code gate: the static files of a build, its _headers (the /* block) and
// the Pages Function in front, with _routes.json deciding which requests reach it. Used by gate-test.mjs; also runnable alone:
//   node --experimental-strip-types tools/browser/serve-gate.mjs apps/npm/dist 8788
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

// failPattern (RegExp): requests whose path matches answer 503, to test how the app copes with a chunk that does not load.
export async function startGateServer({ root, port, env, quiet = true, failPattern = null }) {
  const { onRequest } = await import(pathToFileURL(join(process.cwd(), "functions/_middleware.ts")).href);
  const routes = JSON.parse(readFileSync(join(root, "_routes.json"), "utf8")).include;
  const reachesFunction = (p) => routes.some((g) => (g.endsWith("/*") ? p.startsWith(g.slice(0, -1)) : p === g));
  const headers = readFileSync(join(root, "_headers"), "utf8").split("\n\n")[0].split("\n").slice(1).map((line) => {
    const t = line.trim();
    const i = t.indexOf(": "); // not a split on ": ": a CSP value contains "data: blob:"
    return i < 0 ? null : [t.slice(0, i).toLowerCase(), t.slice(i + 2)];
  }).filter(Boolean);
  const file = (p) => { const f = join(root, p); return existsSync(f) && statSync(f).isFile() ? f : null; };
  // Static files, and index.html for any other path outside /static/ (the SPA fallback of Pages).
  const serve = (p, method = "GET") => {
    // A static asset refuses a POST (Pages answers 405): what the app sees from /api/gate while the Function has the gate switched off.
    if (method !== "GET" && method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
    if (failPattern?.test(p)) return new Response("Service Unavailable", { status: 503 });
    const f = file(p) ?? (p.startsWith("/static/") ? null : join(root, "index.html"));
    if (!f) return new Response("Not found", { status: 404 });
    return new Response(readFileSync(f), { headers: { "content-type": MIME[extname(f)] ?? "application/octet-stream", "cache-control": p.startsWith("/static/") ? "public, max-age=31536000, immutable" : "no-cache" } });
  };
  const fullEnv = { ...env, ASSETS: { fetch: async (request) => serve(new URL(request.url).pathname, request.method) } };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const request = new Request(url, { method: req.method, headers: req.headers });
    const out = reachesFunction(url.pathname) ? await onRequest({ request, env: fullEnv, next: async () => serve(url.pathname, req.method) }) : serve(url.pathname, req.method);
    const h = Object.fromEntries(out.headers);
    for (const [k, v] of headers) h[k] = v;
    res.writeHead(out.status, h);
    res.end(Buffer.from(await out.arrayBuffer()));
    if (!quiet) console.log(req.method, url.pathname.slice(0, 70), out.status);
  });
  await new Promise((r) => server.listen(port, r));
  return { close: () => server.close(), url: `http://localhost:${port}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root = "apps/npm/dist", port = "8788"] = process.argv.slice(2);
  const server = await startGateServer({
    root, port: Number(port), quiet: false,
    env: { GATE_ENABLED: "1", GATE_SECRET: "local-test-secret-0123456789abcdef-xyz", SUPABASE_URL: process.env.VITE_SUPABASE_URL, SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY },
  });
  console.log("gate server on", server.url);
}
