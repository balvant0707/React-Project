-- Copied from ~/maintenance_tool/supabase/tests/absence_types_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Absence types with a route each, the generic decision hook and acting on behalf of somebody
-- (migration 20261221100000_absence_types.sql, ~/maintenance_tool/docs/leave.md "Absences").
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/absence_types_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to public;

-- Two routes, set up as the database owner: decision by the supervisor, then booking by HR; and booking only (a
-- report that needs no approval, like a sick note).
do $$
declare
  v_hr uuid := (select id from public.roles where name = 'HR');
  v_booked uuid;
  v_report uuid;
begin
  insert into public.task_types (key, name, purpose, hooks)
  values ('smoke_absence_booked', 'Smoke booked', 'leave', '[{"hook": "leave_withdraw", "event": "cancelled"}, {"hook": "leave_decide", "event": "done"}]')
  returning id into v_booked;
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, is_decision, assignee_kind, fallback_role_id, hooks, actions)
  values (v_booked, 'approval', 1, 'Approval', true, 'requester_supervisor', v_hr,
          '[{"hook": "leave_decide", "event": "action"}]',
          '[{"key": "approve", "to": "book", "kind": "positive"}, {"key": "reject", "to": null, "kind": "negative", "requires_comment": true},
            {"key": "send_back", "to": "rework", "kind": "negative"}]');
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, assignee_kind, actions)
  values (v_booked, 'rework', 3, 'Rework', 'requester', '[{"key": "done", "to": null, "kind": "positive"}]');
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, assignee_kind, assignee_role_id, actions)
  values (v_booked, 'book', 2, 'Book in time recording', 'role', v_hr, '[{"key": "booked", "to": null, "kind": "positive"}]');

  insert into public.task_types (key, name, purpose, hooks)
  values ('smoke_absence_report', 'Smoke report', 'leave', '[{"hook": "leave_withdraw", "event": "cancelled"}, {"hook": "leave_decide", "event": "done"}]')
  returning id into v_report;
  insert into public.task_type_steps (task_type_id, step_key, step_order, name, assignee_kind, assignee_role_id, actions)
  values (v_report, 'book', 1, 'Book in time recording', 'role', v_hr, '[{"key": "booked", "to": null, "kind": "positive"}]');

  insert into public.absence_types (name, name_de, task_type_id, sort_order) values
    ('Smoke trip', 'Smoke Reise', v_booked, 900), ('Smoke sick', 'Smoke krank', v_report, 901);
  insert into public.absence_types (name, name_de, task_type_id, sort_order, active) values ('Smoke old', 'Smoke alt', v_report, 902, false);
end $$;

set local role authenticated;

do $$
declare
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_hanna uuid := (select id from public.users where email = 'hanna.richter@example.com');
  v_trip uuid := (select id from public.absence_types where name = 'Smoke trip');
  v_sick uuid := (select id from public.absence_types where name = 'Smoke sick');
  v_old uuid := (select id from public.absence_types where name = 'Smoke old');
  v_l public.leave_requests;
  v_t public.tasks;
