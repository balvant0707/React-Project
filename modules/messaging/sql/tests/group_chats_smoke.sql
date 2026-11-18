-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/group_chats_smoke.sql with the renames and platform adaptations.
-- Group chats (migration 20261224100000_group_chats.sql): the chat of exactly these people is found again from any of
-- them, needs two others with a login; only the people in it read and write, nobody adds themselves; the first message
-- brings everybody into the Inbox (filter "direct") and tells the others; somebody added later reads the whole history
-- without unread messages; only the author deletes (not even a holder of messages.delete); leaving ends reading; a
-- name replaces the list of people; the chat "of exactly these people" follows who is in it now; adding counts only
-- new people; chats_search finds my chats by label. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/group_chats_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_username text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where username = p_username), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_username text) returns uuid language sql as $$ select id from public.users where username = p_username $$;
create function pg_temp.blocked(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then return true;
end $$;
create temp table chat (id uuid, message_id uuid);
grant all on chat to public;
grant execute on all functions in schema pg_temp to public;

-- 1. Tom starts a chat with Anna and Sara; the same call and Anna with the same people find it again.
select pg_temp.as_user('tom.berger');
do $$
declare v_a uuid; v_b uuid;
begin
  v_a := public.conversation_get_or_create_group(array[pg_temp.uid('anna.weber'), pg_temp.uid('sara.novak')]);
  v_b := public.conversation_get_or_create_group(array[pg_temp.uid('sara.novak'), pg_temp.uid('anna.weber'), pg_temp.uid('tom.berger')]);
  assert v_a is not null and v_a = v_b, '1 the same chat twice, whatever the order and with oneself named';
  insert into chat values (v_a, null);
  assert pg_temp.blocked(format($q$select public.conversation_get_or_create_group(array[%L::uuid])$q$, pg_temp.uid('anna.weber'))), '2 one other person is a direct message';
  assert pg_temp.blocked(format($q$select public.conversation_get_or_create_group(array[%L::uuid, %L::uuid])$q$,
    pg_temp.uid('anna.weber'), (select id from public.users where not has_login limit 1))), '3 not with somebody without a login';
end $$;
reset role;
select pg_temp.as_user('anna.weber');
do $$
begin
  assert public.conversation_get_or_create_group(array[pg_temp.uid('tom.berger'), pg_temp.uid('sara.novak')]) = (select id from chat), '4 Anna finds the same chat';
  assert (select count(*) from public.inbox_list('mine') where conversation_id = (select id from chat)) = 0, '5 empty: no Inbox line';
end $$;
reset role;

-- 2. Ben is not in it: he reads nothing and cannot put himself in.
select pg_temp.as_user('ben.keller');
do $$
begin
  assert (select count(*) from public.conversation_people((select id from chat))) = 0, '6 Ben does not see who is in it';
  assert pg_temp.blocked(format($q$insert into public.conversation_participants (conversation_id, user_id) values (%L, %L)$q$, (select id from chat), pg_temp.uid('ben.keller'))), '7 no own participant row';
  assert pg_temp.blocked(format($q$insert into public.messages (conversation_id, body) values (%L, 'hi')$q$, (select id from chat))), '8 Ben cannot write';
  assert pg_temp.blocked(format($q$select public.conversation_add_people(%L, array[%L::uuid])$q$, (select id from chat), pg_temp.uid('ben.keller'))), '9 Ben cannot add himself';
end $$;
reset role;

-- 3. Tom writes: everybody takes part, Anna and Sara get a bell line, Tom none; the filter "direct" lists the chat.
select pg_temp.as_user('tom.berger');
insert into public.messages (conversation_id, body) values ((select id from chat), 'Who takes Saturday?');
reset role;
update chat set message_id = (select id from public.messages where conversation_id = chat.id);
do $$
begin
  assert (select count(*) from public.conversation_participants where conversation_id = (select id from chat) and taking_part) = 3, '10 all three take part';
  assert (select count(*) from public.notifications where type = 'direct_message' and entity_id = (select id from chat)
          and user_id in (pg_temp.uid('anna.weber'), pg_temp.uid('sara.novak'))) = 2, '11 Anna and Sara are told';
  assert (select count(*) from public.notifications where type = 'direct_message' and user_id = pg_temp.uid('tom.berger')) = 0, '12 the author is not';
end $$;
select pg_temp.as_user('anna.weber');
do $$
declare v record;
begin
  select * into v from public.inbox_list('mine', null, false, 'direct') where conversation_id = (select id from chat);
  assert v.conversation_id is not null and v.kind = 'group' and v.unread_count = 1, '13 in Anna''s chats, one unread';
  assert v.title like '%Sara%' and v.title like '%Tom%' and v.title not like '%Anna%', '14 the label names the others';
end $$;
reset role;

-- 4. Anna adds Ben: he reads the whole history, nothing counts as unread, the chat is in his Inbox.
select pg_temp.as_user('anna.weber');
select public.conversation_add_people((select id from chat), array[pg_temp.uid('ben.keller')]);
reset role;
select pg_temp.as_user('ben.keller');
do $$
declare v record;
begin
  assert (select count(*) from public.messages where conversation_id = (select id from chat)) = 1, '15 Ben reads the history';
  select * into v from public.inbox_list('mine') where conversation_id = (select id from chat);
  assert v.conversation_id is not null and v.unread_count = 0, '16 in Ben''s Inbox, nothing unread';
  assert (select count(*) from public.conversation_people((select id from chat))) = 4, '17 four people in it';
end $$;

-- 5. Only the author deletes: not Ben, not Tom's manager rights on somebody else's message.
do $$
begin
  assert pg_temp.blocked(format($q$select public.message_delete(%L)$q$, (select message_id from chat))), '18 Ben cannot delete Tom''s message';
end $$;
reset role;
select pg_temp.as_user('sara.novak');
insert into public.messages (conversation_id, body) values ((select id from chat), 'Ich kann');
reset role;
select pg_temp.as_user('tom.berger');
do $$
begin
  assert public.rls_has('messages.delete'), '19 Tom holds messages.delete (Manager)';
  assert pg_temp.blocked(format($q$select public.message_delete(%L)$q$,
    (select id from public.messages where conversation_id = (select id from chat) and body = 'Ich kann'))), '20 the literal does not apply in a group chat';
  perform public.message_delete((select message_id from chat));
  assert (select deleted_at is not null from public.messages where id = (select message_id from chat)), '21 Tom deletes his own';
end $$;
reset role;

-- 6. A name replaces the list of people; Sara leaves and reads nothing more.
select pg_temp.as_user('anna.weber');
select public.conversation_rename((select id from chat), 'Samstagsschicht');
do $$
begin
  assert (select title from public.inbox_list('mine') where conversation_id = (select id from chat)) = 'Samstagsschicht', '22 the name is the label';
end $$;
reset role;
select pg_temp.as_user('sara.novak');
select public.conversation_leave((select id from chat));
do $$
begin
  assert (select count(*) from public.messages where conversation_id = (select id from chat)) = 0, '23 Sara reads nothing after leaving';
  assert (select count(*) from public.notifications where dedupe_key = 'direct:' || (select id from chat)) = 0, '24 her bell lines of the chat are gone';
  assert pg_temp.blocked(format($q$select public.conversation_add_people(%L, array[%L::uuid])$q$, (select id from chat), pg_temp.uid('sara.novak'))), '25 she cannot come back by herself';
end $$;
reset role;
do $$
begin
  assert (select count(*) from public.notifications where dedupe_key = 'direct:' || (select id from chat) and user_id = pg_temp.uid('anna.weber')) = 1, '26 Anna keeps hers';
end $$;

-- 7. "The chat of exactly these people" follows who is in it now: Tom, Anna, Ben is the old chat; Tom, Anna, Sara
-- (Sara left) is a new one.
select pg_temp.as_user('tom.berger');
do $$
declare v_new uuid;
begin
  assert public.conversation_get_or_create_group(array[pg_temp.uid('anna.weber'), pg_temp.uid('ben.keller')]) = (select id from chat), '28 the people now in it find the old chat';
  v_new := public.conversation_get_or_create_group(array[pg_temp.uid('anna.weber'), pg_temp.uid('sara.novak')]);
  assert v_new is distinct from (select id from chat), '29 the old set (Sara left) is a new chat';
  assert (select count(*) from public.conversation_people(v_new)) = 3, '30 with exactly the three';
end $$;

-- 8. Adding counts only who is new: duplicates and people already in it neither fail nor count.
select public.conversation_add_people((select id from chat), array[pg_temp.uid('anna.weber'), pg_temp.uid('paul.meier'), pg_temp.uid('paul.meier')]);
do $$
begin
  assert (select count(*) from public.conversation_people((select id from chat))) = 4, '31 Paul once, Anna not twice';
end $$;
reset role;

-- 9. Searching my chats by label: by name and by the people in it, accents folded; nothing for who left.
select pg_temp.as_user('anna.weber');
do $$
begin
  assert (select count(*) from public.chats_search('samstag') where conversation_id = (select id from chat)) = 1, '32 found by its name';
  assert (select count(*) from public.chats_search('SAMSTAGS schicht') where conversation_id = (select id from chat)) = 1, '33 every word, any case';
  assert (select count(*) from public.chats_search('zzz-nothing')) = 0, '34 nothing for a term that matches nothing';
  assert (select count(*) from public.chats_search('')) = 0, '35 nothing for an empty term';
end $$;
reset role;
select pg_temp.as_user('sara.novak');
do $$
begin
  assert (select count(*) from public.chats_search('samstag') where conversation_id = (select id from chat)) = 0, '36 not for Sara, who left';
end $$;
reset role;

-- 10. Nobody makes a group chat around the RPC.
select pg_temp.as_user('tom.berger');
do $$
begin
  assert pg_temp.blocked($q$insert into public.conversations (kind) values ('group')$q$), '27 no direct insert';
end $$;
reset role;

select 'group_chats_smoke: all checks passed' as result;
rollback;
