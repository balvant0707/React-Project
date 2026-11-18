-- Tickets (module tickets): COMPASS ticket queues, types, tickets (internal and the public QR form), conversion to a
-- task and back (workflow hooks), a checklist defect as a ticket, ticket flow statistics. Source: COMPASS database. Cut

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the tickets module, before the objects copied from COMPASS.

-- Ticket numbers (COMPASS sequence ticket_number_seq and its grants).
create sequence public.ticket_number_seq;
grant all on sequence public.ticket_number_seq to authenticated, service_role;

-- The columns the tasks module and task-family cut, back as COMPASS has them (FKs and indexes below): the ticket a task was
-- made from, the ticket a checklist defect became.
alter table public.tasks add column ticket_id uuid;
alter table public.task_checklist_items add column ticket_id uuid;


CREATE TABLE public.ticket_queues (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    default_team_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    open_to_everyone boolean DEFAULT false NOT NULL,
    name_de text NOT NULL,
    icon text,
    color text,
    CONSTRAINT ticket_queues_color_check CHECK ((color = ANY (ARRAY['gray'::text, 'navy'::text, 'blue'::text, 'sky'::text, 'teal'::text, 'green'::text, 'amber'::text, 'orange'::text, 'red'::text, 'pink'::text, 'violet'::text]))),
    CONSTRAINT ticket_queues_description_check CHECK (((description IS NULL) OR (length(description) <= 500))),
    CONSTRAINT ticket_queues_icon_check CHECK ((icon ~ '^[a-z0-9-]{1,40}$'::text)),
    CONSTRAINT ticket_queues_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text)),
    CONSTRAINT ticket_queues_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100)))
);


ALTER TABLE public.ticket_queues OWNER TO postgres;

REVOKE ALL ON TABLE public.ticket_queues FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.ticket_queues TO authenticated;
GRANT ALL ON TABLE public.ticket_queues TO service_role;

CREATE TABLE public.ticket_types (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    queue_id uuid NOT NULL,
    key text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    name_de text NOT NULL,
    CONSTRAINT ticket_types_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text)),
    CONSTRAINT ticket_types_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100)))
);


ALTER TABLE public.ticket_types OWNER TO postgres;

REVOKE ALL ON TABLE public.ticket_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.ticket_types TO authenticated;
GRANT ALL ON TABLE public.ticket_types TO service_role;

CREATE TABLE public.ticket_queue_teams (
    queue_id uuid NOT NULL,
    team_id uuid NOT NULL
);


ALTER TABLE public.ticket_queue_teams OWNER TO postgres;

REVOKE ALL ON TABLE public.ticket_queue_teams FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.ticket_queue_teams TO authenticated;
GRANT ALL ON TABLE public.ticket_queue_teams TO service_role;

CREATE TABLE public.tickets (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    ticket_number bigint DEFAULT nextval('public.ticket_number_seq'::regclass) NOT NULL,
    asset_id uuid,
    type text DEFAULT 'incident'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    title text NOT NULL,
    description text,
    source text DEFAULT 'internal'::text NOT NULL,
    reporter_user_id uuid,
    reporter_name text,
    reporter_contact text,
    client_request_id uuid,
    assigned_team_id uuid,
    assigned_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    resolved_at timestamp with time zone,
    queue_id uuid NOT NULL,
    CONSTRAINT tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT tickets_public_requires_asset CHECK (((source <> 'qr_public'::text) OR (asset_id IS NOT NULL))),
    CONSTRAINT tickets_source_check CHECK ((source = ANY (ARRAY['internal'::text, 'qr_public'::text]))),
    CONSTRAINT tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'waiting_for_requester'::text, 'converted_to_task'::text, 'resolved'::text, 'closed'::text]))),
    CONSTRAINT tickets_title_check CHECK (((length(title) >= 1) AND (length(title) <= 200)))
);


ALTER TABLE public.tickets OWNER TO postgres;

REVOKE ALL ON TABLE public.tickets FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tickets TO authenticated;
GRANT ALL ON TABLE public.tickets TO service_role;

