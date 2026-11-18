-- The password sign-in throttle (migration 20261115120000_platform_login_throttle.sql): the hook counts wrong passwords per
-- account, starts growing waits after the fifth, refuses everything while an account waits without counting it, forgets after
-- a right password or a day, tells the admins, fails open, and keeps the table and the hook away from everybody else.
-- One transaction, rolled back. Needs an admin with a login in the seed.
begin;

create temp table t_ctx (admin_id uuid, victim uuid, plain uuid) on commit drop;
grant select on t_ctx to public;
insert into t_ctx (admin_id)
  select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id join public.users u on u.id = ur.user_id
  where r.name = 'Admin' and u.has_login and not u.has_left limit 1;

create function pg_temp.mkuser(p_n int) returns uuid language plpgsql as $$
declare v_id uuid := ('bbbbbbbb-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', 'throttle-smoke-' || p_n || '@example.com', now(), '{}', '{}');
  return v_id;
end $$;
create function pg_temp.hook(p_user uuid, p_valid boolean) returns jsonb language sql as $$
  select public.hook_password_verification_attempt(jsonb_build_object('user_id', p_user, 'valid', p_valid)) $$;
create function pg_temp.row_of(p_user uuid) returns public.login_throttle language sql as $$
  select t from public.login_throttle t where t.user_id = p_user $$;

do $$
declare
  v_admin uuid := (select admin_id from t_ctx);
  v_victim uuid := pg_temp.mkuser(1);
  v_out jsonb;
  v_row public.login_throttle;
  v_locked timestamptz;
  i int;
begin
  assert v_admin is not null, 'the seed needs an admin with a login';
  update t_ctx set victim = v_victim;

  -- the schedule
  assert public.login_throttle_wait(5) = interval '0', '5 wrong passwords: no wait';
  assert public.login_throttle_wait(6) = interval '30 seconds' and public.login_throttle_wait(7) = interval '1 minute'
     and public.login_throttle_wait(8) = interval '2 minutes' and public.login_throttle_wait(9) = interval '5 minutes'
     and public.login_throttle_wait(10) = interval '15 minutes' and public.login_throttle_wait(11) = interval '30 minutes'
     and public.login_throttle_wait(500) = interval '30 minutes', 'growing waits, capped at 30 minutes';

  -- a right password of an account without failures leaves no row
  assert pg_temp.hook(v_victim, true) = '{"decision": "continue"}'::jsonb, 'right password continues';
  assert not exists (select 1 from public.login_throttle where user_id = v_victim), 'no row for a clean sign-in';

  -- five wrong passwords are free
  for i in 1..5 loop
    assert pg_temp.hook(v_victim, false) = '{"decision": "continue"}'::jsonb, 'wrong password ' || i || ' is left to Auth';
  end loop;
  v_row := pg_temp.row_of(v_victim);
  assert v_row.failed_count = 5 and v_row.locked_until is null, 'five failures, no wait yet';

  -- the sixth starts the first wait
  assert pg_temp.hook(v_victim, false) = '{"decision": "continue"}'::jsonb, 'the sixth is still answered by Auth';
  v_row := pg_temp.row_of(v_victim);
  assert v_row.failed_count = 6 and v_row.locked_until between now() + interval '25 seconds' and now() + interval '35 seconds', 'first wait is 30 seconds';
  v_locked := v_row.locked_until;
  assert exists (select 1 from public.notifications where user_id = v_admin and type = 'login_lockout' and dedupe_key = 'login_lockout:' || v_victim),
    'the admins hear about the first wait';

  -- while it waits: refused like a wrong password, a right one too, and nothing is counted or extended
  v_out := pg_temp.hook(v_victim, true);
  assert v_out -> 'error' ->> 'message' = 'Invalid login credentials' and (v_out -> 'error' ->> 'http_code')::int = 400 and not (v_out ? 'decision'),
    'a waiting account refuses a right password with the wrong-password text: ' || v_out::text;
  assert pg_temp.hook(v_victim, false) ? 'error', 'a wrong password is refused too';
  v_row := pg_temp.row_of(v_victim);
  assert v_row.failed_count = 6 and v_row.locked_until = v_locked, 'refused attempts do not count or extend the wait';

  -- after the wait the next wrong password raises it
  update public.login_throttle set locked_until = now() - interval '1 second' where user_id = v_victim;
  perform pg_temp.hook(v_victim, false);
  v_row := pg_temp.row_of(v_victim);
  assert v_row.failed_count = 7 and v_row.locked_until between now() + interval '55 seconds' and now() + interval '65 seconds', 'second wait is a minute';

  -- a right password after the wait lets in and clears the count
  update public.login_throttle set locked_until = now() - interval '1 second' where user_id = v_victim;
  assert pg_temp.hook(v_victim, true) = '{"decision": "continue"}'::jsonb, 'right password after the wait continues';
  assert not exists (select 1 from public.login_throttle where user_id = v_victim), 'and the count is gone';

  -- a day without failures starts the count again
  for i in 1..3 loop perform pg_temp.hook(v_victim, false); end loop;
  update public.login_throttle set last_failed_at = now() - interval '25 hours' where user_id = v_victim;
  perform pg_temp.hook(v_victim, false);
  assert (pg_temp.row_of(v_victim)).failed_count = 1, 'the count starts again after a day';

  -- fails open
  assert pg_temp.hook(v_victim, false) is not null, 'sanity';
  assert public.hook_password_verification_attempt('{"user_id": "not-a-uuid", "valid": false}'::jsonb) = '{"decision": "continue"}'::jsonb,
    'a failing hook lets the sign-in through';
