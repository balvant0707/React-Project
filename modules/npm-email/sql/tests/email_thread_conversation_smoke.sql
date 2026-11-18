-- Copied from ~/npm_tool/supabase/tests/email_thread_conversation_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Internal conversations of email threads (migration 20261024130000): bash supabase/tests/run.sh email_thread_conversation_smoke.sql
-- Local stack, seeded. Runs as `authenticator` like PostgREST. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;
-- (port) mail.access for everybody in this test.
insert into public.roles (name) values ('SMOKE mail access');
insert into public.role_permissions (role_id, permission) select id, 'mail.access' from public.roles where name = 'SMOKE mail access';
insert into public.user_roles (user_id, role_id) select u.id, r.id from public.users u, public.roles r where r.name = 'SMOKE mail access' on conflict do nothing;
-- (port) The record conversation, created when missing (NPM's find_or_create_conversation, without a session).
-- As conversation_get_or_create, without its access check: the record's followers take part from the start.
create function pg_temp.record_conversation(p_anchor_type text, p_anchor_id uuid) returns uuid language plpgsql security definer as $rc$
declare v uuid;
begin
  select id into v from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
  if v is null then
    insert into public.conversations (kind, anchor_type, anchor_id, team_id)
    values ('record', p_anchor_type, p_anchor_id, public.conversation_team(p_anchor_type, p_anchor_id)) returning id into v;
    insert into public.conversation_participants (conversation_id, user_id)
    select v, u from unnest(public.entity_followers(p_anchor_type, p_anchor_id)) u where u is not null on conflict do nothing;
  end if;
  return v;
end $rc$;
grant execute on function pg_temp.record_conversation(text, uuid) to public;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu') as member_id,
  (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu') as outsider_id,
  null::uuid as thread_id,
  null::uuid as conversation_id;
grant all on fixture to public;

insert into public.teams (name) values ('SMOKE mailbox group');
insert into public.user_teams (user_id, team_id) select f.member_id, g.id from fixture f, public.teams g where g.name = 'SMOKE mailbox group';
insert into public.mailboxes (address, display_name, kind, team_id)
select 'smoke-shared@example.com', 'Smoke shared', 'shared', g.id from public.teams g where g.name = 'SMOKE mailbox group';
insert into public.email_threads (mailbox_id, subject) select m.id, 'Smoke thread' from public.mailboxes m where m.address = 'smoke-shared@example.com';
update fixture set thread_id = (select id from public.email_threads where subject = 'Smoke thread');

select set_config('request.jwt.claims', json_build_object('sub', (select member_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_conversation uuid;
  v_failed boolean := false;
begin
  select * into f from fixture;
  -- a mailbox member starts the internal conversation and writes into it
  v_conversation := pg_temp.record_conversation('email_threads', f.thread_id);
  insert into public.messages (conversation_id, author_user_id, body) values (v_conversation, f.member_id, 'internal note');
  assert (select count(*) from public.messages where conversation_id = v_conversation) = 1, 'member reads the internal note';
  update fixture set conversation_id = v_conversation;
  assert exists (select 1 from public.mentionable_users('email_threads', f.thread_id) where id = f.member_id), 'a member can be mentioned';
  assert not exists (select 1 from public.mentionable_users('email_threads', f.thread_id) where id = f.outsider_id), 'a non-member cannot be mentioned';
  -- (can_mention_user: NPM only; mentions are checked against mentionable_users)
  raise notice 'ok: member side';
end $$;

reset role;
reset session authorization;
select set_config('request.jwt.claims', json_build_object('sub', (select outsider_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_failed boolean := false;
begin
  select * into f from fixture;
  assert (select count(*) from public.conversations where id = f.conversation_id) = 0, 'a non-member does not see the conversation';
  assert (select count(*) from public.messages where conversation_id = f.conversation_id) = 0, 'a non-member does not see the messages';
  begin
    insert into public.messages (conversation_id, author_user_id, body) values (f.conversation_id, f.outsider_id, 'sneaky');
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a non-member cannot write into the conversation';
  raise notice 'ok: outsider side';
end $$;

rollback;
