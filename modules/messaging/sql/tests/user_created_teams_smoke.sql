-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/user_created_teams_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Teams created by users (migration 20261208120000_user_created_teams.sql): whoever holds teams.create creates a team
-- and becomes its owner and first member; the owner maintains the members of that team (not of any other), renames it,
-- posts in it; the switches that widen a team's reach (team uses) are not theirs; a shared user-created team gives
-- no access to personal data (trainings follow the supervisor chain); the
-- changes land in role_assignment_log. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/user_created_teams_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.blocked(p_sql text) returns boolean language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v = 0;
exception when others then return true;
end $$;
create function pg_temp.team() returns uuid language sql as $$ select id from public.teams where name = 'Smoke Lackierer' $$;
grant execute on all functions in schema pg_temp to public;

-- 1. Ben (Shopfloor) creates a team.
select pg_temp.as_user('ben.keller@example.com');
do $$
declare v uuid;
begin
  v := public.team_create('  Smoke Lackierer ', 'Frühschicht');
  assert v = pg_temp.team(), '1 team created, name trimmed';
  assert (select user_created and created_by_user_id = pg_temp.uid('ben.keller@example.com') from public.teams where id = v), '2 marked, creator kept';
  assert (select array_agg(use order by use) = '{filters,tasks}' from public.team_uses where team_id = v), '3 reach switches: tasks and filters on, the rest off';
  assert exists (select 1 from public.team_owners where team_id = v and user_id = pg_temp.uid('ben.keller@example.com')), '4 the creator owns it';
  assert exists (select 1 from public.user_teams where team_id = v and user_id = pg_temp.uid('ben.keller@example.com')), '5 and is its first member';
  assert pg_temp.blocked($q$select public.team_create('smoke LACKIERER')$q$), '6 the name is unique, case ignored';
  assert pg_temp.blocked($q$select public.team_create(' x ')$q$), '7 too short';
  assert pg_temp.blocked($q$insert into public.teams (name) values ('Direkt')$q$), '8 no direct insert';
end $$;
reset role;

-- 2. The owner maintains the members of this team and of no other.
select pg_temp.as_user('ben.keller@example.com');
do $$
begin
  insert into public.user_teams (user_id, team_id) values (pg_temp.uid('anna.weber@example.com'), pg_temp.team());
  assert exists (select 1 from public.user_teams where team_id = pg_temp.team() and user_id = pg_temp.uid('anna.weber@example.com')), '9 owner adds a member';
  assert pg_temp.blocked(format($q$insert into public.user_teams (user_id, team_id) values (%L, (select id from public.teams where not user_created limit 1))$q$, pg_temp.uid('ben.keller@example.com'))), '10 not into a team of the admin';
  assert pg_temp.blocked(format($q$insert into public.team_owners (team_id, user_id) values (%L, %L)$q$, pg_temp.team(), pg_temp.uid('anna.weber@example.com'))), '11 owners are not made by owners';
  assert pg_temp.blocked(format($q$insert into public.team_uses (team_id, use) values (%L, 'leave')$q$, pg_temp.team())), '12 the reach switches are not the owner''s';
  assert pg_temp.blocked(format($q$update public.teams set name = 'Anders' where id = %L$q$, pg_temp.team())), '13 no direct update either';
  perform public.team_rename(pg_temp.team(), 'Smoke Lackierer Früh');
  assert exists (select 1 from public.teams where name = 'Smoke Lackierer Früh'), '14 rename through the function';
  perform public.team_rename((select id from public.teams where name = 'Smoke Lackierer Früh'), 'Smoke Lackierer');
  assert pg_temp.blocked(format($q$select public.team_rename((select id from public.teams where not exists (select 1 from public.team_owners o where o.team_id = teams.id and o.user_id = %L) limit 1), 'Gekapert')$q$, pg_temp.uid('ben.keller@example.com'))), '15 no rename of teams one does not own';
end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$
begin
  assert pg_temp.blocked(format($q$insert into public.user_teams (user_id, team_id) values (%L, %L)$q$, pg_temp.uid('paul.meier@example.com'), pg_temp.team())), '16 a plain member does not add anybody';
  assert pg_temp.blocked(format($q$delete from public.user_teams where team_id = %L and user_id = %L$q$, pg_temp.team(), pg_temp.uid('ben.keller@example.com'))), '17 nor remove anybody';
end $$;
reset role;

-- 3. Posts in the team: members read, outsiders do not.
select pg_temp.as_user('ben.keller@example.com');
do $$ begin perform public.team_post_create(pg_temp.team(), 'Schichtplan', '<p>Neue Zeiten</p>'); end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin assert exists (select 1 from public.team_posts_overview where team_id = pg_temp.team()), '18 a member reads the post'; end $$;
reset role;
select pg_temp.as_user('paul.meier@example.com');
do $$ begin assert not exists (select 1 from public.team_posts_overview where team_id = pg_temp.team()), '19 an outsider does not'; end $$;
reset role;

