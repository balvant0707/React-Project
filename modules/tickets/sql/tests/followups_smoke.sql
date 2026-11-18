-- Copied from ~/maintenance_tool/supabase/tests/followups_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Follow-up smoke test: psql -f supabase/tests/followups_smoke.sql (local stack, freshly reset DB). One line per check.
-- Default team per task type, subtask quick links, a number outside its limits as a defect. Runs in a transaction and rolls back.
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

-- default team
select id as team from public.teams order by name limit 1 \gset
update public.task_types set default_team_id = :'team' where key = 'general';
select pg_temp.as_user('anna.weber@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'general'), 'Smoke no team');
insert into public.tasks (task_type_id, title, assigned_user_id) values ((select id from public.task_types where key = 'general'), 'Smoke with person', (select id from public.users where email = 'anna.weber@example.com'));
select '1 a task without team and person gets the default team', team_id = :'team' from public.tasks where title = 'Smoke no team';
select '2 a task assigned to a person keeps no team', team_id is null from public.tasks where title = 'Smoke with person';
-- no default team: the creator is the assignee; team and person cannot both be removed
select pg_temp.as_user('anna.weber@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'inspection'), 'Smoke self assigned');
select '2b a type without default team: the creator becomes the assignee, no team', assigned_user_id = (select id from public.users where email = 'anna.weber@example.com'), team_id is null from public.tasks where title = 'Smoke self assigned';
select '2c clearing team and person of a task is refused', pg_temp.attempt($q$select public.task_plan((select id from public.tasks where title = 'Smoke self assigned'), null, null, null, null)$q$);
select '2d a team alone is enough', pg_temp.attempt($q$select public.task_plan((select id from public.tasks where title = 'Smoke self assigned'), (select id from public.teams order by name limit 1), null, null, null)$q$);
reset role;

-- quick links
select pg_temp.as_user('anna.weber@example.com');
select '3 worker cannot add a quick link', pg_temp.attempt($q$insert into public.task_type_subtask_types (task_type_id, subtask_type_id) values ((select id from public.task_types where key = 'general'), (select id from public.task_types where key = 'purchase_request'))$q$);
reset role;
select pg_temp.as_user('max.wilckens@wilckens.com');
select '4 admin adds a quick link', pg_temp.attempt($q$insert into public.task_type_subtask_types (task_type_id, subtask_type_id) values ((select id from public.task_types where key = 'general'), (select id from public.task_types where key = 'purchase_request'))$q$);
select '5 a type cannot link to itself', pg_temp.attempt($q$insert into public.task_type_subtask_types (task_type_id, subtask_type_id) values ((select id from public.task_types where key = 'general'), (select id from public.task_types where key = 'general'))$q$);
reset role;
select pg_temp.as_user('anna.weber@example.com');
select '6 everyone reads the quick links', count(*) from public.task_type_subtask_types;
reset role;

-- a number outside its limits is a defect
select pg_temp.as_user('tom.berger@example.com');
insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-000000000002', 'Smoke measuring');
insert into public.checklist_template_items (template_id, sort_order, kind, label, unit, min_value, max_value, required)
  values ('00000000-0000-4000-8000-000000000002', 1, 'number', 'Pressure', 'bar', 6, 8, false);
reset role;
select pg_temp.as_user('anna.weber@example.com');
insert into public.tasks (task_type_id, title, asset_id) values ((select id from public.task_types where key = 'general'), 'Smoke measuring task', (select id from public.assets where name = 'Perlmühle 1'));
select public.task_set_checklist_template((select id from public.tasks where title = 'Smoke measuring task'), '00000000-0000-4000-8000-000000000002');
update public.task_checklist_items set value_number = 7 where label = 'Pressure' and task_id = (select id from public.tasks where title = 'Smoke measuring task');
select '7 a value inside the limits cannot become a ticket', pg_temp.attempt($q$select public.checklist_item_create_ticket((select i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Smoke measuring task' and i.label = 'Pressure'))$q$);
update public.task_checklist_items set value_number = 9.5 where label = 'Pressure' and task_id = (select id from public.tasks where title = 'Smoke measuring task');
select '8 a value outside the limits becomes a ticket', public.checklist_item_create_ticket((select i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Smoke measuring task' and i.label = 'Pressure'), null, 'high') is not null;
select '9 the ticket names the value and the limits', k.type, k.description like '%Measured value: 9.5 bar (limits 6 to 8)%'
  from public.task_checklist_items i join public.tickets k on k.id = i.ticket_id join public.tasks t on t.id = i.task_id where t.title = 'Smoke measuring task';
select '10 no second ticket', pg_temp.attempt($q$select public.checklist_item_create_ticket((select i.id from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Smoke measuring task' and i.label = 'Pressure'))$q$);
reset role;
rollback;
