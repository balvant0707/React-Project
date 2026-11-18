-- Workflows (module workflows): COMPASS task type purposes ("special functions") and workflow hooks (a module's
-- function that runs when a task enters, leaves or finishes a step). Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the workflows module, before the objects copied from COMPASS.

-- The columns the tasks module cut, back as COMPASS has them: a task type's purpose ("special
-- function", FK added below with the purposes table) and the workflow hooks of a type and of its steps.
alter table public.task_types
  add column hooks jsonb default '[]'::jsonb not null,
  add column purpose text,
  add constraint task_types_hooks_check check ((jsonb_typeof(hooks) = 'array'::text));
alter table public.task_type_steps
  add column hooks jsonb default '[]'::jsonb not null,
  add constraint task_type_steps_hooks_check check ((jsonb_typeof(hooks) = 'array'::text));


CREATE TABLE public.task_type_purposes (
    key text NOT NULL,
    description text NOT NULL,
    required_hooks jsonb DEFAULT '[]'::jsonb NOT NULL,
    multiple boolean DEFAULT false NOT NULL,
    system_created boolean DEFAULT false NOT NULL,
    check_function text,
    permission_module text,
    CONSTRAINT task_type_purposes_check_function_check CHECK ((check_function ~ '^task_type_purpose_check_[a-z][a-z0-9_]*$'::text))
);


ALTER TABLE public.task_type_purposes OWNER TO postgres;

REVOKE ALL ON TABLE public.task_type_purposes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_type_purposes TO authenticated;
GRANT ALL ON TABLE public.task_type_purposes TO service_role;

CREATE TABLE public.workflow_hooks (
    key text NOT NULL,
    events text[] NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT workflow_hooks_events_check CHECK (((cardinality(events) > 0) AND (events <@ ARRAY['enter'::text, 'action'::text, 'leave'::text, 'done'::text, 'cancelled'::text]))),
    CONSTRAINT workflow_hooks_key_check CHECK ((key ~ '^[a-z][a-z0-9_]*$'::text))
);


ALTER TABLE public.workflow_hooks OWNER TO postgres;

REVOKE ALL ON TABLE public.workflow_hooks FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.workflow_hooks TO authenticated;
GRANT ALL ON TABLE public.workflow_hooks TO service_role;

ALTER TABLE ONLY public.task_type_purposes
    ADD CONSTRAINT task_type_purposes_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.workflow_hooks
    ADD CONSTRAINT workflow_hooks_pkey PRIMARY KEY (key);

CREATE FUNCTION public.workflow_current_step() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select nullif(current_setting('app.workflow_step_key', true), '')
$$;


ALTER FUNCTION public.workflow_current_step() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_current_step() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_current_step() FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_current_step() TO service_role;

