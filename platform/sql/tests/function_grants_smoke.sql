-- Copied from ~/maintenance_tool/supabase/tests/function_grants_smoke.sql with the renames and platform adaptations.
-- Function rights that must be the same locally and in the cloud (migration 20261008110000_explicit_function_grants.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/function_grants_smoke.sql
-- Runs in one transaction and is rolled back. Also run it against the cloud database after a push
-- (supabase db query --linked -f ...), because the cloud's defaults differ from the local stack's.
-- Plain SQL only (no psql meta-commands like \echo): the cloud API runs the file as one batch and
-- a meta-command there is a syntax error. A failed check raises, so the result row means "passed".
begin;

do $$
declare
  v_missing text;
begin
  -- Policies call is_admin() as the signed-in user.
  assert has_function_privilege('authenticated', 'public.is_admin(uuid)', 'execute'), 'authenticated must run is_admin';

  -- The Edge Functions run as service_role and may call any function but the auth trigger functions
  -- (20261018110000_sign_in_method.sql).
  select string_agg(p.oid::regprocedure::text, ', ') into v_missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
    and p.proname not in ('discard_recovery_token_for_sso_accounts', 'apply_sign_in_method', 'reject_password_for_sso_user', 'require_sso_for_azure_identity')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not has_function_privilege('service_role', p.oid, 'execute');
  assert v_missing is null, 'service_role cannot run: ' || v_missing;
  assert not has_function_privilege('service_role', 'public.discard_recovery_token_for_sso_accounts()', 'execute'), 'recovery guard';
  assert not has_function_privilege('service_role', 'public.apply_sign_in_method()', 'execute'), 'sign-in method trigger';
  assert not has_function_privilege('service_role', 'public.reject_password_for_sso_user()', 'execute'), 'password trigger';
  assert not has_function_privilege('service_role', 'public.require_sso_for_azure_identity()', 'execute'), 'azure identity trigger';

  -- A definer function that takes the viewer as an argument answers for anybody: internal only, policies call a
  -- *_for_me wrapper (20261130100000_access_helpers_internal.sql).
  select string_agg(p.oid::regprocedure::text, ', ') into v_missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and 'p_viewer' = any (p.proargnames)
    and has_function_privilege('authenticated', p.oid, 'execute');
  assert v_missing is null, 'authenticated can ask on behalf of others: ' || v_missing;
end $$;

-- A function created by a migration (role postgres) gets service_role only: authenticated needs an explicit grant.
create function public.function_grants_smoke_probe() returns int language sql as 'select 1';
do $$
begin
  assert has_function_privilege('service_role', 'public.function_grants_smoke_probe()', 'execute'), 'new function: service_role';
  assert not has_function_privilege('authenticated', 'public.function_grants_smoke_probe()', 'execute'), 'new function: no authenticated';
  assert not has_function_privilege('anon', 'public.function_grants_smoke_probe()', 'execute'), 'new function: no anon';
end $$;

rollback;
select 'function_grants_smoke: all checks passed' as result;