end $$;

-- five accounts waiting at the same time is an attack: push + mail type, once
do $$
declare
  v_admin uuid := (select admin_id from t_ctx);
  v_user uuid;
  i int; j int;
begin
  for i in 2..6 loop
    v_user := pg_temp.mkuser(i);
    for j in 1..6 loop perform pg_temp.hook(v_user, false); end loop;
  end loop;
  assert (select count(*) from public.notifications where user_id = v_admin and type = 'login_attack') = 1,
    'one attack notice for five waiting accounts (and not one per account)';
  assert (select push and email from public.notification_types where type = 'login_attack'), 'the attack notice is pushed and mailed';
  assert not (select push or email from public.notification_types where type = 'login_lockout'), 'the single-account notice stays in the bell';
end $$;

-- rights
do $$
begin
  assert has_function_privilege('supabase_auth_admin', 'public.hook_password_verification_attempt(jsonb)', 'execute'), 'Auth runs the hook';
  assert not has_function_privilege('authenticated', 'public.hook_password_verification_attempt(jsonb)', 'execute'), 'signed-in users must not run the hook';
  assert not has_function_privilege('anon', 'public.hook_password_verification_attempt(jsonb)', 'execute'), 'anon must not run the hook';
  assert not has_function_privilege('authenticated', 'public.login_throttle_alert(uuid, integer)', 'execute'), 'signed-in users must not call the alert';
  assert not has_table_privilege('anon', 'public.login_throttle', 'select'), 'anon must not read the table';
  assert not has_table_privilege('authenticated', 'public.login_throttle', 'insert') and not has_table_privilege('authenticated', 'public.login_throttle', 'update')
     and not has_table_privilege('authenticated', 'public.login_throttle', 'delete'), 'signed-in users cannot write the table';
end $$;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;
grant execute on function pg_temp.act_as(uuid) to public;

-- an admin reads the table and clears an account; somebody else sees nothing and cannot clear
create temp table t_other on commit drop as select pg_temp.mkuser(9) as id;
grant select on t_other to public;
set local role authenticated;
do $$
declare
  v_admin uuid := (select admin_id from t_ctx);
  v_victim uuid := (select victim from t_ctx);
  v_target uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  perform pg_temp.act_as(v_admin);
  assert exists (select 1 from public.login_throttle where user_id = v_victim), 'an admin sees who waits';
  perform public.login_throttle_clear(v_victim);
  assert not exists (select 1 from public.login_throttle where user_id = v_victim), 'an admin clears an account';

  perform pg_temp.act_as((select id from t_other));
  assert not exists (select 1 from public.login_throttle), 'somebody without rights reads nothing';
  begin
    perform public.login_throttle_clear(v_target);
    raise exception 'somebody without rights cleared an account';
  exception when others then
    assert sqlerrm like '%cannot change this login%', 'refused: ' || sqlerrm;
  end;
end $$;
reset role;

rollback;
select 'login_throttle_smoke: all checks passed' as result;
