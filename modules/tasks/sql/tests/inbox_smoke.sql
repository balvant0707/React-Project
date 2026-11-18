-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/inbox_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Inbox smoke test (migration 20261120120000_inbox.sql, with 20261120100000_messaging.sql and
-- 20261120110000_group_messages.sql): who takes part, unread counts, levels, read markers, new posts of followed
-- teams, the group view, paging, the badge. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/inbox_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
-- Back to the database owner without a signed-in user (the task guard lets the owner change the assignee).
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
-- Task #1 (team Werkstatt, assigned to Anna, created by Tom) and ticket #2 (reported by Ben, nobody assigned).
create function pg_temp.task1() returns uuid language sql as $$ select id from public.tasks where task_number = 1 $$;
create function pg_temp.ticket2() returns uuid language sql as $$ select id from public.tickets where ticket_number = 2 $$;
create function pg_temp.conv(p_anchor uuid) returns uuid language sql as $$
  select id from public.conversations where kind = 'record' and anchor_id = p_anchor
$$;
create function pg_temp.unread(p_conversation uuid) returns integer language sql as $$
  select unread_count from public.inbox_list(p_limit => 100) where conversation_id = p_conversation
$$;
-- Everything in one transaction has the same now(): "time passes" moves every timestamp of this test one minute back,
-- so the next message is newer than every read marker before it.
create function pg_temp.tick() returns void language plpgsql security definer as $$
begin
  perform set_config('messaging.rpc', '1', true);
  update public.messages set created_at = created_at - interval '1 minute' where created_at > now() - interval '1 hour';
  perform set_config('messaging.rpc', '', true);
  update public.conversations set created_at = created_at - interval '1 minute' where created_at > now() - interval '1 hour';
  update public.conversations set last_message_at = last_message_at - interval '1 minute' where last_message_at > now() - interval '1 hour';
  update public.conversation_participants set last_read_at = last_read_at - interval '1 minute' where last_read_at > now() - interval '1 hour';
  update public.team_reads set last_read_at = last_read_at - interval '1 minute' where last_read_at > now() - interval '1 hour';
end $$;
grant execute on all functions in schema pg_temp to public;

-- Start from a clean slate: nothing unread for the people of this test.
update public.conversation_participants set last_read_at = now()
where user_id in (select id from public.users where email in ('anna.weber@example.com', 'tom.berger@example.com', 'sara.novak@example.com', 'ben.keller@example.com'));
insert into public.team_reads (user_id, team_id)
select u.id, g.id from public.users u cross join public.teams g
where u.email in ('anna.weber@example.com', 'tom.berger@example.com', 'sara.novak@example.com', 'ben.keller@example.com')
on conflict (user_id, team_id) do update set last_read_at = now();

-- 1. The first message creates the conversation; the creator and the assignee take part from the start
select pg_temp.as_user('tom.berger@example.com');
do $$ begin perform public.conversation_get_or_create('tasks', pg_temp.task1()); end $$;
select pg_temp.tick();
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.task1()), 'Please check the oil level first.');
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_badge integer;
begin
  assert pg_temp.unread(pg_temp.conv(pg_temp.task1())) = 1, 'anna (assignee) has one unread message';
  assert (select title from public.inbox_list() where conversation_id = pg_temp.conv(pg_temp.task1())) like '#1 %', 'the title is the record name';
  assert (select link from public.inbox_list() where conversation_id = pg_temp.conv(pg_temp.task1())) = '/tasks/' || pg_temp.task1(), 'the link opens the task';
  assert (select last_excerpt from public.inbox_list() where conversation_id = pg_temp.conv(pg_temp.task1())) = 'Please check the oil level first.', 'the last message is shown';
  v_badge := public.inbox_unread_count();
  assert v_badge >= 1, 'the badge counts it';
  perform public.conversation_mark_read(pg_temp.conv(pg_temp.task1()));
  assert pg_temp.unread(pg_temp.conv(pg_temp.task1())) = 0, 'read after looking';
  assert public.inbox_unread_count() = v_badge - 1, 'the badge went down by one';
end $$;

