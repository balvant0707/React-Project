-- New test (plan phase 6 criterion): a task on a specification is created, forwarded and completed; rights checks.
-- tools/sql-test.sh npm platform/sql/tests/tasks_smoke.sql   (RADAR seed: 10_tasks.sql task types and rights)
-- Signed in as authenticated users like PostgREST. One transaction, rolled back. Result lines: ok / FAIL.
\set ON_ERROR_STOP on
\pset tuples_only on
begin;

create temp table fx on commit drop as
select (select id from public.users where username = 'ugur.akbati') as ugur,
       (select id from public.users where username = 'jenko.harrendorf') as jenko,
       (select id from public.users where username = 'jan.hoessermann') as jan,
       (select id from public.task_types where key = 'general') as general,
       (select id from public.task_types where key = 'review') as review,
       null::uuid as spec, null::uuid as t1, null::uuid as t2;
grant all on fx to public;

-- ugur (Sales Rep): a specification he can view, a task on it, assigned to jenko (same team)
select set_config('request.jwt.claims', json_build_object('sub', (select ugur from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
update fx set spec = (select id from public.specifications order by created_at limit 1);
select case when (select spec from fx) is not null then 'ok' else 'FAIL' end || ' ugur sees a specification';
update fx set t1 = public.task_create((select general from fx), 'Chase the customer', current_date + 3, 'normal', null,
                                       'specifications', (select spec from fx), null, (select jenko from fx));
select case when s.status = 'open' and s.current_step_key = 'work' and s.anchor_type = 'specifications' then 'ok' else 'FAIL' end
       || ' task created on the specification, first step'
from public.tasks_overview s where s.id = (select t1 from fx);
select case when public.task_anchor_label('specifications', (select spec from fx)) is not null then 'ok' else 'FAIL' end || ' anchor label for ugur';
reset role;

-- jenko: sees it (assigned), forwards it to ugur
select set_config('request.jwt.claims', json_build_object('sub', (select jenko from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select case when exists (select 1 from public.tasks where id = (select t1 from fx)) then 'ok' else 'FAIL' end || ' jenko sees the task';
select case when (public.task_forward((select t1 from fx), (select ugur from fx), 'Over to you')).assigned_user_id = (select ugur from fx)
       then 'ok' else 'FAIL' end || ' jenko forwards to ugur';
reset role;

-- ugur completes it
select set_config('request.jwt.claims', json_build_object('sub', (select ugur from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select case when (public.task_perform_action((select t1 from fx), 'complete')).status = 'done' then 'ok' else 'FAIL' end || ' ugur completes the task';
select case when (select count(*) from public.task_step_history where task_id = (select t1 from fx)) = 1
            and exists (select 1 from public.activity_events where entity_id = (select t1 from fx) and event_type = 'task_completed')
       then 'ok' else 'FAIL' end || ' history and activity written';
-- routing fields only through the engine (the engine's flag is transaction-local; one request = one transaction)
select set_config('app.task_engine', 'off', true) is not null as flag_off;
do $$ begin
  update public.tasks set status = 'open' where id = (select t1 from fx);
  raise notice 'FAIL status changed directly';
exception when others then raise notice 'ok status not writable directly';
end $$;
-- a review task: jenko works it, ugur (the requester) decides
update fx set t2 = public.task_create((select review from fx), 'Check the paint list', null, 'high', null, null, null, null, (select jenko from fx));
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select jenko from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select case when (public.task_perform_action((select t2 from fx), 'send')).current_assignee_user_id = (select ugur from fx)
       then 'ok' else 'FAIL' end || ' review step goes to the requester';
do $$ begin
  perform public.task_perform_action((select t2 from fx), 'approve');
  raise notice 'FAIL jenko approved his own work';
exception when others then raise notice 'ok jenko cannot approve';
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', (select ugur from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
do $$ begin
  perform public.task_perform_action((select t2 from fx), 'reject');
  raise notice 'FAIL reject without a comment';
exception when others then raise notice 'ok reject needs a comment';
end $$;
select case when (public.task_perform_action((select t2 from fx), 'reject', 'Missing thinner')).current_step_key = 'work'
       then 'ok' else 'FAIL' end || ' reject goes back to work';
reset role;

-- jan (no role): sees no task, cannot anchor a task to a record he cannot view
select set_config('request.jwt.claims', json_build_object('sub', (select jan from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
select case when not exists (select 1 from public.tasks) then 'ok' else 'FAIL' end || ' jan sees no task';
do $$ begin
  perform public.task_create((select general from fx), 'Sneaky', null, 'normal', null, 'specifications', (select spec from fx));
  raise notice 'FAIL jan created a task';
exception when others then raise notice 'ok jan cannot create a task on the specification';
end $$;
select case when public.task_anchor_label('specifications', (select spec from fx)) is null then 'ok' else 'FAIL' end || ' no anchor label for jan';
reset role;

rollback;
