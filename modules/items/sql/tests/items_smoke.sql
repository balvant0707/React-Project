-- Copied from ~/maintenance_tool/supabase/tests/items_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Items smoke test (~/maintenance_tool/docs/items.md, migrations 20261026100000_items.sql, 20261028100000_item_photos.sql):
--   docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/items_smoke.sql
-- Local stack, seeded DB. Runs in one transaction and is rolled back. One line per check.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.attempt(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO ERROR (allowed)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to public;
begin;

-- Fixtures (as the engine, no auth user): an asset with a child, a maintenance task for anna on the child.
select set_config('test.anna', (select id::text from public.users where email = 'anna.weber@example.com'), true);
select set_config('test.root', (select id::text from public.assets where parent_asset_id is null order by path limit 1), true);
select set_config('test.child', (select id::text from public.assets where parent_asset_id = current_setting('test.root')::uuid order by path limit 1), true);
insert into public.tasks (id, task_type_id, title, asset_id, assigned_user_id, due_date)
select '00000000-0000-4000-8000-00000000e001', id, 'Replace bearing', current_setting('test.child')::uuid,
       current_setting('test.anna')::uuid, current_date + 5
from public.task_types where key = 'maintenance';
-- Maintenance offers spare parts and consumables only (as in the local seed).
insert into public.task_type_item_categories (task_type_id, category_phrase_id)
select tt.id, ph.id from public.task_types tt join public.phrases ph on ph.category = 'item_category' and ph.code in ('spare_part', 'consumable')
where tt.key = 'maintenance' on conflict do nothing;
select set_config('test.spare', (select id::text from public.phrases where category = 'item_category' and code = 'spare_part'), true);
select set_config('test.lab', (select id::text from public.phrases where category = 'item_category' and code = 'lab_supplies'), true);

-- ---------------------------------------------------------------------------------- catalogue (manager)
select pg_temp.as_user('tom.berger@example.com');
select '1 manager adds a supplier', pg_temp.attempt($q$insert into public.suppliers (id, name) values ('00000000-0000-4000-8000-00000000e101', 'Fa. Lager GmbH')$q$);
select '2 manager adds a part', pg_temp.attempt(format($q$insert into public.items (id, item_number, name, category_phrase_id, manufacturer, manufacturer_item_number, supplier_id, lead_time_days, is_critical, erp_item_number)
  values ('00000000-0000-4000-8000-00000000e201', 'SP-TEST-1', 'Deep groove ball bearing 6205', %L, 'SKF', '6205-2RSH', '00000000-0000-4000-8000-00000000e101', 10, true, '900100')$q$, current_setting('test.spare')));
insert into public.items (id, item_number, name, category_phrase_id) values ('00000000-0000-4000-8000-00000000e202', 'SP-TEST-2', 'V-belt SPZ 1000', current_setting('test.spare')::uuid);
insert into public.items (id, item_number, name, category_phrase_id) values ('00000000-0000-4000-8000-00000000e203', 'SP-TEST-LAB', 'Beaker 250 ml', current_setting('test.lab')::uuid);
select '3 manager sets a price', pg_temp.attempt($q$insert into public.item_prices (item_id, unit_price) values ('00000000-0000-4000-8000-00000000e201', 12.50), ('00000000-0000-4000-8000-00000000e202', 8)$q$);
select '4 manager lists the part on the child asset', pg_temp.attempt(format($q$insert into public.asset_items (asset_id, item_id, quantity_installed, position_note) values (%L, '00000000-0000-4000-8000-00000000e201', 2, 'drive side')$q$, current_setting('test.child')));
select '5 parts list of the root incl. subtree has the part (expect t)', exists (select 1 from public.asset_items_for(current_setting('test.root')::uuid, true) where item_id = '00000000-0000-4000-8000-00000000e201');
select '6 ... without subtree it does not (expect f)', exists (select 1 from public.asset_items_for(current_setting('test.root')::uuid, false) where item_id = '00000000-0000-4000-8000-00000000e201');
select '7 manager sees the price (expect 12.50)', (select unit_price from public.items_overview where id = '00000000-0000-4000-8000-00000000e201');
select '8 global search finds the manufacturer number (expect t)', exists (select 1 from public.global_search('6205-2RSH') where entity_type = 'items');
reset role;

-- ---------------------------------------------------------------------------------- workshop
select pg_temp.as_user('anna.weber@example.com');
select '9 workshop reads the catalogue (expect 3)', (select count(*) from public.items where item_number like 'SP-TEST-%');
select '10 workshop sees no price (expect null, 0)', (select unit_price from public.items_overview where id = '00000000-0000-4000-8000-00000000e201'), (select count(*) from public.item_prices);
-- items.edit belongs to Manager, Purchasing and Workshop; the shop floor has none of it.
select pg_temp.as_user('ben.keller@example.com');
select '11 shopfloor cannot add a part', pg_temp.attempt($q$insert into public.items (item_number, name) values ('SP-X', 'x')$q$);
select '12 shopfloor cannot change a parts list', pg_temp.attempt(format($q$insert into public.asset_items (asset_id, item_id) values (%L, '00000000-0000-4000-8000-00000000e202')$q$, current_setting('test.child')));
select pg_temp.as_user('anna.weber@example.com');
select '13 assignee adds a missing part', pg_temp.attempt($q$insert into public.task_items (id, task_id, item_id, quantity, state) values ('00000000-0000-4000-8000-00000000e301', '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e201', 2, 'needed')$q$);
insert into public.task_items (id, task_id, item_id, quantity, state) values ('00000000-0000-4000-8000-00000000e302', '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e202', 1, 'needed');
select '14 cannot set the order link by hand', pg_temp.attempt($q$update public.task_items set purchase_task_id = '00000000-0000-4000-8000-00000000e001' where id = '00000000-0000-4000-8000-00000000e301'$q$);
select '15 items_waiting on the task (expect 2)', (select items_waiting from public.tasks_overview where id = '00000000-0000-4000-8000-00000000e001');
reset role;

-- Two purchase request subtasks, as the task form would create them.
insert into public.tasks (id, task_type_id, title, parent_task_id, asset_id, assigned_user_id)
select v.id, tt.id, v.title, '00000000-0000-4000-8000-00000000e001', current_setting('test.child')::uuid, current_setting('test.anna')::uuid
from public.task_types tt, (values ('00000000-0000-4000-8000-00000000e002'::uuid, 'Order bearing'), ('00000000-0000-4000-8000-00000000e003'::uuid, 'Order belt')) v (id, title)
where tt.key = 'purchase_request';

select pg_temp.as_user('anna.weber@example.com');
select '16 order links a line', pg_temp.attempt($q$select public.task_items_order('00000000-0000-4000-8000-00000000e002', array['00000000-0000-4000-8000-00000000e301'::uuid])$q$);
select '17 the same line cannot be ordered twice', pg_temp.attempt($q$select public.task_items_order('00000000-0000-4000-8000-00000000e003', array['00000000-0000-4000-8000-00000000e301'::uuid])$q$);
select '18 the second order links the belt', pg_temp.attempt($q$select public.task_items_order('00000000-0000-4000-8000-00000000e003', array['00000000-0000-4000-8000-00000000e302'::uuid])$q$);
with d as (delete from public.task_items where id = '00000000-0000-4000-8000-00000000e301' returning 1)
select '19 an ordered line cannot be deleted (expect 0)', count(*) from d;
select '20 feed of the task shows the order (expect 2)', (select count(*) from public.activity_events where entity_id = '00000000-0000-4000-8000-00000000e001' and event_type = 'items_ordered');
reset role;

-- The first order reaches the purchasing step.
select set_config('app.task_engine', 'on', true);
update public.tasks set current_step_key = 'purchasing', status = 'waiting_for_procurement',
       current_assignee_role_id = (select id from public.roles where name = 'Purchasing')
where id = '00000000-0000-4000-8000-00000000e002';
select set_config('app.task_engine', 'off', true);
select pg_temp.as_user('lena.fischer@example.com');
select '21 purchasing (step role) sees the lines of the order (expect 1)', (select count(*) from public.task_items_overview where purchase_task_id = '00000000-0000-4000-8000-00000000e002');
reset role;

-- The engine completes the first order and cancels the second.
select set_config('app.task_engine', 'on', true);
update public.tasks set status = 'done', completed_at = now() where id = '00000000-0000-4000-8000-00000000e002';
update public.tasks set status = 'cancelled' where id = '00000000-0000-4000-8000-00000000e003';
select set_config('app.task_engine', 'off', true);
select '22 the completed order marks the line arrived (expect t)', (select arrived_at is not null from public.task_items where id = '00000000-0000-4000-8000-00000000e301');
select '23 the cancelled order releases its line (expect t)', (select purchase_task_id is null from public.task_items where id = '00000000-0000-4000-8000-00000000e302');
select '24 the assignee is told the parts arrived (expect 1)', (select count(*) from public.notifications where type = 'items_arrived' and user_id = current_setting('test.anna')::uuid and entity_id = '00000000-0000-4000-8000-00000000e001');
select '25 items_waiting now counts the released belt only (expect 1)', (select items_waiting from public.tasks_overview where id = '00000000-0000-4000-8000-00000000e001');
select '25b the Items page number counts the tasks that wait (expect t)', public.items_waiting_tasks() >= 1;

-- ---------------------------------------------------------------------------------- lead time reminder
-- The belt has no lead time; the bearing (10 days) on a new task due in 5 days must be ordered now.
insert into public.tasks (id, task_type_id, title, asset_id, assigned_user_id, due_date)
select '00000000-0000-4000-8000-00000000e004', id, 'Annual service', current_setting('test.child')::uuid, current_setting('test.anna')::uuid, current_date + 5
from public.task_types where key = 'maintenance';
insert into public.task_items (task_id, item_id, quantity, state) values ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e201', 1, 'planned');
select 'first run', public.send_item_reminders();
select '26 reminder for the task (expect 1)', (select count(*) from public.notifications where type = 'items_order_due' and entity_id = '00000000-0000-4000-8000-00000000e004');
select 'second run', public.send_item_reminders();
select '27 second run sends nothing for it (expect 1, 1)', (select count(*) from public.reminder_log where task_id = '00000000-0000-4000-8000-00000000e004'),
  (select occurrences from public.notifications where type = 'items_order_due' and entity_id = '00000000-0000-4000-8000-00000000e004');

-- ---------------------------------------------------------------------------------- recurring rules
insert into public.recurring_task_rules (id, name, task_type_id, asset_id, schedule_kind, interval_count, start_date, assignment_mode, assigned_user_id)
select '00000000-0000-4000-8000-00000000e401', 'Belt check', id, current_setting('test.child')::uuid, 'monthly', 1, current_date, 'user', current_setting('test.anna')::uuid
from public.task_types where key = 'maintenance';
select pg_temp.as_user('tom.berger@example.com');
select '28 manager adds a planned part to the rule', pg_temp.attempt($q$insert into public.recurring_task_rule_items (recurring_task_rule_id, item_id, quantity) values ('00000000-0000-4000-8000-00000000e401', '00000000-0000-4000-8000-00000000e202', 2)$q$);
reset role;
select pg_temp.as_user('ben.keller@example.com');
with u as (update public.recurring_task_rule_items set quantity = 9 returning 1)
select '29 shopfloor cannot change the rule parts (expect 0)', count(*) from u;
select '30 shopfloor cannot add parts to anna''s task', pg_temp.attempt($q$insert into public.task_items (task_id, item_id) values ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e202')$q$);
reset role;
insert into public.tasks (task_type_id, title, asset_id, recurring_task_rule_id, due_date)
select task_type_id, name, asset_id, id, current_date + 30 from public.recurring_task_rules where id = '00000000-0000-4000-8000-00000000e401';
select '31 a task of the rule gets the planned part (expect planned 2.00)', (select state || ' ' || quantity from public.task_items l join public.tasks t on t.id = l.task_id where t.recurring_task_rule_id = '00000000-0000-4000-8000-00000000e401');

-- ---------------------------------------------------------------------------------- parts cost
-- The bearing was ordered (counted through the invoice), the belt is taken from the shelf (counted at 8.00).
select pg_temp.as_user('anna.weber@example.com');
update public.task_items set state = 'used' where task_id = '00000000-0000-4000-8000-00000000e001';
reset role;
select set_config('app.task_engine', 'on', true);
update public.tasks set status = 'done', completed_at = now() where id = '00000000-0000-4000-8000-00000000e001';
select set_config('app.task_engine', 'off', true);
select pg_temp.as_user('tom.berger@example.com');
select '32 manager: parts cost counts the shelf part only (expect 8.00)', (select items_cost from public.maintenance_stats(current_date - 1, current_date) where asset_id = current_setting('test.child')::uuid);
reset role;
select pg_temp.as_user('anna.weber@example.com');
select '33 workshop: no parts cost without costs.view (expect 0)', (select coalesce(sum(items_cost), 0) from public.maintenance_stats(current_date - 1, current_date));
reset role;
select pg_temp.as_user('ben.keller@example.com');
with d as (delete from public.items where id = '00000000-0000-4000-8000-00000000e202' returning 1)
select '34 shop floor cannot delete a part (expect 0)', count(*) from d;
reset role;
select pg_temp.as_user('tom.berger@example.com');
select '35 a part on a task cannot be deleted, only deactivated', pg_temp.attempt($q$delete from public.items where id = '00000000-0000-4000-8000-00000000e202'$q$);
reset role;

-- ---------------------------------------------------------------------------------- without items.view
-- The workshop role loses the right: no hint, no notifications.
delete from public.role_permissions where permission = 'items.view' and role_id = (select id from public.roles where name = 'Workshop');
insert into public.tasks (id, task_type_id, title, asset_id, assigned_user_id, due_date)
select '00000000-0000-4000-8000-00000000e005', id, 'No parts right', current_setting('test.child')::uuid, current_setting('test.anna')::uuid, current_date + 3
from public.task_types where key = 'maintenance';
insert into public.tasks (id, task_type_id, title, parent_task_id, assigned_user_id)
select '00000000-0000-4000-8000-00000000e006', id, 'Order for no parts right', '00000000-0000-4000-8000-00000000e005', current_setting('test.anna')::uuid
from public.task_types where key = 'purchase_request';
insert into public.task_items (task_id, item_id, quantity, state) values ('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-00000000e201', 1, 'needed');
select pg_temp.as_user('anna.weber@example.com');
select '36 without the right: items_waiting is null (expect t)', (select items_waiting is null from public.tasks_overview where id = '00000000-0000-4000-8000-00000000e005');
select '37 ... and the lines are not readable through the view (expect 0)', (select count(*) from public.task_items_overview where task_id = '00000000-0000-4000-8000-00000000e005');
reset role;
select 'run', public.send_item_reminders();
select '38 no lead time reminder without the right (expect 0)', (select count(*) from public.notifications where type = 'items_order_due' and entity_id = '00000000-0000-4000-8000-00000000e005');
select set_config('app.items_internal', 'on', true);
update public.task_items set purchase_task_id = '00000000-0000-4000-8000-00000000e006' where task_id = '00000000-0000-4000-8000-00000000e005';
select set_config('app.items_internal', 'off', true);
select set_config('app.task_engine', 'on', true);
update public.tasks set status = 'done', completed_at = now() where id = '00000000-0000-4000-8000-00000000e006';
select set_config('app.task_engine', 'off', true);
select '39 arrival marked but nobody without the right is notified (expect t, 0)', (select arrived_at is not null from public.task_items where task_id = '00000000-0000-4000-8000-00000000e005'),
  (select count(*) from public.notifications where type = 'items_arrived' and entity_id = '00000000-0000-4000-8000-00000000e005');

-- ---------------------------------------------------------------------------------- what a task type does with items
select '40 item modes (expect inspection=use,maintenance=use,purchase_request=order)', (select string_agg(key || '=' || item_mode, ',' order by key) from public.task_types where item_mode <> 'none');
insert into public.tasks (id, task_type_id, title, assigned_user_id)
select '00000000-0000-4000-8000-00000000e007', id, 'General task', (select id from public.users where email = 'tom.berger@example.com')
from public.task_types where key = 'general';
select pg_temp.as_user('tom.berger@example.com');
select '41 a general task refuses items', pg_temp.attempt($q$insert into public.task_items (task_id, item_id) values ('00000000-0000-4000-8000-00000000e007', '00000000-0000-4000-8000-00000000e202')$q$);
reset role;
update public.recurring_task_rules set task_type_id = (select id from public.task_types where key = 'general') where id = '00000000-0000-4000-8000-00000000e401';
insert into public.tasks (task_type_id, title, recurring_task_rule_id, due_date)
select task_type_id, 'Rule now general', id, current_date + 60 from public.recurring_task_rules where id = '00000000-0000-4000-8000-00000000e401';
select '42 a rule switched to a type without items copies none (expect 0)', (select count(*) from public.task_items l join public.tasks t on t.id = l.task_id where t.title = 'Rule now general');

-- ---------------------------------------------------------------------------------- free text and categories
-- Back to a role with the right.
insert into public.role_permissions (role_id, permission) select id, 'items.view' from public.roles where name = 'Workshop' on conflict do nothing;
select pg_temp.as_user('anna.weber@example.com');
select '43 a free-text line on a maintenance task', pg_temp.attempt($q$insert into public.task_items (id, task_id, description, quantity, supplier_id) values ('00000000-0000-4000-8000-00000000e303', '00000000-0000-4000-8000-00000000e004', 'Special grease 400 g', 2, '00000000-0000-4000-8000-00000000e101')$q$);
select '44 a line is an item or free text, not both', pg_temp.attempt($q$insert into public.task_items (task_id, item_id, description) values ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e202', 'x')$q$);
select '45 maintenance does not offer lab supplies', pg_temp.attempt($q$insert into public.task_items (task_id, item_id) values ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e203')$q$);
select '46 the overview shows the free text with its supplier (expect Special grease 400 g | Fa. Lager GmbH)', (select item_name || ' | ' || supplier_name from public.task_items_overview where id = '00000000-0000-4000-8000-00000000e303');

-- ---------------------------------------------------------------------------------- a purchase request with its own lines
insert into public.tasks (id, task_type_id, title) select '00000000-0000-4000-8000-00000000e008', id, 'Lab and hygiene order' from public.task_types where key = 'purchase_request';
select '47 own lines on a purchase request: free text and a lab item', pg_temp.attempt($q$insert into public.task_items (id, task_id, item_id, description, quantity, state) values ('00000000-0000-4000-8000-00000000e304', '00000000-0000-4000-8000-00000000e008', null, 'Toilet paper, 3 ply', 3, 'used'), ('00000000-0000-4000-8000-00000000e305', '00000000-0000-4000-8000-00000000e008', '00000000-0000-4000-8000-00000000e203', null, 1, 'needed')$q$);
select '48 own lines are ordered by the request itself and stay needed (expect 2 2)', (select count(*) from public.task_items where task_id = '00000000-0000-4000-8000-00000000e008' and purchase_task_id = task_id), (select count(*) from public.task_items where task_id = '00000000-0000-4000-8000-00000000e008' and state = 'needed');
select '49 they do not count as waiting (expect 0)', (select items_waiting from public.tasks_overview where id = '00000000-0000-4000-8000-00000000e008');
with d as (delete from public.task_items where id = '00000000-0000-4000-8000-00000000e304' returning 1)
select '50 an own line can be removed (expect 1)', count(*) from d;
reset role;
select set_config('app.task_engine', 'on', true);
update public.tasks set status = 'done', completed_at = now() where id = '00000000-0000-4000-8000-00000000e008';
select set_config('app.task_engine', 'off', true);
select '51 completing the request marks its own lines arrived (expect t)', (select bool_and(arrived_at is not null) from public.task_items where task_id = '00000000-0000-4000-8000-00000000e008');

-- Only a type that orders items can order the lines of another task.
insert into public.tasks (id, task_type_id, title, parent_task_id) select '00000000-0000-4000-8000-00000000e009', id, 'General subtask', '00000000-0000-4000-8000-00000000e004' from public.task_types where key = 'general';
insert into public.task_items (id, task_id, item_id, state) values ('00000000-0000-4000-8000-00000000e306', '00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e202', 'needed');
select pg_temp.as_user('anna.weber@example.com');
select '52 a general subtask cannot order items', pg_temp.attempt($q$select public.task_items_order('00000000-0000-4000-8000-00000000e009', array['00000000-0000-4000-8000-00000000e306'::uuid])$q$);
reset role;

-- A rule on the purchase request (the monthly hygiene order) copies its items as lines the request orders.
insert into public.recurring_task_rules (id, name, task_type_id, schedule_kind, interval_count, start_date, assignment_mode, assigned_user_id)
select '00000000-0000-4000-8000-00000000e402', 'Monthly lab order', id, 'monthly', 1, current_date, 'user', current_setting('test.anna')::uuid
from public.task_types where key = 'purchase_request';
insert into public.recurring_task_rule_items (recurring_task_rule_id, item_id, quantity) values ('00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000e203', 4);
insert into public.tasks (task_type_id, title, recurring_task_rule_id, due_date)
select task_type_id, 'Lab order of the month', id, current_date + 10 from public.recurring_task_rules where id = '00000000-0000-4000-8000-00000000e402';
select '53 the request of the rule orders the item itself (expect needed t)', (select l.state || ' ' || (l.purchase_task_id = l.task_id) from public.task_items l join public.tasks t on t.id = l.task_id where t.title = 'Lab order of the month');
-- ---------------------------------------------------------------------------------- photos
select pg_temp.as_user('tom.berger@example.com');
select '54 manager adds two photos and a data sheet', pg_temp.attempt($q$insert into public.attachments (id, entity_type, entity_id, storage_path, thumbnail_path, file_name, mime_type, size_bytes, created_at) values
  ('00000000-0000-4000-8000-00000000e501', 'items', '00000000-0000-4000-8000-00000000e201', 'items/00000000-0000-4000-8000-00000000e201/a.jpg', 'items/00000000-0000-4000-8000-00000000e201/a-thumb.jpg', 'a.jpg', 'image/jpeg', 10, now() - interval '2 minutes'),
  ('00000000-0000-4000-8000-00000000e502', 'items', '00000000-0000-4000-8000-00000000e201', 'items/00000000-0000-4000-8000-00000000e201/b.jpg', null, 'b.jpg', 'image/jpeg', 10, now() - interval '1 minute'),
  ('00000000-0000-4000-8000-00000000e503', 'items', '00000000-0000-4000-8000-00000000e201', 'items/00000000-0000-4000-8000-00000000e201/sheet.pdf', null, 'sheet.pdf', 'application/pdf', 10, now() - interval '3 minutes')$q$);
select '55 a thumbnail must sit next to its original', pg_temp.attempt($q$insert into public.attachments (entity_type, entity_id, storage_path, thumbnail_path, file_name, mime_type, size_bytes) values ('items', '00000000-0000-4000-8000-00000000e201', 'items/00000000-0000-4000-8000-00000000e201/c.jpg', 'items/00000000-0000-4000-8000-00000000e202/c-thumb.jpg', 'c.jpg', 'image/jpeg', 10)$q$);
select '56 without a main photo the first image shows, by its thumbnail (expect a.jpg a-thumb.jpg)', (select split_part(photo_path, '/', 3) || ' ' || split_part(photo_thumbnail_path, '/', 3) from public.items_overview where id = '00000000-0000-4000-8000-00000000e201');
select '57 a data sheet cannot be the main photo', pg_temp.attempt($q$update public.items set photo_attachment_id = '00000000-0000-4000-8000-00000000e503' where id = '00000000-0000-4000-8000-00000000e201'$q$);
select '58 a photo of another item cannot be the main photo', pg_temp.attempt($q$update public.items set photo_attachment_id = '00000000-0000-4000-8000-00000000e501' where id = '00000000-0000-4000-8000-00000000e202'$q$);
select '59 manager sets the main photo', pg_temp.attempt($q$update public.items set photo_attachment_id = '00000000-0000-4000-8000-00000000e502' where id = '00000000-0000-4000-8000-00000000e201'$q$);
select '60 the main photo shows; without a thumbnail the original (expect b.jpg b.jpg)', (select split_part(photo_path, '/', 3) || ' ' || split_part(photo_thumbnail_path, '/', 3) from public.items_overview where id = '00000000-0000-4000-8000-00000000e201');
select '61 the photo shows in the parts list (expect b.jpg)', (select max(split_part(photo_thumbnail_path, '/', 3)) from public.asset_items_overview where item_id = '00000000-0000-4000-8000-00000000e201');
select pg_temp.as_user('anna.weber@example.com');
select '61b workshop sees it on her task lines (expect b.jpg)', (select max(split_part(photo_thumbnail_path, '/', 3)) from public.task_items_overview where item_id = '00000000-0000-4000-8000-00000000e201');
select '62 workshop cannot choose the main photo (RLS updates nothing; expect b.jpg)', pg_temp.attempt($q$update public.items set photo_attachment_id = '00000000-0000-4000-8000-00000000e501' where id = '00000000-0000-4000-8000-00000000e201'$q$), (select split_part(photo_path, '/', 3) from public.items_overview where id = '00000000-0000-4000-8000-00000000e201');
reset role;
delete from public.attachments where id = '00000000-0000-4000-8000-00000000e502';
select '63 deleting the main photo falls back to the first image (expect a.jpg)', (select split_part(photo_path, '/', 3) from public.items_overview where id = '00000000-0000-4000-8000-00000000e201');
-- ---------------------------------------------------------------------------------- review fixes (20261029100000)
select pg_temp.as_user('anna.weber@example.com');
select '64 user_sees_items is not callable by a signed-in user (expect blocked)', pg_temp.attempt($q$select public.user_sees_items('00000000-0000-4000-8000-000000000000')$q$);
select '65 saving used lines is all or nothing (expect blocked)',
  pg_temp.attempt($q$select public.task_items_save_used('00000000-0000-4000-8000-00000000e001', '[{"line_id":"00000000-0000-4000-8000-00000000e301","quantity":7},{"line_id":"00000000-0000-4000-8000-0000000000ff","quantity":1}]'::jsonb)$q$);
select '65b ... and the first line was not changed (expect f)', (select quantity = 7 from public.task_items where id = '00000000-0000-4000-8000-00000000e301');
select '66 saving used lines: an existing line and a new catalogue line (expect 2)',
  public.task_items_save_used('00000000-0000-4000-8000-00000000e001', '[{"line_id":"00000000-0000-4000-8000-00000000e301","quantity":3},{"line_id":null,"item_id":"00000000-0000-4000-8000-00000000e201","quantity":1}]'::jsonb);
select '66b ... both are used (expect used 3.00)', (select state || ' ' || quantity from public.task_items where id = '00000000-0000-4000-8000-00000000e301');
reset role;
select set_config('app.task_engine', 'on', true);
update public.tasks set status = 'done' where id = '00000000-0000-4000-8000-00000000e008';
select '67 a finished ordering task takes no new line (expect blocked)', pg_temp.attempt($q$insert into public.task_items (task_id, description) values ('00000000-0000-4000-8000-00000000e008', 'late')$q$);
rollback;
