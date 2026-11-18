-- NPM dock reports slice (WP 9): dock reports, areas, coat lines and batches, daily logs, weather, activities, photos,
-- signatures, dock_reports_overview. Source: NPM database. Same renames as the offers slice.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.dock_reports (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    hull_event_id uuid NOT NULL,
    specification_id uuid NOT NULL,
    vessel_id uuid NOT NULL,
    sales_account_user_id uuid,
    technical_service_rep_user_id uuid,
    assigned_team_id uuid,
    report_number text,
    status text DEFAULT 'draft'::text NOT NULL,
    indocking_date date,
    outdocking_date date,
    remarks_text text,
    antifouling_line_fwd_m numeric,
    antifouling_line_aft_m numeric,
    boottop_line_fwd_m numeric,
    boottop_line_aft_m numeric,
    cathodic_protection_type_phrase_id uuid,
    cathodic_protection_anode_count integer,
    locked_by_user_id uuid,
    locked_at timestamp with time zone,
    submitted_at timestamp with time zone,
    submitted_by_user_id uuid,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    time_zone text,
    CONSTRAINT dock_reports_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'finalized'::text])))
);


ALTER TABLE public.dock_reports OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_reports FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_reports TO authenticated;
GRANT ALL ON TABLE public.dock_reports TO service_role;

