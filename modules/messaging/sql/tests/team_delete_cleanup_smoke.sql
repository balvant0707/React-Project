-- apps: compass
-- Deleting a team takes its posts, their messages, files and history rows with it (trigger cleanup_entity_feed on teams,
-- migration 20261113210000). Everything runs in one transaction and is rolled back.
begin;
do $$
declare t uuid; c uuid; u uuid;
begin
  select id into u from public.users limit 1;
  insert into public.teams (name, user_created) values ('zz delete cleanup probe', true) returning id into t;
  insert into public.conversations (kind, anchor_type, anchor_id, title, created_by_user_id) values ('post', 'teams', t, 'probe', u) returning id into c;
  insert into public.messages (conversation_id, author_user_id, body) values (c, u, 'hello');
  insert into public.team_follows (user_id, team_id, level) values (u, t, 'all');
  assert exists (select 1 from public.conversations where id = c), '1 the post exists';
  delete from public.teams where id = t;
  assert not exists (select 1 from public.conversations where id = c), '2 the post is gone with the team';
  assert not exists (select 1 from public.messages where conversation_id = c), '3 and its messages';
  assert not exists (select 1 from public.team_follows where team_id = t), '4 and the follows';
end $$;
select 'team_delete_cleanup_smoke ok' as result;
rollback;
