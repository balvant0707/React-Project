-- Copied from ~/maintenance_tool/supabase/tests/training_requirements_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Training requirements smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/training_requirements_smoke.sql
-- (freshly reset DB with seeds 10 and 11). Requirements per team and role, missing / exempt, access filter, reminders.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.rows(p_sql text) returns text language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v::text || ' row(s)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;
create or replace function pg_temp.status(p_name text, p_type text) returns text language sql as $$
  select s.status from public.training_status_all() s join public.users u on u.id = s.user_id join public.training_types t on t.id = s.training_type_id
  where u.name = p_name and t.name = p_type $$;
grant execute on all functions in schema pg_temp to public;
begin;

select '1 required by team, no record = missing (Sara first aid)', pg_temp.status('Sara Novak', 'First aid');
select '2 required by role for a person without login (Mira hazardous = missing)', pg_temp.status('Mira Lang', 'Hazardous substances instruction');
select '3 exemption wins (Paul machine induction = exempt)', pg_temp.status('Paul Meier', 'Machine safety induction');
select '4 a recorded training that is not required keeps its status (Ben forklift due_soon, required false)', pg_temp.status('Ben Keller', 'Forklift licence'), (select required from public.training_status_all() s join public.users u on u.id = s.user_id join public.training_types t on t.id = s.training_type_id where u.name = 'Ben Keller' and t.name = 'Forklift licence');
select '5 a team member without a record is missing, a recorded one valid (Anna fire safety)', pg_temp.status('Anna Weber', 'Fire safety instruction');

select pg_temp.as_user('ben.keller@example.com');
select '6 ben sees only his own status rows (1 person)', count(distinct user_id) from public.training_status;
select '7 clients cannot call the unfiltered function (blocked)', pg_temp.rows($q$select * from public.training_status_all()$q$);
select '8 ben cannot add an exemption (blocked)', pg_temp.rows($q$insert into public.training_exemptions (user_id, training_type_id, reason) select u.id, t.id, 'x' from public.users u, public.training_types t where u.email = 'ben.keller@example.com' and t.name = 'First aid'$q$);
select '9 ben cannot change requirements (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, role_id) select t.id, r.id from public.training_types t, public.roles r where t.name = 'First aid' and r.name = 'Shopfloor'$q$);
reset role;

select pg_temp.as_user('tom.berger@example.com');
select '10 tom sees the status of his teams (anna visible, ben not)',
  exists (select 1 from public.training_status s join public.users u on u.id = s.user_id where u.email = 'anna.weber@example.com') as anna,
  exists (select 1 from public.training_status s join public.users u on u.id = s.user_id where u.email = 'ben.keller@example.com') as ben;
select '11 tom exempts anna from first aid (1 row)', pg_temp.rows($q$insert into public.training_exemptions (user_id, training_type_id, reason) select u.id, t.id, 'smoke' from public.users u, public.training_types t where u.email = 'anna.weber@example.com' and t.name = 'First aid'$q$);
select '12 tom cannot exempt ben, outside his teams (blocked)', pg_temp.rows($q$insert into public.training_exemptions (user_id, training_type_id, reason) select u.id, t.id, 'smoke' from public.users u, public.training_types t where u.email = 'ben.keller@example.com' and t.name = 'First aid'$q$);
select '13 an exemption needs a reason (blocked)', pg_temp.rows($q$insert into public.training_exemptions (user_id, training_type_id, reason) select u.id, t.id, '  ' from public.users u, public.training_types t where u.email = 'sara.novak@example.com' and t.name = 'Electrical safety'$q$);
select '14 tom cannot change requirements (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, role_id) select t.id, r.id from public.training_types t, public.roles r where t.name = 'First aid' and r.name = 'Shopfloor'$q$);
select '15 tom removes the exemption again (1 row)', pg_temp.rows($q$delete from public.training_exemptions where reason = 'smoke'$q$);
reset role;

select pg_temp.as_user('hanna.richter@example.com');
select '16 HR adds a requirement for a role (1 row)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, role_id) select t.id, r.id from public.training_types t, public.roles r where t.name = 'First aid' and r.name = 'Shopfloor'$q$);
select '17 the same requirement twice is refused (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, role_id) select t.id, r.id from public.training_types t, public.roles r where t.name = 'First aid' and r.name = 'Shopfloor'$q$);
select '18 a requirement needs exactly one target (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id) select id from public.training_types where name = 'First aid'$q$);
select '19 the new role requirement makes Ben need first aid (missing)', (select s.status from public.training_status s join public.users u on u.id = s.user_id join public.training_types t on t.id = s.training_type_id where u.email = 'ben.keller@example.com' and t.name = 'First aid');
select '20 HR sees everybody (>= 9 people)', count(distinct user_id) >= 9 from public.training_status;
reset role;

