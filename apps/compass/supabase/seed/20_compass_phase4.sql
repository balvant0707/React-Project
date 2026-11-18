-- GENERATED (COMPASS phase 4 data: rights, purpose task types, assets, tickets,
-- items, people, trainings, positions, leave, operating instructions). Do not edit by hand: change the generator.

-- Roles that COMPASS migrations of phase 4 create (20261217100000_operating_instructions.sql; name_de -> translations).
insert into public.roles (name, translations) values ('Occupational safety', '{"de": "Arbeitssicherheit"}') on conflict (name) do nothing;
-- Phase 4 rights of the COMPASS roles (COMPASS migrations, read from the COMPASS database).
insert into public.role_permissions (role_id, permission) select r.id, m.permission from (values ('Admin', 'items.view'), ('Admin', 'job_descriptions.view.own'), ('Admin', 'leave.check.created'), ('Admin', 'leave.create.created'), ('Admin', 'operating_instructions.view.all'), ('Admin', 'stock.view'), ('Admin', 'trainings.view.own'), ('HR', 'fit_reviews.edit.all'), ('HR', 'fit_reviews.view.all'), ('HR', 'items.view'), ('HR', 'job_descriptions.edit.all'), ('HR', 'job_descriptions.view.all'), ('HR', 'job_descriptions.view.own'), ('HR', 'leave.check.all'), ('HR', 'leave.check.created'), ('HR', 'leave.create.created'), ('HR', 'leave.edit.all'), ('HR', 'leave.view.all'), ('HR', 'operating_instructions.view.all'), ('HR', 'people.edit'), ('HR', 'stock.view'), ('HR', 'training_types.edit'), ('HR', 'trainings.edit.all'), ('HR', 'trainings.view.all'), ('HR', 'trainings.view.own'), ('IT agent', 'items.view'), ('IT agent', 'job_descriptions.view.own'), ('IT agent', 'leave.check.created'), ('IT agent', 'leave.create.created'), ('IT agent', 'operating_instructions.view.all'), ('IT agent', 'stock.view'), ('IT agent', 'tickets.create.all'), ('IT agent', 'tickets.edit.all'), ('IT agent', 'trainings.view.own'), ('Manager', 'assets.create.all'), ('Manager', 'assets.edit.all'), ('Manager', 'assets.view.all'), ('Manager', 'fit_reviews.edit.reports'), ('Manager', 'fit_reviews.view.reports'), ('Manager', 'items.edit'), ('Manager', 'items.view'), ('Manager', 'job_descriptions.edit.team'), ('Manager', 'job_descriptions.view.own'), ('Manager', 'job_descriptions.view.team'), ('Manager', 'leave.check.created'), ('Manager', 'leave.create.created'), ('Manager', 'operating_instructions.edit.own'), ('Manager', 'operating_instructions.view.all'), ('Manager', 'stock.edit.all'), ('Manager', 'stock.view'), ('Manager', 'tickets.create.all'), ('Manager', 'tickets.edit.all'), ('Manager', 'tickets.view.all'), ('Manager', 'trainings.edit.reports'), ('Manager', 'trainings.view.own'), ('Manager', 'trainings.view.reports'), ('Occupational safety', 'operating_instructions.approve'), ('Occupational safety', 'operating_instructions.edit.all'), ('Occupational safety', 'operating_instructions.view.all'), ('Purchasing', 'assets.view.assigned_assets'), ('Purchasing', 'initiatives.edit.assigned_assets'), ('Purchasing', 'initiatives.view.assigned_assets'), ('Purchasing', 'items.edit'), ('Purchasing', 'items.view'), ('Purchasing', 'job_descriptions.view.own'), ('Purchasing', 'leave.check.created'), ('Purchasing', 'leave.create.created'), ('Purchasing', 'operating_instructions.view.all'), ('Purchasing', 'stock.edit.all'), ('Purchasing', 'stock.view'), ('Purchasing', 'tasks.edit.assigned_assets'), ('Purchasing', 'tasks.view.assigned_assets'), ('Purchasing', 'trainings.view.own'), ('Shopfloor', 'assets.view.assigned_assets'), ('Shopfloor', 'items.view'), ('Shopfloor', 'job_descriptions.view.own'), ('Shopfloor', 'leave.check.created'), ('Shopfloor', 'leave.create.created'), ('Shopfloor', 'operating_instructions.view.all'), ('Shopfloor', 'stock.view'), ('Shopfloor', 'tickets.create.reported'), ('Shopfloor', 'tickets.edit.assigned'), ('Shopfloor', 'tickets.edit.reported'), ('Shopfloor', 'tickets.view.assigned'), ('Shopfloor', 'tickets.view.reported'), ('Shopfloor', 'trainings.view.own'), ('Workshop', 'assets.create.assigned_assets'), ('Workshop', 'assets.edit.assigned_assets'), ('Workshop', 'assets.view.assigned_assets'), ('Workshop', 'initiatives.create.assigned_assets'), ('Workshop', 'initiatives.edit.assigned_assets'), ('Workshop', 'initiatives.view.assigned_assets'), ('Workshop', 'items.edit'), ('Workshop', 'items.view'), ('Workshop', 'job_descriptions.view.own'), ('Workshop', 'leave.check.created'), ('Workshop', 'leave.create.created'), ('Workshop', 'operating_instructions.view.all'), ('Workshop', 'recurring_tasks.create.assigned_assets'), ('Workshop', 'recurring_tasks.edit.assigned_assets'), ('Workshop', 'recurring_tasks.view.assigned_assets'), ('Workshop', 'stock.edit.team'), ('Workshop', 'stock.view'), ('Workshop', 'tasks.create.assigned_assets'), ('Workshop', 'tasks.edit.assigned_assets'), ('Workshop', 'tasks.view.assigned_assets'), ('Workshop', 'tickets.create.assigned_assets'), ('Workshop', 'tickets.create.reported'), ('Workshop', 'tickets.edit.assigned'), ('Workshop', 'tickets.edit.assigned_assets'), ('Workshop', 'tickets.edit.reported'), ('Workshop', 'tickets.edit.team'), ('Workshop', 'tickets.view.assigned'), ('Workshop', 'tickets.view.assigned_assets'), ('Workshop', 'tickets.view.reported'), ('Workshop', 'tickets.view.team'), ('Workshop', 'trainings.view.own')) as m(role_name, permission) join public.roles r on r.name = m.role_name on conflict do nothing;

-- Hooks, item mode and the hidden asset field of the task types of 10_task_family.sql (COMPASS database).
update public.task_types set hooks = '[{"hook": "ticket_resolve", "event": "done"}, {"hook": "ticket_release", "event": "cancelled"}]'::jsonb, item_mode = 'none', hidden_fields = '{work_hours,downtime}'::text[] where key = 'general';
update public.task_types set hooks = '[{"hook": "ticket_resolve", "event": "done"}, {"hook": "ticket_release", "event": "cancelled"}]'::jsonb, item_mode = 'none', hidden_fields = '{}'::text[] where key = 'initiative';
update public.task_types set hooks = '[{"hook": "ticket_resolve", "event": "done"}, {"hook": "ticket_release", "event": "cancelled"}]'::jsonb, item_mode = 'use', hidden_fields = '{}'::text[] where key = 'maintenance';
update public.task_types set hooks = '[{"hook": "ticket_resolve", "event": "done"}, {"hook": "ticket_release", "event": "cancelled"}, {"hook": "items_order_finished", "event": "done"}, {"hook": "items_order_finished", "event": "cancelled"}]'::jsonb, item_mode = 'order', hidden_fields = '{work_hours,downtime}'::text[] where key = 'purchase_request';
-- Task types with a purpose and their routes (COMPASS migrations, read from the COMPASS database). The hooks are set
-- after the steps: the purpose rules ask for them only when a task is created.
insert into public.task_types (key, name, name_de, description, active, default_due_days, short_description, keywords, show_on_start_page, default_team_id, hidden_fields, blocks_parent, track_as_request, purpose, item_mode) values ('leave', 'Leave request', 'Urlaubsantrag', 'A leave application that the requester''s supervisor approves.', true, null, null, null, false, (select id from public.teams where name = null), '{work_hours,downtime}'::text[], false, true, 'leave', 'none');
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope, hooks) values ((select id from public.task_types where key = 'leave'), 'approval', 1, 'Approval', 'Freigabe', 'waiting_for_approval', (select id from public.roles where name = null), '[{"to": null, "key": "approve", "kind": "positive"}, {"to": null, "key": "reject", "kind": "negative", "requires_comment": true}]'::jsonb, 'requester_supervisor', 1, (select id from public.roles where name = 'HR'), (select id from public.teams where name = null), true, null, '[{"hook": "leave_decide", "event": "action"}, {"hook": "leave_withdraw", "event": "cancelled"}]'::jsonb);
update public.task_types set hooks = '[{"hook": "leave_decide", "event": "done"}]'::jsonb where key = 'leave';

-- Ticket queues besides maintenance (COMPASS migration 20261011100000_ticket_queues.sql, read from the COMPASS database).
insert into public.ticket_queues (key, name, name_de, description, sort_order, active, open_to_everyone, icon, color) values ('it', 'IT Service Desk', 'IT-Service-Desk', 'Problems and requests about computers, accounts and software', 2, true, true, null, null);
insert into public.ticket_types (queue_id, key, name, name_de, sort_order, active) values ((select id from public.ticket_queues where key = 'it'), 'incident', 'Incident', 'Störung', 1, true);
insert into public.ticket_types (queue_id, key, name, name_de, sort_order, active) values ((select id from public.ticket_queues where key = 'it'), 'request', 'Service request', 'Serviceanfrage', 2, true);
insert into public.ticket_types (queue_id, key, name, name_de, sort_order, active) values ((select id from public.ticket_queues where key = 'it'), 'change', 'Change', 'Änderung', 3, true);
-- Document types of attachments and location notes (COMPASS migrations, read from the COMPASS database; translations, D6).
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'manual', 'Manual', jsonb_build_object('de', 'Handbuch'), 1) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'drawing', 'Drawing', jsonb_build_object('de', 'Zeichnung'), 2) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'certificate', 'Certificate', jsonb_build_object('de', 'Zertifikat'), 3) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'inspection_report', 'Inspection report', jsonb_build_object('de', 'Prüfbericht'), 4) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'safety_data_sheet', 'Safety data sheet', jsonb_build_object('de', 'Sicherheitsdatenblatt'), 5) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'photo', 'Photo', jsonb_build_object('de', 'Foto'), 6) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('document_type', 'other', 'Other', jsonb_build_object('de', 'Sonstiges'), 7) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('location_note', 'indoor', 'Indoor', jsonb_build_object('de', 'Innen'), 1) on conflict do nothing;
insert into public.phrases (category, code, text_en, translations, sequence) values ('location_note', 'outdoor', 'Outdoor', jsonb_build_object('de', 'Außen'), 2) on conflict do nothing;
-- Public holidays (imported into COMPASS by the Edge Function import-holidays; read from the COMPASS database).
insert into public.public_holidays (holiday_date, name, site, source) values
  ('2026-01-01', 'Neujahr', null, 'manual'),
  ('2026-04-03', 'Karfreitag', null, 'manual'),
  ('2026-04-06', 'Ostermontag', null, 'manual'),
  ('2026-05-01', 'Tag der Arbeit', null, 'manual'),
  ('2026-05-14', 'Christi Himmelfahrt', null, 'manual'),
  ('2026-05-25', 'Pfingstmontag', null, 'manual'),
  ('2026-10-03', 'Tag der Deutschen Einheit', null, 'manual'),
  ('2026-12-25', '1. Weihnachtstag', null, 'manual'),
  ('2026-12-26', '2. Weihnachtstag', null, 'manual'),
  ('2027-01-01', 'Neujahr', null, 'manual'),
  ('2027-03-26', 'Karfreitag', null, 'manual'),
  ('2027-03-29', 'Ostermontag', null, 'manual'),
  ('2027-05-01', 'Tag der Arbeit', null, 'manual'),
  ('2027-05-06', 'Christi Himmelfahrt', null, 'manual'),
  ('2027-05-17', 'Pfingstmontag', null, 'manual'),
  ('2027-10-03', 'Tag der Deutschen Einheit', null, 'manual'),
  ('2027-12-25', '1. Weihnachtstag', null, 'manual'),
  ('2027-12-26', '2. Weihnachtstag', null, 'manual'),
  ('2028-01-01', 'Neujahr', null, 'manual'),
  ('2028-04-14', 'Karfreitag', null, 'manual'),
  ('2028-04-17', 'Ostermontag', null, 'manual'),
  ('2028-05-01', 'Tag der Arbeit', null, 'manual'),
  ('2028-05-25', 'Christi Himmelfahrt', null, 'manual'),
  ('2028-06-05', 'Pfingstmontag', null, 'manual'),
  ('2028-10-03', 'Tag der Deutschen Einheit', null, 'manual'),
  ('2028-12-25', '1. Weihnachtstag', null, 'manual'),
  ('2028-12-26', '2. Weihnachtstag', null, 'manual'),
  ('2029-01-01', 'Neujahr', null, 'manual'),
  ('2029-03-30', 'Karfreitag', null, 'manual'),
  ('2029-04-02', 'Ostermontag', null, 'manual'),
  ('2029-05-01', 'Tag der Arbeit', null, 'manual'),
  ('2029-05-10', 'Christi Himmelfahrt', null, 'manual'),
  ('2029-05-21', 'Pfingstmontag', null, 'manual'),
  ('2029-10-03', 'Tag der Deutschen Einheit', null, 'manual'),
  ('2029-12-25', '1. Weihnachtstag', null, 'manual'),
  ('2029-12-26', '2. Weihnachtstag', null, 'manual'),
  ('2030-01-01', 'Neujahr', null, 'manual'),
  ('2030-04-19', 'Karfreitag', null, 'manual'),
  ('2030-04-22', 'Ostermontag', null, 'manual'),
  ('2030-05-01', 'Tag der Arbeit', null, 'manual'),
  ('2030-05-30', 'Christi Himmelfahrt', null, 'manual'),
  ('2030-06-10', 'Pfingstmontag', null, 'manual'),
  ('2030-10-03', 'Tag der Deutschen Einheit', null, 'manual'),
  ('2030-12-25', '1. Weihnachtstag', null, 'manual'),
  ('2030-12-26', '2. Weihnachtstag', null, 'manual');
-- Absence types (COMPASS migration 20261221100000_absence_types.sql, read from the COMPASS database).
insert into public.absence_types (name, name_de, description, icon, color, task_type_id, counts_as_leave, sort_order, active) values ('Vacation', 'Urlaub', null, 'beach', 'green', (select id from public.task_types where key = 'leave'), true, 10, true);
insert into public.absence_types (name, name_de, description, icon, color, task_type_id, counts_as_leave, sort_order, active) values ('Special leave', 'Sonderurlaub', null, 'gift', 'teal', (select id from public.task_types where key = 'leave'), false, 20, true);
update public.app_settings set value = '20' where key = 'leave_max_absent_pct';
update public.app_settings set value = '1' where key = 'leave_min_allowed_absent';
update public.app_settings set value = '["de", "en"]' where key = 'operating_instruction_languages';
update public.app_settings set value = (select id::text from public.task_types where key = 'maintenance') where key = 'default_asset_task_type_id';

-- ============================== COMPASS seed 01_glueckstadt_assets.sql ==============================
-- GENERATED by scripts/seed_from_excel.py from docs/reference docs/Assets.xlsx. Do not edit by hand.

insert into public.asset_types (name, description, is_grouping) values
  ('Site', 'Plant or location', true), ('Category', 'Grouping node in the asset tree', true), ('Equipment', 'Machine, vehicle or installation', false)
on conflict (name) do nothing;

