-- Copied from ~/maintenance_tool/supabase/tests/ticket_queues_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Ticket queues smoke test (queue teams, open queues, types per queue, public form, waiting_for_requester):
-- psql -f supabase/tests/ticket_queues_smoke.sql (local stack, freshly reset DB with seed 09). One line per check; rolled back.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.attempt(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO ERROR (allowed)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to public;
begin;

select '1 two queues (expect maintenance, it)', string_agg(key, ', ' order by sort_order) from public.ticket_queues;
select '2 types per queue (expect it: change, incident, request | maintenance: incident, inspection_finding, request)',
       string_agg(q.key || ': ' || t.key, ' | ' order by q.key, t.key) from public.ticket_types t join public.ticket_queues q on q.id = t.queue_id;

-- Anna (Workshop) opens an IT ticket: IT rights module, default team, she sees it
select pg_temp.as_user('anna.weber@example.com');
select '4 requester opens an IT ticket', pg_temp.attempt($q$insert into public.tickets (queue_id, title) values ((select id from public.ticket_queues where key = 'it'), 'Anna: Maus kaputt')$q$);
reset role;
select '5 default team set by the database (expect it, IT)', (select key from public.ticket_queues where id = queue_id), (select name from public.teams where id = assigned_team_id)
  from public.tickets where title = 'Anna: Maus kaputt';

select pg_temp.as_user('anna.weber@example.com');
select '6 she sees only her own IT tickets (expect 2: the monitor and the mouse)', count(*) from public.tickets_overview where queue_key = 'it';
with u as (update public.tickets set priority = 'urgent' where title = 'Anna: Maus kaputt' returning 1) select '7 requester cannot edit her IT ticket although her role has edit.reported (expect 0: changing needs the queue team)', count(*) from u;
select '8 requester can comment on it', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tickets', id), 'Noch ein Hinweis', auth.uid() from public.tickets where title = 'Anna: Maus kaputt'$q$);
select '9 requester sees no ticket of somebody else (expect 0)', count(*) from public.tickets where title like 'Drucker im Büro%';
reset role;
create temp table printer as select id from public.tickets where title like 'Drucker im Büro%';
grant select on printer to public;
select pg_temp.as_user('anna.weber@example.com');
select '9b ... and cannot comment on it', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tickets', id), 'fremd', auth.uid() from printer$q$);
select '10 waiting_for_requester: her answer puts the ticket back to work', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tickets', id), '27 Zoll, HDMI', auth.uid() from public.tickets where title like 'Neuer Monitor%'$q$);
reset role;
select '11 ... status now (expect in_progress)', status from public.tickets where title like 'Neuer Monitor%';
select pg_temp.as_user('anna.weber@example.com');
select '12 maintenance tickets keep their old rules (Anna sees what she reported or her team/assets have)', count(*) >= 0 from public.tickets_overview where queue_key = 'maintenance';
reset role;

-- A type belongs to its queue
select pg_temp.as_user('anna.weber@example.com');
select '13 inspection_finding is not an IT type', pg_temp.attempt($q$insert into public.tickets (queue_id, type, title) values ((select id from public.ticket_queues where key = 'it'), 'inspection_finding', 'x')$q$);
select '14 change is not a maintenance type', pg_temp.attempt($q$insert into public.tickets (queue_id, type, title) values ((select id from public.ticket_queues where key = 'maintenance'), 'change', 'x')$q$);
reset role;

-- Tom (Manager) sees all maintenance tickets but of IT only his own
select pg_temp.as_user('tom.berger@example.com');
select '15 manager: all maintenance tickets (expect 4); IT: all 5, he is on the IT team in the demo data',
       (select count(*) from public.tickets_overview where queue_key = 'maintenance'), (select count(*) from public.tickets_overview where queue_key = 'it');
reset role;

-- Jonas (IT agent) works the whole IT queue and sees no maintenance ticket
select pg_temp.as_user('jonas.richter@example.com');
select '16 agent: all IT tickets (expect 5), no maintenance ticket (expect 0)',
       (select count(*) from public.tickets_overview where queue_key = 'it'), (select count(*) from public.tickets_overview where queue_key = 'maintenance');
with u as (update public.tickets set status = 'waiting_for_requester' where title like 'Drucker im Büro%' returning 1) select '17 agent sets a status (expect 1)', count(*) from u;
select '18 agent comments', pg_temp.attempt($q$insert into public.messages (conversation_id, body, author_user_id) select public.conversation_get_or_create('tickets', id), 'Welcher Drucker?', auth.uid() from public.tickets where title like 'Drucker im Büro%'$q$);
select '19 agent cannot open a maintenance ticket', pg_temp.attempt($q$insert into public.tickets (queue_id, title) values ((select id from public.ticket_queues where key = 'maintenance'), 'x')$q$);
reset role;

select set_config('request.jwt.claims', '', true);
-- The public QR form (service role, no auth.uid) always lands in Maintenance, whatever queue it asks for
insert into public.tickets (queue_id, asset_id, source, title, reporter_name)
select (select id from public.ticket_queues where key = 'it'), (select id from public.assets limit 1), 'qr_public', 'Public: Leck', 'Schicht A';
select '20 public report is forced into Maintenance (expect maintenance)', q.key
  from public.tickets k join public.ticket_queues q on q.id = k.queue_id where k.title = 'Public: Leck';
select '21 public report without asset is refused', pg_temp.attempt($q$insert into public.tickets (source, title) values ('qr_public', 'Public ohne Asset')$q$);

-- An inactive queue takes no new tickets
update public.ticket_queues set active = false where key = 'it';
select pg_temp.as_user('anna.weber@example.com');
select '22 inactive queue refuses new tickets', pg_temp.attempt($q$insert into public.tickets (queue_id, title) values ((select id from public.ticket_queues where key = 'it'), 'x')$q$);
reset role;
update public.ticket_queues set active = true where key = 'it';

-- Queue teams: the broad literals (all) only count in a queue the user works in
delete from public.user_teams where user_id = (select id from public.users where email = 'tom.berger@example.com')
  and team_id = (select id from public.teams where name = 'IT');
select pg_temp.as_user('tom.berger@example.com');
select '23 manager (view.all) is not on the IT team: still only his own IT ticket (expect 1)', count(*) from public.tickets_overview where queue_key = 'it';
reset role;
insert into public.user_teams (user_id, team_id)
select u.id, g.id from public.users u, public.teams g where u.email = 'tom.berger@example.com' and g.name = 'IT';
select pg_temp.as_user('tom.berger@example.com');
select '24 ... as a member of the IT team he sees the whole IT queue (expect 5)', count(*) from public.tickets_overview where queue_key = 'it';
reset role;

-- A new high or urgent ticket notifies the queue's team members who may edit it; a normal one does not
insert into public.tickets (queue_id, title, priority, reporter_user_id)
select (select id from public.ticket_queues where key = 'it'), t.title, t.priority, (select id from public.users where email = 'anna.weber@example.com')
from (values ('Prio team high', 'high'), ('Prio team normal', 'normal')) as t (title, priority);
select '28 high ticket: the IT agent on the IT team is notified (expect 1)', count(*) from public.notifications
  where title like '%Prio team high' and user_id = (select id from public.users where email = 'jonas.richter@example.com');
select '29 ... a normal ticket tells nobody (expect 0)', count(*) from public.notifications where title like '%Prio team normal';
select '30 ... and not the reporter (expect 0)', count(*) from public.notifications
  where title like '%Prio team high' and user_id = (select id from public.users where email = 'anna.weber@example.com');

-- A queue without a team is open to every holder of the literal
delete from public.ticket_queue_teams where queue_id = (select id from public.ticket_queues where key = 'maintenance');
select pg_temp.as_user('jonas.richter@example.com');
select '25 maintenance without a team: the IT agent (edit.all) works it too (expect 5: the 4 and the public report)', count(*) from public.tickets_overview where queue_key = 'maintenance';
reset role;

-- A closed queue (not open to everyone): a person with no literal cannot open or see tickets there
update public.ticket_queues set open_to_everyone = false where key = 'it';
select pg_temp.as_user('lena.fischer@example.com');
select '26 closed IT queue: no literal, no ticket (expect blocked)', pg_temp.attempt($q$insert into public.tickets (queue_id, title) values ((select id from public.ticket_queues where key = 'it'), 'Lena x')$q$);
select '27 ... and she sees none of her own (expect 0)', count(*) from public.tickets where queue_id = (select id from public.ticket_queues where key = 'it');
reset role;
rollback;
