-- Copied from ~/maintenance_tool/supabase/tests/assignee_notify_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- A task created for a person notifies them once, unless they created it (migration
-- 20261216130000_notify_assignee_on_create.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/assignee_notify_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
create temp table created (label text primary key, task_id uuid);
grant all on created to public;
grant execute on all functions in schema pg_temp to public;
set local role authenticated;

do $$
declare
  v_general uuid := (select id from public.task_types where key = 'general');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_ticket uuid;
  v_t public.tasks;
  v_l public.leave_requests;
begin
  perform pg_temp.act_as('tom.berger@example.com');
  -- 1. The task form, for somebody else.
  insert into created values ('form', public.task_create(v_general, 'Notify 1', current_date + 7, p_assigned_user_id => v_anna));
  -- 2. For oneself.
  insert into created values ('self', public.task_create(v_general, 'Notify 2', current_date + 7, p_assigned_user_id => v_tom));
  -- 3. A subtask for somebody else.
  insert into created values ('subtask', public.task_create(v_general, 'Notify 3', current_date + 7,
    p_assigned_user_id => v_anna, p_parent_task_id => (select task_id from created where label = 'self')));
  -- 4. A ticket turned into a task.
  insert into public.tickets (title, type, priority) values ('Notify ticket', 'incident', 'normal') returning id into v_ticket;
  v_t := public.ticket_convert_to_task(v_ticket, v_general, current_date + 7, null, null, v_anna);
  insert into created values ('ticket', v_t.id);

  -- 5. A leave request: the task goes to Anna's supervisor Tom, who hears of it once, through the step.
  perform pg_temp.act_as('anna.weber@example.com');
  v_l := public.leave_request_create('2027-03-01', '2027-03-05');
  insert into created values ('leave', v_l.task_id);
end;
$$;

reset role;

do $$
declare
  v_general uuid := (select id from public.task_types where key = 'general');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_rule public.recurring_task_rules;
  v_t public.tasks;
begin
  insert into public.recurring_task_rules (name, task_type_id, schedule_kind, assignment_mode, assigned_user_id)
  values ('Notify series', v_general, 'monthly', 'user', v_anna)
  returning * into v_rule;

  -- 6. A series task from the schedule (nobody signed in).
  perform set_config('request.jwt.claims', '', true);
  v_t := public.recurring_spawn_task(v_rule, current_date + 7);
  insert into created values ('series', v_t.id);

  -- 7. The next one, spawned while Anna completes the previous task: she is told all the same, with no actor.
  perform pg_temp.act_as('anna.weber@example.com');
  v_t := public.recurring_spawn_task(v_rule, current_date + 37);
  insert into created values ('series_own', v_t.id);

  -- 8. A task inserted without anybody signed in (seeds, SQL console) tells nobody.
  perform set_config('request.jwt.claims', '', true);
  insert into public.tasks (task_type_id, title, assigned_user_id, due_date)
  values (v_general, 'Notify seed', v_anna, current_date + 7) returning * into v_t;
  insert into created values ('seed', v_t.id);

  assert (select count(*) from public.notifications n join created c on c.task_id = n.entity_id
          where c.label = 'form' and n.user_id = v_anna and n.type = 'task_assigned' and n.actor_user_id = v_tom
            and n.occurrences = 1) = 1, '1 form: Anna notified once';
  assert not exists (select 1 from public.notifications n join created c on c.task_id = n.entity_id
                     where c.label = 'self' and n.type = 'task_assigned'), '2 self: nobody notified';
  assert (select count(*) from public.notifications n join created c on c.task_id = n.entity_id
          where c.label = 'subtask' and n.user_id = v_anna and n.type = 'task_assigned') = 1, '3 subtask: Anna notified';
  assert (select count(*) from public.notifications n join created c on c.task_id = n.entity_id
          where c.label = 'ticket' and n.user_id = v_anna and n.type = 'task_assigned' and n.occurrences = 1) = 1,
    '4 ticket: Anna notified once';
  assert (select count(*) from public.notifications n join created c on c.task_id = n.entity_id
          where c.label = 'leave' and n.user_id = v_tom) = 1, '5 leave: Tom notified once';
  assert (select count(*) from public.notifications n join created c on c.task_id = n.entity_id
          where c.label = 'series' and n.user_id = v_anna and n.type = 'task_assigned' and n.occurrences = 1
            and n.actor_user_id is null) = 1, '6 series: Anna notified once, no actor';
  assert not exists (select 1 from public.notifications n join created c on c.task_id = n.entity_id
                     where c.label = 'series' and n.type = 'task_for_team'), '6 series: no team message for a person';
  assert (select count(*) from public.notifications n join created c on c.task_id = n.entity_id
          where c.label = 'series_own' and n.user_id = v_anna and n.type = 'task_assigned'
            and n.actor_user_id is null) = 1, '7 series spawned by Anna: Anna notified, no actor';
  assert not exists (select 1 from public.notifications n join created c on c.task_id = n.entity_id
                     where c.label = 'seed'), '8 no signed-in person: nobody notified';
end;
$$;
rollback;
