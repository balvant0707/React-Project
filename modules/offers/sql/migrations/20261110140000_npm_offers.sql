-- NPM offers slice (WP 5 + 6): specifications, areas, line items, orders, transports, availability requests, handovers,
-- hull_events_overview. Source: NPM database. Same renames as the fleet slice; hand_over() is rewritten by hand (tail).

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


create type public.spec_area_af_zone as enum ('flat_bottom', 'boottop', 'vertical');

-- Unread marks for the list views (NPM my_unread_records): a record is unread for me while one of its comment/mention
-- notifications is. Platform notifications of a record carry the record as entity (not the conversation). Emails: later.
create function public.my_unread_records() returns table(entity_type text, entity_id uuid, via text)
  language sql stable set search_path to ''
  as $$
  select n.entity_type, n.entity_id, 'notes'::text
  from public.notifications n
  where n.user_id = (select auth.uid()) and n.read_at is null and n.type in ('comment', 'mention') and n.entity_id is not null;
$$;
revoke all on function public.my_unread_records() from public, anon;
grant execute on function public.my_unread_records() to authenticated, service_role;


CREATE TABLE public.spec_areas (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    code text,
    name_en text NOT NULL,
    is_immersed boolean NOT NULL,
    af_zone public.spec_area_af_zone,
    sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.spec_areas FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.spec_areas TO authenticated;
GRANT ALL ON TABLE public.spec_areas TO service_role;

CREATE TABLE public.specifications (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    hull_event_id uuid,
    hull_event_type_code text NOT NULL,
    vessel_id uuid,
    team_id uuid NOT NULL,
    supplier_id uuid,
    specification_number text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    lost_reason text,
    printed_at timestamp with time zone,
    specification_date date,
    delivery_date date NOT NULL,
    payment_terms_phrase_id uuid,
    enquiry_number text,
    currency text DEFAULT 'EUR'::text NOT NULL,
    exchange_rate numeric,
    speed numeric,
    activity_days_per_year numeric,
    service_period_months integer,
    seawater_temperature numeric,
    air_temperature numeric,
    sales_account_user_id uuid DEFAULT auth.uid(),
    contact_person text,
    customer_name text,
    customer_address_line text,
    customer_city text,
    customer_postal_code text,
    customer_telephone text,
    remarks_text text,
    internal_remarks text,
    transport_customs_surcharge numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    place_of_application text,
    customer_company_id uuid,
    assigned_team_id uuid,
    net_sales numeric,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    customer_country_id uuid,
    location_continent text,
    location_country_id uuid,
    port_id uuid,
    submitted_for_approval_by_user_id uuid,
    submitted_for_approval_at timestamp with time zone,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    accepted_by_user_id uuid,
    accepted_at timestamp with time zone,
    responsible_user_id uuid,
    incoterm_phrase_id uuid,
    incoterm_place text,
    delivery_date_from date,
    request_received_at timestamp with time zone,
    sent_at timestamp with time zone,
    sent_by_user_id uuid,
    valid_until_at timestamp with time zone,
    CONSTRAINT specifications_delivery_range_check CHECK (((delivery_date_from IS NULL) OR (delivery_date IS NULL) OR (delivery_date_from <= delivery_date))),
    CONSTRAINT specifications_location_continent_check CHECK ((location_continent = ANY (ARRAY['Europe'::text, 'Asia'::text, 'Middle East'::text, 'Africa'::text, 'North America'::text, 'South America'::text, 'Oceania'::text]))),
    CONSTRAINT specifications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'under_review'::text, 'approved'::text, 'accepted'::text, 'lost'::text]))),
    CONSTRAINT specifications_vessel_required CHECK (((vessel_id IS NOT NULL) OR (hull_event_type_code = 'NB'::text)))
);

REVOKE ALL ON TABLE public.specifications FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.specifications TO authenticated;
GRANT ALL ON TABLE public.specifications TO service_role;

CREATE TABLE public.specification_areas (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    specification_id uuid NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    size_m2 numeric,
    substrate_phrase_id uuid,
    environment_standard_phrase_id uuid,
    loss_factor_pct numeric,
    surface_preparation_text text,
    remarks_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    area_id uuid
);

REVOKE ALL ON TABLE public.specification_areas FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.specification_areas TO authenticated;
GRANT ALL ON TABLE public.specification_areas TO service_role;

CREATE TABLE public.specification_area_products (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    specification_area_id uuid NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    product_packaging_id uuid NOT NULL,
    coat_mode_phrase_id uuid,
    coat_pct numeric,
    application_method_phrase_id uuid,
    theoretical_spreading_rate numeric,
    loss_factor_pct numeric,
    coverage_practical numeric,
    quantity_l numeric,
    price_per_l numeric,
    price_per_m2 numeric,
    total_price numeric,
    overcoat_time_minimum_override numeric,
    overcoat_time_maximum_override numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    size_m2 numeric,
    dry_film_thickness_um numeric,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid
);

REVOKE ALL ON TABLE public.specification_area_products FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.specification_area_products TO authenticated;
GRANT ALL ON TABLE public.specification_area_products TO service_role;

CREATE TABLE public.specification_line_items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    specification_id uuid NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    product_packaging_id uuid NOT NULL,
    quantity_product numeric NOT NULL,
    thin_pct numeric,
    real_quantity numeric,
    offered_qty numeric,
    sales_price numeric,
    discount_pct numeric,
    net_price numeric,
    cost_price numeric,
    gross_profit numeric,
    gross_profit_pct numeric,
    total_price numeric,
    total_gross_profit numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    comment text,
    is_requested boolean DEFAULT false NOT NULL,
    is_offered boolean DEFAULT true NOT NULL,
    is_accepted boolean,
    offered_packs numeric
);

REVOKE ALL ON TABLE public.specification_line_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.specification_line_items TO authenticated;
GRANT ALL ON TABLE public.specification_line_items TO service_role;

CREATE TABLE public.specification_discounts (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    specification_id uuid NOT NULL,
    name text NOT NULL,
    pct numeric,
    sequence integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    discount_type text DEFAULT 'pct'::text NOT NULL,
    amount numeric,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT specification_discounts_discount_type_check CHECK ((discount_type = ANY (ARRAY['pct'::text, 'amount'::text]))),
    CONSTRAINT specification_discounts_value_matches_type CHECK ((((discount_type = 'pct'::text) AND (pct IS NOT NULL)) OR ((discount_type = 'amount'::text) AND (amount IS NOT NULL))))
);

REVOKE ALL ON TABLE public.specification_discounts FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.specification_discounts TO authenticated;
GRANT ALL ON TABLE public.specification_discounts TO service_role;

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    order_number text NOT NULL,
    specification_id uuid,
    vessel_id uuid NOT NULL,
    hull_event_id uuid,
    supplier_id uuid NOT NULL,
    team_id uuid NOT NULL,
    status_phrase_id uuid NOT NULL,
    contact_person text,
    customer_name text,
    customer_address_line text,
    customer_city text,
    customer_postal_code text,
    customer_country_id uuid,
    customer_telephone text,
    payment_terms_phrase_id uuid,
    currency text DEFAULT 'EUR'::text NOT NULL,
    exchange_rate numeric,
    sales_account_user_id uuid DEFAULT auth.uid(),
    assigned_team_id uuid,
    transport_customs_surcharge numeric,
    enquiry_number text,
    customer_po_number text,
    delivery_port text,
    requested_date date,
    external_order_reference text,
    mof_printed_at timestamp with time zone,
    mof_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    deleted_at timestamp with time zone,
    customer_company_id uuid,
    availability_request_id uuid,
    delivery_country_id uuid,
    supplier_send_started_at timestamp with time zone,
    responsible_user_id uuid,
    incoterm_phrase_id uuid,
    incoterm_place text,
    requested_date_from date,
    invoiced_at timestamp with time zone,
    CONSTRAINT orders_requested_range_check CHECK (((requested_date_from IS NULL) OR (requested_date IS NULL) OR (requested_date_from <= requested_date)))
);

REVOKE ALL ON TABLE public.orders FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

CREATE TABLE public.order_lines (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    order_id uuid NOT NULL,
    specification_line_item_id uuid,
    sequence integer DEFAULT 0 NOT NULL,
    product_packaging_id uuid NOT NULL,
    ordered_qty numeric NOT NULL,
    sales_price numeric,
    discount_pct numeric,
    net_price numeric,
    cost_price numeric,
    total_price numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    ordered_packs numeric NOT NULL
);

REVOKE ALL ON TABLE public.order_lines FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.order_lines TO authenticated;
GRANT ALL ON TABLE public.order_lines TO service_role;

CREATE TABLE public.order_discounts (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    order_id uuid NOT NULL,
    name text NOT NULL,
    pct numeric,
    sequence integer DEFAULT 0 NOT NULL,
    discount_type text DEFAULT 'pct'::text NOT NULL,
    amount numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT order_discounts_discount_type_check CHECK ((discount_type = ANY (ARRAY['pct'::text, 'amount'::text]))),
    CONSTRAINT order_discounts_value_matches_type CHECK ((((discount_type = 'pct'::text) AND (pct IS NOT NULL)) OR ((discount_type = 'amount'::text) AND (amount IS NOT NULL))))
);

REVOKE ALL ON TABLE public.order_discounts FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.order_discounts TO authenticated;
GRANT ALL ON TABLE public.order_discounts TO service_role;

CREATE TABLE public.country_default_suppliers (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    team_id uuid,
    country_id uuid NOT NULL,
    supplier_company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.country_default_suppliers FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.country_default_suppliers TO authenticated;
GRANT ALL ON TABLE public.country_default_suppliers TO service_role;

CREATE TABLE public.handovers (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    from_user_id uuid,
    to_user_id uuid NOT NULL,
    reason text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT handovers_entity_type_check CHECK ((entity_type = ANY (ARRAY['specifications'::text, 'orders'::text])))
);

REVOKE ALL ON TABLE public.handovers FROM anon, authenticated, service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.handovers TO authenticated;
GRANT ALL ON TABLE public.handovers TO service_role;

CREATE TABLE public.transports (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    specification_id uuid,
    order_id uuid,
    forwarder_company_id uuid,
    planned_date date,
    tracking_number text,
    freight_cost_estimated numeric,
    freight_cost_actual numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    freight_cost_quoted numeric,
    CONSTRAINT transports_has_parent CHECK (((specification_id IS NOT NULL) OR (order_id IS NOT NULL)))
);

REVOKE ALL ON TABLE public.transports FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.transports TO authenticated;
GRANT ALL ON TABLE public.transports TO service_role;

CREATE TABLE public.transport_quotes (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    transport_id uuid NOT NULL,
    forwarder_company_id uuid NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    price numeric,
    valid_until date,
    notes text,
    requested_at timestamp with time zone,
    requested_by_user_id uuid,
    email_thread_id uuid,
    confirmation_sent_at timestamp with time zone,
    rejection_sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT transport_quotes_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'quoted'::text, 'declined'::text, 'awarded'::text, 'rejected'::text])))
);

REVOKE ALL ON TABLE public.transport_quotes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.transport_quotes TO authenticated;
GRANT ALL ON TABLE public.transport_quotes TO service_role;

CREATE TABLE public.availability_requests (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    specification_id uuid,
    supplier_id uuid NOT NULL,
    request_number text NOT NULL,
    supplier_enquiry_number text,
    estimated_arrival date,
    requested_at timestamp with time zone,
    requested_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    send_started_at timestamp with time zone,
    channel text DEFAULT 'api'::text NOT NULL,
    email_thread_id uuid,
    CONSTRAINT availability_requests_channel_check CHECK ((channel = ANY (ARRAY['api'::text, 'email'::text, 'manual'::text])))
);

REVOKE ALL ON TABLE public.availability_requests FROM anon, authenticated, service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.availability_requests TO authenticated;
GRANT ALL ON TABLE public.availability_requests TO service_role;

CREATE TABLE public.availability_request_lines (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    availability_request_id uuid NOT NULL,
    specification_line_item_id uuid,
    product_packaging_id uuid NOT NULL,
    line_number integer NOT NULL,
    requested_qty numeric NOT NULL,
    confirmed_qty numeric,
    confirmed_date date,
    status_phrase_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    comment text,
    answered_at timestamp with time zone,
    answered_by_user_id uuid
);

REVOKE ALL ON TABLE public.availability_request_lines FROM anon, authenticated, service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.availability_request_lines TO authenticated;
GRANT ALL ON TABLE public.availability_request_lines TO service_role;

CREATE TABLE public.supplier_api_calls (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action text NOT NULL,
    adapter text NOT NULL,
    success boolean NOT NULL,
    http_status integer,
    request_body jsonb,
    response_body jsonb,
    error_message text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_api_calls_action_check CHECK ((action = ANY (ARRAY['availability_create'::text, 'availability_update'::text, 'order_confirm'::text]))),
    CONSTRAINT supplier_api_calls_entity_type_check CHECK ((entity_type = ANY (ARRAY['availability_requests'::text, 'orders'::text])))
);

REVOKE ALL ON TABLE public.supplier_api_calls FROM anon, authenticated, service_role;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.supplier_api_calls TO authenticated;
GRANT ALL ON TABLE public.supplier_api_calls TO service_role;

ALTER TABLE ONLY public.spec_areas
    ADD CONSTRAINT spec_areas_pkey PRIMARY KEY (id);

CREATE INDEX spec_areas_sequence_idx ON public.spec_areas USING btree (sequence);

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_pkey PRIMARY KEY (id);

CREATE INDEX specifications_assigned_team_id_idx ON public.specifications USING btree (assigned_team_id);

CREATE INDEX specifications_created_by_user_id_idx ON public.specifications USING btree (created_by_user_id);

CREATE INDEX specifications_customer_company_id_idx ON public.specifications USING btree (customer_company_id);

CREATE INDEX specifications_enquiry_number_trgm_idx ON public.specifications USING gin (enquiry_number extensions.gin_trgm_ops);

CREATE INDEX specifications_hull_event_id_idx ON public.specifications USING btree (hull_event_id);

CREATE INDEX specifications_incoterm_phrase_id_idx ON public.specifications USING btree (incoterm_phrase_id);

CREATE INDEX specifications_location_country_id_idx ON public.specifications USING btree (location_country_id);

CREATE INDEX specifications_number_trgm_idx ON public.specifications USING gin (specification_number extensions.gin_trgm_ops);

CREATE UNIQUE INDEX specifications_one_accepted_per_hull_event ON public.specifications USING btree (hull_event_id) WHERE ((status = 'accepted'::text) AND (hull_event_type_code <> 'SS'::text));

CREATE INDEX specifications_payment_terms_phrase_id_idx ON public.specifications USING btree (payment_terms_phrase_id);

CREATE INDEX specifications_port_id_idx ON public.specifications USING btree (port_id);

CREATE INDEX specifications_responsible_user_id_idx ON public.specifications USING btree (responsible_user_id);

CREATE INDEX specifications_sales_account_user_id_idx ON public.specifications USING btree (sales_account_user_id);

CREATE INDEX specifications_sent_by_user_id_idx ON public.specifications USING btree (sent_by_user_id);

CREATE INDEX specifications_specification_date_idx ON public.specifications USING btree (specification_date DESC);

CREATE UNIQUE INDEX specifications_specification_number_version_idx ON public.specifications USING btree (specification_number, version);

CREATE INDEX specifications_supplier_id_idx ON public.specifications USING btree (supplier_id);

CREATE INDEX specifications_team_id_idx ON public.specifications USING btree (team_id);

CREATE INDEX specifications_vessel_id_idx ON public.specifications USING btree (vessel_id);

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_pkey PRIMARY KEY (id);

CREATE INDEX specification_areas_created_by_user_id_idx ON public.specification_areas USING btree (created_by_user_id);

CREATE INDEX specification_areas_specification_id_sequence_idx ON public.specification_areas USING btree (specification_id, sequence);

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_pkey PRIMARY KEY (id);

CREATE INDEX specification_area_products_created_by_user_id_idx ON public.specification_area_products USING btree (created_by_user_id);

CREATE INDEX specification_area_products_product_packaging_id_idx ON public.specification_area_products USING btree (product_packaging_id);

CREATE INDEX specification_area_products_specification_area_id_sequence_idx ON public.specification_area_products USING btree (specification_area_id, sequence);

ALTER TABLE ONLY public.specification_line_items
    ADD CONSTRAINT specification_line_items_pkey PRIMARY KEY (id);

CREATE INDEX specification_line_items_created_by_user_id_idx ON public.specification_line_items USING btree (created_by_user_id);

CREATE INDEX specification_line_items_product_packaging_id_idx ON public.specification_line_items USING btree (product_packaging_id);

CREATE INDEX specification_line_items_specification_id_sequence_idx ON public.specification_line_items USING btree (specification_id, sequence);

ALTER TABLE ONLY public.specification_discounts
    ADD CONSTRAINT specification_discounts_pkey PRIMARY KEY (id);

CREATE INDEX specification_discounts_created_by_user_id_idx ON public.specification_discounts USING btree (created_by_user_id);