begin
  -- 0. Every route is a system type (not offered in the task form) and fulfils the contract; the special case for
  --    entering leave is gone from the generic step check.
  assert (select bool_and(system_created) from public.task_types where key like 'smoke_absence_%'), '0 system types';
  assert (select bool_and(cardinality(public.task_type_purpose_problems(id)) = 0) from public.task_types where key like 'smoke_absence_%'), '0 contract';
  assert not exists (select 1 from pg_proc where prosrc like '%leave_enter_actor%'), '0 no leave special case left';

  -- 1. Anna applies for a trip: the route of the type takes it to Tom; the entry waits.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2028-03-06', '2028-03-07', p_absence_type_id => v_trip);
  v_t := (select t from public.tasks t where t.id = v_l.task_id);
  assert v_l.status = 'requested' and v_l.absence_type_id = v_trip, '1 requested';
  assert v_t.current_step_key = 'approval' and v_t.current_assignee_user_id = v_tom, '1 with Tom';
  assert (select task_type_id from public.tasks where id = v_l.task_id) = (select task_type_id from public.absence_types where id = v_trip), '1 route of the type';
  -- Every route of the purpose belongs to the module leave, whatever its key: a colleague does not see the task.
  assert v_t.permission_module = 'leave', '1 module leave';
  perform pg_temp.act_as('sara.novak@example.com');
  assert not exists (select 1 from public.tasks where id = v_l.task_id), '1 colleague does not see it';

  -- 2. Tom approves: the decision is written when the route leaves its decision part; booking is still open with HR.
  perform pg_temp.act_as('tom.berger@example.com');
  v_t := public.task_perform_action(v_l.task_id, 'approve');
  assert (select status from public.leave_requests where id = v_l.id) = 'approved', '2 approved';
  assert (select decided_by_user_id from public.leave_requests where id = v_l.id) = v_tom, '2 decided by Tom';
  assert v_t.status <> 'done' and v_t.current_step_key = 'book', '2 booking open';
  begin
    perform public.task_perform_action(v_l.task_id, 'booked');
    raise exception 'Tom booked';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', '2 only HR books: ' || sqlerrm;
  end;

  -- 3. Hanna (HR) books: the task is done, the entry stays approved.
  perform pg_temp.act_as('hanna.richter@example.com');
  v_t := public.task_perform_action(v_l.task_id, 'booked');
  assert v_t.status = 'done' and (select status from public.leave_requests where id = v_l.id) = 'approved', '3 booked';

  -- 4. Withdrawn after booking: the entry is cancelled, the task stays done, the booker hears of it.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_withdraw(v_l.id);
  assert v_l.status = 'cancelled' and (select status from public.tasks where id = v_l.task_id) = 'done', '4 cancelled after booking';
  perform pg_temp.act_as('hanna.richter@example.com');
  assert exists (select 1 from public.notifications where user_id = v_hanna and type = 'leave_withdrawn' and entity_id = v_l.task_id), '4 booker told';

  -- 5. Rejected: finished at the decision, no booking.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2028-04-03', '2028-04-03', p_absence_type_id => v_trip);
  perform pg_temp.act_as('tom.berger@example.com');
  v_t := public.task_perform_action(v_l.task_id, 'reject', 'Not now');
  assert v_t.status = 'done' and (select status from public.leave_requests where id = v_l.id) = 'rejected', '5 rejected';

  -- 6. A route without a decision step: the entry counts at once, only the booking waits.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2028-05-02', '2028-05-03', p_absence_type_id => v_sick);
  v_t := (select t from public.tasks t where t.id = v_l.task_id);
  assert v_l.status = 'approved' and v_l.decided_at is not null and v_l.decided_by_user_id is null, '6 counts at once';
  assert v_t.status <> 'done' and v_t.current_step_key = 'book', '6 booking open';

  -- 7. Withdrawn while the booking waits: the task is cancelled (hook leave_withdraw marks the entry).
  v_l := public.leave_request_withdraw(v_l.id);
  assert v_l.status = 'cancelled' and (select status from public.tasks where id = v_l.task_id) = 'cancelled', '7 cancelled with the task';

  -- 8. Tom enters a trip for Anna: he decides the first step on her behalf, the booking stays with HR.
  perform pg_temp.act_as('tom.berger@example.com');
  assert public.leave_can_enter_for(v_anna, v_trip), '8 may enter';
  v_l := public.leave_request_create('2028-06-05', '2028-06-06', p_absence_type_id => v_trip, p_user_id => v_anna);
  assert v_l.status = 'approved' and v_l.entered_by_user_id = v_tom and v_l.decided_by_user_id = v_tom, '8 entered and decided';
  assert (select current_step_key from public.tasks where id = v_l.task_id) = 'book', '8 booking open';
  assert (select actor_user_id from public.task_step_history where task_id = v_l.task_id and step_key = 'approval') = v_tom, '8 actor in history';
  assert (select created_by_user_id from public.tasks where id = v_l.task_id) = v_anna, '8 Anna is the requester';

  -- 9. An inactive type is refused; the year overview carries the type and the leave flag.
  perform pg_temp.act_as('anna.weber@example.com');
  begin
    perform public.leave_request_create('2028-07-03', '2028-07-03', p_absence_type_id => v_old);
    raise exception 'inactive type used';
  exception when others then
    assert sqlerrm = 'Unknown or inactive absence type', '9 ' || sqlerrm;
  end;
  assert exists (select 1 from public.leave_year_overview where user_id = v_anna and year = 2028 and absence_type_id = v_trip and not counts_as_leave), '9 overview per type';

  -- 10. Only an admin maintains absence types; everybody reads them.
  assert (select count(*) from public.absence_types where name like 'Smoke %') = 3, '10 readable';
  begin
    insert into public.absence_types (name, name_de, task_type_id) values ('x', 'x', (select task_type_id from public.absence_types where id = v_trip));
    raise exception 'non-admin created a type';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.absence_types set color = 'blue' where id = v_trip;
  assert (select color from public.absence_types where id = v_trip) = 'blue', '10 admin edits';
  begin
    insert into public.absence_types (name, name_de, task_type_id) values ('x', 'x', (select id from public.task_types where key = 'general'));
    raise exception 'route without the purpose';
  exception when check_violation then null;
  end;

  -- 11. Sent back to a rework step that ends the task: the absence was never approved, `done` rejects it.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2028-08-07', '2028-08-08', p_absence_type_id => v_trip);
  perform pg_temp.act_as('tom.berger@example.com');
  perform public.task_perform_action(v_l.task_id, 'send_back');
  assert (select status from public.leave_requests where id = v_l.id) = 'requested', '11 still waiting during rework';
  perform pg_temp.act_as('anna.weber@example.com');
  perform public.task_perform_action(v_l.task_id, 'done');
  assert (select status from public.leave_requests where id = v_l.id) = 'rejected', '11 rejected when the task ends';

  -- 12. The dialog offers Tom only the types whose first step he decides for Anna (not the sick report: HR books it).
  perform pg_temp.act_as('tom.berger@example.com');
  assert exists (select 1 from public.leave_enterable_types(v_anna) where absence_type_id = v_trip), '12 trip enterable';
  assert not exists (select 1 from public.leave_enterable_types(v_anna) where absence_type_id = v_sick), '12 sick not enterable';

  -- 13. A route whose task type is inactive is refused.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.task_types set active = false where id = (select task_type_id from public.absence_types where id = v_trip);
  perform pg_temp.act_as('anna.weber@example.com');
  begin
    perform public.leave_request_create('2028-09-04', '2028-09-04', p_absence_type_id => v_trip);
    raise exception 'inactive route used';
  exception when others then
    assert sqlerrm = 'The route of the absence type is inactive', '13 ' || sqlerrm;
  end;

  raise notice 'absence types smoke test passed';
end $$;
rollback;
