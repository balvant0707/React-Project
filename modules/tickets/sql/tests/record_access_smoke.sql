-- Copied from ~/maintenance_tool/supabase/tests/record_access_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- "Who can access this" (migration 20261211110000_record_access.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/record_access_smoke.sql
-- Everything runs in one transaction and is rolled back. Assumes the shared seed (team Werkstatt responsible for the
-- plant, Anna in Werkstatt with the role Workshop).
begin;
create function pg_temp.act_as(p_username text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where username = p_username), 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;
grant execute on all functions in schema pg_temp to public;

insert into public.tasks (id, task_type_id, title, asset_id, assigned_user_id, team_id)
select '00000000-0000-4000-8000-0000000000e9', (select id from public.task_types where key = 'general'), 'Access smoke task',
       (select id from public.assets where name = 'Werk Glückstadt'), (select id from public.users where username = 'anna.weber'),
       (select id from public.teams where name = 'Werkstatt');

set local role authenticated;
select pg_temp.act_as('anna.weber');
do $$
declare
  v_asset uuid := (select id from public.assets where name = 'Werk Glückstadt');
begin
  -- The team along the asset path, with the level its members' roles give.
  assert exists (select 1 from public.record_access('assets', v_asset) where kind = 'team' and label = 'Werkstatt' and access_level = 'edit' and 'asset' = any (sources)),
    'the responsible team is listed with its level';
  assert exists (select 1 from public.record_access('assets', v_asset) where kind = 'role' and label = 'Manager'),
    'a role with the all scope is listed by name';
  assert not exists (select 1 from public.record_access('assets', v_asset) where kind = 'user'), 'no people on an asset';

  -- A task: its team, the person, the asset's team (both sources on one row), the roles with all.
  assert exists (select 1 from public.record_access('tasks', '00000000-0000-4000-8000-0000000000e9')
                 where kind = 'team' and label = 'Werkstatt' and 'assigned' = any (sources) and 'asset' = any (sources)),
    'a team named twice shows once with both sources';
  assert exists (select 1 from public.record_access('tasks', '00000000-0000-4000-8000-0000000000e9') where kind = 'user' and label = 'Anna Weber' and 'assignee' = any (sources)),
    'the assignee is listed';
end $$;

-- Somebody who cannot view the record learns nothing.
select pg_temp.act_as('ben.keller');
do $$
begin
  assert not exists (select 1 from public.record_access('assets', (select id from public.assets where name = 'Werk Glückstadt'))),
    'no answer without view access';
  assert not exists (select 1 from public.record_access('goals', gen_random_uuid())), 'other entity types answer nothing';
end $$;

-- Signed out: no rows and no execute right.
reset role;
set local role anon;
do $$
begin
  assert not has_function_privilege('anon', 'public.record_access(text, uuid)', 'execute'), 'anon cannot call it';
end $$;
rollback;
