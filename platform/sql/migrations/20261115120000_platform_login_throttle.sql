-- Password sign-in throttle per account, for a botnet that guesses from many addresses (the per-address limit of Supabase
-- Auth does not see it). Supabase Auth calls hook_password_verification_attempt after every password check of an existing
-- account (Authentication > Hooks, docs/deploy.md "Sign-in throttle"):
--   * Wrong passwords are counted per account; the fifth is free typo room, every further one starts a growing wait
--     (login_throttle_wait): 30 s, 1 min, 2 min, 5 min, 15 min, then 30 min at most.
--   * While an account waits, every attempt is refused, a right password too (else guessing would go on), and the refused
--     attempts neither count nor extend the wait: whoever hammers an account cannot keep its owner out for longer than
--     30 minutes at a time.
--   * The count starts again after a right password, or 24 hours after the last wrong one.
--   * The refusal reads exactly like a wrong password ("Invalid login credentials"); the app shows its normal text. Nothing on
--     the sign-in page tells that an account is waiting. Admins are told in the bell (and, for an attack, by push and in the
--     daily mail): login_lockout for one account, login_attack when five or more accounts wait within an hour.
--   * A failure inside the hook lets the sign-in through (fail open): the throttle must never lock everybody out.
create table public.login_throttle (
  user_id uuid primary key references public.users (id) on delete cascade,
  failed_count integer not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz
);
create index login_throttle_failed_idx on public.login_throttle (last_failed_at) where locked_until is not null;
alter table public.login_throttle enable row level security;
create policy mfa_required on public.login_throttle as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
-- Whoever may manage a person's login sees whether that account waits (Admin > Users); nobody else reads or writes the table,
-- the hook and the functions below do.
create policy "Login managers read the login throttle" on public.login_throttle for select to authenticated
  using (public.may_manage_login(user_id));
revoke all on public.login_throttle from anon, authenticated;
grant select on public.login_throttle to authenticated;
grant all on public.login_throttle to service_role;

create function public.login_throttle_wait(p_failed integer) returns interval
  language sql immutable set search_path to ''
as $$
  select case
    when p_failed <= 5 then interval '0'
    when p_failed = 6 then interval '30 seconds'
    when p_failed = 7 then interval '1 minute'
    when p_failed = 8 then interval '2 minutes'
    when p_failed = 9 then interval '5 minutes'
    when p_failed = 10 then interval '15 minutes'
    else interval '30 minutes'
  end
$$;
revoke all on function public.login_throttle_wait(integer) from public, anon, authenticated, service_role;
grant execute on function public.login_throttle_wait(integer) to service_role;

select public.notification_type_register('login_lockout', 'platform', false, 'Repeated failed sign-ins for one account', false, false);
select public.notification_type_register('login_attack', 'platform', false, 'Possible password guessing against several accounts', true, true);

-- Tells the admins. One unread notice per account (and one for an attack) is kept up to date instead of a new one each time.
create function public.login_throttle_alert(p_user_id uuid, p_failed integer) returns void
  language plpgsql security definer set search_path to ''
as $$
declare
  v_admins uuid[];
  v_name text;
  v_waiting integer;
begin
  select coalesce(array_agg(distinct ur.user_id), '{}') into v_admins
  from public.user_roles ur join public.roles r on r.id = ur.role_id join public.users u on u.id = ur.user_id
  where r.name = 'Admin' and u.has_login and not u.has_left;
  if cardinality(v_admins) = 0 then
    return;
  end if;

  -- The first wait and every step up to a quarter of an hour are worth a look; the later ones only repeat it.
  if p_failed in (6, 10) then
    select coalesce(nullif(btrim(u.name), ''), u.username) into v_name from public.users u where u.id = p_user_id;
    perform public.notify(
      v_admins, 'login_lockout', 'Repeated failed sign-ins for ' || coalesce(v_name, 'an account'), '/admin/users', null,
      p_user_id, null, null, 'login_lockout:' || p_user_id, array['in_app'],
      jsonb_build_object('user_name', coalesce(v_name, ''), 'failed_count', p_failed));
  end if;

  select count(*) into v_waiting from public.login_throttle t
  where t.locked_until is not null and t.last_failed_at > now() - interval '1 hour' and t.failed_count >= 6;
  -- Looked at when an account starts waiting; one notice per half hour at most (a push each, in a real attack).
  if p_failed = 6 and v_waiting >= 5 and not exists (
       select 1 from public.notifications n where n.type = 'login_attack' and n.created_at > now() - interval '30 minutes') then
    perform public.notify(
      v_admins, 'login_attack', 'Possible password guessing: ' || v_waiting || ' accounts are waiting', '/admin/users', null,
      null, null, null, 'login_attack', array['in_app', 'toast'],
      jsonb_build_object('accounts', v_waiting));
  end if;
end;
$$;
revoke all on function public.login_throttle_alert(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.login_throttle_alert(uuid, integer) to service_role;

create function public.hook_password_verification_attempt(event jsonb) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_user uuid;
  v_valid boolean;
  v_locked timestamptz;
  v_failed integer;
  v_wait interval;
begin
  v_user := (event ->> 'user_id')::uuid;
  v_valid := coalesce((event ->> 'valid')::boolean, false);
  select t.locked_until into v_locked from public.login_throttle t where t.user_id = v_user for update;
  if v_locked is not null and v_locked > now() then
    -- The same answer as for a wrong password; the attempt is not counted.
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Invalid login credentials'));
  end if;

  if v_valid then
    delete from public.login_throttle where user_id = v_user;
    return jsonb_build_object('decision', 'continue');
  end if;

  insert into public.login_throttle as t (user_id, failed_count, last_failed_at)
  values (v_user, 1, now())
  on conflict (user_id) do update set
    failed_count = case when t.last_failed_at is null or t.last_failed_at < now() - interval '24 hours' then 1 else t.failed_count + 1 end,
    last_failed_at = now()
  returning t.failed_count into v_failed;
  v_wait := public.login_throttle_wait(v_failed);
  if v_wait > interval '0' then
    update public.login_throttle set locked_until = now() + v_wait where user_id = v_user;
    begin
      perform public.login_throttle_alert(v_user, v_failed);
    exception when others then
      raise warning 'login_throttle_alert: %', sqlerrm;
    end;
  else
    update public.login_throttle set locked_until = null where user_id = v_user;
  end if;
  return jsonb_build_object('decision', 'continue');
exception when others then
  raise warning 'hook_password_verification_attempt: %', sqlerrm;
  return jsonb_build_object('decision', 'continue');
end;
$$;
alter function public.hook_password_verification_attempt(jsonb) owner to postgres;
revoke all on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin, service_role;

-- An admin (or whoever may manage this person's login) lets an account in again before the wait is over.
create function public.login_throttle_clear(p_user_id uuid) returns void
  language plpgsql security definer set search_path to ''
as $$
begin
  if not public.may_manage_login(p_user_id) then
    raise exception 'You cannot change this login' using errcode = '42501';
  end if;
  delete from public.login_throttle where user_id = p_user_id;
end;
$$;
revoke all on function public.login_throttle_clear(uuid) from public, anon, authenticated, service_role;
grant execute on function public.login_throttle_clear(uuid) to authenticated, service_role;
