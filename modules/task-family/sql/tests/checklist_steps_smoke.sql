-- Copied from ~/maintenance_tool/supabase/tests/checklist_steps_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Checklist steps smoke test: psql -f supabase/tests/checklist_steps_smoke.sql (local stack, freshly reset DB). One line per check.
-- Items by route step: a template names the task type of its steps, tasks copy the step keys only for that type.
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

select pg_temp.as_user('tom.berger@example.com');
insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-000000000003', 'Smoke steps');
select '1 a step item needs a template with a task type', pg_temp.attempt($q$insert into public.checklist_template_items (template_id, sort_order, kind, label, step_key) values ('00000000-0000-4000-8000-000000000003', 1, 'check', 'Order placed', 'purchasing')$q$);
update public.checklist_templates set task_type_id = (select id from public.task_types where key = 'purchase_request') where id = '00000000-0000-4000-8000-000000000003';
select '2 a step of the template type is accepted', pg_temp.attempt($q$insert into public.checklist_template_items (template_id, sort_order, kind, label, step_key) values ('00000000-0000-4000-8000-000000000003', 1, 'check', 'Order placed', 'purchasing')$q$);
select '3 an unknown step is refused', pg_temp.attempt($q$insert into public.checklist_template_items (template_id, sort_order, kind, label, step_key) values ('00000000-0000-4000-8000-000000000003', 2, 'check', 'Nonsense', 'nope')$q$);
insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-000000000003', 3, 'check', 'Whole task');
reset role;

-- Tom creates the tasks: a requester who is not the step's actor may not change the checklist of a purchase request
-- (20261212100000_assigned_scope.sql), and this test is about the step keys, not about who may set a template.
select pg_temp.as_user('tom.berger@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'purchase_request'), 'Smoke purchase');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'general'), 'Smoke general');
select public.task_set_checklist_template((select id from public.tasks where title = 'Smoke purchase'), '00000000-0000-4000-8000-000000000003');
select public.task_set_checklist_template((select id from public.tasks where title = 'Smoke general'), '00000000-0000-4000-8000-000000000003');
select '4 a task of the template type copies the step', i.label, i.step_key from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Smoke purchase' order by i.sort_order;
select '5 a task of another type drops the steps', count(*), count(i.step_key) from public.task_checklist_items i join public.tasks t on t.id = i.task_id where t.title = 'Smoke general';
reset role;

select pg_temp.as_user('tom.berger@example.com');
update public.checklist_templates set task_type_id = (select id from public.task_types where key = 'general') where id = '00000000-0000-4000-8000-000000000003';
select '6 another task type clears the steps of the items', count(*), count(step_key) from public.checklist_template_items where template_id = '00000000-0000-4000-8000-000000000003';
reset role;
rollback;

-- Required items of a step hold that step (migration 20261215110000_checklist_step_guard.sql), checked when the step's
-- history row is left. Own transaction; run as the owner on the rows themselves, so the actor rules of the route do not
-- get in the way.
begin;
select pg_temp.as_user('anna.weber@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'purchase_request'), 'Smoke purchase');
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.task_checklist_items (task_id, sort_order, kind, label, required, step_key)
select id, 10, 'check', 'Quote attached', true, 'request' from public.tasks where title = 'Smoke purchase';
select '7 a forward action is refused while a required item of the step is open', pg_temp.attempt($q$update public.task_step_history set left_at = now(), action_key = 'send' where task_id = (select id from public.tasks where title = 'Smoke purchase') and left_at is null$q$);
select '8 cancelling stays possible (expect NO ERROR)', pg_temp.attempt($q$update public.task_step_history set left_at = now(), action_key = 'cancel' where task_id = (select id from public.tasks where title = 'Smoke purchase') and left_at is null$q$);
update public.task_step_history set left_at = null, action_key = null where task_id = (select id from public.tasks where title = 'Smoke purchase') and step_key = 'request';
update public.task_checklist_items set done = true where label = 'Quote attached';
select '9 ticked: the forward action passes (expect NO ERROR)', pg_temp.attempt($q$update public.task_step_history set left_at = now(), action_key = 'send' where task_id = (select id from public.tasks where title = 'Smoke purchase') and left_at is null$q$);
insert into public.task_step_history (task_id, step_key) select id, 'approval' from public.tasks where title = 'Smoke purchase';
insert into public.task_checklist_items (task_id, sort_order, kind, label, required, step_key)
select id, 11, 'check', 'Budget checked', true, 'approval' from public.tasks where title = 'Smoke purchase';
select '10 a negative action (reject) passes an open item (expect NO ERROR)', pg_temp.attempt($q$update public.task_step_history set left_at = now(), action_key = 'reject' where task_id = (select id from public.tasks where title = 'Smoke purchase') and left_at is null$q$);
rollback;
