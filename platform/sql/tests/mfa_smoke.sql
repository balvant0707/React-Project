-- apps: npm
-- Copied from ~/maintenance_tool/supabase/tests/mfa_smoke.sql with the renames and platform adaptations.
-- Adapted: public.tasks (module table) replaced by public.teams as the protected sample table.
-- Adapted: public.assets replaced by public.user_teams.
-- Adapted for key/value settings (D4): app_settings statements changed, nothing else.
-- Database-side second factor (migration 20261008100000_require_mfa.sql). Run on the local database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/mfa_smoke.sql
-- Everything runs in one transaction and is rolled back. Also fails when a table lacks the policy.
begin;

-- 1. Coverage: every public table and storage.objects carries the restrictive policy; the PostgREST hook is set.
do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
        and p.policyname = 'mfa_required' and p.permissive = 'RESTRICTIVE');
  assert v_missing is null, 'tables without the mfa_required policy: ' || v_missing;
  assert exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'mfa_required' and permissive = 'RESTRICTIVE'), 'storage.objects policy';
  assert exists (select 1 from pg_roles, unnest(rolconfig) c
                 where rolname = 'authenticator' and c = 'pgrst.db_pre_request=public.api_pre_request'), 'pre-request hook';
  assert not has_function_privilege('anon', 'public.api_pre_request()', 'execute'), 'anon must not run the hook';
  assert not has_function_privilege('anon', 'public.mfa_satisfied()', 'execute'), 'anon must not run mfa_satisfied';
end $$;

insert into public.app_settings (key, value) values ('require_mfa', 'true'), ('sso_satisfies_mfa', 'true') on conflict (key) do update set value = excluded.value;
-- Entra counts only for an account switched to SSO (20261018110000_sign_in_method.sql).
update public.users set sign_in_method = 'sso' where email = 'max.wilckens@wilckens.com';

-- User ids are looked up now: under aal1 the users table itself is invisible.
create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.act_as(p_email text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from pg_temp.people where email = p_email), 'role', 'authenticated', 'aal', p_aal)::text, true);
end;
$$;
create function pg_temp.act_as_amr(p_email text, p_amr jsonb, p_providers jsonb default '["azure"]') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from pg_temp.people where email = p_email), 'role', 'authenticated', 'aal', 'aal1', 'amr', p_amr,
                      'app_metadata', json_build_object('provider', 'azure', 'providers', p_providers))::text, true);
end;
$$;
create function pg_temp.hook_refuses() returns boolean language plpgsql as $$
begin
  perform public.api_pre_request();
  return false;
exception when insufficient_privilege then
  return sqlerrm = 'mfa_required';
end;
$$;
grant execute on all functions in schema pg_temp to public;
set local role authenticated;

-- 2. Password only (aal1): the hook refuses, RLS hides everything and refuses writes, even for an admin.
do $$
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com', 'aal1');
  assert pg_temp.hook_refuses(), 'aal1: hook refuses';
  assert (select count(*) from public.teams) = 0, 'aal1: no teams';
  assert (select count(*) from public.user_teams) = 0, 'aal1: no memberships';
  assert (select count(*) from public.users) = 0, 'aal1: no users';
  assert (select count(*) from public.app_settings) = 0, 'aal1: no settings';
  assert (select count(*) from storage.objects) = 0, 'aal1: no files';
  begin
    insert into public.phrases (category, text_en) values ('mfa_smoke', 'x');
    raise exception 'aal1 insert went through';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Second factor done (aal2): everything as before.
do $$
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com', 'aal2');
  assert not pg_temp.hook_refuses(), 'aal2: hook lets through';
  assert (select count(*) from public.teams) > 0, 'aal2: teams visible';
  assert (select count(*) from public.user_teams) > 0, 'aal2: memberships visible';
  assert (select count(*) from public.app_settings) = (select count(*) from public.app_setting_registry where is_public), 'aal2: public settings visible';
  insert into public.phrases (category, text_en) values ('mfa_smoke', 'x');
end $$;

-- 3b. Entra SSO (amr method oauth, migration 20261014100000): counts as the second factor, a password login does not.
do $$
begin
  perform pg_temp.act_as_amr('max.wilckens@wilckens.com', '[{"method":"oauth","timestamp":1}]'::jsonb);
  assert not pg_temp.hook_refuses(), 'sso: hook lets through';
  assert (select count(*) from public.teams) > 0, 'sso: teams visible';
  perform pg_temp.act_as_amr('anna.weber@example.com', '[{"method":"oauth","timestamp":1}]'::jsonb);
  assert pg_temp.hook_refuses(), 'oauth session of a password account: refused';
  perform pg_temp.act_as_amr('max.wilckens@wilckens.com', '[{"method":"oauth","timestamp":1}]'::jsonb, '["email","google"]'::jsonb);
  assert pg_temp.hook_refuses(), 'oauth without the azure provider: refused';
  perform pg_temp.act_as_amr('max.wilckens@wilckens.com', '[{"method":"password","timestamp":1}]'::jsonb);
  assert pg_temp.hook_refuses(), 'password amr: refused';
  perform pg_temp.act_as_amr('max.wilckens@wilckens.com', '"oauth"'::jsonb);
  assert pg_temp.hook_refuses(), 'malformed amr: refused';
end $$;
reset role;
update public.app_settings set value = 'false' where key = 'sso_satisfies_mfa';
set local role authenticated;
do $$
begin
  perform pg_temp.act_as_amr('max.wilckens@wilckens.com', '[{"method":"oauth","timestamp":1}]'::jsonb);
  assert pg_temp.hook_refuses(), 'sso switch off: refused';
end $$;
reset role;
update public.app_settings set value = 'true' where key = 'sso_satisfies_mfa';
set local role authenticated;

-- 4. Switch off (local dev): aal1 works again.
reset role;
update public.app_settings set value = 'false' where key = 'require_mfa';
set local role authenticated;
do $$
begin
  perform pg_temp.act_as('anna.weber@example.com', 'aal1');
  assert not pg_temp.hook_refuses(), 'switch off: hook lets through';
  assert (select count(*) from public.teams) > 0, 'switch off: teams visible';
end $$;

-- 5. No settings row counts as required (fail closed).
reset role;
delete from public.app_settings;
set local role authenticated;
do $$
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com', 'aal1');
  assert pg_temp.hook_refuses(), 'no settings row: refused';
end $$;

reset role;
rollback;
\echo 'mfa_smoke: all checks passed'
