-- Copied from ~/maintenance_tool/supabase/tests/task_reopen_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Reopen smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/task_reopen_smoke.sql
-- Freshly reset database with the seed; everything is rolled back.
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
  v_id uuid;
  v_t public.tasks;
begin
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title, assigned_user_id) values (v_general, 'Reopen smoke', (select id from public.users where email = 'anna.weber@example.com')) returning id into v_id;
  begin
    perform public.task_reopen(v_id);
    raise exception 'an open task was reopened';
  exception when others then
    assert sqlerrm = 'Task is not finished', sqlerrm;
  end;

  perform public.task_perform_action(v_id, 'complete');
  assert (select status from public.tasks where id = v_id) = 'done', 'finished';

  -- somebody without a right on the task cannot reopen it
  perform pg_temp.act_as('paul.meier@example.com');
  begin
    perform public.task_reopen(v_id);
    raise exception 'a stranger reopened the task';
  exception when others then
    assert sqlerrm = 'You are not allowed to reopen this task', sqlerrm;
  end;

  perform pg_temp.act_as('anna.weber@example.com');
  v_t := public.task_reopen(v_id, 'Clicked by mistake');
  assert v_t.status = 'open' and v_t.completed_at is null and v_t.current_step_key = 'work', 'the task is open again in its step';
  assert (select count(*) from public.task_step_history where task_id = v_id and left_at is null) = 1, 'one open history row';
  assert exists (select 1 from public.activity_events where entity_id = v_id and event_type = 'task_reopened' and metadata ->> 'comment' = 'Clicked by mistake'), 'the feed has the event';

  -- it can be finished again
  perform public.task_perform_action(v_id, 'complete');
  assert (select status from public.tasks where id = v_id) = 'done', 'finished again';

  -- a cancelled task can be reopened too
  insert into public.tasks (task_type_id, title, assigned_user_id) values (v_general, 'Reopen smoke 2', (select id from public.users where email = 'anna.weber@example.com')) returning id into v_id;
  perform public.task_cancel(v_id);
  v_t := public.task_reopen(v_id);
  assert v_t.status = 'open', 'cancelled task reopened';

  -- a task with a special function is refused
  reset role;
  perform set_config('request.jwt.claims', '', true);
  -- (a type with tasks cannot take a purpose, migration 20261223100000: use a finished task of the absence route)
  insert into public.tasks (task_type_id, title, assigned_user_id, created_by_user_id)
  values ((select id from public.task_types where purpose = 'leave' order by created_at limit 1), 'Reopen smoke 3',
          (select id from public.users where email = 'anna.weber@example.com'), (select id from public.users where email = 'anna.weber@example.com'))
  returning id into v_id;
  update public.tasks set status = 'done', completed_at = now() where id = v_id;
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  begin
    perform public.task_reopen(v_id);
    raise exception 'a task with a purpose was reopened';
  exception when others then
    assert sqlerrm like 'A task with the special function%', sqlerrm;
  end;
  raise notice 'task_reopen smoke test passed';
end $$;
rollback;
