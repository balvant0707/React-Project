-- Copied from ~/npm_tool/supabase/tests/vessels_list_perf.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Timings of the big list queries as the signed-in user (role authenticated, row level security on). Take list
-- timings this way only: as postgres/superuser the planner uses column statistics for every operator and shows
-- fast plans that the app never gets (see migration 20261101120000). Needs the full data (178k vessels); on the
-- small local seed every query is fast. Run against Cloud with
--   supabase db query --linked -f supabase/tests/vessels_list_perf.sql
-- (the API returns only the rows of the LAST statement: keep one explain per run and change the query below).
-- Targets on 178k vessels: every Execution Time under 150 ms.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'max.wilckens@wilckens.com'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
explain (analyze, costs off, summary on)
select * from public.vessels_overview
where deadweight_tonnage between 3000 and 10000
order by name asc limit 100;
-- others to try: order by deadweight_tonnage desc nulls last limit 100 / asc nulls last;
--   select count(*) from public.vessels_overview where deadweight_tonnage between 50000 and 80000;
--   select * from public.hull_events_list(array['<company id>']::uuid[]) order by event_date desc nulls last limit 50;
rollback;
