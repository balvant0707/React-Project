-- Copied from ~/maintenance_tool/supabase/tests/login_access_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Sign-in by e-mail address (username for an account without one), locking, activation codes, forgot password and revoking a login (migration
-- 20261129100000_username_login.sql, ~/maintenance_tool/docs/username-login.md). Run on the local database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/login_access_smoke.sql
-- One transaction, rolled back; a failed assertion aborts with its message.
begin;

create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from pg_temp.people where email = p_email $$;
-- Acts as the person (role authenticated, second factor done) until pg_temp.reset() / the next act_as.
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.reset() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Runs a statement and returns the error message, or 'ok'.
create function pg_temp.try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to public;

-- 1. Usernames: from the name, umlauts resolved, a number on duplicates, lower case; the sign-in address follows
do $$
declare
  v_id uuid;
begin
  assert public.username_base('Jürgen Müller-Lüdenscheidt', null) = 'juergen.mueller.luedenscheidt', 'umlauts and hyphens';
  assert public.username_base('  Ćelik  Özdemir ', null) = 'celik.oezdemir', 'accents';
  assert public.username_base(null, 'x.y@example.com') = 'x.y', 'no name: the e-mail before the @';
  assert public.username_base('***', null) = 'user', 'nothing usable';
  assert (select username from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.weber', 'seeded username';
  insert into public.users (name) values ('Anna Weber') returning id into v_id;
  assert (select username from public.users where id = v_id) = 'anna.weber2', 'duplicate gets a number';
  assert (select email from auth.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.weber@example.com', 'sign-in address of a password account with a contact address: that address';
  assert (select email from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.weber@example.com', 'contact address stays';
  assert (select identity_data ->> 'email' from auth.identities where user_id = pg_temp.uid('anna.weber@example.com') and provider = 'email') = 'anna.weber@example.com', 'identity follows';
end $$;

-- 2. Who changes the username; the sign-in address and the log follow
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  assert pg_temp.try($q$update public.users set username = 'anna' where id = auth.uid()$q$) like 'Only a user manager%', 'nobody renames themselves';
end $$;
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert pg_temp.try($q$update public.users set username = 'Anna.W' where id = pg_temp.uid('anna.weber@example.com')$q$) = 'ok', 'HR renames';
  assert (select username from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.w', 'stored lower case';
  assert pg_temp.try($q$update public.users set username = 'anna w' where id = pg_temp.uid('anna.weber@example.com')$q$) like '%users_username_format%', 'format checked';
  assert pg_temp.try($q$update public.users set username = 'tom.berger' where id = pg_temp.uid('anna.weber@example.com')$q$) like '%users_username_key%', 'unique';
end $$;
select pg_temp.reset();
do $$ begin
  assert (select email from auth.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.weber@example.com', 'a rename leaves the sign-in address (the contact address) alone';
  assert exists (select 1 from public.role_assignment_log where kind = 'username' and user_id = pg_temp.uid('anna.weber@example.com')
                 and old_value = 'anna.weber' and new_value = 'anna.w' and by_user_id = pg_temp.uid('hanna.richter@example.com')), 'rename logged';
  -- The address follows the contact address; without one it is the username's own.
  update public.users set email = 'Anna.New@Example.com' where id = pg_temp.uid('anna.weber@example.com');
  assert (select email from auth.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.new@example.com', 'a new contact address is the new sign-in address, lower case';
  assert (select identity_data ->> 'email' from auth.identities where user_id = pg_temp.uid('anna.weber@example.com') and provider = 'email') = 'anna.new@example.com', 'identity follows the contact address';
  update public.users set email = null where id = pg_temp.uid('anna.weber@example.com');
  assert (select email from auth.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.w@login.rbp.invalid', 'without a contact address: the username''s own address';
  update public.users set email = 'anna.weber@example.com' where id = pg_temp.uid('anna.weber@example.com');
  assert (select email from auth.users where id = pg_temp.uid('anna.weber@example.com')) = 'anna.weber@example.com', 'back to the contact address';
  assert pg_temp.try($q$update auth.users set email = 'anna@evil.example' where id = pg_temp.uid('anna.weber@example.com')$q$) like 'The sign-in address follows%', 'address cannot move elsewhere';
end $$;

-- 2b. A new account for an existing person keeps the contact address as it was written (GoTrue stores it lower case),
-- and a stored address with blanks around it is no address
do $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.users (id, name, email) values (v_id, 'Case Test', 'Case.Test@Example.com');
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', 'case.test@example.com', now(), '{}', '{}', now(), now(), '', '', '', '', '', '', '', '');
  assert (select email from public.users where id = v_id) = 'Case.Test@Example.com', 'the contact address keeps its spelling';
  assert (select has_login from public.users where id = v_id), 'the account claimed the person';
  assert (select email from auth.users where id = v_id) = 'case.test@example.com', 'sign-in address in lower case';
end $$;

-- 3. Locking: user managers only, not themselves, an admin only by an admin, never directly
-- A ticket Anna and Ben both see: Ben is suggested for a mention there until he is locked.
select set_config('smoke.shared_ticket', (select k.id::text from public.tickets k
  where public.user_has_access(pg_temp.uid('ben.keller@example.com'), 'tickets', k.id, 'view')
    and public.user_has_access(pg_temp.uid('anna.weber@example.com'), 'tickets', k.id, 'view') limit 1), true);
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  assert exists (select 1 from public.mentionable_users('tickets', current_setting('smoke.shared_ticket')::uuid, 'ben.k') m
                 where m.id = pg_temp.uid('ben.keller@example.com')), 'suggested before the lock (also by username)';
end $$;
select pg_temp.reset();
insert into auth.sessions (id, user_id, created_at) values (gen_random_uuid(), pg_temp.uid('ben.keller@example.com'), now());
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key) values (pg_temp.uid('ben.keller@example.com'), 'https://push.example/ben', 'k', 'a');
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  assert pg_temp.try($q$select public.user_lock(pg_temp.uid('ben.keller@example.com'))$q$) like 'You cannot lock%', 'a normal user cannot lock';
end $$;
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert pg_temp.try($q$select public.user_lock(pg_temp.uid('hanna.richter@example.com'))$q$) like 'You cannot lock%', 'not oneself';
  assert pg_temp.try($q$select public.user_lock(pg_temp.uid('max.wilckens@wilckens.com'))$q$) like 'You cannot lock%', 'HR cannot lock an admin';
  assert pg_temp.try($q$update public.users set locked_at = now() where id = pg_temp.uid('ben.keller@example.com')$q$) like 'Locking goes through%', 'not by a plain update';
  assert pg_temp.try($q$select public.user_lock(pg_temp.uid('ben.keller@example.com'), 'Left the shift team')$q$) = 'ok', 'HR locks';
end $$;
select pg_temp.reset();
do $$ begin
  assert (select locked_at is not null and locked_by_user_id = pg_temp.uid('hanna.richter@example.com') from public.users where id = pg_temp.uid('ben.keller@example.com')), 'locked';
  assert (select banned_until > now() + interval '100 years' from auth.users where id = pg_temp.uid('ben.keller@example.com')), 'banned in GoTrue';
  assert not exists (select 1 from auth.sessions where user_id = pg_temp.uid('ben.keller@example.com')), 'sessions ended';
  assert not exists (select 1 from public.push_subscriptions where user_id = pg_temp.uid('ben.keller@example.com')), 'devices removed';
  assert exists (select 1 from public.role_assignment_log where kind = 'lock' and action = 'added' and user_id = pg_temp.uid('ben.keller@example.com') and new_value = 'Left the shift team'), 'lock logged with reason';
end $$;
-- A token Ben still holds is refused everywhere.
select pg_temp.act_as('ben.keller@example.com');
do $$ begin
  assert not public.mfa_satisfied(), 'policies refuse a locked person';
  assert pg_temp.try('select public.api_pre_request()') = 'account_locked', 'requests refused';
  assert not exists (select 1 from public.tasks), 'no rows';
end $$;
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  -- No longer offered for new mentions (the pickers in the app filter the same way, usersFor).
  assert not exists (select 1 from public.mentionable_users('tickets', current_setting('smoke.shared_ticket')::uuid, 'Ben') m
                     where m.id = pg_temp.uid('ben.keller@example.com')), 'a locked person is not suggested';
end $$;
select pg_temp.reset();
do $$ begin
  -- No reset link for a locked account.
  insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
  values (gen_random_uuid(), pg_temp.uid('ben.keller@example.com'), 'recovery_token', 'smoke-locked', 'x');
  assert not exists (select 1 from auth.one_time_tokens where token_hash = 'smoke-locked'), 'recovery token discarded';
  assert not exists (select 1 from public.login_reset_target('ben.keller')), 'no reset target';
  -- Route steps pass over a locked supervisor (20261129120000_locked_out_of_routing.sql): Anna -> Ben (locked) -> Tom.
  update public.users set supervisor_user_id = pg_temp.uid('ben.keller@example.com') where id = pg_temp.uid('anna.weber@example.com');
  update public.users set supervisor_user_id = pg_temp.uid('tom.berger@example.com') where id = pg_temp.uid('ben.keller@example.com');
  assert (select assignee_user_id from public.resolve_step_assignee(
            (select id from public.task_type_steps where assignee_kind = 'requester_supervisor' and assignee_level = 1 limit 1),
            pg_temp.uid('anna.weber@example.com'))) = pg_temp.uid('tom.berger@example.com'), 'approval skips the locked supervisor';
  assert public.user_supervisor_at(pg_temp.uid('anna.weber@example.com'), 1) = pg_temp.uid('tom.berger@example.com'), 'leave approver too';
  perform set_config('smoke.forward_task',
    (select t.id from public.tasks t where t.status not in ('done', 'cancelled')
       and public.user_has_access(pg_temp.uid('anna.weber@example.com'), 'tasks', t.id, 'edit') limit 1)::text, true);
  assert current_setting('smoke.forward_task') <> '', 'a task Anna may forward';
end $$;
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  assert pg_temp.try($q$select public.task_forward(current_setting('smoke.forward_task')::uuid, pg_temp.uid('ben.keller@example.com'))$q$)
    = 'This person cannot sign in', 'nobody forwards to a locked person';
end $$;
select pg_temp.reset();
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert pg_temp.try($q$select public.login_activation_create(pg_temp.uid('ben.keller@example.com'))$q$) = 'The person is locked', 'no sheet while locked';
  assert pg_temp.try($q$select public.user_unlock(pg_temp.uid('ben.keller@example.com'))$q$) = 'ok', 'HR unlocks';
end $$;
select pg_temp.reset();
do $$ begin
  assert (select locked_at is null and banned_until is null from public.users u join auth.users a using (id) where u.id = pg_temp.uid('ben.keller@example.com')), 'unlocked and unbanned';
  assert exists (select 1 from public.role_assignment_log where kind = 'lock' and action = 'removed' and user_id = pg_temp.uid('ben.keller@example.com')), 'unlock logged';
end $$;
select pg_temp.act_as('max.wilckens@wilckens.com');
do $$ begin
  assert pg_temp.try($q$select public.user_lock(pg_temp.uid('hanna.richter@example.com'))$q$) = 'ok', 'an admin locks HR';
  assert pg_temp.try($q$select public.user_unlock(pg_temp.uid('hanna.richter@example.com'))$q$) = 'ok', 'and unlocks';
end $$;
select pg_temp.reset();

-- 4. Activation codes: issuing resets the account; the code is single use, expires, and five wrong tries use it up
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), pg_temp.uid('ben.keller@example.com'), 'smoke', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at) values (gen_random_uuid(), pg_temp.uid('ben.keller@example.com'), now());
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert pg_temp.try($q$select public.login_activation_create(pg_temp.uid('max.wilckens@wilckens.com'))$q$) like 'You cannot issue%', 'HR cannot reset an admin';
  assert pg_temp.try($q$select public.login_activation_create(pg_temp.uid('hanna.richter@example.com'))$q$) like 'You cannot issue%', 'nor themselves';
  assert pg_temp.try($q$select public.login_activation_check('ben.keller', 'x')$q$) like 'permission denied%', 'checking is the Edge Function''s';
  assert pg_temp.try($q$select public.login_reset_target('ben.keller')$q$) like 'permission denied%', 'so is the reset target';
end $$;
create temp table issued on commit drop as
  select * from public.login_activation_create(pg_temp.uid('ben.keller@example.com'));
select pg_temp.reset();
do $$
declare
  v_code text := (select code from issued);
begin
  assert v_code ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$', 'code format';
  assert (select username from issued) = 'ben.keller' and (select expires_at from issued) > now() + interval '6 days', 'username and validity';
  assert (select coalesce(encrypted_password, '') = '' from auth.users where id = pg_temp.uid('ben.keller@example.com')), 'password removed';
  assert not exists (select 1 from auth.mfa_factors where user_id = pg_temp.uid('ben.keller@example.com')), 'second factor removed';
  assert not exists (select 1 from auth.sessions where user_id = pg_temp.uid('ben.keller@example.com')), 'sessions ended';
  assert exists (select 1 from public.role_assignment_log where kind = 'activation' and user_id = pg_temp.uid('ben.keller@example.com')), 'activation logged';
  assert not exists (select 1 from public.login_activation_codes where code_hash = v_code), 'only the hash is stored';
  assert not exists (select 1 from public.login_activation_check('ben.keller', 'AAAA-BBBB-CCCC')), 'wrong code';
  assert (select failed_attempts from public.login_activation_codes where user_id = pg_temp.uid('ben.keller@example.com')) = 1, 'counted';
  assert not exists (select 1 from public.login_activation_check('anna.w', v_code)), 'another username';
  assert (select login_email from public.login_activation_check(' Ben.Keller ', lower(replace(v_code, '-', '')))) = 'ben.keller@example.com', 'right code, any spelling; answers the address to sign in with';
  perform public.login_activation_consume((select id from public.login_activation_codes where user_id = pg_temp.uid('ben.keller@example.com')));
  assert not exists (select 1 from public.login_activation_check('ben.keller', v_code)), 'single use';
end $$;
select pg_temp.act_as('hanna.richter@example.com');
create temp table issued2 on commit drop as
  select * from public.login_activation_create(pg_temp.uid('ben.keller@example.com'));
select pg_temp.reset();
do $$
declare
  v_code text := (select code from issued2);
begin
  assert (select count(*) from public.login_activation_codes where user_id = pg_temp.uid('ben.keller@example.com')) = 1, 'a new sheet replaces the old one';
  for i in 1..5 loop
    perform public.login_activation_check('ben.keller', 'WRONG');
  end loop;
  assert not exists (select 1 from public.login_activation_check('ben.keller', v_code)), 'five wrong tries use the code up';
  update public.login_activation_codes set failed_attempts = 0, expires_at = now() - interval '1 minute' where user_id = pg_temp.uid('ben.keller@example.com');
  assert not exists (select 1 from public.login_activation_check('ben.keller', v_code)), 'expired';
end $$;
select pg_temp.act_as('max.wilckens@wilckens.com');
update public.users set sign_in_method = 'sso' where id = pg_temp.uid('sara.novak@example.com');
do $$ begin
  assert pg_temp.try($q$select public.login_activation_create(pg_temp.uid('sara.novak@example.com'))$q$) = 'This person signs in with Microsoft', 'no sheet for SSO';
end $$;
select pg_temp.reset();
do $$ begin
  assert (select email from auth.users where id = pg_temp.uid('sara.novak@example.com')) = 'sara.novak@example.com', 'SSO keeps the real address';
end $$;

-- 5. Forgot password: password accounts with a contact address, at most three links an hour
do $$ begin
  assert (select email from public.login_reset_target('lena.fischer')) = 'lena.fischer@example.com', 'link goes to the contact address';
  assert (select login_email from public.login_reset_target('LENA.FISCHER')) = 'lena.fischer@example.com', 'for the sign-in address';
  assert (select username from public.login_reset_target(' Lena.Fischer@Example.com ')) = 'lena.fischer', 'third: by e-mail address as well, same limit';
  assert not exists (select 1 from public.login_reset_target('lena.fischer')), 'fourth within the hour refused';
  assert not exists (select 1 from public.login_reset_target('sara.novak')), 'not for SSO';
  assert not exists (select 1 from public.login_reset_target('sara.novak@example.com')), 'not for SSO by address either';
  assert not exists (select 1 from public.login_reset_target('nobody.here')), 'unknown';
  update public.users set email = null where id = pg_temp.uid('paul.meier@example.com');
  assert not exists (select 1 from public.login_reset_target('paul.meier')), 'no contact address, no link';
  assert (select email from auth.users where id = pg_temp.uid('paul.meier@example.com')) = 'paul.meier@login.rbp.invalid', 'the sign-in address does not need one';
end $$;

-- 6. Revoking: the account goes, the person stays
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert pg_temp.try($q$select public.user_revoke_login(pg_temp.uid('max.wilckens@wilckens.com'))$q$) like 'You cannot revoke%', 'HR cannot revoke an admin';
  assert pg_temp.try($q$select public.user_revoke_login(pg_temp.uid('ben.keller@example.com'))$q$) = 'ok', 'HR revokes';
  assert pg_temp.try($q$select public.user_revoke_login(pg_temp.uid('ben.keller@example.com'))$q$) = 'The person has no login', 'twice';
end $$;
select pg_temp.reset();
do $$ begin
  assert not exists (select 1 from auth.users where id = pg_temp.uid('ben.keller@example.com')), 'account deleted';
  assert (select not has_login from public.users where id = pg_temp.uid('ben.keller@example.com')), 'person stays without login';
  assert exists (select 1 from public.role_assignment_log where kind = 'login' and action = 'removed' and user_id = pg_temp.uid('ben.keller@example.com')
                 and by_user_id = pg_temp.uid('hanna.richter@example.com')), 'revoke logged';
  assert not exists (select 1 from public.login_activation_codes where user_id = pg_temp.uid('ben.keller@example.com')), 'codes gone';
end $$;

-- 7. Giving a login follows may_manage_login too (Edge Function person-grant-login): the roles stay after revoking, so a
--    user manager must not give a login to a person holding Admin (they could put their own address on it first).
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert public.may_manage_login(pg_temp.uid('ben.keller@example.com')), 'HR may give Ben a login again';
end $$;
select pg_temp.reset();
insert into public.user_roles (user_id, role_id) select pg_temp.uid('ben.keller@example.com'), id from public.roles where name = 'Admin';
select pg_temp.act_as('hanna.richter@example.com');
do $$ begin
  assert not public.may_manage_login(pg_temp.uid('ben.keller@example.com')), 'HR may not give a login to a person holding Admin';
  assert not public.may_manage_login(pg_temp.uid('hanna.richter@example.com')), 'nor to herself';
end $$;
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  assert not public.may_manage_login(pg_temp.uid('ben.keller@example.com')), 'not a user manager';
end $$;
select pg_temp.act_as('max.wilckens@wilckens.com');
do $$ begin
  assert public.may_manage_login(pg_temp.uid('ben.keller@example.com')), 'an admin may';
end $$;
select pg_temp.reset();

select 'login access smoke test passed' as result;
rollback;
