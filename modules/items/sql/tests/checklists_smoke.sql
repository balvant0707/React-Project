-- Copied from ~/maintenance_tool/supabase/tests/checklists_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Checklist smoke test: psql -f supabase/tests/checklists_smoke.sql (local stack). One line per check.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
-- Runs a statement that is expected to fail and reports the error message (a failure inside does not abort the transaction).
create or replace function pg_temp.attempt(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO ERROR (allowed)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;

-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;
begin;
select pg_temp.as_user('tom.berger@example.com');
insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-000000000001', 'Smoke template');
insert into public.checklist_template_items (template_id, sort_order, kind, label, required) values
  ('00000000-0000-4000-8000-000000000001', 1, 'heading', 'Section', false),
  ('00000000-0000-4000-8000-000000000001', 2, 'pass_fail', 'Looks fine', true),
  ('00000000-0000-4000-8000-000000000001', 3, 'check', 'Cleaned', true),
  ('00000000-0000-4000-8000-000000000001', 4, 'text', 'Remarks', false);
insert into public.checklist_template_items (template_id, sort_order, kind, label, unit, min_value, max_value, required)
  values ('00000000-0000-4000-8000-000000000001', 5, 'number', 'Pressure', 'bar', 6, 8, false);
select '1 manager built a template with 5 items', count(*) from public.checklist_template_items where template_id = '00000000-0000-4000-8000-000000000001';
reset role;

-- official checklist on a task
select pg_temp.as_user('anna.weber@example.com');
select '2 worker cannot create a template', pg_temp.attempt($q$insert into public.checklist_templates (name) values ('worker template')$q$);
select '3 worker puts the template on her task', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title like 'Ölwechsel%'), '00000000-0000-4000-8000-000000000001')$q$);
select '4 items copied (5, all from the template) and the task points at the template', count(*), bool_and(i.from_template), bool_and(t.checklist_template_id = '00000000-0000-4000-8000-000000000001')
  from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title like 'Ölwechsel%';
select '5 finishing is blocked while required items are open', pg_temp.attempt($q$select public.task_perform_action((select id from public.tasks where title like 'Ölwechsel%'), 'complete')$q$);
update public.task_checklist_items set result = 'ok' where label = 'Looks fine';
select '6 not complete after 1 of 2 required', checklist_completed_at is null from public.tasks where title like 'Ölwechsel%';
update public.task_checklist_items set done = true where label = 'Cleaned';
select '7 complete after all required', checklist_completed_at is not null from public.tasks where title like 'Ölwechsel%';
select '8 progress in overview (answered of countable items)', checklist_items_total, checklist_items_done from public.tasks_overview where title like 'Ölwechsel%';
select '9 feed has added + completed events', string_agg(event_type, ',' order by created_at) from public.activity_events where event_type like 'checklist_%' and entity_id = (select id from public.tasks where title like 'Ölwechsel%');
select '10 finishing works now', status from public.task_perform_action((select id from public.tasks where title like 'Ölwechsel%'), 'complete');
select '11 a finished task refuses another template', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title like 'Ölwechsel%'), null)$q$);
reset role;

