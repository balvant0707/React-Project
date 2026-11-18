-- Copied from ~/maintenance_tool/supabase/tests/job_descriptions_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Job descriptions smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/job_descriptions_smoke.sql
-- (freshly reset DB with seeds 10 and 11). Positions, holders via team, assignment log, version lifecycle, access, training link.
-- Everything runs in one transaction that is rolled back.
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
create or replace function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
grant execute on all functions in schema pg_temp to public;
begin;

-- Tom's first team (Manager); Ben (Shopfloor) is not in it.
create temp table t_team as select ug.team_id from public.user_teams ug where ug.user_id = pg_temp.uid('tom.berger@example.com') limit 1;
grant select on t_team to public;
select '0 setup: Ben shares no team with Tom (true)', not exists (
  select 1 from public.user_teams a join public.user_teams b on b.team_id = a.team_id
  where a.user_id = pg_temp.uid('tom.berger@example.com') and b.user_id = pg_temp.uid('ben.keller@example.com'));

select pg_temp.as_user('tom.berger@example.com');
select '1 a manager cannot create a position (blocked)', pg_temp.rows($q$insert into public.positions (name) values ('Smoke position')$q$);
reset role;

select pg_temp.as_user('hanna.richter@example.com');
select '2 HR creates a position (1 row)', pg_temp.rows($q$insert into public.positions (name, code) values ('Smoke position', 'SMK')$q$);
select '3 the same name twice is refused (blocked)', pg_temp.rows($q$insert into public.positions (name) values ('Smoke position')$q$);
select '4 HR assigns Tom''s team (1 row)', pg_temp.rows($q$insert into public.position_teams select p.id, t.team_id from public.positions p, t_team t where p.name = 'Smoke position'$q$);
select '5 HR assigns Ben directly (1 row)', pg_temp.rows($q$insert into public.position_holders select p.id, pg_temp.uid('ben.keller@example.com') from public.positions p where p.name = 'Smoke position'$q$);
reset role;

select '6 effective holders = team members + Ben',
  (select count(*) from public.position_holders_effective h join public.positions p on p.id = h.position_id where p.name = 'Smoke position' and h.source = 'team')
  = (select count(*) from public.user_teams ug, t_team t where ug.team_id = t.team_id
       and not (select has_left from public.users where id = ug.user_id)) as team_rows_match,
  exists (select 1 from public.position_holders_effective h join public.positions p on p.id = h.position_id
          where p.name = 'Smoke position' and h.user_id = pg_temp.uid('ben.keller@example.com') and h.source = 'direct') as ben_direct;
select '7 the log has one team entry per member and one direct entry',
  (select count(*) from public.position_assignment_log l join public.positions p on p.id = l.position_id where p.name = 'Smoke position' and l.source = 'team' and l.action = 'added')
  = (select count(*) from public.user_teams ug, t_team t where ug.team_id = t.team_id) as team_logged,
  (select count(*) from public.position_assignment_log l join public.positions p on p.id = l.position_id where p.name = 'Smoke position' and l.source = 'direct') as direct_logged;

-- a new team member gets the position at once; leaving takes it away
insert into public.user_teams select pg_temp.uid('paul.meier@example.com'), team_id from t_team on conflict do nothing;
select '8 a new team member holds the position (true)', exists (select 1 from public.position_holders_effective h join public.positions p on p.id = h.position_id
  where p.name = 'Smoke position' and h.user_id = pg_temp.uid('paul.meier@example.com'));
select '9 and the log shows it (added, team)', (select action || ' ' || source from public.position_assignment_log l
  where l.user_id = pg_temp.uid('paul.meier@example.com') order by happened_at desc, id desc limit 1);
delete from public.user_teams where user_id = pg_temp.uid('paul.meier@example.com') and team_id = (select team_id from t_team);
select '10 leaving the team ends it (false)', exists (select 1 from public.position_holders_effective h join public.positions p on p.id = h.position_id
  where p.name = 'Smoke position' and h.user_id = pg_temp.uid('paul.meier@example.com'));
select '11 replay of the log for today = effective holders count',
  (select count(*) from public.position_holders_at((select id from public.positions where name = 'Smoke position'), current_date))
  = (select count(distinct (user_id, source)) from public.position_holders_effective h where h.position_id = (select id from public.positions where name = 'Smoke position'));
select '12 replay for yesterday is empty (0)', (select count(*) from public.position_holders_at((select id from public.positions where name = 'Smoke position'), current_date - 1));

-- the log is append-only for clients
select pg_temp.as_user('hanna.richter@example.com');
select '13 nobody writes the log (blocked)', pg_temp.rows($q$delete from public.position_assignment_log$q$);
select '14 HR reads the whole log (> 0)', count(*) > 0 from public.position_assignment_log;
reset role;
select pg_temp.as_user('ben.keller@example.com');
select '15 Ben reads only entries about himself (all true)', coalesce(bool_and(user_id = pg_temp.uid('ben.keller@example.com')), true) from public.position_assignment_log;
reset role;