CREATE TABLE public.public_report_rate_limits (
    bucket_key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.public_report_rate_limits OWNER TO postgres;

REVOKE ALL ON TABLE public.public_report_rate_limits FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.public_report_rate_limits TO service_role;

ALTER TABLE ONLY public.ticket_queues
    ADD CONSTRAINT ticket_queues_key_key UNIQUE (key);

ALTER TABLE ONLY public.ticket_queues
    ADD CONSTRAINT ticket_queues_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_queue_id_key_key UNIQUE (queue_id, key);

ALTER TABLE ONLY public.ticket_queue_teams
    ADD CONSTRAINT ticket_queue_teams_pkey PRIMARY KEY (queue_id, team_id);

CREATE INDEX ticket_queue_teams_group_id_idx ON public.ticket_queue_teams USING btree (team_id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_client_request_id_key UNIQUE (client_request_id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);

CREATE INDEX tickets_asset_id_idx ON public.tickets USING btree (asset_id);

CREATE INDEX tickets_asset_id_resolved_at_idx ON public.tickets USING btree (asset_id, resolved_at);

CREATE INDEX tickets_assigned_team_id_idx ON public.tickets USING btree (assigned_team_id);

CREATE INDEX tickets_assigned_user_id_idx ON public.tickets USING btree (assigned_user_id);

CREATE INDEX tickets_description_trgm_idx ON public.tickets USING gin (description extensions.gin_trgm_ops);

CREATE INDEX tickets_queue_id_status_idx ON public.tickets USING btree (queue_id, status);

CREATE INDEX tickets_reporter_user_id_idx ON public.tickets USING btree (reporter_user_id);

CREATE INDEX tickets_status_created_at_idx ON public.tickets USING btree (status, created_at DESC);

CREATE INDEX tickets_title_trgm_idx ON public.tickets USING gin (title extensions.gin_trgm_ops);

ALTER TABLE ONLY public.public_report_rate_limits
    ADD CONSTRAINT public_report_rate_limits_pkey PRIMARY KEY (bucket_key, window_start);

ALTER TABLE ONLY public.ticket_queues
    ADD CONSTRAINT ticket_queues_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ticket_queues
    ADD CONSTRAINT ticket_queues_default_team_id_fkey FOREIGN KEY (default_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ticket_queues
    ADD CONSTRAINT ticket_queues_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.ticket_queues(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_queue_teams
    ADD CONSTRAINT ticket_queue_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ticket_queue_teams
    ADD CONSTRAINT ticket_queue_teams_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.ticket_queues(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES public.ticket_queues(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_type_fkey FOREIGN KEY (queue_id, type) REFERENCES public.ticket_types(queue_id, key) ON UPDATE CASCADE;

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.ticket_queue_ids_for(p_user_id uuid) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(q.id), '{}')
  from public.ticket_queues q
  where not exists (select 1 from public.ticket_queue_teams t where t.queue_id = q.id)
     or exists (
       select 1 from public.ticket_queue_teams t
       join public.user_teams ug on ug.team_id = t.team_id and ug.user_id = p_user_id
       where t.queue_id = q.id
     );
$$;


ALTER FUNCTION public.ticket_queue_ids_for(p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ticket_queue_ids_for(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ticket_queue_ids_for(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ticket_queue_ids_for(p_user_id uuid) TO service_role;

CREATE FUNCTION public.rls_ticket_queue_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.ticket_queue_ids_for(auth.uid()); $$;


ALTER FUNCTION public.rls_ticket_queue_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_ticket_queue_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_ticket_queue_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_ticket_queue_ids() TO service_role;
GRANT ALL ON FUNCTION public.rls_ticket_queue_ids() TO authenticated;

CREATE FUNCTION public.rls_ticket_open_queue_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select coalesce(array_agg(id), '{}') from public.ticket_queues where open_to_everyone; $$;


ALTER FUNCTION public.rls_ticket_open_queue_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_ticket_open_queue_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_ticket_open_queue_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_ticket_open_queue_ids() TO service_role;
GRANT ALL ON FUNCTION public.rls_ticket_open_queue_ids() TO authenticated;

CREATE FUNCTION public.my_ticket_queue_ids() RETURNS uuid[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ select public.rls_ticket_queue_ids(); $$;


ALTER FUNCTION public.my_ticket_queue_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_ticket_queue_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_ticket_queue_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_ticket_queue_ids() TO service_role;
GRANT ALL ON FUNCTION public.my_ticket_queue_ids() TO authenticated;

CREATE FUNCTION public.rls_ticket_allows(p_user_id uuid, p_action text, p_queue_id uuid, p_asset_id uuid, p_assigned_user_id uuid, p_reporter_user_id uuid, p_team_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_ids uuid[], p_queue_ids uuid[], p_open_queue_ids uuid[]) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with r (working, by_relation) as (
    select coalesce(p_queue_id = any(p_queue_ids), false),
           coalesce((('tickets.' || p_action || '.reported') = any(p_permissions)
              and (p_action = 'create' or p_user_id = p_reporter_user_id))
           or (('tickets.' || p_action || '.assigned') = any(p_permissions) and p_user_id = p_assigned_user_id)
           or (('tickets.' || p_action || '.team') = any(p_permissions) and coalesce(p_team_id = any(p_team_ids), false)), false)
  )
  select coalesce((r.working and (('tickets.' || p_action || '.all') = any(p_permissions)
                         or coalesce(p_asset_id = any(p_asset_ids), false)))
      or (r.by_relation and (r.working or p_action not in ('edit', 'delete')))
      or (coalesce(p_queue_id = any(p_open_queue_ids), false)
          and (p_action = 'create' or (p_action in ('view', 'check') and p_user_id = p_reporter_user_id))), false)
  from r;
$$;


ALTER FUNCTION public.rls_ticket_allows(p_user_id uuid, p_action text, p_queue_id uuid, p_asset_id uuid, p_assigned_user_id uuid, p_reporter_user_id uuid, p_team_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_ids uuid[], p_queue_ids uuid[], p_open_queue_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.rls_ticket_allows(p_user_id uuid, p_action text, p_queue_id uuid, p_asset_id uuid, p_assigned_user_id uuid, p_reporter_user_id uuid, p_team_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_ids uuid[], p_queue_ids uuid[], p_open_queue_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_ticket_allows(p_user_id uuid, p_action text, p_queue_id uuid, p_asset_id uuid, p_assigned_user_id uuid, p_reporter_user_id uuid, p_team_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_ids uuid[], p_queue_ids uuid[], p_open_queue_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_ticket_allows(p_user_id uuid, p_action text, p_queue_id uuid, p_asset_id uuid, p_assigned_user_id uuid, p_reporter_user_id uuid, p_team_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_ids uuid[], p_queue_ids uuid[], p_open_queue_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.rls_ticket_allows(p_user_id uuid, p_action text, p_queue_id uuid, p_asset_id uuid, p_assigned_user_id uuid, p_reporter_user_id uuid, p_team_id uuid, p_permissions text[], p_team_ids uuid[], p_asset_ids uuid[], p_queue_ids uuid[], p_open_queue_ids uuid[]) TO authenticated;

CREATE FUNCTION public.user_has_ticket_access(p_user_id uuid, p_ticket_id uuid, p_grant_type text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ticket public.tickets;
  v_asset_ids uuid[] := '{}';
begin
  select * into v_ticket from public.tickets where id = p_ticket_id;
  if v_ticket.id is null or p_user_id is null then
    return false;
  end if;
  if v_ticket.asset_id is not null
     and ('tickets.' || p_grant_type || '.assigned_assets') = any(public.user_permissions(p_user_id))
     and exists (
       select 1
       from public.assets a
       join public.assets root on a.path operator(public.<@) root.path
       where a.id = v_ticket.asset_id
         and root.team_id in (select team_id from public.user_teams where user_id = p_user_id)
     ) then
    v_asset_ids := array[v_ticket.asset_id];
  end if;
  return public.rls_ticket_allows(
    p_user_id, p_grant_type, v_ticket.queue_id, v_ticket.asset_id, v_ticket.assigned_user_id, v_ticket.reporter_user_id,
    v_ticket.assigned_team_id, public.user_permissions(p_user_id),
    coalesce((select array_agg(team_id) from public.user_teams where user_id = p_user_id), '{}'),
    v_asset_ids, public.ticket_queue_ids_for(p_user_id),
    (select coalesce(array_agg(id), '{}') from public.ticket_queues where open_to_everyone));
end;
$$;


ALTER FUNCTION public.user_has_ticket_access(p_user_id uuid, p_ticket_id uuid, p_grant_type text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_has_ticket_access(p_user_id uuid, p_ticket_id uuid, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_has_ticket_access(p_user_id uuid, p_ticket_id uuid, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_has_ticket_access(p_user_id uuid, p_ticket_id uuid, p_grant_type text) TO service_role;

CREATE FUNCTION public.tickets_enforce_origin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is not null then
    new.source := 'internal';
    new.reporter_user_id := auth.uid();
    new.reporter_name := null;
    new.reporter_contact := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tickets_enforce_origin() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tickets_enforce_origin() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tickets_enforce_origin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tickets_enforce_origin() TO authenticated;
GRANT ALL ON FUNCTION public.tickets_enforce_origin() TO service_role;

CREATE FUNCTION public.tickets_log_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_responsible uuid;
begin
  if tg_op = 'INSERT' then
    perform public.log_system_event('tickets', new.id, 'ticket_created',
      jsonb_strip_nulls(jsonb_build_object(
        'source', new.source, 'type', new.type, 'priority', new.priority,
        'reporter_name', new.reporter_name)),
      new.reporter_user_id);
    if new.asset_id is not null then
      select responsible_user_id into v_responsible from public.assets where id = new.asset_id;
      if v_responsible is not null and v_responsible is distinct from new.reporter_user_id then
        perform public.notify(
          array[v_responsible], 'ticket_created', 'New ticket #' || new.ticket_number || ' ' || new.title,
          '/tickets/' || new.id, null, new.reporter_user_id, 'tickets', new.id, null,
          array['in_app', 'toast'],
          jsonb_build_object('number', new.ticket_number, 'title', new.title));
      end if;
    end if;
    -- High and urgent tickets also go to the people who work the queue: members of its teams who may edit this ticket.
    -- Not the reporter, not the asset's responsible user (told above). Later priority changes stay silent on purpose:
    -- somebody did that by hand and can mention the team.
    if new.priority in ('high', 'urgent') and new.queue_id is not null then
      perform public.notify(
        array(
          select distinct ug.user_id
          from public.ticket_queue_teams qt
          join public.user_teams ug on ug.team_id = qt.team_id
          join public.users u on u.id = ug.user_id and u.has_login and u.locked_at is null and not u.has_left
          where qt.queue_id = new.queue_id
            and ug.user_id is distinct from new.reporter_user_id
            and ug.user_id is distinct from v_responsible
            and public.user_has_ticket_access(ug.user_id, new.id, 'edit')),
        'ticket_created', 'New ticket #' || new.ticket_number || ' ' || new.title,
        '/tickets/' || new.id, null, new.reporter_user_id, 'tickets', new.id, null,
        array['in_app', 'toast'],
        jsonb_build_object('number', new.ticket_number, 'title', new.title));
    end if;
    return null;
  end if;

  -- 'converted_to_task' is announced by ticket_convert_to_task() with the task reference.
  if new.status is distinct from old.status and new.status <> 'converted_to_task' then
    perform public.log_system_event('tickets', new.id, 'ticket_status_changed',
      jsonb_build_object('old', old.status, 'new', new.status));
  end if;
  if new.assigned_user_id is distinct from old.assigned_user_id
     or new.assigned_team_id is distinct from old.assigned_team_id then
    perform public.log_system_event('tickets', new.id, 'ticket_assigned',
      jsonb_build_object(
        'old_user_id', old.assigned_user_id, 'new_user_id', new.assigned_user_id,
        'old_team_id', old.assigned_team_id, 'new_team_id', new.assigned_team_id));
    if new.assigned_user_id is not null and new.assigned_user_id is distinct from old.assigned_user_id
       and new.assigned_user_id is distinct from auth.uid() then
      perform public.notify(
        array[new.assigned_user_id], 'ticket_assigned', 'Ticket #' || new.ticket_number || ' ' || new.title,
        '/tickets/' || new.id, null, auth.uid(), 'tickets', new.id, 'ticket-assigned:' || new.id,
        array['in_app', 'toast'],
        jsonb_build_object('number', new.ticket_number, 'title', new.title));
    end if;
  end if;
  if new.priority is distinct from old.priority then
    perform public.log_system_event('tickets', new.id, 'ticket_priority_changed',
      jsonb_build_object('old', old.priority, 'new', new.priority));
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.tickets_log_events() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tickets_log_events() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tickets_log_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tickets_log_events() TO authenticated;
GRANT ALL ON FUNCTION public.tickets_log_events() TO service_role;

CREATE FUNCTION public.tickets_set_queue() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_queue public.ticket_queues;
begin
  if tg_op = 'INSERT' and (new.source = 'qr_public' or new.queue_id is null) then
    new.queue_id := (select id from public.ticket_queues where key = 'maintenance');
  end if;
  select * into v_queue from public.ticket_queues where id = new.queue_id;
  if tg_op = 'INSERT' and not v_queue.active then
    raise exception 'ticket queue % is not active', v_queue.key using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.assigned_team_id is null and new.assigned_user_id is null then
    new.assigned_team_id := v_queue.default_team_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tickets_set_queue() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tickets_set_queue() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tickets_set_queue() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tickets_set_queue() TO service_role;

CREATE FUNCTION public.tickets_set_resolved_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status in ('resolved', 'closed') then
    if old.status not in ('resolved', 'closed') then
      new.resolved_at := now();
    end if;
  else
    new.resolved_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tickets_set_resolved_at() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tickets_set_resolved_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tickets_set_resolved_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tickets_set_resolved_at() TO service_role;

CREATE FUNCTION public.ticket_convert_to_task(p_ticket_id uuid, p_task_type_id uuid, p_due_date date, p_title text DEFAULT NULL::text, p_team_id uuid DEFAULT NULL::uuid, p_assigned_user_id uuid DEFAULT NULL::uuid, p_planned_date date DEFAULT NULL::date) RETURNS public.tasks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_ticket public.tickets;
  v_task public.tasks;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if p_due_date is null then
    raise exception 'A due date is required';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if v_ticket.id is null then
    raise exception 'Ticket not found';
  end if;
  if not (
    (public.user_has_access(v_uid, 'tickets', p_ticket_id, 'edit')
        and public.user_has_grant(v_uid, 'tasks', 'create', v_ticket.asset_id, p_assigned_user_id, p_team_id, v_uid))
  ) then
    raise exception 'You are not allowed to create a task from this ticket';
  end if;
  if exists (select 1 from public.tasks where ticket_id = p_ticket_id) then
    raise exception 'This ticket already has a task';
  end if;

  insert into public.tasks (task_type_id, title, description, priority, asset_id, ticket_id,
                            team_id, assigned_user_id, planned_date, due_date)
  values (p_task_type_id, coalesce(nullif(btrim(p_title), ''), v_ticket.title), v_ticket.description,
          v_ticket.priority, v_ticket.asset_id, p_ticket_id, p_team_id, p_assigned_user_id, p_planned_date,
          p_due_date)
  returning * into v_task;

  update public.tickets set status = 'converted_to_task' where id = p_ticket_id;
  perform public.log_system_event('tickets', p_ticket_id, 'ticket_converted_to_task',
    jsonb_build_object('task_id', v_task.id, 'task_number', v_task.task_number), v_uid);
  return v_task;
end;
$$;


ALTER FUNCTION public.ticket_convert_to_task(p_ticket_id uuid, p_task_type_id uuid, p_due_date date, p_title text, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ticket_convert_to_task(p_ticket_id uuid, p_task_type_id uuid, p_due_date date, p_title text, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ticket_convert_to_task(p_ticket_id uuid, p_task_type_id uuid, p_due_date date, p_title text, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ticket_convert_to_task(p_ticket_id uuid, p_task_type_id uuid, p_due_date date, p_title text, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date) TO service_role;
GRANT ALL ON FUNCTION public.ticket_convert_to_task(p_ticket_id uuid, p_task_type_id uuid, p_due_date date, p_title text, p_team_id uuid, p_assigned_user_id uuid, p_planned_date date) TO authenticated;

CREATE FUNCTION public.ticket_flow(p_from date, p_to date, p_asset_id uuid DEFAULT NULL::uuid, p_bucket text DEFAULT 'month'::text) RETURNS TABLE(period date, opened bigint, resolved bigint, avg_hours_to_resolve numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with scope as (
    select k.created_at, k.resolved_at
    from public.tickets k
    where p_bucket in ('month', 'quarter', 'year')
      and (p_asset_id is null or k.asset_id in (
            select a.id from public.assets a
            where a.path operator(public.<@) (select r.path from public.assets r where r.id = p_asset_id)))
  ),
  o as (
    select date_trunc(p_bucket, s.created_at at time zone 'Europe/Berlin')::date as period, count(*) as n
    from scope s
    where (s.created_at at time zone 'Europe/Berlin')::date between p_from and p_to
    group by 1
  ),
  r as (
    select date_trunc(p_bucket, s.resolved_at at time zone 'Europe/Berlin')::date as period, count(*) as n,
           avg(extract(epoch from (s.resolved_at - s.created_at)) / 3600) as hours
    from scope s
    where s.resolved_at is not null and (s.resolved_at at time zone 'Europe/Berlin')::date between p_from and p_to
    group by 1
  )
  select coalesce(o.period, r.period), coalesce(o.n, 0), coalesce(r.n, 0), round(r.hours, 1)
  from o full join r on r.period = o.period
  order by 1;
$$;


ALTER FUNCTION public.ticket_flow(p_from date, p_to date, p_asset_id uuid, p_bucket text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ticket_flow(p_from date, p_to date, p_asset_id uuid, p_bucket text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ticket_flow(p_from date, p_to date, p_asset_id uuid, p_bucket text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ticket_flow(p_from date, p_to date, p_asset_id uuid, p_bucket text) TO authenticated;
GRANT ALL ON FUNCTION public.ticket_flow(p_from date, p_to date, p_asset_id uuid, p_bucket text) TO service_role;

CREATE FUNCTION public.workflow_hook_ticket_release(p_task public.tasks, p_event text, p_action_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_task.ticket_id is null then
    return;
  end if;
  perform set_config('app.task_engine', 'on', true);
  update public.tasks set ticket_id = null where id = p_task.id;
  update public.tickets set status = 'open' where id = p_task.ticket_id and status = 'converted_to_task';
  perform public.log_system_event('tickets', p_task.ticket_id, 'ticket_task_cancelled',
    jsonb_build_object('task_number', p_task.task_number, 'title', p_task.title), auth.uid());
end;
$$;


ALTER FUNCTION public.workflow_hook_ticket_release(p_task public.tasks, p_event text, p_action_key text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_hook_ticket_release(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_hook_ticket_release(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_hook_ticket_release(p_task public.tasks, p_event text, p_action_key text) TO service_role;

CREATE FUNCTION public.workflow_hook_ticket_resolve(p_task public.tasks, p_event text, p_action_key text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.tickets set status = 'resolved'
  where id = p_task.ticket_id and status in ('open', 'in_progress', 'converted_to_task');
$$;


ALTER FUNCTION public.workflow_hook_ticket_resolve(p_task public.tasks, p_event text, p_action_key text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_hook_ticket_resolve(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_hook_ticket_resolve(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_hook_ticket_resolve(p_task public.tasks, p_event text, p_action_key text) TO service_role;

CREATE FUNCTION public.messages_c_reporter_answered() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ticket uuid;
begin
  select anchor_id into v_ticket from public.conversations where id = new.conversation_id and kind = 'record' and anchor_type = 'tickets';
  if v_ticket is not null then
    update public.tickets set status = 'in_progress'
    where id = v_ticket and status = 'waiting_for_requester' and reporter_user_id = new.author_user_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.messages_c_reporter_answered() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.messages_c_reporter_answered() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_c_reporter_answered() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_c_reporter_answered() TO service_role;

CREATE FUNCTION public.public_report_rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max_requests integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.public_report_rate_limits as r (bucket_key, window_start, request_count)
  values (p_bucket_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set request_count = r.request_count + 1
  returning request_count into v_count;

  delete from public.public_report_rate_limits where window_start < now() - interval '2 days';
  return v_count <= p_max_requests;
end;
$$;


ALTER FUNCTION public.public_report_rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max_requests integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.public_report_rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max_requests integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.public_report_rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max_requests integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.public_report_rate_limit_hit(p_bucket_key text, p_window_seconds integer, p_max_requests integer) TO service_role;

CREATE FUNCTION public.checklist_item_create_ticket(p_item_id uuid, p_title text DEFAULT NULL::text, p_priority text DEFAULT 'normal'::text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_item public.task_checklist_items;
  v_task public.tasks;
  v_ticket_id uuid;
begin
  select * into v_item from public.task_checklist_items where id = p_item_id;
  if v_item.id is null then
    raise exception 'Checklist item not found';
  end if;
  -- "is not true": result and the limits can be null, and "if not null" would not raise.
  if (v_item.result = 'defect'
      or (v_item.kind = 'number' and (v_item.value_number < v_item.min_value or v_item.value_number > v_item.max_value))) is not true then
    raise exception 'Only a defect can be turned into a ticket';
  end if;
  if v_item.ticket_id is not null then
    raise exception 'A ticket exists already for this defect';
  end if;
  select * into v_task from public.tasks where id = v_item.task_id;

  insert into public.tickets (asset_id, type, priority, title, description)
  values (
    v_task.asset_id, 'inspection_finding', p_priority,
    left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), v_item.label), 200),
    concat_ws(E'\n\n',
      nullif(btrim(coalesce(v_item.note, '')), ''),
      case when v_item.kind = 'number' then 'Measured value: ' || v_item.value_number
             || coalesce(' ' || v_item.unit, '')
             || ' (limits ' || coalesce(v_item.min_value::text, '–') || ' to ' || coalesce(v_item.max_value::text, '–') || ')' end,
      'Checklist item "' || v_item.label || '" · task #' || v_task.task_number || ' ' || v_task.title)
  )
  returning id into v_ticket_id;

  perform set_config('app.checklist_ticket', 'on', true);
  update public.task_checklist_items set ticket_id = v_ticket_id where id = p_item_id;
  perform set_config('app.checklist_ticket', 'off', true);
  return v_ticket_id;
end;
$$;


ALTER FUNCTION public.checklist_item_create_ticket(p_item_id uuid, p_title text, p_priority text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_item_create_ticket(p_item_id uuid, p_title text, p_priority text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_item_create_ticket(p_item_id uuid, p_title text, p_priority text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_item_create_ticket(p_item_id uuid, p_title text, p_priority text) TO authenticated;
GRANT ALL ON FUNCTION public.checklist_item_create_ticket(p_item_id uuid, p_title text, p_priority text) TO service_role;

CREATE FUNCTION public.task_checklist_items_ticket_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ticket public.tickets;
begin
  select * into v_ticket from public.tickets where id = new.ticket_id;
  perform public.log_system_event('tasks', new.task_id, 'checklist_ticket_created',
    jsonb_build_object('item', new.label, 'ticket_id', v_ticket.id, 'ticket_number', v_ticket.ticket_number));
  return null;
end;
$$;


ALTER FUNCTION public.task_checklist_items_ticket_log() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_checklist_items_ticket_log() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_checklist_items_ticket_log() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_checklist_items_ticket_log() TO authenticated;
GRANT ALL ON FUNCTION public.task_checklist_items_ticket_log() TO service_role;

CREATE FUNCTION public.asset_work_overview(p_asset_id uuid) RETURNS TABLE(open_tasks bigint, overdue_tasks bigint, tickets_open bigint, tickets_in_progress bigint, tickets_converted bigint, tickets_resolved bigint, tickets_closed bigint, avg_open_ticket_age_days numeric, oldest_open_ticket_age_days integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with scope as (
    select a.id from public.assets a
    where a.path operator(public.<@) (select r.path from public.assets r where r.id = p_asset_id)
  ),
  t as (
    select count(*) filter (where status not in ('done', 'cancelled')) as open_tasks,
           count(*) filter (where status not in ('done', 'cancelled') and due_date < current_date) as overdue_tasks
    from public.tasks where asset_id in (select id from scope)
  ),
  k as (
    select count(*) filter (where status = 'open') as tickets_open,
           count(*) filter (where status = 'in_progress') as tickets_in_progress,
           count(*) filter (where status = 'converted_to_task') as tickets_converted,
           count(*) filter (where status = 'resolved') as tickets_resolved,
           count(*) filter (where status = 'closed') as tickets_closed,
           round(avg(extract(epoch from (now() - created_at)) / 86400) filter (where status in ('open', 'in_progress', 'converted_to_task')), 1) as avg_age,
           max(extract(epoch from (now() - created_at)) / 86400) filter (where status in ('open', 'in_progress', 'converted_to_task'))::integer as oldest
    from public.tickets where asset_id in (select id from scope)
  )
  select t.open_tasks, t.overdue_tasks, k.tickets_open, k.tickets_in_progress, k.tickets_converted,
         k.tickets_resolved, k.tickets_closed, k.avg_age, k.oldest
  from t, k;
$$;


ALTER FUNCTION public.asset_work_overview(p_asset_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_work_overview(p_asset_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_work_overview(p_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_work_overview(p_asset_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.asset_work_overview(p_asset_id uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dashboard_counts(p_days integer DEFAULT 7) RETURNS TABLE(open_tasks integer, overdue_tasks integer, blocked_tasks integer, due_soon_mine integer, done_recent integer, team_pool integer, open_tickets integer, status_counts jsonb, team_counts jsonb, mine_open integer, mine_overdue integer, pool_overdue integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with t as (
    -- The open prerequisites are looked up once (a hashed subplan), not once per task.
    select k.status, k.due_date, k.completed_at, k.assigned_user_id, k.team_id,
           k.status not in ('done', 'cancelled')
             and k.id in (select c.parent_task_id from public.tasks c where c.blocks_parent and c.status not in ('done', 'cancelled')) as blocked
    from public.tasks k
    -- (The explicit timestamptz cast keeps the comparison leakproof: Postgres then filters by it before the row policy.)
    where not k.is_initiative
      and (k.status not in ('done', 'cancelled') or (k.status = 'done' and k.completed_at >= (current_date - (p_days - 1))::timestamptz))
  ),
  open_rows as (
    select t.status, t.team_id from t where t.status not in ('done', 'cancelled')
  ),
  my_teams as (
    select ug.team_id from public.user_teams ug where ug.user_id = (select auth.uid())
  )
  select
    (count(*) filter (where t.status not in ('done', 'cancelled')))::integer,
    (count(*) filter (where t.status not in ('done', 'cancelled') and t.due_date < current_date))::integer,
    (count(*) filter (where t.blocked))::integer,
    (count(*) filter (where t.status not in ('done', 'cancelled') and t.assigned_user_id = (select auth.uid())
                        and t.due_date >= current_date and t.due_date <= current_date + p_days))::integer,
    (count(*) filter (where t.status = 'done'))::integer,
    (count(*) filter (where t.status not in ('done', 'cancelled') and t.assigned_user_id is null
                        and t.team_id in (select g.team_id from my_teams g)))::integer,
    (select count(*)::integer from public.tickets x where x.status in ('open', 'in_progress')),
    (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (select o.status, count(*)::integer as n from open_rows o group by o.status) s),
    (select coalesce(jsonb_object_agg(s.team_id, s.n), '{}'::jsonb) from (select o.team_id, count(*)::integer as n from open_rows o where o.team_id is not null group by o.team_id) s),
    (count(*) filter (where t.status not in ('done', 'cancelled') and t.assigned_user_id = (select auth.uid())))::integer,
    (count(*) filter (where t.status not in ('done', 'cancelled') and t.assigned_user_id = (select auth.uid())
                        and t.due_date < current_date))::integer,
    (count(*) filter (where t.status not in ('done', 'cancelled') and t.assigned_user_id is null
                        and t.team_id in (select g.team_id from my_teams g) and t.due_date < current_date))::integer
  from t;
$$;


ALTER FUNCTION public.dashboard_counts(p_days integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dashboard_counts(p_days integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dashboard_counts(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dashboard_counts(p_days integer) TO service_role;
GRANT ALL ON FUNCTION public.dashboard_counts(p_days integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_trends(p_weeks integer DEFAULT 12) RETURNS TABLE(metric text, day date, value integer)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_days date[];
  v_cuts double precision[];
  v_dcuts double precision[];
  v_ext double precision[];
  v_n integer;
begin
  p_weeks := least(greatest(coalesce(p_weeks, 12), 2), 52);
  v_days := array(select d::date from generate_series(current_date - 7 * (p_weeks - 1), current_date, interval '7 days') d order by 1);
  v_n := array_length(v_days, 1);
  -- End of each point day (start of the next one); the day itself for due dates; one more window before the first point.
  v_cuts := array(select extract(epoch from (x.d + 1)::timestamptz) from unnest(v_days) with ordinality x (d, i) order by x.i);
  v_dcuts := array(select extract(epoch from x.d::timestamptz) from unnest(v_days) with ordinality x (d, i) order by x.i);
  v_ext := array_prepend(extract(epoch from (v_days[1] - 6)::timestamptz), v_cuts);

  return query
  with cells as (
    select width_bucket(extract(epoch from k.created_at), v_cuts) as bc,
           case when k.completed_at is null then null::integer else width_bucket(extract(epoch from k.completed_at), v_ext) end as bf,
           case when k.original_due_date is null then null::integer else width_bucket(extract(epoch from k.original_due_date::timestamptz), v_dcuts) end as bd,
           (k.status = 'done') as is_done,
           count(*)::integer as n
    from public.tasks k
    -- Tasks finished before the first point were never open in the window.
    where not k.is_initiative and (k.completed_at is null or k.completed_at >= to_timestamp(v_ext[1]))
    group by 1, 2, 3, 4
  )
  select m.metric, v_days[g], coalesce(sum(c.n) filter (where
           case m.metric
             -- bf counts the extra window, so "finished before the end of day k" is bf <= k.
             when 'done' then c.is_done and c.bf = g
             when 'open_tasks' then c.bc < g and (c.bf is null or c.bf > g)
             else c.bc < g and (c.bf is null or c.bf > g) and c.bd < g
           end), 0)::integer
  from (values ('open_tasks'), ('overdue_tasks'), ('done')) m (metric)
  cross join generate_series(1, v_n) g
  left join cells c on true
  group by m.metric, g;

  return query
  with cells as (
    select width_bucket(extract(epoch from k.created_at), v_cuts) as bc,
           case when k.resolved_at is null then null::integer else width_bucket(extract(epoch from k.resolved_at), v_cuts) end as bf,
           count(*)::integer as n
    from public.tickets k
    where k.resolved_at is null or k.resolved_at >= to_timestamp(v_ext[1])
    group by 1, 2
  )
  select 'open_tickets'::text, v_days[g], coalesce(sum(c.n) filter (where c.bc < g and (c.bf is null or c.bf >= g)), 0)::integer
  from generate_series(1, v_n) g
  left join cells c on true
  group by g;
end;
$$;


ALTER FUNCTION public.dashboard_trends(p_weeks integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dashboard_trends(p_weeks integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dashboard_trends(p_weeks integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dashboard_trends(p_weeks integer) TO service_role;
GRANT ALL ON FUNCTION public.dashboard_trends(p_weeks integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.task_reopen(p_task_id uuid, p_comment text DEFAULT NULL::text) RETURNS public.tasks
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
  if v_type.purpose is not null then
    raise exception 'A task with the special function "%" cannot be reopened', v_type.purpose;
  end if;
  if v_task.ticket_id is not null then
    raise exception 'This task belongs to a ticket and cannot be reopened';
  end if;
  if v_task.recurring_task_rule_id is not null then
    raise exception 'A task of a series cannot be reopened, the next one has been created';
  end if;

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
         coalesce(not a.open and a.can_edit and a.purpose is null and a.ticket_id is null and a.recurring_task_rule_id is null, false)
  from a;
$$;


ALTER FUNCTION public.task_rights(p_task_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.tasks_guard() RETURNS trigger
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
    or new.ticket_id is distinct from old.ticket_id
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

CREATE OR REPLACE FUNCTION public.tasks_log_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.log_system_event('tasks', new.id, 'task_created',
      jsonb_strip_nulls(jsonb_build_object(
        'task_type_id', new.task_type_id, 'step_key', new.current_step_key, 'anchor_type', new.anchor_type, 'anchor_id', new.anchor_id, 'ticket_id', new.ticket_id,
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

CREATE OR REPLACE FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) RETURNS TABLE(kind text, ref_id uuid, label text, label_de text, access_level text, sources text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_module text;
  v_task public.tasks;
  v_ticket public.tickets;
  v_asset_id uuid;
  v_queue_id uuid;
  v_queue_has_teams boolean := false;
begin
  if v_me is null or p_entity_type not in ('tasks', 'tickets', 'assets') then
    return;
  end if;
  if not public.user_has_access(v_me, p_entity_type, p_entity_id, 'view') then
    return;
  end if;

  if p_entity_type = 'tasks' then
    select * into v_task from public.tasks where id = p_entity_id;
    v_module := v_task.permission_module;
    v_asset_id := v_task.asset_id;
  elsif p_entity_type = 'tickets' then
    select * into v_ticket from public.tickets where id = p_entity_id;
    v_module := 'tickets';
    v_asset_id := v_ticket.asset_id;
    v_queue_id := v_ticket.queue_id;
    v_queue_has_teams := exists (select 1 from public.ticket_queue_teams where queue_id = v_queue_id);
  else
    v_module := 'assets';
    v_asset_id := p_entity_id;
  end if;

  return query
  with cand_team (team_id, source) as (
    select t, 'assigned' from unnest(case p_entity_type
      when 'tasks' then array[v_task.team_id, v_task.current_assignee_team_id]
      when 'tickets' then array[v_ticket.assigned_team_id]
      else array[]::uuid[] end) t
    where t is not null
    union all
    select root.team_id, 'asset'
    from public.assets a
    join public.assets root on a.path operator(public.<@) root.path
    where a.id = v_asset_id and root.team_id is not null
    union all
    select q.team_id, 'queue' from public.ticket_queue_teams q where q.queue_id = v_queue_id
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
      (v_task.assigned_user_id, 'assignee'), (v_task.current_assignee_user_id, 'handler'), (v_task.created_by_user_id, 'creator'),
      (v_ticket.assigned_user_id, 'assignee'), (v_ticket.reporter_user_id, 'reporter'), (v_ticket.created_by_user_id, 'creator')
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

CREATE OR REPLACE FUNCTION public.task_checklist_items_before() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if not public.task_can_edit_checklist(new.task_id) then
      raise exception 'You may not change the checklist of this task';
    end if;
    new.ticket_id := null;
  elsif tg_op = 'UPDATE' then
    if (new.kind, new.label, new.hint, new.required, new.unit, new.min_value, new.max_value, new.sort_order, new.task_id, new.from_template, new.from_step, new.step_key)
       is distinct from (old.kind, old.label, old.hint, old.required, old.unit, old.min_value, old.max_value, old.sort_order, old.task_id, old.from_template, old.from_step, old.step_key)
       and not public.task_can_edit_checklist(new.task_id) then
      raise exception 'You may not change the checklist of this task';
    end if;
    if new.ticket_id is distinct from old.ticket_id
       and coalesce(current_setting('app.checklist_ticket', true), '') <> 'on' then
      new.ticket_id := old.ticket_id;
    end if;
    if (new.done, new.result, new.value_number, new.value_text) is distinct from (old.done, old.result, old.value_number, old.value_text) then
      new.answered_by_user_id := auth.uid();
      new.answered_at := case when public.checklist_item_answered(new.kind, new.done, new.result, new.value_number, new.value_text) then now() end;
    end if;
  elsif tg_op = 'DELETE' then
    -- A cascade from deleting the whole task is not guarded here.
    if pg_trigger_depth() <= 1 and not public.task_can_edit_checklist(old.task_id) then
      raise exception 'You may not change the checklist of this task';
    end if;
    return old;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.task_checklist_items_before() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_checklist_items_before() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_checklist_items_before() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_checklist_items_before() TO authenticated;
GRANT ALL ON FUNCTION public.task_checklist_items_before() TO service_role;

ALTER TABLE public.ticket_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ticket queues" ON public.ticket_queues TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read ticket queues" ON public.ticket_queues FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.ticket_queues AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_ticket_queues_name_de BEFORE INSERT OR UPDATE ON public.ticket_queues FOR EACH ROW EXECUTE FUNCTION public.master_data_default_name_de();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ticket_queues FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ticket types" ON public.ticket_types TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read ticket types" ON public.ticket_types FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.ticket_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_ticket_types_name_de BEFORE INSERT OR UPDATE ON public.ticket_types FOR EACH ROW EXECUTE FUNCTION public.master_data_default_name_de();

ALTER TABLE public.ticket_queue_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ticket queue teams" ON public.ticket_queue_teams TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read ticket queue teams" ON public.ticket_queue_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.ticket_queue_teams AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create tickets per grant" ON public.tickets FOR INSERT TO authenticated WITH CHECK (((COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false) AND (( SELECT ('tickets.create.all'::text = ANY (public.rls_my_permissions()))) OR COALESCE((asset_id IN ( SELECT x.x
   FROM unnest(( SELECT public.rls_scope_asset_ids('tickets.create.assigned_assets'::text) AS rls_scope_asset_ids)) x(x))), false))) OR (COALESCE(((( SELECT ('tickets.create.reported'::text = ANY (public.rls_my_permissions()))) AND true) OR (( SELECT ('tickets.create.assigned'::text = ANY (public.rls_my_permissions()))) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.create.team'::text = ANY (public.rls_my_permissions()))) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))), false) AND true) OR (COALESCE((queue_id = ANY (( SELECT public.rls_ticket_open_queue_ids() AS rls_ticket_open_queue_ids)::uuid[])), false) AND true)));

CREATE POLICY "Delete tickets per grant" ON public.tickets FOR DELETE TO authenticated USING (((COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false) AND (( SELECT ('tickets.delete.all'::text = ANY (public.rls_my_permissions()))) OR COALESCE((asset_id IN ( SELECT x.x
   FROM unnest(( SELECT public.rls_scope_asset_ids('tickets.delete.assigned_assets'::text) AS rls_scope_asset_ids)) x(x))), false))) OR (COALESCE(((( SELECT ('tickets.delete.reported'::text = ANY (public.rls_my_permissions()))) AND (reporter_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.delete.assigned'::text = ANY (public.rls_my_permissions()))) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.delete.team'::text = ANY (public.rls_my_permissions()))) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))), false) AND COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false)) OR (COALESCE((queue_id = ANY (( SELECT public.rls_ticket_open_queue_ids() AS rls_ticket_open_queue_ids)::uuid[])), false) AND false)));

CREATE POLICY "Edit tickets per grant" ON public.tickets FOR UPDATE TO authenticated USING (((COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false) AND (( SELECT ('tickets.edit.all'::text = ANY (public.rls_my_permissions()))) OR COALESCE((asset_id IN ( SELECT x.x
   FROM unnest(( SELECT public.rls_scope_asset_ids('tickets.edit.assigned_assets'::text) AS rls_scope_asset_ids)) x(x))), false))) OR (COALESCE(((( SELECT ('tickets.edit.reported'::text = ANY (public.rls_my_permissions()))) AND (reporter_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.edit.assigned'::text = ANY (public.rls_my_permissions()))) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.edit.team'::text = ANY (public.rls_my_permissions()))) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))), false) AND COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false)) OR (COALESCE((queue_id = ANY (( SELECT public.rls_ticket_open_queue_ids() AS rls_ticket_open_queue_ids)::uuid[])), false) AND false))) WITH CHECK (((COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false) AND (( SELECT ('tickets.edit.all'::text = ANY (public.rls_my_permissions()))) OR COALESCE((asset_id IN ( SELECT x.x
   FROM unnest(( SELECT public.rls_scope_asset_ids('tickets.edit.assigned_assets'::text) AS rls_scope_asset_ids)) x(x))), false))) OR (COALESCE(((( SELECT ('tickets.edit.reported'::text = ANY (public.rls_my_permissions()))) AND (reporter_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.edit.assigned'::text = ANY (public.rls_my_permissions()))) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.edit.team'::text = ANY (public.rls_my_permissions()))) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))), false) AND COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false)) OR (COALESCE((queue_id = ANY (( SELECT public.rls_ticket_open_queue_ids() AS rls_ticket_open_queue_ids)::uuid[])), false) AND false)));

CREATE POLICY "View tickets per grant" ON public.tickets FOR SELECT TO authenticated USING (((COALESCE((queue_id = ANY (( SELECT public.rls_ticket_queue_ids() AS rls_ticket_queue_ids)::uuid[])), false) AND (( SELECT ('tickets.view.all'::text = ANY (public.rls_my_permissions()))) OR COALESCE((asset_id IN ( SELECT x.x
   FROM unnest(( SELECT public.rls_scope_asset_ids('tickets.view.assigned_assets'::text) AS rls_scope_asset_ids)) x(x))), false))) OR (COALESCE(((( SELECT ('tickets.view.reported'::text = ANY (public.rls_my_permissions()))) AND (reporter_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.view.assigned'::text = ANY (public.rls_my_permissions()))) AND (assigned_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT ('tickets.view.team'::text = ANY (public.rls_my_permissions()))) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))), false) AND true) OR (COALESCE((queue_id = ANY (( SELECT public.rls_ticket_open_queue_ids() AS rls_ticket_open_queue_ids)::uuid[])), false) AND COALESCE((reporter_user_id = ( SELECT auth.uid() AS uid)), false))));

CREATE POLICY mfa_required ON public.tickets AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a00_tickets_creator_guard BEFORE INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.records_creator_guard();

CREATE TRIGGER cleanup_feed AFTER DELETE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.cleanup_entity_feed('tickets');

CREATE TRIGGER conversations_follow_team AFTER UPDATE OF assigned_team_id ON public.tickets FOR EACH ROW WHEN ((old.assigned_team_id IS DISTINCT FROM new.assigned_team_id)) EXECUTE FUNCTION public.conversations_follow_team();

CREATE TRIGGER conversations_join_assignee AFTER UPDATE OF assigned_user_id ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.conversations_join_assignee();

CREATE TRIGGER conversations_leave_assignee AFTER UPDATE OF assigned_user_id ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.conversations_leave_assignee();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER tickets_enforce_origin BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_enforce_origin();

CREATE TRIGGER tickets_log_events AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_log_events();

CREATE TRIGGER tickets_set_queue BEFORE INSERT OR UPDATE OF queue_id ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_set_queue();

CREATE TRIGGER tickets_set_resolved_at BEFORE UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.tickets_set_resolved_at();

ALTER TABLE public.public_report_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.public_report_rate_limits AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.tickets_overview WITH (security_invoker='on') AS
 SELECT k.id,
    k.ticket_number,
    k.asset_id,
    k.type,
    k.status,
    k.priority,
    k.title,
    k.description,
    k.source,
    k.reporter_user_id,
    k.reporter_name,
    k.reporter_contact,
    k.client_request_id,
    k.assigned_team_id,
    k.assigned_user_id,
    k.created_at,
    k.updated_at,
    k.created_by_user_id,
    k.updated_by_user_id,
    k.resolved_at,
    k.queue_id,
    q.key AS queue_key,
    q.name AS queue_name,
    tt.name AS type_name,
    a.name AS asset_name,
    COALESCE(ru.name, ru.email, k.reporter_name) AS reporter_display_name,
    au.name AS assigned_user_name,
    g.name AS assigned_team_name,
    tk.id AS task_id,
    tk.task_number,
    q.name_de AS queue_name_de,
    tt.name_de AS type_name_de
   FROM (((((((public.tickets k
     JOIN public.ticket_queues q ON ((q.id = k.queue_id)))
     LEFT JOIN public.ticket_types tt ON (((tt.queue_id = k.queue_id) AND (tt.key = k.type))))
     LEFT JOIN public.assets a ON ((a.id = k.asset_id)))
     LEFT JOIN public.users ru ON ((ru.id = k.reporter_user_id)))
     LEFT JOIN public.users au ON ((au.id = k.assigned_user_id)))
     LEFT JOIN public.teams g ON ((g.id = k.assigned_team_id)))
     LEFT JOIN public.tasks tk ON ((tk.ticket_id = k.id)));


ALTER VIEW public.tickets_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.tickets_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tickets_overview TO authenticated;
GRANT ALL ON TABLE public.tickets_overview TO service_role;

CREATE OR REPLACE VIEW public.tasks_overview WITH (security_invoker='true') AS
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
    t.ticket_id,
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
     LEFT JOIN public.tickets k ON ((k.id = t.ticket_id)))
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
                    c.ticket_id,
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

CREATE OR REPLACE VIEW public.assets_overview WITH (security_invoker='on') AS
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
    ( SELECT count(*) AS count
           FROM public.tickets k
          WHERE ((k.asset_id = a.id) AND (k.status = ANY (ARRAY['open'::text, 'in_progress'::text])))) AS open_ticket_count,
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

CREATE UNIQUE INDEX tasks_ticket_unique ON public.tasks USING btree (ticket_id) WHERE (ticket_id IS NOT NULL);

CREATE INDEX task_checklist_items_ticket_id_idx ON public.task_checklist_items USING btree (ticket_id) WHERE (ticket_id IS NOT NULL);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_checklist_items
    ADD CONSTRAINT task_checklist_items_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE TRIGGER task_checklist_items_ticket_log AFTER UPDATE OF ticket_id ON public.task_checklist_items FOR EACH ROW WHEN (((new.ticket_id IS NOT NULL) AND (old.ticket_id IS DISTINCT FROM new.ticket_id))) EXECUTE FUNCTION public.task_checklist_items_ticket_log();

CREATE TRIGGER messages_c_reporter_answered AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_c_reporter_answered();

-- Hand-written part of the tickets module (after the objects copied from COMPASS).

-- Workflow hooks (COMPASS migration 20261104100000_hooks_for_items_and_tickets.sql, live rows).
insert into public.workflow_hooks (key, events, sort_order) values
  ('ticket_resolve', array['done'], 30),
  ('ticket_release', array['cancelled'], 31);

-- The maintenance queue and its types (COMPASS migration 20261011100000_ticket_queues.sql, live rows): tickets_set_queue()
-- files every public QR report and every ticket without a queue there. Further queues are data (seed / Admin).
insert into public.ticket_queues (key, name, name_de, description, sort_order, open_to_everyone) values
  ('maintenance', 'Maintenance', 'Instandhaltung', 'Defects and requests about machines and buildings', 1, false);
insert into public.ticket_types (queue_id, key, name, name_de, sort_order)
select q.id, t.key, t.name, t.name_de, t.sort_order
from public.ticket_queues q,
     (values ('incident', 'Incident', 'Störung', 1), ('request', 'Request', 'Anfrage', 2),
             ('inspection_finding', 'Inspection finding', 'Prüfmangel', 3)) t (key, name, name_de, sort_order)
where q.key = 'maintenance';

-- Permissions: COMPASS's registry rows of tickets (scopes reported, assigned, team, assigned_assets, all; create has no
-- 'assigned' scope) and their implications.
insert into public.permissions (key, module, action, scope, sort_order)
select 'tickets.' || a.a || '.' || s.s, 'tickets', a.a, s.s, 220 + a.o * 10 + s.o
from (values ('view', 1), ('check', 2), ('edit', 3), ('create', 4), ('delete', 5)) a (a, o),
     (values ('reported', 1), ('assigned', 2), ('team', 3), ('assigned_assets', 4), ('all', 5)) s (s, o)
where not (a.a = 'create' and s.s = 'assigned');
insert into public.permission_implies (permission, implies)
select 'tickets.' || a || '.' || s, 'tickets.' || i || '.' || s
from (values ('check', 'view'), ('edit', 'check'), ('edit', 'view'), ('create', 'view'), ('delete', 'view')) x (a, i),
     (values ('reported'), ('assigned'), ('team'), ('assigned_assets'), ('all')) ss (s)
where not (a = 'create' and s = 'assigned');

-- Tickets as a record type (COMPASS user_has_access / record_moderator / conversation_label / conversation_team /
-- conversation_get_or_create, branch 'tickets'): access through user_has_ticket_access (queue teams in force), notes
-- moderated by holders of tickets.edit.all who may edit the ticket, the reporter and the assignee follow it.
create function public.tickets_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'tickets.edit.all' = any (public.user_permissions(p_user_id))
      and public.user_has_ticket_access(p_user_id, p_entity_id, 'edit');
  end if;
  return public.user_has_ticket_access(p_user_id, p_entity_id, p_action);
end $$;
create function public.tickets_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$
  select '#' || k.ticket_number || ' ' || k.title from public.tickets k where k.id = p_entity_id; $$;
create function public.tickets_team(p_entity_id uuid) returns uuid
  language sql stable security definer set search_path to '' as $$ select k.assigned_team_id from public.tickets k where k.id = p_entity_id; $$;
create function public.tickets_followers(p_entity_id uuid) returns uuid[]
  language sql stable security definer set search_path to '' as $$
  select array_remove(array[k.reporter_user_id, k.assigned_user_id], null) from public.tickets k where k.id = p_entity_id; $$;
revoke all on function public.tickets_access(uuid, uuid, text), public.tickets_label(uuid), public.tickets_team(uuid),
  public.tickets_followers(uuid) from public, anon;
grant execute on function public.tickets_access(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.tickets_label(uuid), public.tickets_team(uuid), public.tickets_followers(uuid) to service_role;
select public.entity_type_register('tickets', 'tickets', 'tickets_access', null, 'A ticket', 'tickets_label', 'tickets_team', 'tickets_followers');

-- Search: tickets (COMPASS search_work_items, block 'tickets'; access per hit, the asset's name as the subtitle).
create function public.tickets_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language plpgsql stable security definer set search_path to '' as $$
declare
  v_user uuid := auth.uid();
  v_pattern text := '%' || p_term || '%';
  v_n integer := 0;
  r record;
begin
  if v_user is null then
    return;
  end if;
  for r in
    select k.id, k.ticket_number::bigint as number, k.title, k.status, k.asset_id, k.created_at,
      (greatest(public.search_field_score(k.title, p_term), public.search_field_score(k.description, p_term) * 0.7)
        + case when k.ticket_number = p_number then 2 else 0 end)::real as score
    from public.tickets k
    where k.ticket_number = p_number
       or k.title ilike v_pattern or (p_fuzzy and p_term operator(extensions.<%) k.title)
       or k.description ilike v_pattern
    order by score desc limit 200
  loop
    exit when v_n >= 8;
    -- Only a clear yes counts (null = no).
    continue when not coalesce(public.user_has_access(v_user, 'tickets', r.id, 'view'), false);
    v_n := v_n + 1;
    return next row('tickets', r.id, r.score, r.number, r.title, (select a.name from public.assets a where a.id = r.asset_id),
                    r.status, null, null, null, null, r.created_at, null)::public.search_hit;
  end loop;
end $$;
revoke all on function public.tickets_search(text, boolean, bigint) from public, anon;
grant execute on function public.tickets_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('tickets', 'tickets', 'tickets_search', 'Tickets by number, title and description');

-- Notifications (COMPASS push_notification_types / email_notification_types: ticket_assigned is mailed in the digest).
select public.notification_type_register('ticket_created', 'tickets', false, 'A new ticket for an asset you are responsible for, or an urgent one in your queue', true, false);
select public.notification_type_register('ticket_assigned', 'tickets', false, 'A ticket was assigned to you', true, true);

