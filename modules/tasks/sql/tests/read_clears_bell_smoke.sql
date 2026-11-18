-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/read_clears_bell_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Reading a conversation reads its bell entries (migration 20261203100000_read_clears_bell.sql): conversation_mark_read,
-- team_mark_read and inbox_mark_all_read mark the caller's message notifications as read, nobody else's and no other
-- types. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/read_clears_bell_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
-- Task #1 (team Werkstatt, assigned to Anna, created by Tom).
create function pg_temp.task1() returns uuid language sql as $$ select id from public.tasks where task_number = 1 $$;
create function pg_temp.conv(p_anchor uuid) returns uuid language sql as $$
  select id from public.conversations where kind = 'record' and anchor_id = p_anchor
$$;
create function pg_temp.werkstatt() returns uuid language sql as $$ select id from public.teams where name = 'Werkstatt' $$;
-- Unread bell entries of the signed-in user with this link (and type).
create function pg_temp.unread(p_link text, p_type text default null) returns integer language sql as $$
  select count(*)::integer from public.notifications
  where user_id = auth.uid() and read_at is null and link = p_link and (p_type is null or type = p_type)
$$;
grant execute on all functions in schema pg_temp to public;

-- A clean bell for the people in this test.
delete from public.notifications
where user_id in (select id from public.users where email in ('anna.weber@example.com', 'tom.berger@example.com', 'sara.novak@example.com'));

-- 1. A comment on the task tells Anna (assignee) and mentions Sara; a task notification on the same link stays.
select pg_temp.as_user('tom.berger@example.com');
do $$ begin perform public.conversation_get_or_create('tasks', pg_temp.task1()); end $$;
insert into public.messages (conversation_id, body)
values (pg_temp.conv(pg_temp.task1()), 'Please check the oil level first, @[user:' || pg_temp.uid('sara.novak@example.com') || ']');
reset role;
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'task_step_changed', 'Step changed', '/tasks/' || pg_temp.task1());

select pg_temp.as_user('anna.weber@example.com');
do $$
begin
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'comment') = 1, 'anna has the comment in the bell';
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'task_step_changed') = 1, 'and the step change';
  perform public.conversation_mark_read(pg_temp.conv(pg_temp.task1()));
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'comment') = 0, 'reading the conversation reads the comment entry';
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'task_step_changed') = 1, 'the step change stays unread';
end $$;

-- Somebody else's read leaves Sara's mention alone.
select pg_temp.as_user('sara.novak@example.com');
do $$
begin
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'mention') = 1, 'sara still has her mention';
  perform public.conversation_mark_read(pg_temp.conv(pg_temp.task1()));
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'mention') = 0, 'her own read clears it';
end $$;

-- 2. A post in Werkstatt: Anna (member, level all) gets team_post; opening the post reads it.
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  perform set_config('bell.test.post', (select conversation_id from public.team_post_create(pg_temp.werkstatt(), 'Tools', '<p>New drill</p>'))::text, true);
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_link text := '/messages/' || current_setting('bell.test.post');
begin
  assert pg_temp.unread(v_link, 'team_post') = 1, 'anna has the post in the bell';
  perform public.conversation_mark_read(current_setting('bell.test.post')::uuid);
  assert pg_temp.unread(v_link) = 0, 'opening the post reads the bell entry';
end $$;

-- 3. "Mark as read" on the group reads the post entries of that group.
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  perform set_config('bell.test.post2', (select conversation_id from public.team_post_create(pg_temp.werkstatt(), 'Shift', '<p>Shift change</p>'))::text, true);
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_link text := '/messages/' || current_setting('bell.test.post2');
begin
  assert pg_temp.unread(v_link, 'team_post') = 1, 'the second post is in the bell';
  perform public.team_mark_read(pg_temp.werkstatt());
  assert pg_temp.unread(v_link) = 0, 'marking the group read reads it';
end $$;

-- 4. "Mark all as read" in the Inbox reads every message entry, nothing else.
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body) values (pg_temp.conv(pg_temp.task1()), 'One more thing.');
select pg_temp.as_user('anna.weber@example.com');
do $$
begin
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'comment') = 1, 'a new comment';
  perform public.inbox_mark_all_read();
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'comment') = 0, 'mark all read reads it';
  assert pg_temp.unread('/tasks/' || pg_temp.task1(), 'task_step_changed') = 1, 'the step change still stays';
end $$;

rollback;
select 'read_clears_bell_smoke: all checks passed' as result;
