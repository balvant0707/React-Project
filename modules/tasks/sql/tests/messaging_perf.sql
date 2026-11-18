-- Copied from ~/maintenance_tool/supabase/tests/messaging_perf.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Messaging load test (output only, not run by scripts/run-tests.sh): fills the local database with a realistic
-- volume of conversations, messages, posts and read markers, then times the queries the Messages page, the record
-- feeds, the badge and the search make, as a normal user (RLS on). Everything is rolled back.
--   docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/messaging_perf.sql
-- It only creates its own records (tasks numbered above 100000, posts titled "Beitrag n"), so it never blocks other
-- sessions on a unique key. Read the milliseconds by hand; ~/maintenance_tool/docs/messaging.md "Performance" records the last run.
\set ON_ERROR_STOP off
begin;

create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
-- Best of three runs of a statement, in milliseconds (-1 = over the statement timeout).
create function pg_temp.ms(p_sql text) returns numeric language plpgsql as $$
declare
  v_best numeric := null;
  v_start timestamptz;
  v_dummy bigint;
begin
  for i in 1..3 loop
    v_start := clock_timestamp();
    begin
      execute 'select count(*) from (' || p_sql || ') q' into v_dummy;
    exception when query_canceled then
      return -1;
    end;
    v_best := least(coalesce(v_best, 1e9), extract(epoch from clock_timestamp() - v_start) * 1000);
    exit when v_best > 2000;
  end loop;
  return round(v_best, 1);
end $$;
grant execute on all functions in schema pg_temp to public;

-- ===================================================================================
-- Volume: 300 people, 3,000 tasks with a conversation each (40 messages), 3,000 posts with 9 comments each
-- (about 150,000 messages), Anna taking part in 600 conversations, 8 read markers per task conversation.
-- ===================================================================================
set local session_replication_role = replica;  -- no triggers while loading (counters are set below)

create temp table load_groups as select array_agg(id order by id) ids from public.teams;

insert into public.users (id, name, email, username, has_login, language)
select public.uuid_generate_v7(), 'Load Person ' || i, 'load' || i || '@example.test', 'load' || i, true, 'de'
from generate_series(1, 300) i;
insert into public.user_teams (user_id, team_id)
select u.id, g.ids[1 + (abs(hashtext(u.email)) % array_length(g.ids, 1))]
from public.users u cross join load_groups g where u.email like 'load%@example.test'
on conflict do nothing;

insert into public.tasks (id, root_task_id, task_number, title, description, status, priority, task_type_id, team_id, created_by_user_id, created_at)
select x.id, x.id, 100000 + i, 'Lasttest Aufgabe ' || i || case when i % 50 = 0 then ' Pumpe' else '' end,
       'Beschreibung ' || i, 'open', 'normal',
       (select task_type_id from public.tasks limit 1), (select team_id from public.tasks where team_id is not null limit 1),
       pg_temp.uid('tom.berger@example.com'), now() - (i || ' hours')::interval
from generate_series(1, 3000) i cross join lateral (select public.uuid_generate_v7() as id where i > 0) x;

insert into public.conversations (kind, anchor_type, anchor_id, team_id, created_at)
select 'record', 'tasks', t.id, t.team_id, t.created_at from public.tasks t where t.task_number > 100000;

insert into public.conversations (kind, anchor_type, anchor_id, title, created_at, created_by_user_id)
select 'post', 'teams', g.ids[1 + (i % array_length(g.ids, 1))], 'Beitrag ' || i, now() - (i * 3 || ' hours')::interval,
       pg_temp.uid('tom.berger@example.com')
from generate_series(1, 3000) i cross join load_groups g;

create temp table load_conversations as
select c.id, c.kind, c.created_at from public.conversations c
left join public.tasks t on t.id = c.anchor_id and c.kind = 'record'
where (c.kind = 'post' and c.title like 'Beitrag %') or t.task_number > 100000;

insert into public.messages (conversation_id, author_user_id, body, created_at)
select c.id,
       u.ids[1 + ((n * 7 + abs(hashtext(c.id::text))) % array_length(u.ids, 1))],
       case when n % 9 = 0 and abs(hashtext(c.id::text)) % 20 = 0 then 'Die Pumpe an der Abfüllung tropft wieder, Dichtung prüfen.'
            when n % 13 = 0 then 'Erledigt, @[user:' || pg_temp.uid('anna.weber@example.com') || '] bitte prüfen.'
            else 'Nachricht ' || n || ' zum Vorgang, Text mit etwas Inhalt damit die Zeile realistisch lang ist.' end,
       c.created_at + (n || ' minutes')::interval
from load_conversations c
cross join (select array_agg(id) ids from public.users) u
cross join lateral generate_series(1, case c.kind when 'post' then 10 else 40 end) n;

update public.conversations c set message_count = s.n, last_message_at = s.last_at, first_message_id = s.first_id
from (
  select m.conversation_id, count(*) n, max(m.created_at) last_at, (array_agg(m.id order by m.created_at, m.id))[1] first_id
  from public.messages m join load_conversations l on l.id = m.conversation_id
  group by m.conversation_id
) s
where s.conversation_id = c.id;

