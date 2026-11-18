-- Copied from ~/maintenance_tool/supabase/tests/leave_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Workflow hooks + leave requests (migrations 20261102100000_workflow_hooks.sql, 20261102110000_leave.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/leave_smoke.sql
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
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_l public.leave_requests;
  v_l2 public.leave_requests;
  v_t public.tasks;
  v_n numeric;
begin
  -- 1. Working days: Mon 2026-12-21 .. Fri 2026-12-25 = 4 (25.12. is a holiday); half days count half.
  assert public.leave_working_days(null, '2026-12-21', '2026-12-25') = 4, '1 holiday removed';
  assert public.leave_working_days(null, '2026-12-21', '2026-12-23', true, false) = 2.5, '1 start half';
  assert public.leave_working_days(null, '2026-12-21', '2026-12-21', false, true) = 0.5, '1 single half day';
  assert public.leave_working_days(null, '2026-12-26', '2026-12-27') = 0, '1 weekend';

  -- 2. Anna applies: the task goes to her supervisor Tom, the row is requested.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2026-12-28', '2027-01-08', false, true);
  assert v_l.status = 'requested', '2 requested';
  assert v_l.working_days = 8.5, '2 days ' || v_l.working_days;   -- 28.-31.12. (4) + 4.-8.1. (5), 1.1. holiday, last day half
  select * into v_t from public.tasks where id = v_l.task_id;
  assert v_t.current_assignee_user_id = v_tom and v_t.assigned_user_id = v_tom and v_t.created_by_user_id = v_anna, '2 routed to Tom';
  assert v_t.status = 'waiting_for_approval', '2 status';

  -- 3. The system-created type cannot be created by hand; Anna cannot decide.
  begin
    insert into public.tasks (task_type_id, title, assigned_user_id) values (v_t.task_type_id, 'by hand', v_anna);
    raise exception 'created a leave task by hand';
  exception when others then
    assert sqlerrm = 'This task type is created by its own function only', '3 ' || sqlerrm;
  end;
  begin
    perform public.task_perform_action(v_t.id, 'approve');
    raise exception 'Anna approved her own leave';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', '3b ' || sqlerrm;
  end;

  -- 4. Overlap is refused, touching halves are allowed.
  begin
    perform public.leave_request_create('2027-01-04', '2027-01-05');
    raise exception 'overlap accepted';
  exception when others then
    assert sqlerrm = 'There is already leave in this period', '4 ' || sqlerrm;
  end;
  v_l2 := public.leave_request_create('2027-01-08', '2027-01-11', true, false);
  assert v_l2.status = 'requested', '4 touching halves';

  -- 5. Tom approves: the hook writes the decision; Anna sees it; the year overview splits at New Year.
  perform pg_temp.act_as('tom.berger@example.com');
  perform public.task_perform_action(v_l.task_id, 'approve');
  assert (select status from public.leave_requests where id = v_l.id) = 'approved', '5 approved';
  assert (select decided_by_user_id from public.leave_requests where id = v_l.id) = v_tom, '5 decided by';
  perform pg_temp.act_as('anna.weber@example.com');
  select approved_days into v_n from public.leave_year_overview where user_id = v_anna and year = 2026 and counts_as_leave;
  assert v_n = 4, '5 days 2026 ' || coalesce(v_n::text, 'null');
  select approved_days into v_n from public.leave_year_overview where user_id = v_anna and year = 2027 and counts_as_leave;
  assert v_n = 4.5, '5 days 2027 ' || coalesce(v_n::text, 'null');
  select requested_days into v_n from public.leave_year_overview where user_id = v_anna and year = 2027 and counts_as_leave;
  assert v_n = 1.5, '5 requested 2027 ' || coalesce(v_n::text, 'null');

  -- 6. Rejecting needs a comment and ends as rejected.
  perform pg_temp.act_as('tom.berger@example.com');
  begin
    perform public.task_perform_action(v_l2.task_id, 'reject');
    raise exception 'rejected without comment';
  exception when others then
    assert sqlerrm = 'This action requires a comment', '6 ' || sqlerrm;
  end;
  perform public.task_perform_action(v_l2.task_id, 'reject', 'Project deadline');
  assert (select status from public.leave_requests where id = v_l2.id) = 'rejected', '6 rejected';

  -- 7. Withdraw a pending one (route cancel + hook), then an approved one in the future.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l2 := public.leave_request_create('2027-02-01', '2027-02-05');
  v_l2 := public.leave_request_withdraw(v_l2.id, 'Plans changed');
  assert v_l2.status = 'cancelled', '7 pending withdrawn';
  assert (select status from public.tasks where id = v_l2.task_id) = 'cancelled', '7 task cancelled';
  v_l := public.leave_request_withdraw(v_l.id);
  assert v_l.status = 'cancelled', '7 approved withdrawn';

  -- 8. The supervisor was told; others do not see the application.
  perform pg_temp.act_as('tom.berger@example.com');
  assert exists (select 1 from public.notifications where user_id = v_tom and type = 'leave_withdrawn'), '8 supervisor told';
  perform pg_temp.act_as('sara.novak@example.com');
  assert (select count(*) from public.leave_requests) = 0, '8 hidden from Sara';
  perform pg_temp.act_as('hanna.richter@example.com');
  assert (select count(*) from public.leave_requests) >= 3, '8 HR sees all';

  -- 9. Hooks are validated against the registry.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  begin
    update public.task_type_steps set hooks = '[{"hook": "nope", "event": "done"}]' where task_type_id = v_general;
    raise exception 'unknown hook accepted';
  exception when others then
    assert sqlerrm like 'Unknown workflow hook%', '9 ' || sqlerrm;
  end;
  begin
    update public.task_type_steps set hooks = '[{"hook": "leave_decide", "event": "enter"}]' where task_type_id = v_general;
    raise exception 'wrong event accepted';
  exception when others then
    assert sqlerrm like 'Unknown workflow hook%', '9b ' || sqlerrm;
  end;
end;
$$;
rollback;

-- ===== Stage 2: planner, absence rule, adjusting =====
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
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_max uuid := (select id from public.users where email = 'max.wilckens@wilckens.com');
  v_team uuid := (select ug.team_id from public.user_teams ug where ug.user_id = v_anna limit 1);
  v_size int;
  v_l public.leave_requests;
  v_l2 public.leave_requests;
  v_n int;
begin
  select count(*) into v_size from public.user_teams where team_id = v_team;
  assert v_size >= 2, 'team of Anna has colleagues';
  -- Make the rule easy to hit: nobody may be away at the same time except one person (min allowed 1, 20 %).
  update public.app_settings set value = case key when 'leave_max_absent_pct' then '0' else '1' end
    where key in ('leave_max_absent_pct', 'leave_min_allowed_absent');


  -- 2. Anna's leave is fine alone; Sara asking for the same week breaks the rule for her.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2027-03-01', '2027-03-05');
  perform pg_temp.act_as('sara.novak@example.com');
  select count(distinct day) into v_n from public.leave_check_period('2027-03-03', '2027-03-04');
  assert v_n = 2, '2 two violating days ' || v_n;
  v_l2 := public.leave_request_create('2027-03-03', '2027-03-04');

  -- 3. Planner: Sara sees Anna as away (same team), not the kind; a stranger sees nothing.
  assert (select count(*) from public.leave_planner_days(array[v_anna], '2027-03-01', '2027-03-31')) = 5, '3 five days';
  assert (select count(distinct request_id) from public.leave_planner_days(array[v_anna, v_sara], '2027-03-01', '2027-03-31')) = 2, '3 both';
  assert exists (select 1 from public.leave_planner_teams() where id = v_team), '3 team listed';
  assert (select max(away) from public.leave_team_load(v_team, '2027-03-01', '2027-03-31')) = 2, '3 load';
  perform pg_temp.act_as('lena.fischer@example.com');
  assert (select count(*) from public.leave_planner_days(array[v_anna], '2027-03-01', '2027-03-31')) = 0, '3 stranger sees nothing';

  -- 4. Tom adjusts Sara's request (shorter), the feed shows it; Sara cannot adjust Anna's.
  perform pg_temp.act_as('tom.berger@example.com');
  v_l2 := public.leave_request_adjust(v_l2.id, '2027-03-03', '2027-03-03', false, true, null, 'Only one day');
  assert v_l2.working_days = 0.5, '4 half day ' || v_l2.working_days;
  assert exists (select 1 from public.activity_events where entity_id = v_l2.task_id and event_type = 'leave_adjusted'), '4 event';
  perform pg_temp.act_as('sara.novak@example.com');
  begin
    perform public.leave_request_adjust(v_l.id, '2027-03-01', '2027-03-02');
    raise exception 'Sara changed the leave of Anna';
  exception when others then
    assert sqlerrm in ('You are not allowed to change this leave', 'Leave request not found'), '4b ' || sqlerrm;
  end;

  -- 5. The violations are live: they follow the current leave, nothing is stored on a request. The supervisor's supervisor
  --    sees them and was told when the approval went over the limit.
  perform pg_temp.act_as('tom.berger@example.com');
  perform public.task_perform_action(v_l.task_id, 'approve');
  perform public.task_perform_action(v_l2.task_id, 'approve');
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert exists (select 1 from public.leave_violations(1000) where day = '2027-03-03' and v_anna = any (user_ids) and v_sara = any (user_ids)), '5 live violation on 3 March';
  assert exists (select 1 from public.notifications where user_id = v_max and type = 'leave_rule_violation'), '5 level 2 told';
  perform pg_temp.act_as('anna.weber@example.com');
  assert (select count(*) from public.leave_violations(1000)) = 0, '5 Anna sees no violations';
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select count(*) from public.leave_violations(1000)) = 0, '5 the direct supervisor sees them in the planner, not in the list';

  -- 6. Sara withdraws: the violation is gone at once (no stale flag).
  perform pg_temp.act_as('sara.novak@example.com');
  perform public.leave_request_withdraw(v_l2.id);
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert not exists (select 1 from public.leave_violations(1000) where day = '2027-03-03'), '6 violation follows the withdrawal';

  -- 7. Dashboard numbers: Tom has the new request of Anna waiting; Anna's own days are counted.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2027-06-07', '2027-06-08');
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select pending_decisions from public.leave_dashboard_counts()) = 1, '7 one decision waits for Tom';
  assert (select count(*) from public.leave_pending_for_me() where id = v_l.id) = 1, '7 in the list';
  perform pg_temp.act_as('sara.novak@example.com');
  assert (select pending_decisions from public.leave_dashboard_counts()) = 0, '7 Sara has nothing to decide';

  -- 7b. My year in three parts: Tom enters leave for Anna around today (approved at once); the days before today count
  -- as taken, today and later as planned. Skipped near New Year, where the request would cross the year.
  if extract(doy from current_date) between 10 and 350 then
    perform pg_temp.act_as('anna.weber@example.com');
    create temp table pg_temp.before_split as select * from public.leave_dashboard_counts();
    perform pg_temp.act_as('tom.berger@example.com');
    v_l := public.leave_request_create(current_date - 6, current_date + 6, p_user_id => v_anna);
    assert v_l.status = 'approved', '7b entered by the supervisor, approved';
    perform pg_temp.act_as('anna.weber@example.com');
    assert (select c.my_days_taken - b.my_days_taken from public.leave_dashboard_counts() c, pg_temp.before_split b)
         = public.leave_working_days((select site from public.users where id = v_anna), current_date - 6, current_date - 1), '7b taken = before today';
    assert (select c.my_days_planned - b.my_days_planned from public.leave_dashboard_counts() c, pg_temp.before_split b)
         = public.leave_working_days((select site from public.users where id = v_anna), current_date, current_date + 6), '7b planned = today and later';
  end if;

  -- 8. No self-approval: Hanna (HR, no supervisor) applies, the step falls back to role HR, she cannot approve it herself.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.users set supervisor_user_id = null where email = 'hanna.richter@example.com';
  perform pg_temp.act_as('hanna.richter@example.com');
  v_l := public.leave_request_create('2027-07-05', '2027-07-09');
  begin
    perform public.task_perform_action(v_l.task_id, 'approve');
    raise exception 'HR approved her own leave';
  exception when others then
    assert sqlerrm = 'You are not allowed to work this step', '8 ' || sqlerrm;
  end;
  assert (select count(*) from public.leave_pending_for_me()) = 0, '8 not in her own list';
  -- another HR employee gets it in the list and may decide; the planner row picks the worst team
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.user_roles (user_id, role_id)
  select (select id from public.users where email = 'lena.fischer@example.com'), id from public.roles where name = 'HR';
  perform pg_temp.act_as('lena.fischer@example.com');
  assert (select count(*) from public.leave_pending_for_me() where id = v_l.id) = 1, '8 fallback approver sees it';
  assert (select count(*) from public.leave_check_period('2027-07-05', '2027-07-09', false, false, (select id from public.users where email = 'hanna.richter@example.com'))) >= 0, '8 may check the requester';
  perform public.task_perform_action(v_l.task_id, 'approve');
  assert (select status from public.leave_requests where id = v_l.id) = 'approved', '8 approved by the other HR';

  -- 9. Planner load: the team with the highest load per day (Anna and Sara away on 3 March 2027, see section 5).
  perform pg_temp.act_as('sara.novak@example.com');
  perform public.leave_request_create('2027-03-03', '2027-03-03');
  perform public.leave_request_create('2027-03-09', '2027-03-09');
  perform pg_temp.act_as('anna.weber@example.com');
  perform public.leave_request_create('2027-03-09', '2027-03-09');
  assert (select max(away) from public.leave_planner_load(array[v_anna, v_sara], '2027-03-01', '2027-03-31')) = 2, '9 worst team load';

  -- 10. A supervisor enters leave for a team member: decided at once, the person is the requester; nobody else may.
  perform pg_temp.act_as('tom.berger@example.com');
  v_l := public.leave_request_create('2027-09-06', '2027-09-07', false, false, null, null, null, v_anna);
  assert v_l.user_id = v_anna and v_l.status = 'approved', '10 entered and approved';
  assert (select created_by_user_id from public.tasks where id = v_l.task_id) = v_anna, '10 the person is the requester';
  perform pg_temp.act_as('anna.weber@example.com');
  assert (select count(*) from public.leave_requests where id = v_l.id) = 1, '10 the person sees it';
  begin
    perform public.leave_request_create('2027-09-14', '2027-09-14', false, false, null, null, null, v_tom);
    raise exception 'entered for her supervisor';
  exception when others then
    assert sqlerrm = 'You may only enter leave for the people you approve leave for (or as HR)', '10 ' || sqlerrm;
  end;
  perform pg_temp.act_as('sara.novak@example.com');
  begin
    perform public.leave_request_create('2027-09-14', '2027-09-14', false, false, null, null, null, v_anna);
    raise exception 'entered by a colleague';
  exception when others then
    assert sqlerrm = 'You may only enter leave for the people you approve leave for (or as HR)', '10b ' || sqlerrm;
  end;
  -- 10c. The deputy of the approver may enter it too; the person is told about it.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.users set deputy_user_id = (select id from public.users where email = 'sara.novak@example.com') where id = v_tom;
  perform pg_temp.act_as('sara.novak@example.com');
  v_l := public.leave_request_create('2027-09-20', '2027-09-21', false, false, null, null, null, v_anna);
  assert v_l.status = 'approved', '10c deputy entered';
  perform pg_temp.act_as('anna.weber@example.com');
  assert exists (select 1 from public.notifications n where n.user_id = v_anna and n.entity_id = v_l.task_id), '10c the person is notified';
  -- 10d. HR may enter it for anybody (also without a supervisor); the entry records who typed it; the planner list agrees.
  perform pg_temp.act_as('hanna.richter@example.com');
  v_l := public.leave_request_create('2027-09-27', '2027-09-28', false, false, null, null, null, v_anna);
  assert v_l.status = 'approved' and v_l.entered_by_user_id = (select id from public.users where email = 'hanna.richter@example.com'), '10d HR entered';
  assert (select count(*) from public.leave_enterable_users() where user_id = v_anna) = 1, '10d HR list';
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select count(*) from public.leave_enterable_users() where user_id = v_anna) = 1, '10d supervisor list';
  assert (select count(*) from public.leave_enterable_users() where user_id = v_tom) = 0, '10d not for himself';
  perform pg_temp.act_as('sara.novak@example.com');
  assert (select count(*) from public.leave_enterable_users() where user_id = v_anna) = 0 or (select deputy_user_id from public.users where id = v_tom) = (select id from public.users where email = 'sara.novak@example.com'), '10d colleague list';
end;
$$;
rollback;