-- parent rows always precede their children (the path trigger needs the parent)
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('05b9afe5-e24b-5ffa-b981-14cca6079bac', null, 'Werk Glückstadt', (select id from public.asset_types where name = 'Site'), 'active', null, null, 'Glückstadt');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c26aba7b-8be0-5b49-a4f0-4d0b47386a06', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Abfallwirtschaft', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1c5b9632-5dd5-5099-888c-dac3ad84fdee', 'c26aba7b-8be0-5b49-a4f0-4d0b47386a06', 'Faßpresse', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('5fa53fb0-edce-5cd1-800c-3a3edf27747e', 'c26aba7b-8be0-5b49-a4f0-4d0b47386a06', 'Presscontainer', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a6c8c8bf-f978-5f1b-ad3c-1a5cea2f76f4', 'c26aba7b-8be0-5b49-a4f0-4d0b47386a06', 'Selbstpressbehälter', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('bc16d03e-324c-5957-b85c-1750f3433d1f', 'c26aba7b-8be0-5b49-a4f0-4d0b47386a06', 'Waschwasser-Fällanlage, Behälter 2017', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('6f36fb77-cd8f-5e3d-acd1-ad856c87ce03', 'c26aba7b-8be0-5b49-a4f0-4d0b47386a06', 'Orwak 3120 Ballenpresse', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Prod/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0cf8f642-f485-512c-be41-9865619e5493', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Behälter & Tanks', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f9005a28-419a-5a63-8f8c-1370e7f393fb', '0cf8f642-f485-512c-be41-9865619e5493', 'Tankanlage Lösemittel', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('8b699d0a-395a-5464-aabb-fbe359b32abb', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Flurförderfahrzeuge', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('5877ac9b-3178-596e-8e10-85885e9a197d', '8b699d0a-395a-5464-aabb-fbe359b32abb', 'Ameisen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('486747df-7db6-58cc-8424-779cd2317f5d', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Toyota Niederhub-Kommissionier', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('dd72e519-0224-5626-a381-d8b5b70afc66', '8b699d0a-395a-5464-aabb-fbe359b32abb', 'Handhubwagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('02a6a939-131f-509a-a54e-9b3e65fc2c4b', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Wiegehubwagen', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ffb34766-ce49-5384-9105-7148a6d85567', '8b699d0a-395a-5464-aabb-fbe359b32abb', 'Hochhubwagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e99ddef0-b564-5f53-a438-1df827a4477e', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Hochhubwagen Elektro', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1382ae72-eec7-5da2-8daa-d12dda42431c', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Hubwagen', (select id from public.asset_types where name = 'Equipment'), 'active', null, 'F20282X00149', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ec1c8ff8-cf9e-595f-bcf9-d66ff1d45998', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Elektro-Geh-Hubwagen', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c7f1f091-20ae-5541-ad8a-1c1da23dc319', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Gebäude & Tore', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9cd6731c-e0a9-5956-bd2a-64f3edd9a278', 'c7f1f091-20ae-5541-ad8a-1c1da23dc319', 'Schnelllauftor Lager Halle 100', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schwenn', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f60ac2d0-b53b-5ea0-9fac-224aa43e4983', 'c7f1f091-20ae-5541-ad8a-1c1da23dc319', 'Schnelllauftor Produktion  Tor Emballagenhalle', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schwenn', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('836f2e37-2fa8-5aeb-a3c0-a523174c26d8', 'c7f1f091-20ae-5541-ad8a-1c1da23dc319', 'Schnelllauftor Schleuse', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schwenn', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('bbc55d0a-7f77-5446-868c-f52e6bb307b5', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Infrastruktur', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1733e868-fd4c-5ade-8337-5d8958c00fcb', 'bbc55d0a-7f77-5446-868c-f52e6bb307b5', 'Druckluft', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9421f35b-329c-5395-bf25-900938ff9a11', '1733e868-fd4c-5ade-8337-5d8958c00fcb', 'Kältetrockner Kaeser Secotec TE 102', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kaeser', '1183', 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('d6cd84e9-0dfc-5e9a-a161-d4aed4300a92', '1733e868-fd4c-5ade-8337-5d8958c00fcb', 'Schraubenkompressor Kaeser ASD 60', (select id from public.asset_types where name = 'Equipment'), 'active', null, '1239', 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3d1072fe-ff04-5eb8-8072-4fac991f6987', '1733e868-fd4c-5ade-8337-5d8958c00fcb', 'Druckluftfilter KF3 2020 (1)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('532eb8bb-d49b-5a5c-8452-b7c69a858c0e', '1733e868-fd4c-5ade-8337-5d8958c00fcb', 'Druckluftfilter KF3 2020 (2)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('67e11a45-1b36-5b41-a905-47a307766158', '1733e868-fd4c-5ade-8337-5d8958c00fcb', 'Öl Wasser Trenner Kaeser Aquamat 6', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kaeser', '10260755', 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('60b5dac8-0374-5a8d-9217-6e54998b4147', '1733e868-fd4c-5ade-8337-5d8958c00fcb', 'Kolbenkompressor Kaeser BS 61', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kaeser', null, 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('8732c40f-8ef6-5d25-981b-4cba58348545', 'bbc55d0a-7f77-5446-868c-f52e6bb307b5', 'Elektrik', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('09788262-e92e-5347-8964-642827b95773', '8732c40f-8ef6-5d25-981b-4cba58348545', 'EMH LZQJ-XC Messwandlerzähler', (select id from public.asset_types where name = 'Equipment'), 'active', 'EMH ', null, 'Glü/Hausanschlussraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('dbe21ff7-4a86-502d-b23f-b4210bf8cd67', '8732c40f-8ef6-5d25-981b-4cba58348545', 'Alarmanlage Übertragungseinrichtung', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('03c2cd42-76d2-5189-a6b6-169c26630cc4', '8732c40f-8ef6-5d25-981b-4cba58348545', 'Blindleistungs-Regelanlage', (select id from public.asset_types where name = 'Equipment'), 'active', 'Frako', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a810fc90-9164-574e-aa9a-1761076ea939', '8732c40f-8ef6-5d25-981b-4cba58348545', 'OAS Pronto Software', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Produktion');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a9610652-6285-5753-8de5-02f366e3fe8f', '8732c40f-8ef6-5d25-981b-4cba58348545', 'Schaltfahne END-Armaturen', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('17688ed9-f940-58da-8b54-e8d8979a3a67', '8732c40f-8ef6-5d25-981b-4cba58348545', 'Stromlaufplan Hausverteilung', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/E-Raum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('fc28e597-9e2e-5e31-87c9-2d7a58eee607', '8732c40f-8ef6-5d25-981b-4cba58348545', 'Photovoltaik-Anlage Außenlager Ost', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ecf1ebbe-b112-5567-bd99-e2cbaa12f62d', 'bbc55d0a-7f77-5446-868c-f52e6bb307b5', 'Heizung', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('444c4d54-9b17-5caa-8782-a5f6ce8a7b33', 'ecf1ebbe-b112-5567-bd99-e2cbaa12f62d', 'Heizungsanlage', (select id from public.asset_types where name = 'Equipment'), 'active', 'Buderus', '51631', 'Glü/Heizungsraum');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4824f786-7770-5e5b-a561-b72567f3bcbd', 'ecf1ebbe-b112-5567-bd99-e2cbaa12f62d', 'Schornsteinanlage', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('72b26676-dab9-580c-a9e6-4b83ecd6dcf0', 'bbc55d0a-7f77-5446-868c-f52e6bb307b5', 'Kälteanlagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('7abcb81d-647f-5def-8931-8e45c46ea392', '72b26676-dab9-580c-a9e6-4b83ecd6dcf0', 'Kühlanlage Clivet 2018 links', (select id from public.asset_types where name = 'Equipment'), 'active', 'Clivet', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a8bfb969-6b86-55dd-82ed-f63aa80e4fa3', '72b26676-dab9-580c-a9e6-4b83ecd6dcf0', 'Kühlanlage Clivet 2018 rechts', (select id from public.asset_types where name = 'Equipment'), 'active', 'Clivet', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b94fb818-aaea-5313-b520-fca18ecf4b65', '72b26676-dab9-580c-a9e6-4b83ecd6dcf0', 'Kühlwasserpumpe Flowserve', (select id from public.asset_types where name = 'Equipment'), 'active', 'FlowServe', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('52d76302-2e1e-5e16-9f5b-7dc6b0e836e7', 'bbc55d0a-7f77-5446-868c-f52e6bb307b5', 'Wasserversorgung', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f1f3935b-daf6-57c8-b232-5104c38b9a37', '52d76302-2e1e-5e16-9f5b-7dc6b0e836e7', 'Systemtrenner Hydrantenleitung 2020', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('5a113983-8317-5c4b-a041-fe4997f30734', '52d76302-2e1e-5e16-9f5b-7dc6b0e836e7', 'Entwässerungsschacht (Rasen-Mülplatz)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Hof');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e26cefde-58ca-50ae-8a93-38c906e279f3', '52d76302-2e1e-5e16-9f5b-7dc6b0e836e7', 'Wasserzähler', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1384000e-13fe-53a6-9768-17ee71cb5a90', 'bbc55d0a-7f77-5446-868c-f52e6bb307b5', 'Absaugung', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('703fcc43-ab75-5517-85cb-2cfbb2492c69', '1384000e-13fe-53a6-9768-17ee71cb5a90', 'Entstaubung Filteranlage Lomi', (select id from public.asset_types where name = 'Equipment'), 'active', 'Venti-Oelde', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('cc3bd6bd-8259-5d38-86ab-b49b1f169d44', '1384000e-13fe-53a6-9768-17ee71cb5a90', 'Absaugung Wasserproduktion 2014', (select id from public.asset_types where name = 'Equipment'), 'active', 'Venti-Oelde', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('7694bccc-e3a2-56a5-a448-a83d8b08e518', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Laborgeräte', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('92cc6d1b-c990-5024-8388-4e84c5202705', '7694bccc-e3a2-56a5-a448-a83d8b08e518', 'Weißtechnik Salzsprühgerät SC-KWT 1000', (select id from public.asset_types where name = 'Equipment'), 'active', 'Weisstechnik', null, 'Glü/Prüflabor');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('aa8616f8-cf3c-5273-a205-0727fc649953', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Maschinen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Abfüllanlagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('86c9c3f8-62c7-5eef-843c-5f874c3c1399', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'Würschum 125ml Abfüllung Nr. H500-P', (select id from public.asset_types where name = 'Equipment'), 'active', 'Würschum', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Dissolver', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0bbab069-f506-5be1-a063-93671b1bdc2d', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 242-30 FU Nr. 07.3419', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4485b1d0-2073-5d97-b7be-6d31750e2a4f', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 242-30 Nr 12.4173', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', '12.4173', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c31b1e42-2381-51ae-ac20-de03cb5fe0db', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 242-30 FU Nr. 17.4951', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', '17.4951', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b2de1852-56e7-5fd9-b4cc-9231539f7984', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 242-30 FU Nr. 17.4952', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', '17.4952', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1f48b09f-9c60-5798-976e-2a459266e5c3', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 242-30 FU Nr. 19.5402', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', '19.5402', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0f3a76b5-9cef-5e89-9cfc-ef7aefc67bd1', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 242-30 FU Nr. 19.5403', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0f57f7d3-de4b-5865-9a3d-b8e73050c1df', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Etikettierer', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9d62d1fc-ceb8-5fc2-9973-d502f7e604f0', '0f57f7d3-de4b-5865-9a3d-b8e73050c1df', 'Etikettiermaschine Langguth 2016', (select id from public.asset_types where name = 'Equipment'), 'active', 'Langguth', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c43218af-3885-5681-9e73-1bbd8c5a339d', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Förderanlagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('5d4fb811-76d6-5e98-b896-67b02f99ed66', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Stauband', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('34ba996f-c016-5133-9912-f43f8a4ff5af', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Reinigungsanlagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('649432a5-07ed-5c32-b1a7-64376b5cdd7d', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Hochdruckreiniger & Zubehör', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Prod/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('537594df-19b6-595f-b82f-e90189efd97f', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Staubsauger', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kärcher', null, 'Glü/Lager/100');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('980d1adb-065b-5078-9481-579d111c6ab0', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Scheuersaugmaschine Kärcher 2016', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kärcher', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f46c811a-7c63-58cf-89c5-c853d95c3e9d', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Scheuersaugmaschine Kärcher 2019', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kärcher', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('2fa2472a-d550-5d6d-8fa5-4980f316820e', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Scheuersaugmaschine Kärcher 2018', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kärcher', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('da96e368-eaef-570e-821d-dae76519f33f', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Kärcher, Kehrmaschine Nr. 10892', (select id from public.asset_types where name = 'Equipment'), 'active', 'Kärcher', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('7b9475f5-8903-5aa5-917f-c6cc2fdfe29d', '34ba996f-c016-5133-9912-f43f8a4ff5af', 'Behälterreinigungsanlage Turello LW 108 R INK', (select id from public.asset_types where name = 'Equipment'), 'active', 'Turello', null, 'Glü/Waschplatz');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('638a0af0-393a-5574-803b-5abe20afdab2', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Verpackungsanlage', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('92e49d3e-706c-5456-89ca-5fb4b0442e06', '638a0af0-393a-5574-803b-5abe20afdab2', 'Schrumpftunnel BVM 2014', (select id from public.asset_types where name = 'Equipment'), 'active', 'BVM', '2014,065289', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1275be67-4936-5806-817d-a353d452ea1a', '638a0af0-393a-5574-803b-5abe20afdab2', 'MSK Palettenschrumpfanlagen 2014', (select id from public.asset_types where name = 'Equipment'), 'active', 'MSK', null, 'Glü/Lager/100');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('7d2b01d7-d43a-5019-a821-46e842ea9b45', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Sicherheitseinrichtung', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('594662d1-6e87-5734-8ef7-3745410e30bb', '7d2b01d7-d43a-5019-a821-46e842ea9b45', 'Gaswarnanalage Halle 200', (select id from public.asset_types where name = 'Equipment'), 'active', 'MoveOrange', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a487453e-57f5-5dfa-aca8-5c2464b1e9f3', '7d2b01d7-d43a-5019-a821-46e842ea9b45', 'Übertragungseinrichtung Alarmanlage 2020', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4096d89a-d015-5c7f-abd6-d1036eb255ea', '7d2b01d7-d43a-5019-a821-46e842ea9b45', 'Detonationssicherungen Protego', (select id from public.asset_types where name = 'Equipment'), 'active', 'Protego', null, 'Glü/Lager/Lömi-Tanklager');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('99309d9e-9c98-5239-849f-b1765e1189cf', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Sonstige', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('101336c1-1ba7-53c2-a294-fd9facdd12b4', '99309d9e-9c98-5239-849f-b1765e1189cf', 'Senkrechtförderer, Lastenaufzug', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b61c28b7-db0f-53d1-85c3-ac286ad93adf', '99309d9e-9c98-5239-849f-b1765e1189cf', 'Safe Buchhaltung', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('de66aee4-f09b-5a03-bfcc-9cb7224991c8', '99309d9e-9c98-5239-849f-b1765e1189cf', 'Safe IT', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('803517ec-bca3-5a13-b5ea-a43b6661eab8', '99309d9e-9c98-5239-849f-b1765e1189cf', 'Leitern', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('59233aa8-b98e-5b7e-93f2-f46b0c1a56cb', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Waagen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('426ece35-b295-54df-85d8-d33dd4896ef9', '59233aa8-b98e-5b7e-93f2-f46b0c1a56cb', 'Bindemittel-Waage OAS', (select id from public.asset_types where name = 'Equipment'), 'active', 'OAS', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c247d59e-88d2-5eb9-b46e-2d2694e68b2a', '59233aa8-b98e-5b7e-93f2-f46b0c1a56cb', 'OAS Wägetechnik', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c8abc73a-919d-5fbe-af17-f6f088163117', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Werkzeuge', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4cb8c967-5d38-55b9-8d4e-b8df264401e8', 'c8abc73a-919d-5fbe-af17-f6f088163117', 'Bandsäge', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('57e7688b-214b-54c9-8247-9fea11f447d4', 'c8abc73a-919d-5fbe-af17-f6f088163117', 'Yale Flaschenzug', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('d1eac8e3-bb61-5670-8d7a-54ac8f0416c6', 'c8abc73a-919d-5fbe-af17-f6f088163117', 'Duss Bohrhammer', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9c794edb-7c35-589a-b791-eb985be7a5df', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Dispersionsanlage Bühler 630', (select id from public.asset_types where name = 'Equipment'), 'active', 'Bühler / Vibromac', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', '631 Vibromac CS150-5000, comm. 21092', (select id from public.asset_types where name = 'Equipment'), 'active', 'Vibromac', '21092', 'Glü/Prod/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3fa76848-8cea-5bc1-8965-4af965aeeda3', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', '704 Bühlermischer lösungsmittelhalting', (select id from public.asset_types where name = 'Equipment'), 'active', 'Bühler / Vibromac', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('d01358ed-f404-5e53-8a47-2ee4de97c114', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', '705 Bühlermischer lösungsmittelhalting', (select id from public.asset_types where name = 'Equipment'), 'active', 'Bühler / Vibromac', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b37f3801-8f24-5f24-959f-6fa4d1fc72e2', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreisdissolver Niemann KDV 790-79 DE Nr. (Dreitopf)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ce6c4767-70eb-5f03-afb4-2a84c47c3f1c', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Dissolver Pendraulik ehem. Flensburg', (select id from public.asset_types where name = 'Equipment'), 'active', 'Pendraulik', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b9da2336-8c07-5082-8757-b2935e479beb', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 330 Nr. 68.075', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('10309b35-41de-5ac7-b91f-545013424f3c', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Wanddissolver Pendraulik Wolpers WDV 7,5', (select id from public.asset_types where name = 'Equipment'), 'active', 'Pendraulik', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Vibromac C60 EX, comm. 21093', (select id from public.asset_types where name = 'Equipment'), 'active', 'Vibromac', '21093', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('2e9418aa-50ec-5be9-9c9d-8387f42e89ad', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'De Vree V 304 (Maschine 1)', (select id from public.asset_types where name = 'Equipment'), 'active', 'De Vree', 'FB 092862', 'Glü/Abfüll/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a1dc2abe-3510-56ac-8c11-c1c4b2efd3c4', '0f57f7d3-de4b-5865-9a3d-b8e73050c1df', 'Etikettieranlage Langguth 2019', (select id from public.asset_types where name = 'Equipment'), 'active', 'Langguth', '110,0294', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('fb6bdc2c-88f6-54da-a366-d8cd395b44fb', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Gliederbandförderer Jonge Poerink 2019 (4)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Jonge Poerink', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a7bd36df-d650-54e2-9a31-25e76485ef2f', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Gliederbandförderer Jonge Poerink 2019 (1)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Jonge Poerink', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('d2e841f0-130b-5895-bf75-39be0969f6b6', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Gliederbandförderer Jonge Poerink 2019 (2)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Jonge Poerink', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c2286fe6-5b35-5743-b2fd-fa3274c9c6e7', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Gliederbandförderer Jonge Poerink 2019 (3)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Jonge Poerink', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('76e0cade-2590-5903-ba9c-6965db40ea35', '638a0af0-393a-5574-803b-5abe20afdab2', 'Schrumpftunnel BVM 2019', (select id from public.asset_types where name = 'Equipment'), 'active', 'BVM', '20190465321', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c4439b9a-82cf-5acc-8234-2204034cc3aa', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'DeVree Abfüllanlage Maschine 2', (select id from public.asset_types where name = 'Equipment'), 'active', 'DeVree', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('187d8d8f-29db-5729-b764-c57259fa2d48', '6f6b92f5-9133-59a9-9fdc-00eaea2c9b0a', 'Kreis-Dissolver Niemann KDV 790-79 DE Nr. 70.0206 (Doppeltopf) 702', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', '70.0206', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('72732e9e-f9ac-58ab-a98c-9f88d34d8c73', '0f57f7d3-de4b-5865-9a3d-b8e73050c1df', 'Etikettieranlage Langguth ATEX', (select id from public.asset_types where name = 'Equipment'), 'active', 'Langguth', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('6f81d889-232e-5907-b16c-dbf3dc92e687', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Gliederbandförderer', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('304b247c-1ecc-5d2e-bd3a-4ba38186f2d2', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'SIS  Drehteller 2009 (1)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schrader', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3606db04-adad-5bb4-93b6-48bb9321fbe6', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'De Vree V 302 Twin (Maschine 3)', (select id from public.asset_types where name = 'Equipment'), 'active', 'De Vree', null, 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ba5954c6-9345-5512-b32b-1bb852bba6bf', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'SIS  Drehteller 2009 (2)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schrader', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('13d27dc6-600a-598a-b467-e2cd058d81d5', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'Abfüllanlage Gel & Lasuren', (select id from public.asset_types where name = 'Equipment'), 'active', 'AI GmbH', '1544', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1605541e-9886-5982-a8dc-1306c0c25775', 'c43218af-3885-5681-9e73-1bbd8c5a339d', 'Abtransportband Gel & Lasur 2015', (select id from public.asset_types where name = 'Equipment'), 'active', 'Fill&Roll', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('17751a7c-e9ba-5557-b4e9-5a430b51353a', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'Abfüllanlage AI 2011', (select id from public.asset_types where name = 'Equipment'), 'active', 'AI GmbH', '1543', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('97366612-07f1-57f2-8c67-c8b23372d06b', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'Gebindeentstapler AI 2011', (select id from public.asset_types where name = 'Equipment'), 'active', 'AI GmbH', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('134d1171-5f9f-54a6-b1f7-0de3d3061a24', '05b9afe5-e24b-5ffa-b981-14cca6079bac', 'Pumpen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0f38e93e-de06-5782-84a3-608b91f7bfba', '134d1171-5f9f-54a6-b1f7-0de3d3061a24', 'Exzenterschneckenpumpe Netzsch 2019 (2)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Nezsch', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c72f32c7-56e1-5841-9e43-d8e02e786d57', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'Abfüllanlage Fill & Roll 2013', (select id from public.asset_types where name = 'Equipment'), 'active', 'Fill&Roll', '2502003', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('cc5b1bd8-0a7d-514d-a9af-ab38d742fd6c', '2d2e4b2f-85c1-5b90-a6ac-31965483c791', 'Abfüllmaschine Type V230I-Twin 2021', (select id from public.asset_types where name = 'Equipment'), 'active', 'Devree', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('cb2eb71a-656d-5d09-b94c-1995a2514efb', '134d1171-5f9f-54a6-b1f7-0de3d3061a24', 'Exzenterschneckenpumpe Netzsch 2019 (1)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Nezsch', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('7fba7897-61a7-5443-a0b7-2672c1999cfd', 'aa8616f8-cf3c-5273-a205-0727fc649953', 'Perlmühlen', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('69e8891a-519b-5234-b497-ac95f5cff3b9', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 1', (select id from public.asset_types where name = 'Equipment'), 'active', 'WAB', '960623', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0740997e-e840-58f7-b85b-f81f7aa4ee09', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 2', (select id from public.asset_types where name = 'Equipment'), 'active', 'WAB', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('023e5fc7-db44-5d02-87eb-889919520640', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 3', (select id from public.asset_types where name = 'Equipment'), 'active', 'WAB', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('11286ad9-da7f-581f-baa3-cd75b5ac6cc9', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 4', (select id from public.asset_types where name = 'Equipment'), 'active', 'WAB', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('bdc37aa5-26d8-5efd-abe8-0b187eb98b6d', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 5', (select id from public.asset_types where name = 'Equipment'), 'active', 'WAB', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('8d2309ed-4538-588e-ab50-3be177ba2731', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 6', (select id from public.asset_types where name = 'Equipment'), 'active', 'WAB', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b40e78ed-70e5-574f-abef-cbb50a5d1c4f', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 7', (select id from public.asset_types where name = 'Equipment'), 'active', 'Willy A. Bachofen', '800431', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c450fba7-9fb1-5b74-a3a3-6cd967b332fa', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Perlmühle 8', (select id from public.asset_types where name = 'Equipment'), 'active', 'Willy A. Bachofen', '760131', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f4fb101d-8b9b-5acb-b3fd-e2cfe9e25012', '7fba7897-61a7-5443-a0b7-2672c1999cfd', 'Niemann KBM', (select id from public.asset_types where name = 'Equipment'), 'active', 'Niemann', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3ae485dd-343e-5b1e-a33f-405d6e99ad8d', '8b699d0a-395a-5464-aabb-fbe359b32abb', 'Gabelstapler', (select id from public.asset_types where name = 'Category'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3883a871-a879-5d5d-9b4a-f836f7c31305', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Mitsubishi FB20NT EFB13-70037', (select id from public.asset_types where name = 'Equipment'), 'active', 'Linde', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('67dee149-f317-529f-ba46-d140ec739a93', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Gabelstapler Mitsubishi FB 25 (G2) Nr.EFB8C50187', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('cd266127-3706-5c0b-84e1-a8a6fefe9cf8', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Still, Elektrogabenstapler RX 50-13  Nr. 515053218324 (G3)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Still', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('74aa28e9-e0b9-5d6e-bb3f-ee363bdedf87', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Toyota Diesel Frontstapler Nr. 8FDKF20 Nr. 10281 (G4)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Mitsubishi', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e7c59810-7484-584f-820d-7a3ea5ccd8b0', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Gabelstapler Still R50-15 Nr. 50442368 (G7)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4432e4b1-77b7-50dc-b1f8-82767b786927', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Gabelstapler  BT RT 1350 SE-13 Masch.-Nr. 28307 Nr. 280731 AA (G9)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('05802a60-7989-5938-ae4c-612f12cdcac1', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Linde E 16 PH-01 (G10)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Linde', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3bf2f5ff-5785-54b2-987b-8237a0828a14', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Schubmastgabelstapler R14 Nr. P21120G00603 (G11)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Still', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('31204de7-a368-501e-b5c2-e94febdd75ea', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Schubmaststapler Linde R 14 Nr. P21120G00920 (G12)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Jetschke', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('d871e03d-cd0e-523d-8e25-67410206c50c', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', '3-Rad-Elektro-Gabelstapler', (select id from public.asset_types where name = 'Equipment'), 'active', 'Linde', '515065E00388', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4b154b30-ed56-5553-af72-37dff083e553', '3ae485dd-343e-5b1e-a33f-405d6e99ad8d', 'Elektro-Schubmaststapler', (select id from public.asset_types where name = 'Equipment'), 'active', 'Mitsubishi', '511903G00543', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e802275e-f5a3-5519-a6ba-89476f95e609', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Kommissionierstapler Linde L12LHPSP Nr. W4X133F00876 (K11)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Linde', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b68a09e4-3922-59cf-96af-20acf136c3c8', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Ameise Sichelschmidt DM EX (rot) (A1)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Sichelschmidt', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('fa493158-6d2f-55ee-8387-a4ba0e047c2f', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Deichselstapler Jungheinrich EJC L109 Nr. 724525213 (A3)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Jungheinrich', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a3952a13-3d03-5274-ab19-9fec5e50dd6e', '5877ac9b-3178-596e-8e10-85885e9a197d', 'E-Ameise. Mitsubishi Typ SBP 12 N AC  Nr. RL486294 (A4)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Mitsubishi', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('291de783-9cb6-5fcc-b4c7-39a3404ac7fb', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Elektro-Ameise Nr. WP200MIC (A5)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('602c8e43-f242-5c26-85ea-c383441c15c3', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Elektro-Ameise Linde L12 (A6)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Linde', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('6ba9a68b-2c06-5ba9-8bdf-d9514ae74dff', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Faba EGS 1250 (1257443)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Faba', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4995fa2d-0a0d-502d-be21-eab90d67ea3d', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Still Geh-Niederhubwagen ECU-30', (select id from public.asset_types where name = 'Equipment'), 'active', 'Still', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c424bdbb-064b-599e-83aa-3d2f2bf2cd7c', '5877ac9b-3178-596e-8e10-85885e9a197d', 'BT HWE100 (6149462)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Toyota', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('22d549f2-7cde-5fe7-be2f-7810d3df923f', '5877ac9b-3178-596e-8e10-85885e9a197d', 'BT HWE100 (6186821)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Toyota', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0a8a3ae8-7ab5-51db-981a-8fb975883c87', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Still EGV 14 (710248003615)', (select id from public.asset_types where name = 'Equipment'), 'active', 'Still', null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9063567d-bcd5-5170-be40-a33a56b51197', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Still EVG 16', (select id from public.asset_types where name = 'Equipment'), 'active', 'Still', 'F20277E01803', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f24cf13e-44b6-5726-bdb7-be3299743e80', '5877ac9b-3178-596e-8e10-85885e9a197d', 'Sichelschmidt D130 EX', (select id from public.asset_types where name = 'Equipment'), 'active', 'Sichelschmidt', '331124', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9d497a21-3950-5ac5-9f09-d93639c252f9', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Werkstatt Hubwagen', (select id from public.asset_types where name = 'Equipment'), 'active', 'Q-Teck', null, 'Glü/Werkstatt');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('3f5ad495-afa8-581c-ad6a-d5f88219aec5', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Kurzer Hubwagen Dosenhalle', (select id from public.asset_types where name = 'Equipment'), 'active', 'Q-Teck', 'V2000267', 'Glü/Hof');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('bf4b13f8-0d63-5ba7-bd1b-1782e644127c', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Anlage 742', (select id from public.asset_types where name = 'Equipment'), 'active', 'Lifter', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('147175e1-0688-5c19-bf09-2d48b86a2bd0', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Doppeltopf', (select id from public.asset_types where name = 'Equipment'), 'active', 'BT', '3550742', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('80f151cc-144b-50bb-a487-8d706de77af8', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 957', (select id from public.asset_types where name = 'Equipment'), 'active', 'BT', '1780279', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('739e0336-04e8-575d-8d15-03404148cb2b', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Fahrstuhl', (select id from public.asset_types where name = 'Equipment'), 'active', 'TOYOTA', '8777615', 'Glü/Prod/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b788dd02-948f-5d40-874a-9cb2a3f18c87', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Abfüllung 1', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', '4310N054', 'Glü/Abfüll/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ee398e8e-2b1e-556a-982e-4fc8a9260328', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 715', (select id from public.asset_types where name = 'Equipment'), 'active', 'Lifter', 'HLI0598236', 'Glü/Prod/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c7a4a76c-4a95-5bdb-a5fd-ecfd90387421', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 715 II', (select id from public.asset_types where name = 'Equipment'), 'active', 'Q-Lift', '101105', 'Glü/Prod/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('57dd79c0-94c4-543c-942c-546d4e926362', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 915', (select id from public.asset_types where name = 'Equipment'), 'active', 'BT', '1788952', 'Glü/Abfüll/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('b5d02990-ff7f-5be2-9137-6895eb94f9af', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 901 I', (select id from public.asset_types where name = 'Equipment'), 'active', 'Lifter', 'HLI0623601', 'Glü/Abfüll/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('96008a88-eca9-5ddd-90ac-823b4c2ddea8', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 901 II', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', '202004811', 'Glü/Abfüll/Wasser');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a41c09a0-1e7f-5f4c-9d55-1646fd8e2084', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 908', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', '4310N012', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('00903e70-a90b-5ef7-ade1-7cbd44915360', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Rohr I', (select id from public.asset_types where name = 'Equipment'), 'decommissioned', 'Schefer', '20051904M/014', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('62f0c599-2c2a-5490-91d8-5ced788f8818', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Rohr 2', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', '20051904M/013', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1997fbc8-69d6-595f-8914-3e0b78661a61', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 903', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', null, 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('9af57abf-117f-57be-970c-3e38cb0230ed', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Rohr', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', '5223N340', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('80ecfcc9-04c5-575a-b271-f94649314ff5', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 902', (select id from public.asset_types where name = 'Equipment'), 'active', 'Q-Teck', 'G1804159', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('f22db0a0-c46e-521c-8261-1343866dbc06', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 901 III', (select id from public.asset_types where name = 'Equipment'), 'active', 'BT', '4716056', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e8c046f9-47cc-5049-92cc-cad075a79caa', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 902 II', (select id from public.asset_types where name = 'Equipment'), 'active', 'Q-Teck', '018157', 'Glü/Abfüll/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('fd0377d6-aad4-58b1-90e4-0ade391a06e5', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen lang Waschanlage', (select id from public.asset_types where name = 'Equipment'), 'active', 'Lifter', 'HLI0634631', 'Glü/Hof');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0338a81a-4298-5460-81cd-47d8d68d6f37', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Doppeltopf II', (select id from public.asset_types where name = 'Equipment'), 'active', 'BT', null, 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e6519a1f-4ae5-5e85-b30b-ffe8f4211079', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Pigmentstube', (select id from public.asset_types where name = 'Equipment'), 'active', 'Schefer', '201901528', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('5901c8c6-e959-54a1-a86b-fbe628d60583', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Perlmühlen', (select id from public.asset_types where name = 'Equipment'), 'active', 'TOYOTA', '8775214', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('efe2bcb4-6322-5575-8ef6-84f88981065c', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen lömi Prod', (select id from public.asset_types where name = 'Equipment'), 'active', 'TOYOTA', '8775209', null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('ab58588d-0e19-5179-b2c2-915738b0b068', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen 950', (select id from public.asset_types where name = 'Equipment'), 'active', 'Q-Teck', 'V2105190', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('889be093-3779-57c9-abe9-cc796b69a876', 'dd72e519-0224-5626-a381-d8b5b70afc66', 'Hubwagen Prod. Lömi', (select id from public.asset_types where name = 'Equipment'), 'active', 'TOYOTA', '8961358', 'Glü/Prod/Lömi');
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('1ce85fef-1cce-593c-a61e-512c6a5d4e43', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr. 988851 (K1)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('54502988-07aa-5b07-8b63-163b481f0a65', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr. 6074680 (K2)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('0afd13ee-24ef-5788-8fed-b1fa65697df9', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer (6443124)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('4cac3bee-6a3b-59ff-917a-522671f49cff', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr. 975284 (K5)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('43599165-6d5d-5f50-a953-137e161a03a2', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr. 972208 (K6)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('49d78a71-8539-569d-99f5-abd64c66a9db', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr.921413 (K7)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('e5f25cf2-1db7-58c2-b6de-be3b411dc7fe', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer BT OSE Nr. 921412 (K8)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('26685246-6de3-5697-920d-2268c14934c5', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr. 988850 (K9)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('375feb42-d56f-5fe7-9b48-617774028dfa', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Niederhubkommissionierer Nr. 6044188 (K10)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c140dfa8-9458-56cd-8fe0-e4e97f53fe24', 'ffb34766-ce49-5384-9105-7148a6d85567', 'Toyota Kommissionierer Nr. 6116955 (K12)', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('a0fa33d1-6ac0-53fc-bd33-b4e3250e4398', 'ffb34766-ce49-5384-9105-7148a6d85567', 'BO OSE  Baujahr 2012', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('14438518-369c-5e6c-8e4c-a2a07fe83273', 'ffb34766-ce49-5384-9105-7148a6d85567', 'BO OSE  Baujahr 2016', (select id from public.asset_types where name = 'Equipment'), 'active', null, null, null);
insert into public.assets (id, parent_asset_id, name, asset_type_id, status, manufacturer, serial_number, location) values ('c159f86f-a2a3-5182-9bc2-b0efa3e2babb', '8732c40f-8ef6-5d25-981b-4cba58348545', 'Photovoltaik-Anlage Rohstoffhalle', (select id from public.asset_types where name = 'Equipment'), 'active', 'Otto-Weich // SMA', null, null);

-- technical data (asset attributes, offered by type Equipment)
insert into public.asset_attributes (name, data_type, unit) values
  ('Code', 'text', null),
  ('Modell', 'text', null),
  ('Baumuster', 'text', null),
  ('Anlagennummer Buchhaltung', 'text', null),
  ('Lieferant', 'list', null),
  ('ATEX-Kennzeichnung', 'list', null),
  ('Spannung', 'number', 'V'),
  ('Leistung Hauptmotor', 'number', 'kW'),
  ('Baujahr', 'number', null),
  ('Anschaffungsdatum', 'date', null),
  ('Beschreibung', 'text', null)
on conflict (name) do nothing;
insert into public.asset_type_attributes (asset_type_id, asset_attribute_id)
select t.id, a.id from public.asset_types t, public.asset_attributes a
where t.name = 'Equipment' and a.name in ('Code', 'Modell', 'Baumuster', 'Anlagennummer Buchhaltung', 'Lieferant', 'ATEX-Kennzeichnung', 'Spannung', 'Leistung Hauptmotor', 'Baujahr', 'Anschaffungsdatum', 'Beschreibung')
on conflict do nothing;
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1c5b9632-5dd5-5099-888c-dac3ad84fdee', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '540000');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('1c5b9632-5dd5-5099-888c-dac3ad84fdee', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1989-03-13');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('5fa53fb0-edce-5cd1-800c-3a3edf27747e', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '530046');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('5fa53fb0-edce-5cd1-800c-3a3edf27747e', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-04-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a6c8c8bf-f978-5f1b-ad3c-1a5cea2f76f4', (select id from public.asset_attributes where name = 'Modell'), 'Fabrikat Bergmann MPB 18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a6c8c8bf-f978-5f1b-ad3c-1a5cea2f76f4', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '210030');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a6c8c8bf-f978-5f1b-ad3c-1a5cea2f76f4', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-12-09');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bc16d03e-324c-5957-b85c-1750f3433d1f', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '210021');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bc16d03e-324c-5957-b85c-1750f3433d1f', (select id from public.asset_attributes where name = 'Lieferant'), 'Köhler');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('bc16d03e-324c-5957-b85c-1750f3433d1f', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2017-01-24');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('6f36fb77-cd8f-5e3d-acd1-ad856c87ce03', (select id from public.asset_attributes where name = 'Beschreibung'), 'Ballenpresse für Folie&Pappe');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('486747df-7db6-58cc-8424-779cd2317f5d', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310077');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('486747df-7db6-58cc-8424-779cd2317f5d', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-06-25');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('486747df-7db6-58cc-8424-779cd2317f5d', (select id from public.asset_attributes where name = 'Beschreibung'), 'Test');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('02a6a939-131f-509a-a54e-9b3e65fc2c4b', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310084');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('02a6a939-131f-509a-a54e-9b3e65fc2c4b', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-05-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e99ddef0-b564-5f53-a438-1df827a4477e', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310085');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('e99ddef0-b564-5f53-a438-1df827a4477e', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-07-12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1382ae72-eec7-5da2-8daa-d12dda42431c', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310082');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('1382ae72-eec7-5da2-8daa-d12dda42431c', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-05-12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1382ae72-eec7-5da2-8daa-d12dda42431c', (select id from public.asset_attributes where name = 'Beschreibung'), 'Still Typ EXD-S 20');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ec1c8ff8-cf9e-595f-bcf9-d66ff1d45998', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310078');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('ec1c8ff8-cf9e-595f-bcf9-d66ff1d45998', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-07-24');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9cd6731c-e0a9-5956-bd2a-64f3edd9a278', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100032');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('9cd6731c-e0a9-5956-bd2a-64f3edd9a278', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-02-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f60ac2d0-b53b-5ea0-9fac-224aa43e4983', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100032');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('f60ac2d0-b53b-5ea0-9fac-224aa43e4983', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-02-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('836f2e37-2fa8-5aeb-a3c0-a523174c26d8', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100032');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('836f2e37-2fa8-5aeb-a3c0-a523174c26d8', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-02-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9421f35b-329c-5395-bf25-900938ff9a11', (select id from public.asset_attributes where name = 'Modell'), 'TE 102');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9421f35b-329c-5395-bf25-900938ff9a11', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '210026');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9421f35b-329c-5395-bf25-900938ff9a11', (select id from public.asset_attributes where name = 'Lieferant'), 'Kaeser');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('9421f35b-329c-5395-bf25-900938ff9a11', (select id from public.asset_attributes where name = 'Baujahr'), '2020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('9421f35b-329c-5395-bf25-900938ff9a11', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-03-20');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d6cd84e9-0dfc-5e9a-a161-d4aed4300a92', (select id from public.asset_attributes where name = 'Modell'), 'ASD60');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('d6cd84e9-0dfc-5e9a-a161-d4aed4300a92', (select id from public.asset_attributes where name = 'Baujahr'), '2020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3d1072fe-ff04-5eb8-8072-4fac991f6987', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '210028');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3d1072fe-ff04-5eb8-8072-4fac991f6987', (select id from public.asset_attributes where name = 'Lieferant'), 'Kaeser Krompressoren');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('3d1072fe-ff04-5eb8-8072-4fac991f6987', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-03-20');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('67e11a45-1b36-5b41-a905-47a307766158', (select id from public.asset_attributes where name = 'Modell'), 'Aquamat 6');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('67e11a45-1b36-5b41-a905-47a307766158', (select id from public.asset_attributes where name = 'Baujahr'), '2002');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('60b5dac8-0374-5a8d-9217-6e54998b4147', (select id from public.asset_attributes where name = 'Modell'), 'BS61');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('09788262-e92e-5347-8964-642827b95773', (select id from public.asset_attributes where name = 'Modell'), 'LZQJ-XC');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('09788262-e92e-5347-8964-642827b95773', (select id from public.asset_attributes where name = 'Beschreibung'), 'Infrastruktur/Elektrik');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('dbe21ff7-4a86-502d-b23f-b4210bf8cd67', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100061');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('dbe21ff7-4a86-502d-b23f-b4210bf8cd67', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-09-16');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('03c2cd42-76d2-5189-a6b6-169c26630cc4', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410103');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('03c2cd42-76d2-5189-a6b6-169c26630cc4', (select id from public.asset_attributes where name = 'Lieferant'), 'Otto Weich');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('03c2cd42-76d2-5189-a6b6-169c26630cc4', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-03-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a9610652-6285-5753-8de5-02f366e3fe8f', (select id from public.asset_attributes where name = 'Beschreibung'), 'Stellzeiger für pneumatische Antriebe der KH');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('17688ed9-f940-58da-8b54-e8d8979a3a67', (select id from public.asset_attributes where name = 'Beschreibung'), 'Hausverteilung ');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('444c4d54-9b17-5caa-8782-a5f6ce8a7b33', (select id from public.asset_attributes where name = 'Modell'), 'SE 715 750');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('444c4d54-9b17-5caa-8782-a5f6ce8a7b33', (select id from public.asset_attributes where name = 'Baumuster'), '06226350');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('444c4d54-9b17-5caa-8782-a5f6ce8a7b33', (select id from public.asset_attributes where name = 'Baujahr'), '1995');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4824f786-7770-5e5b-a561-b72567f3bcbd', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100044');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4824f786-7770-5e5b-a561-b72567f3bcbd', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1997-06-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('7abcb81d-647f-5def-8931-8e45c46ea392', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230149');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('7abcb81d-647f-5def-8931-8e45c46ea392', (select id from public.asset_attributes where name = 'Lieferant'), 'Scharf Kältetechnik');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('7abcb81d-647f-5def-8931-8e45c46ea392', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2018-03-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a8bfb969-6b86-55dd-82ed-f63aa80e4fa3', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230149');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a8bfb969-6b86-55dd-82ed-f63aa80e4fa3', (select id from public.asset_attributes where name = 'Lieferant'), 'Scharf Kältetechnik');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a8bfb969-6b86-55dd-82ed-f63aa80e4fa3', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2018-03-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b94fb818-aaea-5313-b520-fca18ecf4b65', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410054');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f1f3935b-daf6-57c8-b232-5104c38b9a37', (select id from public.asset_attributes where name = 'Modell'), 'BA6600 DN100');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f1f3935b-daf6-57c8-b232-5104c38b9a37', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100060');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('f1f3935b-daf6-57c8-b232-5104c38b9a37', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-09-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('703fcc43-ab75-5517-85cb-2cfbb2492c69', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230060');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('703fcc43-ab75-5517-85cb-2cfbb2492c69', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1998-02-05');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cc3bd6bd-8259-5d38-86ab-b49b1f169d44', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420130');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('cc3bd6bd-8259-5d38-86ab-b49b1f169d44', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2014-11-12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('92cc6d1b-c990-5024-8388-4e84c5202705', (select id from public.asset_attributes where name = 'Modell'), 'SC/KWT 1000');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('92cc6d1b-c990-5024-8388-4e84c5202705', (select id from public.asset_attributes where name = 'Baumuster'), 'SC/KWT');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('92cc6d1b-c990-5024-8388-4e84c5202705', (select id from public.asset_attributes where name = 'Leistung Hauptmotor'), '2.8');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('92cc6d1b-c990-5024-8388-4e84c5202705', (select id from public.asset_attributes where name = 'Baujahr'), '2002');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('92cc6d1b-c990-5024-8388-4e84c5202705', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2024-08-20');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('86c9c3f8-62c7-5eef-843c-5f874c3c1399', (select id from public.asset_attributes where name = 'Modell'), 'H500-P');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('86c9c3f8-62c7-5eef-843c-5f874c3c1399', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420138');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0bbab069-f506-5be1-a063-93671b1bdc2d', (select id from public.asset_attributes where name = 'Modell'), 'KDV 242-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0bbab069-f506-5be1-a063-93671b1bdc2d', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410074');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('0bbab069-f506-5be1-a063-93671b1bdc2d', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2006-12-15');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4485b1d0-2073-5d97-b7be-6d31750e2a4f', (select id from public.asset_attributes where name = 'Modell'), 'KDV 242-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4485b1d0-2073-5d97-b7be-6d31750e2a4f', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410079');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4485b1d0-2073-5d97-b7be-6d31750e2a4f', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2011-11-04');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c31b1e42-2381-51ae-ac20-de03cb5fe0db', (select id from public.asset_attributes where name = 'Modell'), 'KDV 242-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c31b1e42-2381-51ae-ac20-de03cb5fe0db', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410098');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('c31b1e42-2381-51ae-ac20-de03cb5fe0db', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2017-01-20');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b2de1852-56e7-5fd9-b4cc-9231539f7984', (select id from public.asset_attributes where name = 'Modell'), 'KDV 242-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b2de1852-56e7-5fd9-b4cc-9231539f7984', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410099');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('b2de1852-56e7-5fd9-b4cc-9231539f7984', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2017-01-20');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1f48b09f-9c60-5798-976e-2a459266e5c3', (select id from public.asset_attributes where name = 'Modell'), 'KDV 242-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1f48b09f-9c60-5798-976e-2a459266e5c3', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410102');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('1f48b09f-9c60-5798-976e-2a459266e5c3', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-10-24');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0f3a76b5-9cef-5e89-9cfc-ef7aefc67bd1', (select id from public.asset_attributes where name = 'Modell'), 'KDV 242-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0f3a76b5-9cef-5e89-9cfc-ef7aefc67bd1', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410101');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('0f3a76b5-9cef-5e89-9cfc-ef7aefc67bd1', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-10-24');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9d62d1fc-ceb8-5fc2-9973-d502f7e604f0', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '240048');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9d62d1fc-ceb8-5fc2-9973-d502f7e604f0', (select id from public.asset_attributes where name = 'Lieferant'), 'Langguth');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('9d62d1fc-ceb8-5fc2-9973-d502f7e604f0', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2016-06-05');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('5d4fb811-76d6-5e98-b896-67b02f99ed66', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '240008');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('5d4fb811-76d6-5e98-b896-67b02f99ed66', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1998-03-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('537594df-19b6-595f-b82f-e90189efd97f', (select id from public.asset_attributes where name = 'Modell'), 'NT 773');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('980d1adb-065b-5078-9481-579d111c6ab0', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '530039');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('980d1adb-065b-5078-9481-579d111c6ab0', (select id from public.asset_attributes where name = 'Lieferant'), 'Kärcher Center Vonsien GmbH');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('980d1adb-065b-5078-9481-579d111c6ab0', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2016-09-19');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('da96e368-eaef-570e-821d-dae76519f33f', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310035');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('da96e368-eaef-570e-821d-dae76519f33f', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-02-25');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('7b9475f5-8903-5aa5-917f-c6cc2fdfe29d', (select id from public.asset_attributes where name = 'Modell'), 'LW 108 R INK');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('7b9475f5-8903-5aa5-917f-c6cc2fdfe29d', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230119');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('7b9475f5-8903-5aa5-917f-c6cc2fdfe29d', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2012-12-31');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('92e49d3e-706c-5456-89ca-5fb4b0442e06', (select id from public.asset_attributes where name = 'Modell'), 'BMS6030w');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('92e49d3e-706c-5456-89ca-5fb4b0442e06', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420129');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('92e49d3e-706c-5456-89ca-5fb4b0442e06', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2014-07-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1275be67-4936-5806-817d-a353d452ea1a', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '250016');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1275be67-4936-5806-817d-a353d452ea1a', (select id from public.asset_attributes where name = 'Lieferant'), 'MSK');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('1275be67-4936-5806-817d-a353d452ea1a', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2014-12-31');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('594662d1-6e87-5734-8ef7-3745410e30bb', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '150020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('594662d1-6e87-5734-8ef7-3745410e30bb', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-07-23');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a487453e-57f5-5dfa-aca8-5c2464b1e9f3', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '100061');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a487453e-57f5-5dfa-aca8-5c2464b1e9f3', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-09-16');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4096d89a-d015-5c7f-abd6-d1036eb255ea', (select id from public.asset_attributes where name = 'Modell'), 'VD/SK50');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('101336c1-1ba7-53c2-a294-fd9facdd12b4', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230053');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('101336c1-1ba7-53c2-a294-fd9facdd12b4', (select id from public.asset_attributes where name = 'Lieferant'), 'Nordtechnik');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('101336c1-1ba7-53c2-a294-fd9facdd12b4', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1997-06-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b61c28b7-db0f-53d1-85c3-ac286ad93adf', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '530010');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('b61c28b7-db0f-53d1-85c3-ac286ad93adf', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1996-10-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('de66aee4-f09b-5a03-bfcc-9cb7224991c8', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '530009');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('de66aee4-f09b-5a03-bfcc-9cb7224991c8', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1996-09-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('803517ec-bca3-5a13-b5ea-a43b6661eab8', (select id from public.asset_attributes where name = 'Beschreibung'), 'Trittleitern ,Steigeleitern  usw.');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('426ece35-b295-54df-85d8-d33dd4896ef9', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230148');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('426ece35-b295-54df-85d8-d33dd4896ef9', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2017-10-12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4cb8c967-5d38-55b9-8d4e-b8df264401e8', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '540006');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4cb8c967-5d38-55b9-8d4e-b8df264401e8', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1982-08-05');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('57e7688b-214b-54c9-8247-9fea11f447d4', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '540005');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('57e7688b-214b-54c9-8247-9fea11f447d4', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1982-06-16');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d1eac8e3-bb61-5670-8d7a-54ac8f0416c6', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '540004');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('d1eac8e3-bb61-5670-8d7a-54ac8f0416c6', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1982-05-18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9c794edb-7c35-589a-b791-eb985be7a5df', (select id from public.asset_attributes where name = 'Code'), '630');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9c794edb-7c35-589a-b791-eb985be7a5df', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '230051');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('9c794edb-7c35-589a-b791-eb985be7a5df', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1997-06-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', (select id from public.asset_attributes where name = 'Code'), '631');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '150024');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', (select id from public.asset_attributes where name = 'Lieferant'), 'Vibromac');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', (select id from public.asset_attributes where name = 'Spannung'), '400');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', (select id from public.asset_attributes where name = 'Baujahr'), '2021');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4f6573c6-1ca5-5087-9ee4-faae837edf31', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-07-09');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3fa76848-8cea-5bc1-8965-4af965aeeda3', (select id from public.asset_attributes where name = 'Code'), '704');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3fa76848-8cea-5bc1-8965-4af965aeeda3', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410056');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d01358ed-f404-5e53-8a47-2ee4de97c114', (select id from public.asset_attributes where name = 'Code'), '705');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d01358ed-f404-5e53-8a47-2ee4de97c114', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410056');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b37f3801-8f24-5f24-959f-6fa4d1fc72e2', (select id from public.asset_attributes where name = 'Code'), '713');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b37f3801-8f24-5f24-959f-6fa4d1fc72e2', (select id from public.asset_attributes where name = 'Modell'), 'KDV 790-79');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b37f3801-8f24-5f24-959f-6fa4d1fc72e2', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410082');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ce6c4767-70eb-5f03-afb4-2a84c47c3f1c', (select id from public.asset_attributes where name = 'Code'), '714');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ce6c4767-70eb-5f03-afb4-2a84c47c3f1c', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410084');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('ce6c4767-70eb-5f03-afb4-2a84c47c3f1c', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-08-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b9da2336-8c07-5082-8757-b2935e479beb', (select id from public.asset_attributes where name = 'Code'), '716');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b9da2336-8c07-5082-8757-b2935e479beb', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410040');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('10309b35-41de-5ac7-b91f-545013424f3c', (select id from public.asset_attributes where name = 'Code'), '740');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('10309b35-41de-5ac7-b91f-545013424f3c', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410051');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'Code'), '750');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '240057');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'Lieferant'), 'Vibromac');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'ATEX-Kennzeichnung'), 'EX II 2 G Ex h IIB T3 Gb X');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'Spannung'), '400');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'Baujahr'), '2021');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('ae500f23-07ca-5bea-9d7e-41a81a4f8eb6', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-12-27');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('2e9418aa-50ec-5be9-9c9d-8387f42e89ad', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('2e9418aa-50ec-5be9-9c9d-8387f42e89ad', (select id from public.asset_attributes where name = 'Modell'), 'V 304');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('2e9418aa-50ec-5be9-9c9d-8387f42e89ad', (select id from public.asset_attributes where name = 'Lieferant'), 'De Vree');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('2e9418aa-50ec-5be9-9c9d-8387f42e89ad', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-01-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('2e9418aa-50ec-5be9-9c9d-8387f42e89ad', (select id from public.asset_attributes where name = 'Beschreibung'), 'Maschine 1 Wasserabteilung');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a1dc2abe-3510-56ac-8c11-c1c4b2efd3c4', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a1dc2abe-3510-56ac-8c11-c1c4b2efd3c4', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '240050');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a1dc2abe-3510-56ac-8c11-c1c4b2efd3c4', (select id from public.asset_attributes where name = 'Lieferant'), 'Langguth');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a1dc2abe-3510-56ac-8c11-c1c4b2efd3c4', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-04-18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fb6bdc2c-88f6-54da-a366-d8cd395b44fb', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fb6bdc2c-88f6-54da-a366-d8cd395b44fb', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420170');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('fb6bdc2c-88f6-54da-a366-d8cd395b44fb', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-04-03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a7bd36df-d650-54e2-9a31-25e76485ef2f', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a7bd36df-d650-54e2-9a31-25e76485ef2f', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420169');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a7bd36df-d650-54e2-9a31-25e76485ef2f', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-04-03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d2e841f0-130b-5895-bf75-39be0969f6b6', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d2e841f0-130b-5895-bf75-39be0969f6b6', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420168');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('d2e841f0-130b-5895-bf75-39be0969f6b6', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-04-03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c2286fe6-5b35-5743-b2fd-fa3274c9c6e7', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c2286fe6-5b35-5743-b2fd-fa3274c9c6e7', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420167');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('c2286fe6-5b35-5743-b2fd-fa3274c9c6e7', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-04-03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('76e0cade-2590-5903-ba9c-6965db40ea35', (select id from public.asset_attributes where name = 'Code'), '901');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('76e0cade-2590-5903-ba9c-6965db40ea35', (select id from public.asset_attributes where name = 'Modell'), 'BMS 6030w');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('76e0cade-2590-5903-ba9c-6965db40ea35', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '250022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('76e0cade-2590-5903-ba9c-6965db40ea35', (select id from public.asset_attributes where name = 'Lieferant'), 'BVM');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('76e0cade-2590-5903-ba9c-6965db40ea35', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-04-18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c4439b9a-82cf-5acc-8234-2204034cc3aa', (select id from public.asset_attributes where name = 'Code'), '902');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c4439b9a-82cf-5acc-8234-2204034cc3aa', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420096');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('187d8d8f-29db-5729-b764-c57259fa2d48', (select id from public.asset_attributes where name = 'Code'), '902');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('187d8d8f-29db-5729-b764-c57259fa2d48', (select id from public.asset_attributes where name = 'Modell'), 'KDV 790-79');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('187d8d8f-29db-5729-b764-c57259fa2d48', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410078');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('72732e9e-f9ac-58ab-a98c-9f88d34d8c73', (select id from public.asset_attributes where name = 'Code'), '902');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('72732e9e-f9ac-58ab-a98c-9f88d34d8c73', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420086');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('6f81d889-232e-5907-b16c-dbf3dc92e687', (select id from public.asset_attributes where name = 'Code'), '902');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('6f81d889-232e-5907-b16c-dbf3dc92e687', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420126');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('6f81d889-232e-5907-b16c-dbf3dc92e687', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2014-06-19');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('304b247c-1ecc-5d2e-bd3a-4ba38186f2d2', (select id from public.asset_attributes where name = 'Code'), '902');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('304b247c-1ecc-5d2e-bd3a-4ba38186f2d2', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420042');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('304b247c-1ecc-5d2e-bd3a-4ba38186f2d2', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2009-09-02');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3606db04-adad-5bb4-93b6-48bb9321fbe6', (select id from public.asset_attributes where name = 'Code'), '903');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3606db04-adad-5bb4-93b6-48bb9321fbe6', (select id from public.asset_attributes where name = 'Modell'), 'V 302 Twin');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ba5954c6-9345-5512-b32b-1bb852bba6bf', (select id from public.asset_attributes where name = 'Code'), '903');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ba5954c6-9345-5512-b32b-1bb852bba6bf', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420042');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('ba5954c6-9345-5512-b32b-1bb852bba6bf', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2009-09-02');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('13d27dc6-600a-598a-b467-e2cd058d81d5', (select id from public.asset_attributes where name = 'Code'), '904');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('13d27dc6-600a-598a-b467-e2cd058d81d5', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420139');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1605541e-9886-5982-a8dc-1306c0c25775', (select id from public.asset_attributes where name = 'Code'), '904');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1605541e-9886-5982-a8dc-1306c0c25775', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420121');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1605541e-9886-5982-a8dc-1306c0c25775', (select id from public.asset_attributes where name = 'Lieferant'), 'Fill&Roll');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('1605541e-9886-5982-a8dc-1306c0c25775', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-10-25');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('17751a7c-e9ba-5557-b4e9-5a430b51353a', (select id from public.asset_attributes where name = 'Code'), '910');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('17751a7c-e9ba-5557-b4e9-5a430b51353a', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420113');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('17751a7c-e9ba-5557-b4e9-5a430b51353a', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2011-07-18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('97366612-07f1-57f2-8c67-c8b23372d06b', (select id from public.asset_attributes where name = 'Code'), '910');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('97366612-07f1-57f2-8c67-c8b23372d06b', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420089');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0f38e93e-de06-5782-84a3-608b91f7bfba', (select id from public.asset_attributes where name = 'Code'), '910');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0f38e93e-de06-5782-84a3-608b91f7bfba', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420171');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0f38e93e-de06-5782-84a3-608b91f7bfba', (select id from public.asset_attributes where name = 'Lieferant'), 'Nezsch');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('0f38e93e-de06-5782-84a3-608b91f7bfba', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-03-25');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c72f32c7-56e1-5841-9e43-d8e02e786d57', (select id from public.asset_attributes where name = 'Code'), '914');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c72f32c7-56e1-5841-9e43-d8e02e786d57', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420119');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c72f32c7-56e1-5841-9e43-d8e02e786d57', (select id from public.asset_attributes where name = 'Lieferant'), 'Fill&Roll');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('c72f32c7-56e1-5841-9e43-d8e02e786d57', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-10-21');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cc5b1bd8-0a7d-514d-a9af-ab38d742fd6c', (select id from public.asset_attributes where name = 'Code'), '915');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cc5b1bd8-0a7d-514d-a9af-ab38d742fd6c', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '240056');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('cc5b1bd8-0a7d-514d-a9af-ab38d742fd6c', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2022-01-12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cb2eb71a-656d-5d09-b94c-1995a2514efb', (select id from public.asset_attributes where name = 'Code'), '915');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cb2eb71a-656d-5d09-b94c-1995a2514efb', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '420172');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cb2eb71a-656d-5d09-b94c-1995a2514efb', (select id from public.asset_attributes where name = 'Lieferant'), 'Nezsch');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('cb2eb71a-656d-5d09-b94c-1995a2514efb', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-03-25');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('69e8891a-519b-5234-b497-ac95f5cff3b9', (select id from public.asset_attributes where name = 'Code'), '951');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('69e8891a-519b-5234-b497-ac95f5cff3b9', (select id from public.asset_attributes where name = 'Modell'), 'KD 25');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('69e8891a-519b-5234-b497-ac95f5cff3b9', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410047');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0740997e-e840-58f7-b85b-f81f7aa4ee09', (select id from public.asset_attributes where name = 'Code'), '952');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0740997e-e840-58f7-b85b-f81f7aa4ee09', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410048');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('023e5fc7-db44-5d02-87eb-889919520640', (select id from public.asset_attributes where name = 'Code'), '953');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('023e5fc7-db44-5d02-87eb-889919520640', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410065');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('11286ad9-da7f-581f-baa3-cd75b5ac6cc9', (select id from public.asset_attributes where name = 'Code'), '954');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('11286ad9-da7f-581f-baa3-cd75b5ac6cc9', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410046');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bdc37aa5-26d8-5efd-abe8-0b187eb98b6d', (select id from public.asset_attributes where name = 'Code'), '955');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bdc37aa5-26d8-5efd-abe8-0b187eb98b6d', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410049');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('8d2309ed-4538-588e-ab50-3be177ba2731', (select id from public.asset_attributes where name = 'Code'), '956');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('8d2309ed-4538-588e-ab50-3be177ba2731', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '410090');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b40e78ed-70e5-574f-abef-cbb50a5d1c4f', (select id from public.asset_attributes where name = 'Code'), '957');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b40e78ed-70e5-574f-abef-cbb50a5d1c4f', (select id from public.asset_attributes where name = 'Modell'), 'KD 15');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c450fba7-9fb1-5b74-a3a3-6cd967b332fa', (select id from public.asset_attributes where name = 'Code'), '958');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c450fba7-9fb1-5b74-a3a3-6cd967b332fa', (select id from public.asset_attributes where name = 'Modell'), 'KD 15');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f4fb101d-8b9b-5acb-b3fd-e2cfe9e25012', (select id from public.asset_attributes where name = 'Code'), '959');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f4fb101d-8b9b-5acb-b3fd-e2cfe9e25012', (select id from public.asset_attributes where name = 'Modell'), 'KBM');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3883a871-a879-5d5d-9b4a-f836f7c31305', (select id from public.asset_attributes where name = 'Code'), 'G01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3883a871-a879-5d5d-9b4a-f836f7c31305', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310073');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3883a871-a879-5d5d-9b4a-f836f7c31305', (select id from public.asset_attributes where name = 'Lieferant'), 'Jetschke Industriefahrzeuge');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('3883a871-a879-5d5d-9b4a-f836f7c31305', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-07-15');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('67dee149-f317-529f-ba46-d140ec739a93', (select id from public.asset_attributes where name = 'Code'), 'G02');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('67dee149-f317-529f-ba46-d140ec739a93', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310027');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('67dee149-f317-529f-ba46-d140ec739a93', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2006-04-07');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cd266127-3706-5c0b-84e1-a8a6fefe9cf8', (select id from public.asset_attributes where name = 'Code'), 'G03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cd266127-3706-5c0b-84e1-a8a6fefe9cf8', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310040');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('cd266127-3706-5c0b-84e1-a8a6fefe9cf8', (select id from public.asset_attributes where name = 'Lieferant'), 'Still');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('cd266127-3706-5c0b-84e1-a8a6fefe9cf8', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-08-30');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('74aa28e9-e0b9-5d6e-bb3f-ee363bdedf87', (select id from public.asset_attributes where name = 'Code'), 'G04');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('74aa28e9-e0b9-5d6e-bb3f-ee363bdedf87', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310041');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('74aa28e9-e0b9-5d6e-bb3f-ee363bdedf87', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2014-05-27');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e7c59810-7484-584f-820d-7a3ea5ccd8b0', (select id from public.asset_attributes where name = 'Code'), 'G07');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e7c59810-7484-584f-820d-7a3ea5ccd8b0', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('e7c59810-7484-584f-820d-7a3ea5ccd8b0', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2003-02-26');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4432e4b1-77b7-50dc-b1f8-82767b786927', (select id from public.asset_attributes where name = 'Code'), 'G09');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4432e4b1-77b7-50dc-b1f8-82767b786927', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310016');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4432e4b1-77b7-50dc-b1f8-82767b786927', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2002-10-10');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('05802a60-7989-5938-ae4c-612f12cdcac1', (select id from public.asset_attributes where name = 'Code'), 'G10');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('05802a60-7989-5938-ae4c-612f12cdcac1', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310059');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('05802a60-7989-5938-ae4c-612f12cdcac1', (select id from public.asset_attributes where name = 'Lieferant'), 'Linde');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('05802a60-7989-5938-ae4c-612f12cdcac1', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2016-04-18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3bf2f5ff-5785-54b2-987b-8237a0828a14', (select id from public.asset_attributes where name = 'Code'), 'G11');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3bf2f5ff-5785-54b2-987b-8237a0828a14', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310045');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3bf2f5ff-5785-54b2-987b-8237a0828a14', (select id from public.asset_attributes where name = 'Lieferant'), 'Still');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('3bf2f5ff-5785-54b2-987b-8237a0828a14', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-05-05');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('31204de7-a368-501e-b5c2-e94febdd75ea', (select id from public.asset_attributes where name = 'Code'), 'G12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('31204de7-a368-501e-b5c2-e94febdd75ea', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310058');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('31204de7-a368-501e-b5c2-e94febdd75ea', (select id from public.asset_attributes where name = 'Lieferant'), 'Jetschke');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('31204de7-a368-501e-b5c2-e94febdd75ea', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2016-03-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d871e03d-cd0e-523d-8e25-67410206c50c', (select id from public.asset_attributes where name = 'Code'), 'G13');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d871e03d-cd0e-523d-8e25-67410206c50c', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310079');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d871e03d-cd0e-523d-8e25-67410206c50c', (select id from public.asset_attributes where name = 'Lieferant'), 'Jetschke Industriefahrzeuge');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('d871e03d-cd0e-523d-8e25-67410206c50c', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-10-13');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('d871e03d-cd0e-523d-8e25-67410206c50c', (select id from public.asset_attributes where name = 'Beschreibung'), 'Still Typ RX 50-15');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4b154b30-ed56-5553-af72-37dff083e553', (select id from public.asset_attributes where name = 'Code'), 'G14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4b154b30-ed56-5553-af72-37dff083e553', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310081');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4b154b30-ed56-5553-af72-37dff083e553', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-05-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4b154b30-ed56-5553-af72-37dff083e553', (select id from public.asset_attributes where name = 'Beschreibung'), 'Still Typ FM-X-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e802275e-f5a3-5519-a6ba-89476f95e609', (select id from public.asset_attributes where name = 'Code'), 'H01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e802275e-f5a3-5519-a6ba-89476f95e609', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310051');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('e802275e-f5a3-5519-a6ba-89476f95e609', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-01-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b68a09e4-3922-59cf-96af-20acf136c3c8', (select id from public.asset_attributes where name = 'Code'), 'H02');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b68a09e4-3922-59cf-96af-20acf136c3c8', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310004');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('b68a09e4-3922-59cf-96af-20acf136c3c8', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '1988-12-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fa493158-6d2f-55ee-8387-a4ba0e047c2f', (select id from public.asset_attributes where name = 'Code'), 'H03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fa493158-6d2f-55ee-8387-a4ba0e047c2f', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310036');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('fa493158-6d2f-55ee-8387-a4ba0e047c2f', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-03-07');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a3952a13-3d03-5274-ab19-9fec5e50dd6e', (select id from public.asset_attributes where name = 'Code'), 'H04');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a3952a13-3d03-5274-ab19-9fec5e50dd6e', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310028');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a3952a13-3d03-5274-ab19-9fec5e50dd6e', (select id from public.asset_attributes where name = 'Lieferant'), 'GBS');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a3952a13-3d03-5274-ab19-9fec5e50dd6e', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2009-11-03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('291de783-9cb6-5fcc-b4c7-39a3404ac7fb', (select id from public.asset_attributes where name = 'Code'), 'H05');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('291de783-9cb6-5fcc-b4c7-39a3404ac7fb', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310021');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('291de783-9cb6-5fcc-b4c7-39a3404ac7fb', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2002-12-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('602c8e43-f242-5c26-85ea-c383441c15c3', (select id from public.asset_attributes where name = 'Code'), 'H06');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('602c8e43-f242-5c26-85ea-c383441c15c3', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310047');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('602c8e43-f242-5c26-85ea-c383441c15c3', (select id from public.asset_attributes where name = 'Lieferant'), 'GSG');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('602c8e43-f242-5c26-85ea-c383441c15c3', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-10-15');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('6ba9a68b-2c06-5ba9-8bdf-d9514ae74dff', (select id from public.asset_attributes where name = 'Code'), 'H07');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('6ba9a68b-2c06-5ba9-8bdf-d9514ae74dff', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310055');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('6ba9a68b-2c06-5ba9-8bdf-d9514ae74dff', (select id from public.asset_attributes where name = 'Lieferant'), 'GSG');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('6ba9a68b-2c06-5ba9-8bdf-d9514ae74dff', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2016-01-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4995fa2d-0a0d-502d-be21-eab90d67ea3d', (select id from public.asset_attributes where name = 'Code'), 'H08');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4995fa2d-0a0d-502d-be21-eab90d67ea3d', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310057');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4995fa2d-0a0d-502d-be21-eab90d67ea3d', (select id from public.asset_attributes where name = 'Lieferant'), 'Still');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4995fa2d-0a0d-502d-be21-eab90d67ea3d', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2016-02-18');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c424bdbb-064b-599e-83aa-3d2f2bf2cd7c', (select id from public.asset_attributes where name = 'Code'), 'H09');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c424bdbb-064b-599e-83aa-3d2f2bf2cd7c', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310062');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c424bdbb-064b-599e-83aa-3d2f2bf2cd7c', (select id from public.asset_attributes where name = 'Lieferant'), 'Toyota');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('c424bdbb-064b-599e-83aa-3d2f2bf2cd7c', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2017-06-27');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('22d549f2-7cde-5fe7-be2f-7810d3df923f', (select id from public.asset_attributes where name = 'Code'), 'H10');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('22d549f2-7cde-5fe7-be2f-7810d3df923f', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310068');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('22d549f2-7cde-5fe7-be2f-7810d3df923f', (select id from public.asset_attributes where name = 'Lieferant'), 'Toyota');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('22d549f2-7cde-5fe7-be2f-7810d3df923f', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2018-09-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0a8a3ae8-7ab5-51db-981a-8fb975883c87', (select id from public.asset_attributes where name = 'Code'), 'H11');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0a8a3ae8-7ab5-51db-981a-8fb975883c87', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310075');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0a8a3ae8-7ab5-51db-981a-8fb975883c87', (select id from public.asset_attributes where name = 'Lieferant'), 'GSG');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('0a8a3ae8-7ab5-51db-981a-8fb975883c87', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2019-12-31');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9063567d-bcd5-5170-be40-a33a56b51197', (select id from public.asset_attributes where name = 'Code'), 'H14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9063567d-bcd5-5170-be40-a33a56b51197', (select id from public.asset_attributes where name = 'Modell'), 'EVG 16');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('9063567d-bcd5-5170-be40-a33a56b51197', (select id from public.asset_attributes where name = 'Baujahr'), '2014');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9063567d-bcd5-5170-be40-a33a56b51197', (select id from public.asset_attributes where name = 'Beschreibung'), 'MIRETTI AUFTRAGS: E 6265');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f24cf13e-44b6-5726-bdb7-be3299743e80', (select id from public.asset_attributes where name = 'Code'), 'H16');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f24cf13e-44b6-5726-bdb7-be3299743e80', (select id from public.asset_attributes where name = 'Modell'), 'D130 EX');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('f24cf13e-44b6-5726-bdb7-be3299743e80', (select id from public.asset_attributes where name = 'Baujahr'), '1062023');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9d497a21-3950-5ac5-9f09-d93639c252f9', (select id from public.asset_attributes where name = 'Code'), 'HW001');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3f5ad495-afa8-581c-ad6a-d5f88219aec5', (select id from public.asset_attributes where name = 'Code'), 'HW002');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('3f5ad495-afa8-581c-ad6a-d5f88219aec5', (select id from public.asset_attributes where name = 'Modell'), 'OSE2500');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('3f5ad495-afa8-581c-ad6a-d5f88219aec5', (select id from public.asset_attributes where name = 'Baujahr'), '2020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bf4b13f8-0d63-5ba7-bd1b-1782e644127c', (select id from public.asset_attributes where name = 'Code'), 'HW003');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bf4b13f8-0d63-5ba7-bd1b-1782e644127c', (select id from public.asset_attributes where name = 'Modell'), 'HLI059823');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('bf4b13f8-0d63-5ba7-bd1b-1782e644127c', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('147175e1-0688-5c19-bf09-2d48b86a2bd0', (select id from public.asset_attributes where name = 'Code'), 'HW004');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('147175e1-0688-5c19-bf09-2d48b86a2bd0', (select id from public.asset_attributes where name = 'Modell'), 'L30/12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('147175e1-0688-5c19-bf09-2d48b86a2bd0', (select id from public.asset_attributes where name = 'Beschreibung'), '3t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('80f151cc-144b-50bb-a487-8d706de77af8', (select id from public.asset_attributes where name = 'Code'), 'HW005');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('80f151cc-144b-50bb-a487-8d706de77af8', (select id from public.asset_attributes where name = 'Modell'), 'BTL2000/10');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('739e0336-04e8-575d-8d15-03404148cb2b', (select id from public.asset_attributes where name = 'Code'), 'HW006');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('739e0336-04e8-575d-8d15-03404148cb2b', (select id from public.asset_attributes where name = 'Modell'), 'LHM230');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('739e0336-04e8-575d-8d15-03404148cb2b', (select id from public.asset_attributes where name = 'Baujahr'), '2023');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b788dd02-948f-5d40-874a-9cb2a3f18c87', (select id from public.asset_attributes where name = 'Code'), 'HW007');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b788dd02-948f-5d40-874a-9cb2a3f18c87', (select id from public.asset_attributes where name = 'Modell'), '1101018RTN1');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('b788dd02-948f-5d40-874a-9cb2a3f18c87', (select id from public.asset_attributes where name = 'Baujahr'), '2022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b788dd02-948f-5d40-874a-9cb2a3f18c87', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ee398e8e-2b1e-556a-982e-4fc8a9260328', (select id from public.asset_attributes where name = 'Code'), 'HW008');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ee398e8e-2b1e-556a-982e-4fc8a9260328', (select id from public.asset_attributes where name = 'Modell'), 'GS2S4RA 1150x525');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ee398e8e-2b1e-556a-982e-4fc8a9260328', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c7a4a76c-4a95-5bdb-a5fd-ecfd90387421', (select id from public.asset_attributes where name = 'Code'), 'HW009');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c7a4a76c-4a95-5bdb-a5fd-ecfd90387421', (select id from public.asset_attributes where name = 'Modell'), 'ROA1500');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('c7a4a76c-4a95-5bdb-a5fd-ecfd90387421', (select id from public.asset_attributes where name = 'Baujahr'), '2011');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c7a4a76c-4a95-5bdb-a5fd-ecfd90387421', (select id from public.asset_attributes where name = 'Beschreibung'), '1,5t Scherenhubwagen');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('57dd79c0-94c4-543c-942c-546d4e926362', (select id from public.asset_attributes where name = 'Code'), 'HW010');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('57dd79c0-94c4-543c-942c-546d4e926362', (select id from public.asset_attributes where name = 'Modell'), 'BTL2000/10');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('57dd79c0-94c4-543c-942c-546d4e926362', (select id from public.asset_attributes where name = 'Beschreibung'), '2t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b5d02990-ff7f-5be2-9137-6895eb94f9af', (select id from public.asset_attributes where name = 'Code'), 'HW011');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b5d02990-ff7f-5be2-9137-6895eb94f9af', (select id from public.asset_attributes where name = 'Modell'), 'HX1011540');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('b5d02990-ff7f-5be2-9137-6895eb94f9af', (select id from public.asset_attributes where name = 'Baujahr'), '2019');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('b5d02990-ff7f-5be2-9137-6895eb94f9af', (select id from public.asset_attributes where name = 'Beschreibung'), '1t Scherenhubwagen');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('96008a88-eca9-5ddd-90ac-823b4c2ddea8', (select id from public.asset_attributes where name = 'Code'), 'HW012');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('96008a88-eca9-5ddd-90ac-823b4c2ddea8', (select id from public.asset_attributes where name = 'Modell'), '1101018NTN');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('96008a88-eca9-5ddd-90ac-823b4c2ddea8', (select id from public.asset_attributes where name = 'Baujahr'), '2022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a41c09a0-1e7f-5f4c-9d55-1646fd8e2084', (select id from public.asset_attributes where name = 'Code'), 'HW013');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a41c09a0-1e7f-5f4c-9d55-1646fd8e2084', (select id from public.asset_attributes where name = 'Modell'), '1101018RTN1');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('a41c09a0-1e7f-5f4c-9d55-1646fd8e2084', (select id from public.asset_attributes where name = 'Baujahr'), '2022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a41c09a0-1e7f-5f4c-9d55-1646fd8e2084', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('00903e70-a90b-5ef7-ade1-7cbd44915360', (select id from public.asset_attributes where name = 'Code'), 'HW014');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('00903e70-a90b-5ef7-ade1-7cbd44915360', (select id from public.asset_attributes where name = 'Modell'), '1101010NTN');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('00903e70-a90b-5ef7-ade1-7cbd44915360', (select id from public.asset_attributes where name = 'Baujahr'), '2020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('00903e70-a90b-5ef7-ade1-7cbd44915360', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('62f0c599-2c2a-5490-91d8-5ced788f8818', (select id from public.asset_attributes where name = 'Code'), 'HW015');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('62f0c599-2c2a-5490-91d8-5ced788f8818', (select id from public.asset_attributes where name = 'Modell'), '1101010NTN');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('62f0c599-2c2a-5490-91d8-5ced788f8818', (select id from public.asset_attributes where name = 'Baujahr'), '2020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('62f0c599-2c2a-5490-91d8-5ced788f8818', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1997fbc8-69d6-595f-8914-3e0b78661a61', (select id from public.asset_attributes where name = 'Code'), 'HW016');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1997fbc8-69d6-595f-8914-3e0b78661a61', (select id from public.asset_attributes where name = 'Modell'), '1101072PTP11530');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('1997fbc8-69d6-595f-8914-3e0b78661a61', (select id from public.asset_attributes where name = 'Baujahr'), '2025');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1997fbc8-69d6-595f-8914-3e0b78661a61', (select id from public.asset_attributes where name = 'Beschreibung'), '3t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9af57abf-117f-57be-970c-3e38cb0230ed', (select id from public.asset_attributes where name = 'Code'), 'HW017');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9af57abf-117f-57be-970c-3e38cb0230ed', (select id from public.asset_attributes where name = 'Modell'), '1101072PTM11530');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('9af57abf-117f-57be-970c-3e38cb0230ed', (select id from public.asset_attributes where name = 'Baujahr'), '2025');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('9af57abf-117f-57be-970c-3e38cb0230ed', (select id from public.asset_attributes where name = 'Beschreibung'), '3t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('80ecfcc9-04c5-575a-b271-f94649314ff5', (select id from public.asset_attributes where name = 'Code'), 'HW018');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('80ecfcc9-04c5-575a-b271-f94649314ff5', (select id from public.asset_attributes where name = 'Modell'), 'SHW1500');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('80ecfcc9-04c5-575a-b271-f94649314ff5', (select id from public.asset_attributes where name = 'Baujahr'), '2018');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('80ecfcc9-04c5-575a-b271-f94649314ff5', (select id from public.asset_attributes where name = 'Beschreibung'), '1,5t Scherenhubwagen');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f22db0a0-c46e-521c-8261-1343866dbc06', (select id from public.asset_attributes where name = 'Code'), 'HW019');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f22db0a0-c46e-521c-8261-1343866dbc06', (select id from public.asset_attributes where name = 'Modell'), 'HHM100');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('f22db0a0-c46e-521c-8261-1343866dbc06', (select id from public.asset_attributes where name = 'Beschreibung'), '1t Scherenhubwagen');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e8c046f9-47cc-5049-92cc-cad075a79caa', (select id from public.asset_attributes where name = 'Code'), 'HW020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e8c046f9-47cc-5049-92cc-cad075a79caa', (select id from public.asset_attributes where name = 'Modell'), 'ROA1000');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('e8c046f9-47cc-5049-92cc-cad075a79caa', (select id from public.asset_attributes where name = 'Baujahr'), '2011');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e8c046f9-47cc-5049-92cc-cad075a79caa', (select id from public.asset_attributes where name = 'Beschreibung'), '1t Scherenhubwagen');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fd0377d6-aad4-58b1-90e4-0ade391a06e5', (select id from public.asset_attributes where name = 'Code'), 'HW021');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fd0377d6-aad4-58b1-90e4-0ade391a06e5', (select id from public.asset_attributes where name = 'Modell'), 'GS2S54RA 1500x525');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('fd0377d6-aad4-58b1-90e4-0ade391a06e5', (select id from public.asset_attributes where name = 'Baujahr'), '2019');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('fd0377d6-aad4-58b1-90e4-0ade391a06e5', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0338a81a-4298-5460-81cd-47d8d68d6f37', (select id from public.asset_attributes where name = 'Code'), 'HW022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0338a81a-4298-5460-81cd-47d8d68d6f37', (select id from public.asset_attributes where name = 'Modell'), 'BTL3000');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0338a81a-4298-5460-81cd-47d8d68d6f37', (select id from public.asset_attributes where name = 'Beschreibung'), '3t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e6519a1f-4ae5-5e85-b30b-ffe8f4211079', (select id from public.asset_attributes where name = 'Code'), 'HW023');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e6519a1f-4ae5-5e85-b30b-ffe8f4211079', (select id from public.asset_attributes where name = 'Modell'), '1101018RTP');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('e6519a1f-4ae5-5e85-b30b-ffe8f4211079', (select id from public.asset_attributes where name = 'Baujahr'), '2020');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e6519a1f-4ae5-5e85-b30b-ffe8f4211079', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('5901c8c6-e959-54a1-a86b-fbe628d60583', (select id from public.asset_attributes where name = 'Code'), 'HW024');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('5901c8c6-e959-54a1-a86b-fbe628d60583', (select id from public.asset_attributes where name = 'Modell'), 'LHM230');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('5901c8c6-e959-54a1-a86b-fbe628d60583', (select id from public.asset_attributes where name = 'Beschreibung'), '2,3t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('efe2bcb4-6322-5575-8ef6-84f88981065c', (select id from public.asset_attributes where name = 'Code'), 'HW025');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('efe2bcb4-6322-5575-8ef6-84f88981065c', (select id from public.asset_attributes where name = 'Modell'), 'LHM230');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('efe2bcb4-6322-5575-8ef6-84f88981065c', (select id from public.asset_attributes where name = 'Baujahr'), '2022');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('efe2bcb4-6322-5575-8ef6-84f88981065c', (select id from public.asset_attributes where name = 'Beschreibung'), '2,3t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ab58588d-0e19-5179-b2c2-915738b0b068', (select id from public.asset_attributes where name = 'Code'), 'HW026');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ab58588d-0e19-5179-b2c2-915738b0b068', (select id from public.asset_attributes where name = 'Modell'), 'VSE2500');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('ab58588d-0e19-5179-b2c2-915738b0b068', (select id from public.asset_attributes where name = 'Baujahr'), '2021');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('ab58588d-0e19-5179-b2c2-915738b0b068', (select id from public.asset_attributes where name = 'Beschreibung'), '2,5t');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('889be093-3779-57c9-abe9-cc796b69a876', (select id from public.asset_attributes where name = 'Code'), 'HW040');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('889be093-3779-57c9-abe9-cc796b69a876', (select id from public.asset_attributes where name = 'Modell'), 'LHM230');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('889be093-3779-57c9-abe9-cc796b69a876', (select id from public.asset_attributes where name = 'Baujahr'), '2025');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('889be093-3779-57c9-abe9-cc796b69a876', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2025-07-16');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('889be093-3779-57c9-abe9-cc796b69a876', (select id from public.asset_attributes where name = 'Beschreibung'), '2,3t
');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1ce85fef-1cce-593c-a61e-512c6a5d4e43', (select id from public.asset_attributes where name = 'Code'), 'K01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('1ce85fef-1cce-593c-a61e-512c6a5d4e43', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310037');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('1ce85fef-1cce-593c-a61e-512c6a5d4e43', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-04-04');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('54502988-07aa-5b07-8b63-163b481f0a65', (select id from public.asset_attributes where name = 'Code'), 'K02');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('54502988-07aa-5b07-8b63-163b481f0a65', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310046');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('54502988-07aa-5b07-8b63-163b481f0a65', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-06-29');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0afd13ee-24ef-5788-8fed-b1fa65697df9', (select id from public.asset_attributes where name = 'Code'), 'K03');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('0afd13ee-24ef-5788-8fed-b1fa65697df9', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310076');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('0afd13ee-24ef-5788-8fed-b1fa65697df9', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2020-04-24');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4cac3bee-6a3b-59ff-917a-522671f49cff', (select id from public.asset_attributes where name = 'Code'), 'K05');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('4cac3bee-6a3b-59ff-917a-522671f49cff', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310046');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('4cac3bee-6a3b-59ff-917a-522671f49cff', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-06-29');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('43599165-6d5d-5f50-a953-137e161a03a2', (select id from public.asset_attributes where name = 'Code'), 'K06');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('43599165-6d5d-5f50-a953-137e161a03a2', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310039');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('43599165-6d5d-5f50-a953-137e161a03a2', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-08-14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('49d78a71-8539-569d-99f5-abd64c66a9db', (select id from public.asset_attributes where name = 'Code'), 'K07');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('49d78a71-8539-569d-99f5-abd64c66a9db', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310031');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('49d78a71-8539-569d-99f5-abd64c66a9db', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2011-04-04');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e5f25cf2-1db7-58c2-b6de-be3b411dc7fe', (select id from public.asset_attributes where name = 'Code'), 'K08');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('e5f25cf2-1db7-58c2-b6de-be3b411dc7fe', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310033');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('e5f25cf2-1db7-58c2-b6de-be3b411dc7fe', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2012-06-06');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('26685246-6de3-5697-920d-2268c14934c5', (select id from public.asset_attributes where name = 'Code'), 'K09');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('26685246-6de3-5697-920d-2268c14934c5', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310038');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('26685246-6de3-5697-920d-2268c14934c5', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2013-05-28');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('375feb42-d56f-5fe7-9b48-617774028dfa', (select id from public.asset_attributes where name = 'Code'), 'K10');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('375feb42-d56f-5fe7-9b48-617774028dfa', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310042');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('375feb42-d56f-5fe7-9b48-617774028dfa', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2014-07-17');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c140dfa8-9458-56cd-8fe0-e4e97f53fe24', (select id from public.asset_attributes where name = 'Code'), 'K12');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c140dfa8-9458-56cd-8fe0-e4e97f53fe24', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310046');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('c140dfa8-9458-56cd-8fe0-e4e97f53fe24', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2015-06-29');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a0fa33d1-6ac0-53fc-bd33-b4e3250e4398', (select id from public.asset_attributes where name = 'Code'), 'K13');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('a0fa33d1-6ac0-53fc-bd33-b4e3250e4398', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310086');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('a0fa33d1-6ac0-53fc-bd33-b4e3250e4398', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-10-13');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('14438518-369c-5e6c-8e4c-a2a07fe83273', (select id from public.asset_attributes where name = 'Code'), 'K14');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('14438518-369c-5e6c-8e4c-a2a07fe83273', (select id from public.asset_attributes where name = 'Anlagennummer Buchhaltung'), '310087');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_date) values ('14438518-369c-5e6c-8e4c-a2a07fe83273', (select id from public.asset_attributes where name = 'Anschaffungsdatum'), '2021-10-13');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text) values ('c159f86f-a2a3-5182-9bc2-b0efa3e2babb', (select id from public.asset_attributes where name = 'Code'), 'PV-01');
insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number) values ('c159f86f-a2a3-5182-9bc2-b0efa3e2babb', (select id from public.asset_attributes where name = 'Baujahr'), '2023');

