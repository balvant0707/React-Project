-- apps: npm
-- Copied from ~/npm_tool/supabase/tests/users_without_login_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Users without a login (migration 20261019100000_users_without_login.sql): bash supabase/tests/run.sh users_without_login_smoke.sql
-- Local stack, seeded. One transaction, rolled back; a failed assertion aborts with its message.
\set ON_ERROR_STOP on
begin;

create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from pg_temp.people where email = p_email $$;
grant execute on all functions in schema pg_temp to public;

do $$
begin
  assert not exists (select 1 from public.users u where u.has_login is distinct from exists (select 1 from auth.users a where a.id = u.id)), 'has_login matches auth.users after the migration';
end $$;

-- 1. An admin creates a user without an account; has_login cannot be forged.
set local role authenticated;
do $$
declare v_id uuid; v_ok boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('max.wilckens@wilckens.com'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into public.users (email, name, has_login) values ('smoke.nologin@example.com', 'Smoke NoLogin', true) returning id into v_id;
  assert (select has_login from public.users where id = v_id) = false, 'inserted row has no login even if forged';
  insert into public.user_roles (user_id, role_id) select v_id, id from public.roles limit 1;
  assert exists (select 1 from public.user_roles where user_id = v_id), 'role assignable without login';
  begin
    update public.users set has_login = true where id = v_id;
  exception when others then v_ok := true;
  end;
  assert v_ok, 'has_login cannot be changed by an admin';
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('ugur.akbati@nipponpaint-marine.eu'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  v_ok := false;
  begin
    insert into public.users (email, name) values ('smoke.other@example.com', 'x');
  exception when others then v_ok := true;
  end;
  assert v_ok or not exists (select 1 from public.users where email = 'smoke.other@example.com'), 'non-admin cannot add users';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- 2. An account created later claims the row with the same id; deleting the account keeps the user.
do $$
declare v_id uuid;
begin
  select id into v_id from public.users where email = 'smoke.nologin@example.com';
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'smoke.nologin@example.com', '{}', now(), now());
  assert (select has_login from public.users where id = v_id), 'account claims the user';
  assert (select count(*) from public.users where email = 'smoke.nologin@example.com') = 1, 'no duplicate row';
  assert exists (select 1 from public.user_roles where user_id = v_id), 'role kept';
  delete from auth.users where id = v_id;
  assert exists (select 1 from public.users where id = v_id and not has_login), 'user kept, login gone';
end $$;

-- 3. A user with a login is not deleted by an admin; one without is.
set local role authenticated;
do $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('max.wilckens@wilckens.com'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  delete from public.users where id = pg_temp.uid('ugur.akbati@nipponpaint-marine.eu');
  assert exists (select 1 from public.users where id = pg_temp.uid('ugur.akbati@nipponpaint-marine.eu')), 'user with login not deleted';
  delete from public.users where email = 'smoke.nologin@example.com';
  assert not exists (select 1 from public.users where email = 'smoke.nologin@example.com'), 'user without login deleted';
end $$;
reset role;

select 'ok: users without login' as result;
rollback;
