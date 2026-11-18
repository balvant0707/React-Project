-- Platform core, slice 1: users, teams, rights, settings, sign-in, locks.
-- Source: COMPASS database (maintenance_tool), copied 1:1. Renames: groups -> teams (T1).

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE FUNCTION public.uuid_generate_v7() RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare
  unix_ts_ms bytea;
  rand_bytes bytea;
  result bytea;
begin
  unix_ts_ms := substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3 for 6);
  rand_bytes := substring(uuid_send(gen_random_uuid()) from 1 for 10);
  result := unix_ts_ms || rand_bytes;
  result := set_byte(result, 6, (get_byte(result, 6) & 15) | 112);
  result := set_byte(result, 8, (get_byte(result, 8) & 63) | 128);
  return encode(result, 'hex')::uuid;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

REVOKE ALL ON FUNCTION public.uuid_generate_v7() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.uuid_generate_v7() FROM PUBLIC;
GRANT ALL ON FUNCTION public.uuid_generate_v7() TO authenticated;
GRANT ALL ON FUNCTION public.uuid_generate_v7() TO service_role;

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    email text,
    name text,
    photo_url text,
    "position" text,
    language text,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supervisor_user_id uuid,
    deputy_user_id uuid,
    has_login boolean DEFAULT false NOT NULL,
    phone_office text,
    phone_mobile text,
    hire_date date,
    site text,
    birthday_month smallint,
    birthday_day smallint,
    has_left boolean DEFAULT false NOT NULL,
    sign_in_method text DEFAULT 'password'::text NOT NULL,
    username text NOT NULL,
    locked_at timestamp with time zone,
    locked_by_user_id uuid,
    birthday_hidden boolean DEFAULT false NOT NULL,
    CONSTRAINT users_birthday_complete CHECK (((birthday_month IS NULL) = (birthday_day IS NULL))),
    CONSTRAINT users_birthday_day_check CHECK (((birthday_day >= 1) AND (birthday_day <= 31))),
    CONSTRAINT users_birthday_month_check CHECK (((birthday_month >= 1) AND (birthday_month <= 12))),
    CONSTRAINT users_deputy_not_self CHECK ((deputy_user_id IS DISTINCT FROM id)),
    CONSTRAINT users_language_check CHECK ((language = ANY (ARRAY['de'::text, 'en'::text]))),
    CONSTRAINT users_phone_mobile_check CHECK (((phone_mobile IS NULL) OR (length(phone_mobile) <= 40))),
    CONSTRAINT users_phone_office_check CHECK (((phone_office IS NULL) OR (length(phone_office) <= 40))),
    CONSTRAINT users_sign_in_method_check CHECK ((sign_in_method = ANY (ARRAY['password'::text, 'sso'::text]))),
    CONSTRAINT users_site_check CHECK (((site IS NULL) OR (length(site) <= 100))),
    CONSTRAINT users_supervisor_not_self CHECK ((supervisor_user_id IS DISTINCT FROM id)),
    CONSTRAINT users_username_format CHECK (((username ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'::text) AND (length(username) <= 60)))
);

REVOKE ALL ON TABLE public.users FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    usable_for_tasks boolean DEFAULT true NOT NULL,
    usable_for_trainings boolean DEFAULT true NOT NULL,
    usable_for_filters boolean DEFAULT true NOT NULL,
    usable_for_positions boolean DEFAULT true NOT NULL,
    usable_for_leave boolean DEFAULT true NOT NULL,
    description text,
    posting text DEFAULT 'everyone'::text NOT NULL,
    audience text DEFAULT 'members'::text NOT NULL,
    team_mentions text DEFAULT 'owners'::text NOT NULL,
    color text,
    photo_path text,
    user_created boolean DEFAULT false NOT NULL,
    created_by_user_id uuid,
    usable_for_assets boolean DEFAULT false NOT NULL,
    CONSTRAINT teams_audience_check CHECK ((audience = ANY (ARRAY['members'::text, 'everyone'::text]))),
    CONSTRAINT teams_color_check CHECK ((color = ANY (ARRAY['gray'::text, 'navy'::text, 'blue'::text, 'sky'::text, 'teal'::text, 'green'::text, 'amber'::text, 'orange'::text, 'red'::text, 'pink'::text, 'violet'::text]))),
    CONSTRAINT teams_photo_path_check CHECK (((photo_path IS NULL) OR (photo_path ~~ ((id)::text || '/%'::text)))),
    CONSTRAINT teams_posting_check CHECK ((posting = ANY (ARRAY['everyone'::text, 'owners'::text]))),
    CONSTRAINT teams_team_mentions_check CHECK ((team_mentions = ANY (ARRAY['owners'::text, 'members'::text])))
);

REVOKE ALL ON TABLE public.teams FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;

CREATE TABLE public.user_teams (
    user_id uuid NOT NULL,
    team_id uuid NOT NULL
);

REVOKE ALL ON TABLE public.user_teams FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_teams TO authenticated;
GRANT ALL ON TABLE public.user_teams TO service_role;

CREATE TABLE public.team_owners (
    team_id uuid NOT NULL,
    user_id uuid NOT NULL
);

REVOKE ALL ON TABLE public.team_owners FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.team_owners TO authenticated;
GRANT ALL ON TABLE public.team_owners TO service_role;

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name_de text NOT NULL
);

REVOKE ALL ON TABLE public.roles FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.roles TO authenticated;
GRANT ALL ON TABLE public.roles TO service_role;

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission text NOT NULL
);