update public.asset_types set name_de = 'Kategorie' where name = 'Category';
update public.asset_types set name_de = 'Anlage' where name = 'Equipment';
update public.asset_types set name_de = 'Standort' where name = 'Site';
-- ============================== COMPASS seed 02_demo_access_and_work.sql (without the task block) ==============================
-- Demo access assignments, tickets and tasks on top of the generated Glückstadt asset tree
-- (01_glueckstadt_assets.sql). People are fictional (see 00). Plus a tiny second site, "Werk Süd
-- (Demo)", to show that tree grants separate sites from each other.

do $$
declare
  v_site uuid;
begin
  insert into public.assets (name, asset_type_id, location)
  values ('Werk Süd (Demo)', (select id from public.asset_types where name = 'Site'), 'München')
  returning id into v_site;
  insert into public.assets (parent_asset_id, name, asset_type_id, manufacturer, serial_number, responsible_user_id)
  values (v_site, 'Kompressor K2 (Demo)', (select id from public.asset_types where name = 'Equipment'),
          'Kaeser', 'KA-9921', (select id from public.users where email = 'paul.meier@example.com'));
end $$;

create temporary table seed_assets as
select name, id from public.assets;

-- Who is responsible where: the team of a node covers the node and everything below it (assets.team_id). What the
-- members may do there comes from their own roles (`assigned_assets` literals).
insert into public.team_uses (team_id, use) select id, 'assets' from public.teams where name = 'Werkstatt' on conflict do nothing;
update public.assets set team_id = (select id from public.teams where name = 'Werkstatt')
where id in (select id from seed_assets where name in ('Werk Glückstadt', 'Werk Süd (Demo)'));

