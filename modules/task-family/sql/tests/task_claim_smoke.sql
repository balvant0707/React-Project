-- Copied from ~/maintenance_tool/supabase/tests/task_claim_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- "I take it" (migration 20261030100000_task_claim.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/task_claim_smoke.sql
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
  v_mechanics uuid := (select id from public.teams where name = 'Werkstatt');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_paul uuid := (select id from public.users where email = 'paul.meier@example.com');
  v_id uuid;
  v_t public.tasks;
begin
  -- A task of the mechanics team without a person.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id) values (v_general, 'Claim 1', v_mechanics) returning id into v_id;
  assert (select assigned_user_id from public.tasks where id = v_id) is null, '1 no person yet';

  -- 1. A member takes it; the feed shows the event.
  perform pg_temp.act_as('anna.weber@example.com');
  v_t := public.task_claim(v_id);
  assert v_t.assigned_user_id = v_anna, '1 Anna is the assignee';
  assert exists (select 1 from public.activity_events where entity_id = v_id and event_type = 'task_claimed'), '1 event written';

  -- 2. The second one is too late.
  perform pg_temp.act_as('sara.novak@example.com');
  begin
    perform public.task_claim(v_id);
    raise exception 'Sara took a task that was taken';
  exception when others then
    assert sqlerrm = 'The task was already taken', '2 ' || sqlerrm;
  end;

  -- 3. Somebody outside the team (other site) cannot take a team task.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id) values (v_general, 'Claim 2', v_mechanics) returning id into v_id;
  perform pg_temp.act_as('lena.fischer@example.com');
  begin
    perform public.task_claim(v_id);
    raise exception 'Lena took a task of another team';
  exception when others then
    assert sqlerrm in ('The task does not belong to your team', 'Task not found'), '3 ' || sqlerrm;
  end;
end;
$$;
rollback;
