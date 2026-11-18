-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/group_messages_smoke.sql with the renames and platform adaptations.
-- Posts in teams smoke test (migrations 20261120100000_messaging.sql, 20261120110000_group_messages.sql): rights by
-- audience, posting and owners, posts as conversations, comments, counters, notifications, unread, owner settings.
-- Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/group_messages_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.follow_level(p_email text, p_team uuid) returns text language sql security definer as $$ select public.team_follow_level(pg_temp.uid(p_email), p_team) $$;
create function pg_temp.post(p_group uuid, p_title text, p_body text) returns uuid language sql as $$
  select conversation_id from public.team_post_create(p_group, p_title, p_body)
$$;
grant execute on all functions in schema pg_temp to public;

-- Setup as the database owner: three teams. Everyone (everybody reads and posts, no members), Team (members only:
-- Anna and Sara; Paul and Ben outside), Notices (everybody reads, only the owner Ben posts, no members).
insert into public.teams (id, name, audience, posting, auto_follow) values
  ('00000000-0000-4000-8000-0000000000c1', 'Everyone', 'everyone', 'everyone', false),
  ('00000000-0000-4000-8000-0000000000c2', 'Team', 'members', 'everyone', false),
  ('00000000-0000-4000-8000-0000000000c3', 'Notices', 'everyone', 'owners', true);
insert into public.user_teams (user_id, team_id) values
  (pg_temp.uid('anna.weber@example.com'), '00000000-0000-4000-8000-0000000000c2'),
  (pg_temp.uid('sara.novak@example.com'), '00000000-0000-4000-8000-0000000000c2');
insert into public.team_owners values ('00000000-0000-4000-8000-0000000000c3', pg_temp.uid('ben.keller@example.com'));

-- 1. Who posts where
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v1 uuid; v2 uuid;
begin
  v1 := pg_temp.post('00000000-0000-4000-8000-0000000000c1', 'Hello', '<p>First post</p>');
  v2 := pg_temp.post('00000000-0000-4000-8000-0000000000c2', null, '<p>Team only</p>');
  update public.conversations set title = title where false;
  begin
    perform pg_temp.post('00000000-0000-4000-8000-0000000000c3', null, '<p>Not allowed</p>');
    raise exception 'anna posted in a group where only the owners post';
  exception when others then if sqlerrm like 'anna posted%' then raise; end if; end;
  begin
    insert into public.conversations (kind, anchor_type, anchor_id) values ('post', 'teams', '00000000-0000-4000-8000-0000000000c1');
    raise exception 'anna created a conversation by hand';
  exception when others then if sqlerrm like 'anna created%' then raise; end if; end;
  perform set_config('news.test.p1', v1::text, true);
  perform set_config('news.test.p2', v2::text, true);
