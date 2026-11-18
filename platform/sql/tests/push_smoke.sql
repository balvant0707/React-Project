-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/push_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Web Push smoke test (migration 20261122100000_web_push.sql): devices, which notifications are claimed for sending,
-- claim once, release, re-arm, waking the function. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/push_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
grant execute on all functions in schema pg_temp to public;

-- The schedule must not call out during the test.
update public.push_settings set dispatch_url = null;

-- 1. A device belongs to its person; another person signing in on it takes it over
select pg_temp.as_user('anna.weber@example.com');
select public.push_subscribe('https://push.example.test/anna-phone', 'p256', 'auth', 'Test phone');
do $$ begin
  assert (select count(*) from public.push_subscriptions) = 1, 'anna sees her device';
  begin perform public.push_subscribe('http://push.example.test/x', 'p', 'a', null); raise exception 'plain http accepted';
  exception when others then if sqlerrm like 'plain http%' then raise; end if; end;
  begin perform public.push_claim(null); raise exception 'anna claimed';
  exception when others then if sqlerrm like 'anna claimed%' then raise; end if; end;
  begin perform 1 from public.push_settings; raise exception 'anna read the push settings';
  exception when others then if sqlerrm like 'anna read%' then raise; end if; end;
end $$;
reset role;
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select count(*) from public.push_subscriptions) = 0, 'ben does not see anna''s device';
end $$;
select public.push_subscribe('https://push.example.test/shared-tablet', 'p256', 'auth', 'Tablet');
reset role;
select pg_temp.as_user('anna.weber@example.com');
select public.push_subscribe('https://push.example.test/shared-tablet', 'p256', 'auth', 'Tablet');
reset role;
do $$ begin
  assert (select user_id from public.push_subscriptions where endpoint = 'https://push.example.test/shared-tablet') = pg_temp.uid('anna.weber@example.com'),
    'the shared tablet moved to anna';
end $$;

-- 2. What is claimed: push types, unread, people with a device, the last hour, each row once
select public.notify(array[pg_temp.uid('anna.weber@example.com'), pg_temp.uid('ben.keller@example.com')], 'mention', 'Mention', '/tasks/x', 'Hello');
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'task_reminder_overdue', 'Overdue', '/tasks/x', null);
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'comment', 'Read already', '/tasks/x', null);
update public.notifications set read_at = now() where title = 'Read already';
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'comment', 'Old', '/tasks/x', null);
update public.notifications set created_at = now() - interval '2 hours' where title = 'Old';
-- Grace period: nothing is claimed before it is 90 seconds old
do $$ begin
  assert (select count(*) from public.push_claim(null) c where c.title = 'Mention') = 0, 'a fresh notification waits';
end $$;
update public.notifications set created_at = now() - interval '2 minutes' where title in ('Mention', 'Overdue', 'Read already');
do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.push_claim(null) c where c.title in ('Mention', 'Overdue', 'Read already', 'Old');
  assert v_rows = 1, format('only anna''s mention is claimed (got %s)', v_rows);
  assert (select count(*) from public.push_claim(null) c where c.title = 'Mention') = 0, 'a claimed row is not claimed again';
  perform public.push_release(array(select id from public.notifications where title = 'Mention' and user_id = pg_temp.uid('anna.weber@example.com')));
  assert (select count(*) from public.push_claim(null) c where c.title = 'Mention') = 1, 'a released row is claimed again';
end $$;

-- 3. Re-armed (same dedupe key while unread): due again
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'team_post', 'Post 1', '/messages/x', null, null, null, null, 'group-post:test');
select count(*) from public.push_claim(null);
update public.notifications set created_at = now() - interval '1 minute' where dedupe_key = 'group-post:test';
update public.notifications set push_sent_at = now() where dedupe_key = 'group-post:test';
select public.notify(array[pg_temp.uid('anna.weber@example.com')], 'team_post', 'Post 2', '/messages/x', null, null, null, null, 'group-post:test');
do $$ begin
  assert (select push_sent_at from public.notifications where dedupe_key = 'group-post:test') is null, 'a re-armed notification is due again';
  assert (select occurrences from public.notifications where dedupe_key = 'group-post:test') = 2, 'still one row';
end $$;

-- 4. The schedule wakes the function only for what is due: one request, none for fresh rows, nobody without a device,
-- no pushed type, no release
update public.push_settings set dispatch_url = 'http://push.invalid/functions/v1/send-push';
do $$
declare v_before bigint := (select count(*) from net.http_request_queue);
begin
  perform public.notify(array[pg_temp.uid('anna.weber@example.com'), pg_temp.uid('ben.keller@example.com')], 'task_assigned', 'Wake', '/tasks/x', null);
  perform public.push_dispatch_due();
  assert (select count(*) from net.http_request_queue) = v_before, 'a fresh notification wakes nothing';
  update public.notifications set created_at = now() - interval '2 minutes' where title = 'Wake';
  perform public.push_dispatch_due();
  assert (select count(*) from net.http_request_queue) = v_before + 1, 'one request once it is due';
  assert (select convert_from(body, 'utf8') from net.http_request_queue order by id desc limit 1) like '%dispatch%', 'dispatch call';
  perform public.push_claim(null);
  perform public.notify(array[pg_temp.uid('tom.berger@example.com')], 'task_assigned', 'Nobody has a device', '/tasks/x', null);
  update public.notifications set created_at = now() - interval '2 minutes' where title = 'Nobody has a device';
  perform public.notify(array[pg_temp.uid('anna.weber@example.com')], 'task_reminder_overdue', 'Not a push type', '/tasks/x', null);
  update public.notifications set created_at = now() - interval '2 minutes' where title = 'Not a push type';
  perform public.push_dispatch_due();
  assert (select count(*) from net.http_request_queue) = v_before + 1, 'no request for nobody or for a type that is not pushed';
  perform public.push_release(array(select id from public.notifications where title = 'Mention'));
  assert (select count(*) from net.http_request_queue) = v_before + 1, 'releasing does not wake the function';
end $$;

-- 5. A person removes a device
select pg_temp.as_user('anna.weber@example.com');
delete from public.push_subscriptions where endpoint = 'https://push.example.test/anna-phone';
reset role;
do $$ begin
  assert not exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example.test/anna-phone'), 'device removed';
end $$;

select 'push smoke test passed' as result;
rollback;
