# Andon (operational issues on the shopfloor)

As built. Plans and open items for further steps are kept outside the repo (`~/rbp-dev/concepts/andon.md`).

## How it works

- **Operational issues are tickets** in their own queue (an "Operational" queue with its own team). A queue is an access boundary
  (who sees what), not a category.
- **A ticket type is the category.** Each active type of the queue is one button; the starting priority comes from the type. The
  reporter picks no queue and no priority on the kiosk. The queue team may re-classify the type when resolving.
- **Unassigned** = `assigned_user_id is null`; the team comes from the queue (`default_team_id`, stamped on insert).
- **One insert path** (`modules/tickets/src/lib/createTicket.ts`) serves the full ticket form and the kiosk.

## Data (migration `modules/tickets/sql/migrations/20261114100000_tickets_andon_columns.sql`)

| Column | Meaning |
|---|---|
| `ticket_types.group_key` | optional cluster for the kiosk / analysis by group |
| `ticket_types.default_priority` | priority a ticket of this type starts with (drives the light colour); null = ticket default |
| `ticket_types.public_report` | opt-in (default off): the no-login QR page offers this type |
| `tickets.acknowledged_at` | first time the ticket left `open` or got a person assigned; set by trigger `tickets_set_acknowledged`, never cleared, not settable by a client |

`tickets_overview` also shows `acknowledged_at` and `type_group_key`. Admin: Settings > Ticket queues, type dialog (texts in
`modules/tickets/src/andonLocales.json`). Test: `modules/tickets/sql/tests/andon_columns_smoke.sql`.

## Screens

All start from the same big-button choice: queue if more than one, then type, then the inputs.

- **Ticket form** (`pages/tickets/ticketForm.tsx`): queue buttons (skipped with one queue or from an asset page), type buttons
  (skipped with one type), then title (optional, defaults to the type's name), description, files, asset, priority.
- **Kiosk** (`pages/kiosk`, route `/andon?asset=<id>[&queue=<key>]`, layout `print` = signed in, no shell): a tap on a type raises
  the call. The station (an asset; a line is an asset with sub-assets) is passed in the URL; the URL is a setting, the device
  user's permissions are the guard (create in the operational queue, view its tickets; roles and teams, no code). The strip on top
  is the on-screen light (red = waiting, amber = acknowledged, green = none); a type with an open call at the station is disabled
  and shows its ticket number. Polls every 8 s.
- **Public QR page** (`pages/report`): the asset's name, type buttons, then the inputs. No sign-in, so the Edge Function returns
  almost nothing: the asset's *name* (no location) and the *key and name* of the types switched on with `public_report`
  (Maintenance queue only); a posted type is checked against that list, an unknown one becomes an incident.
