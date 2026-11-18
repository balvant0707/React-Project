-- Grant mail.access (20261114100000_npm_email_mail_access.sql): without it a team member sees no mailbox and no thread; with it
-- the mailbox rules decide as before; an admin passes without it. RADAR app: bash tools/sql-test.sh npm <file>.
-- apps: npm
\set ON_ERROR_STOP on
begin;

create function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  execute p_sql into r;
  reset role;
  return r;
end $$;

create temp table fixture on commit drop as
select (select id from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu') as me_id,
       (select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where r.name = 'Admin' limit 1) as admin_id,
       null::uuid as mailbox_id, null::uuid as thread_id, null::uuid as role_id;
grant all on fixture to public;

do $$
declare f record;
begin
  select * into f from fixture;
  -- me has no mail.access (no role grants it), is in the team of a shared mailbox
  delete from public.role_permissions where permission = 'mail.access';
  insert into public.teams (name) values ('SMOKE mail access team');
  insert into public.user_teams (user_id, team_id) select f.me_id, g.id from public.teams g where g.name = 'SMOKE mail access team';
  insert into public.mailboxes (address, display_name, kind, team_id)
    select 'smoke-access@example.com', 'Smoke access box', 'shared', g.id from public.teams g where g.name = 'SMOKE mail access team';
  update fixture set mailbox_id = (select id from public.mailboxes where address = 'smoke-access@example.com');
  select * into f from fixture;
  insert into public.email_threads (mailbox_id, subject, last_message_at) values (f.mailbox_id, 'Smoke access thread', now()) returning id into f.thread_id;
  update fixture set thread_id = f.thread_id;
  insert into public.roles (name) values ('SMOKE mail access') returning id into f.role_id;
  update fixture set role_id = f.role_id;
end $$;

do $$
declare f record;
begin
  select * into f from fixture;
  -- without the grant
  assert pg_temp.as_user(f.me_id, format('select public.can_access_mailbox(%L)::text', f.mailbox_id)) = 'false', 'no grant: no mailbox';
  assert pg_temp.as_user(f.me_id, format('select (%L = any(public.my_mailbox_ids()))::text', f.mailbox_id)) = 'false', 'no grant: not in my_mailbox_ids';
  assert pg_temp.as_user(f.me_id, format('select count(*)::text from public.email_threads where id = %L', f.thread_id)) = '0', 'no grant: no thread';
  assert pg_temp.as_user(f.me_id, format('select public.can_access_entity(''email_threads'', %L, ''view'')::text', f.thread_id)) = 'false', 'no grant: entity access';
  -- an admin needs no grant
  assert pg_temp.as_user(f.admin_id, format('select public.can_access_mailbox(%L)::text', f.mailbox_id)) = 'true', 'admin passes';
  -- with the grant
  insert into public.role_permissions (role_id, permission) values (f.role_id, 'mail.access');
  insert into public.user_roles (user_id, role_id) values (f.me_id, f.role_id);
  assert pg_temp.as_user(f.me_id, format('select public.can_access_mailbox(%L)::text', f.mailbox_id)) = 'true', 'grant: mailbox of my team';
  assert pg_temp.as_user(f.me_id, format('select count(*)::text from public.email_threads where id = %L', f.thread_id)) = '1', 'grant: thread';
  assert pg_temp.as_user(f.me_id, format('select public.can_access_entity(''email_threads'', %L, ''view'')::text', f.thread_id)) = 'true', 'grant: entity access';
  -- the grant does not open other teams' mailboxes
  delete from public.user_teams where user_id = f.me_id and team_id = (select id from public.teams where name = 'SMOKE mail access team');
  assert pg_temp.as_user(f.me_id, format('select public.can_access_mailbox(%L)::text', f.mailbox_id)) = 'false', 'grant: not the mailbox of another team';
  raise notice 'ok: mail access grant';
end $$;

rollback;