-- Tickets
insert into public.tickets (asset_id, type, status, priority, title, description, source, reporter_user_id, reporter_name)
select (select id from seed_assets where name = t.asset_name), t.type, 'open', t.priority, t.title, t.description,
       t.source, (select id from public.users where email = t.reporter_email), t.reporter_name
from (values
  ('Schraubenkompressor Kaeser ASD 60', 'incident', 'high', 'Kompressor überhitzt', 'Nach ca. 2 Stunden Laufzeit steigt die Temperatur über 95 °C, dann Abschaltung.', 'qr_public', null, 'Schicht B'),
  ('Perlmühle 1', 'request', 'normal', 'Neue Schutzabdeckung gewünscht', 'Die Abdeckung an der Bedienseite ist verkratzt und schlecht einsehbar.', 'internal', 'ben.keller@example.com', null),
  ('Schnelllauftor Schleuse', 'inspection_finding', 'normal', 'Lichtschranke am Tor defekt', 'Bei der Jahresprüfung festgestellt.', 'internal', 'anna.weber@example.com', null),
  (null, 'request', 'low', 'Ersatz-Handschuhe im Lager nachbestellen', null, 'internal', 'ben.keller@example.com', null)
) as t(asset_name, type, priority, title, description, source, reporter_email, reporter_name);

