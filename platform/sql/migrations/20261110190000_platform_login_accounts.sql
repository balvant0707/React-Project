-- Platform login accounts (WP 12): the account functions behind COMPASS's login-help and person-grant-login Edge Functions
-- (password reset by username, activation codes, the login grant log) and the SMTP settings they mail with. Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.login_reset_requests (
    user_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.login_reset_requests OWNER TO postgres;

REVOKE ALL ON TABLE public.login_reset_requests FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.login_reset_requests TO service_role;

CREATE TABLE public.email_settings (
    id boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    host text,
    port integer DEFAULT 587 NOT NULL,
    security text DEFAULT 'starttls'::text NOT NULL,
    username text,
    password text,
    from_address text,
    from_name text DEFAULT 'Business Platform'::text NOT NULL,
    app_url text,
    dispatch_url text,
    dispatch_token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    digest_time time without time zone DEFAULT '16:30:00'::time without time zone NOT NULL,
    timezone text DEFAULT 'Europe/Berlin'::text NOT NULL,
    weekdays_only boolean DEFAULT true NOT NULL,
    last_digest_on date,
    last_run_at timestamp with time zone,
    last_error text,
    last_sent_count integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid,
    CONSTRAINT email_settings_id_check CHECK (id),
    CONSTRAINT email_settings_port_check CHECK (((port >= 1) AND (port <= 65535))),
    CONSTRAINT email_settings_security_check CHECK ((security = ANY (ARRAY['starttls'::text, 'ssl'::text, 'none'::text])))
);


ALTER TABLE public.email_settings OWNER TO postgres;

REVOKE ALL ON TABLE public.email_settings FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_settings TO service_role;

GRANT SELECT(id) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(enabled) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(host) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(port) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(security) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(username) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(from_address) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(from_name) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(app_url) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(dispatch_url) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(digest_time) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(timezone) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(weekdays_only) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(last_digest_on) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(last_run_at) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(last_error) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(last_sent_count) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(updated_at) ON TABLE public.email_settings TO authenticated;

GRANT SELECT(updated_by_user_id) ON TABLE public.email_settings TO authenticated;

CREATE INDEX login_reset_requests_user ON public.login_reset_requests USING btree (user_id, requested_at);

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.login_reset_requests
    ADD CONSTRAINT login_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_settings
    ADD CONSTRAINT email_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.activation_code_hash(p_code text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex') $$;


ALTER FUNCTION public.activation_code_hash(p_code text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.activation_code_hash(p_code text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.activation_code_hash(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activation_code_hash(p_code text) TO service_role;

CREATE FUNCTION public.login_activation_check(p_username text, p_code text) RETURNS TABLE(code_id uuid, user_id uuid, login_email text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_code_id uuid;
  v_user_id uuid;
  v_hash text;
  v_username text;
begin
  select c.id, c.user_id, c.code_hash, u.username into v_code_id, v_user_id, v_hash, v_username
  from public.login_activation_codes c
  join public.users u on u.id = c.user_id
  where u.username = lower(btrim(p_username)) and u.has_login and u.locked_at is null and u.sign_in_method = 'password'
    and c.used_at is null and c.expires_at > now() and c.failed_attempts < 5
  for update of c;
  if v_code_id is null then
    return;
  end if;
  if v_hash is distinct from public.activation_code_hash(p_code) then
    update public.login_activation_codes c set failed_attempts = c.failed_attempts + 1 where c.id = v_code_id;
    return;
  end if;
  return query select v_code_id, v_user_id, public.login_email(v_username);
end;
$$;


ALTER FUNCTION public.login_activation_check(p_username text, p_code text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.login_activation_check(p_username text, p_code text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.login_activation_check(p_username text, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_activation_check(p_username text, p_code text) TO service_role;

CREATE FUNCTION public.login_activation_create(p_user_id uuid) RETURNS TABLE(code text, expires_at timestamp with time zone, username text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_person public.users;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(12);
  v_code text := '';
  v_expires timestamptz := now() + interval '7 days';
begin
  if not public.may_manage_login(p_user_id) then
    raise exception 'You cannot issue an activation for this person' using errcode = '42501';
  end if;
  select * into v_person from public.users u where u.id = p_user_id;
  if not v_person.has_login then
    raise exception 'The person has no login' using errcode = '22023';
  end if;
  if v_person.sign_in_method <> 'password' then
    raise exception 'This person signs in with Microsoft' using errcode = '22023';
  end if;
  if v_person.locked_at is not null then
    raise exception 'The person is locked' using errcode = '22023';
  end if;
  for i in 0..11 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  delete from public.login_activation_codes c where c.user_id = p_user_id;
  insert into public.login_activation_codes (user_id, code_hash, expires_at, created_by_user_id)
  values (p_user_id, public.activation_code_hash(v_code), v_expires, auth.uid());
  update auth.users set encrypted_password = '' where id = p_user_id;
  delete from auth.mfa_factors where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name)
  values (auth.uid(), (select name from public.users where id = auth.uid()), 'activation', 'added', p_user_id, v_person.name);
  return query select substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4), v_expires, v_person.username;
end;
$$;


ALTER FUNCTION public.login_activation_create(p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.login_activation_create(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.login_activation_create(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_activation_create(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.login_activation_create(p_user_id uuid) TO authenticated;

CREATE FUNCTION public.login_activation_consume(p_code_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ update public.login_activation_codes set used_at = now() where id = p_code_id and used_at is null $$;


ALTER FUNCTION public.login_activation_consume(p_code_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.login_activation_consume(p_code_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.login_activation_consume(p_code_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_activation_consume(p_code_id uuid) TO service_role;

CREATE FUNCTION public.login_reset_target(p_username text) RETURNS TABLE(user_id uuid, login_email text, email text, name text, language text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_person public.users;
begin
  delete from public.login_reset_requests r where r.requested_at < now() - interval '1 day';
  select * into v_person from public.users u
  where u.username = lower(btrim(p_username)) and u.has_login and u.sign_in_method = 'password' and u.locked_at is null
    and nullif(btrim(u.email), '') is not null;
  if v_person.id is null then
    return;
  end if;
  if (select count(*) from public.login_reset_requests r where r.user_id = v_person.id and r.requested_at > now() - interval '1 hour') >= 3 then
    return;
  end if;
  insert into public.login_reset_requests (user_id) values (v_person.id);
  return query select v_person.id, public.login_email(v_person.username), v_person.email, v_person.name, v_person.language;
end;
$$;


ALTER FUNCTION public.login_reset_target(p_username text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.login_reset_target(p_username text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.login_reset_target(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_reset_target(p_username text) TO service_role;

CREATE FUNCTION public.role_assignment_log_login_grant(p_person_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_person public.users;
begin
  if not public.can_manage_users() then
    raise exception 'Only a user manager can give a login' using errcode = '42501';
  end if;
  select * into v_person from public.users where id = p_person_id;
  if v_person.id is null or not v_person.has_login then
    raise exception 'The person has no login' using errcode = '22023';
  end if;
  insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, new_value)
  values (auth.uid(), (select name from public.users where id = auth.uid()), 'login_grant', 'added', v_person.id, v_person.name, v_person.email);
end;
$$;


ALTER FUNCTION public.role_assignment_log_login_grant(p_person_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.role_assignment_log_login_grant(p_person_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_assignment_log_login_grant(p_person_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.role_assignment_log_login_grant(p_person_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.role_assignment_log_login_grant(p_person_id uuid) TO authenticated;

CREATE FUNCTION public.email_runtime_settings() RETURNS public.email_settings
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select * from public.email_settings
$$;


ALTER FUNCTION public.email_runtime_settings() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_runtime_settings() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_runtime_settings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_runtime_settings() TO service_role;

ALTER TABLE public.login_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.login_reset_requests AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read email settings" ON public.email_settings FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY mfa_required ON public.email_settings AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));
