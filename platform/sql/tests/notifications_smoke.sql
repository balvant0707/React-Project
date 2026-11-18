-- apps: compass
-- New test (no direct source; logic of notify() is COMPASS's): dedupe, muting through the type registry, retract.
begin;
select public.notification_type_register('smoke_switchable', 'smoke', true);
select public.notification_type_register('smoke_fixed', 'smoke', false);

do $$
declare
  v_a uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_b uuid := (select id from public.users where email = 'ben.keller@example.com');
begin
  perform public.notify(array[v_a, v_b], 'smoke_fixed', 'Hello', '/x', null, null, 'users', v_a, 'k1');
  perform public.notify(array[v_a], 'smoke_fixed', 'Hello again', '/x', null, null, 'users', v_a, 'k1');
  assert (select count(*) from public.notifications where dedupe_key = 'k1') = 2, 'one row per user and key';
  assert (select occurrences from public.notifications where dedupe_key = 'k1' and user_id = v_a) = 2, 'same key counts occurrences';
  assert (select title from public.notifications where dedupe_key = 'k1' and user_id = v_a) = 'Hello again', 'latest text wins';

  insert into public.notification_preferences (user_id, muted_types) values (v_a, array['smoke_switchable', 'smoke_fixed', 'unknown']);
  assert (select muted_types from public.notification_preferences where user_id = v_a) = array['smoke_switchable'], 'only switchable types can be muted';
  perform public.notify(array[v_a, v_b], 'smoke_switchable', 'Muted for a', '/y', null, null, null, null, 'k2');
  assert (select count(*) from public.notifications where dedupe_key = 'k2') = 1, 'muted user gets nothing';
  assert (select user_id from public.notifications where dedupe_key = 'k2') = v_b, 'the other user does';

  perform public.notifications_retract(array['k1']);
  assert not exists (select 1 from public.notifications where dedupe_key = 'k1' and read_at is null and occurrences <= 1 and user_id = v_b), 'retract removes the unread single';
end $$;

select 'notifications_smoke: all checks passed' as result;
rollback;
