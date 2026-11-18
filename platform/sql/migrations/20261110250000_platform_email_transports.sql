-- How the platform's mails leave (digest, test mail, login mails): SMTP (the default, COMPASS) or a transport a module
-- registers (npm-email: 'graph', a Microsoft 365 mailbox through Graph, as NPM's own digest sent). A transport other than
-- 'smtp' is an Edge Function mail-transport-<key> that platform/functions/_shared/smtp.ts calls with the service role;
-- its settings are email_settings.transport_config (npm-email: {"mailbox_id": ...}).

create table public.email_transports (
  key text primary key check (key ~ '^[a-z][a-z0-9_-]*$'),
  label text not null,
  module text not null,
  sort_order integer not null default 100
);
alter table public.email_transports enable row level security;
create policy "Admins read email transports" on public.email_transports for select to authenticated using ((select public.is_admin()));
create policy mfa_required on public.email_transports as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
revoke all on public.email_transports from public, anon, authenticated;
grant select on public.email_transports to authenticated;
grant all on public.email_transports to service_role;

-- A module's migration registers its transport (idempotent).
create function public.email_transport_register(p_key text, p_label text, p_module text, p_sort_order integer default 100)
returns void language sql security definer set search_path to '' as $$
  insert into public.email_transports (key, label, module, sort_order) values (p_key, p_label, p_module, p_sort_order)
  on conflict (key) do update set label = excluded.label, module = excluded.module, sort_order = excluded.sort_order;
$$;
revoke all on function public.email_transport_register(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.email_transport_register(text, text, text, integer) to service_role;

select public.email_transport_register('smtp', 'SMTP', 'platform', 0);

alter table public.email_settings
  add column transport text not null default 'smtp' references public.email_transports (key),
  add column transport_config jsonb not null default '{}'::jsonb check (jsonb_typeof(transport_config) = 'object');
-- Admins read the settings column by column (the password is never readable).
grant select (transport, transport_config) on public.email_settings to authenticated;

-- As in 20261110195000, plus transport and transport_config; SMTP host and sender are required only for SMTP.
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
    updated_at = now(),
    updated_by_user_id = auth.uid()
  where id;
end;
$_$;
