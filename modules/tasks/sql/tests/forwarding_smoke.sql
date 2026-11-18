-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/forwarding_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Forwarding and the step rules team / task_owner / requester (migration 20261027100000_forwarding_and_step_rules.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/forwarding_smoke.sql
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
  v_purchase uuid := (select id from public.task_types where key = 'purchase_request');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_paul uuid := (select id from public.users where email = 'paul.meier@example.com');
  v_lena uuid := (select id from public.users where email = 'lena.fischer@example.com');
  v_type uuid;
  v_t public.tasks;
  v_id uuid;
  v_msg text;
begin
  -- A route over the three new rules: the mechanics team, then the task's assignee, then the requester.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.task_types (key, name) values ('forwarding_test', 'Forwarding test') returning id into v_type;
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, assignee_team_id, actions) values
    (v_type, 'triage', 1, 'Triage', 'open', 'team', v_mechanics, '[{"key": "next", "to": "work"}]'),
    (v_type, 'work', 2, 'Work', 'in_progress', 'task_owner', null, '[{"key": "next", "to": "check"}]'),
    (v_type, 'check', 3, 'Check', 'in_progress', 'requester', null, '[{"key": "complete", "to": null}]');

  -- 1. A team step: every member of the team may act and sees the task, nobody else.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id, assigned_user_id) values (v_type, 'Fwd 1', v_mechanics, v_anna)
    returning id into v_id;
  select * into v_t from public.tasks where id = v_id;
  assert v_t.current_assignee_team_id = v_mechanics and v_t.current_assignee_user_id is null, '1 resolved to the team';
  perform pg_temp.act_as('lena.fischer@example.com');
  begin
    perform public.task_perform_action(v_id, 'next');
    raise exception 'Lena acted on a team step';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', '1 ' || sqlerrm;
  end;
  perform pg_temp.act_as('sara.novak@example.com');
  assert (select count(*) from public.tasks where id = v_id) = 1, '1 a member sees the task';
  v_t := public.task_perform_action(v_id, 'next');

  -- 2. task_owner: the step goes to the task's assignee and follows a change of the assignee.
  assert v_t.current_step_key = 'work' and v_t.current_assignee_user_id = v_anna, '2 resolved to the assignee Anna';
  perform pg_temp.act_as('tom.berger@example.com');
  v_t := public.task_plan(v_id, v_mechanics, v_sara, null);
  assert v_t.current_assignee_user_id = v_sara, '2 follows the new assignee';

  -- 3. Forwarding a ruled step: the step moves, the assignee stays accountable, Paul is told.
  perform pg_temp.act_as('sara.novak@example.com');
  v_t := public.task_forward(v_id, v_paul, 'Paul knows the machine');
  assert v_t.current_assignee_user_id = v_paul and v_t.assigned_user_id = v_sara, '3 step forwarded, assignee kept';
  assert exists (select 1 from public.activity_events where entity_id = v_id and event_type = 'task_forwarded'
                 and metadata ->> 'to_user_id' = v_paul::text and metadata ->> 'comment' = 'Paul knows the machine'), '3 event';
  begin
    perform public.task_perform_action(v_id, 'next');
    raise exception 'Sara still acted';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', '3 ' || sqlerrm;
  end;
  -- 4. requester: the last step goes back to Tom, who started the task.
  perform pg_temp.act_as('paul.meier@example.com');
  assert exists (select 1 from public.notifications where user_id = v_paul and type = 'task_forwarded' and entity_id = v_id), '3 Paul notified';
  v_t := public.task_perform_action(v_id, 'next');
  assert v_t.current_step_key = 'check' and v_t.current_assignee_user_id = v_tom, '4 back to the requester';
  perform pg_temp.act_as('tom.berger@example.com');
  v_t := public.task_perform_action(v_id, 'complete');
  assert v_t.status = 'done', '4 done';

  -- 5. An approval is passed on only by the approver, and never to the requester.
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title) values (v_purchase, 'Fwd gloves') returning id into v_id;
  v_t := public.task_perform_action(v_id, 'send');
  assert v_t.current_assignee_user_id = v_tom, '5 approval with Tom';
  begin
    perform public.task_forward(v_id, v_lena);
    raise exception 'the requester forwarded the approval';
  exception when others then
    assert sqlerrm = 'You are not allowed to forward this task', '5 ' || sqlerrm;
  end;
  perform pg_temp.act_as('tom.berger@example.com');
  begin
    perform public.task_forward(v_id, v_anna);
    raise exception 'forwarded to the requester';
  exception when others then
    assert sqlerrm = 'An approval cannot be forwarded to the requester', '5 ' || sqlerrm;
  end;
  v_t := public.task_forward(v_id, v_sara, 'Please decide, I am away');
  perform pg_temp.act_as('sara.novak@example.com');
  v_t := public.task_perform_action(v_id, 'approve');
  assert v_t.current_step_key = 'purchasing', '5 Sara approved after the forward';

  -- 6. A role step: a holder of the role takes it over (forward to oneself).
  perform pg_temp.act_as('lena.fischer@example.com');
  v_t := public.task_forward(v_id, v_lena);
  assert v_t.current_assignee_user_id = v_lena and v_t.current_assignee_role_id is null, '6 taken over';

  -- 7. A step without a rule: forwarding changes the assignee; the team is cleared when the person is not in it.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id, assigned_user_id) values (v_general, 'Fwd plain', v_mechanics, v_anna)
    returning id into v_id;
  perform pg_temp.act_as('anna.weber@example.com');
  v_t := public.task_forward(v_id, v_sara);
  assert v_t.assigned_user_id = v_sara and v_t.team_id = v_mechanics, '7 to a team member, team kept';
  perform pg_temp.act_as('sara.novak@example.com');
  v_t := public.task_forward(v_id, v_lena, 'For purchasing');
  assert v_t.assigned_user_id = v_lena and v_t.team_id is null, '7 outside the team, team cleared';
  perform pg_temp.act_as('lena.fischer@example.com');
  assert (select count(*) from public.tasks where id = v_id) = 1, '7 Lena sees her task';
  begin
    perform public.task_forward(v_id, (select id from public.users where not has_login limit 1));
    raise exception 'forwarded to a person without login';
  exception when others then
    assert sqlerrm = 'This person cannot sign in', '7 ' || sqlerrm;
  end;

  -- 8. Ben (Shopfloor) neither works the step nor may edit: no forwarding.
  perform pg_temp.act_as('ben.keller@example.com');
  begin
    perform public.task_forward(v_id, (select id from public.users where email = 'ben.keller@example.com'));
    raise exception 'Ben forwarded';
  exception when others then
    assert sqlerrm in ('You are not allowed to forward this task', 'Task not found'), '8 ' || sqlerrm;
  end;

  -- 9. The route is referenced: a step with open tasks in it can be neither deleted nor renamed.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id) values (v_type, 'Fwd in triage', v_mechanics);
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  begin
    delete from public.task_type_steps where task_type_id = v_type and step_key = 'triage';
    raise exception 'deleted a step in use';
  exception when others then
    get stacked diagnostics v_msg = pg_exception_hint;
    assert v_msg = 'step_in_use', '9 ' || sqlerrm;
  end;
  begin
    update public.task_type_steps set step_key = 'triage2' where task_type_id = v_type and step_key = 'triage';
    raise exception 'renamed a step in use';
  exception when others then
    get stacked diagnostics v_msg = pg_exception_hint;
    assert v_msg = 'step_in_use', '9 ' || sqlerrm;
  end;
  -- A step nobody stands in can go.
  delete from public.task_type_steps where task_type_id = v_type and step_key = 'check';

  -- 10. Every kind that can come up empty falls back: an assignee-less task without team goes to the Admin role.
  update public.task_type_steps set actions = '[{"key": "next", "to": "work"}]' where task_type_id = v_type and step_key = 'triage';
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title, team_id) values (v_type, 'Fwd fallback', v_mechanics) returning id into v_id;
  perform pg_temp.act_as('sara.novak@example.com');
  v_t := public.task_perform_action(v_id, 'next');
  -- No assignee: the owner's team takes the step.
  assert v_t.current_assignee_team_id = v_mechanics and v_t.current_assignee_user_id is null, '10 owner team';

  raise notice 'forwarding smoke test passed';
end $$;
rollback;
