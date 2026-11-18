-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/direct_messages_smoke.sql with the renames and platform adaptations.
-- Direct messages (migration 20261208110000_direct_messages.sql): one conversation per pair, found again from either
-- side, none with oneself or with somebody who cannot sign in; it reaches the Inbox only with the first message; only the
-- two read and write (no third person, no admin, no holder of messages.delete); the other person gets one bundled bell
-- line (not when muted, reading clears it); only the author deletes their message; writing stops when the partner is
-- locked; files follow the conversation. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/direct_messages_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.blocked(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then return true;
end $$;
create function pg_temp.conv() returns uuid language sql as $$
  select id from public.conversations where kind = 'direct' and direct_key = least(pg_temp.uid('tom.berger@example.com'), pg_temp.uid('anna.weber@example.com'))::text
    || ':' || greatest(pg_temp.uid('tom.berger@example.com'), pg_temp.uid('anna.weber@example.com'))::text
$$;
create temp table base (n integer);
grant all on base to public;
grant execute on all functions in schema pg_temp to public;

-- 1. Tom opens a conversation with Anna; Anna finds the same one; nobody gets two.
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v_a uuid; v_b uuid;
begin
  v_a := public.conversation_get_or_create_direct(pg_temp.uid('anna.weber@example.com'));
  v_b := public.conversation_get_or_create_direct(pg_temp.uid('anna.weber@example.com'));
  assert v_a is not null and v_a = v_b, '1 the same conversation twice';
  assert pg_temp.blocked(format($q$select public.conversation_get_or_create_direct(%L)$q$, pg_temp.uid('tom.berger@example.com'))), '2 not with oneself';
  assert pg_temp.blocked(format($q$select public.conversation_get_or_create_direct(%L)$q$, (select id from public.users where not has_login limit 1))), '3 not with somebody without a login';
  assert pg_temp.blocked($q$select public.conversation_get_or_create_direct(null)$q$), '4 not with nobody';
  assert pg_temp.blocked(format($q$insert into public.conversations (kind, direct_key) values ('direct', 'forged:pair')$q$)), '5 no conversation is made around the RPC';
end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$
begin
  assert public.conversation_get_or_create_direct(pg_temp.uid('tom.berger@example.com')) = pg_temp.conv(), '6 Anna finds the same conversation';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.conversations where kind = 'direct' and direct_key like '%' || pg_temp.uid('anna.weber@example.com')::text || '%'
          and direct_key like '%' || pg_temp.uid('tom.berger@example.com')::text || '%') = 1, '7 one conversation per pair';
  assert (select count(*) from public.conversation_participants where conversation_id = pg_temp.conv() and not taking_part) = 2, '8 both rows exist, nobody takes part yet';
end $$;

-- 2. An empty conversation is no Inbox line.
select pg_temp.as_user('anna.weber@example.com');
do $$
begin
  assert (select count(*) from public.inbox_list('mine') where conversation_id = pg_temp.conv()) = 0, '9 empty: not in the Inbox of Anna';
  insert into base values (public.inbox_unread_count());
end $$;
reset role;

-- 3. Tom writes: both take part, Anna gets one bell line, the Inbox shows the other person's name.
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(), 'Hallo Anna, kurze Frage');
reset role;
do $$
begin
  assert (select count(*) from public.conversation_participants where conversation_id = pg_temp.conv() and taking_part) = 2, '11 both take part after the first message';
  assert (select count(*) from public.notifications where user_id = pg_temp.uid('anna.weber@example.com') and type = 'direct_message' and entity_id = pg_temp.conv()) = 1, '12 Anna has one bell line';
  assert (select count(*) from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'direct_message') = 0, '13 the author gets none';
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v record;
begin
  select * into v from public.inbox_list('mine') where conversation_id = pg_temp.conv();
  assert v.conversation_id is not null and v.kind = 'direct', '14 in the Inbox of Anna';
  assert v.title = 'Tom Berger', '15 titled with the other person';
  assert v.partner_user_id = (select id from public.users where username = 'tom.berger'), '15b partner is Tom';
  assert v.unread_count = 1, '16 one unread';
  assert (select count(*) from public.inbox_list('mine', null, false, 'direct')) >= 1, '17 filter direct';
  assert (select count(*) from public.inbox_list('mine', null, false, 'posts') where kind = 'direct') = 0, '18 not under posts';
  assert public.inbox_unread_count() = (select n from base) + 1, '19 the badge counts it';
