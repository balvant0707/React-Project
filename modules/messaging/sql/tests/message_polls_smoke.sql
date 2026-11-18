-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/message_polls_smoke.sql with the renames and platform adaptations.
-- Polls in group posts (migration 20261206100000_message_polls.sql): a poll comes only with a new post and never
-- changes by hand; readers vote once (single choice) or for several options, change and take back their vote while the
-- poll runs; everybody sees only their own votes and the number of voters; the result goes to the author at once and
-- to the other readers once the author ended it (there is no end date), with names only in a public poll; only the
-- author ends it; poll_state brings poll, own votes and result together; options differ; deleting the post drops its
-- votes;
-- outsiders neither vote nor see a result. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/message_polls_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.poll(p_options text[], p_multiple boolean = false, p_public boolean = false) returns jsonb language sql as $$
  select jsonb_build_object('options', to_jsonb(p_options), 'multiple', p_multiple, 'public', p_public)
$$;
create function pg_temp.root(p_body text) returns uuid language sql as $$ select id from public.messages where body = p_body $$;
grant execute on all functions in schema pg_temp to public;

-- Setup: Everyone (everybody reads and posts), Team (members only: Anna and Sara; Paul outside).
insert into public.teams (id, name, audience, posting) values
  ('00000000-0000-4000-8000-0000000000d1', 'Poll everyone', 'everyone', 'everyone'),
  ('00000000-0000-4000-8000-0000000000d2', 'Poll team', 'members', 'everyone');
insert into public.user_teams (user_id, team_id) values
  (pg_temp.uid('anna.weber@example.com'), '00000000-0000-4000-8000-0000000000d2'),
  (pg_temp.uid('sara.novak@example.com'), '00000000-0000-4000-8000-0000000000d2');

-- 1. Anna writes posts with polls; bad polls are refused.
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v jsonb;
begin
  perform public.team_post_create('00000000-0000-4000-8000-0000000000d1', null, '<p>Secret poll</p>', pg_temp.poll(array['Monday', ' Tuesday ', '', 'Friday']));
  perform public.team_post_create('00000000-0000-4000-8000-0000000000d1', null, '<p>Public poll</p>', pg_temp.poll(array['Pizza', 'Pasta'], true, true));
  perform public.team_post_create('00000000-0000-4000-8000-0000000000d2', null, '<p>Team poll</p>', pg_temp.poll(array['Yes', 'No']));
  select poll into v from public.messages where id = pg_temp.root('<p>Secret poll</p>');
  if v -> 'options' <> '["Monday", "Tuesday", "Friday"]'::jsonb or (v ->> 'vote_count')::int <> 0 or (v ->> 'public')::boolean
     or v ->> 'closed_at' is not null then
    raise exception 'FAIL 1: poll stored as %', v;
  end if;
  begin
    perform public.team_post_create('00000000-0000-4000-8000-0000000000d1', null, '<p>x</p>', pg_temp.poll(array['Only one']));
    raise exception 'FAIL 1: a poll with one option';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.team_post_create('00000000-0000-4000-8000-0000000000d1', null, '<p>x</p>', pg_temp.poll(array['Ja', 'Nein', 'ja ']));
    raise exception 'FAIL 1: two equal options';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok 1: polls come with a post, cleaned and checked';
end $$;

-- 2. Nobody writes messages.poll by hand: not on a new message, not as the author of the post.
do $$ begin
  begin
    insert into public.messages (conversation_id, body, poll)
    select conversation_id, '<p>Sneaky</p>', '{"options": ["a", "b"]}' from public.messages where id = pg_temp.root('<p>Secret poll</p>');
    raise exception 'FAIL 2: a poll inserted by hand';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.messages set poll = jsonb_set(poll, '{public}', 'true') where id = pg_temp.root('<p>Secret poll</p>');
    raise exception 'FAIL 2: the author changed the poll';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise notice 'ok 2: the poll is fixed';
