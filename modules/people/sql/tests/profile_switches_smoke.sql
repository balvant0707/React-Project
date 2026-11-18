-- Copied from ~/maintenance_tool/supabase/tests/profile_switches_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Profile switches smoke test (migration 20261214100000_birthday_hidden_and_quiet_hours.sql): hiding one's birthday,
-- quiet hours for push. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/profile_switches_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
grant execute on all functions in schema pg_temp to public;

-- 1. Birthday: the person hides it, day and month disappear for everybody; shown again, they come back from person_private
reset role;
insert into public.person_private (user_id, birth_date) values (pg_temp.uid('anna.weber@example.com'), '1990-03-12')
  on conflict (user_id) do update set birth_date = excluded.birth_date;
select pg_temp.as_user('anna.weber@example.com');
update public.users set birthday_hidden = true where id = auth.uid();
reset role;
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select birthday_month is null and birthday_day is null and birthday_hidden from public.users where email = 'anna.weber@example.com'),
    'a hidden birthday has no day and month';
  begin
    update public.users set birthday_hidden = false where email = 'anna.weber@example.com';
    assert (select birthday_hidden from public.users where email = 'anna.weber@example.com'), 'ben changed anna''s switch';
  exception when others then if sqlerrm like 'ben changed%' then raise; end if; end;
  begin
    update public.users set birthday_month = 1, birthday_day = 1 where id = auth.uid();
    raise exception 'ben set his birthday himself';
  exception when others then if sqlerrm like 'ben set%' then raise; end if; end;
end $$;
reset role;
-- HR changes the date while it is hidden: it stays hidden
select pg_temp.as_user('hanna.richter@example.com');
update public.person_private set birth_date = '1990-04-20' where user_id = pg_temp.uid('anna.weber@example.com');
do $$ begin
  assert (select birthday_month from public.users where email = 'anna.weber@example.com') is null, 'a new date stays hidden';
end $$;
reset role;
select pg_temp.as_user('anna.weber@example.com');
update public.users set birthday_hidden = false where id = auth.uid();
reset role;
do $$ begin
  assert (select birthday_month = 4 and birthday_day = 20 from public.users where email = 'anna.weber@example.com'), 'shown again from person_private';
end $$;

-- 2. Quiet hours: the window, also across midnight (local time of the e-mail settings)
do $$
declare v_tz text := coalesce((select timezone from public.email_settings), 'Europe/Berlin');
begin
  assert public.push_in_quiet_hours('22:00', '06:00', ('2026-11-02 23:30'::timestamp at time zone v_tz)), '23:30 is quiet';
  assert public.push_in_quiet_hours('22:00', '06:00', ('2026-11-02 05:59'::timestamp at time zone v_tz)), '05:59 is quiet';
  assert not public.push_in_quiet_hours('22:00', '06:00', ('2026-11-02 06:00'::timestamp at time zone v_tz)), '06:00 is not';
  assert public.push_in_quiet_hours('12:00', '13:00', ('2026-11-02 12:30'::timestamp at time zone v_tz)), 'lunch window';
  assert not public.push_in_quiet_hours('12:00', '13:00', ('2026-11-02 13:30'::timestamp at time zone v_tz)), 'after lunch';
  assert not public.push_in_quiet_hours(null, null), 'no window';
end $$;
select pg_temp.as_user('anna.weber@example.com');
do $$ begin
  begin
    insert into public.notification_preferences (user_id, push_quiet_from) values (auth.uid(), '22:00');
    raise exception 'half a window accepted';
  exception when others then if sqlerrm like 'half a window%' then raise; end if; end;
  begin perform public.push_in_quiet_hours('22:00', '06:00'); raise exception 'anna called the helper';
  exception when others then if sqlerrm like 'anna called%' then raise; end if; end;
end $$;
reset role;

-- 3. push_claim: a person in quiet hours is not pushed, and the row is not pushed later either
update public.push_settings set dispatch_url = null;
select pg_temp.as_user('anna.weber@example.com');
select public.push_subscribe('https://push.example.test/anna-quiet', 'p256', 'auth', 'Test phone');
-- a window around now in local time
insert into public.notification_preferences (user_id, push_quiet_from, push_quiet_to)
  values (auth.uid(),
          ((now() at time zone coalesce((select timezone from public.email_settings), 'Europe/Berlin')) - interval '1 hour')::time,
          ((now() at time zone coalesce((select timezone from public.email_settings), 'Europe/Berlin')) + interval '1 hour')::time)
  on conflict (user_id) do update set push_quiet_from = excluded.push_quiet_from, push_quiet_to = excluded.push_quiet_to;
reset role;
select pg_temp.as_user('ben.keller@example.com');
select public.push_subscribe('https://push.example.test/ben-loud', 'p256', 'auth', 'Test phone');
reset role;
select public.notify(array[pg_temp.uid('anna.weber@example.com'), pg_temp.uid('ben.keller@example.com')], 'direct_message', 'Quiet test', '/messages/x', 'Hi');
update public.notifications set created_at = now() - interval '2 minutes' where title = 'Quiet test';
do $$ begin
  assert (select array_agg(c.user_id) from public.push_claim(null) c where c.title = 'Quiet test') = array[pg_temp.uid('ben.keller@example.com')],
    'only ben (no quiet hours) is pushed';
  assert (select push_sent_at from public.notifications where title = 'Quiet test' and user_id = pg_temp.uid('anna.weber@example.com')) is not null,
    'anna''s row is handled, not kept for later';
  assert (select read_at from public.notifications where title = 'Quiet test' and user_id = pg_temp.uid('anna.weber@example.com')) is null,
    'it stays unread in the bell';
end $$;
update public.notification_preferences set push_quiet_from = null, push_quiet_to = null where user_id = pg_temp.uid('anna.weber@example.com');
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'direct_message', 'Loud test', '/messages/x', 'Hi');
update public.notifications set created_at = now() - interval '2 minutes' where title = 'Loud test';
do $$ begin
  assert (select count(*) from public.push_claim(null) c where c.title = 'Loud test') = 1, 'without quiet hours anna is pushed';
end $$;

select 'profile switches smoke test passed' as result;
rollback;
