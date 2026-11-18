-- GENERATED (COMPASS task types, routes, task rights and the task family demo data).
-- Do not edit by hand: change the generator and run it again.

-- Task types and their routes (COMPASS migrations, read from the COMPASS database).
insert into public.task_types (key, name, name_de, description, active, default_due_days, short_description, keywords, show_on_start_page, default_team_id, hidden_fields, blocks_parent, system_created, track_as_request) values ('general', 'General task', 'Allgemeine Aufgabe', 'Single step; completed by whoever works on it.', true, null, 'Something needs doing: describe it and pick who should do it.', null, true, (select id from public.teams where name = null), '{work_hours,downtime}'::text[], false, false, false);
insert into public.task_types (key, name, name_de, description, active, default_due_days, short_description, keywords, show_on_start_page, default_team_id, hidden_fields, blocks_parent, system_created, track_as_request) values ('initiative', 'Initiative', 'Initiative', 'A goal-driven body of work: a root task with tasks and subtasks below it.', true, null, null, null, false, (select id from public.teams where name = null), '{}'::text[], false, false, false);
insert into public.task_types (key, name, name_de, description, active, default_due_days, short_description, keywords, show_on_start_page, default_team_id, hidden_fields, blocks_parent, system_created, track_as_request) values ('inspection', 'Recurring inspection', 'Wiederkehrende Prüfung', 'Statutory or internal recurring inspection; one step, completed by the person who performs it.', true, null, null, null, false, (select id from public.teams where name = null), '{}'::text[], false, false, false);
insert into public.task_types (key, name, name_de, description, active, default_due_days, short_description, keywords, show_on_start_page, default_team_id, hidden_fields, blocks_parent, system_created, track_as_request) values ('maintenance', 'Maintenance task', 'Instandhaltungsaufgabe', 'Repair or maintenance work on a machine; work hours and downtime can be recorded.', true, null, null, null, false, (select id from public.teams where name = null), '{}'::text[], false, false, false);
insert into public.task_types (key, name, name_de, description, active, default_due_days, short_description, keywords, show_on_start_page, default_team_id, hidden_fields, blocks_parent, system_created, track_as_request) values ('purchase_request', 'Purchase request', 'Beschaffungsanfrage', 'Workshop requests, a manager approves, purchasing orders, workshop confirms goods receipt.', true, null, 'Order material, tools or protective equipment. Your supervisor approves, purchasing orders.', 'order buy material tool PPE gloves safety shoes bestellen kaufen Material Werkzeug PSA Handschuhe Sicherheitsschuhe', true, (select id from public.teams where name = null), '{work_hours,downtime}'::text[], true, false, true);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'general'), 'work', 1, 'Work', 'Bearbeitung', 'open', (select id from public.roles where name = null), '[{"to": null, "key": "complete"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'initiative'), 'planning', 1, 'Planning', 'Planung', 'open', (select id from public.roles where name = null), '[{"to": "running", "key": "start"}, {"to": null, "key": "complete"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'initiative'), 'running', 2, 'Running', 'Läuft', 'in_progress', (select id from public.roles where name = null), '[{"to": null, "key": "complete"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'inspection'), 'perform', 1, 'Perform inspection', 'Prüfung durchführen', 'open', (select id from public.roles where name = 'Workshop'), '[{"to": null, "key": "complete"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'maintenance'), 'work', 1, 'Work', 'Bearbeitung', 'open', (select id from public.roles where name = null), '[{"to": null, "key": "complete"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'purchase_request'), 'request', 1, 'Request', 'Anfrage', 'open', (select id from public.roles where name = 'Workshop'), '[{"to": "approval", "key": "send"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'purchase_request'), 'approval', 2, 'Approval', 'Freigabe', 'waiting_for_approval', (select id from public.roles where name = null), '[{"to": "purchasing", "key": "approve", "kind": "positive"}, {"to": "request", "key": "reject", "kind": "negative", "requires_comment": true}]'::jsonb, 'requester_supervisor', 1, (select id from public.roles where name = 'Manager'), (select id from public.teams where name = null), true, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'purchase_request'), 'purchasing', 3, 'Purchasing', 'Einkauf', 'waiting_for_procurement', (select id from public.roles where name = 'Purchasing'), '[{"to": "receipt", "key": "ordered"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_steps (task_type_id, step_key, step_order, name, name_de, status, assignee_role_id, actions, assignee_kind, assignee_level, fallback_role_id, assignee_team_id, is_decision, assignee_team_scope) values ((select id from public.task_types where key = 'purchase_request'), 'receipt', 4, 'Goods receipt', 'Wareneingang', 'waiting_for_delivery', (select id from public.roles where name = 'Workshop'), '[{"to": null, "key": "complete"}]'::jsonb, 'role', 1, (select id from public.roles where name = null), (select id from public.teams where name = null), false, null);
insert into public.task_type_step_items (step_id, sort_order, kind, label, hint, required, unit, min_value, max_value) select s.id, 1, 'date', 'Liefertermin', null, true, null, null, null from public.task_type_steps s join public.task_types t on t.id = s.task_type_id where t.key = 'purchase_request' and s.step_key = 'purchasing';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'initiative' and b.key = 'initiative';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'general' and b.key = 'initiative';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'maintenance' and b.key = 'initiative';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'purchase_request' and b.key = 'initiative';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'initiative' and b.key = 'general';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'general' and b.key = 'general';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'maintenance' and b.key = 'general';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'purchase_request' and b.key = 'general';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'initiative' and b.key = 'maintenance';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'general' and b.key = 'maintenance';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'maintenance' and b.key = 'maintenance';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'purchase_request' and b.key = 'maintenance';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'initiative' and b.key = 'purchase_request';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'general' and b.key = 'purchase_request';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'maintenance' and b.key = 'purchase_request';
insert into public.task_type_subtask_types (task_type_id, subtask_type_id) select a.id, b.id from public.task_types a, public.task_types b where a.key = 'purchase_request' and b.key = 'purchase_request';

-- Task rights of the COMPASS roles (without the assigned_assets scope, which comes with the asset module).
insert into public.role_permissions (role_id, permission) select r.id, m.permission from (values ('Admin', 'goals.view.contributing'), ('Manager', 'checklist_templates.create'), ('Manager', 'checklist_templates.delete'), ('Manager', 'checklist_templates.edit.all'), ('Manager', 'costs.edit'), ('Manager', 'goals.create.all'), ('Manager', 'goals.edit.all'), ('Manager', 'goals.view.contributing'), ('Manager', 'initiatives.create.all'), ('Manager', 'initiatives.edit.all'), ('Manager', 'initiatives.view.all'), ('Manager', 'recurring_tasks.create.all'), ('Manager', 'recurring_tasks.delete.all'), ('Manager', 'recurring_tasks.edit.all'), ('Manager', 'recurring_tasks.view.all'), ('Manager', 'task_types.edit.own'), ('Manager', 'tasks.create.all'), ('Manager', 'tasks.delete.team'), ('Manager', 'tasks.edit.all'), ('Manager', 'tasks.view.all'), ('Purchasing', 'costs.edit'), ('Purchasing', 'goals.view.contributing'), ('Purchasing', 'initiatives.edit.assigned'), ('Purchasing', 'initiatives.edit.team'), ('Purchasing', 'initiatives.view.assigned'), ('Purchasing', 'initiatives.view.created'), ('Purchasing', 'initiatives.view.team'), ('Purchasing', 'tasks.edit.assigned'), ('Purchasing', 'tasks.edit.team'), ('Purchasing', 'tasks.view.assigned'), ('Purchasing', 'tasks.view.created'), ('Purchasing', 'tasks.view.team'), ('Shopfloor', 'goals.view.contributing'), ('Shopfloor', 'initiatives.edit.assigned'), ('Shopfloor', 'initiatives.edit.team'), ('Shopfloor', 'initiatives.view.assigned'), ('Shopfloor', 'initiatives.view.created'), ('Shopfloor', 'initiatives.view.team'), ('Shopfloor', 'tasks.edit.assigned'), ('Shopfloor', 'tasks.edit.team'), ('Shopfloor', 'tasks.view.assigned'), ('Shopfloor', 'tasks.view.created'), ('Shopfloor', 'tasks.view.team'), ('Workshop', 'goals.view.contributing'), ('Workshop', 'initiatives.create.created'), ('Workshop', 'initiatives.edit.assigned'), ('Workshop', 'initiatives.edit.team'), ('Workshop', 'initiatives.view.assigned'), ('Workshop', 'initiatives.view.created'), ('Workshop', 'initiatives.view.team'), ('Workshop', 'tasks.create.created'), ('Workshop', 'tasks.edit.assigned'), ('Workshop', 'tasks.edit.team'), ('Workshop', 'tasks.view.assigned'), ('Workshop', 'tasks.view.created'), ('Workshop', 'tasks.view.team')) as m(role_name, permission) join public.roles r on r.name = m.role_name on conflict do nothing;

update public.app_settings set value = coalesce((select id::text from public.task_types where key = 'general'), '') where key = 'default_task_type_id';
update public.app_settings set value = '7' where key = 'default_due_days';
update public.app_settings set value = coalesce((select id::text from public.roles where name = 'Manager'), '') where key = 'default_fallback_role_id';

-- ============================== COMPASS seed 08_demo_supervisors.sql ==============================
-- Demo hierarchy for the approval routing: Max (Admin) <- Tom (Manager) <- the team members.
-- Paul (other site) has no supervisor on purpose: his approvals fall back to the Manager role.
update public.users u
set supervisor_user_id = (select id from public.users where email = s.supervisor_email),
    deputy_user_id = (select id from public.users where email = s.deputy_email)
from (values
  ('tom.berger@example.com',   'max.wilckens@wilckens.com', null),
  ('anna.weber@example.com',   'tom.berger@example.com',    'sara.novak@example.com'),
  ('sara.novak@example.com',   'tom.berger@example.com',    'anna.weber@example.com'),
  ('lena.fischer@example.com', 'tom.berger@example.com',    null),
  ('ben.keller@example.com',   'tom.berger@example.com',    null)
) as s(email, supervisor_email, deputy_email)
where u.email = s.email;

-- Tom is covered by Max while he is away.
update public.users set deputy_user_id = (select id from public.users where email = 'max.wilckens@wilckens.com')
where email = 'tom.berger@example.com';

-- ============================== COMPASS seed 02_demo_access_and_work.sql (tasks only) ==============================
-- Tasks. The week starts on Monday.
do $$
declare
  v_monday date := date_trunc('week', current_date)::date;
  v_general uuid := (select id from public.task_types where key = 'general');
  v_purchase uuid := (select id from public.task_types where key = 'purchase_request');
  v_mech uuid := (select id from public.teams where name = 'Werkstatt');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_task uuid;
begin
  insert into public.tasks (task_type_id, title, description, priority, team_id, assigned_user_id, planned_date, sort_order, due_date, created_by_user_id) values
    (v_general, 'Ölwechsel Schraubenkompressor', 'Öl und Ölfilter wechseln, Füllstand protokollieren.', 'normal',
     v_mech, v_anna, v_monday, 'a0', v_monday + 4, v_tom),
    (v_general, 'Antriebsriemen Perlmühle 2 prüfen', null, 'normal',
     v_mech, v_anna, v_monday, 'a1', null, v_tom),
    (v_general, 'Lager Dissolver schmieren', null, 'low',
     v_mech, v_sara, v_monday + 1, 'a0', null, v_tom),
    (v_general, 'Gaswarnanlage Funktionstest', 'Jährliche Funktionsprüfung.', 'high',
     v_mech, null, v_monday + 2, 'a0', v_monday + 2, v_tom),
    (v_general, 'Filtermatten Absaugung tauschen', null, 'normal',
     v_mech, null, null, 'a0', null, v_tom),
    (v_general, 'Beleuchtung Heizungsraum prüfen', null, 'low',
     null, null, null, 'a1', null, v_tom);

  -- A purchase request moved through the first steps, as the real people would have.
  insert into public.tasks (task_type_id, title, description, priority, team_id, created_by_user_id)
  values (v_purchase, 'Ersatzmotor Schraubenkompressor bestellen', 'Motor 55 kW, passend zu Kaeser ASD 60.', 'high', v_mech, v_anna)
  returning id into v_task;

  -- Without the demo people (cloud) the request just stays in its first step.
  if v_anna is not null and v_tom is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_anna, 'role', 'authenticated')::text, true);
    perform public.task_perform_action(v_task, 'send');
    perform set_config('request.jwt.claims', json_build_object('sub', v_tom, 'role', 'authenticated')::text, true);
    perform public.task_perform_action(v_task, 'approve', 'Freigegeben, bitte zügig bestellen.');
    perform set_config('request.jwt.claims', '', true);
  end if;