-- 2. Reading alone is not taking part: Sara (Werkstatt) looks at the task, it does not enter her Inbox
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  assert public.conversation_can(pg_temp.conv(pg_temp.task1()), 'view'), 'sara may read the task conversation';
  perform public.conversation_mark_read(pg_temp.conv(pg_temp.task1()));
  assert not exists (select 1 from public.inbox_list(p_limit => 100) where conversation_id = pg_temp.conv(pg_temp.task1())), 'sara does not take part';
  assert (select taking_part = false from public.conversation_participants where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = auth.uid()), 'only a read marker';
  -- The group view lists the conversations of the team for every member who may read them.
  assert exists (select 1 from public.inbox_list('group', (select id from public.teams where name = 'Werkstatt')) where conversation_id = pg_temp.conv(pg_temp.task1())), 'the team view lists the task';
  assert (select unread_count from public.inbox_list('group', (select id from public.teams where name = 'Werkstatt')) where conversation_id = pg_temp.conv(pg_temp.task1())) = 0, 'with her marker: read';
  -- Following on purpose: she takes part.
  update public.conversation_participants set taking_part = true where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = auth.uid();
  assert exists (select 1 from public.inbox_list(p_limit => 100) where conversation_id = pg_temp.conv(pg_temp.task1())), 'after following it is in her Inbox';
end $$;

-- 3. Levels: mentions counts only a mention, mute nothing
select pg_temp.as_user('anna.weber@example.com');
update public.conversation_participants set level = 'mentions' where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = pg_temp.uid('anna.weber@example.com');
select pg_temp.as_user('tom.berger@example.com');
select pg_temp.tick();
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.task1()), 'Second note without a mention.');
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert pg_temp.unread(pg_temp.conv(pg_temp.task1())) = 0, 'at level mentions a plain message does not count';
end $$;
select pg_temp.as_user('tom.berger@example.com');
select pg_temp.tick();
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.task1()), 'Over to you @[user:' || pg_temp.uid('anna.weber@example.com') || ']');
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert pg_temp.unread(pg_temp.conv(pg_temp.task1())) = 1, 'the mention counts';
  assert (select mentioned from public.inbox_list(p_limit => 100) where conversation_id = pg_temp.conv(pg_temp.task1())), 'and is marked';
  assert (select last_excerpt from public.inbox_list(p_limit => 100) where conversation_id = pg_temp.conv(pg_temp.task1())) = 'Over to you @Anna Weber', 'a mention shows as the name';
  update public.conversation_participants set level = 'mute' where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = auth.uid();
  assert pg_temp.unread(pg_temp.conv(pg_temp.task1())) = 0, 'muted: nothing counts';
  assert not exists (select 1 from public.inbox_list(p_unread_only => true, p_limit => 100) where conversation_id = pg_temp.conv(pg_temp.task1())), 'unread only hides it';
  update public.conversation_participants set level = 'all' where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = auth.uid();
  assert pg_temp.unread(pg_temp.conv(pg_temp.task1())) = 2, 'back at level all both unread messages count';
end $$;

-- 4. A new assignee takes part from then on (also on tickets)
select pg_temp.as_user('ben.keller@example.com');
do $$ begin perform public.conversation_get_or_create('tickets', pg_temp.ticket2()); end $$;
select pg_temp.tick();
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.ticket2()), 'Still leaking.');
select pg_temp.as_owner();
update public.tickets set assigned_user_id = pg_temp.uid('sara.novak@example.com') where id = pg_temp.ticket2();
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  assert pg_temp.unread(pg_temp.conv(pg_temp.ticket2())) = 1, 'the new assignee of the ticket sees it unread';
end $$;
select pg_temp.as_owner();
update public.tasks set assigned_user_id = pg_temp.uid('paul.meier@example.com') where id = pg_temp.task1();
do $$ begin
  assert (select taking_part from public.conversation_participants where conversation_id = pg_temp.conv(pg_temp.task1()) and user_id = pg_temp.uid('paul.meier@example.com')), 'the new assignee of the task takes part';
end $$;

-- 5. Somebody without access sees nothing, even with a row (Jonas, IT, cannot read the maintenance ticket)
select pg_temp.as_user('jonas.richter@example.com');
do $$ begin
  assert not public.conversation_can(pg_temp.conv(pg_temp.ticket2()), 'view'), 'jonas cannot read the ticket';
  perform set_config('inbox.test.badge', public.inbox_unread_count()::text, true);
