-- Copied from ~/maintenance_tool/supabase/tests/anon_surface_smoke.sql with the renames and platform adaptations.
-- Signed-out surface + recovery guard: psql -f supabase/tests/anon_surface_smoke.sql (local stack).
-- One line per check; the expected result is in the text. Everything runs in rolled-back transactions.
-- A function that anon must call before login needs an explicit grant AND a change in check 1 here.
\set ON_ERROR_STOP off

create or replace function pg_temp.attempt_anon(p_sql text) returns text language plpgsql as $$
begin
  execute 'set local role anon';
  execute p_sql;
  return 'NO ERROR (allowed)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;

select '1 anon can execute no function in public (expect none)', coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');

select '2 anon holds no table/view/sequence privilege in public (expect none)', coalesce(string_agg(c.relname, ', '), 'none')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and ((c.relkind in ('r', 'v', 'm', 'p', 'f') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
        or has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'references') or has_table_privilege('anon', c.oid, 'trigger')))
    or (c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('anon', c.oid, 'select') or has_sequence_privilege('anon', c.oid, 'update'))));

begin;
create function public.zz_probe() returns int language sql as 'select 1';
select '3 a new function created by postgres gets no anon execute (expect false)', has_function_privilege('anon', 'public.zz_probe()', 'execute');
rollback;

select '4 the pre-login RPC email_has_password_login is gone (expect 0)', count(*) from pg_proc where proname = 'email_has_password_login';

begin;
select '5 anon calling touch_last_seen is refused (expect blocked: permission denied)', pg_temp.attempt_anon('select public.touch_last_seen()');
rollback;
begin;
select '6 anon reading a table is refused (expect blocked: permission denied)', pg_temp.attempt_anon('select * from public.tasks');
rollback;

-- Recovery guard (20261018110000_sign_in_method.sql): SSO accounts lose the token (also when they still have an
-- email identity), password accounts keep it, other token types are untouched.
begin;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'anon-test-azure@example.com', now(), '{}', '{}'),
       ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'anon-test-pw@example.com', now(), '{}', '{}'),
       ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'anon-test-both@example.com', now(), '{}', '{}');
update public.users set sign_in_method = 'sso' where id in ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-0000000000a3');
insert into auth.identities (id, user_id, provider_id, provider, identity_data) values
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', 'az1', 'azure', '{"sub":"az1"}'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a2', 'pw2', 'email', '{"sub":"pw2"}'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a3', 'pw3', 'email', '{"sub":"pw3"}'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a3', 'az3', 'azure', '{"sub":"az3"}');
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to) values
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', 'recovery_token', 'hash-recovery-azure', 'a1'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a2', 'recovery_token', 'hash-recovery-pw', 'a2'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a3', 'recovery_token', 'hash-recovery-both', 'a3'),
  (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-0000000000a1', 'confirmation_token', 'hash-confirm-azure', 'a1');
select '7 recovery token for an SSO account is discarded (expect 0)', count(*) from auth.one_time_tokens where token_hash = 'hash-recovery-azure';
select '8 recovery token for a password account is kept (expect 1)', count(*) from auth.one_time_tokens where token_hash = 'hash-recovery-pw';
select '9 recovery token for an SSO account that still has an email identity is discarded (expect 0)', count(*) from auth.one_time_tokens where token_hash = 'hash-recovery-both';
select '10 other token types are left alone (expect 1)', count(*) from auth.one_time_tokens where token_hash = 'hash-confirm-azure';
update auth.one_time_tokens set token_type = 'recovery_token' where token_hash = 'hash-confirm-azure';
select '11 an update that turns a token into a recovery token for an SSO account is skipped (expect 0 recovery rows)', count(*) from auth.one_time_tokens where token_hash = 'hash-confirm-azure' and token_type = 'recovery_token';
select '12 nobody but the owner can execute the guard function (expect false, false, true = no PUBLIC grant)',
  has_function_privilege('anon', 'public.discard_recovery_token_for_sso_accounts()', 'execute'),
  has_function_privilege('authenticated', 'public.discard_recovery_token_for_sso_accounts()', 'execute'),
  not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.discard_recovery_token_for_sso_accounts()'::regprocedure and a.grantee = 0);
rollback;
