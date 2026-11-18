-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/post_last_comments_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- The newest comment per post (migration 20261224110000_post_last_comments.sql): a reader of the post gets its newest
-- comment (not the post text itself, not a deleted comment); somebody who may not read the post gets nothing. Run on the
-- local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/post_last_comments_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create temp table t (post uuid, reader uuid, outsider uuid, comment_id uuid);
grant all on t to public;
grant execute on all functions in schema pg_temp to public;

-- A post of a members-only group, one of its members and somebody with a login who may not read it.
insert into t (post, reader, outsider)
select c.id, ug.user_id,
  (select u.id from public.users u where u.has_login and not u.has_left and u.locked_at is null
     and not public.conversation_access(u.id, c.id, 'view') limit 1)
from public.conversations c
join public.teams g on g.id = c.anchor_id and g.audience = 'members'
join public.user_teams ug on ug.team_id = g.id
join public.users u on u.id = ug.user_id and u.has_login
where c.kind = 'post' and c.deleted_at is null and public.conversation_access(ug.user_id, c.id, 'comment')
limit 1;

select pg_temp.as_user((select reader from t));
insert into public.messages (conversation_id, body) values ((select post from t), 'Erster Kommentar');
insert into public.messages (conversation_id, body, created_at) values ((select post from t), 'Neuester Kommentar', now() + interval '1 second');
reset role;
update t set comment_id = (select id from public.messages where conversation_id = t.post and body = 'Neuester Kommentar');

select pg_temp.as_user((select reader from t));
do $$
declare v record;
begin
  assert (select post from t) is not null and (select outsider from t) is not null, '0 seed has a members-only post and an outsider';
  select * into v from public.team_post_last_comments(array[(select post from t)]);
  assert v.message_id = (select comment_id from t) and v.excerpt = 'Neuester Kommentar', '1 the newest comment';
end $$;
reset role;

-- A deleted newest comment gives way to the one before.
-- (as message_delete does it; in a post only holders of messages.delete delete)
select set_config('messaging.rpc', '1', true);
update public.messages set deleted_at = now(), body = '' where id = (select comment_id from t);
select set_config('messaging.rpc', '', true);
select pg_temp.as_user((select reader from t));
do $$
begin
  assert (select excerpt from public.team_post_last_comments(array[(select post from t)])) = 'Erster Kommentar', '2 a deleted comment is skipped';
end $$;
reset role;

select pg_temp.as_user((select outsider from t));
do $$
begin
  assert (select count(*) from public.team_post_last_comments(array[(select post from t)])) = 0, '3 nothing for somebody who may not read the post';
end $$;
reset role;

select 'post_last_comments_smoke: all checks passed' as result;
rollback;
