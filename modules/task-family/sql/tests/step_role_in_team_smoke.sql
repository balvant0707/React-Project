-- Copied from ~/maintenance_tool/supabase/tests/step_role_in_team_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- A route step "role within a team" (migration 20261212100000_assigned_scope.sql): resolving, who acts, who is
-- notified, "To decide", following the task's team, the constraint.
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/step_role_in_team_smoke.sql
-- Everything runs in one transaction and is rolled back; a failed check raises.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  v_role uuid := '00000000-0000-4000-8000-00000000a001';
  v_g1 uuid := '00000000-0000-4000-8000-00000000a011';
  v_g2 uuid := '00000000-0000-4000-8000-00000000a012';
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_paul uuid := (select id from public.users where email = 'paul.meier@example.com');
  v_type uuid;
  v_approve uuid;
  v_work uuid;
  v_check uuid;
  v_t public.tasks;
  v_r record;
  v_failed boolean;
begin
  -- Paul (team 1) and Sara (team 2) hold the role; Anna is in team 1 without it.
  delete from public.user_teams where user_id in (v_anna, v_sara, v_paul);
  insert into public.roles (id, name) values (v_role, 'S Approver');
  insert into public.teams (id, name) values (v_g1, 'S team one'), (v_g2, 'S team two');
  insert into public.user_teams (user_id, team_id) values (v_paul, v_g1), (v_anna, v_g1), (v_sara, v_g2);
  insert into public.user_roles (user_id, role_id) values (v_paul, v_role), (v_sara, v_role);

  insert into public.task_types (key, name) values ('s_role_in_team', 'S role in team') returning id into v_type;
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, assignee_role_id,
                                      assignee_team_scope, assignee_team_id, is_decision, actions) values
    (v_type, 'approve', 1, 'Approve', 'open', 'role', v_role, 'requester_team', null, true,
     '[{"key": "approve", "to": "work"}, {"key": "reject", "to": null}]'),
    (v_type, 'work', 2, 'Work', 'in_progress', 'role', v_role, 'task_team', null, false, '[{"key": "next", "to": "check"}]'),
    (v_type, 'check', 3, 'Check', 'in_progress', 'role', v_role, 'fixed', v_g2, false, '[{"key": "complete", "to": null}]');
  select id into v_approve from public.task_type_steps where task_type_id = v_type and step_key = 'approve';
  select id into v_work from public.task_type_steps where task_type_id = v_type and step_key = 'work';
  select id into v_check from public.task_type_steps where task_type_id = v_type and step_key = 'check';

  -- 1. "Manager in my team": Anna asks, the step goes to the holders of the role in her team (Paul).
  insert into public.tasks (task_type_id, title, team_id, created_by_user_id)
  values (v_type, 'S request by Anna', v_g2, v_anna) returning * into v_t;
  assert v_t.current_assignee_role_id = v_role and v_t.current_assignee_team_id = v_g1 and v_t.current_assignee_user_id is null,
    '1 requester_team resolves to the role in the requester''s team';
  assert public.task_step_actor(v_paul, v_t), '1 the holder of the role in the team acts';
  assert not public.task_step_actor(v_sara, v_t), '1 a holder of the role in another team does not';
  assert not public.task_step_actor(v_anna, v_t), '1 a member of the team without the role does not';
  assert public.task_step_recipients(null, v_g1, v_role) = array[v_paul], '1 only the holders in the team are notified';
  assert public.task_is_worked_by(v_paul, v_t.id) and not public.task_is_worked_by(v_sara, v_t.id),
    '1 the holders in the team see and check the task, others do not';

  -- 2. The requester is the only holder in their team: a decision step falls back, never to them.
  insert into public.tasks (task_type_id, title, created_by_user_id)
  values (v_type, 'S request by Paul', v_paul) returning * into v_t;
  assert v_t.current_assignee_team_id is null and v_t.current_assignee_role_id is distinct from v_role,
    '2 nobody else in the team holds the role: fallback role, not Paul';

  -- 3. "Role in the task's team" and "role in a fixed team".
  select * into v_r from public.resolve_step_assignee(v_work, v_anna, null, v_g2);
  assert v_r.assignee_role_id = v_role and v_r.assignee_team_id = v_g2, '3 task_team: the role in the task''s team';
  select * into v_r from public.resolve_step_assignee(v_work, v_anna, null, null);
  assert v_r.assignee_team_id is null and v_r.assignee_role_id is distinct from v_role, '3 a task without a team: fallback';
  select * into v_r from public.resolve_step_assignee(v_check, v_anna, null, v_g1);
  assert v_r.assignee_role_id = v_role and v_r.assignee_team_id = v_g2, '3 fixed: the role in the step''s team';

  -- 4. Moving the task to another team re-resolves a "role in the task's team" step.
  insert into public.tasks (task_type_id, title, team_id, created_by_user_id)
  values (v_type, 'S work by Anna', v_g2, v_anna) returning * into v_t;
  update public.tasks set current_step_key = 'work', current_assignee_role_id = v_role, current_assignee_team_id = v_g2
  where id = v_t.id;
  perform pg_temp.act_as('tom.berger@example.com');
  perform public.task_plan(v_t.id, v_g1, null, null);
  select * into v_t from public.tasks where id = v_t.id;
  assert v_t.current_assignee_team_id = v_g1 and v_t.current_assignee_role_id = v_role, '4 task_plan follows the task''s team';

  -- 5. "I take it" does not turn a role within a team into a step with any member.
  update public.tasks set assigned_user_id = null where id = v_t.id;
  perform pg_temp.act_as('anna.weber@example.com');
  begin
    perform public.task_claim(v_t.id);
  exception when others then null;  -- Anna may lack the edit right; either way the step must stay with the role
  end;
  select * into v_t from public.tasks where id = v_t.id;
  assert v_t.current_assignee_user_id is distinct from v_anna and v_t.current_assignee_role_id = v_role,
    '5 the step stays with the holders of the role';

  -- 6. The constraint: a team scope needs a role, "fixed" needs a team, a plain role step has no team.
  v_failed := false;
  begin
    insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, assignee_team_scope, actions)
    values (v_type, 'bad1', 9, 'Bad', 'open', 'role', 'task_team', '[{"key": "complete", "to": null}]');
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, '6 a team scope without a role is refused';
  v_failed := false;
  begin
    insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, assignee_role_id, assignee_team_scope, actions)
    values (v_type, 'bad2', 9, 'Bad', 'open', 'role', v_role, 'fixed', '[{"key": "complete", "to": null}]');
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, '6 "fixed" without a team is refused';
  v_failed := false;
  begin
    insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, assignee_role_id, assignee_team_id, actions)
    values (v_type, 'bad3', 9, 'Bad', 'open', 'role', v_role, v_g1, '[{"key": "complete", "to": null}]');
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, '6 a role step without a scope takes no team';
end $$;

-- 7. "To decide": the holders in the team see the request, the others do not (view and policy as the user).
select pg_temp.act_as('paul.meier@example.com');
set local role authenticated;
do $$ begin
  assert exists (select 1 from public.tasks_to_decide where title = 'S request by Anna'), '7 Paul has it under "To decide"';
end $$;
reset role;
select pg_temp.act_as('sara.novak@example.com');
set local role authenticated;
do $$ begin
  assert not exists (select 1 from public.tasks_to_decide where title = 'S request by Anna'), '7 Sara (other team) does not';
end $$;
reset role;

select 'step_role_in_team_smoke: all checks passed' as result;
rollback;
