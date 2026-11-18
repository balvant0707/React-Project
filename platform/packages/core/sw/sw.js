// Service worker of the app (template: the build plugin in @rbp/core/vite fills in APP, BUILD and the file list).
// It makes the app start without reception: every build file is cached on install, navigations fall back to the cached
// app shell. Data is NOT handled here (it lives on another origin and is cached by the app, see src/offline/).
const APP = "__APP__";
const BUILD = "__BUILD__";
const SHELL = `${APP}-shell-${BUILD}`;
const FILES = __PRECACHE__;
// Code gate: the gated files of this build (a JSON list, itself behind the gate), or null when the build has no gate.
const GATED_LIST = __GATED_LIST__;
// Files whose name does not change between builds: serve the cached copy, refresh it in the background.
const MUTABLE = ["/config.js", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

// After sign-in the page asks for the files that are served only with the gate cookie: cache those not cached yet, so the app
// starts without network next time. A 403 (no cookie yet) is simply skipped; the next start asks again.
const warmGated = async () => {
  if (!GATED_LIST) return;
  const cache = await caches.open(SHELL);
  const listed = await fetch(GATED_LIST, { credentials: "same-origin" });
  if (!listed.ok) return;
  const missing = [];
  for (const file of await listed.json()) if (!(await cache.match(file))) missing.push(file);
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(missing.slice(i, i + 6).map((file) => fetch(file, { credentials: "same-origin" }).then((res) => (res.ok ? cache.put(file, res) : undefined)).catch(() => undefined)));
  }
};
self.addEventListener("message", (event) => {
  if (event.data?.type === "warm-gated") event.waitUntil(warmGated());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(`${APP}-shell-`) && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout")), ms);
  promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/offline-file/")) return;

  // Page loads: network first (a short timeout for bad reception), the cached shell otherwise.
  if (req.mode === "navigate") {
    event.respondWith(
      withTimeout(fetch(req), 4000).catch(async () => (await caches.match("/", { ignoreVary: true })) || Response.error()),
    );
    return;
  }

  if (MUTABLE.includes(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(req, { ignoreVary: true });
        const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
        return cached || refresh;
      }),
    );
    return;
  }

  // Build files and static assets: cached copy first.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && (url.pathname.startsWith("/static/") || url.pathname === "/pdf.worker.min.mjs")) {
        const copy = res.clone();
        caches.open(SHELL).then((cache) => cache.put(req, copy));
      }
      return res;
    })),
  );
});

// Web Push (platform/functions/send-push): the send-push function sends {title, body, url, tag, skipIfFocused}.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // The app shows it as a toast when it is in front; a second system notification would only be noise.
      if (data.skipIfFocused && clients.some((c) => c.focused && c.visibilityState === "visible")) return;
      return self.registration.showNotification(data.title || APP, {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: !!data.tag,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: data.url || "/" },
      });
    }),
  );
});

// A tap opens the link: in an open window of the app if there is one, else in a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        await client.focus();
        // The app moves there itself (no reload; the notification toaster listens).
        client.postMessage({ type: "navigate", url: target });
        return;
      }
      return self.clients.openWindow(target);
    }),
  );
});