-- versions
select pg_temp.as_user('tom.berger@example.com');
select '16 a client cannot insert a version directly (blocked)', pg_temp.rows($q$insert into public.job_description_versions (position_id, version_no) select id, 1 from public.positions where name = 'Smoke position'$q$);
create temp table t_ver (id uuid);
grant all on t_ver to public;
insert into t_ver select public.job_description_new_draft((select id from public.positions where name = 'Smoke position'));
select '17 Tom writes a draft for a position of his team (version 1)', (select version_no from public.job_description_versions where id = (select id from t_ver));
select '18 a second open draft is refused (blocked)', pg_temp.rows($q$select public.job_description_new_draft((select id from public.positions where name = 'Smoke position'))$q$);
select '19 submitting an empty draft is refused (blocked)', pg_temp.rows($q$select public.job_description_submit((select id from t_ver))$q$);
select '20 Tom edits his draft (1 row)', pg_temp.rows($q$update public.job_description_versions set purpose = '<p>Keeps machines running</p>', duties = '<ul><li>Inspect</li></ul>' where id = (select id from t_ver)$q$);
select '21 Tom cannot set the status by hand (blocked)', pg_temp.rows($q$update public.job_description_versions set status = 'published' where id = (select id from t_ver)$q$);
select '22 Tom submits (ok)', pg_temp.rows($q$select public.job_description_submit((select id from t_ver))$q$);
select '23 a submitted version is read-only for Tom (blocked)', pg_temp.rows($q$update public.job_description_versions set purpose = 'x' where id = (select id from t_ver)$q$);
select '24 Tom cannot publish (blocked)', pg_temp.rows($q$select public.job_description_publish((select id from t_ver))$q$);
select '25 Tom cannot return (blocked)', pg_temp.rows($q$select public.job_description_return((select id from t_ver), 'no')$q$);
reset role;

select '26 HR was notified of the submission (>= 1)', count(*) >= 1 from public.notifications where type = 'job_description_submitted' and user_id = pg_temp.uid('hanna.richter@example.com');

select pg_temp.as_user('ben.keller@example.com');
select '27 Ben holds the position but sees no submitted version (0)', count(*) from public.job_description_versions;
reset role;

select pg_temp.as_user('hanna.richter@example.com');
select '28 HR returns it with a note (ok)', pg_temp.rows($q$select public.job_description_return((select id from t_ver), 'Please add authority')$q$);
select '29 it is a draft again with the note', status, returned_note from public.job_description_versions where id = (select id from t_ver);
reset role;
select '30 Tom was notified of the return (>= 1)', count(*) >= 1 from public.notifications where type = 'job_description_returned' and user_id = pg_temp.uid('tom.berger@example.com');

select pg_temp.as_user('tom.berger@example.com');
select '31 Tom submits again (ok)', pg_temp.rows($q$select public.job_description_submit((select id from t_ver))$q$);
reset role;
select pg_temp.as_user('hanna.richter@example.com');
select '32 HR publishes (ok)', pg_temp.rows($q$select public.job_description_publish((select id from t_ver))$q$);
select '33 status published, approved by HR', status, approved_by_user_id = pg_temp.uid('hanna.richter@example.com'), valid_from is not null from public.job_description_versions where id = (select id from t_ver);
reset role;

select pg_temp.as_user('ben.keller@example.com');
select '34 Ben now reads the published version (1)', count(*) from public.job_description_versions;
reset role;
select pg_temp.as_user('lena.fischer@example.com');
select '35 an outsider without holding sees nothing (0)', count(*) from public.job_description_versions;
reset role;

-- second version archives the first
select pg_temp.as_user('hanna.richter@example.com');
create temp table t_ver2 (id uuid);
grant all on t_ver2 to public;
insert into t_ver2 select public.job_description_new_draft((select id from public.positions where name = 'Smoke position'));
select '36 the new draft copies the published text (version 2, same purpose)', version_no, purpose = '<p>Keeps machines running</p>' from public.job_description_versions where id = (select id from t_ver2);
select '37 HR publishes a draft directly (ok)', pg_temp.rows($q$select public.job_description_publish((select id from t_ver2))$q$);
select '38 version 1 is archived, version 2 published', (select string_agg(version_no || ':' || status, ', ' order by version_no) from public.job_description_versions);
reset role;

-- training link
select pg_temp.as_user('hanna.richter@example.com');
select '39 HR requires a training for the position (1 row)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, position_id) select t.id, p.id from public.training_types t, public.positions p where t.name = 'Forklift licence' and p.name = 'Smoke position'$q$);
select '40 a requirement with two targets is refused (blocked)', pg_temp.rows($q$insert into public.training_requirements (training_type_id, position_id, role_id) select t.id, p.id, r.id from public.training_types t, public.positions p, public.roles r where t.name = 'First aid' and p.name = 'Smoke position' and r.name = 'Shopfloor'$q$);
reset role;
select '41 a direct holder needs the training (Ben required)', (select required from public.training_status_all() s join public.training_types t on t.id = s.training_type_id
  where s.user_id = pg_temp.uid('ben.keller@example.com') and t.name = 'Forklift licence');
