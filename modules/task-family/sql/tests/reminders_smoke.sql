-- Copied from ~/maintenance_tool/supabase/tests/reminders_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Reminder smoke test: psql -f supabase/tests/reminders_smoke.sql (local stack, freshly reset). One line per check.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;
begin;
-- a clean slate: only our own tasks are open
update public.tasks set status = 'cancelled' where status not in ('done', 'cancelled');
insert into public.tasks (task_type_id, title, due_date, planned_date, assigned_user_id) values
  ((select id from public.task_types where key = 'general'), 'R planned today', null, current_date, (select id from public.users where email = 'anna.weber@example.com')),
  ((select id from public.task_types where key = 'general'), 'R due tomorrow', current_date + 1, null, (select id from public.users where email = 'anna.weber@example.com')),
  ((select id from public.task_types where key = 'general'), 'R due in 5 days', current_date + 5, null, (select id from public.users where email = 'anna.weber@example.com')),
  ((select id from public.task_types where key = 'general'), 'R overdue', current_date - 4, null, (select id from public.users where email = 'anna.weber@example.com'));
insert into public.tasks (task_type_id, title, due_date, team_id) values
  ((select id from public.task_types where key = 'general'), 'R team overdue', current_date - 1, (select id from public.teams where name = 'Werkstatt'));
delete from public.notifications;

select '1 first run sends reminders', public.send_task_reminders() as sent;
select '2 anna: today + soon + overdue + team overdue = 4 (5-day task not yet)', count(*) from public.notifications n join public.users u on u.id = n.user_id where u.email = 'anna.weber@example.com' and n.type like 'task_reminder_%';
select '3 team task goes to every member of the team', count(distinct n.user_id) = (select count(*) from public.user_teams where team_id = (select id from public.teams where name = 'Werkstatt')) from public.notifications n where n.title like '%R team overdue';
select '4 second run the same day sends nothing', public.send_task_reminders();
select '5 two days later the 5-day task is due soon', public.send_task_reminders(current_date + 3) >= 1;
select '6 overdue logged on day 0 and again on day 3 (=2)', (select count(*) from public.reminder_log l join public.tasks t on t.id = l.task_id where t.title = 'R overdue' and l.kind = 'overdue');

-- preferences
delete from public.notifications;
select pg_temp.as_user('anna.weber@example.com');
insert into public.notification_preferences (user_id, remind_overdue, remind_due_soon, remind_planned_today)
  values ((select id from public.users where email = 'anna.weber@example.com'), false, false, false);
select '7 anna reads only her own preferences', count(*) from public.notification_preferences;
reset role;
delete from public.reminder_log;
select '8 job runs', public.send_task_reminders() >= 1;
select '9 anna with everything off gets nothing', count(*) from public.notifications n join public.users u on u.id = n.user_id where u.email = 'anna.weber@example.com';
select pg_temp.as_user('anna.weber@example.com');
select '10 client cannot run the job (blocked)';
do $$ begin
  perform public.send_task_reminders();
  raise exception 'FAIL: expected an error';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
reset role;
rollback;

-- retention
begin;
delete from public.notifications;
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 't_read_old', 'a', null, null, null, null, null, 'k1');
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 't_read_new', 'b', null, null, null, null, null, 'k2');
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 't_unread_old', 'c', null, null, null, null, null, 'k3');
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 't_unread_ancient', 'd', null, null, null, null, null, 'k4');
update public.notifications set read_at = now() - interval '40 days' where type = 't_read_old';
update public.notifications set read_at = now() - interval '5 days' where type = 't_read_new';
update public.notifications set created_at = now() - interval '60 days' where type = 't_unread_old';
update public.notifications set created_at = now() - interval '200 days' where type = 't_unread_ancient';
select '11 retention deletes read > 30 days and anything > 180 days', public.cleanup_notifications();
select '12 what is left', string_agg(type, ',' order by type) from public.notifications;
rollback;
