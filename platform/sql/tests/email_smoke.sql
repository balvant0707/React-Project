-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/email_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Email settings smoke test: psql -f supabase/tests/email_smoke.sql (local stack, freshly reset). One line per check.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.attempt(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'NO ERROR (allowed)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;

-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;
begin;
select pg_temp.as_user('anna.weber@example.com');
select '1 worker cannot read the settings', count(*) from public.email_settings;
select '2 worker cannot save settings', pg_temp.attempt($q$select public.email_settings_save('{"enabled": false}'::jsonb)$q$);
select '3 worker can ask whether email is on', public.email_delivery_enabled();
select '4 worker cannot call the dispatch', pg_temp.attempt($q$select public.email_dispatch_run_now()$q$);
select '5 worker cannot read the pending digest', pg_temp.attempt($q$select * from public.email_pending()$q$);
reset role;

select pg_temp.as_user('max.wilckens@wilckens.com');
select '6 admin reads the settings', count(*) from public.email_settings;
select '7 admin cannot select the password column', pg_temp.attempt($q$select password from public.email_settings$q$);
select '8 admin cannot select the dispatch token', pg_temp.attempt($q$select dispatch_token from public.email_settings$q$);
select '9 switching on without host is refused', pg_temp.attempt($q$select public.email_settings_save('{"enabled": true, "host": "", "from_address": ""}'::jsonb)$q$);
select public.email_settings_save('{"enabled": true, "host": "smtp.example.com", "port": 587, "security": "starttls", "username": "u", "password": "secret", "from_address": "a@example.com", "app_url": "https://x.example.com/"}'::jsonb);
select '10 password is stored and reported as set', public.email_password_is_set();
select '12 trailing slash of the app url is dropped', app_url from public.email_settings;
select public.email_settings_save('{"enabled": true, "host": "smtp.example.com", "from_address": "a@example.com"}'::jsonb);
select '11 saving without a password keeps it', public.email_password_is_set();
select public.email_settings_save('{"enabled": true, "host": "smtp.example.com", "from_address": "a@example.com", "password": ""}'::jsonb);
select '13 empty password removes it', not public.email_password_is_set();
reset role;

-- digest selection
update public.email_settings set enabled = true;
delete from public.notifications;
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 'task_assigned', 't', '/tasks/x');
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 'comment', 'a comment', '/tasks/x');
select public.notify(array[(select id from public.users where email = 'anna.weber@example.com')], 'ticket_created', 'noisy', '/tickets/x');
update public.notifications set created_at = now() - interval '1 hour';
select '14 comment + assignment are pending, a new ticket is not (2)', count(*) from public.email_pending();
update public.notification_preferences set email_enabled = false where false;
insert into public.notification_preferences (user_id, email_enabled) values ((select id from public.users where email = 'anna.weber@example.com'), false);
select '15 a person who switched email off gets none', count(*) from public.email_pending();
update public.notification_preferences set email_enabled = true;
update public.notifications set created_at = now() - interval '4 days';
select '16 older than three days is stale', count(*) from public.email_pending();
update public.notifications set created_at = now() - interval '1 hour';
update public.email_settings set enabled = false;
select '17 nothing while email is off', count(*) from public.email_pending();
update public.email_settings set enabled = true;
update public.notifications set created_at = now() - interval '1 hour';
select '17a claim returns and marks the rows', count(*), (select count(*) from public.notifications where email_sent_at is not null) as marked from public.email_claim();
select '17b a second claim finds nothing', count(*) from public.email_claim();
select public.email_release(array(select id from public.notifications));
select '17c released rows are claimable again', count(*) from public.email_claim();
rollback;

-- the daily schedule
begin;
update public.email_settings set enabled = true, dispatch_url = 'http://localhost:1/none', timezone = 'UTC', digest_time = '00:00', weekdays_only = false, last_digest_on = null;
select '18 digest due: a request is made', public.email_dispatch_trigger() is not null;
update public.email_settings set last_digest_on = (now() at time zone 'UTC')::date;
select '19 already sent today: no request', public.email_dispatch_trigger() is null;
select '20 send now ignores the schedule', public.email_dispatch_trigger(true) is not null;
update public.email_settings set last_digest_on = null, digest_time = '23:59:59';
select '21 before the digest time: no request (unless 23:59:59 has passed)', public.email_dispatch_trigger() is null or (now() at time zone 'UTC')::time >= '23:59:59';
select public.email_record_run(1, null, true);
select '22 a clean run marks today as done', last_digest_on = (now() at time zone 'UTC')::date from public.email_settings;
select public.email_record_run(0, 'smtp down', false);
update public.email_settings set last_digest_on = null;
select public.email_record_run(0, 'smtp down', false);
select '23 a failed run is retried (last_digest_on stays empty)', last_digest_on is null from public.email_settings;
select public.email_record_run(2, 'one bad address', true);
select '24 partly failed run still closes the day', last_digest_on is not null from public.email_settings;
rollback;
