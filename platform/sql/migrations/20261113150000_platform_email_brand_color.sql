-- The colour of an app's mails (top border, buttons, links in the daily digest and the login mails), so COMPASS keeps
-- its CI red and RADAR gets its own. Null = the COMPASS red the mails had before (#ed1c29). The logo is the app's
-- branding/mail-logo.png, served from email_settings.app_url (no setting needed).
alter table public.email_settings
  add column brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$');
grant select (brand_color) on public.email_settings to authenticated;

-- As in 20261110250000, plus brand_color (an empty value clears it; a missing key keeps it).
create or replace function public.email_settings_save(p jsonb) returns void
    language plpgsql security definer
    set search_path to ''
    as $_$
declare
  v_enabled boolean := coalesce((p ->> 'enabled')::boolean, false);
  v_transport text := coalesce(nullif(p ->> 'transport', ''), (select transport from public.email_settings));
begin
  if not public.is_admin() then
    raise exception 'Only admins may change the email settings';
  end if;
  if p ->> 'timezone' is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = p ->> 'timezone') then
    raise exception 'Unknown time zone';
  end if;
  if not exists (select 1 from public.email_transports where key = v_transport) then
    raise exception 'Unknown email transport %', v_transport;
  end if;
  if p ? 'transport_config' and jsonb_typeof(p -> 'transport_config') not in ('object', 'null') then
    raise exception 'transport_config must be an object';
  end if;
  if v_enabled and v_transport = 'smtp'
     and (nullif(btrim(coalesce(p ->> 'host', '')), '') is null or nullif(btrim(coalesce(p ->> 'from_address', '')), '') is null) then
    raise exception 'Host and sender address are required to switch email on';
  end if;
  update public.email_settings set
    enabled = v_enabled,
    transport = v_transport,
    transport_config = case when p ? 'transport_config' then coalesce(nullif(p -> 'transport_config', 'null'::jsonb), '{}'::jsonb) else transport_config end,
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
    brand_color = case when p ? 'brand_color' then nullif(btrim(coalesce(p ->> 'brand_color', '')), '') else brand_color end,
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id;
end;
$_$;
