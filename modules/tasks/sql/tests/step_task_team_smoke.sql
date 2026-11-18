-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/step_task_team_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Route steps worked by the team of the task (migration 20261215140000_step_task_team.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/step_task_team_smoke.sql
-- Shared seed (Tom is in Werkstatt and Instandhaltung). Rolled back.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.fails(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  v_type uuid;
  v_shop uuid := (select id from public.teams where name = 'Werkstatt');
  v_maint uuid := (select id from public.teams where name = 'Instandhaltung');
  v_manager uuid := (select id from public.roles where name = 'Manager');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_task public.tasks;
begin
  insert into public.task_types (key, name) values ('smoke_task_team', 'Smoke task team') returning id into v_type;
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, fallback_role_id, actions)
  values (v_type, 'work', 1, 'Work', 'open', 'task_team', v_manager, '[{"key": "complete", "to": null}]');

  -- 1. The step goes to the team of the task, also with a person assigned.
  perform pg_temp.act_as('tom.berger@example.com');
  set local role authenticated;
  insert into public.tasks (task_type_id, title, team_id, assigned_user_id) values (v_type, 'Smoke task team', v_shop, v_tom) returning * into v_task;
  select * into v_task from public.tasks where id = v_task.id;
  assert v_task.current_assignee_team_id = v_shop and v_task.current_assignee_user_id is null, '1 with the team of the task';

  -- 2. Another team: the step follows.
  perform public.task_plan(v_task.id, v_maint, v_tom, null);
  assert (select current_assignee_team_id from public.tasks where id = v_task.id) = v_maint, '2 follows the team';

  -- 3. No team any more: the fallback role.
  perform public.task_plan(v_task.id, null, v_tom, null);
  select * into v_task from public.tasks where id = v_task.id;
  assert v_task.current_assignee_team_id is null and v_task.current_assignee_role_id = v_manager, '3 fallback role';

  -- 4. Not on a decision step: the requester sets the task's team.
  reset role;
  assert pg_temp.fails(format($q$update public.task_type_steps set is_decision = true, actions = '[{"key": "yes", "to": null}, {"key": "no", "to": null}]' where task_type_id = %L$q$, v_type)), '4 no decision by the task team';
end;
$$;
rollback;