select '42 a team member needs it too (Tom required)', (select required from public.training_status_all() s join public.training_types t on t.id = s.training_type_id
  where s.user_id = pg_temp.uid('tom.berger@example.com') and t.name = 'Forklift licence');
delete from public.position_holders where user_id = pg_temp.uid('ben.keller@example.com');
select '43 once removed Ben still has his own record but is not required by the position (false)', (select required from public.training_status_all() s join public.training_types t on t.id = s.training_type_id
  where s.user_id = pg_temp.uid('ben.keller@example.com') and t.name = 'Forklift licence');

-- deleting a position with history is refused
select '44 a position with history cannot be deleted (blocked)', pg_temp.rows($q$delete from public.positions where name = 'Smoke position'$q$);

-- the role defaults exist and are editable data
select '45 default grants: Manager edit.team, HR edit.all', 
  exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Manager' and rp.permission = 'job_descriptions.edit.team'),
  exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'HR' and rp.permission = 'job_descriptions.edit.all');
-- deleting old versions: HR (people.edit) only, archived only; the admin no longer (admin limits, stage 1)
select pg_temp.as_user('max.wilckens@wilckens.com');
select '50 admin (not HR) cannot delete an archived version (0 rows)', pg_temp.rows($q$delete from public.job_description_versions where status = 'archived'$q$);
reset role;
select pg_temp.as_user('hanna.richter@example.com');
select '51 HR cannot delete a published version (0 rows)', pg_temp.rows($q$delete from public.job_description_versions where status = 'published' and position_id = (select id from public.positions where name = 'Smoke position')$q$);
select '52 HR deletes an archived version (1 row)', pg_temp.rows($q$delete from public.job_description_versions where status = 'archived' and position_id = (select id from public.positions where name = 'Smoke position')$q$);
reset role;

select pg_temp.as_user('max.wilckens@wilckens.com');
select '53 admin (not HR) cannot delete a log entry (0 rows)', pg_temp.rows($q$delete from public.position_assignment_log$q$);
reset role;
select pg_temp.as_user('hanna.richter@example.com');
select '54 HR deletes a wrong log entry (1 row)', pg_temp.rows($q$delete from public.position_assignment_log where id = (select id from public.position_assignment_log order by happened_at desc, id desc limit 1)$q$);
reset role;

-- two teams with shared members, assigned and removed in one statement each: every member is logged once
create temp table t_p2 (id uuid);
grant all on t_p2 to public;
insert into public.teams (name) values ('Smoke team A'), ('Smoke team B');
insert into public.user_teams (user_id, team_id)
select pg_temp.uid(m.email), g.id from (values ('anna.weber@example.com', 'Smoke team A'), ('sara.novak@example.com', 'Smoke team A'), ('sara.novak@example.com', 'Smoke team B')) as m(email, team_name)
join public.teams g on g.name = m.team_name;
insert into public.positions (name) values ('Smoke overlap');
insert into t_p2 select id from public.positions where name = 'Smoke overlap';
insert into public.position_teams select (select id from t_p2), id from public.teams where name in ('Smoke team A', 'Smoke team B');
select '46 overlapping teams in one statement: one added entry per member (Sara once)',
  (select count(*) from public.position_assignment_log where position_id = (select id from t_p2) and user_id = pg_temp.uid('sara.novak@example.com') and action = 'added'),
  (select count(distinct user_id) from public.position_assignment_log where position_id = (select id from t_p2) and action = 'added') as members,
  (select count(distinct ug.user_id) from public.user_teams ug join public.teams g on g.id = ug.team_id where g.name in ('Smoke team A', 'Smoke team B')) as expected;
delete from public.position_teams where position_id = (select id from t_p2) and team_id = (select id from public.teams where name = 'Smoke team B');
select '47 removing one of two routes logs nothing for Sara (0 removed)', count(*) from public.position_assignment_log where position_id = (select id from t_p2) and user_id = pg_temp.uid('sara.novak@example.com') and action = 'removed';
delete from public.position_teams where position_id = (select id from t_p2);
select '48 removing the last route logs it once (1 removed)', count(*) from public.position_assignment_log where position_id = (select id from t_p2) and user_id = pg_temp.uid('sara.novak@example.com') and action = 'removed';
insert into public.position_teams select (select id from t_p2), id from public.teams where name = 'Smoke team B';
select '49 a team that gives a position cannot be deleted (blocked)', pg_temp.rows($q$delete from public.teams where name = 'Smoke team B'$q$);
rollback;
