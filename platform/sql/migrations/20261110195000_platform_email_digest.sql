-- Platform email digest: COMPASS's daily mail of unread notifications over SMTP (email_settings, which the login mails
-- already use; sent by the Edge Function send-emails, woken by pg_cron through pg_net). Source: COMPASS database.
-- Adapted: which types are mailed is a column of the notification type registry (modules flag their own types), and NPM's
-- rule is kept too: a notification whose channels name 'email' is mailed whatever its type.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE FUNCTION public.email_notification_types() RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- Platform: the types whose module flagged them for the mail (notification_type_register(..., p_email => true)).
  select coalesce(array_agg(t.type order by t.type), '{}') from public.notification_types t where t.email
$$;


ALTER FUNCTION public.email_notification_types() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_notification_types() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_notification_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_notification_types() TO authenticated;
GRANT ALL ON FUNCTION public.email_notification_types() TO service_role;

CREATE FUNCTION public.email_pending() RETURNS TABLE(id uuid, user_id uuid, email text, language text, type text, title text, body text, link text, params jsonb, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select n.id, n.user_id, u.email, u.language, n.type, n.title, n.body, n.link, n.params, n.created_at
  from public.notifications n
  join public.users u on u.id = n.user_id
  left join public.notification_preferences p on p.user_id = n.user_id
  cross join (select enabled from public.email_settings) s
  where s.enabled
    and n.email_sent_at is null and n.read_at is null
    -- platform: also what the producer sent on the 'email' channel (NPM's rule)
    and (n.type = any (public.email_notification_types()) or 'email' = any (n.channels))
    -- what was read in the app never needs a mail; a backlog older than three days is stale (weekend carry-over
    -- still fits, a switch-on later does not flood)
    and n.created_at > now() - interval '3 days'
    and u.email is not null
    and coalesce(p.email_enabled, true)
  order by n.user_id, n.created_at
$$;


ALTER FUNCTION public.email_pending() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_pending() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_pending() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_pending() TO service_role;

CREATE FUNCTION public.email_claim() RETURNS TABLE(id uuid, user_id uuid, email text, language text, type text, title text, body text, link text, params jsonb, created_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with claimed as (
    update public.notifications n set email_sent_at = now()
    where n.id in (select p.id from public.email_pending() p) and n.email_sent_at is null
    returning n.id, n.user_id, n.type, n.title, n.body, n.link, n.params, n.created_at
  )
  select c.id, c.user_id, u.email, u.language, c.type, c.title, c.body, c.link, c.params, c.created_at
  from claimed c join public.users u on u.id = c.user_id
  order by c.user_id, c.created_at
$$;


ALTER FUNCTION public.email_claim() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_claim() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_claim() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_claim() TO service_role;

CREATE FUNCTION public.email_release(p_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.notifications set email_sent_at = null where id = any (p_ids)
$$;


ALTER FUNCTION public.email_release(p_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_release(p_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_release(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_release(p_ids uuid[]) TO service_role;

CREATE FUNCTION public.email_record_run(p_sent integer, p_error text, p_done boolean DEFAULT true) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.email_settings
  set last_run_at = now(), last_sent_count = p_sent, last_error = p_error,
      last_digest_on = case when p_done then (now() at time zone timezone)::date else last_digest_on end
  where id
$$;


ALTER FUNCTION public.email_record_run(p_sent integer, p_error text, p_done boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_record_run(p_sent integer, p_error text, p_done boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_record_run(p_sent integer, p_error text, p_done boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_record_run(p_sent integer, p_error text, p_done boolean) TO service_role;

CREATE FUNCTION public.email_dispatch_trigger(p_force boolean DEFAULT false) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  s public.email_settings;
  v_local timestamp;
  v_request bigint;
begin
  select * into s from public.email_settings;
  if not s.enabled or s.dispatch_url is null then
    return null;
  end if;
  if not p_force then
    -- the daily digest: once the local digest time has passed, until it has gone out without error
    v_local := now() at time zone s.timezone;
    if v_local::time < s.digest_time
       or (s.last_digest_on is not null and s.last_digest_on >= v_local::date)
       or (s.weekdays_only and extract(isodow from v_local) > 5) then
      return null;
    end if;
  end if;
  select net.http_post(
    url := s.dispatch_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-token', s.dispatch_token),
    body := jsonb_build_object('action', 'dispatch'),
    timeout_milliseconds := 20000
  ) into v_request;
  return v_request;
end;
$$;


ALTER FUNCTION public.email_dispatch_trigger(p_force boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_dispatch_trigger(p_force boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_dispatch_trigger(p_force boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_dispatch_trigger(p_force boolean) TO service_role;

CREATE FUNCTION public.email_dispatch_run_now() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may run this';
  end if;
  perform public.email_dispatch_trigger(true);
end;
$$;


ALTER FUNCTION public.email_dispatch_run_now() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_dispatch_run_now() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_dispatch_run_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_dispatch_run_now() TO authenticated;
GRANT ALL ON FUNCTION public.email_dispatch_run_now() TO service_role;

CREATE FUNCTION public.email_settings_save(p jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_enabled boolean := coalesce((p ->> 'enabled')::boolean, false);
begin
  if not public.is_admin() then
    raise exception 'Only admins may change the email settings';
  end if;
  if p ->> 'timezone' is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = p ->> 'timezone') then
    raise exception 'Unknown time zone';
  end if;
  if v_enabled and (nullif(btrim(coalesce(p ->> 'host', '')), '') is null or nullif(btrim(coalesce(p ->> 'from_address', '')), '') is null) then
    raise exception 'Host and sender address are required to switch email on';
  end if;
  update public.email_settings set
    enabled = v_enabled,
    host = nullif(btrim(coalesce(p ->> 'host', '')), ''),
    port = coalesce((p ->> 'port')::integer, 587),
    security = coalesce(p ->> 'security', 'starttls'),
    username = nullif(btrim(coalesce(p ->> 'username', '')), ''),
    password = case when p ->> 'password' is null then password else nullif(p ->> 'password', '') end,
    from_address = nullif(btrim(coalesce(p ->> 'from_address', '')), ''),
    from_name = coalesce(nullif(btrim(coalesce(p ->> 'from_name', '')), ''), from_name),
    app_url = nullif(regexp_replace(btrim(coalesce(p ->> 'app_url', '')), '/+$', ''), ''),
    dispatch_url = nullif(btrim(coalesce(p ->> 'dispatch_url', '')), ''),
    digest_time = coalesce(nullif(p ->> 'digest_time', '')::time, '16:30'),
    timezone = coalesce(nullif(p ->> 'timezone', ''), 'Europe/Berlin'),
    weekdays_only = coalesce((p ->> 'weekdays_only')::boolean, true),
    language = coalesce(nullif(p ->> 'language', ''), language),
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id;
end;
$_$;


ALTER FUNCTION public.email_settings_save(p jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_settings_save(p jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_settings_save(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_settings_save(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.email_settings_save(p jsonb) TO service_role;

CREATE FUNCTION public.email_password_is_set() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin() and exists (select 1 from public.email_settings where password is not null)
$$;


ALTER FUNCTION public.email_password_is_set() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_password_is_set() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_password_is_set() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_password_is_set() TO authenticated;
GRANT ALL ON FUNCTION public.email_password_is_set() TO service_role;

CREATE FUNCTION public.email_delivery_enabled() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((select enabled from public.email_settings), false)
$$;


ALTER FUNCTION public.email_delivery_enabled() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_delivery_enabled() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_delivery_enabled() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_delivery_enabled() TO authenticated;
GRANT ALL ON FUNCTION public.email_delivery_enabled() TO service_role;

-- Hand-written part of the platform email digest.

-- The one settings row (COMPASS inserts it in its migration, which the dump does not carry). The login mails read it too.
insert into public.email_settings (id) values (true) on conflict (id) do nothing;

-- Language of the digest mails. The users carry no language (the app's language is chosen per device); COMPASS mails in
-- German, the NPM app (RADAR) is English-only, so the app sets it here (seed or admin page).
alter table public.email_settings add column language text not null default 'de' check (language in ('de', 'en'));
grant select (language) on public.email_settings to authenticated;

-- Which types are mailed: the registry says so (COMPASS: a fixed list in email_notification_types()). A module flags its
-- own types, with notification_type_register(..., p_email => true) or notification_types_set_email().
alter table public.notification_types add column email boolean not null default false;

drop function public.notification_type_register(text, text, boolean, text, boolean);
create function public.notification_type_register(p_type text, p_module text, p_switchable boolean default false,
                                                  p_description text default null, p_push boolean default false,
                                                  p_email boolean default null)
  returns void language sql security definer set search_path to ''
  as $$ insert into public.notification_types (type, module, switchable, description, push, email)
        values (p_type, p_module, p_switchable, p_description, p_push, coalesce(p_email, false))
        on conflict (type) do update set module = excluded.module, switchable = excluded.switchable, description = excluded.description,
          push = excluded.push, email = coalesce(p_email, public.notification_types.email); $$;
revoke all on function public.notification_type_register(text, text, boolean, text, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.notification_type_register(text, text, boolean, text, boolean, boolean) to service_role;

create function public.notification_types_set_email(p_types text[], p_email boolean default true)
  returns void language sql security definer set search_path to ''
  as $$ update public.notification_types set email = p_email where type = any (p_types); $$;
revoke all on function public.notification_types_set_email(text[], boolean) from public, anon, authenticated, service_role;
grant execute on function public.notification_types_set_email(text[], boolean) to service_role;

-- The types registered before this migration that COMPASS mails (messaging: comment, direct_message, team posts and
-- comments = COMPASS group_post / group_comment; the platform's mention). Later modules flag theirs themselves.
select public.notification_types_set_email(array['mention', 'comment', 'direct_message', 'team_post', 'team_comment']);

-- Waking the Edge Function send-emails: every 15 minutes it is asked, email_dispatch_trigger() decides whether the digest
-- is due (COMPASS cron job 'send-emails').
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net unavailable (%): call the send-emails function from an external scheduler', sqlerrm;
end $$;
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('send-emails', '*/15 * * * *', 'select public.email_dispatch_trigger()');
exception when others then
  raise notice 'pg_cron unavailable (%): schedule public.email_dispatch_trigger() externally', sqlerrm;
end $$;