end $$;
reset role;

-- 3. Sara votes, changes her vote, cannot pick two in a single-choice poll nor an option that does not exist.
select pg_temp.as_user('sara.novak@example.com');
do $$
declare v int[];
begin
  perform public.poll_vote(pg_temp.root('<p>Secret poll</p>'), array[0]);
  perform public.poll_vote(pg_temp.root('<p>Secret poll</p>'), array[2]);
  select array_agg(option) into v from public.poll_votes where message_id = pg_temp.root('<p>Secret poll</p>');
  if v <> array[2] then raise exception 'FAIL 3: Sara''s votes are %', v; end if;
  begin
    perform public.poll_vote(pg_temp.root('<p>Secret poll</p>'), array[0, 1]);
    raise exception 'FAIL 3: two options in a single-choice poll';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.poll_vote(pg_temp.root('<p>Secret poll</p>'), array[3]);
    raise exception 'FAIL 3: an option that does not exist';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.poll_votes (message_id, user_id, option) values (pg_temp.root('<p>Secret poll</p>'), pg_temp.uid('sara.novak@example.com'), 1);
    raise exception 'FAIL 3: a vote inserted by hand';
  exception when insufficient_privilege then null;
  end;
  perform public.poll_vote(pg_temp.root('<p>Public poll</p>'), array[0, 1]);
  raise notice 'ok 3: one vote per person, changed through poll_vote only';
end $$;
reset role;

-- 4. Ben votes too. Sara sees only her own vote and the number of voters, no result while the poll runs.
select pg_temp.as_user('ben.keller@example.com');
select public.poll_vote(pg_temp.root('<p>Secret poll</p>'), array[2]);
select public.poll_vote(pg_temp.root('<p>Public poll</p>'), array[1]);
reset role;
select pg_temp.as_user('sara.novak@example.com');
do $$
declare v_rows int; v_count int;
begin
  select count(*) into v_rows from public.poll_votes where message_id = pg_temp.root('<p>Secret poll</p>');
  if v_rows <> 1 then raise exception 'FAIL 4: Sara sees % votes', v_rows; end if;
  select (poll ->> 'vote_count')::int into v_count from public.team_posts_overview where root_message_id = pg_temp.root('<p>Secret poll</p>');
  if v_count <> 2 then raise exception 'FAIL 4: vote_count is %', v_count; end if;
  select count(*) into v_rows from public.poll_result(pg_temp.root('<p>Secret poll</p>'));
  if v_rows <> 0 then raise exception 'FAIL 4: Sara sees the result of a running poll'; end if;
  if public.poll_state(pg_temp.root('<p>Secret poll</p>')) - 'poll' <> '{"mine": [2], "result": []}'::jsonb then
    raise exception 'FAIL 4: poll_state is %', public.poll_state(pg_temp.root('<p>Secret poll</p>'));
  end if;
  raise notice 'ok 4: only one''s own vote and the number of voters while it runs';
end $$;
-- Sara cannot end Anna's poll.
do $$ begin
  perform public.poll_close(pg_temp.root('<p>Secret poll</p>'));
  raise exception 'FAIL 5: Sara ended Anna''s poll';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok 5: only the author ends a poll';
end $$;
reset role;

-- 6. Anna sees the result at once, every option, no names in a secret poll, names in a public one.
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v text; v_names int;
begin
  select string_agg(option || ':' || votes || ':' || coalesce(cardinality(voter_ids)::text, '-'), ' ' order by option) into v
  from public.poll_result(pg_temp.root('<p>Secret poll</p>'));
  if v <> '0:0:- 1:0:- 2:2:-' then raise exception 'FAIL 6: secret result %', v; end if;
  select string_agg(option || ':' || votes || ':' || cardinality(voter_ids), ' ' order by option) into v
  from public.poll_result(pg_temp.root('<p>Public poll</p>'));
  if v <> '0:1:1 1:2:2' then raise exception 'FAIL 6: public result %', v; end if;
  select count(*) into v_names from public.poll_result(pg_temp.root('<p>Public poll</p>')) r
  where pg_temp.uid('ben.keller@example.com') = any (r.voter_ids);
  if v_names <> 1 then raise exception 'FAIL 6: Ben is not named once in the public poll'; end if;
  perform public.poll_close(pg_temp.root('<p>Secret poll</p>'));
  raise notice 'ok 6: the author sees the result, names only in a public poll';