REVOKE ALL ON TABLE public.role_permissions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;

CREATE TABLE public.permissions (
    key text NOT NULL,
    module text NOT NULL,
    action text NOT NULL,
    scope text,
    task_family boolean DEFAULT false NOT NULL,
    sort_order integer NOT NULL,
    CONSTRAINT permissions_action_check CHECK ((action = ANY (ARRAY['view'::text, 'check'::text, 'edit'::text, 'create'::text, 'delete'::text, 'manage'::text, 'approve'::text]))),
    CONSTRAINT permissions_key_matches CHECK ((key = (((module || '.'::text) || action) || COALESCE(('.'::text || scope), ''::text)))),
    CONSTRAINT permissions_scope_check CHECK ((scope = ANY (ARRAY['own'::text, 'created'::text, 'assigned'::text, 'reported'::text, 'team'::text, 'reports'::text, 'assigned_assets'::text, 'all'::text, 'contributing'::text])))
);

REVOKE ALL ON TABLE public.permissions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;

CREATE TABLE public.permission_implies (
    permission text NOT NULL,
    implies text NOT NULL,
    CONSTRAINT permission_implies_check CHECK ((permission <> implies))
);

REVOKE ALL ON TABLE public.permission_implies FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.permission_implies TO authenticated;
GRANT ALL ON TABLE public.permission_implies TO service_role;

CREATE TABLE public.permission_closure (
    permission text NOT NULL,
    implied text NOT NULL
);

REVOKE ALL ON TABLE public.permission_closure FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.permission_closure TO service_role;
GRANT SELECT ON TABLE public.permission_closure TO authenticated;

CREATE TABLE public.role_assignment_log (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    happened_at timestamp with time zone DEFAULT now() NOT NULL,
    by_user_id uuid DEFAULT auth.uid(),
    by_user_name text,
    kind text NOT NULL,
    action text NOT NULL,
    user_id uuid,
    user_name text,
    role_id uuid,
    role_name text,
    permission text,
    team_id uuid,
    team_name text,
    asset_id uuid,
    asset_name text,
    related_user_id uuid,
    related_user_name text,
    old_value text,
    new_value text,
    CONSTRAINT role_assignment_log_action_check CHECK ((action = ANY (ARRAY['added'::text, 'removed'::text, 'changed'::text]))),
    CONSTRAINT role_assignment_log_check CHECK ((((kind = 'role'::text) AND (user_id IS NOT NULL) AND (role_id IS NOT NULL)) OR ((kind = 'permission'::text) AND (role_id IS NOT NULL) AND (permission IS NOT NULL)) OR ((kind = 'team'::text) AND (user_id IS NOT NULL) AND (team_id IS NOT NULL)) OR ((kind = 'asset_grant'::text) AND (asset_id IS NOT NULL) AND ((user_id IS NOT NULL) OR (team_id IS NOT NULL))) OR ((kind = 'team_owner'::text) AND (user_id IS NOT NULL) AND (team_id IS NOT NULL)) OR ((kind = 'team_switch'::text) AND (team_id IS NOT NULL) AND (new_value IS NOT NULL)) OR ((kind = ANY (ARRAY['supervisor'::text, 'deputy'::text])) AND (user_id IS NOT NULL) AND (related_user_id IS NOT NULL)) OR ((kind = ANY (ARRAY['email'::text, 'username'::text])) AND (user_id IS NOT NULL) AND (action = 'changed'::text)) OR ((kind = ANY (ARRAY['login'::text, 'login_grant'::text, 'lock'::text, 'activation'::text])) AND (user_id IS NOT NULL)))),
    CONSTRAINT role_assignment_log_kind_check CHECK ((kind = ANY (ARRAY['role'::text, 'permission'::text, 'team'::text, 'asset_grant'::text, 'team_owner'::text, 'supervisor'::text, 'deputy'::text, 'email'::text, 'login'::text, 'login_grant'::text, 'username'::text, 'lock'::text, 'activation'::text, 'team_switch'::text])))
);

REVOKE ALL ON TABLE public.role_assignment_log FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.role_assignment_log TO authenticated;
GRANT SELECT ON TABLE public.role_assignment_log TO service_role;

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth_key text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_success_at timestamp with time zone
);

REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
GRANT SELECT,DELETE ON TABLE public.push_subscriptions TO authenticated;

CREATE TABLE public.login_activation_codes (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    failed_attempts integer DEFAULT 0 NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.login_activation_codes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.login_activation_codes TO service_role;

CREATE TABLE public.phrases (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    category text NOT NULL,
    code text,
    text_en text NOT NULL,
    text_de text,
    sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.phrases FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.phrases TO authenticated;
GRANT ALL ON TABLE public.phrases TO service_role;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

CREATE INDEX users_deputy_user_id_idx ON public.users USING btree (deputy_user_id) WHERE (deputy_user_id IS NOT NULL);

CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE INDEX users_name_trgm_idx ON public.users USING gin (name extensions.gin_trgm_ops);

CREATE INDEX users_position_trgm_idx ON public.users USING gin ("position" extensions.gin_trgm_ops);

CREATE INDEX users_supervisor_user_id_idx ON public.users USING btree (supervisor_user_id) WHERE (supervisor_user_id IS NOT NULL);

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_name_key UNIQUE (name);

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_teams
    ADD CONSTRAINT user_teams_pkey PRIMARY KEY (user_id, team_id);

CREATE INDEX user_teams_group_id_idx ON public.user_teams USING btree (team_id);

ALTER TABLE ONLY public.team_owners
    ADD CONSTRAINT team_owners_pkey PRIMARY KEY (team_id, user_id);

CREATE INDEX team_owners_user_id_idx ON public.team_owners USING btree (user_id);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);

CREATE INDEX user_roles_role_id_idx ON public.user_roles USING btree (role_id);

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission);

