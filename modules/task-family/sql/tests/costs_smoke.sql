-- Copied from ~/maintenance_tool/supabase/tests/costs_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Maintenance costs smoke test: psql -f supabase/tests/costs_smoke.sql (local stack, freshly reset DB). One line per check.
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

-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;
begin;
-- A task on an asset, created as the engine would (no auth user).
insert into public.tasks (id, task_type_id, title, asset_id, status, current_step_key, completed_at, ticket_id)
select '00000000-0000-4000-8000-0000000000c1', tt.id, 'Costs test', (select id from public.assets order by path limit 1), 'done',
       (select step_key from public.task_type_steps where task_type_id = tt.id order by step_order limit 1), now(), null
from public.task_types tt order by tt.key limit 1;
select set_config('app.task_engine', 'on', true);
update public.tasks set status = 'done', completed_at = now(), ticket_id = null where id = '00000000-0000-4000-8000-0000000000c1';
select set_config('app.task_engine', 'off', true);

select pg_temp.as_user('tom.berger@example.com');
select '1 manager records effort', pg_temp.attempt($q$select public.task_record_effort('00000000-0000-4000-8000-0000000000c1', 2.5, now() - interval '3 hours', now() - interval '1 hour')$q$);
select '2 manager adds a cost', pg_temp.attempt($q$insert into public.task_costs (task_id, description, amount) values ('00000000-0000-4000-8000-0000000000c1', 'Bearing, Fa. Mueller', 480.50)$q$);
select '2a manager adds suppliers', pg_temp.attempt($q$insert into public.suppliers (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'Fa. Mueller'), ('00000000-0000-4000-8000-0000000000d2', 'Fa. Bauer')$q$);
insert into public.task_costs (task_id, description, amount, supplier_id, cost_date) values ('00000000-0000-4000-8000-0000000000c1', 'Oil', 20, '00000000-0000-4000-8000-0000000000d1', current_date - 40), ('00000000-0000-4000-8000-0000000000c1', 'Seal', 5, '00000000-0000-4000-8000-0000000000d2', current_date);
select '2b breakdown by supplier', (select string_agg(group_label || '=' || amount::text, ', ') from public.maintenance_cost_breakdown(current_date - 60, current_date, 'supplier'));
select '2c breakdown by month has 2 months', (select count(*) from public.maintenance_cost_breakdown(current_date - 60, current_date, 'month'));
select '2d supplier filter', (select sum(amount) from public.maintenance_cost_breakdown(current_date - 60, current_date, 'asset', null, '00000000-0000-4000-8000-0000000000d1'));
select '3 negative amount refused', pg_temp.attempt($q$insert into public.task_costs (task_id, description, amount) values ('00000000-0000-4000-8000-0000000000c1', 'x', -1)$q$);
select '4 manager sees the cost in the stats', (select external_cost::text || ' / ' || work_hours::text || 'h / down ' || downtime_hours::text
  from public.maintenance_stats(current_date - 30, current_date) where asset_id = (select asset_id from public.tasks where id = '00000000-0000-4000-8000-0000000000c1'));
reset role;

select pg_temp.as_user('anna.weber@example.com');
select '5 workshop (no costs right) sees no costs', (select count(*) from public.task_costs);
select '5b workshop breakdown is empty', (select count(*) from public.maintenance_cost_breakdown(current_date - 60, current_date, 'supplier'));
select '5c workshop reads supplier names', (select count(*) > 0 from public.suppliers);
select '5d workshop cannot add a supplier', pg_temp.attempt($q$insert into public.suppliers (name) values ('Fa. X')$q$);
select '6 workshop cannot add a cost', pg_temp.attempt($q$insert into public.task_costs (task_id, description, amount) values ('00000000-0000-4000-8000-0000000000c1', 'x', 1)$q$);
select '7 workshop without access to the task sees nothing in the stats', (select external_cost::text || ' / ' || work_hours::text || 'h' from public.maintenance_stats(current_date - 30, current_date)
  where asset_id = (select asset_id from public.tasks where id = '00000000-0000-4000-8000-0000000000c1'));
select '8 workshop cannot read invoices', public.invoice_path_access('00000000-0000-4000-8000-0000000000c1/a.pdf', false);
reset role;

select pg_temp.as_user('ben.keller@example.com');
select '9 shopfloor cannot record effort without check right', pg_temp.attempt($q$select public.task_record_effort('00000000-0000-4000-8000-0000000000c1', 9, null, null)$q$);
rollback;
