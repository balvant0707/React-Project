-- Copied from ~/maintenance_tool/supabase/tests/task_types_purpose_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Task type purpose, default types and initiative switch smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/task_types_purpose_smoke.sql
-- (rolls back). Built-in types cannot be deleted, renamed (key) or un-flagged; other types can be deleted.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.rows(p_sql text) returns text language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v::text || ' row(s)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to public;
begin;

select '1 the leave type has the purpose leave and its route fulfils the contract', (select purpose from public.task_types where key = 'leave'), (select public.task_type_purpose_problems(id) from public.task_types where key = 'leave');

select pg_temp.as_user('max.wilckens@wilckens.com');
select '2 admin cannot delete a type with a purpose (blocked)', pg_temp.rows($$delete from public.task_types where purpose = 'leave'$$);
select '4 admin cannot delete the default task type (blocked: tasks use it; without tasks the foreign key from app_settings blocks it)', pg_temp.rows($$delete from public.task_types where id = (select nullif(value, '')::uuid from public.app_settings where key = 'default_task_type_id')$$);
select '5 an own type can be created and deleted (1 row each)', pg_temp.rows($$insert into public.task_types (key, name) values ('smoke_own', 'Smoke')$$), pg_temp.rows($$delete from public.task_types where key = 'smoke_own'$$);
select '6 the type an absence type uses keeps its purpose (blocked)', pg_temp.rows($$update public.task_types set purpose = null where key = 'leave'$$);
reset role;
-- Several types per purpose (migration 20261221100000_absence_types.sql): leave is "multiple" and "system_created".
insert into public.task_types (key, name, purpose) values ('smoke_leave', 'Smoke leave', 'leave');
select '3 a second type takes the multiple purpose leave and becomes system_created', (select system_created from public.task_types where key = 'smoke_leave');
insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, is_decision, assignee_kind, actions)
select id, 'decide', 1, 'Decide', 'open', true, 'requester_supervisor', '[{"key": "approve", "to": null, "kind": "positive"}]' from public.task_types where key = 'smoke_leave';
select '7 problems of a route without the hooks (leave_withdraw, and leave_decide on the decision step)', (select public.task_type_purpose_problems(id) from public.task_types where key = 'smoke_leave');
select '8 task_type_for_purpose refuses a multiple purpose (blocked)', pg_temp.rows($$select public.task_type_for_purpose('leave')$$);
insert into public.task_type_purposes (key, description) values ('smoke_single', 'Smoke');
update public.task_types set purpose = 'smoke_single' where key = 'smoke_leave';
insert into public.task_types (key, name) values ('smoke_single_2', 'Smoke 2');
select '8b a single-type purpose stays unique (blocked)', pg_temp.rows($$update public.task_types set purpose = 'smoke_single' where key = 'smoke_single_2'$$);
select '8c a type with tasks cannot change its purpose (blocked)', pg_temp.rows($$update public.task_types set purpose = 'smoke_single' where key = 'general'$$);
update public.task_types set purpose = null where key = 'smoke_leave';
select '8d dropping the purpose gives the type back to the pickers (f)', (select system_created from public.task_types where key = 'smoke_leave');
rollback;

-- The purpose of a type is for administrators only, even for somebody who may edit all types.
begin;
insert into public.role_permissions (role_id, permission) select id, 'task_types.edit.all' from public.roles where name = 'Manager' on conflict do nothing;
select pg_temp.as_user('tom.berger@example.com');
select '13 a non-admin type editor cannot set a purpose (blocked)', pg_temp.rows($$update public.task_types set purpose = 'leave' where key = 'general'$$);
select '14 a non-admin type editor still edits the type (1 row)', pg_temp.rows($$update public.task_types set description = 'x' where key = 'general'$$);
rollback;

-- The initiative switch (migration 20261116100000_initiative_flag.sql)
begin;
select pg_temp.as_user('max.wilckens@wilckens.com');
select '9 a task of any type can be an initiative and then belongs to the module initiative',
  pg_temp.rows($$insert into public.tasks (task_type_id, is_initiative, title, due_date) values ((select id from public.task_types where key = 'general'), true, 'Switch smoke', current_date)$$);
select '9b ... module', (select permission_module from public.tasks where title = 'Switch smoke');
select '10 turning it off works without goal or buckets (1 row), the module follows',
  pg_temp.rows($$update public.tasks set is_initiative = false where title = 'Switch smoke'$$);
select '10b ... module', (select permission_module from public.tasks where title = 'Switch smoke');
select '11 a subtask cannot be turned into an initiative (blocked)',
  pg_temp.rows($$update public.tasks set is_initiative = true where parent_task_id is not null$$);
select '12 with a goal, turning it off is refused (blocked)',
  pg_temp.rows($$update public.tasks set is_initiative = true where title = 'Switch smoke'$$),
  pg_temp.rows($$insert into public.goals (id, title) values ('00000000-0000-4000-8000-0000000000f1', 'Smoke goal')$$),
  pg_temp.rows($$update public.tasks set goal_id = '00000000-0000-4000-8000-0000000000f1' where title = 'Switch smoke'$$),
  pg_temp.rows($$update public.tasks set is_initiative = false where title = 'Switch smoke'$$);
rollback;