-- own items on a task, saving them as an official checklist
select pg_temp.as_user('anna.weber@example.com');
select '12 worker types own items', pg_temp.attempt($q$insert into public.task_checklist_items (task_id, sort_order, kind, label, required) select id, 1, 'check', 'Belt tension', false from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'$q$);
select '13 worker cannot save them as template', pg_temp.attempt($q$select public.task_checklist_save_as_template((select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'), 'Belt')$q$);
reset role;
select pg_temp.as_user('tom.berger@example.com');
select '14 manager saves them as template', public.task_checklist_save_as_template((select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'), 'Belt') is not null;
select '15 template got the item', count(*) from public.checklist_template_items i join public.checklist_templates t on t.id = i.template_id where t.name = 'Belt' and i.label = 'Belt tension';
reset role;

-- template and own items on the same task; swapping and removing the template keeps the own items
select pg_temp.as_user('anna.weber@example.com');
select '16 template added next to the own item', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'), '00000000-0000-4000-8000-000000000001')$q$);
select '17 template items first, own item last', string_agg(label, ', ' order by sort_order) from public.task_checklist_items where task_id = (select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen');
select '18 swapping to another template keeps the own item', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'), (select id from public.checklist_templates where name = 'Belt'))$q$);
select '19 now template item + own item (2)', count(*), count(*) filter (where from_template) from public.task_checklist_items where task_id = (select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen');
select '20 removing the template keeps the own item', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'), null)$q$);
select '21 only own items left', count(*), count(*) filter (where from_template) from public.task_checklist_items where task_id = (select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen');
reset role;

-- another site's worker sees nothing of it
select pg_temp.as_user('paul.meier@example.com');
select '22 other site sees no items of tasks it cannot see (expect 0)', count(*) from public.task_checklist_items where task_id in (select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen');
reset role;

-- recurring rule with a template and own items
insert into public.recurring_task_rules (name, task_type_id, schedule_kind, interval_count, start_date, checklist_template_id, checklist_items)
values ('Rule with checklist', (select id from public.task_types where key = 'general'), 'monthly', 1, current_date, '00000000-0000-4000-8000-000000000001',
  '[{"label":"Own tick"},{"label":"  "},{"label":"Second tick","kind":"number","required":true}]');
select '23 rule generated a task', public.generate_recurring_tasks(current_date) >= 1;
select '24 generated task: 5 template items + 2 own ticks (blank dropped), own ones plain and optional', count(*), count(*) filter (where from_template), count(*) filter (where not from_template and kind = 'check' and not required)
  from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Rule with checklist';
select '25 generated task points at the template', checklist_template_id = '00000000-0000-4000-8000-000000000001' from public.tasks where title = 'Rule with checklist';
-- editing the official checklist reaches the next task of the series
insert into public.checklist_template_items (template_id, sort_order, kind, label, required) values ('00000000-0000-4000-8000-000000000001', 6, 'check', 'Added later', false);
update public.recurring_task_rules set next_due_date = current_date where name = 'Rule with checklist';
update public.recurring_task_rules set skip_if_open = false where name = 'Rule with checklist';
select '26 next generated task carries the edited template (6 template items)', public.generate_recurring_tasks(current_date) >= 1;
select '27 one task has 5 and the new one 6 template items', string_agg(n::text, ',' order by n) from (select count(*) filter (where from_template) n from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Rule with checklist' group by t.id) x;

-- ticket from a defect
select pg_temp.as_user('anna.weber@example.com');
select pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen'), '00000000-0000-4000-8000-000000000001')$q$);
select '28 ticket from an item that is not a defect is refused', pg_temp.attempt($q$select public.checklist_item_create_ticket((select i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Antriebsriemen Perlmühle prüfen' and i.label = 'Looks fine'))$q$);
update public.task_checklist_items set result = 'defect', note = 'Belt frayed' where label = 'Looks fine' and task_id = (select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen');
select '29 ticket created from the defect', public.checklist_item_create_ticket((select i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Antriebsriemen Perlmühle prüfen' and i.label = 'Looks fine'), null, 'high') is not null;
select '30 ticket is linked, typed and on the task asset', k.type, k.priority, k.asset_id = t.asset_id as same_asset, k.description like 'Belt frayed%' as has_note
  from public.task_checklist_items i join public.tickets k on k.id = i.ticket_id join public.tasks t on t.id = i.task_id where t.title = 'Antriebsriemen Perlmühle prüfen' and i.label = 'Looks fine';
select '31 second ticket for the same defect is refused', pg_temp.attempt($q$select public.checklist_item_create_ticket((select i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Antriebsriemen Perlmühle prüfen' and i.label = 'Looks fine'))$q$);
update public.task_checklist_items set ticket_id = null where label = 'Looks fine';
select '32 ticket link cannot be removed by hand', count(*) from public.task_checklist_items where label = 'Looks fine' and ticket_id is not null and task_id = (select id from public.tasks where title = 'Antriebsriemen Perlmühle prüfen');
select '33 feed event on the task', count(*) from public.activity_events where event_type = 'checklist_ticket_created';

-- photo on an item
select '34 photo on an item of the own task', pg_temp.attempt($q$insert into public.attachments (entity_type, entity_id, storage_path, file_name, checklist_item_id)
  select 'tasks', i.task_id, 'tasks/' || i.task_id || '/smoke.jpg', 'smoke.jpg', i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Antriebsriemen Perlmühle prüfen' and i.label = 'Looks fine'$q$);
select '35 photo with an item of another task is refused', pg_temp.attempt($q$insert into public.attachments (entity_type, entity_id, storage_path, file_name, checklist_item_id)
  select 'tasks', (select id from public.tasks where title like 'Ölwechsel%'), 'tasks/x/smoke2.jpg', 'smoke2.jpg', i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Antriebsriemen Perlmühle prüfen' and i.label = 'Looks fine'$q$);
reset role;

-- default template per task type; a rule template replaces it
update public.task_types set default_checklist_template_id = '00000000-0000-4000-8000-000000000001' where key = 'general';
select pg_temp.as_user('anna.weber@example.com');
insert into public.tasks (task_type_id, title, asset_id) values ((select id from public.task_types where key = 'general'), 'Default list task', (select id from public.assets where name = 'Perlmühle 1'));
select '36 new task gets the default checklist', count(*), bool_and(from_template) from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Default list task';
reset role;

-- who may see and work on a task
select pg_temp.as_user('tom.berger@example.com');
insert into public.tasks (task_type_id, title, assigned_user_id) values ((select id from public.task_types where key = 'general'), 'Assigned to Ben', (select id from public.users where email = 'ben.keller@example.com'));
insert into public.tasks (task_type_id, title, asset_id) values ((select id from public.task_types where key = 'inspection'), 'Inspection for the role', (select id from public.assets where name = 'Perlmühle 1'));
reset role;
-- Ben (Shopfloor) normally edits his own tasks; take every task grant away so only the "assigned to me" rule is left.
delete from public.role_permissions where (permission like 'tasks.%' or permission like 'initiatives.%') and role_id = (select id from public.roles where name = 'Shopfloor');
select public.checklist_apply_template(id, '00000000-0000-4000-8000-000000000001') from public.tasks where title in ('Assigned to Ben', 'Inspection for the role');
select id as default_task from public.tasks where title = 'Default list task' \gset
select pg_temp.as_user('ben.keller@example.com');
select '37 assignee without any task grant sees the task (a task without a route step role)', count(*) from public.tasks where title = 'Assigned to Ben';
select '38 ... and not the others', count(*) from public.tasks where title in ('Inspection for the role', 'Default list task');
select '39 assignee can comment', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tasks', id), 'on it', auth.uid() from public.tasks where title = 'Assigned to Ben'$q$);
select '40 assignee sees the feed', count(*) from public.messages where conversation_id in (select id from public.conversations where anchor_id = (select id from public.tasks where title = 'Assigned to Ben'));
select '41 assignee cannot comment on a task of someone else', pg_temp.attempt('insert into public.messages (conversation_id, body, author_user_id) values (public.conversation_get_or_create(''tasks'', ' || quote_literal(:'default_task') || '), ''hi'', auth.uid())');
with u as (update public.tasks set title = 'changed' where title = 'Assigned to Ben' returning 1) select '42 assignee cannot edit the task itself (expect 0 rows)', count(*) from u;
reset role;
select pg_temp.as_user('ben.keller@example.com');
select '43 assignee answers an item', pg_temp.attempt($q$update public.task_checklist_items set done = true where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Assigned to Ben')$q$);
select '44 ... it is saved', done from public.task_checklist_items where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Assigned to Ben');
select '45 assignee cannot rename an item', pg_temp.attempt($q$update public.task_checklist_items set label = 'tampered' where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Assigned to Ben')$q$);
select '46 assignee cannot add an item', pg_temp.attempt($q$insert into public.task_checklist_items (task_id, sort_order, kind, label) select id, 99, 'check', 'extra' from public.tasks where title = 'Assigned to Ben'$q$);
with d as (delete from public.task_checklist_items where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Assigned to Ben') returning 1) select '47 assignee cannot delete an item (expect 0 rows)', count(*) from d;
select '48 assignee cannot swap the template', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title = 'Assigned to Ben'), null)$q$);
reset role;
-- the holder of the current step's role (Workshop) at another site
select pg_temp.as_user('paul.meier@example.com');
select '49 role holder sees the task on an asset without a grant', count(*) from public.tasks where title = 'Inspection for the role';
select '50 role holder answers an item', pg_temp.attempt($q$update public.task_checklist_items set done = true where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Inspection for the role')$q$);
select '51 role holder cannot restructure', pg_temp.attempt($q$update public.task_checklist_items set required = false where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Inspection for the role')$q$);
select '52 role holder can comment', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tasks', id), 'checked', auth.uid() from public.tasks where title = 'Inspection for the role'$q$);
reset role;
select pg_temp.as_user('ben.keller@example.com');
select '53 holder of another role does not see it (expect 0)', count(*) from public.tasks where title = 'Inspection for the role';
reset role;

-- templates from typed items
select pg_temp.as_user('anna.weber@example.com');
select '54 worker without the grant cannot create a template', pg_temp.attempt($q$select public.checklist_template_create('Nope', '[{"kind":"check","label":"x"}]')$q$);
select pg_temp.as_user('tom.berger@example.com');
select '55 manager creates a template from items', public.checklist_template_create('From typed items', '[{"kind":"check","label":"A"},{"kind":"check","label":""},{"kind":"heading","label":"B","required":true}]') is not null;
select '56 template has 2 items, heading not required', count(*), bool_or(kind = 'heading' and required) from public.checklist_template_items i join public.checklist_templates t on t.id = i.template_id where t.name = 'From typed items';
reset role;

-- a list of own ticks only is complete when all ticks are done (not at once)
update public.task_types set default_checklist_template_id = null where key = 'general';
select pg_temp.as_user('anna.weber@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'general'), 'Ticks only');
reset role;
select public.checklist_add_items((select id from public.tasks where title = 'Ticks only'), '[{"label":"one"},{"label":"two"}]');
select pg_temp.as_user('anna.weber@example.com');
select '57 own ticks only: not complete at the start', checklist_completed_at is null from public.tasks where title = 'Ticks only';
update public.task_checklist_items set done = true where label = 'one' and task_id = (select id from public.tasks where title = 'Ticks only');
select '58 ... nor after one of two', checklist_completed_at is null from public.tasks where title = 'Ticks only';
update public.task_checklist_items set done = true where label = 'two' and task_id = (select id from public.tasks where title = 'Ticks only');
select '59 ... complete after both', checklist_completed_at is not null from public.tasks where title = 'Ticks only';
reset role;

-- duplicating a template copies the items in one call
select pg_temp.as_user('tom.berger@example.com');
select public.checklist_template_duplicate('00000000-0000-4000-8000-000000000001', 'Smoke template (copy)') as copy_id \gset
select '60 manager duplicates the smoke template: same items as the source',
  (select count(*) from public.checklist_template_items where template_id = :'copy_id'),
  (select count(*) from public.checklist_template_items where template_id = '00000000-0000-4000-8000-000000000001');
select '61 a blank name is refused', pg_temp.attempt($q$select public.checklist_template_duplicate('00000000-0000-4000-8000-000000000001', ' ')$q$);
reset role;
select pg_temp.as_user('anna.weber@example.com');
select '62 worker cannot duplicate', pg_temp.attempt($q$select public.checklist_template_duplicate('00000000-0000-4000-8000-000000000001', 'Worker copy')$q$);
reset role;
rollback;