end $$;
reset role;
select pg_temp.as_user('tom.berger@example.com');
do $$
begin
  assert (select title from public.inbox_list('mine') where conversation_id = pg_temp.conv()) = 'Anna Weber', '20 Tom sees Anna';
  assert (select partner_user_id from public.inbox_list('mine') where conversation_id = pg_temp.conv())
    = (select id from public.users where username = 'anna.weber'), '20b partner is Anna';
end $$;
reset role;

-- 4. A bell line bundles a second message while unread.
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(), 'Und noch etwas');
reset role;
do $$
begin
  assert (select count(*) from public.notifications where user_id = pg_temp.uid('anna.weber@example.com') and type = 'direct_message' and entity_id = pg_temp.conv()) = 1, '21 still one line';
  assert (select occurrences from public.notifications where user_id = pg_temp.uid('anna.weber@example.com') and type = 'direct_message' and entity_id = pg_temp.conv()) = 2, '22 counted twice';
end $$;

-- 5. Nobody else sees or writes: not Ben, not HR, not the admin.
select pg_temp.as_user('ben.keller@example.com');
do $$
begin
  assert not exists (select 1 from public.conversations where id = pg_temp.conv()), '23 Ben does not see the conversation';
  assert not exists (select 1 from public.messages where conversation_id = pg_temp.conv()), '24 nor its messages';
  assert pg_temp.blocked(format($q$insert into public.messages (conversation_id, body) values (%L, 'mitgelesen')$q$, pg_temp.conv())), '25 Ben cannot write';
  assert pg_temp.blocked(format($q$insert into public.conversation_participants (conversation_id, user_id) values (%L, %L)$q$, pg_temp.conv(), pg_temp.uid('ben.keller@example.com'))), '26 Ben cannot join';
  assert not exists (select 1 from public.conversation_readers(pg_temp.conv())), '27 no read receipts for outsiders';
end $$;
reset role;
select pg_temp.as_user('hanna.richter@example.com');
do $$
begin
  assert not exists (select 1 from public.messages where conversation_id = pg_temp.conv()), '28 HR does not see it';
  assert pg_temp.blocked(format($q$select public.message_delete((select id from public.messages where conversation_id = %L limit 1))$q$, pg_temp.conv())), '29 HR cannot delete';
end $$;
reset role;
select pg_temp.as_user('max.wilckens@wilckens.com');
do $$
begin
  assert not exists (select 1 from public.messages where conversation_id = pg_temp.conv()), '30 the admin does not see it';
  assert not public.conversation_can(pg_temp.conv(), 'moderate'), '31 nobody moderates';
end $$;
reset role;

-- 6. Reading clears the bell; a read marker follows.
select pg_temp.as_user('anna.weber@example.com');
select public.notifications_mark_conversations_read(array[pg_temp.conv()]);
select public.conversation_mark_read(pg_temp.conv());
do $$
begin
  assert (select count(*) from public.notifications where user_id = pg_temp.uid('anna.weber@example.com') and type = 'direct_message' and read_at is null) = 0, '32 reading cleared the bell';
  assert (select unread_count from public.inbox_list('mine') where conversation_id = pg_temp.conv()) = 0, '33 nothing unread any more';
end $$;
reset role;

-- 7. Muted: no new bell line.
select pg_temp.as_user('anna.weber@example.com');
update public.conversation_participants set level = 'mute' where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com');
reset role;
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(), 'Stumm?');
reset role;
do $$
begin
  assert (select count(*) from public.notifications where user_id = pg_temp.uid('anna.weber@example.com') and type = 'direct_message' and read_at is null) = 0, '34 muted: no bell line';
