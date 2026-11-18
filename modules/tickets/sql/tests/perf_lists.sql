-- COMPASS: copied 1:1 from COMPASS supabase/tests/perf_lists.sql. Changed: groups -> teams, user_groups -> user_teams
-- (group_id -> team_id), the leave teams by the team use `leave` (team_uses) instead of groups.usable_for_leave, the runner
-- is tools/perf.sh (COMPASS scripts/run-perf.sh), the baseline platform/sql/tests/compass_perf_baseline.tsv.
--   bash tools/perf.sh compass platform/sql/tests/compass_perf_lists.sql [--update]
-- List performance test, run by scripts/run-perf.sh (and scripts/run-tests.sh locally): fills the database with
-- 300 people, 20,000 tasks, 6,000 absences and 3,000 tickets, then times the list queries the app makes as Anna
-- (Workshop), Tom (Manager) and Hanna (HR), with RLS on, and a few writes. Everything is rolled back.
--   scripts/run-perf.sh            compare with supabase/tests/perf_baseline.tsv
--   scripts/run-perf.sh --update   write the current numbers as the new baseline
-- Output lines "PERF|<user>|<probe>|<ms>" (best of five runs). Add a probe for every new list or RLS path.
\set ON_ERROR_STOP on
begin;

create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
-- Best of five runs of a statement, in milliseconds.
create function pg_temp.ms(p_sql text) returns numeric language plpgsql as $$
declare
  v_best numeric := null;
  v_start timestamptz;
  v_dummy bigint;
begin
  for i in 1..5 loop
    v_start := clock_timestamp();
    execute 'select count(*) from (' || p_sql || ') q' into v_dummy;
    v_best := least(coalesce(v_best, 1e9), extract(epoch from clock_timestamp() - v_start) * 1000);
    exit when v_best > 3000;
  end loop;
  return round(v_best, 1);
end $$;
grant execute on all functions in schema pg_temp to public;

-- ===================================================================================
-- Volume: 300 people (half of them report to Tom), 20,000 ordinary tasks, 6,000 absences with their tasks
-- (30 % waiting with Tom, 60 % approved, 10 % withdrawn), spread over a year around today, 3,000 tickets.
-- ===================================================================================
set local session_replication_role = replica;  -- no triggers while loading (computed columns are set here)

create temp table load_groups as select array_agg(team_id order by team_id) ids from public.team_uses where use = 'leave';

insert into public.users (id, name, username, email, has_login, language, supervisor_user_id)
select public.uuid_generate_v7(), 'Load Person ' || i, 'load.person' || i, 'load' || i || '@example.test', true, 'de',
       case when i % 2 = 0 then pg_temp.uid('tom.berger@example.com') end
from generate_series(1, 300) i;
insert into public.user_teams (user_id, team_id)
select u.id, g.ids[1 + (abs(hashtext(u.email)) % array_length(g.ids, 1))]
from public.users u cross join load_groups g where u.email like 'load%@example.test'
on conflict do nothing;
create temp table load_people as
select row_number() over (order by id) n, id from public.users where email like 'load%@example.test';

insert into public.tasks (id, root_task_id, task_number, title, status, priority, task_type_id, team_id, assigned_user_id,
                          created_by_user_id, created_at, due_date, current_step_key, permission_module)
select x.id, x.id, 200000 + i, 'Lasttest Aufgabe ' || i, case when i % 3 = 0 then 'done' else 'open' end, 'normal',
       (select id from public.task_types where key = 'general'),
       g.ids[1 + (i % array_length(g.ids, 1))],
       (select id from load_people where n = 1 + (i % 300)),
       pg_temp.uid('tom.berger@example.com'), now() - (i || ' minutes')::interval,
       current_date + (i % 120) - 30, 'work', 'tasks'
from generate_series(1, 20000) i
cross join load_groups g
cross join lateral (select public.uuid_generate_v7() as id where i > 0) x;

create temp table load_leave as
select i, public.uuid_generate_v7() as task_id, public.uuid_generate_v7() as leave_id,
       (select id from load_people where n = 1 + (i % 300)) as user_id,
       current_date + (i % 360) - 180 as from_date, 1 + (i % 5) as len,
       case when i % 10 < 3 then 'requested' when i % 10 < 9 then 'approved' else 'cancelled' end as status
from generate_series(1, 6000) i;
grant select on load_leave to public;

insert into public.tasks (id, root_task_id, task_number, title, status, priority, task_type_id, assigned_user_id,
                          created_by_user_id, created_at, due_date, current_step_key, current_assignee_user_id, permission_module)
select l.task_id, l.task_id, 300000 + l.i, 'Urlaub ' || l.from_date,
       case l.status when 'requested' then 'open' when 'approved' then 'done' else 'cancelled' end, 'normal',
       (select id from public.task_types where key = 'leave'),
       coalesce(u.supervisor_user_id, l.user_id), l.user_id, now() - (l.i || ' minutes')::interval, l.from_date, 'approval',
       case when l.status = 'requested' then u.supervisor_user_id end, 'leave'
from load_leave l join public.users u on u.id = l.user_id;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'absence_type_id') then
    execute $q$
      insert into public.leave_requests (id, task_id, user_id, absence_type_id, from_date, to_date, working_days, status, decided_at)
      select leave_id, task_id, user_id, (select id from public.absence_types order by sort_order limit 1),
             from_date, from_date + len - 1, len, status, case when status <> 'requested' then now() end
      from load_leave $q$;
  else
    execute $q$
      insert into public.leave_requests (id, task_id, user_id, kind, from_date, to_date, working_days, status, decided_at)
      select leave_id, task_id, user_id, 'vacation', from_date, from_date + len - 1, len, status,
             case when status <> 'requested' then now() end
      from load_leave $q$;
  end if;