-- 4. A team gives no access to personal data: Tom creates one and adds Paul (no supervisor, has training records).
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v uuid;
begin
  v := public.team_create('Smoke Querschnitt');
  insert into public.user_teams (user_id, team_id) values (pg_temp.uid('paul.meier@example.com'), v);
  assert exists (select 1 from public.user_teams where team_id = v and user_id = pg_temp.uid('paul.meier@example.com')), '20 Paul is in the team';
  assert not exists (select 1 from public.training_records where user_id = pg_temp.uid('paul.meier@example.com')), '21 but Tom sees none of his trainings';
end $$;
reset role;

-- 5. The literal decides; there is no limit on the number.
delete from public.role_permissions where permission = 'teams.create' and role_id in (select r.id from public.roles r where r.name = 'Shopfloor');
select pg_temp.as_user('ben.keller@example.com');
do $$ begin assert pg_temp.blocked($q$select public.team_create('Ohne Recht')$q$), '22 without the literal no team'; end $$;
reset role;
insert into public.role_permissions (role_id, permission) select r.id, 'teams.create' from public.roles r where r.name = 'Shopfloor' on conflict do nothing;
select pg_temp.as_user('ben.keller@example.com');
do $$
declare i integer;
begin
  for i in 1..25 loop
    perform public.team_create('Smoke Mehr ' || i);
  end loop;
  assert (select count(*) from public.teams where created_by_user_id = pg_temp.uid('ben.keller@example.com')) >= 26, '23 no limit on the number of teams';
end $$;
reset role;

-- 5b. Handing the ownership over: only to another member who can sign in; the old owner stays a member and loses the rights.
select pg_temp.as_user('ben.keller@example.com');
do $$
begin
  assert pg_temp.blocked(format($q$select public.team_owner_transfer(%L, %L)$q$, pg_temp.team(), pg_temp.uid('paul.meier@example.com'))), '26 not to somebody outside the team';
  assert pg_temp.blocked(format($q$select public.team_owner_transfer(%L, %L)$q$, pg_temp.team(), pg_temp.uid('ben.keller@example.com'))), '27 not to oneself';
  assert pg_temp.blocked(format($q$select public.team_owner_transfer((select id from public.teams where not exists (select 1 from public.team_owners o where o.team_id = teams.id and o.user_id = %L) limit 1), %L)$q$, pg_temp.uid('ben.keller@example.com'), pg_temp.uid('anna.weber@example.com'))), '28 not for a team one does not own';
  perform public.team_owner_transfer(pg_temp.team(), pg_temp.uid('anna.weber@example.com'));
  assert not exists (select 1 from public.team_owners where team_id = pg_temp.team() and user_id = pg_temp.uid('ben.keller@example.com')), '29 Ben is no owner any more';
  assert exists (select 1 from public.user_teams where team_id = pg_temp.team() and user_id = pg_temp.uid('ben.keller@example.com')), '30 but still a member';
  assert pg_temp.blocked(format($q$insert into public.user_teams (user_id, team_id) values (%L, %L)$q$, pg_temp.uid('paul.meier@example.com'), pg_temp.team())), '31 and no longer adds members';
end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$
begin
  insert into public.user_teams (user_id, team_id) values (pg_temp.uid('paul.meier@example.com'), pg_temp.team());
  assert exists (select 1 from public.team_owners where team_id = pg_temp.team() and user_id = pg_temp.uid('anna.weber@example.com')), '32 Anna owns the team and adds members';
end $$;
reset role;

-- 5c. Managers and HR read the posts of the teams they belong to, not of every team (Tom made a team Ben cannot see).
select pg_temp.as_user('hanna.richter@example.com');
do $$
begin
  assert not exists (select 1 from public.team_posts_overview where team_id = pg_temp.team()), '33 HR does not read the posts of a team she is no member of';
  assert not public.team_message_can(pg_temp.team(), 'moderate'), '34 nor moderates it';
end $$;
reset role;

-- 6. It is logged where HR reads it.
do $$
begin
  assert exists (select 1 from public.role_assignment_log where kind = 'team' and by_user_id = pg_temp.uid('ben.keller@example.com')), '24 team membership logged';
  assert exists (select 1 from public.role_assignment_log where kind = 'team_owner' and by_user_id = pg_temp.uid('ben.keller@example.com')), '25 ownership logged';
end $$;

select 'user_created_teams_smoke ok' as result;
rollback;
