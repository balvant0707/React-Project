-- Copied from ~/maintenance_tool/supabase/tests/goals_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Goals smoke test: psql -f supabase/tests/goals_smoke.sql (local stack, freshly reset DB). One line per check.
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
select pg_temp.as_user('tom.berger@example.com');
select '1 manager creates the root goal (no measure)', pg_temp.attempt($q$insert into public.goals (id, title) values ('00000000-0000-4000-8000-0000000000e1', 'The company exists in 20 years')$q$);
select '2 manager creates a measured sub-goal', pg_temp.attempt($q$insert into public.goals (id, title, parent_goal_id, measure_label, measure_unit, start_value, target_value) values ('00000000-0000-4000-8000-0000000000e2', 'Fewer breakdowns', '00000000-0000-4000-8000-0000000000e1', 'Unplanned downtime per quarter', 'h', 40, 20)$q$);
select '3 incomplete measure refused', pg_temp.attempt($q$insert into public.goals (title, measure_label) values ('Half a measure', 'x')$q$);
select '4 a goal cannot be its own ancestor', pg_temp.attempt($q$update public.goals set parent_goal_id = '00000000-0000-4000-8000-0000000000e2' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select '5 new measured goal starts at its start value', (select current_value from public.goals where id = '00000000-0000-4000-8000-0000000000e2');
select '6 manager checks in 30 h', pg_temp.attempt($q$select public.goal_check_in('00000000-0000-4000-8000-0000000000e2', 30, 'on_track', 'Bearings replaced')$q$);
select '7 progress is 0.5 (40 -> 30 of 40 -> 20)', (select public.goal_progress('00000000-0000-4000-8000-0000000000e2'));
select '8 the parent without a measure derives 0.5', (select public.goal_progress('00000000-0000-4000-8000-0000000000e1'));
select '9 check-in is in the feed', (select count(*) from public.activity_events where entity_type = 'goals' and event_type = 'goal_check_in');
select '10 check-in on a goal without a measure refuses a value', pg_temp.attempt($q$select public.goal_check_in('00000000-0000-4000-8000-0000000000e1', 5, null, null)$q$);
reset role;

-- The depth is not limited: a chain of 8 levels is accepted.
insert into public.goals (id, title, parent_goal_id) values
  ('00000000-0000-4000-8000-0000000000f3', 'L3', '00000000-0000-4000-8000-0000000000e2'),
  ('00000000-0000-4000-8000-0000000000f4', 'L4', '00000000-0000-4000-8000-0000000000f3'),
  ('00000000-0000-4000-8000-0000000000f5', 'L5', '00000000-0000-4000-8000-0000000000f4');
select '11 deeper levels are accepted', pg_temp.attempt($q$insert into public.goals (title, parent_goal_id) values ('L6', '00000000-0000-4000-8000-0000000000f5'), ('L6b', '00000000-0000-4000-8000-0000000000f5')$q$);
select '11b depth 6 below the root progress still computes', (select public.goal_progress('00000000-0000-4000-8000-0000000000e1') is not null);

-- An initiative below the sub-goal, a subtask assigned to Anna, and a plain task that cannot carry a goal.
insert into public.tasks (id, task_type_id, is_initiative, title, status) select '00000000-0000-4000-8000-0000000000d1', id, true, 'Bearing programme', 'open' from public.task_types where key = 'general';
select '12 plain task cannot carry a goal', pg_temp.attempt($q$update public.tasks set goal_id = '00000000-0000-4000-8000-0000000000e2' where id = (select id from public.tasks where not is_initiative limit 1)$q$);
update public.tasks set goal_id = '00000000-0000-4000-8000-0000000000e2' where id = '00000000-0000-4000-8000-0000000000d1';
insert into public.tasks (id, task_type_id, title, parent_task_id, assigned_user_id)
  select '00000000-0000-4000-8000-0000000000d2', tt.id, 'Replace bearing', '00000000-0000-4000-8000-0000000000d1', (select id from public.users where email = 'anna.weber@example.com')
  from public.task_types tt order by tt.key limit 1;

select pg_temp.as_user('anna.weber@example.com');
select '13 workshop sees no goal rows', (select count(*) from public.goals);
select '14 workshop sees the chain from her task (initiative + 2 goals)', (select string_agg(kind || ':' || title || case when can_open then '' else ' (closed)' end, ' > ' order by step) from public.task_contribution('00000000-0000-4000-8000-0000000000d2'));
select '15 no chain for a task she cannot view', (select count(*) from public.task_contribution((select id from public.tasks where id <> '00000000-0000-4000-8000-0000000000d2' and not exists (select 1 from public.tasks_overview o where o.id = tasks.id) limit 1)));
select '16 workshop cannot check in', pg_temp.attempt($q$select public.goal_check_in('00000000-0000-4000-8000-0000000000e2', 25, null, null)$q$);
select '17 workshop cannot create a goal', pg_temp.attempt($q$insert into public.goals (title) values ('x')$q$);
reset role;

-- Taking the literal away hides the chain completely.
delete from public.role_permissions where permission = 'goals.view.contributing';
select pg_temp.as_user('anna.weber@example.com');
select '18 without goals.view.contributing the chain is empty', (select count(*) from public.task_contribution('00000000-0000-4000-8000-0000000000d2'));
reset role;
rollback;
