-- New test (companies migration 20261113190100_npm_companies_notes_rights.sql, platform 20261113190000_platform_notes_questions.sql):
-- a company is visible to everybody, its notes and files only with companies.read_notes / write_notes; .team = the
-- company's salesperson shares a team with me (or is me). RADAR app: bash tools/sql-test.sh npm <file>.
-- One transaction, rolled back; a failed assertion aborts with its message.
\set ON_ERROR_STOP on
begin;

-- Three people: the salesperson (sales), a team mate (mate) and somebody outside the team (other), each with only the test
-- role; one company of the salesperson with one note.
create temp table fx (sales uuid, mate uuid, other uuid, company uuid, conv uuid, team uuid, role_team uuid, role_all uuid);
grant select on fx to public;
do $$
declare
  f fx;
begin
  select id into f.sales from public.users where email = 'ugur.akbati@nipponpaint-marine.eu';
  select id into f.mate from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu';
  select id into f.other from public.users where email = 'melih.taskin@nipponpaint-marine.eu';
  delete from public.user_roles where user_id in (f.sales, f.mate, f.other);
  delete from public.user_teams where user_id in (f.sales, f.mate, f.other);
  insert into public.teams (name) values ('Company notes smoke') returning id into f.team;
  insert into public.user_teams (user_id, team_id) values (f.sales, f.team), (f.mate, f.team);
  insert into public.roles (name) values ('Notes team smoke') returning id into f.role_team;
  insert into public.roles (name) values ('Notes all smoke') returning id into f.role_all;
  insert into public.role_permissions (role_id, permission) values
    (f.role_team, 'companies.write_notes.team'), (f.role_all, 'companies.read_notes.all');
  insert into public.user_roles (user_id, role_id) values (f.sales, f.role_team), (f.mate, f.role_team), (f.other, f.role_team);
  select id into f.company from public.companies order by id limit 1;
  update public.companies set sales_account_user_id = f.sales where id = f.company;
  insert into public.conversations (kind, anchor_type, anchor_id, created_by_user_id)
    values ('record', 'companies', f.company, f.sales) returning id into f.conv;
  insert into public.messages (conversation_id, author_user_id, body) values (f.conv, f.sales, 'smoke note');
  insert into fx select f.*;
end $$;

-- The rule and the routing (as the database: about any person).
do $$
declare
  f fx;
begin
  select * into f from fx;
  assert public.user_has_access(f.other, 'companies', f.company, 'view'), '1 everybody sees the company';
  assert public.user_has_access(f.mate, 'companies', f.company, 'read_notes'), '2 a team mate reads the notes (write_notes.team implies read_notes.team)';
  assert public.user_has_access(f.mate, 'companies', f.company, 'write_notes'), '3 a team mate writes notes';
  assert public.user_has_access(f.mate, 'companies', f.company, 'add_files'), '4 adding a file is writing';
  assert public.user_has_access(f.sales, 'companies', f.company, 'read_notes'), '5 the salesperson reads the notes';
  assert not public.user_has_access(f.other, 'companies', f.company, 'read_notes'), '6 outside the team: no notes';
  assert not public.user_has_access(f.other, 'companies', f.company, 'write_notes'), '7 outside the team: no writing';
  delete from public.user_roles where user_id = f.other;
  insert into public.user_roles (user_id, role_id) values (f.other, f.role_all);
  assert public.user_has_access(f.other, 'companies', f.company, 'read_notes'), '8 read_notes.all: every company''s notes';
  assert not public.user_has_access(f.other, 'companies', f.company, 'write_notes'), '9 read_notes.all does not write';
  delete from public.user_roles where user_id = f.other;
  insert into public.user_roles (user_id, role_id) values (f.other, f.role_team);
  update public.companies set sales_account_user_id = null where id = f.company;
  assert not public.user_has_access(f.mate, 'companies', f.company, 'read_notes'), '10 no salesperson: no team, no notes';
  update public.companies set sales_account_user_id = f.sales where id = f.company;
end $$;

-- Row level security, as each person signed in: the company row for all, its note only for the team.
create function pg_temp.as_user(p_user uuid, p_sql text) returns bigint language plpgsql as $$
declare
  v bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end $$;
grant execute on all functions in schema pg_temp to public;
do $$
declare
  f fx;
begin
  select * into f from fx;
  assert pg_temp.as_user(f.other, format('select count(*) from public.companies where id = %L', f.company)) = 1, '11 the company row for everybody';
  assert pg_temp.as_user(f.mate, format('select count(*) from public.messages where conversation_id = %L', f.conv)) = 1, '12 the team mate sees the note';
  assert pg_temp.as_user(f.other, format('select count(*) from public.messages where conversation_id = %L', f.conv)) = 0, '13 outside the team: no note';
  assert pg_temp.as_user(f.other, format('select count(*) from public.mentionable_users(''companies'', %L)', f.company)) = 0, '14 outside the team: no mention list';
  assert pg_temp.as_user(f.mate, format('select count(*) from public.mentionable_users(''companies'', %L) m where m.id = %L', f.company, f.other)) = 0,
    '15 people outside the team are not offered for a mention';
  assert pg_temp.as_user(f.mate, format('select count(*) from public.mentionable_users(''companies'', %L) m where m.id = %L', f.company, f.sales)) = 1,
    '16 the salesperson is offered';
end $$;

rollback;
select 'npm_company_notes_smoke ok' as result;
