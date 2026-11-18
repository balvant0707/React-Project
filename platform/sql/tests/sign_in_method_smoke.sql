-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/sign_in_method_smoke.sql with the renames and platform adaptations.
-- Adapted for key/value settings (D4): app_settings statements changed, nothing else.
-- Per-user sign-in method (migration 20261018110000_sign_in_method.sql). Run on the local database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/sign_in_method_smoke.sql
-- One transaction, rolled back; a failed assertion aborts with its message.
begin;

create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from pg_temp.people where email = p_email $$;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;
grant execute on all functions in schema pg_temp to public;

-- Fresh state: everybody is a password account; the seeded users with a login have a password.
do $$
begin
  assert not exists (select 1 from public.users where sign_in_method <> 'password'), 'default is password';
  assert (select coalesce(encrypted_password, '') <> '' from auth.users where id = pg_temp.uid('anna.weber@example.com')), 'seeded user has a password';
end $$;

-- 1. Microsoft cannot be linked to a password account; recovery works for it.
do $$
declare v_ok boolean := false;
begin
  begin
    insert into auth.identities (provider_id, user_id, identity_data, provider)
    values ('smoke-1', pg_temp.uid('anna.weber@example.com'), '{}', 'azure');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'azure identity refused for a password account';
  insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
  values (gen_random_uuid(), pg_temp.uid('anna.weber@example.com'), 'recovery_token', 'smoke-hash-1', 'x');
  assert exists (select 1 from auth.one_time_tokens where token_hash = 'smoke-hash-1'), 'recovery token kept for a password account';
end $$;

-- 2. Only an admin can change the method: not the user themselves, not HR (people.edit).
set local role authenticated;
do $$
declare v_ok boolean;
begin
  perform pg_temp.act_as('anna.weber@example.com');
  v_ok := false;
  begin
    update public.users set sign_in_method = 'sso' where id = pg_temp.uid('anna.weber@example.com');
  exception when others then v_ok := true;
  end;
  assert v_ok, 'a user cannot switch themselves to sso';
  perform pg_temp.act_as('hanna.richter@example.com');
  v_ok := false;
  begin
    update public.users set sign_in_method = 'sso' where id = pg_temp.uid('anna.weber@example.com');
  exception when others then v_ok := true;
  end;
  assert v_ok, 'HR cannot switch a user to sso';
  assert (select sign_in_method from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'password', 'still password';
end $$;
reset role;

-- 3. Admin switches a user to SSO: the password is gone, sessions are gone, everything password-shaped is refused.
insert into auth.sessions (id, user_id) values (gen_random_uuid(), pg_temp.uid('anna.weber@example.com'));
set local role authenticated;
select pg_temp.act_as('max.wilckens@wilckens.com');
update public.users set sign_in_method = 'sso' where id = pg_temp.uid('anna.weber@example.com');
reset role;
do $$
declare
  v_ok boolean := false;
  v_uid uuid := pg_temp.uid('anna.weber@example.com');
begin
  assert (select coalesce(encrypted_password, '') = '' from auth.users where id = v_uid), 'password cleared on switch to sso';
  assert not exists (select 1 from auth.sessions where user_id = v_uid), 'sessions ended on switch';
  begin
    update auth.users set encrypted_password = 'x' where id = v_uid;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'password change refused for an sso account';
  assert (select coalesce(encrypted_password, '') = '' from auth.users where id = v_uid), 'still no password';
  insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
  values (gen_random_uuid(), v_uid, 'recovery_token', 'smoke-hash-2', 'x');
  assert not exists (select 1 from auth.one_time_tokens where token_hash = 'smoke-hash-2'), 'recovery token discarded for an sso account';
  insert into auth.identities (provider_id, user_id, identity_data, provider) values ('smoke-2', v_uid, '{}', 'azure');
  assert exists (select 1 from auth.identities where user_id = v_uid and provider = 'azure'), 'azure identity allowed for an sso account';
end $$;

-- 4. Entra counts as the second factor only for an SSO account.
insert into public.app_settings (key, value) values ('require_mfa', 'true'), ('sso_satisfies_mfa', 'true') on conflict (key) do update set value = excluded.value;
create function pg_temp.sso_session_passes(p_email text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated', 'aal', 'aal1',
    'amr', json_build_array(json_build_object('method', 'oauth', 'timestamp', 1)),
    'app_metadata', json_build_object('provider', 'azure', 'providers', json_build_array('azure')))::text, true);
  return public.mfa_satisfied();
end $$;
grant execute on function pg_temp.sso_session_passes(text) to public;
set local role authenticated;
do $$
begin
  assert pg_temp.sso_session_passes('anna.weber@example.com'), 'azure session of an sso account passes';
  assert not pg_temp.sso_session_passes('ben.keller@example.com'), 'azure session of a password account does not pass';
end $$;
reset role;

-- 5. Back to password: the Microsoft identity and the sessions are gone, Microsoft can no longer be linked.
select set_config('request.jwt.claims', '', true);
update public.users set sign_in_method = 'password' where id = pg_temp.uid('anna.weber@example.com');
do $$
declare
  v_ok boolean := false;
  v_uid uuid := pg_temp.uid('anna.weber@example.com');
begin
  assert not exists (select 1 from auth.identities where user_id = v_uid and provider = 'azure'), 'azure identity removed on switch to password';
  begin
    insert into auth.identities (provider_id, user_id, identity_data, provider) values ('smoke-3', v_uid, '{}', 'azure');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'azure identity refused again';
  update auth.users set encrypted_password = 'x' where id = v_uid;
end $$;

-- 6. A person without a login can be marked in advance (the switch has nothing to clean up).
do $$
declare v_id uuid;
begin
  select id into v_id from public.users where not has_login limit 1;
  if v_id is not null then
    update public.users set sign_in_method = 'sso' where id = v_id;
    assert (select sign_in_method from public.users where id = v_id) = 'sso', 'person without login marked';
  end if;
end $$;

-- 7. The trigger functions cannot be called through the API.
do $$
begin
  assert not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_sign_in_method', 'reject_password_for_sso_user', 'require_sso_for_azure_identity', 'discard_recovery_token_for_sso_accounts')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
           or has_function_privilege('service_role', p.oid, 'execute'))), 'trigger functions not executable by API roles';
end $$;

rollback;
select 'sign_in_method_smoke: all checks passed' as result;
