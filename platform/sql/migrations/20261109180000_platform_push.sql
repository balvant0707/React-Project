-- Platform core: web push. Taken over from COMPASS 20261122100000_web_push.sql. Changes: the table push_subscriptions, the column
-- notifications.push_sent_at and the trigger notifications_rearm_push exist already (core, notifications); the list of pushed
-- types is not hard-coded any more but read from the registry (notification_types.push, set by the module that sends a type).

alter table public.notification_types add column push boolean not null default false;

drop function public.notification_type_register(text, text, boolean, text);
create function public.notification_type_register(p_type text, p_module text, p_switchable boolean default false,
                                                  p_description text default null, p_push boolean default false)
  returns void language sql security definer set search_path to ''
  as $$ insert into public.notification_types (type, module, switchable, description, push) values (p_type, p_module, p_switchable, p_description, p_push)
        on conflict (type) do update set module = excluded.module, switchable = excluded.switchable, description = excluded.description, push = excluded.push; $$;
revoke all on function public.notification_type_register(text, text, boolean, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.notification_type_register(text, text, boolean, text, boolean) to service_role;

-- A device registers through this function: the endpoint is unique, and when another person signs in on the same
-- device the row must move to them (the policy would hide the old owner's row from an upsert).
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth_key text, p_user_agent text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth_key, '') = '' then
    raise exception 'Invalid push subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_key, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key,
        user_agent = excluded.user_agent, created_at = now(), last_success_at = null;
end;
$$;
revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

-- ===================================================================================
-- Settings: where the database reaches the function (one row, never readable by the app)
-- ===================================================================================

create table public.push_settings (
  id boolean primary key default true check (id),
  -- Where the database reaches the Edge Function (differs per environment); empty = push is off.
  dispatch_url text,
  -- Shared secret between the database and the function (the function is public, so it checks this).
  dispatch_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  last_run_at timestamptz,
  last_sent_count integer,
  last_error text
);
insert into public.push_settings (id) values (true);
alter table public.push_settings enable row level security;
create policy mfa_required on public.push_settings as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on public.push_settings from anon, authenticated;
grant all on public.push_settings to service_role;

-- ===================================================================================
-- What is pushed
-- ===================================================================================

-- Events somebody should react to soon are the registered notification types flagged push (the module that sends a type
-- decides). Reminders and digests (daily batches) stay in the bell and the mail.
create function public.push_notification_types()
returns text[]
language sql
stable
set search_path = ''
as $$ select coalesce(array_agg(t.type order by t.type), '{}') from public.notification_types t where t.push $$;
revoke execute on function public.push_notification_types() from public, anon;
grant execute on function public.push_notification_types() to authenticated, service_role;

-- Set when the function took a notification for sending; a re-armed notification (notify() with the same dedupe key
-- while unread bumps created_at) is due again.
-- Takes notifications for sending (marks them, returns them with the reader's language), in one statement, so the
-- immediate call and the schedule never send one twice. p_ids null = everything pending of the last hour (older
-- news is no longer worth a buzz). Only people with a device; read ones are skipped.
create function public.push_claim(p_ids uuid[])
returns table (id uuid, user_id uuid, language text, type text, title text, body text, link text, params jsonb,
               dedupe_key text, channels text[], created_at timestamptz)
language sql
security definer set search_path = ''
as $$
  with claimed as (
    update public.notifications n set push_sent_at = now()
    where n.push_sent_at is null and n.read_at is null
      and n.type = any (public.push_notification_types())
      and n.created_at > now() - interval '1 hour'
      and (p_ids is null or n.id = any (p_ids))
      and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
    returning n.id, n.user_id, n.type, n.title, n.body, n.link, n.params, n.dedupe_key, n.channels, n.created_at
  )
  select c.id, c.user_id, u.language, c.type, c.title, c.body, c.link, c.params, c.dedupe_key, c.channels, c.created_at
  from claimed c join public.users u on u.id = c.user_id
  order by c.created_at
$$;
revoke execute on function public.push_claim(uuid[]) from public, anon, authenticated;
grant execute on function public.push_claim(uuid[]) to service_role;

-- Hands rows back after a failure that may pass: the schedule tries again within the hour (not the wake trigger,
-- which would call the function again at once and repeat the failure in a loop).
create function public.push_release(p_ids uuid[])
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform set_config('push.release', '1', true);
  update public.notifications set push_sent_at = null where id = any (p_ids);
  perform set_config('push.release', '', true);
end;
$$;
revoke execute on function public.push_release(uuid[]) from public, anon, authenticated;
grant execute on function public.push_release(uuid[]) to service_role;

create function public.push_record_run(p_sent integer, p_error text)
returns void
language sql
security definer set search_path = ''
as $$
  update public.push_settings set last_run_at = now(), last_sent_count = p_sent, last_error = p_error where id
$$;
revoke execute on function public.push_record_run(integer, text) from public, anon, authenticated;
grant execute on function public.push_record_run(integer, text) to service_role;

create function public.push_runtime_settings()
returns public.push_settings
language sql
stable
security definer set search_path = ''
as $$
  select * from public.push_settings
$$;
revoke execute on function public.push_runtime_settings() from public, anon, authenticated;
grant execute on function public.push_runtime_settings() to service_role;

-- ===================================================================================
-- Waking the function: right after notifications are written, and every 5 minutes for what failed
-- ===================================================================================

create function public.push_dispatch(p_ids uuid[])
returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  s public.push_settings;
  v_request bigint;
begin
  select * into s from public.push_settings;
  if s.dispatch_url is null or s.dispatch_url = '' then
    return null;
  end if;
  select net.http_post(
    url := s.dispatch_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-token', s.dispatch_token),
    body := jsonb_build_object('action', 'dispatch', 'ids', to_jsonb(p_ids)),
    timeout_milliseconds := 20000
  ) into v_request;
  return v_request;
end;
$$;
revoke execute on function public.push_dispatch(uuid[]) from public, anon, authenticated;

-- One call per statement, not per row: a post in a big group writes hundreds of notifications at once. Only rows of
-- a push type for people with a device wake the function.
create function public.notifications_push_wake()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if coalesce(current_setting('push.release', true), '') = '1' then
    return null;
  end if;
  select array_agg(n.id) into v_ids
  from changed n
  where n.push_sent_at is null and n.read_at is null
    and n.type = any (public.push_notification_types())
    and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id);
  if v_ids is not null then
    perform public.push_dispatch(v_ids);
  end if;
  return null;
end;
$$;
create trigger notifications_push_wake_insert after insert on public.notifications
  referencing new table as changed
  for each statement execute function public.notifications_push_wake();
-- Re-armed rows (push_sent_at was cleared by notifications_rearm_push).
create trigger notifications_push_wake_update after update on public.notifications
  referencing new table as changed
  for each statement execute function public.notifications_push_wake();

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('send-push', '*/5 * * * *', $cron$
    select public.push_dispatch(null)
    where exists (
      select 1 from public.notifications n
      where n.push_sent_at is null and n.read_at is null and n.created_at > now() - interval '1 hour'
        and n.type = any (public.push_notification_types())
        and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
    )
  $cron$);
exception when others then
  raise notice 'pg_cron unavailable (%): schedule public.push_dispatch(null) externally', sqlerrm;
end $$;

-- The message types that buzz a phone.
update public.notification_types set push = true where type in ('mention', 'comment', 'team_post', 'team_comment', 'direct_message');
