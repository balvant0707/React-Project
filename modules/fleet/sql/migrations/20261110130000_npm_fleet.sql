-- NPM fleet slice (WP 3 + 4 without the parts that read specifications/orders): vessels, history, ship type groups, hull events,
-- newbuilding details and projects, rollups, overviews. Source: NPM database. Renames: tenants -> teams, groups -> teams, rls_holds -> rls_has; the admin overrule is removed.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.vessels (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    imo text NOT NULL,
    name text NOT NULL,
    deadweight_tonnage double precision,
    gross_tonnage numeric,
    net_tonnage numeric,
    flag text,
    built_date date,
    ship_type text,
    class_society text,
    status text,
    vessel_sanction text,
    overall_risk_rating text,
    docking_survey_date date,
    shipbuilder text,
    shipbuilder_country text,
    group_owner text,
    group_owner_country text,
    ship_manager text,
    ship_manager_country text,
    technical_manager text,
    technical_manager_country text,
    operator text,
    operator_country text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    group_owner_company_id uuid,
    group_owner_company_is_manual boolean DEFAULT false NOT NULL,
    technical_manager_company_id uuid,
    technical_manager_company_is_manual boolean DEFAULT false NOT NULL,
    operator_company_id uuid,
    operator_company_is_manual boolean DEFAULT false NOT NULL,
    ship_manager_company_id uuid,
    ship_manager_company_is_manual boolean DEFAULT false NOT NULL,
    length_overall_m numeric,
    length_between_perpendiculars_m numeric,
    moulded_beam_m numeric,
    moulded_depth_m numeric,
    ship_type_group text,
    shipbuilder_company_id uuid,
    shipbuilder_company_is_manual boolean DEFAULT false NOT NULL
);

REVOKE ALL ON TABLE public.vessels FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessels TO authenticated;
GRANT ALL ON TABLE public.vessels TO service_role;

CREATE TABLE public.vessel_history (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    vessel_imo text NOT NULL,
    name text,
    deadweight_tonnage numeric,
    gross_tonnage numeric,
    net_tonnage numeric,
    flag text,
    built_date date,
    ship_type text,
    class_society text,
    status text,
    vessel_sanction text,
    overall_risk_rating text,
    docking_survey_date date,
    shipbuilder text,
    shipbuilder_country text,
    group_owner text,
    group_owner_country text,
    ship_manager text,
    ship_manager_country text,
    technical_manager text,
    technical_manager_country text,
    operator text,
    operator_country text,
    group_owner_company_id uuid,
    group_owner_company_is_manual boolean,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone DEFAULT now() NOT NULL,
    technical_manager_company_id uuid,
    technical_manager_company_is_manual boolean,
    operator_company_id uuid,
    operator_company_is_manual boolean,
    ship_manager_company_id uuid,
    ship_manager_company_is_manual boolean,
    shipbuilder_company_id uuid,
    shipbuilder_company_is_manual boolean
);

REVOKE ALL ON TABLE public.vessel_history FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessel_history TO authenticated;
GRANT ALL ON TABLE public.vessel_history TO service_role;