end $$;
reset role;

-- 7. Once ended: Sara sees the result, nobody votes any more.
select pg_temp.as_user('sara.novak@example.com');
do $$
declare v_rows int;
begin
  select count(*) into v_rows from public.poll_result(pg_temp.root('<p>Secret poll</p>'));
  if v_rows <> 3 then raise exception 'FAIL 7: Sara sees % result rows after the end', v_rows; end if;
  begin
    perform public.poll_vote(pg_temp.root('<p>Secret poll</p>'), array[0]);
    raise exception 'FAIL 7: voted after the end';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Taking the vote back is no way around it either.
  begin
    perform public.poll_vote(pg_temp.root('<p>Secret poll</p>'), '{}');
    raise exception 'FAIL 7: took a vote back after the end';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- In a running poll it works.
  perform public.poll_vote(pg_temp.root('<p>Team poll</p>'), array[1]);
  perform public.poll_vote(pg_temp.root('<p>Team poll</p>'), '{}');
  if exists (select 1 from public.poll_votes where message_id = pg_temp.root('<p>Team poll</p>')) then
    raise exception 'FAIL 7: the vote was not taken back';
  end if;
  raise notice 'ok 7: result after the end, no votes after it';
end $$;
reset role;

-- 8. Paul is not in the team: no vote, no result, even after the end.
select pg_temp.as_user('paul.meier@example.com');
do $$
declare v_rows int;
begin
  begin
    perform public.poll_vote(pg_temp.root('<p>Team poll</p>'), array[0]);
    raise exception 'FAIL 8: an outsider voted';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  select count(*) into v_rows from public.poll_result(pg_temp.root('<p>Team poll</p>'));
  if v_rows <> 0 then raise exception 'FAIL 8: an outsider sees a result'; end if;
  raise notice 'ok 8: outsiders neither vote nor see';
end $$;
reset role;

-- 9. Editing the post's text keeps the poll.
select pg_temp.as_user('anna.weber@example.com');
do $$
declare v_conv uuid;
begin
  select conversation_id into v_conv from public.messages where id = pg_temp.root('<p>Public poll</p>');
  perform public.team_post_edit(v_conv, null, '<p>Public poll, edited</p>');
  if (select poll -> 'options' from public.messages where conversation_id = v_conv) <> '["Pizza", "Pasta"]'::jsonb then
    raise exception 'FAIL 9: the poll changed with the text';
  end if;
  raise notice 'ok 9: editing the text keeps the poll';
end $$;
reset role;

-- 10. A moderator deletes the post: its votes go too, and nothing shows the poll any more.
select pg_temp.as_user('tom.berger@example.com');
do $$
declare v_conv uuid;
begin
  select conversation_id into v_conv from public.messages where id = pg_temp.root('<p>Secret poll</p>');
  perform public.team_post_delete(v_conv);
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.poll_votes where message_id = pg_temp.root('<p>Secret poll</p>')) then
    raise exception 'FAIL 10: the votes outlived the post';
  end if;
  if not exists (select 1 from public.poll_votes where message_id = pg_temp.root('<p>Public poll, edited</p>')) then
    raise exception 'FAIL 10: the votes of another post went too';
  end if;
  raise notice 'ok 10: deleting the post drops its votes';
end $$;
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  if public.poll_state(pg_temp.root('<p>Secret poll</p>')) is not null then
    raise exception 'FAIL 10: poll_state of a deleted post';
  end if;
end $$;
reset role;

rollback;
