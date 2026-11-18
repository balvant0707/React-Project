-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/routing_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Supervisor routing and task type access smoke test. Run on a freshly reset database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/routing_smoke.sql
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
  v_workshop uuid := (select id from public.roles where name = 'Workshop');
  v_manager uuid := (select id from public.roles where name = 'Manager');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_max uuid := (select id from public.users where email = 'max.wilckens@wilckens.com');
  v_t public.tasks;
  v_id uuid;
begin
  -- 1. Anna sends a purchase request: the approval step resolves to her supervisor Tom.
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Safety gloves') returning id into v_id;
  v_t := public.task_perform_action(v_id, 'send');
  assert v_t.current_step_key = 'approval', 'moved to approval';
  assert v_t.current_assignee_user_id = v_tom and v_t.current_assignee_role_id is null, 'resolved to Tom';

  -- 2. Only Tom (or an admin) may decide. Sara has the Workshop role but is not the supervisor.
  perform pg_temp.act_as('sara.novak@example.com');
  begin
    perform public.task_perform_action(v_id, 'approve');
    raise exception 'Sara approved';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', sqlerrm;
  end;
  -- Tom sees the task although he has no grant on it, and the reject needs a comment.
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select count(*) from public.tasks where id = v_id) = 1, 'Tom sees the pending approval';
  begin
    perform public.task_perform_action(v_id, 'reject');
    raise exception 'reject without comment';
  exception when others then
    assert sqlerrm = 'This action requires a comment', sqlerrm;
  end;
  v_t := public.task_perform_action(v_id, 'approve');
  assert v_t.current_step_key = 'purchasing' and v_t.current_assignee_user_id is null, 'approved, now a role step';
  assert v_t.current_assignee_role_id = (select id from public.roles where name = 'Purchasing'), 'purchasing role';

  -- 3. Fallback: Paul has no supervisor, the approval goes to the step's fallback role (Manager).
  perform pg_temp.act_as('paul.meier@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Ear plugs') returning id into v_id;
  v_t := public.task_perform_action(v_id, 'send');
  assert v_t.current_assignee_user_id is null and v_t.current_assignee_role_id = v_manager, 'fallback to Manager role';

  -- 4. Deputy: Paul reports to Anna, Sara is Anna's deputy and may decide for her.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.users set supervisor_user_id = v_anna where email = 'paul.meier@example.com';
  perform pg_temp.act_as('paul.meier@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Safety boots') returning id into v_id;
  v_t := public.task_perform_action(v_id, 'send');
  assert v_t.current_assignee_user_id = v_anna, 'resolved to Anna';
  perform pg_temp.act_as('sara.novak@example.com');
  assert (select count(*) from public.tasks where id = v_id) = 1, 'the deputy sees it';
  v_t := public.task_perform_action(v_id, 'approve');
  assert v_t.current_step_key = 'purchasing', 'the deputy approved';
  -- ... but not for a request of their own.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.users set supervisor_user_id = v_anna where id = v_sara;
  perform pg_temp.act_as('sara.novak@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Sara own request') returning id into v_id;
  v_t := public.task_perform_action(v_id, 'send');
  assert v_t.current_assignee_user_id = v_anna, 'resolved to Anna';
  begin
    perform public.task_perform_action(v_id, 'approve');
    raise exception 'deputy approved their own request';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', sqlerrm;
  end;

  -- 5. Two levels up: Anna -> Tom -> Max.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.task_type_steps set assignee_level = 2
  where task_type_id = v_purchase and step_key = 'approval';
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Helmet') returning id into v_id;
  v_t := public.task_perform_action(v_id, 'send');
  assert v_t.current_assignee_user_id = v_max, 'level 2 resolves to Max';

  -- 6. No loops in the chain (Anna -> Tom -> Max -> Anna).
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  begin
    update public.users set supervisor_user_id = v_anna where id = v_max;
    raise exception 'loop accepted';
  exception when others then
    assert sqlerrm = 'The supervisor chain would loop', sqlerrm;
  end;
  -- Nobody changes their own supervisor.
  perform pg_temp.act_as('anna.weber@example.com');
  begin
    update public.users set supervisor_user_id = v_sara where id = v_anna;
    raise exception 'self change accepted';
  exception when others then
    assert sqlerrm = 'Only HR or an admin can change this field', sqlerrm;
  end;

  -- 7. Task type access: Workshop is limited to the general type; other roles stay open.
  perform pg_temp.act_as('paul.meier@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Pending for Anna') returning id into v_id;
  perform public.task_perform_action(v_id, 'send');
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.role_task_types (role_id, task_type_id) values (v_workshop, v_general);
  perform pg_temp.act_as('anna.weber@example.com');
  assert v_general = any(public.rls_my_task_type_ids()) and not v_purchase = any(public.rls_my_task_type_ids()),
    'Anna may only use the general type';
  insert into public.tasks (task_type_id, title) values (v_general, 'Allowed') returning id into v_id;
  begin
    insert into public.tasks (task_type_id, title) values (v_purchase, 'Not allowed');
    raise exception 'restricted type accepted';
  exception when others then
    assert sqlerrm = 'You are not allowed to create tasks of this type', sqlerrm;
  end;
  assert (select count(*) from public.tasks where id = v_id) = 1, 'a pending approval stays visible despite the type access';
  perform pg_temp.act_as('ben.keller@example.com');
  assert v_purchase = any(public.rls_my_task_type_ids()), 'Shopfloor has no restriction';
  -- A user with one restricted and one unrestricted role may use everything.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.user_roles (user_id, role_id) values (v_sara, v_manager) on conflict do nothing;
  perform pg_temp.act_as('sara.novak@example.com');
  assert v_purchase = any(public.rls_my_task_type_ids()), 'one open role is enough';
  -- Approving stays possible for the person a step resolved to, whatever the type access says.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.role_task_types (role_id, task_type_id) values (v_manager, v_general);
  perform pg_temp.act_as('tom.berger@example.com');
  assert not v_purchase = any(public.rls_my_task_type_ids()), 'Tom is restricted now';

  -- 8. Recurring rules follow the task type access: Tom may only set up and see rules of the general type.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.recurring_task_rules (name, task_type_id, schedule_kind) values ('Admin purchase rule', v_purchase, 'monthly');
  perform pg_temp.act_as('tom.berger@example.com');
  begin
    insert into public.recurring_task_rules (name, task_type_id, schedule_kind) values ('Not allowed', v_purchase, 'monthly');
    raise exception 'rule of a restricted type accepted';
  exception when others then
    assert sqlerrm = 'You are not allowed to use this task type', sqlerrm;
  end;
  insert into public.recurring_task_rules (name, task_type_id, schedule_kind) values ('Allowed rule', v_general, 'monthly') returning id into v_id;
  begin
    update public.recurring_task_rules set task_type_id = v_purchase where id = v_id;
    raise exception 'rule moved to a restricted type';
  exception when others then
    assert sqlerrm = 'You are not allowed to use this task type', sqlerrm;
  end;
  assert not exists (select 1 from public.recurring_task_rules where name = 'Admin purchase rule'), 'a rule of a restricted type stays hidden';
  assert exists (select 1 from public.recurring_task_rules where id = v_id), 'the own rule is visible';
  raise notice 'routing smoke test passed';
end;
$$;
reset role;
rollback;
