// A tiny browser driver: headless Chromium over the DevTools protocol, no npm package. This is the way to test the apps in a
// real browser from WSL2 (see CLAUDE.md, "Browser tests"). Chromium is Playwright's cached headless shell
// (~/.cache/ms-playwright/chromium_headless_shell-*); it needs the system libraries libnspr4, libnss3 and libasound2 (one-time
// `sudo apt-get install -y libnspr4 libnss3 libasound2t64`). CHROME=<path> overrides the binary.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export const findChromium = () => {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), ".cache/ms-playwright");
  if (!existsSync(cache)) return null;
  for (const dir of readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
    for (const sub of readdirSync(join(cache, dir))) {
      const bin = join(cache, dir, sub, "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333 } = {}) {
  const bin = findChromium();
  if (!bin) throw new Error("no headless Chromium found (set CHROME, or see CLAUDE.md > Browser tests)");
  const profile = mkdtempSync(join(tmpdir(), "rbp-browser-"));
  const proc = spawn(bin, ["--no-sandbox", "--disable-gpu", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d));
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    try { await fetch(`http://127.0.0.1:${port}/json/version`); up = true; } catch { await sleep(200); }
  }
  if (!up) {
    proc.kill();
    throw new Error(`Chromium did not start: ${stderr.split("\n")[0] || "no output"} (missing system libraries? see CLAUDE.md > Browser tests)`);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id) { pending.get(d.id)?.(d); pending.delete(d.id); } else events.push(d);
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  for (const domain of ["Page", "Runtime", "Network", "Log"]) await send(`${domain}.enable`);
  return {
    events,
    send,
    sleep,
    clearEvents: () => { events.length = 0; },
    // Evaluates in the page (awaits promises) and returns the value.
    ev: async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value,
    goto: async (url, wait = 3000) => { await send("Page.navigate", { url }); await sleep(wait); },
    // [status, pathname] of every response since the last clearEvents().
    responses: () => events.filter((e) => e.method === "Network.responseReceived").map((e) => [e.params.response.status, new URL(e.params.response.url).pathname]),
    consoleErrors: () => events.filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error").map((e) => e.params.entry.text),
    // Types into an input like a person (the page's own input handlers run).
    type: async (selector, text) => { await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)}).focus()` }); await send("Input.insertText", { text }); },
    close: () => { try { ws.close(); } catch { /* already closed */ } proc.kill(); rmSync(profile, { recursive: true, force: true }); },
  };
}
