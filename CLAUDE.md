# CLAUDE.md

React Business Platform (RBP): one code base for **COMPASS** (maintenance / collaboration app) and **RADAR** (the NPM tool, specs for Nippon Paint Marine Europe). An app is a selection of modules; each app keeps its own Supabase DB, users and deploy.

- RADAR moved to the platform on 2026-11-14, COMPASS on 2026-11-15; both apps run the platform build.
- The old repos (`~/maintenance_tool`, `~/npm_tool`) are no longer developed; never edit them from here.
- Everything in this repo is hand-maintained: the code is the source, nothing is generated from the old apps. Cutover and port material (data port, runbooks, rollback, the old generators) is in `~/rbp-cutover/`, for reference only and not part of the build. Plans and concepts are in `~/rbp-dev/` (see Docs).

## Docs

| File | What |
|---|---|
| `docs/architecture.md` | Principles, permission model, hooks, Refine capsule, UI rules, settled decisions. **Decisions there are final unless the user reopens them.** |
| `docs/module-dependencies.md` | How modules may depend on each other. |
| `docs/deploy.md` | Deploying: Pages, migrations, Edge Functions, secrets. |
| `docs/shared-parts.md` | Where COMPASS and NPM had the same concept twice and what was merged. |
| `docs/andon.md` | How the Andon feature (operational issues on the shopfloor) works, as built. |
| `docs/sql-tests-audit.md` | Which SQL tests can fail, and what the print-only ones hide. |

Keep this file and the docs current in the same change as the thing they describe.

**`docs/` describes what exists, never what is planned.** Plans, concepts for new modules and open questions do not belong in this repo, whatever their state: they evolve, and a plan in the repo goes stale. They live in the separate, local-only dev repo `~/rbp-dev/` (`concepts/<topic>.md`; see its README). When a piece is built, write the as-built description into `docs/<topic>.md` (what it does, how it behaves, where the code is); the open items stay in the concept file. Do not create plan, roadmap, TODO or "open items" sections in `docs/` or in code headers. Old-repo docs cited in file headers are written as `~/maintenance_tool/docs/...` / `~/npm_tool/docs/...`.

## Layout