CREATE INDEX role_permissions_permission_idx ON public.role_permissions USING btree (permission);

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (key);

CREATE INDEX permissions_module_idx ON public.permissions USING btree (module);

ALTER TABLE ONLY public.permission_implies
    ADD CONSTRAINT permission_implies_pkey PRIMARY KEY (permission, implies);

ALTER TABLE ONLY public.permission_closure
    ADD CONSTRAINT permission_closure_pkey PRIMARY KEY (permission, implied);

CREATE INDEX permission_closure_implied ON public.permission_closure USING btree (implied);

ALTER TABLE ONLY public.role_assignment_log
    ADD CONSTRAINT role_assignment_log_pkey PRIMARY KEY (id);

CREATE INDEX role_assignment_log_happened_at_idx ON public.role_assignment_log USING btree (happened_at);

CREATE INDEX role_assignment_log_role_id_happened_at_idx ON public.role_assignment_log USING btree (role_id, happened_at);

CREATE INDEX role_assignment_log_user_id_happened_at_idx ON public.role_assignment_log USING btree (user_id, happened_at);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

CREATE INDEX push_subscriptions_user ON public.push_subscriptions USING btree (user_id);

ALTER TABLE ONLY public.login_activation_codes
    ADD CONSTRAINT login_activation_codes_pkey PRIMARY KEY (id);

CREATE INDEX login_activation_codes_user ON public.login_activation_codes USING btree (user_id);

ALTER TABLE ONLY public.phrases
    ADD CONSTRAINT phrases_pkey PRIMARY KEY (id);