CREATE TABLE public.dock_report_areas (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_id uuid NOT NULL,
    area_id uuid,
    size_m2 numeric,
    substrate_phrase_id uuid,
    environment_standard_phrase_id uuid,
    surface_preparation_text text,
    actual_surface_preparation_text text,
    remarks_text text,
    fouling_extent_pct numeric,
    fouling_evaluation_phrase_id uuid,
    condition_comments_text text,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dock_report_areas OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_areas FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_areas TO authenticated;
GRANT ALL ON TABLE public.dock_report_areas TO service_role;

CREATE TABLE public.dock_report_area_products (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_area_id uuid NOT NULL,
    product_packaging_id uuid NOT NULL,
    coat_mode_phrase_id uuid,
    coat_pct numeric,
    application_method_phrase_id uuid,
    dry_film_thickness_um numeric,
    measured_dry_film_thickness_um numeric,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dock_report_area_products OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_area_products FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_area_products TO authenticated;
GRANT ALL ON TABLE public.dock_report_area_products TO service_role;

CREATE TABLE public.dock_report_area_product_batches (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_area_product_id uuid NOT NULL,
    batch_number text,
    drum_quantity numeric,
    consumption_date date,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dock_report_area_product_batches OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_area_product_batches FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_area_product_batches TO authenticated;
GRANT ALL ON TABLE public.dock_report_area_product_batches TO service_role;

CREATE TABLE public.dock_report_daily_logs (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_id uuid NOT NULL,
    log_date date NOT NULL,
    narrative_text text,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dock_report_daily_logs OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_daily_logs FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_daily_logs TO authenticated;
GRANT ALL ON TABLE public.dock_report_daily_logs TO service_role;

CREATE TABLE public.dock_report_weather_readings (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_daily_log_id uuid NOT NULL,
    time_taken time without time zone,
    air_temperature_c numeric,
    surface_temperature_c numeric,
    dew_point_c numeric,
    relative_humidity_pct numeric,
    wind_condition_text text,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dock_report_weather_readings OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_weather_readings FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_weather_readings TO authenticated;
GRANT ALL ON TABLE public.dock_report_weather_readings TO service_role;

CREATE TABLE public.dock_report_activities (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_daily_log_id uuid NOT NULL,
    dock_report_area_id uuid,
    time_taken time without time zone,
    activity_text text,
    application_method_phrase_id uuid,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.dock_report_activities OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_activities FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_activities TO authenticated;
GRANT ALL ON TABLE public.dock_report_activities TO service_role;

CREATE TABLE public.dock_report_photos (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_id uuid NOT NULL,
    dock_report_area_id uuid,
    dock_report_daily_log_id uuid,
    stage_phrase_id uuid,
    taken_at date,
    caption_text text,
    include_in_daily_report boolean DEFAULT false NOT NULL,
    include_in_final_report boolean DEFAULT false NOT NULL,
    storage_path text,
    uploaded_by_user_id uuid DEFAULT auth.uid(),
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dock_report_activity_id uuid
);


ALTER TABLE public.dock_report_photos OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_photos FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_photos TO authenticated;
GRANT ALL ON TABLE public.dock_report_photos TO service_role;

CREATE TABLE public.dock_report_signatures (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    dock_report_id uuid NOT NULL,
    role text NOT NULL,
    signer_name text,
    signed_at timestamp with time zone,
    signature_storage_path text,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dock_report_signatures_role_check CHECK ((role = ANY (ARRAY['owner_representative'::text, 'npm_representative'::text, 'shipyard_representative'::text])))
);


ALTER TABLE public.dock_report_signatures OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_report_signatures FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_report_signatures TO authenticated;
GRANT ALL ON TABLE public.dock_report_signatures TO service_role;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_hull_event_id_key UNIQUE (hull_event_id);

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_pkey PRIMARY KEY (id);

CREATE INDEX dock_reports_assigned_team_id_idx ON public.dock_reports USING btree (assigned_team_id);

CREATE INDEX dock_reports_sales_account_user_id_idx ON public.dock_reports USING btree (sales_account_user_id);

CREATE INDEX dock_reports_specification_id_idx ON public.dock_reports USING btree (specification_id);

CREATE INDEX dock_reports_technical_service_rep_user_id_idx ON public.dock_reports USING btree (technical_service_rep_user_id);

CREATE INDEX dock_reports_vessel_id_idx ON public.dock_reports USING btree (vessel_id);

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_areas_area_id_idx ON public.dock_report_areas USING btree (area_id);

CREATE INDEX dock_report_areas_dock_report_id_idx ON public.dock_report_areas USING btree (dock_report_id);

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_area_products_dock_report_area_id_idx ON public.dock_report_area_products USING btree (dock_report_area_id);

CREATE INDEX dock_report_area_products_product_packaging_id_idx ON public.dock_report_area_products USING btree (product_packaging_id);

ALTER TABLE ONLY public.dock_report_area_product_batches
    ADD CONSTRAINT dock_report_area_product_batches_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_area_product_batche_dock_report_area_product_id_idx ON public.dock_report_area_product_batches USING btree (dock_report_area_product_id);

CREATE INDEX dock_report_area_product_batches_consumption_date_idx ON public.dock_report_area_product_batches USING btree (consumption_date);

ALTER TABLE ONLY public.dock_report_daily_logs
    ADD CONSTRAINT dock_report_daily_logs_dock_report_id_log_date_key UNIQUE (dock_report_id, log_date);

ALTER TABLE ONLY public.dock_report_daily_logs
    ADD CONSTRAINT dock_report_daily_logs_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_daily_logs_dock_report_id_idx ON public.dock_report_daily_logs USING btree (dock_report_id);

ALTER TABLE ONLY public.dock_report_weather_readings
    ADD CONSTRAINT dock_report_weather_readings_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_weather_readings_dock_report_daily_log_id_idx ON public.dock_report_weather_readings USING btree (dock_report_daily_log_id);

ALTER TABLE ONLY public.dock_report_activities
    ADD CONSTRAINT dock_report_activities_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_activities_dock_report_area_id_idx ON public.dock_report_activities USING btree (dock_report_area_id);

CREATE INDEX dock_report_activities_dock_report_daily_log_id_idx ON public.dock_report_activities USING btree (dock_report_daily_log_id);

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_photos_dock_report_activity_id_idx ON public.dock_report_photos USING btree (dock_report_activity_id);

CREATE INDEX dock_report_photos_dock_report_area_id_idx ON public.dock_report_photos USING btree (dock_report_area_id);

CREATE INDEX dock_report_photos_dock_report_daily_log_id_idx ON public.dock_report_photos USING btree (dock_report_daily_log_id);

CREATE INDEX dock_report_photos_dock_report_id_idx ON public.dock_report_photos USING btree (dock_report_id);

CREATE INDEX dock_report_photos_storage_path_idx ON public.dock_report_photos USING btree (storage_path);

ALTER TABLE ONLY public.dock_report_signatures
    ADD CONSTRAINT dock_report_signatures_pkey PRIMARY KEY (id);

CREATE INDEX dock_report_signatures_dock_report_id_idx ON public.dock_report_signatures USING btree (dock_report_id);

CREATE INDEX dock_report_signatures_storage_path_idx ON public.dock_report_signatures USING btree (signature_storage_path);

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_cathodic_protection_type_phrase_id_fkey FOREIGN KEY (cathodic_protection_type_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_hull_event_id_fkey FOREIGN KEY (hull_event_id) REFERENCES public.hull_events(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_sales_account_user_id_fkey FOREIGN KEY (sales_account_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_technical_service_rep_user_id_fkey FOREIGN KEY (technical_service_rep_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_reports
    ADD CONSTRAINT dock_reports_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.spec_areas(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_dock_report_id_fkey FOREIGN KEY (dock_report_id) REFERENCES public.dock_reports(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_environment_standard_phrase_id_fkey FOREIGN KEY (environment_standard_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_fouling_evaluation_phrase_id_fkey FOREIGN KEY (fouling_evaluation_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_substrate_phrase_id_fkey FOREIGN KEY (substrate_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_areas
    ADD CONSTRAINT dock_report_areas_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_application_method_phrase_id_fkey FOREIGN KEY (application_method_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_coat_mode_phrase_id_fkey FOREIGN KEY (coat_mode_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_dock_report_area_id_fkey FOREIGN KEY (dock_report_area_id) REFERENCES public.dock_report_areas(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_product_packaging_id_fkey FOREIGN KEY (product_packaging_id) REFERENCES public.product_packagings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_area_products
    ADD CONSTRAINT dock_report_area_products_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_area_product_batches
    ADD CONSTRAINT dock_report_area_product_batch_dock_report_area_product_id_fkey FOREIGN KEY (dock_report_area_product_id) REFERENCES public.dock_report_area_products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_area_product_batches
    ADD CONSTRAINT dock_report_area_product_batches_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_area_product_batches
    ADD CONSTRAINT dock_report_area_product_batches_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_daily_logs
    ADD CONSTRAINT dock_report_daily_logs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_daily_logs
    ADD CONSTRAINT dock_report_daily_logs_dock_report_id_fkey FOREIGN KEY (dock_report_id) REFERENCES public.dock_reports(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_daily_logs
    ADD CONSTRAINT dock_report_daily_logs_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_weather_readings
    ADD CONSTRAINT dock_report_weather_readings_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_weather_readings
    ADD CONSTRAINT dock_report_weather_readings_dock_report_daily_log_id_fkey FOREIGN KEY (dock_report_daily_log_id) REFERENCES public.dock_report_daily_logs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_weather_readings
    ADD CONSTRAINT dock_report_weather_readings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_activities
    ADD CONSTRAINT dock_report_activities_application_method_phrase_id_fkey FOREIGN KEY (application_method_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_activities
    ADD CONSTRAINT dock_report_activities_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_activities
    ADD CONSTRAINT dock_report_activities_dock_report_area_id_fkey FOREIGN KEY (dock_report_area_id) REFERENCES public.dock_report_areas(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_activities
    ADD CONSTRAINT dock_report_activities_dock_report_daily_log_id_fkey FOREIGN KEY (dock_report_daily_log_id) REFERENCES public.dock_report_daily_logs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_activities
    ADD CONSTRAINT dock_report_activities_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_dock_report_activity_id_fkey FOREIGN KEY (dock_report_activity_id) REFERENCES public.dock_report_activities(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_dock_report_area_id_fkey FOREIGN KEY (dock_report_area_id) REFERENCES public.dock_report_areas(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_dock_report_daily_log_id_fkey FOREIGN KEY (dock_report_daily_log_id) REFERENCES public.dock_report_daily_logs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_dock_report_id_fkey FOREIGN KEY (dock_report_id) REFERENCES public.dock_reports(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_stage_phrase_id_fkey FOREIGN KEY (stage_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_photos
    ADD CONSTRAINT dock_report_photos_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_signatures
    ADD CONSTRAINT dock_report_signatures_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.dock_report_signatures
    ADD CONSTRAINT dock_report_signatures_dock_report_id_fkey FOREIGN KEY (dock_report_id) REFERENCES public.dock_reports(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.dock_report_signatures
    ADD CONSTRAINT dock_report_signatures_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.dock_reports_row_allows(p_action text, p_id uuid, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sales uuid;
  v_tsr uuid;
  v_team uuid;
  v_locked_by uuid;
  v_hull_event uuid;
begin
  select sales_account_user_id, technical_service_rep_user_id, assigned_team_id, locked_by_user_id, hull_event_id
  into v_sales, v_tsr, v_team, v_locked_by, v_hull_event
  from public.dock_reports where id = p_id;
  if not found then
    return false;
  end if;
  if p_action <> 'view' and v_locked_by is not null and v_locked_by is distinct from (p_ctx).user_id then
    return false;
  end if;
  if ('dock_reports.' || p_action || '.all') = any((p_ctx).permissions) then
    return true;
  end if;
  if ('dock_reports.' || p_action || '.own') = any((p_ctx).permissions) and (p_ctx).user_id in (v_sales, v_tsr) then
    return true;
  end if;
  if ('dock_reports.' || p_action || '.team') = any((p_ctx).permissions) and v_team = any((p_ctx).team_ids) then
    return true;
  end if;
  if ('dock_reports.' || p_action || '.account') = any((p_ctx).permissions) then
    return exists (
      select 1 from public.hull_events h
      join public.companies c on c.id = any(array[h.customer_company_id, h.dealer_company_id, h.facilitating_partner_company_id, h.shipyard_company_id, h.snapshot_group_owner_company_id, h.snapshot_operator_company_id, h.snapshot_ship_manager_company_id, h.snapshot_technical_manager_company_id])
      where h.id = v_hull_event and (c.sales_account_user_id = (p_ctx).user_id or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)));
  end if;
  return false;
end;
$$;


ALTER FUNCTION public.dock_reports_row_allows(p_action text, p_id uuid, p_ctx public.access_context) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dock_reports_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dock_reports_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dock_reports_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.dock_reports_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.dock_reports_can_edit(rec public.dock_reports) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.can_access_entity('dock_reports', rec.id, 'edit');
$$;


ALTER FUNCTION public.dock_reports_can_edit(rec public.dock_reports) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dock_reports_can_edit(rec public.dock_reports) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dock_reports_can_edit(rec public.dock_reports) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dock_reports_can_edit(rec public.dock_reports) TO authenticated;
GRANT ALL ON FUNCTION public.dock_reports_can_edit(rec public.dock_reports) TO service_role;

CREATE FUNCTION public.dock_reports_default_time_zone() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.time_zone is null then
    select u.time_zone into new.time_zone from public.users u where u.id = auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.dock_reports_default_time_zone() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.dock_reports_default_time_zone() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.dock_reports_default_time_zone() FROM PUBLIC;
GRANT ALL ON FUNCTION public.dock_reports_default_time_zone() TO authenticated;
GRANT ALL ON FUNCTION public.dock_reports_default_time_zone() TO service_role;

CREATE FUNCTION public.prepare_dock_report() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_hull_event public.hull_events%rowtype;
  v_prev public.dock_reports%rowtype;
begin
  select * into v_hull_event from public.hull_events where id = new.hull_event_id;
  if v_hull_event.id is null then
    raise exception 'Hull event % not found', new.hull_event_id;
  end if;
  if v_hull_event.type_code not in ('DD', 'NB') then
    raise exception 'dock_reports.hull_event_id must reference a DD or NB hull event, got type %', v_hull_event.type_code;
  end if;

  if not exists (
    select 1 from public.specifications
    where id = new.specification_id and hull_event_id = new.hull_event_id
  ) then
    raise exception 'specification % does not belong to hull event %', new.specification_id, new.hull_event_id;
  end if;

  new.vessel_id := v_hull_event.vessel_id;

  if TG_OP = 'INSERT' then
    new.sales_account_user_id := coalesce(new.sales_account_user_id, v_hull_event.sales_account_user_id);
    new.technical_service_rep_user_id := coalesce(new.technical_service_rep_user_id, v_hull_event.technical_service_rep_user_id);
    new.assigned_team_id := coalesce(new.assigned_team_id, v_hull_event.assigned_team_id);

    select * into v_prev
      from public.dock_reports
      where vessel_id = new.vessel_id
      order by coalesce(indocking_date, created_at::date) desc, created_at desc
      limit 1;

    if v_prev.id is not null then
      new.antifouling_line_fwd_m := coalesce(new.antifouling_line_fwd_m, v_prev.antifouling_line_fwd_m);
      new.antifouling_line_aft_m := coalesce(new.antifouling_line_aft_m, v_prev.antifouling_line_aft_m);
      new.boottop_line_fwd_m := coalesce(new.boottop_line_fwd_m, v_prev.boottop_line_fwd_m);
      new.boottop_line_aft_m := coalesce(new.boottop_line_aft_m, v_prev.boottop_line_aft_m);
      new.cathodic_protection_type_phrase_id := coalesce(new.cathodic_protection_type_phrase_id, v_prev.cathodic_protection_type_phrase_id);
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.prepare_dock_report() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.prepare_dock_report() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_dock_report() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_dock_report() TO authenticated;
GRANT ALL ON FUNCTION public.prepare_dock_report() TO service_role;

CREATE FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_area jsonb;
  v_area_id uuid;
  v_area_product jsonb;
  v_area_product_id uuid;
  v_kept_ids uuid[];
begin
  if not public.can_access_entity('dock_reports', p_dock_report_id, 'edit') then
    raise exception 'Not authorized to edit dock report %', p_dock_report_id;
  end if;

  select coalesce(array_agg((a->>'id')::uuid), array[]::uuid[])
  into v_kept_ids
  from jsonb_array_elements(p_areas) a;

  delete from public.dock_report_areas
  where dock_report_id = p_dock_report_id
    and id != all (v_kept_ids);

  for v_area in select * from jsonb_array_elements(p_areas)
  loop
    v_area_id := (v_area->>'id')::uuid;

    insert into public.dock_report_areas (
      id, dock_report_id, area_id, size_m2, substrate_phrase_id, environment_standard_phrase_id,
      surface_preparation_text, actual_surface_preparation_text, remarks_text,
      fouling_extent_pct, fouling_evaluation_phrase_id, condition_comments_text
    ) values (
      v_area_id,
      p_dock_report_id,
      (v_area->>'area_id')::uuid, (v_area->>'size_m2')::numeric, (v_area->>'substrate_phrase_id')::uuid,
      (v_area->>'environment_standard_phrase_id')::uuid,
      v_area->>'surface_preparation_text', v_area->>'actual_surface_preparation_text', v_area->>'remarks_text',
      (v_area->>'fouling_extent_pct')::numeric, (v_area->>'fouling_evaluation_phrase_id')::uuid, v_area->>'condition_comments_text'
    )
    on conflict (id) do update set
      area_id = excluded.area_id,
      size_m2 = excluded.size_m2,
      substrate_phrase_id = excluded.substrate_phrase_id,
      environment_standard_phrase_id = excluded.environment_standard_phrase_id,
      surface_preparation_text = excluded.surface_preparation_text,
      actual_surface_preparation_text = excluded.actual_surface_preparation_text,
      remarks_text = excluded.remarks_text,
      fouling_extent_pct = excluded.fouling_extent_pct,
      fouling_evaluation_phrase_id = excluded.fouling_evaluation_phrase_id,
      condition_comments_text = excluded.condition_comments_text;

    delete from public.dock_report_area_products where dock_report_area_id = v_area_id;

    -- A coat line with no product picked yet is a placeholder (see
    -- specifications/areasEditor.tsx's own comment) - product_packaging_id
    -- is not null on this table, so it's never sent to begin with.
    for v_area_product in
      select * from jsonb_array_elements(v_area->'products') p
      where p->>'product_packaging_id' is not null
    loop
      insert into public.dock_report_area_products (
        dock_report_area_id, product_packaging_id, coat_mode_phrase_id, coat_pct, application_method_phrase_id,
        dry_film_thickness_um, measured_dry_film_thickness_um
      ) values (
        v_area_id,
        (v_area_product->>'product_packaging_id')::uuid, (v_area_product->>'coat_mode_phrase_id')::uuid,
        (v_area_product->>'coat_pct')::numeric, (v_area_product->>'application_method_phrase_id')::uuid,
        (v_area_product->>'dry_film_thickness_um')::numeric, (v_area_product->>'measured_dry_film_thickness_um')::numeric
      )
      returning id into v_area_product_id;

      insert into public.dock_report_area_product_batches (
        dock_report_area_product_id, batch_number, drum_quantity, consumption_date
      )
      select v_area_product_id, b->>'batch_number', (b->>'drum_quantity')::numeric, (b->>'consumption_date')::date
      from jsonb_array_elements(coalesce(v_area_product->'batches', '[]'::jsonb)) as b;
    end loop;
  end loop;
end;
$$;


ALTER FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) TO service_role;

CREATE FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_grant_type text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.can_access_dock_report_area(p_area_id, p_grant_type, public.access_context()); $$;


ALTER FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_grant_type text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_grant_type text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_grant_type text) TO service_role;

CREATE FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parent uuid;
begin
  select t.dock_report_id into v_parent from public.dock_report_areas t where t.id = p_area_id;
  if not found then
    return false;
  end if;
  return public.dock_reports_row_allows(p_action, v_parent, p_ctx);
end;
$$;


ALTER FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx public.access_context) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_grant_type text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.can_access_dock_report_area_product(p_area_product_id, p_grant_type, public.access_context()); $$;


ALTER FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_grant_type text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_grant_type text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_grant_type text) TO service_role;

CREATE FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_action text, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parent uuid;
begin
  select t.dock_report_area_id into v_parent from public.dock_report_area_products t where t.id = p_area_product_id;
  if not found then
    return false;
  end if;
  return public.can_access_dock_report_area(v_parent, p_action, p_ctx);
end;
$$;


ALTER FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_action text, p_ctx public.access_context) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_action text, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dock_report_area_product(p_area_product_id uuid, p_action text, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_grant_type text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.can_access_dock_report_daily_log(p_daily_log_id, p_grant_type, public.access_context()); $$;


ALTER FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_grant_type text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_grant_type text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_grant_type text) TO service_role;

CREATE FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parent uuid;
begin
  select t.dock_report_id into v_parent from public.dock_report_daily_logs t where t.id = p_daily_log_id;
  if not found then
    return false;
  end if;
  return public.dock_reports_row_allows(p_action, v_parent, p_ctx);
end;
$$;


ALTER FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx public.access_context) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx public.access_context) TO service_role;

ALTER TABLE public.dock_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create dock reports per grant" ON public.dock_reports FOR INSERT TO authenticated WITH CHECK (public.hull_events_row_allows('edit'::text, hull_event_id, ( SELECT public.access_context() AS access_context)));

CREATE POLICY "Delete dock reports per grant" ON public.dock_reports FOR DELETE TO authenticated USING (((((locked_by_user_id IS NULL) OR (locked_by_user_id = ( SELECT auth.uid() AS uid))) AND (( SELECT public.rls_has('dock_reports.delete.all'::text) AS rls_has) OR (( SELECT public.rls_has('dock_reports.delete.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('dock_reports.delete.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))))));

CREATE POLICY "Edit dock reports per grant" ON public.dock_reports FOR UPDATE TO authenticated USING (((((locked_by_user_id IS NULL) OR (locked_by_user_id = ( SELECT auth.uid() AS uid))) AND (( SELECT public.rls_has('dock_reports.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('dock_reports.edit.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('dock_reports.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('dock_reports.edit.account'::text) AS rls_has) AND (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids))))))) WITH CHECK ((( SELECT public.rls_has('dock_reports.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('dock_reports.edit.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('dock_reports.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('dock_reports.edit.account'::text) AS rls_has) AND (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids)))));

CREATE POLICY "View dock reports per grant" ON public.dock_reports FOR SELECT TO authenticated USING ((( SELECT public.rls_has('dock_reports.view.all'::text) AS rls_has) OR (( SELECT public.rls_has('dock_reports.view.own'::text) AS rls_has) AND ((sales_account_user_id = ( SELECT auth.uid() AS uid)) OR (technical_service_rep_user_id = ( SELECT auth.uid() AS uid)))) OR (( SELECT public.rls_has('dock_reports.view.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('dock_reports.view.account'::text) AS rls_has) AND (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids)))));

CREATE POLICY mfa_required ON public.dock_reports AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER a_dock_reports_default_time_zone BEFORE INSERT ON public.dock_reports FOR EACH ROW EXECUTE FUNCTION public.dock_reports_default_time_zone();

CREATE TRIGGER dock_reports_check_time_zone BEFORE INSERT OR UPDATE OF time_zone ON public.dock_reports FOR EACH ROW EXECUTE FUNCTION public.check_time_zone_column();

CREATE TRIGGER prepare_dock_report BEFORE INSERT OR UPDATE OF hull_event_id, specification_id ON public.dock_reports FOR EACH ROW EXECUTE FUNCTION public.prepare_dock_report();

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report areas per parent grant" ON public.dock_report_areas FOR DELETE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report areas per parent grant" ON public.dock_report_areas FOR INSERT TO authenticated WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report areas per parent grant" ON public.dock_report_areas FOR UPDATE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report areas per parent grant" ON public.dock_report_areas FOR SELECT TO authenticated USING ((public.dock_reports_row_allows('view'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_areas AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_area_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report area products per parent grant" ON public.dock_report_area_products FOR DELETE TO authenticated USING ((public.can_access_dock_report_area(dock_report_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report area products per parent grant" ON public.dock_report_area_products FOR INSERT TO authenticated WITH CHECK ((public.can_access_dock_report_area(dock_report_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report area products per parent grant" ON public.dock_report_area_products FOR UPDATE TO authenticated USING ((public.can_access_dock_report_area(dock_report_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.can_access_dock_report_area(dock_report_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report area products per parent grant" ON public.dock_report_area_products FOR SELECT TO authenticated USING ((public.can_access_dock_report_area(dock_report_area_id, 'view'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_area_products AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_area_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_area_product_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report area product batches per parent grant" ON public.dock_report_area_product_batches FOR DELETE TO authenticated USING ((public.can_access_dock_report_area_product(dock_report_area_product_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report area product batches per parent grant" ON public.dock_report_area_product_batches FOR INSERT TO authenticated WITH CHECK ((public.can_access_dock_report_area_product(dock_report_area_product_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report area product batches per parent grant" ON public.dock_report_area_product_batches FOR UPDATE TO authenticated USING ((public.can_access_dock_report_area_product(dock_report_area_product_id, 'edit'::text, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.can_access_dock_report_area_product(dock_report_area_product_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report area product batches per parent grant" ON public.dock_report_area_product_batches FOR SELECT TO authenticated USING ((public.can_access_dock_report_area_product(dock_report_area_product_id, 'view'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_area_product_batches AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_area_product_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report daily logs per parent grant" ON public.dock_report_daily_logs FOR DELETE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report daily logs per parent grant" ON public.dock_report_daily_logs FOR INSERT TO authenticated WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report daily logs per parent grant" ON public.dock_report_daily_logs FOR UPDATE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report daily logs per parent grant" ON public.dock_report_daily_logs FOR SELECT TO authenticated USING ((public.dock_reports_row_allows('view'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_daily_logs AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_daily_logs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_weather_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report weather readings per parent grant" ON public.dock_report_weather_readings FOR DELETE TO authenticated USING ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report weather readings per parent grant" ON public.dock_report_weather_readings FOR INSERT TO authenticated WITH CHECK ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report weather readings per parent grant" ON public.dock_report_weather_readings FOR UPDATE TO authenticated USING ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report weather readings per parent grant" ON public.dock_report_weather_readings FOR SELECT TO authenticated USING ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'view'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_weather_readings AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_weather_readings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report activities per parent grant" ON public.dock_report_activities FOR DELETE TO authenticated USING ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report activities per parent grant" ON public.dock_report_activities FOR INSERT TO authenticated WITH CHECK ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report activities per parent grant" ON public.dock_report_activities FOR UPDATE TO authenticated USING ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report activities per parent grant" ON public.dock_report_activities FOR SELECT TO authenticated USING ((public.can_access_dock_report_daily_log(dock_report_daily_log_id, 'view'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_activities AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report photos per parent grant" ON public.dock_report_photos FOR DELETE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report photos per parent grant" ON public.dock_report_photos FOR INSERT TO authenticated WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report photos per parent grant" ON public.dock_report_photos FOR UPDATE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report photos per parent grant" ON public.dock_report_photos FOR SELECT TO authenticated USING ((public.dock_reports_row_allows('view'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_photos AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_photos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.dock_report_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete dock report signatures per parent grant" ON public.dock_report_signatures FOR DELETE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert dock report signatures per parent grant" ON public.dock_report_signatures FOR INSERT TO authenticated WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update dock report signatures per parent grant" ON public.dock_report_signatures FOR UPDATE TO authenticated USING ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.dock_reports_row_allows('edit'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View dock report signatures per parent grant" ON public.dock_report_signatures FOR SELECT TO authenticated USING ((public.dock_reports_row_allows('view'::text, dock_report_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.dock_report_signatures AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at_and_by BEFORE UPDATE ON public.dock_report_signatures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE VIEW public.dock_reports_overview WITH (security_invoker='true') AS
 SELECT dr.id,
    dr.hull_event_id,
    dr.specification_id,
    dr.vessel_id,
    dr.report_number,
    dr.status,
    dr.indocking_date,
    dr.outdocking_date,
    dr.locked_by_user_id,
    dr.locked_at,
    dr.sales_account_user_id,
    dr.technical_service_rep_user_id,
    dr.assigned_team_id,
    dr.created_at,
    v.name AS vessel_name,
    v.imo AS vessel_imo,
    hep.code AS hull_event_type_code,
    hep.text_en AS hull_event_type_text,
    s.specification_number,
    tsr.name AS technical_service_rep_user_name,
    sar.name AS sales_account_user_name,
    lu.name AS locked_by_user_name,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'dock_reports'::text) AND (a.entity_id = dr.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'dock_reports'::text) AND (conv.anchor_id = dr.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages
   FROM (((((((public.dock_reports dr
     LEFT JOIN public.vessels v ON ((v.id = dr.vessel_id)))
     LEFT JOIN public.hull_events he ON ((he.id = dr.hull_event_id)))
     LEFT JOIN public.phrases hep ON ((hep.id = he.type_phrase_id)))
     LEFT JOIN public.specifications s ON ((s.id = dr.specification_id)))
     LEFT JOIN public.users tsr ON ((tsr.id = dr.technical_service_rep_user_id)))
     LEFT JOIN public.users sar ON ((sar.id = dr.sales_account_user_id)))
     LEFT JOIN public.users lu ON ((lu.id = dr.locked_by_user_id)));


ALTER VIEW public.dock_reports_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.dock_reports_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.dock_reports_overview TO authenticated;
GRANT ALL ON TABLE public.dock_reports_overview TO service_role;

-- Hand-written part of the dock reports slice.

-- Permissions (NPM literals: view/edit own|team|account|all, create/delete own|team|all; no admin overrule).
insert into public.permissions (key, module, action, scope, sort_order)
select 'dock_reports.' || a || '.' || s, 'dock_reports', a, s, 700 + row_number() over ()
from (values ('view'), ('edit'), ('create'), ('delete')) aa(a), (values ('own'), ('team'), ('account'), ('all')) ss(s)
where not (a in ('create', 'delete') and s = 'account');
insert into public.permission_implies (permission, implies)
select 'dock_reports.' || a || '.' || s, 'dock_reports.view.' || s
from (values ('edit'), ('create'), ('delete')) aa(a), (values ('own'), ('team'), ('account'), ('all')) ss(s)
where exists (select 1 from public.permissions p where p.key = 'dock_reports.' || a || '.' || s);

-- Record access for notes, attachments, mentions (entity type registry).
create function public.dock_reports_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.dock_reports_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, public.access_context_for(p_user_id)); $$;
create function public.dock_reports_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable set search_path to '' as $$ select public.dock_reports_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, p_ctx); $$;
create function public.dock_reports_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$
  select coalesce(h.snapshot_vessel_name, v.name, 'Dock Report') from public.dock_reports d
  left join public.hull_events h on h.id = d.hull_event_id left join public.vessels v on v.id = h.vessel_id where d.id = p_entity_id; $$;
revoke all on function public.dock_reports_access(uuid, uuid, text), public.dock_reports_label(uuid) from public, anon, authenticated;
grant execute on function public.dock_reports_access(uuid, uuid, text), public.dock_reports_label(uuid) to authenticated, service_role;
grant execute on function public.dock_reports_ctx_allows(text, uuid, public.access_context) to authenticated, service_role;
select public.entity_type_register('dock_reports', 'dock_reports', 'dock_reports_access', 'dock_reports_ctx_allows', 'A dock report', 'dock_reports_label');

-- Deleting a report removes its notes, files and activity (NPM: cleanup_entity_references).
create trigger cleanup_entity_feed after delete on public.dock_reports
  for each row execute function public.cleanup_entity_feed('dock_reports');