-- (tasks: 10_task_family.sql; their assets:)
update public.tasks set asset_id = (select id from seed_assets where name = 'Schraubenkompressor Kaeser ASD 60') where title = 'Ölwechsel Schraubenkompressor';
update public.tasks set asset_id = (select id from seed_assets where name = 'Perlmühle 2') where title = 'Antriebsriemen Perlmühle 2 prüfen';
update public.tasks set asset_id = (select id from seed_assets where name = 'Kreis-Dissolver Niemann KDV 242-30 Nr 12.4173') where title = 'Lager Dissolver schmieren';
update public.tasks set asset_id = (select id from seed_assets where name = 'Gaswarnanalage Halle 200') where title = 'Gaswarnanlage Funktionstest';
update public.tasks set asset_id = (select id from seed_assets where name = 'Absaugung Wasserproduktion 2014') where title = 'Filtermatten Absaugung tauschen';
update public.tasks set asset_id = (select id from seed_assets where name = 'Heizungsanlage') where title = 'Beleuchtung Heizungsraum prüfen';
update public.tasks set asset_id = (select id from seed_assets where name = 'Schraubenkompressor Kaeser ASD 60') where title = 'Ersatzmotor Schraubenkompressor bestellen';
delete from public.activity_events where entity_type = 'tasks' and event_type = 'task_asset_changed' and entity_id in (select id from public.tasks where title in ('Ölwechsel Schraubenkompressor', 'Antriebsriemen Perlmühle 2 prüfen', 'Lager Dissolver schmieren', 'Gaswarnanlage Funktionstest', 'Filtermatten Absaugung tauschen', 'Beleuchtung Heizungsraum prüfen', 'Ersatzmotor Schraubenkompressor bestellen'));

