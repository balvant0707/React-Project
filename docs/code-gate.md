# Code gate (prototype)

The app's JavaScript can be served only to a browser that has a Supabase session. A visitor without one gets the sign-in pages
and nothing of the modules. It is off unless both switches below are set; both apps (`apps/npm`, `apps/compass`) have the public entry, each Pages project switches it on for itself.

## How it works

1. **Public entry.** Both apps start through `startApp` (`platform/packages/core/src/gate/startApp.tsx`); their `main.tsx` only names what differs (name, theme, brand, `loadApp`, COMPASS's `prepare` and `publicRoutes`). With `VITE_GATE=1` the build has a small public entry that renders `GateEntry`
   (`platform/packages/core/src/gate/`), which holds the sign-in, forgot-password, activation and password-reset pages. The
   app itself (`apps/<app>/src/app.tsx`: `RefineRoot`, all modules, the admin pages) is loaded with `import('./app')` after the
   gate has been opened. Without `VITE_GATE` the app starts at once, as before. Anything an app's `main.tsx` imports statically is public: load the rest with `import()`.
2. **Opening the gate.** A password-only session gets 403, and the entry shows the authenticator page (`MfaPage`, enrolment and code, with `onDone`) instead of the app; the code verified, the gate opens. With a session, `GateEntry` calls `POST /api/gate` with the access token. The Pages Function
   (`functions/_middleware.ts`) asks Supabase (`/auth/v1/user`) whether the token is good and (`rpc/mfa_satisfied`) whether its second factor is done, the rule
   of the `mfa_required` policies (aal2, accepted Microsoft sign-in, `require_mfa` off, not locked), and answers with the cookie
   `__Host-rbp_gate` (`v1.<expiry>.<user id>.<HMAC-SHA256>`, HttpOnly, Secure, SameSite=Lax, 12 hours). Once the app runs,
   `startGateRenewal` renews it on every token refresh and sign-in and deletes it at sign-out.
3. **Serving.** The Function guards everything under `/static/` except images and fonts and the files listed in `/_gate.json`
   (the public entry chunk and what it imports statically, written by the build in
   `platform/packages/core/vite/serviceWorker.mjs`). Without a valid cookie it answers 403. Guarded files get
   `Cache-Control: private` and `Vary: Cookie`. `_routes.json` (`tools/pages/write-pages-config.mjs`) limits the Function to
   `/static/*`, `/api/*` and `/_gate.json` in a gate build; every other build lets only `/api/gate` reach it (a path nothing
   calls), so on a normal build the Function is not run for the app's files and costs no requests.
4. **Service worker.** On install it caches only the public files (it has no cookie yet). After sign-in the page sends
   `warm-gated`; the worker fetches the list `/static/precache-gated-<id>.json` (itself behind the gate) and caches the files it
   does not have, so the app also starts without network. If the gate is not there (404) or there is no network, the app
   starts from the cache as before.

What the public part contains is checked from the build output: 3 JS files (about 2 MB: React, Ant Design, Refine, the sign-in
pages), the 3 server functions and 2 tables of the platform (`is_admin`, `my_permissions`, `push_subscribe`; `users`,
`push_subscriptions`) and no module code.

**Pages without a sign-in.** `GateEntry` takes `publicRoutes` for pages that must work without a session. COMPASS passes the QR report
form (`/report/:token`, `modules/tickets/src/pages/report`): it and its texts (`modules/tickets/src/reportLocales.json`, only the form's) are part of the public entry, so it imports `@rbp/core/gate`
and not `@rbp/core` (which is the whole app). A signed-in visitor on that path gets the gate opened and the normal route. When the gate is open, `GateEntry` first takes the sign-in pages down (phase `ready`) and only then moves off `/login` and starts the app, so a fast answer from the gate cannot let the old router push `/login` over the app. COMPASS also loads
`restoreOfflineCache` (the device cache) only after the gate is open, for the same reason.

## Switching it on (per app, in its own Pages project)

Order matters; the Function does nothing until `GATE_ENABLED=1`. `VITE_GATE` is read while the app is built and baked into it;
`GATE_SECRET` and `GATE_ENABLED` are read by the Function when a request arrives (no `VITE_` prefix, so the build ignores them;
set `GATE_SECRET` as an encrypted secret). The Function reads the Supabase URL and anon key from `SUPABASE_URL` /
`SUPABASE_ANON_KEY`, or else from the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the build already has, so they need not be
set twice. If the gate is enabled but `GATE_SECRET` (32+ characters), the URL or the key is missing, the Function passes
everything through and adds the header `x-gate: misconfigured` (the site stays up, unprotected).

1. Merge, so the Function and the gate-capable build are deployed. Nothing changes: the Function is deployed to both Pages
   projects (it lives at the repo root), but a normal build routes only `/api/gate` to it, and without `GATE_ENABLED=1` it
   passes everything through. Both apps are gate-capable; set `VITE_GATE` and `GATE_ENABLED` per Pages project, and only together with the matching build.
2. Pages project variables: `GATE_SECRET` (random, 32 characters or more, secret) and the build variable `VITE_GATE=1`
   (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are already there). Redeploy and check the app still works (the
   Function is still inert).
3. Set `GATE_ENABLED=1` and start a new deployment (`curl -sI <a /static/ chunk>` shows `x-gate: misconfigured` if something is missing) (Pages binds variables to a deployment: a changed variable applies to the
   next one, "Retry deployment" is enough). Check: a private window gets the sign-in page and no module code; after sign-in the
   app loads; reload, offline start and a new build while signed in still work.

Back out: the fastest way is to roll the Pages project back to the last deployment from before step 3 in the dashboard (check once,
when first setting this up, that it brings the older variables back). Otherwise remove `GATE_ENABLED` and retry the deployment
(a few minutes, every file is served again), then remove `VITE_GATE` and redeploy. There is no instant switch.
Never enable the Function while the deployed build has no gate: its entry would load every file and get 403s.
The Function counts as a Pages Function request for every guarded file; check the plan limits of the Pages / Workers plan.

## Limits

- Any session that passes the database's own second-factor rule gets the code, all of it, whatever the role. It keeps out visitors,
  crawlers, scrapers and password-only sessions, not an employee with a full login.
- The 12-hour cookie is not tied to the device. A browser that was offline for longer starts from the cache and gets a new cookie
  when it is back online; an app that stays open past the expiry without a token refresh fetches page chunks it has not loaded
  yet with an expired cookie and fails until the next reload (the token refresh renews it hourly, so this needs a closed laptop).
- The service worker cache keeps the app on the device after sign-out (offline start needs it); the gate protects the download,
  not a device that already has the files.
- The build check (`tools/pages/check-pages-output.mjs`) allows exactly `functions/_middleware.ts` and the gate's `_routes.json`.

## Tests

`npm run test:gate` (`tools/browser/gate-test.mjs`, 25 checks; `GATE_TEST_APP=compass npm run test:gate` for COMPASS, which adds two checks for the report form) builds RADAR with the gate, checks `functions/_middleware.ts` in
Node against that build and the local Supabase (gate off, misconfigured passes through, VITE_ variables, public and guarded files with and without cookie,
changed expiry, changed signature, other secret, real session, password-only session with `require_mfa` on), then runs the app in headless Chromium behind the function: the
sign-in page loads from 4 public files only, sign-in opens the gate (204, HttpOnly + Secure cookie), 16 app files follow, the URL
leaves `/login`, the service worker caches about 100 files, a reload and an offline start work, and a request without the cookie
is refused. Further stages: an app chunk that answers 503 gives a message with a retry button (the order of preparation and load, and that a failing preparation never stops the start, is unit-tested in `npm run test:core`), and a last build without `VITE_GATE` starts at once and never calls the gate (that ungated build stays in `apps/<app>/dist` afterwards). Setup of the browser: `CLAUDE.md`, "Browser tests". What it cannot show: a real Pages deployment (Cloudflare's
routing, `_routes.json`, request limits), phones, and the installed PWA.
