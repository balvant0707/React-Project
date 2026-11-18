-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/rls_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Manual RLS smoke test: psql -f supabase/tests_rls.sql (local stack). Prints one line per check.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;
begin;
select 'postgres (no RLS) sees all assets', count(*) from public.assets;
select pg_temp.as_user('anna.weber@example.com');
select 'anna assets (expect all of Werk Glückstadt, 202)', count(*) from public.assets;
select 'anna sees south?', count(*) from public.assets where name like '%Süd%' or name = 'Kompressor K2';
select 'anna tickets', count(*) from public.tickets;
select 'anna tasks', count(*) from public.tasks;
select 'anna feed entries', (select count(*) from public.activity_events) + (select count(*) from public.messages);
select 'search anna: finds Kompressor in her plant', count(*) > 0 from public.global_search('Kompressor');
select 'search anna: not the south demo asset (expect 0)', count(*) from public.global_search('Kompressor K2') where title like '%(Demo)%';
reset role;
select pg_temp.as_user('paul.meier@example.com');
select 'paul assets (expect 2: Werk Süd + K2)', count(*) from public.assets;
select 'paul tickets', count(*) from public.tickets;
select 'paul tasks', count(*) from public.tasks;
select 'search paul: sees no comment of the main plant (expect 0)', count(*) from public.global_search('Ersatzmotor') where entity_type = 'comments';
reset role;
select pg_temp.as_user('ben.keller@example.com');
select 'ben assets (Maschinen + Flurförderfahrzeuge subtrees)', count(*) from public.assets;
select 'ben tickets (own = 2 maintenance + 1 IT from seed 09)', count(*) from public.tickets;
select 'search ben: no tasks or tickets he cannot see', count(*) from public.global_search('Kompressor') where entity_type in ('tasks', 'tickets') and id not in (select id from public.tasks union select id from public.tickets);
select 'ben tasks (own/team = 0)', count(*) from public.tasks;
reset role;
select pg_temp.as_user('lena.fischer@example.com');
select 'lena tasks', count(*), string_agg(status, ',') from public.tasks;
select 'lena: ordered without date', (select 1) ;
do $$ begin
  perform public.task_perform_action((select id from public.tasks where title like 'Ersatzmotor%'), 'ordered');
exception when others then
  if sqlerrm not like 'Checklist step incomplete%' then raise; end if;
end $$;
reset role;
rollback;

begin;
select pg_temp.as_user('lena.fischer@example.com');
update public.task_checklist_items set value_text = '2026-10-20'
where from_step and label = 'Liefertermin' and task_id = (select id from public.tasks where title like 'Ersatzmotor%');
select 'lena ordered with date -> status', status, current_step_key from public.task_perform_action(
  (select id from public.tasks where title like 'Ersatzmotor%'), 'ordered', null);
reset role;
select pg_temp.as_user('anna.weber@example.com');
select 'anna completes receipt', status from public.task_perform_action((select id from public.tasks where title like 'Ersatzmotor%'), 'complete');
select 'anna tries to approve (expect error)' ;
rollback;

begin;
select pg_temp.as_user('anna.weber@example.com');
-- anna may not approve: create a fresh purchase request
insert into public.tasks (task_type_id, title, asset_id) values ((select id from public.task_types where key='purchase_request'), 'Test', (select id from public.assets where name='Perlmühle 1'));
select 'anna approve attempt' ;
select public.task_perform_action((select id from public.tasks where title='Test'), 'send');
do $$ begin
  perform public.task_perform_action((select id from public.tasks where title='Test'), 'approve');
  raise exception 'FAIL: anna approved a purchase request';
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
reset role;
rollback;

begin;
select pg_temp.as_user('anna.weber@example.com');
select 'direct status update (expect error)';
do $$ declare v bigint; begin
  update public.tasks set status='done' where title like 'Ölwechsel%';
  get diagnostics v = row_count;
  if v > 0 then raise exception 'FAIL: expected a refusal, % row(s) changed', v; end if;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
select 'plan to other team member', status from public.task_plan((select id from public.tasks where title like 'Ölwechsel%'), (select id from public.teams where name='Werkstatt'), (select id from public.users where email='sara.novak@example.com'), current_date + 3, 'a5');
select 'events on task', event_type from public.activity_events where entity_id = (select id from public.tasks where title like 'Ölwechsel%') order by created_at;
select 'edit system event (expect 0 rows/err)';
update public.activity_events set event_type='x';
reset role;
select 'notifications total', count(*) from public.notifications;
rollback;

begin;
select pg_temp.as_user('ben.keller@example.com');
select 'ben mentionable', count(*) from public.mentionable_users('tickets', (select id from public.tickets where title like 'Neue Schutz%'), '');
select 'ben moves asset (expect error)';
do $$ declare v bigint; begin
  update public.assets set parent_asset_id = (select id from public.assets where name='Heizungsanlage') where name='Perlmühle 1';
  get diagnostics v = row_count;
  if v > 0 then raise exception 'FAIL: expected a refusal, % row(s) changed', v; end if;
exception when others then
  if sqlerrm like 'FAIL:%' then raise; end if;
end $$;
reset role;
rollback;

begin;
-- tree move cascades path
update public.assets set parent_asset_id = (select id from public.assets where name='Heizungsanlage') where name='Pumpen';
select 'cnc path', path from public.assets where name='Exzenterschneckenpumpe Netzsch 2019 (1)';
update public.assets set parent_asset_id = (select id from public.assets where name='Exzenterschneckenpumpe Netzsch 2019 (1)') where name='Maschinen';
rollback;
