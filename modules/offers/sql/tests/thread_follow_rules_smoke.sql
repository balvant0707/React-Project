-- Copied from ~/npm_tool/supabase/tests/thread_follow_rules_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Who follows a thread and who gets an unread mark (migration 20261024260000_thread_follow_rules.sql):
-- bash supabase/tests/run.sh thread_follow_rules_smoke.sql
-- Local stack, seeded. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;
-- (port) mail.access for everybody in this test (the Mail grant gates thread access, as in email_relevant_smoke.sql).
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
  (select id from public.users where email = 'max.wilckens@wilckens.com') as resp_id,
  (select id from public.users where email = 'johan.wilckens@wilckens.com') as sales_id,
  (select id from public.users where email = 'rieke.thormaehlen@wilckens.com') as writer_id,
  (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu') as other_id,
  (select id from public.users where email = 'spiros.dimopoulos@nipponpaint-marine.eu') as new_resp_id,
  (select id from public.vessels order by id limit 1) as vessel_id,
  (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1) as supplier_id,
  null::uuid as spec_id, null::uuid as conv_id;
grant all on fixture to public;

insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date, responsible_user_id, sales_account_user_id)
select 'SMOKE-FR-1', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15', f.resp_id, f.sales_id from fixture f;
update fixture set spec_id = (select id from public.specifications where specification_number = 'SMOKE-FR-1');
update fixture set conv_id = pg_temp.record_conversation('specifications', spec_id);
delete from public.notifications;

do $$
declare
  f record;
  v_msg uuid;
