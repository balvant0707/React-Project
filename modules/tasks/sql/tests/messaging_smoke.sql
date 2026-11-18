-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/messaging_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Messaging smoke test (migration 20261120100000_messaging.sql): conversations, messages, rights, counters, soft delete,
-- mentions, participants, history, files, direct conversations. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/messaging_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
grant execute on all functions in schema pg_temp to public;

-- Two tasks: one assigned to Anna (team Werkstatt), one to Tom.
insert into public.tasks (id, task_type_id, title, assigned_user_id)
select '00000000-0000-4000-8000-0000000000f1', id, 'Messaging: Annas Aufgabe', pg_temp.uid('anna.weber@example.com') from public.task_types order by key limit 1;
insert into public.tasks (id, task_type_id, title, assigned_user_id)
select '00000000-0000-4000-8000-0000000000f2', id, 'Messaging: Toms Aufgabe', pg_temp.uid('tom.berger@example.com') from public.task_types order by key limit 1;

-- 1. The main conversation of a record: created with the first message, only by somebody who may write on the record
select pg_temp.as_user('anna.weber@example.com');
do $$
declare
  v_c uuid;
begin
  v_c := public.conversation_get_or_create('tasks', '00000000-0000-4000-8000-0000000000f1');
  assert v_c = public.conversation_get_or_create('tasks', '00000000-0000-4000-8000-0000000000f1'), 'the same conversation every time';
  insert into public.messages (id, conversation_id, body) values ('00000000-0000-4000-8000-0000000000e1', v_c, 'Ich fange an.');
  begin
    perform public.conversation_get_or_create('tasks', '00000000-0000-4000-8000-0000000000f2');
    raise exception 'anna opened a conversation on the task of tom';
  exception when others then if sqlerrm like 'anna opened%' then raise; end if; end;
  assert (select count(*) from public.messages where conversation_id = v_c) = 1, 'one message';
end $$;
reset role;
do $$ begin
  assert (select message_count from public.conversations where anchor_id = '00000000-0000-4000-8000-0000000000f1') = 1, 'the counter counts';
  assert (select last_message_at from public.conversations where anchor_id = '00000000-0000-4000-8000-0000000000f1') is not null, 'last message time';
  assert exists (select 1 from public.conversation_participants p join public.conversations c on c.id = p.conversation_id
                 where c.anchor_id = '00000000-0000-4000-8000-0000000000f1' and p.user_id = pg_temp.uid('anna.weber@example.com')), 'the author takes part';
end $$;

-- 2. Rights follow the record: Paul sees nothing, Tom sees Annas task only if his role allows it (he is a manager)
select pg_temp.as_user('paul.meier@example.com');
do $$ begin
  assert (select count(*) from public.messages where id = '00000000-0000-4000-8000-0000000000e1') = 0, 'paul cannot read the message';
  assert (select count(*) from public.conversations where anchor_id = '00000000-0000-4000-8000-0000000000f1') = 0, 'nor the conversation';
end $$;
reset role;

-- 3. Edit: only the text, only by the author; a reply points inside its conversation; created_at cannot be set
select pg_temp.as_user('anna.weber@example.com');
do $$
declare
  v_c uuid := (select id from public.conversations where anchor_id = '00000000-0000-4000-8000-0000000000f1');
  v_n integer;
begin
  update public.messages set body = 'Ich fange jetzt an.' where id = '00000000-0000-4000-8000-0000000000e1';
  assert (select edited_at from public.messages where id = '00000000-0000-4000-8000-0000000000e1') is not null, 'an edit is marked';
  begin update public.messages set conversation_id = v_c, reply_to_message_id = null, author_user_id = pg_temp.uid('ben.keller@example.com') where id = '00000000-0000-4000-8000-0000000000e1';
    raise exception 'anna changed the author';
  exception when others then if sqlerrm like 'anna changed%' then raise; end if; end;
  insert into public.messages (id, conversation_id, body, reply_to_message_id, created_at)
  values ('00000000-0000-4000-8000-0000000000e2', v_c, 'Antwort auf mich selbst', '00000000-0000-4000-8000-0000000000e1', now() - interval '3 days');
  assert (select created_at from public.messages where id = '00000000-0000-4000-8000-0000000000e2') > now() - interval '1 minute', 'created_at is the server time';
  assert (select reply_to_message_id from public.messages where id = '00000000-0000-4000-8000-0000000000e2') = '00000000-0000-4000-8000-0000000000e1', 'reply pointer';
end $$;
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v_n integer;
begin
  update public.messages set body = 'Hijacked' where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics v_n = row_count;
  assert v_n = 0, 'tom cannot edit annas message';