CREATE TABLE public.ship_type_mappings (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    ship_type text NOT NULL,
    group_phrase_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.ship_type_mappings FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.ship_type_mappings TO authenticated;
GRANT ALL ON TABLE public.ship_type_mappings TO service_role;

CREATE TABLE public.hull_events (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    vessel_id uuid,
    type_phrase_id uuid NOT NULL,
    type_code text NOT NULL,
    status text DEFAULT 'Open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lost_reason text,
    supplier_last_hullevent_id uuid,
    supplier_this_hullevent_id uuid,
    event_date date DEFAULT CURRENT_DATE NOT NULL,
    dealer_company_id uuid,
    sales_account_user_id uuid DEFAULT auth.uid(),
    assigned_team_id uuid,
    reported_by_user_id uuid DEFAULT auth.uid(),
    technical_service_rep_user_id uuid,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    project_code text,
    snapshot_vessel_name text,
    shipyard_company_id uuid,
    snapshot_group_owner_company_id uuid,
    snapshot_technical_manager_company_id uuid,
    snapshot_operator_company_id uuid,
    snapshot_ship_manager_company_id uuid,
    customer_company_id uuid,
    vertical_af_product_id uuid,
    flat_bottom_af_product_id uuid,
    facilitating_partner_company_id uuid,
    service_period_months integer,
    vertical_offered_af_product_id uuid,
    flat_bottom_offered_af_product_id uuid,
    location_continent text,
    location_country_id uuid,
    opportunity_value numeric,
    opportunity_value_currency text,
    opportunity_exchange_rate numeric,
    newbuilding_project_id uuid,
    dock_in_date date,
    dock_out_date date,
    second_technical_service_rep_user_id uuid,
    performance_guarantee boolean,
    opportunity_litres numeric,
    CONSTRAINT hull_events_af_products_need_supplier CHECK ((((vertical_af_product_id IS NULL) AND (flat_bottom_af_product_id IS NULL)) OR (supplier_this_hullevent_id IS NOT NULL))),
    CONSTRAINT hull_events_location_continent_check CHECK ((location_continent = ANY (ARRAY['Europe'::text, 'Asia'::text, 'Middle East'::text, 'Africa'::text, 'North America'::text, 'South America'::text, 'Oceania'::text]))),
    CONSTRAINT hull_events_project_only_for_newbuilding CHECK (((newbuilding_project_id IS NULL) OR (type_code = 'NB'::text)))
);

REVOKE ALL ON TABLE public.hull_events FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.hull_events TO authenticated;
GRANT ALL ON TABLE public.hull_events TO service_role;

CREATE TABLE public.hull_event_newbuilding_details (
    hull_event_id uuid NOT NULL,
    newbuilding_code text,
    newbuilding_deadweight_tonnage numeric,
    newbuilding_teu numeric,
    contract_date date,
    steel_cut_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid
);

REVOKE ALL ON TABLE public.hull_event_newbuilding_details FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.hull_event_newbuilding_details TO authenticated;
GRANT ALL ON TABLE public.hull_event_newbuilding_details TO service_role;

CREATE TABLE public.newbuilding_projects (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    title text NOT NULL,
    shipyard_company_id uuid,
    customer_company_id uuid NOT NULL,
    owner_associate_company_id uuid,
    bidding_date date,
    status text DEFAULT 'Open'::text NOT NULL,
    lost_reason text,
    maker_company_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    estimated_contract_value numeric,
    estimated_contract_value_currency text,
    cash_rebate numeric,
    sales_account_user_id uuid DEFAULT auth.uid(),
    assigned_team_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    ship_type text,
    CONSTRAINT newbuilding_projects_title_check CHECK ((btrim(title) <> ''::text))
);

REVOKE ALL ON TABLE public.newbuilding_projects FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.newbuilding_projects TO authenticated;
GRANT ALL ON TABLE public.newbuilding_projects TO service_role;

CREATE TABLE public.vessel_hull_event_summary (
    vessel_id uuid NOT NULL,
    dd_count bigint DEFAULT 0 NOT NULL,
    has_nb boolean DEFAULT false NOT NULL,
    last_event_id uuid,
    last_event_date date,
    last_service_end date DEFAULT 'infinity'::date NOT NULL,
    last_maker_is_own boolean DEFAULT false NOT NULL,
    first_nb_event_id uuid,
    next_event_id uuid,
    next_event_date date,
    due_on date
);

REVOKE ALL ON TABLE public.vessel_hull_event_summary FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessel_hull_event_summary TO authenticated;
GRANT ALL ON TABLE public.vessel_hull_event_summary TO service_role;

CREATE TABLE public.companies_vessel_rollup (
    company_id uuid NOT NULL,
    is_total boolean DEFAULT false NOT NULL,
    ship_type_group text DEFAULT ''::text NOT NULL,
    vessel_count bigint DEFAULT 0 NOT NULL,
    technical_manager_vessel_count bigint DEFAULT 0 NOT NULL,
    operator_vessel_count bigint DEFAULT 0 NOT NULL,
    unique_vessel_count bigint DEFAULT 0 NOT NULL,
    dwt_sum numeric,
    np_now_count bigint DEFAULT 0 NOT NULL,
    np_technical_manager_vessel_count bigint DEFAULT 0 NOT NULL,
    np_operator_vessel_count bigint DEFAULT 0 NOT NULL,
    np_unique_vessel_count bigint DEFAULT 0 NOT NULL,
    np_nb_count bigint DEFAULT 0 NOT NULL,
    survey_due_count_y0 bigint DEFAULT 0 NOT NULL,
    survey_due_count_y1 bigint DEFAULT 0 NOT NULL,
    survey_due_count_y2 bigint DEFAULT 0 NOT NULL
);

REVOKE ALL ON TABLE public.companies_vessel_rollup FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.companies_vessel_rollup TO authenticated;
GRANT ALL ON TABLE public.companies_vessel_rollup TO service_role;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_imo_key UNIQUE (imo);

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_pkey PRIMARY KEY (id);

CREATE INDEX vessels_created_by_user_id_idx ON public.vessels USING btree (created_by_user_id);

CREATE INDEX vessels_deadweight_tonnage_asc_idx ON public.vessels USING btree (deadweight_tonnage, id);

CREATE INDEX vessels_deadweight_tonnage_desc_idx ON public.vessels USING btree (deadweight_tonnage DESC NULLS LAST, id);

CREATE INDEX vessels_group_owner_company_id_idx ON public.vessels USING btree (group_owner_company_id);

CREATE INDEX vessels_imo_trgm_idx ON public.vessels USING gin (imo extensions.gin_trgm_ops);

CREATE INDEX vessels_name_idx ON public.vessels USING btree (name);

CREATE INDEX vessels_name_trgm_idx ON public.vessels USING gin (name extensions.gin_trgm_ops);

CREATE INDEX vessels_operator_company_id_idx ON public.vessels USING btree (operator_company_id);

CREATE INDEX vessels_ship_manager_company_id_idx ON public.vessels USING btree (ship_manager_company_id);

CREATE INDEX vessels_ship_type_group_name_idx ON public.vessels USING btree (ship_type_group, name);

CREATE INDEX vessels_shipbuilder_company_id_idx ON public.vessels USING btree (shipbuilder_company_id);

CREATE INDEX vessels_technical_manager_company_id_idx ON public.vessels USING btree (technical_manager_company_id);

ALTER TABLE ONLY public.vessel_history
    ADD CONSTRAINT vessel_history_pkey PRIMARY KEY (id);

CREATE INDEX vessel_history_vessel_imo_idx ON public.vessel_history USING btree (vessel_imo);

ALTER TABLE ONLY public.ship_type_mappings
    ADD CONSTRAINT ship_type_mappings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ship_type_mappings
    ADD CONSTRAINT ship_type_mappings_ship_type_key UNIQUE (ship_type);

CREATE INDEX ship_type_mappings_group_phrase_id_idx ON public.ship_type_mappings USING btree (group_phrase_id);

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_pkey PRIMARY KEY (id);

CREATE INDEX hull_events_assigned_team_id_idx ON public.hull_events USING btree (assigned_team_id);

CREATE INDEX hull_events_assigned_user_id_idx ON public.hull_events USING btree (sales_account_user_id);

CREATE INDEX hull_events_created_at_idx ON public.hull_events USING btree (created_at DESC);

CREATE INDEX hull_events_created_at_no_ss_idx ON public.hull_events USING btree (created_at DESC) WHERE (type_code <> 'SS'::text);

CREATE INDEX hull_events_created_by_user_id_idx ON public.hull_events USING btree (created_by_user_id);

CREATE INDEX hull_events_customer_company_id_idx ON public.hull_events USING btree (customer_company_id);

CREATE INDEX hull_events_dealer_company_id_idx ON public.hull_events USING btree (dealer_company_id);

CREATE INDEX hull_events_event_date_idx ON public.hull_events USING btree (event_date);

CREATE INDEX hull_events_facilitating_partner_company_id_idx ON public.hull_events USING btree (facilitating_partner_company_id);

CREATE INDEX hull_events_flat_bottom_af_product_id_idx ON public.hull_events USING btree (flat_bottom_af_product_id);

CREATE INDEX hull_events_flat_bottom_offered_af_product_id_idx ON public.hull_events USING btree (flat_bottom_offered_af_product_id);

CREATE INDEX hull_events_location_country_id_idx ON public.hull_events USING btree (location_country_id);

CREATE INDEX hull_events_newbuilding_project_id_idx ON public.hull_events USING btree (newbuilding_project_id);

CREATE INDEX hull_events_opportunity_value_idx ON public.hull_events USING btree (opportunity_value);

CREATE UNIQUE INDEX hull_events_project_code_idx ON public.hull_events USING btree (project_code) WHERE (project_code IS NOT NULL);

CREATE INDEX hull_events_reported_by_user_id_idx ON public.hull_events USING btree (reported_by_user_id);

CREATE INDEX hull_events_second_technical_service_rep_user_id_idx ON public.hull_events USING btree (second_technical_service_rep_user_id);

CREATE INDEX hull_events_shipyard_company_id_idx ON public.hull_events USING btree (shipyard_company_id);

CREATE INDEX hull_events_snapshot_group_owner_company_id_idx ON public.hull_events USING btree (snapshot_group_owner_company_id);

CREATE INDEX hull_events_snapshot_operator_company_id_idx ON public.hull_events USING btree (snapshot_operator_company_id);

CREATE INDEX hull_events_snapshot_ship_manager_company_id_idx ON public.hull_events USING btree (snapshot_ship_manager_company_id);

CREATE INDEX hull_events_snapshot_technical_manager_company_id_idx ON public.hull_events USING btree (snapshot_technical_manager_company_id);

CREATE INDEX hull_events_status_idx ON public.hull_events USING btree (status);

CREATE INDEX hull_events_supplier_last_hullevent_id_idx ON public.hull_events USING btree (supplier_last_hullevent_id);

CREATE INDEX hull_events_supplier_this_hullevent_id_idx ON public.hull_events USING btree (supplier_this_hullevent_id);

CREATE INDEX hull_events_technical_service_rep_user_id_idx ON public.hull_events USING btree (technical_service_rep_user_id);

CREATE INDEX hull_events_type_phrase_id_idx ON public.hull_events USING btree (type_phrase_id);

CREATE INDEX hull_events_vertical_af_product_id_idx ON public.hull_events USING btree (vertical_af_product_id);

CREATE INDEX hull_events_vertical_offered_af_product_id_idx ON public.hull_events USING btree (vertical_offered_af_product_id);

CREATE INDEX hull_events_vessel_id_idx ON public.hull_events USING btree (vessel_id);

ALTER TABLE ONLY public.hull_event_newbuilding_details
    ADD CONSTRAINT hull_event_newbuilding_details_pkey PRIMARY KEY (hull_event_id);

CREATE INDEX hull_event_newbuilding_details_created_by_user_id_idx ON public.hull_event_newbuilding_details USING btree (created_by_user_id);

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_pkey PRIMARY KEY (id);

CREATE INDEX newbuilding_projects_assigned_team_id_idx ON public.newbuilding_projects USING btree (assigned_team_id);

CREATE INDEX newbuilding_projects_created_by_user_id_idx ON public.newbuilding_projects USING btree (created_by_user_id);

CREATE INDEX newbuilding_projects_customer_company_id_idx ON public.newbuilding_projects USING btree (customer_company_id);

CREATE INDEX newbuilding_projects_maker_company_ids_idx ON public.newbuilding_projects USING gin (maker_company_ids);

CREATE INDEX newbuilding_projects_owner_associate_company_id_idx ON public.newbuilding_projects USING btree (owner_associate_company_id);

CREATE INDEX newbuilding_projects_sales_account_user_id_idx ON public.newbuilding_projects USING btree (sales_account_user_id);

CREATE INDEX newbuilding_projects_shipyard_company_id_idx ON public.newbuilding_projects USING btree (shipyard_company_id);

ALTER TABLE ONLY public.vessel_hull_event_summary
    ADD CONSTRAINT vessel_hull_event_summary_pkey PRIMARY KEY (vessel_id);

CREATE INDEX vessel_hull_event_summary_dd_idx ON public.vessel_hull_event_summary USING btree (dd_count) WHERE (dd_count > 0);

CREATE INDEX vessel_hull_event_summary_due_idx ON public.vessel_hull_event_summary USING btree (due_on) WHERE (due_on IS NOT NULL);

CREATE INDEX vessel_hull_event_summary_expired_idx ON public.vessel_hull_event_summary USING btree (last_service_end) WHERE (next_event_date IS NULL);

CREATE INDEX vessel_hull_event_summary_nb_idx ON public.vessel_hull_event_summary USING btree (vessel_id) WHERE has_nb;

CREATE INDEX vessel_hull_event_summary_own_idx ON public.vessel_hull_event_summary USING btree (last_service_end) WHERE last_maker_is_own;

ALTER TABLE ONLY public.companies_vessel_rollup
    ADD CONSTRAINT companies_vessel_rollup_pkey PRIMARY KEY (company_id, is_total, ship_type_group);

CREATE INDEX companies_vessel_rollup_group_idx ON public.companies_vessel_rollup USING btree (ship_type_group, company_id) WHERE (NOT is_total);

CREATE INDEX companies_vessel_rollup_total_dwt_sum_idx ON public.companies_vessel_rollup USING btree (dwt_sum DESC NULLS LAST) WHERE is_total;

CREATE INDEX companies_vessel_rollup_total_unique_vessel_count_idx ON public.companies_vessel_rollup USING btree (unique_vessel_count DESC) WHERE is_total;

CREATE INDEX companies_vessel_rollup_total_vessel_count_idx ON public.companies_vessel_rollup USING btree (vessel_count DESC) WHERE is_total;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_group_owner_company_id_fkey FOREIGN KEY (group_owner_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_operator_company_id_fkey FOREIGN KEY (operator_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_ship_manager_company_id_fkey FOREIGN KEY (ship_manager_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_shipbuilder_company_id_fkey FOREIGN KEY (shipbuilder_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_technical_manager_company_id_fkey FOREIGN KEY (technical_manager_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessels
    ADD CONSTRAINT vessels_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.ship_type_mappings
    ADD CONSTRAINT ship_type_mappings_group_phrase_id_fkey FOREIGN KEY (group_phrase_id) REFERENCES public.phrases(id);

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_assigned_user_id_fkey FOREIGN KEY (sales_account_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_customer_company_id_fkey FOREIGN KEY (customer_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_dealer_company_id_fkey FOREIGN KEY (dealer_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_facilitating_partner_company_id_fkey FOREIGN KEY (facilitating_partner_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_flat_bottom_af_product_fkey FOREIGN KEY (supplier_this_hullevent_id, flat_bottom_af_product_id) REFERENCES public.antifouling_products(supplier_id, id) ON DELETE SET NULL (flat_bottom_af_product_id);

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_flat_bottom_offered_af_product_id_fkey FOREIGN KEY (flat_bottom_offered_af_product_id) REFERENCES public.antifouling_products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_location_country_id_fkey FOREIGN KEY (location_country_id) REFERENCES public.countries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_newbuilding_project_id_fkey FOREIGN KEY (newbuilding_project_id) REFERENCES public.newbuilding_projects(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_reported_by_user_id_fkey FOREIGN KEY (reported_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_second_technical_service_rep_user_id_fkey FOREIGN KEY (second_technical_service_rep_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_shipyard_company_id_fkey FOREIGN KEY (shipyard_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_snapshot_group_owner_company_id_fkey FOREIGN KEY (snapshot_group_owner_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_snapshot_operator_company_id_fkey FOREIGN KEY (snapshot_operator_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_snapshot_ship_manager_company_id_fkey FOREIGN KEY (snapshot_ship_manager_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_snapshot_technical_manager_company_id_fkey FOREIGN KEY (snapshot_technical_manager_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_supplier_last_hullevent_id_fkey FOREIGN KEY (supplier_last_hullevent_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_supplier_this_hullevent_id_fkey FOREIGN KEY (supplier_this_hullevent_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_technical_service_rep_user_id_fkey FOREIGN KEY (technical_service_rep_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_type_phrase_id_fkey FOREIGN KEY (type_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_vertical_af_product_fkey FOREIGN KEY (supplier_this_hullevent_id, vertical_af_product_id) REFERENCES public.antifouling_products(supplier_id, id) ON DELETE SET NULL (vertical_af_product_id);

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_vertical_offered_af_product_id_fkey FOREIGN KEY (vertical_offered_af_product_id) REFERENCES public.antifouling_products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_events
    ADD CONSTRAINT hull_events_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.hull_event_newbuilding_details
    ADD CONSTRAINT hull_event_newbuilding_details_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.hull_event_newbuilding_details
    ADD CONSTRAINT hull_event_newbuilding_details_hull_event_id_fkey FOREIGN KEY (hull_event_id) REFERENCES public.hull_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.hull_event_newbuilding_details
    ADD CONSTRAINT hull_event_newbuilding_details_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_customer_company_id_fkey FOREIGN KEY (customer_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_owner_associate_company_id_fkey FOREIGN KEY (owner_associate_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_sales_account_user_id_fkey FOREIGN KEY (sales_account_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_shipyard_company_id_fkey FOREIGN KEY (shipyard_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.newbuilding_projects
    ADD CONSTRAINT newbuilding_projects_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.vessel_hull_event_summary
    ADD CONSTRAINT vessel_hull_event_summary_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.companies_vessel_rollup
    ADD CONSTRAINT companies_vessel_rollup_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE FUNCTION public.vessels_set_updated_at_and_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if coalesce(current_setting('app.sync_ship_type_group', true), 'off') = 'on' then
    return new;
  end if;
  new.updated_at = now();
  new.updated_by_user_id = auth.uid();
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_set_updated_at_and_by() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_set_updated_at_and_by() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_set_updated_at_and_by() TO authenticated;
GRANT ALL ON FUNCTION public.vessels_set_updated_at_and_by() TO service_role;

CREATE FUNCTION public.vessels_write_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.vessel_history (
    vessel_imo, name, deadweight_tonnage, gross_tonnage, net_tonnage, flag, built_date,
    ship_type, class_society, status, vessel_sanction, overall_risk_rating, docking_survey_date,
    shipbuilder, shipbuilder_country,
    group_owner, group_owner_country, ship_manager, ship_manager_country,
    technical_manager, technical_manager_country, operator, operator_country,
    group_owner_company_id, group_owner_company_is_manual,
    ship_manager_company_id, ship_manager_company_is_manual,
    technical_manager_company_id, technical_manager_company_is_manual,
    operator_company_id, operator_company_is_manual,
    shipbuilder_company_id, shipbuilder_company_is_manual,
    valid_from, valid_until
  ) values (
    OLD.imo, OLD.name, OLD.deadweight_tonnage, OLD.gross_tonnage, OLD.net_tonnage, OLD.flag, OLD.built_date,
    OLD.ship_type, OLD.class_society, OLD.status, OLD.vessel_sanction, OLD.overall_risk_rating, OLD.docking_survey_date,
    OLD.shipbuilder, OLD.shipbuilder_country,
    OLD.group_owner, OLD.group_owner_country, OLD.ship_manager, OLD.ship_manager_country,
    OLD.technical_manager, OLD.technical_manager_country, OLD.operator, OLD.operator_country,
    OLD.group_owner_company_id, OLD.group_owner_company_is_manual,
    OLD.ship_manager_company_id, OLD.ship_manager_company_is_manual,
    OLD.technical_manager_company_id, OLD.technical_manager_company_is_manual,
    OLD.operator_company_id, OLD.operator_company_is_manual,
    OLD.shipbuilder_company_id, OLD.shipbuilder_company_is_manual,
    OLD.updated_at, now()
  );
  return NEW;
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_write_history() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_write_history() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_write_history() TO authenticated;
GRANT ALL ON FUNCTION public.vessels_write_history() TO service_role;

CREATE FUNCTION public.vessels_set_ship_type_group() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.ship_type_group := public.ship_type_group_for(new.ship_type);
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_set_ship_type_group() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_set_ship_type_group() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_set_ship_type_group() TO authenticated;
GRANT ALL ON FUNCTION public.vessels_set_ship_type_group() TO service_role;

CREATE FUNCTION public.vessels_add_company_types() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.company_add_types(
    array[NEW.group_owner_company_id, NEW.ship_manager_company_id, NEW.technical_manager_company_id, NEW.operator_company_id, NEW.shipbuilder_company_id],
    array['owner', 'ship_manager', 'technical_manager', 'operator', 'shipyard']);
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_add_company_types() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_add_company_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_add_company_types() TO authenticated;
GRANT ALL ON FUNCTION public.vessels_add_company_types() TO service_role;

CREATE FUNCTION public.vessels_resolve_company_links_on_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not NEW.group_owner_company_is_manual then
    NEW.group_owner_company_id := public.get_or_create_seaweb_company(NEW.group_owner, NEW.group_owner_country);
  end if;

  if not NEW.ship_manager_company_is_manual then
    NEW.ship_manager_company_id := public.get_or_create_seaweb_company(NEW.ship_manager, NEW.ship_manager_country);
  end if;

  if not NEW.technical_manager_company_is_manual then
    NEW.technical_manager_company_id := public.get_or_create_seaweb_company(NEW.technical_manager, NEW.technical_manager_country);
  end if;

  if not NEW.operator_company_is_manual then
    NEW.operator_company_id := public.get_or_create_seaweb_company(NEW.operator, NEW.operator_country);
  end if;

  if not NEW.shipbuilder_company_is_manual then
    NEW.shipbuilder_company_id := public.get_or_create_seaweb_shipbuilder_company(NEW.shipbuilder, NEW.shipbuilder_country);
  end if;

  return NEW;
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_resolve_company_links_on_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_resolve_company_links_on_write() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_resolve_company_links_on_write() TO authenticated;
GRANT ALL ON FUNCTION public.vessels_resolve_company_links_on_write() TO service_role;

CREATE FUNCTION public.vessels_sync_hull_event_snapshots() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.hull_events he
  set snapshot_group_owner_company_id =
        case when he.snapshot_group_owner_company_id is not distinct from OLD.group_owner_company_id
             then NEW.group_owner_company_id else he.snapshot_group_owner_company_id end,
      snapshot_ship_manager_company_id =
        case when he.snapshot_ship_manager_company_id is not distinct from OLD.ship_manager_company_id
             then NEW.ship_manager_company_id else he.snapshot_ship_manager_company_id end,
      snapshot_technical_manager_company_id =
        case when he.snapshot_technical_manager_company_id is not distinct from OLD.technical_manager_company_id
             then NEW.technical_manager_company_id else he.snapshot_technical_manager_company_id end,
      snapshot_operator_company_id =
        case when he.snapshot_operator_company_id is not distinct from OLD.operator_company_id
             then NEW.operator_company_id else he.snapshot_operator_company_id end
  where he.vessel_id = NEW.id
    and (he.event_date is null or he.event_date >= current_date);
  return NEW;
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_sync_hull_event_snapshots() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_sync_hull_event_snapshots() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_sync_hull_event_snapshots() TO authenticated;
GRANT ALL ON FUNCTION public.vessels_sync_hull_event_snapshots() TO service_role;

CREATE FUNCTION public.vessel_name_at(p_vessel_imo text, p_at timestamp with time zone) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(
    (
      select vh.name
      from public.vessel_history vh
      where vh.vessel_imo = p_vessel_imo
        and vh.valid_from <= p_at
        and p_at < vh.valid_until
      order by vh.valid_from desc
      limit 1
    ),
    (select v.name from public.vessels v where v.imo = p_vessel_imo)
  );
$$;

REVOKE ALL ON FUNCTION public.vessel_name_at(p_vessel_imo text, p_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_name_at(p_vessel_imo text, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessel_name_at(p_vessel_imo text, p_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.vessel_name_at(p_vessel_imo text, p_at timestamp with time zone) TO service_role;

CREATE FUNCTION public.ship_type_group_for(p_ship_type text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select p.text_en
       from public.ship_type_mappings m
       join public.phrases p on p.id = m.group_phrase_id
      where m.ship_type = p_ship_type),
    p_ship_type)
$$;

REVOKE ALL ON FUNCTION public.ship_type_group_for(p_ship_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ship_type_group_for(p_ship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ship_type_group_for(p_ship_type text) TO authenticated;
GRANT ALL ON FUNCTION public.ship_type_group_for(p_ship_type text) TO service_role;

CREATE FUNCTION public.sync_ship_type_group(p_ship_type text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    SET statement_timeout TO '120s'
    AS $$
declare
  v_count integer;
begin
  perform set_config('app.sync_ship_type_group', 'on', true);
  update public.vessels v
     set ship_type_group = public.ship_type_group_for(v.ship_type)
   where (p_ship_type is null or v.ship_type = p_ship_type)
     and v.ship_type_group is distinct from public.ship_type_group_for(v.ship_type);
  get diagnostics v_count = row_count;
  perform set_config('app.sync_ship_type_group', 'off', true);
  return v_count;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_ship_type_group(p_ship_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_ship_type_group(p_ship_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_ship_type_group(p_ship_type text) TO service_role;

CREATE FUNCTION public.phrases_sync_ship_type_group() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    SET statement_timeout TO '120s'
    AS $$
declare
  m record;
begin
  for m in select ship_type from public.ship_type_mappings where group_phrase_id = new.id loop
    perform public.sync_ship_type_group(m.ship_type);
  end loop;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.phrases_sync_ship_type_group() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.phrases_sync_ship_type_group() FROM PUBLIC;
GRANT ALL ON FUNCTION public.phrases_sync_ship_type_group() TO authenticated;
GRANT ALL ON FUNCTION public.phrases_sync_ship_type_group() TO service_role;

CREATE FUNCTION public.set_ship_type_group(p_ship_type text, p_group_phrase_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    SET statement_timeout TO '120s'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may change the ship type groups';
  end if;
  if p_group_phrase_id is null then
    delete from public.ship_type_mappings where ship_type = p_ship_type;
  else
    if not exists (select 1 from public.phrases p where p.id = p_group_phrase_id and p.category = 'ship_type_group') then
      raise exception 'Not a ship type group';
    end if;
    insert into public.ship_type_mappings (ship_type, group_phrase_id) values (p_ship_type, p_group_phrase_id)
    on conflict (ship_type) do update set group_phrase_id = excluded.group_phrase_id;
  end if;
  return public.sync_ship_type_group(p_ship_type);
end;
$$;

REVOKE ALL ON FUNCTION public.set_ship_type_group(p_ship_type text, p_group_phrase_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_ship_type_group(p_ship_type text, p_group_phrase_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_ship_type_group(p_ship_type text, p_group_phrase_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_ship_type_group(p_ship_type text, p_group_phrase_id uuid) TO service_role;

CREATE FUNCTION public.get_or_create_seaweb_shipbuilder_company(p_text text, p_country_text text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_country_id uuid;
begin
  if v_text = '' then
    return null;
  end if;

  select id into v_id
  from public.companies
  where source = 'seaweb' and lower(seaweb_match_name) = lower(v_text);

  if v_id is not null then
    return v_id;
  end if;

  if p_country_text is not null and btrim(p_country_text) <> '' then
    select id into v_country_id from public.countries where lower(name_en) = lower(btrim(p_country_text));
  end if;

  insert into public.companies (name, seaweb_match_name, source, country_id)
  values (v_text, v_text, 'seaweb', v_country_id)
  returning id into v_id;

  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_seaweb_shipbuilder_company(p_text text, p_country_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_or_create_seaweb_shipbuilder_company(p_text text, p_country_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_or_create_seaweb_shipbuilder_company(p_text text, p_country_text text) TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_seaweb_shipbuilder_company(p_text text, p_country_text text) TO service_role;

CREATE FUNCTION public.hull_events_add_company_types() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.company_add_types(
    array[NEW.shipyard_company_id, NEW.dealer_company_id, NEW.facilitating_partner_company_id, NEW.supplier_this_hullevent_id, NEW.supplier_last_hullevent_id],
    array['shipyard', 'dealer', 'facilitating_partner', 'maker', 'maker']);
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.hull_events_add_company_types() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hull_events_add_company_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.hull_events_add_company_types() TO authenticated;
GRANT ALL ON FUNCTION public.hull_events_add_company_types() TO service_role;

CREATE FUNCTION public.newbuilding_projects_add_company_types() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  m uuid;
begin
  perform public.company_add_type(NEW.shipyard_company_id, 'shipyard');
  foreach m in array coalesce(NEW.maker_company_ids, '{}') loop
    perform public.company_add_type(m, 'maker');
  end loop;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.newbuilding_projects_add_company_types() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.newbuilding_projects_add_company_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.newbuilding_projects_add_company_types() TO authenticated;
GRANT ALL ON FUNCTION public.newbuilding_projects_add_company_types() TO service_role;

CREATE FUNCTION public.copy_vessel_snapshot_to_hull_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.vessels%rowtype;
begin
  -- type_code must be set regardless of vessel presence (an NB event can
  -- start with no vessel at all) - resolved before the vessel-snapshot
  -- early-return below, which only concerns the snapshot_* columns. This is
  -- the true, final definition of this trigger function (redefined several
  -- times across migration history - see 20260916090000/20260917100000
  -- for the earlier ones) so this is where the addition has to live.
  new.type_code := coalesce(new.type_code, (select code from public.phrases where id = new.type_phrase_id));
  if new.vessel_id is null then
    return new;
  end if;
  select * into v from public.vessels where id = new.vessel_id;
  if not found then
    return new;
  end if;
  new.snapshot_group_owner_company_id := coalesce(new.snapshot_group_owner_company_id, v.group_owner_company_id);
  new.snapshot_ship_manager_company_id := coalesce(new.snapshot_ship_manager_company_id, v.ship_manager_company_id);
  new.snapshot_technical_manager_company_id := coalesce(new.snapshot_technical_manager_company_id, v.technical_manager_company_id);
  new.snapshot_operator_company_id := coalesce(new.snapshot_operator_company_id, v.operator_company_id);
  new.snapshot_vessel_name := coalesce(
    new.snapshot_vessel_name,
    public.vessel_name_at(v.imo, coalesce(new.event_date::timestamptz, now()))
  );
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.copy_vessel_snapshot_to_hull_event() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.copy_vessel_snapshot_to_hull_event() FROM PUBLIC;
GRANT ALL ON FUNCTION public.copy_vessel_snapshot_to_hull_event() TO authenticated;
GRANT ALL ON FUNCTION public.copy_vessel_snapshot_to_hull_event() TO service_role;

CREATE FUNCTION public.user_account_hull_event_ids(p_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with a as materialized (select public.user_account_company_ids(p_user_id) as id)
  select h.id from public.hull_events h join a on a.id = h.customer_company_id
  union select h.id from public.hull_events h join a on a.id = h.dealer_company_id
  union select h.id from public.hull_events h join a on a.id = h.facilitating_partner_company_id
  union select h.id from public.hull_events h join a on a.id = h.shipyard_company_id
  union select h.id from public.hull_events h join a on a.id = h.snapshot_group_owner_company_id
  union select h.id from public.hull_events h join a on a.id = h.snapshot_operator_company_id
  union select h.id from public.hull_events h join a on a.id = h.snapshot_ship_manager_company_id
  union select h.id from public.hull_events h join a on a.id = h.snapshot_technical_manager_company_id;
$$;

REVOKE ALL ON FUNCTION public.user_account_hull_event_ids(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_account_hull_event_ids(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_account_hull_event_ids(p_user_id uuid) TO service_role;

CREATE FUNCTION public.rls_my_account_hull_event_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.user_account_hull_event_ids(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.rls_my_account_hull_event_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_account_hull_event_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_account_hull_event_ids() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_account_hull_event_ids() TO service_role;

CREATE FUNCTION public.hull_events_row_allows(p_action text, p_id uuid, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sales uuid;
  v_tsr uuid;
  v_team uuid;
begin
  select sales_account_user_id, technical_service_rep_user_id, assigned_team_id into v_sales, v_tsr, v_team
  from public.hull_events where id = p_id;
  if not found then
    return false;
  end if;
  if ('hull_events.' || p_action || '.all') = any((p_ctx).permissions) then
    return true;
  end if;
  if ('hull_events.' || p_action || '.own') = any((p_ctx).permissions) and (p_ctx).user_id in (v_sales, v_tsr) then
    return true;
  end if;
  if ('hull_events.' || p_action || '.team') = any((p_ctx).permissions) and v_team = any((p_ctx).team_ids) then
    return true;
  end if;
  if ('hull_events.' || p_action || '.account') = any((p_ctx).permissions) then
    return exists (
      select 1 from public.hull_events h
      join public.companies c on c.id = any(array[h.customer_company_id, h.dealer_company_id, h.facilitating_partner_company_id, h.shipyard_company_id, h.snapshot_group_owner_company_id, h.snapshot_operator_company_id, h.snapshot_ship_manager_company_id, h.snapshot_technical_manager_company_id])
      where h.id = p_id and (c.sales_account_user_id = (p_ctx).user_id or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)));
  end if;
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.hull_events_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hull_events_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hull_events_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.hull_events_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.hull_events_can_edit(rec public.hull_events) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.can_access_entity('hull_events', rec.id, 'edit');
$$;

REVOKE ALL ON FUNCTION public.hull_events_can_edit(rec public.hull_events) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hull_events_can_edit(rec public.hull_events) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hull_events_can_edit(rec public.hull_events) TO authenticated;
GRANT ALL ON FUNCTION public.hull_events_can_edit(rec public.hull_events) TO service_role;

CREATE FUNCTION public.hull_events_can_approve(rec public.hull_events) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.can_access_entity('hull_events', rec.id, 'approve');
$$;

REVOKE ALL ON FUNCTION public.hull_events_can_approve(rec public.hull_events) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hull_events_can_approve(rec public.hull_events) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hull_events_can_approve(rec public.hull_events) TO authenticated;
GRANT ALL ON FUNCTION public.hull_events_can_approve(rec public.hull_events) TO service_role;

CREATE FUNCTION public.newbuilding_projects_row_allows(p_action text, p_id uuid, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sales uuid;
  v_team uuid;
  v_companies uuid[];
begin
  select sales_account_user_id, assigned_team_id, array[customer_company_id, shipyard_company_id, owner_associate_company_id]
    into v_sales, v_team, v_companies
  from public.newbuilding_projects where id = p_id;
  if not found then
    return false;
  end if;
  if ('newbuildings.' || p_action || '.all') = any((p_ctx).permissions) then
    return true;
  end if;
  if ('newbuildings.' || p_action || '.own') = any((p_ctx).permissions) and v_sales = (p_ctx).user_id then
    return true;
  end if;
  if ('newbuildings.' || p_action || '.team') = any((p_ctx).permissions) and v_team = any((p_ctx).team_ids) then
    return true;
  end if;
  if ('newbuildings.' || p_action || '.account') = any((p_ctx).permissions) then
    return exists (
      select 1 from public.companies c
      where c.id = any(v_companies)
        and (c.sales_account_user_id = (p_ctx).user_id
             or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)));
  end if;
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.newbuilding_projects_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.newbuilding_projects_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.newbuilding_projects_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.newbuilding_projects_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.newbuilding_projects_can_edit(rec public.newbuilding_projects) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.newbuilding_projects_row_allows('edit', rec.id, public.access_context()); $$;

REVOKE ALL ON FUNCTION public.newbuilding_projects_can_edit(rec public.newbuilding_projects) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.newbuilding_projects_can_edit(rec public.newbuilding_projects) FROM PUBLIC;
GRANT ALL ON FUNCTION public.newbuilding_projects_can_edit(rec public.newbuilding_projects) TO authenticated;
GRANT ALL ON FUNCTION public.newbuilding_projects_can_edit(rec public.newbuilding_projects) TO service_role;

CREATE FUNCTION public.vessel_hull_event_summary_from_vessels() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.refresh_vessel_hull_event_summaries(array(select id from new_rows));
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.vessel_hull_event_summary_from_vessels() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_hull_event_summary_from_vessels() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessel_hull_event_summary_from_vessels() TO service_role;

CREATE FUNCTION public.vessel_hull_event_summary_from_hull_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_vessel_hull_event_summaries(array(select distinct vessel_id from new_rows where vessel_id is not null));
  elsif tg_op = 'DELETE' then
    perform public.refresh_vessel_hull_event_summaries(array(select distinct vessel_id from old_rows where vessel_id is not null));
  else
    perform public.refresh_vessel_hull_event_summaries(array(
      select vessel_id from new_rows where vessel_id is not null union select vessel_id from old_rows where vessel_id is not null));
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.vessel_hull_event_summary_from_hull_events() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessel_hull_event_summary_from_hull_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessel_hull_event_summary_from_hull_events() TO service_role;

CREATE FUNCTION public.refresh_vessel_hull_event_summaries(p_vessel_ids uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.vessel_hull_event_summary as s
    (vessel_id, dd_count, has_nb, last_event_id, last_event_date, last_service_end, last_maker_is_own,
     first_nb_event_id, next_event_id, next_event_date, due_on)
  select v.id,
         coalesce(a.dd_count, 0),
         coalesce(a.has_nb, false),
         a.last_event_id,
         a.last_event_date,
         coalesce((le.event_date + make_interval(months => le.service_period_months))::date, 'infinity'::date),
         coalesce(le.supplier_this_hullevent_id = public.own_maker_company_id(), false),
         a.first_nb_event_id,
         a.next_event_id,
         a.next_event_date,
         a.next_event_date
  from public.vessels v
  left join lateral (
    select
      count(*) filter (where he.supplier_this_hullevent_id = public.own_maker_company_id()) as dd_count,
      bool_or(p.code = 'NB') as has_nb,
      max(he.event_date) filter (where he.event_date <= current_date) as last_event_date,
      min(he.event_date) filter (where he.event_date > current_date) as next_event_date,
      (array_agg(he.id order by he.event_date desc, he.created_at desc, he.id desc) filter (where he.event_date <= current_date))[1] as last_event_id,
      (array_agg(he.id order by he.event_date asc, he.created_at asc, he.id asc) filter (where p.code = 'NB'))[1] as first_nb_event_id,
      (array_agg(he.id order by he.event_date asc, he.created_at asc, he.id asc) filter (where he.event_date > current_date))[1] as next_event_id
    from public.hull_events he
    join public.phrases p on p.id = he.type_phrase_id
    where he.vessel_id = v.id and p.code in ('DD', 'NB')
  ) a on true
  left join public.hull_events le on le.id = a.last_event_id
  where v.id = any(p_vessel_ids)
  on conflict (vessel_id) do update set
    dd_count = excluded.dd_count,
    has_nb = excluded.has_nb,
    last_event_id = excluded.last_event_id,
    last_event_date = excluded.last_event_date,
    last_service_end = excluded.last_service_end,
    last_maker_is_own = excluded.last_maker_is_own,
    first_nb_event_id = excluded.first_nb_event_id,
    next_event_id = excluded.next_event_id,
    next_event_date = excluded.next_event_date,
    due_on = excluded.due_on;
$$;

REVOKE ALL ON FUNCTION public.refresh_vessel_hull_event_summaries(p_vessel_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_vessel_hull_event_summaries(p_vessel_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_vessel_hull_event_summaries(p_vessel_ids uuid[]) TO service_role;

CREATE FUNCTION public.refresh_all_vessel_hull_event_summaries() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_ids uuid[]; v_chunk uuid[]; i int := 1; n int;
begin
  v_ids := array(select id from public.vessels);
  n := coalesce(array_length(v_ids, 1), 0);
  while i <= n loop
    perform public.refresh_vessel_hull_event_summaries(v_ids[i:i + 9999]);
    i := i + 10000;
  end loop;
end;
$$;

REVOKE ALL ON FUNCTION public.refresh_all_vessel_hull_event_summaries() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_all_vessel_hull_event_summaries() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_all_vessel_hull_event_summaries() TO service_role;

CREATE FUNCTION public.refresh_due_vessel_hull_event_summaries() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_ids uuid[];
begin
  v_ids := array(select s.vessel_id from public.vessel_hull_event_summary s where s.due_on <= current_date);
  perform public.refresh_vessel_hull_event_summaries(v_ids);
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

REVOKE ALL ON FUNCTION public.refresh_due_vessel_hull_event_summaries() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_due_vessel_hull_event_summaries() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_due_vessel_hull_event_summaries() TO service_role;

CREATE FUNCTION public.companies_vessel_rollup_add_company() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.companies_vessel_rollup (company_id, is_total) values (new.id, true) on conflict do nothing;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.companies_vessel_rollup_add_company() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.companies_vessel_rollup_add_company() FROM PUBLIC;
GRANT ALL ON FUNCTION public.companies_vessel_rollup_add_company() TO service_role;

CREATE FUNCTION public.companies_vessel_rollup_sums(p_ship_type_groups text[] DEFAULT NULL::text[]) RETURNS TABLE(company_id uuid, vessel_count bigint, technical_manager_vessel_count bigint, operator_vessel_count bigint, unique_vessel_count bigint, dwt_sum numeric, np_now_count bigint, np_technical_manager_vessel_count bigint, np_operator_vessel_count bigint, np_unique_vessel_count bigint, np_nb_count bigint, survey_due_count_y0 bigint, survey_due_count_y1 bigint, survey_due_count_y2 bigint)
    LANGUAGE sql STABLE
    AS $$
  select
    r.company_id,
    sum(r.vessel_count)::bigint,
    sum(r.technical_manager_vessel_count)::bigint,
    sum(r.operator_vessel_count)::bigint,
    sum(r.unique_vessel_count)::bigint,
    sum(r.dwt_sum)::numeric,
    sum(r.np_now_count)::bigint,
    sum(r.np_technical_manager_vessel_count)::bigint,
    sum(r.np_operator_vessel_count)::bigint,
    sum(r.np_unique_vessel_count)::bigint,
    sum(r.np_nb_count)::bigint,
    sum(r.survey_due_count_y0)::bigint,
    sum(r.survey_due_count_y1)::bigint,
    sum(r.survey_due_count_y2)::bigint
  from public.companies_vessel_rollup r
  where not r.is_total and (p_ship_type_groups is null or r.ship_type_group = any (p_ship_type_groups))
  group by r.company_id
$$;

REVOKE ALL ON FUNCTION public.companies_vessel_rollup_sums(p_ship_type_groups text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.companies_vessel_rollup_sums(p_ship_type_groups text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.companies_vessel_rollup_sums(p_ship_type_groups text[]) TO authenticated;
GRANT ALL ON FUNCTION public.companies_vessel_rollup_sums(p_ship_type_groups text[]) TO service_role;

CREATE FUNCTION public.company_vessel_role_counts(p_company_id uuid) RETURNS TABLE(owner_count bigint, ship_manager_count bigint, technical_manager_count bigint, operator_count bigint, unique_count bigint, np_owner_count bigint, np_ship_manager_count bigint, np_technical_manager_count bigint, np_operator_count bigint, np_unique_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  -- The company itself plus every company whose group_company_id points at it.
  -- A group head points at itself already; a subsidiary or standalone company
  -- with no subordinates only has itself, i.e. its own vessels.
  with members as materialized (
    select c.id from public.companies c where c.group_company_id = p_company_id or c.id = p_company_id
  ),
  o as (select v.id from public.vessels v where v.group_owner_company_id in (select id from members)),
  s as (select v.id from public.vessels v where v.ship_manager_company_id in (select id from members)),
  t as (select v.id from public.vessels v where v.technical_manager_company_id in (select id from members)),
  p as (select v.id from public.vessels v where v.operator_company_id in (select id from members)),
  related as (
    select id from o union select id from s union select id from t union select id from p
  ),
  -- Vessels whose current maker is us: supplier of the latest DD/NB event dated
  -- up to today (same rule as vessels_overview.current_maker_id).
  np as (
    select vessel_id from (
      select distinct on (he.vessel_id) he.vessel_id, he.supplier_this_hullevent_id as maker_id,
             (he.service_period_months is not null and he.event_date + make_interval(months => he.service_period_months) < current_date) as expired
      from public.hull_events he
      join public.phrases ph on ph.id = he.type_phrase_id
      where ph.code in ('DD', 'NB')
        and he.event_date <= current_date
        and he.vessel_id in (select id from related)
      order by he.vessel_id, he.event_date desc, he.created_at desc, he.id desc
    ) latest
    where maker_id = public.own_maker_company_id() and not expired
  )
  select
    (select count(*) from o),
    (select count(*) from s),
    (select count(*) from t),
    (select count(*) from p),
    (select count(*) from related),
    (select count(*) from o where id in (select vessel_id from np)),
    (select count(*) from s where id in (select vessel_id from np)),
    (select count(*) from t where id in (select vessel_id from np)),
    (select count(*) from p where id in (select vessel_id from np)),
    (select count(*) from related where id in (select vessel_id from np));
$$;

REVOKE ALL ON FUNCTION public.company_vessel_role_counts(p_company_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.company_vessel_role_counts(p_company_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_vessel_role_counts(p_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.company_vessel_role_counts(p_company_id uuid) TO service_role;

CREATE FUNCTION public.refresh_companies_vessel_rollup() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.companies_vessel_rollup;
  insert into public.companies_vessel_rollup
    (company_id, is_total, ship_type_group, vessel_count, technical_manager_vessel_count, operator_vessel_count, unique_vessel_count,
     dwt_sum, np_now_count, np_technical_manager_vessel_count, np_operator_vessel_count, np_unique_vessel_count, np_nb_count,
     survey_due_count_y0, survey_due_count_y1, survey_due_count_y2)
  select company_id, false, ship_type_group, vessel_count, technical_manager_vessel_count, operator_vessel_count, unique_vessel_count,
     dwt_sum, np_now_count, np_technical_manager_vessel_count, np_operator_vessel_count, np_unique_vessel_count, np_nb_count,
     survey_due_count_y0, survey_due_count_y1, survey_due_count_y2
  from public.companies_vessel_rollup_source;
  -- one total row per company, zeros for a company without vessels
  insert into public.companies_vessel_rollup
    (company_id, is_total, ship_type_group, vessel_count, technical_manager_vessel_count, operator_vessel_count, unique_vessel_count,
     dwt_sum, np_now_count, np_technical_manager_vessel_count, np_operator_vessel_count, np_unique_vessel_count, np_nb_count,
     survey_due_count_y0, survey_due_count_y1, survey_due_count_y2)
  select c.id, true, '',
     coalesce(sum(g.vessel_count), 0), coalesce(sum(g.technical_manager_vessel_count), 0), coalesce(sum(g.operator_vessel_count), 0),
     coalesce(sum(g.unique_vessel_count), 0), sum(g.dwt_sum), coalesce(sum(g.np_now_count), 0),
     coalesce(sum(g.np_technical_manager_vessel_count), 0), coalesce(sum(g.np_operator_vessel_count), 0),
     coalesce(sum(g.np_unique_vessel_count), 0), coalesce(sum(g.np_nb_count), 0), coalesce(sum(g.survey_due_count_y0), 0),
     coalesce(sum(g.survey_due_count_y1), 0), coalesce(sum(g.survey_due_count_y2), 0)
  from public.companies c
  left join public.companies_vessel_rollup g on g.company_id = c.id and not g.is_total
  group by c.id
  on conflict (company_id, is_total, ship_type_group) do update set
    vessel_count = excluded.vessel_count, technical_manager_vessel_count = excluded.technical_manager_vessel_count,
    operator_vessel_count = excluded.operator_vessel_count, unique_vessel_count = excluded.unique_vessel_count,
    dwt_sum = excluded.dwt_sum, np_now_count = excluded.np_now_count,
    np_technical_manager_vessel_count = excluded.np_technical_manager_vessel_count,
    np_operator_vessel_count = excluded.np_operator_vessel_count, np_unique_vessel_count = excluded.np_unique_vessel_count,
    np_nb_count = excluded.np_nb_count, survey_due_count_y0 = excluded.survey_due_count_y0,
    survey_due_count_y1 = excluded.survey_due_count_y1, survey_due_count_y2 = excluded.survey_due_count_y2;
  analyze public.companies_vessel_rollup;
end;
$$;

REVOKE ALL ON FUNCTION public.refresh_companies_vessel_rollup() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.refresh_companies_vessel_rollup() FROM PUBLIC;
GRANT ALL ON FUNCTION public.refresh_companies_vessel_rollup() TO service_role;

ALTER TABLE public.vessels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create vessels per literal" ON public.vessels FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('vessels.create'::text) AS rls_has) OR ( SELECT public.rls_has('vessels.edit'::text) AS rls_has)));

CREATE POLICY "Delete vessels per literal" ON public.vessels FOR DELETE TO authenticated USING (( SELECT public.rls_has('vessels.delete'::text) AS rls_has));

CREATE POLICY "Edit vessels per literal" ON public.vessels FOR UPDATE TO authenticated USING (( SELECT public.rls_has('vessels.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('vessels.edit'::text) AS rls_has));

CREATE POLICY "Signed-in users read vessels" ON public.vessels FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.vessels AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vessels FOR EACH ROW EXECUTE FUNCTION public.vessels_set_updated_at_and_by();

CREATE TRIGGER vessels_add_company_types_insert AFTER INSERT ON public.vessels FOR EACH ROW EXECUTE FUNCTION public.vessels_add_company_types();

CREATE TRIGGER vessels_add_company_types_update AFTER UPDATE OF group_owner_company_id, ship_manager_company_id, technical_manager_company_id, operator_company_id, shipbuilder_company_id ON public.vessels FOR EACH ROW WHEN ((((((old.group_owner_company_id IS DISTINCT FROM new.group_owner_company_id) OR (old.ship_manager_company_id IS DISTINCT FROM new.ship_manager_company_id)) OR (old.technical_manager_company_id IS DISTINCT FROM new.technical_manager_company_id)) OR (old.operator_company_id IS DISTINCT FROM new.operator_company_id)) OR (old.shipbuilder_company_id IS DISTINCT FROM new.shipbuilder_company_id))) EXECUTE FUNCTION public.vessels_add_company_types();

CREATE TRIGGER vessels_resolve_company_links BEFORE INSERT OR UPDATE OF group_owner, ship_manager, technical_manager, operator, shipbuilder, group_owner_company_is_manual, ship_manager_company_is_manual, technical_manager_company_is_manual, operator_company_is_manual, shipbuilder_company_is_manual ON public.vessels FOR EACH ROW EXECUTE FUNCTION public.vessels_resolve_company_links_on_write();

CREATE TRIGGER vessels_set_ship_type_group BEFORE INSERT OR UPDATE OF ship_type ON public.vessels FOR EACH ROW EXECUTE FUNCTION public.vessels_set_ship_type_group();

CREATE TRIGGER vessels_summary_insert AFTER INSERT ON public.vessels REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.vessel_hull_event_summary_from_vessels();

CREATE TRIGGER vessels_sync_hull_event_snapshots AFTER UPDATE OF group_owner_company_id, ship_manager_company_id, technical_manager_company_id, operator_company_id ON public.vessels FOR EACH ROW WHEN (((((old.group_owner_company_id IS DISTINCT FROM new.group_owner_company_id) OR (old.ship_manager_company_id IS DISTINCT FROM new.ship_manager_company_id)) OR (old.technical_manager_company_id IS DISTINCT FROM new.technical_manager_company_id)) OR (old.operator_company_id IS DISTINCT FROM new.operator_company_id))) EXECUTE FUNCTION public.vessels_sync_hull_event_snapshots();

CREATE TRIGGER vessels_write_history BEFORE UPDATE ON public.vessels FOR EACH ROW WHEN (((((to_jsonb(old.*) - 'updated_at'::text) - 'updated_by_user_id'::text) - 'ship_type_group'::text) IS DISTINCT FROM (((to_jsonb(new.*) - 'updated_at'::text) - 'updated_by_user_id'::text) - 'ship_type_group'::text))) EXECUTE FUNCTION public.vessels_write_history();

ALTER TABLE public.vessel_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vessel history" ON public.vessel_history FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.vessel_history AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.ship_type_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read ship type mappings" ON public.ship_type_mappings FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.ship_type_mappings AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.hull_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create hull events per grant" ON public.hull_events FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('hull_events.create.all'::text) AS rls_has) OR (( SELECT public.rls_has('hull_events.create.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('hull_events.create.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))));

CREATE POLICY "Delete hull events per grant" ON public.hull_events FOR DELETE TO authenticated USING ((( SELECT public.rls_has('hull_events.delete.all'::text) AS rls_has) OR (( SELECT public.rls_has('hull_events.delete.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('hull_events.delete.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))));

CREATE POLICY "Edit hull events per grant" ON public.hull_events FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('hull_events.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('hull_events.edit.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('hull_events.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('hull_events.edit.account'::text) AS rls_has) AND (id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids))))) WITH CHECK ((( SELECT public.rls_has('hull_events.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('hull_events.edit.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('hull_events.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('hull_events.edit.account'::text) AS rls_has) AND (ARRAY[customer_company_id, dealer_company_id, facilitating_partner_company_id, shipyard_company_id, snapshot_group_owner_company_id, snapshot_operator_company_id, snapshot_ship_manager_company_id, snapshot_technical_manager_company_id] && ( SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) AS "coalesce"
   FROM public.rls_my_account_company_ids() a(id))))));

CREATE POLICY "View hull events per grant" ON public.hull_events FOR SELECT TO authenticated USING ((( SELECT public.rls_has('hull_events.view.all'::text) AS rls_has) OR (( SELECT public.rls_has('hull_events.view.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('hull_events.view.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('hull_events.view.account'::text) AS rls_has) AND (id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids)))));

CREATE POLICY mfa_required ON public.hull_events AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER copy_vessel_snapshot BEFORE INSERT ON public.hull_events FOR EACH ROW EXECUTE FUNCTION public.copy_vessel_snapshot_to_hull_event();

CREATE TRIGGER hull_events_add_company_types_insert AFTER INSERT ON public.hull_events FOR EACH ROW EXECUTE FUNCTION public.hull_events_add_company_types();

CREATE TRIGGER hull_events_add_company_types_update AFTER UPDATE OF shipyard_company_id, dealer_company_id, facilitating_partner_company_id, supplier_this_hullevent_id, supplier_last_hullevent_id ON public.hull_events FOR EACH ROW WHEN ((((((old.shipyard_company_id IS DISTINCT FROM new.shipyard_company_id) OR (old.dealer_company_id IS DISTINCT FROM new.dealer_company_id)) OR (old.facilitating_partner_company_id IS DISTINCT FROM new.facilitating_partner_company_id)) OR (old.supplier_this_hullevent_id IS DISTINCT FROM new.supplier_this_hullevent_id)) OR (old.supplier_last_hullevent_id IS DISTINCT FROM new.supplier_last_hullevent_id))) EXECUTE FUNCTION public.hull_events_add_company_types();

CREATE TRIGGER hull_events_clean_events AFTER DELETE ON public.hull_events FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('hull_events');

CREATE TRIGGER hull_events_log_changes AFTER UPDATE OF type_phrase_id, status, lost_reason, event_date, dock_in_date, dock_out_date, project_code, service_period_months, performance_guarantee, sales_account_user_id, assigned_team_id, technical_service_rep_user_id, second_technical_service_rep_user_id, shipyard_company_id, customer_company_id, dealer_company_id, facilitating_partner_company_id, supplier_last_hullevent_id, supplier_this_hullevent_id, vertical_af_product_id, flat_bottom_af_product_id, vertical_offered_af_product_id, flat_bottom_offered_af_product_id, location_continent, location_country_id, opportunity_value, opportunity_value_currency, opportunity_exchange_rate, opportunity_litres, newbuilding_project_id ON public.hull_events FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('hull_events', 'type_phrase_id=phrases', 'status', 'lost_reason', 'event_date', 'dock_in_date', 'dock_out_date', 'project_code', 'service_period_months', 'performance_guarantee', 'sales_account_user_id=users', 'assigned_team_id=teams', 'technical_service_rep_user_id=users', 'second_technical_service_rep_user_id=users', 'shipyard_company_id=companies', 'customer_company_id=companies', 'dealer_company_id=companies', 'facilitating_partner_company_id=companies', 'supplier_last_hullevent_id=companies', 'supplier_this_hullevent_id=companies', 'vertical_af_product_id=products', 'flat_bottom_af_product_id=products', 'vertical_offered_af_product_id=products', 'flat_bottom_offered_af_product_id=products', 'location_continent', 'location_country_id=countries', 'opportunity_value', 'opportunity_value_currency', 'opportunity_exchange_rate', 'opportunity_litres', 'newbuilding_project_id=newbuilding_projects');

CREATE TRIGGER hull_events_summary_delete AFTER DELETE ON public.hull_events REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.vessel_hull_event_summary_from_hull_events();

CREATE TRIGGER hull_events_summary_insert AFTER INSERT ON public.hull_events REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.vessel_hull_event_summary_from_hull_events();

CREATE TRIGGER hull_events_summary_update AFTER UPDATE ON public.hull_events REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.vessel_hull_event_summary_from_hull_events();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hull_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.hull_event_newbuilding_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete newbuilding details per parent grant" ON public.hull_event_newbuilding_details FOR DELETE TO authenticated USING ((public.hull_events_row_allows('edit'::text, hull_event_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert newbuilding details per parent grant" ON public.hull_event_newbuilding_details FOR INSERT TO authenticated WITH CHECK ((public.hull_events_row_allows('edit'::text, hull_event_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update newbuilding details per parent grant" ON public.hull_event_newbuilding_details FOR UPDATE TO authenticated USING ((public.hull_events_row_allows('edit'::text, hull_event_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.hull_events_row_allows('edit'::text, hull_event_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View newbuilding details per parent grant" ON public.hull_event_newbuilding_details FOR SELECT TO authenticated USING ((public.hull_events_row_allows('view'::text, hull_event_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.hull_event_newbuilding_details AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER hull_event_newbuilding_details_log_changes AFTER UPDATE OF newbuilding_code, newbuilding_deadweight_tonnage, newbuilding_teu, contract_date, steel_cut_date ON public.hull_event_newbuilding_details FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('hull_events:hull_event_id', 'newbuilding_code', 'newbuilding_deadweight_tonnage', 'newbuilding_teu', 'contract_date', 'steel_cut_date');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hull_event_newbuilding_details FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.newbuilding_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create newbuilding projects per grant" ON public.newbuilding_projects FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('newbuildings.create.all'::text) AS rls_has) OR (( SELECT public.rls_has('newbuildings.create.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('newbuildings.create.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))));

CREATE POLICY "Delete newbuilding projects per grant" ON public.newbuilding_projects FOR DELETE TO authenticated USING ((( SELECT public.rls_has('newbuildings.delete.all'::text) AS rls_has) OR (( SELECT public.rls_has('newbuildings.delete.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('newbuildings.delete.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))));

CREATE POLICY "Edit newbuilding projects per grant" ON public.newbuilding_projects FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('newbuildings.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('newbuildings.edit.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('newbuildings.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('newbuildings.edit.account'::text) AS rls_has) AND (ARRAY[customer_company_id, shipyard_company_id, owner_associate_company_id] && ( SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) AS "coalesce"
   FROM public.rls_my_account_company_ids() a(id)))))) WITH CHECK ((( SELECT public.rls_has('newbuildings.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('newbuildings.edit.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('newbuildings.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('newbuildings.edit.account'::text) AS rls_has) AND (ARRAY[customer_company_id, shipyard_company_id, owner_associate_company_id] && ( SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) AS "coalesce"
   FROM public.rls_my_account_company_ids() a(id))))));

CREATE POLICY "View newbuilding projects per grant" ON public.newbuilding_projects FOR SELECT TO authenticated USING ((( SELECT public.rls_has('newbuildings.view.all'::text) AS rls_has) OR (( SELECT public.rls_has('newbuildings.view.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('newbuildings.view.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('newbuildings.view.account'::text) AS rls_has) AND (ARRAY[customer_company_id, shipyard_company_id, owner_associate_company_id] && ( SELECT COALESCE(array_agg(a.id), '{}'::uuid[]) AS "coalesce"
   FROM public.rls_my_account_company_ids() a(id))))));

CREATE POLICY mfa_required ON public.newbuilding_projects AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER newbuilding_projects_add_company_types AFTER INSERT OR UPDATE OF shipyard_company_id, maker_company_ids ON public.newbuilding_projects FOR EACH ROW EXECUTE FUNCTION public.newbuilding_projects_add_company_types();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.newbuilding_projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.vessel_hull_event_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.vessel_hull_event_summary AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY vessel_hull_event_summary_select ON public.vessel_hull_event_summary FOR SELECT TO authenticated USING (true);

ALTER TABLE public.companies_vessel_rollup ENABLE ROW LEVEL SECURITY;

CREATE POLICY companies_vessel_rollup_select ON public.companies_vessel_rollup FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.companies_vessel_rollup AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.vessel_statuses WITH (security_invoker='true') AS
 SELECT DISTINCT status
   FROM public.vessels
  WHERE (status IS NOT NULL);

REVOKE ALL ON TABLE public.vessel_statuses FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessel_statuses TO authenticated;
GRANT ALL ON TABLE public.vessel_statuses TO service_role;

CREATE VIEW public.vessel_ship_type_groups WITH (security_invoker='true') AS
 SELECT DISTINCT ship_type_group
   FROM public.vessels
  WHERE (ship_type_group IS NOT NULL);

REVOKE ALL ON TABLE public.vessel_ship_type_groups FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessel_ship_type_groups TO authenticated;
GRANT ALL ON TABLE public.vessel_ship_type_groups TO service_role;

CREATE VIEW public.vessel_search_options WITH (security_invoker='true') AS
 SELECT id,
    name,
    imo,
    lower(name) AS name_sort
   FROM public.vessels v;

REVOKE ALL ON TABLE public.vessel_search_options FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessel_search_options TO authenticated;
GRANT ALL ON TABLE public.vessel_search_options TO service_role;

CREATE VIEW public.ship_type_mappings_overview WITH (security_invoker='true') AS
 SELECT v.ship_type,
    count(*) AS vessel_count,
    m.group_phrase_id,
    p.text_en AS group_name
   FROM ((public.vessels v
     LEFT JOIN public.ship_type_mappings m ON ((m.ship_type = v.ship_type)))
     LEFT JOIN public.phrases p ON ((p.id = m.group_phrase_id)))
  WHERE (v.ship_type IS NOT NULL)
  GROUP BY v.ship_type, m.group_phrase_id, p.text_en;

REVOKE ALL ON TABLE public.ship_type_mappings_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.ship_type_mappings_overview TO authenticated;
GRANT ALL ON TABLE public.ship_type_mappings_overview TO service_role;

CREATE VIEW public.companies_overview_base WITH (security_invoker='true') AS
 SELECT c.id,
    c.name,
    c.short_code,
    c.address_line,
    c.city,
    c.postal_code,
    c.telephone,
    c.sales_account_user_id,
    c.account_status_phrase_id,
    c.group_company_id,
    c.created_at,
    c.updated_at,
    c.created_by_user_id,
    c.updated_by_user_id,
    c.country_id,
    c.source,
    c.seaweb_match_name,
    c.email,
    c.supplier_api_adapter,
    c.chart_color,
    c.chart_text_color,
    c.company_types,
    c.is_group_company,
    co.name_en AS country,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'companies'::text) AND (a.entity_id = c.id)))) AS has_attachments,
    (COALESCE(ct.roles, '{}'::text[]) || c.company_types) AS roles,
        CASE
            WHEN (c.group_company_id = c.id) THEN NULL::text
            ELSE grp.name
        END AS group_company_name,
    rep.name AS sales_account_user_name,
    status_phrase.text_en AS account_status_label,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'companies'::text) AND (conv.anchor_id = c.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    co.region,
    (EXISTS ( SELECT 1
           FROM public.companies sub
          WHERE ((sub.group_company_id = c.id) AND (sub.id <> c.id)))) AS is_group_parent
   FROM (((((public.companies c
     LEFT JOIN public.countries co ON ((co.id = c.country_id)))
     LEFT JOIN public.companies grp ON ((grp.id = c.group_company_id)))
     LEFT JOIN public.users rep ON ((rep.id = c.sales_account_user_id)))
     LEFT JOIN public.phrases status_phrase ON ((status_phrase.id = c.account_status_phrase_id)))
     LEFT JOIN public.company_teams ct ON (((ct.company_id = c.id) AND (ct.team_id = ( SELECT u.default_team_id
           FROM public.users u
          WHERE (u.id = ( SELECT auth.uid() AS uid)))))));

REVOKE ALL ON TABLE public.companies_overview_base FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.companies_overview_base TO authenticated;
GRANT ALL ON TABLE public.companies_overview_base TO service_role;

CREATE VIEW public.companies_vessel_rollup_source WITH (security_invoker='true') AS
 WITH np_vessels AS (
         SELECT latest.vessel_id
           FROM ( SELECT DISTINCT ON (he.vessel_id) he.vessel_id,
                    he.supplier_this_hullevent_id AS maker_id,
                    ((he.service_period_months IS NOT NULL) AND ((he.event_date + make_interval(months => he.service_period_months)) < CURRENT_DATE)) AS expired
                   FROM (public.hull_events he
                     JOIN public.phrases p ON ((p.id = he.type_phrase_id)))
                  WHERE ((p.code = ANY (ARRAY['DD'::text, 'NB'::text])) AND (he.event_date <= CURRENT_DATE))
                  ORDER BY he.vessel_id, he.event_date DESC, he.created_at DESC, he.id DESC) latest
          WHERE ((latest.maker_id = public.own_maker_company_id()) AND (NOT latest.expired))
        ), np_nb_vessels AS (
         SELECT DISTINCT he.vessel_id
           FROM (public.hull_events he
             JOIN public.phrases p ON ((p.id = he.type_phrase_id)))
          WHERE ((p.code = 'NB'::text) AND (he.supplier_this_hullevent_id = public.own_maker_company_id()))
        ), owner_base AS (
         SELECT rc.id AS company_id,
            rc.group_company_id AS head_id,
            v.id AS vessel_id,
            COALESCE(v.ship_type_group, ''::text) AS ship_type_group,
            v.deadweight_tonnage,
            v.docking_survey_date,
            (np.vessel_id IS NOT NULL) AS is_np
           FROM ((public.vessels v
             JOIN public.companies rc ON ((rc.id = v.group_owner_company_id)))
             LEFT JOIN np_vessels np ON ((np.vessel_id = v.id)))
        ), role_owner AS (
         SELECT owner_base.company_id,
            owner_base.vessel_id,
            owner_base.ship_type_group,
            owner_base.deadweight_tonnage,
            owner_base.docking_survey_date,
            owner_base.is_np
           FROM owner_base
        UNION ALL
         SELECT owner_base.head_id,
            owner_base.vessel_id,
            owner_base.ship_type_group,
            owner_base.deadweight_tonnage,
            owner_base.docking_survey_date,
            owner_base.is_np
           FROM owner_base
          WHERE (owner_base.head_id <> owner_base.company_id)
        ), role_technical_manager AS (
         SELECT rc.id AS company_id,
            v.id AS vessel_id,
            COALESCE(v.ship_type_group, ''::text) AS ship_type_group
           FROM (public.vessels v
             JOIN public.companies rc ON ((rc.id = v.technical_manager_company_id)))
        UNION ALL
         SELECT rc.group_company_id,
            v.id,
            COALESCE(v.ship_type_group, ''::text) AS "coalesce"
           FROM (public.vessels v
             JOIN public.companies rc ON ((rc.id = v.technical_manager_company_id)))
          WHERE (rc.group_company_id <> rc.id)
        ), role_ship_manager AS (
         SELECT rc.id AS company_id,
            v.id AS vessel_id
           FROM (public.vessels v
             JOIN public.companies rc ON ((rc.id = v.ship_manager_company_id)))
        UNION ALL
         SELECT rc.group_company_id,
            v.id
           FROM (public.vessels v
             JOIN public.companies rc ON ((rc.id = v.ship_manager_company_id)))
          WHERE (rc.group_company_id <> rc.id)
        ), role_operator AS (
         SELECT rc.id AS company_id,
            v.id AS vessel_id,
            COALESCE(v.ship_type_group, ''::text) AS ship_type_group
           FROM (public.vessels v
             JOIN public.companies rc ON ((rc.id = v.operator_company_id)))
        UNION ALL
         SELECT rc.group_company_id,
            v.id,
            COALESCE(v.ship_type_group, ''::text) AS "coalesce"
           FROM (public.vessels v
             JOIN public.companies rc ON ((rc.id = v.operator_company_id)))
          WHERE (rc.group_company_id <> rc.id)
        ), unique_vessels AS (
         SELECT role_owner.company_id,
            role_owner.vessel_id
           FROM role_owner
        UNION
         SELECT role_ship_manager.company_id,
            role_ship_manager.vessel_id
           FROM role_ship_manager
        UNION
         SELECT role_technical_manager.company_id,
            role_technical_manager.vessel_id
           FROM role_technical_manager
        UNION
         SELECT role_operator.company_id,
            role_operator.vessel_id
           FROM role_operator
        ), owner_agg AS (
         SELECT role_owner.company_id,
            role_owner.ship_type_group,
            count(*) AS vessel_count,
            count(*) FILTER (WHERE role_owner.is_np) AS np_now_count,
            count(nb.vessel_id) AS np_nb_count,
            count(*) FILTER (WHERE (EXTRACT(year FROM role_owner.docking_survey_date) = EXTRACT(year FROM CURRENT_DATE))) AS survey_due_count_y0,
            count(*) FILTER (WHERE (EXTRACT(year FROM role_owner.docking_survey_date) = (EXTRACT(year FROM CURRENT_DATE) + (1)::numeric))) AS survey_due_count_y1,
            count(*) FILTER (WHERE (EXTRACT(year FROM role_owner.docking_survey_date) = (EXTRACT(year FROM CURRENT_DATE) + (2)::numeric))) AS survey_due_count_y2
           FROM (role_owner
             LEFT JOIN np_nb_vessels nb ON ((nb.vessel_id = role_owner.vessel_id)))
          GROUP BY role_owner.company_id, role_owner.ship_type_group
        ), technical_manager_agg AS (
         SELECT r.company_id,
            r.ship_type_group,
            count(*) AS vessel_count,
            count(np.vessel_id) AS np_count
           FROM (role_technical_manager r
             LEFT JOIN np_vessels np ON ((np.vessel_id = r.vessel_id)))
          GROUP BY r.company_id, r.ship_type_group
        ), operator_agg AS (
         SELECT r.company_id,
            r.ship_type_group,
            count(*) AS vessel_count,
            count(np.vessel_id) AS np_count
           FROM (role_operator r
             LEFT JOIN np_vessels np ON ((np.vessel_id = r.vessel_id)))
          GROUP BY r.company_id, r.ship_type_group
        ), unique_agg AS (
         SELECT uv.company_id,
            COALESCE(v.ship_type_group, ''::text) AS ship_type_group,
            count(*) AS vessel_count,
            sum(v.deadweight_tonnage) AS dwt_sum,
            count(np.vessel_id) AS np_count
           FROM ((unique_vessels uv
             JOIN public.vessels v ON ((v.id = uv.vessel_id)))
             LEFT JOIN np_vessels np ON ((np.vessel_id = uv.vessel_id)))
          GROUP BY uv.company_id, COALESCE(v.ship_type_group, ''::text)
        )
 SELECT u.company_id,
    u.ship_type_group,
    COALESCE(owner_agg.vessel_count, (0)::bigint) AS vessel_count,
    COALESCE(technical_manager_agg.vessel_count, (0)::bigint) AS technical_manager_vessel_count,
    COALESCE(operator_agg.vessel_count, (0)::bigint) AS operator_vessel_count,
    u.vessel_count AS unique_vessel_count,
    u.dwt_sum,
    COALESCE(owner_agg.np_now_count, (0)::bigint) AS np_now_count,
    COALESCE(technical_manager_agg.np_count, (0)::bigint) AS np_technical_manager_vessel_count,
    COALESCE(operator_agg.np_count, (0)::bigint) AS np_operator_vessel_count,
    u.np_count AS np_unique_vessel_count,
    COALESCE(owner_agg.np_nb_count, (0)::bigint) AS np_nb_count,
    COALESCE(owner_agg.survey_due_count_y0, (0)::bigint) AS survey_due_count_y0,
    COALESCE(owner_agg.survey_due_count_y1, (0)::bigint) AS survey_due_count_y1,
    COALESCE(owner_agg.survey_due_count_y2, (0)::bigint) AS survey_due_count_y2
   FROM (((unique_agg u
     LEFT JOIN owner_agg ON (((owner_agg.company_id = u.company_id) AND (owner_agg.ship_type_group = u.ship_type_group))))
     LEFT JOIN technical_manager_agg ON (((technical_manager_agg.company_id = u.company_id) AND (technical_manager_agg.ship_type_group = u.ship_type_group))))
     LEFT JOIN operator_agg ON (((operator_agg.company_id = u.company_id) AND (operator_agg.ship_type_group = u.ship_type_group))));

REVOKE ALL ON TABLE public.companies_vessel_rollup_source FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.companies_vessel_rollup_source TO authenticated;
GRANT ALL ON TABLE public.companies_vessel_rollup_source TO service_role;

CREATE VIEW public.companies_overview WITH (security_invoker='true') AS
 SELECT b.id,
    b.name,
    b.short_code,
    b.address_line,
    b.city,
    b.postal_code,
    b.telephone,
    b.sales_account_user_id,
    b.account_status_phrase_id,
    b.group_company_id,
    b.created_at,
    b.updated_at,
    b.created_by_user_id,
    b.updated_by_user_id,
    b.country_id,
    b.source,
    b.seaweb_match_name,
    b.email,
    b.supplier_api_adapter,
    b.chart_color,
    b.chart_text_color,
    b.company_types,
    b.is_group_company,
    b.country,
    b.has_attachments,
    b.roles,
    b.group_company_name,
    b.sales_account_user_name,
    b.account_status_label,
    b.has_messages,
    b.region,
    b.is_group_parent,
    s.vessel_count,
    s.dwt_sum,
    s.np_now_count,
    s.np_nb_count,
    s.survey_due_count_y0,
    s.survey_due_count_y1,
    s.survey_due_count_y2,
    s.technical_manager_vessel_count,
    s.operator_vessel_count,
    s.unique_vessel_count,
    s.np_technical_manager_vessel_count,
    s.np_operator_vessel_count,
    s.np_unique_vessel_count,
    round((s.dwt_sum / (NULLIF(s.unique_vessel_count, 0))::numeric)) AS dwt_average
   FROM (public.companies_overview_base b
     JOIN public.companies_vessel_rollup s ON (((s.company_id = b.id) AND s.is_total)));

REVOKE ALL ON TABLE public.companies_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.companies_overview TO authenticated;
GRANT ALL ON TABLE public.companies_overview TO service_role;

CREATE VIEW public.vessels_overview WITH (security_invoker='true') AS
 SELECT v.id,
    v.imo,
    v.name,
    v.deadweight_tonnage,
    v.gross_tonnage,
    v.net_tonnage,
    v.flag,
    v.built_date,
    v.ship_type,
    v.class_society,
    v.status,
    v.vessel_sanction,
    v.overall_risk_rating,
    v.docking_survey_date,
    v.shipbuilder,
    v.shipbuilder_country,
    v.group_owner,
    v.group_owner_country,
    v.ship_manager,
    v.ship_manager_country,
    v.technical_manager,
    v.technical_manager_country,
    v.operator,
    v.operator_country,
    v.created_at,
    v.updated_at,
    v.created_by_user_id,
    v.updated_by_user_id,
    v.group_owner_company_id,
    v.group_owner_company_is_manual,
    v.technical_manager_company_id,
    v.technical_manager_company_is_manual,
    v.operator_company_id,
    v.operator_company_is_manual,
    v.ship_manager_company_id,
    v.ship_manager_company_is_manual,
    v.length_overall_m,
    v.length_between_perpendiculars_m,
    v.moulded_beam_m,
    v.moulded_depth_m,
    v.ship_type_group,
    v.shipbuilder_company_id,
    v.shipbuilder_company_is_manual,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'vessels'::text) AND (a.entity_id = v.id)))) AS has_attachments,
    hs.dd_count AS dd_hull_event_count,
    hs.has_nb AS has_nb_hull_event,
        CASE
            WHEN (hs.last_service_end < CURRENT_DATE) THEN NULL::text
            ELSE last_maker.name
        END AS current_maker,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'vessels'::text) AND (conv.anchor_id = v.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
        CASE
            WHEN (hs.last_service_end < CURRENT_DATE) THEN NULL::uuid
            ELSE last_maker.id
        END AS current_maker_id,
    gc_group.id AS resolved_group_company_id,
    gc_group.name AS resolved_group_company_name,
    goc.id AS resolved_group_owner_company_id,
    goc.name AS resolved_group_owner_company_name,
    tmc.id AS resolved_technical_manager_company_id,
    tmc.name AS resolved_technical_manager_company_name,
    opc.id AS resolved_operator_company_id,
    opc.name AS resolved_operator_company_name,
    tmc_group.id AS resolved_technical_manager_group_company_id,
    tmc_group.name AS resolved_technical_manager_group_company_name,
    opc_group.id AS resolved_operator_group_company_id,
    opc_group.name AS resolved_operator_group_company_name,
    goc_country.name_en AS resolved_group_owner_company_country,
    gc_group_country.name_en AS resolved_group_company_country,
    tmc_country.name_en AS resolved_technical_manager_company_country,
    tmc_group_country.name_en AS resolved_technical_manager_group_company_country,
    opc_country.name_en AS resolved_operator_company_country,
    opc_group_country.name_en AS resolved_operator_group_company_country,
    hs.last_event_date AS last_hull_event_date,
    hs.next_event_date AS next_hull_event_date,
    nb_sy.name AS nb_shipyard_name,
    nb_sp.name AS nb_supplier_name,
    nb_details.newbuilding_teu AS nb_teu,
    smc.id AS resolved_ship_manager_company_id,
    smc.name AS resolved_ship_manager_company_name,
    smc_group.id AS resolved_ship_manager_group_company_id,
    smc_group.name AS resolved_ship_manager_group_company_name,
    smc_country.name_en AS resolved_ship_manager_company_country,
    smc_group_country.name_en AS resolved_ship_manager_group_company_country,
    last_maker.name AS last_hull_event_supplier_name,
    last_vaf.name AS last_hull_event_vertical_af_product_name,
    last_faf.name AS last_hull_event_flat_bottom_af_product_name,
    last_he.service_period_months AS last_hull_event_service_period_months,
    next_he.status AS next_hull_event_status,
    (EXTRACT(year FROM v.built_date))::integer AS built_year,
    nb_sp.short_code AS nb_supplier_short_code,
    (hs.last_maker_is_own AND (hs.last_service_end >= CURRENT_DATE)) AS current_maker_is_own,
    COALESCE((hs.last_service_end < CURRENT_DATE), false) AS service_period_expired,
    NULLIF(hs.last_service_end, 'infinity'::date) AS last_hull_event_service_end_date,
    ((hs.last_service_end < CURRENT_DATE) AND (hs.next_event_date IS NULL)) AS service_period_expired_no_followup
   FROM ((((((((((((((((((((((((((public.vessels v
     LEFT JOIN public.vessel_hull_event_summary hs ON ((hs.vessel_id = v.id)))
     LEFT JOIN public.companies goc ON ((goc.id = v.group_owner_company_id)))
     LEFT JOIN public.companies gc_group ON ((gc_group.id = goc.group_company_id)))
     LEFT JOIN public.companies tmc ON ((tmc.id = v.technical_manager_company_id)))
     LEFT JOIN public.companies opc ON ((opc.id = v.operator_company_id)))
     LEFT JOIN public.companies smc ON ((smc.id = v.ship_manager_company_id)))
     LEFT JOIN public.companies tmc_group ON ((tmc_group.id = tmc.group_company_id)))
     LEFT JOIN public.companies opc_group ON ((opc_group.id = opc.group_company_id)))
     LEFT JOIN public.companies smc_group ON ((smc_group.id = smc.group_company_id)))
     LEFT JOIN public.countries goc_country ON ((goc_country.id = goc.country_id)))
     LEFT JOIN public.countries gc_group_country ON ((gc_group_country.id = gc_group.country_id)))
     LEFT JOIN public.countries tmc_country ON ((tmc_country.id = tmc.country_id)))
     LEFT JOIN public.countries tmc_group_country ON ((tmc_group_country.id = tmc_group.country_id)))
     LEFT JOIN public.countries opc_country ON ((opc_country.id = opc.country_id)))
     LEFT JOIN public.countries opc_group_country ON ((opc_group_country.id = opc_group.country_id)))
     LEFT JOIN public.countries smc_country ON ((smc_country.id = smc.country_id)))
     LEFT JOIN public.countries smc_group_country ON ((smc_group_country.id = smc_group.country_id)))
     LEFT JOIN public.hull_events last_he ON ((last_he.id = hs.last_event_id)))
     LEFT JOIN public.companies last_maker ON ((last_maker.id = last_he.supplier_this_hullevent_id)))
     LEFT JOIN public.antifouling_products last_vaf ON ((last_vaf.id = last_he.vertical_af_product_id)))
     LEFT JOIN public.antifouling_products last_faf ON ((last_faf.id = last_he.flat_bottom_af_product_id)))
     LEFT JOIN public.hull_events nb_he ON ((nb_he.id = hs.first_nb_event_id)))
     LEFT JOIN public.companies nb_sy ON ((nb_sy.id = nb_he.shipyard_company_id)))
     LEFT JOIN public.companies nb_sp ON ((nb_sp.id = nb_he.supplier_this_hullevent_id)))
     LEFT JOIN public.hull_event_newbuilding_details nb_details ON ((nb_details.hull_event_id = nb_he.id)))
     LEFT JOIN public.hull_events next_he ON ((next_he.id = hs.next_event_id)));

REVOKE ALL ON TABLE public.vessels_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessels_overview TO authenticated;
GRANT ALL ON TABLE public.vessels_overview TO service_role;

CREATE VIEW public.vessels_list_overview WITH (security_invoker='true') AS
 SELECT current_maker_is_own,
    service_period_expired,
    service_period_expired_no_followup,
    id,
    imo,
    name,
    ship_type_group,
    flag,
    class_society,
    deadweight_tonnage,
    gross_tonnage,
    nb_teu,
    built_year,
    status,
    docking_survey_date,
    last_hull_event_date,
    next_hull_event_date,
    nb_shipyard_name,
    nb_supplier_name,
    nb_supplier_short_code,
    group_owner,
    group_owner_country,
    operator,
    operator_country,
    ship_manager,
    ship_manager_country,
    technical_manager,
    technical_manager_country,
    dd_hull_event_count,
    has_nb_hull_event,
    last_hull_event_supplier_name,
    last_hull_event_vertical_af_product_name,
    last_hull_event_service_period_months,
    next_hull_event_status,
    has_attachments,
    has_messages,
    resolved_group_company_id,
    resolved_group_company_name,
    resolved_group_owner_company_id,
    resolved_group_owner_company_name,
    resolved_group_owner_company_country,
    resolved_ship_manager_company_id,
    resolved_ship_manager_company_name,
    resolved_ship_manager_company_country,
    resolved_ship_manager_group_company_id,
    resolved_ship_manager_group_company_name,
    resolved_technical_manager_company_id,
    resolved_technical_manager_company_name,
    resolved_technical_manager_company_country,
    resolved_technical_manager_group_company_id,
    resolved_technical_manager_group_company_name,
    resolved_operator_company_id,
    resolved_operator_company_name,
    resolved_operator_company_country,
    resolved_operator_group_company_id,
    resolved_operator_group_company_name,
    created_at
   FROM public.vessels_overview;

REVOKE ALL ON TABLE public.vessels_list_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.vessels_list_overview TO authenticated;
GRANT ALL ON TABLE public.vessels_list_overview TO service_role;

CREATE VIEW public.newbuilding_projects_overview WITH (security_invoker='true') AS
 SELECT np.id,
    np.title,
    np.status,
    np.lost_reason,
    np.created_at,
    np.bidding_date,
    np.shipyard_company_id,
    shipyard.name AS shipyard_name,
    shipyard_country.name_en AS shipyard_company_country,
    np.customer_company_id,
    cust.name AS customer_name,
    cust_country.name_en AS customer_company_country,
    np.owner_associate_company_id,
    owner_associate.name AS owner_associate_name,
    owner_associate_country.name_en AS owner_associate_company_country,
    np.maker_company_ids,
    makers.names AS maker_names,
    np.estimated_contract_value,
    np.estimated_contract_value_currency,
    np.cash_rebate,
    np.sales_account_user_id,
    sales_rep.name AS sales_account_user_name,
    np.assigned_team_id,
    team.name AS assigned_team_name,
    hull_event_summary.hull_event_count,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'newbuilding_projects'::text) AND (a.entity_id = np.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'newbuilding_projects'::text) AND (conv.anchor_id = np.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    np.ship_type,
    cust.sales_account_user_id AS customer_sales_account_user_id,
    cust_rep.name AS customer_sales_account_user_name,
    shipyard.sales_account_user_id AS shipyard_sales_account_user_id,
    shipyard_rep.name AS shipyard_sales_account_user_name,
    hull_event_summary.first_delivery_date,
    (public.own_maker_company_id() = ANY (np.maker_company_ids)) AS own_maker_on_makers_list,
    cust_rep_tenant.name AS customer_sales_account_user_tenant_name,
    shipyard_rep_tenant.name AS shipyard_sales_account_user_tenant_name
   FROM ((((((((((((((public.newbuilding_projects np
     LEFT JOIN public.companies shipyard ON ((shipyard.id = np.shipyard_company_id)))
     LEFT JOIN public.countries shipyard_country ON ((shipyard_country.id = shipyard.country_id)))
     LEFT JOIN public.companies cust ON ((cust.id = np.customer_company_id)))
     LEFT JOIN public.countries cust_country ON ((cust_country.id = cust.country_id)))
     LEFT JOIN public.companies owner_associate ON ((owner_associate.id = np.owner_associate_company_id)))
     LEFT JOIN public.countries owner_associate_country ON ((owner_associate_country.id = owner_associate.country_id)))
     LEFT JOIN public.users sales_rep ON ((sales_rep.id = np.sales_account_user_id)))
     LEFT JOIN public.users cust_rep ON ((cust_rep.id = cust.sales_account_user_id)))
     LEFT JOIN public.users shipyard_rep ON ((shipyard_rep.id = shipyard.sales_account_user_id)))
     LEFT JOIN public.teams cust_rep_tenant ON ((cust_rep_tenant.id = cust_rep.default_team_id)))
     LEFT JOIN public.teams shipyard_rep_tenant ON ((shipyard_rep_tenant.id = shipyard_rep.default_team_id)))
     LEFT JOIN public.teams team ON ((team.id = np.assigned_team_id)))
     LEFT JOIN LATERAL ( SELECT string_agg(c.name, ', '::text ORDER BY c.name) AS names
           FROM public.companies c
          WHERE (c.id = ANY (np.maker_company_ids))) makers ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS hull_event_count,
            min(he.event_date) AS first_delivery_date
           FROM public.hull_events he
          WHERE (he.newbuilding_project_id = np.id)) hull_event_summary ON (true));

REVOKE ALL ON TABLE public.newbuilding_projects_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.newbuilding_projects_overview TO authenticated;
GRANT ALL ON TABLE public.newbuilding_projects_overview TO service_role;

CREATE VIEW public.shipyards_overview WITH (security_invoker='true') AS
 SELECT c.id,
    c.name,
    c.city,
    co.name_en AS country,
    c.sales_account_user_id,
    rep.name AS sales_account_user_name,
    COALESCE(nb.vessel_count, (0)::bigint) AS nb_vessel_count,
    COALESCE(nb.event_count, (0)::bigint) AS nb_hull_event_count,
    COALESCE(proj.project_count, (0)::bigint) AS newbuilding_project_count,
    COALESCE(mk.makers, '{}'::text[]) AS makers,
    COALESCE(blt.vessel_count, (0)::bigint) AS built_vessel_count,
    COALESCE(he_all.event_count, (0)::bigint) AS hull_event_count,
    (COALESCE(he_all.event_count, (0)::bigint) + COALESCE(proj.project_count, (0)::bigint)) AS usage_count
   FROM (((((((public.companies c
     LEFT JOIN public.countries co ON ((co.id = c.country_id)))
     LEFT JOIN public.users rep ON ((rep.id = c.sales_account_user_id)))
     LEFT JOIN ( SELECT he.shipyard_company_id AS company_id,
            count(DISTINCT he.vessel_id) AS vessel_count,
            count(*) AS event_count
           FROM (public.hull_events he
             JOIN public.phrases p ON (((p.id = he.type_phrase_id) AND (p.code = 'NB'::text))))
          WHERE (he.shipyard_company_id IS NOT NULL)
          GROUP BY he.shipyard_company_id) nb ON ((nb.company_id = c.id)))
     LEFT JOIN ( SELECT hull_events.shipyard_company_id AS company_id,
            count(*) AS event_count
           FROM public.hull_events
          WHERE (hull_events.shipyard_company_id IS NOT NULL)
          GROUP BY hull_events.shipyard_company_id) he_all ON ((he_all.company_id = c.id)))
     LEFT JOIN ( SELECT newbuilding_projects.shipyard_company_id AS company_id,
            count(*) AS project_count
           FROM public.newbuilding_projects
          WHERE (newbuilding_projects.shipyard_company_id IS NOT NULL)
          GROUP BY newbuilding_projects.shipyard_company_id) proj ON ((proj.company_id = c.id)))
     LEFT JOIN ( SELECT vessels.shipbuilder_company_id AS company_id,
            count(*) AS vessel_count
           FROM public.vessels
          WHERE (vessels.shipbuilder_company_id IS NOT NULL)
          GROUP BY vessels.shipbuilder_company_id) blt ON ((blt.company_id = c.id)))
     LEFT JOIN ( SELECT m.company_id,
            array_agg(m.label ORDER BY m.n DESC, m.label) AS makers
           FROM ( SELECT np.shipyard_company_id AS company_id,
                    (((COALESCE(maker.short_code, maker.name) || ' ('::text) || count(*)) || ')'::text) AS label,
                    count(*) AS n
                   FROM ((public.newbuilding_projects np
                     CROSS JOIN LATERAL unnest(np.maker_company_ids) mid(id))
                     JOIN public.companies maker ON ((maker.id = mid.id)))
                  WHERE ((np.shipyard_company_id IS NOT NULL) AND (COALESCE(np.bidding_date, (np.created_at)::date) >= (CURRENT_DATE - '3 years'::interval)))
                  GROUP BY np.shipyard_company_id, maker.id, maker.short_code, maker.name) m
          GROUP BY m.company_id) mk ON ((mk.company_id = c.id)))
  WHERE (c.company_types @> ARRAY['shipyard'::text]);

REVOKE ALL ON TABLE public.shipyards_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.shipyards_overview TO authenticated;
GRANT ALL ON TABLE public.shipyards_overview TO service_role;

CREATE FUNCTION public.companies_list(p_ship_type_groups text[] DEFAULT NULL::text[]) RETURNS SETOF public.companies_overview
    LANGUAGE sql STABLE
    AS $$
  select
    b.*,
    coalesce(s.vessel_count, 0),
    s.dwt_sum,
    coalesce(s.np_now_count, 0),
    coalesce(s.np_nb_count, 0),
    coalesce(s.survey_due_count_y0, 0),
    coalesce(s.survey_due_count_y1, 0),
    coalesce(s.survey_due_count_y2, 0),
    coalesce(s.technical_manager_vessel_count, 0),
    coalesce(s.operator_vessel_count, 0),
    coalesce(s.unique_vessel_count, 0),
    coalesce(s.np_technical_manager_vessel_count, 0),
    coalesce(s.np_operator_vessel_count, 0),
    coalesce(s.np_unique_vessel_count, 0),
    round(s.dwt_sum / nullif(s.unique_vessel_count, 0))
  from public.companies_overview_base b
  left join public.companies_vessel_rollup_sums(p_ship_type_groups) s on s.company_id = b.id
  -- with a type filter only companies that hold such a vessel; without one every company, vessels or not
  where p_ship_type_groups is null or s.company_id is not null
$$;

REVOKE ALL ON FUNCTION public.companies_list(p_ship_type_groups text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.companies_list(p_ship_type_groups text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.companies_list(p_ship_type_groups text[]) TO authenticated;
GRANT ALL ON FUNCTION public.companies_list(p_ship_type_groups text[]) TO service_role;

CREATE FUNCTION public.vessels_list(p_any uuid[] DEFAULT NULL::uuid[], p_owner uuid[] DEFAULT NULL::uuid[], p_ship_manager uuid[] DEFAULT NULL::uuid[], p_technical_manager uuid[] DEFAULT NULL::uuid[], p_operator uuid[] DEFAULT NULL::uuid[]) RETURNS SETOF public.vessels_list_overview
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_ids uuid[];
begin
  v_ids := coalesce(
    case when p_any is not null then array(select v.id from public.vessels v where v.group_owner_company_id = any(p_any) union select v.id from public.vessels v join public.companies c on c.id = v.group_owner_company_id where c.group_company_id = any(p_any) union select v.id from public.vessels v where v.ship_manager_company_id = any(p_any) union select v.id from public.vessels v join public.companies c on c.id = v.ship_manager_company_id where c.group_company_id = any(p_any) union select v.id from public.vessels v where v.technical_manager_company_id = any(p_any) union select v.id from public.vessels v join public.companies c on c.id = v.technical_manager_company_id where c.group_company_id = any(p_any) union select v.id from public.vessels v where v.operator_company_id = any(p_any) union select v.id from public.vessels v join public.companies c on c.id = v.operator_company_id where c.group_company_id = any(p_any)) end,
    case when p_owner is not null then array(select v.id from public.vessels v where v.group_owner_company_id = any(p_owner) union select v.id from public.vessels v join public.companies c on c.id = v.group_owner_company_id where c.group_company_id = any(p_owner)) end,
    case when p_ship_manager is not null then array(select v.id from public.vessels v where v.ship_manager_company_id = any(p_ship_manager) union select v.id from public.vessels v join public.companies c on c.id = v.ship_manager_company_id where c.group_company_id = any(p_ship_manager)) end,
    case when p_technical_manager is not null then array(select v.id from public.vessels v where v.technical_manager_company_id = any(p_technical_manager) union select v.id from public.vessels v join public.companies c on c.id = v.technical_manager_company_id where c.group_company_id = any(p_technical_manager)) end,
    case when p_operator is not null then array(select v.id from public.vessels v where v.operator_company_id = any(p_operator) union select v.id from public.vessels v join public.companies c on c.id = v.operator_company_id where c.group_company_id = any(p_operator)) end);
  return query
  select vo.current_maker_is_own,
    vo.service_period_expired,
    vo.service_period_expired_no_followup,
    vo.id,
    vo.imo,
    vo.name,
    vo.ship_type_group,
    vo.flag,
    vo.class_society,
    vo.deadweight_tonnage,
    vo.gross_tonnage,
    vo.nb_teu,
    vo.built_year,
    vo.status,
    vo.docking_survey_date,
    vo.last_hull_event_date,
    vo.next_hull_event_date,
    vo.nb_shipyard_name,
    vo.nb_supplier_name,
    vo.nb_supplier_short_code,
    vo.group_owner,
    vo.group_owner_country,
    vo.operator,
    vo.operator_country,
    vo.ship_manager,
    vo.ship_manager_country,
    vo.technical_manager,
    vo.technical_manager_country,
    vo.dd_hull_event_count,
    vo.has_nb_hull_event,
    vo.last_hull_event_supplier_name,
    vo.last_hull_event_vertical_af_product_name,
    vo.last_hull_event_service_period_months,
    vo.next_hull_event_status,
    vo.has_attachments,
    vo.has_messages,
    vo.resolved_group_company_id,
    vo.resolved_group_company_name,
    vo.resolved_group_owner_company_id,
    vo.resolved_group_owner_company_name,
    vo.resolved_group_owner_company_country,
    vo.resolved_ship_manager_company_id,
    vo.resolved_ship_manager_company_name,
    vo.resolved_ship_manager_company_country,
    vo.resolved_ship_manager_group_company_id,
    vo.resolved_ship_manager_group_company_name,
    vo.resolved_technical_manager_company_id,
    vo.resolved_technical_manager_company_name,
    vo.resolved_technical_manager_company_country,
    vo.resolved_technical_manager_group_company_id,
    vo.resolved_technical_manager_group_company_name,
    vo.resolved_operator_company_id,
    vo.resolved_operator_company_name,
    vo.resolved_operator_company_country,
    vo.resolved_operator_group_company_id,
    vo.resolved_operator_group_company_name,
    vo.created_at
  from public.vessels_overview vo
  where vo.id = any(v_ids)
    and (p_any is null or vo.group_owner_company_id = any(p_any) or vo.group_owner_company_id in (select c.id from public.companies c where c.group_company_id = any(p_any)) or vo.ship_manager_company_id = any(p_any) or vo.ship_manager_company_id in (select c.id from public.companies c where c.group_company_id = any(p_any)) or vo.technical_manager_company_id = any(p_any) or vo.technical_manager_company_id in (select c.id from public.companies c where c.group_company_id = any(p_any)) or vo.operator_company_id = any(p_any) or vo.operator_company_id in (select c.id from public.companies c where c.group_company_id = any(p_any)))
    and (p_owner is null or vo.group_owner_company_id = any(p_owner) or vo.group_owner_company_id in (select c.id from public.companies c where c.group_company_id = any(p_owner)))
    and (p_ship_manager is null or vo.ship_manager_company_id = any(p_ship_manager) or vo.ship_manager_company_id in (select c.id from public.companies c where c.group_company_id = any(p_ship_manager)))
    and (p_technical_manager is null or vo.technical_manager_company_id = any(p_technical_manager) or vo.technical_manager_company_id in (select c.id from public.companies c where c.group_company_id = any(p_technical_manager)))
    and (p_operator is null or vo.operator_company_id = any(p_operator) or vo.operator_company_id in (select c.id from public.companies c where c.group_company_id = any(p_operator)));
end;
$$;

REVOKE ALL ON FUNCTION public.vessels_list(p_any uuid[], p_owner uuid[], p_ship_manager uuid[], p_technical_manager uuid[], p_operator uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.vessels_list(p_any uuid[], p_owner uuid[], p_ship_manager uuid[], p_technical_manager uuid[], p_operator uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vessels_list(p_any uuid[], p_owner uuid[], p_ship_manager uuid[], p_technical_manager uuid[], p_operator uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.vessels_list(p_any uuid[], p_owner uuid[], p_ship_manager uuid[], p_technical_manager uuid[], p_operator uuid[]) TO service_role;

-- Hand-written part of the fleet slice: permissions, record access registration, activity labels.
insert into public.permissions (key, module, action, scope, sort_order) values
  ('vessels.edit', 'vessels', 'edit', null, 420), ('vessels.create', 'vessels', 'create', null, 421), ('vessels.delete', 'vessels', 'delete', null, 422),
  ('hull_events.view.own', 'hull_events', 'view', 'own', 430), ('hull_events.view.team', 'hull_events', 'view', 'team', 431),
  ('hull_events.view.account', 'hull_events', 'view', 'account', 432), ('hull_events.view.all', 'hull_events', 'view', 'all', 433),
  ('hull_events.edit.own', 'hull_events', 'edit', 'own', 434), ('hull_events.edit.team', 'hull_events', 'edit', 'team', 435),
  ('hull_events.edit.account', 'hull_events', 'edit', 'account', 436), ('hull_events.edit.all', 'hull_events', 'edit', 'all', 437),
  ('hull_events.create.own', 'hull_events', 'create', 'own', 438), ('hull_events.create.team', 'hull_events', 'create', 'team', 439),
  ('hull_events.create.all', 'hull_events', 'create', 'all', 440),
  ('hull_events.delete.own', 'hull_events', 'delete', 'own', 441), ('hull_events.delete.team', 'hull_events', 'delete', 'team', 442),
  ('hull_events.delete.all', 'hull_events', 'delete', 'all', 443),
  ('hull_events.approve.own', 'hull_events', 'approve', 'own', 444), ('hull_events.approve.team', 'hull_events', 'approve', 'team', 445),
  ('hull_events.approve.all', 'hull_events', 'approve', 'all', 446),
  ('newbuildings.view.own', 'newbuildings', 'view', 'own', 450), ('newbuildings.view.team', 'newbuildings', 'view', 'team', 451),
  ('newbuildings.view.account', 'newbuildings', 'view', 'account', 452), ('newbuildings.view.all', 'newbuildings', 'view', 'all', 453),
  ('newbuildings.edit.own', 'newbuildings', 'edit', 'own', 454), ('newbuildings.edit.team', 'newbuildings', 'edit', 'team', 455),
  ('newbuildings.edit.account', 'newbuildings', 'edit', 'account', 456), ('newbuildings.edit.all', 'newbuildings', 'edit', 'all', 457),
  ('newbuildings.create.own', 'newbuildings', 'create', 'own', 458), ('newbuildings.create.team', 'newbuildings', 'create', 'team', 459),
  ('newbuildings.create.all', 'newbuildings', 'create', 'all', 460),
  ('newbuildings.delete.own', 'newbuildings', 'delete', 'own', 461), ('newbuildings.delete.team', 'newbuildings', 'delete', 'team', 462),
  ('newbuildings.delete.all', 'newbuildings', 'delete', 'all', 463);
insert into public.permission_implies (permission, implies)
select m || '.' || a || '.' || s, m || '.view.' || s
from (values ('hull_events'), ('newbuildings')) mm(m), (values ('edit'), ('create'), ('delete'), ('approve')) aa(a), (values ('own'), ('team'), ('account'), ('all')) ss(s)
where exists (select 1 from public.permissions p where p.key = m || '.' || a || '.' || s);

-- Record access: user-based wrappers over the context based row functions (same rule, one source).
create function public.hull_events_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.hull_events_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, public.access_context_for(p_user_id)); $$;
create function public.newbuilding_projects_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.newbuilding_projects_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, public.access_context_for(p_user_id)); $$;
create function public.vessels_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin return p_action in ('view', 'check') or ('vessels.' || p_action) = any (public.user_permissions(p_user_id)); end; $$;
create function public.vessels_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable set search_path to '' as $$
begin return p_action in ('view', 'check') or ('vessels.' || p_action) = any ((p_ctx).permissions); end; $$;
create function public.vessels_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select v.name from public.vessels v where v.id = p_entity_id; $$;
revoke all on function public.hull_events_access(uuid, uuid, text), public.newbuilding_projects_access(uuid, uuid, text),
  public.vessels_access(uuid, uuid, text), public.vessels_row_allows(text, uuid, public.access_context), public.vessels_label(uuid) from public, anon, authenticated;
grant execute on function public.hull_events_access(uuid, uuid, text), public.newbuilding_projects_access(uuid, uuid, text),
  public.vessels_access(uuid, uuid, text), public.vessels_row_allows(text, uuid, public.access_context), public.vessels_label(uuid) to authenticated, service_role;
-- Writing a note ('check') needs only the right to see the record: the context functions map it to 'view'.
create function public.hull_events_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable set search_path to '' as $$ select public.hull_events_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, p_ctx); $$;
create function public.newbuilding_projects_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable set search_path to '' as $$ select public.newbuilding_projects_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, p_ctx); $$;
grant execute on function public.hull_events_ctx_allows(text, uuid, public.access_context), public.newbuilding_projects_ctx_allows(text, uuid, public.access_context) to authenticated, service_role;
select public.entity_type_register('hull_events', 'hull_events', 'hull_events_access', 'hull_events_ctx_allows', 'A hull event (DD, NB, SS ...)');
select public.entity_type_register('newbuilding_projects', 'hull_events', 'newbuilding_projects_access', 'newbuilding_projects_ctx_allows', 'A newbuilding project');
select public.entity_type_register('vessels', 'vessels', 'vessels_access', 'vessels_row_allows', 'A vessel', 'vessels_label');

select public.activity_label_register('teams', 'teams', 'name', 'platform');
select public.activity_label_register('newbuilding_projects', 'newbuilding_projects', 'name', 'hull_events');
select public.activity_label_register('ports', 'ports', 'name', 'companies');

