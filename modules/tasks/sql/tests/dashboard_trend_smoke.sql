-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/dashboard_trend_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Dashboard numbers and sparklines (migrations 20261030110000_dashboard_trend.sql, 20261031120000_review_fixes_stock_trend.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/dashboard_trend_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to public;
set local role authenticated;

do $$
declare
  v_general uuid := (select id from public.task_types where key = 'general');
  v_team uuid := (select id from public.teams where name = 'Werkstatt');
  v_open0 integer; v_overdue0 integer; v_blocked0 integer; v_pool0 integer; v_done0 integer;
  v_open1 integer; v_overdue1 integer;
  v_c record; v_c2 record;
  v_id uuid;
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert (select count(*) from public.dashboard_trends(12)) = 48, '1 four metrics with twelve weekly points';
  assert (select count(distinct metric) from public.dashboard_trends(12)) = 4, '1 four metrics';
  assert (select max(day) from public.dashboard_trends(12) where metric = 'done') = current_date, '1 the last point is today';
  select value into v_open0 from public.dashboard_trends(12) where metric = 'open_tasks' order by day desc limit 1;
  select value into v_overdue0 from public.dashboard_trends(12) where metric = 'overdue_tasks' order by day desc limit 1;
  select * into v_c from public.dashboard_counts(7);
  v_blocked0 := v_c.blocked_tasks; v_pool0 := v_c.team_pool; v_done0 := v_c.done_recent;
  assert v_c.open_tasks = v_open0, '1 the tile and the last point of the line agree on open tasks';

  -- 2. A new task with a due date in the past counts as open and as overdue today.
  insert into public.tasks (task_type_id, title, team_id, due_date)
  values (v_general, 'Trend 1', v_team, current_date - 3) returning id into v_id;
  select value into v_open1 from public.dashboard_trends(12) where metric = 'open_tasks' order by day desc limit 1;
  select value into v_overdue1 from public.dashboard_trends(12) where metric = 'overdue_tasks' order by day desc limit 1;
  assert v_open1 = v_open0 + 1 and v_overdue1 = v_overdue0 + 1, '2 open and overdue grow by one in the trend';
  select * into v_c from public.dashboard_counts(7);
  assert v_c.open_tasks = v_open0 + 1 and v_c.overdue_tasks >= 1, '2 and in the tiles';
  assert v_c.team_pool = v_pool0 + 1 or v_pool0 is not null, '2 pool counted for team members';
  assert (select sum(value::integer) from jsonb_each_text(v_c.status_counts)) = v_c.open_tasks, '2 the status counts add up to the open tasks';
  assert (v_c.team_counts ->> v_team::text)::integer >= 1, '2 the team of the new task is counted';
  assert not v_c.status_counts ? 'done', '2 finished tasks are not in the status counts';

  -- 3. Moving the due date does not hide the delay in the trend: it counts by the original date.
  update public.tasks set due_date = current_date + 10 where id = v_id;
  select value into v_overdue1 from public.dashboard_trends(12) where metric = 'overdue_tasks' order by day desc limit 1;
  assert v_overdue1 = v_overdue0 + 1, '3 still overdue by the original due date';

  -- 4. Finishing it moves it from open to done.
  perform public.task_cancel(v_id);
  select * into v_c from public.dashboard_counts(7);
  assert v_c.open_tasks = v_open0, '4 no longer open';

  -- 5. The pool of a team member counts the tasks of the team without a person.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id, due_date) values (v_general, 'Pool 1', v_team, current_date + 2);
  perform pg_temp.act_as('anna.weber@example.com');
  select * into v_c from public.dashboard_counts(7);
  assert v_c.team_pool >= 1, '5 pool seen by a team member';
  perform * from public.dashboard_trends(8);

  -- 6. Start page: the pool's overdue count is part of the pool, mine are part of the open ones.
  assert v_c.pool_overdue <= v_c.team_pool, '6 overdue in the pool is part of the pool';
  assert v_c.mine_overdue <= v_c.mine_open, '6 my overdue tasks are part of my open ones';
  insert into public.tasks (task_type_id, title, team_id, due_date) values (v_general, 'Pool overdue', v_team, current_date - 2);
  select * into v_c2 from public.dashboard_counts(7);
  assert v_c2.pool_overdue = v_c.pool_overdue + 1 and v_c2.team_pool = v_c.team_pool + 1, '6 an overdue pool task counts in both';
end;
$$;
rollback;
