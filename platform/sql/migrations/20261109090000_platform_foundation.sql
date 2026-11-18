-- Platform foundation: default privileges, copied from the COMPASS migrations
-- 20261002100000_foundation.sql, 20261002160000_api_grants.sql, 20261004130000_revoke_anon_functions.sql and
-- 20261004140000_revoke_anon_tables.sql (end state only). Must run before any table or function is created.
-- Extensions both source apps use (trigram search on names, as in COMPASS 20261002100000_foundation.sql and NPM). pg_cron / pg_net
-- come with the modules that schedule or call out.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Signed-out callers (anon) hold nothing in public; signed-in callers and the service role get Supabase's defaults.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;
do $$
begin
  alter default privileges for role supabase_admin in schema public revoke execute on functions from anon;
  alter default privileges for role supabase_admin revoke execute on functions from public;
  alter default privileges for role supabase_admin in schema public revoke all on tables from anon;
  alter default privileges for role supabase_admin in schema public revoke all on sequences from anon;
exception when insufficient_privilege or undefined_object then
  raise notice 'default privileges of supabase_admin not changed (%)', sqlerrm;
end $$;

-- From COMPASS 20261008110000_explicit_function_grants.sql (end state): a new function is executable by service_role
-- only; authenticated gets it through an explicit grant in the migration that creates the function. Same locally and
-- in the cloud (new cloud projects no longer grant authenticated by default).
alter default privileges for role postgres in schema public grant execute on functions to service_role;
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;