CREATE INDEX specification_discounts_specification_id_sequence_idx ON public.specification_discounts USING btree (specification_id, sequence);

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

CREATE INDEX orders_assigned_team_id_idx ON public.orders USING btree (assigned_team_id);

CREATE INDEX orders_availability_request_id_idx ON public.orders USING btree (availability_request_id);

CREATE INDEX orders_created_by_user_id_idx ON public.orders USING btree (created_by_user_id);

CREATE INDEX orders_customer_company_id_idx ON public.orders USING btree (customer_company_id);

CREATE INDEX orders_delivery_country_id_idx ON public.orders USING btree (delivery_country_id);

CREATE INDEX orders_hull_event_id_idx ON public.orders USING btree (hull_event_id);

CREATE INDEX orders_incoterm_phrase_id_idx ON public.orders USING btree (incoterm_phrase_id);

CREATE UNIQUE INDEX orders_order_number_idx ON public.orders USING btree (order_number);

CREATE INDEX orders_responsible_user_id_idx ON public.orders USING btree (responsible_user_id);

CREATE INDEX orders_sales_account_user_id_idx ON public.orders USING btree (sales_account_user_id);

CREATE INDEX orders_specification_id_idx ON public.orders USING btree (specification_id);

CREATE INDEX orders_status_phrase_id_idx ON public.orders USING btree (status_phrase_id);

CREATE INDEX orders_supplier_id_idx ON public.orders USING btree (supplier_id);

CREATE INDEX orders_team_id_idx ON public.orders USING btree (team_id);

CREATE INDEX orders_vessel_id_idx ON public.orders USING btree (vessel_id);

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_pkey PRIMARY KEY (id);

CREATE INDEX order_lines_order_id_sequence_idx ON public.order_lines USING btree (order_id, sequence);

CREATE INDEX order_lines_product_packaging_id_idx ON public.order_lines USING btree (product_packaging_id);

CREATE INDEX order_lines_specification_line_item_id_idx ON public.order_lines USING btree (specification_line_item_id);

ALTER TABLE ONLY public.order_discounts
    ADD CONSTRAINT order_discounts_pkey PRIMARY KEY (id);

CREATE INDEX order_discounts_order_id_sequence_idx ON public.order_discounts USING btree (order_id, sequence);

ALTER TABLE ONLY public.country_default_suppliers
    ADD CONSTRAINT country_default_suppliers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.country_default_suppliers
    ADD CONSTRAINT country_default_suppliers_team_id_country_id_key UNIQUE NULLS NOT DISTINCT (team_id, country_id);

CREATE INDEX country_default_suppliers_country_idx ON public.country_default_suppliers USING btree (country_id);

CREATE INDEX country_default_suppliers_supplier_idx ON public.country_default_suppliers USING btree (supplier_company_id);

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_pkey PRIMARY KEY (id);

CREATE INDEX handovers_entity_type_entity_id_created_at_idx ON public.handovers USING btree (entity_type, entity_id, created_at);

CREATE INDEX handovers_to_user_id_created_at_idx ON public.handovers USING btree (to_user_id, created_at);

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_pkey PRIMARY KEY (id);

CREATE INDEX transports_forwarder_company_id_idx ON public.transports USING btree (forwarder_company_id);

CREATE UNIQUE INDEX transports_open_specification_key ON public.transports USING btree (specification_id) WHERE (order_id IS NULL);

CREATE UNIQUE INDEX transports_order_id_key ON public.transports USING btree (order_id) WHERE (order_id IS NOT NULL);

CREATE INDEX transports_specification_id_idx ON public.transports USING btree (specification_id);

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_transport_id_forwarder_company_id_key UNIQUE (transport_id, forwarder_company_id);

CREATE INDEX transport_quotes_forwarder_company_id_idx ON public.transport_quotes USING btree (forwarder_company_id);

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT availability_requests_pkey PRIMARY KEY (id);

CREATE INDEX availability_requests_created_by_user_id_idx ON public.availability_requests USING btree (created_by_user_id);

CREATE INDEX availability_requests_email_thread_id_idx ON public.availability_requests USING btree (email_thread_id);

CREATE UNIQUE INDEX availability_requests_one_unsent_idx ON public.availability_requests USING btree (specification_id, supplier_id) WHERE ((requested_at IS NULL) AND (specification_id IS NOT NULL));

CREATE UNIQUE INDEX availability_requests_request_number_idx ON public.availability_requests USING btree (request_number);

CREATE INDEX availability_requests_requested_by_user_id_idx ON public.availability_requests USING btree (requested_by_user_id);

CREATE INDEX availability_requests_specification_id_idx ON public.availability_requests USING btree (specification_id);

CREATE INDEX availability_requests_supplier_id_idx ON public.availability_requests USING btree (supplier_id);

ALTER TABLE ONLY public.availability_request_lines
    ADD CONSTRAINT availability_request_lines_pkey PRIMARY KEY (id);

CREATE INDEX availability_request_lines_answered_by_user_id_idx ON public.availability_request_lines USING btree (answered_by_user_id);

CREATE INDEX availability_request_lines_availability_request_id_line_num_idx ON public.availability_request_lines USING btree (availability_request_id, line_number);

CREATE INDEX availability_request_lines_product_packaging_id_idx ON public.availability_request_lines USING btree (product_packaging_id);

CREATE INDEX availability_request_lines_specification_line_item_id_idx ON public.availability_request_lines USING btree (specification_line_item_id);

CREATE INDEX availability_request_lines_status_phrase_id_idx ON public.availability_request_lines USING btree (status_phrase_id);

ALTER TABLE ONLY public.supplier_api_calls
    ADD CONSTRAINT supplier_api_calls_pkey PRIMARY KEY (id);

CREATE INDEX supplier_api_calls_entity_type_entity_id_created_at_idx ON public.supplier_api_calls USING btree (entity_type, entity_id, created_at DESC);

