-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/team_mentions_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Team mentions smoke test (migration 20261120130000_team_mentions.sql): only the conversation's own team, who may,
-- every member reached whatever their level, a mention row and a notification each. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/team_mentions_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.gid(p_name text) returns uuid language sql as $$ select id from public.teams where name = p_name $$;
create function pg_temp.task1() returns uuid language sql as $$ select id from public.tasks where task_number = 1 $$;
grant execute on all functions in schema pg_temp to public;

-- Werkstatt: Anna, Sara, Paul and Tom are members; Ben is not. Sara muted the group.
select pg_temp.as_user('sara.novak@example.com');
insert into public.team_follows (team_id, level) values (pg_temp.gid('Werkstatt'), 'mute');

-- 1. In a post: by default only owners and moderators may mention the team
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert not exists (select 1 from public.team_mention_target('teams', pg_temp.gid('Werkstatt'))), 'anna (member, not owner) is not offered the team';
  begin
    perform public.team_post_create(pg_temp.gid('Werkstatt'), null, '<p>Hello @[team:' || pg_temp.gid('Werkstatt') || ']</p>');
    raise exception 'anna mentioned the team';
  exception when others then if sqlerrm like 'anna mentioned%' then raise; end if; end;
end $$;
select pg_temp.as_owner();
update public.teams set team_mentions = 'members' where name = 'Werkstatt';
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert (select name from public.team_mention_target('teams', pg_temp.gid('Werkstatt'))) = 'Werkstatt', 'members may now';
  perform set_config('team.test.post', (select conversation_id from public.team_post_create(pg_temp.gid('Werkstatt'), 'Meeting', '<p>All of you @[team:' || pg_temp.gid('Werkstatt') || '], 10:00</p>'))::text, true);
  -- Another group cannot be mentioned here.
  begin
    insert into public.messages (conversation_id, body) values (current_setting('team.test.post')::uuid, 'And @[team:' || pg_temp.gid('Instandhaltung') || ']');
    raise exception 'another group was mentioned';
  exception when others then if sqlerrm like 'another group%' then raise; end if; end;
end $$;
select pg_temp.as_owner();
do $$ begin
  assert exists (select 1 from public.notifications where type = 'team_mention' and user_id = pg_temp.uid('sara.novak@example.com')
                 and link = '/messages/' || current_setting('team.test.post')), 'sara is reached although she muted the group';
  assert exists (select 1 from public.message_mentions mm join public.conversations c on c.first_message_id = mm.message_id
                 where c.id = current_setting('team.test.post')::uuid and mm.mentioned_user_id = pg_temp.uid('paul.meier@example.com')), 'paul has a mention row';
  assert not exists (select 1 from public.notifications where type = 'team_mention' and user_id = pg_temp.uid('anna.weber@example.com')
                 and link = '/messages/' || current_setting('team.test.post')), 'not the author';
  assert not exists (select 1 from public.notifications where type in ('team_mention', 'mention') and user_id = pg_temp.uid('ben.keller@example.com')
                 and link = '/messages/' || current_setting('team.test.post')), 'not ben (no member)';
  assert (select taking_part from public.conversation_participants where conversation_id = current_setting('team.test.post')::uuid and user_id = pg_temp.uid('sara.novak@example.com')), 'sara takes part now';
end $$;
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  assert (select mentioned and unread_count = 1 and last_excerpt = 'All of you @Werkstatt, 10:00'
          from public.inbox_list(p_limit => 100) where conversation_id = current_setting('team.test.post')::uuid), 'in her Inbox as a mention, with the team name';
end $$;

-- 2. On a record: everybody who may comment mentions the record's team, and only that one
select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  assert (select name from public.team_mention_target('tasks', pg_temp.task1())) = 'Werkstatt', 'the task team is offered';
  perform public.conversation_get_or_create('tasks', pg_temp.task1());
end $$;
insert into public.messages (conversation_id, body)
values ((select id from public.conversations where kind = 'record' and anchor_id = pg_temp.task1()), 'Who has time? @[team:' || pg_temp.gid('Werkstatt') || ']');
do $$ begin
  begin
    insert into public.messages (conversation_id, body)
    values ((select id from public.conversations where kind = 'record' and anchor_id = pg_temp.task1()), '@[team:' || pg_temp.gid('IT') || ']');
    raise exception 'tom mentioned IT on a Werkstatt task';
  exception when others then if sqlerrm like 'tom mentioned%' then raise; end if; end;
end $$;
select pg_temp.as_owner();
do $$ begin
  assert exists (select 1 from public.notifications where type = 'team_mention' and user_id = pg_temp.uid('paul.meier@example.com')
                 and entity_id = pg_temp.task1()), 'paul hears about the task';
end $$;

-- 3. Editing keeps an existing team mention without asking again and without notifying twice
select pg_temp.as_user('tom.berger@example.com');
update public.messages set body = body || ' Thanks!'
where conversation_id = (select id from public.conversations where kind = 'record' and anchor_id = pg_temp.task1()) and body like 'Who has time?%';
select pg_temp.as_owner();
do $$ begin
  assert (select count(*) from public.notifications where type = 'team_mention' and user_id = pg_temp.uid('paul.meier@example.com') and entity_id = pg_temp.task1()) = 1, 'one notification only';
end $$;

-- 4. Helpers are closed
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin perform public.team_mention_allowed(auth.uid(), 'tasks', pg_temp.task1()); raise exception 'team_mention_allowed is callable';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_owner();

select 'team mentions smoke test passed' as result;
rollback;