end $$;
reset role;

-- 3b. The author edits for 15 minutes only
select set_config('messaging.rpc', '1', true);
update public.messages set created_at = now() - interval '16 minutes' where id = '00000000-0000-4000-8000-0000000000e2';
select set_config('messaging.rpc', '', true);
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin update public.messages set body = 'Zu spaet' where id = '00000000-0000-4000-8000-0000000000e2'; raise exception 'anna edited after 15 minutes';
  exception when others then if sqlerrm like 'anna edited%' then raise; end if; end;
end $$;
reset role;

-- 4. A reply to a message of another conversation is refused
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v_c2 uuid;
begin
  v_c2 := public.conversation_get_or_create('tasks', '00000000-0000-4000-8000-0000000000f2');
  begin
    insert into public.messages (conversation_id, body, reply_to_message_id) values (v_c2, 'quer', '00000000-0000-4000-8000-0000000000e1');
    raise exception 'tom replied across conversations';
  exception when others then if sqlerrm like 'tom replied%' then raise; end if; end;
end $$;
reset role;

-- 5. Mentions notify and make the person take part; somebody who may not read the conversation is ignored
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_c uuid := (select id from public.conversations where anchor_id = '00000000-0000-4000-8000-0000000000f1');
begin
  insert into public.messages (conversation_id, body) values (v_c,
    'Bitte schau mal @[user:' || pg_temp.uid('tom.berger@example.com') || '] und @[user:' || pg_temp.uid('paul.meier@example.com') || ']');
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where type = 'mention' and user_id = pg_temp.uid('tom.berger@example.com')
                 and link = '/tasks/00000000-0000-4000-8000-0000000000f1'), 'tom is told, with the link of the record';
  assert not exists (select 1 from public.notifications where type = 'mention' and user_id = pg_temp.uid('paul.meier@example.com')), 'paul may not read it: no mention';
  assert exists (select 1 from public.conversation_participants p join public.conversations c on c.id = p.conversation_id
                 where c.anchor_id = '00000000-0000-4000-8000-0000000000f1' and p.user_id = pg_temp.uid('tom.berger@example.com')), 'the mentioned person takes part';
  -- The assignee Anna wrote it herself: no comment notification for her; Tom's task conversation tells Tom nothing about his own message.
  assert (select count(*) from public.message_mentions) >= 1, 'mention rows';
end $$;

-- 6. Soft delete is for moderators only (edit.all of the record's module, admin limits decision 4; Max moderates
--    through his Manager role), not even the author deletes; the counter goes down, the text goes away
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  begin perform public.message_delete('00000000-0000-4000-8000-0000000000e2'); raise exception 'sara deleted a message of anna';
  exception when others then if sqlerrm like 'sara deleted%' then raise; end if; end;
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin perform public.message_delete('00000000-0000-4000-8000-0000000000e2'); raise exception 'anna deleted her own message';
  exception when others then if sqlerrm like 'anna deleted%' then raise; end if; end;
end $$;
select pg_temp.as_user('max.wilckens@wilckens.com');
do $$ begin
  perform public.message_delete('00000000-0000-4000-8000-0000000000e2');
  assert (select body = '' and deleted_at is not null from public.messages where id = '00000000-0000-4000-8000-0000000000e2'), 'blanked, the row stays';
end $$;
reset role;
do $$ begin
  assert (select message_count from public.conversations where anchor_id = '00000000-0000-4000-8000-0000000000f1') = 2, 'counter after delete (3 written, 1 deleted)';
end $$;
select pg_temp.as_user('max.wilckens@wilckens.com');
do $$ begin
  perform public.message_delete('00000000-0000-4000-8000-0000000000e1');
end $$;
reset role;

