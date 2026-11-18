-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/blocking_subtasks_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Blocked tasks (migration 20261030130000_blocking_subtasks.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/blocking_subtasks_smoke.sql
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
  v_team uuid := (select id from public.teams where name = 'Werkstatt');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_purchase uuid := (select id from public.task_types where key = 'purchase_request');
  v_parent uuid;
  v_plain uuid;
  v_buy uuid;
  v_row record;
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert (select blocks_parent from public.task_types where id = v_purchase), '1 purchase request blocks by default';
  assert not (select blocks_parent from public.task_types where id = v_general), '1 general task does not';

  insert into public.tasks (task_type_id, title, team_id, due_date) values (v_general, 'Blocked 1', v_team, current_date - 2)
    returning id into v_parent;
  select * into v_row from public.tasks_overview where id = v_parent;
  assert not v_row.is_blocked and v_row.blocking_subtask_count = 0, '2 no subtask, not blocked';

  -- 3. A plain subtask does not block, a purchase request subtask does.
  insert into public.tasks (task_type_id, title, team_id, parent_task_id, due_date) values (v_general, 'Plain', v_team, v_parent, current_date + 5)
    returning id into v_plain;
  assert not (select blocks_parent from public.tasks where id = v_plain), '3 plain subtask';
  assert not (select is_blocked from public.tasks_overview where id = v_parent), '3 still not blocked';
  insert into public.tasks (task_type_id, title, team_id, parent_task_id, due_date) values (v_purchase, 'Buy part', v_team, v_parent, current_date + 5)
    returning id into v_buy;
  select * into v_row from public.tasks_overview where id = v_parent;
  assert v_row.is_blocked and v_row.blocking_subtask_count = 1, '3 blocked by the purchase request';
  assert v_row.is_overdue, '3 stays overdue while blocked';

  -- 4. The flag can be switched by hand on a subtask.
  update public.tasks set blocks_parent = true where id = v_plain;
  assert (select blocking_subtask_count from public.tasks_overview where id = v_parent) = 2, '4 two blockers';

  -- 5. Finished prerequisites release the parent.
  perform public.task_cancel(v_plain);
  perform public.task_cancel(v_buy);
  assert not (select is_blocked from public.tasks_overview where id = v_parent), '5 released';
end;
$$;
rollback;
