-- Copied from ~/maintenance_tool/supabase/tests/task_grants_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Task grants smoke test (grant type check, scope created): psql -f supabase/tests/task_grants_smoke.sql (local stack). One line per check.
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
-- Ben (Shopfloor) normally edits his own tasks; take every task grant away, then give him test roles.
delete from public.role_permissions where (permission like 'tasks.%' or permission like 'initiatives.%') and role_id = (select id from public.roles where name = 'Shopfloor');
insert into public.roles (id, name) values ('00000000-0000-4000-8000-0000000000a1', 'T Checker'), ('00000000-0000-4000-8000-0000000000a2', 'T Creator'), ('00000000-0000-4000-8000-0000000000a3', 'T Blind');
select '1 the literals are accepted', pg_temp.attempt($q$insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-4000-8000-0000000000a1', 'tasks.view.all'), ('00000000-0000-4000-8000-0000000000a1', 'tasks.check.all'),
  ('00000000-0000-4000-8000-0000000000a2', 'tasks.view.all'), ('00000000-0000-4000-8000-0000000000a2', 'tasks.create.all'), ('00000000-0000-4000-8000-0000000000a2', 'tasks.edit.created'),
  ('00000000-0000-4000-8000-0000000000a3', 'tasks.check.all')$q$);
select '2 an unknown action is refused', pg_temp.attempt($q$insert into public.role_permissions (role_id, permission) values ('00000000-0000-4000-8000-0000000000a1', 'tasks.bogus.all')$q$);
select '3 an unknown scope is refused', pg_temp.attempt($q$insert into public.role_permissions (role_id, permission) values ('00000000-0000-4000-8000-0000000000a1', 'tickets.view.mine')$q$);

insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-000000000001', 'Grant template');
insert into public.checklist_template_items (template_id, sort_order, kind, label, required) values ('00000000-0000-4000-8000-000000000001', 1, 'check', 'Cleaned', true);
select pg_temp.as_user('tom.berger@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'general'), 'Made by Tom');
insert into public.tasks (task_type_id, title, assigned_user_id) values ((select id from public.task_types where key = 'general'), 'Tom assigns to Ben', (select id from public.users where email = 'ben.keller@example.com'));
reset role;
select public.checklist_apply_template(id, '00000000-0000-4000-8000-000000000001') from public.tasks where title in ('Made by Tom', 'Tom assigns to Ben');

-- Checker: view + check, no edit
delete from public.user_roles where user_id = (select id from public.users where email = 'ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values ((select id from public.users where email = 'ben.keller@example.com'), '00000000-0000-4000-8000-0000000000a1');
select pg_temp.as_user('ben.keller@example.com');
select '4 checker sees tasks', count(*) from public.tasks where title in ('Made by Tom', 'Tom assigns to Ben');
update public.task_checklist_items set done = true where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Made by Tom');
select '5 checker ticks an item on a task that is not his', done from public.task_checklist_items where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Made by Tom');
select '6 checker can comment', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tasks', id), 'checked', auth.uid() from public.tasks where title = 'Made by Tom'$q$);
with u as (update public.tasks set priority = 'high' where title = 'Made by Tom' returning 1) select '7 checker cannot edit the task (expect 0)', count(*) from u;
select '8 checker cannot restructure the list', pg_temp.attempt($q$update public.task_checklist_items set label = 'x' where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Made by Tom')$q$);
select '9 checker cannot choose another checklist', pg_temp.attempt($q$select public.task_set_checklist_template((select id from public.tasks where title = 'Made by Tom'), null)$q$);
reset role;

-- Check without view: the task is not visible, nothing happens (the grants page warns about it)
delete from public.user_roles where user_id = (select id from public.users where email = 'ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values ((select id from public.users where email = 'ben.keller@example.com'), '00000000-0000-4000-8000-0000000000a3');
select pg_temp.as_user('ben.keller@example.com');
select '10 check implies view: both tasks are visible (expect 2)', count(*) from public.tasks where title in ('Made by Tom', 'Tom assigns to Ben');
reset role;

-- Creator: view all, create all, edit only tasks created by himself
delete from public.user_roles where user_id = (select id from public.users where email = 'ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values ((select id from public.users where email = 'ben.keller@example.com'), '00000000-0000-4000-8000-0000000000a2');
select pg_temp.as_user('ben.keller@example.com');
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'general'), 'Made by Ben');
with u as (update public.tasks set priority = 'high' where title = 'Made by Ben' returning 1) select '11 creator edits his own task', count(*) from u;
with u as (update public.tasks set priority = 'high' where title = 'Made by Tom' returning 1) select '12 creator cannot edit a task of someone else (expect 0)', count(*) from u;
with u as (update public.tasks set priority = 'high' where title = 'Tom assigns to Ben' returning 1) select '13 ... nor one that is only assigned to him (expect 0)', count(*) from u;
update public.task_checklist_items set done = true where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Tom assigns to Ben');
select '14 but as assignee he can tick on it', done from public.task_checklist_items where label = 'Cleaned' and task_id = (select id from public.tasks where title = 'Tom assigns to Ben');
select '15 creator can comment on his own task (edit includes check)', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tasks', id), 'mine', auth.uid() from public.tasks where title = 'Made by Ben'$q$);
select '16 creator cannot comment on a task that is neither created nor assigned (expect blocked)', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tasks', id), 'nope', auth.uid() from public.tasks where title = 'Made by Tom'$q$);
reset role;
rollback;
