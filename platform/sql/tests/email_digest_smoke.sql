-- New test (logic of the digest is COMPASS's email_pending / email_claim): which notifications go into the daily mail
-- (the types flagged in the registry, plus NPM's 'email' channel), opt-out, read rows, claim / release, admin-only settings.
-- Runs in every app (picks two users with an address).
begin;
select public.notification_type_register('smoke_mailed', 'smoke', false, null, false, true);
select public.notification_type_register('smoke_quiet', 'smoke', false);

do $$
declare
  v_a uuid := (select id from public.users where email is not null and has_login order by email limit 1);
  v_b uuid := (select id from public.users where email is not null and has_login and id <> v_a order by email limit 1);
  v_ids uuid[];
begin
  assert 'smoke_mailed' = any (public.email_notification_types()), 'flagged type is mailed';
  assert not ('smoke_quiet' = any (public.email_notification_types())), 'unflagged type is not';
  -- registering again without p_email keeps the flag
  perform public.notification_type_register('smoke_mailed', 'smoke', false, 'again');
  assert (select email from public.notification_types where type = 'smoke_mailed'), 're-register keeps the flag';

  perform public.notify(array[v_a, v_b], 'smoke_mailed', 'Mailed', '/x', null, null, null, null, 'e1');
  perform public.notify(array[v_a], 'smoke_quiet', 'Bell only', '/x', null, null, null, null, 'e2');
  perform public.notify(array[v_a], 'smoke_quiet', 'On the email channel', '/x', null, null, null, null, 'e3', array['in_app', 'email']);

  update public.email_settings set enabled = false;
  assert not exists (select 1 from public.email_pending() where title in ('Mailed', 'On the email channel')), 'switched off: nothing pending';

  update public.email_settings set enabled = true;
  assert (select count(*) from public.email_pending() where user_id = v_a and title in ('Mailed', 'On the email channel')) = 2,
    'flagged type and email channel are pending';
  assert not exists (select 1 from public.email_pending() where title = 'Bell only'), 'bell-only type is not';

  update public.notifications set read_at = now() where dedupe_key = 'e1' and user_id = v_b;
  assert not exists (select 1 from public.email_pending() where user_id = v_b and title = 'Mailed'), 'read in the app: no mail';

  insert into public.notification_preferences (user_id, email_enabled) values (v_a, false)
    on conflict (user_id) do update set email_enabled = false;
  assert not exists (select 1 from public.email_pending() where user_id = v_a and title in ('Mailed', 'On the email channel')), 'opted out: no mail';
  update public.notification_preferences set email_enabled = true where user_id = v_a;

  select array_agg(id) into v_ids from public.email_claim() where title in ('Mailed', 'On the email channel');
  assert cardinality(v_ids) = 2, 'claim takes both';
  assert not exists (select 1 from public.email_pending() where id = any (v_ids)), 'claimed rows are no longer pending';
  perform public.email_release(v_ids);
  assert (select count(*) from public.email_pending() where id = any (v_ids)) = 2, 'released rows are pending again';

  perform public.email_record_run(1, null, true);
  assert (select last_digest_on from public.email_settings) is not null, 'a finished run records the day';
  assert public.email_dispatch_trigger(false) is null, 'already sent today: no second wake-up';
end $$;

-- Settings: admins only; a non-admin may not read the secrets either.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select u.id from public.users u where u.has_login and not exists (
  select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = u.id and r.name = 'Admin') order by u.email limit 1),
  'role', 'authenticated', 'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password')))::text, true);
do $$
begin
  begin
    perform public.email_settings_save('{"enabled": false}');
    raise exception 'FAIL: non-admin saved the email settings';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform (select password from public.email_settings);
    raise exception 'FAIL: password column readable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Transports (20261110250000): SMTP needs host and sender to switch on, another transport does not; unknown keys refused.
select public.email_transport_register('smoke_relay', 'Smoke relay', 'smoke', 99);
do $$
declare
  v_admin uuid := (select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where r.name = 'Admin' limit 1);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin
    perform public.email_settings_save('{"enabled": true, "transport": "smtp"}');
    raise exception 'FAIL: SMTP switched on without host';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform public.email_settings_save('{"enabled": true, "transport": "smoke_relay", "transport_config": {"mailbox_id": "x"}}');
  assert (select transport = 'smoke_relay' and transport_config ->> 'mailbox_id' = 'x' from public.email_settings), 'relay transport saved';
  perform public.email_settings_save('{"enabled": true}');
  assert (select transport = 'smoke_relay' and transport_config ->> 'mailbox_id' = 'x' from public.email_settings), 'transport kept when not sent';
  begin
    perform public.email_settings_save('{"transport": "nope"}');
    raise exception 'FAIL: unknown transport saved';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end $$;

select 'email_digest_smoke: all checks passed' as result;
rollback;