- `platform/packages/core` (`@rbp/core`): module manifest (`defineModule`), registry (`resolveModules`), Supabase client, the facade hooks (`useIdentity`, `useLogin`, `useCan`, ...), `RefineRoot`. **The only place that may import `@refinedev/*`** (`src/refine/` and the facade); enforced by ESLint `no-restricted-imports` and `scripts/check-refine-imports.mjs`.
- `platform/packages/ui` (`@rbp/ui`): `createTheme(tokens)` and shared components. Ant Design is allowed everywhere.
- `platform/sql`: platform migrations and tests; `platform/functions`: platform Edge Functions.
- `modules/<key>`: `module.json` (key, requires), `sql/migrations`, `sql/tests`, `src/module.tsx` (default export = manifest), `src/help/<language>/NN-slug.md`. New ones via `tools/new-module.py`. Another module's file is imported as `@rbp/module-<m>/src/<path>.<ext>` (subpath export).
- `apps/<app>` (`compass`, `npm`): `app.config.json` (name + module list), `src/modules.ts`, `src/theme.ts` (CI tokens), `branding/` (favicons, icons, manifest; each app has its own, `scripts/check-branding.mjs` fails on a missing or copied file), `index.html` with the app title, `mail-logo.png` (600 x 140, heads the app's mails; their colour is `email_settings.brand_color`), `supabase/` (seeds, config; `apps/compass/supabase` is the local stack `rbp-compass`, ports 5632x, seed `00_core_dev_users.sql`).
- `tools/`: `compose.mjs`, `sql-test.sh`, `sql-test-all.mjs`, `perf.sh`, `new-module.py`, `pdf-smoke.mjs`, `pages/`.

### The core holds only what both apps use, in the same way

Do not put anything in `platform/sql`, `packages/core` or `packages/ui` that belongs to one app or one module: not a migration, policy, function, table, test, component or hook. Both apps get everything there, so a COMPASS-only thing is dead weight in RADAR (and the reverse), and a change to it changes both live databases. Put it in the lowest module that owns the thing it touches (a storage policy for training proofs -> `people`, an NPM view -> `fleet` / `offers` / ...); if it needs a table of a module, it is that module's. Only when two apps genuinely share it, and no module is the right home, does it go to the platform. Before adding a file there, ask: "does the other app use this?" If not, it is wrong there. (The mistake of 2026-11-14: the training proof storage policy went into `platform/sql` because the row policy next to it was there; it had to be moved to `people` and reverted on the RADAR cloud database.) NPM migrations live in NPM modules, never in `platform/sql`.

## Modules

Dependencies run one way, see `docs/module-dependencies.md`. A lower page gets an upper module's component through a record slot, never by import.

| Module | Used by | What |
|---|---|---|
| `messaging` | both | Chats, record notes, team posts, polls, reactions, mentions; record files panel `RecordFiles`; document type tag / select; the record notes panel frame `src/notes/` (sticky resizable column, list/detail toggles, header Notes button, around its ChatView; a page opts in with `useEntityNotes` / `useListNotes`; list helpers `useListRowProps` / `notesColumn` in `notes/tableFilter.tsx`). Every module words the events it writes in its own `src/feed/eventSentences.ts` through `registerEventSentence`, names of assets / route steps through `registerFeedNames`. |
| `help` | both | The manual: help page, search, context drawer. Every module puts its `src/help/<language>` chapters into the slot `help.chapters`, so an app's manual has exactly its modules' chapters. |
| `tasks` | both | Task engine with routes, `/tasks`, history sentences of the task events. A Tasks tab on any record through the record slots `specifications.tabs`, `orders.tabs`, `companies.tabs`, `hull_events.show.sections`. RADAR task types: `apps/npm/supabase/seed/10_tasks.sql`. Requires no domain module. |
| `task-family` | COMPASS | Requires `tasks`, `messaging`: COMPASS's task pages with checklists, recurring series, goals, initiatives, costs, effort, reminders, planning, decisions; replaces the tasks module's `/tasks` routes (the later module wins); also the start page content, dashboard tiles, phrases admin and the full task type editor. Offers the slots `task-family.module` (an upper module marks itself, `useHasModule`) and `task-family.taskItems`. |
| `home` | COMPASS | COMPASS's home page; requires `task-family`, `messaging`. |
| `workflows`, `assets`, `tickets`, `items`, `people`, `leave` | COMPASS | `workflows`: purposes, workflow hooks, the home RPCs. `assets`: assets and QR (slot `assets.ticketForm`). `tickets`: tickets and queues, public QR report on a `public` route. `items`: stock, maintenance statistics. `people`: directory, positions, trainings, operating instructions (print views on `print` routes). `leave`: absences and requests. |
| `npm-dashboard` | RADAR | Start page. |
| `companies` | RADAR | Table slice and loaders, also the base of the NPM modules: countries, Owner Associates (teams with an `owner_associate_teams` row and the team use `owner_associate`, kept on /admin/tenants), their Admin > Users fields, the NPM reference phrases, `search_rank`, cross-filter links. There is no Sales Admin role: operational roles are made in Admin > Roles. |
| `products` | RADAR | Products, packagings, cost prices. The DFT proposal is calculated in the database (`dft_proposal`, `product_max_dft`); the coefficient tables (`product_coefficients`, `coefficient_curves`, `coefficient_points`) are readable by admins only, so no other user's browser holds the curves. |
| `fleet` | RADAR | Vessels, hull events, newbuildings, shipyards, and the company list / page (which show fleet numbers). Slots: `vessels.tabs`, `vessels.timeline`, `hull_events.show.actions|sections`. |
| `offers` | RADAR | Specifications, orders, ports; fills fleet's slots. |
| `dock-reports` | RADAR | Dock reports (offline-first editing, journal, photos, signatures, PDFs). |
| `npm-email` | RADAR | Mailboxes, Mail page (email threads with their internal notes; record notes are on the messaging page, menu "Notes"), mail Edge Functions. The grant `mail.access` (no scopes, given to no role by default, admins pass) is needed for the Mail page and every mailbox, thread and draft; the mailbox rules then decide which. |

Platform parts that look like modules: the daily email digest of unread notifications (SMTP, Settings > Configuration > Email, `platform/functions/send-emails`; a module flags its mailed notification types with `notification_type_register(..., p_email => true)`); sign-in help and "Give login" (`platform/functions/login-help`, `person-grant-login`, core `login/LoginAccess.tsx`, `/activate`).

## Manifest hooks (`ModuleManifest`)

The current list is in `platform/packages/core/src/module.ts`; design in `docs/architecture.md` section 3. Beyond resources, routes, menu and permissions:

- `entityTypes`: the record types a module owns (label, plural, list path, notes, attachments; core `getEntityType`). Each module has `src/entityTypes.ts` with `ENTITY_CONFIG` for its pages and `src/fieldLabels.ts` built with messaging `defineFieldLabels`, which also names the fields in history lines.
- `listRpcs`: list views read through an rpc while a filter is set (`core/src/refine/dataProvider.ts`).
- `providers`: contexts around every route.
- `recordSlots`: an upper module puts tabs, buttons, sections or loaders into named slots of a lower module's page (`useRecordSlot(slot)` / `<RecordSlot slot ... />`); the slots a page offers are listed in its module's `module.tsx`.
- `contentAside`: a panel beside the page content (the notes panel).
- Resource `menuLink`: menu entry that links elsewhere than `list` (World Fleet). A resource `permission` without scope (`hull_events.view`) matches any held scope.
- Route `layout`: `print` = signed in without the shell, `public` = no sign-in, no shell.
- `menuOrder`: top-level menu position across modules; entries with a `parent` are registered after the core's admin group so they never pull it up.

## Core kit and conventions

- **Lists:** `useListFilterBar` (one filter bar for both apps; its `picker` is the Filter sheet on a phone), `Page` / `List` frame (COMPASS head: `hint`, `subtitle`, `action`, `toolbar`, `onBack`) on `@rbp/ui` `ListTable`, phone UI (`MobileCardList` / `ResponsiveList`, `SortButton`, `FilterSheet`, `FilterChip`), `NewButton` (button on a computer, round + on a phone), `setActionColor()` colours the round + per app.
- **Forms and data:** `usePhrases` / `usePhraseText`, `useMe` (user id, team ids), `SuggestInput` (suggests the values already stored, e.g. `users.site`).
- **Admin (core):** users, teams, roles, grants, settings, email, phrases: one page for both apps. The sentence of each permission literal on Admin > Grants ("See tasks assigned to me") is the text `permissions.literals.<literal>` (the dots are the nesting) with the heading `entities.<module>`, in the `locales.json` of the module that registers the literal; a new literal needs its sentence there.
- **Teams:** team uses with `team_use_registry.managed_path` are kept on that module page. Settings > Teams shows a fixed tag; signed-in users cannot add, change or remove such a use directly, and only an admin deletes such a team (triggers `team_uses_guard_managed`, `teams_guard_managed_delete`).
- **Languages:** an app can fix its languages with core `setAppLanguages()` before rendering (RADAR: `['en']`, no language switch).
- **Offline and status:** one query client for both apps (core `queryClient.ts`: backend status banner under the header, data kept on a failed request). An app keeps a device cache by awaiting core `restoreOfflineCache()` before rendering (COMPASS only); a module's write queue shows its count in the banner through `registerOutbox` (task-family's checklist outbox).
- **Tab title:** `<record or menu entry> · <app>` (`usePageTitle` names the record).

