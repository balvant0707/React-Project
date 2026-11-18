-- Copied from ~/maintenance_tool/supabase/tests/people_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- People smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/people_smoke.sql
-- (freshly reset DB, with seed 10). Login-less people, HR (people.edit), private birthday, language-only self-update.
-- Expected: every line says what should happen in its label ("blocked" = refused, "N row(s)" = allowed).
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
grant execute on all functions in schema pg_temp to public;
begin;

select '1 login-less people exist, the seeded logins have has_login', (select count(*) from public.users where not has_login) as without_login,
  (select count(*) from public.users where has_login) as with_login;
select '2 the HR role holds people.edit', exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'HR' and rp.permission = 'people.edit');
select '3 birthday day/month are public, seeded from person_private', birthday_month, birthday_day from public.users where email = 'anna.weber@example.com';

-- a normal user: language yes, everything else no, no private data
select pg_temp.as_user('anna.weber@example.com');
select '4 own language is allowed (1 row)', pg_temp.rows($q$update public.users set language = 'en' where email = 'anna.weber@example.com'$q$);
select '5 own photo is refused (blocked)', pg_temp.rows($q$update public.users set photo_url = 'x' where email = 'anna.weber@example.com'$q$);
select '6 own phone is refused (blocked)', pg_temp.rows($q$update public.users set phone_mobile = '1' where email = 'anna.weber@example.com'$q$);
select '7 own supervisor is refused (blocked)', pg_temp.rows($q$update public.users set supervisor_user_id = null where email = 'anna.weber@example.com'$q$);
select '8 someone else is invisible to the update (0 rows)', pg_temp.rows($q$update public.users set language = 'en' where email = 'ben.keller@example.com'$q$);
select '9 birth dates are invisible (0 rows)', pg_temp.rows($q$select * from public.person_private$q$), (select count(*) from public.person_private) as visible;
select '10 cannot add a person (blocked)', pg_temp.rows($q$insert into public.users (name) values ('Smoke Person')$q$);
select '11 cannot upload an avatar (blocked)', pg_temp.rows($q$insert into storage.objects (bucket_id, name, owner) values ('avatars', (select id::text from public.users where email = 'anna.weber@example.com') || '/avatar', auth.uid())$q$);
reset role;

