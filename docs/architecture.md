# Architecture and decisions

The design of the React Business Platform (RBP): one code base for COMPASS (maintenance / collaboration) and RADAR (the NPM tool).
Translated from the German plan of 2026-11-08 and cut down to what still guides development: principles, design rules and the
settled decisions. Build history (phases, port, cutover) is not kept here. **Decisions in this file are final unless the user
reopens them.** What is implemented where: `CLAUDE.md` (layout and conventions), module headers and `docs/module-dependencies.md`.

## 1. Principles

1. **One code base, several apps.** An app is a selection of modules. Database, users and deploy stay separate per app.
2. **The core knows no business modules.** Modules register through hooks (permissions, record types, menu, search, notifications).
   No central `case` that grows with each module (that was NPM's `can_access_entity`, changed in nine migrations).
3. **Modules are chosen at build time**, not by a runtime switch (`apps/<app>/src/modules.ts`, `app.config.json`). What an app does
   not use does not exist in its database.
4. **Per building block the better variant wins**, not automatically COMPASS's.
5. **Refine only in the core.** Modules import `@rbp/core`, never `@refinedev/*` (section 4). Ant Design is allowed everywhere.
6. **Measurably equal:** the SQL tests and performance probes run in this repo and must be green before a change ships.
7. **The core holds only what both apps use in the same way.** App- or module-specific things live in the lowest module that
   owns them (see `CLAUDE.md`).

## 2. Permissions

- **Literals** `<module>.<action>[.<scope>]`; registry, closure, `role_permissions`, `rls_has`, `user_permissions`,
  `my_permissions()` are core. Policies are written per statement so Postgres plans them as an InitPlan.
- **Scopes are the modules' vocabulary.** The core offers the standard ones (`all`, `assigned`, `created`, `team`); a module adds
  its own (`account`, `reports`, `assigned_assets`, `contributing`, ...) with a policy template that generates every policy of a
  table so none drifts by hand.
- **No `own` for "the responsible person":** use `assigned` / `created` (T7). `own` is only for "my own records" (teams, photo).
- **Standard column names** `assigned_user_id`, `created_by_user_id`, `assigned_team_id` are a convention for the simple case, not a
  rule (T9). Inheritance (assets), route steps (tasks), several responsible people (orders) or several teams per record get their
  own scopes.
- **Admin administers and sees no content** (E3): `rls_has` has no bypass, administration is `*.manage`, role assignments are
  logged (`role_assignment_log`), moderation is `record_moderator`. An admin who must see content needs a content role.
- **Record access registry (`entity_types`).** One private access function per record type, `<type>_row_allows(action, id, ctx)`,
  written by the module. The registry generates the forwarding functions (`can_access_entity_ctx` for policies,
  `user_has_access` for definer code about other people); the only public one is `can_access_entity(type, id, action)` for the
  signed-in user. The platform asks `view`, `read_notes` / `write_notes`, `add_files`, `edit`, `moderate`; `entity_types.actions`
  maps them to the module's own actions. **No dynamic dispatch at run time:** a SQL function that forwards dynamically costs about
  10x per row (measured in both apps), so the dispatch function is regenerated when a type registers.
- **Tasks on records (E4):** a task has its own rights (`tasks.*`); showing the record needs read access to it. **Notes** on a
  record follow a rule per record type: by default the record's, a module may register a narrower one.
- **Teams (E5):** the COMPASS model (owners, teams made by users, member care). The "usable for tasks / filters / trainings"
  switches are registered per module, not fixed columns. A **team use** can be managed by a module page (`team_use_registry`).
- **Tests:** every list has a perf probe against a baseline file (`tools/perf.sh`); policy and row function must agree.

## 3. Modules and hooks

```
platform/   sql/ (platform migrations, tests)   packages/core (@rbp/core)   packages/ui (@rbp/ui)
modules/    <key>/ module.json, sql/migrations, sql/tests, src/module.tsx (manifest), src/help/, locales
apps/       compass, npm: app.config.json, src/modules.ts, src/theme.ts, branding/, supabase/ (seeds, config)
tools/      compose, SQL test runners, perf, new-module
```

Every module has the same shape. A module may only depend on modules below it (`docs/module-dependencies.md`); a lower module
reaches an upper one through a registry or a record slot, never by import.

**Database hooks** (registry tables filled by module migrations):

| Hook | Purpose |
|---|---|
| `permissions_register(module, actions, scopes)` | the permission literals of a module |
| `entity_types` | record types as anchors for messages, files, tasks, mentions (section 2) |
| `team_use_registry` | what a team may be used for; `managed_path` marks uses kept on a module page |
| `workflow_hooks` / task type purposes | behaviour at route steps, task purposes (leave, order, ...) |
| `notification_types` | texts, default channels, email digest (`p_email`) |
| `search_sources` | sources of the global search, one scale for both apps |
| `activity_config` | fields per record type for the change log |

**Frontend hooks** (`defineModule`, see `platform/packages/core/src/module.ts` for the full, current list): `resources` (with menu entry and `menuOrder`), `routes`,
`permissions`, `entityTypes`, `recordSlots`, `listRpcs`, `providers`, `contentAside`, `configurationCards`, `headerItems`, `headerSearch`,
`phoneTabs`, `profileSections`; modules also register into core registries at load time (search sources, notification types, help chapters). A new hook is added to `ModuleManifest` only when a second real user needs it (one COMPASS case, one NPM
case); abstractions built earlier fit badly.

## 4. Refine capsule

Refine is used for about 25 interfaces, mostly the same ones. The core wraps them in a facade (`@rbp/core`): identity and
login (`useIdentity`, `useLogin`, `useLogout`), lists (`useListTable` with URL filter sync, sort, paging, RPC redirect), forms
(`useRecordForm`, unsaved-changes warning), data (`useRecord(s)`, `useSave`, `useDeleteRecord`), `useCan` / `<Can>`, `useNotify`,
routing and breadcrumbs, own `Filter` / `Sort` types, layout context, live data. Manifests name resources and routes in the core's
own types; the core translates them. The only code that touches Refine lives in `platform/packages/core/src/refine/` and the
facade. Enforced by the ESLint rule `no-restricted-imports` and `scripts/check-refine-imports.mjs`. Replacing Refine later changes
only that folder.

## 5. Migrations

Each app builds its migrations from `platform/sql` plus its modules in dependency order (`tools/compose.mjs`, output in
`apps/<app>/supabase/migrations`, git-ignored; `npm run check` verifies it reproduces). Migration timestamps are unique across the
repo. A migration that is applied on a live database is never edited: a change is a new migration. Every new table gets the
restrictive `mfa_required` policy.

`platform/sql/tests/security_invariants_smoke.sql` enforces this for both apps and fails on any of: a public table without
RLS or without `mfa_required`, a `SECURITY DEFINER` function without a `search_path` that leaves out `public`, anything
`anon` can execute or touch in `public`, a view without `security_invoker`, a public storage bucket. A new table, function or
view that breaks one of these fails the suite.

Edge Functions that run without a session rate-limit by client address with `public.rate_limit_hit(key, window, max)`
(table `rate_limit_buckets`, service role only): `login-help` allows 10 "forgot" and 30 "activate" requests per address and
hour. The COMPASS public ticket report keeps its own limiter in the tickets module.

Password sign-in is throttled per account by the Auth hook `hook_password_verification_attempt` (table `login_throttle`):
growing waits after five wrong passwords, a refusal that reads like a wrong password, admin notices `login_lockout` and
`login_attack`. Details and the switch-on steps are in `docs/deploy.md`.

## 6. UI, theme and branding

- **Tokens per app** (`apps/<app>/src/theme.ts`, `createTheme(tokens)` in `@rbp/ui`): colours (primary, optional action colour),
  radius, font, dark mode. The CI of an app is its tokens, nothing else.
- **Desktop structure is NPM's** (dense tables, fixed-width sider, selection style by colour, number fields right-aligned without
  spinners, `ListTable` with minimum widths and frozen header), **phone structure is COMPASS's** (head, bottom tabs, table as
  cards, search page, bottom sheets, `max-width: 767px` CSS in its own file). The page head is one shared component; the photo per
  page is configurable per app. Apps differ only through tokens, never by overriding whole files.