CREATE INDEX supplier_api_calls_user_id_idx ON public.supplier_api_calls USING btree (user_id);

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_customer_company_id_fkey FOREIGN KEY (customer_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_customer_country_id_fkey FOREIGN KEY (customer_country_id) REFERENCES public.countries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_hull_event_id_fkey FOREIGN KEY (hull_event_id) REFERENCES public.hull_events(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_incoterm_phrase_id_fkey FOREIGN KEY (incoterm_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_location_country_id_fkey FOREIGN KEY (location_country_id) REFERENCES public.countries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_payment_terms_phrase_id_fkey FOREIGN KEY (payment_terms_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_port_id_fkey FOREIGN KEY (port_id) REFERENCES public.ports(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_sales_account_user_id_fkey FOREIGN KEY (sales_account_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_submitted_for_approval_by_user_id_fkey FOREIGN KEY (submitted_for_approval_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.spec_areas(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_environment_standard_phrase_id_fkey FOREIGN KEY (environment_standard_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_substrate_phrase_id_fkey FOREIGN KEY (substrate_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_areas
    ADD CONSTRAINT specification_areas_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_application_method_phrase_id_fkey FOREIGN KEY (application_method_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_coat_mode_phrase_id_fkey FOREIGN KEY (coat_mode_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_product_packaging_id_fkey FOREIGN KEY (product_packaging_id) REFERENCES public.product_packagings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_specification_area_id_fkey FOREIGN KEY (specification_area_id) REFERENCES public.specification_areas(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.specification_area_products
    ADD CONSTRAINT specification_area_products_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_line_items
    ADD CONSTRAINT specification_line_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_line_items
    ADD CONSTRAINT specification_line_items_product_packaging_id_fkey FOREIGN KEY (product_packaging_id) REFERENCES public.product_packagings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.specification_line_items
    ADD CONSTRAINT specification_line_items_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.specification_line_items
    ADD CONSTRAINT specification_line_items_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_discounts
    ADD CONSTRAINT specification_discounts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.specification_discounts
    ADD CONSTRAINT specification_discounts_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.specification_discounts
    ADD CONSTRAINT specification_discounts_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_availability_request_id_fkey FOREIGN KEY (availability_request_id) REFERENCES public.availability_requests(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_company_id_fkey FOREIGN KEY (customer_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_country_id_fkey FOREIGN KEY (customer_country_id) REFERENCES public.countries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_delivery_country_id_fkey FOREIGN KEY (delivery_country_id) REFERENCES public.countries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_hull_event_id_fkey FOREIGN KEY (hull_event_id) REFERENCES public.hull_events(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_incoterm_phrase_id_fkey FOREIGN KEY (incoterm_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_payment_terms_phrase_id_fkey FOREIGN KEY (payment_terms_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_sales_account_user_id_fkey FOREIGN KEY (sales_account_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_status_phrase_id_fkey FOREIGN KEY (status_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_vessel_id_fkey FOREIGN KEY (vessel_id) REFERENCES public.vessels(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_product_packaging_id_fkey FOREIGN KEY (product_packaging_id) REFERENCES public.product_packagings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_specification_line_item_id_fkey FOREIGN KEY (specification_line_item_id) REFERENCES public.specification_line_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_lines
    ADD CONSTRAINT order_lines_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_discounts
    ADD CONSTRAINT order_discounts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.order_discounts
    ADD CONSTRAINT order_discounts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_discounts
    ADD CONSTRAINT order_discounts_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.country_default_suppliers
    ADD CONSTRAINT country_default_suppliers_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.country_default_suppliers
    ADD CONSTRAINT country_default_suppliers_supplier_company_id_fkey FOREIGN KEY (supplier_company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.country_default_suppliers
    ADD CONSTRAINT country_default_suppliers_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.handovers
    ADD CONSTRAINT handovers_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_forwarder_company_id_fkey FOREIGN KEY (forwarder_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transports
    ADD CONSTRAINT transports_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_forwarder_company_id_fkey FOREIGN KEY (forwarder_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_transport_id_fkey FOREIGN KEY (transport_id) REFERENCES public.transports(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.transport_quotes
    ADD CONSTRAINT transport_quotes_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT availability_requests_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT availability_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT availability_requests_specification_id_fkey FOREIGN KEY (specification_id) REFERENCES public.specifications(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT availability_requests_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.availability_requests
    ADD CONSTRAINT availability_requests_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_request_lines
    ADD CONSTRAINT availability_request_lines_answered_by_user_id_fkey FOREIGN KEY (answered_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_request_lines
    ADD CONSTRAINT availability_request_lines_availability_request_id_fkey FOREIGN KEY (availability_request_id) REFERENCES public.availability_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.availability_request_lines
    ADD CONSTRAINT availability_request_lines_product_packaging_id_fkey FOREIGN KEY (product_packaging_id) REFERENCES public.product_packagings(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.availability_request_lines
    ADD CONSTRAINT availability_request_lines_specification_line_item_id_fkey FOREIGN KEY (specification_line_item_id) REFERENCES public.specification_line_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.availability_request_lines
    ADD CONSTRAINT availability_request_lines_status_phrase_id_fkey FOREIGN KEY (status_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.supplier_api_calls
    ADD CONSTRAINT supplier_api_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.accept_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb DEFAULT NULL::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.can_access_entity('specifications', p_specification_id, 'edit') then
    raise exception 'Not authorized to accept specification %', p_specification_id;
  end if;
  if p_quantities is not null and exists (select 1 from jsonb_each_text(p_quantities) q where q.value::numeric <= 0) then
    raise exception 'Pack counts must be greater than zero';
  end if;
  perform public.apply_specification_line_acceptance(p_specification_id, p_line_item_ids);
  update public.specifications set status = 'accepted' where id = p_specification_id;
  if not found then
    raise exception 'Specification % not found', p_specification_id;
  end if;

  if p_quantities is not null then
    update public.order_lines ol
    set ordered_packs = q.packs,
        ordered_qty = q.packs * pp.pack_size,
        total_price = ol.net_price * q.packs * pp.pack_size
    from (select key::uuid as line_item_id, value::numeric as packs from jsonb_each_text(p_quantities)) q,
         public.orders o,
         public.product_packagings pp
    where o.specification_id = p_specification_id and o.deleted_at is null
      and ol.order_id = o.id
      and ol.specification_line_item_id = q.line_item_id
      and pp.id = ol.product_packaging_id;
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.accept_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.accept_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) TO service_role;

CREATE FUNCTION public.apply_specification_af_products(p_specification_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_hull_event_id uuid;
  v_hull_event_type_code text;
  v_service_period_months integer;
  v_vertical_name text;
  v_flat_bottom_name text;
  v_vertical_id uuid;
  v_flat_bottom_id uuid;
begin
  select s.hull_event_id, s.hull_event_type_code, s.service_period_months
    into v_hull_event_id, v_hull_event_type_code, v_service_period_months
    from public.specifications s where s.id = p_specification_id;
  if v_hull_event_id is null or v_hull_event_type_code = 'SS' then
    return;
  end if;

  select n.vertical_name, n.flat_bottom_name
    into v_vertical_name, v_flat_bottom_name
    from public.specification_antifouling_names(p_specification_id) n;

  if v_vertical_name is not null then
    insert into public.antifouling_products (supplier_id, name)
    values (public.own_maker_company_id(), v_vertical_name)
    on conflict (supplier_id, name_normalized) do nothing;
    select ap.id into v_vertical_id from public.antifouling_products ap
      where ap.supplier_id = public.own_maker_company_id()
        and ap.name_normalized = regexp_replace(lower(v_vertical_name), '[^a-z0-9]', '', 'g');
  end if;

  if v_flat_bottom_name is not null then
    insert into public.antifouling_products (supplier_id, name)
    values (public.own_maker_company_id(), v_flat_bottom_name)
    on conflict (supplier_id, name_normalized) do nothing;
    select ap.id into v_flat_bottom_id from public.antifouling_products ap
      where ap.supplier_id = public.own_maker_company_id()
        and ap.name_normalized = regexp_replace(lower(v_flat_bottom_name), '[^a-z0-9]', '', 'g');
  end if;

  update public.hull_events he
  set
    supplier_this_hullevent_id = public.own_maker_company_id(),
    service_period_months = v_service_period_months,
    vertical_af_product_id = coalesce(v_vertical_id, (
      select ap.id from public.antifouling_products ap
      where ap.id = he.vertical_af_product_id and ap.supplier_id = public.own_maker_company_id())),
    flat_bottom_af_product_id = coalesce(v_flat_bottom_id, (
      select ap.id from public.antifouling_products ap
      where ap.id = he.flat_bottom_af_product_id and ap.supplier_id = public.own_maker_company_id()))
  where he.id = v_hull_event_id;
end;
$$;

REVOKE ALL ON FUNCTION public.apply_specification_af_products(p_specification_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_specification_af_products(p_specification_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_specification_af_products(p_specification_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.apply_specification_af_products(p_specification_id uuid) TO service_role;

CREATE FUNCTION public.apply_specification_line_acceptance(p_specification_id uuid, p_line_item_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if coalesce(cardinality(p_line_item_ids), 0) = 0 then
    raise exception 'Select at least one line';
  end if;
  if exists (
    select 1 from unnest(p_line_item_ids) as x(id)
    where not exists (select 1 from public.specification_line_items li
                      where li.id = x.id and li.specification_id = p_specification_id and li.is_offered)
  ) then
    raise exception 'Only offered lines of this specification can be chosen';
  end if;

  update public.specification_line_items
  set is_accepted = true
  where specification_id = p_specification_id and id = any(p_line_item_ids) and is_accepted is distinct from true;

  update public.specification_line_items
  set is_accepted = false
  where specification_id = p_specification_id and is_offered and is_accepted is null and not (id = any(p_line_item_ids));
end;
$$;

REVOKE ALL ON FUNCTION public.apply_specification_line_acceptance(p_specification_id uuid, p_line_item_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_specification_line_acceptance(p_specification_id uuid, p_line_item_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_specification_line_acceptance(p_specification_id uuid, p_line_item_ids uuid[]) TO service_role;

CREATE FUNCTION public.apply_specification_offered_af_products(p_specification_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_hull_event_id uuid;
  v_hull_event_type_code text;
  v_vertical_name text;
  v_flat_bottom_name text;
  v_vertical_id uuid;
  v_flat_bottom_id uuid;
begin
  select s.hull_event_id, s.hull_event_type_code into v_hull_event_id, v_hull_event_type_code
    from public.specifications s where s.id = p_specification_id;
  if v_hull_event_id is null or v_hull_event_type_code = 'SS' then
    return;
  end if;

  select n.vertical_name, n.flat_bottom_name
    into v_vertical_name, v_flat_bottom_name
    from public.specification_antifouling_names(p_specification_id) n;

  if v_vertical_name is not null then
    insert into public.antifouling_products (supplier_id, name)
    values (public.own_maker_company_id(), v_vertical_name)
    on conflict (supplier_id, name_normalized) do nothing;
    select ap.id into v_vertical_id from public.antifouling_products ap
      where ap.supplier_id = public.own_maker_company_id()
        and ap.name_normalized = regexp_replace(lower(v_vertical_name), '[^a-z0-9]', '', 'g');
  end if;

  if v_flat_bottom_name is not null then
    insert into public.antifouling_products (supplier_id, name)
    values (public.own_maker_company_id(), v_flat_bottom_name)
    on conflict (supplier_id, name_normalized) do nothing;
    select ap.id into v_flat_bottom_id from public.antifouling_products ap
      where ap.supplier_id = public.own_maker_company_id()
        and ap.name_normalized = regexp_replace(lower(v_flat_bottom_name), '[^a-z0-9]', '', 'g');
  end if;

  update public.hull_events
  set
    vertical_offered_af_product_id = v_vertical_id,
    flat_bottom_offered_af_product_id = v_flat_bottom_id
  where id = v_hull_event_id;
end;
$$;

REVOKE ALL ON FUNCTION public.apply_specification_offered_af_products(p_specification_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_specification_offered_af_products(p_specification_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_specification_offered_af_products(p_specification_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.apply_specification_offered_af_products(p_specification_id uuid) TO service_role;

CREATE FUNCTION public.apply_specification_opportunity_value(p_specification_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_hull_event_id uuid;
  v_status text;
  v_net_sales numeric;
  v_currency text;
  v_exchange_rate numeric;
  v_litres numeric;
begin
  select s.hull_event_id, s.status, s.net_sales, s.currency, s.exchange_rate
    into v_hull_event_id, v_status, v_net_sales, v_currency, v_exchange_rate
    from public.specifications s where s.id = p_specification_id;
  if v_hull_event_id is null or v_status not in ('approved', 'accepted') then
    return;
  end if;

  select sum(li.offered_qty)
    into v_litres
    from public.specification_line_items li
    join public.product_packagings pp on pp.id = li.product_packaging_id
    where li.specification_id = p_specification_id and li.is_offered and pp.unit = 'L';

  update public.hull_events
  set
    opportunity_value = v_net_sales,
    opportunity_value_currency = v_currency,
    opportunity_exchange_rate = v_exchange_rate,
    opportunity_litres = v_litres
  where id = v_hull_event_id;
end;
$$;

REVOKE ALL ON FUNCTION public.apply_specification_opportunity_value(p_specification_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_specification_opportunity_value(p_specification_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_specification_opportunity_value(p_specification_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.apply_specification_opportunity_value(p_specification_id uuid) TO service_role;

CREATE FUNCTION public.auto_create_order_for_seastock_acceptance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.status = 'accepted' and (new.hull_event_type_code = 'SS' or new.hull_event_id is null)
     and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    perform public.create_order_from_specification(new.id);
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.auto_create_order_for_seastock_acceptance() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.auto_create_order_for_seastock_acceptance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auto_create_order_for_seastock_acceptance() TO authenticated;
GRANT ALL ON FUNCTION public.auto_create_order_for_seastock_acceptance() TO service_role;

CREATE FUNCTION public.award_transport_quote(p_quote_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_quote public.transport_quotes;
begin
  select * into v_quote from public.transport_quotes where id = p_quote_id;
  if v_quote.id is null then
    raise exception 'Quote not found';
  end if;
  perform 1 from public.transports where id = v_quote.transport_id for update;
  select * into v_quote from public.transport_quotes where id = p_quote_id;
  if v_quote.status in ('declined') or v_quote.price is null then
    raise exception 'Only a quote with a price can be awarded';
  end if;

  update public.transport_quotes set status = 'rejected'
  where transport_id = v_quote.transport_id and id <> v_quote.id and status not in ('declined', 'rejected');
  update public.transport_quotes set status = 'awarded' where id = v_quote.id;
  update public.transports
  set forwarder_company_id = v_quote.forwarder_company_id, freight_cost_quoted = v_quote.price
  where id = v_quote.transport_id;
end;
$$;

REVOKE ALL ON FUNCTION public.award_transport_quote(p_quote_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.award_transport_quote(p_quote_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.award_transport_quote(p_quote_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.award_transport_quote(p_quote_id uuid) TO service_role;

CREATE FUNCTION public.can_access_specification_area(p_area_id uuid, p_grant_type text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.can_access_specification_area(p_area_id, p_grant_type, public.access_context()); $$;

REVOKE ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_grant_type text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_grant_type text) TO service_role;

CREATE FUNCTION public.can_access_specification_area(p_area_id uuid, p_action text, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parent uuid;
begin
  select t.specification_id into v_parent from public.specification_areas t where t.id = p_area_id;
  if not found then
    return false;
  end if;
  return public.specifications_row_allows(p_action, v_parent, p_ctx);
end;
$$;

REVOKE ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_action text, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_action text, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_specification_area(p_area_id uuid, p_action text, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.copy_hull_event_vessel_to_specification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.vessel_id is null and new.hull_event_id is not null then
    select vessel_id into new.vessel_id from public.hull_events where id = new.hull_event_id;
  end if;
  if new.hull_event_type_code is null then
    if new.hull_event_id is not null then
      select type_code into new.hull_event_type_code from public.hull_events where id = new.hull_event_id;
    else
      new.hull_event_type_code := 'SS';
    end if;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.copy_hull_event_vessel_to_specification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.copy_hull_event_vessel_to_specification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.copy_hull_event_vessel_to_specification() TO authenticated;
GRANT ALL ON FUNCTION public.copy_hull_event_vessel_to_specification() TO service_role;

CREATE FUNCTION public.copy_incoterm_from_specification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.incoterm_phrase_id is null and new.incoterm_place is null and new.specification_id is not null then
    select s.incoterm_phrase_id, s.incoterm_place into new.incoterm_phrase_id, new.incoterm_place
    from public.specifications s where s.id = new.specification_id;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.copy_incoterm_from_specification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.copy_incoterm_from_specification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.copy_incoterm_from_specification() TO authenticated;
GRANT ALL ON FUNCTION public.copy_incoterm_from_specification() TO service_role;

CREATE FUNCTION public.create_order_from_specification(p_specification_id uuid, p_line_item_ids uuid[] DEFAULT NULL::uuid[], p_quantities jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec public.specifications%rowtype;
  v_status_phrase_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_request_id uuid;
  v_any_accepted boolean;
begin
  if not public.can_access_entity('specifications', p_specification_id, 'edit') then
    raise exception 'Not authorized to create an order from specification %', p_specification_id;
  end if;

  select * into v_spec from public.specifications where id = p_specification_id;
  if v_spec.id is null then
    raise exception 'Specification % not found', p_specification_id;
  end if;
  if v_spec.supplier_id is null then
    raise exception 'Cannot create an order: specification %''s supplier is not set', v_spec.specification_number;
  end if;

  if p_quantities is not null and exists (select 1 from jsonb_each_text(p_quantities) q where q.value::numeric <= 0) then
    raise exception 'Pack counts must be greater than zero';
  end if;

  if p_line_item_ids is not null then
    perform public.apply_specification_line_acceptance(p_specification_id, p_line_item_ids);
  end if;
  select exists (select 1 from public.specification_line_items
                 where specification_id = v_spec.id and is_offered and is_accepted)
    into v_any_accepted;

  select id into v_status_phrase_id from public.phrases where category = 'order_status' and code = 'confirmed';
  if v_status_phrase_id is null then
    raise exception 'order_status phrase ''confirmed'' is not seeded';
  end if;

  select r.id into v_request_id
  from public.availability_requests r
  where r.specification_id = v_spec.id
    and r.supplier_id = v_spec.supplier_id
    and r.requested_at is not null
    and not exists (select 1 from public.orders o where o.availability_request_id = r.id and o.deleted_at is null)
  order by r.requested_at desc
  limit 1;

  v_order_number := public.generate_order_number(v_spec.id);

  insert into public.orders (
    order_number, specification_id, vessel_id, hull_event_id, supplier_id, team_id, status_phrase_id,
    customer_company_id, contact_person, customer_name, customer_address_line, customer_city, customer_postal_code,
    customer_country_id, customer_telephone,
    payment_terms_phrase_id, currency, exchange_rate, sales_account_user_id, assigned_team_id,
    transport_customs_surcharge, enquiry_number, requested_date_from, requested_date, availability_request_id
  ) values (
    v_order_number, v_spec.id, v_spec.vessel_id, v_spec.hull_event_id, v_spec.supplier_id, v_spec.team_id, v_status_phrase_id,
    v_spec.customer_company_id, v_spec.contact_person, v_spec.customer_name, v_spec.customer_address_line, v_spec.customer_city, v_spec.customer_postal_code,
    v_spec.customer_country_id, v_spec.customer_telephone,
    v_spec.payment_terms_phrase_id, v_spec.currency, v_spec.exchange_rate, v_spec.sales_account_user_id, v_spec.assigned_team_id,
    v_spec.transport_customs_surcharge, v_spec.enquiry_number, v_spec.delivery_date_from, v_spec.delivery_date, v_request_id
  )
  returning id into v_order_id;

  -- p_quantities: optional pack count per line ({"<line item id>": packs}), e.g. when the customer takes less
  -- (or more) than offered. Lines without an entry are copied as offered.
  insert into public.order_lines (
    order_id, specification_line_item_id, sequence, product_packaging_id, ordered_qty, ordered_packs,
    sales_price, discount_pct, net_price, cost_price, total_price
  )
  select
    v_order_id, sli.id, sli.sequence, sli.product_packaging_id,
    x.qty, x.packs,
    sli.sales_price, sli.discount_pct, sli.net_price, sli.cost_price, sli.net_price * x.qty
  from public.specification_line_items sli
  join public.product_packagings pp on pp.id = sli.product_packaging_id
  cross join lateral (
    select
      case when (p_quantities ->> sli.id::text) is not null
           then (p_quantities ->> sli.id::text)::numeric * pp.pack_size
           else coalesce(sli.offered_qty, sli.real_quantity, sli.quantity_product) end as qty,
      coalesce((p_quantities ->> sli.id::text)::numeric, sli.offered_packs,
               ceil(coalesce(sli.offered_qty, sli.real_quantity, sli.quantity_product) / nullif(pp.pack_size, 0))) as packs
  ) x
  where sli.specification_id = v_spec.id
    and sli.is_offered
    and case
          when p_line_item_ids is not null then sli.id = any(p_line_item_ids)
          when v_any_accepted then coalesce(sli.is_accepted, false)
          else true
        end
  order by sli.sequence;
  if not found then
    raise exception 'Cannot create an order: specification % has no offered lines to order', v_spec.specification_number;
  end if;

  insert into public.order_discounts (order_id, name, discount_type, pct, amount, sequence)
  select v_order_id, sd.name, sd.discount_type, sd.pct, sd.amount, sd.sequence
  from public.specification_discounts sd
  where sd.specification_id = v_spec.id
  order by sd.sequence;

  return v_order_id;
end;
$$;

REVOKE ALL ON FUNCTION public.create_order_from_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_order_from_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_order_from_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_order_from_specification(p_specification_id uuid, p_line_item_ids uuid[], p_quantities jsonb) TO service_role;

CREATE FUNCTION public.default_responsible_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.responsible_user_id is null then
    if TG_TABLE_NAME = 'orders' then
      select s.responsible_user_id into new.responsible_user_id
        from public.specifications s where s.id = (to_jsonb(new) ->> 'specification_id')::uuid;
    end if;
    new.responsible_user_id := coalesce(new.responsible_user_id, auth.uid());
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.default_responsible_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.default_responsible_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.default_responsible_user() TO authenticated;
GRANT ALL ON FUNCTION public.default_responsible_user() TO service_role;

CREATE FUNCTION public.enforce_maximum_dft_per_coat() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  maximum_dft numeric;
begin
  if new.dry_film_thickness_um is null or new.product_packaging_id is null then
    return new;
  end if;

  select pc.maximum_dft_per_coat_um
  into maximum_dft
  from public.product_packagings pp
  join public.product_coefficients pc on pc.product_id = pp.product_id
  where pp.id = new.product_packaging_id;

  if maximum_dft is not null and new.dry_film_thickness_um > maximum_dft then
    raise exception 'DFT % um exceeds the maximum of % um per coat for this product', new.dry_film_thickness_um, maximum_dft
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.enforce_maximum_dft_per_coat() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_maximum_dft_per_coat() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_maximum_dft_per_coat() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_maximum_dft_per_coat() TO service_role;

CREATE FUNCTION public.fill_hull_event_customer_from_specification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.customer_company_id is not null and new.hull_event_id is not null then
    update public.hull_events
      set customer_company_id = new.customer_company_id
      where id = new.hull_event_id and customer_company_id is null;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.fill_hull_event_customer_from_specification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fill_hull_event_customer_from_specification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fill_hull_event_customer_from_specification() TO authenticated;
GRANT ALL ON FUNCTION public.fill_hull_event_customer_from_specification() TO service_role;

CREATE FUNCTION public.generate_manual_order_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.generate_unique_ref_code() || '-O01';
$$;

REVOKE ALL ON FUNCTION public.generate_manual_order_number() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_manual_order_number() FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_manual_order_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_manual_order_number() TO service_role;

CREATE FUNCTION public.generate_order_number(p_specification_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec public.specifications%rowtype;
  v_project_code text;
  v_next_seq int;
begin
  select * into v_spec from public.specifications where id = p_specification_id;
  if v_spec.id is null then
    raise exception 'Specification % not found', p_specification_id;
  end if;

  if v_spec.hull_event_id is not null then
    v_project_code := public.assign_hull_event_project_code(v_spec.hull_event_id);
    select count(distinct order_number) + 1 into v_next_seq
    from public.orders
    where hull_event_id = v_spec.hull_event_id;
  else
    v_project_code := v_spec.specification_number;
    select count(distinct order_number) + 1 into v_next_seq
    from public.orders
    where specification_id = p_specification_id;
  end if;

  return v_project_code || '-O' || lpad(v_next_seq::text, 2, '0');
end;
$$;

REVOKE ALL ON FUNCTION public.generate_order_number(p_specification_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_order_number(p_specification_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_order_number(p_specification_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.generate_order_number(p_specification_id uuid) TO service_role;

CREATE FUNCTION public.generate_seastock_specification_number() RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.generate_unique_ref_code();
$$;

REVOKE ALL ON FUNCTION public.generate_seastock_specification_number() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_seastock_specification_number() FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_seastock_specification_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_seastock_specification_number() TO service_role;

CREATE FUNCTION public.generate_specification_number_for_hull_event(p_hull_event_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_project_code text;
  v_next_zz int;
begin
  v_project_code := public.assign_hull_event_project_code(p_hull_event_id);
  select count(distinct specification_number) + 1 into v_next_zz
  from public.specifications
  where hull_event_id = p_hull_event_id;
  return v_project_code || '-' || lpad(v_next_zz::text, 2, '0');
end;
$$;

REVOKE ALL ON FUNCTION public.generate_specification_number_for_hull_event(p_hull_event_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_specification_number_for_hull_event(p_hull_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_specification_number_for_hull_event(p_hull_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.generate_specification_number_for_hull_event(p_hull_event_id uuid) TO service_role;

CREATE FUNCTION public.generate_unique_ref_code() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_year text := to_char(now(), 'YY');
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    v_code := v_year || '-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when
      not exists (select 1 from public.hull_events where project_code = v_code)
      and not exists (select 1 from public.specifications where specification_number = v_code);
    if v_attempt > 20 then
      raise exception 'Could not generate a unique reference code after 20 attempts';
    end if;
  end loop;
  return v_code;
end;
$$;

REVOKE ALL ON FUNCTION public.generate_unique_ref_code() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_unique_ref_code() FROM PUBLIC;
GRANT ALL ON FUNCTION public.generate_unique_ref_code() TO authenticated;
GRANT ALL ON FUNCTION public.generate_unique_ref_code() TO service_role;

CREATE FUNCTION public.assign_hull_event_project_code(p_hull_event_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_code text;
begin
  -- A signed-in caller must at least see the event or one of its specifications (numbering a specification or an
  -- order needs the code); auth.uid() is null only for the service role / maintenance.
  if auth.uid() is not null
     and not public.can_access_entity('hull_events', p_hull_event_id, 'view')
     and not exists (
       select 1 from public.specifications s
       where s.hull_event_id = p_hull_event_id and public.can_access_entity('specifications', s.id, 'edit')
     ) then
    raise exception 'Hull event not found or not accessible' using errcode = '42501';
  end if;
  select project_code into v_code from public.hull_events where id = p_hull_event_id;
  if v_code is not null then
    return v_code;
  end if;
  v_code := public.generate_unique_ref_code();
  update public.hull_events set project_code = v_code where id = p_hull_event_id;
  return v_code;
end;
$$;

REVOKE ALL ON FUNCTION public.assign_hull_event_project_code(p_hull_event_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_hull_event_project_code(p_hull_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_hull_event_project_code(p_hull_event_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assign_hull_event_project_code(p_hull_event_id uuid) TO service_role;

CREATE FUNCTION public.mark_availability_request_sent(p_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec_id uuid;
begin
  select specification_id into v_spec_id from public.availability_requests where id = p_request_id;
  if v_spec_id is null or not public.can_access_entity('specifications', v_spec_id, 'edit') then
    raise exception 'Not authorized to change availability request %', p_request_id;
  end if;
  update public.availability_requests
  set requested_at = now(), requested_by_user_id = auth.uid()
  where id = p_request_id and requested_at is null;
end;
$$;

REVOKE ALL ON FUNCTION public.mark_availability_request_sent(p_request_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_availability_request_sent(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_availability_request_sent(p_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_availability_request_sent(p_request_id uuid) TO service_role;

CREATE FUNCTION public.mark_specification_sent(p_specification_id uuid, p_sent boolean DEFAULT true, p_sent_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_status text;
  v_latest boolean;
  v_is_ss boolean;
  v_sent_at timestamptz;
begin
  if not public.can_access_entity('specifications', p_specification_id, 'edit') then
    raise exception 'Not authorized to change specification %', p_specification_id;
  end if;
  select s.status, s.hull_event_type_code = 'SS', s.sent_at, not exists (select 1 from public.specifications s2 where s2.specification_number = s.specification_number and s2.version > s.version)
  into v_status, v_is_ss, v_sent_at, v_latest
  from public.specifications s where s.id = p_specification_id;
  if v_status is null then
    raise exception 'Specification % not found', p_specification_id;
  end if;
  if not v_latest or v_status not in ('draft', 'under_review', 'approved') then
    raise exception 'Specification % is % and cannot be marked as sent', p_specification_id, v_status;
  end if;
  -- The sent mark locks a Seastock offer; taking it back unlocks it, so that needs the approve right.
  if not p_sent and v_sent_at is not null and v_is_ss
     and not public.can_access_entity('specifications', p_specification_id, 'approve') then
    raise exception 'Only an approver can take back the sent mark of offer % - make a new version instead', p_specification_id;
  end if;
  perform set_config('app.mark_sent', 'on', true);
  update public.specifications
  set sent_at = case when p_sent then coalesce(p_sent_at, now()) end,
      sent_by_user_id = case when p_sent then auth.uid() end
  where id = p_specification_id;
  perform set_config('app.mark_sent', 'off', true);
end;
$$;

REVOKE ALL ON FUNCTION public.mark_specification_sent(p_specification_id uuid, p_sent boolean, p_sent_at timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_specification_sent(p_specification_id uuid, p_sent boolean, p_sent_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_specification_sent(p_specification_id uuid, p_sent boolean, p_sent_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.mark_specification_sent(p_specification_id uuid, p_sent boolean, p_sent_at timestamp with time zone) TO service_role;

CREATE FUNCTION public.next_availability_request_number(p_specification_number text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  select p_specification_number || '-A' || lpad((coalesce(max(substr(r.request_number, length(p_specification_number) + 3)::int), 0) + 1)::text, 2, '0')
  from public.availability_requests r
  where left(r.request_number, length(p_specification_number) + 2) = p_specification_number || '-A'
    and substr(r.request_number, length(p_specification_number) + 3) ~ '^\d+$';
$_$;

REVOKE ALL ON FUNCTION public.next_availability_request_number(p_specification_number text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.next_availability_request_number(p_specification_number text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_availability_request_number(p_specification_number text) TO service_role;

CREATE FUNCTION public.orders_row_allows(p_action text, p_id uuid, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sales uuid;
  v_team uuid;
  v_customer uuid;
  v_hull_event uuid;
begin
  select sales_account_user_id, assigned_team_id, customer_company_id, hull_event_id into v_sales, v_team, v_customer, v_hull_event
  from public.orders where id = p_id;
  if not found then
    return false;
  end if;
  if ('orders.' || p_action || '.all') = any((p_ctx).permissions) then
    return true;
  end if;
  if ('orders.' || p_action || '.own') = any((p_ctx).permissions) and v_sales = (p_ctx).user_id then
    return true;
  end if;
  if ('orders.' || p_action || '.team') = any((p_ctx).permissions) and v_team = any((p_ctx).team_ids) then
    return true;
  end if;
  if ('orders.' || p_action || '.account') = any((p_ctx).permissions) then
    return exists (select 1 from public.companies c where c.id = v_customer and (c.sales_account_user_id = (p_ctx).user_id or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)))
           or exists (
      select 1 from public.hull_events h
      join public.companies c on c.id = any(array[h.customer_company_id, h.dealer_company_id, h.facilitating_partner_company_id, h.shipyard_company_id, h.snapshot_group_owner_company_id, h.snapshot_operator_company_id, h.snapshot_ship_manager_company_id, h.snapshot_technical_manager_company_id])
      where h.id = v_hull_event and (c.sales_account_user_id = (p_ctx).user_id or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)));
  end if;
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.orders_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.orders_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.orders_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.orders_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.prepare_availability_request(p_specification_id uuid, p_channel text, p_estimated_arrival date DEFAULT NULL::date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec public.specifications%rowtype;
  v_request_id uuid;
  v_attempt int := 0;
begin
  if not public.can_access_entity('specifications', p_specification_id, 'edit') then
    raise exception 'Not authorized to request availability for specification %', p_specification_id;
  end if;
  if p_channel not in ('email', 'manual') then
    raise exception 'Unknown channel %', p_channel;
  end if;
  select * into v_spec from public.specifications where id = p_specification_id;
  if v_spec.supplier_id is null then
    raise exception 'Set the supplier on the specification first';
  end if;

  loop
    select r.id into v_request_id
    from public.availability_requests r
    where r.specification_id = p_specification_id and r.supplier_id = v_spec.supplier_id and r.requested_at is null;
    exit when v_request_id is not null;
    begin
      insert into public.availability_requests (specification_id, supplier_id, request_number, channel, estimated_arrival)
      values (p_specification_id, v_spec.supplier_id, public.next_availability_request_number(v_spec.specification_number),
              p_channel, coalesce(p_estimated_arrival, v_spec.delivery_date))
      returning id into v_request_id;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 3 then raise; end if;
    end;
  end loop;

  if exists (select 1 from public.availability_requests
             where id = v_request_id and send_started_at > now() - interval '5 minutes') then
    raise exception 'This availability request is being sent right now';
  end if;

  update public.availability_requests
  set channel = p_channel,
      estimated_arrival = coalesce(p_estimated_arrival, estimated_arrival, v_spec.delivery_date)
  where id = v_request_id;

  delete from public.availability_request_lines where availability_request_id = v_request_id;
  insert into public.availability_request_lines (
    availability_request_id, specification_line_item_id, product_packaging_id, line_number, requested_qty
  )
  select v_request_id, li.id, li.product_packaging_id,
         row_number() over (order by li.sequence, li.id),
         coalesce(li.offered_qty, li.real_quantity, li.quantity_product)
  from public.specification_line_items li
  where li.specification_id = p_specification_id
    and coalesce(li.offered_qty, li.real_quantity, li.quantity_product, 0) > 0;
  if not found then
    raise exception 'The specification has no line with a quantity';
  end if;

  return v_request_id;
end;
$$;

REVOKE ALL ON FUNCTION public.prepare_availability_request(p_specification_id uuid, p_channel text, p_estimated_arrival date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_availability_request(p_specification_id uuid, p_channel text, p_estimated_arrival date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_availability_request(p_specification_id uuid, p_channel text, p_estimated_arrival date) TO authenticated;
GRANT ALL ON FUNCTION public.prepare_availability_request(p_specification_id uuid, p_channel text, p_estimated_arrival date) TO service_role;

CREATE FUNCTION public.prevent_accepted_specification_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_is_ss boolean;
  v_only_status_changed boolean;
begin
  if session_user = 'postgres' then
    return coalesce(new, old);
  end if;

  -- Handing a specification over (hand_over(), which sets app.handover) changes only who is responsible; that stays
  -- possible in every status and on older versions. A direct update of the column stays frozen.
  if TG_OP = 'UPDATE'
     and current_setting('app.handover', true) = 'on'
     and new.responsible_user_id is distinct from old.responsible_user_id
     and to_jsonb(new) - 'responsible_user_id' - 'updated_at' - 'updated_by_user_id'
       = to_jsonb(old) - 'responsible_user_id' - 'updated_at' - 'updated_by_user_id' then
    return new;
  end if;

  -- mark_specification_sent() (sets app.mark_sent) changes only the sent stamp; possible while the offer is open
  -- (draft, under review, approved), also when the user may not edit an approved offer.
  if TG_OP = 'UPDATE'
     and current_setting('app.mark_sent', true) = 'on'
     and old.status in ('draft', 'under_review', 'approved')
     and to_jsonb(new) - 'sent_at' - 'sent_by_user_id' - 'updated_at' - 'updated_by_user_id'
       = to_jsonb(old) - 'sent_at' - 'sent_by_user_id' - 'updated_at' - 'updated_by_user_id' then
    return new;
  end if;

  -- A delete is at least as destructive as a content edit - keep it to the
  -- original, simple "only while draft" rule, no Manager exception (the
  -- confirmed carve-out was specifically about *editing*, not deleting).
  if TG_OP = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Specification % is % and cannot be modified', old.id, old.status;
    end if;
    return old;
  end if;

  if exists (
    select 1 from public.specifications s2
    where s2.specification_number = old.specification_number
      and s2.version > old.version
  ) then
    raise exception 'Specification % is version % - a newer version exists and only the latest version can be modified', old.id, old.version;
  end if;

  if old.status in ('accepted', 'lost') then
    raise exception 'Specification % is % and cannot be modified', old.id, old.status;
  end if;

  -- A sent Seastock offer (still draft, since it needs no approval) is locked like an approved one: users without the
  -- approve right may only change its status (accept, lost), nothing else.
  if old.status = 'draft' and old.sent_at is not null and old.hull_event_type_code = 'SS'
     and not public.can_access_entity('specifications', old.id, 'approve')
     and to_jsonb(new) - 'status' - 'updated_at' - 'updated_by_user_id'
       is distinct from to_jsonb(old) - 'status' - 'updated_at' - 'updated_by_user_id' then
    raise exception 'Offer % has been sent to the customer and can only be changed by an approver - make a new version instead', old.id;
  end if;

  if old.status = 'draft' then
    if new.status is distinct from old.status then
      v_is_ss := coalesce(new.hull_event_type_code, old.hull_event_type_code) = 'SS';
      if v_is_ss then
        -- Seastock: the approval is optional, an offer can be accepted straight from draft.
        if new.status not in ('approved', 'accepted', 'lost') then
          raise exception 'Invalid status transition for a Seastock specification: draft -> %', new.status;
        end if;
        if new.status = 'approved' then
          new.approved_by_user_id := auth.uid();
          new.approved_at := now();
        elsif new.status = 'accepted' then
          new.accepted_by_user_id := auth.uid();
          new.accepted_at := now();
        end if;
      else
        if new.status not in ('under_review', 'lost') then
          raise exception 'Invalid status transition: draft -> %', new.status;
        end if;
        if new.status = 'under_review' then
          new.submitted_for_approval_by_user_id := auth.uid();
          new.submitted_for_approval_at := now();
        end if;
      end if;
    end if;
    return new;
  end if;

  -- old.status in ('under_review', 'approved') from here on.
  if public.can_access_entity('specifications', old.id, 'approve') then
    if new.status is distinct from old.status then
      if old.status = 'under_review' and new.status = 'approved' then
        new.approved_by_user_id := auth.uid();
        new.approved_at := now();
      elsif old.status = 'under_review' and new.status = 'draft' then
        new.submitted_for_approval_by_user_id := null;
        new.submitted_for_approval_at := null;
      elsif old.status = 'approved' and new.status = 'draft' then
        new.submitted_for_approval_by_user_id := null;
        new.submitted_for_approval_at := null;
        new.approved_by_user_id := null;
        new.approved_at := null;
      elsif old.status = 'approved' and new.status = 'accepted' then
        new.accepted_by_user_id := auth.uid();
        new.accepted_at := now();
      else
        raise exception 'Specification % cannot move from % to %', old.id, old.status, new.status;
      end if;
    end if;
    return new;
  end if;

  -- No 'approve' grant: frozen, except the one edge that only ever needed
  -- the ordinary 'edit' grant already enforced by RLS - Approved -> Accepted -
  -- and only as a pure status change, no other column may differ.
  v_only_status_changed := new.status is distinct from old.status
    and to_jsonb(new) - 'status' - 'updated_at' - 'updated_by_user_id'
      = to_jsonb(old) - 'status' - 'updated_at' - 'updated_by_user_id';

  if v_only_status_changed and old.status = 'approved' and new.status = 'accepted' then
    new.accepted_by_user_id := auth.uid();
    new.accepted_at := now();
    return new;
  end if;

  raise exception 'Specification % is % and cannot be modified', old.id, old.status;
end;
$$;

REVOKE ALL ON FUNCTION public.prevent_accepted_specification_changes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_accepted_specification_changes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_accepted_specification_changes() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_accepted_specification_changes() TO service_role;

CREATE FUNCTION public.prevent_changes_to_accepted_spec() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec_id uuid;
  v_status text;
  v_specification_number text;
  v_version integer;
  v_sent_ss boolean;
begin
  select id, status, specification_number, version, sent_at is not null and hull_event_type_code = 'SS'
    into v_spec_id, v_status, v_specification_number, v_version, v_sent_ss
    from public.specifications
    where id = coalesce(new.specification_id, old.specification_id);
  if TG_TABLE_NAME = 'specification_line_items' and TG_OP = 'UPDATE' and v_status <> 'lost'
     and to_jsonb(new) - 'is_accepted' - 'updated_at' = to_jsonb(old) - 'is_accepted' - 'updated_at' then
    return new;
  end if;
  if session_user <> 'postgres' then
    if v_status in ('accepted', 'lost') then
      raise exception 'Cannot modify % of a % specification', TG_TABLE_NAME, v_status;
    end if;
    if v_status in ('under_review', 'approved') and not public.can_access_entity('specifications', v_spec_id, 'approve') then
      raise exception 'Cannot modify % of a % specification', TG_TABLE_NAME, v_status;
    end if;
    if v_status = 'draft' and v_sent_ss and not public.can_access_entity('specifications', v_spec_id, 'approve') then
      raise exception 'Cannot modify % of an offer that has been sent to the customer - make a new version instead', TG_TABLE_NAME;
    end if;
  end if;
  if session_user <> 'postgres' and exists (
    select 1 from public.specifications s2
    where s2.specification_number = v_specification_number
      and s2.version > v_version
  ) then
    raise exception 'Cannot modify % of specification version % - a newer version exists', TG_TABLE_NAME, v_version;
  end if;
  return coalesce(new, old);
end;
$$;

REVOKE ALL ON FUNCTION public.prevent_changes_to_accepted_spec() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_changes_to_accepted_spec() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_changes_to_accepted_spec() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_changes_to_accepted_spec() TO service_role;

CREATE FUNCTION public.prevent_changes_to_accepted_spec_area_products() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec_id uuid;
  v_status text;
  v_specification_number text;
  v_version integer;
begin
  select s.id, s.status, s.specification_number, s.version into v_spec_id, v_status, v_specification_number, v_version
    from public.specification_areas a
    join public.specifications s on s.id = a.specification_id
    where a.id = coalesce(new.specification_area_id, old.specification_area_id);
  if session_user <> 'postgres' then
    if v_status in ('accepted', 'lost') then
      raise exception 'Cannot modify area products of a % specification', v_status;
    end if;
    if v_status in ('under_review', 'approved') and not public.can_access_entity('specifications', v_spec_id, 'approve') then
      raise exception 'Cannot modify area products of a % specification', v_status;
    end if;
  end if;
  if session_user <> 'postgres' and exists (
    select 1 from public.specifications s2
    where s2.specification_number = v_specification_number
      and s2.version > v_version
  ) then
    raise exception 'Cannot modify area products of specification version % - a newer version exists', v_version;
  end if;
  return coalesce(new, old);
end;
$$;

REVOKE ALL ON FUNCTION public.prevent_changes_to_accepted_spec_area_products() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_changes_to_accepted_spec_area_products() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_changes_to_accepted_spec_area_products() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_changes_to_accepted_spec_area_products() TO service_role;

CREATE FUNCTION public.prevent_invalid_order_soft_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_code text;
begin
  select code into v_code from public.phrases where id = old.status_phrase_id;
  if v_code is distinct from 'confirmed' then
    raise exception 'Only orders with status ''confirmed'' can be deleted (this order is ''%'')', coalesce(v_code, 'unknown');
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.prevent_invalid_order_soft_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prevent_invalid_order_soft_delete() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prevent_invalid_order_soft_delete() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_invalid_order_soft_delete() TO service_role;

CREATE FUNCTION public.propagate_hull_event_vessel_to_specifications() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.vessel_id is distinct from old.vessel_id and new.vessel_id is not null then
    update public.specifications
      set vessel_id = new.vessel_id
      where hull_event_id = new.id and status = 'draft';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.propagate_hull_event_vessel_to_specifications() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.propagate_hull_event_vessel_to_specifications() FROM PUBLIC;
GRANT ALL ON FUNCTION public.propagate_hull_event_vessel_to_specifications() TO authenticated;
GRANT ALL ON FUNCTION public.propagate_hull_event_vessel_to_specifications() TO service_role;

CREATE FUNCTION public.replace_order_children(p_order_id uuid, p_lines jsonb, p_discounts jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order % not found', p_order_id using errcode = 'P0002';
  end if;

  delete from public.order_lines l
  where l.order_id = p_order_id
    and not exists (select 1 from jsonb_to_recordset(p_lines) as r(id uuid) where r.id = l.id);

  update public.order_lines l
  set sequence = r.seq, product_packaging_id = r.product_packaging_id, ordered_qty = r.ordered_qty,
      ordered_packs = r.ordered_packs, sales_price = r.sales_price, discount_pct = r.discount_pct,
      cost_price = r.cost_price, net_price = r.net_price, total_price = r.total_price
  from jsonb_to_recordset(p_lines) as r(
    id uuid, seq int, product_packaging_id uuid, ordered_qty numeric, ordered_packs numeric, sales_price numeric,
    discount_pct numeric, cost_price numeric, net_price numeric, total_price numeric
  )
  where l.id = r.id and l.order_id = p_order_id;

  insert into public.order_lines (
    order_id, sequence, product_packaging_id, ordered_qty, ordered_packs, sales_price, discount_pct, cost_price,
    net_price, total_price
  )
  select p_order_id, r.seq, r.product_packaging_id, r.ordered_qty, r.ordered_packs, r.sales_price, r.discount_pct,
         r.cost_price, r.net_price, r.total_price
  from jsonb_to_recordset(p_lines) as r(
    id uuid, seq int, product_packaging_id uuid, ordered_qty numeric, ordered_packs numeric, sales_price numeric,
    discount_pct numeric, cost_price numeric, net_price numeric, total_price numeric
  )
  where r.id is null
     or not exists (select 1 from public.order_lines l where l.id = r.id and l.order_id = p_order_id);

  delete from public.order_discounts where order_id = p_order_id;
  insert into public.order_discounts (order_id, name, discount_type, pct, amount, sequence)
  select p_order_id, r.name, r.discount_type, r.pct, r.amount, r.seq
  from jsonb_to_recordset(p_discounts) as r(name text, discount_type text, pct numeric, amount numeric, seq int);
end;
$$;

REVOKE ALL ON FUNCTION public.replace_order_children(p_order_id uuid, p_lines jsonb, p_discounts jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_order_children(p_order_id uuid, p_lines jsonb, p_discounts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_order_children(p_order_id uuid, p_lines jsonb, p_discounts jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.replace_order_children(p_order_id uuid, p_lines jsonb, p_discounts jsonb) TO service_role;

CREATE FUNCTION public.replace_specification_children(p_specification_id uuid, p_line_items jsonb, p_discounts jsonb, p_areas jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_area jsonb;
  v_area_id uuid;
  v_area_seq int := 0;
  v_default_requested boolean;
begin
  if not public.can_access_entity('specifications', p_specification_id, 'edit') then
    raise exception 'Not authorized to edit specification %', p_specification_id;
  end if;

  -- A new Seastock line is part of the initial request until the first availability request went out.
  select (s.hull_event_id is null or s.hull_event_type_code = 'SS')
         and not exists (select 1 from public.availability_requests r
                         where r.specification_id = s.id and r.requested_at is not null)
    into v_default_requested
    from public.specifications s where s.id = p_specification_id;

  delete from public.specification_line_items li
  where li.specification_id = p_specification_id
    and not exists (select 1 from public.specification_line_items_from_jsonb(p_line_items) r where r.id = li.id);

  update public.specification_line_items li
  set sequence = r.seq, product_packaging_id = r.product_packaging_id, quantity_product = r.quantity_product,
      thin_pct = r.thin_pct, sales_price = r.sales_price, discount_pct = r.discount_pct, cost_price = r.cost_price,
      real_quantity = r.real_quantity, offered_qty = r.offered_qty, offered_packs = r.offered_packs, net_price = r.net_price,
      gross_profit = r.gross_profit, gross_profit_pct = r.gross_profit_pct, total_price = r.total_price,
      total_gross_profit = r.total_gross_profit, comment = nullif(btrim(r.comment), ''),
      is_requested = coalesce(r.is_requested, li.is_requested), is_offered = coalesce(r.is_offered, li.is_offered)
  from public.specification_line_items_from_jsonb(p_line_items) r
  where li.id = r.id and li.specification_id = p_specification_id;

  insert into public.specification_line_items (
    specification_id, sequence, product_packaging_id, quantity_product, thin_pct, sales_price, discount_pct, cost_price,
    real_quantity, offered_qty, offered_packs, net_price, gross_profit, gross_profit_pct, total_price, total_gross_profit,
    comment, is_requested, is_offered
  )
  select
    p_specification_id, r.seq, r.product_packaging_id, r.quantity_product, r.thin_pct, r.sales_price, r.discount_pct, r.cost_price,
    r.real_quantity, r.offered_qty, r.offered_packs, r.net_price, r.gross_profit, r.gross_profit_pct, r.total_price, r.total_gross_profit,
    nullif(btrim(r.comment), ''), coalesce(r.is_requested, v_default_requested), coalesce(r.is_offered, true)
  from public.specification_line_items_from_jsonb(p_line_items) r
  where r.id is null
     or not exists (select 1 from public.specification_line_items li
                    where li.id = r.id and li.specification_id = p_specification_id);

  delete from public.specification_discounts where specification_id = p_specification_id;
  insert into public.specification_discounts (specification_id, name, discount_type, pct, amount, sequence)
  select p_specification_id, r.name, r.discount_type, r.pct, r.amount, r.seq
  from jsonb_to_recordset(p_discounts) as r(name text, discount_type text, pct numeric, amount numeric, seq int);

  delete from public.specification_areas where specification_id = p_specification_id;

  for v_area in select * from jsonb_array_elements(p_areas)
  loop
    v_area_seq := v_area_seq + 1;
    insert into public.specification_areas (
      specification_id, sequence, area_id, size_m2, substrate_phrase_id, environment_standard_phrase_id,
      loss_factor_pct, surface_preparation_text, remarks_text
    ) values (
      p_specification_id, v_area_seq,
      (v_area->>'area_id')::uuid, (v_area->>'size_m2')::numeric, (v_area->>'substrate_phrase_id')::uuid,
      (v_area->>'environment_standard_phrase_id')::uuid, (v_area->>'loss_factor_pct')::numeric,
      v_area->>'surface_preparation_text', v_area->>'remarks_text'
    )
    returning id into v_area_id;

    -- A coat line with no product picked yet is a placeholder (see areasEditor.tsx), filtered as a backstop.
    insert into public.specification_area_products (
      specification_area_id, sequence, product_packaging_id, coat_mode_phrase_id, coat_pct, application_method_phrase_id,
      loss_factor_pct, size_m2, dry_film_thickness_um, overcoat_time_minimum_override, overcoat_time_maximum_override,
      theoretical_spreading_rate, coverage_practical, quantity_l, price_per_l, price_per_m2, total_price
    )
    select
      v_area_id, p.seq, p.product_packaging_id, p.coat_mode_phrase_id, p.coat_pct, p.application_method_phrase_id,
      p.loss_factor_pct, p.size_m2, p.dry_film_thickness_um, p.overcoat_time_minimum_override, p.overcoat_time_maximum_override,
      p.theoretical_spreading_rate, p.coverage_practical, p.quantity_l, p.price_per_l, p.price_per_m2, p.total_price
    from jsonb_to_recordset(v_area->'products') as p(
      seq int, product_packaging_id uuid, coat_mode_phrase_id uuid, coat_pct numeric, application_method_phrase_id uuid,
      loss_factor_pct numeric, size_m2 numeric, dry_film_thickness_um numeric, overcoat_time_minimum_override numeric,
      overcoat_time_maximum_override numeric, theoretical_spreading_rate numeric, coverage_practical numeric,
      quantity_l numeric, price_per_l numeric, price_per_m2 numeric, total_price numeric
    )
    where p.product_packaging_id is not null;
  end loop;

  perform public.apply_specification_offered_af_products(p_specification_id);
  perform public.apply_specification_opportunity_value(p_specification_id);
end;
$$;

REVOKE ALL ON FUNCTION public.replace_specification_children(p_specification_id uuid, p_line_items jsonb, p_discounts jsonb, p_areas jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.replace_specification_children(p_specification_id uuid, p_line_items jsonb, p_discounts jsonb, p_areas jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_specification_children(p_specification_id uuid, p_line_items jsonb, p_discounts jsonb, p_areas jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.replace_specification_children(p_specification_id uuid, p_line_items jsonb, p_discounts jsonb, p_areas jsonb) TO service_role;

CREATE FUNCTION public.save_availability_answers(p_request_id uuid, p_lines jsonb, p_supplier_enquiry_number text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_spec_id uuid;
  v_requested_at timestamptz;
begin
  select specification_id, requested_at into v_spec_id, v_requested_at from public.availability_requests where id = p_request_id;
  if v_spec_id is null or not public.can_access_entity('specifications', v_spec_id, 'edit') then
    raise exception 'Not authorized to change availability request %', p_request_id;
  end if;
  if v_requested_at is null then
    raise exception 'This availability request has not been sent yet';
  end if;

  update public.availability_request_lines l
  set confirmed_qty = r.confirmed_qty,
      confirmed_date = r.confirmed_date,
      comment = nullif(btrim(r.comment), ''),
      answered_at = case
        when r.confirmed_qty is null then null
        when l.confirmed_qty is not distinct from r.confirmed_qty and l.confirmed_date is not distinct from r.confirmed_date
             and l.comment is not distinct from nullif(btrim(r.comment), '') then l.answered_at
        else now() end,
      answered_by_user_id = case
        when r.confirmed_qty is null then null
        when l.confirmed_qty is not distinct from r.confirmed_qty and l.confirmed_date is not distinct from r.confirmed_date
             and l.comment is not distinct from nullif(btrim(r.comment), '') then l.answered_by_user_id
        else auth.uid() end
  from jsonb_to_recordset(p_lines) as r(id uuid, confirmed_qty numeric, confirmed_date date, comment text)
  where l.id = r.id and l.availability_request_id = p_request_id;

  if p_supplier_enquiry_number is not null then
    update public.availability_requests
    set supplier_enquiry_number = nullif(btrim(p_supplier_enquiry_number), '')
    where id = p_request_id;
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.save_availability_answers(p_request_id uuid, p_lines jsonb, p_supplier_enquiry_number text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_availability_answers(p_request_id uuid, p_lines jsonb, p_supplier_enquiry_number text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_availability_answers(p_request_id uuid, p_lines jsonb, p_supplier_enquiry_number text) TO authenticated;
GRANT ALL ON FUNCTION public.save_availability_answers(p_request_id uuid, p_lines jsonb, p_supplier_enquiry_number text) TO service_role;

CREATE FUNCTION public.set_line_item_availability(p_specification_line_item_id uuid, p_confirmed_qty numeric, p_confirmed_date date, p_comment text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.specification_line_items%rowtype;
  v_spec public.specifications%rowtype;
  v_line_id uuid;
  v_request_id uuid;
  v_comment text := nullif(btrim(p_comment), '');
begin
  select * into v_item from public.specification_line_items where id = p_specification_line_item_id;
  if v_item.id is null or not public.can_access_entity('specifications', v_item.specification_id, 'edit') then
    raise exception 'Not authorized to change line %', p_specification_line_item_id;
  end if;
  select * into v_spec from public.specifications where id = v_item.specification_id;

  select l.id into v_line_id
  from public.availability_request_lines l
  join public.availability_requests r on r.id = l.availability_request_id
  where l.specification_line_item_id = v_item.id and r.requested_at is not null
  order by r.requested_at desc
  limit 1;

  if v_line_id is null then
    if v_spec.supplier_id is null then
      raise exception 'Set the supplier on the specification first';
    end if;
    select r.id into v_request_id
    from public.availability_requests r
    where r.specification_id = v_spec.id and r.supplier_id = v_spec.supplier_id and r.requested_at is not null
    order by r.requested_at desc
    limit 1;
    if v_request_id is null then
      insert into public.availability_requests (
        specification_id, supplier_id, request_number, channel, estimated_arrival, requested_at, requested_by_user_id
      ) values (
        v_spec.id, v_spec.supplier_id, public.next_availability_request_number(v_spec.specification_number),
        'manual', v_spec.delivery_date, now(), auth.uid()
      )
      returning id into v_request_id;
    end if;
    insert into public.availability_request_lines (
      availability_request_id, specification_line_item_id, product_packaging_id, line_number, requested_qty
    )
    select v_request_id, v_item.id, v_item.product_packaging_id,
           coalesce((select max(line_number) from public.availability_request_lines where availability_request_id = v_request_id), 0) + 1,
           coalesce(v_item.offered_qty, v_item.real_quantity, v_item.quantity_product, 0)
    returning id into v_line_id;
  end if;

  update public.availability_request_lines l
  set confirmed_qty = p_confirmed_qty,
      confirmed_date = p_confirmed_date,
      comment = v_comment,
      answered_at = case when p_confirmed_qty is null then null else now() end,
      answered_by_user_id = case when p_confirmed_qty is null then null else auth.uid() end
  where l.id = v_line_id;
end;
$$;

REVOKE ALL ON FUNCTION public.set_line_item_availability(p_specification_line_item_id uuid, p_confirmed_qty numeric, p_confirmed_date date, p_comment text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_line_item_availability(p_specification_line_item_id uuid, p_confirmed_qty numeric, p_confirmed_date date, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_line_item_availability(p_specification_line_item_id uuid, p_confirmed_qty numeric, p_confirmed_date date, p_comment text) TO authenticated;
GRANT ALL ON FUNCTION public.set_line_item_availability(p_specification_line_item_id uuid, p_confirmed_qty numeric, p_confirmed_date date, p_comment text) TO service_role;

CREATE FUNCTION public.specification_antifouling_names(p_specification_id uuid) RETURNS TABLE(vertical_name text, flat_bottom_name text)
    LANGUAGE sql STABLE
    AS $$
  with area_af as (
    select
      sa.sequence as area_sequence,
      area.af_zone = 'flat_bottom' as is_flat_bottom,
      (
        select pr.name
        from public.specification_area_products sap
        join public.product_packagings pk on pk.id = sap.product_packaging_id
        join public.products pr on pr.id = pk.product_id
        join public.phrases grp on grp.id = pr.group_phrase_id
        where sap.specification_area_id = sa.id and grp.code = 'antifouling'
        order by sap.sequence
        limit 1
      ) as product_name
    from public.specification_areas sa
    left join public.spec_areas area on area.id = sa.area_id
    where sa.specification_id = p_specification_id
  )
  select
    (
      select product_name from area_af
      where product_name is not null and not is_flat_bottom
      group by product_name
      order by count(*) desc, min(area_sequence)
      limit 1
    ),
    (
      select product_name from area_af
      where product_name is not null and is_flat_bottom
      order by area_sequence
      limit 1
    );
$$;

REVOKE ALL ON FUNCTION public.specification_antifouling_names(p_specification_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.specification_antifouling_names(p_specification_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.specification_antifouling_names(p_specification_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.specification_antifouling_names(p_specification_id uuid) TO service_role;

CREATE FUNCTION public.specification_line_items_from_jsonb(p_line_items jsonb) RETURNS TABLE(id uuid, seq integer, product_packaging_id uuid, quantity_product numeric, thin_pct numeric, sales_price numeric, discount_pct numeric, cost_price numeric, real_quantity numeric, offered_qty numeric, offered_packs numeric, net_price numeric, gross_profit numeric, gross_profit_pct numeric, total_price numeric, total_gross_profit numeric, comment text, is_requested boolean, is_offered boolean)
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select * from jsonb_to_recordset(p_line_items) as r(
    id uuid, seq int, product_packaging_id uuid, quantity_product numeric, thin_pct numeric, sales_price numeric,
    discount_pct numeric, cost_price numeric, real_quantity numeric, offered_qty numeric, offered_packs numeric, net_price numeric,
    gross_profit numeric, gross_profit_pct numeric, total_price numeric, total_gross_profit numeric,
    comment text, is_requested boolean, is_offered boolean
  );
$$;

REVOKE ALL ON FUNCTION public.specification_line_items_from_jsonb(p_line_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.specification_line_items_from_jsonb(p_line_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.specification_line_items_from_jsonb(p_line_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.specification_line_items_from_jsonb(p_line_items jsonb) TO service_role;

CREATE FUNCTION public.specifications_can_approve(rec public.specifications) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.can_access_entity('specifications', rec.id, 'approve');
$$;

REVOKE ALL ON FUNCTION public.specifications_can_approve(rec public.specifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.specifications_can_approve(rec public.specifications) FROM PUBLIC;
GRANT ALL ON FUNCTION public.specifications_can_approve(rec public.specifications) TO authenticated;
GRANT ALL ON FUNCTION public.specifications_can_approve(rec public.specifications) TO service_role;

CREATE FUNCTION public.specifications_can_edit(rec public.specifications) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.can_access_entity('specifications', rec.id, 'edit');
$$;

REVOKE ALL ON FUNCTION public.specifications_can_edit(rec public.specifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.specifications_can_edit(rec public.specifications) FROM PUBLIC;
GRANT ALL ON FUNCTION public.specifications_can_edit(rec public.specifications) TO authenticated;
GRANT ALL ON FUNCTION public.specifications_can_edit(rec public.specifications) TO service_role;

CREATE FUNCTION public.specifications_is_latest_version(rec public.specifications) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not exists (
    select 1 from public.specifications s2
    where s2.specification_number = rec.specification_number
      and s2.version > rec.version
  );
$$;

REVOKE ALL ON FUNCTION public.specifications_is_latest_version(rec public.specifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.specifications_is_latest_version(rec public.specifications) FROM PUBLIC;
GRANT ALL ON FUNCTION public.specifications_is_latest_version(rec public.specifications) TO authenticated;
GRANT ALL ON FUNCTION public.specifications_is_latest_version(rec public.specifications) TO service_role;

CREATE FUNCTION public.specifications_row_allows(p_action text, p_id uuid, p_ctx public.access_context) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_sales uuid;
  v_team uuid;
  v_customer uuid;
  v_hull_event uuid;
begin
  select sales_account_user_id, assigned_team_id, customer_company_id, hull_event_id into v_sales, v_team, v_customer, v_hull_event
  from public.specifications where id = p_id;
  if not found then
    return false;
  end if;
  if ('specifications.' || p_action || '.all') = any((p_ctx).permissions) then
    return true;
  end if;
  if ('specifications.' || p_action || '.own') = any((p_ctx).permissions) and v_sales = (p_ctx).user_id then
    return true;
  end if;
  if ('specifications.' || p_action || '.team') = any((p_ctx).permissions) and v_team = any((p_ctx).team_ids) then
    return true;
  end if;
  if ('specifications.' || p_action || '.account') = any((p_ctx).permissions) then
    return exists (select 1 from public.companies c where c.id = v_customer and (c.sales_account_user_id = (p_ctx).user_id or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)))
           or exists (
      select 1 from public.hull_events h
      join public.companies c on c.id = any(array[h.customer_company_id, h.dealer_company_id, h.facilitating_partner_company_id, h.shipyard_company_id, h.snapshot_group_owner_company_id, h.snapshot_operator_company_id, h.snapshot_ship_manager_company_id, h.snapshot_technical_manager_company_id])
      where h.id = v_hull_event and (c.sales_account_user_id = (p_ctx).user_id or exists (select 1 from public.companies g where g.id = c.group_company_id and g.sales_account_user_id = (p_ctx).user_id)));
  end if;
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.specifications_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.specifications_row_allows(p_action text, p_id uuid, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.specifications_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.specifications_row_allows(p_action text, p_id uuid, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.stamp_order_invoiced_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_code text;
begin
  if tg_op = 'UPDATE' and new.status_phrase_id is not distinct from old.status_phrase_id then
    return new;
  end if;
  select code into v_code from public.phrases where id = new.status_phrase_id;
  if v_code = 'invoiced' then
    new.invoiced_at := coalesce(new.invoiced_at, now());
  else
    new.invoiced_at := null;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.stamp_order_invoiced_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stamp_order_invoiced_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_order_invoiced_at() TO service_role;

CREATE FUNCTION public.sync_hull_event_event_date_from_specification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.hull_event_id is not null and new.hull_event_type_code = 'SS' then
    update public.hull_events set event_date = new.delivery_date where id = new.hull_event_id;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_hull_event_event_date_from_specification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_hull_event_event_date_from_specification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_hull_event_event_date_from_specification() TO authenticated;
GRANT ALL ON FUNCTION public.sync_hull_event_event_date_from_specification() TO service_role;

CREATE FUNCTION public.sync_hull_event_location_from_specification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.hull_event_id is not null then
    update public.hull_events he
    set
      location_continent = coalesce(he.location_continent, new.location_continent),
      location_country_id = coalesce(he.location_country_id, new.location_country_id)
    where he.id = new.hull_event_id
      and (he.location_continent is null or he.location_country_id is null);
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_hull_event_location_from_specification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_hull_event_location_from_specification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_hull_event_location_from_specification() TO authenticated;
GRANT ALL ON FUNCTION public.sync_hull_event_location_from_specification() TO service_role;

CREATE FUNCTION public.sync_hull_event_maker_on_acceptance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.status = 'accepted' and new.hull_event_id is not null and new.hull_event_type_code <> 'SS' then
    perform public.apply_specification_af_products(new.id);
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_hull_event_maker_on_acceptance() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_hull_event_maker_on_acceptance() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_hull_event_maker_on_acceptance() TO authenticated;
GRANT ALL ON FUNCTION public.sync_hull_event_maker_on_acceptance() TO service_role;

CREATE FUNCTION public.sync_opportunity_on_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.apply_specification_opportunity_value(new.id);
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.sync_opportunity_on_approval() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_opportunity_on_approval() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_opportunity_on_approval() TO service_role;

CREATE FUNCTION public.transport_follows_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.specification_id is not null then
    update public.transports set order_id = new.id
    where specification_id = new.specification_id and order_id is null;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.transport_follows_order() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transport_follows_order() FROM PUBLIC;
GRANT ALL ON FUNCTION public.transport_follows_order() TO authenticated;
GRANT ALL ON FUNCTION public.transport_follows_order() TO service_role;

CREATE FUNCTION public.transport_quote_price_follows_award() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.status = 'awarded' and new.price is distinct from old.price then
    update public.transports set freight_cost_quoted = new.price where id = new.transport_id;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.transport_quote_price_follows_award() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transport_quote_price_follows_award() FROM PUBLIC;
GRANT ALL ON FUNCTION public.transport_quote_price_follows_award() TO authenticated;
GRANT ALL ON FUNCTION public.transport_quote_price_follows_award() TO service_role;

CREATE FUNCTION public.hand_over_for_availability(p_specification_id uuid, p_to_user_id uuid, p_estimated_arrival date DEFAULT NULL::date, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_request_id uuid;
begin
  v_request_id := public.prepare_availability_request(p_specification_id, 'manual', p_estimated_arrival);
  perform public.mark_availability_request_sent(v_request_id);
  perform public.hand_over('specifications', p_specification_id, p_to_user_id, 'Check availability', p_note);
end;
$$;

REVOKE ALL ON FUNCTION public.hand_over_for_availability(p_specification_id uuid, p_to_user_id uuid, p_estimated_arrival date, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hand_over_for_availability(p_specification_id uuid, p_to_user_id uuid, p_estimated_arrival date, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hand_over_for_availability(p_specification_id uuid, p_to_user_id uuid, p_estimated_arrival date, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.hand_over_for_availability(p_specification_id uuid, p_to_user_id uuid, p_estimated_arrival date, p_note text) TO service_role;

CREATE FUNCTION public.assignable_users(p_entity_type text, p_entity_id uuid) RETURNS TABLE(id uuid, name text, email text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_entity_type not in ('specifications', 'orders') or not public.can_access_entity(p_entity_type, p_entity_id, 'view') then
    return;
  end if;
  return query
    select u.id, u.name, u.email
    from public.users u
    where u.has_login
      and public.user_has_access(u.id, p_entity_type, p_entity_id, 'edit')
    order by u.name;
end;
$$;

REVOKE ALL ON FUNCTION public.assignable_users(p_entity_type text, p_entity_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assignable_users(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assignable_users(p_entity_type text, p_entity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assignable_users(p_entity_type text, p_entity_id uuid) TO service_role;

ALTER TABLE public.spec_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins write spec areas" ON public.spec_areas TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Signed-in users read spec areas" ON public.spec_areas FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.spec_areas AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.spec_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.specifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create specifications per grant" ON public.specifications FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('specifications.create.all'::text) AS rls_has) OR (( SELECT public.rls_has('specifications.create.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('specifications.create.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))));

CREATE POLICY "Delete specifications per grant" ON public.specifications FOR DELETE TO authenticated USING ((( SELECT public.rls_has('specifications.delete.all'::text) AS rls_has) OR (( SELECT public.rls_has('specifications.delete.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('specifications.delete.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))));

CREATE POLICY "Edit specifications per grant" ON public.specifications FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('specifications.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('specifications.edit.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('specifications.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('specifications.edit.account'::text) AS rls_has) AND ((customer_company_id IN ( SELECT public.rls_my_account_company_ids() AS rls_my_account_company_ids)) OR (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids)))))) WITH CHECK ((( SELECT public.rls_has('specifications.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('specifications.edit.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('specifications.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('specifications.edit.account'::text) AS rls_has) AND ((customer_company_id IN ( SELECT public.rls_my_account_company_ids() AS rls_my_account_company_ids)) OR (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids))))));

CREATE POLICY "View specifications per grant" ON public.specifications FOR SELECT TO authenticated USING ((( SELECT public.rls_has('specifications.view.all'::text) AS rls_has) OR (( SELECT public.rls_has('specifications.view.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('specifications.view.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('specifications.view.account'::text) AS rls_has) AND ((customer_company_id IN ( SELECT public.rls_my_account_company_ids() AS rls_my_account_company_ids)) OR (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids))))));

CREATE POLICY mfa_required ON public.specifications AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER auto_create_order_for_seastock AFTER INSERT OR UPDATE OF status ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.auto_create_order_for_seastock_acceptance();

CREATE TRIGGER copy_hull_event_vessel BEFORE INSERT ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.copy_hull_event_vessel_to_specification();

CREATE TRIGGER default_responsible_user BEFORE INSERT ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.default_responsible_user();

CREATE TRIGGER default_team_of_creator BEFORE INSERT ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.default_team_of_creator('team_id');

CREATE TRIGGER fill_hull_event_customer AFTER INSERT OR UPDATE OF customer_company_id ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.fill_hull_event_customer_from_specification();

CREATE TRIGGER prevent_accepted_specification_changes BEFORE DELETE OR UPDATE ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.prevent_accepted_specification_changes();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER specifications_clean_events AFTER DELETE ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('specifications');

CREATE TRIGGER specifications_log_changes AFTER UPDATE OF status, sent_at, request_received_at, valid_until_at, team_id, supplier_id, customer_company_id, sales_account_user_id, delivery_date_from, delivery_date, port_id, location_country_id, incoterm_phrase_id, incoterm_place, currency ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('specifications', '!status', '!sent_at', 'request_received_at', 'valid_until_at', 'team_id=teams', 'supplier_id=companies', 'customer_company_id=companies', 'sales_account_user_id=users', 'delivery_date_from', 'delivery_date', 'port_id=ports', 'location_country_id=countries', 'incoterm_phrase_id=phrases', 'incoterm_place', 'currency');

CREATE TRIGGER specifications_sync_opportunity_on_approval AFTER UPDATE OF status ON public.specifications FOR EACH ROW WHEN (((new.status = 'approved'::text) AND (old.status IS DISTINCT FROM new.status))) EXECUTE FUNCTION public.sync_opportunity_on_approval();

CREATE TRIGGER sync_hull_event_event_date_from_seastock_specification AFTER INSERT OR UPDATE OF delivery_date ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.sync_hull_event_event_date_from_specification();

CREATE TRIGGER sync_hull_event_location AFTER INSERT OR UPDATE OF location_continent, location_country_id ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.sync_hull_event_location_from_specification();

CREATE TRIGGER sync_hull_event_maker AFTER INSERT OR UPDATE OF status ON public.specifications FOR EACH ROW EXECUTE FUNCTION public.sync_hull_event_maker_on_acceptance();

ALTER TABLE public.specification_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete specification areas per parent grant" ON public.specification_areas FOR DELETE TO authenticated USING ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert specification areas per parent grant" ON public.specification_areas FOR INSERT TO authenticated WITH CHECK ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update specification areas per parent grant" ON public.specification_areas FOR UPDATE TO authenticated USING ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View specification areas per parent grant" ON public.specification_areas FOR SELECT TO authenticated USING ((public.specifications_row_allows('view'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.specification_areas AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER prevent_changes_when_accepted BEFORE INSERT OR DELETE OR UPDATE ON public.specification_areas FOR EACH ROW EXECUTE FUNCTION public.prevent_changes_to_accepted_spec();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.specification_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.specification_area_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete specification area products per parent grant" ON public.specification_area_products FOR DELETE TO authenticated USING ((public.can_access_specification_area(specification_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert specification area products per parent grant" ON public.specification_area_products FOR INSERT TO authenticated WITH CHECK ((public.can_access_specification_area(specification_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update specification area products per parent grant" ON public.specification_area_products FOR UPDATE TO authenticated USING ((public.can_access_specification_area(specification_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.can_access_specification_area(specification_area_id, 'edit'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View specification area products per parent grant" ON public.specification_area_products FOR SELECT TO authenticated USING ((public.can_access_specification_area(specification_area_id, 'view'::text, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.specification_area_products AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER enforce_maximum_dft_per_coat BEFORE INSERT OR UPDATE OF dry_film_thickness_um, product_packaging_id ON public.specification_area_products FOR EACH ROW EXECUTE FUNCTION public.enforce_maximum_dft_per_coat();

CREATE TRIGGER prevent_changes_when_accepted BEFORE INSERT OR DELETE OR UPDATE ON public.specification_area_products FOR EACH ROW EXECUTE FUNCTION public.prevent_changes_to_accepted_spec_area_products();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.specification_area_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.specification_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete specification line items per parent grant" ON public.specification_line_items FOR DELETE TO authenticated USING ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert specification line items per parent grant" ON public.specification_line_items FOR INSERT TO authenticated WITH CHECK ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update specification line items per parent grant" ON public.specification_line_items FOR UPDATE TO authenticated USING ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View specification line items per parent grant" ON public.specification_line_items FOR SELECT TO authenticated USING ((public.specifications_row_allows('view'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.specification_line_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER prevent_changes_when_accepted BEFORE INSERT OR DELETE OR UPDATE ON public.specification_line_items FOR EACH ROW EXECUTE FUNCTION public.prevent_changes_to_accepted_spec();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.specification_line_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.specification_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete specification discounts per parent grant" ON public.specification_discounts FOR DELETE TO authenticated USING ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert specification discounts per parent grant" ON public.specification_discounts FOR INSERT TO authenticated WITH CHECK ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update specification discounts per parent grant" ON public.specification_discounts FOR UPDATE TO authenticated USING ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View specification discounts per parent grant" ON public.specification_discounts FOR SELECT TO authenticated USING ((public.specifications_row_allows('view'::text, specification_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.specification_discounts AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER prevent_changes_when_accepted BEFORE INSERT OR DELETE OR UPDATE ON public.specification_discounts FOR EACH ROW EXECUTE FUNCTION public.prevent_changes_to_accepted_spec();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.specification_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create orders per grant" ON public.orders FOR INSERT TO authenticated WITH CHECK ((((specification_id IS NOT NULL) AND public.specifications_row_allows('edit'::text, specification_id, ( SELECT public.access_context() AS access_context))) OR ((specification_id IS NULL) AND (( SELECT public.rls_has('orders.create.all'::text) AS rls_has) OR (( SELECT public.rls_has('orders.create.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('orders.create.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[])))))));

CREATE POLICY "Edit orders per grant" ON public.orders FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('orders.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('orders.edit.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('orders.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('orders.edit.account'::text) AS rls_has) AND ((customer_company_id IN ( SELECT public.rls_my_account_company_ids() AS rls_my_account_company_ids)) OR (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids)))))) WITH CHECK ((( SELECT public.rls_has('orders.edit.all'::text) AS rls_has) OR (( SELECT public.rls_has('orders.edit.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('orders.edit.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('orders.edit.account'::text) AS rls_has) AND ((customer_company_id IN ( SELECT public.rls_my_account_company_ids() AS rls_my_account_company_ids)) OR (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids))))));

CREATE POLICY "View orders per grant" ON public.orders FOR SELECT TO authenticated USING ((( SELECT public.rls_has('orders.view.all'::text) AS rls_has) OR (( SELECT public.rls_has('orders.view.own'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT public.rls_has('orders.view.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT public.rls_my_team_ids() AS rls_my_team_ids)::uuid[]))) OR (( SELECT public.rls_has('orders.view.account'::text) AS rls_has) AND ((customer_company_id IN ( SELECT public.rls_my_account_company_ids() AS rls_my_account_company_ids)) OR (hull_event_id IN ( SELECT public.rls_my_account_hull_event_ids() AS rls_my_account_hull_event_ids))))));

CREATE POLICY mfa_required ON public.orders AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER copy_incoterm_from_specification BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.copy_incoterm_from_specification();

CREATE TRIGGER default_responsible_user BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.default_responsible_user();

CREATE TRIGGER default_team_of_creator BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.default_team_of_creator('team_id');

CREATE TRIGGER orders_clean_events AFTER DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('orders');

CREATE TRIGGER orders_log_changes AFTER UPDATE OF status_phrase_id, supplier_id, customer_company_id, sales_account_user_id, requested_date_from, requested_date, customer_po_number, external_order_reference, delivery_port, incoterm_phrase_id, incoterm_place, currency, mof_sent_at, deleted_at ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_field_changes('orders', '!status_phrase_id=phrases', 'supplier_id=companies', 'customer_company_id=companies', 'sales_account_user_id=users', 'requested_date_from', 'requested_date', 'customer_po_number', 'external_order_reference', 'delivery_port', 'incoterm_phrase_id=phrases', 'incoterm_place', 'currency', '!mof_sent_at', '!deleted_at');

CREATE TRIGGER prevent_invalid_order_soft_delete BEFORE UPDATE OF deleted_at ON public.orders FOR EACH ROW WHEN (((new.deleted_at IS NOT NULL) AND (old.deleted_at IS NULL))) EXECUTE FUNCTION public.prevent_invalid_order_soft_delete();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER stamp_order_invoiced_at BEFORE INSERT OR UPDATE OF status_phrase_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.stamp_order_invoiced_at();

CREATE TRIGGER transport_follows_order AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.transport_follows_order();

ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete order lines per parent grant" ON public.order_lines FOR DELETE TO authenticated USING ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert order lines per parent grant" ON public.order_lines FOR INSERT TO authenticated WITH CHECK ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update order lines per parent grant" ON public.order_lines FOR UPDATE TO authenticated USING ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View order lines per parent grant" ON public.order_lines FOR SELECT TO authenticated USING ((public.orders_row_allows('view'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.order_lines AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.order_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.order_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete order discounts per parent grant" ON public.order_discounts FOR DELETE TO authenticated USING ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Insert order discounts per parent grant" ON public.order_discounts FOR INSERT TO authenticated WITH CHECK ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "Update order discounts per parent grant" ON public.order_discounts FOR UPDATE TO authenticated USING ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context)))) WITH CHECK ((public.orders_row_allows('edit'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY "View order discounts per parent grant" ON public.order_discounts FOR SELECT TO authenticated USING ((public.orders_row_allows('view'::text, order_id, ( SELECT public.access_context() AS access_context))));

CREATE POLICY mfa_required ON public.order_discounts AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.order_discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.country_default_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins write" ON public.country_default_suppliers TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Read for signed-in users" ON public.country_default_suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.country_default_suppliers AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.handovers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View handovers per record" ON public.handovers FOR SELECT TO authenticated USING (public.can_access_entity(entity_type, entity_id, 'view'::text));

CREATE POLICY mfa_required ON public.handovers AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.transports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete transports per record" ON public.transports FOR DELETE TO authenticated USING (public.can_access_entity(
CASE
    WHEN (order_id IS NOT NULL) THEN 'orders'::text
    ELSE 'specifications'::text
END, COALESCE(order_id, specification_id), 'edit'::text));

CREATE POLICY "Insert transports per record" ON public.transports FOR INSERT TO authenticated WITH CHECK (public.can_access_entity(
CASE
    WHEN (order_id IS NOT NULL) THEN 'orders'::text
    ELSE 'specifications'::text
END, COALESCE(order_id, specification_id), 'edit'::text));

CREATE POLICY "Update transports per record" ON public.transports FOR UPDATE TO authenticated USING (public.can_access_entity(
CASE
    WHEN (order_id IS NOT NULL) THEN 'orders'::text
    ELSE 'specifications'::text
END, COALESCE(order_id, specification_id), 'edit'::text)) WITH CHECK (public.can_access_entity(
CASE
    WHEN (order_id IS NOT NULL) THEN 'orders'::text
    ELSE 'specifications'::text
END, COALESCE(order_id, specification_id), 'edit'::text));

CREATE POLICY "View transports per record" ON public.transports FOR SELECT TO authenticated USING (public.can_access_entity(
CASE
    WHEN (order_id IS NOT NULL) THEN 'orders'::text
    ELSE 'specifications'::text
END, COALESCE(order_id, specification_id), 'view'::text));

CREATE POLICY mfa_required ON public.transports AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.transport_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete transport quotes per record" ON public.transport_quotes FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.transports t
  WHERE ((t.id = transport_quotes.transport_id) AND public.can_access_entity(
        CASE
            WHEN (t.order_id IS NOT NULL) THEN 'orders'::text
            ELSE 'specifications'::text
        END, COALESCE(t.order_id, t.specification_id), 'edit'::text)))));

CREATE POLICY "Insert transport quotes per record" ON public.transport_quotes FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.transports t
  WHERE ((t.id = transport_quotes.transport_id) AND public.can_access_entity(
        CASE
            WHEN (t.order_id IS NOT NULL) THEN 'orders'::text
            ELSE 'specifications'::text
        END, COALESCE(t.order_id, t.specification_id), 'edit'::text)))));

CREATE POLICY "Update transport quotes per record" ON public.transport_quotes FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.transports t
  WHERE ((t.id = transport_quotes.transport_id) AND public.can_access_entity(
        CASE
            WHEN (t.order_id IS NOT NULL) THEN 'orders'::text
            ELSE 'specifications'::text
        END, COALESCE(t.order_id, t.specification_id), 'edit'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.transports t
  WHERE ((t.id = transport_quotes.transport_id) AND public.can_access_entity(
        CASE
            WHEN (t.order_id IS NOT NULL) THEN 'orders'::text
            ELSE 'specifications'::text
        END, COALESCE(t.order_id, t.specification_id), 'edit'::text)))));

CREATE POLICY "View transport quotes per record" ON public.transport_quotes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.transports t
  WHERE (t.id = transport_quotes.transport_id))));

CREATE POLICY mfa_required ON public.transport_quotes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transport_quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER transport_quote_price_follows_award AFTER UPDATE OF price ON public.transport_quotes FOR EACH ROW EXECUTE FUNCTION public.transport_quote_price_follows_award();

ALTER TABLE public.availability_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View availability requests per parent grant" ON public.availability_requests FOR SELECT TO authenticated USING ((((specification_id IS NOT NULL) AND public.specifications_row_allows('view'::text, specification_id, ( SELECT public.access_context() AS access_context))) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.availability_request_id = availability_requests.id) AND public.orders_row_allows('view'::text, o.id, ( SELECT public.access_context() AS access_context)))))));

CREATE POLICY mfa_required ON public.availability_requests AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.availability_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.availability_request_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View availability request lines per parent grant" ON public.availability_request_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.availability_requests r
  WHERE (r.id = availability_request_lines.availability_request_id))));

CREATE POLICY mfa_required ON public.availability_request_lines AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.availability_request_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_api_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View supplier api calls per parent grant" ON public.supplier_api_calls FOR SELECT TO authenticated USING ((((entity_type = 'orders'::text) AND public.orders_row_allows('view'::text, entity_id, ( SELECT public.access_context() AS access_context))) OR ((entity_type = 'availability_requests'::text) AND (EXISTS ( SELECT 1
   FROM public.availability_requests r
  WHERE (r.id = supplier_api_calls.entity_id))))));

CREATE POLICY mfa_required ON public.supplier_api_calls AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.hull_events_overview WITH (security_invoker='true') AS
 SELECT he.id,
    he.status,
    he.lost_reason,
    he.created_at,
    v.name AS vessel_name,
    v.imo AS vessel_imo,
    v.ship_type AS vessel_ship_type,
    v.built_date AS vessel_built_date,
    v.deadweight_tonnage AS vessel_deadweight_tonnage,
    p.text_en AS type_text,
    sgo.id AS snapshot_group_owner_company_id,
    sgo.name AS snapshot_group_owner_company_name,
    stm.id AS snapshot_technical_manager_company_id,
    stm.name AS snapshot_technical_manager_company_name,
    sop.id AS snapshot_operator_company_id,
    sop.name AS snapshot_operator_company_name,
    spec_summary.specification_count,
    spec_summary.has_accepted_specification,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'hull_events'::text) AND (a.entity_id = he.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'hull_events'::text) AND (conv.anchor_id = he.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    he.event_date,
    gc_group.id AS resolved_group_company_id,
    gc_group.name AS resolved_group_company_name,
    maker.name AS maker_name,
    dealer.name AS dealer_name,
    invoicing.team_name AS invoicing_party_name,
    nb.newbuilding_code,
    nb.newbuilding_deadweight_tonnage,
    nb.newbuilding_teu,
    nb.contract_date AS newbuilding_contract_date,
    nb.steel_cut_date AS newbuilding_steel_cut_date,
    p.code AS type_code,
    he.supplier_this_hullevent_id AS maker_company_id,
    he.dealer_company_id,
    he.reported_by_user_id,
    gc_group.sales_account_user_id AS resolved_group_company_sales_account_user_id,
    tmc.id AS resolved_technical_manager_company_id,
    tmc.name AS resolved_technical_manager_company_name,
    oc.id AS resolved_operator_company_id,
    oc.name AS resolved_operator_company_name,
    tmc_group.id AS resolved_technical_manager_group_company_id,
    tmc_group.name AS resolved_technical_manager_group_company_name,
    oc_group.id AS resolved_operator_group_company_id,
    oc_group.name AS resolved_operator_group_company_name,
    goc.id AS resolved_group_owner_company_id,
    goc.name AS resolved_group_owner_company_name,
    goc_country.name_en AS resolved_group_owner_company_country,
    gc_group_country.name_en AS resolved_group_company_country,
    tmc_country.name_en AS resolved_technical_manager_company_country,
    tmc_group_country.name_en AS resolved_technical_manager_group_company_country,
    oc_country.name_en AS resolved_operator_company_country,
    oc_group_country.name_en AS resolved_operator_group_company_country,
    sgo_country.name_en AS snapshot_group_owner_company_country,
    stm_country.name_en AS snapshot_technical_manager_company_country,
    sop_country.name_en AS snapshot_operator_company_country,
    ssm.id AS snapshot_ship_manager_company_id,
    ssm.name AS snapshot_ship_manager_company_name,
    ssm_country.name_en AS snapshot_ship_manager_company_country,
    smc.id AS resolved_ship_manager_company_id,
    smc.name AS resolved_ship_manager_company_name,
    smc_group.id AS resolved_ship_manager_group_company_id,
    smc_group.name AS resolved_ship_manager_group_company_name,
    smc_country.name_en AS resolved_ship_manager_company_country,
    smc_group_country.name_en AS resolved_ship_manager_group_company_country,
    he.customer_company_id,
    cust.name AS customer_name,
    cust_country.name_en AS customer_company_country,
    vaf.name AS vertical_af_product_name,
    faf.name AS flat_bottom_af_product_name,
    he.sales_account_user_id,
    sales_rep.name AS sales_account_user_name,
    he.facilitating_partner_company_id,
    fp.name AS facilitating_partner_name,
    he.service_period_months,
    voff.name AS vertical_offered_af_product_name,
    foff.name AS flat_bottom_offered_af_product_name,
    he.location_continent,
    he.location_country_id,
    loc_country.name_en AS location_country_name,
    shipyard.name AS shipyard_name,
    he.opportunity_value,
    he.opportunity_value_currency,
    he.opportunity_exchange_rate,
    he.newbuilding_project_id,
    np.title AS newbuilding_project_title,
    ( SELECT sum(li.offered_qty) AS sum
           FROM (public.specification_line_items li
             JOIN public.product_packagings pp ON ((pp.id = li.product_packaging_id)))
          WHERE ((li.specification_id = ( SELECT s.id
                   FROM public.specifications s
                  WHERE (s.hull_event_id = he.id)
                  ORDER BY (s.status = 'accepted'::text) DESC, s.created_at DESC
                 LIMIT 1)) AND li.is_offered AND (pp.unit = 'L'::text))) AS offered_litres,
    ( SELECT sum(ol.ordered_qty) AS sum
           FROM (((public.orders o
             JOIN public.phrases ost ON ((ost.id = o.status_phrase_id)))
             JOIN public.order_lines ol ON ((ol.order_id = o.id)))
             JOIN public.product_packagings pp ON ((pp.id = ol.product_packaging_id)))
          WHERE ((o.hull_event_id = he.id) AND (o.deleted_at IS NULL) AND (ost.code <> 'cancelled'::text) AND (pp.unit = 'L'::text))) AS ordered_litres,
    v.status AS vessel_status,
    v.flag AS vessel_flag,
    v.gross_tonnage AS vessel_gross_tonnage,
    shipyard.city AS shipyard_city,
    dealer.short_code AS dealer_short_code,
    fp.short_code AS facilitating_partner_short_code,
    ( SELECT COALESCE(sp.short_code, sp.name) AS "coalesce"
           FROM ((public.hull_events nbe
             JOIN public.phrases nbp ON ((nbp.id = nbe.type_phrase_id)))
             JOIN public.companies sp ON ((sp.id = nbe.supplier_this_hullevent_id)))
          WHERE ((nbe.vessel_id = he.vessel_id) AND (nbp.code = 'NB'::text))
          ORDER BY nbe.event_date, nbe.created_at, nbe.id
         LIMIT 1) AS vessel_nb_supplier_label,
    sales_rep_tenant.name AS sales_account_user_tenant_name,
    he.shipyard_company_id,
    v.ship_type_group AS vessel_ship_type_group,
    he.opportunity_litres
   FROM (((((((((((((((((((((((((((((((((((((((((((public.hull_events he
     LEFT JOIN public.vessels v ON ((v.id = he.vessel_id)))
     LEFT JOIN public.phrases p ON ((p.id = he.type_phrase_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS specification_count,
            bool_or((s.status = 'accepted'::text)) AS has_accepted_specification
           FROM public.specifications s
          WHERE (s.hull_event_id = he.id)) spec_summary ON (true))
     LEFT JOIN public.companies goc ON ((goc.id = v.group_owner_company_id)))
     LEFT JOIN public.companies gc_group ON ((gc_group.id = goc.group_company_id)))
     LEFT JOIN public.companies sgo ON ((sgo.id = he.snapshot_group_owner_company_id)))
     LEFT JOIN public.companies stm ON ((stm.id = he.snapshot_technical_manager_company_id)))
     LEFT JOIN public.companies sop ON ((sop.id = he.snapshot_operator_company_id)))
     LEFT JOIN public.companies ssm ON ((ssm.id = he.snapshot_ship_manager_company_id)))
     LEFT JOIN public.companies maker ON ((maker.id = he.supplier_this_hullevent_id)))
     LEFT JOIN public.companies dealer ON ((dealer.id = he.dealer_company_id)))
     LEFT JOIN LATERAL ( SELECT t.name AS team_name
           FROM (public.specifications s
             JOIN public.teams t ON ((t.id = s.team_id)))
          WHERE (s.hull_event_id = he.id)
          ORDER BY (s.status = 'accepted'::text) DESC, s.created_at DESC
         LIMIT 1) invoicing ON (true))
     LEFT JOIN public.hull_event_newbuilding_details nb ON ((nb.hull_event_id = he.id)))
     LEFT JOIN public.companies tmc ON ((tmc.id = v.technical_manager_company_id)))
     LEFT JOIN public.companies oc ON ((oc.id = v.operator_company_id)))
     LEFT JOIN public.companies smc ON ((smc.id = v.ship_manager_company_id)))
     LEFT JOIN public.companies tmc_group ON ((tmc_group.id = tmc.group_company_id)))
     LEFT JOIN public.companies oc_group ON ((oc_group.id = oc.group_company_id)))
     LEFT JOIN public.companies smc_group ON ((smc_group.id = smc.group_company_id)))
     LEFT JOIN public.countries goc_country ON ((goc_country.id = goc.country_id)))
     LEFT JOIN public.countries gc_group_country ON ((gc_group_country.id = gc_group.country_id)))
     LEFT JOIN public.countries tmc_country ON ((tmc_country.id = tmc.country_id)))
     LEFT JOIN public.countries tmc_group_country ON ((tmc_group_country.id = tmc_group.country_id)))
     LEFT JOIN public.countries oc_country ON ((oc_country.id = oc.country_id)))
     LEFT JOIN public.countries oc_group_country ON ((oc_group_country.id = oc_group.country_id)))
     LEFT JOIN public.countries sgo_country ON ((sgo_country.id = sgo.country_id)))
     LEFT JOIN public.countries stm_country ON ((stm_country.id = stm.country_id)))
     LEFT JOIN public.countries sop_country ON ((sop_country.id = sop.country_id)))
     LEFT JOIN public.countries ssm_country ON ((ssm_country.id = ssm.country_id)))
     LEFT JOIN public.countries smc_country ON ((smc_country.id = smc.country_id)))
     LEFT JOIN public.countries smc_group_country ON ((smc_group_country.id = smc_group.country_id)))
     LEFT JOIN public.companies cust ON ((cust.id = he.customer_company_id)))
     LEFT JOIN public.countries cust_country ON ((cust_country.id = cust.country_id)))
     LEFT JOIN public.antifouling_products vaf ON ((vaf.id = he.vertical_af_product_id)))
     LEFT JOIN public.antifouling_products faf ON ((faf.id = he.flat_bottom_af_product_id)))
     LEFT JOIN public.users sales_rep ON ((sales_rep.id = he.sales_account_user_id)))
     LEFT JOIN public.teams sales_rep_tenant ON ((sales_rep_tenant.id = sales_rep.default_team_id)))
     LEFT JOIN public.companies fp ON ((fp.id = he.facilitating_partner_company_id)))
     LEFT JOIN public.antifouling_products voff ON ((voff.id = he.vertical_offered_af_product_id)))
     LEFT JOIN public.antifouling_products foff ON ((foff.id = he.flat_bottom_offered_af_product_id)))
     LEFT JOIN public.countries loc_country ON ((loc_country.id = he.location_country_id)))
     LEFT JOIN public.companies shipyard ON ((shipyard.id = he.shipyard_company_id)))
     LEFT JOIN public.newbuilding_projects np ON ((np.id = he.newbuilding_project_id)));

REVOKE ALL ON TABLE public.hull_events_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.hull_events_overview TO authenticated;
GRANT ALL ON TABLE public.hull_events_overview TO service_role;

CREATE VIEW public.specifications_overview WITH (security_invoker='true') AS
 SELECT s.id,
    s.specification_number,
    s.version,
    s.status,
    s.specification_date,
    t.name AS team_name,
    v.name AS vessel_name,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'specifications'::text) AND (a.entity_id = s.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'specifications'::text) AND (conv.anchor_id = s.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    s.hull_event_id,
    s.delivery_date,
    s.sales_account_user_id,
    s.assigned_team_id,
    s.net_sales,
    s.vessel_id,
    s.hull_event_type_code,
    s.lost_reason
   FROM ((public.specifications s
     LEFT JOIN public.teams t ON ((t.id = s.team_id)))
     LEFT JOIN public.vessels v ON ((v.id = s.vessel_id)));

REVOKE ALL ON TABLE public.specifications_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.specifications_overview TO authenticated;
GRANT ALL ON TABLE public.specifications_overview TO service_role;

CREATE VIEW public.orders_overview WITH (security_invoker='true') AS
 SELECT o.id,
    o.order_number,
    o.status_phrase_id,
    ph.code AS status_code,
    ph.text_en AS status_label,
    o.requested_date,
    o.customer_po_number,
    o.external_order_reference,
    o.mof_printed_at,
    o.mof_sent_at,
    o.sales_account_user_id,
    o.assigned_team_id,
    o.created_at,
    t.name AS team_name,
    v.name AS vessel_name,
    sup.name AS supplier_name,
    o.customer_name,
    s.specification_number,
    s.version AS specification_version,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'orders'::text) AND (a.entity_id = o.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'orders'::text) AND (conv.anchor_id = o.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    o.supplier_id,
    o.hull_event_id
   FROM (((((public.orders o
     LEFT JOIN public.phrases ph ON ((ph.id = o.status_phrase_id)))
     LEFT JOIN public.teams t ON ((t.id = o.team_id)))
     LEFT JOIN public.vessels v ON ((v.id = o.vessel_id)))
     LEFT JOIN public.companies sup ON ((sup.id = o.supplier_id)))
     LEFT JOIN public.specifications s ON ((s.id = o.specification_id)))
  WHERE (o.deleted_at IS NULL);

REVOKE ALL ON TABLE public.orders_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.orders_overview TO authenticated;
GRANT ALL ON TABLE public.orders_overview TO service_role;

CREATE VIEW public.deals_overview WITH (security_invoker='true') AS
 SELECT o.id,
    'order'::text AS kind,
    o.order_number AS deal_number,
    s.specification_number,
    s.version AS specification_version,
    COALESCE(
        CASE
            WHEN (s.hull_event_id IS NOT NULL) THEN s.hull_event_type_code
            ELSE NULL::text
        END, het.code, 'OTHER'::text) AS deal_type,
    ph.code AS status_code,
    ph.text_en AS status_label,
    v.name AS vessel_name,
    o.customer_name,
    t.name AS team_name,
    sup.name AS supplier_name,
    o.responsible_user_id,
    ru.name AS responsible_user_name,
    o.sales_account_user_id,
    ( SELECT sum(((ol.sales_price * ((1)::numeric - (COALESCE(ol.discount_pct, (0)::numeric) / (100)::numeric))) * ol.ordered_qty)) AS sum
           FROM public.order_lines ol
          WHERE (ol.order_id = o.id)) AS amount,
    o.currency,
    o.requested_date AS deal_date,
    o.created_at,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'orders'::text) AND (a.entity_id = o.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'orders'::text) AND (conv.anchor_id = o.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    o.supplier_id,
    o.hull_event_id,
    o.vessel_id,
    o.assigned_team_id,
    (o.id IN ( SELECT r.entity_id
           FROM public.my_unread_records() r(entity_type, entity_id, via)
          WHERE ((r.via = 'notes'::text) AND (r.entity_type = 'orders'::text)))) AS has_unread_notes,
    ((o.id IN ( SELECT r.entity_id
           FROM public.my_unread_records() r(entity_type, entity_id, via)
          WHERE ((r.via = 'emails'::text) AND (r.entity_type = 'orders'::text)))) OR (o.specification_id IN ( SELECT r.entity_id
           FROM public.my_unread_records() r(entity_type, entity_id, via)
          WHERE ((r.via = 'emails'::text) AND (r.entity_type = 'specifications'::text))))) AS has_unread_emails,
    o.customer_company_id,
    s.request_received_at,
    s.sent_at,
    o.invoiced_at
   FROM ((((((((public.orders o
     LEFT JOIN public.specifications s ON ((s.id = o.specification_id)))
     LEFT JOIN public.hull_events he ON ((he.id = o.hull_event_id)))
     LEFT JOIN public.phrases het ON ((het.id = he.type_phrase_id)))
     LEFT JOIN public.phrases ph ON ((ph.id = o.status_phrase_id)))
     LEFT JOIN public.teams t ON ((t.id = o.team_id)))
     LEFT JOIN public.vessels v ON ((v.id = o.vessel_id)))
     LEFT JOIN public.companies sup ON ((sup.id = o.supplier_id)))
     LEFT JOIN public.users ru ON ((ru.id = o.responsible_user_id)))
  WHERE (o.deleted_at IS NULL)
UNION ALL
 SELECT s.id,
    'offer'::text AS kind,
    s.specification_number AS deal_number,
    s.specification_number,
    s.version AS specification_version,
        CASE
            WHEN (s.hull_event_id IS NULL) THEN 'OTHER'::text
            ELSE 'SS'::text
        END AS deal_type,
    s.status AS status_code,
        CASE s.status
            WHEN 'draft'::text THEN 'Draft'::text
            WHEN 'under_review'::text THEN 'Under review'::text
            WHEN 'approved'::text THEN 'Approved'::text
            WHEN 'accepted'::text THEN 'Accepted'::text
            WHEN 'lost'::text THEN 'Lost'::text
            ELSE s.status
        END AS status_label,
    v.name AS vessel_name,
    s.customer_name,
    t.name AS team_name,
    sup.name AS supplier_name,
    s.responsible_user_id,
    ru.name AS responsible_user_name,
    s.sales_account_user_id,
    s.net_sales AS amount,
    s.currency,
    s.delivery_date AS deal_date,
    s.created_at,
    (EXISTS ( SELECT 1
           FROM public.attachments a
          WHERE ((a.entity_type = 'specifications'::text) AND (a.entity_id = s.id)))) AS has_attachments,
    (EXISTS ( SELECT 1
           FROM public.conversations conv
          WHERE ((conv.anchor_type = 'specifications'::text) AND (conv.anchor_id = s.id) AND (conv.last_message_at IS NOT NULL)))) AS has_messages,
    s.supplier_id,
    s.hull_event_id,
    s.vessel_id,
    s.assigned_team_id,
    (s.id IN ( SELECT r.entity_id
           FROM public.my_unread_records() r(entity_type, entity_id, via)
          WHERE ((r.via = 'notes'::text) AND (r.entity_type = 'specifications'::text)))) AS has_unread_notes,
    (s.id IN ( SELECT r.entity_id
           FROM public.my_unread_records() r(entity_type, entity_id, via)
          WHERE ((r.via = 'emails'::text) AND (r.entity_type = 'specifications'::text)))) AS has_unread_emails,
    s.customer_company_id,
    s.request_received_at,
    s.sent_at,
    NULL::timestamp with time zone AS invoiced_at
   FROM ((((public.specifications s
     LEFT JOIN public.teams t ON ((t.id = s.team_id)))
     LEFT JOIN public.vessels v ON ((v.id = s.vessel_id)))
     LEFT JOIN public.companies sup ON ((sup.id = s.supplier_id)))
     LEFT JOIN public.users ru ON ((ru.id = s.responsible_user_id)))
  WHERE (((s.hull_event_id IS NULL) OR (s.hull_event_type_code = 'SS'::text)) AND (NOT (EXISTS ( SELECT 1
           FROM public.specifications s2
          WHERE ((s2.specification_number = s.specification_number) AND (s2.version > s.version))))) AND (NOT (EXISTS ( SELECT 1
           FROM (public.orders o2
             JOIN public.specifications s3 ON ((s3.id = o2.specification_id)))
          WHERE ((s3.specification_number = s.specification_number) AND (o2.deleted_at IS NULL))))));

REVOKE ALL ON TABLE public.deals_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.deals_overview TO authenticated;
GRANT ALL ON TABLE public.deals_overview TO service_role;

CREATE FUNCTION public.hull_events_list(p_company uuid[]) RETURNS SETOF public.hull_events_overview
    LANGUAGE plpgsql STABLE
    AS $$
declare
  v_ids uuid[];
begin
  v_ids := array(
    select he.id from public.hull_events he where he.snapshot_group_owner_company_id = any(p_company)
    union select he.id from public.hull_events he where he.snapshot_ship_manager_company_id = any(p_company)
    union select he.id from public.hull_events he where he.snapshot_technical_manager_company_id = any(p_company)
    union select he.id from public.hull_events he where he.snapshot_operator_company_id = any(p_company)
    union select he.id from public.hull_events he where he.customer_company_id = any(p_company)
    union select he.id from public.hull_events he where he.shipyard_company_id = any(p_company)
    union select he.id from public.hull_events he where he.dealer_company_id = any(p_company)
    union select he.id from public.hull_events he where he.facilitating_partner_company_id = any(p_company)
    union select he.id from public.hull_events he where he.supplier_this_hullevent_id = any(p_company)
    union select he.id from public.hull_events he
      join public.vessels v on v.id = he.vessel_id
      join public.companies goc on goc.id = v.group_owner_company_id
      where goc.group_company_id = any(p_company));
  return query
  select ho.* from public.hull_events_overview ho where ho.id = any(v_ids);
end;
$$;

REVOKE ALL ON FUNCTION public.hull_events_list(p_company uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hull_events_list(p_company uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hull_events_list(p_company uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.hull_events_list(p_company uuid[]) TO service_role;

-- Hand-written part of the offers slice.

-- Permissions of specifications and orders (scopes own / team / account / all, no admin overrule).
insert into public.permissions (key, module, action, scope, sort_order)
select m || '.' || a || '.' || s, m, a, s, 500 + row_number() over ()
from (values ('specifications'), ('orders')) mm(m), (values ('view'), ('edit'), ('create'), ('delete'), ('approve')) aa(a), (values ('own'), ('team'), ('account'), ('all')) ss(s)
where not (a in ('create', 'delete') and s = 'account')
  and not (a = 'approve' and s = 'account')
  and not (m = 'orders' and a = 'delete');
insert into public.permission_implies (permission, implies)
select m || '.' || a || '.' || s, m || '.view.' || s
from (values ('specifications'), ('orders')) mm(m), (values ('edit'), ('create'), ('delete'), ('approve')) aa(a), (values ('own'), ('team'), ('account'), ('all')) ss(s)
where exists (select 1 from public.permissions p where p.key = m || '.' || a || '.' || s);

create function public.specifications_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.specifications_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, public.access_context_for(p_user_id)); $$;
create function public.orders_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.orders_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, public.access_context_for(p_user_id)); $$;
create function public.specifications_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select s.specification_number from public.specifications s where s.id = p_entity_id; $$;
create function public.orders_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select o.order_number from public.orders o where o.id = p_entity_id; $$;
revoke all on function public.specifications_access(uuid, uuid, text), public.orders_access(uuid, uuid, text),
  public.specifications_label(uuid), public.orders_label(uuid) from public, anon, authenticated;
grant execute on function public.specifications_access(uuid, uuid, text), public.orders_access(uuid, uuid, text),
  public.specifications_label(uuid), public.orders_label(uuid) to authenticated, service_role;
create function public.specifications_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable set search_path to '' as $$ select public.specifications_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, p_ctx); $$;
create function public.orders_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable set search_path to '' as $$ select public.orders_row_allows(case when p_action = 'check' then 'view' else p_action end, p_entity_id, p_ctx); $$;
grant execute on function public.specifications_ctx_allows(text, uuid, public.access_context), public.orders_ctx_allows(text, uuid, public.access_context) to authenticated, service_role;
select public.entity_type_register('specifications', 'specifications', 'specifications_access', 'specifications_ctx_allows', 'A specification / offer', 'specifications_label');
select public.entity_type_register('orders', 'orders', 'orders_access', 'orders_ctx_allows', 'An order', 'orders_label');

select public.notification_type_register('handover', 'specifications', true, 'A specification or order was handed over to you');

-- hand_over(): NPM version rewritten for the platform messaging (record conversation, record_follow, notify).
create function public.hand_over(p_entity_type text, p_entity_id uuid, p_to_user_id uuid, p_reason text, p_note text default null) returns void
  language plpgsql security definer set search_path to ''
  as $$
declare
  v_caller uuid := auth.uid();
  v_current uuid;
  v_number text;
  v_link text;
  v_to_name text;
  v_from_name text;
  v_conversation uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_caller is null then raise exception 'Not signed in'; end if;
  if p_entity_type = 'specifications' then
    select responsible_user_id, specification_number into v_current, v_number from public.specifications where id = p_entity_id;
    v_link := '/specifications/' || p_entity_id;
  elsif p_entity_type = 'orders' then
    select responsible_user_id, order_number into v_current, v_number from public.orders where id = p_entity_id;
    v_link := '/orders/' || p_entity_id;
  else
    raise exception 'Unsupported entity type %', p_entity_type;
  end if;
  if v_number is null then raise exception 'Record not found'; end if;
  if not (public.can_access_entity(p_entity_type, p_entity_id, 'edit') or coalesce(v_current = v_caller, false)) then
    raise exception 'You are not allowed to hand this over';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p_to_user_id is not distinct from v_current then raise exception 'The record is already with this person'; end if;
  if not exists (select 1 from public.users u where u.id = p_to_user_id and u.has_login)
     or not public.user_has_access(p_to_user_id, p_entity_type, p_entity_id, 'edit') then
    raise exception 'This person cannot work on the record';
  end if;

  perform set_config('app.handover', 'on', true);
  if p_entity_type = 'specifications' then
    update public.specifications set responsible_user_id = p_to_user_id where id = p_entity_id;
  else
    update public.orders set responsible_user_id = p_to_user_id where id = p_entity_id;
  end if;
  perform set_config('app.handover', 'off', true);

  insert into public.handovers (entity_type, entity_id, from_user_id, to_user_id, reason, note)
  values (p_entity_type, p_entity_id, v_caller, p_to_user_id, trim(p_reason), v_note);

  select coalesce(name, email) into v_to_name from public.users where id = p_to_user_id;
  select coalesce(name, email, 'Someone') into v_from_name from public.users where id = v_caller;
  v_conversation := public.conversation_get_or_create(p_entity_type, p_entity_id);
  -- The person who hands over stops following the record's notes; the new responsible person follows again.
  if v_current is not null then
    perform public.record_follow(p_entity_type, p_entity_id, v_current, 'mute');
    update public.notifications set read_at = now()
    where user_id = v_current and read_at is null and entity_type = p_entity_type and entity_id = p_entity_id;
  end if;
  perform public.record_follow(p_entity_type, p_entity_id, p_to_user_id, 'all');
  -- The trail in the notes (plain name, no mention: the recipient gets the dedicated notification below).
  insert into public.messages (conversation_id, author_user_id, body)
  values (v_conversation, v_caller, 'Handed over to ' || v_to_name || ' - ' || trim(p_reason) || case when v_note is null then '' else E'\n' || v_note end);

  perform public.notify(
    array[p_to_user_id], 'handover', v_from_name || ' handed ' || v_number || ' over to you', v_link,
    trim(p_reason) || case when v_note is null then '' else ': ' || v_note end,
    v_caller, p_entity_type, p_entity_id, 'handover:' || p_entity_id, array['in_app', 'push', 'toast', 'email']);
end;
$$;
revoke all on function public.hand_over(text, uuid, uuid, text, text) from public, anon;
grant execute on function public.hand_over(text, uuid, uuid, text, text) to authenticated, service_role;