CREATE INDEX phrases_category_sequence_idx ON public.phrases USING btree (category, sequence);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_deputy_user_id_fkey FOREIGN KEY (deputy_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_supervisor_user_id_fkey FOREIGN KEY (supervisor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.user_teams
    ADD CONSTRAINT user_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_teams
    ADD CONSTRAINT user_teams_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_owners
    ADD CONSTRAINT team_owners_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_owners
    ADD CONSTRAINT team_owners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_fkey FOREIGN KEY (permission) REFERENCES public.permissions(key) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.permission_implies
    ADD CONSTRAINT permission_implies_implies_fkey FOREIGN KEY (implies) REFERENCES public.permissions(key) ON DELETE CASCADE;

ALTER TABLE ONLY public.permission_implies
    ADD CONSTRAINT permission_implies_permission_fkey FOREIGN KEY (permission) REFERENCES public.permissions(key) ON DELETE CASCADE;

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.login_activation_codes
    ADD CONSTRAINT login_activation_codes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.login_activation_codes
    ADD CONSTRAINT login_activation_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE FUNCTION public.api_pre_request() RETURNS void
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if current_user = 'authenticated' then
    -- An access token stays valid for up to an hour after locking; this refuses it at once.
    if public.login_locked() then
      raise exception 'account_locked' using errcode = '42501', hint = 'This account is locked.';
    end if;
    if not public.mfa_satisfied() then
      raise exception 'mfa_required'
        using errcode = '42501', hint = 'Sign in with the second factor (session aal2) first.';
    end if;
  end if;
end $$;

REVOKE ALL ON FUNCTION public.api_pre_request() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_pre_request() FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_pre_request() TO authenticated;
GRANT ALL ON FUNCTION public.api_pre_request() TO service_role;

CREATE FUNCTION public.apply_sign_in_method() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.sign_in_method = 'sso' then
    update auth.users set encrypted_password = '' where id = new.id and coalesce(encrypted_password, '') <> '';
  else
    delete from auth.identities where user_id = new.id and provider = 'azure';
  end if;
  delete from auth.sessions where user_id = new.id;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.apply_sign_in_method() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_sign_in_method() FROM PUBLIC;

CREATE FUNCTION public.apply_user_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.locked_at is not null then
    update auth.users set banned_until = '2999-12-31 00:00:00+00' where id = new.id;
    delete from auth.sessions where user_id = new.id;
    delete from public.push_subscriptions where user_id = new.id;
  else
    update auth.users set banned_until = null where id = new.id;
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.apply_user_lock() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_user_lock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_user_lock() TO service_role;

CREATE FUNCTION public.auth_users_login_email_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_expected text := public.expected_login_email(new.id);
begin
  if v_expected is not null and lower(new.email) is distinct from v_expected then
    raise exception 'The sign-in address follows the username; it cannot be changed here.' using errcode = '42501';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.auth_users_login_email_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auth_users_login_email_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_users_login_email_guard() TO service_role;

CREATE FUNCTION public.can_manage_teams() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.is_admin() or public.rls_has('teams.manage'); $$;

REVOKE ALL ON FUNCTION public.can_manage_teams() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_teams() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_teams() TO service_role;
GRANT ALL ON FUNCTION public.can_manage_teams() TO authenticated;

CREATE FUNCTION public.can_manage_users() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.is_admin() or public.rls_has('users.manage'); $$;

REVOKE ALL ON FUNCTION public.can_manage_users() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_users() FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_manage_users() TO service_role;
GRANT ALL ON FUNCTION public.can_manage_users() TO authenticated;

CREATE FUNCTION public.discard_recovery_token_for_sso_accounts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from public.users u where u.id = new.user_id and u.sign_in_method = 'password' and u.locked_at is null) then
    return new;
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.discard_recovery_token_for_sso_accounts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.discard_recovery_token_for_sso_accounts() FROM PUBLIC;

CREATE FUNCTION public.expected_login_email(p_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when u.sign_in_method = 'password' then public.login_email(u.username) else lower(u.email) end
  from public.users u where u.id = p_user_id
$$;

REVOKE ALL ON FUNCTION public.expected_login_email(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expected_login_email(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.expected_login_email(p_user_id uuid) TO service_role;

CREATE FUNCTION public.team_members_editable(p_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.can_manage_teams()
    or exists (select 1 from public.team_owners where team_id = p_team_id and user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.team_members_editable(p_team_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_members_editable(p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_members_editable(p_team_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.team_members_editable(p_team_id uuid) TO authenticated;

CREATE FUNCTION public.handle_deleted_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.users set has_login = false where id = old.id;
  return old;
end;
$$;

REVOKE ALL ON FUNCTION public.handle_deleted_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_deleted_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_deleted_user() TO service_role;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.users (id, email, name, has_login)
  values (new.id, case when public.is_login_email(new.email) then null else new.email end,
          coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'), true)
  on conflict (id) do update set has_login = true, email = coalesce(excluded.email, public.users.email);
  perform public.sync_login_email(new.id);
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

CREATE FUNCTION public.is_admin(check_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = check_user_id and r.name = 'Admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(check_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin(check_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin(check_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(check_user_id uuid) TO service_role;

CREATE FUNCTION public.is_login_email(p_email text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select coalesce(lower(p_email) like '%@login.rbp.invalid', false) $$;

REVOKE ALL ON FUNCTION public.is_login_email(p_email text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_login_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_login_email(p_email text) TO service_role;

CREATE FUNCTION public.login_email(p_username text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select lower(p_username) || '@login.rbp.invalid' $$;

REVOKE ALL ON FUNCTION public.login_email(p_username text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.login_email(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_email(p_username text) TO service_role;

CREATE FUNCTION public.login_locked() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select exists (select 1 from public.users u where u.id = (select auth.uid()) and u.locked_at is not null) $$;

REVOKE ALL ON FUNCTION public.login_locked() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.login_locked() FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_locked() TO service_role;
GRANT ALL ON FUNCTION public.login_locked() TO authenticated;

CREATE FUNCTION public.may_manage_login(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (select auth.uid()) is not null and p_user_id is distinct from (select auth.uid())
     and public.can_manage_users() and (public.is_admin() or not public.is_admin(p_user_id))
$$;

REVOKE ALL ON FUNCTION public.may_manage_login(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.may_manage_login(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.may_manage_login(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.may_manage_login(p_user_id uuid) TO authenticated;

CREATE FUNCTION public.mfa_satisfied() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not public.login_locked() and (
    coalesce((select not s.require_mfa from public.app_settings s), false)
      or coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or (
        coalesce((select s.sso_satisfies_mfa from public.app_settings s), false)
        and case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
             then exists (select 1 from jsonb_array_elements(auth.jwt() -> 'amr') a where a ->> 'method' = 'oauth')
             else false end
        and case when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'providers') = 'array'
             then (auth.jwt() -> 'app_metadata' -> 'providers') ? 'azure'
             else false end
        and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.sign_in_method = 'sso')
      ))
$$;

REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO authenticated;
GRANT ALL ON FUNCTION public.mfa_satisfied() TO service_role;

CREATE FUNCTION public.permission_closure_refresh() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.permission_closure;
  insert into public.permission_closure (permission, implied)
  with recursive c (permission, implied) as (
    select p.key, p.key from public.permissions p
    union
    select c.permission, i.implies from c join public.permission_implies i on i.permission = c.implied
  )
  select c.permission, c.implied from c;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.permission_closure_refresh() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.permission_closure_refresh() FROM PUBLIC;
GRANT ALL ON FUNCTION public.permission_closure_refresh() TO service_role;

CREATE FUNCTION public.reject_password_for_sso_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from public.users u where u.id = new.id and u.sign_in_method = 'sso') then
    raise exception 'This account signs in with Microsoft only; it cannot have a password.' using errcode = '42501';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.reject_password_for_sso_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_password_for_sso_user() FROM PUBLIC;

CREATE FUNCTION public.require_sso_for_azure_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.users u where u.id = new.user_id and u.sign_in_method = 'sso') then
    raise exception 'Microsoft sign-in is not enabled for this account. Ask an admin to switch it to SSO.' using errcode = '42501';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.require_sso_for_azure_identity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_sso_for_azure_identity() FROM PUBLIC;

CREATE FUNCTION public.restrict_user_self_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- has_login moves with the account (the auth triggers, also when user_revoke_login deletes it).
  if new.id <> old.id or (new.has_login is distinct from old.has_login and pg_trigger_depth() = 1)
     or (new.has_left is distinct from old.has_left and pg_trigger_depth() = 1) then
    raise exception 'This field cannot be changed';
  end if;
  if new.sign_in_method is distinct from old.sign_in_method and not public.is_admin() then
    raise exception 'Only an admin can change the sign-in method';
  end if;
  if (new.locked_at is distinct from old.locked_at or new.locked_by_user_id is distinct from old.locked_by_user_id)
     and coalesce(current_setting('app.login_admin', true), '') <> 'on' then
    raise exception 'Locking goes through user_lock / user_unlock';
  end if;
  if new.username is distinct from old.username and not public.can_manage_users() then
    raise exception 'Only a user manager can change the username';
  end if;
  if public.is_admin() then
    return new;
  end if;
  if public.rls_has('people.edit') or public.rls_has('users.manage') then
    -- The contact address of an account receives the password links: only an admin changes it.
    if old.has_login and new.email is distinct from old.email then
      raise exception 'Only an admin can change the e-mail of a person with a login';
    end if;
    return new;
  end if;
  if new.birthday_hidden is distinct from old.birthday_hidden and new.id <> auth.uid() then
    raise exception 'Only the person or HR can hide a birthday';
  end if;
  if (to_jsonb(new) - 'language' - 'birthday_hidden' - 'last_seen_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'language' - 'birthday_hidden' - 'last_seen_at' - 'updated_at') then
    raise exception 'Only HR or an admin can change this field';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.restrict_user_self_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.restrict_user_self_update() FROM PUBLIC;
GRANT ALL ON FUNCTION public.restrict_user_self_update() TO authenticated;
GRANT ALL ON FUNCTION public.restrict_user_self_update() TO service_role;

CREATE FUNCTION public.rls_has(p_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select p_permission = any(public.user_permissions(auth.uid())); $$;

REVOKE ALL ON FUNCTION public.rls_has(p_permission text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_has(p_permission text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_has(p_permission text) TO authenticated;
GRANT ALL ON FUNCTION public.rls_has(p_permission text) TO service_role;

CREATE FUNCTION public.rls_my_permissions() RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.user_permissions(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.rls_my_permissions() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_permissions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_permissions() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_permissions() TO service_role;

CREATE FUNCTION public.rls_my_team_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(team_id), '{}') from public.user_teams where user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.rls_my_team_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_team_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_team_ids() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_team_ids() TO service_role;

CREATE FUNCTION public.role_assignment_log_immutable() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'the role assignment log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

REVOKE ALL ON FUNCTION public.role_assignment_log_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_assignment_log_immutable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.role_assignment_log_immutable() TO service_role;

CREATE FUNCTION public.role_assignment_log_people() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_by uuid := auth.uid();
  v_by_name text := (select name from public.users where id = auth.uid());
  v_old_supervisor uuid;
  v_old_deputy uuid;
  v_old_email text;
  v_old_login boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_old_supervisor := old.supervisor_user_id;
    v_old_deputy := old.deputy_user_id;
    v_old_email := old.email;
    v_old_login := old.has_login;
    if new.username is distinct from old.username then
      insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, old_value, new_value)
      values (v_by, v_by_name, 'username', 'changed', new.id, new.name, old.username, new.username);
    end if;
  end if;
  if new.supervisor_user_id is distinct from v_old_supervisor then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, related_user_id, related_user_name)
    select v_by, v_by_name, 'supervisor', a.action, new.id, new.name, a.person, (select name from public.users where id = a.person)
    from (values ('removed', v_old_supervisor), ('added', new.supervisor_user_id)) as a(action, person)
    where a.person is not null;
  end if;
  if new.deputy_user_id is distinct from v_old_deputy then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, related_user_id, related_user_name)
    select v_by, v_by_name, 'deputy', a.action, new.id, new.name, a.person, (select name from public.users where id = a.person)
    from (values ('removed', v_old_deputy), ('added', new.deputy_user_id)) as a(action, person)
    where a.person is not null;
  end if;
  if new.email is distinct from v_old_email then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, old_value, new_value)
    values (v_by, v_by_name, 'email', 'changed', new.id, new.name, v_old_email, new.email);
  end if;
  if new.has_login is distinct from v_old_login then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, new_value)
    values (v_by, v_by_name, 'login', case when new.has_login then 'added' else 'removed' end, new.id, new.name, new.username);
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.role_assignment_log_people() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_assignment_log_people() FROM PUBLIC;
GRANT ALL ON FUNCTION public.role_assignment_log_people() TO service_role;

CREATE FUNCTION public.role_assignment_log_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'change % by deleting and inserting, not by updating', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

REVOKE ALL ON FUNCTION public.role_assignment_log_update() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_assignment_log_update() FROM PUBLIC;
GRANT ALL ON FUNCTION public.role_assignment_log_update() TO service_role;

CREATE FUNCTION public.role_assignment_log_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  r record;
  v_action text := case tg_op when 'INSERT' then 'added' else 'removed' end;
  v_by uuid := auth.uid();
  v_by_name text := (select name from public.users where id = auth.uid());
begin
  if tg_op = 'INSERT' then r := new; else r := old; end if;
  if tg_table_name = 'user_roles' then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, role_id, role_name)
    values (v_by, v_by_name, 'role', v_action, r.user_id, (select name from public.users where id = r.user_id),
            r.role_id, (select name from public.roles where id = r.role_id));
  elsif tg_table_name = 'role_permissions' then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, role_id, role_name, permission)
    values (v_by, v_by_name, 'permission', v_action, r.role_id, (select name from public.roles where id = r.role_id),
            r.permission);
  elsif tg_table_name = 'user_teams' then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, team_id, team_name)
    values (v_by, v_by_name, 'team', v_action, r.user_id, (select name from public.users where id = r.user_id),
            r.team_id, (select name from public.teams where id = r.team_id));
  else
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, team_id, team_name)
    values (v_by, v_by_name, 'team_owner', v_action, r.user_id, (select name from public.users where id = r.user_id),
            r.team_id, (select name from public.teams where id = r.team_id));
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.role_assignment_log_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_assignment_log_write() FROM PUBLIC;
GRANT ALL ON FUNCTION public.role_assignment_log_write() TO service_role;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

CREATE FUNCTION public.sync_login_email(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_email text := public.expected_login_email(p_user_id);
begin
  if v_email is null then
    return;
  end if;
  update auth.users set email = v_email, updated_at = now() where id = p_user_id and email is distinct from v_email;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
  where user_id = p_user_id and provider = 'email' and identity_data ->> 'email' is distinct from v_email;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_login_email(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_login_email(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_login_email(p_user_id uuid) TO service_role;

CREATE FUNCTION public.touch_last_seen() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.users set last_seen_at = now() where id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_last_seen() TO authenticated;
GRANT ALL ON FUNCTION public.touch_last_seen() TO service_role;

CREATE FUNCTION public.user_lock(p_user_id uuid, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_name text;
  v_rows integer;
begin
  if not public.may_manage_login(p_user_id) then
    raise exception 'You cannot lock this person' using errcode = '42501';
  end if;
  perform set_config('app.login_admin', 'on', true);
  update public.users set locked_at = now(), locked_by_user_id = auth.uid()
  where id = p_user_id and locked_at is null
  returning name into v_name;
  get diagnostics v_rows = row_count;
  perform set_config('app.login_admin', 'off', true);
  if v_rows > 0 then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name, new_value)
    values (auth.uid(), (select name from public.users where id = auth.uid()), 'lock', 'added', p_user_id, v_name,
            nullif(left(btrim(coalesce(p_reason, '')), 500), ''));
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.user_lock(p_user_id uuid, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_lock(p_user_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_lock(p_user_id uuid, p_reason text) TO service_role;
GRANT ALL ON FUNCTION public.user_lock(p_user_id uuid, p_reason text) TO authenticated;

CREATE FUNCTION public.user_permissions(p_user_id uuid) RETURNS text[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  return (
    -- Byte order for the distinct: callers only ask `= any(...)`, and sorting with the database's collation was most of
    -- the time.
    select coalesce(array_agg(distinct c.implied collate "C"), '{}')
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permission_closure c on c.permission = rp.permission
    where ur.user_id = p_user_id
  );
end;
$$;

REVOKE ALL ON FUNCTION public.user_permissions(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_permissions(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_permissions(p_user_id uuid) TO service_role;

CREATE FUNCTION public.user_revoke_login(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.may_manage_login(p_user_id) then
    raise exception 'You cannot revoke this login' using errcode = '42501';
  end if;
  if not exists (select 1 from public.users where id = p_user_id and has_login) then
    raise exception 'The person has no login' using errcode = '22023';
  end if;
  perform set_config('app.login_admin', 'on', true);
  update public.users set locked_at = null, locked_by_user_id = null where id = p_user_id and locked_at is not null;
  perform set_config('app.login_admin', 'off', true);
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.login_activation_codes where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

REVOKE ALL ON FUNCTION public.user_revoke_login(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_revoke_login(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_revoke_login(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.user_revoke_login(p_user_id uuid) TO authenticated;

CREATE FUNCTION public.user_unlock(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_name text;
  v_rows integer;
begin
  if not public.may_manage_login(p_user_id) then
    raise exception 'You cannot unlock this person' using errcode = '42501';
  end if;
  perform set_config('app.login_admin', 'on', true);
  update public.users set locked_at = null, locked_by_user_id = null
  where id = p_user_id and locked_at is not null
  returning name into v_name;
  get diagnostics v_rows = row_count;
  perform set_config('app.login_admin', 'off', true);
  if v_rows > 0 then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, user_id, user_name)
    values (auth.uid(), (select name from public.users where id = auth.uid()), 'lock', 'removed', p_user_id, v_name);
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.user_unlock(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_unlock(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_unlock(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.user_unlock(p_user_id uuid) TO authenticated;

CREATE FUNCTION public.username_base(p_name text, p_email text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select coalesce(nullif(btrim(left(regexp_replace(
    translate(
      replace(replace(replace(replace(replace(replace(replace(
        lower(coalesce(nullif(btrim(p_name), ''), split_part(coalesce(p_email, ''), '@', 1))),
        'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'), 'æ', 'ae'), 'ø', 'oe'), 'å', 'aa'),
      'àáâãèéêëìíîïòóôõùúûýÿçñčćšžłńśźżőűğışăţ',
      'aaaaeeeeiiiioooouuuyycnccszlnszzougisat'),
    '[^a-z0-9]+', '.', 'g'), 50), '.'), ''), 'user')
$$;

REVOKE ALL ON FUNCTION public.username_base(p_name text, p_email text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.username_base(p_name text, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.username_base(p_name text, p_email text) TO service_role;

CREATE FUNCTION public.username_unique(p_base text, p_user_id uuid) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_name text := p_base;
  v_n integer := 1;
begin
  while exists (select 1 from public.users u where u.username = v_name and u.id is distinct from p_user_id) loop
    v_n := v_n + 1;
    v_name := left(p_base, 55) || v_n;
  end loop;
  return v_name;
end;
$$;

REVOKE ALL ON FUNCTION public.username_unique(p_base text, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.username_unique(p_base text, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.username_unique(p_base text, p_user_id uuid) TO service_role;

CREATE FUNCTION public.users_supervisor_no_cycle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_up uuid := new.supervisor_user_id;
  v_steps integer := 0;
begin
  while v_up is not null loop
    if v_up = new.id then
      raise exception 'The supervisor chain would loop';
    end if;
    v_steps := v_steps + 1;
    exit when v_steps > 50;
    select supervisor_user_id into v_up from public.users where id = v_up;
  end loop;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.users_supervisor_no_cycle() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.users_supervisor_no_cycle() FROM PUBLIC;
GRANT ALL ON FUNCTION public.users_supervisor_no_cycle() TO service_role;

CREATE FUNCTION public.users_sync_login_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.sync_login_email(new.id);
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.users_sync_login_email() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.users_sync_login_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.users_sync_login_email() TO service_role;

CREATE FUNCTION public.users_username() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' and nullif(btrim(new.username), '') is null then
    new.username := public.username_unique(public.username_base(new.name, new.email), new.id);
  else
    new.username := lower(btrim(new.username));
    if new.username = '' then
      raise exception 'A username is required' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.users_username() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.users_username() FROM PUBLIC;
GRANT ALL ON FUNCTION public.users_username() TO service_role;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage users" ON public.users TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "HR adds people" ON public.users FOR INSERT TO authenticated WITH CHECK (((( SELECT public.rls_has('people.edit'::text) AS rls_has) OR ( SELECT public.can_manage_users() AS can_manage_users)) AND (NOT has_login)));

CREATE POLICY "HR deletes people without login" ON public.users FOR DELETE TO authenticated USING (((( SELECT public.rls_has('people.edit'::text) AS rls_has) OR ( SELECT public.can_manage_users() AS can_manage_users)) AND (NOT has_login)));

CREATE POLICY "HR edits people" ON public.users FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('people.edit'::text) AS rls_has) OR ( SELECT public.can_manage_users() AS can_manage_users))) WITH CHECK ((( SELECT public.rls_has('people.edit'::text) AS rls_has) OR ( SELECT public.can_manage_users() AS can_manage_users)));

CREATE POLICY "Read users" ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Update own user" ON public.users FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY mfa_required ON public.users AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER apply_sign_in_method AFTER UPDATE OF sign_in_method ON public.users FOR EACH ROW WHEN ((old.sign_in_method IS DISTINCT FROM new.sign_in_method)) EXECUTE FUNCTION public.apply_sign_in_method();

CREATE TRIGGER apply_user_lock AFTER UPDATE OF locked_at ON public.users FOR EACH ROW WHEN (((old.locked_at IS NULL) <> (new.locked_at IS NULL))) EXECUTE FUNCTION public.apply_user_lock();

CREATE TRIGGER restrict_user_self_update BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.restrict_user_self_update();

CREATE TRIGGER role_assignment_log_people AFTER INSERT OR UPDATE OF supervisor_user_id, deputy_user_id, email, has_login, username ON public.users FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_people();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER users_supervisor_no_cycle BEFORE INSERT OR UPDATE OF supervisor_user_id ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_supervisor_no_cycle();

CREATE TRIGGER users_sync_login_email AFTER UPDATE OF username, sign_in_method, email ON public.users FOR EACH ROW WHEN ((new.has_login AND ((old.username IS DISTINCT FROM new.username) OR (old.sign_in_method IS DISTINCT FROM new.sign_in_method) OR (old.email IS DISTINCT FROM new.email)))) EXECUTE FUNCTION public.users_sync_login_email();

CREATE TRIGGER users_username BEFORE INSERT OR UPDATE OF username ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_username();

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team managers manage teams" ON public.teams TO authenticated USING (( SELECT public.can_manage_teams() AS can_manage_teams)) WITH CHECK (( SELECT public.can_manage_teams() AS can_manage_teams));

CREATE POLICY "Read teams" ON public.teams FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.teams AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team managers manage team memberships" ON public.user_teams TO authenticated USING (( SELECT public.can_manage_teams() AS can_manage_teams)) WITH CHECK (( SELECT public.can_manage_teams() AS can_manage_teams));

CREATE POLICY "Owners add members" ON public.user_teams FOR INSERT TO authenticated WITH CHECK (public.team_members_editable(team_id));

CREATE POLICY "Owners remove members" ON public.user_teams FOR DELETE TO authenticated USING (public.team_members_editable(team_id));

CREATE POLICY "Read team memberships" ON public.user_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.user_teams AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER role_assignment_log AFTER INSERT OR DELETE ON public.user_teams FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_write();

CREATE TRIGGER role_assignment_log_no_update BEFORE UPDATE ON public.user_teams FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_update();

ALTER TABLE public.team_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team managers manage team owners" ON public.team_owners TO authenticated USING (( SELECT public.can_manage_teams() AS can_manage_teams)) WITH CHECK (( SELECT public.can_manage_teams() AS can_manage_teams));

CREATE POLICY "View team owners" ON public.team_owners FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.team_owners AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER role_assignment_log AFTER INSERT OR DELETE ON public.team_owners FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_write();

CREATE TRIGGER role_assignment_log_no_update BEFORE UPDATE ON public.team_owners FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_update();

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage roles" ON public.roles TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Read roles" ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.roles AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage role assignments" ON public.user_roles TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Read own role assignments" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_admin()));

CREATE POLICY "User managers read role assignments" ON public.user_roles FOR SELECT TO authenticated USING (( SELECT public.can_manage_users() AS can_manage_users));

CREATE POLICY mfa_required ON public.user_roles AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER role_assignment_log AFTER INSERT OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_write();

CREATE TRIGGER role_assignment_log_no_update BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_update();

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage role permissions" ON public.role_permissions USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Read role permissions" ON public.role_permissions FOR SELECT USING (true);

CREATE POLICY mfa_required ON public.role_permissions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER role_assignment_log AFTER INSERT OR DELETE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_write();

CREATE TRIGGER role_assignment_log_no_update BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_update();

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read permissions" ON public.permissions FOR SELECT USING (true);

CREATE POLICY mfa_required ON public.permissions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER permission_closure_refresh AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.permissions FOR EACH STATEMENT EXECUTE FUNCTION public.permission_closure_refresh();

ALTER TABLE public.permission_implies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read permission hierarchy" ON public.permission_implies FOR SELECT USING (true);

CREATE POLICY mfa_required ON public.permission_implies AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER permission_closure_refresh AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.permission_implies FOR EACH STATEMENT EXECUTE FUNCTION public.permission_closure_refresh();

ALTER TABLE public.permission_closure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read permission closure" ON public.permission_closure FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.permission_closure AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.role_assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read role assignment log" ON public.role_assignment_log FOR SELECT TO authenticated USING (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.role_assignment_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER role_assignment_log_immutable BEFORE DELETE OR UPDATE ON public.role_assignment_log FOR EACH ROW EXECUTE FUNCTION public.role_assignment_log_immutable();

CREATE TRIGGER role_assignment_log_no_truncate BEFORE TRUNCATE ON public.role_assignment_log FOR EACH STATEMENT EXECUTE FUNCTION public.role_assignment_log_immutable();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own push subscriptions" ON public.push_subscriptions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_required ON public.push_subscriptions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.login_activation_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.login_activation_codes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.phrases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage phrases" ON public.phrases TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Read phrases" ON public.phrases FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.phrases AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.phrases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE VIEW public.users_admin_overview WITH (security_invoker='on') AS
 SELECT u.id,
    u.name,
    u.email,
    u."position",
    u.supervisor_user_id,
    u.deputy_user_id,
    u.sign_in_method,
    u.has_login,
    s.name AS supervisor_name,
    d.name AS deputy_name,
    COALESCE(ARRAY( SELECT ur.role_id
           FROM public.user_roles ur
          WHERE (ur.user_id = u.id)), '{}'::uuid[]) AS role_ids,
    ( SELECT string_agg(r.name, ', '::text ORDER BY r.name) AS string_agg
           FROM (public.user_roles ur
             JOIN public.roles r ON ((r.id = ur.role_id)))
          WHERE (ur.user_id = u.id)) AS role_names,
    COALESCE(ARRAY( SELECT ug.team_id
           FROM public.user_teams ug
          WHERE (ug.user_id = u.id)), '{}'::uuid[]) AS team_ids,
    ( SELECT string_agg(g.name, ', '::text ORDER BY g.name) AS string_agg
           FROM (public.user_teams ug
             JOIN public.teams g ON ((g.id = ug.team_id)))
          WHERE (ug.user_id = u.id)) AS team_names,
    u.username,
    u.locked_at,
    l.name AS locked_by_name
   FROM (((public.users u
     LEFT JOIN public.users s ON ((s.id = u.supervisor_user_id)))
     LEFT JOIN public.users d ON ((d.id = u.deputy_user_id)))
     LEFT JOIN public.users l ON ((l.id = u.locked_by_user_id)));

REVOKE ALL ON TABLE public.users_admin_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.users_admin_overview TO authenticated;
GRANT ALL ON TABLE public.users_admin_overview TO service_role;

-- Auth-schema triggers, role settings and realtime publication, copied from the COMPASS database.
CREATE TRIGGER auth_users_login_email_guard BEFORE UPDATE OF email ON auth.users FOR EACH ROW WHEN (((new.email)::text IS DISTINCT FROM (old.email)::text)) EXECUTE FUNCTION public.auth_users_login_email_guard();
CREATE TRIGGER discard_recovery_token_for_sso_accounts BEFORE INSERT OR UPDATE ON auth.one_time_tokens FOR EACH ROW WHEN ((new.token_type = 'recovery_token'::auth.one_time_token_type)) EXECUTE FUNCTION public.discard_recovery_token_for_sso_accounts();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_auth_user_deleted AFTER DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_deleted_user();
CREATE TRIGGER reject_password_for_sso_user BEFORE UPDATE OF encrypted_password ON auth.users FOR EACH ROW WHEN ((((new.encrypted_password)::text IS DISTINCT FROM (old.encrypted_password)::text) AND ((COALESCE(new.encrypted_password, ''::character varying))::text <> ''::text))) EXECUTE FUNCTION public.reject_password_for_sso_user();
CREATE TRIGGER require_sso_for_azure_identity BEFORE INSERT ON auth.identities FOR EACH ROW WHEN ((new.provider = 'azure'::text)) EXECUTE FUNCTION public.require_sso_for_azure_identity();
alter role authenticator set pgrst.db_pre_request = 'public.api_pre_request';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';
alter role authenticated set statement_timeout = '8s';
alter role anon set statement_timeout = '3s';