-- Convert the gate finding into a task, as a workshop user would from the ticket page.
do $$
declare
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
begin
  if v_anna is null then return; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_anna, 'role', 'authenticated')::text, true);
  perform public.ticket_convert_to_task(
    (select id from public.tickets where title like 'Lichtschranke%'),
    (select id from public.task_types where key = 'general'),
    current_date + 7);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A comment with a mention
insert into public.conversations (id, kind, anchor_type, anchor_id, team_id)
select '00000000-0000-4000-8000-00000000c0a1', 'record', 'tickets', t.id, t.assigned_team_id from public.tickets t where t.title like 'Kompressor%';
insert into public.messages (conversation_id, body, author_user_id)
select '00000000-0000-4000-8000-00000000c0a1', 'Ich schaue mir das morgen früh an. @[user:' || tom.id || '] bitte Ersatzmotor einplanen.', anna.id
from public.users anna, public.users tom
where anna.email = 'anna.weber@example.com' and tom.email = 'tom.berger@example.com';

drop table seed_assets;

-- ============================== COMPASS seed 09_demo_it_queue.sql ==============================
-- Demo for the IT service desk queue (migration 20261011100000_ticket_queues.sql): an IT team with one agent
-- (login jonas.richter@example.com, TestPass123!) and a few IT tickets from the fictional shop floor people.
-- Local only: the login is created here, the cloud reseed skips this file.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  'jonas.richter@example.com', crypt('TestPass123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', 'Jonas Richter'), now(), now(),
  '', '', '', '', '', '', '', ''
where not exists (select 1 from auth.users x where x.email = 'jonas.richter@example.com');

insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email), now(), now(), now()
from auth.users u
where u.email = 'jonas.richter@example.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

insert into public.users (id, email, name)
select u.id, u.email, u.raw_user_meta_data ->> 'name' from auth.users u
where u.email = 'jonas.richter@example.com'
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u, public.roles r
where u.email = 'jonas.richter@example.com' and r.name = 'IT agent'
on conflict do nothing;

insert into public.user_teams (user_id, team_id)
select u.id, g.id from public.users u, public.teams g
where u.email = 'jonas.richter@example.com' and g.name = 'IT';
update public.ticket_queues set default_team_id = (select id from public.teams where name = 'IT')
where key = 'it';
-- The IT team works the IT queue (the migration did this from the default team, but the seed creates both later).
insert into public.ticket_queue_teams (queue_id, team_id)
select q.id, q.default_team_id from public.ticket_queues q where q.key = 'it';

-- Maintenance is closed to the IT agent: its team is a hidden team (no picker, no planning row) with the people who
-- work maintenance tickets through their role.
insert into public.teams (name) values ('Instandhaltung');  -- no team uses (COMPASS: all usable_for_* false)
insert into public.user_teams (user_id, team_id)
select u.id, g.id from public.users u, public.teams g
where g.name = 'Instandhaltung'
  and u.email in ('tom.berger@example.com', 'anna.weber@example.com', 'sara.novak@example.com', 'paul.meier@example.com', 'ben.keller@example.com');
insert into public.ticket_queue_teams (queue_id, team_id)
select q.id, g.id from public.ticket_queues q, public.teams g where q.key = 'maintenance' and g.name = 'Instandhaltung';

insert into public.tickets (queue_id, type, status, priority, title, description, reporter_user_id)
select (select id from public.ticket_queues where key = 'it'), t.type, t.status, t.priority, t.title, t.description,
       (select id from public.users where email = t.reporter_email)
from (values
  ('incident', 'open', 'high', 'Drucker im Büro Versand druckt nicht', 'Seit heute Morgen kommt nur "Offline" im Druckerfenster.', 'lena.fischer@example.com'),
  ('request', 'in_progress', 'normal', 'Zugang zum Laufwerk Instandhaltung', 'Ich brauche Lesezugriff auf die Prüfprotokolle.', 'ben.keller@example.com'),
  ('request', 'waiting_for_requester', 'low', 'Neuer Monitor für Arbeitsplatz Werkstatt', 'Bitte Größe und Anschluss angeben.', 'anna.weber@example.com'),
  ('change', 'open', 'normal', 'WLAN in Halle 3 erweitern', null, 'tom.berger@example.com')
) as t(type, status, priority, title, description, reporter_email);

-- ============================== COMPASS seed 10_demo_people.sql ==============================
-- Local demo data for the People module (~/maintenance_tool/docs/people.md): contact data, hire dates, birthdays and a few people
-- without a login (shop floor). Local only: it refers to the fictional logins of 00_reference_and_access.sql.

update public.users u
set phone_office = d.office, phone_mobile = d.mobile, hire_date = d.hired, site = d.site, position = coalesce(u.position, d.job)
from (values
  ('max.wilckens@wilckens.com', '+49 4124 6000-10', '+49 171 5550100', date '2008-04-01', 'Glückstadt', 'Managing director'),
  ('tom.berger@example.com',   '+49 4124 6000-21', '+49 171 5550121', date '2014-09-01', 'Glückstadt', 'Head of maintenance'),
  ('anna.weber@example.com',   '+49 4124 6000-32', '+49 171 5550132', date '2018-02-15', 'Glückstadt', 'Mechanic'),
  ('sara.novak@example.com',   '+49 4124 6000-33', null,              date '2020-07-01', 'Glückstadt', 'Mechatronics technician'),
  ('lena.fischer@example.com', '+49 4124 6000-45', '+49 171 5550145', date '2016-11-01', 'Glückstadt', 'Purchasing'),
  ('ben.keller@example.com',   '+49 4124 6000-51', null,              date '2021-03-01', 'Glückstadt', 'Production operator'),
  ('paul.meier@example.com',   '+49 4141 700-12',  '+49 171 5550112', date '2017-05-01', 'Werk Süd',   'Mechanic'),
  ('hanna.richter@example.com','+49 4124 6000-60', '+49 171 5550160', date '2012-01-02', 'Glückstadt', 'HR manager')
) as d(email, office, mobile, hired, site, job)
where u.email = d.email;

-- Birthdays (the year stays with HR).
insert into public.person_private (user_id, birth_date)
select u.id, b.birth_date
from (values
  ('max.wilckens@wilckens.com', date '1975-10-14'),
  ('tom.berger@example.com',    date '1981-10-27'),
  ('anna.weber@example.com',    date '1990-03-12'),
  ('sara.novak@example.com',    date '1994-11-05'),
  ('lena.fischer@example.com',  date '1988-10-19'),
  ('ben.keller@example.com',    date '1999-07-30'),
  ('hanna.richter@example.com', date '1984-12-02')
) as b(email, birth_date)
join public.users u on u.email = b.email
on conflict (user_id) do update set birth_date = excluded.birth_date;

-- HR reports to the managing director.
update public.users set supervisor_user_id = (select id from public.users where email = 'max.wilckens@wilckens.com')
where email = 'hanna.richter@example.com';

-- People without a login: shop floor staff, found in the directory, the org chart and the teams.
insert into public.users (name, position, phone_mobile, hire_date, site, supervisor_user_id)
select p.name, p.job, p.mobile, p.hired, p.site, (select id from public.users where email = p.supervisor_email)
from (values
  ('Jan Hoffmann',  'Production operator', '+49 171 5550201', date '2019-08-01', 'Glückstadt', 'tom.berger@example.com'),
  ('Mira Lang',     'Production operator', null,              date '2022-01-10', 'Glückstadt', 'tom.berger@example.com'),
  ('Karl Brandt',   'Warehouse',           '+49 171 5550203', date '2015-06-01', 'Glückstadt', 'tom.berger@example.com'),
  ('Elif Demir',    'Mechanic',            '+49 171 5550204', date '2023-04-01', 'Werk Süd',   'paul.meier@example.com')
) as p(name, job, mobile, hired, site, supervisor_email)
where not exists (select 1 from public.users x where x.name = p.name);

insert into public.user_teams (user_id, team_id)
select u.id, g.id
from (values ('Elif Demir', 'Werkstatt'), ('Jan Hoffmann', 'Produktion'), ('Mira Lang', 'Abfüllung')) as m(name, team_name)
join public.users u on u.name = m.name
join public.teams g on g.name = m.team_name
on conflict do nothing;

-- ============================== COMPASS seed 11_demo_trainings.sql ==============================
-- Local demo data for trainings (~/maintenance_tool/docs/people.md): a small catalogue and records in every status. Local only.
-- Dates are relative to today so the seed always shows valid, due soon and expired entries.

insert into public.phrases (category, code, text_en, translations, sequence) values
  ('training_category', 'safety', 'Safety', jsonb_build_object('de', 'Sicherheit'), 1),
  ('training_category', 'vehicles', 'Vehicles', jsonb_build_object('de', 'Fahrzeuge'), 2),
  ('training_category', 'technical', 'Technical', jsonb_build_object('de', 'Technik'), 3);

insert into public.training_types (name, category_phrase_id, description, provider, validity_months, reminder_days_before, requires_certificate, sort_order)
select v.name, (select id from public.phrases where category = 'training_category' and text_en = v.category), v.description, v.provider, v.validity_months, v.reminder_days_before, v.requires_certificate, v.sort_order
from (values
  ('Fire safety instruction',          'Safety',  'Annual instruction in fire prevention and evacuation.',           'Internal (safety officer)', 12, 60, false, 1),
  ('First aid',                        'Safety',  'First aid course for first aiders.',                              'Red Cross',                 24, 90, true,  2),
  ('Hazardous substances instruction', 'Safety',  'Annual instruction for people who handle hazardous substances.',  'Internal (safety officer)', 12, 60, false, 3),
  ('Forklift licence',                 'Vehicles','Authorisation to operate industrial trucks.',                     'External',                  12, 60, true,  4),
  ('Electrical safety',                'Technical','Electrically instructed person.',                                'External',                  36, 120, true, 5),
  ('Machine safety induction',         'Technical','One-off induction when starting at a machine.',                  'Internal',                  null::integer, 0, false, 6)
) as v(name, category, description, provider, validity_months, reminder_days_before, requires_certificate, sort_order)
on conflict (name) do nothing;
update public.training_types set retention_years_after_exit = 40 where name = 'Electrical safety';

-- Tom leads all teams (the team scope of his training rights).
insert into public.user_teams (user_id, team_id)
select u.id, g.id from public.users u cross join public.teams g where u.email = 'tom.berger@example.com'
on conflict do nothing;

insert into public.training_records (user_id, training_type_id, completed_on, trainer)
select u.id, tt.id, current_date - r.days_ago, r.trainer
from (values
  ('anna.weber@example.com',  'Fire safety instruction',          100, 'K. Brandt'),
  ('anna.weber@example.com',  'First aid',                        400, 'Red Cross Glückstadt'),
  ('anna.weber@example.com',  'Hazardous substances instruction', 340, 'K. Brandt'),
  ('anna.weber@example.com',  'Machine safety induction',         900, 'T. Berger'),
  ('sara.novak@example.com',  'Fire safety instruction',          400, 'K. Brandt'),
  ('sara.novak@example.com',  'Electrical safety',                300, 'TÜV Nord'),
  ('sara.novak@example.com',  'Hazardous substances instruction', 30,  'K. Brandt'),
  ('paul.meier@example.com',  'Fire safety instruction',          330, 'K. Brandt'),
  ('paul.meier@example.com',  'Forklift licence',                 200, 'Staplerschule Nord'),
  ('ben.keller@example.com',  'Fire safety instruction',          20,  'K. Brandt'),
  ('ben.keller@example.com',  'Hazardous substances instruction', 380, 'K. Brandt'),
  ('ben.keller@example.com',  'Forklift licence',                 360, 'Staplerschule Nord'),
  ('tom.berger@example.com',  'Fire safety instruction',          200, 'K. Brandt'),
  ('tom.berger@example.com',  'First aid',                        100, 'Red Cross Glückstadt')
) as r(email, type_name, days_ago, trainer)
join public.users u on u.email = r.email
join public.training_types tt on tt.name = r.type_name;

insert into public.training_records (user_id, training_type_id, completed_on, trainer)
select u.id, tt.id, current_date - r.days_ago, 'K. Brandt'
from (values
  ('Jan Hoffmann', 'Fire safety instruction', 150),
  ('Jan Hoffmann', 'Hazardous substances instruction', 90),
  ('Mira Lang',    'Fire safety instruction', 380),
  ('Karl Brandt',  'Forklift licence', 120),
  ('Karl Brandt',  'Hazardous substances instruction', 45)
) as r(name, type_name, days_ago)
join public.users u on u.name = r.name
join public.training_types tt on tt.name = r.type_name;

-- Mandatory trainings per team and per role (stage 3).
insert into public.training_requirements (training_type_id, team_id)
select tt.id, g.id
from (values
  ('Fire safety instruction', 'Werkstatt'),
  ('First aid', 'Werkstatt'),
  ('Electrical safety', 'Werkstatt')
) as r(type_name, team_name)
join public.training_types tt on tt.name = r.type_name
join public.teams g on g.name = r.team_name
on conflict do nothing;

insert into public.training_requirements (training_type_id, role_id)
select tt.id, ro.id
from (values
  ('Fire safety instruction', 'Shopfloor'),
  ('Hazardous substances instruction', 'Workshop'), ('Hazardous substances instruction', 'Shopfloor'),
  ('Machine safety induction', 'Workshop')
) as r(type_name, role_name)
join public.training_types tt on tt.name = r.type_name
join public.roles ro on ro.name = r.role_name
on conflict do nothing;

-- The production operators have no login but are covered by the Shopfloor role.
insert into public.user_roles (user_id, role_id)
select u.id, ro.id from public.users u join public.roles ro on ro.name = 'Shopfloor' where u.name in ('Jan Hoffmann', 'Mira Lang', 'Karl Brandt')
on conflict do nothing;

insert into public.training_exemptions (user_id, training_type_id, reason)
select u.id, tt.id, 'Works in the office, no machine contact'
from public.users u, public.training_types tt
where u.email = 'paul.meier@example.com' and tt.name = 'Machine safety induction'
on conflict do nothing;

-- Records for the remaining demo users (office, IT, HR, admin and the Werk Süd newcomer), so every login has a populated Trainings card.
insert into public.training_records (user_id, training_type_id, completed_on, trainer)
select u.id, tt.id, current_date - r.days_ago, r.trainer
from (values
  ('lena.fischer@example.com',    'Fire safety instruction',          60,  'K. Brandt'),
  ('lena.fischer@example.com',    'First aid',                        650, 'Red Cross Glückstadt'),
  ('jonas.richter@example.com',   'Fire safety instruction',          390, 'K. Brandt'),
  ('jonas.richter@example.com',   'Electrical safety',                500, 'TÜV Nord'),
  ('hanna.richter@example.com',   'Fire safety instruction',          10,  'K. Brandt'),
  ('hanna.richter@example.com',   'First aid',                        15,  'Red Cross Glückstadt'),
  ('max.wilckens@wilckens.com',   'Fire safety instruction',          300, 'K. Brandt'),
  ('max.wilckens@wilckens.com',   'Hazardous substances instruction', 120, 'K. Brandt'),
  ('max.wilckens@wilckens.com',   'Machine safety induction',         700, 'T. Berger')
) as r(email, type_name, days_ago, trainer)
join public.users u on u.email = r.email
join public.training_types tt on tt.name = r.type_name;

insert into public.training_records (user_id, training_type_id, completed_on, trainer)
select u.id, tt.id, current_date - 25, 'K. Brandt'
from public.users u, public.training_types tt
where u.name = 'Elif Demir' and tt.name = 'Fire safety instruction';

-- ============================== COMPASS seed 12_demo_positions.sql ==============================
-- Demo positions with job descriptions (local only, like seeds 10 and 11).
-- Six positions follow the open job ads on https://www.wilckens.com/de/karriere/offene-stellen (tasks and profile as
-- advertised; offers and application details left out). The seventh, "Instandhalter", is an invented example for the
-- assignment through teams. States shown: published, published + waiting for approval, draft only, vacant. Two
-- appointments (Ersthelfer, Brandschutzhelfer) show periods, one ended.
-- Each version's requirements become list entries (one per <li>). The versions are created while the guard of job_description_versions is switched off for this session.

select set_config('app.job_description_rpc', 'on', false);

-- The requirements of a version are a list of phrases: one entry per <li> of the advertised profile.
create function pg_temp.seed_requirements(p_version uuid, p_html text) returns void language plpgsql as $f$
declare
  m text[];
  v_text text;
  v_phrase uuid;
  v_order integer := 0;
begin
  for m in select regexp_matches(p_html, '<li>(.*?)</li>', 'g') loop
    v_text := btrim(regexp_replace(m[1], '\s+', ' ', 'g'));
    continue when v_text = '' or length(v_text) > 300;
    select id into v_phrase from public.requirement_phrases where lower(text) = lower(v_text);
    if v_phrase is null then
      insert into public.requirement_phrases (text) values (v_text) returning id into v_phrase;
    end if;
    v_order := v_order + 1;
    insert into public.job_description_requirements (version_id, phrase_id, sort_order) values (p_version, v_phrase, v_order) on conflict do nothing;
  end loop;
end $f$;


