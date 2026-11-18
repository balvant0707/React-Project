# Module dependencies

How modules may depend on each other. The rules keep the module list free to choose per app (an app picks modules at build time) and
keep a change in one module from breaking another. Enforced where noted; the rest is review discipline.

## Rules

1. **One direction, no cycles.** `requires` in `module.json` / the manifest lists what a module cannot work without. A module may use
   what it requires (tables, functions, components) and nothing else. `resolveModules()` (frontend) and `tools/compose.mjs` (SQL, per
   app) fail on a missing, duplicate or circular dependency.
2. **The specific depends on the generic, never the reverse.** `tasks` knows nothing about assets, companies or orders. If a generic
   module needs to know something about a specific one, that is a registry hook (rule 4), not a reference.
3. **Foreign keys point from the dependent to the dependency only.** Anything that must attach to "any record" uses the polymorphic pair
   `anchor_type` / `anchor_id` (conversations, attachments, activity events, tasks). The anchor type must be registered in
   `entity_types`; deleting a record removes what hangs on it through `cleanup_entity_feed('<type>')` (a trigger the owning module
   adds) or the owning module's own trigger. An upper module may add its own columns and foreign keys to a lower table (e.g.
   `assets` adds `tasks.asset_id`) and re-emit a shared function with its part (`CREATE OR REPLACE`); the lower modules work without
   the column.
4. **Peers talk through registries, not imports.** Database: `entity_types` (access: one private `<type>_row_allows(action, id, ctx)`
   per type, answering view / read_notes / write_notes / add_files / edit / moderate through `entity_types.actions`; label, team,
   followers), `permissions`, `notification_types`, `app_setting_registry`, `team_use_registry`, `activity_label_sources`,
   `search_sources`. Frontend: the `defineModule` hooks (`docs/architecture.md` section 3). A module registers itself where it is
   installed; the registry does not know the module.
5. **Soft dependencies.** `optionalRequires`: "I add something when that module is present". It only orders the load (the optional
   module comes first when it is in the app) and never fails. Code that depends on it checks the registry at run time or lives in the
   module that requires both.
6. **Integration code lives in the upper module.** "Tasks of this asset" is a tab the upper module puts on the asset page through a
   record slot, not a function inside `assets`. In the frontend a lower page gets an upper module's component through a slot
   (`task-family.taskItems`, `assets.ticketForm`, ...), and an upper COMPASS module marks itself in the slot `task-family.module`
   (`useHasModule`).

## Current chains

- **COMPASS:** `messaging`, `tasks` <- `task-family` <- `workflows` <- `assets` <- `tickets` <- `items`; `assets` <- `people`;
  `workflows` <- `leave`; `home` requires `task-family`, `messaging`; `help` is independent.
- **RADAR:** `messaging`, `tasks`, `companies` <- `products`, `fleet` <- `offers`, `dock-reports`; `npm-email` (needs `messaging`;
  threads are conversations; linking a thread to a record is a link both sides register); `npm-dashboard`.
- **Tasks on RADAR records:** `tasks` shows up on companies, specifications, orders and hull events through the record slots; the
  RADAR modules `optionalRequires: ["tasks"]` when they only add the tab, `requires` when they need tasks themselves.

## Checks that exist

`resolveModules()` unit test (`platform/packages/core/src/registry.test.mjs`), `tools/compose.mjs --check` (modules listed,
`requires` satisfied, migration names unique and ordered), the Refine import ban (`scripts/check-refine-imports.mjs`). Not yet
checked: that no module's SQL references a table of a module it does not require (a dependency scan would do it).
