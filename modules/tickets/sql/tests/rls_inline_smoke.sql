-- Copied from ~/maintenance_tool/supabase/tests/rls_inline_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- The inline row policies of tasks and tickets (migration 20261222100000_rls_inline_policies.sql) decide exactly as the
-- single-row functions rls_task_allows / rls_ticket_allows: for every seeded user, every action and every row
-- (seed data plus 3,000 tasks and 1,000 tickets with random combinations of people, teams, steps, assets and queues).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_inline_smoke.sql
-- Runs as the database owner (no RLS) with the user's claims set, evaluates both expressions per row; rolled back.
begin;

set local session_replication_role = replica;
create temp table pick as
select (select array_agg(id) from public.users where has_login) users,
       (select array_agg(id) from public.teams) teams,
       (select array_agg(id) from public.roles) roles,
       (select array_agg(id) from public.assets) assets,
       (select array_agg(id) from public.task_types) types,
       (select array_agg(id) from public.ticket_queues) queues;
create function pg_temp.any_of(a uuid[], i integer, p_null_every integer) returns uuid language sql as $$
  select case when p_null_every > 0 and i % p_null_every = 0 then null else a[1 + abs(hashint4(i * 7919 + p_null_every)) % cardinality(a)] end
$$;
insert into public.tasks (id, root_task_id, task_number, title, status, task_type_id, assigned_user_id, created_by_user_id, team_id,
                          asset_id, current_assignee_user_id, current_assignee_team_id, current_assignee_role_id, permission_module)
select x.id, x.id, 400000 + i, 'RLS inline ' || i, 'open', t.type_id,
       pg_temp.any_of(p.users, i, 3), pg_temp.any_of(p.users, i + 1, 0), pg_temp.any_of(p.teams, i + 2, 4),
       pg_temp.any_of(p.assets, i + 3, 2),
       case when i % 5 = 0 then pg_temp.any_of(p.users, i + 4, 0) end,
       case when i % 5 in (1, 2) then pg_temp.any_of(p.teams, i + 5, 0) end,
       case when i % 5 in (2, 3) then pg_temp.any_of(p.roles, i + 6, 0) end,
       case when i % 11 = 0 then 'initiative' else public.permission_module_for(t.type_id) end
from generate_series(1, 3000) i
cross join pick p
cross join lateral (select public.uuid_generate_v7() as id where i > 0) x
cross join lateral (select pg_temp.any_of(p.types, i + 7, 0) as type_id) t;
insert into public.tickets (id, ticket_number, title, type, status, priority, queue_id, asset_id, assigned_user_id, reporter_user_id, assigned_team_id)
select public.uuid_generate_v7(), 400000 + i, 'RLS inline ' || i, tt.type, 'open', 'normal', tt.queue_id,
       pg_temp.any_of(p.assets, i, 3), pg_temp.any_of(p.users, i + 1, 2), pg_temp.any_of(p.users, i + 2, 4), pg_temp.any_of(p.teams, i + 3, 3)
from generate_series(1, 1000) i
cross join pick p
cross join lateral (select queue_id, key as type from public.ticket_types
                    where queue_id = pg_temp.any_of(p.queues, i + 4, 0) order by key limit 1) tt;
set local session_replication_role = origin;

do $$
declare
  v_user record;
  v_action text;
  v_new text;
  v_old text;
  v_diff bigint;
  v_rows bigint;
  v_checked integer := 0;
begin
  for v_user in select id, username from public.users where has_login order by username loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_user.id, 'role', 'authenticated')::text, true);
    -- tasks
    foreach v_action in array array['view', 'edit', 'delete', 'create'] loop
      select coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) into v_new
      from pg_policy where polrelid = 'public.tasks'::regclass
        and polname = case v_action when 'view' then 'View' when 'edit' then 'Edit' when 'delete' then 'Delete' else 'Create' end || ' tasks per grant';
      v_old := format('%s public.rls_task_allows(%L, permission_module, asset_id, assigned_user_id, created_by_user_id, team_id,
          current_assignee_user_id, current_assignee_team_id, current_assignee_role_id, (select public.rls_my_permissions()),
          (select public.rls_my_team_ids()), (select public.rls_task_asset_keys(%L)), (select public.rls_my_assignee_ids()))',
        case when v_action = 'create' then '' else 'task_type_id = any ((select public.rls_my_task_type_ids())::uuid[]) and' end,
        v_action, v_action);
      if v_action = 'view' then
        v_old := '(' || v_old || ') or assigned_user_id = (select auth.uid())
          or current_assignee_user_id = any ((select public.rls_my_assignee_ids())::uuid[])
          or ((current_assignee_role_id is not null or current_assignee_team_id is not null)
              and (current_assignee_role_id is null or current_assignee_role_id = any ((select public.rls_my_role_ids())::uuid[]))
              and (current_assignee_team_id is null or current_assignee_team_id = any ((select public.rls_my_team_ids())::uuid[])))';
      end if;
      execute format('select count(*) filter (where coalesce((%s), false) is distinct from coalesce((%s), false)),
                             count(*) filter (where coalesce((%s), false)) from public.tasks', v_new, v_old, v_new)
        into v_diff, v_rows;
      assert v_diff = 0, format('tasks %s for %s: %s rows differ', v_action, v_user.username, v_diff);
      v_checked := v_checked + 1;
    end loop;
    -- tickets
    foreach v_action in array array['view', 'edit', 'delete', 'create'] loop
      select coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) into v_new
      from pg_policy where polrelid = 'public.tickets'::regclass
        and polname = case v_action when 'view' then 'View' when 'edit' then 'Edit' when 'delete' then 'Delete' else 'Create' end || ' tickets per grant';
      v_old := format('public.rls_ticket_allows((select auth.uid()), %L, queue_id, asset_id, assigned_user_id, reporter_user_id,
          assigned_team_id, (select public.rls_my_permissions()), (select public.rls_my_team_ids()),
          (select public.rls_scope_asset_ids(%L)), (select public.rls_ticket_queue_ids()), (select public.rls_ticket_open_queue_ids()))',
        v_action, 'tickets.' || v_action || '.assigned_assets');
      execute format('select count(*) filter (where coalesce((%s), false) is distinct from coalesce((%s), false)) from public.tickets', v_new, v_old)
        into v_diff;
      assert v_diff = 0, format('tickets %s for %s: %s rows differ', v_action, v_user.username, v_diff);
      v_checked := v_checked + 1;
    end loop;
  end loop;
  assert v_checked >= 8 * 8, 'too few users checked: ' || v_checked;
  raise notice 'rls inline smoke test passed (% user/action pairs)', v_checked;
end $$;
rollback;