end $$;
insert into public.task_step_history (task_id, step_key, entered_at)
select task_id, 'approval', now() from load_leave where status = 'requested';

insert into public.tickets (id, ticket_number, title, type, status, priority, queue_id, asset_id, assigned_user_id,
                            reporter_user_id, assigned_team_id, created_at)
select public.uuid_generate_v7(), 200000 + i, 'Lasttest Ticket ' || i, tt.type, case when i % 4 = 0 then 'resolved' else 'open' end,
       'normal', tt.queue_id, (select id from public.assets order by id offset (i % 200) limit 1),
       case when i % 3 = 0 then (select id from load_people where n = 1 + (i % 300)) end,
       (select id from load_people where n = 1 + ((i * 7) % 300)),
       g.ids[1 + (i % array_length(g.ids, 1))], now() - (i || ' minutes')::interval
from generate_series(1, 3000) i
cross join load_groups g
cross join lateral (select queue_id, key as type from public.ticket_types
                    where queue_id = (select id from public.ticket_queues order by (key = 'maintenance') desc, key limit 1)
                    order by key limit 1) tt;

set local session_replication_role = origin;
analyze public.users;
analyze public.user_teams;
analyze public.tasks;
analyze public.leave_requests;
analyze public.task_step_history;
analyze public.tickets;

-- ===================================================================================
-- Probes as Anna (Workshop), Tom (Manager, approves for 150 people) and Hanna (HR); one statement each (\gexec)
-- ===================================================================================
create temp table perf (who text, what text, ms numeric);
grant all on perf to public;
create temp table perf_queries (what text, q text, sort integer);
grant all on perf_queries to public;
insert into perf_queries values
  ('tasks list page', 'select id from public.tasks_overview order by due_date nulls last, id limit 25', 1),
  ('tasks list open page', 'select id from public.tasks_overview where status not in (''done'', ''cancelled'') order by due_date nulls last, id limit 25', 2),
  ('tasks list count', 'select id from public.tasks_overview', 3),
  ('task_rights 200', 'select * from public.task_rights(array(select id from public.tasks order by created_at desc limit 200))', 4),
  ('tasks_to_decide', 'select * from public.tasks_to_decide', 5),
  ('dashboard_counts', 'select * from public.dashboard_counts(30)', 6),
  ('tickets list page', 'select id from public.tickets_overview order by created_at desc, id limit 25', 7),
  ('tickets list count', 'select id from public.tickets_overview', 8),
  ('assets top level', 'select id from public.assets_overview where is_visible_root order by name limit 50', 9),
  ('leave mine', 'select * from public.leave_requests where user_id = auth.uid()', 10),
  ('leave year mine', 'select * from public.leave_year_overview where user_id = auth.uid()', 11),
  ('leave pending', 'select * from public.leave_pending_for_me()', 12),
  ('leave dashboard', 'select * from public.leave_dashboard_counts()', 13),
  ('leave planner 90 days', 'select * from public.leave_planner_days(array(select user_id from public.leave_planner_people(''reports'', null)), current_date, current_date + 90)', 14),
  ('leave violations', 'select * from public.leave_violations(180)', 15);
set local statement_timeout = '30s';

select pg_temp.as_user('anna.weber@example.com');
select format('insert into perf select %L, %L, pg_temp.ms(%L)', 'anna', what, q) from perf_queries order by sort \gexec
reset role;
select pg_temp.as_user('tom.berger@example.com');
select format('insert into perf select %L, %L, pg_temp.ms(%L)', 'tom', what, q) from perf_queries order by sort \gexec
reset role;
select pg_temp.as_user('hanna.richter@example.com');
select format('insert into perf select %L, %L, pg_temp.ms(%L)', 'hanna', what, q) from perf_queries order by sort \gexec
reset role;

-- Writes as Tom: approve a waiting absence, enter one for a person (average of 20 each).
select pg_temp.as_user('tom.berger@example.com');
do $$
declare
  v_start timestamptz;
  v_task uuid;
  v_person uuid;
  v_n integer := 0;
begin
  v_start := clock_timestamp();
  for v_task in select l.task_id from load_leave l join public.tasks t on t.id = l.task_id
                where l.status = 'requested' and t.current_assignee_user_id = auth.uid() limit 20 loop
    perform public.task_perform_action(v_task, 'approve');
    v_n := v_n + 1;
  end loop;
  insert into perf values ('tom', 'write approve absence', round(extract(epoch from clock_timestamp() - v_start) * 1000 / greatest(v_n, 1), 1));
  v_n := 0;
  v_start := clock_timestamp();
  for v_person in select id from public.users where supervisor_user_id = auth.uid() and email like 'load%' limit 20 loop
    perform public.leave_request_create(p_from_date => current_date + 400, p_to_date => current_date + 401, p_user_id => v_person);
    v_n := v_n + 1;
  end loop;
  insert into perf values ('tom', 'write enter absence', round(extract(epoch from clock_timestamp() - v_start) * 1000 / greatest(v_n, 1), 1));
end $$;
reset role;

select 'PERF|' || who || '|' || what || '|' || ms from perf
order by who, coalesce((select sort from perf_queries q where q.what = perf.what), 100), what;
rollback;