end $$;
select pg_temp.as_user('ben.keller@example.com');
do $$
declare v3 uuid;
begin
  v3 := pg_temp.post('00000000-0000-4000-8000-0000000000c3', 'Safety notice', '<p>Wear gloves</p>');
  perform set_config('news.test.p3', v3::text, true);
  assert (select count(*) from public.team_posts_overview where team_id = '00000000-0000-4000-8000-0000000000c2') = 0, 'ben (not in the team) must not see the team posts';
  assert (select count(*) from public.team_message_rights() where team_id in ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')) = 2, 'ben may read the two teams open to everybody';
end $$;
reset role;

-- 2. Visibility (the post ids were kept in settings of this session)
do $$ begin
  assert (select count(*) from public.team_posts_overview) >= 3, 'the database owner reads everything';
end $$;
select pg_temp.as_user('paul.meier@example.com');
do $$ begin
  assert (select count(*) from public.team_posts_overview where team_id in ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')) = 2, 'paul sees the open post and the notice, not the team post';
  assert not public.conversation_can(current_setting('news.test.p2')::uuid, 'view'), 'paul cannot open the team post';
end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert (select count(*) from public.team_posts_overview where team_id in ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')) = 3, 'anna sees all three posts';
end $$;
reset role;

-- 3. Comments: counter, rights
select pg_temp.as_user('paul.meier@example.com');
do $$ begin
  insert into public.messages (id, conversation_id, body) values ('00000000-0000-4000-8000-0000000000d1', current_setting('news.test.p1')::uuid, 'Welcome!');
  begin
    insert into public.messages (conversation_id, body) values (current_setting('news.test.p2')::uuid, 'Sneaking in');
    raise exception 'paul commented on a team post';
  exception when others then if sqlerrm like 'paul commented%' then raise; end if; end;
end $$;
select pg_temp.as_user('ben.keller@example.com');
insert into public.messages (id, conversation_id, body) values ('00000000-0000-4000-8000-0000000000d2', current_setting('news.test.p1')::uuid, 'Hi Anna');
reset role;
do $$ begin
  assert (select comment_count from public.team_posts_overview where id = current_setting('news.test.p1')::uuid) = 2, 'two comments counted';
  assert (select last_comment_at from public.team_posts_overview where id = current_setting('news.test.p1')::uuid) is not null, 'last comment time set';
end $$;

-- 4. Editing the post: only the author, through the function
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_n integer;
begin
  perform public.team_post_edit(current_setting('news.test.p1')::uuid, 'Hello all', '<p>First post, edited</p>');
  assert (select title from public.team_posts_overview where id = current_setting('news.test.p1')::uuid) = 'Hello all', 'title changed';
  assert (select edited_at from public.team_posts_overview where id = current_setting('news.test.p1')::uuid) is not null, 'an edit is marked';
  begin perform public.team_post_pin(current_setting('news.test.p1')::uuid, true); raise exception 'anna pinned by rpc';
  exception when others then if sqlerrm like 'anna pinned%' then raise; end if; end;
  update public.conversations set pinned = true where id = current_setting('news.test.p1')::uuid;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'anna cannot change a conversation by update';
end $$;
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  begin perform public.team_post_edit(current_setting('news.test.p1')::uuid, 'Hijacked', '<p>x</p>'); raise exception 'ben edited the post of anna';
  exception when others then if sqlerrm like 'ben edited%' then raise; end if; end;
end $$;
reset role;
-- 4b. After 15 minutes the author cannot edit the post any more
select set_config('messaging.rpc', '1', true);
update public.messages set created_at = now() - interval '16 minutes'
where id = (select first_message_id from public.conversations where id = current_setting('news.test.p1')::uuid);
select set_config('messaging.rpc', '', true);
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin perform public.team_post_edit(current_setting('news.test.p1')::uuid, 'Late', '<p>late</p>'); raise exception 'anna edited her post after 15 minutes';
  exception when others then if sqlerrm like 'anna edited%' then raise; end if; end;
end $$;
reset role;

-- 5. Moderators: Tom (Manager) pins and removes a comment of somebody else; Anna may not
select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  perform public.team_post_pin(current_setting('news.test.p1')::uuid, true);
  assert (select pinned from public.team_posts_overview where id = current_setting('news.test.p1')::uuid), 'tom pinned';
  -- A moderator reads and moderates where they belong or the group is open to everybody, not every group: Tom is no member of Team.
  assert (select count(*) from public.team_message_rights() where team_id in ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c3')) = 2, 'a moderator reads the open teams';
  assert not exists (select 1 from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c2'), 'but not the members-only group they are not in';
  assert not public.team_message_can('00000000-0000-4000-8000-0000000000c2', 'moderate'), 'and does not moderate it';
  perform public.message_delete('00000000-0000-4000-8000-0000000000d1');
end $$;
reset role;
do $$ begin
  assert (select comment_count from public.team_posts_overview where id = current_setting('news.test.p1')::uuid) = 1, 'the counter went down';
  assert (select deleted_at is not null and body = '' from public.messages where id = '00000000-0000-4000-8000-0000000000d1'), 'tom blanked the comment';
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin perform public.message_delete('00000000-0000-4000-8000-0000000000d2'); raise exception 'anna deleted a comment of ben';
  exception when others then if sqlerrm like 'anna deleted%' then raise; end if; end;
  begin perform public.message_delete((select first_message_id from public.conversations where id = current_setting('news.test.p1')::uuid));
    raise exception 'the post text was deleted as a comment';
  exception when others then if sqlerrm like 'the post text%' then raise; end if; end;
end $$;
reset role;

-- 6. Files of the post: its author only (entity = the group, message = the first message)
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  begin
    insert into public.attachments (entity_type, entity_id, message_id, storage_path, file_name)
    select 'teams', '00000000-0000-4000-8000-0000000000c1', first_message_id, 'teams/00000000-0000-4000-8000-0000000000c1/x.png', 'x.png'
    from public.conversations where id = current_setting('news.test.p1')::uuid;
    raise exception 'ben added a picture to the post of anna';
  exception when others then if sqlerrm like 'ben added%' then raise; end if; end;
end $$;
select pg_temp.as_user('anna.weber@example.com');
insert into public.attachments (entity_type, entity_id, message_id, storage_path, file_name, mime_type)
select 'teams', '00000000-0000-4000-8000-0000000000c1', first_message_id, 'teams/00000000-0000-4000-8000-0000000000c1/y.png', 'y.png', 'image/png'
from public.conversations where id = current_setting('news.test.p1')::uuid;
reset role;

-- 7. Notifications: a post where only the owners post reaches everybody with a login but the author; a team post its
-- members; a post in a group without members nobody by default
do $$ begin
  assert exists (select 1 from public.notifications where type = 'team_post' and user_id = pg_temp.uid('anna.weber@example.com') and entity_id = current_setting('news.test.p3')::uuid), 'anna is told about the notice';
  assert not exists (select 1 from public.notifications where type = 'team_post' and entity_id = current_setting('news.test.p3')::uuid and user_id = pg_temp.uid('ben.keller@example.com')), 'the author is not notified';
  assert not exists (select 1 from public.notifications where type = 'team_post' and entity_id = current_setting('news.test.p1')::uuid), 'no notification for a post in an open group nobody follows';
  assert exists (select 1 from public.notifications where type = 'team_post' and user_id = pg_temp.uid('sara.novak@example.com') and entity_id = current_setting('news.test.p2')::uuid), 'a member hears about a team post';
  assert not exists (select 1 from public.notifications where type = 'team_post' and user_id = pg_temp.uid('paul.meier@example.com') and entity_id = current_setting('news.test.p2')::uuid), 'paul (outside) does not';
  assert exists (select 1 from public.notifications where type = 'team_comment' and user_id = pg_temp.uid('anna.weber@example.com') and entity_id = current_setting('news.test.p1')::uuid), 'the author of the post hears about a comment';
  assert not exists (select 1 from public.notifications where type = 'team_comment' and entity_id = current_setting('news.test.p1')::uuid and user_id = pg_temp.uid('ben.keller@example.com')), 'the commenter does not';
end $$;
select pg_temp.as_user('tom.berger@example.com');
insert into public.team_follows (team_id, level) values ('00000000-0000-4000-8000-0000000000c1', 'all');
select pg_temp.as_user('anna.weber@example.com');
do $$ begin perform set_config('news.test.p4', pg_temp.post('00000000-0000-4000-8000-0000000000c1', null, '<p>Second</p>')::text, true); end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where type = 'team_post' and user_id = pg_temp.uid('tom.berger@example.com') and entity_id = current_setting('news.test.p4')::uuid), 'tom follows the channel';
  assert not exists (select 1 from public.notifications where type = 'team_post' and user_id = pg_temp.uid('paul.meier@example.com') and entity_id = current_setting('news.test.p4')::uuid), 'paul does not follow it';
end $$;

-- 8. Unread
select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  assert (select unread from public.team_unread_counts() where team_id = '00000000-0000-4000-8000-0000000000c1') = 2, 'tom has two unread posts in Everyone (p1, p4)';
  perform public.team_mark_read('00000000-0000-4000-8000-0000000000c1');
  assert (select count(*) from public.team_unread_counts() where team_id = '00000000-0000-4000-8000-0000000000c1') = 0, 'nothing unread after reading';
end $$;
reset role;

-- 9. Delete: only a moderator removes a post (not its author), it disappears with its comments
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin perform public.team_post_delete(current_setting('news.test.p4')::uuid); raise exception 'anna deleted her own post';
  exception when others then if sqlerrm like 'anna deleted%' then raise; end if; end;
  begin perform public.team_post_delete(current_setting('news.test.p3')::uuid); raise exception 'anna deleted the notice';
  exception when others then if sqlerrm like 'anna deleted%' then raise; end if; end;
end $$;
select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  perform public.team_post_delete(current_setting('news.test.p4')::uuid);
  assert not exists (select 1 from public.team_posts_overview where id = current_setting('news.test.p4')::uuid), 'a deleted post is gone';
  assert not public.conversation_can(current_setting('news.test.p4')::uuid, 'view'), 'no access to a deleted post';
end $$;
reset role;
do $$ begin
  assert (select deleted_at is not null and deleted_by_user_id = pg_temp.uid('tom.berger@example.com') from public.conversations where id = current_setting('news.test.p4')::uuid), 'the row stays, marked as deleted';
end $$;

-- 9b. The page learns the caller's rights per group in one call
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select can_post from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c1'), 'ben posts in Everyone';
  assert (select can_post and can_moderate and is_owner and not is_member from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c3'), 'ben, owner, posts and moderates the notices without being a member';
  assert (select level is null from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c1'), 'ben does not follow Everyone (discover)';
  assert not exists (select 1 from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c2'), 'no row for a group he cannot read';
  begin perform public.team_message_access(pg_temp.uid('anna.weber@example.com'), '00000000-0000-4000-8000-0000000000c1', 'view'); raise exception 'ben asked for the rights of anna';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert not (select can_post from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c3'), 'anna cannot post where only the owners post';
  assert (select can_comment from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c3'), 'but comments';
  assert (select is_member and level = 'all' from public.team_message_rights() where team_id = '00000000-0000-4000-8000-0000000000c2'), 'a member follows the team at level all';
  -- Following is not joining: the follow row gives no membership.
  insert into public.team_follows (team_id, level) values ('00000000-0000-4000-8000-0000000000c1', 'mentions');
  assert not exists (select 1 from public.user_teams where team_id = '00000000-0000-4000-8000-0000000000c1'), 'following made nobody a member';
end $$;
-- 9c. Settings: only an owner (or a moderator) changes who posts and who reads; owners are set by an admin
do $$ begin
  begin perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'everyone', 'everyone', null, 'owners'); raise exception 'anna changed the settings of Notices';
  exception when others then if sqlerrm like 'anna changed%' then raise; end if; end;
  begin perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c2', 'owners', 'members', null, 'owners'); raise exception 'anna, a member, changed the settings of Team';
  exception when others then if sqlerrm like 'anna, a member%' then raise; end if; end;
  begin insert into public.team_owners values ('00000000-0000-4000-8000-0000000000c2', pg_temp.uid('anna.weber@example.com')); raise exception 'anna made herself an owner';
  exception when others then if sqlerrm like 'anna made%' then raise; end if; end;
end $$;
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'everyone', 'everyone', 'All notices', 'owners');
  assert (select posting = 'everyone' and description = 'All notices' from public.teams where id = '00000000-0000-4000-8000-0000000000c3'), 'the owner changed the settings';
  begin perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'nobody', 'everyone', null, 'owners'); raise exception 'an unknown setting was stored';
  exception when check_violation then null; end;
  perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'owners', 'everyone', null, 'owners');
  -- 'Follow automatically' is for administrators: a call that leaves it out (null) keeps it; an owner cannot switch it on.
  assert (select auto_follow from public.teams where id = '00000000-0000-4000-8000-0000000000c3'), 'auto follow stayed as it was (null keeps it)';
  -- Limiting the group to its members switches it off; an owner cannot switch it on again.
  perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'owners', 'members', null, 'owners');
  assert not (select auto_follow from public.teams where id = '00000000-0000-4000-8000-0000000000c3'), 'members only switched auto follow off';
  perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'owners', 'everyone', null, 'owners');
  begin perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'owners', 'everyone', null, 'owners', true); raise exception 'ben switched on auto follow';
  exception when others then if sqlerrm like 'ben switched%' then raise; end if; end;
  assert pg_temp.follow_level('paul.meier@example.com', '00000000-0000-4000-8000-0000000000c3') is null, 'without the switch, nobody follows Notices by default';
end $$;
reset role;
-- 9d. An administrator (Max) switches it on; everybody who reads the team then follows it, a members-only team never.
select pg_temp.as_user('max.wilckens@wilckens.com');
do $$ begin
  perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c3', 'owners', 'everyone', null, 'owners', true);
  assert (select auto_follow from public.teams where id = '00000000-0000-4000-8000-0000000000c3'), 'the administrator switched it on';
  assert pg_temp.follow_level('paul.meier@example.com', '00000000-0000-4000-8000-0000000000c3') = 'all', 'paul follows Notices';
  perform public.team_message_settings_save('00000000-0000-4000-8000-0000000000c2', 'everyone', 'members', null, 'owners', true);
  assert not (select auto_follow from public.teams where id = '00000000-0000-4000-8000-0000000000c2'), 'a members-only team cannot follow automatically';
end $$;
reset role;

-- 10. A role without messages.view sees nothing
delete from public.role_permissions where permission in ('messages.view', 'messages.check', 'messages.create') and role_id in (select id from public.roles where name = 'Shopfloor');
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select count(*) from public.team_message_rights() where team_id in ('00000000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c3')) = 1, 'without messages.view ben only reads the group he owns';
end $$;
reset role;

-- 11. A mention inside the HTML text of a post (the post editor writes the token into a paragraph) is a mention.
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_post uuid;
begin
  v_post := pg_temp.post('00000000-0000-4000-8000-0000000000c1', null,
    '<p>Hello <strong>@[user:' || pg_temp.uid('paul.meier@example.com') || ']</strong></p><p>[[task:00000000-0000-4000-8000-000000000000]]</p>');
  assert exists (select 1 from public.message_mentions mm join public.messages m on m.id = mm.message_id
                 where m.conversation_id = v_post and mm.mentioned_user_id = pg_temp.uid('paul.meier@example.com')), '11 the mention in the post text is recorded';
end $$;
reset role;

select 'group messages smoke test passed' as result;
rollback;
