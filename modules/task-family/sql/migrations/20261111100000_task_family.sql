-- Task family (module task-family): COMPASS checklists, recurring series, goals, initiatives, costs, effort, reminders,
-- claiming, task tree and decision views on top of the tasks module. Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the task-family module, before the objects copied from COMPASS.

-- The columns the tasks module cut, back as COMPASS has them. asset_id comes back without its FK and without logic (the
-- asset module adds both), so COMPASS's pages keep writing it as they are; ticket_id comes with the ticket module.
alter table public.tasks
  add column asset_id uuid,
  add column recurring_task_rule_id uuid,
  add column checklist_template_id uuid,
  add column checklist_completed_at timestamp with time zone,
  add column work_hours numeric(6,1),
  add column downtime_from timestamp with time zone,
  add column downtime_to timestamp with time zone,
  add column goal_id uuid,
  add column bucket_id uuid,
  add column is_initiative boolean default false not null,
  add constraint tasks_downtime_order check (((downtime_to is null) or (downtime_from is null) or (downtime_to >= downtime_from))),
  add constraint tasks_work_hours_check check ((work_hours >= (0)::numeric)),
  add constraint tasks_work_hours_finite check (((work_hours >= ('-1000000000000'::bigint)::numeric) and (work_hours <= ('1000000000000'::bigint)::numeric)));

alter table public.task_types add column default_checklist_template_id uuid;
-- Fields a type can hide: COMPASS's list without 'asset' (comes with the asset module).
alter table public.task_types drop constraint task_types_hidden_fields_check;
alter table public.task_types add constraint task_types_hidden_fields_check
  check ((hidden_fields <@ array['team'::text, 'work_hours'::text, 'downtime'::text, 'checklist'::text, 'costs'::text]));

-- A photo of a checklist item (COMPASS attachments.checklist_item_id).
alter table public.attachments add column checklist_item_id uuid;

-- Task reminders (COMPASS notification_preferences columns).
alter table public.notification_preferences
  add column remind_planned_today boolean default true not null,
  add column remind_due_soon boolean default true not null,
  add column remind_overdue boolean default true not null,
  add column due_soon_days integer default 2 not null,
  add constraint notification_preferences_due_soon_days_check check (((due_soon_days >= 0) and (due_soon_days <= 14)));

create sequence public.goal_number_seq;
grant usage, select on sequence public.goal_number_seq to authenticated, service_role;

-- Replaced below by COMPASS's versions (more columns, more arguments).
drop view public.tasks_overview;
drop function public.task_create(uuid, text, date, text, text, text, uuid, uuid, uuid, uuid, boolean);


