-- Platform core, slice 1b: settings table and time zone helpers.
-- Source: NPM database (npm_tool), copied 1:1 (D4: key/value settings).

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL
);

REVOKE ALL ON TABLE public.app_settings FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.app_settings TO service_role;

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);

CREATE FUNCTION public.is_valid_time_zone(p_zone text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_zone);
$$;

REVOKE ALL ON FUNCTION public.is_valid_time_zone(p_zone text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_valid_time_zone(p_zone text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_valid_time_zone(p_zone text) TO authenticated;
GRANT ALL ON FUNCTION public.is_valid_time_zone(p_zone text) TO service_role;

CREATE FUNCTION public.check_time_zone_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.time_zone is not null and not public.is_valid_time_zone(new.time_zone) then
    raise exception 'Unknown time zone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.check_time_zone_column() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_time_zone_column() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_time_zone_column() TO authenticated;
GRANT ALL ON FUNCTION public.check_time_zone_column() TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.app_settings AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