end $$;


-- ============================== COMPASS seed 03_recurring_inspections.sql ==============================
-- GENERATED by scripts/seed_from_excel.py from docs/reference docs/Wiederkehrende Prüfungen.xlsx. Do not edit by hand.
-- Inspections with a fixed interval become recurring task rules (the task appears 30 days before it is
-- due, the next date counts from completion). 'Nach Bedarf' and undated inspections become one-off tasks.


insert into public.recurring_task_rules (name, description, task_type_id, priority, schedule_kind, interval_count, next_due_date, lead_days, repeat_mode)
select v.name, v.description, (select id from public.task_types where key = 'inspection'), v.priority, v.kind, v.n::integer, v.next_due::date, 30, 'after_completion'
from (values
  ('Arbeitsmedizinische Untersuchung', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Herr Dr. Promies
Verantwortlich: Tobias Paul
Letzte Prüfung: 2026-05-01', 'normal', 'yearly', 1, '2027-05-01'),
  ('Betriebsarzt Jahresbericht', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Dr. Promies
Rechtsgrundlage: §5 DGUV Vorschrift 2
Verantwortlich: Tobias Paul
Letzte Prüfung: 2026-01-13', 'normal', 'yearly', 1, '2027-01-31'),
  ('Hautschutzplan', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Tobias Paul
Rechtsgrundlage: ArbSchG
Verantwortlich: Tobias Paul
Letzte Prüfung: 2026-01-14', 'normal', 'yearly', 1, '2027-01-14'),
  ('Interne Prüfung Handhubwagen', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Timo Ewert
Verantwortlich: Timo Ewert', 'normal', 'yearly', 1, '2026-12-01'),
  ('Interne Prüfung Leitern und Tritte', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Timo Ewert
Verantwortlich: Tobias Paul', 'normal', 'yearly', 1, '2026-12-01'),
  ('Kraftbetriebene Tore', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Sohst GmbH, Herr Halfpap
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-04-22', 'normal', 'yearly', 1, '2027-04-01'),
  ('Ladebrücken und fahrbare Rampen, Inspektion gemäß DGVU 108-006', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Sohst GmbH, Herr Halfpap
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-04-22', 'normal', 'yearly', 1, '2027-04-01'),
  ('SiFA Jahresbericht', 'Kategorie: Arbeitsschutz
Intervall: jährlich
Durchführung: Herr Stortz / Herr Berg
Rechtsgrundlage: §5 DGUV Vorschrift 2
Verantwortlich: Tobias Paul
Letzte Prüfung: 2026-01-12', 'normal', 'yearly', 1, '2027-03-01'),
  ('Überprüfung Interner Alarm- und Gefahrenabwehrplan', 'Kategorie: Betriebssicherheit
Intervall: jährlich
Durchführung: Intern
Verantwortlich: Max Wilckens
Letzte Prüfung: 2026-09-07', 'normal', 'yearly', 1, '2027-07-01'),
  ('Überprüfung Sicherheitskonzept', 'Kategorie: Betriebssicherheit
Intervall: jährlich
Durchführung: Intern
Rechtsgrundlage: § 8 Störfallverordnung
Verantwortlich: Max Wilckens
Letzte Prüfung: 2026-09-08', 'normal', 'yearly', 1, '2027-09-01'),
  ('Austausch Schaummittel (Werkstatt, Lagerbüro & Wandhydrant DIY 100)', 'Kategorie: Brandschutz
Intervall: 5 Jahre ?
Verantwortlich: Dr. Marcus Wilckens', 'high', 'yearly', 5, '2026-12-31'),
  ('BMA - Wartung', 'Kategorie: Brandschutz
Intervall: 1/4 jährlich
Durchführung: Otto Weich
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-09-18', 'high', 'monthly', 3, '2026-12-31'),
  ('BMA - ZÜS Prüfung', 'Kategorie: Brandschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Jürgen Voigt
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-04-30', 'high', 'yearly', 3, '2026-03-31'),
  ('Brandhelfer, Schulung', 'Kategorie: Brandschutz
Intervall: alle 2-5 Jahre
Verantwortlich: Tobias Paul
Letzte Prüfung: 2022-06-01', 'high', 'yearly', 2, '2027-06-01'),
  ('Brandschutzklappen', 'Kategorie: Brandschutz
Intervall: jährlich
Durchführung: Tim-Ole Maaß Inhaber Brandschutzservice Nord Stark Feuerschutz Handwerksmeister Elektrotechnik Zertf. Brandschutztechniker GLORIA Kundendienst Beim Haferhof 15 25479 Ellerau 04106-1216373
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-06-22', 'high', 'yearly', 1, '2027-06-22'),
  ('Brandschutztore', 'Kategorie: Brandschutz
Intervall: jährlich
Durchführung: extern: Firma Sohst
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-04-22', 'high', 'yearly', 1, '2027-04-01'),
  ('Brandschutztüren', 'Kategorie: Brandschutz
Intervall: jährlich
Durchführung: extern: Hr. Tiedemann
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-01-27', 'high', 'yearly', 1, '2027-01-27'),
  ('Evakuierungsübung', 'Kategorie: Brandschutz
Intervall: jährlich
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-12-08', 'high', 'yearly', 1, '2026-12-01'),
  ('Externe Übungen (e.g. Feuerwehr, Einbruch, etc.)', 'Kategorie: Brandschutz
Intervall: 3 Jahre
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-07-01', 'high', 'yearly', 3, '2026-07-01'),
  ('Feuerlöschgeräte gemäß ASR A2.2 Kapitel 6, DIN 14406 Teil, §16 BetrSichV', 'Kategorie: Brandschutz
Intervall: alle 2 Jahre
Durchführung: Tim-Ole Maaß Inhaber Brandschutzservice Nord Stark Feuerschutz Handwerksmeister Elektrotechnik Zertf. Brandschutztechniker GLORIA Kundendienst Beim Haferhof 15 25479 Ellerau 04106-1216373
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-06-19', 'high', 'yearly', 2, '2028-06-19'),
  ('Feuerlöschkästen Inspektion gemäß DIN 14462', 'Kategorie: Brandschutz
Intervall: jährlich
Durchführung: Tim-Ole Maaß Inhaber Brandschutzservice Nord Stark Feuerschutz Handwerksmeister Elektrotechnik Zertf. Brandschutztechniker GLORIA Kundendienst Beim Haferhof 15 25479 Ellerau 04106-1216373
Verantwortlich: Timo Ewert', 'high', 'yearly', 1, '2026-06-21'),
  ('Gaswarnanlage Lager DIY II', 'Kategorie: Brandschutz
Intervall: 12 Monate
Durchführung: MoveOrange
Verantwortlich: Timo Ewert
Letzte Prüfung: 2025-05-26', 'high', 'monthly', 12, '2027-05-01'),
  ('RWA Anlage', 'Kategorie: Brandschutz
Intervall: jährlich
Durchführung: Firma Frehe / Hr. Rohrback 040 / 559 3420
Verantwortlich: Timo Ewert
Letzte Prüfung: 2025-12-11', 'high', 'yearly', 1, '2026-12-01'),
  ('Druckbehälterprüfung - Fabrik Nr. 15030,Baujahr 2019 - im Kaeser Kompressor, neu 03.2020, Equipm.-Nr. 10744351', 'Kategorie: Druckgasanlagen
Intervall: alle 10 Jahre
Durchführung: ZÜS: TÜV Nord, Herr Ralf Lütje
Rechtsgrundlage: §16 BetrSchV // Druckgasanlagen', 'high', 'yearly', 10, '2030-03-01'),
  ('Druckbehälterprüfung, Equipment-Nr. 1000331173, Vol. 2.000 ltr', 'Kategorie: Druckgasanlagen
Intervall: alle 5 Jahre innere / alle 10 Jahre Festigkeit
Durchführung: ZÜS: TÜV Nord, Herr Ralf Lütje
Rechtsgrundlage: §16 BetrSchV // Druckgasanlagen
Letzte Prüfung: 2025-02-07', 'high', 'yearly', 5, '2030-03-01'),
  ('Eichung Waagen', 'Kategorie: Eichung
Intervall: 2 Jahre
Durchführung: Eichamt Nord / Hr. Lange über Steenbock Waagen
Verantwortlich: Tobias Paul
Letzte Prüfung: 2025-02-10', 'normal', 'yearly', 2, '2026-12-01'),
  ('Elektr. Licht- u. Kraftanlagen gem. Feuerversicherungsbedingungen', 'Kategorie: Elektrische Anlagen
Intervall: alle 2 Jahre
Durchführung: extern: Ing. Büro Jungclaus/ VDS anerkannter Sachverständiger
Rechtsgrundlage: VdS 2871
Letzte Prüfung: 2025-08-11', 'normal', 'yearly', 2, '2027-08-11'),
  ('Gebäude und Anlagen Blitzschutz', 'Kategorie: Elektrische Anlagen
Intervall: alle 3 Jahre
Durchführung: extern: Otto Weich, Herr Wagener
Verantwortlich: Timo Ewert
Letzte Prüfung: 2024-10-01', 'normal', 'yearly', 3, '2027-10-01'),
  ('Mittelspannung TrafoWartung und Inspektion (ggfs. mit Ölprobe)', 'Kategorie: Elektrische Anlagen
Intervall: 4 Jahre
Durchführung: Elektro-Montage Nord
Letzte Prüfung: 2023-05-11', 'normal', 'yearly', 4, '2027-05-01'),
  ('Ölprobe Mittelspannung Trafo', 'Kategorie: Elektrische Anlagen
Intervall: 4 Jahre
Durchführung: Elektro-Montage Nord
Letzte Prüfung: 2023-05-11', 'normal', 'yearly', 4, '2027-05-01'),
  ('Prüfung Geräte mit Stecker - In Büros oder unter ähnlichen Bedingungen', 'Kategorie: Elektrische Anlagen
Intervall: 2 Jahre
Durchführung: EFK oder Unterwiesene Person / OMS Prüfservice
Rechtsgrundlage: TRBS 1201 und DGUV Vorschrift 3/4 nach Prüfnorm DIN VDE 0701/0702
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-08-04', 'normal', 'yearly', 2, '2027-06-01'),
  ('Prüfung ortsfester elektr. Anlagen (Unterverteilungen) gem. DIN VDE 0105-100', 'Kategorie: Elektrische Anlagen
Intervall: 4 Jahre
Durchführung: Otto Weich
Rechtsgrundlage: DIN VDE 0105-100 DGUV-3
Letzte Prüfung: 2025-08-01', 'normal', 'yearly', 4, '2029-08-01'),
  ('Prüfung Pumpen LöMi-Tanklager', 'Kategorie: Elektrische Anlagen
Intervall: alle 4 Jahre
Durchführung: Otto Weich
Rechtsgrundlage: DGUV V3 gem. DIN VDE 0105-100
Letzte Prüfung: 2025-06-05', 'normal', 'yearly', 4, '2029-06-01'),
  ('Prüfung RCDs durch Auslösen', 'Kategorie: Elektrische Anlagen
Intervall: 6 Monate
Durchführung: intern
Rechtsgrundlage: DGUV V3
Verantwortlich: Tobias Paul
Letzte Prüfung: 2026-09-22', 'normal', 'monthly', 6, '2027-03-01'),
  ('PV Anlagen', 'Kategorie: Elektrische Anlagen
Intervall: 4 Jahre
Durchführung: Otto Weich
Letzte Prüfung: 2025-10-08', 'normal', 'yearly', 4, '2027-03-01'),
  ('ATEX Anlage Außenlager Ost - BetrSichV 5.1', 'Kategorie: Explosionsschutz
Intervall: max. alle 6 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Muchow
Rechtsgrundlage: §16 BetrSichV // 5.1
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-08-11', 'high', 'yearly', 6, '2031-10-01'),
  ('Festinstallierte Atex Geräte Bereitstellungslager, BetrSichV 5-2', 'Kategorie: Explosionsschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Tiedje, Nr. 10817071
Rechtsgrundlage: §16 BetrSchV // 5.2
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-01-12', 'high', 'yearly', 3, '2027-06-21'),
  ('Festinstallierte Atex Geräte Bindemittellager, BetrSichV 5-2', 'Kategorie: Explosionsschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Tiedje, Nr. 1000614106
Rechtsgrundlage: §16 BetrSchV // 5.2
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-07-11', 'high', 'yearly', 3, '2027-06-01'),
  ('Festinstallierte Atex Geräte Gefahrstofflager, BetrSichV 5-2', 'Kategorie: Explosionsschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Tiedje; Nr. 10817085
Rechtsgrundlage: §16 BetrSchV // 5.2
Verantwortlich: Max Wilckens
Letzte Prüfung: 2021-06-21', 'high', 'yearly', 3, '2027-06-21'),
  ('Festinstallierte Atex Geräte Lösungsmitteltanklager, Tanks 101 - 110, BetrSichV 5-2', 'Kategorie: Explosionsschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Gorji; Nr. 1000614107
Rechtsgrundlage: §16 BetrSchV // 5.2
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-07-11', 'high', 'yearly', 3, '2028-04-01'),
  ('Festinstallierte Atex Geräte Produktion lösemittelbasiert, BetrSichV 5-2', 'Kategorie: Explosionsschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: Tüv-Nord
Rechtsgrundlage: §16 BetrSchV // 5.2
Verantwortlich: Max Wilckens', 'high', 'yearly', 3, '2026-12-31'),
  ('Konformität TRGS Bereitstellungslager, BetrSichV 5-1', 'Kategorie: Explosionsschutz
Intervall: max. alle 6 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Muchow
Rechtsgrundlage: §16 BetrSchV // 5.1, TRGS 510
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-06-08', 'high', 'yearly', 6, '2027-06-21'),
  ('Konformität TRGS Bindemittellager, BetrSichV 5-1', 'Kategorie: Explosionsschutz
Intervall: max. alle 6 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Muchow
Rechtsgrundlage: §16 BetrSchV // 5.1, TRGS 509
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-06-08', 'high', 'yearly', 6, '2027-06-08'),
  ('Konformität TRGS Gefahrstofflager, BetrSichV 5-1', 'Kategorie: Explosionsschutz
Intervall: max. alle 6 Jahre
Durchführung: ZÜS: Tüv-Nord, Herr Muchow
Rechtsgrundlage: §16 BetrSchV // 5.1, TRGS 510
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-06-08', 'high', 'yearly', 6, '2027-06-21'),
  ('Konformität TRGS Lösungsmitteltanklager, Tank 101 - 110, BetrSichV 5-1', 'Kategorie: Explosionsschutz
Intervall: max. alle 6 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Muchow
Rechtsgrundlage: §16 BetrSchV // 5.1, TRGS 509
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-07-11', 'high', 'yearly', 6, '2028-04-01'),
  ('Konformität TRGS Produktion lösemittelbasiert, BetrSichV 5-1', 'Kategorie: Explosionsschutz
Intervall: max. alle 6 Jahre
Rechtsgrundlage: §16 BetrSchV // 5.1
Verantwortlich: Max Wilckens', 'high', 'yearly', 6, '2026-12-01'),
  ('AwSV Außenlager Ost (TÜV Nord Nr. 10978574)', 'Kategorie: Gewässerschutz
Intervall: alle 5 Jahre
Durchführung: ZÜS: TÜV Nord, Hr. Muchow
Rechtsgrundlage: AwSV (vormals VAwS):
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-08-11', 'normal', 'yearly', 5, '2030-08-01'),
  ('AwSV Bindemittellager T201 - T212', 'Kategorie: Gewässerschutz
Intervall: alle 5 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Muchow
Rechtsgrundlage: AwSV (vormals VAwS):
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-08-19', 'normal', 'yearly', 5, '2027-06-01'),
  ('AwSV DIY Lager 2 (Tüv Nord Nr. 10726729)', 'Kategorie: Gewässerschutz
Intervall: alle 5 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Muchow
Rechtsgrundlage: AwSV (vormals VAwS):
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-03-31', 'normal', 'yearly', 5, '2029-11-01'),
  ('AwSV Lösungsmitteltanklager 101 - 110', 'Kategorie: Gewässerschutz
Intervall: alle 5 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Muchow
Rechtsgrundlage: AwSV (vormals VAwS):
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-08-10', 'normal', 'yearly', 5, '2027-04-01'),
  ('AwSV TKW-Entladestelle Dichtfläche Rohrleitung Schacht (Tüv Nr. 1000006671)', 'Kategorie: Gewässerschutz
Intervall: alle 5 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Muchow
Rechtsgrundlage: AwSV (vormals VAwS):
Verantwortlich: Max Wilckens
Letzte Prüfung: 2022-08-19', 'normal', 'yearly', 5, '2027-04-01'),
  ('AwSV Waschplatz (Tüv Nord Nr. 10793829)', 'Kategorie: Gewässerschutz
Intervall: alle 5 Jahre
Durchführung: ZÜS: TÜV-Nord, Herr Muchow
Rechtsgrundlage: AwSV (vormals VAwS):
Verantwortlich: Max Wilckens
Letzte Prüfung: 2025-10-08', 'normal', 'yearly', 5, '2030-04-01'),
  ('Kardex Automatik-Lager', 'Kategorie: Regale
Intervall: jährlich
Durchführung: extern: Kardex MLOG
Verantwortlich: Udo Krüger
Letzte Prüfung: 2026-07-08', 'normal', 'yearly', 1, '2027-07-08'),
  ('Kardex Automatik-Lager Erneuerung Hubseil', 'Kategorie: Regale
Intervall: alle 5 Jahre
Verantwortlich: Udo Krüger
Letzte Prüfung: 2022-02-02', 'normal', 'yearly', 5, '2027-02-02'),
  ('Kardex Automatik-Lager Sicht- und Funktionsprüfung Hubseil', 'Kategorie: Regale
Intervall: jährlich
Durchführung: intern
Verantwortlich: Timo Ewert
Letzte Prüfung: 2026-02-02', 'normal', 'yearly', 1, '2027-02-02')
) as v(name, description, priority, kind, n, next_due);

insert into public.tasks (task_type_id, title, description, priority, due_date) values
  ((select id from public.task_types where key = 'inspection'), 'Augenspülflaschen Betrieb', 'Kategorie: Arbeitsschutz
Intervall: nach Bedarf
Durchführung: Tobias Paul
Verantwortlich: Tobias Paul
Letzte Prüfung: 2025-06-11', 'normal', '2028-05-01'),
  ((select id from public.task_types where key = 'inspection'), 'Betriebsbesichtigung BG RCI', 'Kategorie: Arbeitsschutz
Intervall: nach Bedarf
Durchführung: BG RCI
Verantwortlich: Tobias Paul
Letzte Prüfung: 2025-06-26', 'normal', null),
  ((select id from public.task_types where key = 'inspection'), 'Erste Hilfe Kästen Betrieb', 'Kategorie: Arbeitsschutz
Intervall: nach Bedarf
Durchführung: Tobias Paul
Verantwortlich: Tobias Paul
Letzte Prüfung: 2025-06-11', 'normal', '2028-05-01'),
  ((select id from public.task_types where key = 'inspection'), 'Störfall-Inspektion', 'Kategorie: Betriebssicherheit
Intervall: 2-3 Jahre
Durchführung: Landesamt für Umwelt:<br>Herr Widmann<br>Herr Bleiken
Rechtsgrundlage: § 16 Störfall-Verordnung / Bundes-Immissionsschutzgestz
Verantwortlich: Max Wilckens
Letzte Prüfung: 2023-12-19', 'normal', null),
  ((select id from public.task_types where key = 'inspection'), 'Druckbehälteranlage - Equipm.-Nr. 10744349 (§ 16 BetrSichV)', 'Kategorie: Druckgasanlagen
Durchführung: ZÜS: TÜV Nord, Herr Ralf Lütje
Rechtsgrundlage: §16 BetrSchV // Druckgasanlagen', 'high', null),
  ((select id from public.task_types where key = 'inspection'), 'Erdung der Produktions- und Abfüllanlagen', 'Kategorie: Elektrische Anlagen
Durchführung: Otto Weich / HerrThieler
Letzte Prüfung: 2020-12-18', 'normal', '2026-12-31'),
  ((select id from public.task_types where key = 'inspection'), 'Erdung der Tankanlagen und Rohrleitungen', 'Kategorie: Elektrische Anlagen', 'normal', null),
  ((select id from public.task_types where key = 'inspection'), 'Ortveränderliche elektrische Betriebsmittel (Fehlerquote kl. 2% entsprechend länger)', 'Kategorie: Elektrische Anlagen
Intervall: 6 Monate
Durchführung: EFK oder Unterwiesene Person', 'normal', null),
  ((select id from public.task_types where key = 'inspection'), 'Prüfung Geräte mit Stecker - Auf Baustellen, Fertigungsstätten und Werkstätten', 'Kategorie: Elektrische Anlagen
Intervall: 1 Jahr
Durchführung: EFK oder Unterwiesene Person / OMS Prüfservice
Rechtsgrundlage: DGUV-Vorschrift 3 gem. DIN VDE 0701 - 0702
Letzte Prüfung: 2021-02-08', 'normal', null),
  ((select id from public.task_types where key = 'inspection'), 'Schutzstrommaßnahmen mit Fehlstrom-Schutzeinrichtung in nichtstationären Anlagen', 'Kategorie: Elektrische Anlagen
Intervall: 1 Monat
Durchführung: EFK oder Unterwiesene Person', 'normal', null),
  ((select id from public.task_types where key = 'inspection'), 'Festinstallierte Atex Geräte DIY Lager 200, BetrSichV 5-2', 'Kategorie: Explosionsschutz
Intervall: alle 3 Jahre
Durchführung: ZÜS: Tüv-Nord; Herr Voigt
Rechtsgrundlage: §16 BetrSchV // 5.2
Verantwortlich: Max Wilckens
Letzte Prüfung: 2023-03-13', 'high', null);

-- create the tasks that are already due (the daily job does this from now on)
select public.generate_recurring_tasks(current_date);

-- ============================== COMPASS seed 04_checklist_templates.sql ==============================
-- Example checklist templates (hand-written, German) and their link to recurring inspections.
-- Open tasks of those rules get the checklist right away (new ones get it from the rule).
do $$
declare
  v_tpl uuid;
  v_rule record;
  v_task record;

  -- name, description, [kind, label, required, unit, min, max]
  v_defs jsonb := '[
    {"name": "Sichtprüfung Flurförderzeug / Handhubwagen", "description": "Interne Sichtprüfung vor Ort", "rules": ["Interne Prüfung Handhubwagen"], "items": [
      ["heading", "Allgemein"],
      ["pass_fail", "Rahmen, Gabeln und Rollen ohne sichtbare Schäden", true],
      ["pass_fail", "Räder / Bereifung in Ordnung", true],
      ["pass_fail", "Heben und Senken funktioniert", true],
      ["pass_fail", "Deichsel und Bedienelemente leichtgängig", true],
      ["pass_fail", "Kennzeichnung und Typenschild lesbar", true],
      ["text", "Bemerkungen", false]
    ]},
    {"name": "Prüfung Leitern und Tritte", "description": "Interne Sichtprüfung", "rules": ["Interne Prüfung Leitern und Tritte"], "items": [
      ["pass_fail", "Holme und Sprossen unbeschädigt", true],
      ["pass_fail", "Standfüße / Gummifüße vorhanden und intakt", true],
      ["pass_fail", "Spreizsicherung funktionsfähig", true],
      ["pass_fail", "Prüfplakette vorhanden und aktuell", true],
      ["check", "Defekte Leiter gesperrt und gekennzeichnet (nur bei Mangel)", false],
      ["text", "Bemerkungen", false]
    ]},
    {"name": "Feuerlöscher Sichtprüfung", "description": "Sichtprüfung nach ASR A2.2", "rules": ["Feuerlöschgeräte gemäß ASR A2.2 Kapitel 6, DIN 14406 Teil, §16 BetrSichV", "Feuerlöschkästen Inspektion gemäß DIN 14462"], "items": [
      ["pass_fail", "Standort frei zugänglich, Hinweisschild vorhanden", true],
      ["pass_fail", "Plombe / Sicherung intakt", true],
      ["pass_fail", "Manometer im grünen Bereich", true],
      ["pass_fail", "Gehäuse und Schlauch ohne Schäden", true],
      ["check", "Prüfplakette aktuell", true],
      ["text", "Bemerkungen", false]
    ]},
    {"name": "Messprotokoll elektrische Anlage", "description": "Messwerte mit Grenzwerten", "rules": [], "items": [
      ["heading", "Sichtprüfung"],
      ["pass_fail", "Verteiler sauber, Beschriftung vollständig", true],
      ["heading", "Messwerte"],
      ["number", "Isolationswiderstand", true, "MΩ", 1, null],
      ["number", "Schutzleiterwiderstand", true, "Ω", null, 0.3],
      ["number", "Auslösezeit RCD", false, "ms", null, 300],
      ["text", "Bemerkungen", false]
    ]}
  ]';
  d jsonb;
  i jsonb;
  n integer;
  rule_name text;
begin
  for d in select * from jsonb_array_elements(v_defs) loop
    insert into public.checklist_templates (name, description) values (d ->> 'name', d ->> 'description') returning id into v_tpl;
    n := 0;
    for i in select * from jsonb_array_elements(d -> 'items') loop
      n := n + 1;
      insert into public.checklist_template_items (template_id, sort_order, kind, label, required, unit, min_value, max_value)
      values (v_tpl, n, i ->> 0, i ->> 1,
              coalesce((i ->> 2)::boolean, false) and (i ->> 0) <> 'heading',
              i ->> 3, (i ->> 4)::numeric, (i ->> 5)::numeric);
    end loop;

    for rule_name in select jsonb_array_elements_text(d -> 'rules') loop
      update public.recurring_task_rules set checklist_template_id = v_tpl where name = rule_name;
      for v_task in select id from public.tasks where recurring_task_rule_id in (select id from public.recurring_task_rules where name = rule_name)
                    and status not in ('done', 'cancelled') loop
        perform public.checklist_apply_template(v_task.id, v_tpl);
      end loop;
    end loop;
  end loop;
end $$;

-- ============================== COMPASS seed 06_demo_initiatives.sql ==============================
-- Demo initiatives with a task tree (three levels), for the Initiatives list and the task tree on the task page.
do $$
declare
  v_init uuid := (select id from public.task_types where key = 'initiative');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_root uuid; v_analysis uuid; v_export uuid; v_sensors uuid;
begin
  insert into public.tasks (task_type_id, is_initiative, title, description, due_date, assigned_user_id)
  values (v_init, true, 'Reduce machine downtime by 20%', 'Find the main causes of unplanned stops and remove the biggest ones.', current_date + 60, v_tom)
  returning id into v_root;
  insert into public.tasks (task_type_id, title, parent_task_id, due_date, assigned_user_id)
  values (v_general, 'Analyse downtime causes', v_root, current_date - 3, v_anna) returning id into v_analysis;
  insert into public.tasks (task_type_id, title, parent_task_id, assigned_user_id)
  values (v_general, 'Export stop reasons from the line controller', v_analysis, v_anna) returning id into v_export;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'Interview the shift leads', v_analysis);
  insert into public.tasks (task_type_id, title, parent_task_id, due_date)
  values (v_general, 'Install vibration sensors on line 2', v_root, current_date + 30) returning id into v_sensors;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'Order sensors and cabling', v_sensors);
  insert into public.tasks (task_type_id, title, parent_task_id, due_date) values (v_general, 'Review results with management', v_root, current_date + 55);
  update public.tasks set status = 'done', completed_at = now(), current_step_key = null where id = v_export;

  insert into public.tasks (task_type_id, is_initiative, title, description, due_date, assigned_user_id)
  values (v_init, true, 'Introduce a supplier scorecard', 'Rate our main suppliers on delivery and quality every quarter.', current_date + 120, v_tom);
end $$;

-- A plain task with finished subtasks (on time, rescheduled, late), so the punctuality box beside the subtasks has content.
do $$
declare
  v_general uuid := (select id from public.task_types where key = 'general');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_root uuid;
  v_id uuid;
begin
  insert into public.tasks (task_type_id, title, description, due_date, assigned_user_id)
  values (v_general, 'Prepare the annual safety audit', 'Collect documents, check the machines and brief the shift leads.', current_date + 14, v_anna)
  returning id into v_root;

  -- on time: done two days before the due date
  insert into public.tasks (task_type_id, title, parent_task_id, due_date, assigned_user_id)
  values (v_general, 'Collect inspection records', v_root, current_date - 10, v_anna) returning id into v_id;
  update public.tasks set status = 'done', completed_at = now() - interval '12 days', current_step_key = null where id = v_id;

  -- rescheduled: due date moved from -8 to -3, done on -4
  insert into public.tasks (task_type_id, title, parent_task_id, due_date, assigned_user_id)
  values (v_general, 'Check emergency stops', v_root, current_date - 8, v_anna) returning id into v_id;
  update public.tasks set due_date = current_date - 3, status = 'done', completed_at = now() - interval '4 days', current_step_key = null where id = v_id;

  -- late: due -6, done -2
  insert into public.tasks (task_type_id, title, parent_task_id, due_date, assigned_user_id)
  values (v_general, 'Update the hazard assessment', v_root, current_date - 6, v_anna) returning id into v_id;
  update public.tasks set status = 'done', completed_at = now() - interval '2 days', current_step_key = null where id = v_id;

  -- still open
  insert into public.tasks (task_type_id, title, parent_task_id, due_date) values (v_general, 'Brief the shift leads', v_root, current_date + 10);
end $$;

-- ============================== COMPASS seed 07_demo_goals.sql ==============================
-- Demo goals: the company purpose (no measure), two measured goals below it, and the demo initiatives linked to them.
do $$
declare
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_purpose uuid;
  v_reliable uuid;
  v_suppliers uuid;
begin
  insert into public.goals (title, description, owner_user_id)
  values ('Wilckens Farben is a healthy, independent company in 2046', 'The long-term purpose every other goal serves.', v_tom)
  returning id into v_purpose;

  insert into public.goals (title, parent_goal_id, owner_user_id, measure_label, measure_unit, start_value, target_value, due_date)
  values ('Reliable production', v_purpose, v_tom, 'Unplanned downtime per quarter', 'h', 120, 80, current_date + 90)
  returning id into v_reliable;
  update public.goals set current_value = 104, status = 'on_track' where id = v_reliable;

  insert into public.goals (title, parent_goal_id, owner_user_id, measure_label, measure_unit, start_value, target_value, due_date)
  values ('Dependable supply chain', v_purpose, v_tom, 'Deliveries on time', '%', 82, 95, current_date + 180)
  returning id into v_suppliers;

  update public.tasks set goal_id = v_reliable where title = 'Reduce machine downtime by 20%' and parent_task_id is null;
  update public.tasks set goal_id = v_suppliers where title = 'Introduce a supplier scorecard' and parent_task_id is null;
end $$;

