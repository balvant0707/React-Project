-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/messaging_search_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Search in messages, posts, tasks and tickets (migration 20261127200000_messaging_search.sql): posts are found by
-- title (also with a typo), text and comments, only in teams the person may read; deleted posts disappear; every
-- task, ticket and comment the search returns is one the person may read under the row policies. Run on the local
-- stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/messaging_search_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to public;

-- A post in the IT group (members only: Jonas, Tom) and one with a comment in Treffpunkt (everybody).
select pg_temp.as_user('jonas.richter@example.com');
select set_config('search.test.it', (select conversation_id::text from public.team_post_create((select id from public.teams where name = 'IT'), 'Firewall Wartungsfenster', '<p>Am Samstag ist das <strong>Netzwerk</strong> kurz weg.</p>')), true);
reset role;
select pg_temp.as_user('anna.weber@example.com');
select set_config('search.test.open', (select conversation_id::text from public.team_post_create('00000000-0000-4000-8000-00000000ce01', null, '<p>Wer hat den Drehmomentschlüssel?</p>')), true);
insert into public.messages (conversation_id, body) values (current_setting('search.test.open')::uuid, 'Liegt im Kalibrierschrank, Fach drei.');
reset role;

-- 1. Posts: by title, with a typo, by text, by comment; members-only teams stay hidden
select pg_temp.as_user('jonas.richter@example.com');
do $$ begin
  assert exists (select 1 from public.global_search('Firewall', 40) where entity_type = 'posts' and id = current_setting('search.test.it')::uuid), 'jonas finds his post by title';
  assert exists (select 1 from public.global_search('Firewal Wartungsfentser', 40) where entity_type = 'posts') or
         exists (select 1 from public.global_search('Wartungsfentser', 40) where entity_type = 'posts'), 'a typo in the title still finds it';
  assert exists (select 1 from public.global_search('Netzwerk', 40) where entity_type = 'posts' and id = current_setting('search.test.it')::uuid), 'by text (no HTML in the way)';
  assert (select snippet from public.global_search('Netzwerk', 40) where entity_type = 'posts' limit 1) not like '%<strong>%', 'the snippet is plain text';
  assert exists (select 1 from public.global_search('Kalibrierschrank', 40) where entity_type = 'posts' and id = current_setting('search.test.open')::uuid), 'by a comment';
  assert (select count(*) from public.global_search('Drehmomentschlüssel Kalibrierschrank', 40) where entity_type = 'posts' and id = current_setting('search.test.open')::uuid) <= 1, 'one row per post';
end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  assert not exists (select 1 from public.global_search('Firewall', 40) where entity_type = 'posts'), 'anna does not see the IT group''s post';
  assert not exists (select 1 from public.global_search('Netzwerk', 40) where entity_type = 'posts'), 'nor by its text';
  assert exists (select 1 from public.global_search('Kalibrierschrank', 40) where entity_type = 'posts'), 'anna finds the open group''s post';
end $$;
reset role;

-- 2. A deleted post disappears (deleted by a moderator: Tom holds messages.edit)
select pg_temp.as_user('tom.berger@example.com');
select public.team_post_delete(current_setting('search.test.it')::uuid);
do $$ begin
  assert not exists (select 1 from public.global_search('Firewall', 40) where entity_type = 'posts'), 'deleted post not found';
end $$;
reset role;

-- 3. Tasks, tickets and comments: everything returned is readable under the row policies, for every role
do $$
declare
  v_email text;
  v_term text;
  r record;
begin
  foreach v_email in array array['anna.weber@example.com', 'ben.keller@example.com', 'jonas.richter@example.com', 'lena.fischer@example.com', 'tom.berger@example.com'] loop
    perform pg_temp.as_user(v_email);
    foreach v_term in array array['Kompressor', 'Ersatzmotor', 'Pumpe', 'defekt', '#3', '#7', '12', 'Prüfung'] loop
      for r in select * from public.global_search(v_term, 40) where entity_type in ('tasks', 'tickets', 'comments') loop
        if r.entity_type = 'tasks' then
          assert exists (select 1 from public.tasks t where t.id = r.id), format('%s sees task %s from the search under RLS', v_email, r.number);
        elsif r.entity_type = 'tickets' then
          assert exists (select 1 from public.tickets k where k.id = r.id), format('%s sees ticket %s from the search under RLS', v_email, r.number);
        else
          assert exists (select 1 from public.messages m where m.id = r.id), format('%s sees comment %s under RLS', v_email, r.id);
        end if;
      end loop;
      -- and nothing readable is missing among the best matches by number
      if v_term ~ '^#?[0-9]+$' then
        assert not exists (
            select 1 from public.tasks t
            where t.task_number = regexp_replace(v_term, '^#', '')::bigint
              and t.id not in (select g.id from public.global_search(v_term, 40) g where g.entity_type = 'tasks')),
          format('%s: the number search finds the readable task %s', v_email, v_term);
      end if;
    end loop;
    execute 'reset role';
  end loop;
end $$;

-- 4. Signed out: nothing
do $$ begin
  perform set_config('request.jwt.claims', '', true);
  assert not exists (select 1 from public.search_messages('Kalibrierschrank', true)), 'no session, no hits';
  assert not exists (select 1 from public.global_search('Kompressor') where entity_type in ('tasks', 'tickets')), 'no session, no work items';
end $$;

-- 5. Access functions answer yes or no, never null (a null slipped through `if not ...` checks)
do $$ begin
  assert not exists (
    select 1 from public.users u cross join public.tickets k cross join unnest(array['view', 'check', 'edit', 'delete']) g
    where u.has_login and public.user_has_access(u.id, 'tickets', k.id, g) is null), 'user_has_access on tickets is never null';
end $$;

select 'messaging search smoke test passed' as result;
rollback;
