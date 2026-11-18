-- Push: the later COMPASS state the platform's push (20261109180000_platform_push.sql) was missing. The profile page already
-- saves quiet hours (notification_preferences.push_quiet_from / _to), but nothing honoured them.
--   1. Taken over 1:1 from COMPASS 20261210100000_push_grace.sql: a notification is pushed only when it is still unread
--      90 seconds after it was written; the wake trigger goes, the schedule (every 30 seconds) is the only sender.
--   2. Taken over 1:1 from COMPASS 20261214100000_birthday_hidden_and_quiet_hours.sql, part "Quiet hours for push" without
--      its columns (the platform has them): push_in_quiet_hours() and push_claim() skipping people in their quiet hours.
-- Tests: compass_push_smoke.sql, compass_profile_switches_smoke.sql.

drop trigger if exists notifications_push_wake_insert on public.notifications;
drop trigger if exists notifications_push_wake_update on public.notifications;
drop function if exists public.notifications_push_wake();

-- As before (unread, push type, person with a device, last hour, each row once), plus: written at least 90 seconds
-- ago. A re-armed row (notify() bumps created_at) waits again.
create or replace function public.push_claim(p_ids uuid[])
returns table (id uuid, user_id uuid, language text, type text, title text, body text, link text, params jsonb,
               dedupe_key text, channels text[], created_at timestamptz)
language sql
security definer set search_path = ''
as $$
  with claimed as (
    update public.notifications n set push_sent_at = now()
    where n.push_sent_at is null and n.read_at is null
      and n.type = any (public.push_notification_types())
      and n.created_at <= now() - interval '90 seconds'
      and n.created_at > now() - interval '1 hour'
      and (p_ids is null or n.id = any (p_ids))
      and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
    returning n.id, n.user_id, n.type, n.title, n.body, n.link, n.params, n.dedupe_key, n.channels, n.created_at
  )
  select c.id, c.user_id, u.language, c.type, c.title, c.body, c.link, c.params, c.dedupe_key, c.channels, c.created_at
  from claimed c join public.users u on u.id = c.user_id
  order by c.created_at
$$;

-- What the schedule runs: wakes the function only when something is due.
create function public.push_dispatch_due()
returns bigint
language sql
security definer set search_path = ''
as $$
  select public.push_dispatch(null)
  where exists (
    select 1 from public.notifications n
    where n.push_sent_at is null and n.read_at is null
      and n.created_at <= now() - interval '90 seconds' and n.created_at > now() - interval '1 hour'
      and n.type = any (public.push_notification_types())
      and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
  )
$$;
revoke execute on function public.push_dispatch_due() from public, anon, authenticated;
grant execute on function public.push_dispatch_due() to service_role;

do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.schedule('send-push', '30 seconds', 'select public.push_dispatch_due()');
  exception when others then
    -- pg_cron without second-level schedules: every minute
    perform cron.schedule('send-push', '* * * * *', 'select public.push_dispatch_due()');
  end;
exception when others then
  raise notice 'pg_cron unavailable (%): schedule public.push_dispatch_due() externally', sqlerrm;
end $$;

-- True when p_at falls into the window [from, to) in the app's local time; a window like 22:00-06:00 spans midnight.
create function public.push_in_quiet_hours(p_from time, p_to time, p_at timestamptz default now())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select case
    when p_from is null or p_to is null or p_from = p_to then false
    else (
      select case when p_from < p_to then l.t >= p_from and l.t < p_to else l.t >= p_from or l.t < p_to end
      from (select (p_at at time zone coalesce((select s.timezone from public.email_settings s), 'Europe/Berlin'))::time as t) l)
  end
$$;
revoke execute on function public.push_in_quiet_hours(time, time, timestamptz) from public, anon, authenticated;
grant execute on function public.push_in_quiet_hours(time, time, timestamptz) to service_role;

-- As in 20261210100000_push_grace.sql, plus: rows of a person in quiet hours are marked as handled but not returned,
-- so they are never pushed (no burst when the quiet hours end).
create or replace function public.push_claim(p_ids uuid[])
returns table (id uuid, user_id uuid, language text, type text, title text, body text, link text, params jsonb,
               dedupe_key text, channels text[], created_at timestamptz)
language sql
security definer set search_path = ''
as $$
  with claimed as (
    update public.notifications n set push_sent_at = now()
    where n.push_sent_at is null and n.read_at is null
      and n.type = any (public.push_notification_types())
      and n.created_at <= now() - interval '90 seconds'
      and n.created_at > now() - interval '1 hour'
      and (p_ids is null or n.id = any (p_ids))
      and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
    returning n.id, n.user_id, n.type, n.title, n.body, n.link, n.params, n.dedupe_key, n.channels, n.created_at
  )
  select c.id, c.user_id, u.language, c.type, c.title, c.body, c.link, c.params, c.dedupe_key, c.channels, c.created_at
  from claimed c
  join public.users u on u.id = c.user_id
  left join public.notification_preferences p on p.user_id = c.user_id
  where not public.push_in_quiet_hours(p.push_quiet_from, p.push_quiet_to)
  order by c.created_at
$$;