CREATE FUNCTION public.workflow_run_step_hooks(p_task public.tasks, p_step_key text, p_event text, p_action_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_hook text;
  v_outer text := current_setting('app.workflow_step_key', true);
begin
  perform set_config('app.workflow_step_key', coalesce(p_step_key, ''), true);
  for v_hook in
    select h.hook
    from (
      select e.hook ->> 'hook' as hook, 1 as level, e.n
      from public.task_type_steps s
      cross join lateral jsonb_array_elements(s.hooks) with ordinality as e (hook, n)
      where s.task_type_id = p_task.task_type_id and s.step_key = p_step_key and e.hook ->> 'event' = p_event
      union all
      select e.hook ->> 'hook', 2, e.n
      from public.task_types tt
      cross join lateral jsonb_array_elements(tt.hooks) with ordinality as e (hook, n)
      where tt.id = p_task.task_type_id and e.hook ->> 'event' = p_event
    ) h
    order by h.level, h.n
  loop
    execute format('select public.%I($1, $2, $3)', 'workflow_hook_' || v_hook) using p_task, p_event, p_action_key;
  end loop;
  perform set_config('app.workflow_step_key', coalesce(v_outer, ''), true);
end;
$_$;


ALTER FUNCTION public.workflow_run_step_hooks(p_task public.tasks, p_step_key text, p_event text, p_action_key text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_run_step_hooks(p_task public.tasks, p_step_key text, p_event text, p_action_key text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_run_step_hooks(p_task public.tasks, p_step_key text, p_event text, p_action_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_run_step_hooks(p_task public.tasks, p_step_key text, p_event text, p_action_key text) TO service_role;

CREATE FUNCTION public.workflow_dispatch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.status not in ('done', 'cancelled') then
      perform public.workflow_run_step_hooks(new, new.current_step_key, 'enter', null);
    end if;
    return null;
  end if;

  if new.status in ('done', 'cancelled') and old.status not in ('done', 'cancelled') then
    select action_key into v_action from public.task_step_history
    where task_id = new.id and step_key = new.current_step_key and left_at is not null
    order by left_at desc limit 1;
    if new.status = 'done' then
      perform public.workflow_run_step_hooks(new, new.current_step_key, 'action', v_action);
      perform public.workflow_run_step_hooks(new, new.current_step_key, 'done', v_action);
    else
      perform public.workflow_run_step_hooks(new, new.current_step_key, 'cancelled', v_action);
    end if;
  elsif new.current_step_key is distinct from old.current_step_key and new.status not in ('done', 'cancelled') then
    select action_key into v_action from public.task_step_history
    where task_id = new.id and step_key = old.current_step_key and left_at is not null
    order by left_at desc limit 1;
    perform public.workflow_run_step_hooks(new, old.current_step_key, 'action', v_action);
    perform public.workflow_run_step_hooks(new, old.current_step_key, 'leave', v_action);
    perform public.workflow_run_step_hooks(new, new.current_step_key, 'enter', null);
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.workflow_dispatch() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_dispatch() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_dispatch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_dispatch() TO service_role;

CREATE FUNCTION public.task_types_check_hooks() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_entry jsonb;
begin
  for v_entry in select e from jsonb_array_elements(new.hooks) e loop
    if jsonb_typeof(v_entry) <> 'object'
       or not exists (select 1 from public.workflow_hooks h
                      where h.key = v_entry ->> 'hook' and (v_entry ->> 'event') = any (h.events)) then
      raise exception 'Unknown workflow hook or event: %', v_entry;
    end if;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION public.task_types_check_hooks() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_types_check_hooks() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_types_check_hooks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_types_check_hooks() TO service_role;

CREATE FUNCTION public.task_type_steps_check_hooks() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_entry jsonb;
begin
  for v_entry in select e from jsonb_array_elements(new.hooks) e loop
    if jsonb_typeof(v_entry) <> 'object'
       or not exists (select 1 from public.workflow_hooks h
                      where h.key = v_entry ->> 'hook' and (v_entry ->> 'event') = any (h.events)) then
      raise exception 'Unknown workflow hook or event: %', v_entry;
    end if;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION public.task_type_steps_check_hooks() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_steps_check_hooks() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_steps_check_hooks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_steps_check_hooks() TO service_role;

CREATE FUNCTION public.task_type_purpose_problems(p_task_type_id uuid) RETURNS text[]
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
declare
  v_problems text[];
  v_check text;
  v_more text[];
begin
  select coalesce(array_agg(r.hook || ' (' || r.event || ')' order by r.hook), '{}') into v_problems
  from public.task_types tt
  join public.task_type_purposes p on p.key = tt.purpose
  cross join lateral jsonb_to_recordset(p.required_hooks) as r(hook text, event text)
  where tt.id = p_task_type_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(tt.hooks, '[]'::jsonb)
                                         || coalesce((select jsonb_agg(h) from public.task_type_steps s, jsonb_array_elements(s.hooks) h where s.task_type_id = tt.id), '[]'::jsonb)) h
      where h ->> 'hook' = r.hook and h ->> 'event' = r.event);

  select p.check_function into v_check
  from public.task_types tt join public.task_type_purposes p on p.key = tt.purpose
  where tt.id = p_task_type_id;
  if v_check is not null then
    -- %I: the name was checked against the pattern task_type_purpose_check_* when the purpose was registered.
    execute format('select public.%I($1)', v_check) into v_more using p_task_type_id;
    v_problems := v_problems || coalesce(v_more, '{}');
  end if;
  return v_problems;
end;
$_$;


ALTER FUNCTION public.task_type_purpose_problems(p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_purpose_problems(p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_purpose_problems(p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_purpose_problems(p_task_type_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.task_type_purpose_problems(p_task_type_id uuid) TO authenticated;

CREATE FUNCTION public.task_type_for_purpose(p_purpose text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid; v_problems text[];
begin
  if (select multiple from public.task_type_purposes where key = p_purpose) then
    raise exception 'The purpose "%" has several task types; its module picks the type', p_purpose;
  end if;
  select id into v_id from public.task_types where purpose = p_purpose and active;
  if v_id is null then
    raise exception 'No active task type is set up for the purpose "%"', p_purpose;
  end if;
  v_problems := public.task_type_purpose_problems(v_id);
  if cardinality(v_problems) > 0 then
    raise exception 'The route of the task type for "%" lacks the special function(s): %', p_purpose, array_to_string(v_problems, ', ');
  end if;
  return v_id;
end $$;


ALTER FUNCTION public.task_type_for_purpose(p_purpose text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_for_purpose(p_purpose text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_for_purpose(p_purpose text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_for_purpose(p_purpose text) TO service_role;

CREATE FUNCTION public.task_types_protect_purpose() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.purpose is not null then
    raise exception 'The task type "%" has the purpose "%" and cannot be deleted', old.key, old.purpose using errcode = 'P0001';
  end if;
  return old;
end $$;


ALTER FUNCTION public.task_types_protect_purpose() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_types_protect_purpose() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_types_protect_purpose() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_types_protect_purpose() TO service_role;

CREATE FUNCTION public.task_types_purpose_admin_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' and new.purpose is not null or tg_op = 'UPDATE' and new.purpose is distinct from old.purpose)
     and not public.is_admin() then
    raise exception 'Only an administrator can change the purpose of a task type' using errcode = '42501';
  end if;
  return new;
end $$;


ALTER FUNCTION public.task_types_purpose_admin_only() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_types_purpose_admin_only() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_types_purpose_admin_only() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_types_purpose_admin_only() TO service_role;

CREATE FUNCTION public.task_types_purpose_rules() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_purpose public.task_type_purposes;
begin
  if tg_op = 'UPDATE' and new.purpose is distinct from old.purpose then
    if exists (select 1 from public.tasks where task_type_id = new.id) then
      raise exception 'The special function of a task type with tasks cannot change; create a new type instead' using errcode = 'P0001';
    end if;
    if (select system_created from public.task_type_purposes where key = old.purpose) then
      new.system_created := false;
    end if;
  end if;
  if new.purpose is null then
    return new;
  end if;
  select * into v_purpose from public.task_type_purposes where key = new.purpose;
  if not v_purpose.multiple
     and exists (select 1 from public.task_types where purpose = new.purpose and id <> new.id) then
    raise exception 'Another task type already has the purpose "%"', new.purpose using errcode = '23505';
  end if;
  if v_purpose.system_created then
    new.system_created := true;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.task_types_purpose_rules() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_types_purpose_rules() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_types_purpose_rules() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_types_purpose_rules() TO service_role;

CREATE FUNCTION public.dashboard_counts(p_days integer DEFAULT 7) RETURNS TABLE(open_tasks integer, overdue_tasks integer, blocked_tasks integer, due_soon_mine integer, done_recent integer, team_pool integer, open_tickets integer, status_counts jsonb, team_counts jsonb, mine_open integer, mine_overdue integer, pool_overdue integer)
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
    null::integer,
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

CREATE FUNCTION public.dashboard_trends(p_weeks integer DEFAULT 12) RETURNS TABLE(metric text, day date, value integer)
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
end;
$$;


ALTER FUNCTION public.dashboard_trends(p_weeks integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dashboard_trends(p_weeks integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dashboard_trends(p_weeks integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dashboard_trends(p_weeks integer) TO service_role;
GRANT ALL ON FUNCTION public.dashboard_trends(p_weeks integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.permission_module_for(p_task_type_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select pp.permission_module from public.task_types tt join public.task_type_purposes pp on pp.key = tt.purpose
      where tt.id = p_task_type_id),
    (select p.module from public.task_types tt join public.permissions p on p.module = tt.key and p.task_family and p.module <> 'initiative'
      where tt.id = p_task_type_id limit 1),
    'tasks');
$$;


ALTER FUNCTION public.permission_module_for(p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.permission_module_for(p_task_type_id uuid) TO service_role;

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
           public.rls_my_task_type_ids() as types, '{}'::text[] as keys_view,
           '{}'::text[] as keys_check, '{}'::text[] as keys_edit
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
         coalesce(not a.open and a.can_edit and a.purpose is null and a.recurring_task_rule_id is null, false)
  from a;
$$;


ALTER FUNCTION public.task_rights(p_task_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO authenticated;

ALTER TABLE public.task_type_purposes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read task type purposes" ON public.task_type_purposes FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.task_type_purposes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.workflow_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read workflow hooks" ON public.workflow_hooks FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.workflow_hooks AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE OR REPLACE VIEW public.tasks_decided_by_me WITH (security_invoker='on') AS
 SELECT h.id,
    h.task_id,
    t.task_number,
    t.title,
    t.status,
    tt.name AS task_type_name,
    tt.name_de AS task_type_name_de,
    tt.purpose,
    h.action_key,
    a.action,
    h.comment,
    h.left_at AS decided_at
   FROM ((((public.task_step_history h
     JOIN public.tasks t ON ((t.id = h.task_id)))
     JOIN public.task_types tt ON ((tt.id = t.task_type_id)))
     JOIN public.task_type_steps s ON (((s.task_type_id = t.task_type_id) AND (s.step_key = h.step_key))))
     CROSS JOIN LATERAL ( SELECT x.value AS action
           FROM jsonb_array_elements(s.actions) x(value)
          WHERE ((x.value ->> 'key'::text) = h.action_key)
         LIMIT 1) a)
  WHERE ((h.actor_user_id = auth.uid()) AND (h.action_key IS NOT NULL) AND s.is_decision);


ALTER VIEW public.tasks_decided_by_me OWNER TO postgres;

REVOKE ALL ON TABLE public.tasks_decided_by_me FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tasks_decided_by_me TO authenticated;
GRANT ALL ON TABLE public.tasks_decided_by_me TO service_role;

CREATE OR REPLACE VIEW public.tasks_my_requests WITH (security_invoker='true') AS
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

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_purpose_fkey FOREIGN KEY (purpose) REFERENCES public.task_type_purposes(key);

CREATE TRIGGER task_types_check_hooks BEFORE INSERT OR UPDATE OF hooks ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.task_types_check_hooks();

CREATE TRIGGER task_type_steps_check_hooks BEFORE INSERT OR UPDATE OF hooks ON public.task_type_steps FOR EACH ROW EXECUTE FUNCTION public.task_type_steps_check_hooks();

CREATE TRIGGER task_types_protect_purpose BEFORE DELETE ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.task_types_protect_purpose();

CREATE TRIGGER task_types_purpose_admin_only BEFORE INSERT OR UPDATE OF purpose ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.task_types_purpose_admin_only();

CREATE TRIGGER task_types_purpose_rules BEFORE INSERT OR UPDATE OF purpose, system_created ON public.task_types FOR EACH ROW EXECUTE FUNCTION public.task_types_purpose_rules();

CREATE TRIGGER workflow_dispatch_insert AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.workflow_dispatch();

CREATE TRIGGER workflow_dispatch_update AFTER UPDATE OF status, current_step_key ON public.tasks FOR EACH ROW WHEN (((new.status IS DISTINCT FROM old.status) OR (new.current_step_key IS DISTINCT FROM old.current_step_key))) EXECUTE FUNCTION public.workflow_dispatch();

-- Hand-written part of the workflows module (after the objects copied from COMPASS).

-- Team uses of COMPASS's task pages (groups.usable_for_tasks: a team that can be given tasks and work them in planning;
-- usable_for_filters: a team offered in the list filters). task-family's team pickers search by them (teamSearchSelect.tsx).
-- Registered here, the first phase 4 module on top of task-family (task-family's SQL is generated by task_family.sh).
select public.team_use_register('tasks', 'workflows', 'Works tasks (offered in the task pickers and the planning board)');
select public.team_use_register('filters', 'workflows', 'Offered in the team filters of the task and initiative lists');