do $$
declare
  v_hr uuid := (select id from public.users where email = 'hanna.richter@example.com');
  v_mgr uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_pos uuid;
  v_tt uuid;
  v_ver uuid;
begin
  -- 1. Lohnbuchhalter / Fachkraft für Personalwesen: published, held directly by HR
  insert into public.positions (name, code, site) values ('Lohnbuchhalter / Fachkraft für Personalwesen (w/m/d)', 'HR-LOHN', 'Glückstadt') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, approved_by_user_id, approved_at, created_by_user_id)
  values (v_pos,
    1,
    'published',
    '2026-04-01',
    $h$<p>Verantwortet die Lohn- und Gehaltsabrechnung am Hauptsitz und unterstützt die Personalabteilung in Personalfragen.</p>$h$,
    $h$<ul><li>Verantwortung für die Lohnbuchhaltung am Hauptsitz in Glückstadt</li><li>Monatliche Erfassung von Änderungen bei Gehältern, Sozialabgaben, Zuschüssen, vermögenswirksamen Leistungen und Sachbezügen in Datev Lodas</li><li>Erstellung der monatlichen Lohn- und Gehaltsabrechnung und Abstimmung der Auszahlung mit der Buchhaltung</li><li>Beratung der Beschäftigten, z. B. zu Gehaltsabrechnung, Elternzeit und Entgeltfortzahlung</li><li>Unterstützung in Personalfragen wie Vertragsgestaltung, Arbeitszeitgestaltung, betriebsärztlicher Vorsorge und Schulungswesen</li><li>Bescheinigungs- und Meldewesen</li><li>Ideen und Erfahrungen zur Verbesserung des Personalwesens einbringen</li></ul>$h$,
    '',
    $h$<p>Vollzeit oder Teilzeit, Arbeitsplatz am Hauptsitz in Glückstadt.</p>$h$,
    'Erste Fassung aus der Ausschreibung',
    v_hr,
    now(),
    v_hr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Abgeschlossene kaufmännische Ausbildung</li><li>Kenntnisse im Steuer- und Sozialversicherungsrecht</li><li>Erfahrung in der Lohn- und Gehaltsabrechnung, bestenfalls fundierte Kenntnisse in Datev Lodas</li><li>Sicherer Umgang mit Microsoft Word und Excel</li><li>Selbstständig, verschwiegen und verantwortungsbewusst</li><li>Kommunikationsstärke im Kontakt mit den Beschäftigten</li></ul>$h$);
  insert into public.position_holders (position_id, user_id) values (v_pos, v_hr);

  -- 2. Controller: published, vacant
  insert into public.positions (name, code, site) values ('Controller (w/m/d)', 'FIN-CTRL', 'Glückstadt') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, approved_by_user_id, approved_at, created_by_user_id)
  values (v_pos,
    1,
    'published',
    '2026-04-01',
    $h$<p>Verstärkt den Finanzbereich mit unternehmerischem Denken und analytischem Verständnis: Berichtswesen, Planung und Kalkulation.</p>$h$,
    $h$<ul><li>Regelmäßige Berichte, Ad-hoc-Analysen und Sonderauswertungen</li><li>Weiterentwicklung des Reportings und des Management-Informationssystems</li><li>Steuerung des jährlichen Budgetprozesses</li><li>Aufbereitung finanzieller Daten für internationale Monatsreviews</li><li>Optimierung der Reportingprozesse und Sicherstellung der Datenqualität</li><li>Operative Unternehmensplanung (Absatz, Umsatz, Kosten, Investitionen, Ergebnis)</li><li>Weiterentwicklung der Kosten- und Profitcenterrechnung mit der Buchhaltung</li><li>Verantwortung für systemgestützte Kalkulationen</li><li>Finanzielle Bewertung von Kunden- und Produktportfolios, Business Cases</li><li>Unterstützung der Finanzbuchhaltung bei Bedarf</li><li>Mitarbeit an Projekten, z. B. Einführung oder Aktualisierung von IT-Systemen</li></ul>$h$,
    '',
    $h$<p>Vollzeit (40 Wochenstunden) am Standort Glückstadt.</p>$h$,
    'Erste Fassung aus der Ausschreibung',
    v_hr,
    now(),
    v_hr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Abgeschlossenes Studium der Betriebswirtschaft oder vergleichbare Qualifikation</li><li>Berufserfahrung im Controlling und Kenntnisse in der Buchhaltung</li><li>Hohe IT-Affinität, sicherer Umgang mit ERP-/Buchhaltungssystemen und Microsoft Office, insbesondere Excel</li><li>Unternehmerische Denkweise, Zahlen verständlich kommunizieren</li><li>Sehr gute Englischkenntnisse in Wort und Schrift</li><li>Strukturierte, selbstständige Arbeitsweise, Teamfähigkeit</li></ul>$h$);

  -- 3. Junior-Entwickler für allgemeine Industrielacke: published, vacant, hazardous substances instruction required
  insert into public.positions (name, code) values ('Junior-Entwickler für allgemeine Industrielacke (w/m/d)', 'LAB-ENTW') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, approved_by_user_id, approved_at, created_by_user_id)
  values (v_pos,
    1,
    'published',
    '2026-04-01',
    $h$<p>Verstärkt das Labor bei der Entwicklung und Pflege von Industrielacksystemen.</p>$h$,
    $h$<ul><li>Entwicklung neuer, marktgerechter Industrielacke</li><li>Unterstützung der Markteinführung neu entwickelter Produkte</li><li>Analyse und Weiterentwicklung bestehender Produkte</li><li>Analyse von Rohstoffen und Fertigprodukten</li><li>Überprüfung von Spezifikationen und Einstufung nach Gefahrstoff- und Gefahrgutverordnung</li><li>Applikationstechnische Arbeiten unter Prozessbedingungen</li><li>Enge Zusammenarbeit mit Produktmanagement und Anwendungstechnik</li><li>Allgemeine Labortätigkeiten wie Prüfungen und Dokumentation</li></ul>$h$,
    '',
    '',
    'Erste Fassung aus der Ausschreibung',
    v_hr,
    now(),
    v_hr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Abgeschlossene Ausbildung als Lacklaborant/Chemielaborant, Lacktechniker oder ähnlich</li><li>Idealerweise erste Praxiserfahrung in der Entwicklung allgemeiner Industrie- und Korrosionsschutzsysteme</li><li>Abteilungsübergreifendes Verständnis für Entwicklung, Produktion, Qualitätssicherung, Vertrieb und Anwendungstechnik</li><li>Lösungs- und kundenorientiert, ambitioniert, zuverlässig, selbstständig und teamfähig</li></ul>$h$);
  select id into v_tt from public.training_types where name = 'Hazardous substances instruction';
  if v_tt is not null then insert into public.training_requirements (training_type_id, position_id) values (v_tt, v_pos); end if;

  -- 4. Anwendungstechniker DIY / Malerfarben: published, a revision waits for approval
  insert into public.positions (name, code) values ('Anwendungstechniker DIY / Malerfarben (w/m/d)', 'AT-DIY') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, approved_by_user_id, approved_at, created_by_user_id)
  values (v_pos,
    1,
    'published',
    '2026-04-01',
    $h$<p>Unterstützt Vertrieb und Qualitätsmanagement mit anwendungstechnischem Wissen im Bereich DIY und Malerfarben.</p>$h$,
    $h$<ul><li>Planung und Durchführung von Versuchen im Anwendungsbereich DIY/Malerfarben</li><li>Auswertung und Präsentation von Versuchsergebnissen</li><li>Unterstützung des Vertriebsteams in anwendungstechnischen Fragen</li><li>Erstellung von Verkaufsunterlagen wie Präsentationen, technischen Berichten und Produktinformationen</li><li>Anwendungstechnische Unterstützung bei der Bearbeitung von Reklamationen</li><li>Teilnahme an Fach- und Hausmessen</li><li>Durchführung interner und externer Kundenschulungen</li></ul>$h$,
    '',
    $h$<p>Bereitschaft zu Dienstreisen.</p>$h$,
    'Erste Fassung aus der Ausschreibung',
    v_hr,
    now(),
    v_hr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Abgeschlossene Berufsausbildung zum Maler oder Lackierer</li><li>Mehrjährige Erfahrung im Malerhandwerk</li><li>Technisches Verständnis und sicheres Farbempfinden</li><li>Zuverlässig, selbstständig, team- und kommunikationsfähig, flexibel</li><li>Sehr gute Deutschkenntnisse, vorteilhaft Englischkenntnisse</li></ul>$h$);
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, submitted_by_user_id, submitted_at, created_by_user_id)
  values (v_pos,
    2,
    'submitted',
    null,
    $h$<p>Unterstützt Vertrieb und Qualitätsmanagement mit anwendungstechnischem Wissen im Bereich DIY und Malerfarben.</p>$h$,
    $h$<ul><li>Planung und Durchführung von Versuchen im Anwendungsbereich DIY/Malerfarben</li><li>Auswertung und Präsentation von Versuchsergebnissen</li><li>Unterstützung des Vertriebsteams in anwendungstechnischen Fragen</li><li>Erstellung von Verkaufsunterlagen wie Präsentationen, technischen Berichten und Produktinformationen</li><li>Anwendungstechnische Unterstützung bei Reklamationen</li><li>Teilnahme an Fach- und Hausmessen</li><li>Durchführung interner und externer Kundenschulungen</li></ul>$h$,
    '',
    $h$<p>Bereitschaft zu Dienstreisen.</p>$h$,
    'Reklamationen stärker betont, Profil gekürzt',
    v_mgr,
    now() - interval '1 day',
    v_mgr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Abgeschlossene Berufsausbildung zum Maler oder Lackierer</li><li>Mehrjährige Erfahrung im Malerhandwerk</li><li>Technisches Verständnis und sicheres Farbempfinden</li><li>Sehr gute Deutschkenntnisse, vorteilhaft Englischkenntnisse</li></ul>$h$);

  -- 5. Junior Vertriebsmitarbeiter Außendienst: draft only
  insert into public.positions (name, code, site) values ('Junior Vertriebsmitarbeiter Außendienst (m/w/d)', 'VT-JUNIOR', 'Deutschlandweit') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, purpose, duties, authority, working_conditions, change_note, created_by_user_id)
  values (v_pos,
    1,
    'draft',
    $h$<p>Technischer Vertrieb von Beschichtungssystemen im Außendienst; Einstieg für Praktiker aus der Beschichtungsbranche mit Entwicklungsperspektive zum Technischen Vertriebsberater oder Key Account Manager.</p>$h$,
    $h$<ul><li>Aufbau und Betreuung von Kunden im zugeordneten Vertriebssegment</li><li>Technische Beratung zu Beschichtungssystemen und anwendungsbezogenen Lösungen</li><li>Bedarfsermittlung direkt vor Ort bei Kunden</li><li>Unterstützung bei Ausschreibungen, Kalkulationen und Projektplanung</li><li>Enge Zusammenarbeit mit Anwendungstechnik, Innendienst und Entwicklung</li><li>Strukturierte Angebotsnachverfolgung</li></ul>$h$,
    '',
    $h$<p>Vollzeit, deutschlandweit im Außendienst; Firmenwagen zur Privatnutzung; Homeoffice-Anteil möglich.</p>$h$,
    null,
    v_mgr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Erfahrung aus der Beschichtungsbranche (z. B. Applikation, Einkauf, Projektabwicklung)</li><li>Technisches Verständnis und Leidenschaft für Oberflächen- und Korrosionsschutz</li><li>Expertise in ein bis zwei Marktsegmenten von Vorteil</li><li>Freude am direkten Kundenkontakt und Interesse am Vertrieb</li><li>Selbstständige Arbeitsweise und Organisationstalent</li><li>Führerschein Klasse B</li></ul>$h$);

  -- 6. Reinigungskraft auf Minijob-Basis: published, vacant, fire safety instruction required
  insert into public.positions (name, code) values ('Reinigungskraft auf Minijob-Basis (w/m/d)', 'VW-REIN') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, approved_by_user_id, approved_at, created_by_user_id)
  values (v_pos,
    1,
    'published',
    '2026-04-01',
    $h$<p>Hält die Verwaltungsräume sauber.</p>$h$,
    $h$<ul><li>Reinigung der Verwaltung (Büroräume, Konferenzräume, Flure, Sanitäranlagen, Pausenraum)</li><li>Müllentsorgung</li><li>Fachgerechter Umgang mit Reinigungs- und Arbeitsmitteln</li></ul>$h$,
    '',
    $h$<p>Minijob, in den Nachmittagsstunden.</p>$h$,
    'Erste Fassung aus der Ausschreibung',
    v_hr,
    now(),
    v_hr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Selbstständige Arbeitsweise</li><li>Zuverlässigkeit, Flexibilität und Gründlichkeit</li><li>Kommunikations- und Teamfähigkeit</li></ul>$h$);
  select id into v_tt from public.training_types where name = 'Fire safety instruction';
  if v_tt is not null then insert into public.training_requirements (training_type_id, position_id) values (v_tt, v_pos); end if;

  -- 7. Instandhalter (invented example): assigned through two teams, two required trainings
  insert into public.positions (name, code, site) values ('Instandhalter Mechanik / Elektrik (m/w/d)', 'IH-MECH', 'Glückstadt') returning id into v_pos;
  insert into public.job_description_versions (position_id, version_no, status, valid_from, purpose, duties, authority, working_conditions, change_note, approved_by_user_id, approved_at, created_by_user_id)
  values (v_pos,
    1,
    'published',
    '2026-10-01',
    $h$<p>Hält die Maschinen und Anlagen des Werks betriebsbereit: Wartung, Störungsbeseitigung und Prüfungen.</p>$h$,
    $h$<ul><li>Durchführung der geplanten Wartungen und Inspektionen an Maschinen und Anlagen</li><li>Beseitigung von Störungen, Dokumentation im Ticket- und Aufgabensystem</li><li>Mitwirkung bei Stillstandsplanung und Ersatzteilbedarf</li><li>Einhaltung der Sicherheitsvorschriften bei allen Arbeiten</li></ul>$h$,
    $h$<p>Darf Maschinen zur Wartung freischalten und sperren (Lockout/Tagout); Vertretung durch Kolleginnen und Kollegen des Teams.</p>$h$,
    $h$<p>Schichtbetrieb möglich, Arbeit in Produktionsbereichen mit persönlicher Schutzausrüstung.</p>$h$,
    'Beispieltext für die Demo-Daten',
    v_hr,
    now(),
    v_hr)
  returning id into v_ver;
  perform pg_temp.seed_requirements(v_ver, $h$<ul><li>Abgeschlossene Ausbildung in einem Metall- oder Elektroberuf</li><li>Erfahrung in der Instandhaltung</li><li>Bereitschaft zu Rufbereitschaft nach Vereinbarung</li></ul>$h$);
  insert into public.position_teams (position_id, team_id) select v_pos, id from public.teams where name = 'Werkstatt';
  insert into public.training_requirements (training_type_id, position_id) select id, v_pos from public.training_types where name in ('Machine safety induction', 'First aid');
end $$;

-- Appointments (Beauftragungen): held directly, with a period and who appointed; one of them ended.
do $$
declare
  v_first_aid uuid;
  v_fire uuid;
  v_tom uuid := (select id from public.users where username = 'tom.berger');
begin
  insert into public.positions (name, code, kind) values ('Ersthelfer', 'EH', 'appointment') returning id into v_first_aid;
  insert into public.positions (name, code, kind) values ('Brandschutzhelfer', 'BSH', 'appointment') returning id into v_fire;
  insert into public.position_holders (position_id, user_id, valid_from, valid_to, appointed_by_user_id)
  select v_first_aid, u.id, date '2022-03-01', null::date, v_tom from public.users u where u.username = 'anna.weber'
  union all
  select v_fire, u.id, date '2023-05-15', date '2025-12-31', v_tom from public.users u where u.username = 'sara.novak'
  union all
  select v_fire, u.id, date '2026-01-01', null, v_tom from public.users u where u.username = 'ben.keller';
  insert into public.training_requirements (training_type_id, position_id) select id, v_first_aid from public.training_types where name = 'First aid';
  insert into public.training_requirements (training_type_id, position_id) select id, v_fire from public.training_types where name = 'Fire safety instruction';
end $$;

select set_config('app.job_description_rpc', 'off', false);

-- ============================== COMPASS seed 13_demo_items.sql ==============================
-- Local demo data for items (~/maintenance_tool/docs/items.md): suppliers, a small catalogue with prices (spare parts, consumables,
-- protective equipment, lab and hygiene articles), spare parts lists of a few machines and planned spare parts on a
-- recurring rule. Local only. Assets and rules are found by name. ERP numbers: the supplier numbers and the dummy items
-- the ERP books such purchases on (made up).

insert into public.suppliers (name, customer_number, erp_supplier_number, email, phone, website, created_by_user_id) values
  ('Hansa Wälzlager GmbH', 'K-10442', '70012', 'vertrieb@hansa-waelzlager.example', '+49 40 555 0101', 'hansa-waelzlager.example', null),
  ('Nord Antriebstechnik', 'NA-2291', '70031', 'service@nord-antrieb.example', '+49 4121 555 22', null, null),
  ('Netzsch Pumpen & Systeme', '330187', '70045', 'ersatzteile@netzsch.example', null, 'netzsch.example', null),
  ('Linde Material Handling', 'LMH-77810', '70058', null, '+49 6021 555 0', 'linde-mh.example', null),
  ('Carl Roth Laborbedarf', '448812', '70102', 'bestellung@carlroth.example', null, 'carlroth.example', null),
  ('Hygiene Partner Nord', 'HPN-1180', '70117', null, '+49 40 555 0300', null, null)
on conflict (name) do nothing;

insert into public.items (item_number, name, category_phrase_id, manufacturer, manufacturer_item_number, supplier_id, unit_phrase_id, erp_item_number, lead_time_days, is_critical, description, created_by_user_id)
select v.item_number, v.name, (select id from public.phrases where category = 'item_category' and code = v.category),
       v.manufacturer, v.mpn, (select id from public.suppliers where name = v.supplier),
       (select id from public.phrases where category = 'item_unit' and code = v.unit), v.erp, v.lead, v.critical, v.description, null
from (values
  ('ET-1001', 'Rillenkugellager 6205-2RS', 'spare_part', 'SKF', '6205-2RSH', 'Hansa Wälzlager GmbH', 'piece', '900100', 3, false, null),
  ('ET-1002', 'Rillenkugellager 6308-2Z', 'spare_part', 'FAG', '6308-2Z-C3', 'Hansa Wälzlager GmbH', 'piece', '900100', 5, false, null),
  ('ET-1010', 'Keilriemen SPZ 1250', 'spare_part', 'Optibelt', 'SPZ 1250 Lw', 'Nord Antriebstechnik', 'piece', '900100', 4, false, null),
  ('ET-1011', 'Getriebeöl CLP 220', 'consumable', 'Klüber', 'Klüberoil GEM 1-220 N', 'Nord Antriebstechnik', 'litre', '900200', 7, false, 'Für Stirnradgetriebe der Rührwerke.'),
  ('ET-2001', 'Stator NM045', 'spare_part', 'Netzsch', 'NM045BY 01L06B', 'Netzsch Pumpen & Systeme', 'piece', '900100', 42, true, 'Stator der Exzenterschneckenpumpe, Elastomer Perbunan.'),
  ('ET-2002', 'Rotor NM045 1.4571', 'spare_part', 'Netzsch', 'NM045BY 01R04', 'Netzsch Pumpen & Systeme', 'piece', '900100', 42, true, null),
  ('ET-2003', 'Gleitringdichtung NM045', 'spare_part', 'Netzsch', 'GLRD 045-35', 'Netzsch Pumpen & Systeme', 'set', '900100', 21, true, null),
  ('ET-3001', 'Hubseil Kardex 6 mm', 'spare_part', 'Kardex', 'HS-6-1950', null, 'metre', '900100', 28, true, 'Hubseil für das Automatik-Lager, Länge je Meter.'),
  ('ET-4001', 'Hydraulikfilter Stapler', 'spare_part', 'Linde', '0009831765', 'Linde Material Handling', 'piece', '900100', 10, false, null),
  ('ET-4002', 'Antriebsrad Polyurethan 230 mm', 'spare_part', 'Linde', '0039902455', 'Linde Material Handling', 'piece', '900100', 14, false, null),
  ('AR-5001', 'Schutzhandschuhe Nitril, Gr. 9', 'protective_equipment', 'Ansell', 'TouchNTuff 92-600', 'Hygiene Partner Nord', 'pack', '900300', 5, false, '100 Stück je Packung.'),
  ('AR-6001', 'Bechergläser 250 ml, Borosilikat', 'lab_supplies', 'Duran', '21 106 36', 'Carl Roth Laborbedarf', 'pack', '900400', 7, false, '10 Stück je Packung.'),
  ('AR-6002', 'pH-Pufferlösung 7,00', 'lab_supplies', 'Carl Roth', 'A517.1', 'Carl Roth Laborbedarf', 'litre', '900400', 5, false, null),
  ('AR-7001', 'Toilettenpapier 3-lagig', 'hygiene', null, null, 'Hygiene Partner Nord', 'pack', '900500', 3, false, '72 Rollen je Packung.'),
  ('AR-7002', 'Handtuchpapier Z-Falz', 'hygiene', null, null, 'Hygiene Partner Nord', 'pack', '900500', 3, false, null)
) as v (item_number, name, category, manufacturer, mpn, supplier, unit, erp, lead, critical, description)
on conflict (item_number) do nothing;

