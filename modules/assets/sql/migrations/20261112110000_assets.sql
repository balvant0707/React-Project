-- Assets (module assets): COMPASS asset tree (types, attributes, QR token, responsible team), the assigned_assets
-- scope of tasks and series, series by operating hours. Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the assets module, before the objects copied from COMPASS.

-- COMPASS keeps the asset path in an ltree column in the public schema (public.ltree, operator(public.<@)).
create extension if not exists ltree with schema public;

-- Recreated below with the asset columns back (COMPASS's views): the task overview and the
-- views that read it, the decision list and the series overview. task_create gets COMPASS's asset argument back.
drop view public.tasks_my_requests;
drop view public.initiatives_overview;
drop view public.tasks_overview;
drop view public.tasks_to_decide;
drop view public.recurring_task_rules_overview;
drop function public.task_create(uuid, text, date, text, text, text, uuid, uuid, uuid, uuid, boolean, boolean, boolean, uuid, text[]);

-- The task policies come back with the assigned_assets scope (COMPASS's text, copied below).
drop policy "Create tasks per grant" on public.tasks;
drop policy "Delete tasks per grant" on public.tasks;
drop policy "Edit tasks per grant" on public.tasks;
drop policy "View tasks per grant" on public.tasks;

-- A task type can hide the asset field again (COMPASS's list; task-family left 'asset' out).
alter table public.task_types drop constraint task_types_hidden_fields_check;
alter table public.task_types add constraint task_types_hidden_fields_check
  check ((hidden_fields <@ array['asset'::text, 'team'::text, 'work_hours'::text, 'downtime'::text, 'checklist'::text, 'costs'::text]));

-- Series by operating hours (COMPASS's schedule kinds; task-family refused 'operating_hours').
alter table public.recurring_task_rules drop constraint recurring_task_rules_schedule_kind_check;
alter table public.recurring_task_rules add constraint recurring_task_rules_schedule_kind_check
  check ((schedule_kind = any (array['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text, 'operating_hours'::text])));


CREATE FUNCTION public.asset_path_label(p_id uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$ select replace(p_id::text, '-', '_') $$;


ALTER FUNCTION public.asset_path_label(p_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_path_label(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_path_label(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_path_label(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.asset_path_label(p_id uuid) TO service_role;

CREATE TABLE public.asset_types (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_grouping boolean DEFAULT false NOT NULL,
    name_de text NOT NULL,
    icon text,
    CONSTRAINT asset_types_icon_check CHECK ((icon ~ '^[a-z0-9-]{1,40}$'::text))
);


ALTER TABLE public.asset_types OWNER TO postgres;

REVOKE ALL ON TABLE public.asset_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.asset_types TO authenticated;
GRANT ALL ON TABLE public.asset_types TO service_role;

CREATE TABLE public.asset_attributes (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    data_type text NOT NULL,
    unit text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT asset_attributes_data_type_check CHECK ((data_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'boolean'::text, 'list'::text]))),
    CONSTRAINT asset_attributes_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 100))),
    CONSTRAINT asset_attributes_unit_check CHECK (((unit IS NULL) OR (length(unit) <= 20)))
);


ALTER TABLE public.asset_attributes OWNER TO postgres;

REVOKE ALL ON TABLE public.asset_attributes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.asset_attributes TO authenticated;
GRANT ALL ON TABLE public.asset_attributes TO service_role;

CREATE TABLE public.assets (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    parent_asset_id uuid,
    path public.ltree NOT NULL,
    name text NOT NULL,
    asset_type_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    manufacturer text,
    serial_number text,
    location text,
    responsible_user_id uuid,
    qr_code_token text DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    operating_hours numeric(12,1),
    icon text,
    team_id uuid,
    CONSTRAINT assets_icon_check CHECK ((icon ~ '^[a-z0-9-]{1,40}$'::text)),
    CONSTRAINT assets_not_own_parent CHECK ((parent_asset_id IS DISTINCT FROM id)),
    CONSTRAINT assets_operating_hours_check CHECK ((operating_hours >= (0)::numeric)),
    CONSTRAINT assets_operating_hours_finite CHECK (((operating_hours >= ('-1000000000000'::bigint)::numeric) AND (operating_hours <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT assets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'decommissioned'::text])))
);


ALTER TABLE public.assets OWNER TO postgres;

REVOKE ALL ON TABLE public.assets FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.assets TO authenticated;
GRANT ALL ON TABLE public.assets TO service_role;

CREATE TABLE public.asset_attribute_values (
    asset_id uuid NOT NULL,
    asset_attribute_id uuid NOT NULL,
    value_text text,
    value_number numeric,
    value_date date,
    value_boolean boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid,
    CONSTRAINT asset_attribute_values_one_value CHECK ((num_nonnulls(value_text, value_number, value_date, value_boolean) = 1)),
    CONSTRAINT asset_attribute_values_value_number_finite CHECK (((value_number >= ('-1000000000000'::bigint)::numeric) AND (value_number <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT asset_attribute_values_value_text_check CHECK (((value_text IS NULL) OR ((length(value_text) >= 1) AND (length(value_text) <= 1000))))
);


ALTER TABLE public.asset_attribute_values OWNER TO postgres;

REVOKE ALL ON TABLE public.asset_attribute_values FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.asset_attribute_values TO authenticated;
GRANT ALL ON TABLE public.asset_attribute_values TO service_role;

CREATE TABLE public.asset_type_attributes (
    asset_type_id uuid NOT NULL,
    asset_attribute_id uuid NOT NULL
);


ALTER TABLE public.asset_type_attributes OWNER TO postgres;

REVOKE ALL ON TABLE public.asset_type_attributes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.asset_type_attributes TO authenticated;
GRANT ALL ON TABLE public.asset_type_attributes TO service_role;

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_name_key UNIQUE (name);

ALTER TABLE ONLY public.asset_types
    ADD CONSTRAINT asset_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.asset_attributes
    ADD CONSTRAINT asset_attributes_name_key UNIQUE (name);

ALTER TABLE ONLY public.asset_attributes
    ADD CONSTRAINT asset_attributes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_qr_code_token_key UNIQUE (qr_code_token);

CREATE INDEX assets_asset_type_id_idx ON public.assets USING btree (asset_type_id);

CREATE INDEX assets_location_trgm_idx ON public.assets USING gin (location extensions.gin_trgm_ops);

CREATE INDEX assets_manufacturer_trgm_idx ON public.assets USING gin (manufacturer extensions.gin_trgm_ops);

CREATE INDEX assets_name_trgm_idx ON public.assets USING gin (name extensions.gin_trgm_ops);

CREATE INDEX assets_parent_asset_id_idx ON public.assets USING btree (parent_asset_id);

CREATE INDEX assets_path_idx ON public.assets USING gist (path);

CREATE INDEX assets_responsible_user_id_idx ON public.assets USING btree (responsible_user_id);

CREATE INDEX assets_serial_number_trgm_idx ON public.assets USING gin (serial_number extensions.gin_trgm_ops);

CREATE INDEX assets_team_id_idx ON public.assets USING btree (team_id) WHERE (team_id IS NOT NULL);

ALTER TABLE ONLY public.asset_attribute_values
    ADD CONSTRAINT asset_attribute_values_pkey PRIMARY KEY (asset_id, asset_attribute_id);

CREATE INDEX asset_attribute_values_asset_attribute_id_value_number_idx ON public.asset_attribute_values USING btree (asset_attribute_id, value_number);

CREATE INDEX asset_attribute_values_asset_attribute_id_value_text_idx ON public.asset_attribute_values USING btree (asset_attribute_id, value_text);

ALTER TABLE ONLY public.asset_type_attributes
    ADD CONSTRAINT asset_type_attributes_pkey PRIMARY KEY (asset_type_id, asset_attribute_id);

CREATE INDEX asset_type_attributes_asset_attribute_id_idx ON public.asset_type_attributes USING btree (asset_attribute_id);

ALTER TABLE ONLY public.asset_attributes
    ADD CONSTRAINT asset_attributes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_attributes
    ADD CONSTRAINT asset_attributes_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_parent_asset_id_fkey FOREIGN KEY (parent_asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_attribute_values
    ADD CONSTRAINT asset_attribute_values_asset_attribute_id_fkey FOREIGN KEY (asset_attribute_id) REFERENCES public.asset_attributes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_attribute_values
    ADD CONSTRAINT asset_attribute_values_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_attribute_values
    ADD CONSTRAINT asset_attribute_values_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_type_attributes
    ADD CONSTRAINT asset_type_attributes_asset_attribute_id_fkey FOREIGN KEY (asset_attribute_id) REFERENCES public.asset_attributes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_type_attributes
    ADD CONSTRAINT asset_type_attributes_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id) ON DELETE CASCADE;

CREATE FUNCTION public.asset_attribute_suggestions(p_asset_attribute_id uuid, p_term text DEFAULT ''::text, p_limit integer DEFAULT 20) RETURNS TABLE(value text, usage_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select v.value_text, count(*)
  from public.asset_attribute_values v
  where v.asset_attribute_id = p_asset_attribute_id
    and v.value_text is not null
    and (coalesce(p_term, '') = '' or v.value_text ilike '%' || p_term || '%')
  group by v.value_text
  order by count(*) desc, v.value_text
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;


ALTER FUNCTION public.asset_attribute_suggestions(p_asset_attribute_id uuid, p_term text, p_limit integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_attribute_suggestions(p_asset_attribute_id uuid, p_term text, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_attribute_suggestions(p_asset_attribute_id uuid, p_term text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_attribute_suggestions(p_asset_attribute_id uuid, p_term text, p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.asset_attribute_suggestions(p_asset_attribute_id uuid, p_term text, p_limit integer) TO authenticated;

CREATE FUNCTION public.asset_attribute_values_check_type() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_type text;
begin
  select a.data_type into v_type from public.asset_attributes a where a.id = new.asset_attribute_id;
  if (v_type in ('text', 'list') and new.value_text is null)
     or (v_type = 'number' and new.value_number is null)
     or (v_type = 'date' and new.value_date is null)
     or (v_type = 'boolean' and new.value_boolean is null) then
    raise exception 'asset attribute value does not match data type %', v_type using errcode = '22023';
  end if;
  new.updated_at := now();
  new.updated_by_user_id := auth.uid();
  return new;
end $$;


ALTER FUNCTION public.asset_attribute_values_check_type() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_attribute_values_check_type() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_attribute_values_check_type() FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_attribute_values_check_type() TO service_role;

CREATE FUNCTION public.asset_attributes_check_type_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.data_type is distinct from old.data_type
     and not (new.data_type in ('text', 'list') and old.data_type in ('text', 'list'))
     and exists (select 1 from public.asset_attribute_values v where v.asset_attribute_id = new.id) then
    raise exception 'asset_attribute_in_use' using errcode = '23514',
      hint = 'The data type of an attribute with values cannot change.';
  end if;
  return new;
end $$;


ALTER FUNCTION public.asset_attributes_check_type_change() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_attributes_check_type_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_attributes_check_type_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_attributes_check_type_change() TO service_role;

CREATE FUNCTION public.asset_save_attribute_values(p_asset_id uuid, p_values jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  r record;
  v_text text;
begin
  if jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'p_values must be a JSON object' using errcode = '22023';
  end if;
  for r in
    select a.id, a.data_type, e.value
    from jsonb_each(p_values) e
    join public.asset_attributes a on a.id = e.key::uuid
  loop
    v_text := nullif(btrim(r.value #>> '{}'), '');
    if v_text is null then
      delete from public.asset_attribute_values where asset_id = p_asset_id and asset_attribute_id = r.id;
      continue;
    end if;
    insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text, value_number, value_date, value_boolean)
    values (
      p_asset_id, r.id,
      case when r.data_type in ('text', 'list') then v_text end,
      case when r.data_type = 'number' then v_text::numeric end,
      case when r.data_type = 'date' then v_text::date end,
      case when r.data_type = 'boolean' then v_text::boolean end)
    on conflict (asset_id, asset_attribute_id) do update
      set value_text = excluded.value_text, value_number = excluded.value_number,
          value_date = excluded.value_date, value_boolean = excluded.value_boolean;
  end loop;
end $$;


ALTER FUNCTION public.asset_save_attribute_values(p_asset_id uuid, p_values jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_save_attribute_values(p_asset_id uuid, p_values jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_save_attribute_values(p_asset_id uuid, p_values jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_save_attribute_values(p_asset_id uuid, p_values jsonb) TO service_role;
GRANT ALL ON FUNCTION public.asset_save_attribute_values(p_asset_id uuid, p_values jsonb) TO authenticated;

CREATE FUNCTION public.assets_cascade_path() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  -- The cascading update below fires this trigger again for every descendant; their own
  -- subtrees were already rewritten by the outer statement.
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if new.path is distinct from old.path then
    update public.assets
    set path = new.path operator(public.||) public.subpath(path, public.nlevel(old.path))
    where path operator(public.<@) old.path and id <> new.id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.assets_cascade_path() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assets_cascade_path() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assets_cascade_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assets_cascade_path() TO authenticated;
GRANT ALL ON FUNCTION public.assets_cascade_path() TO service_role;

CREATE FUNCTION public.assets_log_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.log_system_event('assets', new.id, 'asset_created',
      jsonb_strip_nulls(jsonb_build_object('parent_asset_id', new.parent_asset_id)));
    return null;
  end if;
  if new.parent_asset_id is distinct from old.parent_asset_id then
    perform public.log_system_event('assets', new.id, 'asset_moved',
      jsonb_build_object('old_parent_asset_id', old.parent_asset_id, 'new_parent_asset_id', new.parent_asset_id));
  end if;
  if new.status is distinct from old.status then
    perform public.log_system_event('assets', new.id, 'asset_status_changed',
      jsonb_build_object('old', old.status, 'new', new.status));
  end if;
  if new.responsible_user_id is distinct from old.responsible_user_id then
    perform public.log_system_event('assets', new.id, 'asset_responsible_changed',
      jsonb_build_object('old_user_id', old.responsible_user_id, 'new_user_id', new.responsible_user_id));
  end if;
  if new.operating_hours is distinct from old.operating_hours then
    perform public.log_system_event('assets', new.id, 'asset_operating_hours_changed',
      jsonb_build_object('old', old.operating_hours, 'new', new.operating_hours));
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.assets_log_events() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assets_log_events() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assets_log_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assets_log_events() TO authenticated;
GRANT ALL ON FUNCTION public.assets_log_events() TO service_role;

CREATE FUNCTION public.assets_maintain_path() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parent_path public.ltree;
begin
  if new.id is null then
    new.id := public.uuid_generate_v7();
  end if;

  if new.parent_asset_id is null then
    new.path := public.asset_path_label(new.id)::public.ltree;
  else
    select path into v_parent_path from public.assets where id = new.parent_asset_id;
    if v_parent_path is null then
      raise exception 'Parent asset % does not exist', new.parent_asset_id;
    end if;
    -- Cycle guard: the new parent must not live inside this node's own subtree.
    if tg_op = 'UPDATE' and v_parent_path operator(public.<@) old.path then
      raise exception 'An asset cannot be moved below itself or one of its descendants';
    end if;
    new.path := v_parent_path operator(public.||) public.asset_path_label(new.id)::public.ltree;
  end if;

  if tg_op = 'UPDATE' and new.parent_asset_id is distinct from old.parent_asset_id
     and auth.uid() is not null
     and not (public.rls_has('assets.edit.all'))
     and (new.parent_asset_id is null
          or not (new.parent_asset_id = any(public.rls_scope_asset_ids('assets.edit.assigned_assets'))))
  then
    raise exception 'You may only move an asset below a node you can edit';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.assets_maintain_path() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assets_maintain_path() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assets_maintain_path() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assets_maintain_path() TO authenticated;
GRANT ALL ON FUNCTION public.assets_maintain_path() TO service_role;

CREATE FUNCTION public.assets_team_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.team_id is not null and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id)
     and not exists (select 1 from public.team_uses where team_id = new.team_id and use = 'assets') then
    raise exception 'This team cannot be responsible for assets';
  end if;
  -- A scoped editor keeps the access they edit with: some team of theirs stays responsible on the path (counting the
  -- new team for this node).
  if tg_op = 'UPDATE' and new.team_id is distinct from old.team_id and auth.uid() is not null
     and not public.rls_has('assets.edit.all')
     and not exists (
       select 1 from public.assets root
       where new.path operator(public.<@) root.path
         and (case when root.id = new.id then new.team_id else root.team_id end)
             in (select team_id from public.user_teams where user_id = auth.uid())
     ) then
    raise exception 'You cannot take away your own access to this asset';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.assets_team_check() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assets_team_check() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assets_team_check() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assets_team_check() TO service_role;

CREATE FUNCTION public.assets_team_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_by uuid := auth.uid();
  v_by_name text := (select name from public.users where id = auth.uid());
begin
  if tg_op = 'UPDATE' and old.team_id is not null and old.team_id is distinct from new.team_id then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, team_id, team_name, asset_id, asset_name)
    values (v_by, v_by_name, 'asset_grant', 'removed', old.team_id, (select name from public.teams where id = old.team_id), new.id, new.name);
  end if;
  if new.team_id is not null and (tg_op = 'INSERT' or new.team_id is distinct from old.team_id) then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, team_id, team_name, asset_id, asset_name)
    values (v_by, v_by_name, 'asset_grant', 'added', new.team_id, (select name from public.teams where id = new.team_id), new.id, new.name);
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.assets_team_log() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assets_team_log() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assets_team_log() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assets_team_log() TO service_role;

CREATE FUNCTION public.rls_scope_asset_ids(p_permission text) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(distinct a.id), '{}')
  from public.assets root
  join public.assets a on a.path operator(public.<@) root.path
  where p_permission = any(public.rls_my_permissions())
    and root.team_id in (select team_id from public.user_teams where user_id = auth.uid());
$$;


ALTER FUNCTION public.rls_scope_asset_ids(p_permission text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_scope_asset_ids(p_permission text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_scope_asset_ids(p_permission text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_scope_asset_ids(p_permission text) TO authenticated;
GRANT ALL ON FUNCTION public.rls_scope_asset_ids(p_permission text) TO service_role;

CREATE FUNCTION public.rls_task_asset_keys(p_action text) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(distinct p.module || ':' || a.id::text), '{}')
  from public.permissions p
  join public.assets root on root.team_id in (select team_id from public.user_teams where user_id = auth.uid())
  join public.assets a on a.path operator(public.<@) root.path
  where p.task_family and p.action = p_action and p.scope = 'assigned_assets'
    and p.key = any(public.rls_my_permissions());
$$;


ALTER FUNCTION public.rls_task_asset_keys(p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_task_asset_keys(p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_task_asset_keys(p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_task_asset_keys(p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.rls_task_asset_keys(p_action text) TO service_role;

CREATE FUNCTION public.rls_task_asset_scope(p_action text) RETURNS TABLE(module text, asset_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select distinct p.module, a.id
  from public.permissions p
  join public.assets root on root.team_id in (select team_id from public.user_teams where user_id = auth.uid())
  join public.assets a on a.path operator(public.<@) root.path
  where p.task_family and p.action = p_action and p.scope = 'assigned_assets'
    and p.key = any(public.rls_my_permissions());
$$;


ALTER FUNCTION public.rls_task_asset_scope(p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_task_asset_scope(p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_task_asset_scope(p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_task_asset_scope(p_action text) TO service_role;
GRANT ALL ON FUNCTION public.rls_task_asset_scope(p_action text) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_step_user_id uuid DEFAULT NULL::uuid, p_step_team_id uuid DEFAULT NULL::uuid, p_step_role_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_perms text[];
  v_base text := p_entity_type || '.' || p_grant_type;
  v_routed boolean := p_grant_type in ('edit', 'delete')
    and (p_step_user_id is not null or p_step_team_id is not null or p_step_role_id is not null);
begin
  if p_user_id is null then
    return false;
  end if;
  v_perms := public.user_permissions(p_user_id);

  if (v_base || '.all') = any(v_perms) then
    return true;
  end if;
  -- Mirrors rls_task_allows: for editing and deleting, a step that names somebody replaces the task's person and team.
  if (v_base || '.assigned') = any(v_perms)
     and ((not v_routed and p_user_id = p_assigned_user_id)
          or p_user_id = p_step_user_id
          or (p_step_user_id is not null and p_user_id is distinct from p_owner_user_id
              and exists (select 1 from public.users where id = p_step_user_id and deputy_user_id = p_user_id))) then
    return true;
  end if;
  if (v_base || '.created') = any(v_perms) and (p_grant_type = 'create' or p_user_id = p_owner_user_id) then
    return true;
  end if;
  if (v_base || '.team') = any(v_perms) and exists (
    select 1 from public.user_teams
    where user_id = p_user_id
      and ((not v_routed and team_id = p_assigned_team_id)
           or (p_step_user_id is null and p_step_role_id is null and team_id = p_step_team_id))
  ) then
    return true;
  end if;
  if p_asset_id is not null and (v_base || '.assigned_assets') = any(v_perms) and exists (
    select 1
    from public.assets a
    join public.assets root on a.path operator(public.<@) root.path
    where a.id = p_asset_id
      and root.team_id in (select team_id from public.user_teams where user_id = p_user_id)
  ) then
    return true;
  end if;
  return false;
end;
$$;


ALTER FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.task_rights(p_task_ids uuid[]) RETURNS TABLE(task_id uuid, view boolean, "check" boolean, edit boolean, act boolean, decision boolean, forward boolean, claim boolean, reopen boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- materialized: read the caller's context once, not again for every task
  with me as materialized (
    select auth.uid() as uid, public.rls_my_permissions() as perms, public.rls_my_team_ids() as teams,
           public.rls_my_role_ids() as roles, public.rls_my_assignee_ids() as assignees,
           public.rls_my_task_type_ids() as types, public.rls_task_asset_keys('view') as keys_view,
           public.rls_task_asset_keys('check') as keys_check, public.rls_task_asset_keys('edit') as keys_edit
  ),
  base as (
    select t.*, me.*,
           t.status not in ('done', 'cancelled') as open,
           coalesce(st.is_decision or st.assignee_kind = 'requester_supervisor', false) as is_decision,
           tt.purpose,
           t.task_type_id = any (me.types) as typed,
           -- task_is_worked_by: the assignee, the step's person or whom I stand in for, the holders of the step
           (t.assigned_user_id = me.uid
            or t.current_assignee_user_id = any (me.assignees)
            or ((t.current_assignee_role_id is not null or t.current_assignee_team_id is not null)
                and (t.current_assignee_role_id is null or t.current_assignee_role_id = any (me.roles))
                and (t.current_assignee_team_id is null or t.current_assignee_team_id = any (me.teams)))) as worked
    from me
    join public.tasks t on t.id = any (p_task_ids[1:200])
    join public.task_types tt on tt.id = t.task_type_id
    left join public.task_type_steps st on st.task_type_id = t.task_type_id and st.step_key = t.current_step_key
    where me.uid is not null
  ),
  -- materialized: each flag is computed once per task (inlined, every use of can_edit below would call it again)
  r as materialized (
    select b.*,
           (b.typed and public.rls_task_allows('view', b.permission_module, b.asset_id, b.assigned_user_id, b.created_by_user_id,
              b.team_id, b.current_assignee_user_id, b.current_assignee_team_id, b.current_assignee_role_id,
              b.perms, b.teams, b.keys_view, b.assignees)) or b.worked as can_view,
           (b.typed and public.rls_task_allows('check', b.permission_module, b.asset_id, b.assigned_user_id, b.created_by_user_id,
              b.team_id, b.current_assignee_user_id, b.current_assignee_team_id, b.current_assignee_role_id,
              b.perms, b.teams, b.keys_check, b.assignees)) or b.worked as can_check,
           b.typed and public.rls_task_allows('edit', b.permission_module, b.asset_id, b.assigned_user_id, b.created_by_user_id,
              b.team_id, b.current_assignee_user_id, b.current_assignee_team_id, b.current_assignee_role_id,
              b.perms, b.teams, b.keys_edit, b.assignees) as can_edit
    from base b
  ),
  a as (
    -- task_step_actor: never the requester in a decision step; the step's person (or their deputy, unless the deputy
    -- started the task); else the holders of the step's role / team; a step that names nobody: whoever may edit.
    select r.*,
           not (r.is_decision and r.uid = r.created_by_user_id)
           and ((r.current_assignee_user_id is not null and r.can_view
                 and (r.current_assignee_user_id = r.uid
                      or (r.current_assignee_user_id = any (r.assignees) and r.uid is distinct from r.created_by_user_id)))
                or (r.current_assignee_user_id is null and r.can_view
                    and (r.current_assignee_role_id is not null or r.current_assignee_team_id is not null)
                    and (r.current_assignee_role_id is null or r.current_assignee_role_id = any (r.roles))
                    and (r.current_assignee_team_id is null or r.current_assignee_team_id = any (r.teams)))
                or (r.current_assignee_user_id is null and r.current_assignee_team_id is null
                    and r.current_assignee_role_id is null and r.can_edit)) as step_actor
    from r
    where coalesce(r.can_view, false)
  )
  -- coalesce: a task without a team or step leaves NULLs in the comparisons, the UI wants true or false
  select a.id, true, coalesce(a.can_check, false), coalesce(a.can_edit, false),
         coalesce(a.open and a.step_actor, false),
         a.is_decision,
         coalesce(a.open and (a.step_actor or (not a.is_decision and a.can_edit)), false),
         coalesce(a.open and a.can_edit and a.assigned_user_id is null and a.team_id = any (a.teams), false),
         coalesce(not a.open and a.can_edit and a.purpose is null and a.recurring_task_rule_id is null, false)
  from a;
$$;


ALTER FUNCTION public.task_rights(p_task_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.tasks_log_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.log_system_event('tasks', new.id, 'task_created',
      jsonb_strip_nulls(jsonb_build_object(
        'task_type_id', new.task_type_id, 'step_key', new.current_step_key, 'anchor_type', new.anchor_type, 'anchor_id', new.anchor_id,
        'team_id', new.team_id, 'assigned_user_id', new.assigned_user_id, 'planned_date', new.planned_date,
        'parent_task_id', new.parent_task_id)));
    if new.parent_task_id is not null then
      perform public.log_system_event('tasks', new.parent_task_id, 'task_subtask_added',
        jsonb_build_object('task_id', new.id, 'task_number', new.task_number, 'title', new.title));
    end if;
    if new.assigned_user_id is not null
       and coalesce(current_setting('app.assignee_notified', true), '') <> 'on'
       and (new.recurring_task_rule_id is not null
            or (auth.uid() is not null and new.assigned_user_id <> auth.uid())) then
      perform public.notify(
        array[new.assigned_user_id], 'task_assigned',
        '#' || new.task_number || ' ' || new.title, '/tasks/' || new.id,
        null, case when new.recurring_task_rule_id is null then auth.uid() end, 'tasks', new.id,
        'task-assigned:' || new.id,
        array['in_app', 'toast'], jsonb_build_object('number', new.task_number, 'title', new.title));
    end if;
    return null;
  end if;
  if new.title is distinct from old.title then
    perform public.log_system_event('tasks', new.id, 'task_title_changed',
      jsonb_build_object('old', old.title, 'new', new.title));
  end if;
  if new.priority is distinct from old.priority then
    perform public.log_system_event('tasks', new.id, 'task_priority_changed',
      jsonb_build_object('old', old.priority, 'new', new.priority));
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.log_system_event('tasks', new.id, 'task_due_date_changed',
      jsonb_build_object('old', old.due_date, 'new', new.due_date));
  end if;
  if new.asset_id is distinct from old.asset_id then
    perform public.log_system_event('tasks', new.id, 'task_asset_changed',
      jsonb_build_object('old_asset_id', old.asset_id, 'new_asset_id', new.asset_id));
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.tasks_log_events() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_log_events() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_log_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_log_events() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_log_events() TO service_role;

CREATE OR REPLACE FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text DEFAULT 'normal'::text, p_description text DEFAULT NULL::text, p_asset_id uuid DEFAULT NULL::uuid, p_anchor_type text DEFAULT NULL::text, p_anchor_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid, p_assigned_user_id uuid DEFAULT NULL::uuid, p_parent_task_id uuid DEFAULT NULL::uuid, p_is_initiative boolean DEFAULT false, p_blocks_parent boolean DEFAULT NULL::boolean, p_set_checklist boolean DEFAULT false, p_checklist_template_id uuid DEFAULT NULL::uuid, p_own_items text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  insert into public.tasks (task_type_id, title, description, asset_id, anchor_type, anchor_id, priority, due_date, team_id, assigned_user_id,
                            parent_task_id, is_initiative)
  values (p_task_type_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_asset_id, p_anchor_type, p_anchor_id, p_priority,
          p_due_date, p_team_id, p_assigned_user_id, p_parent_task_id, coalesce(p_is_initiative, false))
  returning id into v_id;
  perform public.task_create_finish(v_id, p_blocks_parent, p_set_checklist, p_checklist_template_id, p_own_items);
  return v_id;
end;
$$;


ALTER FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) TO service_role;
GRANT ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.recurring_rules_init() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.schedule_kind <> 'operating_hours' and new.next_due_date is null and new.repeat_mode = 'fixed_schedule' then
    new.next_due_date := new.start_date;
  end if;
  if new.schedule_kind <> 'operating_hours' and tg_op = 'INSERT' and new.next_due_date is null then
    new.next_due_date := new.start_date;
  end if;
  if new.schedule_kind = 'operating_hours' and tg_op = 'INSERT' and new.last_generated_hours is null then
    -- the first task comes after one full interval from now, not immediately
    new.last_generated_hours := (select operating_hours from public.assets where id = new.asset_id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.recurring_rules_init() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_rules_init() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_rules_init() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_rules_init() TO authenticated;
GRANT ALL ON FUNCTION public.recurring_rules_init() TO service_role;

CREATE OR REPLACE FUNCTION public.generate_recurring_tasks(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  r public.recurring_task_rules;
  v_created integer := 0;
  v_due date;
  v_hours numeric;
  v_next date;
begin
  for r in
    select * from public.recurring_task_rules
    where active and (end_date is null or end_date >= p_today) and start_date <= p_today
    order by created_at
  loop
    begin
      if r.skip_if_open and exists (
        select 1 from public.tasks where recurring_task_rule_id = r.id and status not in ('done', 'cancelled')
      ) then
        continue;
      end if;

      if r.schedule_kind = 'operating_hours' then
        select operating_hours into v_hours from public.assets where id = r.asset_id;
        if v_hours is null or v_hours < coalesce(r.last_generated_hours, 0) + r.operating_hours_interval then
          continue;
        end if;
        v_due := p_today;
      else
        if r.next_due_date is null or r.next_due_date - r.lead_days > p_today
           or (r.end_date is not null and r.next_due_date > r.end_date) then
          continue;
        end if;
        v_due := r.next_due_date;
      end if;

      perform public.recurring_spawn_task(r, v_due);

      if r.schedule_kind = 'operating_hours' then
        update public.recurring_task_rules set last_generated_hours = v_hours where id = r.id;
      elsif r.repeat_mode = 'after_completion' then
        update public.recurring_task_rules set next_due_date = null where id = r.id;
      else
        v_next := public.recurring_add_interval(r.next_due_date, r.schedule_kind, r.interval_count);
        -- a long outage must not produce a backlog of missed periods: skip to the next future date
        while v_next < p_today loop
          v_next := public.recurring_add_interval(v_next, r.schedule_kind, r.interval_count);
        end loop;
        update public.recurring_task_rules set next_due_date = v_next where id = r.id;
      end if;
      v_created := v_created + 1;
    exception when others then
      -- one broken rule must not stop the others; the error is shown on the rule
      update public.recurring_task_rules set last_error = sqlerrm where id = r.id;
    end;
  end loop;
  return v_created;
end;
$$;


ALTER FUNCTION public.generate_recurring_tasks(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.generate_recurring_tasks(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_recurring_tasks(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_recurring_tasks(p_today date) TO service_role;

CREATE OR REPLACE FUNCTION public.recurring_spawn_task(r public.recurring_task_rules, p_due date) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_assignee uuid;
  v_members uuid[];
  v_index integer;
  v_task public.tasks;
  v_recipients uuid[];
begin
  if r.assignment_mode = 'user' then
    v_assignee := r.assigned_user_id;
  elsif r.assignment_mode = 'rotate' then
    select array_agg(ug.user_id order by u.name nulls last, ug.user_id) into v_members
    from public.user_teams ug join public.users u on u.id = ug.user_id
    where ug.team_id = r.team_id;
    if v_members is not null then
      v_index := coalesce(array_position(v_members, r.last_assigned_user_id), 0);
      v_assignee := v_members[(v_index % array_length(v_members, 1)) + 1];
    end if;
  end if;

  -- The type's default checklist is added by trigger; the rule's own template replaces it. Every task gets the CURRENT
  -- version of the template, so editing an official checklist changes all tasks created afterwards.
  insert into public.tasks (task_type_id, title, description, priority, asset_id, due_date, team_id,
                            assigned_user_id, recurring_task_rule_id)
  values (r.task_type_id, r.name, r.description, r.priority, r.asset_id, p_due, r.team_id,
          v_assignee, r.id)
  returning * into v_task;

  if r.checklist_template_id is not null then
    perform public.checklist_apply_template(v_task.id, r.checklist_template_id);
  end if;
  if r.checklist_items is not null and jsonb_array_length(r.checklist_items) > 0 then
    perform public.checklist_add_items(v_task.id, r.checklist_items);
  end if;

  update public.recurring_task_rules
  set last_generated_at = now(), last_error = null,
      last_assigned_user_id = coalesce(v_assignee, last_assigned_user_id)
  where id = r.id;

  if v_task.assigned_user_id is null and r.team_id is not null then
    select coalesce(array_agg(user_id), '{}') into v_recipients from public.user_teams where team_id = r.team_id;
    perform public.notify(
      v_recipients, 'task_for_team',
      '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id, null, null, 'tasks', v_task.id,
      'task-assigned:' || v_task.id, array['in_app', 'toast'],
      jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
  end if;
  return v_task;
end;
$$;


ALTER FUNCTION public.recurring_spawn_task(r public.recurring_task_rules, p_due date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_spawn_task(r public.recurring_task_rules, p_due date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_spawn_task(r public.recurring_task_rules, p_due date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_spawn_task(r public.recurring_task_rules, p_due date) TO service_role;

CREATE OR REPLACE FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) RETURNS TABLE(kind text, ref_id uuid, label text, label_de text, access_level text, sources text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_module text;
  v_task public.tasks;
  v_asset_id uuid;
  v_queue_id uuid;
  v_queue_has_teams boolean := false;
begin
  if v_me is null or p_entity_type not in ('tasks', 'assets') then
    return;
  end if;
  if not public.user_has_access(v_me, p_entity_type, p_entity_id, 'view') then
    return;
  end if;

  if p_entity_type = 'tasks' then
    select * into v_task from public.tasks where id = p_entity_id;
    v_module := v_task.permission_module;
    v_asset_id := v_task.asset_id;
  else
    v_module := 'assets';
    v_asset_id := p_entity_id;
  end if;

  return query
  with cand_team (team_id, source) as (
    select t, 'assigned' from unnest(case p_entity_type
      when 'tasks' then array[v_task.team_id, v_task.current_assignee_team_id]
      else array[]::uuid[] end) t
    where t is not null
    union all
    select root.team_id, 'asset'
    from public.assets a
    join public.assets root on a.path operator(public.<@) root.path
    where a.id = v_asset_id and root.team_id is not null
  ),
  teams as (
    select c.team_id, array_agg(distinct c.source order by c.source) as sources from cand_team c group by c.team_id
  ),
  team_rows as (
    select 'team'::text as kind, g.id as ref_id, g.name as label, null::text as label_de,
           case
             when exists (select 1 from public.user_teams ug join public.users u on u.id = ug.user_id
                          where ug.team_id = g.id and u.has_login and u.locked_at is null
                            and public.user_has_access(ug.user_id, p_entity_type, p_entity_id, 'edit')) then 'edit'
             when exists (select 1 from public.user_teams ug join public.users u on u.id = ug.user_id
                          where ug.team_id = g.id and u.has_login and u.locked_at is null
                            and public.user_has_access(ug.user_id, p_entity_type, p_entity_id, 'view')) then 'view'
           end as access_level,
           t.sources
    from teams t join public.teams g on g.id = t.team_id
  ),
  cand_person (user_id, source) as (
    select * from (values
      (v_task.assigned_user_id, 'assignee'), (v_task.current_assignee_user_id, 'handler'), (v_task.created_by_user_id, 'creator')
    ) as v (user_id, source)
    where v.user_id is not null
  ),
  people as (
    select c.user_id, array_agg(distinct c.source order by c.source) as sources from cand_person c group by c.user_id
  ),
  person_rows as (
    select 'user'::text as kind, u.id as ref_id, u.name as label, null::text as label_de,
           case
             when public.user_has_access(u.id, p_entity_type, p_entity_id, 'edit') then 'edit'
             when public.user_has_access(u.id, p_entity_type, p_entity_id, 'view') then 'view'
           end as access_level,
           p.sources
    from people p join public.users u on u.id = p.user_id
    where u.has_login and u.locked_at is null
  ),
  role_rows as (
    select 'role'::text as kind, r.id as ref_id, r.name as label, (r.translations ->> 'de'::text) as label_de,
           case when exists (select 1 from public.role_permissions rp join public.permission_closure c on c.permission = rp.permission
                             where rp.role_id = r.id and c.implied = v_module || '.edit.all') then 'edit' else 'view' end as access_level,
           array['all']::text[] as sources
    from public.roles r
    where not v_queue_has_teams
      and exists (select 1 from public.role_permissions rp join public.permission_closure c on c.permission = rp.permission
                  where rp.role_id = r.id and c.implied = v_module || '.view.all')
      and exists (select 1 from public.user_roles ur join public.users u on u.id = ur.user_id where ur.role_id = r.id and u.has_login)
      and (p_entity_type <> 'tasks'
           or not exists (select 1 from public.role_task_types rtt where rtt.role_id = r.id)
           or exists (select 1 from public.role_task_types rtt where rtt.role_id = r.id and rtt.task_type_id = v_task.task_type_id))
  )
  select x.kind, x.ref_id, x.label, x.label_de, x.access_level, x.sources
  from (
    select * from team_rows
    union all select * from person_rows
    union all select * from role_rows
  ) x
  where x.access_level is not null
  order by case x.kind when 'team' then 1 when 'user' then 2 else 3 end, x.label;
end;
$$;


ALTER FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) TO authenticated;

ALTER TABLE public.asset_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage asset types" ON public.asset_types TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read asset types" ON public.asset_types FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.asset_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_asset_types_name_de BEFORE INSERT OR UPDATE ON public.asset_types FOR EACH ROW EXECUTE FUNCTION public.master_data_default_name_de();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.asset_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.asset_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage asset attributes" ON public.asset_attributes TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read asset attributes" ON public.asset_attributes FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.asset_attributes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER asset_attributes_check_type_change BEFORE UPDATE OF data_type ON public.asset_attributes FOR EACH ROW EXECUTE FUNCTION public.asset_attributes_check_type_change();

CREATE TRIGGER asset_attributes_set_updated BEFORE INSERT OR UPDATE ON public.asset_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create assets per grant" ON public.assets FOR INSERT WITH CHECK ((( SELECT public.rls_has('assets.create.all'::text) AS rls_has) OR (parent_asset_id = ANY (( SELECT public.rls_scope_asset_ids('assets.create.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))));

CREATE POLICY "Delete assets per grant" ON public.assets FOR DELETE USING ((( SELECT public.rls_has('assets.delete.all'::text) AS rls_has) OR (id = ANY (( SELECT public.rls_scope_asset_ids('assets.delete.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))));

CREATE POLICY "Edit assets per grant" ON public.assets FOR UPDATE USING ((( SELECT public.rls_has('assets.edit.all'::text) AS rls_has) OR (id = ANY (( SELECT public.rls_scope_asset_ids('assets.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[])))) WITH CHECK ((( SELECT public.rls_has('assets.edit.all'::text) AS rls_has) OR (id = ANY (( SELECT public.rls_scope_asset_ids('assets.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))));

CREATE POLICY "View assets per grant" ON public.assets FOR SELECT USING ((( SELECT public.rls_has('assets.view.all'::text) AS rls_has) OR (id = ANY (( SELECT public.rls_scope_asset_ids('assets.view.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))));

CREATE POLICY mfa_required ON public.assets AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER assets_a_team_check BEFORE INSERT OR UPDATE OF team_id ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_team_check();

CREATE TRIGGER assets_cascade_path AFTER UPDATE OF path ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_cascade_path();

CREATE TRIGGER assets_log_events AFTER INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_log_events();

CREATE TRIGGER assets_maintain_path BEFORE INSERT OR UPDATE OF parent_asset_id ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_maintain_path();

CREATE TRIGGER assets_team_log AFTER INSERT OR UPDATE OF team_id ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_team_log();

CREATE TRIGGER cleanup_feed AFTER DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.cleanup_entity_feed('assets');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.asset_attribute_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create asset attribute values" ON public.asset_attribute_values FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('assets.edit.all'::text) AS rls_has) OR (asset_id = ANY (( SELECT public.rls_scope_asset_ids('assets.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[])) OR (EXISTS ( SELECT 1
   FROM public.assets a
  WHERE ((a.id = asset_attribute_values.asset_id) AND (a.created_by_user_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Delete asset attribute values" ON public.asset_attribute_values FOR DELETE TO authenticated USING ((( SELECT public.rls_has('assets.edit.all'::text) AS rls_has) OR (asset_id = ANY (( SELECT public.rls_scope_asset_ids('assets.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))));

CREATE POLICY "Edit asset attribute values" ON public.asset_attribute_values FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('assets.edit.all'::text) AS rls_has) OR (asset_id = ANY (( SELECT public.rls_scope_asset_ids('assets.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[])))) WITH CHECK ((( SELECT public.rls_has('assets.edit.all'::text) AS rls_has) OR (asset_id = ANY (( SELECT public.rls_scope_asset_ids('assets.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))));

CREATE POLICY "View asset attribute values" ON public.asset_attribute_values FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.assets a
  WHERE (a.id = asset_attribute_values.asset_id))));

CREATE POLICY mfa_required ON public.asset_attribute_values AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER asset_attribute_values_check_type BEFORE INSERT OR UPDATE ON public.asset_attribute_values FOR EACH ROW EXECUTE FUNCTION public.asset_attribute_values_check_type();

ALTER TABLE public.asset_type_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage asset type attributes" ON public.asset_type_attributes TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read asset type attributes" ON public.asset_type_attributes FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.asset_type_attributes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.assets_overview WITH (security_invoker='on') AS
 SELECT a.id,
    a.parent_asset_id,
    a.path,
    a.name,
    a.asset_type_id,
    a.status,
    a.manufacturer,
    a.serial_number,
    a.location,
    a.responsible_user_id,
    a.qr_code_token,
    a.created_at,
    a.updated_at,
    a.created_by_user_id,
    a.updated_by_user_id,
    a.operating_hours,
    t.name AS asset_type_name,
    COALESCE(t.is_grouping, false) AS is_grouping,
    ru.name AS responsible_user_name,
    ( SELECT string_agg(p.name, ' / '::text ORDER BY (public.nlevel(p.path))) AS string_agg
           FROM public.assets p
          WHERE ((a.path OPERATOR(public.<@) p.path) AND (p.id <> a.id))) AS ancestor_path_label,
    ARRAY( SELECT (replace(x.l, '_'::text, '-'::text))::uuid AS replace
           FROM unnest(string_to_array(public.ltree2text(a.path), '.'::text)) WITH ORDINALITY x(l, n)
          WHERE (x.n < public.nlevel(a.path))
          ORDER BY x.n) AS ancestor_asset_ids,
    ( SELECT count(*) AS count
           FROM public.assets c
          WHERE (c.parent_asset_id = a.id)) AS child_count,
    (0)::bigint AS open_ticket_count,
    ( SELECT count(*) AS count
           FROM public.tasks s
          WHERE ((s.asset_id = a.id) AND (s.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))) AS open_task_count,
    nt.id AS next_task_id,
    nt.title AS next_task_title,
    nt.due_date AS next_task_due_date,
    COALESCE(( SELECT jsonb_object_agg(('a'::text || replace((v.asset_attribute_id)::text, '-'::text, ''::text)), COALESCE(to_jsonb(v.value_number), to_jsonb(v.value_date), to_jsonb(v.value_boolean), to_jsonb(v.value_text))) AS jsonb_object_agg
           FROM public.asset_attribute_values v
          WHERE (v.asset_id = a.id)), '{}'::jsonb) AS attribute_values,
    t.name_de AS asset_type_name_de,
    a.icon,
    COALESCE(( SELECT p.icon
           FROM public.assets p
          WHERE ((a.path OPERATOR(public.<@) p.path) AND (p.icon IS NOT NULL))
          ORDER BY (public.nlevel(p.path)) DESC
         LIMIT 1), t.icon) AS effective_icon,
    (NOT (EXISTS ( SELECT 1
           FROM public.assets p
          WHERE (p.id = a.parent_asset_id)))) AS is_visible_root
   FROM (((public.assets a
     LEFT JOIN public.asset_types t ON ((t.id = a.asset_type_id)))
     LEFT JOIN public.users ru ON ((ru.id = a.responsible_user_id)))
     LEFT JOIN LATERAL ( SELECT s.id,
            s.title,
            s.due_date
           FROM public.tasks s
          WHERE ((s.asset_id = a.id) AND (s.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))
          ORDER BY s.due_date, s.created_at
         LIMIT 1) nt ON (true));


ALTER VIEW public.assets_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.assets_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.assets_overview TO authenticated;
GRANT ALL ON TABLE public.assets_overview TO service_role;

CREATE VIEW public.tasks_overview WITH (security_invoker='true') AS
 SELECT t.id,
    t.task_number,
    t.task_type_id,
    t.current_step_key,
    t.status,
    t.current_assignee_role_id,
    t.completed_at,
    t.title,
    t.description,
    t.priority,
    t.asset_id,
    NULL::uuid AS ticket_id,
    t.due_date,
    t.team_id,
    t.assigned_user_id,
    t.planned_date,
    t.sort_order,
    t.created_at,
    t.updated_at,
    t.created_by_user_id,
    t.updated_by_user_id,
    t.recurring_task_rule_id,
    t.checklist_template_id,
    t.checklist_completed_at,
    t.parent_task_id,
    t.permission_module,
    t.work_hours,
    t.downtime_from,
    t.downtime_to,
    t.goal_id,
    t.original_due_date,
    t.current_assignee_user_id,
    t.root_task_id,
    t.bucket_id,
    t.current_assignee_team_id,
    t.blocks_parent,
    tt.name AS task_type_name,
    st.name AS current_step_name,
    a.name AS asset_name,
    au.name AS assigned_user_name,
    g.name AS team_name,
    cu.name AS created_by_name,
    k.ticket_number,
    ((t.due_date IS NOT NULL) AND (t.due_date < CURRENT_DATE) AND (t.status <> ALL (ARRAY['done'::text, 'cancelled'::text]))) AS is_overdue,
    COALESCE(cl.total, (0)::bigint) AS checklist_items_total,
    COALESCE(cl.answered, (0)::bigint) AS checklist_items_done,
    pt.task_number AS parent_task_number,
    pt.title AS parent_title,
    ( SELECT count(*) AS count
           FROM public.tasks s
          WHERE (s.parent_task_id = t.id)) AS subtask_count,
    ( SELECT count(*) AS count
           FROM public.tasks s
          WHERE ((s.parent_task_id = t.id) AND (s.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))) AS open_subtask_count,
    NULL::bigint AS items_waiting,
    public.task_date_conflict(t.status, t.due_date, pt.status, pt.due_date) AS date_conflict,
    pt.due_date AS parent_due_date,
    bl.blocking_subtask_count,
    ((bl.blocking_subtask_count > 0) AND (t.status <> ALL (ARRAY['done'::text, 'cancelled'::text]))) AS is_blocked,
    tt.name_de AS task_type_name_de,
    st.name_de AS current_step_name_de,
    t.is_initiative,
    t.anchor_type,
    t.anchor_id,
    ca.name AS current_assignee_user_name,
    cg.name AS current_assignee_team_name,
    cr.name AS current_assignee_role_name
   FROM (((((((((((((public.tasks t
     JOIN public.task_types tt ON ((tt.id = t.task_type_id)))
     LEFT JOIN public.task_type_steps st ON (((st.task_type_id = t.task_type_id) AND (st.step_key = t.current_step_key))))
     LEFT JOIN public.assets a ON ((a.id = t.asset_id)))
     LEFT JOIN public.users au ON ((au.id = t.assigned_user_id)))
     LEFT JOIN public.teams g ON ((g.id = t.team_id)))
     LEFT JOIN public.users cu ON ((cu.id = t.created_by_user_id)))
     LEFT JOIN LATERAL ( SELECT NULL::bigint AS ticket_number) k ON (true))
     LEFT JOIN public.tasks pt ON ((pt.id = t.parent_task_id)))
     LEFT JOIN public.users ca ON ((ca.id = t.current_assignee_user_id)))
     LEFT JOIN public.teams cg ON ((cg.id = t.current_assignee_team_id)))
     LEFT JOIN public.roles cr ON ((cr.id = t.current_assignee_role_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS blocking_subtask_count
           FROM public.tasks s
          WHERE ((s.parent_task_id = t.id) AND s.blocks_parent AND (s.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))) bl ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE i.counted) AS total,
            count(*) FILTER (WHERE (i.counted AND public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text))) AS answered
           FROM ( SELECT c.id,
                    c.sort_order,
                    c.kind,
                    c.label,
                    c.hint,
                    c.required,
                    c.unit,
                    c.min_value,
                    c.max_value,
                    c.done,
                    c.result,
                    c.value_number,
                    c.value_text,
                    c.note,
                    c.answered_by_user_id,
                    c.answered_at,
                    NULL::uuid AS ticket_id,
                    c.task_id,
                    c.from_template,
                    c.step_key,
                    ((c.kind <> 'heading'::text) AND (c.required OR (NOT bool_or(c.required) OVER ()))) AS counted
                   FROM public.task_checklist_items c
                  WHERE (c.task_id = t.id)) i) cl ON (true));


ALTER VIEW public.tasks_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.tasks_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tasks_overview TO authenticated;
GRANT ALL ON TABLE public.tasks_overview TO service_role;

CREATE VIEW public.initiatives_overview WITH (security_invoker='true') AS
 WITH RECURSIVE tree(root_id, id) AS (
         SELECT t.id,
            t.id
           FROM (public.tasks t
             JOIN public.task_types tt_1 ON (((tt_1.id = t.task_type_id) AND t.is_initiative)))
        UNION ALL
         SELECT tr.root_id,
            c.id
           FROM (tree tr
             JOIN public.tasks c ON ((c.parent_task_id = tr.id)))
        ), progress AS (
         SELECT tr.root_id,
            count(*) FILTER (WHERE (d.status <> 'cancelled'::text)) AS tasks_total,
            count(*) FILTER (WHERE (d.status = 'done'::text)) AS tasks_done,
            count(*) FILTER (WHERE ((d.status <> ALL (ARRAY['done'::text, 'cancelled'::text])) AND (d.due_date < CURRENT_DATE))) AS tasks_overdue
           FROM (tree tr
             JOIN public.tasks d ON ((d.id = tr.id)))
          WHERE (tr.id <> tr.root_id)
          GROUP BY tr.root_id
        )
 SELECT o.id,
    o.task_number,
    o.task_type_id,
    o.current_step_key,
    o.status,
    o.current_assignee_role_id,
    o.completed_at,
    o.title,
    o.description,
    o.priority,
    o.asset_id,
    o.ticket_id,
    o.due_date,
    o.team_id,
    o.assigned_user_id,
    o.planned_date,
    o.sort_order,
    o.created_at,
    o.updated_at,
    o.created_by_user_id,
    o.updated_by_user_id,
    o.recurring_task_rule_id,
    o.checklist_template_id,
    o.checklist_completed_at,
    o.parent_task_id,
    o.permission_module,
    o.work_hours,
    o.downtime_from,
    o.downtime_to,
    o.goal_id,
    o.original_due_date,
    o.current_assignee_user_id,
    o.root_task_id,
    o.bucket_id,
    o.current_assignee_team_id,
    o.blocks_parent,
    o.task_type_name,
    o.current_step_name,
    o.asset_name,
    o.assigned_user_name,
    o.team_name,
    o.created_by_name,
    o.ticket_number,
    o.is_overdue,
    o.checklist_items_total,
    o.checklist_items_done,
    o.parent_task_number,
    o.parent_title,
    o.subtask_count,
    o.open_subtask_count,
    o.items_waiting,
    o.date_conflict,
    o.parent_due_date,
    o.blocking_subtask_count,
    o.is_blocked,
    COALESCE(p.tasks_total, (0)::bigint) AS tasks_total,
    COALESCE(p.tasks_done, (0)::bigint) AS tasks_done,
    COALESCE(p.tasks_overdue, (0)::bigint) AS tasks_overdue,
    o.task_type_name_de,
    o.current_step_name_de
   FROM ((public.tasks_overview o
     JOIN public.task_types tt ON (((tt.id = o.task_type_id) AND o.is_initiative)))
     LEFT JOIN progress p ON ((p.root_id = o.id)));


ALTER VIEW public.initiatives_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.initiatives_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.initiatives_overview TO authenticated;
GRANT ALL ON TABLE public.initiatives_overview TO service_role;

CREATE VIEW public.tasks_my_requests WITH (security_invoker='true') AS
 SELECT o.id,
    o.task_number,
    o.title,
    o.status,
    o.priority,
    o.due_date,
    o.created_at,
    o.completed_at,
    o.task_type_id,
    o.task_type_name,
    o.task_type_name_de,
    tt.purpose,
    o.current_step_key,
    o.current_step_name,
    o.current_step_name_de,
    COALESCE(u.name, u.email) AS with_user_name,
    g.name AS with_team_name,
    r.name AS with_role_name,
    (r.translations ->> 'de'::text) AS with_role_name_de,
    ( SELECT max(h.entered_at) AS max
           FROM public.task_step_history h
          WHERE ((h.task_id = o.id) AND (h.step_key = o.current_step_key) AND (h.left_at IS NULL))) AS in_step_since,
    COALESCE(s.is_decision, false) AS awaiting_decision
   FROM (((((public.tasks_overview o
     JOIN public.task_types tt ON (((tt.id = o.task_type_id) AND tt.track_as_request)))
     LEFT JOIN public.task_type_steps s ON (((s.task_type_id = o.task_type_id) AND (s.step_key = o.current_step_key))))
     LEFT JOIN public.users u ON ((u.id = o.current_assignee_user_id)))
     LEFT JOIN public.teams g ON (((g.id = o.current_assignee_team_id) AND (o.current_assignee_user_id IS NULL))))
     LEFT JOIN public.roles r ON (((r.id = o.current_assignee_role_id) AND (o.current_assignee_user_id IS NULL) AND (o.current_assignee_team_id IS NULL))))
  WHERE (o.created_by_user_id = auth.uid());


ALTER VIEW public.tasks_my_requests OWNER TO postgres;

REVOKE ALL ON TABLE public.tasks_my_requests FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tasks_my_requests TO authenticated;
GRANT ALL ON TABLE public.tasks_my_requests TO service_role;

CREATE VIEW public.tasks_to_decide WITH (security_invoker='true') AS
 SELECT t.id,
    t.task_number,
    t.title,
    t.description,
    t.priority,
    t.due_date,
    t.status,
    t.created_at,
    t.created_by_user_id,
    cu.name AS created_by_name,
    t.asset_id,
    a.name AS asset_name,
    t.task_type_id,
    tt.name AS task_type_name,
    tt.name_de AS task_type_name_de,
    tt.purpose,
    t.current_step_key,
    s.name AS current_step_name,
    s.name_de AS current_step_name_de,
    t.current_assignee_user_id,
    t.current_assignee_team_id,
    s.actions AS step_actions,
    ( SELECT (count(*))::integer AS count
           FROM public.task_checklist_items i
          WHERE ((i.task_id = t.id) AND (i.step_key = t.current_step_key) AND i.required AND (NOT public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text)))) AS step_open_required
   FROM ((((public.tasks t
     JOIN public.task_type_steps s ON (((s.task_type_id = t.task_type_id) AND (s.step_key = t.current_step_key))))
     JOIN public.task_types tt ON ((tt.id = t.task_type_id)))
     LEFT JOIN public.users cu ON ((cu.id = t.created_by_user_id)))
     LEFT JOIN public.assets a ON ((a.id = t.asset_id)))
  WHERE ((t.status <> ALL (ARRAY['done'::text, 'cancelled'::text])) AND s.is_decision AND (t.created_by_user_id IS DISTINCT FROM auth.uid()) AND ((t.current_assignee_user_id = ANY (public.rls_my_assignee_ids())) OR ((t.current_assignee_user_id IS NULL) AND ((t.current_assignee_role_id IS NOT NULL) OR (t.current_assignee_team_id IS NOT NULL)) AND ((t.current_assignee_role_id IS NULL) OR (t.current_assignee_role_id = ANY (public.rls_my_role_ids()))) AND ((t.current_assignee_team_id IS NULL) OR (t.current_assignee_team_id = ANY (public.rls_my_team_ids()))))));


ALTER VIEW public.tasks_to_decide OWNER TO postgres;

REVOKE ALL ON TABLE public.tasks_to_decide FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tasks_to_decide TO authenticated;
GRANT ALL ON TABLE public.tasks_to_decide TO service_role;

CREATE OR REPLACE VIEW public.task_punctuality WITH (security_invoker='on') AS
 SELECT task_id,
    task_number,
    title,
    asset_id,
    task_type_id,
    team_id,
    assigned_user_id,
    parent_task_id,
    recurring_task_rule_id,
    original_due_date,
    due_date,
    completed_at,
    completed_on,
        CASE
            WHEN (completed_on <= original_due_date) THEN 'on_time'::text
            WHEN ((due_date IS NOT NULL) AND (due_date <> original_due_date) AND (completed_on <= due_date)) THEN 'rescheduled'::text
            ELSE 'late'::text
        END AS outcome,
    GREATEST((completed_on - COALESCE(due_date, original_due_date)), 0) AS days_late
   FROM ( SELECT t.id AS task_id,
            t.task_number,
            t.title,
            t.asset_id,
            t.task_type_id,
            t.team_id,
            t.assigned_user_id,
            t.parent_task_id,
            t.recurring_task_rule_id,
            t.original_due_date,
            t.due_date,
            t.completed_at,
            ((t.completed_at AT TIME ZONE 'Europe/Berlin'::text))::date AS completed_on
           FROM public.tasks t
          WHERE ((t.status = 'done'::text) AND (t.completed_at IS NOT NULL) AND (t.original_due_date IS NOT NULL))) x;


ALTER VIEW public.task_punctuality OWNER TO postgres;

REVOKE ALL ON TABLE public.task_punctuality FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_punctuality TO authenticated;
GRANT ALL ON TABLE public.task_punctuality TO service_role;

CREATE VIEW public.recurring_task_rules_overview WITH (security_invoker='on') AS
 SELECT r.id,
    r.name,
    r.description,
    r.task_type_id,
    r.asset_id,
    r.priority,
    r.team_id,
    r.assigned_user_id,
    r.assignment_mode,
    r.last_assigned_user_id,
    r.schedule_kind,
    r.interval_count,
    r.operating_hours_interval,
    r.start_date,
    r.end_date,
    r.next_due_date,
    r.lead_days,
    r.repeat_mode,
    r.skip_if_open,
    r.last_generated_hours,
    r.last_generated_at,
    r.last_error,
    r.active,
    r.created_at,
    r.updated_at,
    r.created_by_user_id,
    r.updated_by_user_id,
    r.checklist_template_id,
    r.checklist_items,
    tt.name AS task_type_name,
    a.name AS asset_name,
    g.name AS team_name,
    u.name AS assigned_user_name,
    ct.name AS checklist_template_name,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.recurring_task_rule_id = r.id) AND (t.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))) AS open_task_count,
    tt.name_de AS task_type_name_de
   FROM (((((public.recurring_task_rules r
     JOIN public.task_types tt ON ((tt.id = r.task_type_id)))
     LEFT JOIN public.assets a ON ((a.id = r.asset_id)))
     LEFT JOIN public.teams g ON ((g.id = r.team_id)))
     LEFT JOIN public.users u ON ((u.id = r.assigned_user_id)))
     LEFT JOIN public.checklist_templates ct ON ((ct.id = r.checklist_template_id)));


ALTER VIEW public.recurring_task_rules_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.recurring_task_rules_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.recurring_task_rules_overview TO authenticated;
GRANT ALL ON TABLE public.recurring_task_rules_overview TO service_role;

CREATE OR REPLACE FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) RETURNS SETOF public.task_punctuality
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with recursive tree as (
    select r.id, 0 as depth from public.tasks r where r.id = p_root_task_id
    union all
    select c.id, p.depth + 1 from public.tasks c join tree p on c.parent_task_id = p.id where p.depth < 20
  )
  select tp.*
  from public.task_punctuality tp
  where (p_from is null or tp.completed_on >= p_from)
    and (p_to is null or tp.completed_on <= p_to)
    and (p_asset_id is null or tp.asset_id in (
          select a.id from public.assets a
          where a.path operator(public.<@) (select r.path from public.assets r where r.id = p_asset_id)))
    and (p_rule_id is null or tp.recurring_task_rule_id = p_rule_id)
    and (p_root_task_id is null or tp.task_id in (select id from tree))
    and (p_team_id is null or tp.team_id = p_team_id)
    and (p_task_type_id is null or tp.task_type_id = p_task_type_id);
$$;


ALTER FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) TO service_role;

CREATE POLICY "Create tasks per grant" ON public.tasks FOR INSERT WITH CHECK (((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND ((true AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'created'::text) AS rls_task_modules)::text[])) AND true) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'team'::text) AS rls_task_modules)::text[])) AND ((true AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'assigned_assets'::text) AS rls_task_modules)::text[])) AND ((permission_module, asset_id) IN ( SELECT s.module,
    s.asset_id
   FROM public.rls_task_asset_scope('create'::text) s(module, asset_id))))));

CREATE POLICY "Delete tasks per grant" ON public.tasks FOR DELETE USING (((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'team'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'assigned_assets'::text) AS rls_task_modules)::text[])) AND ((permission_module, asset_id) IN ( SELECT s.module,
    s.asset_id
   FROM public.rls_task_asset_scope('delete'::text) s(module, asset_id)))))));

CREATE POLICY "Edit tasks per grant" ON public.tasks FOR UPDATE USING (((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'team'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'assigned_assets'::text) AS rls_task_modules)::text[])) AND ((permission_module, asset_id) IN ( SELECT s.module,
    s.asset_id
   FROM public.rls_task_asset_scope('edit'::text) s(module, asset_id))))))) WITH CHECK (((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'team'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'assigned_assets'::text) AS rls_task_modules)::text[])) AND ((permission_module, asset_id) IN ( SELECT s.module,
    s.asset_id
   FROM public.rls_task_asset_scope('edit'::text) s(module, asset_id)))))));

CREATE POLICY "View tasks per grant" ON public.tasks FOR SELECT USING ((((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND ((true AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'team'::text) AS rls_task_modules)::text[])) AND ((true AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'assigned_assets'::text) AS rls_task_modules)::text[])) AND ((permission_module, asset_id) IN ( SELECT s.module,
    s.asset_id
   FROM public.rls_task_asset_scope('view'::text) s(module, asset_id)))))) OR (assigned_user_id = ( SELECT auth.uid() AS uid)) OR (current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) OR (((current_assignee_role_id IS NOT NULL) OR (current_assignee_team_id IS NOT NULL)) AND ((current_assignee_role_id IS NULL) OR (current_assignee_role_id = ANY (( SELECT public.rls_my_role_ids() AS rls_my_role_ids)::uuid[]))) AND ((current_assignee_team_id IS NULL) OR (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))));

CREATE INDEX tasks_asset_id_idx ON public.tasks USING btree (asset_id);

CREATE INDEX tasks_asset_id_completed_at_idx ON public.tasks USING btree (asset_id, completed_at) WHERE (status = 'done'::text);

CREATE INDEX tasks_asset_id_completed_at_idx1 ON public.tasks USING btree (asset_id, completed_at) WHERE (status = 'done'::text);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

-- Hand-written part of the assets module (after the objects copied from COMPASS).

-- Teams responsible for assets (COMPASS groups.usable_for_assets; platform team use registry, D2).
select public.team_use_register('assets', 'assets', 'Responsible for assets (who may work on them through the assigned_assets scope)');

-- Permissions: COMPASS's registry rows (assets.*; the assigned_assets scope of tasks, initiatives and series). The tickets'
-- assigned_assets rows come with the ticket module. COMPASS's module `initiative` is `initiatives` (decision T8).
insert into public.permissions (key, module, action, scope, sort_order) values
  ('assets.view.assigned_assets', 'assets', 'view', 'assigned_assets', 200),
  ('assets.view.all', 'assets', 'view', 'all', 201),
  ('assets.edit.assigned_assets', 'assets', 'edit', 'assigned_assets', 202),
  ('assets.edit.all', 'assets', 'edit', 'all', 203),
  ('assets.create.assigned_assets', 'assets', 'create', 'assigned_assets', 204),
  ('assets.create.all', 'assets', 'create', 'all', 205),
  ('assets.delete.assigned_assets', 'assets', 'delete', 'assigned_assets', 206),
  ('assets.delete.all', 'assets', 'delete', 'all', 207),
  ('recurring_tasks.view.assigned_assets', 'recurring_tasks', 'view', 'assigned_assets', 456),
  ('recurring_tasks.edit.assigned_assets', 'recurring_tasks', 'edit', 'assigned_assets', 457),
  ('recurring_tasks.create.assigned_assets', 'recurring_tasks', 'create', 'assigned_assets', 458),
  ('recurring_tasks.delete.assigned_assets', 'recurring_tasks', 'delete', 'assigned_assets', 459);
insert into public.permissions (key, module, action, scope, sort_order, task_family)
select m.m || '.' || a.a || '.assigned_assets', m.m, a.a, 'assigned_assets', m.base + a.o * 10 + 5, true
from (values ('tasks', 300), ('initiatives', 400)) m (m, base),
     (values ('view', 1), ('check', 2), ('edit', 3), ('create', 4), ('delete', 5)) a (a, o);
insert into public.permission_implies (permission, implies) values
  ('assets.edit.assigned_assets', 'assets.view.assigned_assets'), ('assets.edit.all', 'assets.view.all'),
  ('assets.create.assigned_assets', 'assets.view.assigned_assets'), ('assets.create.all', 'assets.view.all'),
  ('assets.delete.assigned_assets', 'assets.view.assigned_assets'), ('assets.delete.all', 'assets.view.all'),
  ('recurring_tasks.edit.assigned_assets', 'recurring_tasks.view.assigned_assets'),
  ('recurring_tasks.create.assigned_assets', 'recurring_tasks.view.assigned_assets'),
  ('recurring_tasks.delete.assigned_assets', 'recurring_tasks.view.assigned_assets');
insert into public.permission_implies (permission, implies)
select m || '.' || a || '.assigned_assets', m || '.' || i || '.assigned_assets'
from (values ('tasks'), ('initiatives')) mm (m),
     (values ('check', 'view'), ('edit', 'check'), ('edit', 'view'), ('create', 'view'), ('delete', 'view')) x (a, i);

-- Record access of a task (tasks module) with the task's asset, so the assigned_assets scope counts
-- as in COMPASS's user_has_access (branch 'tasks'). Same function otherwise.
create or replace function public.tasks_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
declare
  v_task public.tasks;
begin
  if p_user_id is null then
    return false;
  end if;
  select * into v_task from public.tasks where id = p_entity_id;
  if v_task.id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return (v_task.permission_module || '.edit.all') = any (public.user_permissions(p_user_id));
  end if;
  if public.user_task_type_allowed(p_user_id, v_task.task_type_id)
     and public.user_has_grant(p_user_id, v_task.permission_module, p_action, v_task.asset_id, v_task.assigned_user_id, v_task.team_id,
                               v_task.created_by_user_id, v_task.current_assignee_user_id, v_task.current_assignee_team_id,
                               v_task.current_assignee_role_id) then
    return true;
  end if;
  return p_action in ('view', 'check') and public.task_is_worked_by(p_user_id, p_entity_id);
end $$;

-- Assets as a record type (COMPASS user_has_access / record_moderator / conversation_label, branch 'assets'): access through
-- the assets.* grants (an asset has no 'check': COMPASS maps it to 'edit'), notes moderated by assets.edit.all, labelled by
-- name, the responsible team as the record's team.
create function public.assets_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
declare
  v_asset public.assets;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'assets.edit.all' = any (public.user_permissions(p_user_id));
  end if;
  if p_action = 'check' then
    p_action := 'edit';
  end if;
  select * into v_asset from public.assets where id = p_entity_id;
  return v_asset.id is not null
    and public.user_has_grant(p_user_id, 'assets', p_action, v_asset.id, null, null, null);
end $$;
create function public.assets_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select a.name from public.assets a where a.id = p_entity_id; $$;
create function public.assets_team(p_entity_id uuid) returns uuid
  language sql stable security definer set search_path to '' as $$ select a.team_id from public.assets a where a.id = p_entity_id; $$;
revoke all on function public.assets_access(uuid, uuid, text), public.assets_label(uuid), public.assets_team(uuid) from public, anon;
grant execute on function public.assets_access(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.assets_label(uuid), public.assets_team(uuid) to service_role;
select public.entity_type_register('assets', 'assets', 'assets_access', null, 'An asset', 'assets_label', 'assets_team', null);

-- Search: assets (COMPASS global_search, block 'assets'; runs as the caller, so the assets' policies decide what is found).
create function public.assets_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
  select 'assets'::text, s.id,
    greatest(public.search_field_score(s.name, p_term), public.search_field_score(s.serial_number, p_term),
             public.search_field_score(s.manufacturer, p_term) * 0.8, public.search_field_score(s.location, p_term) * 0.8)::real,
    null::bigint, s.name,
    nullif(concat_ws(' · ', s.location, case when s.serial_number is not null then 'SN ' || s.serial_number end), ''),
    s.status, null::text, null::uuid, null::text, null::text, s.created_at, null::uuid
  from public.assets s
  where s.name ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) s.name)
     or s.serial_number ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) s.serial_number)
     or s.manufacturer ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) s.manufacturer)
     or s.location ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) s.location)
  order by 3 desc limit 8;
$$;
revoke all on function public.assets_search(text, boolean, bigint) from public, anon;
grant execute on function public.assets_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('assets', 'assets', 'assets_search', 'Assets by name, serial number, manufacturer and location');

-- The task type preselected for a new task on an asset (COMPASS app_settings.default_asset_task_type_id; key/value setting,
-- edited under Admin > Configuration > Settings).
select public.app_setting_register('default_asset_task_type_id', 'assets', 'text', null, true, 'Task type preselected for a new task on an asset (id)');

