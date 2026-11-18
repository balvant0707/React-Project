-- Copied from ~/maintenance_tool/supabase/tests/creator_guard_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Creator and reporter cannot be forged; a decision step's team is not the requester's choice
-- (migration 20261213100000_creator_guard_and_decision_teams.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/creator_guard_smoke.sql
-- Everything runs in one transaction and is rolled back; a failed check raises.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to public;

-- Fixtures as the superuser: a type with a decision step "approver role in a team of the requester", a team Anna
-- created herself with Sara (a holder of the role) in it, and a task assigned to Anna.
do $$
declare
  v_role uuid := '00000000-0000-4000-8000-00000000c001';
  v_own uuid := '00000000-0000-4000-8000-00000000c011';
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_type uuid;
begin
  insert into public.roles (id, name) values (v_role, 'C Approver');
  insert into public.user_roles (user_id, role_id) values (v_sara, v_role);
  insert into public.teams (id, name, user_created) values (v_own, 'C Anna''s own team', true);
  insert into public.team_uses (team_id, use) values (v_own, 'tasks');
  insert into public.user_teams (user_id, team_id) values (v_anna, v_own), (v_sara, v_own);
  insert into public.task_types (key, name) values ('c_decision_team', 'C decision team') returning id into v_type;
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, status, assignee_kind, assignee_role_id,
                                      assignee_team_scope, is_decision, actions) values
    (v_type, 'approve', 1, 'Approve', 'open', 'role', v_role, 'requester_team', true,
     '[{"key": "approve", "to": null}, {"key": "reject", "to": null}]');
  insert into public.tasks (task_type_id, title, assigned_user_id, created_by_user_id)
  values ((select id from public.task_types where key = 'maintenance'), 'C Anna''s task', v_anna, v_anna);
end $$;

-- 1. As Anna (a direct insert and update through PostgREST).
select pg_temp.act_as('anna.weber@example.com');
set local role authenticated;
do $$
declare
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_ben uuid := (select id from public.users where email = 'ben.keller@example.com');
  v_t public.tasks;
  v_k public.tickets;
  v_n integer;
  v_failed boolean;
begin
  insert into public.tasks (task_type_id, title, assigned_user_id, created_by_user_id)
  values ((select id from public.task_types where key = 'maintenance'), 'C forged', v_anna, v_ben) returning * into v_t;
  assert v_t.created_by_user_id = v_anna, '1 a task inserted in somebody else''s name records the caller';

  v_failed := false;
  begin
    update public.tasks set created_by_user_id = v_ben where title = 'C Anna''s task';
    get diagnostics v_n = row_count;
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, '1 the creator of a task cannot be changed';

  update public.tasks set title = 'C Anna''s task, renamed' where title = 'C Anna''s task';
  get diagnostics v_n = row_count;
  assert v_n = 1, '1 other fields of the task still change';

  insert into public.tickets (title, created_by_user_id, reporter_user_id)
  values ('C forged ticket', v_ben, v_ben) returning * into v_k;
  assert v_k.created_by_user_id = v_anna and v_k.reporter_user_id = v_anna, '1 a ticket records the caller as creator and reporter';
end $$;
reset role;

-- 2. The reporter of a ticket cannot be changed, even by somebody who may edit it.
select pg_temp.act_as('tom.berger@example.com');
set local role authenticated;
do $$
declare
  v_ben uuid := (select id from public.users where email = 'ben.keller@example.com');
  v_failed boolean := false;
begin
  assert exists (select 1 from public.tickets where title = 'C forged ticket'), '2 Tom sees the ticket';
  begin
    update public.tickets set reporter_user_id = v_ben where title = 'C forged ticket';
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, '2 the reporter of a ticket cannot be changed';
  v_failed := false;
  begin
    update public.tickets set created_by_user_id = v_ben where title = 'C forged ticket';
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, '2 the creator of a ticket cannot be changed';
end $$;
reset role;

-- 3. Security definer functions still set the creator on purpose (leave entered for a team member is theirs).
do $$
declare
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_t public.tasks;
begin
  -- as the superuser inside a definer: the explicit creator stays
  insert into public.tasks (task_type_id, title, assigned_user_id, created_by_user_id)
  values ((select id from public.task_types where key = 'maintenance'), 'C system', v_anna, v_anna) returning * into v_t;
  assert v_t.created_by_user_id = v_anna, '3 an insert outside the authenticated role keeps the given creator';
end $$;

-- 4. Decision teams.
do $$
declare
  v_role uuid := '00000000-0000-4000-8000-00000000c001';
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_step uuid := (select s.id from public.task_type_steps s join public.task_types t on t.id = s.task_type_id
                  where t.key = 'c_decision_team');
  v_r record;
  v_failed boolean := false;
begin
  select * into v_r from public.resolve_step_assignee(v_step, v_anna);
  assert v_r.assignee_team_id is distinct from '00000000-0000-4000-8000-00000000c011'::uuid,
    '4 a team the requester created is no source of deciders';

  -- the same team counts once the step is no decision
  update public.task_type_steps set is_decision = false, actions = '[{"key": "complete", "to": null}]' where id = v_step;
  select * into v_r from public.resolve_step_assignee(v_step, v_anna);
  assert v_r.assignee_team_id = '00000000-0000-4000-8000-00000000c011'::uuid and v_r.assignee_role_id = v_role,
    '4 a work step still uses the requester''s own team';

  begin
    update public.task_type_steps set is_decision = true, assignee_team_scope = 'task_team' where id = v_step;
  exception when check_violation then v_failed := true;
  end;
  assert v_failed, '4 a decision step cannot take the task''s team (the requester picks it)';
end $$;

rollback;
