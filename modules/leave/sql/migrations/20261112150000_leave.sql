-- Leave (module leave): COMPASS absences (absence types, leave requests routed as tasks of the purpose "leave"),
-- public holidays per site region, the leave planner and its rules. Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the leave module, before the objects copied from COMPASS.

-- Exclusion constraints on (uuid, date range) need btree_gist (COMPASS has it in the extensions schema).
create extension if not exists btree_gist with schema extensions;


CREATE TABLE public.site_regions (
    site text NOT NULL,
    region text NOT NULL,
    CONSTRAINT site_regions_region_check CHECK ((region ~ '^DE-[A-Z]{2}$'::text)),
    CONSTRAINT site_regions_site_check CHECK (((length(site) >= 1) AND (length(site) <= 100)))
);


ALTER TABLE public.site_regions OWNER TO postgres;

REVOKE ALL ON TABLE public.site_regions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.site_regions TO authenticated;
GRANT ALL ON TABLE public.site_regions TO service_role;

CREATE TABLE public.public_holidays (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    holiday_date date NOT NULL,
    name text NOT NULL,
    site text,
    source text DEFAULT 'manual'::text NOT NULL,
    CONSTRAINT public_holidays_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100))),
    CONSTRAINT public_holidays_site_check CHECK (((site IS NULL) OR (length(site) <= 100))),
    CONSTRAINT public_holidays_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'import'::text])))
);


ALTER TABLE public.public_holidays OWNER TO postgres;

REVOKE ALL ON TABLE public.public_holidays FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.public_holidays TO authenticated;
GRANT ALL ON TABLE public.public_holidays TO service_role;

CREATE TABLE public.absence_types (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    name_de text NOT NULL,
    description text,
    icon text,
    color text,
    task_type_id uuid NOT NULL,
    counts_as_leave boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT absence_types_color_check CHECK ((color = ANY (ARRAY['gray'::text, 'navy'::text, 'blue'::text, 'sky'::text, 'teal'::text, 'green'::text, 'amber'::text, 'orange'::text, 'red'::text, 'pink'::text, 'violet'::text]))),
    CONSTRAINT absence_types_description_check CHECK (((description IS NULL) OR (length(description) <= 500))),
    CONSTRAINT absence_types_icon_check CHECK ((icon ~ '^[a-z0-9-]{1,40}$'::text)),
    CONSTRAINT absence_types_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100)))
);


ALTER TABLE public.absence_types OWNER TO postgres;

REVOKE ALL ON TABLE public.absence_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.absence_types TO authenticated;
GRANT ALL ON TABLE public.absence_types TO service_role;

CREATE TABLE public.leave_requests (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    start_half boolean DEFAULT false NOT NULL,
    end_half boolean DEFAULT false NOT NULL,
    working_days numeric(5,1) DEFAULT 0 NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    decided_by_user_id uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    entered_by_user_id uuid,
    absence_type_id uuid NOT NULL,
    CONSTRAINT leave_requests_check CHECK ((to_date >= from_date)),
    CONSTRAINT leave_requests_check1 CHECK (((to_date - from_date) < 366)),
    CONSTRAINT leave_requests_check2 CHECK ((NOT ((from_date = to_date) AND start_half AND end_half))),
    CONSTRAINT leave_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
);


ALTER TABLE public.leave_requests OWNER TO postgres;

REVOKE ALL ON TABLE public.leave_requests FROM anon, authenticated, service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.leave_requests TO authenticated;
GRANT ALL ON TABLE public.leave_requests TO service_role;

ALTER TABLE ONLY public.site_regions
    ADD CONSTRAINT site_regions_pkey PRIMARY KEY (site);

ALTER TABLE ONLY public.public_holidays
    ADD CONSTRAINT public_holidays_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX public_holidays_holiday_date_coalesce_idx ON public.public_holidays USING btree (holiday_date, COALESCE(site, ''::text));

ALTER TABLE ONLY public.absence_types
    ADD CONSTRAINT absence_types_pkey PRIMARY KEY (id);

CREATE INDEX absence_types_task_type_id_idx ON public.absence_types USING btree (task_type_id);

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_task_id_key UNIQUE (task_id);

CREATE INDEX leave_requests_absence_type_id_idx ON public.leave_requests USING btree (absence_type_id);

CREATE INDEX leave_requests_from_date_to_date_idx ON public.leave_requests USING btree (from_date, to_date) WHERE (status = ANY (ARRAY['requested'::text, 'approved'::text]));

CREATE INDEX leave_requests_user_id_from_date_idx ON public.leave_requests USING btree (user_id, from_date);

ALTER TABLE ONLY public.absence_types
    ADD CONSTRAINT absence_types_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.absence_types
    ADD CONSTRAINT absence_types_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.absence_types
    ADD CONSTRAINT absence_types_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_absence_type_id_fkey FOREIGN KEY (absence_type_id) REFERENCES public.absence_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_entered_by_user_id_fkey FOREIGN KEY (entered_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

CREATE FUNCTION public.absence_types_route_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.task_types where id = new.task_type_id and purpose = 'leave') then
    raise exception 'The route of an absence type must be a task type with the purpose "leave"' using errcode = '23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.absence_types_route_check() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.absence_types_route_check() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.absence_types_route_check() FROM PUBLIC;
GRANT ALL ON FUNCTION public.absence_types_route_check() TO service_role;

