-- NPM products slice (WP 2): products, packagings, costs, coefficients, mix components, overcoating, antifouling products.
-- Source: NPM database, copied 1:1.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    name2 text,
    name3 text,
    production_code text,
    colour text,
    category_phrase_id uuid,
    group_phrase_id uuid,
    default_thinner_product_id uuid,
    is_mix boolean DEFAULT false NOT NULL,
    solids_volume_pct numeric,
    dry_film_thickness_um numeric,
    gravity numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    default_thinner_pct numeric DEFAULT 10 NOT NULL,
    CONSTRAINT products_default_thinner_pct_check CHECK (((default_thinner_pct > (0)::numeric) AND (default_thinner_pct <= (100)::numeric)))
);

REVOKE ALL ON TABLE public.products FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;

CREATE TABLE public.product_packagings (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    product_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    pack_size numeric NOT NULL,
    unit text NOT NULL,
    supplier_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    supply_country_id uuid
);

REVOKE ALL ON TABLE public.product_packagings FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_packagings TO authenticated;
GRANT ALL ON TABLE public.product_packagings TO service_role;

CREATE TABLE public.product_costs (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    product_packaging_id uuid NOT NULL,
    cost_price numeric NOT NULL,
    valid_from date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid
);

REVOKE ALL ON TABLE public.product_costs FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_costs TO authenticated;
GRANT ALL ON TABLE public.product_costs TO service_role;