- **Branding per app** in `apps/<app>/branding/` (favicons, icons, manifest, login and menu logo, `mail-logo.png`) and its own
  `index.html`. `scripts/check-branding.mjs` fails on a missing or copied file. The tab title is `<record or menu entry> · <app>`.
- **Every new page is checked at 390 px and 1440 px.**

## 7. Which module holds what

| Building block | Home | COMPASS | RADAR |
|---|---|---|---|
| Auth, MFA, SSO, locks, users, teams, roles, grants, settings, phrases | platform / core | yes | yes |
| Messages, notes, reactions, mentions, notifications, files, activity, search, help | `messaging`, `help` | yes | yes |
| Tasks, routes, task types | `tasks` (engine) / `task-family` (COMPASS pages) | yes | engine only |
| Workflows, assets + QR, tickets, items, people, leave | own modules | yes | no |
| Vessels, companies, products, hull events, specifications, orders, dock reports, mail | `fleet`, `companies`, `products`, `offers`, `dock-reports`, `npm-email` | no | yes |

Product and supplier concepts stay separate (E6): Products (RADAR) and Items (COMPASS); companies (RADAR) and `suppliers`
(COMPASS).

## 8. Settled decisions

| Id | Decision |
|---|---|
| T1 | "Team" everywhere, also in the database (`groups` -> `teams`). |
| T2 | Menu entry "Nachrichten" (DE) / "Notes" (EN); module `messaging`. |
| T3 | "User" in Admin (accounts), "Person" in the directory; one record, a person without login has no account. |
| T4 | Owner Associate (NPM's tenant) is a team with an `owner_associate_teams` row and the team use `owner_associate`. A user has at most one such team; only admins maintain its members. |
| T5 | Sign-in by contact e-mail address, or by username for an account without one (either / or). The GoTrue address of a password account is its contact address, without one the internal pseudo address `<username>@login.rbp.invalid` (`expected_login_email`, kept by trigger `users_sync_login_email`); the sign-in page picks by the `@` in the input (`signInAddress`), so nothing is looked up before sign-in and nothing tells whether an account exists. Forgot password takes either; activation answers the address to sign in with. SSO (Entra) stays; GoTrue sends no mails of its own, the app mails the link (`login-help`, `person-grant-login`). |
| T6 / E6 | Suppliers, products and items stay separate between the apps. |
| T7 / T9 | `assigned` / `created` instead of `own`; standard column names are a convention (section 2). |
| T8 | Permission modules are plural (`initiatives.*`). |
| T10 | Platform and shared modules are DE/EN; RADAR is English only (`setAppLanguages(['en'])`). |
| T11 | Name "React Business Platform" (RBP), packages `@rbp/*`. |
| E1 | RADAR users belong to another company but the same works council; people and leave data in RADAR only for staff of that company, to be cleared with the works council and data protection before that module is switched on. |
| E2 | Both apps have a fresh baseline composed from platform and modules; no adopt migrations. |
| E3 | COMPASS permission model: the admin administers, sees no content. |
| E4, E5 | Section 2. |
| E7 | COMPASS is the base of the repo; phone look follows COMPASS, desktop look follows NPM (section 6). |
| E8 | Module choice at build time. |

## 9. Risks to keep in mind

- **Registry slower than a case:** lists with 175k vessels tip over; the dispatch function is generated at registration and the
  perf probes guard it.
- **Changing permission scopes shifts reach:** compare old and new policy per user before rolling out a change to a scope.
- **Removing an admin bypass:** admin workflows (imports, support) must use service-role paths or a content role.
- **Appearance drift between apps:** use tokens, not variants; compare screenshots at 390 px and 1440 px.
- **Premature module boundaries:** a hook is built only with two real users.
- **Personal data in RADAR:** see E1.

## 10. Non-goals

- No shared database and no multi-tenant operation of two organisations in one instance.
- No shared article or company base between the apps (E6, T6).
- No rebuild of Refine, Ant Design or Supabase.