end $$;
-- Muted and hidden stays hidden when the next message comes; unmuted and hidden comes back with it.
select pg_temp.as_user('anna.weber@example.com');
update public.conversation_participants set taking_part = false where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com');
reset role;
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(), 'Noch eine');
reset role;
do $$
begin
  assert not (select taking_part from public.conversation_participants where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com')), '34b muted and hidden stays hidden';
end $$;
select pg_temp.as_user('anna.weber@example.com');
update public.conversation_participants set level = 'all' where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com');
reset role;
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(), 'Und noch eine');
reset role;
do $$
begin
  assert (select taking_part from public.conversation_participants where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com')), '34c unmuted and hidden comes back with a new message';
end $$;

-- A participant who deleted their own row is put back by the RPC (the policy lets them delete it).
select pg_temp.as_user('anna.weber@example.com');
delete from public.conversation_participants where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com');
do $$
begin
  assert not exists (select 1 from public.conversations where id = pg_temp.conv()), '34d without the row she no longer sees the conversation';
  perform public.conversation_get_or_create_direct(pg_temp.uid('tom.berger@example.com'));
  assert exists (select 1 from public.conversations where id = pg_temp.conv()), '34e the RPC puts her back';
  assert (select taking_part from public.conversation_participants where conversation_id = pg_temp.conv() and user_id = pg_temp.uid('anna.weber@example.com')), '34f and the conversation shows in her Inbox again';
end $$;
reset role;

-- 8. Only the author deletes: Anna cannot delete Tom's message, Tom can.
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_msg uuid := (select id from public.messages where conversation_id = pg_temp.conv() and body = 'Stumm?');
begin
  assert pg_temp.blocked(format($q$select public.message_delete(%L)$q$, v_msg)), '35 the other person cannot delete';
end $$;
reset role;
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v_msg uuid := (select id from public.messages where conversation_id = pg_temp.conv() and body = 'Stumm?');
begin
  perform public.message_delete(v_msg);
  assert (select deleted_at is not null and body = '' from public.messages where id = v_msg), '36 the author deleted it';
  assert (select message_count from public.conversations where id = pg_temp.conv()) = 4, '37 the counter dropped';
end $$;
reset role;

-- 9. Files follow the conversation.
select pg_temp.as_user('tom.berger@example.com');
do $$
begin
  insert into public.attachments (entity_type, entity_id, storage_path, file_name, message_id)
  values ('conversations', pg_temp.conv(), 'conversations/' || pg_temp.conv() || '/x.pdf', 'x.pdf', (select id from public.messages where conversation_id = pg_temp.conv() and deleted_at is null limit 1));
  assert true, '38 a participant attaches a file';
end $$;
reset role;
select pg_temp.as_user('ben.keller@example.com');
do $$
begin
  assert not exists (select 1 from public.attachments where entity_type = 'conversations' and entity_id = pg_temp.conv()), '39 Ben does not see the file';
  assert pg_temp.blocked(format($q$insert into public.attachments (entity_type, entity_id, storage_path, file_name) values ('conversations', %L, 'conversations/%s/y.pdf', 'y.pdf')$q$, pg_temp.conv(), pg_temp.conv())), '40 Ben cannot attach one';
end $$;
reset role;

-- 10. A locked partner: reading stays, writing stops.
select pg_temp.as_user('max.wilckens@wilckens.com');
select public.user_lock(pg_temp.uid('anna.weber@example.com'), 'smoke');
reset role;
select pg_temp.as_user('tom.berger@example.com');
do $$
begin
  assert exists (select 1 from public.messages where conversation_id = pg_temp.conv()), '41 Tom still reads';
  assert pg_temp.blocked(format($q$insert into public.messages (conversation_id, body) values (%L, 'noch da?')$q$, pg_temp.conv())), '42 but cannot write to a locked person';
end $$;
reset role;

select 'direct_messages_smoke ok' as result;
rollback;