begin
  select * into f from fixture;

  -- A note by somebody else reaches the responsible person and the salesperson, not the author and not a stranger.
  insert into public.messages (conversation_id, author_user_id, body) values (f.conv_id, f.writer_id, 'first note');
  assert exists (select 1 from public.notifications where user_id = f.resp_id and entity_id = f.spec_id and type = 'comment' and read_at is null), 'responsible person notified';
  assert exists (select 1 from public.notifications where user_id = f.sales_id and entity_id = f.spec_id and type = 'comment' and read_at is null), 'salesperson notified';
  assert not exists (select 1 from public.notifications where user_id = f.writer_id), 'author not notified';
  assert not exists (select 1 from public.notifications where user_id = f.other_id), 'a stranger is not notified';

  -- The author follows from now on (took part).
  delete from public.notifications;
  insert into public.messages (conversation_id, author_user_id, body) values (f.conv_id, f.resp_id, 'second note');
  assert exists (select 1 from public.notifications where user_id = f.writer_id and entity_id = f.spec_id and type = 'comment'), 'a writer follows';
  assert not exists (select 1 from public.notifications where user_id = f.resp_id), 'author not notified (responsible)';

  -- The responsible person mutes: no more plain messages, but a mention still arrives.
  perform public.record_follow('specifications', f.spec_id, f.resp_id, 'mute');
  delete from public.notifications;
  insert into public.messages (conversation_id, author_user_id, body) values (f.conv_id, f.writer_id, 'third note');
  assert not exists (select 1 from public.notifications where user_id = f.resp_id), 'muted: nothing';
  assert exists (select 1 from public.notifications where user_id = f.sales_id), 'others still notified';
  insert into public.messages (conversation_id, author_user_id, body) values (f.conv_id, f.writer_id, 'hello @[user:' || f.resp_id || ']') returning id into v_msg;
  assert exists (select 1 from public.notifications where user_id = f.resp_id and type = 'mention' and read_at is null), 'a mention always arrives';

  -- The unread mark in the list view follows the notification and goes with reading.
  perform set_config('request.jwt.claims', json_build_object('sub', f.sales_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  assert (select has_unread_notes from public.deals_overview where id = f.spec_id), 'unread note flag';
  assert not (select has_unread_emails from public.deals_overview where id = f.spec_id), 'no unread email flag';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f.sales_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.conversation_mark_read(f.conv_id);
  perform set_config('request.jwt.claims', json_build_object('sub', f.sales_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  assert not (select has_unread_notes from public.deals_overview where id = f.spec_id), 'reading clears the flag';
  execute 'reset role';

  -- Handover: the previous responsible person stops following, the new one follows.
  perform public.record_follow('specifications', f.spec_id, f.resp_id, 'all');  -- would follow again ...
  perform set_config('request.jwt.claims', json_build_object('sub', f.resp_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform public.hand_over('specifications', f.spec_id, f.new_resp_id, 'Please take over');
  delete from public.notifications;
  insert into public.messages (conversation_id, author_user_id, body) values (f.conv_id, f.writer_id, 'after handover');
  assert exists (select 1 from public.notifications where user_id = f.new_resp_id and type = 'comment'), 'new responsible follows';
  assert not exists (select 1 from public.notifications where user_id = f.resp_id), 'previous responsible no longer follows';
end $$;

-- Email thread: the responsible person of the thread and the people of the linked offer get an unread mark per thread (one
-- row however many mails), a mute silences it, reading the thread clears it.
do $$
declare
  f record;
  v_box uuid;
  v_thread uuid;
begin
  select * into f from fixture;
  insert into public.mailboxes (address, display_name, kind, owner_user_id) values ('smoke-fr@example.com', 'smoke', 'personal', f.other_id) returning id into v_box;
  insert into public.email_threads (mailbox_id, subject, status, last_message_at, responsible_user_id) values (v_box, 'smoke', 'open', now(), f.writer_id) returning id into v_thread;
  insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id) values (v_thread, 'specifications', f.spec_id);
  delete from public.notifications;
  insert into public.email_messages (email_thread_id, direction, from_address, sent_at) values (v_thread, 'inbound', 'a@example.com', now());
  insert into public.email_messages (email_thread_id, direction, from_address, sent_at) values (v_thread, 'inbound', 'a@example.com', now());
  assert (select count(*) from public.notifications where user_id = f.writer_id and entity_type = 'email_threads' and read_at is null) = 1, 'thread responsible: one mark per thread';
  assert exists (select 1 from public.notifications where user_id = f.sales_id and entity_type = 'email_threads' and entity_id = v_thread), 'salesperson of the linked offer';
  assert exists (select 1 from public.notifications where user_id = f.new_resp_id and entity_type = 'email_threads' and entity_id = v_thread), 'responsible person of the linked offer';
  assert not exists (select 1 from public.notifications where user_id = f.other_id and entity_type = 'email_threads'), 'a stranger is not notified';

  perform set_config('request.jwt.claims', json_build_object('sub', f.sales_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  assert (select has_unread_emails from public.deals_overview where id = f.spec_id), 'unread email flag';
  execute 'reset role';
  update public.email_threads set last_message_at = now() where id = v_thread;
  insert into public.email_thread_reads (email_thread_id, user_id, last_read_at) values (v_thread, f.sales_id, now() + interval '1 second');
  assert not exists (select 1 from public.notifications where user_id = f.sales_id and entity_type = 'email_threads' and read_at is null), 'reading the thread clears the mark';
  insert into public.thread_follows (user_id, target_type, target_id, level) values (f.writer_id, 'email_threads', v_thread, 'mute');
  delete from public.notifications;
  insert into public.email_messages (email_thread_id, direction, from_address, sent_at) values (v_thread, 'inbound', 'a@example.com', now());
  assert not exists (select 1 from public.notifications where user_id = f.writer_id and entity_type = 'email_threads'), 'muted thread responsible gets nothing';
  -- The Notes page and the sidebar use the same rule: Follow makes a thread of my mailbox relevant, mute removes it again.
  delete from public.thread_follows where user_id = f.other_id;
  perform set_config('request.jwt.claims', json_build_object('sub', f.other_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.my_relevant_email_thread_ids() i where i = v_thread), 'a stranger: not relevant';
  insert into public.thread_follows (user_id, target_type, target_id, level) values (f.other_id, 'email_threads', v_thread, 'follow');
  assert exists (select 1 from public.my_relevant_email_thread_ids() i where i = v_thread), 'Follow makes it relevant';
  update public.thread_follows set level = 'mute' where user_id = f.other_id;
  assert not exists (select 1 from public.my_relevant_email_thread_ids() i where i = v_thread), 'mute removes it';
  execute 'reset role';
end $$;

-- Per-type switches: a switched-off type creates nothing for that person, a mention still does; old read notifications are purged.
do $$
declare
  f record;
begin
  select * into f from fixture;
  insert into public.notification_preferences (user_id, muted_types) values (f.sales_id, array['comment', 'mention'])
    on conflict (user_id) do update set muted_types = excluded.muted_types;
  delete from public.notifications;
  perform public.notify(array[f.sales_id], 'comment', 't', null, null, null, 'conversations', f.conv_id, 'k1');
  assert not exists (select 1 from public.notifications where user_id = f.sales_id), 'a switched-off type is skipped';
  perform public.notify(array[f.sales_id], 'mention', 't', null, null, null, 'conversations', f.conv_id, 'k2');
  assert exists (select 1 from public.notifications where user_id = f.sales_id and type = 'mention'), 'a mention can not be switched off';
  insert into public.notifications (user_id, type, title, read_at) values (f.sales_id, 'message', 'old', now() - interval '100 days'), (f.sales_id, 'message', 'new', now());
  perform public.cleanup_notifications();
  assert not exists (select 1 from public.notifications where title = 'old') and exists (select 1 from public.notifications where title = 'new'), 'retention keeps recent and unread';
end $$;

rollback;
select 'thread_follow_rules_smoke ok' as result;
