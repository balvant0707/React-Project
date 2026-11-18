# Shared parts: where COMPASS and NPM were merged

Both apps had the same concept twice. This file records what is now **one** thing, where it lives and why, so a change is made
in one place. Merged 2026-11-11 to 2026-11-13. Cited by comments in the code as `docs/shared-parts.md <id>`.

## Data model

| Id | One thing | Decision | Where |
|---|---|---|---|
| A1 | Work location of a person | COMPASS's `users.site` (free text; leave reads it for holiday regions). NPM's `office_phrase_id` and the phrase category `office` are dropped. Settings > Users edits it with `SuggestInput`. | `platform_users_site`, `npm_drop_office_phrases` |
| A2 | What a team is | `teams.kind` is dropped. An Owner Associate is a team with an `owner_associate_teams` row and the team use `owner_associate` (trigger `owner_associate_sync_use`). Pickers filter `team_uses`. | companies `npm_owner_associate_team_use` |
| A3 | Who edits Owner Associates | `team_use_registry.managed_path`: a use kept on a module page cannot be set on Settings > Teams (trigger `team_uses_guard_managed`); the Teams page shows a tag linking to /admin/tenants; deleting a team with a managed use needs an admin (`teams_guard_managed_delete`). | platform team uses |
| A4 | Suppliers | Stay separate: COMPASS `suppliers` (items), NPM companies with the supplier role. Decide only when one app needs both. | |

Not duplicates: `people.edit` and `users.manage` are both COMPASS rights (person data vs. Settings > Users delegation). Email
threads have two follower tables (`email_thread_followers`, `thread_follows`), as in NPM.

## Behaviour and UI

| Id | One thing | Decision | Where |
|---|---|---|---|
| B1 | Record notes panel | NPM's frame (sticky resizable column, list/detail toggles, "Open record", phone block / modal) around messaging's `ChatView` (history events with field labels, replies, reactions, people and team mentions, files, seen-by). Posting needs view access, as the database rule. NPM's server-side note drafts are dropped. The email thread panel keeps NPM's message components (emails and internal notes in one timeline) but shows the notes with messaging's `MessageBody`, `ColumnReactions`, `FeedComposer`. | messaging `src/notes/` |
| B2/B3 | Note search, unread checks | `npm_search_messages` and `my_has_unread_notes` dropped; the Mail page lists email threads only and runs no note search. `my_unread_records` stays (unread marks of the offers lists). | `npm_email_drop_note_helpers` |
| B4 | Task pages | RADAR keeps the lean `tasks` pages; `task-family` replaces the routes in COMPASS. Revisit if RADAR needs checklists or recurring tasks. | |
| B5 | List filter bar | One: `core/kit/listFilterBar.tsx` = COMPASS's (i18n, quick search, `minChars`, phone filter fields) + NPM's `alsoFields` and today in the user's zone. Its `picker` is the Filter sheet on a phone. | core |
| B5 | Identical copies | `listFilterBar`, icons, `tableRow` / `clickableRow`, task vocabularies, `userLabel`, `initials`, `useMe` each exist once, in core / `@rbp/ui` / the lowest module that needs them. | |
| B5 | Status, priority, due date | COMPASS's `tags.tsx` (palette pills, priority as signal bars, `DueDate`), used by every module. Texts `status.*`, `priority.*`, `due.*` in tasks. | tasks `components/tags.tsx` |
| B5 | Error text | One `errorText(error, fallback, byCode)` in `core/errors.ts`: COMPASS's i18n texts and `known`; from NPM: a 42501 raised by our functions shows its own message, 23503 tells "still in use" from "refers to something gone", per-code texts. | core |
| B5 | Rich text | One TipTap editor, messaging `richText.tsx`; variant `"email"` for the mail editor. | messaging |
| B5 | PDF preview | One pdf.js drawer (works on phones), messaging `pdfPreview.tsx`; `usePdfPreview` keeps the call form `showPdf(blob, filename)`. The worker is served by the core Vite plugin `pdfWorker()` (restart a running dev server after changing it). | messaging |
| B5 | Excel | `@rbp/ui` `excel.ts`: COMPASS's writer (header, widths, frozen row, drop-downs) and `downloadBlob`; reading through `read-excel-file`. | ui |
| B5 | Phone UI | COMPASS's for both apps: `MobileCardList`, `SortButton`, `FilterSheet`, `FilterChip`, `NewButton` (button on a computer, round + on a phone). `ResponsiveList` from NPM stays and shows its `sort` as `SortButton`. Not switched: the orders list (a New menu with two kinds) and dock reports (own create dialog). | core kit |
| B5 | List frame | `Page` / `List` = COMPASS's head (hint, subtitle, main action, toolbar row; phone band with back arrow) on the NPM table (`@rbp/ui` `ListTable`: minimum column widths, horizontal scroll, freeze panes). `Show` stays Refine's. The round + button takes the app's action colour (`setActionColor`; COMPASS: CI red). | core `kit/crud.tsx` |
| B5 | Record files | One panel, messaging `RecordFiles`: COMPASS's documents (type tag and filter, `FileLink`) with NPM's size / date / uploader line and row extras (`rowExtras`, `extraColumns`). Delete follows the database rule (own file or `can_moderate_record`) and removes the row before the stored file. Document type tag / select: messaging `documentType.tsx` with a phrase category prop. Kept apart: the items gallery and people's letter / training proof uploads. | messaging |
| B5 | Search | One scale for every source: `search_hit_score` (whole value > prefix > word start > inside, shorter first, +1) and `search_field_score` (substring hit via the former, else word similarity at most 1), so a substring hit always outranks a typo-only match. | platform `search_one_scale` |
| B5 | Task type admin | One list page and one route overview (the tasks module's). Two editors stay: COMPASS's full one (workflow hooks, purposes, checklist templates, step items) which `tasks` may not import. | tasks, task-family |
| C1 | Phrases page | One page in the core (Settings > Configuration > Phrases); German text only where the app offers German (`getAppLanguages`). | core `admin/PhrasesPage.tsx` |
| C2 | Mail page | Email threads only (no record-notes view); the nav icon counts unread email threads; app-wide presence channel removed (`users.last_seen_at`, `touch_last_seen()` stay unused). | npm-email |