-- HR
select pg_temp.as_user('hanna.richter@example.com');
select '12 HR adds a person (1 row)', pg_temp.rows($q$insert into public.users (id, name, position) values ('00000000-0000-4000-8000-0000000000e1', 'Smoke Person', 'Tester')$q$);
select '13 a person added by HR has no login', has_login from public.users where id = '00000000-0000-4000-8000-0000000000e1';
select '14 HR cannot add a person with login (blocked)', pg_temp.rows($q$insert into public.users (name, has_login) values ('Smoke Login', true)$q$);
select '15 HR edits phone, site and hire date of anyone (1 row)', pg_temp.rows($q$update public.users set phone_mobile = '+49 1', site = 'X', hire_date = '2020-01-01' where email = 'ben.keller@example.com'$q$);
select '16 HR sets a photo path (1 row)', pg_temp.rows($q$update public.users set photo_url = 'x' where email = 'ben.keller@example.com'$q$);
select '17 HR cannot flip has_login (blocked)', pg_temp.rows($q$update public.users set has_login = true where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select '18 HR cannot change the e-mail of an account (blocked)', pg_temp.rows($q$update public.users set email = 'x@example.com' where email = 'ben.keller@example.com'$q$);
select '19 HR sets the e-mail of a person without login (1 row)', pg_temp.rows($q$update public.users set email = 'smoke.person@example.com' where id = '00000000-0000-4000-8000-0000000000e1'$q$);
select '20 HR saves a birthday (1 row)', pg_temp.rows($q$insert into public.person_private (user_id, birth_date) values ('00000000-0000-4000-8000-0000000000e1', '1992-02-29')$q$);
select '21 the birthday shows day and month on the person (2, 29)', birthday_month, birthday_day from public.users where id = '00000000-0000-4000-8000-0000000000e1';
select '22 HR sees the birth year', extract(year from birth_date) from public.person_private where user_id = '00000000-0000-4000-8000-0000000000e1';
select '23 HR uploads an avatar (1 row)', pg_temp.rows($q$insert into storage.objects (bucket_id, name, owner) values ('avatars', '00000000-0000-4000-8000-0000000000e1/avatar', auth.uid())$q$);
select '24 HR cannot delete a person with login (0 rows)', pg_temp.rows($q$delete from public.users where email = 'ben.keller@example.com'$q$);
select '25 HR cannot assign roles (blocked or 0 rows)', pg_temp.rows($q$insert into public.user_roles (user_id, role_id) select (select id from public.users where email = 'ben.keller@example.com'), id from public.roles where name = 'Admin'$q$);
select '26 HR clears the birthday (1 row)', pg_temp.rows($q$delete from public.person_private where user_id = '00000000-0000-4000-8000-0000000000e1'$q$);
select '26b day and month are cleared too (null)', birthday_month from public.users where id = '00000000-0000-4000-8000-0000000000e1';
select '27 HR deletes a person without login (1 row)', pg_temp.rows($q$delete from public.users where id = '00000000-0000-4000-8000-0000000000e1'$q$);
reset role;

-- the account triggers: GoTrue runs without a user in the JWT claims
reset role;
select set_config('request.jwt.claims', '', true);
select '28 deleting an account (1 row)', pg_temp.rows($q$delete from auth.users where id = (select id from public.users where email = 'ben.keller@example.com')$q$);
select '28b the person is kept, has_login false', has_login, (select count(*) from public.users where email = 'ben.keller@example.com') as person_kept from public.users where email = 'ben.keller@example.com';
select '29 a new account claims the person with the same id (1 row)', pg_temp.rows($q$insert into auth.users (instance_id, id, aud, role, email) select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email from public.users where email = 'ben.keller@example.com'$q$);
select '29b still one person, has_login true', has_login, (select count(*) from public.users where email = 'ben.keller@example.com') as persons from public.users where email = 'ben.keller@example.com';
select '30 mentionable_users lists only people with a login',
  not exists (select 1 from public.users u where not u.has_login and u.id in (select id from public.mentionable_users('assets', (select id from public.assets limit 1), '')));

-- approvals skip supervisors who cannot sign in
update public.users set supervisor_user_id = (select id from public.users where name = 'Karl Brandt') where email = 'anna.weber@example.com';
update public.users set supervisor_user_id = (select id from public.users where email = 'tom.berger@example.com') where name = 'Karl Brandt';
select '31 a supervisor without login is passed over: the approval goes to Tom (true)',
  (select assignee_user_id from public.resolve_step_assignee(
     (select id from public.task_type_steps where assignee_kind = 'requester_supervisor' and assignee_level = 1 limit 1),
     (select id from public.users where email = 'anna.weber@example.com'))) = (select id from public.users where email = 'tom.berger@example.com');
-- exit date is private; has_left is the public fact
reset role;
insert into public.person_private (user_id, exit_date) select id, current_date + 30 from public.users where name = 'Karl Brandt'
  on conflict (user_id) do update set exit_date = excluded.exit_date;
select '32 a future exit date leaves has_left false', has_left from public.users where name = 'Karl Brandt';
update public.person_private set exit_date = current_date - 1 where user_id = (select id from public.users where name = 'Karl Brandt');
select '33 a past exit date sets has_left (true)', has_left from public.users where name = 'Karl Brandt';
select pg_temp.as_user('anna.weber@example.com');
select '34 a normal user cannot read exit dates (0)', count(*) from public.person_private;
select '35 nobody edits has_left directly (blocked)', pg_temp.rows($q$update public.users set has_left = false where name = 'Karl Brandt'$q$);
select pg_temp.as_user('hanna.richter@example.com');
select '36 HR cannot set has_left directly either (blocked)', pg_temp.rows($q$update public.users set has_left = false where name = 'Karl Brandt'$q$);
select '37 HR reads the exit date (1)', count(*) from public.person_private where exit_date is not null and user_id = (select id from public.users where name = 'Karl Brandt');
select '38 exit before hire is refused (blocked)', pg_temp.rows($q$update public.users set hire_date = '2000-01-01' where name = 'Karl Brandt'$q$), pg_temp.rows($q$update public.person_private set exit_date = '1990-01-01' where user_id = (select id from public.users where name = 'Karl Brandt')$q$);
reset role;
select set_config('request.jwt.claims', '', true);
update public.person_private set exit_date = current_date + 5 where user_id = (select id from public.users where name = 'Karl Brandt');
update public.users set has_left = true where name = 'Karl Brandt';
select public.people_refresh_has_left();
select '39 the daily job corrects a stale flag (false)', has_left from public.users where name = 'Karl Brandt';
rollback;
