-- Copied from ~/npm_tool/supabase/tests/email_draft_lock_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Shared drafts of new emails (migration 20261024170000): bash supabase/tests/run.sh email_draft_lock_smoke.sql
-- Local stack, seeded. Runs as `authenticator` like PostgREST. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;
-- (port) mail.access for everybody in this test.
insert into public.roles (name) values ('SMOKE mail access');
insert into public.role_permissions (role_id, permission) select id, 'mail.access' from public.roles where name = 'SMOKE mail access';
insert into public.user_roles (user_id, role_id) select u.id, r.id from public.users u, public.roles r where r.name = 'SMOKE mail access' on conflict do nothing;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu') as writer_id,
  (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu') as colleague_id,
  null::uuid as mailbox_id,
  null::uuid as draft_id;
grant all on fixture to public;

insert into public.teams (name) values ('SMOKE draft group');
insert into public.user_teams (user_id, team_id) select f.writer_id, g.id from fixture f, public.teams g where g.name = 'SMOKE draft group';
insert into public.user_teams (user_id, team_id) select f.colleague_id, g.id from fixture f, public.teams g where g.name = 'SMOKE draft group';
insert into public.mailboxes (address, display_name, kind, team_id)
select 'smoke-draft@example.com', 'Smoke draft box', 'shared', g.id from public.teams g where g.name = 'SMOKE draft group';
update fixture set mailbox_id = (select id from public.mailboxes where address = 'smoke-draft@example.com');

select set_config('request.jwt.claims', json_build_object('sub', (select writer_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_draft uuid;
begin
  select * into f from fixture;
  insert into public.email_thread_drafts (mailbox_id, created_by_user_id, subject, entity_links, locked_by_user_id, locked_at)
  values (f.mailbox_id, f.writer_id, 'Smoke draft', '[{"entity_type":"specifications","entity_id":"00000000-0000-0000-0000-000000000000"}]'::jsonb, f.writer_id, now())
  returning id into v_draft;
  update fixture set draft_id = v_draft;
  assert (select subject from public.email_thread_drafts where id = v_draft) = 'Smoke draft', 'the writer reads the draft';
  update public.email_thread_drafts set subject = 'Smoke draft 2', locked_at = now() where id = v_draft;
  raise notice 'ok: writer side';
end $$;

reset role;
reset session authorization;
select set_config('request.jwt.claims', json_build_object('sub', (select colleague_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_failed boolean := false;
begin
  select * into f from fixture;
  assert (select count(*) from public.email_thread_drafts where id = f.draft_id) = 1, 'a colleague of the mailbox sees the draft';
  begin
    update public.email_thread_drafts set subject = 'hijacked' where id = f.draft_id;
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a colleague cannot edit a draft that is locked';
  v_failed := false;
  begin
    delete from public.email_thread_drafts where id = f.draft_id;
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a colleague cannot discard a draft that is locked';
  raise notice 'ok: colleague side while locked';
end $$;

-- the lock lapses after two minutes
reset role;
reset session authorization;
-- (the superuser has no auth.uid(), so the update lock is switched off for this one statement; rolled back with the rest)
alter table public.email_thread_drafts disable trigger check_email_thread_draft_lock;
update public.email_thread_drafts set locked_at = now() - interval '3 minutes' where id = (select draft_id from fixture);
alter table public.email_thread_drafts enable trigger check_email_thread_draft_lock;
select set_config('request.jwt.claims', json_build_object('sub', (select colleague_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
begin
  delete from public.email_thread_drafts where id = (select draft_id from fixture);
  assert (select count(*) from public.email_thread_drafts where id = (select draft_id from fixture)) = 0, 'a lapsed lock no longer protects the draft';
  raise notice 'ok: lapsed lock';
end $$;

-- Attachments of a discarded draft go with it (migration 20261024180000).
reset role;
reset session authorization;
do $$
declare
  f record;
  v_draft uuid;
  v_thread uuid;
begin
  select * into f from fixture;
  insert into public.email_thread_drafts (mailbox_id, created_by_user_id, subject) values (f.mailbox_id, f.writer_id, 'attach') returning id into v_draft;
  insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) values ('email_thread_drafts', v_draft, 'a.pdf', 'email_thread_drafts/x/a.pdf', f.writer_id);
  delete from public.email_thread_drafts where id = v_draft;
  assert not exists (select 1 from public.attachments where entity_id = v_draft), 'the attachments of a deleted draft are removed';

  -- A reply on a thread nobody looks after pings the members of the mailbox once (migration 20261024190000).
  insert into public.email_threads (mailbox_id, subject) values (f.mailbox_id, 'Unclaimed smoke') returning id into v_thread;
  insert into public.email_messages (email_thread_id, direction, from_address, body_text, send_status, sent_at)
  values (v_thread, 'inbound', 'who@example.com', 'hi', 'received', now());
  insert into public.email_messages (email_thread_id, direction, from_address, body_text, send_status, sent_at)
  values (v_thread, 'inbound', 'who@example.com', 'hi again', 'received', now());
  assert (select count(*) from public.notifications where dedupe_key = 'unclaimed:' || v_thread and type = 'email_unclaimed') = 2, 'both members get one ping, folded per thread';

  -- The unread count: only threads that are mine, until I open them.
  assert (select count(*) from public.email_threads where id = v_thread and responsible_user_id is null) = 1, 'unassigned';
  update public.email_threads set responsible_user_id = f.writer_id where id = v_thread;
  raise notice 'ok: attachment cleanup and unclaimed ping';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', (select writer_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;
do $$
declare
  v_thread uuid := (select id from public.email_threads where subject = 'Unclaimed smoke');
begin
  assert public.my_unread_email_threads() >= 1, 'my thread with a new message is unread';
  insert into public.email_thread_reads (email_thread_id, user_id, last_read_at) values (v_thread, (select writer_id from fixture), now() + interval '1 minute');
  assert not exists (select 1 from public.email_threads t where t.id = v_thread and t.last_message_at > (select last_read_at from public.email_thread_reads where email_thread_id = v_thread)), 'read state is newer than the thread';
  raise notice 'ok: unread count';
end $$;

rollback;
