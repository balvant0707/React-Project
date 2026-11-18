-- Tasks module (NPM WP 13): the task engine of COMPASS (task types, routes, step history, create / plan / forward /
-- perform action / reopen / cancel, access per tasks.* literals). Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the tasks module, before the copied objects.

-- The task family flag on the permission registry (COMPASS: permissions.task_family). The core dropped it
-- (20261109100300_platform_core_registry.sql) because it is a tasks concern; rls_task_modules() reads it. A module with its
-- own task family (initiatives, leave, ...) registers its literals with task_family = true.
alter table public.permissions add column task_family boolean not null default false;

create sequence public.task_number_seq;
grant usage, select on sequence public.task_number_seq to authenticated, service_role;


CREATE TABLE public.task_types (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    default_due_days integer,
    short_description text,
    keywords text,
    show_on_start_page boolean DEFAULT false NOT NULL,
    default_team_id uuid,
    owner_user_id uuid DEFAULT auth.uid(),
    hidden_fields text[] DEFAULT '{}'::text[] NOT NULL,
    blocks_parent boolean DEFAULT false NOT NULL,
    system_created boolean DEFAULT false NOT NULL,
    name_de text NOT NULL,
    track_as_request boolean DEFAULT false NOT NULL,
    icon text,
    color text,
    CONSTRAINT task_types_color_check CHECK ((color = ANY (ARRAY['gray'::text, 'navy'::text, 'blue'::text, 'sky'::text, 'teal'::text, 'green'::text, 'amber'::text, 'orange'::text, 'red'::text, 'pink'::text, 'violet'::text]))),
    CONSTRAINT task_types_default_due_days_check CHECK (((default_due_days IS NULL) OR ((default_due_days >= 0) AND (default_due_days <= 365)))),
    CONSTRAINT task_types_hidden_fields_check CHECK ((hidden_fields <@ ARRAY['team'::text])),
    CONSTRAINT task_types_icon_check CHECK ((icon ~ '^[a-z0-9-]{1,40}$'::text)),
    CONSTRAINT task_types_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text)),
    CONSTRAINT task_types_keywords_check CHECK ((length(keywords) <= 500)),
    CONSTRAINT task_types_short_description_check CHECK ((length(short_description) <= 300))
);


ALTER TABLE public.task_types OWNER TO postgres;

REVOKE ALL ON TABLE public.task_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_types TO authenticated;
GRANT ALL ON TABLE public.task_types TO service_role;

CREATE TABLE public.task_type_steps (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_type_id uuid NOT NULL,
    step_key text NOT NULL,
    step_order integer NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assignee_role_id uuid,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    assignee_kind text DEFAULT 'role'::text NOT NULL,
    assignee_level integer DEFAULT 1 NOT NULL,
    fallback_role_id uuid,
    assignee_team_id uuid,
    name_de text NOT NULL,
    is_decision boolean DEFAULT false NOT NULL,
    assignee_team_scope text,
    CONSTRAINT task_type_steps_actions_check CHECK ((jsonb_typeof(actions) = 'array'::text)),
    CONSTRAINT task_type_steps_assignee_kind_check CHECK ((assignee_kind = ANY (ARRAY['role'::text, 'requester_supervisor'::text, 'team'::text, 'task_owner'::text, 'requester'::text, 'task_team'::text]))),
    CONSTRAINT task_type_steps_assignee_level_check CHECK (((assignee_level >= 1) AND (assignee_level <= 5))),
    CONSTRAINT task_type_steps_assignee_team_scope_check CHECK ((assignee_team_scope = ANY (ARRAY['task_team'::text, 'requester_team'::text, 'fixed'::text]))),
    CONSTRAINT task_type_steps_decision_team CHECK ((NOT (is_decision AND ((assignee_team_scope = 'task_team'::text) OR (assignee_kind = 'task_team'::text))))),
    CONSTRAINT task_type_steps_kind_roles CHECK (((assignee_kind = 'role'::text) OR (assignee_role_id IS NULL))),
    CONSTRAINT task_type_steps_kind_team CHECK (
CASE
    WHEN (assignee_kind = 'team'::text) THEN ((assignee_team_id IS NOT NULL) AND (assignee_team_scope IS NULL))
    WHEN ((assignee_kind = 'role'::text) AND (assignee_team_scope IS NOT NULL)) THEN ((assignee_role_id IS NOT NULL) AND ((assignee_team_scope = 'fixed'::text) = (assignee_team_id IS NOT NULL)))
    ELSE ((assignee_team_id IS NULL) AND (assignee_team_scope IS NULL))
END),
    CONSTRAINT task_type_steps_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'waiting_for_approval'::text, 'waiting_for_procurement'::text, 'waiting_for_delivery'::text]))),
    CONSTRAINT task_type_steps_step_key_check CHECK ((step_key ~ '^[a-z][a-z0-9_]*$'::text))
);


ALTER TABLE public.task_type_steps OWNER TO postgres;

REVOKE ALL ON TABLE public.task_type_steps FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_type_steps TO authenticated;
GRANT ALL ON TABLE public.task_type_steps TO service_role;

CREATE TABLE public.tasks (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_number bigint DEFAULT nextval('public.task_number_seq'::regclass) NOT NULL,
    task_type_id uuid NOT NULL,
    current_step_key text,
    status text DEFAULT 'open'::text NOT NULL,
    current_assignee_role_id uuid,
    completed_at timestamp with time zone,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'normal'::text NOT NULL,
    due_date date,
    team_id uuid,
    assigned_user_id uuid,
    planned_date date,
    sort_order text DEFAULT 'a0'::text NOT NULL COLLATE pg_catalog."C",
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    parent_task_id uuid,
    permission_module text DEFAULT 'tasks'::text NOT NULL,
    original_due_date date,
    current_assignee_user_id uuid,
    root_task_id uuid NOT NULL,
    current_assignee_team_id uuid,
    blocks_parent boolean DEFAULT false NOT NULL,
    anchor_type text,
    anchor_id uuid,
    CONSTRAINT tasks_anchor_pair CHECK (((anchor_type IS NULL) = (anchor_id IS NULL))),
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'waiting_for_approval'::text, 'waiting_for_procurement'::text, 'waiting_for_delivery'::text, 'done'::text, 'cancelled'::text]))),
    CONSTRAINT tasks_title_check CHECK (((length(title) >= 1) AND (length(title) <= 200)))
);


ALTER TABLE public.tasks OWNER TO postgres;

REVOKE ALL ON TABLE public.tasks FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;

CREATE TABLE public.task_step_history (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_id uuid NOT NULL,
    step_key text NOT NULL,
    actor_user_id uuid,
    action_key text,
    comment text,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone
);


ALTER TABLE public.task_step_history OWNER TO postgres;

REVOKE ALL ON TABLE public.task_step_history FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_step_history TO authenticated;
GRANT ALL ON TABLE public.task_step_history TO service_role;

CREATE TABLE public.role_task_types (
    role_id uuid NOT NULL,
    task_type_id uuid NOT NULL
);


ALTER TABLE public.role_task_types OWNER TO postgres;

REVOKE ALL ON TABLE public.role_task_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.role_task_types TO authenticated;
GRANT ALL ON TABLE public.role_task_types TO service_role;