CREATE FUNCTION public.checklist_item_answered(p_kind text, p_done boolean, p_result text, p_value_number numeric, p_value_text text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_kind
    when 'heading' then true
    when 'check' then coalesce(p_done, false)
    when 'pass_fail' then p_result is not null
    when 'number' then p_value_number is not null
    when 'text' then nullif(btrim(coalesce(p_value_text, '')), '') is not null
    when 'date' then p_value_text is not null
    else false
  end
$$;


ALTER FUNCTION public.checklist_item_answered(p_kind text, p_done boolean, p_result text, p_value_number numeric, p_value_text text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_item_answered(p_kind text, p_done boolean, p_result text, p_value_number numeric, p_value_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_item_answered(p_kind text, p_done boolean, p_result text, p_value_number numeric, p_value_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_item_answered(p_kind text, p_done boolean, p_result text, p_value_number numeric, p_value_text text) TO authenticated;
GRANT ALL ON FUNCTION public.checklist_item_answered(p_kind text, p_done boolean, p_result text, p_value_number numeric, p_value_text text) TO service_role;

CREATE TABLE public.checklist_templates (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    description text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    task_type_id uuid,
    owner_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT checklist_templates_name_check CHECK (((length(name) >= 1) AND (length(name) <= 200)))
);


ALTER TABLE public.checklist_templates OWNER TO postgres;

REVOKE ALL ON TABLE public.checklist_templates FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.checklist_templates TO authenticated;
GRANT ALL ON TABLE public.checklist_templates TO service_role;

CREATE TABLE public.checklist_template_items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    template_id uuid NOT NULL,
    sort_order integer NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    hint text,
    required boolean DEFAULT true NOT NULL,
    unit text,
    min_value numeric,
    max_value numeric,
    step_key text,
    CONSTRAINT checklist_template_items_heading_not_required CHECK (((kind <> 'heading'::text) OR (NOT required))),
    CONSTRAINT checklist_template_items_kind_check CHECK ((kind = ANY (ARRAY['heading'::text, 'check'::text, 'pass_fail'::text, 'number'::text, 'text'::text, 'date'::text]))),
    CONSTRAINT checklist_template_items_label_check CHECK (((length(label) >= 1) AND (length(label) <= 500))),
    CONSTRAINT checklist_template_items_limits CHECK (((kind = 'number'::text) OR ((unit IS NULL) AND (min_value IS NULL) AND (max_value IS NULL)))),
    CONSTRAINT checklist_template_items_max_value_finite CHECK (((max_value >= ('-1000000000000'::bigint)::numeric) AND (max_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT checklist_template_items_min_value_finite CHECK (((min_value >= ('-1000000000000'::bigint)::numeric) AND (min_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT checklist_template_items_step_key_check CHECK (((step_key IS NULL) OR (step_key ~ '^[a-z][a-z0-9_]*$'::text)))
);


ALTER TABLE public.checklist_template_items OWNER TO postgres;

REVOKE ALL ON TABLE public.checklist_template_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.checklist_template_items TO authenticated;
GRANT ALL ON TABLE public.checklist_template_items TO service_role;

CREATE TABLE public.task_type_step_items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    step_id uuid NOT NULL,
    sort_order integer NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    hint text,
    required boolean DEFAULT false NOT NULL,
    unit text,
    min_value numeric,
    max_value numeric,
    CONSTRAINT task_type_step_items_heading_not_required CHECK (((kind <> 'heading'::text) OR (NOT required))),
    CONSTRAINT task_type_step_items_hint_check CHECK (((hint IS NULL) OR (length(hint) <= 1000))),
    CONSTRAINT task_type_step_items_kind_check CHECK ((kind = ANY (ARRAY['heading'::text, 'check'::text, 'pass_fail'::text, 'number'::text, 'text'::text, 'date'::text]))),
    CONSTRAINT task_type_step_items_label_check CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 300))),
    CONSTRAINT task_type_step_items_limits CHECK (((kind = 'number'::text) OR ((unit IS NULL) AND (min_value IS NULL) AND (max_value IS NULL)))),
    CONSTRAINT task_type_step_items_unit_check CHECK (((unit IS NULL) OR (length(unit) <= 20)))
);


ALTER TABLE public.task_type_step_items OWNER TO postgres;

REVOKE ALL ON TABLE public.task_type_step_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_type_step_items TO authenticated;
GRANT ALL ON TABLE public.task_type_step_items TO service_role;

CREATE TABLE public.task_checklist_items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    sort_order integer NOT NULL,
    kind text NOT NULL,
    label text NOT NULL,
    hint text,
    required boolean DEFAULT true NOT NULL,
    unit text,
    min_value numeric,
    max_value numeric,
    done boolean DEFAULT false NOT NULL,
    result text,
    value_number numeric,
    value_text text,
    note text,
    answered_by_user_id uuid,
    answered_at timestamp with time zone,
    task_id uuid NOT NULL,
    from_template boolean DEFAULT false NOT NULL,
    step_key text,
    from_step boolean DEFAULT false NOT NULL,
    CONSTRAINT task_checklist_items_date_value CHECK (((kind <> 'date'::text) OR (value_text IS NULL) OR (value_text ~ '^\d{4}-\d{2}-\d{2}$'::text))),
    CONSTRAINT task_checklist_items_heading_not_required CHECK (((kind <> 'heading'::text) OR (NOT required))),
    CONSTRAINT task_checklist_items_kind_check CHECK ((kind = ANY (ARRAY['heading'::text, 'check'::text, 'pass_fail'::text, 'number'::text, 'text'::text, 'date'::text]))),
    CONSTRAINT task_checklist_items_label_check CHECK (((length(label) >= 1) AND (length(label) <= 500))),
    CONSTRAINT task_checklist_items_max_value_finite CHECK (((max_value >= ('-1000000000000'::bigint)::numeric) AND (max_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT task_checklist_items_min_value_finite CHECK (((min_value >= ('-1000000000000'::bigint)::numeric) AND (min_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT task_checklist_items_result_check CHECK ((result = ANY (ARRAY['ok'::text, 'defect'::text, 'na'::text]))),
    CONSTRAINT task_checklist_items_value_number_finite CHECK (((value_number >= ('-1000000000000'::bigint)::numeric) AND (value_number <= ('1000000000000'::bigint)::numeric)))
);


ALTER TABLE public.task_checklist_items OWNER TO postgres;

REVOKE ALL ON TABLE public.task_checklist_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_checklist_items TO authenticated;
GRANT ALL ON TABLE public.task_checklist_items TO service_role;

CREATE TABLE public.recurring_task_rules (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    description text,
    task_type_id uuid NOT NULL,
    asset_id uuid,
    priority text DEFAULT 'normal'::text NOT NULL,
    team_id uuid,
    assigned_user_id uuid,
    assignment_mode text DEFAULT 'team'::text NOT NULL,
    last_assigned_user_id uuid,
    schedule_kind text NOT NULL,
    interval_count integer DEFAULT 1 NOT NULL,
    operating_hours_interval numeric(12,1),
    start_date date DEFAULT CURRENT_DATE NOT NULL,
    end_date date,
    next_due_date date,
    lead_days integer DEFAULT 0 NOT NULL,
    repeat_mode text DEFAULT 'fixed_schedule'::text NOT NULL,
    skip_if_open boolean DEFAULT true NOT NULL,
    last_generated_hours numeric(12,1),
    last_generated_at timestamp with time zone,
    last_error text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    checklist_template_id uuid,
    checklist_items jsonb,
    CONSTRAINT recurring_end_after_start CHECK (((end_date IS NULL) OR (end_date >= start_date))),
    CONSTRAINT recurring_hours_needs_asset CHECK (((schedule_kind <> 'operating_hours'::text) OR ((asset_id IS NOT NULL) AND (operating_hours_interval IS NOT NULL)))),
    CONSTRAINT recurring_rotate_mode_needs_team CHECK (((assignment_mode <> 'rotate'::text) OR (team_id IS NOT NULL))),
    CONSTRAINT recurring_task_rules_assignment_mode_check CHECK ((assignment_mode = ANY (ARRAY['team'::text, 'user'::text, 'rotate'::text]))),
    CONSTRAINT recurring_task_rules_checklist_items_check CHECK (((checklist_items IS NULL) OR (jsonb_typeof(checklist_items) = 'array'::text))),
    CONSTRAINT recurring_task_rules_interval_count_check CHECK (((interval_count >= 1) AND (interval_count <= 1000))),
    CONSTRAINT recurring_task_rules_last_generated_hours_finite CHECK (((last_generated_hours >= ('-1000000000000'::bigint)::numeric) AND (last_generated_hours <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT recurring_task_rules_lead_days_check CHECK (((lead_days >= 0) AND (lead_days <= 365))),
    CONSTRAINT recurring_task_rules_name_check CHECK (((length(name) >= 1) AND (length(name) <= 200))),
    CONSTRAINT recurring_task_rules_operating_hours_interval_check CHECK ((operating_hours_interval > (0)::numeric)),
    CONSTRAINT recurring_task_rules_operating_hours_interval_finite CHECK (((operating_hours_interval >= ('-1000000000000'::bigint)::numeric) AND (operating_hours_interval <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT recurring_task_rules_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT recurring_task_rules_repeat_mode_check CHECK ((repeat_mode = ANY (ARRAY['fixed_schedule'::text, 'after_completion'::text]))),
    CONSTRAINT recurring_task_rules_schedule_kind_check CHECK ((schedule_kind = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text]))),
    CONSTRAINT recurring_time_has_no_hours CHECK (((schedule_kind = 'operating_hours'::text) OR (operating_hours_interval IS NULL))),
    CONSTRAINT recurring_user_mode_needs_user CHECK (((assignment_mode <> 'user'::text) OR (assigned_user_id IS NOT NULL)))
);


ALTER TABLE public.recurring_task_rules OWNER TO postgres;

REVOKE ALL ON TABLE public.recurring_task_rules FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.recurring_task_rules TO authenticated;
GRANT ALL ON TABLE public.recurring_task_rules TO service_role;

CREATE TABLE public.task_costs (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_id uuid NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    cost_date date DEFAULT CURRENT_DATE NOT NULL,
    invoice_path text,
    invoice_file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    supplier_id uuid,
    CONSTRAINT task_costs_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT task_costs_amount_finite CHECK (((amount >= ('-1000000000000'::bigint)::numeric) AND (amount <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT task_costs_description_check CHECK (((length(description) >= 1) AND (length(description) <= 200))),
    CONSTRAINT task_costs_invoice_pair CHECK (((invoice_path IS NULL) = (invoice_file_name IS NULL)))
);


ALTER TABLE public.task_costs OWNER TO postgres;

REVOKE ALL ON TABLE public.task_costs FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_costs TO authenticated;
GRANT ALL ON TABLE public.task_costs TO service_role;

CREATE TABLE public.goals (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    goal_number bigint DEFAULT nextval('public.goal_number_seq'::regclass) NOT NULL,
    title text NOT NULL,
    description text,
    parent_goal_id uuid,
    owner_user_id uuid,
    team_id uuid,
    status text,
    measure_label text,
    measure_unit text,
    start_value numeric(14,2),
    target_value numeric(14,2),
    current_value numeric(14,2),
    measure_source text DEFAULT 'manual'::text NOT NULL,
    due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT goals_current_value_finite CHECK (((current_value >= ('-1000000000000'::bigint)::numeric) AND (current_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT goals_measure_complete CHECK ((((measure_label IS NULL) AND (measure_unit IS NULL) AND (start_value IS NULL) AND (target_value IS NULL) AND (current_value IS NULL)) OR ((measure_label IS NOT NULL) AND (measure_unit IS NOT NULL) AND (start_value IS NOT NULL) AND (target_value IS NOT NULL) AND (current_value IS NOT NULL)))),
    CONSTRAINT goals_measure_label_check CHECK (((measure_label IS NULL) OR ((length(measure_label) >= 1) AND (length(measure_label) <= 200)))),
    CONSTRAINT goals_measure_source_check CHECK ((measure_source = 'manual'::text)),
    CONSTRAINT goals_measure_unit_check CHECK (((measure_unit IS NULL) OR ((length(measure_unit) >= 1) AND (length(measure_unit) <= 20)))),
    CONSTRAINT goals_not_own_parent CHECK ((parent_goal_id IS DISTINCT FROM id)),
    CONSTRAINT goals_start_value_finite CHECK (((start_value >= ('-1000000000000'::bigint)::numeric) AND (start_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT goals_status_check CHECK ((status = ANY (ARRAY['on_track'::text, 'at_risk'::text, 'off_track'::text, 'achieved'::text, 'dropped'::text]))),
    CONSTRAINT goals_target_value_finite CHECK (((target_value >= ('-1000000000000'::bigint)::numeric) AND (target_value <= ('1000000000000'::bigint)::numeric))),
    CONSTRAINT goals_title_check CHECK (((length(title) >= 1) AND (length(title) <= 200)))
);


ALTER TABLE public.goals OWNER TO postgres;

REVOKE ALL ON TABLE public.goals FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;

CREATE TABLE public.initiative_buckets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    initiative_task_id uuid NOT NULL,
    name text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT initiative_buckets_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80)))
);


ALTER TABLE public.initiative_buckets OWNER TO postgres;

REVOKE ALL ON TABLE public.initiative_buckets FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.initiative_buckets TO authenticated;
GRANT ALL ON TABLE public.initiative_buckets TO service_role;

CREATE TABLE public.reminder_log (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    ref_date date NOT NULL,
    sent_on date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT reminder_log_kind_check CHECK ((kind = ANY (ARRAY['planned_today'::text, 'due_soon'::text, 'overdue'::text, 'items_order'::text])))
);


ALTER TABLE public.reminder_log OWNER TO postgres;

REVOKE ALL ON TABLE public.reminder_log FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.reminder_log TO service_role;

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);

CREATE INDEX checklist_templates_owner_user_id_idx ON public.checklist_templates USING btree (owner_user_id);

CREATE INDEX checklist_templates_task_type_id_idx ON public.checklist_templates USING btree (task_type_id);

ALTER TABLE ONLY public.checklist_template_items
    ADD CONSTRAINT checklist_template_items_pkey PRIMARY KEY (id);

CREATE INDEX checklist_template_items_template_id_sort_order_idx ON public.checklist_template_items USING btree (template_id, sort_order);

ALTER TABLE ONLY public.task_type_step_items
    ADD CONSTRAINT task_type_step_items_pkey PRIMARY KEY (id);

CREATE INDEX task_type_step_items_step_id_sort_order_idx ON public.task_type_step_items USING btree (step_id, sort_order);

ALTER TABLE ONLY public.task_checklist_items
    ADD CONSTRAINT task_checklist_items_pkey PRIMARY KEY (id);

CREATE INDEX task_checklist_items_task_id_sort_order_idx ON public.task_checklist_items USING btree (task_id, sort_order);

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_pkey PRIMARY KEY (id);

CREATE INDEX recurring_task_rules_active_next_due_date_idx ON public.recurring_task_rules USING btree (active, next_due_date);

CREATE INDEX recurring_task_rules_asset_id_idx ON public.recurring_task_rules USING btree (asset_id);

CREATE INDEX recurring_task_rules_assigned_user_id_idx ON public.recurring_task_rules USING btree (assigned_user_id);

CREATE INDEX recurring_task_rules_checklist_template_id_idx ON public.recurring_task_rules USING btree (checklist_template_id);

CREATE INDEX recurring_task_rules_task_type_id_idx ON public.recurring_task_rules USING btree (task_type_id);

CREATE INDEX recurring_task_rules_team_id_idx ON public.recurring_task_rules USING btree (team_id);

ALTER TABLE ONLY public.task_costs
    ADD CONSTRAINT task_costs_invoice_path_key UNIQUE (invoice_path);

ALTER TABLE ONLY public.task_costs
    ADD CONSTRAINT task_costs_pkey PRIMARY KEY (id);

CREATE INDEX task_costs_cost_date_idx ON public.task_costs USING btree (cost_date);

CREATE INDEX task_costs_supplier_id_idx ON public.task_costs USING btree (supplier_id);

CREATE INDEX task_costs_task_id_idx ON public.task_costs USING btree (task_id);

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_goal_number_key UNIQUE (goal_number);

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

CREATE INDEX goals_owner_user_id_idx ON public.goals USING btree (owner_user_id);

CREATE INDEX goals_parent_goal_id_idx ON public.goals USING btree (parent_goal_id);

CREATE INDEX goals_team_id_idx ON public.goals USING btree (team_id);

CREATE INDEX goals_title_trgm_idx ON public.goals USING gin (title extensions.gin_trgm_ops);

ALTER TABLE ONLY public.initiative_buckets
    ADD CONSTRAINT initiative_buckets_pkey PRIMARY KEY (id);

CREATE INDEX initiative_buckets_initiative_task_id_position_idx ON public.initiative_buckets USING btree (initiative_task_id, "position");

ALTER TABLE ONLY public.reminder_log
    ADD CONSTRAINT reminder_log_pkey PRIMARY KEY (id);

CREATE INDEX reminder_log_task_id_user_id_kind_sent_on_idx ON public.reminder_log USING btree (task_id, user_id, kind, sent_on DESC);

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.checklist_template_items
    ADD CONSTRAINT checklist_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.checklist_templates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_type_step_items
    ADD CONSTRAINT task_type_step_items_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.task_type_steps(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_checklist_items
    ADD CONSTRAINT task_checklist_items_answered_by_user_id_fkey FOREIGN KEY (answered_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_checklist_items
    ADD CONSTRAINT task_checklist_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_checklist_template_id_fkey FOREIGN KEY (checklist_template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_last_assigned_user_id_fkey FOREIGN KEY (last_assigned_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.recurring_task_rules
    ADD CONSTRAINT recurring_task_rules_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_costs
    ADD CONSTRAINT task_costs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_costs
    ADD CONSTRAINT task_costs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_costs
    ADD CONSTRAINT task_costs_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_parent_goal_id_fkey FOREIGN KEY (parent_goal_id) REFERENCES public.goals(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.initiative_buckets
    ADD CONSTRAINT initiative_buckets_initiative_task_id_fkey FOREIGN KEY (initiative_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reminder_log
    ADD CONSTRAINT reminder_log_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reminder_log
    ADD CONSTRAINT reminder_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE FUNCTION public.checklist_add_items(p_task_id uuid, p_items jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform set_config('app.checklist_internal', 'on', true);
  insert into public.task_checklist_items (task_id, sort_order, kind, label, required, from_template)
  select p_task_id, coalesce((select max(sort_order) from public.task_checklist_items where task_id = p_task_id), 0) + row_number() over (order by o),
         'check', left(btrim(i.label), 500), false, false
  from jsonb_array_elements(p_items) with ordinality as e(item, o), jsonb_to_record(e.item) as i(label text)
  where nullif(btrim(coalesce(i.label, '')), '') is not null;
  perform set_config('app.checklist_internal', 'off', true);
end;
$$;


ALTER FUNCTION public.checklist_add_items(p_task_id uuid, p_items jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_add_items(p_task_id uuid, p_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_add_items(p_task_id uuid, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_add_items(p_task_id uuid, p_items jsonb) TO service_role;

CREATE FUNCTION public.checklist_apply_template(p_task_id uuid, p_template_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_name text;
  v_template_type uuid;
begin
  if p_template_id is not null then
    select name, task_type_id into v_name, v_template_type from public.checklist_templates where id = p_template_id;
    if v_name is null then
      raise exception 'Checklist template not found';
    end if;
  end if;
  perform set_config('app.checklist_internal', 'on', true);
  delete from public.task_checklist_items where task_id = p_task_id and from_template;
  if p_template_id is not null then
    insert into public.task_checklist_items (task_id, sort_order, kind, label, hint, required, unit, min_value, max_value, from_template, step_key)
    select p_task_id, i.sort_order, i.kind, i.label, i.hint, i.required, i.unit, i.min_value, i.max_value, true,
           case when v_template_type is not null and v_template_type = (select task_type_id from public.tasks where id = p_task_id) then i.step_key end
    from public.checklist_template_items i where i.template_id = p_template_id;
  end if;
  update public.tasks set checklist_template_id = p_template_id where id = p_task_id;
  perform public.checklist_renumber(p_task_id);
  perform set_config('app.checklist_internal', 'off', true);
  if p_template_id is not null then
    perform public.log_system_event('tasks', p_task_id, 'checklist_added', jsonb_build_object('name', v_name, 'from_template', true));
  end if;
end;
$$;


ALTER FUNCTION public.checklist_apply_template(p_task_id uuid, p_template_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_apply_template(p_task_id uuid, p_template_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_apply_template(p_task_id uuid, p_template_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_apply_template(p_task_id uuid, p_template_id uuid) TO service_role;

CREATE FUNCTION public.checklist_renumber(p_task_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.task_checklist_items i set sort_order = n.rn
  from (select id, row_number() over (order by from_step desc, from_template desc, sort_order, id) as rn
        from public.task_checklist_items where task_id = p_task_id) n
  where n.id = i.id and i.sort_order is distinct from n.rn
$$;


ALTER FUNCTION public.checklist_renumber(p_task_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_renumber(p_task_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_renumber(p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_renumber(p_task_id uuid) TO service_role;

CREATE FUNCTION public.checklist_template_create(p_name text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not (public.is_admin() or public.rls_has('checklist_templates.create')) then
    raise exception 'You may not create checklist templates';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'A template needs a name';
  end if;
  insert into public.checklist_templates (name) values (btrim(p_name)) returning id into v_id;
  insert into public.checklist_template_items (template_id, sort_order, kind, label, hint, required, unit, min_value, max_value)
  select v_id, row_number() over (order by o), i.kind, btrim(i.label), nullif(btrim(coalesce(i.hint, '')), ''),
         i.kind <> 'heading' and coalesce(i.required, true),
         case when i.kind = 'number' then i.unit end, case when i.kind = 'number' then i.min_value end, case when i.kind = 'number' then i.max_value end
  from jsonb_array_elements(p_items) with ordinality as e(item, o),
       jsonb_to_record(e.item) as i(kind text, label text, hint text, required boolean, unit text, min_value numeric, max_value numeric)
  where nullif(btrim(coalesce(i.label, '')), '') is not null;
  return v_id;
end;
$$;


ALTER FUNCTION public.checklist_template_create(p_name text, p_items jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_template_create(p_name text, p_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_template_create(p_name text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_template_create(p_name text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.checklist_template_create(p_name text, p_items jsonb) TO service_role;

CREATE FUNCTION public.checklist_template_duplicate(p_template_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_source public.checklist_templates;
  v_id uuid;
begin
  select * into v_source from public.checklist_templates where id = p_template_id;
  if v_source.id is null then
    raise exception 'Checklist template not found' using errcode = 'P0002';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'A template needs a name' using errcode = '22023';
  end if;
  insert into public.checklist_templates (name, description, task_type_id)
  values (btrim(p_name), v_source.description, v_source.task_type_id)
  returning id into v_id;
  insert into public.checklist_template_items (template_id, sort_order, kind, label, hint, required, unit, min_value, max_value, step_key)
  select v_id, sort_order, kind, label, hint, required, unit, min_value, max_value, step_key
  from public.checklist_template_items
  where template_id = p_template_id;
  return v_id;
end;
$$;


ALTER FUNCTION public.checklist_template_duplicate(p_template_id uuid, p_name text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_template_duplicate(p_template_id uuid, p_name text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_template_duplicate(p_template_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_template_duplicate(p_template_id uuid, p_name text) TO service_role;
GRANT ALL ON FUNCTION public.checklist_template_duplicate(p_template_id uuid, p_name text) TO authenticated;

CREATE FUNCTION public.checklist_template_editable(p_template_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.is_admin()
    or public.rls_has('checklist_templates.edit.all')
    or (public.rls_has('checklist_templates.edit.own')
        and exists (select 1 from public.checklist_templates t where t.id = p_template_id and t.owner_user_id = auth.uid()))
$$;


ALTER FUNCTION public.checklist_template_editable(p_template_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_template_editable(p_template_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_template_editable(p_template_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_template_editable(p_template_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.checklist_template_editable(p_template_id uuid) TO authenticated;

CREATE FUNCTION public.checklist_template_items_check_step() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.step_key is not null and not exists (
    select 1
    from public.checklist_templates c
    join public.task_type_steps s on s.task_type_id = c.task_type_id and s.step_key = new.step_key
    where c.id = new.template_id
  ) then
    raise exception 'checklist_step_unknown' using errcode = '23514',
      hint = 'The step must belong to the task type of the checklist.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.checklist_template_items_check_step() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_template_items_check_step() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_template_items_check_step() FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_template_items_check_step() TO service_role;

CREATE FUNCTION public.checklist_templates_clear_steps() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.checklist_template_items i set step_key = null
  where i.template_id = new.id and i.step_key is not null
    and not exists (select 1 from public.task_type_steps s where s.task_type_id = new.task_type_id and s.step_key = i.step_key);
  return new;
end;
$$;


ALTER FUNCTION public.checklist_templates_clear_steps() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checklist_templates_clear_steps() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checklist_templates_clear_steps() FROM PUBLIC;
GRANT ALL ON FUNCTION public.checklist_templates_clear_steps() TO service_role;

CREATE FUNCTION public.task_add_step_items(p_task_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.task_type_step_items i join public.task_type_steps s on s.id = i.step_id
                 join public.tasks t on t.task_type_id = s.task_type_id where t.id = p_task_id) then
    return;
  end if;
  perform set_config('app.checklist_internal', 'on', true);
  insert into public.task_checklist_items (task_id, sort_order, kind, label, hint, required, unit, min_value, max_value, from_template, from_step, step_key)
  select p_task_id, (row_number() over (order by s.step_order, i.sort_order))::int - 10000,
         i.kind, i.label, i.hint, i.required, i.unit, i.min_value, i.max_value, false, true, s.step_key
  from public.tasks t
  join public.task_type_steps s on s.task_type_id = t.task_type_id
  join public.task_type_step_items i on i.step_id = s.id
  where t.id = p_task_id;
  perform public.checklist_renumber(p_task_id);
  perform set_config('app.checklist_internal', 'off', true);
end;
$$;


ALTER FUNCTION public.task_add_step_items(p_task_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_add_step_items(p_task_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_add_step_items(p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_add_step_items(p_task_id uuid) TO service_role;

CREATE FUNCTION public.task_can_edit_checklist(p_task_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select auth.uid() is null
    or coalesce(current_setting('app.checklist_internal', true), '') = 'on'
    or public.user_has_access(auth.uid(), 'tasks', p_task_id, 'edit')
$$;


ALTER FUNCTION public.task_can_edit_checklist(p_task_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_can_edit_checklist(p_task_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_can_edit_checklist(p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_can_edit_checklist(p_task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.task_can_edit_checklist(p_task_id uuid) TO service_role;

CREATE FUNCTION public.task_checklist_items_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_task public.tasks;
  v_complete boolean;
begin
  select * into v_task from public.tasks where id = v_task_id;
  if v_task.id is null then
    return null; -- the task itself is being deleted
  end if;
  -- Complete = every required item answered; a list without required items (own ticks only) is complete when every
  -- item is answered.
  select exists (select 1 from public.task_checklist_items i where i.task_id = v_task_id and i.kind <> 'heading')
    and not exists (
      select 1 from public.task_checklist_items i
      where i.task_id = v_task_id and i.required
        and not public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text))
    and (exists (select 1 from public.task_checklist_items i where i.task_id = v_task_id and i.required)
         or not exists (
           select 1 from public.task_checklist_items i
           where i.task_id = v_task_id and i.kind <> 'heading'
             and not public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text)))
  into v_complete;
  if v_complete and v_task.checklist_completed_at is null then
    update public.tasks set checklist_completed_at = now() where id = v_task_id;
    perform public.log_system_event('tasks', v_task_id, 'checklist_completed',
      jsonb_build_object('name', (select name from public.checklist_templates where id = v_task.checklist_template_id),
        'defects', (select count(*) from public.task_checklist_items where task_id = v_task_id and result = 'defect')));
  elsif not v_complete and v_task.checklist_completed_at is not null then
    update public.tasks set checklist_completed_at = null where id = v_task_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.task_checklist_items_after() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_checklist_items_after() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_checklist_items_after() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_checklist_items_after() TO authenticated;
GRANT ALL ON FUNCTION public.task_checklist_items_after() TO service_role;

CREATE FUNCTION public.task_checklist_items_before() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    if not public.task_can_edit_checklist(new.task_id) then
      raise exception 'You may not change the checklist of this task';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.kind, new.label, new.hint, new.required, new.unit, new.min_value, new.max_value, new.sort_order, new.task_id, new.from_template, new.from_step, new.step_key)
       is distinct from (old.kind, old.label, old.hint, old.required, old.unit, old.min_value, old.max_value, old.sort_order, old.task_id, old.from_template, old.from_step, old.step_key)
       and not public.task_can_edit_checklist(new.task_id) then
      raise exception 'You may not change the checklist of this task';
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

CREATE FUNCTION public.task_checklist_save_as_template(p_task_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.user_has_access(auth.uid(), 'tasks', p_task_id, 'view') then
    raise exception 'Task not found';
  end if;
  if not (public.is_admin() or public.rls_has('checklist_templates.create')) then
    raise exception 'You may not create checklist templates';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'A template needs a name';
  end if;
  if not exists (select 1 from public.task_checklist_items where task_id = p_task_id and not from_template and not from_step and kind <> 'heading') then
    raise exception 'The task has no own checklist items';
  end if;
  insert into public.checklist_templates (name) values (btrim(p_name)) returning id into v_id;
  insert into public.checklist_template_items (template_id, sort_order, kind, label, hint, required, unit, min_value, max_value)
  select v_id, row_number() over (order by sort_order), kind, label, hint, required, unit, min_value, max_value
  from public.task_checklist_items where task_id = p_task_id and not from_template and not from_step;
  return v_id;
end;
$$;


ALTER FUNCTION public.task_checklist_save_as_template(p_task_id uuid, p_name text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_checklist_save_as_template(p_task_id uuid, p_name text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_checklist_save_as_template(p_task_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_checklist_save_as_template(p_task_id uuid, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.task_checklist_save_as_template(p_task_id uuid, p_name text) TO service_role;

CREATE FUNCTION public.task_set_checklist_template(p_task_id uuid, p_template_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null or not public.user_has_access(auth.uid(), 'tasks', p_task_id, 'edit') then
    raise exception 'You may not change the checklist of this task';
  end if;
  if exists (select 1 from public.tasks where id = p_task_id and status in ('done', 'cancelled')) then
    raise exception 'The task is already finished';
  end if;
  perform public.checklist_apply_template(p_task_id, p_template_id);
end;
$$;


ALTER FUNCTION public.task_set_checklist_template(p_task_id uuid, p_template_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_set_checklist_template(p_task_id uuid, p_template_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_set_checklist_template(p_task_id uuid, p_template_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_set_checklist_template(p_task_id uuid, p_template_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.task_set_checklist_template(p_task_id uuid, p_template_id uuid) TO service_role;

CREATE FUNCTION public.task_step_history_checklist_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_action jsonb;
  v_open integer;
begin
  select a into v_action
  from public.tasks t
  join public.task_type_steps s on s.task_type_id = t.task_type_id and s.step_key = new.step_key
  cross join jsonb_array_elements(s.actions) a
  where t.id = new.task_id and a ->> 'key' = new.action_key;
  -- Not an action of the step (cancel) or a negative one: no check. Older routes have no kind; "reject" is negative
  -- there (the same fallback as actionColor in app/src/lib/routing.ts).
  if v_action is null
     or coalesce(v_action ->> 'kind', case when new.action_key = 'reject' then 'negative' end) = 'negative' then
    return new;
  end if;

  select count(*) into v_open
  from public.task_checklist_items i
  where i.task_id = new.task_id and i.step_key = new.step_key and i.required
    and not public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text);
  if v_open > 0 then
    raise exception 'Checklist step incomplete: % required item(s) of this step still open', v_open using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.task_step_history_checklist_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_step_history_checklist_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_step_history_checklist_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_step_history_checklist_guard() TO service_role;

CREATE FUNCTION public.task_type_steps_clear_checklist_steps() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.checklist_template_items i set step_key = null
  from public.checklist_templates c
  where c.id = i.template_id and c.task_type_id = old.task_type_id and i.step_key = old.step_key;
  return old;
end;
$$;


ALTER FUNCTION public.task_type_steps_clear_checklist_steps() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_steps_clear_checklist_steps() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_steps_clear_checklist_steps() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_steps_clear_checklist_steps() TO service_role;

CREATE FUNCTION public.tasks_add_default_checklist() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_template_id uuid;
begin
  if coalesce(current_setting('app.checklist_skip_default', true), '') = 'on' then
    return null;
  end if;
  select default_checklist_template_id into v_template_id from public.task_types where id = new.task_type_id;
  if v_template_id is not null then
    perform public.checklist_apply_template(new.id, v_template_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.tasks_add_default_checklist() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_add_default_checklist() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_add_default_checklist() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_add_default_checklist() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_add_default_checklist() TO service_role;

CREATE FUNCTION public.tasks_add_step_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.task_add_step_items(new.id);
  return null;
end;
$$;


ALTER FUNCTION public.tasks_add_step_items() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_add_step_items() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_add_step_items() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_add_step_items() TO service_role;

CREATE FUNCTION public.tasks_checklist_completion_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_open integer;
begin
  if coalesce(current_setting('app.task_action_kind', true), '') = 'negative' then
    return new;
  end if;
  select count(*) into v_open
  from public.task_checklist_items i
  where i.task_id = new.id and i.required
    and (i.step_key is null or exists (select 1 from public.task_step_history h where h.task_id = new.id and h.step_key = i.step_key))
    and not public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text);
  if v_open > 0 then
    raise exception 'Checklist incomplete: % required item(s) still open', v_open using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_checklist_completion_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_checklist_completion_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_checklist_completion_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_checklist_completion_guard() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_checklist_completion_guard() TO service_role;

CREATE FUNCTION public.recurring_add_interval(p_from date, p_kind text, p_count integer) RETURNS date
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_kind
    when 'daily' then p_from + p_count
    when 'weekly' then p_from + 7 * p_count
    when 'monthly' then (p_from + make_interval(months => p_count))::date
    when 'yearly' then (p_from + make_interval(years => p_count))::date
  end;
$$;


ALTER FUNCTION public.recurring_add_interval(p_from date, p_kind text, p_count integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_add_interval(p_from date, p_kind text, p_count integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_add_interval(p_from date, p_kind text, p_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_add_interval(p_from date, p_kind text, p_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.recurring_add_interval(p_from date, p_kind text, p_count integer) TO service_role;

CREATE FUNCTION public.recurring_on_task_finished() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  r public.recurring_task_rules;
  v_next date;
begin
  select * into r from public.recurring_task_rules where id = new.recurring_task_rule_id;
  if r.id is null or not r.active or r.repeat_mode <> 'after_completion' or r.schedule_kind = 'operating_hours' then
    return null;
  end if;
  v_next := public.recurring_add_interval(current_date, r.schedule_kind, r.interval_count);
  if r.end_date is not null and v_next > r.end_date then
    return null;
  end if;
  if new.status = 'done' then
    -- Not while another task of the series is still open (e.g. one created by hand).
    if not exists (select 1 from public.tasks where recurring_task_rule_id = r.id and id <> new.id and status not in ('done', 'cancelled')) then
      perform public.recurring_spawn_task(r, v_next);
    end if;
  else
    update public.recurring_task_rules set next_due_date = v_next where id = r.id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.recurring_on_task_finished() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_on_task_finished() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_on_task_finished() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_on_task_finished() TO authenticated;
GRANT ALL ON FUNCTION public.recurring_on_task_finished() TO service_role;

CREATE FUNCTION public.recurring_rules_check_task_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' or new.task_type_id is distinct from old.task_type_id)
     and not public.user_task_type_allowed(auth.uid(), new.task_type_id) then
    raise exception 'You are not allowed to use this task type';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.recurring_rules_check_task_type() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_rules_check_task_type() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_rules_check_task_type() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_rules_check_task_type() TO service_role;

CREATE FUNCTION public.recurring_rules_init() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.schedule_kind <> 'operating_hours' and new.next_due_date is null and new.repeat_mode = 'fixed_schedule' then
    new.next_due_date := new.start_date;
  end if;
  if new.schedule_kind <> 'operating_hours' and tg_op = 'INSERT' and new.next_due_date is null then
    new.next_due_date := new.start_date;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.recurring_rules_init() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_rules_init() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_rules_init() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_rules_init() TO authenticated;
GRANT ALL ON FUNCTION public.recurring_rules_init() TO service_role;

CREATE FUNCTION public.recurring_spawn_task(r public.recurring_task_rules, p_due date) RETURNS public.tasks
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
  insert into public.tasks (task_type_id, title, description, priority, due_date, team_id,
                            assigned_user_id, recurring_task_rule_id)
  values (r.task_type_id, r.name, r.description, r.priority, p_due, r.team_id,
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

CREATE FUNCTION public.generate_recurring_tasks(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  r public.recurring_task_rules;
  v_created integer := 0;
  v_due date;
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

        if r.next_due_date is null or r.next_due_date - r.lead_days > p_today
           or (r.end_date is not null and r.next_due_date > r.end_date) then
          continue;
        end if;
        v_due := r.next_due_date;

      perform public.recurring_spawn_task(r, v_due);

      if r.repeat_mode = 'after_completion' then
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

CREATE FUNCTION public.recurring_tasks_run_now() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may run this';
  end if;
  return public.generate_recurring_tasks();
end;
$$;


ALTER FUNCTION public.recurring_tasks_run_now() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.recurring_tasks_run_now() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recurring_tasks_run_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recurring_tasks_run_now() TO authenticated;
GRANT ALL ON FUNCTION public.recurring_tasks_run_now() TO service_role;

CREATE FUNCTION public.goal_progress(p_goal_id uuid) RETURNS numeric
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  g public.goals;
  v numeric;
begin
  select * into g from public.goals where id = p_goal_id;
  if g.id is null then
    return null;
  end if;
  if g.start_value is not null then
    if g.target_value = g.start_value then
      return case when g.current_value = g.target_value then 1 else 0 end;
    end if;
    return greatest(0, least(1, (g.current_value - g.start_value) / (g.target_value - g.start_value)));
  end if;
  select avg(public.goal_progress(c.id)) into v from public.goals c where c.parent_goal_id = p_goal_id;
  return v;
end;
$$;


ALTER FUNCTION public.goal_progress(p_goal_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.goal_progress(p_goal_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.goal_progress(p_goal_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.goal_progress(p_goal_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.goal_progress(p_goal_id uuid) TO service_role;

CREATE FUNCTION public.goal_check_in(p_goal_id uuid, p_value numeric, p_status text, p_comment text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  g public.goals;
begin
  select * into g from public.goals where id = p_goal_id;
  if g.id is null or auth.uid() is null or not public.user_has_goal_access(auth.uid(), p_goal_id, 'check') then
    raise exception 'No permission to check in on this goal';
  end if;
  if p_status is not null and p_status not in ('on_track', 'at_risk', 'off_track', 'achieved', 'dropped') then
    raise exception 'Unknown status';
  end if;
  if p_value is not null and g.start_value is null then
    raise exception 'This goal has no measure';
  end if;
  update public.goals
     set current_value = coalesce(p_value, current_value), status = coalesce(p_status, status)
   where id = p_goal_id;
  perform public.log_system_event('goals', p_goal_id, 'goal_check_in',
    jsonb_strip_nulls(jsonb_build_object('value', p_value, 'unit', g.measure_unit, 'status', p_status, 'comment', nullif(trim(p_comment), ''))));
end;
$$;


ALTER FUNCTION public.goal_check_in(p_goal_id uuid, p_value numeric, p_status text, p_comment text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.goal_check_in(p_goal_id uuid, p_value numeric, p_status text, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.goal_check_in(p_goal_id uuid, p_value numeric, p_status text, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.goal_check_in(p_goal_id uuid, p_value numeric, p_status text, p_comment text) TO authenticated;
GRANT ALL ON FUNCTION public.goal_check_in(p_goal_id uuid, p_value numeric, p_status text, p_comment text) TO service_role;

CREATE FUNCTION public.goals_check_tree() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_up uuid := new.parent_goal_id;
begin
  if tg_op = 'INSERT' and new.start_value is not null and new.current_value is null then
    new.current_value := new.start_value;
  end if;
  while v_up is not null loop
    if v_up = new.id then
      raise exception 'A goal cannot be placed below itself';
    end if;
    select parent_goal_id into v_up from public.goals where id = v_up;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION public.goals_check_tree() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.goals_check_tree() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.goals_check_tree() FROM PUBLIC;
GRANT ALL ON FUNCTION public.goals_check_tree() TO authenticated;
GRANT ALL ON FUNCTION public.goals_check_tree() TO service_role;

CREATE FUNCTION public.goals_log_created() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.log_system_event('goals', new.id, 'goal_created', jsonb_build_object('parent_goal_id', new.parent_goal_id));
  return null;
end;
$$;


ALTER FUNCTION public.goals_log_created() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.goals_log_created() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.goals_log_created() FROM PUBLIC;
GRANT ALL ON FUNCTION public.goals_log_created() TO authenticated;
GRANT ALL ON FUNCTION public.goals_log_created() TO service_role;

CREATE FUNCTION public.user_has_goal_access(p_user_id uuid, p_goal_id uuid, p_grant_type text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_owner uuid;
  v_perms text[];
begin
  select owner_user_id into v_owner from public.goals where id = p_goal_id;
  if not found then
    return false;
  end if;
  v_perms := public.user_permissions(p_user_id);
  return ('goals.' || p_grant_type || '.all') = any(v_perms)
      or (('goals.' || p_grant_type || '.own') = any(v_perms) and v_owner = p_user_id);
end;
$$;


ALTER FUNCTION public.user_has_goal_access(p_user_id uuid, p_goal_id uuid, p_grant_type text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_has_goal_access(p_user_id uuid, p_goal_id uuid, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_has_goal_access(p_user_id uuid, p_goal_id uuid, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_has_goal_access(p_user_id uuid, p_goal_id uuid, p_grant_type text) TO service_role;

CREATE FUNCTION public.task_contribution(p_task_id uuid) RETURNS TABLE(step integer, kind text, id uuid, number bigint, title text, status text, owner_name text, measure_label text, measure_unit text, start_value numeric, target_value numeric, current_value numeric, progress numeric, can_open boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_root uuid;
  v_goal uuid;
  v_perms text[];
begin
  if auth.uid() is null or not public.can_access_entity('tasks', p_task_id, 'view') then
    return;
  end if;
  v_perms := public.user_permissions(auth.uid());
  if not exists (select 1 from unnest(v_perms) p where p like 'goals.view.%') then
    return;
  end if;

  with recursive up (id, parent) as (
    select t.id, t.parent_task_id from public.tasks t where t.id = p_task_id
    union all
    select t.id, t.parent_task_id from public.tasks t join up on t.id = up.parent
  )
  select up.id into v_root from up where up.parent is null;
  select t.goal_id into v_goal from public.tasks t where t.id = v_root;

  if v_root is distinct from p_task_id and exists (
    select 1 from public.tasks t where t.id = v_root and t.is_initiative
  ) then
    return query
      select 0, 'initiative'::text, t.id, t.task_number, t.title, t.status, u.name,
             null::text, null::text, null::numeric, null::numeric, null::numeric, null::numeric,
             public.can_access_entity('tasks', t.id, 'view')
      from public.tasks t left join public.users u on u.id = t.assigned_user_id
      where t.id = v_root;
  end if;

  return query
    with recursive chain (id, parent, depth) as (
      select g.id, g.parent_goal_id, 1 from public.goals g where g.id = v_goal
      union all
      select g.id, g.parent_goal_id, c.depth + 1 from public.goals g join chain c on g.id = c.parent
    )
    select 1 + c.depth, 'goal'::text, g.id, g.goal_number, g.title, g.status, u.name,
           g.measure_label, g.measure_unit, g.start_value, g.target_value, g.current_value,
           public.goal_progress(g.id),
           ('goals.view.all' = any(v_perms)) or ('goals.view.own' = any(v_perms) and g.owner_user_id = auth.uid())
    from chain c
    join public.goals g on g.id = c.id
    left join public.users u on u.id = g.owner_user_id
    order by c.depth;
end;
$$;


ALTER FUNCTION public.task_contribution(p_task_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_contribution(p_task_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_contribution(p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_contribution(p_task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.task_contribution(p_task_id uuid) TO service_role;

CREATE FUNCTION public.tasks_check_bucket() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.bucket_id is not null
     and not exists (select 1 from public.initiative_buckets b
                     where b.id = new.bucket_id and b.initiative_task_id = new.root_task_id) then
    raise exception 'The bucket belongs to another initiative';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_check_bucket() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_check_bucket() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_check_bucket() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_check_bucket() TO service_role;

CREATE FUNCTION public.tasks_check_goal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.goal_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.goal_id is not distinct from old.goal_id and new.is_initiative is not distinct from old.is_initiative then
    return new;
  end if;
  if new.parent_task_id is not null
     or not new.is_initiative then
    raise exception 'Only an initiative can be linked to a goal';
  end if;
  if auth.uid() is not null and not exists (select 1 from public.goals g where g.id = new.goal_id) then
    raise exception 'You cannot link to this goal';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.tasks_check_goal() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_check_goal() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_check_goal() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_check_goal() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_check_goal() TO service_role;

CREATE FUNCTION public.tasks_initiative_is_root() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.is_initiative and new.parent_task_id is not null then
    raise exception 'An initiative cannot be a subtask';
  end if;
  if tg_op = 'UPDATE' and old.is_initiative and not new.is_initiative
     and (new.goal_id is not null or exists (select 1 from public.initiative_buckets b where b.initiative_task_id = new.id)) then
    raise exception 'Remove the goal link and the buckets before this task stops being an initiative';
  end if;
  return new;
end $$;


ALTER FUNCTION public.tasks_initiative_is_root() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_initiative_is_root() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_initiative_is_root() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_initiative_is_root() TO service_role;

CREATE FUNCTION public.tasks_log_goal_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.log_system_event('tasks', new.id, 'task_goal_changed',
    jsonb_build_object('old_goal_id', old.goal_id, 'new_goal_id', new.goal_id));
  return null;
end;
$$;


ALTER FUNCTION public.tasks_log_goal_change() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_log_goal_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_log_goal_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_log_goal_change() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_log_goal_change() TO service_role;

CREATE FUNCTION public.tasks_refresh_permission_module() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ update public.tasks set permission_module = case when is_initiative then 'initiatives' else public.permission_module_for(task_type_id) end
   where permission_module is distinct from case when is_initiative then 'initiatives' else public.permission_module_for(task_type_id) end; $$;


ALTER FUNCTION public.tasks_refresh_permission_module() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_refresh_permission_module() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_refresh_permission_module() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_refresh_permission_module() TO service_role;

CREATE FUNCTION public.task_record_effort(p_task_id uuid, p_work_hours numeric, p_downtime_from timestamp with time zone, p_downtime_to timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null or not public.can_access_entity('tasks', p_task_id, 'check') then
    raise exception 'No permission to record effort on this task';
  end if;
  update public.tasks
     set work_hours = p_work_hours, downtime_from = p_downtime_from, downtime_to = p_downtime_to
   where id = p_task_id;
end;
$$;


ALTER FUNCTION public.task_record_effort(p_task_id uuid, p_work_hours numeric, p_downtime_from timestamp with time zone, p_downtime_to timestamp with time zone) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_record_effort(p_task_id uuid, p_work_hours numeric, p_downtime_from timestamp with time zone, p_downtime_to timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_record_effort(p_task_id uuid, p_work_hours numeric, p_downtime_from timestamp with time zone, p_downtime_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_record_effort(p_task_id uuid, p_work_hours numeric, p_downtime_from timestamp with time zone, p_downtime_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.task_record_effort(p_task_id uuid, p_work_hours numeric, p_downtime_from timestamp with time zone, p_downtime_to timestamp with time zone) TO service_role;

CREATE FUNCTION public.invoice_path_access(p_path text, p_write boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_task uuid;
begin
  v_task := (string_to_array(p_path, '/'))[1]::uuid;
  if p_write then
    return public.rls_has('costs.edit') and public.can_access_entity('tasks', v_task, 'check');
  end if;
  return public.rls_has('costs.view') and public.can_access_entity('tasks', v_task, 'view');
exception when invalid_text_representation then
  return false;
end;
$$;


ALTER FUNCTION public.invoice_path_access(p_path text, p_write boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.invoice_path_access(p_path text, p_write boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invoice_path_access(p_path text, p_write boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invoice_path_access(p_path text, p_write boolean) TO authenticated;
GRANT ALL ON FUNCTION public.invoice_path_access(p_path text, p_write boolean) TO service_role;

CREATE FUNCTION public.record_access(p_entity_type text, p_entity_id uuid) RETURNS TABLE(kind text, ref_id uuid, label text, label_de text, access_level text, sources text[])
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
  if v_me is null or p_entity_type <> 'tasks' then
    return;
  end if;
  if not public.user_has_access(v_me, p_entity_type, p_entity_id, 'view') then
    return;
  end if;

  if p_entity_type = 'tasks' then
    select * into v_task from public.tasks where id = p_entity_id;
    v_module := v_task.permission_module;
    v_asset_id := v_task.asset_id;
  end if;

  return query
  with cand_team (team_id, source) as (
    select t, 'assigned' from unnest(case p_entity_type
      when 'tasks' then array[v_task.team_id, v_task.current_assignee_team_id]
      else array[]::uuid[] end) t
    where t is not null
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

CREATE FUNCTION public.send_task_reminders(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  rec record;
  v_sent integer := 0;
  v_logged integer;
begin
  for rec in
    with open_tasks as (
      select t.id, t.task_number, t.title, t.due_date, t.planned_date, t.assigned_user_id, t.team_id
      from public.tasks t
      where t.status not in ('done', 'cancelled')
    ),
    recipients as (
      select t.*, t.assigned_user_id as user_id from open_tasks t where t.assigned_user_id is not null
      union all
      select t.*, ug.user_id from open_tasks t join public.user_teams ug on ug.team_id = t.team_id
      where t.assigned_user_id is null
    ),
    with_prefs as (
      select r.*, coalesce(p.remind_planned_today, true) as want_today, coalesce(p.remind_due_soon, true) as want_soon,
             coalesce(p.remind_overdue, true) as want_overdue, coalesce(p.due_soon_days, 2) as soon_days
      from recipients r left join public.notification_preferences p on p.user_id = r.user_id
    )
    select id, task_number, title, user_id, 'planned_today' as kind, planned_date as ref_date, 0 as days
    from with_prefs where want_today and planned_date = p_today
    union all
    select id, task_number, title, user_id, 'due_soon', due_date, (due_date - p_today)
    from with_prefs where want_soon and due_date >= p_today and due_date <= p_today + soon_days
    union all
    select id, task_number, title, user_id, 'overdue', due_date, (p_today - due_date)
    from with_prefs where want_overdue and due_date < p_today
  loop
    if rec.kind = 'planned_today' then
      select count(*) into v_logged from public.reminder_log
        where task_id = rec.id and user_id = rec.user_id and kind = rec.kind and sent_on = p_today;
    elsif rec.kind = 'due_soon' then
      select count(*) into v_logged from public.reminder_log
        where task_id = rec.id and user_id = rec.user_id and kind = rec.kind and ref_date = rec.ref_date;
    else
      select count(*) into v_logged from public.reminder_log
        where task_id = rec.id and user_id = rec.user_id and kind = rec.kind and sent_on > p_today - 3;
    end if;
    continue when v_logged > 0;

    insert into public.reminder_log (task_id, user_id, kind, ref_date, sent_on)
    values (rec.id, rec.user_id, rec.kind, rec.ref_date, p_today);
    perform public.notify(
      array[rec.user_id], 'task_reminder_' || rec.kind, '#' || rec.task_number || ' ' || rec.title, '/tasks/' || rec.id, null,
      null, 'tasks', rec.id, 'task-reminder:' || rec.id, array['in_app'],
      jsonb_build_object('number', rec.task_number, 'title', rec.title, 'days', rec.days, 'due_date', to_char(rec.ref_date, 'DD.MM.YYYY')));
    v_sent := v_sent + 1;
  end loop;

  -- The log only needs the recent past.
  delete from public.reminder_log where sent_on < p_today - 60;
  return v_sent;
end;
$$;


ALTER FUNCTION public.send_task_reminders(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.send_task_reminders(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_task_reminders(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_task_reminders(p_today date) TO service_role;

CREATE FUNCTION public.task_reminders_run_now() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may run this';
  end if;
  return public.send_task_reminders();
end;
$$;


ALTER FUNCTION public.task_reminders_run_now() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_reminders_run_now() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_reminders_run_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_reminders_run_now() TO authenticated;
GRANT ALL ON FUNCTION public.task_reminders_run_now() TO service_role;

CREATE FUNCTION public.task_claim(p_task_id uuid) RETURNS public.tasks
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
  if v_task.status in ('done', 'cancelled') then
    raise exception 'Task is already %', v_task.status;
  end if;
  if v_task.assigned_user_id is not null then
    raise exception 'The task was already taken';
  end if;
  if v_task.team_id is null
     or not exists (select 1 from public.user_teams where team_id = v_task.team_id and user_id = v_uid) then
    raise exception 'The task does not belong to your team';
  end if;
  if not public.user_has_access(v_uid, 'tasks', p_task_id, 'edit') then
    raise exception 'You are not allowed to edit this task';
  end if;
  if not exists (select 1 from public.users where id = v_uid and has_login and not has_left) then
    raise exception 'This person cannot sign in';
  end if;

  perform set_config('app.task_engine', 'on', true);
  update public.tasks
  set assigned_user_id = v_uid,
      current_assignee_user_id = case when current_assignee_team_id is not null and current_assignee_user_id is null and current_assignee_role_id is null
                                      then v_uid else current_assignee_user_id end,
      current_assignee_team_id = case when current_assignee_team_id is not null and current_assignee_user_id is null and current_assignee_role_id is null
                                      then null else current_assignee_team_id end
  where id = p_task_id returning * into v_task;

  perform public.log_system_event('tasks', p_task_id, 'task_claimed',
    jsonb_strip_nulls(jsonb_build_object('team_id', v_task.team_id, 'step_key', v_task.current_step_key)), v_uid);
  return v_task;
end;
$$;


ALTER FUNCTION public.task_claim(p_task_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_claim(p_task_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_claim(p_task_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_claim(p_task_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.task_claim(p_task_id uuid) TO authenticated;

CREATE FUNCTION public.task_tree(p_root_id uuid) RETURNS TABLE(id uuid, parent_task_id uuid, depth integer, task_number bigint, title text, status text, priority text, due_date date, is_overdue boolean, task_type_name text, assigned_user_name text, team_name text, descendants_total integer, descendants_done integer, planned_date date, team_id uuid, assigned_user_id uuid, parent_due_date date, date_conflict text, expected_end date, task_type_name_de text, task_type_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with recursive tree as (
    select r.id, r.parent_task_id, r.status, 0 as depth, array[r.task_number] as path, array[r.id] as ids
    from public.tasks r
    where r.id = p_root_id
    union all
    select c.id, c.parent_task_id, c.status, p.depth + 1, p.path || c.task_number, p.ids || c.id
    from public.tasks c
    join tree p on c.parent_task_id = p.id
    where p.depth < 20
  )
  select
    tr.id, tr.parent_task_id, tr.depth, t.task_number, t.title, t.status, t.priority, t.due_date,
    (t.due_date is not null and t.due_date < current_date and t.status not in ('done', 'cancelled')),
    tt.name, au.name, g.name,
    (select count(*)::integer from tree d where tr.id = any(d.ids) and d.id <> tr.id and d.status <> 'cancelled'),
    (select count(*)::integer from tree d where tr.id = any(d.ids) and d.id <> tr.id and d.status = 'done'),
    t.planned_date, t.team_id, t.assigned_user_id,
    pt.due_date,
    public.task_date_conflict(t.status, t.due_date, pt.status, pt.due_date),
    case when t.due_date is not null and t.status not in ('done', 'cancelled') then greatest(t.due_date, current_date) end,
    tt.name_de, t.task_type_id
  from tree tr
  join public.tasks t on t.id = tr.id
  join public.task_types tt on tt.id = t.task_type_id
  left join public.tasks pt on pt.id = t.parent_task_id
  left join public.users au on au.id = t.assigned_user_id
  left join public.teams g on g.id = t.team_id
  order by tr.path;
$$;


ALTER FUNCTION public.task_tree(p_root_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_tree(p_root_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_tree(p_root_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_tree(p_root_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.task_tree(p_root_id uuid) TO authenticated;

CREATE FUNCTION public.my_report_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive bosses (id) as (
    select auth.uid()
    union
    select id from public.users where deputy_user_id = auth.uid()
  ),
  below (id, depth) as (
    select u.id, 1 from public.users u where u.supervisor_user_id in (select id from bosses)
    union
    select u.id, b.depth + 1 from public.users u join below b on u.supervisor_user_id = b.id where b.depth < 20
  )
  select coalesce(array_agg(distinct id) filter (where id is distinct from auth.uid()), '{}') from below;
$$;


ALTER FUNCTION public.my_report_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_report_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_report_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_report_ids() TO service_role;
GRANT ALL ON FUNCTION public.my_report_ids() TO authenticated;

CREATE FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_start integer;
begin
  if not exists (
    select 1 from public.tasks
    where id = p_task_id and created_by_user_id = auth.uid() and xmin = pg_current_xact_id()::xid
  ) then
    raise exception 'Task not found';
  end if;
  if p_blocks_parent is not null then
    update public.tasks set blocks_parent = p_blocks_parent
    where id = p_task_id and parent_task_id is not null and blocks_parent is distinct from p_blocks_parent;
  end if;
  if p_set_checklist then
    perform public.checklist_apply_template(p_task_id, p_checklist_template_id);
  end if;
  if coalesce(array_length(p_own_items, 1), 0) > 0 then
    select coalesce(max(sort_order), 0) into v_start from public.task_checklist_items where task_id = p_task_id;
    -- task_checklist_items_before asks for edit on the task; the check above stands in for it.
    perform set_config('app.checklist_internal', 'on', true);
    insert into public.task_checklist_items (task_id, sort_order, kind, label, required, from_template)
    select p_task_id, v_start + o, 'check', btrim(l), false, false
    from unnest(p_own_items) with ordinality as x (l, o)
    where nullif(btrim(l), '') is not null;
    perform set_config('app.checklist_internal', 'off', true);
  end if;
end;
$$;


ALTER FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) TO service_role;
GRANT ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) TO authenticated;

CREATE FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text DEFAULT 'normal'::text, p_description text DEFAULT NULL::text, p_anchor_type text DEFAULT NULL::text, p_anchor_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid, p_assigned_user_id uuid DEFAULT NULL::uuid, p_parent_task_id uuid DEFAULT NULL::uuid, p_is_initiative boolean DEFAULT false, p_blocks_parent boolean DEFAULT NULL::boolean, p_set_checklist boolean DEFAULT false, p_checklist_template_id uuid DEFAULT NULL::uuid, p_own_items text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  insert into public.tasks (task_type_id, title, description, anchor_type, anchor_id, priority, due_date, team_id, assigned_user_id,
                            parent_task_id, is_initiative)
  values (p_task_type_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_anchor_type, p_anchor_id, p_priority,
          p_due_date, p_team_id, p_assigned_user_id, p_parent_task_id, coalesce(p_is_initiative, false))
  returning id into v_id;
  perform public.task_create_finish(v_id, p_blocks_parent, p_set_checklist, p_checklist_template_id, p_own_items);
  return v_id;
end;
$$;


ALTER FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) TO service_role;
GRANT ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.a_tasks_default_assignment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.team_id is null and new.assigned_user_id is null then
    select default_team_id into new.team_id from public.task_types where id = new.task_type_id;
    if new.team_id is null and auth.uid() is not null and pg_trigger_depth() = 1 and new.recurring_task_rule_id is null then
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
  return null;
end;
$$;


ALTER FUNCTION public.tasks_log_events() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_log_events() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_log_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_log_events() TO authenticated;
GRANT ALL ON FUNCTION public.tasks_log_events() TO service_role;

CREATE OR REPLACE FUNCTION public.tasks_rederive_root() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  with recursive tree (id, root_id) as (
    select new.id, new.id
    union all
    select c.id, tr.root_id from tree tr join public.tasks c on c.parent_task_id = tr.id
  )
  update public.tasks t set root_task_id = tr.root_id, bucket_id = null
  from tree tr
  where t.id = tr.id and t.root_task_id is distinct from tr.root_id;
  return null;
end;
$$;


ALTER FUNCTION public.tasks_rederive_root() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_rederive_root() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_rederive_root() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_rederive_root() TO service_role;

CREATE OR REPLACE FUNCTION public.tasks_set_permission_module() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  new.permission_module := case when new.is_initiative then 'initiatives' else public.permission_module_for(new.task_type_id) end;
  return new;
end $$;


ALTER FUNCTION public.tasks_set_permission_module() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_set_permission_module() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_set_permission_module() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_set_permission_module() TO service_role;

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
         coalesce(not a.open and a.can_edit and a.recurring_task_rule_id is null, false)
  from a;
$$;


ALTER FUNCTION public.task_rights(p_task_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.attachments_check_entry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_type text;
  v_id uuid;
  v_author uuid;
begin
  if new.message_id is not null then
    select coalesce(c.anchor_type, 'conversations'), coalesce(c.anchor_id, c.id), m.author_user_id
      into v_type, v_id, v_author
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = new.message_id;
    if v_type is distinct from new.entity_type or v_id is distinct from new.entity_id then
      raise exception 'The message belongs to a different record';
    end if;
    if v_author is distinct from new.uploaded_by_user_id then
      raise exception 'Only the author of a message can add files to it';
    end if;
  end if;
  if new.event_id is not null and not exists (
    select 1 from public.activity_events e where e.id = new.event_id and e.entity_type = new.entity_type and e.entity_id = new.entity_id
  ) then
    raise exception 'The history entry belongs to a different record';
  end if;
  if new.checklist_item_id is not null and not (
    new.entity_type = 'tasks' and new.message_id is null and new.event_id is null and exists (
      select 1 from public.task_checklist_items i where i.id = new.checklist_item_id and i.task_id = new.entity_id
    )
  ) then
    raise exception 'The checklist item belongs to a different task';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.attachments_check_entry() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.attachments_check_entry() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attachments_check_entry() FROM PUBLIC;
GRANT ALL ON FUNCTION public.attachments_check_entry() TO authenticated;
GRANT ALL ON FUNCTION public.attachments_check_entry() TO service_role;

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create checklist templates" ON public.checklist_templates FOR INSERT WITH CHECK ((( SELECT public.is_admin() AS is_admin) OR ( SELECT public.rls_has('checklist_templates.create'::text) AS rls_has)));

CREATE POLICY "Delete checklist templates" ON public.checklist_templates FOR DELETE USING ((( SELECT public.is_admin() AS is_admin) OR ( SELECT public.rls_has('checklist_templates.delete'::text) AS rls_has)));

CREATE POLICY "Edit checklist templates" ON public.checklist_templates FOR UPDATE TO authenticated USING (( SELECT public.checklist_template_editable(checklist_templates.id) AS checklist_template_editable)) WITH CHECK ((( SELECT public.is_admin() AS is_admin) OR ( SELECT public.rls_has('checklist_templates.edit.all'::text) AS rls_has) OR ( SELECT public.rls_has('checklist_templates.edit.own'::text) AS rls_has)));

CREATE POLICY "Read checklist templates" ON public.checklist_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.checklist_templates AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER checklist_templates_clear_steps AFTER UPDATE OF task_type_id ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION public.checklist_templates_clear_steps();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create checklist template items" ON public.checklist_template_items FOR INSERT TO authenticated WITH CHECK ((( SELECT public.checklist_template_editable(checklist_template_items.template_id) AS checklist_template_editable) OR (( SELECT public.rls_has('checklist_templates.create'::text) AS rls_has) AND (EXISTS ( SELECT 1
   FROM public.checklist_templates t
  WHERE ((t.id = checklist_template_items.template_id) AND (t.owner_user_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "Delete checklist template items" ON public.checklist_template_items FOR DELETE TO authenticated USING ((( SELECT public.checklist_template_editable(checklist_template_items.template_id) AS checklist_template_editable) OR ( SELECT public.rls_has('checklist_templates.delete'::text) AS rls_has)));

CREATE POLICY "Edit checklist template items" ON public.checklist_template_items FOR UPDATE TO authenticated USING (( SELECT public.checklist_template_editable(checklist_template_items.template_id) AS checklist_template_editable)) WITH CHECK (( SELECT public.checklist_template_editable(checklist_template_items.template_id) AS checklist_template_editable));

CREATE POLICY "Read checklist template items" ON public.checklist_template_items FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.checklist_template_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER checklist_template_items_check_step BEFORE INSERT OR UPDATE OF step_key, template_id ON public.checklist_template_items FOR EACH ROW EXECUTE FUNCTION public.checklist_template_items_check_step();

ALTER TABLE public.task_type_step_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit task type step items" ON public.task_type_step_items TO authenticated USING (( SELECT public.task_type_editable(s.task_type_id) AS task_type_editable
   FROM public.task_type_steps s
  WHERE (s.id = task_type_step_items.step_id))) WITH CHECK (( SELECT public.task_type_editable(s.task_type_id) AS task_type_editable
   FROM public.task_type_steps s
  WHERE (s.id = task_type_step_items.step_id)));

CREATE POLICY "Read task type step items" ON public.task_type_step_items FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.task_type_step_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete task checklist items" ON public.task_checklist_items FOR DELETE TO authenticated USING (public.can_access_entity('tasks'::text, task_id, 'edit'::text));

CREATE POLICY "Edit task checklist items" ON public.task_checklist_items FOR UPDATE TO authenticated USING (public.can_access_entity('tasks'::text, task_id, 'check'::text)) WITH CHECK (public.can_access_entity('tasks'::text, task_id, 'check'::text));

CREATE POLICY "Insert task checklist items" ON public.task_checklist_items FOR INSERT TO authenticated WITH CHECK (public.can_access_entity('tasks'::text, task_id, 'edit'::text));

CREATE POLICY "Read task checklist items" ON public.task_checklist_items FOR SELECT TO authenticated USING (public.can_access_entity('tasks'::text, task_id, 'view'::text));

CREATE POLICY mfa_required ON public.task_checklist_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER task_checklist_items_after AFTER INSERT OR DELETE OR UPDATE ON public.task_checklist_items FOR EACH ROW EXECUTE FUNCTION public.task_checklist_items_after();

CREATE TRIGGER task_checklist_items_before BEFORE INSERT OR DELETE OR UPDATE ON public.task_checklist_items FOR EACH ROW EXECUTE FUNCTION public.task_checklist_items_before();

ALTER TABLE public.recurring_task_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create recurring rules per grant" ON public.recurring_task_rules FOR INSERT WITH CHECK ((( SELECT public.rls_has('recurring_tasks.create.all'::text) AS rls_has)));

CREATE POLICY "Delete recurring rules per grant" ON public.recurring_task_rules FOR DELETE USING ((( SELECT public.rls_has('recurring_tasks.delete.all'::text) AS rls_has)));

CREATE POLICY "Edit recurring rules per grant" ON public.recurring_task_rules FOR UPDATE USING ((( SELECT public.rls_has('recurring_tasks.edit.all'::text) AS rls_has))) WITH CHECK ((( SELECT public.rls_has('recurring_tasks.edit.all'::text) AS rls_has)));

CREATE POLICY "View recurring rules per grant" ON public.recurring_task_rules FOR SELECT USING ((( SELECT public.rls_has('recurring_tasks.view.all'::text) AS rls_has)));

CREATE POLICY mfa_required ON public.recurring_task_rules AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY task_type_allowed ON public.recurring_task_rules AS RESTRICTIVE TO authenticated USING ((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[]))) WITH CHECK ((task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])));

CREATE TRIGGER recurring_rules_check_task_type BEFORE INSERT OR UPDATE ON public.recurring_task_rules FOR EACH ROW EXECUTE FUNCTION public.recurring_rules_check_task_type();

CREATE TRIGGER recurring_rules_init BEFORE INSERT OR UPDATE ON public.recurring_task_rules FOR EACH ROW EXECUTE FUNCTION public.recurring_rules_init();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.recurring_task_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.task_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add costs" ON public.task_costs FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('costs.edit'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text)));

CREATE POLICY "Delete costs" ON public.task_costs FOR DELETE TO authenticated USING ((( SELECT public.rls_has('costs.edit'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text)));

CREATE POLICY "Edit costs" ON public.task_costs FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('costs.edit'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text))) WITH CHECK ((( SELECT public.rls_has('costs.edit'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text)));

CREATE POLICY "View costs" ON public.task_costs FOR SELECT TO authenticated USING ((( SELECT public.rls_has('costs.view'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'view'::text)));

CREATE POLICY mfa_required ON public.task_costs AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER task_costs_set_updated BEFORE INSERT OR UPDATE ON public.task_costs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create goals" ON public.goals FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('goals.create.all'::text) AS rls_has));

CREATE POLICY "Delete goals" ON public.goals FOR DELETE TO authenticated USING ((( SELECT public.rls_has('goals.delete.all'::text) AS rls_has) OR (( SELECT public.rls_has('goals.delete.own'::text) AS rls_has) AND (owner_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "Edit goals" ON public.goals FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('goals.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('goals.edit.own'::text) AS rls_has) AND (owner_user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((( SELECT public.rls_has('goals.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('goals.edit.own'::text) AS rls_has) AND (owner_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "View goals" ON public.goals FOR SELECT TO authenticated USING ((( SELECT public.rls_has('goals.view.all'::text) AS rls_has) OR (( SELECT public.rls_has('goals.view.own'::text) AS rls_has) AND (owner_user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY mfa_required ON public.goals AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER cleanup_feed AFTER DELETE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.cleanup_entity_feed('goals');

CREATE TRIGGER conversations_follow_team AFTER UPDATE OF team_id ON public.goals FOR EACH ROW WHEN ((old.team_id IS DISTINCT FROM new.team_id)) EXECUTE FUNCTION public.conversations_follow_team();

CREATE TRIGGER goals_check_tree BEFORE INSERT OR UPDATE OF parent_goal_id, start_value ON public.goals FOR EACH ROW EXECUTE FUNCTION public.goals_check_tree();

CREATE TRIGGER goals_log_created AFTER INSERT ON public.goals FOR EACH ROW EXECUTE FUNCTION public.goals_log_created();

CREATE TRIGGER goals_set_updated BEFORE INSERT OR UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.initiative_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit initiative buckets" ON public.initiative_buckets TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = initiative_buckets.initiative_task_id) AND (t.task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND public.rls_task_allows('edit'::text, t.permission_module, NULL::uuid, t.assigned_user_id, t.created_by_user_id, t.team_id, t.current_assignee_user_id, t.current_assignee_team_id, t.current_assignee_role_id, ( SELECT public.rls_my_permissions() AS rls_my_permissions), ( SELECT public.rls_my_team_ids() AS rls_my_team_ids), '{}'::text[], ( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = initiative_buckets.initiative_task_id) AND (t.task_type_id = ANY (( SELECT public.rls_my_task_type_ids() AS rls_my_task_type_ids)::uuid[])) AND public.rls_task_allows('edit'::text, t.permission_module, NULL::uuid, t.assigned_user_id, t.created_by_user_id, t.team_id, t.current_assignee_user_id, t.current_assignee_team_id, t.current_assignee_role_id, ( SELECT public.rls_my_permissions() AS rls_my_permissions), ( SELECT public.rls_my_team_ids() AS rls_my_team_ids), '{}'::text[], ( SELECT public.rls_my_assignee_ids() AS rls_my_assignee_ids))))));

CREATE POLICY "Read initiative buckets" ON public.initiative_buckets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE (t.id = initiative_buckets.initiative_task_id))));

CREATE POLICY mfa_required ON public.initiative_buckets AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.reminder_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

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
    au.name AS assigned_user_name,
    g.name AS team_name,
    cu.name AS created_by_name,
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
   FROM (((((((((((public.tasks t
     JOIN public.task_types tt ON ((tt.id = t.task_type_id)))
     LEFT JOIN public.task_type_steps st ON (((st.task_type_id = t.task_type_id) AND (st.step_key = t.current_step_key))))
     LEFT JOIN public.users ca ON ((ca.id = t.current_assignee_user_id)))
     LEFT JOIN public.users au ON ((au.id = t.assigned_user_id)))
     LEFT JOIN public.teams g ON ((g.id = t.team_id)))
     LEFT JOIN public.users cu ON ((cu.id = t.created_by_user_id)))
     LEFT JOIN public.teams cg ON ((cg.id = t.current_assignee_team_id)))
     LEFT JOIN public.roles cr ON ((cr.id = t.current_assignee_role_id)))
     LEFT JOIN public.tasks pt ON ((pt.id = t.parent_task_id)))
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

CREATE VIEW public.task_punctuality WITH (security_invoker='on') AS
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
            NULL::uuid AS asset_id,
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

CREATE VIEW public.goals_overview WITH (security_invoker='on') AS
 SELECT g.id,
    g.goal_number,
    g.title,
    g.description,
    g.parent_goal_id,
    g.owner_user_id,
    g.team_id,
    g.status,
    g.measure_label,
    g.measure_unit,
    g.start_value,
    g.target_value,
    g.current_value,
    g.measure_source,
    g.due_date,
    g.created_at,
    g.updated_at,
    g.created_by_user_id,
    g.updated_by_user_id,
    ou.name AS owner_name,
    gr.name AS team_name,
    public.goal_progress(g.id) AS progress,
    (g.start_value IS NULL) AS progress_is_derived,
    ( SELECT count(*) AS count
           FROM public.goals c
          WHERE (c.parent_goal_id = g.id)) AS sub_goal_count,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE (t.goal_id = g.id)) AS initiative_count,
    ( SELECT max(e.created_at) AS max
           FROM public.activity_events e
          WHERE ((e.entity_type = 'goals'::text) AND (e.entity_id = g.id) AND (e.event_type = 'goal_check_in'::text))) AS last_check_in_at
   FROM ((public.goals g
     LEFT JOIN public.users ou ON ((ou.id = g.owner_user_id)))
     LEFT JOIN public.teams gr ON ((gr.id = g.team_id)));


ALTER VIEW public.goals_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.goals_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.goals_overview TO authenticated;
GRANT ALL ON TABLE public.goals_overview TO service_role;

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
    o.assigned_user_name,
    o.team_name,
    o.created_by_name,
    o.is_overdue,
    o.checklist_items_total,
    o.checklist_items_done,
    o.parent_task_number,
    o.parent_title,
    o.subtask_count,
    o.open_subtask_count,
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
    g.name AS team_name,
    u.name AS assigned_user_name,
    ct.name AS checklist_template_name,
    ( SELECT count(*) AS count
           FROM public.tasks t
          WHERE ((t.recurring_task_rule_id = r.id) AND (t.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))) AS open_task_count,
    tt.name_de AS task_type_name_de
   FROM ((((public.recurring_task_rules r
     JOIN public.task_types tt ON ((tt.id = r.task_type_id)))
     LEFT JOIN public.teams g ON ((g.id = r.team_id)))
     LEFT JOIN public.users u ON ((u.id = r.assigned_user_id)))
     LEFT JOIN public.checklist_templates ct ON ((ct.id = r.checklist_template_id)));


ALTER VIEW public.recurring_task_rules_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.recurring_task_rules_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.recurring_task_rules_overview TO authenticated;
GRANT ALL ON TABLE public.recurring_task_rules_overview TO service_role;

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
    t.task_type_id,
    tt.name AS task_type_name,
    tt.name_de AS task_type_name_de,
    NULL::text AS purpose,
    t.current_step_key,
    s.name AS current_step_name,
    s.name_de AS current_step_name_de,
    t.current_assignee_user_id,
    t.current_assignee_team_id,
    s.actions AS step_actions,
    ( SELECT (count(*))::integer AS count
           FROM public.task_checklist_items i
          WHERE ((i.task_id = t.id) AND (i.step_key = t.current_step_key) AND i.required AND (NOT public.checklist_item_answered(i.kind, i.done, i.result, i.value_number, i.value_text)))) AS step_open_required
   FROM (((public.tasks t
     JOIN public.task_type_steps s ON (((s.task_type_id = t.task_type_id) AND (s.step_key = t.current_step_key))))
     JOIN public.task_types tt ON ((tt.id = t.task_type_id)))
     LEFT JOIN public.users cu ON ((cu.id = t.created_by_user_id)))
  WHERE ((t.status <> ALL (ARRAY['done'::text, 'cancelled'::text])) AND s.is_decision AND (t.created_by_user_id IS DISTINCT FROM auth.uid()) AND ((t.current_assignee_user_id = ANY (public.rls_my_assignee_ids())) OR ((t.current_assignee_user_id IS NULL) AND ((t.current_assignee_role_id IS NOT NULL) OR (t.current_assignee_team_id IS NOT NULL)) AND ((t.current_assignee_role_id IS NULL) OR (t.current_assignee_role_id = ANY (public.rls_my_role_ids()))) AND ((t.current_assignee_team_id IS NULL) OR (t.current_assignee_team_id = ANY (public.rls_my_team_ids()))))));


ALTER VIEW public.tasks_to_decide OWNER TO postgres;

REVOKE ALL ON TABLE public.tasks_to_decide FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.tasks_to_decide TO authenticated;
GRANT ALL ON TABLE public.tasks_to_decide TO service_role;

CREATE VIEW public.tasks_decided_by_me WITH (security_invoker='on') AS
 SELECT h.id,
    h.task_id,
    t.task_number,
    t.title,
    t.status,
    tt.name AS task_type_name,
    tt.name_de AS task_type_name_de,
    NULL::text AS purpose,
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
    NULL::text AS purpose,
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

CREATE FUNCTION public.punctuality_scope(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) RETURNS SETOF public.task_punctuality
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
    and p_asset_id is null
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

CREATE FUNCTION public.punctuality_stats(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_asset_id uuid DEFAULT NULL::uuid, p_rule_id uuid DEFAULT NULL::uuid, p_root_task_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid, p_task_type_id uuid DEFAULT NULL::uuid, p_bucket text DEFAULT 'month'::text) RETURNS TABLE(period date, total bigint, on_time bigint, rescheduled bigint, late bigint, avg_days_late numeric, max_days_late integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    case when p_bucket = 'all' then null else date_trunc(p_bucket, s.completed_on)::date end,
    count(*),
    count(*) filter (where s.outcome = 'on_time'),
    count(*) filter (where s.outcome = 'rescheduled'),
    count(*) filter (where s.outcome = 'late'),
    round(avg(s.days_late) filter (where s.outcome = 'late'), 1),
    max(s.days_late)::integer
  from public.punctuality_scope(p_from, p_to, p_asset_id, p_rule_id, p_root_task_id, p_team_id, p_task_type_id) s
  where p_bucket in ('month', 'quarter', 'year', 'all')
  group by 1
  order by 1;
$$;


ALTER FUNCTION public.punctuality_stats(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid, p_bucket text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.punctuality_stats(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid, p_bucket text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.punctuality_stats(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid, p_bucket text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.punctuality_stats(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid, p_bucket text) TO authenticated;
GRANT ALL ON FUNCTION public.punctuality_stats(p_from date, p_to date, p_asset_id uuid, p_rule_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid, p_bucket text) TO service_role;

CREATE FUNCTION public.punctuality_breakdown(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_asset_id uuid DEFAULT NULL::uuid, p_root_task_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid, p_task_type_id uuid DEFAULT NULL::uuid) RETURNS TABLE(group_key uuid, title text, is_series boolean, asset_id uuid, last_task_id uuid, last_completed_on date, total bigint, on_time bigint, rescheduled bigint, late bigint, avg_days_late numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    coalesce(s.recurring_task_rule_id, s.task_id),
    coalesce(max(r.name), max(s.title)),
    bool_or(s.recurring_task_rule_id is not null),
    (array_agg(s.asset_id order by s.completed_at desc))[1],
    (array_agg(s.task_id order by s.completed_at desc))[1],
    max(s.completed_on),
    count(*),
    count(*) filter (where s.outcome = 'on_time'),
    count(*) filter (where s.outcome = 'rescheduled'),
    count(*) filter (where s.outcome = 'late'),
    round(avg(s.days_late) filter (where s.outcome = 'late'), 1)
  from public.punctuality_scope(p_from, p_to, p_asset_id, null, p_root_task_id, p_team_id, p_task_type_id) s
  left join public.recurring_task_rules r on r.id = s.recurring_task_rule_id
  group by 1
  order by count(*) filter (where s.outcome = 'late')::numeric / count(*) desc, count(*) desc;
$$;


ALTER FUNCTION public.punctuality_breakdown(p_from date, p_to date, p_asset_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.punctuality_breakdown(p_from date, p_to date, p_asset_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.punctuality_breakdown(p_from date, p_to date, p_asset_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.punctuality_breakdown(p_from date, p_to date, p_asset_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.punctuality_breakdown(p_from date, p_to date, p_asset_id uuid, p_root_task_id uuid, p_team_id uuid, p_task_type_id uuid) TO service_role;

CREATE INDEX task_types_default_checklist_template_id_idx ON public.task_types USING btree (default_checklist_template_id);

CREATE INDEX tasks_bucket_id_idx ON public.tasks USING btree (bucket_id) WHERE (bucket_id IS NOT NULL);

CREATE INDEX tasks_checklist_template_id_idx ON public.tasks USING btree (checklist_template_id);

CREATE INDEX tasks_goal_id_idx ON public.tasks USING btree (goal_id) WHERE (goal_id IS NOT NULL);

CREATE INDEX tasks_is_initiative_idx ON public.tasks USING btree (id) WHERE is_initiative;

CREATE INDEX tasks_recurring_task_rule_id_idx ON public.tasks USING btree (recurring_task_rule_id) WHERE (recurring_task_rule_id IS NOT NULL);

CREATE INDEX attachments_checklist_item_id_idx ON public.attachments USING btree (checklist_item_id) WHERE (checklist_item_id IS NOT NULL);

ALTER TABLE ONLY public.task_types
    ADD CONSTRAINT task_types_default_checklist_template_id_fkey FOREIGN KEY (default_checklist_template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES public.initiative_buckets(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_checklist_template_id_fkey FOREIGN KEY (checklist_template_id) REFERENCES public.checklist_templates(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_recurring_task_rule_id_fkey FOREIGN KEY (recurring_task_rule_id) REFERENCES public.recurring_task_rules(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_checklist_item_id_fkey FOREIGN KEY (checklist_item_id) REFERENCES public.task_checklist_items(id) ON DELETE CASCADE;

CREATE TRIGGER recurring_on_task_finished AFTER UPDATE OF status ON public.tasks FOR EACH ROW WHEN (((new.recurring_task_rule_id IS NOT NULL) AND (new.status = ANY (ARRAY['done'::text, 'cancelled'::text])) AND (old.status <> ALL (ARRAY['done'::text, 'cancelled'::text])))) EXECUTE FUNCTION public.recurring_on_task_finished();

CREATE TRIGGER tasks_add_default_checklist AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_add_default_checklist();

CREATE TRIGGER tasks_add_step_items AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_add_step_items();

CREATE TRIGGER tasks_check_bucket BEFORE INSERT OR UPDATE OF bucket_id, root_task_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_check_bucket();

CREATE TRIGGER tasks_check_goal BEFORE INSERT OR UPDATE OF goal_id, task_type_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_check_goal();

CREATE TRIGGER tasks_checklist_completion_guard BEFORE UPDATE OF status ON public.tasks FOR EACH ROW WHEN (((new.status = 'done'::text) AND (old.status IS DISTINCT FROM 'done'::text))) EXECUTE FUNCTION public.tasks_checklist_completion_guard();

CREATE TRIGGER tasks_initiative_is_root BEFORE INSERT OR UPDATE OF is_initiative, parent_task_id ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_initiative_is_root();

CREATE TRIGGER tasks_log_goal_change AFTER UPDATE OF goal_id ON public.tasks FOR EACH ROW WHEN ((old.goal_id IS DISTINCT FROM new.goal_id)) EXECUTE FUNCTION public.tasks_log_goal_change();

CREATE TRIGGER task_step_history_checklist_guard BEFORE UPDATE OF left_at ON public.task_step_history FOR EACH ROW WHEN (((old.left_at IS NULL) AND (new.left_at IS NOT NULL))) EXECUTE FUNCTION public.task_step_history_checklist_guard();

CREATE TRIGGER task_type_steps_clear_checklist_steps AFTER DELETE ON public.task_type_steps FOR EACH ROW EXECUTE FUNCTION public.task_type_steps_clear_checklist_steps();

-- Hand-written part of the task-family module (after the objects copied from COMPASS).

-- Permissions: COMPASS's registry rows for the family, without the assigned_assets scope (comes with the asset module).
-- COMPASS's module `initiative` is `initiatives` (decision T8); its literals belong to the task family (rls_task_modules).
insert into public.permissions (key, module, action, scope, sort_order, task_family)
select 'initiatives.' || a.a || '.' || s.s, 'initiatives', a.a, s.s, 400 + a.o * 10 + s.o, true
from (values ('view', 1), ('check', 2), ('edit', 3), ('create', 4), ('delete', 5)) a (a, o),
     (values ('assigned', 1), ('created', 2), ('team', 3), ('all', 4)) s (s, o)
where not (a.a = 'create' and s.s = 'assigned');
insert into public.permissions (key, module, action, scope, sort_order) values
  ('recurring_tasks.view.all', 'recurring_tasks', 'view', 'all', 460),
  ('recurring_tasks.edit.all', 'recurring_tasks', 'edit', 'all', 461),
  ('recurring_tasks.create.all', 'recurring_tasks', 'create', 'all', 462),
  ('recurring_tasks.delete.all', 'recurring_tasks', 'delete', 'all', 463),
  ('checklist_templates.create', 'checklist_templates', 'create', null, 470),
  ('checklist_templates.delete', 'checklist_templates', 'delete', null, 471),
  ('checklist_templates.edit.own', 'checklist_templates', 'edit', 'own', 472),
  ('checklist_templates.edit.all', 'checklist_templates', 'edit', 'all', 473),
  ('costs.view', 'costs', 'view', null, 480),
  ('costs.edit', 'costs', 'edit', null, 481),
  ('goals.view.own', 'goals', 'view', 'own', 490),
  ('goals.view.contributing', 'goals', 'view', 'contributing', 491),
  ('goals.view.all', 'goals', 'view', 'all', 492),
  ('goals.check.own', 'goals', 'check', 'own', 493),
  ('goals.check.all', 'goals', 'check', 'all', 494),
  ('goals.edit.own', 'goals', 'edit', 'own', 495),
  ('goals.edit.all', 'goals', 'edit', 'all', 496),
  ('goals.create.all', 'goals', 'create', 'all', 497),
  ('goals.delete.own', 'goals', 'delete', 'own', 498),
  ('goals.delete.all', 'goals', 'delete', 'all', 499);
insert into public.permission_implies (permission, implies)
select 'initiatives.' || a || '.' || s, 'initiatives.' || i || '.' || s
from (values ('check', 'view'), ('edit', 'check'), ('edit', 'view'), ('create', 'view'), ('delete', 'view')) x (a, i),
     (values ('assigned'), ('created'), ('team'), ('all')) ss (s)
where not (a = 'create' and s = 'assigned');
insert into public.permission_implies (permission, implies) values
  ('recurring_tasks.create.all', 'recurring_tasks.view.all'), ('recurring_tasks.delete.all', 'recurring_tasks.view.all'),
  ('recurring_tasks.edit.all', 'recurring_tasks.view.all'), ('costs.edit', 'costs.view'),
  ('goals.check.all', 'goals.view.all'), ('goals.check.own', 'goals.view.own'), ('goals.create.all', 'goals.view.all'),
  ('goals.delete.all', 'goals.view.all'), ('goals.delete.own', 'goals.view.own'), ('goals.edit.all', 'goals.check.all'),
  ('goals.edit.all', 'goals.view.all'), ('goals.edit.own', 'goals.check.own'), ('goals.edit.own', 'goals.view.own'),
  ('goals.view.all', 'goals.view.contributing');

-- Goals as a record type (COMPASS user_has_access / record_moderator / conversation_label / conversation_team, branch 'goals').
create function public.goals_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'goals.edit.all' = any (public.user_permissions(p_user_id));
  end if;
  return public.user_has_goal_access(p_user_id, p_entity_id, p_action);
end $$;
create function public.goals_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$
  select '#' || g.goal_number || ' ' || g.title from public.goals g where g.id = p_entity_id; $$;
create function public.goals_team(p_entity_id uuid) returns uuid
  language sql stable security definer set search_path to '' as $$ select g.team_id from public.goals g where g.id = p_entity_id; $$;
revoke all on function public.goals_access(uuid, uuid, text), public.goals_label(uuid), public.goals_team(uuid) from public, anon;
grant execute on function public.goals_access(uuid, uuid, text), public.goals_label(uuid), public.goals_team(uuid)
  to authenticated, service_role;
select public.entity_type_register('goals', 'task-family', 'goals_access', null, 'A goal', 'goals_label', 'goals_team', null);

-- Search: goals (COMPASS global_search, block 'goals'); access per hit like the other sources.
create function public.goals_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language plpgsql stable security definer set search_path to '' as $$
declare
  v_user uuid := auth.uid();
  v_pattern text := '%' || p_term || '%';
  r record;
  v_n integer := 0;
begin
  if v_user is null then
    return;
  end if;
  for r in
    select g.id, g.goal_number, g.title, g.status, g.created_at,
      (greatest(public.search_field_score(g.title, p_term), public.search_field_score(g.description, p_term) * 0.7)
        + case when g.goal_number = p_number then 2 else 0 end)::real as score
    from public.goals g
    where g.goal_number = p_number or g.title ilike v_pattern or (p_fuzzy and p_term operator(extensions.<%) g.title)
       or g.description ilike v_pattern
    order by score desc limit 200
  loop
    exit when v_n >= 8;
    continue when not coalesce(public.user_has_access(v_user, 'goals', r.id, 'view'), false);
    v_n := v_n + 1;
    return next row('goals', r.id, r.score, r.goal_number, r.title, null, r.status, null, null, null, null, r.created_at, null)::public.search_hit;
  end loop;
end $$;
revoke all on function public.goals_search(text, boolean, bigint) from public, anon;
grant execute on function public.goals_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('goals', 'task-family', 'goals_search', 'Goals by number, title and description');

-- Notifications (COMPASS: email_notification_types / push_notification_types; all four are mailed in the digest).
select public.notification_type_register('task_for_team', 'task-family', false, 'A task is waiting for your team', true, true);
select public.notification_type_register('task_reminder_planned_today', 'task-family', true, 'Reminder: a task is planned for today', false, true);
select public.notification_type_register('task_reminder_due_soon', 'task-family', true, 'Reminder: a task is due soon', false, true);
select public.notification_type_register('task_reminder_overdue', 'task-family', true, 'Reminder: a task is overdue', false, true);

-- Jobs (COMPASS cron.job rows).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('generate-recurring-tasks', '0 4 * * *', 'select public.generate_recurring_tasks()');
  perform cron.schedule('send-task-reminders', '0 5 * * 1-5', 'select public.send_task_reminders()');
exception when others then
  raise notice 'pg_cron unavailable (%): schedule generate_recurring_tasks() and send_task_reminders() externally', sqlerrm;
end $$;

-- Invoices of task costs (COMPASS storage bucket 'invoices' and its policies; the path starts with the task id).
insert into storage.buckets (id, name, public, file_size_limit) values ('invoices', 'invoices', false, 26214400)
on conflict (id) do nothing;
create policy "Read invoice files" on storage.objects for select to authenticated
  using (((bucket_id = 'invoices'::text) and public.invoice_path_access(name, false)));
create policy "Upload invoice files" on storage.objects for insert to authenticated
  with check (((bucket_id = 'invoices'::text) and public.invoice_path_access(name, true)));
create policy "Delete invoice files" on storage.objects for delete to authenticated
  using (((bucket_id = 'invoices'::text) and public.invoice_path_access(name, true)));

-- Reminder switches on the profile (COMPASS pages/profile/reminders.tsx): everybody edits their own row's columns.
grant select (remind_planned_today, remind_due_soon, remind_overdue, due_soon_days),
      insert (remind_planned_today, remind_due_soon, remind_overdue, due_soon_days),
      update (remind_planned_today, remind_due_soon, remind_overdue, due_soon_days)
  on public.notification_preferences to authenticated;