end $$;
select pg_temp.as_owner();
insert into public.conversation_participants (conversation_id, user_id) values (pg_temp.conv(pg_temp.ticket2()), pg_temp.uid('jonas.richter@example.com'));
select pg_temp.as_user('jonas.richter@example.com');
do $$ begin
  assert not exists (select 1 from public.inbox_list(p_limit => 100) where conversation_id = pg_temp.conv(pg_temp.ticket2())), 'no row without access';
  assert public.inbox_unread_count() = current_setting('inbox.test.badge')::integer, 'and no count';
end $$;
select pg_temp.as_owner();

-- 6. New posts of a group I follow at level all: Sara posts in Werkstatt, Anna (member) gets it under "For me"
select pg_temp.as_user('sara.novak@example.com');
select pg_temp.tick();
do $$ begin
  perform set_config('inbox.test.post', (select conversation_id from public.team_post_create((select id from public.teams where name = 'Werkstatt'), 'Tools', '<p>New <b>drill</b> in the cabinet</p>'))::text, true);
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_badge integer;
begin
  assert (select unread_count = 1 and not taking_part and kind = 'post' and team_name = 'Werkstatt' and title = 'Tools'
          from public.inbox_list(p_limit => 100) where conversation_id = current_setting('inbox.test.post')::uuid), 'the new post is under For me';
  assert (select last_excerpt from public.inbox_list(p_limit => 100) where conversation_id = current_setting('inbox.test.post')::uuid) = 'New drill in the cabinet', 'HTML is stripped';
  assert exists (select 1 from public.inbox_list(p_kind => 'posts', p_limit => 100) where conversation_id = current_setting('inbox.test.post')::uuid), 'kind filter posts';
  assert not exists (select 1 from public.inbox_list(p_kind => 'records', p_limit => 100) where conversation_id = current_setting('inbox.test.post')::uuid), 'kind filter records';
  v_badge := public.inbox_unread_count();
  -- Opening the post marks it read; she did not take part, so it leaves the list.
  perform public.conversation_mark_read(current_setting('inbox.test.post')::uuid);
  assert not exists (select 1 from public.inbox_list(p_limit => 100) where conversation_id = current_setting('inbox.test.post')::uuid), 'read and not taking part: gone';
  assert public.inbox_unread_count() = v_badge - 1, 'the badge went down';
  -- Muting the group: its next post does not reach her Inbox.
  insert into public.team_follows (team_id, level) values ((select id from public.teams where name = 'Werkstatt'), 'mute');
end $$;
select pg_temp.as_user('sara.novak@example.com');
select pg_temp.tick();
do $$ begin
  perform set_config('inbox.test.post2', (select conversation_id from public.team_post_create((select id from public.teams where name = 'Werkstatt'), null, '<p>Second</p>'))::text, true);
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert not exists (select 1 from public.inbox_list(p_limit => 100) where conversation_id = current_setting('inbox.test.post2')::uuid), 'a muted group stays out';
end $$;
-- Ben (not a member, not following) never sees the Werkstatt posts.
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert not exists (select 1 from public.inbox_list(p_limit => 100) where conversation_id = current_setting('inbox.test.post')::uuid), 'not for outsiders';
end $$;

-- 7. Paging: two pages of one row each are different and in order
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_first record; v_second record;
begin
  select * into v_first from public.inbox_list(p_limit => 1);
  select * into v_second from public.inbox_list(p_before_at => v_first.sort_at, p_before_id => v_first.conversation_id, p_limit => 1);
  assert v_second.conversation_id is not null and v_second.conversation_id <> v_first.conversation_id, 'the second page starts after the first';
  assert v_second.sort_at <= v_first.sort_at, 'newest first';
end $$;

-- 8. Mark all read
do $$ begin
  perform public.inbox_mark_all_read();
  assert public.inbox_unread_count() = 0, 'nothing unread after "mark all read"';
end $$;

-- 9. Not callable without a user, internal helpers closed
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin perform public.inbox_new_posts(auth.uid()); raise exception 'inbox_new_posts is callable';
  exception when insufficient_privilege then null; end;
  begin perform public.message_excerpt('x', 1); raise exception 'message_excerpt is callable';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_owner();

select 'inbox smoke test passed' as result;
rollback;
