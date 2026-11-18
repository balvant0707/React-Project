-- Copied from ~/npm_tool/supabase/tests/email_relevant_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- "Relevant for me" email threads (migration 20261024210000): bash supabase/tests/run.sh email_relevant_smoke.sql
-- Local stack, seeded. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;
-- (port) mail.access for everybody in this test.
insert into public.roles (name) values ('SMOKE mail access');
insert into public.role_permissions (role_id, permission) select id, 'mail.access' from public.roles where name = 'SMOKE mail access';
insert into public.user_roles (user_id, role_id) select u.id, r.id from public.users u, public.roles r where r.name = 'SMOKE mail access' on conflict do nothing;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu') as me_id,
  (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu') as other_id,
  null::uuid as mailbox_id, null::uuid as t_company, null::uuid as t_other, null::uuid as t_free, null::uuid as company_id;
grant all on fixture to public;

insert into public.teams (name) values ('SMOKE relevant group');
insert into public.user_teams (user_id, team_id) select f.me_id, g.id from fixture f, public.teams g where g.name = 'SMOKE relevant group';
insert into public.mailboxes (address, display_name, kind, team_id)
select 'smoke-relevant@example.com', 'Smoke relevant box', 'shared', g.id from public.teams g where g.name = 'SMOKE relevant group';
update fixture set mailbox_id = (select id from public.mailboxes where address = 'smoke-relevant@example.com');

do $$
declare f record; v_company uuid;
begin
  select * into f from fixture;
  -- A company whose sales rep is me, one whose rep is somebody else.
  insert into public.companies (name, sales_account_user_id) values ('SMOKE relevant company', f.me_id) returning id into v_company;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.mailbox_id, 'Company thread', f.other_id, now()) returning id into f.t_company;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.mailbox_id, 'Other thread', f.other_id, now()) returning id into f.t_other;
  insert into public.email_threads (mailbox_id, subject, last_message_at) values (f.mailbox_id, 'Free thread', now()) returning id into f.t_free;
  insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id, linked_by_user_id) values (f.t_company, 'companies', v_company, f.other_id);
  update fixture set t_company = f.t_company, t_other = f.t_other, t_free = f.t_free, company_id = v_company;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', (select me_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare f record;
begin
  select * into f from fixture;
  assert f.t_company in (select public.my_relevant_email_thread_ids()), 'thread of a company I am sales rep of is relevant, although a colleague is responsible';
  assert f.t_other not in (select public.my_relevant_email_thread_ids()), 'a colleague''s thread without a link to me is not relevant';
  assert f.t_free not in (select public.my_relevant_email_thread_ids()), 'an unassigned free thread is not relevant';
  assert (select unread_relevant from public.my_email_counters()) >= 1, 'the company thread is unread for me';
  assert (select unassigned from public.my_email_counters()) >= 1, 'the free thread is unassigned';
  insert into public.email_thread_reads (email_thread_id, user_id, last_read_at) values (f.t_company, f.me_id, now() + interval '1 minute');
  assert f.t_company in (select public.my_relevant_email_thread_ids()), 'reading does not change relevance';
  raise notice 'ok: relevant for me';
end $$;

reset role;
reset session authorization;
do $$
declare f record;
begin
  select * into f from fixture;
  update public.email_threads set status = 'closed' where id = f.t_other;
  insert into public.email_messages (email_thread_id, direction, from_address, body_text, send_status, sent_at) values (f.t_other, 'inbound', 'x@example.com', 'still there?', 'received', now());
  assert (select status from public.email_threads where id = f.t_other) = 'open', 'an inbound mail reopens a closed thread';
  update public.email_threads set status = 'spam' where id = f.t_other;
  insert into public.email_messages (email_thread_id, direction, from_address, body_text, send_status, sent_at) values (f.t_other, 'inbound', 'x@example.com', 'again', 'received', now());
  assert (select status from public.email_threads where id = f.t_other) = 'spam', 'spam stays spam';
  update public.email_threads set status = 'closed' where id = f.t_other;
  insert into public.email_messages (email_thread_id, direction, from_address, body_text, send_status, sent_at) values (f.t_other, 'outbound', 'box@example.com', 'our note', 'sent', now());
  assert (select status from public.email_threads where id = f.t_other) = 'closed', 'our own mail does not reopen it';
  raise notice 'ok: reopen on inbound';
end $$;

rollback;
