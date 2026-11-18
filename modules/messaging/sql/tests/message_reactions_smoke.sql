-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/message_reactions_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Emoji reactions on messages (migration 20261204100000_message_reactions.sql): readers react once per reaction, take
-- it back, see the others' reactions; nobody adds or removes a reaction in someone else's name, reacts to a message they
-- cannot read or to a deleted one, or uses a reaction outside the set. The message carries its reactions, the author gets
-- one bundled bell line (not for their own reaction, not when muted; reading clears it), and readers of a conversation
-- see who read it (conversation_readers), outsiders do not. Nobody writes messages.reactions by hand. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/message_reactions_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.task1() returns uuid language sql as $$ select id from public.teams where name = 'Werkstatt' $$;
create function pg_temp.conv(p_anchor uuid) returns uuid language sql as $$
  select id from public.conversations where kind = 'record' and anchor_id = p_anchor
$$;
create function pg_temp.msg() returns uuid language sql as $$
  select id from public.messages where body = 'Reaction test message'
$$;
grant execute on all functions in schema pg_temp to public;

-- A message on the team Werkstatt by Tom.
select pg_temp.as_user('tom.berger@example.com');
do $$ begin perform public.conversation_get_or_create('teams', pg_temp.task1()); end $$;
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.task1()), 'Reaction test message');
reset role;

-- 1. Anna reads the conversation: she reacts twice with different reactions, the same one again is refused (primary key).
select pg_temp.as_user('anna.weber@example.com');
insert into public.message_reactions (message_id, reaction) values (pg_temp.msg(), 'thumbs_up'), (pg_temp.msg(), 'check');
do $$ begin
  insert into public.message_reactions (message_id, reaction) values (pg_temp.msg(), 'thumbs_up');
  raise exception 'FAIL 1: the same reaction twice';
exception when unique_violation then raise notice 'ok 1: one reaction of a kind per person';
end $$;

-- 2. Only reactions of the set.
do $$ begin
  insert into public.message_reactions (message_id, reaction) values (pg_temp.msg(), 'poop');
  raise exception 'FAIL 2: reaction outside the set';
exception when check_violation then raise notice 'ok 2: only the fixed set';
end $$;

-- 3. Not in someone else's name.
do $$ begin
  insert into public.message_reactions (message_id, user_id, reaction) values (pg_temp.msg(), pg_temp.uid('tom.berger@example.com'), 'heart');
  raise exception 'FAIL 3: reacted as somebody else';
exception when insufficient_privilege then raise notice 'ok 3: only one''s own reactions';
end $$;
reset role;

-- 4. Tom sees Anna's reactions, cannot take them back, but adds and removes his own.
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v_seen integer; v_gone integer;
begin
  select count(*) into v_seen from public.message_reactions where message_id = pg_temp.msg();
  if v_seen <> 2 then raise exception 'FAIL 4: Tom sees % reactions, expected 2', v_seen; end if;
  delete from public.message_reactions where message_id = pg_temp.msg() and user_id = pg_temp.uid('anna.weber@example.com');
  get diagnostics v_gone = row_count;
  if v_gone <> 0 then raise exception 'FAIL 4: Tom removed Anna''s reaction'; end if;
  insert into public.message_reactions (message_id, reaction) values (pg_temp.msg(), 'thanks');
  delete from public.message_reactions where message_id = pg_temp.msg() and reaction = 'thanks';
  get diagnostics v_gone = row_count;
  if v_gone <> 1 then raise exception 'FAIL 4: Tom could not take his reaction back'; end if;
  raise notice 'ok 4: reactions are visible, only one''s own can be taken back';
end $$;
reset role;

-- 5. Somebody who cannot read the conversation neither sees nor adds reactions.
do $$
declare v_reader text;
begin
  select email into v_reader from public.users u
  where u.email like '%@example.com' and u.has_login
    and not public.conversation_access(u.id, pg_temp.conv(pg_temp.task1()), 'view')
  order by email limit 1;
  if v_reader is null then raise notice 'skip 5: everybody in the seed may read the team Werkstatt'; return; end if;
  perform set_config('test.outsider', v_reader, true);
end $$;
do $$
declare v_outsider text := current_setting('test.outsider', true); v_seen integer;
begin
  if coalesce(v_outsider, '') = '' then return; end if;
  perform pg_temp.as_user(v_outsider);
  select count(*) into v_seen from public.message_reactions where message_id = pg_temp.msg();
  if v_seen <> 0 then raise exception 'FAIL 5: % sees reactions on a conversation they cannot read', v_outsider; end if;
  begin
    insert into public.message_reactions (message_id, reaction) values (pg_temp.msg(), 'heart');
    raise exception 'FAIL 5: % reacted to a message they cannot read', v_outsider;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  raise notice 'ok 5: % neither sees nor adds reactions', v_outsider;
end $$;
reset role;

-- 6. No reactions on a deleted message.
select pg_temp.as_user('tom.berger@example.com');
select public.message_delete(pg_temp.msg());
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  insert into public.message_reactions (message_id, reaction) values (pg_temp.msg(), 'heart');
  raise exception 'FAIL 6: reacted to a deleted message';
exception when insufficient_privilege then raise notice 'ok 6: no reactions on a deleted message';
end $$;
reset role;

-- 7. A fresh message by Tom: its reactions on the message, one bundled bell line for Tom, none for his own reaction.
delete from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'reaction';
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.task1()), 'Second reaction test');
insert into public.message_reactions (message_id, reaction)
  select id, 'heart' from public.messages where body = 'Second reaction test';
