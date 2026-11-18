-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/punctuality_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Punctuality smoke test. Run on a database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/punctuality_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'max.wilckens@wilckens.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_init uuid := (select id from public.task_types where key = 'initiative');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_root uuid; v_ok uuid; v_late uuid; v_moved uuid;
  r record;
begin
  insert into public.tasks (task_type_id, is_initiative, title) values (v_init, true, 'Punctuality initiative') returning id into v_root;
  insert into public.tasks (task_type_id, title, parent_task_id, due_date) values (v_general, 'on time', v_root, current_date + 3) returning id into v_ok;
  insert into public.tasks (task_type_id, title, parent_task_id, due_date) values (v_general, 'late', v_root, current_date - 2) returning id into v_late;
  insert into public.tasks (task_type_id, title, parent_task_id, due_date) values (v_general, 'moved', v_root, current_date - 1) returning id into v_moved;

  assert (select original_due_date from public.tasks where id = v_late) = current_date - 2, 'original due date set on insert';
  update public.tasks set due_date = current_date + 5 where id = v_moved;
  update public.tasks set due_date = current_date + 9 where id = v_moved;
  assert (select original_due_date from public.tasks where id = v_moved) = current_date - 1, 'original due date is never rewritten';

  perform public.task_perform_action(v_ok, 'complete', null);
  perform public.task_perform_action(v_late, 'complete', null);
  perform public.task_perform_action(v_moved, 'complete', null);

  assert (select outcome from public.task_punctuality where task_id = v_ok) = 'on_time', 'on time';
  assert (select outcome from public.task_punctuality where task_id = v_late) = 'late', 'late';
  assert (select days_late from public.task_punctuality where task_id = v_late) = 2, 'two days late';
  assert (select outcome from public.task_punctuality where task_id = v_moved) = 'rescheduled', 'rescheduled';

  select * into r from public.punctuality_stats(p_root_task_id => v_root, p_bucket => 'all');
  assert r.total = 3 and r.on_time = 1 and r.rescheduled = 1 and r.late = 1, format('stats %s/%s/%s/%s', r.total, r.on_time, r.rescheduled, r.late);
  assert r.avg_days_late = 2, 'average days late';
  assert (select count(*) from public.punctuality_breakdown(p_root_task_id => v_root)) = 3, 'breakdown has one row per task';
  assert (select count(*) from public.ticket_flow(current_date - 30, current_date)) >= 0;
  raise notice 'punctuality smoke test passed';
end;
$$;
reset role;
rollback;
