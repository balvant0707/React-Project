-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/subtask_types_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Allowed subtask types (migration 20261220100000_allowed_subtask_types.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/subtask_types_smoke.sql
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
  v_ok boolean;
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');

  -- 1. The migration filled the lists: a general task takes a general subtask and a purchase request.
  assert exists (select 1 from public.task_type_subtask_types where task_type_id = v_general and subtask_type_id = v_general), '1 a type may allow itself';
  assert exists (select 1 from public.task_type_subtask_types where task_type_id = v_general and subtask_type_id = v_purchase), '1 purchase allowed';

  insert into public.tasks (task_type_id, title, team_id, due_date) values (v_general, 'Parent', v_team, current_date + 5)
    returning id into v_parent;
  insert into public.tasks (task_type_id, title, team_id, parent_task_id, due_date) values (v_general, 'Same type', v_team, v_parent, current_date + 5);

  -- 2. Only the purchase request stays allowed: a general subtask is refused, with a readable message.
  delete from public.task_type_subtask_types where task_type_id = v_general and subtask_type_id <> v_purchase;
  begin
    insert into public.tasks (task_type_id, title, team_id, parent_task_id, due_date) values (v_general, 'Refused', v_team, v_parent, current_date + 5);
    v_ok := true;
  exception when others then
    v_ok := sqlerrm like '%not allowed as a subtask%';
    assert v_ok, '2 message: ' || sqlerrm;
    v_ok := false;
  end;
  assert not v_ok, '2 a type that is not in the list is refused';
  insert into public.tasks (task_type_id, title, team_id, parent_task_id, due_date) values (v_purchase, 'Buy', v_team, v_parent, current_date + 5);

  -- 3. An empty list = no subtasks at all.
  delete from public.task_type_subtask_types where task_type_id = v_general;
  begin
    insert into public.tasks (task_type_id, title, team_id, parent_task_id, due_date) values (v_purchase, 'Refused 2', v_team, v_parent, current_date + 5);
    v_ok := true;
  exception when others then
    v_ok := false;
  end;
  assert not v_ok, '3 an empty list refuses every subtask';

  -- 4. Tasks without a parent are not affected.
  insert into public.tasks (task_type_id, title, team_id, due_date) values (v_general, 'Root', v_team, current_date + 5);
end $$;
rollback;