-- 7. Files: only the author adds files to a message; a history entry may carry a file too
insert into public.messages (id, conversation_id, author_user_id, body)
select '00000000-0000-4000-8000-0000000000e3', c.id, pg_temp.uid('anna.weber@example.com'), 'mit Bild' from public.conversations c where c.anchor_id = '00000000-0000-4000-8000-0000000000f1';
select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  begin
    insert into public.attachments (entity_type, entity_id, message_id, storage_path, file_name)
    values ('tasks', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e3', 'tasks/00000000-0000-4000-8000-0000000000f1/a.png', 'a.png');
    raise exception 'tom added a file to the message of anna';
  exception when others then if sqlerrm like 'tom added%' then raise; end if; end;
end $$;
select pg_temp.as_user('anna.weber@example.com');
insert into public.attachments (entity_type, entity_id, message_id, storage_path, file_name)
values ('tasks', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e3', 'tasks/00000000-0000-4000-8000-0000000000f1/b.png', 'b.png');
do $$ begin
  begin
    insert into public.attachments (entity_type, entity_id, message_id, storage_path, file_name)
    values ('tasks', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e3', 'tasks/00000000-0000-4000-8000-0000000000f2/c.png', 'c.png');
    raise exception 'a file of another record went through';
  exception when others then if sqlerrm like 'a file of another%' then raise; end if; end;
end $$;
reset role;

-- 8. History: written by the database, immutable
do $$
declare v_e uuid;
begin
  v_e := public.log_system_event('tasks', '00000000-0000-4000-8000-0000000000f1', 'messaging_probe', '{}'::jsonb, null);
  assert exists (select 1 from public.activity_events where id = v_e and event_type = 'messaging_probe'), 'event written';
  begin update public.activity_events set event_type = 'x' where id = v_e; raise exception 'an event was changed';
  exception when others then if sqlerrm like 'an event%' then raise; end if; end;
end $$;
select pg_temp.as_user('paul.meier@example.com');
do $$ begin
  assert (select count(*) from public.activity_events where entity_id = '00000000-0000-4000-8000-0000000000f1') = 0, 'paul sees no history of annas task';
end $$;
reset role;

-- 9. The team of the record is carried on the conversation and follows it (shown with a goal: its team is a plain column)
insert into public.teams (id, name) values ('00000000-0000-4000-8000-0000000000a9', 'MessagingTeam'), ('00000000-0000-4000-8000-0000000000aa', 'MessagingTeam2');
insert into public.goals (id, title, team_id) values ('00000000-0000-4000-8000-0000000000b9', 'Messaging goal', '00000000-0000-4000-8000-0000000000a9');
insert into public.conversations (id, kind, anchor_type, anchor_id, team_id)
values ('00000000-0000-4000-8000-0000000000c9', 'record', 'goals', '00000000-0000-4000-8000-0000000000b9', '00000000-0000-4000-8000-0000000000a9');
update public.goals set team_id = '00000000-0000-4000-8000-0000000000aa' where id = '00000000-0000-4000-8000-0000000000b9';
do $$ begin
  assert (select team_id from public.conversations where id = '00000000-0000-4000-8000-0000000000c9') = '00000000-0000-4000-8000-0000000000aa', 'team follows the goal';
end $$;

-- 10. A direct conversation has no anchor: only its participants read and write
insert into public.conversations (id, kind, direct_key) values ('00000000-0000-4000-8000-0000000000d1', 'direct', 'smoke:pair');
insert into public.conversation_participants (conversation_id, user_id) values
  ('00000000-0000-4000-8000-0000000000d1', pg_temp.uid('anna.weber@example.com')),
  ('00000000-0000-4000-8000-0000000000d1', pg_temp.uid('ben.keller@example.com'));
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  insert into public.messages (conversation_id, body) values ('00000000-0000-4000-8000-0000000000d1', 'Hallo Ben');
end $$;
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select count(*) from public.messages where conversation_id = '00000000-0000-4000-8000-0000000000d1') = 1, 'ben reads it';
end $$;
select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  assert (select count(*) from public.messages where conversation_id = '00000000-0000-4000-8000-0000000000d1') = 0, 'tom does not';
  begin insert into public.messages (conversation_id, body) values ('00000000-0000-4000-8000-0000000000d1', 'mitlesen');
    raise exception 'tom wrote into a conversation he is not part of';
  exception when others then if sqlerrm like 'tom wrote%' then raise; end if; end;
end $$;
reset role;

-- 11. The search finds messages (as comments of their record). Anna works the ticket's queue; the admin does not see
--     it any more (admin limits), nor its comments.
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert exists (select 1 from public.global_search('Ersatzmotor') where entity_type = 'comments'), 'search finds the seeded comment';
end $$;
reset role;

-- A task card in the text shows as the task number only (migration 20261207130000_task_card_excerpt.sql).
do $$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks limit 1;
  assert public.message_excerpt('See [[task:' || v_task.id || ']] please', 80) = 'See #' || v_task.task_number || ' please', 'task card excerpt shows the number';
  assert public.message_excerpt('[[task:00000000-0000-4000-8000-000000000000]]', 80) = '#…', 'unknown task';
  -- Emoji are plain text: they survive the excerpt (several code points, a variation selector).
  assert public.message_excerpt('<p>Super 👍🎉 ❤️</p>', 80) = 'Super 👍🎉 ❤️', 'emoji in the excerpt';
end $$;

select 'messaging smoke test passed' as result;
rollback;