CREATE FUNCTION public.holidays_replace_import(p_from date, p_to date, p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'p_rows must be an array of at most 2000 holidays';
  end if;
  delete from public.public_holidays where source = 'import' and holiday_date between p_from and p_to;
  insert into public.public_holidays (holiday_date, name, site, source)
  select (r ->> 'date')::date, left(btrim(r ->> 'name'), 100), nullif(btrim(r ->> 'site'), ''), 'import'
  from jsonb_array_elements(p_rows) r
  where (r ->> 'date')::date between p_from and p_to and nullif(btrim(r ->> 'name'), '') is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION public.holidays_replace_import(p_from date, p_to date, p_rows jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.holidays_replace_import(p_from date, p_to date, p_rows jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.holidays_replace_import(p_from date, p_to date, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.holidays_replace_import(p_from date, p_to date, p_rows jsonb) TO service_role;

CREATE FUNCTION public.leave_away_today() RETURNS TABLE(user_id uuid, name text, photo_url text, same_team boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id, u.name, u.photo_url,
         exists (select 1 from public.user_teams a join public.user_teams b on b.team_id = a.team_id
                 where a.user_id = auth.uid() and b.user_id = u.id)
  from public.users u
  where u.id in (select m.user_id
                 from public.leave_member_days(
                   array(select x from unnest(public.leave_visible_user_ids()) x where x <> auth.uid()), current_date, current_date) m)
  order by 4 desc, u.name
$$;


ALTER FUNCTION public.leave_away_today() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_away_today() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_away_today() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_away_today() TO service_role;
GRANT ALL ON FUNCTION public.leave_away_today() TO authenticated;

CREATE FUNCTION public.leave_can_enter_for(p_user_id uuid, p_absence_type_id uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_step_id uuid;
  v_approver uuid;
begin
  if v_uid is null or p_user_id is null or p_user_id = v_uid then
    return false;
  end if;
  if public.rls_has('leave.view.all') then
    return true;
  end if;
  for v_step_id in
    select distinct on (a.task_type_id) s.id
    from public.absence_types a
    join public.task_type_steps s on s.task_type_id = a.task_type_id
    where a.active and (p_absence_type_id is null or a.id = p_absence_type_id)
    order by a.task_type_id, s.step_order
  loop
    select assignee_user_id into v_approver from public.resolve_step_assignee(v_step_id, p_user_id);
    if v_approver is not null
       and (v_approver = v_uid or exists (select 1 from public.users u where u.id = v_approver and u.deputy_user_id = v_uid)) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;


ALTER FUNCTION public.leave_can_enter_for(p_user_id uuid, p_absence_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_can_enter_for(p_user_id uuid, p_absence_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_can_enter_for(p_user_id uuid, p_absence_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_can_enter_for(p_user_id uuid, p_absence_type_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.leave_can_enter_for(p_user_id uuid, p_absence_type_id uuid) TO authenticated;

CREATE FUNCTION public.leave_check_period(p_from date, p_to date, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false, p_user_id uuid DEFAULT NULL::uuid, p_exclude_request uuid DEFAULT NULL::uuid) RETURNS TABLE(team_id uuid, team_name text, day date, away numeric, team_size integer, allowed integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    return;
  end if;
  -- the person, the people above them and in their teams, HR, and whoever has to decide one of their requests
  if v_user <> auth.uid() and v_user <> all (public.leave_visible_user_ids())
     and not exists (select 1 from public.leave_pending_for_me() p where p.user_id = v_user) then
    raise exception 'You are not allowed to check this person';
  end if;
  return query select * from public.leave_rule_violations(v_user, p_from, p_to, coalesce(p_start_half, false), coalesce(p_end_half, false), p_exclude_request);
end;
$$;


ALTER FUNCTION public.leave_check_period(p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_user_id uuid, p_exclude_request uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_check_period(p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_user_id uuid, p_exclude_request uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_check_period(p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_user_id uuid, p_exclude_request uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_check_period(p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_user_id uuid, p_exclude_request uuid) TO service_role;
GRANT ALL ON FUNCTION public.leave_check_period(p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_user_id uuid, p_exclude_request uuid) TO authenticated;

CREATE FUNCTION public.leave_dashboard_counts() RETURNS TABLE(pending_decisions integer, away_today integer, violation_days integer, my_days_taken numeric, my_days_planned numeric, my_days_requested numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with bounds as (
    select make_date(extract(year from current_date)::int, 1, 1) as y_from,
           make_date(extract(year from current_date)::int, 12, 31) as y_to
  ),
  mine as (
    select l.*, u.site, b.y_from, b.y_to
    from public.leave_requests l
    join public.users u on u.id = l.user_id
    cross join bounds b
    where l.user_id = auth.uid() and l.status = 'approved'
      and exists (select 1 from public.absence_types a where a.id = l.absence_type_id and a.counts_as_leave)
      and l.from_date <= b.y_to and l.to_date >= b.y_from
  )
  select
    (select count(*)::int from public.leave_pending_for_me()),
    -- people I see in the planner (not me) who are away at least half a day today
    (select count(distinct m.user_id)::int
     from public.leave_member_days(array(select x from unnest(public.leave_visible_user_ids()) x where x <> auth.uid()), current_date, current_date) m),
    (select count(*)::int from public.leave_violations(180)),
    -- the part of each approved request between New Year and yesterday
    coalesce((select sum(public.leave_working_days(m.site, greatest(m.from_date, m.y_from), least(m.to_date, current_date - 1),
                m.start_half and m.from_date >= m.y_from, m.end_half and m.to_date <= current_date - 1))
              from mine m where greatest(m.from_date, m.y_from) <= least(m.to_date, current_date - 1)), 0),
    -- the part from today to the end of the year
    coalesce((select sum(public.leave_working_days(m.site, greatest(m.from_date, m.y_from, current_date), least(m.to_date, m.y_to),
                m.start_half and m.from_date >= greatest(m.y_from, current_date), m.end_half and m.to_date <= m.y_to))
              from mine m where greatest(m.from_date, m.y_from, current_date) <= least(m.to_date, m.y_to)), 0),
    coalesce((select sum(o.requested_days) from public.leave_year_overview o
              where o.user_id = auth.uid() and o.year = extract(year from current_date)::int and o.counts_as_leave), 0)
$$;


ALTER FUNCTION public.leave_dashboard_counts() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_dashboard_counts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_dashboard_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_dashboard_counts() TO service_role;
GRANT ALL ON FUNCTION public.leave_dashboard_counts() TO authenticated;

CREATE FUNCTION public.leave_enterable_types(p_user_id uuid) RETURNS TABLE(absence_type_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select a.id from public.absence_types a
  where a.active and public.leave_can_enter_for(p_user_id, a.id)
  order by a.sort_order, a.name
$$;


ALTER FUNCTION public.leave_enterable_types(p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_enterable_types(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_enterable_types(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_enterable_types(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.leave_enterable_types(p_user_id uuid) TO authenticated;

CREATE FUNCTION public.leave_enterable_users() RETURNS TABLE(user_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id from public.users u
  where not u.has_left and u.id = any (public.leave_visible_user_ids()) and public.leave_can_enter_for(u.id)
$$;


ALTER FUNCTION public.leave_enterable_users() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_enterable_users() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_enterable_users() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_enterable_users() TO service_role;
GRANT ALL ON FUNCTION public.leave_enterable_users() TO authenticated;

CREATE FUNCTION public.leave_member_days(p_user_ids uuid[], p_from date, p_to date, p_exclude uuid DEFAULT NULL::uuid) RETURNS TABLE(user_id uuid, day date, fraction numeric, status text, request_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select l.user_id, d.day, d.fraction, l.status, l.id
  from public.leave_requests l
  join public.users u on u.id = l.user_id
  cross join lateral public.leave_period_days(u.site, l.from_date, l.to_date, l.start_half, l.end_half) d
  where l.user_id = any (p_user_ids)
    and l.status in ('requested', 'approved')
    and l.from_date <= p_to and l.to_date >= p_from
    and d.day between p_from and p_to
    and (p_exclude is null or l.id <> p_exclude)
$$;


ALTER FUNCTION public.leave_member_days(p_user_ids uuid[], p_from date, p_to date, p_exclude uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_member_days(p_user_ids uuid[], p_from date, p_to date, p_exclude uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_member_days(p_user_ids uuid[], p_from date, p_to date, p_exclude uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_member_days(p_user_ids uuid[], p_from date, p_to date, p_exclude uuid) TO service_role;

CREATE FUNCTION public.leave_pending_for_me() RETURNS TABLE(id uuid, task_id uuid, user_id uuid, absence_type_id uuid, from_date date, to_date date, start_half boolean, end_half boolean, working_days numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select l.id, l.task_id, l.user_id, l.absence_type_id, l.from_date, l.to_date, l.start_half, l.end_half, l.working_days
  from public.leave_requests l
  join public.tasks t on t.id = l.task_id
  where l.status = 'requested'
    and t.status not in ('done', 'cancelled')
    and l.user_id <> auth.uid()
    and (t.current_assignee_user_id = auth.uid()
         or exists (select 1 from public.users u where u.id = t.current_assignee_user_id and u.deputy_user_id = auth.uid())
         or (t.current_assignee_user_id is null
             and public.step_holder(auth.uid(), t.current_assignee_role_id, t.current_assignee_team_id)))
  order by l.from_date
$$;


ALTER FUNCTION public.leave_pending_for_me() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_pending_for_me() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_pending_for_me() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_pending_for_me() TO service_role;
GRANT ALL ON FUNCTION public.leave_pending_for_me() TO authenticated;

CREATE FUNCTION public.leave_period_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) RETURNS TABLE(day date, fraction numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select g::date,
         (1 - case when g::date = p_from and p_start_half then 0.5 else 0 end
            - case when g::date = p_to and p_end_half then 0.5 else 0 end)::numeric
  from generate_series(p_from, p_to, interval '1 day') g
  where extract(isodow from g) < 6
    and not exists (select 1 from public.public_holidays h where h.holiday_date = g::date and (h.site is null or h.site = p_site))
$$;


ALTER FUNCTION public.leave_period_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_period_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_period_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_period_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) TO service_role;

CREATE FUNCTION public.leave_planner_days(p_user_ids uuid[], p_from date, p_to date) RETURNS TABLE(user_id uuid, day date, fraction numeric, status text, request_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_to - p_from > 1100 then
    raise exception 'The planner window is limited to 1100 days';
  end if;
  return query
  select m.user_id, m.day, m.fraction, m.status, m.request_id
  from public.leave_member_days(
    array(select x from unnest(p_user_ids) x where x = any (public.leave_visible_user_ids())), p_from, p_to) m;
end;
$$;


ALTER FUNCTION public.leave_planner_days(p_user_ids uuid[], p_from date, p_to date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_planner_days(p_user_ids uuid[], p_from date, p_to date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_planner_days(p_user_ids uuid[], p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_planner_days(p_user_ids uuid[], p_from date, p_to date) TO service_role;
GRANT ALL ON FUNCTION public.leave_planner_days(p_user_ids uuid[], p_from date, p_to date) TO authenticated;

CREATE FUNCTION public.leave_planner_load(p_user_ids uuid[], p_from date, p_to date) RETURNS TABLE(day date, team_id uuid, team_name text, away numeric, team_size integer, allowed integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with s as (select (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_max_absent_pct') as pct, (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_min_allowed_absent') as mn),
  shown as (select x as id from unnest(p_user_ids) x where x = any (public.leave_visible_user_ids())),
  teams as (
    select g.id, g.name, array_agg(ug.user_id) as members, count(*)::int as size
    from public.teams g
    join public.user_teams ug on ug.team_id = g.id
    join public.users u on u.id = ug.user_id and not u.has_left
    where exists (select 1 from public.team_uses tu where tu.team_id = g.id and tu.use = 'leave') and g.id = any (public.leave_planner_team_ids())
    group by g.id, g.name
    having count(*) >= 2 and bool_or(ug.user_id in (select id from shown))
  ),
  daily as (
    select t.id as team_id, t.name as team_name, m.day, sum(m.fraction) as away, t.size,
           greatest(floor(t.size * s.pct / 100.0)::int, s.mn) as allowed
    from teams t
    cross join s
    cross join lateral public.leave_member_days(t.members, p_from, least(p_to, p_from + 1100)) m
    group by t.id, t.name, m.day, t.size, s.pct, s.mn
  )
  select distinct on (d.day) d.day, d.team_id, d.team_name, d.away, d.size, d.allowed
  from daily d
  order by d.day, d.away / greatest(d.allowed, 1) desc, d.away desc
$$;


ALTER FUNCTION public.leave_planner_load(p_user_ids uuid[], p_from date, p_to date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_planner_load(p_user_ids uuid[], p_from date, p_to date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_planner_load(p_user_ids uuid[], p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_planner_load(p_user_ids uuid[], p_from date, p_to date) TO service_role;
GRANT ALL ON FUNCTION public.leave_planner_load(p_user_ids uuid[], p_from date, p_to date) TO authenticated;

CREATE FUNCTION public.leave_planner_people(p_scope text, p_team_id uuid DEFAULT NULL::uuid) RETURNS TABLE(user_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive below (id, depth) as (
    select id, 1 from public.users where supervisor_user_id = auth.uid()
    union
    select u.id, b.depth + 1 from public.users u join below b on u.supervisor_user_id = b.id where b.depth < 10
  )
  select u.id
  from public.users u
  where not u.has_left
    and u.id = any (public.leave_visible_user_ids())
    and (case p_scope
           when 'me' then u.id = auth.uid()
           when 'reports' then u.id = auth.uid() or u.id in (select id from below)
           when 'team' then p_team_id = any (public.leave_planner_team_ids())
                            and exists (select 1 from public.user_teams ug where ug.team_id = p_team_id and ug.user_id = u.id)
           else false end)
$$;


ALTER FUNCTION public.leave_planner_people(p_scope text, p_team_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_planner_people(p_scope text, p_team_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_planner_people(p_scope text, p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_planner_people(p_scope text, p_team_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.leave_planner_people(p_scope text, p_team_id uuid) TO authenticated;

CREATE FUNCTION public.leave_planner_team_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(g.id), '{}')
  from public.teams g
  where exists (select 1 from public.team_uses tu where tu.team_id = g.id and tu.use = 'leave')
    and exists (select 1 from public.user_teams ug where ug.team_id = g.id and ug.user_id = any (public.leave_visible_user_ids()))
$$;


ALTER FUNCTION public.leave_planner_team_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_planner_team_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_planner_team_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_planner_team_ids() TO service_role;

CREATE FUNCTION public.leave_planner_teams() RETURNS TABLE(id uuid, name text, member_count integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select g.id, g.name,
         (select count(*)::int from public.user_teams ug join public.users u on u.id = ug.user_id and not u.has_left where ug.team_id = g.id)
  from public.teams g
  where g.id = any (public.leave_planner_team_ids())
  order by g.name
$$;


ALTER FUNCTION public.leave_planner_teams() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_planner_teams() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_planner_teams() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_planner_teams() TO service_role;
GRANT ALL ON FUNCTION public.leave_planner_teams() TO authenticated;

CREATE FUNCTION public.leave_request_adjust(p_leave_request_id uuid, p_from_date date, p_to_date date, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false, p_title text DEFAULT NULL::text, p_comment text DEFAULT NULL::text) RETURNS public.leave_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_old public.leave_requests;
  v_new public.leave_requests;
  v_task public.tasks;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_old from public.leave_requests where id = p_leave_request_id for update;
  if v_old.id is null then
    raise exception 'Leave request not found';
  end if;
  select * into v_task from public.tasks where id = v_old.task_id for update;
  if v_old.status <> 'requested' then
    raise exception 'Only a waiting request can be changed';
  end if;
  if not (v_old.user_id = v_uid or public.task_step_actor(v_uid, v_task) or public.rls_has('leave.edit.all')) then
    raise exception 'You are not allowed to change this leave';
  end if;
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'The leave must end on or after the day it starts';
  end if;
  if exists (
    select 1 from public.leave_requests l
    where l.user_id = v_old.user_id and l.id <> v_old.id and l.status in ('requested', 'approved')
      and l.from_date <= p_to_date and l.to_date >= p_from_date
      and not (l.to_date = p_from_date and l.end_half and p_start_half and l.from_date < p_from_date)
      and not (l.from_date = p_to_date and l.start_half and p_end_half and l.to_date > p_to_date)
  ) then
    raise exception 'You already have leave in this period';
  end if;

  update public.leave_requests
  set from_date = p_from_date, to_date = p_to_date,
      start_half = coalesce(p_start_half, false), end_half = coalesce(p_end_half, false)
  where id = v_old.id
  returning * into v_new;
  update public.tasks
  set title = coalesce(nullif(btrim(p_title), ''), title), due_date = greatest(p_from_date, current_date)
  where id = v_task.id;

  perform public.log_system_event('tasks', v_task.id, 'leave_adjusted',
    jsonb_strip_nulls(jsonb_build_object(
      'from_date', v_old.from_date, 'to_date', v_old.to_date, 'start_half', v_old.start_half, 'end_half', v_old.end_half,
      'days', v_old.working_days,
      'new_from_date', v_new.from_date, 'new_to_date', v_new.to_date, 'new_start_half', v_new.start_half,
      'new_end_half', v_new.end_half, 'new_days', v_new.working_days, 'comment', v_comment)), v_uid);
  perform public.notify(
    array(select x from unnest(array[v_old.user_id, v_task.current_assignee_user_id]) x where x is distinct from v_uid),
    'leave_adjusted', '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
    null, v_uid, 'tasks', v_task.id, 'leave-adjusted:' || v_task.id,
    array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
  return v_new;
end;
$$;


ALTER FUNCTION public.leave_request_adjust(p_leave_request_id uuid, p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_title text, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_request_adjust(p_leave_request_id uuid, p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_title text, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_request_adjust(p_leave_request_id uuid, p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_title text, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_request_adjust(p_leave_request_id uuid, p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_title text, p_comment text) TO service_role;
GRANT ALL ON FUNCTION public.leave_request_adjust(p_leave_request_id uuid, p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_title text, p_comment text) TO authenticated;

CREATE FUNCTION public.leave_request_create(p_from_date date, p_to_date date, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false, p_absence_type_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_comment text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid) RETURNS public.leave_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_user uuid := coalesce(p_user_id, auth.uid());
  v_type public.absence_types;
  v_problems text[];
  v_first public.task_type_steps;
  v_approver uuid;
  v_decides boolean;
  v_action text;
  v_task public.tasks;
  v_row public.leave_requests;
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.rls_has('leave.create.created') then
    raise exception 'You are not allowed to apply for leave';
  end if;
  if p_from_date is null or p_to_date is null or p_to_date < p_from_date then
    raise exception 'The leave must end on or after the day it starts';
  end if;
  if exists (
    select 1 from public.leave_requests l
    where l.user_id = v_user and l.status in ('requested', 'approved')
      and l.from_date <= p_to_date and l.to_date >= p_from_date
      and not (l.to_date = p_from_date and l.end_half and p_start_half and l.from_date < p_from_date)
      and not (l.from_date = p_to_date and l.start_half and p_end_half and l.to_date > p_to_date)
  ) then
    raise exception 'There is already leave in this period';
  end if;

  select * into v_type from public.absence_types
  where active and (p_absence_type_id is null or id = p_absence_type_id)
  order by sort_order, name limit 1;
  if v_type.id is null then
    raise exception 'Unknown or inactive absence type';
  end if;
  if not exists (select 1 from public.task_types where id = v_type.task_type_id and active) then
    raise exception 'The route of the absence type is inactive';
  end if;
  v_problems := public.task_type_purpose_problems(v_type.task_type_id);
  if cardinality(v_problems) > 0 then
    raise exception 'The route of the absence type lacks the special function(s): %', array_to_string(v_problems, ', ');
  end if;
  select * into v_first from public.task_type_steps where task_type_id = v_type.task_type_id order by step_order limit 1;
  if v_first.id is null then
    raise exception 'The route of the absence type has no steps';
  end if;
  v_decides := exists (select 1 from public.task_type_steps where task_type_id = v_type.task_type_id and is_decision);
  select assignee_user_id into v_approver from public.resolve_step_assignee(v_first.id, v_user);

  if v_user <> v_uid and not public.leave_can_enter_for(v_user, v_type.id) then
    raise exception 'You may only enter leave for the people you approve leave for (or as HR)';
  end if;

  perform set_config('app.system_task', 'on', true);
  perform set_config('app.assignee_notified', 'on', true);
  insert into public.tasks (task_type_id, title, description, assigned_user_id, due_date, created_by_user_id)
  values (v_type.task_type_id,
          coalesce(nullif(btrim(p_title), ''), v_type.name || ' ' || p_from_date || ' - ' || p_to_date),
          nullif(btrim(coalesce(p_comment, '')), ''),
          coalesce(v_approver, v_user),
          greatest(p_from_date, current_date),
          v_user)
  returning * into v_task;
  perform set_config('app.system_task', 'off', true);
  perform set_config('app.assignee_notified', 'off', true);

  insert into public.leave_requests (task_id, user_id, absence_type_id, from_date, to_date, start_half, end_half,
                                     entered_by_user_id, status, decided_at)
  values (v_task.id, v_user, v_type.id, p_from_date, p_to_date, coalesce(p_start_half, false), coalesce(p_end_half, false),
          case when v_user <> v_uid then v_uid end,
          case when v_decides then 'requested' else 'approved' end,
          case when v_decides then null else now() end)
  returning * into v_row;

  -- Entered by somebody who may decide for the person: the first decision is theirs (hook leave_decide writes it).
  if v_user <> v_uid and v_first.is_decision then
    select a ->> 'key' into v_action from jsonb_array_elements(v_first.actions) a
    where public.route_action_kind(a) = 'positive' limit 1;
  end if;
  if v_action is not null then
    perform public.task_perform_action_as(v_task.id, v_action, null, v_uid);
    select * into v_row from public.leave_requests where id = v_row.id;
  else
    perform public.notify(
      array(select x from unnest(public.task_step_recipients(v_task.current_assignee_user_id, v_task.current_assignee_team_id, v_task.current_assignee_role_id)) x
            where x is distinct from v_uid),
      'task_assigned', '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
      null, v_uid, 'tasks', v_task.id, 'task-step:' || v_task.id,
      array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
  end if;
  return v_row;
end;
$$;


ALTER FUNCTION public.leave_request_create(p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_absence_type_id uuid, p_title text, p_comment text, p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_request_create(p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_absence_type_id uuid, p_title text, p_comment text, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_request_create(p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_absence_type_id uuid, p_title text, p_comment text, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_request_create(p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_absence_type_id uuid, p_title text, p_comment text, p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.leave_request_create(p_from_date date, p_to_date date, p_start_half boolean, p_end_half boolean, p_absence_type_id uuid, p_title text, p_comment text, p_user_id uuid) TO authenticated;

CREATE FUNCTION public.leave_request_withdraw(p_leave_request_id uuid, p_comment text DEFAULT NULL::text) RETURNS public.leave_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_row public.leave_requests;
  v_task public.tasks;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select * into v_row from public.leave_requests where id = p_leave_request_id for update;
  if v_row.id is null then
    raise exception 'Leave request not found';
  end if;
  if v_row.user_id <> v_uid and not public.rls_has('leave.edit.all') then
    raise exception 'You are not allowed to withdraw this leave';
  end if;
  select * into v_task from public.tasks where id = v_row.task_id for update;

  if v_task.status not in ('done', 'cancelled')
     and (v_row.status = 'requested' or (v_row.status = 'approved' and v_row.to_date >= current_date)) then
    perform public.task_cancel_as(v_task.id, v_comment, v_uid);
  elsif v_row.status = 'approved' and v_row.to_date >= current_date then
    update public.leave_requests set status = 'cancelled' where id = v_row.id;
    perform public.log_system_event('tasks', v_task.id, 'leave_withdrawn',
      jsonb_strip_nulls(jsonb_build_object('comment', v_comment)), v_uid);
    perform public.notify(
      array(select distinct u from unnest(array[v_row.decided_by_user_id, v_task.assigned_user_id]
                                          || array(select h.actor_user_id from public.task_step_history h where h.task_id = v_task.id)) u
            where u is not null and u is distinct from v_uid),
      'leave_withdrawn', '#' || v_task.task_number || ' ' || v_task.title, '/tasks/' || v_task.id,
      null, v_uid, 'tasks', v_task.id, 'leave-withdrawn:' || v_task.id,
      array['in_app', 'toast'], jsonb_build_object('number', v_task.task_number, 'title', v_task.title));
  else
    raise exception 'This leave can no longer be withdrawn';
  end if;

  select * into v_row from public.leave_requests where id = p_leave_request_id;
  return v_row;
end;
$$;


ALTER FUNCTION public.leave_request_withdraw(p_leave_request_id uuid, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_request_withdraw(p_leave_request_id uuid, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_request_withdraw(p_leave_request_id uuid, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_request_withdraw(p_leave_request_id uuid, p_comment text) TO service_role;
GRANT ALL ON FUNCTION public.leave_request_withdraw(p_leave_request_id uuid, p_comment text) TO authenticated;

CREATE FUNCTION public.leave_requests_set_days() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.working_days := public.leave_working_days(
    (select site from public.users where id = new.user_id), new.from_date, new.to_date, new.start_half, new.end_half);
  return new;
end;
$$;


ALTER FUNCTION public.leave_requests_set_days() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_requests_set_days() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_requests_set_days() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_requests_set_days() TO service_role;

CREATE FUNCTION public.leave_rule_violations(p_user_id uuid, p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_exclude uuid DEFAULT NULL::uuid) RETURNS TABLE(team_id uuid, team_name text, day date, away numeric, team_size integer, allowed integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with s as (select (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_max_absent_pct') as pct, (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_min_allowed_absent') as mn),
  me as (select site from public.users where id = p_user_id),
  teams as (
    select g.id, g.name,
           array(select ug2.user_id from public.user_teams ug2 where ug2.team_id = g.id and ug2.user_id <> p_user_id) as others,
           (select count(*)::int from public.user_teams ug3 join public.users u on u.id = ug3.user_id and not u.has_left
            where ug3.team_id = g.id) as size
    from public.teams g
    join public.user_teams ug on ug.team_id = g.id and ug.user_id = p_user_id
    where exists (select 1 from public.team_uses tu where tu.team_id = g.id and tu.use = 'leave')
  ),
  mine as (select d.day, d.fraction from me, public.leave_period_days(me.site, p_from, p_to, p_start_half, p_end_half) d)
  select t.id, t.name, mine.day,
         mine.fraction + coalesce((select sum(m.fraction) from public.leave_member_days(t.others, mine.day, mine.day, p_exclude) m), 0),
         t.size,
         greatest(floor(t.size * s.pct / 100.0)::int, s.mn)
  from teams t cross join mine cross join s
  where t.size >= 2
    and mine.fraction + coalesce((select sum(m.fraction) from public.leave_member_days(t.others, mine.day, mine.day, p_exclude) m), 0)
        > greatest(floor(t.size * s.pct / 100.0)::int, s.mn)
  order by mine.day, t.name
$$;


ALTER FUNCTION public.leave_rule_violations(p_user_id uuid, p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_exclude uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_rule_violations(p_user_id uuid, p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_exclude uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_rule_violations(p_user_id uuid, p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_exclude uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_rule_violations(p_user_id uuid, p_from date, p_to date, p_start_half boolean, p_end_half boolean, p_exclude uuid) TO service_role;

CREATE FUNCTION public.leave_team_load(p_team_id uuid, p_from date, p_to date) RETURNS TABLE(day date, away numeric, team_size integer, allowed integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_members uuid[];
  v_size integer;
  v_allowed integer;
begin
  if p_to - p_from > 1100 then
    raise exception 'The planner window is limited to 1100 days';
  end if;
  if p_team_id <> all (public.leave_planner_team_ids()) then
    return;
  end if;
  select coalesce(array_agg(ug.user_id), '{}') into v_members
  from public.user_teams ug join public.users u on u.id = ug.user_id and not u.has_left
  where ug.team_id = p_team_id;
  v_size := cardinality(v_members);
  select greatest(floor(v_size * s.pct / 100.0)::int, s.mn) into v_allowed
  from (select (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_max_absent_pct') as pct,
               (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_min_allowed_absent') as mn) s;
  return query
  select m.day, sum(m.fraction), v_size, v_allowed
  from public.leave_member_days(v_members, p_from, p_to) m
  group by m.day
  order by m.day;
end;
$$;


ALTER FUNCTION public.leave_team_load(p_team_id uuid, p_from date, p_to date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_team_load(p_team_id uuid, p_from date, p_to date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_team_load(p_team_id uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_team_load(p_team_id uuid, p_from date, p_to date) TO service_role;
GRANT ALL ON FUNCTION public.leave_team_load(p_team_id uuid, p_from date, p_to date) TO authenticated;

CREATE FUNCTION public.leave_violations(p_days integer DEFAULT 180) RETURNS TABLE(team_id uuid, team_name text, day date, away numeric, team_size integer, allowed integer, user_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive below (id, depth) as (
    select id, 1 from public.users where supervisor_user_id = auth.uid()
    union
    select u.id, b.depth + 1 from public.users u join below b on u.supervisor_user_id = b.id where b.depth < 10
  ),
  -- people two or more levels below the viewer; HR sees every team
  deep as (select coalesce(array_agg(id), '{}') as ids, public.rls_has('leave.view.all') as everyone from below where depth >= 2),
  s as (select (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_max_absent_pct') as pct, (select nullif(a.value, '')::integer from public.app_settings a where a.key = 'leave_min_allowed_absent') as mn),
  teams as (
    select g.id, g.name, array_agg(ug.user_id) as members, count(*)::int as size
    from public.teams g
    join public.user_teams ug on ug.team_id = g.id
    join public.users u on u.id = ug.user_id and not u.has_left
    where exists (select 1 from public.team_uses tu where tu.team_id = g.id and tu.use = 'leave')
    group by g.id, g.name
    having count(*) >= 2
  ),
  daily as (
    select t.id as team_id, t.name as team_name, m.day, sum(m.fraction) as away, t.size,
           greatest(floor(t.size * s.pct / 100.0)::int, s.mn) as allowed,
           array_agg(distinct m.user_id) as user_ids
    from teams t
    cross join s
    cross join deep
    cross join lateral public.leave_member_days(t.members, current_date, current_date + least(greatest(p_days, 1), 400)) m
    where deep.everyone or t.members && deep.ids
    group by t.id, t.name, m.day, t.size, s.pct, s.mn
  )
  select d.team_id, d.team_name, d.day, d.away, d.size, d.allowed, d.user_ids
  from daily d cross join deep
  where d.away > d.allowed
    and (deep.everyone or d.user_ids && deep.ids)
  order by d.day, d.team_name
$$;


ALTER FUNCTION public.leave_violations(p_days integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_violations(p_days integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_violations(p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_violations(p_days integer) TO service_role;
GRANT ALL ON FUNCTION public.leave_violations(p_days integer) TO authenticated;

CREATE FUNCTION public.leave_visible_user_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when public.rls_has('leave.view.all') then (select coalesce(array_agg(id), '{}') from public.users where not has_left)
    else (
      with recursive below (id, depth) as (
        select id, 1 from public.users where supervisor_user_id = auth.uid()
        union
        select u.id, b.depth + 1 from public.users u join below b on u.supervisor_user_id = b.id where b.depth < 10
      )
      select coalesce(array_agg(distinct s.x), '{}')
      from (
        select auth.uid() as x
        union select id from below
        union select ug2.user_id
              from public.user_teams ug1
              join public.teams g on g.id = ug1.team_id and exists (select 1 from public.team_uses tu where tu.team_id = g.id and tu.use = 'leave')
              join public.user_teams ug2 on ug2.team_id = ug1.team_id
              where ug1.user_id = auth.uid()
      ) s
      join public.users u on u.id = s.x and not u.has_left)
  end
$$;


ALTER FUNCTION public.leave_visible_user_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_visible_user_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_visible_user_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_visible_user_ids() TO service_role;

CREATE FUNCTION public.leave_working_days(p_site text, p_from date, p_to date, p_start_half boolean DEFAULT false, p_end_half boolean DEFAULT false) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with d as (
    select g::date as day
    from generate_series(p_from, p_to, interval '1 day') g
    where extract(isodow from g) < 6
      and not exists (select 1 from public.public_holidays h
                      where h.holiday_date = g::date and (h.site is null or h.site = p_site))
  )
  select (select count(*) from d)
       - case when p_start_half and exists (select 1 from d where day = p_from) then 0.5 else 0 end
       - case when p_end_half and exists (select 1 from d where day = p_to) then 0.5 else 0 end
$$;


ALTER FUNCTION public.leave_working_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.leave_working_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.leave_working_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_working_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) TO service_role;
GRANT ALL ON FUNCTION public.leave_working_days(p_site text, p_from date, p_to date, p_start_half boolean, p_end_half boolean) TO authenticated;

CREATE FUNCTION public.task_type_purpose_check_leave(p_task_type_id uuid) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(array_agg('leave_decide (action) @ ' || s.step_key order by s.step_order), '{}')
  from public.task_type_steps s
  join public.task_types tt on tt.id = s.task_type_id
  where s.task_type_id = p_task_type_id and s.is_decision
    and not s.hooks @> '[{"hook": "leave_decide", "event": "action"}]'
    and not tt.hooks @> '[{"hook": "leave_decide", "event": "action"}]';
$$;


ALTER FUNCTION public.task_type_purpose_check_leave(p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_purpose_check_leave(p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_purpose_check_leave(p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_purpose_check_leave(p_task_type_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.task_type_purpose_check_leave(p_task_type_id uuid) TO authenticated;

CREATE FUNCTION public.task_types_keep_absence_route() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if old.purpose = 'leave' and new.purpose is distinct from old.purpose
     and exists (select 1 from public.absence_types where task_type_id = new.id) then
    raise exception 'The task type "%" is the route of an absence type and keeps its purpose', new.key using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.task_types_keep_absence_route() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_types_keep_absence_route() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_types_keep_absence_route() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_types_keep_absence_route() TO service_role;

CREATE FUNCTION public.workflow_hook_leave_decide(p_task public.tasks, p_event text, p_action_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_kind text;
  v_status text;
  v_row public.leave_requests;
  v_days integer := 0;
  v_boss uuid;
begin
  -- `done` is the type-level safety net: whatever is still waiting when the task ends was not approved.
  select public.route_action_kind(a) into v_kind
  from public.task_type_steps s
  cross join lateral jsonb_array_elements(s.actions) a
  where s.task_type_id = p_task.task_type_id and s.step_key = public.workflow_current_step() and a ->> 'key' = p_action_key;

  v_status := case
    -- finished (from any step) without an approval on the way: not approved
    when p_event = 'done' then 'rejected'
    when v_kind = 'negative' and p_task.status = 'done' then 'rejected'
    when v_kind = 'positive' and (p_task.status = 'done'
         or not exists (select 1 from public.task_type_steps s
                        where s.task_type_id = p_task.task_type_id and s.step_key = p_task.current_step_key and s.is_decision))
      then 'approved'
  end;
  if v_status is null then
    return;
  end if;

  update public.leave_requests
  set status = v_status, decided_by_user_id = auth.uid(), decided_at = now()
  where task_id = p_task.id and status = 'requested'
  returning * into v_row;

  if v_row.id is not null and v_status = 'approved' then
    select count(distinct day) into v_days
    from public.leave_rule_violations(v_row.user_id, v_row.from_date, v_row.to_date, v_row.start_half, v_row.end_half, v_row.id);
    if v_days > 0 then
      -- One notification when an approval goes over the limit; the standing list is computed live (leave_violations).
      -- "Vorvorgesetzter": the supervisor of the requester's supervisor.
      v_boss := public.user_supervisor_at(v_row.user_id, 2);
      perform public.notify(
        array[v_boss], 'leave_rule_violation', '#' || p_task.task_number || ' ' || p_task.title, '/leave?tab=violations',
        null, auth.uid(), 'tasks', p_task.id, 'leave-violation:' || p_task.id,
        array['in_app', 'toast'], jsonb_build_object('number', p_task.task_number, 'title', p_task.title, 'days', v_days));
    end if;
  end if;
end;
$$;


ALTER FUNCTION public.workflow_hook_leave_decide(p_task public.tasks, p_event text, p_action_key text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_hook_leave_decide(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_hook_leave_decide(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_hook_leave_decide(p_task public.tasks, p_event text, p_action_key text) TO service_role;

CREATE FUNCTION public.workflow_hook_leave_withdraw(p_task public.tasks, p_event text, p_action_key text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.leave_requests set status = 'cancelled' where task_id = p_task.id;
$$;


ALTER FUNCTION public.workflow_hook_leave_withdraw(p_task public.tasks, p_event text, p_action_key text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_hook_leave_withdraw(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_hook_leave_withdraw(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_hook_leave_withdraw(p_task public.tasks, p_event text, p_action_key text) TO service_role;

ALTER TABLE public.site_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage site regions" ON public.site_regions TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read site regions" ON public.site_regions FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.site_regions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage public holidays" ON public.public_holidays TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read public holidays" ON public.public_holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.public_holidays AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.absence_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage absence types" ON public.absence_types TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read absence types" ON public.absence_types FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.absence_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_absence_types_name_de BEFORE INSERT OR UPDATE ON public.absence_types FOR EACH ROW EXECUTE FUNCTION public.master_data_default_name_de();

CREATE TRIGGER absence_types_route_check BEFORE INSERT OR UPDATE OF task_type_id ON public.absence_types FOR EACH ROW EXECUTE FUNCTION public.absence_types_route_check();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.absence_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read leave requests" ON public.leave_requests FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE (t.id = leave_requests.task_id))));

CREATE POLICY mfa_required ON public.leave_requests AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER leave_requests_set_days BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.leave_requests_set_days();

CREATE VIEW public.leave_year_overview WITH (security_invoker='true') AS
 SELECT l.user_id,
    y.year,
    l.absence_type_id,
    a.counts_as_leave,
    COALESCE(sum(d.days) FILTER (WHERE (l.status = 'approved'::text)), (0)::numeric) AS approved_days,
    COALESCE(sum(d.days) FILTER (WHERE (l.status = 'requested'::text)), (0)::numeric) AS requested_days
   FROM ((((public.leave_requests l
     JOIN public.users u ON ((u.id = l.user_id)))
     JOIN public.absence_types a ON ((a.id = l.absence_type_id)))
     CROSS JOIN LATERAL generate_series((EXTRACT(year FROM l.from_date))::integer, (EXTRACT(year FROM l.to_date))::integer) y(year))
     CROSS JOIN LATERAL ( SELECT public.leave_working_days(u.site, GREATEST(l.from_date, make_date(y.year, 1, 1)), LEAST(l.to_date, make_date(y.year, 12, 31)), (l.start_half AND (l.from_date >= make_date(y.year, 1, 1))), (l.end_half AND (l.to_date <= make_date(y.year, 12, 31)))) AS days) d)
  WHERE (l.status = ANY (ARRAY['requested'::text, 'approved'::text]))
  GROUP BY l.user_id, y.year, l.absence_type_id, a.counts_as_leave;


ALTER VIEW public.leave_year_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.leave_year_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.leave_year_overview TO authenticated;
GRANT ALL ON TABLE public.leave_year_overview TO service_role;

CREATE TRIGGER task_types_keep_absence_route BEFORE UPDATE OF purpose ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.task_types_keep_absence_route();

-- Hand-written part of the leave module (after the objects copied from COMPASS).

-- The purpose "leave" and its hooks (COMPASS migrations 20261102110000_leave.sql / 20261116110000_task_type_purpose.sql, live
-- rows). The task types of the purpose and the absence types are data (COMPASS seed / Admin).
insert into public.workflow_hooks (key, events, sort_order) values
  ('leave_decide', array['action', 'done'], 10),
  ('leave_withdraw', array['cancelled'], 11);
insert into public.task_type_purposes (key, description, required_hooks, multiple, system_created, check_function, permission_module) values
  ('leave', 'Absences: every absence type names one task type of this purpose as its route. Decision steps write the decision back to the absence (leave_decide on action); later steps, such as booking in the time recording system, are ordinary steps.',
   '[{"hook": "leave_withdraw", "event": "cancelled"}, {"hook": "leave_decide", "event": "done"}]', true, true,
   'task_type_purpose_check_leave', 'leave');

-- Teams in the leave planner (COMPASS groups.usable_for_leave; platform team use registry).
select public.team_use_register('leave', 'leave', 'Leave planner (absences of the team side by side, the team''s absence rules)');

-- Settings (COMPASS app_settings.leave_max_absent_pct / leave_min_allowed_absent; key/value on the platform).
select public.app_setting_register('leave_max_absent_pct', 'leave', 'integer', '20', true,
  'Share of a team (percent) that may be absent at the same time');
select public.app_setting_register('leave_min_allowed_absent', 'leave', 'integer', '1', true,
  'People of a team who may always be absent at the same time, however small the team');
insert into public.app_settings (key, value)
select r.key, coalesce(r.default_value, '') from public.app_setting_registry r where r.module = 'leave'
on conflict (key) do nothing;

-- Permissions (COMPASS registry rows: the task family module of the purpose's tasks) and their implications.
insert into public.permissions (key, module, action, scope, sort_order, task_family) values
  ('leave.view.created', 'leave', 'view', 'created', 800, true),
  ('leave.view.all', 'leave', 'view', 'all', 801, true),
  ('leave.check.created', 'leave', 'check', 'created', 802, true),
  ('leave.check.all', 'leave', 'check', 'all', 803, true),
  ('leave.create.created', 'leave', 'create', 'created', 804, true),
  ('leave.edit.all', 'leave', 'edit', 'all', 805, true);
insert into public.permission_implies (permission, implies) values
  ('leave.check.all', 'leave.view.all'), ('leave.edit.all', 'leave.view.all'), ('leave.edit.all', 'leave.check.all'),
  ('leave.check.created', 'leave.view.created'), ('leave.create.created', 'leave.view.created');

-- Notifications (COMPASS push_notification_types).
select public.notification_type_register('leave_withdrawn', 'leave', false, 'A leave request was withdrawn', true, false);
select public.notification_type_register('leave_adjusted', 'leave', false, 'A leave request was changed', true, false);
select public.notification_type_register('leave_rule_violation', 'leave', false, 'A leave request breaks a rule of the team', true, false);

