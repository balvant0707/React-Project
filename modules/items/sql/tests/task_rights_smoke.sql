-- Copied from ~/maintenance_tool/supabase/tests/task_rights_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- task_rights tells the truth (migration 20261213110000_task_rights.sql): for several roles and every task, each flag
-- is compared with what the real RPC or update does. Every attempt runs in a sub-block that is rolled back.
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/task_rights_smoke.sql
-- Everything runs in one transaction and is rolled back; a failed check raises.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;

-- Runs one statement and rolls it back; true when it went through (and, for an update, touched a row).
create function pg_temp.works(p_sql text) returns boolean language plpgsql as $$
declare
  v_n integer;
begin
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
    if v_n = 0 and p_sql ilike 'update%' then
      return false;
    end if;
    raise exception 'smoke_rollback';
  exception when others then
    return sqlerrm = 'smoke_rollback';
  end;
end;
$$;

-- Compares every flag with the real thing for the signed-in user; returns the number of tasks checked.
create function pg_temp.check_rights() returns integer language plpgsql as $$
declare
  v_uid uuid := auth.uid();
  v_r record;
  v_target uuid;
  v_n integer := 0;
  v_visible integer;
begin
  select count(*) into v_visible from public.tasks;
  assert (select count(*) from public.task_rights((select array_agg(id) from public.tasks))) = least(v_visible, 200),
    'a row for every task I can see, no more';
  for v_r in
    select r.*, t.status, t.created_by_user_id, t.current_assignee_user_id, t.assigned_user_id
    from public.task_rights((select array_agg(id) from (select id from public.tasks order by task_number limit 200) x)) r
    join public.tasks t on t.id = r.task_id
  loop
    v_n := v_n + 1;
    assert v_r.view, 'view is true on every returned row';
    assert v_r.edit = pg_temp.works(format('update public.tasks set due_date = coalesce(due_date, current_date) + 1 where id = %L', v_r.task_id)),
      format('edit matches the row policy (task %s)', v_r.task_id);
    assert v_r.check = pg_temp.works(format('select public.task_record_effort(%L, 1, null, null)', v_r.task_id)),
      format('check matches task_record_effort (task %s)', v_r.task_id);
    assert v_r.claim = pg_temp.works(format('select public.task_claim(%L)', v_r.task_id)),
      format('claim matches task_claim (task %s)', v_r.task_id);
    assert v_r.reopen = pg_temp.works(format('select public.task_reopen(%L)', v_r.task_id)),
      format('reopen matches task_reopen (task %s)', v_r.task_id);
    -- somebody who can take it: not me, not the requester, not whoever has it now
    select u.id into v_target from public.users u
    where u.has_login and not u.has_left and u.locked_at is null
      and u.id not in (v_uid, coalesce(v_r.created_by_user_id, v_uid), coalesce(v_r.current_assignee_user_id, v_uid), coalesce(v_r.assigned_user_id, v_uid))
    order by u.username limit 1;
    assert v_r.forward = pg_temp.works(format('select public.task_forward(%L, %L)', v_r.task_id, v_target)),
      format('forward matches task_forward (task %s)', v_r.task_id);
    assert not v_r.act or v_r.status not in ('done', 'cancelled'), 'nobody acts on a finished task';
    assert not (v_r.act and v_r.decision and v_r.created_by_user_id = v_uid), 'the requester never acts in a decision step';
  end loop;
  return v_n;
end;
$$;
grant execute on all functions in schema pg_temp to public;

-- Fixtures: a pool task of Anna's team, a finished task, a purchase request of Anna waiting for a decision.
do $$
declare
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_team uuid := (select team_id from public.user_teams where user_id = v_anna order by team_id limit 1);
begin
  insert into public.tasks (task_type_id, title, team_id, created_by_user_id)
  values ((select id from public.task_types where key = 'maintenance'), 'R pool task', v_team, v_anna);
  insert into public.tasks (task_type_id, title, assigned_user_id, created_by_user_id, status)
  values ((select id from public.task_types where key = 'maintenance'), 'R done task', v_anna, v_anna, 'open');
  perform set_config('app.task_engine', 'on', true);
  update public.tasks set status = 'done', completed_at = now() where title = 'R done task';
  perform set_config('app.task_engine', 'off', true);
end $$;

select pg_temp.act_as('anna.weber@example.com');
set local role authenticated;
do $$ begin assert pg_temp.check_rights() > 0, 'Anna sees tasks'; end $$;
reset role;

select pg_temp.act_as('ben.keller@example.com');
set local role authenticated;
do $$ begin perform pg_temp.check_rights(); end $$;
reset role;

select pg_temp.act_as('tom.berger@example.com');
set local role authenticated;
do $$ begin assert pg_temp.check_rights() > 0, 'Tom sees tasks'; end $$;
reset role;

select pg_temp.act_as('lena.fischer@example.com');
set local role authenticated;
do $$ begin perform pg_temp.check_rights(); end $$;
reset role;

-- Signed out: nothing.
do $$ begin
  perform set_config('request.jwt.claims', '{}', true);
  assert not exists (select 1 from public.task_rights((select array_agg(id) from public.tasks))), 'no rights without a user';
end $$;

rollback;