insert into public.item_prices (item_id, unit_price)
select p.id, v.price
from (values ('ET-1001', 8.40), ('ET-1002', 24.90), ('ET-1010', 12.30), ('ET-1011', 9.80), ('ET-2001', 685.00),
             ('ET-2002', 1240.00), ('ET-2003', 312.50), ('ET-3001', 18.00), ('ET-4001', 46.70), ('ET-4002', 189.00),
             ('AR-5001', 11.90), ('AR-6001', 32.50), ('AR-6002', 14.20), ('AR-7001', 38.00), ('AR-7002', 29.50)) as v (item_number, price)
join public.items p on p.item_number = v.item_number
on conflict (item_id) do nothing;

-- Spare parts lists: both Netzsch pumps, the forklifts and the Kardex store.
insert into public.asset_items (asset_id, item_id, quantity_installed, position_note)
select a.id, p.id, v.quantity, v.position_note
from (values
  ('Exzenterschneckenpumpe Netzsch 2019 (1)', 'ET-2001', 1, null),
  ('Exzenterschneckenpumpe Netzsch 2019 (1)', 'ET-2002', 1, null),
  ('Exzenterschneckenpumpe Netzsch 2019 (1)', 'ET-2003', 1, 'Antriebsseite'),
  ('Exzenterschneckenpumpe Netzsch 2019 (1)', 'ET-1002', 2, 'Lagerbock'),
  ('Exzenterschneckenpumpe Netzsch 2019 (2)', 'ET-2001', 1, null),
  ('Exzenterschneckenpumpe Netzsch 2019 (2)', 'ET-2002', 1, null),
  ('Exzenterschneckenpumpe Netzsch 2019 (2)', 'ET-2003', 1, 'Antriebsseite'),
  ('Linde E 16 PH-01 (G10)', 'ET-4001', 1, 'Hydraulikaggregat'),
  ('Linde E 16 PH-01 (G10)', 'ET-4002', 1, 'Antriebsrad vorne'),
  ('Kompressor K2 (Demo)', 'ET-1010', 3, 'Riementrieb Motor'),
  ('Kompressor K2 (Demo)', 'ET-1001', 2, 'Lüfter')
) as v (asset_name, item_number, quantity, position_note)
join public.assets a on a.name = v.asset_name
join public.items p on p.item_number = v.item_number
on conflict do nothing;

-- Maintenance and inspection offer spare parts and consumables only.
insert into public.task_type_item_categories (task_type_id, category_phrase_id)
select tt.id, ph.id
from public.task_types tt
join public.phrases ph on ph.category = 'item_category' and ph.code in ('spare_part', 'consumable')
where tt.key in ('maintenance', 'inspection')
on conflict do nothing;

-- The rope renewal of the Kardex store plans the rope (lead time 28 days: the reminder comes early enough).
insert into public.recurring_task_rule_items (recurring_task_rule_id, item_id, quantity)
select r.id, p.id, 40
from public.recurring_task_rules r join public.items p on p.item_number = 'ET-3001'
where r.name = 'Kardex Automatik-Lager Erneuerung Hubseil'
on conflict do nothing;

-- Stock keeping (~/maintenance_tool/docs/items.md stage 4): only the big pump parts are kept in stock, in a store with two shelves.
insert into public.stock_locations (name, code, team_id) values
  ('Ersatzteillager Werkstatt', 'L-WS', (select id from public.teams where name = 'Werkstatt'));
insert into public.stock_locations (name, code, parent_id) values
  ('Regal A (Pumpen)', 'L-WS-A', (select id from public.stock_locations where code = 'L-WS')),
  ('Regal B (Dichtungen)', 'L-WS-B', (select id from public.stock_locations where code = 'L-WS'));

update public.items set stock_managed = true, minimum_stock = v.minimum, reorder_quantity = v.reorder,
       default_stock_location_id = (select id from public.stock_locations where code = v.location)
from (values ('ET-2001', 1, 1, 'L-WS-A'), ('ET-2002', 1, 1, 'L-WS-A'), ('ET-2003', 2, 2, 'L-WS-B')) as v (item_number, minimum, reorder, location)
where items.item_number = v.item_number;

insert into public.stock_movements (item_id, stock_location_id, quantity, kind, note)
select p.id, l.id, v.quantity, 'opening', 'Anfangsbestand (Demo)'
from (values ('ET-2001', 'L-WS-A', 1), ('ET-2002', 'L-WS-A', 1), ('ET-2003', 'L-WS-B', 1)) as v (item_number, location, quantity)
join public.items p on p.item_number = v.item_number
join public.stock_locations l on l.code = v.location;

-- ============================== COMPASS seed 17_demo_operating_instructions.sql ==============================
-- Demo operating instructions, local only (~/maintenance_tool/docs/operating-instructions.md): Max gets the role Occupational safety, one
-- published instruction per kind (the substance one with an English translation and an open draft of version 2).
-- Written past the RPCs (the seed has no signed-in user), so the lifecycle flag is set for the transaction.
select set_config('app.operating_instruction_rpc', 'on', true);

insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u, public.roles r where u.username = 'max.wilckens' and r.name = 'Occupational safety'
on conflict do nothing;

with i as (
  insert into public.operating_instructions (kind, owner_user_id, review_due_on, created_by_user_id)
  select 'substance', u.id, current_date + 200, u.id from public.users u where u.username = 'tom.berger'
  returning id, owner_user_id
), v as (
  insert into public.operating_instruction_versions (instruction_id, version_no, status, valid_from, signal_word, signs, change_note,
                                                     approved_by_user_id, approved_at, created_by_user_id)
  select i.id, 1, 'published', current_date - 165, 'danger',
         '{"hazards": ["GHS02", "GHS07", "GHS08"], "protection": ["M004", "M009", "M017", "P002", "P003"], "emergency": ["F001", "P011"], "first_aid": ["E003", "E011", "E012"], "disposal": ["M001"]}'::jsonb,
         'Erste Fassung', (select id from public.users where username = 'max.wilckens'), now() - interval '165 days', i.owner_user_id
  from i returning id, instruction_id
)
insert into public.operating_instruction_texts (version_id, language, title, work_area, subject, sections)
select v.id, x.language, x.title, x.work_area, x.subject, x.sections::jsonb from v, (values
  ('de', 'Mischen lösemittelhaltiger Lacke', 'Lackherstellung, Halle 2', 'Lösemittelhaltige Industrielacke (Xylol, Butylacetat)',
   '{"scope": "<p>Ansetzen, Mischen und Abfüllen lösemittelhaltiger Lacke an den Dissolvern der Halle 2.</p>",
     "hazards": "<p>Flüssigkeit und Dampf entzündbar. Dämpfe können mit Luft explosionsfähige Gemische bilden.</p><ul><li>Gesundheitsschädlich beim Einatmen und bei Hautkontakt.</li><li>Kann Schläfrigkeit und Benommenheit verursachen.</li><li>Kann bei längerer Exposition die Organe schädigen.</li></ul>",
     "protection": "<ul><li>Nur mit eingeschalteter Absaugung arbeiten, Behälter geschlossen halten.</li><li>Schutzbrille, Nitril-Handschuhe und bei offenem Umfüllen Atemschutz (Filter A2) tragen.</li><li>Zündquellen fernhalten, nicht rauchen. Behälter erden.</li><li>Nicht essen und trinken; nach der Arbeit Hände waschen und Hautschutz verwenden.</li></ul>",
     "emergency": "<ul><li>Verschüttetes mit Bindemittel aufnehmen, Raum lüften, Zündquellen entfernen.</li><li>Brand: CO₂- oder Schaumlöscher, <strong>kein Wasservollstrahl</strong>.</li><li>Notruf 112, Schichtleitung informieren.</li></ul>",
     "first_aid": "<ul><li>Augen: sofort 15 Minuten mit Augendusche spülen.</li><li>Haut: verunreinigte Kleidung ausziehen, mit Wasser und Seife waschen.</li><li>Einatmen: an die frische Luft bringen, bei Beschwerden Arzt.</li><li>Ersthelfer: siehe Aushang.</li></ul>",
     "disposal": "<p>Reste und getränkte Lappen in die gekennzeichneten Sammelbehälter für lösemittelhaltige Abfälle. Nicht in den Ausguss.</p>"}'),
  ('en', 'Mixing solvent-based paints', 'Paint production, hall 2', 'Solvent-based industrial paints (xylene, butyl acetate)',
   '{"scope": "<p>Preparing, mixing and filling solvent-based paints at the dissolvers in hall 2.</p>",
     "hazards": "<p>Flammable liquid and vapour. Vapours can form explosive mixtures with air.</p><ul><li>Harmful if inhaled or in contact with skin.</li><li>May cause drowsiness or dizziness.</li><li>May cause damage to organs through prolonged exposure.</li></ul>",
     "protection": "<ul><li>Work only with the extraction switched on, keep containers closed.</li><li>Wear safety goggles, nitrile gloves and, when decanting openly, respiratory protection (filter A2).</li><li>Keep ignition sources away, no smoking. Earth the containers.</li><li>Do not eat or drink; wash your hands after work and use skin protection.</li></ul>",
     "emergency": "<ul><li>Take up spills with absorbent, ventilate, remove ignition sources.</li><li>Fire: CO₂ or foam extinguisher, <strong>no full water jet</strong>.</li><li>Emergency call 112, inform the shift lead.</li></ul>",
     "first_aid": "<ul><li>Eyes: rinse at once for 15 minutes at the eyewash station.</li><li>Skin: remove contaminated clothing, wash with soap and water.</li><li>Inhalation: move to fresh air, see a doctor if symptoms persist.</li><li>First aiders: see the notice board.</li></ul>",
     "disposal": "<p>Residues and soaked rags go into the marked containers for solvent waste. Never down the drain.</p>"}')
) as x(language, title, work_area, subject, sections);

with i as (
  insert into public.operating_instructions (kind, owner_user_id, review_due_on, legacy_number, created_by_user_id)
  select 'machine', u.id, current_date - 10, 'BA-M-17', u.id from public.users u where u.username = 'anna.weber'
  returning id, owner_user_id
), v as (
  insert into public.operating_instruction_versions (instruction_id, version_no, status, valid_from, signs, approved_by_user_id, approved_at, created_by_user_id)
  select i.id, 1, 'published', current_date - 375,
         '{"hazards": ["W019", "W012", "W018"], "protection": ["M008", "M009", "P015"], "faults": ["M021"], "first_aid": ["E003", "E004"], "maintenance": ["M021", "W012"]}'::jsonb,
         (select id from public.users where username = 'max.wilckens'), now() - interval '375 days', i.owner_user_id
  from i returning id, instruction_id
), l as (
  insert into public.operating_instruction_assets (instruction_id, asset_id)
  select v.instruction_id, a.id from v, public.assets a where a.name like 'Exzenterschneckenpumpe Netzsch 2019%'
)
insert into public.operating_instruction_texts (version_id, language, title, work_area, subject, sections)
select v.id, 'de', 'Bedienen der Exzenterschneckenpumpe', 'Abfüllung', 'Exzenterschneckenpumpe Netzsch, Baujahr 2019',
 '{"scope": "<p>Fördern von Lacken und Bindemitteln mit den Exzenterschneckenpumpen der Abfüllung.</p>",
   "hazards": "<ul><li>Quetsch- und Einzugsgefahr an Antrieb und Kupplung.</li><li>Elektrische Spannung im Klemmenkasten.</li><li>Unerwarteter Anlauf über die Steuerung.</li></ul>",
   "protection": "<ul><li>Nur eingewiesene Personen bedienen die Pumpe.</li><li>Schutzabdeckungen nie entfernen oder überbrücken.</li><li>Nicht in laufende Teile greifen.</li><li>Sicherheitsschuhe und Handschuhe tragen.</li></ul>",
   "faults": "<ul><li>Pumpe am Not-Halt stoppen.</li><li>Störung der Schichtleitung melden, Ticket über den QR-Code der Anlage anlegen.</li><li>Störungen nur bei freigeschalteter und gesicherter Pumpe beseitigen.</li></ul>",
   "first_aid": "<ul><li>Not-Halt betätigen, Ersthelfer rufen.</li><li>Notruf 112.</li><li>Unfall der Schichtleitung melden.</li></ul>",
   "maintenance": "<p>Instandhaltung nur durch die Werkstatt: allpolig freischalten, gegen Wiedereinschalten sichern, Spannungsfreiheit feststellen, Druck ablassen.</p>"}'::jsonb
from v;

-- The substance instruction: version 2 as an open draft (owner Tom), so the editor and the "check" marks can be tried.
insert into public.operating_instruction_versions (instruction_id, version_no, status, signal_word, signs, change_note, created_by_user_id)
select v.instruction_id, 2, 'draft', v.signal_word, v.signs, 'Atemschutzfilter ergänzt', i.owner_user_id
from public.operating_instruction_versions v join public.operating_instructions i on i.id = v.instruction_id
where i.kind = 'substance' and v.version_no = 1;
insert into public.operating_instruction_texts (version_id, language, title, work_area, subject, sections)
select d.id, t.language, t.title, t.work_area, t.subject, t.sections
from public.operating_instruction_versions d
join public.operating_instruction_versions p on p.instruction_id = d.instruction_id and p.version_no = 1
join public.operating_instruction_texts t on t.version_id = p.id
join public.operating_instructions i on i.id = d.instruction_id and i.kind = 'substance'
where d.version_no = 2;

-- Stage 3: the substance instruction is taught in the hazardous substances instruction, the pump in the machine safety
-- induction. The records of the demo trainings are older than the instructions, so these trainings show
-- "reinstruction due" until somebody is instructed again.
insert into public.training_type_operating_instructions (training_type_id, instruction_id)
select t.id, i.id from public.training_types t, public.operating_instructions i
where (t.name = 'Hazardous substances instruction' and i.kind = 'substance') or (t.name = 'Machine safety induction' and i.kind = 'machine')
on conflict do nothing;

select set_config('app.operating_instruction_rpc', 'off', true);

-- ============================== COMPASS seed 14_demo_messages.sql ==============================
-- Demo messages (local only): two teams for everybody next to the team Werkstatt, a few posts and comments from the
-- seeded people. "Unternehmen" is the announcement team: everybody reads, only its owners post, it has no members.
insert into public.teams (id, name, description, audience, posting) values
  ('00000000-0000-4000-8000-00000000ce01', 'Treffpunkt', 'Neuigkeiten und Austausch für das ganze Haus', 'everyone', 'everyone'),
  ('00000000-0000-4000-8000-00000000ce03', 'Unternehmen', 'Wichtige Hinweise der Leitung, bitte lesen', 'everyone', 'owners')
on conflict do nothing;
update public.teams set description = 'Absprachen und Tipps der Werkstatt' where name = 'Werkstatt';
insert into public.team_owners (team_id, user_id)
select '00000000-0000-4000-8000-00000000ce03', id from public.users where email in ('hanna.richter@example.com', 'tom.berger@example.com')
on conflict do nothing;

-- A post = a conversation of kind post anchored to its team; its first message is the text.
insert into public.conversations (id, kind, anchor_type, anchor_id, title, created_at) values
  ('00000000-0000-4000-8000-00000000ba01', 'post', 'teams', '00000000-0000-4000-8000-00000000ce03', 'Neue Handschuhe in der Abfüllung', now() - interval '2 days'),
  ('00000000-0000-4000-8000-00000000ba02', 'post', 'teams', '00000000-0000-4000-8000-00000000ce01', 'Sommerfest am 12. Juli', now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000ba03', 'post', 'teams', (select id from public.teams where name = 'Werkstatt'), null, now() - interval '3 hours')
on conflict do nothing;
insert into public.messages (id, conversation_id, author_user_id, body, created_at) values
  ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-00000000ba01', (select id from public.users where email = 'hanna.richter@example.com'),
   '<p>Ab Montag gibt es in der Abfüllung <strong>schnittfeste Handschuhe</strong>. Bitte die alten Handschuhe beim Schichtleiter abgeben und die neuen abholen.</p>', now() - interval '2 days'),
  ('00000000-0000-4000-8000-00000000bb02', '00000000-0000-4000-8000-00000000ba02', (select id from public.users where email = 'tom.berger@example.com'),
   '<p>Das Sommerfest findet am <strong>12. Juli</strong> auf dem Werksgelände statt. Wer Ideen für Spiele oder Essen hat, schreibt sie gern hier in die Kommentare.</p>', now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000bb03', '00000000-0000-4000-8000-00000000ba03', (select id from public.users where email = 'anna.weber@example.com'),
   '<p>Der neue Drehmomentschlüssel liegt im Werkzeugschrank, zweites Fach. Bitte nach Gebrauch wieder zurücklegen.</p>', now() - interval '3 hours')
on conflict do nothing;
insert into public.messages (conversation_id, body, author_user_id, created_at) values
  ('00000000-0000-4000-8000-00000000ba02', 'Ich kann einen Grill mitbringen.', (select id from public.users where email = 'ben.keller@example.com'), now() - interval '20 hours'),
  ('00000000-0000-4000-8000-00000000ba02', 'Super, danke Ben! Wir klären die Details nächste Woche.', (select id from public.users where email = 'tom.berger@example.com'), now() - interval '18 hours'),
  ('00000000-0000-4000-8000-00000000ba03', 'Danke, wo ist der alte hin?', (select id from public.users where email = 'sara.novak@example.com'), now() - interval '1 hour');

-- ============================== COMPASS seed 16_demo_looks.sql ==============================
-- Demo looks, local only: team colours (teams.color) and icons on the asset tree (assets.icon); ~/maintenance_tool/docs/ui-and-navigation.md "Icons and colours".
-- The announcement teams (Unternehmen, Treffpunkt) stay gray: they are no work teams.
update public.teams g set color = c.color
from (values
  ('Werkstatt', 'teal'),
  ('Instandhaltung', 'blue'),
  ('Produktion', 'orange'),
  ('Abfüllung', 'amber'),
  ('IT', 'violet')
) as c (name, color)
where g.name = c.name;

-- Demo: icons on the grouping nodes of the asset tree (assets.icon); everything below a node takes it over
-- (assets_overview.effective_icon) until a node sets its own.
update public.assets a set icon = c.icon
from (values
  ('Werk Glückstadt', 'building-factory'),
  ('Werk Süd (Demo)', 'building-factory'),
  ('Behälter & Tanks', 'cylinder'),
  ('Pumpen', 'droplet'),
  ('Waagen', 'scale'),
  ('Laborgeräte', 'flask'),
  ('Sicherheitseinrichtung', 'shield-check'),
  ('Flurförderfahrzeuge', 'forklift'),
  ('Maschinen', 'settings'),
  ('Etikettierer', 'printer'),
  ('Abfüllanlagen', 'bottle'),
  ('Reinigungsanlagen', 'spray'),
  ('Verpackungsanlage', 'box'),
  ('Dissolver', 'engine'),
  ('Perlmühlen', 'atom'),
  ('Förderanlagen', 'stack'),
  ('Infrastruktur', 'building'),
  ('Absaugung', 'wind'),
  ('Druckluft', 'gauge'),
  ('Wasserversorgung', 'droplet'),
  ('Kälteanlagen', 'snowflake'),
  ('Elektrik', 'bolt'),
  ('Heizung', 'flame'),
  ('Abfallwirtschaft', 'recycle'),
  ('Gebäude & Tore', 'building'),
  ('Werkzeuge', 'tool')
) as c (name, icon)
where a.name = c.name;

-- Team uses of the COMPASS teams (COMPASS groups.usable_for_*, read from the COMPASS database).
insert into public.team_uses (team_id, use) select id, 'trainings' from public.teams where name = 'IT' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'positions' from public.teams where name = 'IT' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'leave' from public.teams where name = 'IT' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'tasks' from public.teams where name = 'IT' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'filters' from public.teams where name = 'IT' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'trainings' from public.teams where name = 'Abfüllung' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'positions' from public.teams where name = 'Abfüllung' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'leave' from public.teams where name = 'Abfüllung' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'tasks' from public.teams where name = 'Abfüllung' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'filters' from public.teams where name = 'Abfüllung' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'trainings' from public.teams where name = 'Produktion' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'positions' from public.teams where name = 'Produktion' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'leave' from public.teams where name = 'Produktion' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'tasks' from public.teams where name = 'Produktion' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'filters' from public.teams where name = 'Produktion' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'leave' from public.teams where name = 'Instandhaltung' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'assets' from public.teams where name = 'Werkstatt' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'trainings' from public.teams where name = 'Werkstatt' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'positions' from public.teams where name = 'Werkstatt' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'leave' from public.teams where name = 'Werkstatt' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'tasks' from public.teams where name = 'Werkstatt' on conflict do nothing;
insert into public.team_uses (team_id, use) select id, 'filters' from public.teams where name = 'Werkstatt' on conflict do nothing;
