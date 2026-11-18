-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/task_tree_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Initiative / task tree smoke test. Run on a database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/task_tree_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
-- Act as the seeded admin (the engine functions need a signed-in user).
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'max.wilckens@wilckens.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_init uuid := (select id from public.task_types where key = 'initiative');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_root uuid; v_a uuid; v_b uuid; v_a1 uuid; v_a2 uuid;
  v_total integer; v_done integer; v_rows integer;
begin
  assert v_init is not null, 'initiative task type exists';
  insert into public.tasks (task_type_id, is_initiative, title) values (v_init, true, 'Test initiative') returning id into v_root;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'A', v_root) returning id into v_a;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'B', v_root) returning id into v_b;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'A1', v_a) returning id into v_a1;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'A2', v_a) returning id into v_a2;

  select count(*) into v_rows from public.task_tree(v_root);
  assert v_rows = 5, 'tree has 5 nodes, got ' || v_rows;
  assert (select array_agg(title order by task_number) from public.task_tree(v_root)) is not null;
  assert (select title from public.task_tree(v_root) offset 2 limit 1) = 'A1', 'depth-first order';
  -- Planning fields travel with the tree (Gantt view).
  perform public.task_plan(v_a1, (select team_id from public.tasks where id = v_a1), (select assigned_user_id from public.tasks where id = v_a1), date '2030-01-10');
  assert (select planned_date from public.task_tree(v_root) where id = v_a1) = date '2030-01-10', 'tree returns planned_date';
  assert (select team_id is not null or assigned_user_id is not null from public.task_tree(v_root) where id = v_a1), 'tree returns team / person';

  -- Progress: finish A1, cancel A2.
  perform public.task_perform_action(v_a1, 'complete', null);
  perform public.task_cancel(v_a2, null);
  select descendants_total, descendants_done into v_total, v_done from public.task_tree(v_root) where id = v_root;
  assert v_total = 3 and v_done = 1, format('root progress 1/3 (cancelled excluded), got %s/%s', v_done, v_total);
  select descendants_total, descendants_done into v_total, v_done from public.task_tree(v_root) where id = v_a;
  assert v_total = 1 and v_done = 1, 'A progress 1/1';

  -- An initiative cannot be a subtask.
  begin
    insert into public.tasks (task_type_id, is_initiative, title, parent_task_id) values (v_init, true, 'Nested', v_a);
    raise exception 'nested initiative was accepted';
  exception when others then
    assert sqlerrm = 'An initiative cannot be a subtask', sqlerrm;
  end;
  -- The switch cannot be set on a subtask, and cannot be cleared while a goal hangs on the initiative.
  begin
    update public.tasks set is_initiative = true where id = v_a;
    raise exception 'subtask became an initiative';
  exception when others then
    assert sqlerrm = 'An initiative cannot be a subtask', sqlerrm;
  end;
  raise notice 'task_tree smoke test passed';
end;
$$;
reset role;
rollback;
