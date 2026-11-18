-- apps: compass
-- Andon columns smoke test (new in the platform, no source app): tickets.acknowledged_at is set by the database only, and the
-- kiosk fields of ticket_types (group_key, default_priority, public_report) are checked. Needs the COMPASS demo seed (Anna, IT queue).
-- Run: tools/sql-test.sh compass modules/tickets/sql/tests/andon_columns_smoke.sql. One PASS/FAIL line per check; rolled back.
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
create or replace function pg_temp.check(p_name text, p_ok boolean) returns text language sql as $$
  select case when p_ok then 'PASS ' else 'FAIL ' end || p_name $$;
grant execute on all functions in schema pg_temp to public;
begin;

-- A client cannot set the first response time on insert
select pg_temp.as_user('anna.weber@example.com');
insert into public.tickets (queue_id, title, acknowledged_at) values ((select id from public.ticket_queues where key = 'it'), 'andon: forged', now() - interval '1 day');
reset role;
select pg_temp.check('1 insert starts without acknowledged_at', (select acknowledged_at is null from public.tickets where title = 'andon: forged'));

-- An update that does not take the ticket leaves it open and unacknowledged
update public.tickets set priority = 'high' where title = 'andon: forged';
select pg_temp.check('2 a priority change is no acknowledgement', (select acknowledged_at is null from public.tickets where title = 'andon: forged'));

-- Leaving "open" acknowledges, once
update public.tickets set status = 'in_progress' where title = 'andon: forged';
select pg_temp.check('3 open -> in_progress sets acknowledged_at', (select acknowledged_at is not null from public.tickets where title = 'andon: forged'));
create temp table first_ack as select acknowledged_at from public.tickets where title = 'andon: forged';
grant select on first_ack to public;
update public.tickets set status = 'open' where title = 'andon: forged';
update public.tickets set acknowledged_at = null where title = 'andon: forged';
select pg_temp.check('4 reopening or clearing keeps the first acknowledged_at', (select t.acknowledged_at = f.acknowledged_at from public.tickets t, first_ack f where t.title = 'andon: forged'));

-- Assigning a person acknowledges too
insert into public.tickets (queue_id, title) values ((select id from public.ticket_queues where key = 'it'), 'andon: assigned');
update public.tickets set assigned_user_id = (select id from public.users where email = 'tom.berger@example.com') where title = 'andon: assigned';
select pg_temp.check('5 assigning a person sets acknowledged_at', (select acknowledged_at is not null from public.tickets where title = 'andon: assigned'));

-- Kiosk fields of a type
select pg_temp.check('6 default priority must be a ticket priority', pg_temp.attempt($q$update public.ticket_types set default_priority = 'critical' where key = 'incident'$q$) like 'blocked:%');
select pg_temp.check('7 group key must be a key', pg_temp.attempt($q$update public.ticket_types set group_key = 'Bad Key' where key = 'incident'$q$) like 'blocked:%');
select pg_temp.check('8 valid kiosk fields are accepted', pg_temp.attempt($q$update public.ticket_types set group_key = 'material', default_priority = 'urgent' where key = 'incident' and queue_id = (select id from public.ticket_queues where key = 'it')$q$) = 'NO ERROR (allowed)');
select pg_temp.check('9 kiosk fields default to empty, public_report to off', (select group_key is null and default_priority is null and not public_report from public.ticket_types t join public.ticket_queues q on q.id = t.queue_id where q.key = 'maintenance' and t.key = 'incident'));

-- The no-login page only learns of types switched on for it (the Edge Function reads public_report with the service role)
select pg_temp.check('9b only opted-in types are public: none by default in the demo data',
  (select count(*) from public.ticket_types where public_report) = 0);
select pg_temp.check('9c a type can be switched on for the public page', pg_temp.attempt($q$update public.ticket_types set public_report = true where key = 'incident' and queue_id = (select id from public.ticket_queues where key = 'maintenance')$q$) = 'NO ERROR (allowed)');

-- The overview carries both
select pg_temp.check('10 overview shows acknowledged_at and the type group', (select acknowledged_at is not null and type_group_key = 'material' from public.tickets_overview where title = 'andon: assigned'));

-- Admin edits kiosk fields, a plain user cannot
select pg_temp.as_user('anna.weber@example.com');
with u as (update public.ticket_types set default_priority = 'low' returning 1) select pg_temp.check('11 a non-admin cannot change the kiosk fields', count(*) = 0) from u;
reset role;
rollback;
