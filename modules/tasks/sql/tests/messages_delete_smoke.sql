-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/messages_delete_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Deleting messages and posts (migration 20261205100000_messages_delete.sql): only holders of messages.delete delete,
-- not the author; deleting drops the reactions and takes the text out of the bell: lines about that message alone go
-- while unread and lose their excerpt once read, bundled lines only while they show it. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/messages_delete_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.task1() returns uuid language sql as $$ select id from public.tasks where task_number = 1 $$;
create function pg_temp.msg(p_body text) returns uuid language sql as $$ select id from public.messages where body like p_body || '%' $$;
create function pg_temp.comment_line() returns public.notifications language sql as $$
  select * from public.notifications where user_id = pg_temp.uid('anna.weber@example.com') and dedupe_key = 'comment:' || pg_temp.task1() and read_at is null
$$;
grant execute on all functions in schema pg_temp to public;

-- Task #1: assignee Anna (gets the comment line), Tom writes two comments, the second mentions Sara; Anna reacts to it.
delete from public.notifications where user_id in (pg_temp.uid('anna.weber@example.com'), pg_temp.uid('tom.berger@example.com'), pg_temp.uid('sara.novak@example.com'));
select pg_temp.as_user('tom.berger@example.com');
do $$ begin perform public.conversation_get_or_create('tasks', pg_temp.task1()); end $$;
insert into public.messages (conversation_id, body)
select id, 'Delete test one' from public.conversations where kind = 'record' and anchor_id = pg_temp.task1();
insert into public.messages (conversation_id, body)
select id, 'Delete test two @[user:' || pg_temp.uid('sara.novak@example.com') || ']' from public.conversations where kind = 'record' and anchor_id = pg_temp.task1();
reset role;
select pg_temp.as_user('anna.weber@example.com');
insert into public.message_reactions (message_id, reaction) values (pg_temp.msg('Delete test two'), 'check');
reset role;
-- Sara has read her mention already.
update public.notifications set read_at = now() where user_id = pg_temp.uid('sara.novak@example.com') and dedupe_key = 'mention:' || pg_temp.msg('Delete test two');

-- 1. Neither the author without the literal nor anybody else without it deletes.
do $$ begin
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Manager' and rp.permission = 'messages.delete'), 'Manager holds messages.delete';
  assert not exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Workshop' and rp.permission = 'messages.delete'), 'Workshop does not';
end $$;
select pg_temp.as_user('anna.weber@example.com');
insert into public.messages (conversation_id, body)
select id, 'Delete test by Anna' from public.conversations where kind = 'record' and anchor_id = pg_temp.task1();
do $$ begin
  begin perform public.message_delete(pg_temp.msg('Delete test by Anna')); raise exception 'FAIL 1: anna deleted her own message';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  begin perform public.message_delete(pg_temp.msg('Delete test one')); raise exception 'FAIL 1: anna deleted a message of tom';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
  raise notice 'ok 1: without messages.delete nobody deletes, not the author';
end $$;
reset role;

-- 2. The comment line bundles Tom's two comments and shows the second (Anna's own did not ring for her): deleting the
--    first leaves it alone.
select pg_temp.as_user('max.wilckens@wilckens.com');
select public.message_delete(pg_temp.msg('Delete test one'));
reset role;
do $$
declare v public.notifications := pg_temp.comment_line();
begin
  assert v.occurrences = 2 and v.body like 'Delete test two%', format('FAIL 2: the bundled line changed: %s / %s', v.occurrences, v.body);
  raise notice 'ok 2: a bundled line that shows another message stays';
end $$;

-- 3. Deleting the second: the reaction goes from the message and from Tom's bell, Sara's read mention loses its
--    excerpt, the comment line counts one less and loses its excerpt.
select pg_temp.as_user('max.wilckens@wilckens.com');
select public.message_delete(pg_temp.msg('Delete test two'));
reset role;
do $$
declare v public.notifications := pg_temp.comment_line();
begin
  assert (select reactions = '{}'::jsonb from public.messages m where m.deleted_at is not null and exists (
    select 1 from public.conversations c where c.id = m.conversation_id and c.anchor_id = pg_temp.task1()) order by m.created_at desc limit 1),
    'FAIL 3: the deleted message keeps its reactions';
  assert not exists (select 1 from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'reaction'),
    'FAIL 3: the reaction line stayed';
  assert (select body is null from public.notifications where user_id = pg_temp.uid('sara.novak@example.com') and type = 'mention' and read_at is not null),
    'FAIL 3: the read mention kept the excerpt';
  assert v.occurrences = 1 and v.body is null, format('FAIL 3: comment line %s / %s', v.occurrences, v.body);
  raise notice 'ok 3: reactions and reaction line gone, read line without excerpt, bundled line one less';
end $$;

-- 4. A line about one message alone goes while unread: Tom's next comment, deleted at once.
delete from public.notifications where user_id = pg_temp.uid('anna.weber@example.com');
select pg_temp.as_user('tom.berger@example.com');
insert into public.messages (conversation_id, body)
select id, 'Delete test three' from public.conversations where kind = 'record' and anchor_id = pg_temp.task1();
select public.message_delete(pg_temp.msg('Delete test three'));
reset role;
do $$ begin
  assert (pg_temp.comment_line()).id is null, 'FAIL 4: the unread line of a deleted comment stayed';
  raise notice 'ok 4: an unread line about the deleted message alone goes';
end $$;

-- 5. A deleted post takes its new-post line along; only with the literal, not as its author.
insert into public.teams (id, name, audience, posting) values ('00000000-0000-4000-8000-0000000000e9', 'Delete test group', 'everyone', 'everyone');
insert into public.user_teams (user_id, team_id) values (pg_temp.uid('sara.novak@example.com'), '00000000-0000-4000-8000-0000000000e9');
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_post uuid;
begin
  select conversation_id into v_post from public.team_post_create('00000000-0000-4000-8000-0000000000e9', 'Delete test post', '<p>Text</p>');
  perform set_config('test.post', v_post::text, true);
  begin perform public.team_post_delete(v_post); raise exception 'FAIL 5: anna deleted her own post';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = pg_temp.uid('sara.novak@example.com') and type = 'team_post' and link = '/messages/' || current_setting('test.post')),
    'setup: Sara got the new-post line';
end $$;
select pg_temp.as_user('tom.berger@example.com');
select public.team_post_delete(current_setting('test.post')::uuid);
reset role;
do $$ begin
  assert not exists (select 1 from public.notifications where user_id = pg_temp.uid('sara.novak@example.com') and type = 'team_post' and link = '/messages/' || current_setting('test.post')),
    'FAIL 5: the new-post line of a deleted post stayed';
  raise notice 'ok 5: only the literal deletes a post, its line goes along';
end $$;

rollback;