-- requirement for one person
select pg_temp.as_user('tom.berger@example.com');
select '31 tom requires machine safety for Sara alone (1 row)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, user_id) select t.id, u.id from public.training_types t, public.users u where t.name = 'Machine safety induction' and u.email = 'sara.novak@example.com'$q$);
select '32 tom cannot require it for Lena, outside his teams (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, user_id) select t.id, u.id from public.training_types t, public.users u where t.name = 'Machine safety induction' and u.email = 'lena.fischer@example.com'$q$);
select '33 the same person requirement twice is refused (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, user_id) select t.id, u.id from public.training_types t, public.users u where t.name = 'Machine safety induction' and u.email = 'sara.novak@example.com'$q$);
select '34 a requirement with team and person is refused (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, user_id, role_id) select t.id, u.id, r.id from public.training_types t, public.users u, public.roles r where t.name = 'First aid' and u.email = 'sara.novak@example.com' and r.name = 'Shopfloor'$q$);
reset role;
select pg_temp.as_user('ben.keller@example.com');
select '35 ben cannot require anything for himself (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, user_id) select t.id, u.id from public.training_types t, public.users u where t.name = 'First aid' and u.email = 'ben.keller@example.com'$q$);
reset role;
select '36 the person requirement makes Sara need it (required, status missing or recorded)', (select s.required from public.training_status_all() s join public.users u on u.id = s.user_id join public.training_types t on t.id = s.training_type_id where u.email = 'sara.novak@example.com' and t.name = 'Machine safety induction');
select pg_temp.as_user('tom.berger@example.com');
select '37 tom takes the requirement back (1 row)', pg_temp.rows($q$delete from public.training_requirements where user_id is not null$q$);
reset role;
select set_config('request.jwt.claims', '', true);

-- someone who left drops out of the requirements
insert into public.person_private (user_id, exit_date) select id, current_date - 1 from public.users where name = 'Elif Demir'
  on conflict (user_id) do update set exit_date = excluded.exit_date;
select '21a has_left follows the exit date (true)', has_left from public.users where name = 'Elif Demir';
select '21 a person who left is no longer required (null)', pg_temp.status('Elif Demir', 'Fire safety instruction');
delete from public.person_private where user_id = (select id from public.users where name = 'Elif Demir');
select '21b has_left resets when the exit date is removed (false)', has_left from public.users where name = 'Elif Demir';
-- an inactive training drops out too
update public.training_types set active = false where name = 'First aid';
select '22 an inactive training is not required (null for Sara)', pg_temp.status('Sara Novak', 'First aid');
update public.training_types set active = true where name = 'First aid';

-- reminders
select set_config('request.jwt.claims', '', true);
select '23 first run sends (> 0)', public.send_training_reminders() > 0;
select '24 second run the same day sends nothing (0)', public.send_training_reminders();
select '25 a person with a login got their own notification (Sara: expired fire safety)', exists (select 1 from public.notifications n join public.users u on u.id = n.user_id where u.name = 'Sara Novak' and n.type = 'training_expired');
select '26 a person without a login got none (0)', count(*) from public.notifications n join public.users u on u.id = n.user_id where u.has_login = false and n.type like 'training_%';
select '27 HR got one digest line, Tom one (1, 1)', (select count(*) from public.notifications n join public.users u on u.id = n.user_id where u.name = 'Hanna Richter' and n.type = 'training_digest'), (select count(*) from public.notifications n join public.users u on u.id = n.user_id where u.name = 'Tom Berger' and n.type = 'training_digest');
select '28 Ben (workshop floor, no lead role) got no digest (0)', count(*) from public.notifications n join public.users u on u.id = n.user_id where u.name = 'Ben Keller' and n.type = 'training_digest';
select '29 a week later expired and missing repeat, due soon does not (> 0, no due_soon)', public.send_training_reminders(current_date + 8) > 0,
  (select count(*) from public.training_reminder_log where stage = 'due_soon' and sent_on = current_date + 8) as due_soon_repeats;
update public.notification_preferences set remind_trainings = true where false;
insert into public.notification_preferences (user_id, remind_trainings) select id, false from public.users where name = 'Paul Meier' on conflict (user_id) do update set remind_trainings = false;
delete from public.notifications where type like 'training_%';
delete from public.training_reminder_log;
select public.send_training_reminders();
select '30 a person who switched it off gets no personal notification (0)', count(*) from public.notifications n join public.users u on u.id = n.user_id where u.name = 'Paul Meier' and n.type in ('training_due_soon', 'training_expired', 'training_missing');
rollback;
