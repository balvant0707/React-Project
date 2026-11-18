-- Copied from ~/npm_tool/supabase/tests/email_smart_views_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Smart views of the Notes page (migration 20261024250000): bash supabase/tests/run.sh email_smart_views_smoke.sql
-- Local stack, seeded. One transaction, rolled back. The user is a member of one shared mailbox; a second mailbox is not theirs.
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
  null::uuid as box, null::uuid as other_box, null::uuid as t_company, null::uuid as t_free, null::uuid as t_waiting,
  null::uuid as t_avail, null::uuid as t_delivery, null::uuid as t_hidden, null::uuid as company_id;
grant all on fixture to public;

insert into public.teams (name) values ('SMOKE views group');
insert into public.user_teams (user_id, team_id) select f.me_id, g.id from fixture f, public.teams g where g.name = 'SMOKE views group';
insert into public.mailboxes (address, display_name, kind, team_id) select 'smoke-views@example.com', 'Smoke views box', 'shared', g.id from public.teams g where g.name = 'SMOKE views group';
insert into public.mailboxes (address, display_name, kind, owner_user_id) select 'smoke-views-other@example.com', 'Not mine', 'personal', f.other_id from fixture f;
update fixture set box = (select id from public.mailboxes where address = 'smoke-views@example.com'), other_box = (select id from public.mailboxes where address = 'smoke-views-other@example.com');

do $$
declare
  f record; v_company uuid; v_spec uuid; v_order uuid; v_t uuid;
begin
  select * into f from fixture;
  insert into public.companies (name, sales_account_user_id) values ('SMOKE views company', f.me_id) returning id into v_company;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.box, 'Company thread', f.other_id, now()) returning id into f.t_company;
  insert into public.email_threads (mailbox_id, subject, last_message_at) values (f.box, 'Free thread', now()) returning id into f.t_free;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.box, 'Waiting thread', f.me_id, now()) returning id into f.t_waiting;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.box, 'Availability thread', f.me_id, now()) returning id into f.t_avail;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.box, 'Delivery thread', f.me_id, now()) returning id into f.t_delivery;
  insert into public.email_threads (mailbox_id, subject, responsible_user_id, last_message_at) values (f.other_box, 'Hidden thread', f.other_id, now()) returning id into f.t_hidden;
  insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id, linked_by_user_id) values (f.t_company, 'companies', v_company, f.other_id);
  insert into public.email_messages (email_thread_id, direction, from_address, body_text, send_status, sent_at) values (f.t_waiting, 'outbound', 'box@example.com', 'asked', 'sent', now());

  -- A delivery planned in 3 days on an offer that the thread is linked to.
  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
  select 'SMOKE-VIEWS-1', 1, 'draft', (select id from public.vessels limit 1), (select id from public.companies where id <> v_company limit 1), (select id from public.teams order by id limit 1), 'EUR', current_date + 3
  returning id into v_spec;
  insert into public.transports (specification_id, planned_date) values (v_spec, current_date + 3);
  insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id, linked_by_user_id) values (f.t_delivery, 'specifications', v_spec, f.me_id);
  update fixture set t_company = f.t_company, t_free = f.t_free, t_waiting = f.t_waiting, t_avail = f.t_avail, t_delivery = f.t_delivery, t_hidden = f.t_hidden, company_id = v_company;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', (select me_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record; v_counts jsonb;
  ids uuid[];
begin
  select * into f from fixture;
  select array_agg(id) into ids from public.email_view_threads('unread');
  assert f.t_company = any (ids), 'unread: a company thread of mine, although a colleague is responsible';
  assert not (f.t_free = any (ids)), 'unread: an unassigned free thread is not relevant';
  select array_agg(id) into ids from public.email_view_threads('unassigned');
  assert f.t_free = any (ids) and not (f.t_company = any (ids)), 'unassigned';
  select array_agg(id) into ids from public.email_view_threads('free');
  assert f.t_free = any (ids) and not (f.t_company = any (ids)), 'free = no record link';
  select array_agg(id) into ids from public.email_view_threads('companies');
  assert f.t_company = any (ids), 'companies';
  select array_agg(id) into ids from public.email_view_threads('waiting');
  assert f.t_waiting = any (ids) and not (f.t_free = any (ids)), 'waiting for reply: my last mail is the newest message';
  select array_agg(id) into ids from public.email_view_threads('deliveries');
  assert f.t_delivery = any (ids) and not (f.t_company = any (ids)), 'deliveries next week through the linked offer''s transport';
  select array_agg(id) into ids from public.email_view_threads('offers');
  assert f.t_delivery = any (ids), 'offers';
  select array_agg(id) into ids from public.email_view_threads('mailbox', f.box);
  assert f.t_free = any (ids), 'mailbox view';
  select array_agg(id) into ids from public.email_view_threads('mailbox', f.other_box);
  assert ids is null, 'a mailbox that is not mine shows nothing';
  assert not exists (select 1 from public.email_view_threads('unassigned') where id = f.t_hidden), 'the hidden mailbox never shows up';
  assert (select count(*) from public.email_view_threads('mailbox', f.box, false, false, 'free')) = 1, 'search in the subject';
  assert (select count(*) from public.email_view_threads('mailbox', f.box, false, false, null, 2)) = 2, 'limit';

  insert into public.email_thread_reads (email_thread_id, user_id, last_read_at) values (f.t_company, f.me_id, now() + interval '1 minute');
  select array_agg(id) into ids from public.email_view_threads('unread');
  assert not (f.t_company = any (ids)), 'read threads leave the unread view';
  assert exists (select 1 from public.email_view_threads('companies') where id = f.t_company), 'but stay in their topic view';
  assert (select count(*) from public.email_view_threads('companies', null, true)) = 0, 'unread only';

  v_counts := public.email_view_counts();
  assert (v_counts #>> '{views,unassigned,t}')::int >= 1, 'counter unassigned';
  assert (v_counts #>> '{views,deliveries,t}')::int = 1, 'counter deliveries';
  assert (v_counts -> 'mailboxes') ? f.box::text and not ((v_counts -> 'mailboxes') ? f.other_box::text), 'counters only for my mailboxes';
  raise notice 'ok: smart views';
end $$;

rollback;