insert into public.conversation_participants (conversation_id, user_id, taking_part, level, last_read_at)
select c.id, pg_temp.uid('anna.weber@example.com'), true, 'all',
       case when row_number() over (order by c.id) % 5 = 0 then c.created_at else now() end
from (select id, created_at from load_conversations where kind = 'record' order by id limit 600) c;
insert into public.conversation_participants (conversation_id, user_id, taking_part, level, last_read_at)
select c.id, u.id, (random() < 0.3), 'all', now() - interval '1 day'
from load_conversations c
join lateral (select id from public.users where email like 'load%' and c.id is not null order by random() limit 8) u on true
where c.kind = 'record'
on conflict (conversation_id, user_id) do nothing;

set local session_replication_role = origin;
analyze public.messages; analyze public.conversations; analyze public.conversation_participants; analyze public.tasks; analyze public.users;

select (select count(*) from public.messages) as messages, (select count(*) from public.conversations) as conversations,
       (select count(*) from public.conversation_participants) as participants;

-- ===================================================================================
-- Timings as Anna (Workshop) and Tom (Manager)
-- ===================================================================================
create temp table perf (who text, what text, ms numeric);
grant all on perf to public;
set local statement_timeout = '20s';

select pg_temp.as_user('anna.weber@example.com');
insert into perf
select 'anna', what, pg_temp.ms(q) from (values
  ('inbox_unread_count (badge)', 'select * from public.inbox_unread_count()'),
  ('inbox_list mine, 30', 'select * from public.inbox_list(''mine'', null, false, null, null, null, 30)'),
  ('inbox_list mine unread, 30', 'select * from public.inbox_list(''mine'', null, true, null, null, null, 30)'),
  ('inbox_list group Werkstatt, 30', 'select * from public.inbox_list(''group'', ''915b057e-a217-4e83-9dd6-96aa2de28db4'', false, null, null, null, 30)'),
  ('inbox_list group Treffpunkt, 30', 'select * from public.inbox_list(''group'', ''00000000-0000-4000-8000-00000000ce01'', false, null, null, null, 30)'),
  ('team_unread_counts', 'select * from public.team_unread_counts()'),
  ('team_message_rights', 'select * from public.team_message_rights()'),
  ('chat page (30 newest, RLS)', 'select id from public.messages where conversation_id = (select c.id from public.conversations c join public.tasks t on t.id = c.anchor_id and t.task_number = 100010) order by created_at desc, id desc limit 30'),
  ('record feed (all 40 messages, RLS)', 'select id from public.messages where conversation_id = (select c.id from public.conversations c join public.tasks t on t.id = c.anchor_id and t.task_number = 100010)'),
  ('team_posts_overview, one post', 'select id from public.team_posts_overview where id = (select id from public.conversations where kind = ''post'' and title = ''Beitrag 5'')'),
  ('conversation_header', 'select * from public.conversation_header((select id from public.conversations where kind = ''post'' and title = ''Beitrag 5''))'),
  ('global_search Pumpe', 'select * from public.global_search(''Pumpe'', 40)'),
  ('global_search Dichtung', 'select * from public.global_search(''Dichtung'', 40)'),
  ('global_search Dichtnug (typo)', 'select * from public.global_search(''Dichtnug'', 40)')
) v (what, q);
reset role;

select pg_temp.as_user('tom.berger@example.com');
insert into perf
select 'tom', what, pg_temp.ms(q) from (values
  ('inbox_unread_count (badge)', 'select * from public.inbox_unread_count()'),
  ('inbox_list mine, 30', 'select * from public.inbox_list(''mine'', null, false, null, null, null, 30)'),
  ('inbox_list group Werkstatt, 30', 'select * from public.inbox_list(''group'', ''915b057e-a217-4e83-9dd6-96aa2de28db4'', false, null, null, null, 30)'),
  ('team_unread_counts', 'select * from public.team_unread_counts()'),
  ('global_search Pumpe', 'select * from public.global_search(''Pumpe'', 40)')
) v (what, q);
reset role;

-- Writing: one comment on a busy task, one post in the company group (notifies everybody).
select pg_temp.as_user('tom.berger@example.com');
do $$
declare
  v_start timestamptz;
  v_conv uuid := (select c.id from public.conversations c join public.tasks t on t.id = c.anchor_id and t.task_number = 100020);
begin
  v_start := clock_timestamp();
  insert into public.messages (conversation_id, body) values (v_conv, 'Ein Kommentar im Lasttest');
  insert into perf values ('tom', 'write: comment on a task', round(extract(epoch from clock_timestamp() - v_start) * 1000, 1));
  v_start := clock_timestamp();
  perform public.team_post_create('00000000-0000-4000-8000-00000000ce03', 'Lasttest', '<p>Ankündigung an alle</p>');
  insert into perf values ('tom', 'write: post in Unternehmen (everybody)', round(extract(epoch from clock_timestamp() - v_start) * 1000, 1));
end $$;
reset role;

select who, what, ms from perf order by who, what;
rollback;