reset role;
select pg_temp.as_user('anna.weber@example.com');
insert into public.message_reactions (message_id, reaction)
  select id, r from public.messages, unnest(array['thumbs_up', 'check']) r where body = 'Second reaction test';
reset role;
do $$
declare v_reactions jsonb; v_lines integer; v_occ integer; v_emoji text;
begin
  select reactions into v_reactions from public.messages where body = 'Second reaction test';
  if v_reactions <> jsonb_build_object('heart', jsonb_build_array(pg_temp.uid('tom.berger@example.com')),
                                       'thumbs_up', jsonb_build_array(pg_temp.uid('anna.weber@example.com')),
                                       'check', jsonb_build_array(pg_temp.uid('anna.weber@example.com'))) then
    raise exception 'FAIL 7: reactions on the message %', v_reactions;
  end if;
  select count(*), max(occurrences), max(params->>'emoji') into v_lines, v_occ, v_emoji from public.notifications
  where user_id = pg_temp.uid('tom.berger@example.com') and type = 'reaction' and read_at is null;
  -- Anna's second reaction does not ring again while her line is unread.
  if v_lines <> 1 or v_occ <> 1 then raise exception 'FAIL 7: % lines with % occurrences, expected 1 with 1', v_lines, v_occ; end if;
  if v_emoji <> '👍' then raise exception 'FAIL 7: emoji % in the line', v_emoji; end if;
  raise notice 'ok 7: reactions on the message, one line, none for one''s own reaction, no second ring by the same person';
end $$;

-- 8. Taking a reaction back updates the message; toggling it on again does not ring again.
select pg_temp.as_user('anna.weber@example.com');
delete from public.message_reactions where reaction = 'check'
  and message_id = (select id from public.messages where body = 'Second reaction test');
reset role;
do $$ begin
  if (select reactions ? 'check' from public.messages where body = 'Second reaction test') then
    raise exception 'FAIL 8: the message still lists a reaction taken back';
  end if;
end $$;
select pg_temp.as_user('anna.weber@example.com');
insert into public.message_reactions (message_id, reaction)
  select id, 'check' from public.messages where body = 'Second reaction test';
reset role;
do $$ begin
  if (select max(occurrences) from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'reaction' and read_at is null) <> 1 then
    raise exception 'FAIL 8: toggling a reaction rang the bell again';
  end if;
  raise notice 'ok 8: the message follows a reaction taken back, toggling does not ring again';
end $$;

-- 9. Tom reads the conversation: the bell line is read; readers see each other's read marker.
select pg_temp.as_user('tom.berger@example.com');
select public.conversation_mark_read(pg_temp.conv(pg_temp.task1()));
reset role;
select pg_temp.as_user('anna.weber@example.com');
select public.conversation_mark_read(pg_temp.conv(pg_temp.task1()));
do $$ begin
  if not exists (select 1 from public.conversation_readers(pg_temp.conv(pg_temp.task1())) where user_id = pg_temp.uid('tom.berger@example.com')) then
    raise exception 'FAIL 9: Anna does not see that Tom read the conversation';
  end if;
  if exists (select 1 from public.conversation_readers(pg_temp.conv(pg_temp.task1())) where user_id = pg_temp.uid('anna.weber@example.com')) then
    raise exception 'FAIL 9: the reader list contains oneself';
  end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'reaction' and read_at is null) then
    raise exception 'FAIL 9: the reaction line stayed unread after reading the conversation';
  end if;
  raise notice 'ok 9: reading clears the line, readers see each other';
end $$;

-- 10. Muted: no line. An outsider sees no readers.
update public.conversation_participants set level = 'mute'
where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = pg_temp.uid('tom.berger@example.com');
select pg_temp.as_user('anna.weber@example.com');
insert into public.message_reactions (message_id, reaction)
  select id, 'thanks' from public.messages where body = 'Second reaction test';
reset role;
do $$
declare v_outsider text := current_setting('test.outsider', true); v_seen integer;
begin
  if exists (select 1 from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'reaction' and read_at is null) then
    raise exception 'FAIL 10: a muted author got a reaction line';
  end if;
  if coalesce(v_outsider, '') <> '' then
    perform pg_temp.as_user(v_outsider);
    select count(*) into v_seen from public.conversation_readers(pg_temp.conv(pg_temp.task1()));
    execute 'reset role';
    if v_seen <> 0 then raise exception 'FAIL 10: % sees % readers of a conversation they cannot read', v_outsider, v_seen; end if;
  end if;
  raise notice 'ok 10: muted means no line, outsiders see no readers';
end $$;

-- 11. Nobody writes messages.reactions by hand: not on a new message, not on one's own message later.
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body, reactions)
values (pg_temp.conv(pg_temp.task1()), 'Forged reactions', jsonb_build_object('check', jsonb_build_array(pg_temp.uid('anna.weber@example.com'))));
do $$
begin
  if (select reactions from public.messages where body = 'Forged reactions') <> '{}'::jsonb then
    raise exception 'FAIL 11: a new message kept reactions given by its author';
  end if;
  begin
    update public.messages set reactions = jsonb_build_object('check', jsonb_build_array(pg_temp.uid('anna.weber@example.com')))
    where body = 'Forged reactions';
    raise exception 'FAIL 11: the author changed the reactions of their message';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok 11: reactions are written only by the trigger';
end $$;
reset role;

rollback;
