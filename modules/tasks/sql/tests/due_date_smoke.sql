-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/due_date_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Default due date smoke test: psql -f supabase/tests/due_date_smoke.sql (local stack, freshly reset).
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

-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;
begin;
select '1 general default is one week', public.default_due_date((select id from public.task_types where key = 'general')) - current_date;
update public.task_types set default_due_days = 3 where key = 'general';
select '2 task type override wins', public.default_due_date((select id from public.task_types where key = 'general')) - current_date;
update public.task_types set default_due_days = 0 where key = 'general';
select '3 override 0 means no default', public.default_due_date((select id from public.task_types where key = 'general')) is null;
update public.task_types set default_due_days = null where key = 'general';
update public.app_settings set value = '0' where key = 'default_due_days';
select '4 general 0 means no default', public.default_due_date((select id from public.task_types where key = 'general')) is null;
update public.app_settings set value = '5' where key = 'default_due_days';

select pg_temp.as_user('anna.weber@example.com');
select '5 worker cannot change the setting (RLS: 0 rows updated)', pg_temp.attempt($q$update public.app_settings set value = '1' where key = 'default_due_days'$q$);
select '5b value unchanged', value from public.app_settings where key = 'default_due_days';
reset role;
select pg_temp.as_user('max.wilckens@wilckens.com');
select '6 admin can change it', pg_temp.attempt($q$update public.app_settings set value = '10' where key = 'default_due_days'$q$);
reset role;

-- a ticket turned into a task gets the default, a task without due date stays possible
select pg_temp.as_user('tom.berger@example.com');
select '7 ticket converted: due = given date', t.due_date - current_date
  from public.ticket_convert_to_task((select id from public.tickets order by ticket_number limit 1), (select id from public.task_types where key = 'general'), current_date + 7) t;
insert into public.tasks (task_type_id, title) values ((select id from public.task_types where key = 'general'), 'No due date');
select '8 the column itself stays nullable (only the forms require it)', due_date is null from public.tasks where title = 'No due date';
reset role;
rollback;