CREATE TABLE public.task_type_subtask_types (
    task_type_id uuid NOT NULL,
    subtask_type_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.task_type_subtask_types OWNER TO postgres;

REVOKE ALL ON TABLE public.task_type_subtask_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_type_subtask_types TO authenticated;
GRANT ALL ON TABLE public.task_type_subtask_types TO service_role;

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_key_key UNIQUE (key);

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_pkey PRIMARY KEY (id);

CREATE INDEX task_types_default_team_id_idx ON public.task_types USING btree (default_team_id);

CREATE INDEX task_types_owner_user_id_idx ON public.task_types USING btree (owner_user_id);

ALTER TABLE ONLY public.task_type_steps
    ADD CONSTRAINT task_type_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_type_steps
    ADD CONSTRAINT task_type_steps_task_type_id_step_key_key UNIQUE (task_type_id, step_key);

CREATE INDEX task_type_steps_assignee_role_id_idx ON public.task_type_steps USING btree (assignee_role_id);

CREATE INDEX task_type_steps_assignee_team_id_idx ON public.task_type_steps USING btree (assignee_team_id) WHERE (assignee_team_id IS NOT NULL);

CREATE INDEX task_type_steps_fallback_role_id_idx ON public.task_type_steps USING btree (fallback_role_id) WHERE (fallback_role_id IS NOT NULL);

CREATE INDEX task_type_steps_task_type_id_step_order_idx ON public.task_type_steps USING btree (task_type_id, step_order);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_task_number_key UNIQUE (task_number);

CREATE INDEX tasks_assigned_user_id_planned_date_idx ON public.tasks USING btree (assigned_user_id, planned_date);

CREATE INDEX tasks_created_by_user_id_idx ON public.tasks USING btree (created_by_user_id);

CREATE INDEX tasks_current_assignee_role_id_idx ON public.tasks USING btree (current_assignee_role_id) WHERE (status <> 'done'::text);

CREATE INDEX tasks_current_assignee_team_id_idx ON public.tasks USING btree (current_assignee_team_id) WHERE ((current_assignee_team_id IS NOT NULL) AND (status <> ALL (ARRAY['done'::text, 'cancelled'::text])));

CREATE INDEX tasks_current_assignee_user_id_idx ON public.tasks USING btree (current_assignee_user_id) WHERE ((current_assignee_user_id IS NOT NULL) AND (status <> ALL (ARRAY['done'::text, 'cancelled'::text])));

CREATE INDEX tasks_description_trgm_idx ON public.tasks USING gin (description extensions.gin_trgm_ops);

CREATE INDEX tasks_open_prerequisites_idx ON public.tasks USING btree (parent_task_id) WHERE (blocks_parent AND (status <> ALL (ARRAY['done'::text, 'cancelled'::text])));

CREATE INDEX tasks_parent_task_id_idx ON public.tasks USING btree (parent_task_id) WHERE (parent_task_id IS NOT NULL);

CREATE INDEX tasks_permission_module_idx ON public.tasks USING btree (permission_module);

CREATE INDEX tasks_planned_date_idx ON public.tasks USING btree (planned_date);

CREATE INDEX tasks_root_task_id_idx ON public.tasks USING btree (root_task_id);

CREATE INDEX tasks_status_idx ON public.tasks USING btree (status);

CREATE INDEX tasks_task_type_id_idx ON public.tasks USING btree (task_type_id);

CREATE INDEX tasks_team_id_planned_date_idx ON public.tasks USING btree (team_id, planned_date);

CREATE INDEX tasks_title_trgm_idx ON public.tasks USING gin (title extensions.gin_trgm_ops);

ALTER TABLE ONLY public.task_step_history
    ADD CONSTRAINT task_step_history_pkey PRIMARY KEY (id);

CREATE INDEX task_step_history_actor_user_id_idx ON public.task_step_history USING btree (actor_user_id);

CREATE INDEX task_step_history_task_id_entered_at_idx ON public.task_step_history USING btree (task_id, entered_at);

ALTER TABLE ONLY public.role_task_types
    ADD CONSTRAINT role_task_types_pkey PRIMARY KEY (role_id, task_type_id);

CREATE INDEX role_task_types_task_type_id_idx ON public.role_task_types USING btree (task_type_id);

ALTER TABLE ONLY public.task_type_subtask_types
    ADD CONSTRAINT task_type_subtask_types_pkey PRIMARY KEY (task_type_id, subtask_type_id);

CREATE INDEX task_type_subtask_types_subtask_type_id_idx ON public.task_type_subtask_types USING btree (subtask_type_id);

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_default_team_id_fkey FOREIGN KEY (default_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_type_steps
    ADD CONSTRAINT task_type_steps_assignee_role_id_fkey FOREIGN KEY (assignee_role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.task_type_steps
    ADD CONSTRAINT task_type_steps_assignee_team_id_fkey FOREIGN KEY (assignee_team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.task_type_steps
    ADD CONSTRAINT task_type_steps_fallback_role_id_fkey FOREIGN KEY (fallback_role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.task_type_steps
    ADD CONSTRAINT task_type_steps_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_current_assignee_role_id_fkey FOREIGN KEY (current_assignee_role_id) REFERENCES public.roles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_current_assignee_team_id_fkey FOREIGN KEY (current_assignee_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_current_assignee_user_id_fkey FOREIGN KEY (current_assignee_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_step_history
    ADD CONSTRAINT task_step_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_step_history
    ADD CONSTRAINT task_step_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_task_types
    ADD CONSTRAINT role_task_types_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.role_task_types
    ADD CONSTRAINT role_task_types_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_type_subtask_types
    ADD CONSTRAINT task_type_subtask_types_subtask_type_id_fkey FOREIGN KEY (subtask_type_id) REFERENCES public.task_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_type_subtask_types
    ADD CONSTRAINT task_type_subtask_types_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE CASCADE;

CREATE FUNCTION public.master_data_default_name_de() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.name_de is null or btrim(new.name_de) = '' then
    new.name_de := new.name;
  end if;
  return new;
end $$;


ALTER FUNCTION public.master_data_default_name_de() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.master_data_default_name_de() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.master_data_default_name_de() FROM PUBLIC;
GRANT ALL ON FUNCTION public.master_data_default_name_de() TO service_role;

CREATE FUNCTION public.records_creator_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by_user_id := auth.uid();
  elsif new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'The creator of a record cannot be changed';
  end if;
  if tg_table_name = 'tickets' and tg_op = 'UPDATE' then
    -- nested: PL/pgSQL resolves every field of a condition, and tasks has no reporter
    if new.reporter_user_id is distinct from old.reporter_user_id then
      raise exception 'The reporter of a ticket cannot be changed';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.records_creator_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.records_creator_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.records_creator_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.records_creator_guard() TO service_role;

CREATE FUNCTION public.log_system_event(p_entity_type text, p_entity_id uuid, p_event_type text, p_metadata jsonb DEFAULT '{}'::jsonb, p_author_user_id uuid DEFAULT auth.uid()) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  insert into public.activity_events (entity_type, entity_id, event_type, metadata, author_user_id)
  values (p_entity_type, p_entity_id, p_event_type, coalesce(p_metadata, '{}'::jsonb), p_author_user_id)
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION public.log_system_event(p_entity_type text, p_entity_id uuid, p_event_type text, p_metadata jsonb, p_author_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.log_system_event(p_entity_type text, p_entity_id uuid, p_event_type text, p_metadata jsonb, p_author_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_system_event(p_entity_type text, p_entity_id uuid, p_event_type text, p_metadata jsonb, p_author_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.log_system_event(p_entity_type text, p_entity_id uuid, p_event_type text, p_metadata jsonb, p_author_user_id uuid) TO service_role;

CREATE FUNCTION public.route_action_kind(p_action jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select coalesce(p_action ->> 'kind', case when p_action ->> 'key' = 'reject' then 'negative' else 'positive' end)
$$;


ALTER FUNCTION public.route_action_kind(p_action jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.route_action_kind(p_action jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.route_action_kind(p_action jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.route_action_kind(p_action jsonb) TO service_role;

CREATE FUNCTION public.step_holder(p_user_id uuid, p_role_id uuid, p_team_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (p_role_id is not null or p_team_id is not null)
    and (p_role_id is null or exists (select 1 from public.user_roles where user_id = p_user_id and role_id = p_role_id))
    and (p_team_id is null or exists (select 1 from public.user_teams where user_id = p_user_id and team_id = p_team_id))
$$;


ALTER FUNCTION public.step_holder(p_user_id uuid, p_role_id uuid, p_team_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.step_holder(p_user_id uuid, p_role_id uuid, p_team_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.step_holder(p_user_id uuid, p_role_id uuid, p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.step_holder(p_user_id uuid, p_role_id uuid, p_team_id uuid) TO service_role;

CREATE FUNCTION public.user_reports_to(p_manager uuid, p_person uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive up (id, depth) as (
    select u.supervisor_user_id, 1 from public.users u where u.id = p_person and u.supervisor_user_id is not null
    union
    select u.supervisor_user_id, up.depth + 1
    from public.users u join up on u.id = up.id
    where u.supervisor_user_id is not null and up.depth < 20
  )
  select p_manager is not null and p_manager is distinct from p_person and exists (
    select 1 from up join public.users s on s.id = up.id where s.id = p_manager or s.deputy_user_id = p_manager
  );
$$;


ALTER FUNCTION public.user_reports_to(p_manager uuid, p_person uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_reports_to(p_manager uuid, p_person uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_reports_to(p_manager uuid, p_person uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_reports_to(p_manager uuid, p_person uuid) TO service_role;

CREATE FUNCTION public.rls_my_assignee_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select array[auth.uid()] || coalesce(array(select id from public.users where deputy_user_id = auth.uid()), '{}')
$$;


ALTER FUNCTION public.rls_my_assignee_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_my_assignee_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_assignee_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_assignee_ids() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_assignee_ids() TO service_role;

CREATE FUNCTION public.rls_my_role_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(role_id), '{}') from public.user_roles where user_id = auth.uid();
$$;


ALTER FUNCTION public.rls_my_role_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_my_role_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_role_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_role_ids() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_role_ids() TO service_role;

CREATE FUNCTION public.rls_task_modules(p_action text, p_scope text) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(p.module), '{}')
  from public.permissions p
  where p.task_family and p.action = p_action and p.scope = p_scope and p.key = any(public.rls_my_permissions());
$$;


ALTER FUNCTION public.rls_task_modules(p_action text, p_scope text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_task_modules(p_action text, p_scope text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_task_modules(p_action text, p_scope text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_task_modules(p_action text, p_scope text) TO service_role;
GRANT ALL ON FUNCTION public.rls_task_modules(p_action text, p_scope text) TO authenticated;

CREATE FUNCTION public.user_task_type_allowed(p_user_id uuid, p_task_type_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not exists (select 1 from public.role_task_types)
    or not exists (select 1 from public.user_roles where user_id = p_user_id)
    or exists (select 1 from public.task_types where id = p_task_type_id and system_created)
    or exists (select 1 from public.user_roles ur
               where ur.user_id = p_user_id
                 and not exists (select 1 from public.role_task_types rt where rt.role_id = ur.role_id))
    or exists (select 1 from public.user_roles ur
               join public.role_task_types rt on rt.role_id = ur.role_id
               where ur.user_id = p_user_id and rt.task_type_id = p_task_type_id)
$$;


ALTER FUNCTION public.user_task_type_allowed(p_user_id uuid, p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_task_type_allowed(p_user_id uuid, p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_task_type_allowed(p_user_id uuid, p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_task_type_allowed(p_user_id uuid, p_task_type_id uuid) TO service_role;

CREATE FUNCTION public.rls_my_task_type_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(tt.id), '{}')
  from public.task_types tt
  where public.user_task_type_allowed(auth.uid(), tt.id)
$$;


ALTER FUNCTION public.rls_my_task_type_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_my_task_type_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_task_type_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_task_type_ids() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_task_type_ids() TO service_role;

CREATE FUNCTION public.permission_module_for(p_task_type_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select p.module from public.task_types tt join public.permissions p on p.module = tt.key and p.task_family and p.module <> 'initiative'
      where tt.id = p_task_type_id limit 1),
    'tasks');
$$;


ALTER FUNCTION public.permission_module_for(p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) TO service_role;

CREATE FUNCTION public.task_type_editable(p_task_type_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin()
    or public.rls_has('task_types.edit.all')
    or (public.rls_has('task_types.edit.own')
        and exists (select 1 from public.task_types t where t.id = p_task_type_id and t.owner_user_id = auth.uid()))
$$;


ALTER FUNCTION public.task_type_editable(p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_editable(p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_editable(p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_editable(p_task_type_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.task_type_editable(p_task_type_id uuid) TO authenticated;

CREATE FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_step_user_id uuid DEFAULT NULL::uuid, p_step_team_id uuid DEFAULT NULL::uuid, p_step_role_id uuid DEFAULT NULL::uuid) RETURNS boolean
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
  return false;
end;
$$;


ALTER FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_has_grant(p_user_id uuid, p_entity_type text, p_grant_type text, p_asset_id uuid, p_assigned_user_id uuid, p_assigned_team_id uuid, p_owner_user_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid) TO service_role;

CREATE FUNCTION public.task_is_worked_by(p_user_id uuid, p_task_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task_id
      and (t.assigned_user_id = p_user_id
           or t.current_assignee_user_id = p_user_id
           or exists (select 1 from public.users u where u.id = t.current_assignee_user_id and u.deputy_user_id = p_user_id)
           or public.step_holder(p_user_id, t.current_assignee_role_id, t.current_assignee_team_id))
  )
$$;


ALTER FUNCTION public.task_is_worked_by(p_user_id uuid, p_task_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_is_worked_by(p_user_id uuid, p_task_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_is_worked_by(p_user_id uuid, p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_is_worked_by(p_user_id uuid, p_task_id uuid) TO service_role;

CREATE FUNCTION public.task_step_recipients(p_user_id uuid, p_team_id uuid, p_role_id uuid) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when p_user_id is not null then
      array[p_user_id] || coalesce((select array[deputy_user_id] from public.users where id = p_user_id and deputy_user_id is not null), '{}')
    when p_team_id is not null and p_role_id is not null then
      coalesce((select array_agg(ug.user_id) from public.user_teams ug
                join public.user_roles ur on ur.user_id = ug.user_id and ur.role_id = p_role_id
                where ug.team_id = p_team_id), '{}')
    when p_team_id is not null then
      coalesce((select array_agg(user_id) from public.user_teams where team_id = p_team_id), '{}')
    when p_role_id is not null then
      coalesce((select array_agg(user_id) from public.user_roles where role_id = p_role_id), '{}')
    else '{}'::uuid[]
  end
$$;


ALTER FUNCTION public.task_step_recipients(p_user_id uuid, p_team_id uuid, p_role_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_step_recipients(p_user_id uuid, p_team_id uuid, p_role_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_step_recipients(p_user_id uuid, p_team_id uuid, p_role_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_step_recipients(p_user_id uuid, p_team_id uuid, p_role_id uuid) TO service_role;

CREATE FUNCTION public.resolve_step_assignee(p_step_id uuid, p_requester_user_id uuid, p_owner_user_id uuid DEFAULT NULL::uuid, p_owner_team_id uuid DEFAULT NULL::uuid, OUT assignee_user_id uuid, OUT assignee_role_id uuid, OUT assignee_team_id uuid) RETURNS record
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_step public.task_type_steps;
  v_current uuid := p_requester_user_id;
  v_up uuid;
  v_found uuid;
  v_levels integer := 0;
  v_team uuid;
begin
  select * into v_step from public.task_type_steps where id = p_step_id;
  if v_step.assignee_kind = 'role' and v_step.assignee_team_scope is null then
    assignee_role_id := v_step.assignee_role_id;
    return;
  elsif v_step.assignee_kind = 'role' then
    -- Candidate teams with at least one holder of the role who can sign in (on a decision step not the requester).
    select g.id into v_team
    from public.teams g
    where case v_step.assignee_team_scope
            when 'task_team' then g.id = p_owner_team_id
            when 'fixed' then g.id = v_step.assignee_team_id
            else exists (select 1 from public.user_teams rg where rg.team_id = g.id and rg.user_id = p_requester_user_id)
          end
      -- a team made by users is no source of deciders (its owners choose the members)
      and not (v_step.is_decision and v_step.assignee_team_scope = 'requester_team' and g.user_created)
      and exists (
        select 1 from public.user_teams ug
        join public.user_roles ur on ur.user_id = ug.user_id and ur.role_id = v_step.assignee_role_id
        join public.users u on u.id = ug.user_id and u.has_login and u.locked_at is null and not u.has_left
        where ug.team_id = g.id
          and not (v_step.is_decision and ug.user_id is not distinct from p_requester_user_id))
    order by (g.id = p_owner_team_id) desc nulls last, g.name
    limit 1;
    if v_team is not null then
      assignee_role_id := v_step.assignee_role_id;
      assignee_team_id := v_team;
      return;
    end if;
  elsif v_step.assignee_kind = 'team' then
    assignee_team_id := v_step.assignee_team_id;
    return;
  elsif v_step.assignee_kind = 'task_team' then
    -- The team on the task, whoever is assigned; without a team the fallback below.
    if p_owner_team_id is not null then
      assignee_team_id := p_owner_team_id;
      return;
    end if;
  elsif v_step.assignee_kind = 'requester_supervisor' then
    while v_levels < v_step.assignee_level and v_current is not null loop
      select supervisor_user_id into v_up from public.users where id = v_current;
      exit when v_up is null;
      v_current := v_up;
      if (select has_login and locked_at is null from public.users where id = v_up) then
        v_levels := v_levels + 1;
        v_found := v_up;
      end if;
    end loop;
  elsif v_step.assignee_kind = 'requester' then
    select id into v_found from public.users where id = p_requester_user_id and has_login and locked_at is null;
  elsif v_step.assignee_kind = 'task_owner' then
    select id into v_found from public.users where id = p_owner_user_id and has_login and locked_at is null;
    if v_found is null and p_owner_team_id is not null then
      assignee_team_id := p_owner_team_id;
      return;
    end if;
  end if;
  if v_step.is_decision and v_found is not distinct from p_requester_user_id then
    v_found := null;
  end if;
  if v_found is not null then
    assignee_user_id := v_found;
    return;
  end if;
  -- Nobody found: the step's fallback role, else the default one (Admin > Settings). With neither the step has no
  -- role and whoever may edit the task acts, like a step without a rule. Never silently the admin (admin limits).
  assignee_role_id := coalesce(v_step.fallback_role_id, (select nullif(s.value, '')::uuid from public.app_settings s where s.key = 'default_fallback_role_id'));
end;
$$;


ALTER FUNCTION public.resolve_step_assignee(p_step_id uuid, p_requester_user_id uuid, p_owner_user_id uuid, p_owner_team_id uuid, OUT assignee_user_id uuid, OUT assignee_role_id uuid, OUT assignee_team_id uuid) OWNER TO postgres;

CREATE FUNCTION public.task_step_actor(p_user_id uuid, p_task public.tasks) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with s (own_decision) as (
    select coalesce(p_user_id = p_task.created_by_user_id
                    and (st.is_decision or st.assignee_kind = 'requester_supervisor'), false)
    from (select 1) one
    left join public.task_type_steps st on st.task_type_id = p_task.task_type_id and st.step_key = p_task.current_step_key
  )
  select not s.own_decision and (
      (p_task.current_assignee_user_id is not null
        and (p_task.current_assignee_user_id = p_user_id
             or (p_user_id is distinct from p_task.created_by_user_id
                 and exists (select 1 from public.users u where u.id = p_task.current_assignee_user_id and u.deputy_user_id = p_user_id)))
        and public.user_has_access(p_user_id, 'tasks', p_task.id, 'view'))
      -- a team, a role, or the holders of a role within a team
      or (p_task.current_assignee_user_id is null
          and public.step_holder(p_user_id, p_task.current_assignee_role_id, p_task.current_assignee_team_id)
          and public.user_has_access(p_user_id, 'tasks', p_task.id, 'view'))
      or (p_task.current_assignee_user_id is null and p_task.current_assignee_team_id is null and p_task.current_assignee_role_id is null
          and public.user_has_access(p_user_id, 'tasks', p_task.id, 'edit')))
  from s;
$$;


ALTER FUNCTION public.task_step_actor(p_user_id uuid, p_task public.tasks) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_step_actor(p_user_id uuid, p_task public.tasks) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_step_actor(p_user_id uuid, p_task public.tasks) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_step_actor(p_user_id uuid, p_task public.tasks) TO service_role;

CREATE FUNCTION public.rls_task_allows(p_action text, p_module text, p_asset_id uuid, p_assigned_user_id uuid, p_created_by_user_id uuid, p_team_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_keys text[], p_assignee_ids uuid[]) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- routed: for editing and deleting, a step that names somebody replaces the task's own person and team
  with s (routed) as (
    select p_action in ('edit', 'delete')
       and (p_step_user_id is not null or p_step_team_id is not null or p_step_role_id is not null)
  )
  select (p_module || '.' || p_action || '.all') = any(p_permissions)
    -- assigned: the person of the current step, or somebody I stand in for there (a deputy never through a task they
    -- created themselves, as in task_step_actor); the task's own person unless routed
    or ((p_module || '.' || p_action || '.assigned') = any(p_permissions)
        and ((not s.routed and auth.uid() = p_assigned_user_id)
             or auth.uid() = p_step_user_id
             or (p_step_user_id = any(p_assignee_ids) and auth.uid() is distinct from p_created_by_user_id)))
    or ((p_module || '.' || p_action || '.created') = any(p_permissions)
        and (p_action = 'create' or auth.uid() = p_created_by_user_id))
    -- team: the team of a plain team step (no person, no role); the task's own team unless routed
    or ((p_module || '.' || p_action || '.team') = any(p_permissions)
        and ((not s.routed and p_team_id = any(p_team_ids))
             or (p_step_user_id is null and p_step_role_id is null and p_step_team_id = any(p_team_ids))))
    or coalesce((p_module || ':' || p_asset_id::text) = any(p_asset_keys), false)
  from s;
$$;


ALTER FUNCTION public.rls_task_allows(p_action text, p_module text, p_asset_id uuid, p_assigned_user_id uuid, p_created_by_user_id uuid, p_team_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_keys text[], p_assignee_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_task_allows(p_action text, p_module text, p_asset_id uuid, p_assigned_user_id uuid, p_created_by_user_id uuid, p_team_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_keys text[], p_assignee_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_task_allows(p_action text, p_module text, p_asset_id uuid, p_assigned_user_id uuid, p_created_by_user_id uuid, p_team_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_keys text[], p_assignee_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_task_allows(p_action text, p_module text, p_asset_id uuid, p_assigned_user_id uuid, p_created_by_user_id uuid, p_team_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_keys text[], p_assignee_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.rls_task_allows(p_action text, p_module text, p_asset_id uuid, p_assigned_user_id uuid, p_created_by_user_id uuid, p_team_id uuid, p_step_user_id uuid, p_step_team_id uuid, p_step_role_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_keys text[], p_assignee_ids uuid[]) TO authenticated;

CREATE FUNCTION public.task_rights(p_task_ids uuid[]) RETURNS TABLE(task_id uuid, view boolean, "check" boolean, edit boolean, act boolean, decision boolean, forward boolean, claim boolean, reopen boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- materialized: read the caller's context once, not again for every task
  with me as materialized (
    select auth.uid() as uid, public.rls_my_permissions() as perms, public.rls_my_team_ids() as teams,
           public.rls_my_role_ids() as roles, public.rls_my_assignee_ids() as assignees,
           public.rls_my_task_type_ids() as types, '{}'::text[] as keys_view,
           '{}'::text[] as keys_check, '{}'::text[] as keys_edit
  ),
  base as (
    select t.*, me.*,
           t.status not in ('done', 'cancelled') as open,
           coalesce(st.is_decision or st.assignee_kind = 'requester_supervisor', false) as is_decision,
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
           (b.typed and public.rls_task_allows('view', b.permission_module, null::uuid, b.assigned_user_id, b.created_by_user_id,
              b.team_id, b.current_assignee_user_id, b.current_assignee_team_id, b.current_assignee_role_id,
              b.perms, b.teams, b.keys_view, b.assignees)) or b.worked as can_view,
           (b.typed and public.rls_task_allows('check', b.permission_module, null::uuid, b.assigned_user_id, b.created_by_user_id,
              b.team_id, b.current_assignee_user_id, b.current_assignee_team_id, b.current_assignee_role_id,
              b.perms, b.teams, b.keys_check, b.assignees)) or b.worked as can_check,
           b.typed and public.rls_task_allows('edit', b.permission_module, null::uuid, b.assigned_user_id, b.created_by_user_id,
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
         coalesce(not a.open and a.can_edit, false)
  from a;
$$;


ALTER FUNCTION public.task_rights(p_task_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO authenticated;

CREATE FUNCTION public.a_tasks_default_assignment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.team_id is null and new.assigned_user_id is null then
    select default_team_id into new.team_id from public.task_types where id = new.task_type_id;
    if new.team_id is null and auth.uid() is not null and pg_trigger_depth() = 1 then
      new.assigned_user_id := auth.uid();
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.a_tasks_default_assignment() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.a_tasks_default_assignment() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.a_tasks_default_assignment() FROM PUBLIC;
GRANT ALL ON FUNCTION public.a_tasks_default_assignment() TO service_role;

CREATE FUNCTION public.tasks_set_root() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.root_task_id := coalesce((select p.root_task_id from public.tasks p where p.id = new.parent_task_id), new.id);
  return new;
end;
$$;


ALTER FUNCTION public.tasks_set_root() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_set_root() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_set_root() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_set_root() TO service_role;

CREATE FUNCTION public.tasks_system_type_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.system_task', true), '') <> 'on'
     and exists (select 1 from public.task_types where id = new.task_type_id and system_created) then
    raise exception 'This task type is created by its own function only';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_system_type_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_system_type_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_system_type_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_system_type_guard() TO service_role;

CREATE FUNCTION public.tasks_default_blocks_parent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.parent_task_id is not null and not new.blocks_parent then
    new.blocks_parent := coalesce((select tt.blocks_parent from public.task_types tt where tt.id = new.task_type_id), false);
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_default_blocks_parent() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_default_blocks_parent() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_default_blocks_parent() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_default_blocks_parent() TO service_role;

CREATE FUNCTION public.tasks_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.parent_task_id is distinct from old.parent_task_id
     and (auth.uid() is not null and new.parent_task_id is not null) then
    raise exception 'The parent task cannot be changed';
  end if;
  if auth.uid() is null or coalesce(current_setting('app.task_engine', true), '') = 'on' then
    return new;
  end if;
  if new.task_type_id is distinct from old.task_type_id
    or new.current_step_key is distinct from old.current_step_key
    or new.status is distinct from old.status
    or new.current_assignee_role_id is distinct from old.current_assignee_role_id
    or new.current_assignee_user_id is distinct from old.current_assignee_user_id
    or new.current_assignee_team_id is distinct from old.current_assignee_team_id
    or new.completed_at is distinct from old.completed_at
    or new.team_id is distinct from old.team_id
    or new.assigned_user_id is distinct from old.assigned_user_id
    or new.planned_date is distinct from old.planned_date
    or new.sort_order is distinct from old.sort_order
    or new.task_number is distinct from old.task_number
  then
    raise exception 'Routing and planning fields change only through task_perform_action() / task_plan() / task_forward()';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_guard() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_guard() TO service_role;

CREATE FUNCTION public.tasks_init() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_step public.task_type_steps;
  v_assignee record;
begin
  select * into v_step
  from public.task_type_steps
  where task_type_id = new.task_type_id
  order by step_order
  limit 1;
  if v_step.id is null then
    raise exception 'Task type has no steps';
  end if;
  if not exists (select 1 from public.task_types where id = new.task_type_id and active) then
    raise exception 'Task type is not active';
  end if;
  if new.parent_task_id is not null
     and not (auth.uid() is null or public.user_has_access(auth.uid(), 'tasks', new.parent_task_id, 'view')) then
    raise exception 'Parent task not found';
  end if;
  -- Depth 1 = a task inserted directly or by an RPC. A task a trigger creates (the next task of a series) is not
  -- checked: whoever finishes a task must not be blocked by the type access of the task that follows it.
  if auth.uid() is not null and pg_trigger_depth() = 1
     and not public.user_task_type_allowed(auth.uid(), new.task_type_id) then
    raise exception 'You are not allowed to create tasks of this type';
  end if;

  -- a_tasks_default_assignment has run before (trigger names sort), so assignee and team are final here.
  select * into v_assignee
  from public.resolve_step_assignee(v_step.id, new.created_by_user_id, new.assigned_user_id, new.team_id);
  new.current_step_key := v_step.step_key;
  new.status := v_step.status;
  new.current_assignee_user_id := v_assignee.assignee_user_id;
  new.current_assignee_role_id := v_assignee.assignee_role_id;
  new.current_assignee_team_id := v_assignee.assignee_team_id;
  new.completed_at := null;
  if new.team_id is not null and new.assigned_user_id is not null
     and not exists (select 1 from public.user_teams where team_id = new.team_id and user_id = new.assigned_user_id) then
    raise exception 'The assigned user is not a member of the team';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_init() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_init() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_init() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_init() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_init() TO service_role;

CREATE FUNCTION public.tasks_keep_original_due_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' then
    new.original_due_date := coalesce(new.original_due_date, new.due_date);
  else
    -- never rewritten; set once when the first due date appears
    new.original_due_date := coalesce(old.original_due_date, new.due_date);
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_keep_original_due_date() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_keep_original_due_date() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_keep_original_due_date() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_keep_original_due_date() TO service_role;

CREATE FUNCTION public.tasks_log_events() RETURNS trigger
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
       and auth.uid() is not null and new.assigned_user_id <> auth.uid() then
      perform public.notify(
        array[new.assigned_user_id], 'task_assigned',
        '#' || new.task_number || ' ' || new.title, '/tasks/' || new.id,
        null, auth.uid(), 'tasks', new.id,
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
  return null;
end;
$$;


ALTER FUNCTION public.tasks_log_events() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_log_events() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_log_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_log_events() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_log_events() TO service_role;

CREATE FUNCTION public.tasks_record_first_step() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.task_step_history (task_id, step_key) values (new.id, new.current_step_key);
  return null;
end;
$$;


ALTER FUNCTION public.tasks_record_first_step() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_record_first_step() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_record_first_step() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_record_first_step() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_record_first_step() TO service_role;

CREATE FUNCTION public.tasks_rederive_root() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  with recursive tree (id, root_id) as (
    select new.id, new.id
    union all
    select c.id, tr.root_id from tree tr join public.tasks c on c.parent_task_id = tr.id
  )
  update public.tasks t set root_task_id = tr.root_id
  from tree tr
  where t.id = tr.id and t.root_task_id is distinct from tr.root_id;
  return null;
end;
$$;


ALTER FUNCTION public.tasks_rederive_root() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_rederive_root() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_rederive_root() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_rederive_root() TO service_role;

CREATE FUNCTION public.tasks_require_team_or_person() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.team_id is null and new.assigned_user_id is null
     and (old.team_id is not null or old.assigned_user_id is not null)
     and auth.uid() is not null and pg_trigger_depth() = 1 then
    raise exception 'task_needs_team_or_person' using errcode = '23514', hint = 'A task needs a team or a person.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_require_team_or_person() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_require_team_or_person() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_require_team_or_person() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_require_team_or_person() TO service_role;

CREATE FUNCTION public.tasks_set_permission_module() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.permission_module := public.permission_module_for(new.task_type_id);
  return new;
end $$;


ALTER FUNCTION public.tasks_set_permission_module() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_set_permission_module() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_set_permission_module() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_set_permission_module() TO service_role;

CREATE FUNCTION public.tasks_subtask_type_allowed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.parent_task_id is null or auth.uid() is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.tasks p
    join public.task_type_subtask_types l on l.task_type_id = p.task_type_id
    where p.id = new.parent_task_id and l.subtask_type_id = new.task_type_id
  ) then
    raise exception 'This task type is not allowed as a subtask of the parent task (Admin > Task types, Defaults)';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_subtask_type_allowed() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_subtask_type_allowed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_subtask_type_allowed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_subtask_type_allowed() TO service_role;

CREATE FUNCTION public.conversations_join_assignee() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_users uuid[];
begin
  if tg_table_name = 'tasks' then
    v_users := array[
      case when new.assigned_user_id is distinct from old.assigned_user_id then new.assigned_user_id end,
      case when new.current_assignee_user_id is distinct from old.current_assignee_user_id then new.current_assignee_user_id end];
  else
    v_users := array[case when new.assigned_user_id is distinct from old.assigned_user_id then new.assigned_user_id end];
  end if;
  insert into public.conversation_participants (conversation_id, user_id)
  select c.id, u
  from public.conversations c, unnest(v_users) u
  where c.kind = 'record' and c.anchor_type = tg_table_name and c.anchor_id = new.id and u is not null
  on conflict (conversation_id, user_id) do update set taking_part = true;
  return null;
end;
$$;


ALTER FUNCTION public.conversations_join_assignee() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.conversations_join_assignee() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversations_join_assignee() FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversations_join_assignee() TO service_role;

CREATE FUNCTION public.conversations_leave_assignee() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_left uuid[];
  v_now uuid[];
begin
  if tg_table_name = 'tasks' then
    v_left := array[
      case when new.assigned_user_id is distinct from old.assigned_user_id then old.assigned_user_id end,
      case when new.current_assignee_user_id is distinct from old.current_assignee_user_id then old.current_assignee_user_id end];
    v_now := array[new.assigned_user_id, new.current_assignee_user_id, new.created_by_user_id];
  else
    v_left := array[case when new.assigned_user_id is distinct from old.assigned_user_id then old.assigned_user_id end];
    v_now := array[new.assigned_user_id, new.reporter_user_id];
  end if;
  update public.conversation_participants p
  set taking_part = false, last_read_at = now()
  from public.conversations c
  where c.kind = 'record' and c.anchor_type = tg_table_name and c.anchor_id = new.id
    and p.conversation_id = c.id and p.taking_part and p.level = 'all'
    and p.user_id = any (v_left) and not (p.user_id = any (array_remove(v_now, null)))
    and not exists (select 1 from public.messages m where m.conversation_id = c.id and m.author_user_id = p.user_id)
    and not exists (select 1 from public.message_mentions mm join public.messages m on m.id = mm.message_id
                    where m.conversation_id = c.id and mm.mentioned_user_id = p.user_id);
  return null;
end;
$$;


ALTER FUNCTION public.conversations_leave_assignee() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.conversations_leave_assignee() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversations_leave_assignee() FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversations_leave_assignee() TO service_role;

CREATE FUNCTION public.conversations_follow_team() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_team uuid;
begin
  if tg_table_name = 'tickets' then
    v_team := new.assigned_team_id;
  else
    v_team := new.team_id;
  end if;
  update public.conversations set team_id = v_team
  where kind = 'record' and anchor_type = tg_table_name and anchor_id = new.id;
  return null;
end;
$$;


ALTER FUNCTION public.conversations_follow_team() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.conversations_follow_team() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversations_follow_team() FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversations_follow_team() TO service_role;

CREATE FUNCTION public.task_type_steps_decision_has_assignee() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.is_decision and new.assignee_kind = 'role' and new.assignee_role_id is null then
    raise exception 'A decision step needs a role, a team, the supervisor, the requester or the task owner' using errcode = '23514';
  end if;
  return new;
end $$;


ALTER FUNCTION public.task_type_steps_decision_has_assignee() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_steps_decision_has_assignee() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_steps_decision_has_assignee() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_steps_decision_has_assignee() TO service_role;

CREATE FUNCTION public.task_type_steps_in_use() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_count integer;
begin
  if tg_op = 'UPDATE' and new.step_key = old.step_key and new.task_type_id = old.task_type_id then
    return new;
  end if;
  select count(*) into v_count from public.tasks
  where task_type_id = old.task_type_id and current_step_key = old.step_key and status not in ('done', 'cancelled');
  if v_count > 0 then
    raise exception 'Step % is in use by % open task(s)', old.step_key, v_count using errcode = 'P0001', hint = 'step_in_use';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION public.task_type_steps_in_use() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_steps_in_use() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_steps_in_use() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_steps_in_use() TO service_role;

CREATE FUNCTION public.task_perform_action_as(p_task_id uuid, p_action_key text, p_comment text, p_actor uuid) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_task public.tasks;
  v_step public.task_type_steps;
  v_next public.task_type_steps;
  v_action jsonb;
  v_to text;
  v_recipients uuid[];
  v_next_user uuid;
  v_next_role uuid;
  v_next_team uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'Task not found';
  end if;
  if v_task.status in ('done', 'cancelled') then
    raise exception 'Task is already %', v_task.status;
  end if;

  select * into v_step from public.task_type_steps
  where task_type_id = v_task.task_type_id and step_key = v_task.current_step_key;
  if v_step.id is null then
    raise exception 'Current step % does not exist on the task type', v_task.current_step_key;
  end if;

  select a into v_action from jsonb_array_elements(v_step.actions) a where a ->> 'key' = p_action_key;
  if v_action is null then
    raise exception 'Action % does not exist on step %', p_action_key, v_step.step_key;
  end if;
  if coalesce((v_action ->> 'requires_comment')::boolean, false) and v_comment is null then
    raise exception 'This action requires a comment';
  end if;

  v_to := v_action ->> 'to';
  if v_to is not null then
    select * into v_next from public.task_type_steps where task_type_id = v_task.task_type_id and step_key = v_to;
    if v_next.id is null then
      raise exception 'Action % points to unknown step %', p_action_key, v_to;
    end if;
    select r.assignee_user_id, r.assignee_role_id, r.assignee_team_id into v_next_user, v_next_role, v_next_team
    from public.resolve_step_assignee(v_next.id, v_task.created_by_user_id, v_task.assigned_user_id, v_task.team_id) r;
  end if;

  update public.task_step_history
  set left_at = now(), actor_user_id = p_actor, action_key = p_action_key, comment = v_comment
  where task_id = p_task_id and left_at is null;

  perform set_config('app.task_engine', 'on', true);
  -- The kind of the action for tasks_checklist_completion_guard.
  perform set_config('app.task_action_kind', public.route_action_kind(v_action), true);
  if v_to is null then
    update public.tasks
    set status = 'done', completed_at = now(), current_assignee_role_id = null, current_assignee_user_id = null,
        current_assignee_team_id = null
    where id = p_task_id returning * into v_task;
  else
    update public.tasks
    set current_step_key = v_next.step_key, status = v_next.status,
        current_assignee_role_id = v_next_role, current_assignee_user_id = v_next_user,
        current_assignee_team_id = v_next_team
    where id = p_task_id returning * into v_task;
    insert into public.task_step_history (task_id, step_key) values (p_task_id, v_next.step_key);
  end if;
  perform set_config('app.task_action_kind', '', true);

  perform public.log_system_event(
    'tasks', p_task_id,
    case when v_to is null then 'task_completed' else 'task_step_changed' end,
    jsonb_strip_nulls(jsonb_build_object(
      'action_key', p_action_key,
      'from_step_key', v_step.step_key,
      'to_step_key', v_to,
      'to_user_id', v_next_user,
      'to_team_id', v_next_team,
      'action_label', v_action -> 'label',
      'status', v_task.status,
      'comment', v_comment)),
    p_actor);

  -- Tell the people who have to act next and the assignee; the creator only hears when the task is finished.
  v_recipients := '{}';
  if v_to is not null then
    v_recipients := public.task_step_recipients(v_next_user, v_next_team, v_next_role);
  end if;
  if v_to is null and v_task.created_by_user_id is not null then
    v_recipients := v_recipients || v_task.created_by_user_id;
  end if;
  if v_task.assigned_user_id is not null then
    v_recipients := v_recipients || v_task.assigned_user_id;
  end if;
  v_recipients := array(select distinct u from unnest(v_recipients) u where u is distinct from p_actor);
  perform public.notify(
    v_recipients, 'task_step_changed',
    '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
    null, p_actor, 'tasks', v_task.id, 'task-step:' || v_task.id,
    array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));

  return v_task;
end;
$$;


ALTER FUNCTION public.task_perform_action_as(p_task_id uuid, p_action_key text, p_comment text, p_actor uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_perform_action_as(p_task_id uuid, p_action_key text, p_comment text, p_actor uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_perform_action_as(p_task_id uuid, p_action_key text, p_comment text, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_perform_action_as(p_task_id uuid, p_action_key text, p_comment text, p_actor uuid) TO service_role;

CREATE FUNCTION public.task_perform_action(p_task_id uuid, p_action_key text, p_comment text DEFAULT NULL::text) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'Task not found';
  end if;
  if v_task.status not in ('done', 'cancelled') and not public.task_step_actor(v_uid, v_task) then
    raise exception 'You are not allowed to work this step';
  end if;
  return public.task_perform_action_as(p_task_id, p_action_key, p_comment, v_uid);
end;
$$;


ALTER FUNCTION public.task_perform_action(p_task_id uuid, p_action_key text, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_perform_action(p_task_id uuid, p_action_key text, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_perform_action(p_task_id uuid, p_action_key text, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_perform_action(p_task_id uuid, p_action_key text, p_comment text) TO service_role;
GRANT ALL ON FUNCTION public.task_perform_action(p_task_id uuid, p_action_key text, p_comment text) TO authenticated;

CREATE FUNCTION public.task_forward(p_task_id uuid, p_user_id uuid, p_comment text DEFAULT NULL::text) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks;
  v_old public.tasks;
  v_step public.task_type_steps;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_mode text;
  v_decision boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'Task not found';
  end if;
  if v_task.status in ('done', 'cancelled') then
    raise exception 'Task is already %', v_task.status;
  end if;
  if length(v_comment) > 2000 then
    raise exception 'The comment is too long';
  end if;
  select * into v_step from public.task_type_steps
  where task_type_id = v_task.task_type_id and step_key = v_task.current_step_key;
  v_decision := coalesce(v_step.is_decision, false) or v_step.assignee_kind = 'requester_supervisor';

  -- A decision is handed on only by whoever may take it; other steps also by anyone who may edit the task.
  if not (public.task_step_actor(v_uid, v_task)
          or (not v_decision and public.user_has_access(v_uid, 'tasks', p_task_id, 'edit'))) then
    raise exception 'You are not allowed to forward this task';
  end if;
  if not exists (select 1 from public.users where id = p_user_id and has_login and not has_left and locked_at is null) then
    raise exception 'This person cannot sign in';
  end if;
  if v_decision and p_user_id = v_task.created_by_user_id then
    raise exception 'An approval cannot be forwarded to the requester';
  end if;

  v_old := v_task;
  perform set_config('app.task_engine', 'on', true);
  if v_task.current_assignee_user_id is not null or v_task.current_assignee_team_id is not null
     or v_task.current_assignee_role_id is not null then
    v_mode := 'step';
    if v_task.current_assignee_user_id = p_user_id then
      raise exception 'The step is already with this person';
    end if;
    update public.tasks
    set current_assignee_user_id = p_user_id, current_assignee_role_id = null, current_assignee_team_id = null
    where id = p_task_id returning * into v_task;
  else
    v_mode := 'assignee';
    if v_task.assigned_user_id = p_user_id then
      raise exception 'The task is already assigned to this person';
    end if;
    update public.tasks
    set assigned_user_id = p_user_id,
        team_id = case when exists (select 1 from public.user_teams where team_id = v_task.team_id and user_id = p_user_id)
                       then team_id end
    where id = p_task_id returning * into v_task;
  end if;

  perform public.log_system_event('tasks', p_task_id, 'task_forwarded',
    jsonb_strip_nulls(jsonb_build_object(
      'mode', v_mode,
      'step_key', v_task.current_step_key,
      'from_user_id', case when v_mode = 'step' then v_old.current_assignee_user_id else v_old.assigned_user_id end,
      'from_team_id', case when v_mode = 'step' then v_old.current_assignee_team_id end,
      'from_role_id', case when v_mode = 'step' then v_old.current_assignee_role_id end,
      'to_user_id', p_user_id,
      'comment', v_comment)),
    v_uid);

  if p_user_id <> v_uid then
    perform public.notify(
      public.task_step_recipients(p_user_id, null, null), 'task_forwarded',
      '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
      v_comment, v_uid, 'tasks', v_task.id, 'task-forwarded:' || v_task.id,
      array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
  end if;
  return v_task;
end;
$$;


ALTER FUNCTION public.task_forward(p_task_id uuid, p_user_id uuid, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_forward(p_task_id uuid, p_user_id uuid, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_forward(p_task_id uuid, p_user_id uuid, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_forward(p_task_id uuid, p_user_id uuid, p_comment text) TO service_role;
GRANT ALL ON FUNCTION public.task_forward(p_task_id uuid, p_user_id uuid, p_comment text) TO authenticated;

CREATE FUNCTION public.task_plan(p_task_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date, p_sort_order text DEFAULT NULL::text) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_old public.tasks;
  v_task public.tasks;
  v_changed boolean;
  v_step public.task_type_steps;
  v_assignee record;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_old from public.tasks where id = p_task_id for update;
  if v_old.id is null then
    raise exception 'Task not found';
  end if;
  if not public.user_has_access(v_uid, 'tasks', p_task_id, 'edit') then
    raise exception 'You are not allowed to plan this task';
  end if;
  if v_old.status in ('done', 'cancelled') then
    raise exception 'Task is already %', v_old.status;
  end if;
  if p_team_id is not null and p_assigned_user_id is not null
     and not exists (select 1 from public.user_teams where team_id = p_team_id and user_id = p_assigned_user_id) then
    raise exception 'The assigned user is not a member of the team';
  end if;

  v_changed := v_old.team_id is distinct from p_team_id
            or v_old.assigned_user_id is distinct from p_assigned_user_id
            or v_old.planned_date is distinct from p_planned_date;

  perform set_config('app.task_engine', 'on', true);
  update public.tasks
  set team_id = p_team_id, assigned_user_id = p_assigned_user_id, planned_date = p_planned_date,
      sort_order = coalesce(p_sort_order, sort_order)
  where id = p_task_id returning * into v_task;

  if v_old.team_id is distinct from p_team_id or v_old.assigned_user_id is distinct from p_assigned_user_id then
    select * into v_step from public.task_type_steps
    where task_type_id = v_task.task_type_id and step_key = v_task.current_step_key;
    if v_step.assignee_kind in ('task_owner', 'task_team') or v_step.assignee_team_scope = 'task_team' then
      select * into v_assignee
      from public.resolve_step_assignee(v_step.id, v_task.created_by_user_id, p_assigned_user_id, p_team_id);
      update public.tasks
      set current_assignee_user_id = v_assignee.assignee_user_id, current_assignee_role_id = v_assignee.assignee_role_id,
          current_assignee_team_id = v_assignee.assignee_team_id
      where id = p_task_id returning * into v_task;
    end if;
  end if;

  if v_changed then
    perform public.log_system_event(
      'tasks', p_task_id, 'task_planning_changed',
      jsonb_build_object(
        'old', jsonb_build_object('team_id', v_old.team_id, 'assigned_user_id', v_old.assigned_user_id,
                                  'planned_date', v_old.planned_date),
        'new', jsonb_build_object('team_id', p_team_id, 'assigned_user_id', p_assigned_user_id,
                                  'planned_date', p_planned_date)),
      v_uid);
    if p_assigned_user_id is not null and p_assigned_user_id is distinct from v_old.assigned_user_id
       and p_assigned_user_id <> v_uid then
      perform public.notify(
        array[p_assigned_user_id], 'task_assigned',
        '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
        null, v_uid, 'tasks', v_task.id, 'task-assigned:' || v_task.id,
        array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
    end if;
  end if;
  return v_task;
end;
$$;


ALTER FUNCTION public.task_plan(p_task_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date, p_sort_order text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_plan(p_task_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date, p_sort_order text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_plan(p_task_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date, p_sort_order text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_plan(p_task_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date, p_sort_order text) TO authenticated;
GRANT ALL ON FUNCTION public.task_plan(p_task_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date, p_sort_order text) TO service_role;

CREATE FUNCTION public.task_reopen(p_task_id uuid, p_comment text DEFAULT NULL::text) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_task public.tasks;
  v_type public.task_types;
  v_step public.task_type_steps;
  v_step_key text;
  v_user uuid;
  v_role uuid;
  v_team uuid;
  v_recipients uuid[];
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'Task not found';
  end if;
  if not public.user_has_access(v_uid, 'tasks', p_task_id, 'edit') then
    raise exception 'You are not allowed to reopen this task';
  end if;
  if v_task.status not in ('done', 'cancelled') then
    raise exception 'Task is not finished';
  end if;
  select * into v_type from public.task_types where id = v_task.task_type_id;

  select h.step_key into v_step_key from public.task_step_history h
  where h.task_id = p_task_id order by h.entered_at desc, h.id desc limit 1;
  select * into v_step from public.task_type_steps where task_type_id = v_task.task_type_id and step_key = v_step_key;
  if v_step.id is null then
    raise exception 'The step this task was finished in no longer exists';
  end if;
  select r.assignee_user_id, r.assignee_role_id, r.assignee_team_id into v_user, v_role, v_team
  from public.resolve_step_assignee(v_step.id, v_task.created_by_user_id, v_task.assigned_user_id, v_task.team_id) r;

  perform set_config('app.task_engine', 'on', true);
  update public.tasks
  set status = v_step.status, current_step_key = v_step.step_key, completed_at = null,
      current_assignee_user_id = v_user, current_assignee_role_id = v_role, current_assignee_team_id = v_team
  where id = p_task_id returning * into v_task;
  insert into public.task_step_history (task_id, step_key) values (p_task_id, v_step.step_key);

  perform public.log_system_event('tasks', p_task_id, 'task_reopened',
    jsonb_strip_nulls(jsonb_build_object('step_key', v_step.step_key, 'comment', nullif(btrim(coalesce(p_comment, '')), ''))), v_uid);

  v_recipients := public.task_step_recipients(v_user, v_team, v_role);
  if v_task.assigned_user_id is not null then
    v_recipients := v_recipients || v_task.assigned_user_id;
  end if;
  v_recipients := array(select distinct u from unnest(v_recipients) u where u is distinct from v_uid);
  perform public.notify(
    v_recipients, 'task_step_changed',
    '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
    null, v_uid, 'tasks', v_task.id, 'task-step:' || v_task.id,
    array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
  return v_task;
end;
$$;


ALTER FUNCTION public.task_reopen(p_task_id uuid, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_reopen(p_task_id uuid, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_reopen(p_task_id uuid, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_reopen(p_task_id uuid, p_comment text) TO service_role;
GRANT ALL ON FUNCTION public.task_reopen(p_task_id uuid, p_comment text) TO authenticated;

CREATE FUNCTION public.task_cancel_as(p_task_id uuid, p_comment text, p_actor uuid) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_task public.tasks;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then
    raise exception 'Task not found';
  end if;
  if v_task.status in ('done', 'cancelled') then
    raise exception 'Task is already %', v_task.status;
  end if;

  update public.task_step_history
  set left_at = now(), actor_user_id = p_actor, action_key = 'cancel', comment = v_comment
  where task_id = p_task_id and left_at is null;

  perform set_config('app.task_engine', 'on', true);
  update public.tasks
  set status = 'cancelled', completed_at = now(), current_assignee_role_id = null, current_assignee_user_id = null,
      current_assignee_team_id = null
  where id = p_task_id returning * into v_task;
  perform set_config('app.task_engine', 'off', true);

  perform public.log_system_event('tasks', p_task_id, 'task_cancelled',
    jsonb_strip_nulls(jsonb_build_object('comment', v_comment)), p_actor);
  return v_task;
end;
$$;


ALTER FUNCTION public.task_cancel_as(p_task_id uuid, p_comment text, p_actor uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_cancel_as(p_task_id uuid, p_comment text, p_actor uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_cancel_as(p_task_id uuid, p_comment text, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_cancel_as(p_task_id uuid, p_comment text, p_actor uuid) TO service_role;

CREATE FUNCTION public.task_cancel(p_task_id uuid, p_comment text DEFAULT NULL::text) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.tasks where id = p_task_id) then
    raise exception 'Task not found';
  end if;
  if not public.user_has_access(v_uid, 'tasks', p_task_id, 'edit') then
    raise exception 'You are not allowed to cancel this task';
  end if;
  return public.task_cancel_as(p_task_id, p_comment, v_uid);
end;
$$;


ALTER FUNCTION public.task_cancel(p_task_id uuid, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_cancel(p_task_id uuid, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_cancel(p_task_id uuid, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_cancel(p_task_id uuid, p_comment text) TO authenticated;
GRANT ALL ON FUNCTION public.task_cancel(p_task_id uuid, p_comment text) TO service_role;

CREATE FUNCTION public.default_due_date(p_task_type_id uuid) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when d.days > 0 then current_date + d.days end
  from (
    select coalesce((select default_due_days from public.task_types where id = p_task_type_id),
                    (select nullif(s.value, '')::integer from public.app_settings s where s.key = 'default_due_days')) as days
  ) d
$$;


ALTER FUNCTION public.default_due_date(p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.default_due_date(p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.default_due_date(p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.default_due_date(p_task_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.default_due_date(p_task_type_id uuid) TO service_role;

CREATE FUNCTION public.task_date_conflict(p_status text, p_due_date date, p_parent_status text, p_parent_due_date date) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select case
    when p_due_date is null or p_parent_due_date is null then null
    when p_status in ('done', 'cancelled') or p_parent_status in ('done', 'cancelled') then null
    when p_due_date > p_parent_due_date then 'later'
    when current_date > p_parent_due_date then 'overdue'
  end;
$$;


ALTER FUNCTION public.task_date_conflict(p_status text, p_due_date date, p_parent_status text, p_parent_due_date date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_date_conflict(p_status text, p_due_date date, p_parent_status text, p_parent_due_date date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_date_conflict(p_status text, p_due_date date, p_parent_status text, p_parent_due_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_date_conflict(p_status text, p_due_date date, p_parent_status text, p_parent_due_date date) TO service_role;
GRANT ALL ON FUNCTION public.task_date_conflict(p_status text, p_due_date date, p_parent_status text, p_parent_due_date date) TO authenticated;

ALTER TABLE public.task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins create task types" ON public.task_types FOR INSERT TO authenticated WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Admins delete task types" ON public.task_types FOR DELETE TO authenticated USING (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Edit task types" ON public.task_types FOR UPDATE TO authenticated USING (( SELECT public.task_type_editable(task_types.id) AS task_type_editable)) WITH CHECK ((( SELECT public.is_admin() AS is_admin) OR ( SELECT public.rls_has('task_types.edit.all'::text) AS rls_has) OR ( SELECT public.rls_has('task_types.edit.own'::text) AS rls_has)));

CREATE POLICY "Read task types" ON public.task_types FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.task_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_task_types_name_de BEFORE INSERT OR UPDATE ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.master_data_default_name_de();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.task_type_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit task type steps" ON public.task_type_steps TO authenticated USING (( SELECT public.task_type_editable(task_type_steps.task_type_id) AS task_type_editable)) WITH CHECK (( SELECT public.task_type_editable(task_type_steps.task_type_id) AS task_type_editable));

CREATE POLICY "Read task type steps" ON public.task_type_steps FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.task_type_steps AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_task_type_steps_name_de BEFORE INSERT OR UPDATE ON public.task_type_steps FOR EACH ROW EXECUTE FUNCTION public.master_data_default_name_de();

CREATE TRIGGER task_type_steps_decision_has_assignee BEFORE INSERT OR UPDATE OF is_decision, assignee_kind, assignee_role_id ON public.task_type_steps FOR EACH ROW EXECUTE FUNCTION public.task_type_steps_decision_has_assignee();

CREATE TRIGGER task_type_steps_in_use BEFORE DELETE OR UPDATE OF step_key, task_type_id ON public.task_type_steps FOR EACH ROW EXECUTE FUNCTION public.task_type_steps_in_use();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create tasks per grant" ON public.tasks FOR INSERT WITH CHECK (((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND ((true AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'created'::text) AS rls_task_modules)::text[])) AND true) OR ((permission_module = ANY (( SELECT public.rls_task_modules('create'::text, 'team'::text) AS rls_task_modules)::text[])) AND ((true AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))))));

CREATE POLICY "Delete tasks per grant" ON public.tasks FOR DELETE USING (((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('delete'::text, 'team'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))))));

CREATE POLICY "Edit tasks per grant" ON public.tasks FOR UPDATE USING (((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'team'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))))))) WITH CHECK (((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('edit'::text, 'team'::text) AS rls_task_modules)::text[])) AND (((current_assignee_user_id IS NULL) AND (current_assignee_team_id IS NULL) AND (current_assignee_role_id IS NULL) AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))))));

CREATE POLICY "View tasks per grant" ON public.tasks FOR SELECT USING ((((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'all'::text) AS rls_task_modules)::text[])) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'assigned'::text) AS rls_task_modules)::text[])) AND ((true AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (current_assignee_user_id = ( SELECT auth.uid() AS uid)) OR ((current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) AND (created_by_user_id IS DISTINCT FROM ( SELECT auth.uid() AS uid))))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'created'::text) AS rls_task_modules)::text[])) AND (created_by_user_id = ( SELECT auth.uid() AS uid))) OR ((permission_module = ANY (( SELECT public.rls_task_modules('view'::text, 'team'::text) AS rls_task_modules)::text[])) AND ((true AND (team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR ((current_assignee_user_id IS NULL) AND (current_assignee_role_id IS NULL) AND (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))))) OR (assigned_user_id = ( SELECT auth.uid() AS uid)) OR (current_assignee_user_id = ANY (( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)::uuid[])) OR (((current_assignee_role_id IS NOT NULL) OR (current_assignee_team_id IS NOT NULL)) AND ((current_assignee_role_id IS NULL) OR (current_assignee_role_id = ANY (( SELECT public.rls_my_role_ids() AS rls_my_role_ids)::uuid[]))) AND ((current_assignee_team_id IS NULL) OR (current_assignee_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))))));

CREATE POLICY mfa_required ON public.tasks AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a00_tasks_creator_guard BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.records_creator_guard();

CREATE TRIGGER a0_tasks_root BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_set_root();

CREATE TRIGGER a_tasks_default_assignment BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.a_tasks_default_assignment();

CREATE TRIGGER a_tasks_system_type_guard BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_system_type_guard();

CREATE TRIGGER cleanup_feed AFTER DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.cleanup_entity_feed('tasks');

CREATE TRIGGER conversations_follow_team AFTER UPDATE OF team_id ON public.tasks FOR EACH ROW WHEN ((old.team_id IS DISTINCT FROM new.team_id)) EXECUTE FUNCTION public.conversations_follow_team();

CREATE TRIGGER conversations_join_assignee AFTER UPDATE OF assigned_user_id, current_assignee_user_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.conversations_join_assignee();

CREATE TRIGGER conversations_leave_assignee AFTER UPDATE OF assigned_user_id, current_assignee_user_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.conversations_leave_assignee();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER tasks_default_blocks_parent BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_default_blocks_parent();

CREATE TRIGGER tasks_guard BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_guard();

CREATE TRIGGER tasks_init BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_init();

CREATE TRIGGER tasks_keep_original_due_date BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_keep_original_due_date();

CREATE TRIGGER tasks_log_events AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_log_events();

CREATE TRIGGER tasks_record_first_step AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_record_first_step();

CREATE TRIGGER tasks_rederive_root AFTER UPDATE OF parent_task_id ON public.tasks FOR EACH ROW WHEN ((new.parent_task_id IS DISTINCT FROM old.parent_task_id)) EXECUTE FUNCTION public.tasks_rederive_root();

CREATE TRIGGER tasks_require_team_or_person BEFORE UPDATE OF team_id, assigned_user_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_require_team_or_person();

CREATE TRIGGER tasks_set_permission_module BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_set_permission_module();

CREATE TRIGGER tasks_subtask_type_allowed BEFORE INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_subtask_type_allowed();

ALTER TABLE public.task_step_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task step history" ON public.task_step_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE (t.id = task_step_history.task_id))));

CREATE POLICY mfa_required ON public.task_step_history AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.role_task_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage role task types" ON public.role_task_types TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY mfa_required ON public.role_task_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.task_type_subtask_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit subtask quick links" ON public.task_type_subtask_types TO authenticated USING (( SELECT public.task_type_editable(task_type_subtask_types.task_type_id) AS task_type_editable)) WITH CHECK (( SELECT public.task_type_editable(task_type_subtask_types.task_type_id) AS task_type_editable));

CREATE POLICY "Read subtask quick links" ON public.task_type_subtask_types FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.task_type_subtask_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

-- Hand-written part of the tasks module (after the objects copied from COMPASS).

-- Permissions: COMPASS's task family without the assigned_assets scope (comes with the asset module). Five actions,
-- four scopes; create has no 'assigned' scope; edit implies check implies view, create and delete imply view.
insert into public.permissions (key, module, action, scope, sort_order, task_family)
select 'tasks.' || a.a || '.' || s.s, 'tasks', a.a, s.s, 300 + a.o * 10 + s.o, true
from (values ('view', 1), ('check', 2), ('edit', 3), ('create', 4), ('delete', 5)) a (a, o),
     (values ('assigned', 1), ('created', 2), ('team', 3), ('all', 4)) s (s, o)
where not (a.a = 'create' and s.s = 'assigned');
insert into public.permissions (key, module, action, scope, sort_order) values
  ('task_types.edit.own', 'task_types', 'edit', 'own', 360),
  ('task_types.edit.all', 'task_types', 'edit', 'all', 361);
insert into public.permission_implies (permission, implies)
select 'tasks.' || a || '.' || s, 'tasks.' || i || '.' || s
from (values ('check', 'view'), ('edit', 'check'), ('edit', 'view'), ('create', 'view'), ('delete', 'view')) x (a, i),
     (values ('assigned'), ('created'), ('team'), ('all')) ss (s)
where not (a = 'create' and s = 'assigned');

-- Record access (COMPASS user_has_access, branch 'tasks'): a grant counts only for the task types the user's roles allow;
-- whoever works the task (assignee, step person and deputy, holders of the step's role / team) may always view and check.
-- 'moderate' (notes of a task): the holders of tasks.edit.all, as COMPASS's record_moderator.
create function public.tasks_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
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
     and public.user_has_grant(p_user_id, v_task.permission_module, p_action, null, v_task.assigned_user_id, v_task.team_id,
                               v_task.created_by_user_id, v_task.current_assignee_user_id, v_task.current_assignee_team_id,
                               v_task.current_assignee_role_id) then
    return true;
  end if;
  return p_action in ('view', 'check') and public.task_is_worked_by(p_user_id, p_entity_id);
end $$;
create function public.tasks_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$
  select '#' || t.task_number || ' ' || t.title from public.tasks t where t.id = p_entity_id; $$;
create function public.tasks_team(p_entity_id uuid) returns uuid
  language sql stable security definer set search_path to '' as $$ select t.team_id from public.tasks t where t.id = p_entity_id; $$;
create function public.tasks_followers(p_entity_id uuid) returns uuid[]
  language sql stable security definer set search_path to '' as $$
  select array_remove(array[t.created_by_user_id, t.assigned_user_id, t.current_assignee_user_id], null)
  from public.tasks t where t.id = p_entity_id; $$;
revoke all on function public.tasks_access(uuid, uuid, text), public.tasks_label(uuid), public.tasks_team(uuid),
  public.tasks_followers(uuid) from public, anon;
grant execute on function public.tasks_access(uuid, uuid, text), public.tasks_label(uuid), public.tasks_team(uuid),
  public.tasks_followers(uuid) to authenticated, service_role;
select public.entity_type_register('tasks', 'tasks', 'tasks_access', null, 'A task', 'tasks_label', 'tasks_team', 'tasks_followers');

-- The anchor (NEW): a task can belong to any registered record (a specification, an order, ...). Whoever sets it must be
-- able to view that record; the task itself keeps its own rights (decision E4), the record is shown only to who may view it.
create function public.tasks_check_anchor() returns trigger
  language plpgsql security definer set search_path to '' as $$
begin
  if new.anchor_type is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.anchor_type is not distinct from old.anchor_type and new.anchor_id is not distinct from old.anchor_id then
    return new;
  end if;
  if not exists (select 1 from public.entity_types e where e.entity_type = new.anchor_type) then
    raise exception 'Unknown record type %', new.anchor_type using errcode = '22023';
  end if;
  if auth.uid() is not null and not public.user_has_access(auth.uid(), new.anchor_type, new.anchor_id, 'view') then
    raise exception 'Record not found' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.tasks_check_anchor() from public, anon, authenticated;
create trigger tasks_check_anchor before insert or update of anchor_type, anchor_id on public.tasks
  for each row execute function public.tasks_check_anchor();
create index tasks_anchor_idx on public.tasks (anchor_type, anchor_id) where anchor_id is not null;

-- The record a task belongs to, for the people who may view it (null otherwise).
create function public.task_anchor_label(p_anchor_type text, p_anchor_id uuid) returns text
  language sql stable security definer set search_path to '' as $$
  select case when p_anchor_id is not null and public.user_has_access(auth.uid(), p_anchor_type, p_anchor_id, 'view')
              then coalesce(public.entity_label(p_anchor_type, p_anchor_id), p_anchor_type) end; $$;
revoke all on function public.task_anchor_label(text, uuid) from public, anon;
grant execute on function public.task_anchor_label(text, uuid) to authenticated, service_role;

-- task_create: COMPASS task_create + task_create_finish without asset, initiative, checklist and item arguments; with the anchor.
create function public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text default 'normal',
                                   p_description text default null, p_anchor_type text default null, p_anchor_id uuid default null,
                                   p_team_id uuid default null, p_assigned_user_id uuid default null,
                                   p_parent_task_id uuid default null, p_blocks_parent boolean default null) returns uuid
  language plpgsql set search_path to '' as $$
declare
  v_id uuid;
begin
  insert into public.tasks (task_type_id, title, description, anchor_type, anchor_id, priority, due_date, team_id,
                            assigned_user_id, parent_task_id)
  values (p_task_type_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_anchor_type, p_anchor_id,
          p_priority, p_due_date, p_team_id, p_assigned_user_id, p_parent_task_id)
  returning id into v_id;
  if p_blocks_parent is not null then
    update public.tasks set blocks_parent = p_blocks_parent
    where id = v_id and parent_task_id is not null and blocks_parent is distinct from p_blocks_parent;
  end if;
  return v_id;
end $$;
revoke all on function public.task_create(uuid, text, date, text, text, text, uuid, uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.task_create(uuid, text, date, text, text, text, uuid, uuid, uuid, uuid, boolean) to authenticated, service_role;

-- tasks_overview: COMPASS's view without the asset, ticket, checklist, item, series, goal, bucket and effort columns; with the anchor.
create view public.tasks_overview with (security_invoker = true) as
select t.id, t.task_number, t.task_type_id, t.current_step_key, t.status, t.current_assignee_role_id, t.completed_at, t.title,
       t.description, t.priority, t.due_date, t.team_id, t.assigned_user_id, t.planned_date, t.sort_order, t.created_at,
       t.updated_at, t.created_by_user_id, t.updated_by_user_id, t.parent_task_id, t.permission_module, t.original_due_date,
       t.current_assignee_user_id, t.root_task_id, t.current_assignee_team_id, t.blocks_parent, t.anchor_type, t.anchor_id,
       tt.name as task_type_name, st.name as current_step_name, au.name as assigned_user_name, g.name as team_name,
       cu.name as created_by_name,
       t.due_date is not null and t.due_date < current_date and t.status not in ('done', 'cancelled') as is_overdue,
       pt.task_number as parent_task_number, pt.title as parent_title,
       (select count(*) from public.tasks s where s.parent_task_id = t.id) as subtask_count,
       (select count(*) from public.tasks s where s.parent_task_id = t.id and s.status not in ('done', 'cancelled')) as open_subtask_count,
       public.task_date_conflict(t.status, t.due_date, pt.status, pt.due_date) as date_conflict,
       pt.due_date as parent_due_date,
       bl.blocking_subtask_count,
       bl.blocking_subtask_count > 0 and t.status not in ('done', 'cancelled') as is_blocked,
       tt.name_de as task_type_name_de, st.name_de as current_step_name_de,
       ca.name as current_assignee_user_name, cg.name as current_assignee_team_name, cr.name as current_assignee_role_name
from public.tasks t
join public.task_types tt on tt.id = t.task_type_id
left join public.task_type_steps st on st.task_type_id = t.task_type_id and st.step_key = t.current_step_key
left join public.users au on au.id = t.assigned_user_id
left join public.teams g on g.id = t.team_id
left join public.users cu on cu.id = t.created_by_user_id
left join public.tasks pt on pt.id = t.parent_task_id
left join public.users ca on ca.id = t.current_assignee_user_id
left join public.teams cg on cg.id = t.current_assignee_team_id
left join public.roles cr on cr.id = t.current_assignee_role_id
left join lateral (select count(*) as blocking_subtask_count from public.tasks s
                   where s.parent_task_id = t.id and s.blocks_parent and s.status not in ('done', 'cancelled')) bl on true;
grant select on public.tasks_overview to authenticated, service_role;

-- Settings (COMPASS: columns of app_settings).
select public.app_setting_register('default_fallback_role_id', 'tasks', 'text', null, true,
  'Role that acts on a task step when nobody else is found (role id)');
select public.app_setting_register('default_due_days', 'tasks', 'integer', null, true,
  'Days from today for the due date of a new task when its type has none');
select public.app_setting_register('default_task_type_id', 'tasks', 'text', null, true, 'Task type preselected for a new task (id)');
insert into public.app_settings (key, value)
select r.key, coalesce(r.default_value, '') from public.app_setting_registry r where r.module = 'tasks'  -- '' = not set
on conflict (key) do nothing;

select public.notification_type_register('task_assigned', 'tasks', false, 'A task was assigned to you', true);
select public.notification_type_register('task_step_changed', 'tasks', false, 'A task moved to a step you work on, or was finished', true);
select public.notification_type_register('task_forwarded', 'tasks', false, 'A task was forwarded to you', true);