## Testing

SQL tests live in `modules/<key>/sql/tests/`: a test lives in the highest module it touches; `platform/sql/tests` only holds tests that touch no module. No app prefix in the name. Header lines `-- apps: <app>` (needs that app's seed) and `-- requires: <module>` skip a test elsewhere. `npm run test:sql -- <app>` (`tools/sql-test-all.mjs <app>`) runs the tests of one app's modules; `tools/sql-test.sh <app> <file>` runs one file. `tools/sql-test-all.mjs --list` shows run / perf / skip; perf probes (`*_perf.sql`, `*_lists.sql`) run with `tools/perf.sh <app> <file.sql> [--update]` against their baseline. A test fails on a non-zero exit code or the word `FAIL` in its output.

### Browser tests

To test the apps in a real browser, use **headless Chromium driven over the DevTools protocol**: `tools/browser/cdp.mjs` (a ~70-line driver, no npm package), `tools/browser/serve-gate.mjs` (Pages stand-in: files, `_headers` CSP, the Pages Function) and `tools/browser/gate-test.mjs` as the example to copy. This is the way to go in this setup:
- The browser is Playwright's cached headless shell (`~/.cache/ms-playwright/chromium_headless_shell-*`, found automatically; `CHROME=<path>` overrides). Its system libraries are installed once with `sudo apt-get install -y libnspr4 libnss3 libasound2t64`; without them the start fails with "error while loading shared libraries".
- **Do not** rely on the Claude in Chrome extension (not available from WSL2) or on tools that download and run a package (`npx playwright`, `npx wrangler`): a session blocks them. A Windows Edge cannot be reached from WSL2 either.
- Serve a production build with its real `_headers`: the CSP has caught real faults (a test server that cut the header showed up as a blocked sign-in). Use the dev users of `apps/<app>/supabase/seed` against the local stack; never real accounts.
- Kill a test server by PID or an anchored pattern (`pkill -f "^node .*serve-gate"`); a pattern that also matches the calling shell ends the shell.

## Commands

Prefix with `export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH";` in non-interactive shells.

- `npm run lint`, `npm run typecheck` (`tsc -b`), `npm run test:core`.
- `npm run test:functions`: NPM's Edge Function unit tests (Graph mail, reference tokens, supplier API; `modules/npm-email/tests/`).
- `npm run test:gate`: the code gate end to end (`docs/code-gate.md`; `GATE_TEST_APP=compass` for COMPASS): builds RADAR with `VITE_GATE=1`, checks the Pages Function, then drives the app in headless Chromium (sign-in, cookie, service worker, offline start). Needs the local stack of the app and the browser setup below.
- `npm run test:pdf`: `tools/pdf-smoke.mjs` renders the five RADAR PDFs with sample data and checks they are complete (`-- --out <dir>` keeps them).
- `npm run check`: refine imports, list tables, branding, `compose --check`. `npm run build`: check + both apps.
- `npm run dev:compass` (port 5273), `npm run dev:npm` (port 5274). The NPM tool's own dev server in `~/npm_tool` uses 5173; do not kill vite processes by name.
- `npm run compose`: write the composed migrations (`platform/sql` + the app's modules into `apps/<app>/supabase/migrations`, generated and git-ignored).
- `npm run build:pages:<compass|npm>`: Cloudflare Pages build of one app (`dist/_headers` from `tools/pages/write-pages-config.mjs`, output check `tools/pages/check-pages-output.mjs`).
- Deploying (Pages on push, migrations by hand with the Supabase CLI, logged in in WSL2): `docs/deploy.md`.

## Rules

- **The code in this repo is the source of truth.** File headers like "Ported 1:1 from COMPASS (...)" only say where a file came from; edit the file directly. A change to a migration that is already applied on a live database is a new migration, never an edit.
- English everywhere shipped (code, comments, commits, docs); only the chat may be German.
- A module imports `@rbp/core` / `@rbp/ui`, never Refine. A new manifest hook is added only when a second real user needs it, with its entry in `docs/architecture.md` section 3.
- Every new table gets the restrictive `mfa_required` policy.
- No table / column name is final until the user approves it.
- One-time scripts (data ports, rehearsals, rollbacks) do not belong in this repo: they live in `~/rbp-cutover/`, or in `scripts/local/` / `docs/local/` (git-ignored).