CREATE TABLE public.product_coefficients (
    product_id uuid NOT NULL,
    polishing_rate numeric,
    speed_curve_id uuid,
    temperature_curve_id uuid,
    max_service_life_months numeric,
    flat_bottom_derate_pct numeric,
    boottop_derate_pct numeric,
    minimum_dft_um numeric,
    maximum_dft_per_coat_um numeric,
    anchoring_dft_um numeric,
    anchoring_sea_days_threshold numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.product_coefficients FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_coefficients TO authenticated;
GRANT ALL ON TABLE public.product_coefficients TO service_role;

CREATE TABLE public.coefficient_curves (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    kind text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);

REVOKE ALL ON TABLE public.coefficient_curves FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.coefficient_curves TO authenticated;
GRANT ALL ON TABLE public.coefficient_curves TO service_role;

CREATE TABLE public.coefficient_points (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    curve_id uuid NOT NULL,
    x_value numeric NOT NULL,
    coefficient numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.coefficient_points FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.coefficient_points TO authenticated;
GRANT ALL ON TABLE public.coefficient_points TO service_role;

CREATE TABLE public.product_mix_components (
    mix_product_id uuid NOT NULL,
    component_product_id uuid NOT NULL,
    parts_volumetric numeric,
    parts_gravimetric numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    type text NOT NULL,
    supplier_id uuid NOT NULL,
    CONSTRAINT product_mix_components_type_check CHECK ((type = ANY (ARRAY['base'::text, 'hardener'::text])))
);

REVOKE ALL ON TABLE public.product_mix_components FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_mix_components TO authenticated;
GRANT ALL ON TABLE public.product_mix_components TO service_role;

CREATE TABLE public.product_overcoating_intervals (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    product_id uuid NOT NULL,
    overcoated_with_product_id uuid,
    supplier_id uuid NOT NULL,
    interval_type text DEFAULT 'overcoat'::text NOT NULL,
    dry_film_thickness_minimum_um numeric,
    dry_film_thickness_maximum_um numeric,
    temperature_celsius numeric NOT NULL,
    minimum_value numeric,
    minimum_unit text,
    maximum_value numeric,
    maximum_unit text,
    no_maximum boolean DEFAULT false NOT NULL,
    interval_text_override text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_overcoating_intervals_interval_type_check CHECK ((interval_type = ANY (ARRAY['overcoat'::text, 'undocking'::text]))),
    CONSTRAINT product_overcoating_intervals_pair_shape CHECK ((((interval_type = 'overcoat'::text) AND (overcoated_with_product_id IS NOT NULL)) OR ((interval_type = 'undocking'::text) AND (overcoated_with_product_id IS NULL))))
);

REVOKE ALL ON TABLE public.product_overcoating_intervals FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_overcoating_intervals TO authenticated;
GRANT ALL ON TABLE public.product_overcoating_intervals TO service_role;

CREATE TABLE public.antifouling_products (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    supplier_id uuid NOT NULL,
    name text NOT NULL,
    name_normalized text GENERATED ALWAYS AS (regexp_replace(lower(name), '[^a-z0-9]'::text, ''::text, 'g'::text)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT antifouling_products_name_check CHECK ((btrim(name) <> ''::text))
);

REVOKE ALL ON TABLE public.antifouling_products FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.antifouling_products TO authenticated;
GRANT ALL ON TABLE public.antifouling_products TO service_role;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_code_key UNIQUE (code);

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

CREATE INDEX products_category_phrase_id_idx ON public.products USING btree (category_phrase_id);

CREATE INDEX products_code_trgm_idx ON public.products USING gin (code extensions.gin_trgm_ops);

CREATE INDEX products_created_by_user_id_idx ON public.products USING btree (created_by_user_id);

CREATE INDEX products_default_thinner_product_id_idx ON public.products USING btree (default_thinner_product_id);

CREATE INDEX products_group_phrase_id_idx ON public.products USING btree (group_phrase_id);

CREATE INDEX products_name_trgm_idx ON public.products USING gin (name extensions.gin_trgm_ops);

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_supplier_key_key UNIQUE (supplier_key);

CREATE INDEX product_packagings_created_by_user_id_idx ON public.product_packagings USING btree (created_by_user_id);

CREATE INDEX product_packagings_product_id_idx ON public.product_packagings USING btree (product_id);

CREATE INDEX product_packagings_supplier_id_idx ON public.product_packagings USING btree (supplier_id);

CREATE INDEX product_packagings_supply_country_id_idx ON public.product_packagings USING btree (supply_country_id);

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_pkey PRIMARY KEY (id);

CREATE INDEX product_costs_created_by_user_id_idx ON public.product_costs USING btree (created_by_user_id);

CREATE INDEX product_costs_product_packaging_id_valid_from_idx ON public.product_costs USING btree (product_packaging_id, valid_from);

ALTER TABLE ONLY public.product_coefficients
    ADD CONSTRAINT product_coefficients_pkey PRIMARY KEY (product_id);

CREATE INDEX product_coefficients_speed_curve_id_idx ON public.product_coefficients USING btree (speed_curve_id);

CREATE INDEX product_coefficients_temperature_curve_id_idx ON public.product_coefficients USING btree (temperature_curve_id);

ALTER TABLE ONLY public.coefficient_curves
    ADD CONSTRAINT coefficient_curves_pkey PRIMARY KEY (id);

CREATE INDEX coefficient_curves_company_id_idx ON public.coefficient_curves USING btree (company_id);

CREATE INDEX coefficient_curves_kind_idx ON public.coefficient_curves USING btree (kind);

ALTER TABLE ONLY public.coefficient_points
    ADD CONSTRAINT coefficient_points_curve_id_x_value_key UNIQUE (curve_id, x_value);

ALTER TABLE ONLY public.coefficient_points
    ADD CONSTRAINT coefficient_points_pkey PRIMARY KEY (id);

CREATE INDEX coefficient_points_curve_id_idx ON public.coefficient_points USING btree (curve_id);

ALTER TABLE ONLY public.product_mix_components
    ADD CONSTRAINT product_mix_components_pkey PRIMARY KEY (mix_product_id, component_product_id, supplier_id);

CREATE INDEX product_mix_components_component_product_id_idx ON public.product_mix_components USING btree (component_product_id);

CREATE INDEX product_mix_components_supplier_id_idx ON public.product_mix_components USING btree (supplier_id);

ALTER TABLE ONLY public.product_overcoating_intervals
    ADD CONSTRAINT product_overcoating_intervals_pkey PRIMARY KEY (id);

CREATE INDEX product_overcoating_intervals_overcoated_with_product_id_idx ON public.product_overcoating_intervals USING btree (overcoated_with_product_id);

CREATE INDEX product_overcoating_intervals_product_id_idx ON public.product_overcoating_intervals USING btree (product_id);

CREATE INDEX product_overcoating_intervals_supplier_id_idx ON public.product_overcoating_intervals USING btree (supplier_id);

CREATE UNIQUE INDEX product_overcoating_intervals_unique_key ON public.product_overcoating_intervals USING btree (product_id, COALESCE(overcoated_with_product_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id, interval_type, COALESCE(dry_film_thickness_minimum_um, ('-1'::integer)::numeric), COALESCE(dry_film_thickness_maximum_um, ('-1'::integer)::numeric), temperature_celsius);

ALTER TABLE ONLY public.antifouling_products
    ADD CONSTRAINT antifouling_products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.antifouling_products
    ADD CONSTRAINT antifouling_products_supplier_id_id_key UNIQUE (supplier_id, id);

CREATE INDEX antifouling_products_created_by_user_id_idx ON public.antifouling_products USING btree (created_by_user_id);

CREATE UNIQUE INDEX antifouling_products_supplier_name_key ON public.antifouling_products USING btree (supplier_id, name_normalized);

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_phrase_id_fkey FOREIGN KEY (category_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_default_thinner_product_id_fkey FOREIGN KEY (default_thinner_product_id) REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_group_phrase_id_fkey FOREIGN KEY (group_phrase_id) REFERENCES public.phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_supply_country_id_fkey FOREIGN KEY (supply_country_id) REFERENCES public.countries(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_packagings
    ADD CONSTRAINT product_packagings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_product_packaging_id_fkey FOREIGN KEY (product_packaging_id) REFERENCES public.product_packagings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.product_coefficients
    ADD CONSTRAINT product_coefficients_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_coefficients
    ADD CONSTRAINT product_coefficients_speed_curve_id_fkey FOREIGN KEY (speed_curve_id) REFERENCES public.coefficient_curves(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_coefficients
    ADD CONSTRAINT product_coefficients_temperature_curve_id_fkey FOREIGN KEY (temperature_curve_id) REFERENCES public.coefficient_curves(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.coefficient_curves
    ADD CONSTRAINT coefficient_curves_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.coefficient_points
    ADD CONSTRAINT coefficient_points_curve_id_fkey FOREIGN KEY (curve_id) REFERENCES public.coefficient_curves(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_mix_components
    ADD CONSTRAINT product_mix_components_component_product_id_fkey FOREIGN KEY (component_product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_mix_components
    ADD CONSTRAINT product_mix_components_mix_product_id_fkey FOREIGN KEY (mix_product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_mix_components
    ADD CONSTRAINT product_mix_components_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.product_overcoating_intervals
    ADD CONSTRAINT product_overcoating_intervals_overcoated_with_product_id_fkey FOREIGN KEY (overcoated_with_product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_overcoating_intervals
    ADD CONSTRAINT product_overcoating_intervals_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_overcoating_intervals
    ADD CONSTRAINT product_overcoating_intervals_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.antifouling_products
    ADD CONSTRAINT antifouling_products_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.antifouling_products
    ADD CONSTRAINT antifouling_products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.antifouling_products
    ADD CONSTRAINT antifouling_products_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.import_product_costs(p_valid_from date, p_items jsonb) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  update public.product_costs c set cost_price = t.cost_price
  from jsonb_to_recordset(p_items) as t(product_packaging_id uuid, cost_price numeric, supply_country_id uuid)
  where t.cost_price is not null and c.product_packaging_id = t.product_packaging_id and c.valid_from = p_valid_from;

  insert into public.product_costs (product_packaging_id, cost_price, valid_from)
  select t.product_packaging_id, t.cost_price, p_valid_from
  from jsonb_to_recordset(p_items) as t(product_packaging_id uuid, cost_price numeric, supply_country_id uuid)
  where t.cost_price is not null
    and not exists (select 1 from public.product_costs c
                    where c.product_packaging_id = t.product_packaging_id and c.valid_from = p_valid_from);

  update public.product_packagings p set supply_country_id = t.supply_country_id
  from jsonb_to_recordset(p_items) as t(product_packaging_id uuid, cost_price numeric, supply_country_id uuid)
  where t.supply_country_id is not null and p.id = t.product_packaging_id;

  return (select count(*)::integer
          from jsonb_to_recordset(p_items) as t(product_packaging_id uuid, cost_price numeric, supply_country_id uuid)
          where t.cost_price is not null);
end;
$$;

REVOKE ALL ON FUNCTION public.import_product_costs(p_valid_from date, p_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.import_product_costs(p_valid_from date, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_product_costs(p_valid_from date, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.import_product_costs(p_valid_from date, p_items jsonb) TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create products per literal" ON public.products FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('products.create'::text) AS rls_has));

CREATE POLICY "Delete products per literal" ON public.products FOR DELETE TO authenticated USING (( SELECT public.rls_has('products.delete'::text) AS rls_has));

CREATE POLICY "Edit products per literal" ON public.products FOR UPDATE TO authenticated USING (( SELECT public.rls_has('products.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('products.edit'::text) AS rls_has));

CREATE POLICY "Signed-in users read products" ON public.products FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.products AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.product_packagings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read product packagings" ON public.product_packagings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Write product packagings per products.edit" ON public.product_packagings TO authenticated USING (( SELECT public.rls_has('products.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('products.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.product_packagings AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_packagings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read product costs" ON public.product_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Write product costs per products.edit" ON public.product_costs TO authenticated USING (( SELECT public.rls_has('products.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('products.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.product_costs AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_costs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.product_coefficients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read product coefficients" ON public.product_coefficients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins manage product coefficients" ON public.product_coefficients TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY mfa_required ON public.product_coefficients AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_coefficients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coefficient_curves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read coefficient curves" ON public.coefficient_curves FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins manage coefficient curves" ON public.coefficient_curves TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY mfa_required ON public.coefficient_curves AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.coefficient_curves FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.coefficient_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read coefficient points" ON public.coefficient_points FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins manage coefficient points" ON public.coefficient_points TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY mfa_required ON public.coefficient_points AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.coefficient_points FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_mix_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read product mix components" ON public.product_mix_components FOR SELECT TO authenticated USING (true);

CREATE POLICY "Write product mix components per products.edit" ON public.product_mix_components TO authenticated USING (( SELECT public.rls_has('products.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('products.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.product_mix_components AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.product_overcoating_intervals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read product overcoating intervals" ON public.product_overcoating_intervals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Write product overcoating intervals per products.edit" ON public.product_overcoating_intervals TO authenticated USING (( SELECT public.rls_has('products.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('products.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.product_overcoating_intervals AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_overcoating_intervals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.antifouling_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can delete antifouling products" ON public.antifouling_products FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update antifouling products" ON public.antifouling_products FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Authenticated users can add antifouling products" ON public.antifouling_products FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read antifouling products" ON public.antifouling_products FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.antifouling_products AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.antifouling_products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE VIEW public.product_packagings_overview WITH (security_invoker='true') AS
 SELECT pp.id,
    pp.product_id,
    pp.supplier_id,
    pp.pack_size,
    pp.unit,
    pr.code AS product_code,
    pr.name AS product_name,
    pr.colour,
    pr.solids_volume_pct,
    pr.dry_film_thickness_um,
    latest_cost.cost_price AS latest_cost_price,
    gp.code AS product_group_code
   FROM (((public.product_packagings pp
     LEFT JOIN public.products pr ON ((pr.id = pp.product_id)))
     LEFT JOIN public.phrases gp ON ((gp.id = pr.group_phrase_id)))
     LEFT JOIN LATERAL ( SELECT pc.cost_price
           FROM public.product_costs pc
          WHERE (pc.product_packaging_id = pp.id)
          ORDER BY pc.valid_from DESC
         LIMIT 1) latest_cost ON (true));

REVOKE ALL ON TABLE public.product_packagings_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.product_packagings_overview TO authenticated;
GRANT ALL ON TABLE public.product_packagings_overview TO service_role;

-- Permissions of the products module (open reads, writes per literal; covers packagings and costs).
insert into public.permissions (key, module, action, scope, sort_order) values
  ('products.edit', 'products', 'edit', null, 410),
  ('products.create', 'products', 'create', null, 411),
  ('products.delete', 'products', 'delete', null, 412);
select public.activity_label_register('products', 'products', 'name', 'products');

