-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/tasks_to_decide_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- "To decide" smoke test (view tasks_to_decide). Run on a freshly reset database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/tasks_to_decide_smoke.sql
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
  v_purchase uuid := (select id from public.task_types where key = 'purchase_request');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_id uuid;
  v_plain uuid;
begin
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Decide smoke') returning id into v_id;
  perform public.task_perform_action(v_id, 'send');
  insert into public.tasks (task_type_id, title) values (v_general, 'Plain smoke') returning id into v_plain;

  assert not exists (select 1 from public.tasks_to_decide where id = v_id), 'the requester does not decide their own request';

  perform pg_temp.act_as('tom.berger@example.com');
  assert exists (select 1 from public.tasks_to_decide where id = v_id), 'the supervisor sees the request to decide';
  assert (select step_actions from public.tasks_to_decide where id = v_id) @> '[{"key": "approve"}]', 'the actions come along';
  assert not exists (select 1 from public.tasks_to_decide where id = v_plain), 'a plain task is no decision';

  perform pg_temp.act_as('sara.novak@example.com');
  assert not exists (select 1 from public.tasks_to_decide where id = v_id), 'somebody else does not see it';

  perform pg_temp.act_as('paul.meier@example.com');
  assert not exists (select 1 from public.tasks_to_decide where id = v_id), 'a user of another site does not see it';

  -- Max is Tom's deputy (seed 08): the deputy sees it, although an admin otherwise sees only what waits for them.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert exists (select 1 from public.tasks_to_decide where id = v_id), 'the deputy sees the request';

  -- My requests: the requester sees it with the person it waits for; a plain task of a type that is not tracked does not appear.
  perform pg_temp.act_as('anna.weber@example.com');
  assert (select awaiting_decision from public.tasks_my_requests where id = v_id), 'my request waits for a decision';
  assert (select with_user_name from public.tasks_my_requests where id = v_id) like 'Tom%', 'and shows who decides';
  assert (select in_step_since from public.tasks_my_requests where id = v_id) is not null, 'and since when';
  assert not exists (select 1 from public.tasks_my_requests where id = v_plain), 'an untracked type is not a request';
  perform pg_temp.act_as('tom.berger@example.com');
  assert not exists (select 1 from public.tasks_my_requests where id = v_id), 'the approver does not see it as their request';

  perform public.task_perform_action(v_id, 'approve');
  assert (select action_key from public.tasks_decided_by_me where task_id = v_id) = 'approve', 'the decision is listed as decided by me';
  perform pg_temp.act_as('anna.weber@example.com');
  assert not exists (select 1 from public.tasks_decided_by_me where task_id = v_id), 'only the decider has it in decided by me';
  assert exists (select 1 from public.tasks_my_requests where id = v_id), 'a finished request stays in my requests';
  perform pg_temp.act_as('tom.berger@example.com');
  assert not exists (select 1 from public.tasks_to_decide where id = v_id), 'a decided request leaves the list';
  -- A decision step must name who decides.
  reset role;
  begin
    update public.task_type_steps set assignee_kind = 'role', assignee_role_id = null where task_type_id = v_general;
    update public.task_type_steps set is_decision = true where task_type_id = v_general;
    raise exception 'a decision step without assignee was accepted';
  exception when others then
    assert sqlerrm like 'A decision step needs%', sqlerrm;
  end;
  raise notice 'tasks_to_decide smoke test passed';
end $$;
rollback;
