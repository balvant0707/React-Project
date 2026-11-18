-- Copied from ~/maintenance_tool/supabase/tests/recurring_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Manual checks for recurring tasks: psql -f supabase/tests/recurring_smoke.sql (local stack). Rolls back.
begin;
insert into public.teams (name) values ('Prüfmittelbeauftragte');
insert into public.user_teams select u.id, g.id from public.users u, public.teams g
  where g.name = 'Prüfmittelbeauftragte' and u.email in ('anna.weber@example.com', 'sara.novak@example.com');

-- rotation, weekly, fixed schedule, skip_if_open off so each run creates one
insert into public.recurring_task_rules (name, task_type_id, team_id, assignment_mode, schedule_kind, interval_count, start_date, skip_if_open)
values ('Rotation test', (select id from public.task_types where key = 'general'), (select id from public.teams where name = 'Prüfmittelbeauftragte'), 'rotate', 'weekly', 1, current_date - 14, false);
select 'run 1 created', public.generate_recurring_tasks(current_date);
select 'run 2 created', public.generate_recurring_tasks(current_date + 7);
select 'run 3 created', public.generate_recurring_tasks(current_date + 14);
select 'rotation order', array_agg(u.name order by t.task_number) from public.tasks t join public.users u on u.id = t.assigned_user_id where t.title = 'Rotation test';
select 'next due after catch-up (>= today)', next_due_date >= current_date from public.recurring_task_rules where name = 'Rotation test';

-- operating hours: first task after one full interval
update public.assets set operating_hours = 100 where name = 'Perlmühle 1';
insert into public.recurring_task_rules (name, task_type_id, asset_id, schedule_kind, operating_hours_interval)
values ('Hours test', (select id from public.task_types where key = 'general'), (select id from public.assets where name = 'Perlmühle 1'), 'operating_hours', 500);
select 'hours: nothing yet', public.generate_recurring_tasks(current_date);
update public.assets set operating_hours = 650 where name = 'Perlmühle 1';
select 'hours: due', count(*) from public.tasks where title = 'Hours test';
select 'hours generated', public.generate_recurring_tasks(current_date);
select 'hours last generated', last_generated_hours from public.recurring_task_rules where name = 'Hours test';

-- after completion (Planner logic): next task is created when the current one is done
insert into public.recurring_task_rules (name, task_type_id, schedule_kind, interval_count, start_date, repeat_mode)
values ('After completion test', (select id from public.task_types where key = 'general'), 'yearly', 1, current_date, 'after_completion');
select 'ac: created', public.generate_recurring_tasks(current_date);
select 'ac: waiting (next_due null)', next_due_date is null from public.recurring_task_rules where name = 'After completion test';
select 'ac: second run creates nothing', public.generate_recurring_tasks(current_date);
update public.tasks set status = 'done' where title = 'After completion test';
select 'ac: next task created on completion (expect 2 total, 1 open, due ~1 year)', count(*), count(*) filter (where status not in ('done','cancelled')), max(due_date) from public.tasks where title = 'After completion test';
update public.tasks set status = 'cancelled' where title = 'After completion test' and status not in ('done','cancelled');
select 'ac: cancel does not create; rule re-armed', count(*), (select next_due_date from public.recurring_task_rules where name = 'After completion test') from public.tasks where title = 'After completion test';
rollback;
