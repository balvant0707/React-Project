-- Items (module items): COMPASS items (spare parts, consumables), suppliers and prices, stock locations, balances and
-- movements, material lines of tasks and series, ordering tasks (workflow hook items_order_finished), the items of an
-- asset, item and stock reminders, the maintenance statistics (costs, material). Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the items module, before the objects copied from COMPASS.

-- Codes of stock locations (COMPASS sequence stock_location_code_seq and its grants).
create sequence public.stock_location_code_seq;
grant all on sequence public.stock_location_code_seq to authenticated, service_role;

-- The columns the tasks module and task-family cut, back as COMPASS has them: how a task type handles items (none, use =
-- material lines, order = an ordering task), the item reminder switch of the profile.
alter table public.task_types
  add column item_mode text default 'none'::text not null,
  add constraint task_types_item_mode_check check ((item_mode = any (array['none'::text, 'use'::text, 'order'::text])));
alter table public.notification_preferences add column remind_items boolean default true not null;
grant select (remind_items), insert (remind_items), update (remind_items) on public.notification_preferences to authenticated;

-- task_create / task_create_finish get COMPASS's material lines argument back (recreated below with the new signature).
drop function public.task_create(uuid, text, date, text, text, uuid, text, uuid, uuid, uuid, uuid, boolean, boolean, boolean, uuid, text[]);
drop function public.task_create_finish(uuid, boolean, boolean, uuid, text[]);


CREATE TABLE public.suppliers (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    customer_number text,
    erp_supplier_number text,
    email text,
    phone text,
    website text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT suppliers_customer_number_check CHECK (((customer_number IS NULL) OR (length(customer_number) <= 60))),
    CONSTRAINT suppliers_email_check CHECK (((email IS NULL) OR (length(email) <= 200))),
    CONSTRAINT suppliers_erp_supplier_number_check CHECK (((erp_supplier_number IS NULL) OR (length(erp_supplier_number) <= 60))),
    CONSTRAINT suppliers_name_check CHECK (((length(name) >= 1) AND (length(name) <= 100))),
    CONSTRAINT suppliers_notes_check CHECK (((notes IS NULL) OR (length(notes) <= 2000))),
    CONSTRAINT suppliers_phone_check CHECK (((phone IS NULL) OR (length(phone) <= 60))),
    CONSTRAINT suppliers_website_check CHECK (((website IS NULL) OR (length(website) <= 300)))
);


ALTER TABLE public.suppliers OWNER TO postgres;

REVOKE ALL ON TABLE public.suppliers FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;

CREATE TABLE public.stock_locations (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    code text DEFAULT ('L'::text || lpad((nextval('public.stock_location_code_seq'::regclass))::text, 4, '0'::text)) NOT NULL,
    team_id uuid,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT stock_locations_code_check CHECK ((code ~ '^[A-Za-z0-9._-]{1,40}$'::text)),
    CONSTRAINT stock_locations_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT stock_locations_note_check CHECK (((note IS NULL) OR (length(note) <= 500)))
);


ALTER TABLE public.stock_locations OWNER TO postgres;

REVOKE ALL ON TABLE public.stock_locations FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.stock_locations TO authenticated;
GRANT ALL ON TABLE public.stock_locations TO service_role;

CREATE TABLE public.items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    item_number text NOT NULL,
    name text NOT NULL,
    category_phrase_id uuid,
    description text,
    manufacturer text,
    manufacturer_item_number text,
    supplier_id uuid,
    unit_phrase_id uuid,
    erp_item_number text,
    lead_time_days integer,
    is_critical boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    photo_attachment_id uuid,
    stock_managed boolean DEFAULT false NOT NULL,
    minimum_stock numeric(12,2),
    reorder_quantity numeric(12,2),
    default_stock_location_id uuid,
    CONSTRAINT items_description_check CHECK (((description IS NULL) OR (length(description) <= 2000))),
    CONSTRAINT items_erp_item_number_check CHECK (((erp_item_number IS NULL) OR (length(erp_item_number) <= 60))),
    CONSTRAINT items_item_number_check CHECK (((length(item_number) >= 1) AND (length(item_number) <= 60))),
    CONSTRAINT items_lead_time_days_check CHECK (((lead_time_days IS NULL) OR ((lead_time_days >= 0) AND (lead_time_days <= 730)))),
    CONSTRAINT items_manufacturer_check CHECK (((manufacturer IS NULL) OR (length(manufacturer) <= 120))),
    CONSTRAINT items_manufacturer_item_number_check CHECK (((manufacturer_item_number IS NULL) OR (length(manufacturer_item_number) <= 120))),
    CONSTRAINT items_minimum_stock_check CHECK (((minimum_stock IS NULL) OR (minimum_stock >= (0)::numeric))),
    CONSTRAINT items_minimum_stock_finite CHECK (((minimum_stock IS NULL) OR (minimum_stock <= (1000000000)::numeric))),
    CONSTRAINT items_name_check CHECK (((length(name) >= 1) AND (length(name) <= 200))),
    CONSTRAINT items_reorder_quantity_check CHECK (((reorder_quantity IS NULL) OR (reorder_quantity > (0)::numeric))),
    CONSTRAINT items_reorder_quantity_finite CHECK (((reorder_quantity IS NULL) OR (reorder_quantity <= (1000000000)::numeric))),
    CONSTRAINT items_stock_default_check CHECK (((NOT stock_managed) OR (default_stock_location_id IS NOT NULL)))
);


ALTER TABLE public.items OWNER TO postgres;

REVOKE ALL ON TABLE public.items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.items TO authenticated;
GRANT ALL ON TABLE public.items TO service_role;

CREATE TABLE public.item_prices (
    item_id uuid NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid,
    CONSTRAINT item_prices_unit_price_check CHECK ((unit_price >= (0)::numeric)),
    CONSTRAINT item_prices_unit_price_finite CHECK (((unit_price >= ('-1000000000000'::bigint)::numeric) AND (unit_price <= ('1000000000000'::bigint)::numeric)))
);


ALTER TABLE public.item_prices OWNER TO postgres;

REVOKE ALL ON TABLE public.item_prices FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.item_prices TO authenticated;
GRANT ALL ON TABLE public.item_prices TO service_role;

CREATE TABLE public.task_items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    task_id uuid NOT NULL,
    item_id uuid,
    description text,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_phrase_id uuid,
    supplier_id uuid,
    state text DEFAULT 'needed'::text NOT NULL,
    note text,
    purchase_task_id uuid,
    arrived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT task_items_description_check CHECK (((description IS NULL) OR ((length(description) >= 1) AND (length(description) <= 300)))),
    CONSTRAINT task_items_item_or_text CHECK (((item_id IS NULL) <> (description IS NULL))),
    CONSTRAINT task_items_note_check CHECK (((note IS NULL) OR (length(note) <= 500))),
    CONSTRAINT task_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT task_items_quantity_finite CHECK ((quantity <= (1000000000)::numeric)),
    CONSTRAINT task_items_state_check CHECK ((state = ANY (ARRAY['planned'::text, 'needed'::text, 'used'::text])))
);


ALTER TABLE public.task_items OWNER TO postgres;

REVOKE ALL ON TABLE public.task_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_items TO authenticated;
GRANT ALL ON TABLE public.task_items TO service_role;

CREATE TABLE public.stock_balances (
    item_id uuid NOT NULL,
    stock_location_id uuid NOT NULL,
    quantity numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_balances_finite CHECK (((quantity >= ('-1000000000'::integer)::numeric) AND (quantity <= (1000000000)::numeric)))
);


ALTER TABLE public.stock_balances OWNER TO postgres;

REVOKE ALL ON TABLE public.stock_balances FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.stock_balances TO service_role;
GRANT SELECT ON TABLE public.stock_balances TO authenticated;

CREATE TABLE public.stock_movements (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    seq bigint NOT NULL,
    item_id uuid NOT NULL,
    stock_location_id uuid NOT NULL,
    quantity numeric(12,2) NOT NULL,
    kind text NOT NULL,
    task_id uuid,
    task_item_id uuid,
    transfer_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT stock_movements_finite CHECK (((quantity >= ('-1000000000'::integer)::numeric) AND (quantity <= (1000000000)::numeric))),
    CONSTRAINT stock_movements_kind_check CHECK ((kind = ANY (ARRAY['opening'::text, 'receipt'::text, 'issue'::text, 'return'::text, 'correction'::text, 'count'::text, 'transfer'::text]))),
    CONSTRAINT stock_movements_note_check CHECK (((note IS NULL) OR (length(note) <= 500))),
    CONSTRAINT stock_movements_quantity_check CHECK (((quantity <> (0)::numeric) OR (kind = 'count'::text)))
);


ALTER TABLE public.stock_movements OWNER TO postgres;

REVOKE ALL ON TABLE public.stock_movements FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.stock_movements TO service_role;
GRANT SELECT ON TABLE public.stock_movements TO authenticated;

CREATE TABLE public.stock_alert_log (
    item_id uuid NOT NULL,
    sent_on date NOT NULL
);


ALTER TABLE public.stock_alert_log OWNER TO postgres;

REVOKE ALL ON TABLE public.stock_alert_log FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.stock_alert_log TO service_role;

CREATE TABLE public.task_type_item_categories (
    task_type_id uuid NOT NULL,
    category_phrase_id uuid NOT NULL
);


ALTER TABLE public.task_type_item_categories OWNER TO postgres;

REVOKE ALL ON TABLE public.task_type_item_categories FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_type_item_categories TO authenticated;
GRANT ALL ON TABLE public.task_type_item_categories TO service_role;

CREATE TABLE public.recurring_task_rule_items (
    recurring_task_rule_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    CONSTRAINT recurring_task_rule_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT recurring_task_rule_items_quantity_finite CHECK (((quantity >= ('-1000000000000'::bigint)::numeric) AND (quantity <= ('1000000000000'::bigint)::numeric)))
);


ALTER TABLE public.recurring_task_rule_items OWNER TO postgres;

REVOKE ALL ON TABLE public.recurring_task_rule_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.recurring_task_rule_items TO authenticated;
GRANT ALL ON TABLE public.recurring_task_rule_items TO service_role;

CREATE TABLE public.asset_items (
    asset_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity_installed numeric(10,2) DEFAULT 1 NOT NULL,
    position_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT asset_items_position_note_check CHECK (((position_note IS NULL) OR (length(position_note) <= 200))),
    CONSTRAINT asset_items_quantity_installed_check CHECK ((quantity_installed > (0)::numeric)),
    CONSTRAINT asset_items_quantity_installed_finite CHECK (((quantity_installed >= ('-1000000000000'::bigint)::numeric) AND (quantity_installed <= ('1000000000000'::bigint)::numeric)))
);


ALTER TABLE public.asset_items OWNER TO postgres;

REVOKE ALL ON TABLE public.asset_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.asset_items TO authenticated;
GRANT ALL ON TABLE public.asset_items TO service_role;

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_name_key UNIQUE (name);

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX stock_locations_code_key ON public.stock_locations USING btree (lower(code));

CREATE INDEX stock_locations_parent_id_idx ON public.stock_locations USING btree (parent_id);

CREATE INDEX stock_locations_team_id_idx ON public.stock_locations USING btree (team_id);

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_item_number_key UNIQUE (item_number);

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);

CREATE INDEX items_category_phrase_id_idx ON public.items USING btree (category_phrase_id);

CREATE INDEX items_default_stock_location_id_idx ON public.items USING btree (default_stock_location_id) WHERE (default_stock_location_id IS NOT NULL);

CREATE INDEX items_item_number_trgm_idx ON public.items USING gin (item_number extensions.gin_trgm_ops);

CREATE INDEX items_name_trgm_idx ON public.items USING gin (name extensions.gin_trgm_ops);

CREATE INDEX items_supplier_id_idx ON public.items USING btree (supplier_id);

CREATE INDEX items_unit_phrase_id_idx ON public.items USING btree (unit_phrase_id);

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_pkey PRIMARY KEY (id);

CREATE INDEX task_items_item_id_idx ON public.task_items USING btree (item_id);

CREATE INDEX task_items_purchase_task_id_idx ON public.task_items USING btree (purchase_task_id) WHERE (purchase_task_id IS NOT NULL);

CREATE INDEX task_items_supplier_id_idx ON public.task_items USING btree (supplier_id);

CREATE INDEX task_items_task_id_idx ON public.task_items USING btree (task_id);

CREATE INDEX task_items_unit_phrase_id_idx ON public.task_items USING btree (unit_phrase_id);

ALTER TABLE ONLY public.stock_balances
    ADD CONSTRAINT stock_balances_pkey PRIMARY KEY (item_id, stock_location_id);

CREATE INDEX stock_balances_stock_location_id_idx ON public.stock_balances USING btree (stock_location_id);

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);

CREATE INDEX stock_movements_item_id_seq_idx ON public.stock_movements USING btree (item_id, seq DESC);

CREATE INDEX stock_movements_stock_location_id_seq_idx ON public.stock_movements USING btree (stock_location_id, seq DESC);

CREATE INDEX stock_movements_task_id_idx ON public.stock_movements USING btree (task_id) WHERE (task_id IS NOT NULL);

CREATE INDEX stock_movements_task_item_id_idx ON public.stock_movements USING btree (task_item_id) WHERE (task_item_id IS NOT NULL);

CREATE INDEX stock_movements_transfer_id_idx ON public.stock_movements USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);

ALTER TABLE ONLY public.stock_alert_log
    ADD CONSTRAINT stock_alert_log_pkey PRIMARY KEY (item_id);

ALTER TABLE ONLY public.task_type_item_categories
    ADD CONSTRAINT task_type_item_categories_pkey PRIMARY KEY (task_type_id, category_phrase_id);

CREATE INDEX task_type_item_categories_category_phrase_id_idx ON public.task_type_item_categories USING btree (category_phrase_id);

ALTER TABLE ONLY public.recurring_task_rule_items
    ADD CONSTRAINT recurring_task_rule_items_pkey PRIMARY KEY (recurring_task_rule_id, item_id);

CREATE INDEX recurring_task_rule_items_item_id_idx ON public.recurring_task_rule_items USING btree (item_id);

ALTER TABLE ONLY public.asset_items
    ADD CONSTRAINT asset_items_pkey PRIMARY KEY (asset_id, item_id);

CREATE INDEX asset_items_item_id_idx ON public.asset_items USING btree (item_id);

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.stock_locations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_locations
    ADD CONSTRAINT stock_locations_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_category_phrase_id_fkey FOREIGN KEY (category_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_default_stock_location_id_fkey FOREIGN KEY (default_stock_location_id) REFERENCES public.stock_locations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_photo_attachment_id_fkey FOREIGN KEY (photo_attachment_id) REFERENCES public.attachments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_unit_phrase_id_fkey FOREIGN KEY (unit_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.item_prices
    ADD CONSTRAINT item_prices_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_purchase_task_id_fkey FOREIGN KEY (purchase_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_unit_phrase_id_fkey FOREIGN KEY (unit_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_items
    ADD CONSTRAINT task_items_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_balances
    ADD CONSTRAINT stock_balances_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_balances
    ADD CONSTRAINT stock_balances_stock_location_id_fkey FOREIGN KEY (stock_location_id) REFERENCES public.stock_locations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_stock_location_id_fkey FOREIGN KEY (stock_location_id) REFERENCES public.stock_locations(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_task_item_id_fkey FOREIGN KEY (task_item_id) REFERENCES public.task_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.stock_alert_log
    ADD CONSTRAINT stock_alert_log_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_type_item_categories
    ADD CONSTRAINT task_type_item_categories_category_phrase_id_fkey FOREIGN KEY (category_phrase_id) REFERENCES public.phrases(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_type_item_categories
    ADD CONSTRAINT task_type_item_categories_task_type_id_fkey FOREIGN KEY (task_type_id) REFERENCES public.task_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recurring_task_rule_items
    ADD CONSTRAINT recurring_task_rule_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.recurring_task_rule_items
    ADD CONSTRAINT recurring_task_rule_items_recurring_task_rule_id_fkey FOREIGN KEY (recurring_task_rule_id) REFERENCES public.recurring_task_rules(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_items
    ADD CONSTRAINT asset_items_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.asset_items
    ADD CONSTRAINT asset_items_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.asset_items
    ADD CONSTRAINT asset_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE;

CREATE FUNCTION public.user_sees_items(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'items.view' = any (public.user_permissions(p_user_id));
$$;


ALTER FUNCTION public.user_sees_items(p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_sees_items(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_sees_items(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_sees_items(p_user_id uuid) TO service_role;

CREATE FUNCTION public.items_photo_check() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.photo_attachment_id is not null and not exists (
    select 1 from public.attachments
    where id = new.photo_attachment_id and entity_type = 'items' and entity_id = new.id and mime_type like 'image/%'
  ) then
    raise exception 'The main photo must be an image of this item';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.items_photo_check() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.items_photo_check() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.items_photo_check() FROM PUBLIC;
GRANT ALL ON FUNCTION public.items_photo_check() TO service_role;

CREATE FUNCTION public.items_stock_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if old.stock_managed and not new.stock_managed
     and exists (select 1 from public.stock_balances where item_id = new.id and quantity <> 0) then
    raise exception 'Stock keeping cannot be switched off while the item has stock';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.items_stock_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.items_stock_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.items_stock_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.items_stock_guard() TO service_role;

CREATE FUNCTION public.items_waiting_tasks() RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select count(distinct ti.task_id)::integer
  from public.task_items ti
  join public.tasks t on t.id = ti.task_id
  where ti.state = 'needed' and ti.arrived_at is null and ti.purchase_task_id is distinct from ti.task_id
    and t.status not in ('done', 'cancelled');
$$;


ALTER FUNCTION public.items_waiting_tasks() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.items_waiting_tasks() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.items_waiting_tasks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.items_waiting_tasks() TO service_role;
GRANT ALL ON FUNCTION public.items_waiting_tasks() TO authenticated;

CREATE FUNCTION public.stock_user_may_book(p_user_id uuid, p_location_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'stock.edit.all' = any (public.user_permissions(p_user_id))
      or ('stock.edit.team' = any (public.user_permissions(p_user_id))
          and exists (
            select 1 from public.stock_locations l
            join public.user_teams ug on ug.team_id = l.team_id and ug.user_id = p_user_id
            where l.id = p_location_id));
$$;


ALTER FUNCTION public.stock_user_may_book(p_user_id uuid, p_location_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_user_may_book(p_user_id uuid, p_location_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_user_may_book(p_user_id uuid, p_location_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_user_may_book(p_user_id uuid, p_location_id uuid) TO service_role;

CREATE FUNCTION public.stock_locations_check_tree() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_depth integer := 0;
  v_id uuid := new.parent_id;
begin
  while v_id is not null loop
    v_depth := v_depth + 1;
    if v_id = new.id or v_depth > 5 then
      raise exception 'A stock location cannot sit below itself and may be at most 6 levels deep';
    end if;
    select parent_id into v_id from public.stock_locations where id = v_id;
  end loop;
  return new;
end;
$$;


ALTER FUNCTION public.stock_locations_check_tree() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_locations_check_tree() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_locations_check_tree() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_locations_check_tree() TO service_role;

CREATE FUNCTION public.stock_movements_apply() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.stock_balances as b (item_id, stock_location_id, quantity)
  values (new.item_id, new.stock_location_id, new.quantity)
  on conflict (item_id, stock_location_id)
  do update set quantity = b.quantity + excluded.quantity, updated_at = now();
  return null;
end;
$$;


ALTER FUNCTION public.stock_movements_apply() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_movements_apply() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_movements_apply() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_movements_apply() TO service_role;

CREATE FUNCTION public.stock_movements_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' then
    if (new.id, new.seq, new.item_id, new.stock_location_id, new.quantity, new.kind, new.transfer_id, new.note, new.created_at)
       is distinct from (old.id, old.seq, old.item_id, old.stock_location_id, old.quantity, old.kind, old.transfer_id, old.note, old.created_at) then
      raise exception 'Stock movements are never changed';
    end if;
    return new;
  end if;
  if current_setting('app.stock_admin', true) = 'on' then
    return old;
  end if;
  raise exception 'Stock movements are never deleted';
end;
$$;


ALTER FUNCTION public.stock_movements_immutable() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_movements_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_movements_immutable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_movements_immutable() TO service_role;

CREATE FUNCTION public.stock_post(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_task_id uuid DEFAULT NULL::uuid, p_task_item_id uuid DEFAULT NULL::uuid, p_transfer_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.items where id = p_item_id and stock_managed) then
    raise exception 'This item is not kept in stock';
  end if;
  if not exists (select 1 from public.stock_locations where id = p_location_id) then
    raise exception 'Stock location not found';
  end if;
  if p_kind in ('opening', 'receipt', 'transfer') and p_quantity > 0
     and not exists (select 1 from public.stock_locations where id = p_location_id and is_active) then
    raise exception 'This stock location is not active';
  end if;
  insert into public.stock_movements (item_id, stock_location_id, quantity, kind, task_id, task_item_id, transfer_id, note)
  values (p_item_id, p_location_id, p_quantity, p_kind, p_task_id, p_task_item_id, p_transfer_id, nullif(btrim(coalesce(p_note, '')), ''));
end;
$$;


ALTER FUNCTION public.stock_post(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_task_id uuid, p_task_item_id uuid, p_transfer_id uuid, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_post(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_task_id uuid, p_task_item_id uuid, p_transfer_id uuid, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_post(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_task_id uuid, p_task_item_id uuid, p_transfer_id uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_post(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_task_id uuid, p_task_item_id uuid, p_transfer_id uuid, p_note text) TO service_role;

CREATE FUNCTION public.stock_adjust(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null or not public.stock_user_may_book(auth.uid(), p_location_id) then
    raise exception 'You may not book stock at this location';
  end if;
  if p_kind not in ('opening', 'receipt', 'correction') then
    raise exception 'Unknown booking kind';
  end if;
  if p_quantity is null or p_quantity = 0 or (p_kind <> 'correction' and p_quantity < 0) then
    raise exception 'The quantity must be positive (a correction may be negative)';
  end if;
  perform public.stock_post(p_item_id, p_location_id, p_quantity, p_kind, null, null, null, p_note);
end;
$$;


ALTER FUNCTION public.stock_adjust(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_adjust(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_adjust(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_adjust(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.stock_adjust(p_item_id uuid, p_location_id uuid, p_quantity numeric, p_kind text, p_note text) TO authenticated;

CREATE FUNCTION public.stock_count(p_item_id uuid, p_location_id uuid, p_counted numeric, p_note text DEFAULT NULL::text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_current numeric;
begin
  if auth.uid() is null or not public.stock_user_may_book(auth.uid(), p_location_id) then
    raise exception 'You may not book stock at this location';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'The counted quantity cannot be negative';
  end if;
  select quantity into v_current from public.stock_balances
  where item_id = p_item_id and stock_location_id = p_location_id for update;
  perform public.stock_post(p_item_id, p_location_id, p_counted - coalesce(v_current, 0), 'count', null, null, null, p_note);
  return p_counted - coalesce(v_current, 0);
end;
$$;


ALTER FUNCTION public.stock_count(p_item_id uuid, p_location_id uuid, p_counted numeric, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_count(p_item_id uuid, p_location_id uuid, p_counted numeric, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_count(p_item_id uuid, p_location_id uuid, p_counted numeric, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_count(p_item_id uuid, p_location_id uuid, p_counted numeric, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.stock_count(p_item_id uuid, p_location_id uuid, p_counted numeric, p_note text) TO authenticated;

CREATE FUNCTION public.stock_transfer(p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_transfer uuid := public.uuid_generate_v7();
  v_have numeric;
begin
  if auth.uid() is null or not public.stock_user_may_book(auth.uid(), p_from) then
    raise exception 'You may not book stock at this location';
  end if;
  if p_from = p_to then
    raise exception 'Source and target are the same location';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'The quantity must be positive';
  end if;
  select quantity into v_have from public.stock_balances
  where item_id = p_item_id and stock_location_id = p_from for update;
  if coalesce(v_have, 0) < p_quantity then
    raise exception 'Not enough stock at the source location';
  end if;
  perform public.stock_post(p_item_id, p_from, -p_quantity, 'transfer', null, null, v_transfer, p_note);
  perform public.stock_post(p_item_id, p_to, p_quantity, 'transfer', null, null, v_transfer, p_note);
end;
$$;


ALTER FUNCTION public.stock_transfer(p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_transfer(p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_transfer(p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_transfer(p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.stock_transfer(p_item_id uuid, p_from uuid, p_to uuid, p_quantity numeric, p_note text) TO authenticated;

CREATE FUNCTION public.stock_history(p_item_ids uuid[], p_weeks integer DEFAULT 12) RETURNS TABLE(item_id uuid, day date, quantity numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if not (select public.rls_has('stock.view')) or not (select public.rls_has('items.view')) then
    return;
  end if;
  p_weeks := least(greatest(coalesce(p_weeks, 12), 2), 104);
  -- A page of a list is 50 items; more is a misuse.
  p_item_ids := array(select distinct x from unnest(p_item_ids) x limit 200);

  return query
  with days as (
    select g::date as day, (g::date + 1)::timestamptz as cut
    from generate_series(current_date - 7 * (p_weeks - 1), current_date, interval '7 days') g
  ),
  ids as (select unnest(p_item_ids) as item_id),
  totals as (
    select b.item_id, sum(b.quantity) as quantity
    from public.stock_balances b
    where b.item_id = any (p_item_ids)
    group by b.item_id
  ),
  moved as (
    select m.item_id, m.created_at, m.quantity
    from public.stock_movements m
    where m.item_id = any (p_item_ids) and m.created_at >= (select min(d.cut) from days d)
  )
  select i.item_id, d.day, (coalesce(t.quantity, 0) - coalesce(sum(v.quantity), 0))::numeric
  from ids i
  cross join days d
  left join totals t on t.item_id = i.item_id
  left join moved v on v.item_id = i.item_id and v.created_at >= d.cut
  group by i.item_id, d.day, t.quantity;
end;
$$;


ALTER FUNCTION public.stock_history(p_item_ids uuid[], p_weeks integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_history(p_item_ids uuid[], p_weeks integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_history(p_item_ids uuid[], p_weeks integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_history(p_item_ids uuid[], p_weeks integer) TO service_role;
GRANT ALL ON FUNCTION public.stock_history(p_item_ids uuid[], p_weeks integer) TO authenticated;

CREATE FUNCTION public.stock_location_contents(p_location_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(item_id uuid, stock_location_id uuid, quantity numeric, item_number text, item_name text, unit_phrase_id uuid, total_count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with recursive tree (id) as (
    select p_location_id
    union
    select l.id from public.stock_locations l join tree t on l.parent_id = t.id
  )
  select b.item_id, b.stock_location_id, b.quantity, i.item_number, i.name, i.unit_phrase_id, count(*) over ()
  from public.stock_balances b
  join tree on tree.id = b.stock_location_id
  join public.items i on i.id = b.item_id
  where b.quantity <> 0
  order by i.item_number, b.stock_location_id
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;


ALTER FUNCTION public.stock_location_contents(p_location_id uuid, p_limit integer, p_offset integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_location_contents(p_location_id uuid, p_limit integer, p_offset integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_location_contents(p_location_id uuid, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_location_contents(p_location_id uuid, p_limit integer, p_offset integer) TO service_role;
GRANT ALL ON FUNCTION public.stock_location_contents(p_location_id uuid, p_limit integer, p_offset integer) TO authenticated;

CREATE FUNCTION public.stock_sync_line(p_line_id uuid, p_task_id uuid, p_item_id uuid, p_target numeric, p_picks jsonb DEFAULT NULL::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_item public.items;
  v_booked numeric;
  v_delta numeric;
  v_rem numeric;
  v_take numeric;
  v_sum numeric;
  v_count integer := 0;
  r record;
begin
  select * into v_item from public.items where id = p_item_id;
  if v_item.id is null or not v_item.stock_managed then
    return 0;
  end if;
  select coalesce(-sum(quantity), 0) into v_booked from public.stock_movements
  where task_item_id = p_line_id and item_id = p_item_id and kind in ('issue', 'return');
  v_delta := p_target - v_booked;
  if v_delta = 0 then
    return 0;
  end if;

  if v_delta > 0 then
    if p_picks is not null and jsonb_typeof(p_picks) = 'array' and jsonb_array_length(p_picks) > 0 then
      select coalesce(sum(x.quantity), 0) into v_sum
      from jsonb_to_recordset(p_picks) as x (location_id uuid, quantity numeric) where x.quantity > 0;
      if v_sum <> v_delta then
        raise exception 'The picked quantities must add up to the quantity';
      end if;
      for r in select x.location_id, x.quantity from jsonb_to_recordset(p_picks) as x (location_id uuid, quantity numeric) where x.quantity > 0 loop
        perform public.stock_post(p_item_id, r.location_id, -r.quantity, 'issue', p_task_id, p_line_id);
        v_count := v_count + 1;
      end loop;
    else
      v_rem := v_delta;
      for r in
        select b.stock_location_id, b.quantity from public.stock_balances b
        where b.item_id = p_item_id and b.quantity > 0
        order by (b.stock_location_id = v_item.default_stock_location_id) desc, b.quantity desc
      loop
        exit when v_rem <= 0;
        v_take := least(r.quantity, v_rem);
        perform public.stock_post(p_item_id, r.stock_location_id, -v_take, 'issue', p_task_id, p_line_id);
        v_rem := v_rem - v_take;
        v_count := v_count + 1;
      end loop;
      if v_rem > 0 then
        perform public.stock_post(p_item_id, v_item.default_stock_location_id, -v_rem, 'issue', p_task_id, p_line_id);
        v_count := v_count + 1;
      end if;
    end if;
  else
    v_rem := -v_delta;
    for r in
      select m.stock_location_id, -sum(m.quantity) as taken
      from public.stock_movements m
      where m.task_item_id = p_line_id and m.item_id = p_item_id and m.kind in ('issue', 'return')
      group by m.stock_location_id
      having -sum(m.quantity) > 0
      order by max(m.seq) desc
    loop
      exit when v_rem <= 0;
      v_take := least(r.taken, v_rem);
      perform public.stock_post(p_item_id, r.stock_location_id, v_take, 'return', p_task_id, p_line_id);
      v_rem := v_rem - v_take;
      v_count := v_count + 1;
    end loop;
  end if;
  return v_count;
end;
$$;


ALTER FUNCTION public.stock_sync_line(p_line_id uuid, p_task_id uuid, p_item_id uuid, p_target numeric, p_picks jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_sync_line(p_line_id uuid, p_task_id uuid, p_item_id uuid, p_target numeric, p_picks jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_sync_line(p_line_id uuid, p_task_id uuid, p_item_id uuid, p_target numeric, p_picks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_sync_line(p_line_id uuid, p_task_id uuid, p_item_id uuid, p_target numeric, p_picks jsonb) TO service_role;

CREATE FUNCTION public.stock_book_task_item(p_line_id uuid, p_picks jsonb DEFAULT NULL::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_line public.task_items;
begin
  select * into v_line from public.task_items where id = p_line_id;
  if v_line.id is null then
    raise exception 'Item line not found';
  end if;
  if auth.uid() is null or not (select public.rls_has('items.view'))
     or not public.can_access_entity('tasks', v_line.task_id, 'check') then
    raise exception 'No permission to book the parts of this task';
  end if;
  if v_line.item_id is null then
    return 0;
  end if;
  return public.stock_sync_line(v_line.id, v_line.task_id, v_line.item_id,
                                case when v_line.state = 'used' then v_line.quantity else 0 end, p_picks);
end;
$$;


ALTER FUNCTION public.stock_book_task_item(p_line_id uuid, p_picks jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.stock_book_task_item(p_line_id uuid, p_picks jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.stock_book_task_item(p_line_id uuid, p_picks jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.stock_book_task_item(p_line_id uuid, p_picks jsonb) TO service_role;
GRANT ALL ON FUNCTION public.stock_book_task_item(p_line_id uuid, p_picks jsonb) TO authenticated;

CREATE FUNCTION public.task_type_allows_item(p_task_type_id uuid, p_item_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not exists (select 1 from public.task_type_item_categories where task_type_id = p_task_type_id)
    or exists (
      select 1 from public.items i
      join public.task_type_item_categories c on c.category_phrase_id = i.category_phrase_id
      where i.id = p_item_id and c.task_type_id = p_task_type_id
    )
$$;


ALTER FUNCTION public.task_type_allows_item(p_task_type_id uuid, p_item_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_type_allows_item(p_task_type_id uuid, p_item_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_type_allows_item(p_task_type_id uuid, p_item_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_type_allows_item(p_task_type_id uuid, p_item_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.task_type_allows_item(p_task_type_id uuid, p_item_id uuid) TO authenticated;

CREATE FUNCTION public.task_items_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_type_id uuid;
  v_mode text;
  v_status text;
begin
  if current_setting('app.items_internal', true) = 'on' then
    return new;
  end if;
  select t.task_type_id, tt.item_mode, t.status into v_type_id, v_mode, v_status
  from public.tasks t join public.task_types tt on tt.id = t.task_type_id
  where t.id = new.task_id;
  if tg_op = 'INSERT' then
    if coalesce(v_mode, 'none') = 'none' then
      raise exception 'This task type does not use items';
    end if;
    if new.arrived_at is not null or (new.purchase_task_id is not null and v_mode <> 'order') then
      raise exception 'The order link is set by task_items_order()';
    end if;
    if v_mode = 'order' then
      -- The order is complete (or cancelled): a new line would never arrive.
      if v_status in ('done', 'cancelled') then
        raise exception 'The order is already finished';
      end if;
      new.purchase_task_id := new.task_id;
    end if;
  elsif new.task_id <> old.task_id or new.purchase_task_id is distinct from old.purchase_task_id
        or new.arrived_at is distinct from old.arrived_at then
    raise exception 'The task and the order link of an item line cannot be changed';
  end if;
  if new.purchase_task_id = new.task_id then
    new.state := 'needed';
  end if;
  if new.item_id is not null and (tg_op = 'INSERT' or new.item_id is distinct from old.item_id)
     and not public.task_type_allows_item(v_type_id, new.item_id) then
    raise exception 'This task type does not offer items of this category';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.task_items_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_items_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_items_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_items_guard() TO service_role;

CREATE FUNCTION public.task_items_order(p_purchase_task_id uuid, p_line_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_purchase public.tasks;
  v_count integer;
begin
  select * into v_purchase from public.tasks where id = p_purchase_task_id;
  if v_purchase.id is null or v_purchase.parent_task_id is null then
    raise exception 'The order must be a subtask of the task that needs the items';
  end if;
  if not exists (select 1 from public.task_types where id = v_purchase.task_type_id and item_mode = 'order') then
    raise exception 'The order must be of a task type that orders items';
  end if;
  if auth.uid() is null or not public.can_access_entity('tasks', v_purchase.parent_task_id, 'check') then
    raise exception 'No permission to order items for this task';
  end if;
  if v_purchase.status in ('done', 'cancelled') then
    raise exception 'The order is already finished';
  end if;
  if coalesce(array_length(p_line_ids, 1), 0) = 0 or exists (
    select 1 from unnest(p_line_ids) l (id)
    where not exists (
      select 1 from public.task_items s
      where s.id = l.id and s.task_id = v_purchase.parent_task_id and s.state = 'needed' and s.purchase_task_id is null
    )
  ) then
    raise exception 'Only missing items of the task that are not ordered yet can be ordered';
  end if;

  perform set_config('app.items_internal', 'on', true);
  update public.task_items set purchase_task_id = p_purchase_task_id, arrived_at = null where id = any (p_line_ids);
  get diagnostics v_count = row_count;
  perform set_config('app.items_internal', 'off', true);

  perform public.log_system_event('tasks', v_purchase.parent_task_id, 'items_ordered',
    jsonb_build_object('task_number', v_purchase.task_number, 'title', v_purchase.title, 'count', v_count), auth.uid());
  return v_count;
end;
$$;


ALTER FUNCTION public.task_items_order(p_purchase_task_id uuid, p_line_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_items_order(p_purchase_task_id uuid, p_line_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_items_order(p_purchase_task_id uuid, p_line_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_items_order(p_purchase_task_id uuid, p_line_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_items_order(p_purchase_task_id uuid, p_line_ids uuid[]) TO authenticated;

CREATE FUNCTION public.task_items_save_used(p_task_id uuid, p_lines jsonb) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  r record;
  v_id uuid;
  v_count integer := 0;
begin
  for r in
    select * from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as x (line_id uuid, item_id uuid, quantity numeric, picks jsonb)
  loop
    perform set_config('app.stock_manual', 'on', true);
    if r.line_id is not null then
      update public.task_items set state = 'used', quantity = r.quantity
      where id = r.line_id and task_id = p_task_id
      returning id into v_id;
      if not found then
        raise exception 'Item line not found';
      end if;
    else
      insert into public.task_items (task_id, item_id, quantity, state) values (p_task_id, r.item_id, r.quantity, 'used')
      returning id into v_id;
    end if;
    perform set_config('app.stock_manual', 'off', true);
    perform public.stock_book_task_item(v_id, r.picks);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;


ALTER FUNCTION public.task_items_save_used(p_task_id uuid, p_lines jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_items_save_used(p_task_id uuid, p_lines jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_items_save_used(p_task_id uuid, p_lines jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_items_save_used(p_task_id uuid, p_lines jsonb) TO service_role;
GRANT ALL ON FUNCTION public.task_items_save_used(p_task_id uuid, p_lines jsonb) TO authenticated;

CREATE FUNCTION public.task_items_stock_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_task uuid;
begin
  if current_setting('app.stock_manual', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.item_id is not null and old.state = 'used' then
      -- On the cascade of a deleted task the task row is already gone: the movement then has no task link.
      select t.id into v_task from public.tasks t where t.id = old.task_id;
      perform public.stock_sync_line(old.id, v_task, old.item_id, 0);
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.state = 'used' and new.state = 'used' and old.item_id is not distinct from new.item_id
     and not exists (select 1 from public.stock_movements m where m.task_item_id = new.id) then
    -- Used before the item was kept in stock: nothing was booked, so a change books nothing either.
    return new;
  end if;
  if tg_op = 'UPDATE' and old.item_id is not null and old.item_id is distinct from new.item_id and old.state = 'used' then
    perform public.stock_sync_line(old.id, old.task_id, old.item_id, 0);
  end if;
  if new.item_id is not null and (new.state = 'used' or (tg_op = 'UPDATE' and old.state = 'used')) then
    perform public.stock_sync_line(new.id, new.task_id, new.item_id, case when new.state = 'used' then new.quantity else 0 end);
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.task_items_stock_sync() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_items_stock_sync() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_items_stock_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_items_stock_sync() TO service_role;

CREATE FUNCTION public.tasks_copy_rule_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.task_items (task_id, item_id, quantity, state, created_by_user_id)
  select new.id, rp.item_id, rp.quantity, 'planned', null
  from public.recurring_task_rule_items rp
  where rp.recurring_task_rule_id = new.recurring_task_rule_id
    -- The rule's type may have been changed to one without items, or to one that does not offer the category.
    and exists (select 1 from public.task_types tt where tt.id = new.task_type_id and tt.item_mode <> 'none')
    and public.task_type_allows_item(new.task_type_id, rp.item_id);
  return null;
end;
$$;


ALTER FUNCTION public.tasks_copy_rule_items() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.tasks_copy_rule_items() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.tasks_copy_rule_items() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tasks_copy_rule_items() TO service_role;

CREATE FUNCTION public.workflow_hook_items_order_finished(p_task public.tasks, p_event text, p_action_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parent public.tasks;
  v_count integer;
  v_recipients uuid[];
  r record;
begin
  -- Lines of the task this order was started from (not the order's own lines).
  select count(*) into v_count from public.task_items
  where purchase_task_id = p_task.id and task_id <> p_task.id and arrived_at is null;
  perform set_config('app.items_internal', 'on', true);
  if p_event = 'done' then
    for r in
      with arrived as (
        update public.task_items set arrived_at = now()
        where purchase_task_id = p_task.id and arrived_at is null
        returning id, item_id, quantity
      )
      select a.id, a.item_id, a.quantity, i.default_stock_location_id
      from arrived a join public.items i on i.id = a.item_id and i.stock_managed
    loop
      perform public.stock_post(r.item_id, r.default_stock_location_id, r.quantity, 'receipt', p_task.id, r.id);
    end loop;
  else
    update public.task_items set purchase_task_id = null, arrived_at = null
    where purchase_task_id = p_task.id and task_id <> p_task.id and arrived_at is null;
  end if;
  perform set_config('app.items_internal', 'off', true);
  if v_count = 0 then
    return;
  end if;

  select * into v_parent from public.tasks where id = p_task.parent_task_id;
  if v_parent.id is null then
    return;
  end if;
  perform public.log_system_event('tasks', v_parent.id,
    case when p_event = 'done' then 'items_arrived' else 'items_order_cancelled' end,
    jsonb_build_object('task_number', p_task.task_number, 'title', p_task.title, 'count', v_count), auth.uid());
  if p_event = 'done' and v_parent.status not in ('done', 'cancelled') then
    if v_parent.assigned_user_id is not null then
      v_recipients := array[v_parent.assigned_user_id];
    else
      select coalesce(array_agg(user_id), '{}') into v_recipients from public.user_teams where team_id = v_parent.team_id;
    end if;
    -- Only people who may see items.
    select coalesce(array_agg(u), '{}') into v_recipients from unnest(v_recipients) u where public.user_sees_items(u);
    perform public.notify(
      v_recipients, 'items_arrived', '#' || v_parent.task_number || ' ' || v_parent.title, '/tasks/' || v_parent.id,
      null, auth.uid(), 'tasks', v_parent.id, 'items-arrived:' || v_parent.id, array['in_app', 'toast'],
      jsonb_build_object('number', v_parent.task_number, 'title', v_parent.title, 'count', v_count));
  end if;
end;
$$;


ALTER FUNCTION public.workflow_hook_items_order_finished(p_task public.tasks, p_event text, p_action_key text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.workflow_hook_items_order_finished(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.workflow_hook_items_order_finished(p_task public.tasks, p_event text, p_action_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_hook_items_order_finished(p_task public.tasks, p_event text, p_action_key text) TO service_role;

CREATE FUNCTION public.send_item_reminders(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  rec record;
  v_sent integer := 0;
begin
  for rec in
    with due as (
      select t.id, t.task_number, t.title, t.due_date, t.assigned_user_id, t.team_id,
             count(*) as parts, min(t.due_date - p.lead_time_days) as order_by
      from public.tasks t
      join public.task_types tt on tt.id = t.task_type_id and tt.item_mode = 'use'
      join public.task_items l on l.task_id = t.id
      join public.items p on p.id = l.item_id
      where t.status not in ('done', 'cancelled') and t.due_date is not null
        and l.state in ('planned', 'needed') and l.purchase_task_id is null
        and p.lead_time_days is not null and t.due_date - p.lead_time_days <= p_today
      group by t.id
    ),
    recipients as (
      select d.*, d.assigned_user_id as user_id from due d where d.assigned_user_id is not null
      union all
      select d.*, ug.user_id from due d join public.user_teams ug on ug.team_id = d.team_id where d.assigned_user_id is null
    )
    select r.* from recipients r
    left join public.notification_preferences np on np.user_id = r.user_id
    where coalesce(np.remind_items, true)
      and public.user_sees_items(r.user_id)
      and not exists (
        select 1 from public.reminder_log g
        where g.task_id = r.id and g.user_id = r.user_id and g.kind = 'items_order' and g.ref_date = r.due_date
      )
  loop
    insert into public.reminder_log (task_id, user_id, kind, ref_date, sent_on)
    values (rec.id, rec.user_id, 'items_order', rec.due_date, p_today);
    perform public.notify(
      array[rec.user_id], 'items_order_due', '#' || rec.task_number || ' ' || rec.title, '/tasks/' || rec.id, null,
      null, 'tasks', rec.id, 'items-order:' || rec.id, array['in_app'],
      jsonb_build_object('number', rec.task_number, 'title', rec.title, 'count', rec.parts,
                         'date', to_char(rec.order_by, 'DD.MM.YYYY')));
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;


ALTER FUNCTION public.send_item_reminders(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.send_item_reminders(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_item_reminders(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_item_reminders(p_today date) TO service_role;

CREATE FUNCTION public.send_stock_reminders(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  rec record;
  v_recipients uuid[];
  v_sent integer := 0;
begin
  delete from public.stock_alert_log l
  where not exists (
    select 1 from public.items i
    where i.id = l.item_id and i.stock_managed and i.is_active and i.minimum_stock is not null
      and coalesce((select sum(b.quantity) from public.stock_balances b where b.item_id = i.id), 0) < i.minimum_stock);

  for rec in
    select i.id, i.item_number, i.name, i.minimum_stock, coalesce(s.total, 0) as total, dl.team_id
    from public.items i
    left join public.stock_locations dl on dl.id = i.default_stock_location_id
    left join lateral (select sum(b.quantity) as total from public.stock_balances b where b.item_id = i.id) s on true
    where i.stock_managed and i.is_active and i.minimum_stock is not null and coalesce(s.total, 0) < i.minimum_stock
      and not exists (select 1 from public.stock_alert_log l where l.item_id = i.id and l.sent_on > p_today - 7)
  loop
    if rec.team_id is not null then
      select coalesce(array_agg(ug.user_id), '{}') into v_recipients
      from public.user_teams ug join public.users u on u.id = ug.user_id and u.has_login and not u.has_left
      where ug.team_id = rec.team_id;
    else
      select coalesce(array_agg(u.id), '{}') into v_recipients
      from public.users u
      where u.has_login and not u.has_left and 'stock.edit.all' = any (public.user_permissions(u.id));
    end if;
    select coalesce(array_agg(x), '{}') into v_recipients
    from unnest(v_recipients) x
    left join public.notification_preferences np on np.user_id = x
    where coalesce(np.remind_items, true) and public.user_sees_items(x);

    insert into public.stock_alert_log (item_id, sent_on) values (rec.id, p_today)
    on conflict (item_id) do update set sent_on = excluded.sent_on;
    if coalesce(array_length(v_recipients, 1), 0) > 0 then
      perform public.notify(
        v_recipients, 'stock_below_minimum', rec.item_number || ' · ' || rec.name, '/items/' || rec.id || '?tab=stock', null,
        null, 'items', rec.id, 'stock-low:' || rec.id || ':' || to_char(p_today, 'IYYY-IW'), array['in_app'],
        jsonb_build_object('name', rec.name, 'quantity', rec.total, 'minimum', rec.minimum_stock));
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;


ALTER FUNCTION public.send_stock_reminders(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.send_stock_reminders(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_stock_reminders(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_stock_reminders(p_today date) TO service_role;

CREATE FUNCTION public.maintenance_stats(p_from date, p_to date, p_root_asset_id uuid DEFAULT NULL::uuid) RETURNS TABLE(asset_id uuid, asset_name text, tasks_done bigint, corrective_tasks bigint, work_hours numeric, downtime_hours numeric, external_cost numeric, items_cost numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with scope as (
    select a.id, a.name
    from public.assets a
    where p_root_asset_id is null
       or a.path operator(public.<@) (select r.path from public.assets r where r.id = p_root_asset_id)
  ),
  done as (
    select t.asset_id,
           count(*) as tasks_done,
           count(*) filter (where t.ticket_id is not null) as corrective_tasks,
           coalesce(sum(t.work_hours), 0) as work_hours
    from public.tasks t
    where t.asset_id in (select id from scope) and t.status = 'done'
      and t.completed_at >= p_from and t.completed_at < p_to + 1
    group by t.asset_id
  ),
  down as (
    select t.asset_id, sum(extract(epoch from (t.downtime_to - t.downtime_from)) / 3600) as downtime_hours
    from public.tasks t
    where t.asset_id in (select id from scope) and t.downtime_to is not null
      and t.downtime_from >= p_from and t.downtime_from < p_to + 1
    group by t.asset_id
  ),
  cost as (
    select t.asset_id, sum(c.amount) as external_cost
    from public.task_costs c
    join public.tasks t on t.id = c.task_id
    where t.asset_id in (select id from scope) and c.cost_date between p_from and p_to
    group by t.asset_id
  ),
  parts as (
    select t.asset_id, sum(l.quantity * pr.unit_price) as items_cost
    from public.task_items l
    join public.tasks t on t.id = l.task_id
    join public.item_prices pr on pr.item_id = l.item_id
    where t.asset_id in (select id from scope) and t.status = 'done'
      and t.completed_at >= p_from and t.completed_at < p_to + 1
      and l.state = 'used' and l.purchase_task_id is null
    group by t.asset_id
  )
  select s.id, s.name,
         coalesce(d.tasks_done, 0), coalesce(d.corrective_tasks, 0), coalesce(d.work_hours, 0),
         round(coalesce(w.downtime_hours, 0), 1), coalesce(c.external_cost, 0), round(coalesce(p.items_cost, 0), 2)
  from scope s
  left join done d on d.asset_id = s.id
  left join down w on w.asset_id = s.id
  left join cost c on c.asset_id = s.id
  left join parts p on p.asset_id = s.id
  where d.asset_id is not null or w.asset_id is not null or c.asset_id is not null or p.asset_id is not null
  order by coalesce(c.external_cost, 0) + coalesce(p.items_cost, 0) desc, coalesce(d.work_hours, 0) desc;
$$;


ALTER FUNCTION public.maintenance_stats(p_from date, p_to date, p_root_asset_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.maintenance_stats(p_from date, p_to date, p_root_asset_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.maintenance_stats(p_from date, p_to date, p_root_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.maintenance_stats(p_from date, p_to date, p_root_asset_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.maintenance_stats(p_from date, p_to date, p_root_asset_id uuid) TO authenticated;

CREATE FUNCTION public.maintenance_cost_breakdown(p_from date, p_to date, p_group_by text DEFAULT 'asset'::text, p_root_asset_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid) RETURNS TABLE(group_key text, group_label text, asset_id uuid, items bigint, amount numeric)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    case p_group_by when 'supplier' then coalesce(c.supplier_id::text, '') when 'month' then to_char(c.cost_date, 'YYYY-MM') else a.id::text end,
    case p_group_by when 'supplier' then coalesce(s.name, '') when 'month' then to_char(c.cost_date, 'YYYY-MM') else a.name end,
    case when p_group_by = 'asset' then a.id end,
    count(*),
    sum(c.amount)
  from public.task_costs c
  join public.tasks t on t.id = c.task_id
  join public.assets a on a.id = t.asset_id
  left join public.suppliers s on s.id = c.supplier_id
  where p_group_by in ('asset', 'supplier', 'month')
    and c.cost_date between p_from and p_to
    and (p_supplier_id is null or c.supplier_id = p_supplier_id)
    and (p_root_asset_id is null
         or a.path operator(public.<@) (select r.path from public.assets r where r.id = p_root_asset_id))
  group by 1, 2, 3
  order by case when p_group_by = 'month' then null else -sum(c.amount) end, 1;
$$;


ALTER FUNCTION public.maintenance_cost_breakdown(p_from date, p_to date, p_group_by text, p_root_asset_id uuid, p_supplier_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.maintenance_cost_breakdown(p_from date, p_to date, p_group_by text, p_root_asset_id uuid, p_supplier_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.maintenance_cost_breakdown(p_from date, p_to date, p_group_by text, p_root_asset_id uuid, p_supplier_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.maintenance_cost_breakdown(p_from date, p_to date, p_group_by text, p_root_asset_id uuid, p_supplier_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.maintenance_cost_breakdown(p_from date, p_to date, p_group_by text, p_root_asset_id uuid, p_supplier_id uuid) TO authenticated;

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
  if v_type.item_mode = 'order' then
    raise exception 'An ordering task cannot be reopened';
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
           tt.purpose, tt.item_mode,
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
         coalesce(not a.open and a.can_edit and a.purpose is null and a.ticket_id is null and a.recurring_task_rule_id is null
           and a.item_mode is distinct from 'order', false)
  from a;
$$;


ALTER FUNCTION public.task_rights(p_task_ids uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.task_rights(p_task_ids uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text DEFAULT 'normal'::text, p_description text DEFAULT NULL::text, p_asset_id uuid DEFAULT NULL::uuid, p_anchor_type text DEFAULT NULL::text, p_anchor_id uuid DEFAULT NULL::uuid, p_team_id uuid DEFAULT NULL::uuid, p_assigned_user_id uuid DEFAULT NULL::uuid, p_parent_task_id uuid DEFAULT NULL::uuid, p_is_initiative boolean DEFAULT false, p_blocks_parent boolean DEFAULT NULL::boolean, p_set_checklist boolean DEFAULT false, p_checklist_template_id uuid DEFAULT NULL::uuid, p_own_items text[] DEFAULT '{}'::text[], p_items jsonb DEFAULT '[]'::jsonb) RETURNS uuid
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
  perform public.task_create_finish(v_id, p_blocks_parent, p_set_checklist, p_checklist_template_id, p_own_items, p_items);
  return v_id;
end;
$$;


ALTER FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) TO service_role;
GRANT ALL ON FUNCTION public.task_create(p_task_type_id uuid, p_title text, p_due_date date, p_priority text, p_description text, p_asset_id uuid, p_anchor_type text, p_anchor_id uuid, p_team_id uuid, p_assigned_user_id uuid, p_parent_task_id uuid, p_is_initiative boolean, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) RETURNS void
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
  -- Material lines ([{item_id | description, quantity, unit_phrase_id}]), always 'needed': booking 'used' (a stock issue)
  -- needs check on the task through the item card. task_items_guard checks them as usual.
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    if not public.rls_has('items.view') then
      raise exception 'You may not add items';
    end if;
    insert into public.task_items (task_id, item_id, description, quantity, unit_phrase_id, state)
    select p_task_id, i.item_id, nullif(btrim(coalesce(i.description, '')), ''), coalesce(i.quantity, 1), i.unit_phrase_id,
           'needed'
    from jsonb_to_recordset(p_items) as i (item_id uuid, description text, quantity numeric, unit_phrase_id uuid)
    where i.item_id is not null or nullif(btrim(coalesce(i.description, '')), '') is not null;
  end if;
end;
$$;


ALTER FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) TO service_role;
GRANT ALL ON FUNCTION public.task_create_finish(p_task_id uuid, p_blocks_parent boolean, p_set_checklist boolean, p_checklist_template_id uuid, p_own_items text[], p_items jsonb) TO authenticated;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('items.edit'::text) AS rls_has) OR ( SELECT public.rls_has('costs.edit'::text) AS rls_has)));

CREATE POLICY "Delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (( SELECT public.rls_has('items.edit'::text) AS rls_has));

CREATE POLICY "Edit suppliers" ON public.suppliers FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('items.edit'::text) AS rls_has) OR ( SELECT public.rls_has('costs.edit'::text) AS rls_has))) WITH CHECK ((( SELECT public.rls_has('items.edit'::text) AS rls_has) OR ( SELECT public.rls_has('costs.edit'::text) AS rls_has)));

CREATE POLICY "Read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.suppliers AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add stock locations" ON public.stock_locations FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('stock.edit.all'::text) AS rls_has));

CREATE POLICY "Delete stock locations" ON public.stock_locations FOR DELETE TO authenticated USING (( SELECT public.rls_has('stock.edit.all'::text) AS rls_has));

CREATE POLICY "Edit stock locations" ON public.stock_locations FOR UPDATE TO authenticated USING (( SELECT public.rls_has('stock.edit.all'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('stock.edit.all'::text) AS rls_has));

CREATE POLICY "Read stock locations" ON public.stock_locations FOR SELECT TO authenticated USING (( SELECT public.rls_has('stock.view'::text) AS rls_has));

CREATE POLICY mfa_required ON public.stock_locations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stock_locations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER stock_locations_check_tree BEFORE INSERT OR UPDATE OF parent_id ON public.stock_locations FOR EACH ROW EXECUTE FUNCTION public.stock_locations_check_tree();

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add items" ON public.items FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('items.edit'::text) AS rls_has));

CREATE POLICY "Delete items" ON public.items FOR DELETE TO authenticated USING (( SELECT public.rls_has('items.edit'::text) AS rls_has));

CREATE POLICY "Edit items" ON public.items FOR UPDATE TO authenticated USING (( SELECT public.rls_has('items.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('items.edit'::text) AS rls_has));

CREATE POLICY "Read items" ON public.items FOR SELECT TO authenticated USING (( SELECT public.rls_has('items.view'::text) AS rls_has));

CREATE POLICY mfa_required ON public.items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER items_photo_check BEFORE INSERT OR UPDATE OF photo_attachment_id ON public.items FOR EACH ROW EXECUTE FUNCTION public.items_photo_check();

CREATE TRIGGER items_stock_guard BEFORE UPDATE OF stock_managed ON public.items FOR EACH ROW EXECUTE FUNCTION public.items_stock_guard();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.item_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add item prices" ON public.item_prices FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('costs.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.edit'::text) AS rls_has)));

CREATE POLICY "Delete item prices" ON public.item_prices FOR DELETE TO authenticated USING ((( SELECT public.rls_has('costs.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.edit'::text) AS rls_has)));

CREATE POLICY "Edit item prices" ON public.item_prices FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('costs.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.edit'::text) AS rls_has))) WITH CHECK ((( SELECT public.rls_has('costs.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.edit'::text) AS rls_has)));

CREATE POLICY "Read item prices" ON public.item_prices FOR SELECT TO authenticated USING ((( SELECT public.rls_has('costs.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.view'::text) AS rls_has)));

CREATE POLICY mfa_required ON public.item_prices AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE INSERT OR UPDATE ON public.item_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add task items" ON public.task_items FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text)));

CREATE POLICY "Delete task items" ON public.task_items FOR DELETE TO authenticated USING ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text) AND ((purchase_task_id IS NULL) OR (purchase_task_id = task_id) OR (arrived_at IS NOT NULL))));

CREATE POLICY "Edit task items" ON public.task_items FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text))) WITH CHECK ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND public.can_access_entity('tasks'::text, task_id, 'check'::text)));

CREATE POLICY "Read task items" ON public.task_items FOR SELECT TO authenticated USING ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND (public.can_access_entity('tasks'::text, task_id, 'view'::text) OR ((purchase_task_id IS NOT NULL) AND public.can_access_entity('tasks'::text, purchase_task_id, 'view'::text)))));

CREATE POLICY mfa_required ON public.task_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.task_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER task_items_guard BEFORE INSERT OR UPDATE ON public.task_items FOR EACH ROW EXECUTE FUNCTION public.task_items_guard();

CREATE TRIGGER task_items_stock_sync AFTER INSERT OR UPDATE OF state, quantity, item_id ON public.task_items FOR EACH ROW EXECUTE FUNCTION public.task_items_stock_sync();

CREATE TRIGGER task_items_stock_sync_delete BEFORE DELETE ON public.task_items FOR EACH ROW EXECUTE FUNCTION public.task_items_stock_sync();

ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read stock balances" ON public.stock_balances FOR SELECT TO authenticated USING ((( SELECT public.rls_has('stock.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.view'::text) AS rls_has)));

CREATE POLICY mfa_required ON public.stock_balances AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read stock movements" ON public.stock_movements FOR SELECT TO authenticated USING ((( SELECT public.rls_has('stock.view'::text) AS rls_has) AND ( SELECT public.rls_has('items.view'::text) AS rls_has)));

CREATE POLICY mfa_required ON public.stock_movements AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER stock_movements_apply AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.stock_movements_apply();

CREATE TRIGGER stock_movements_immutable BEFORE DELETE OR UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.stock_movements_immutable();

ALTER TABLE public.stock_alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.stock_alert_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.task_type_item_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit task type item categories" ON public.task_type_item_categories TO authenticated USING (( SELECT public.task_type_editable(task_type_item_categories.task_type_id) AS task_type_editable)) WITH CHECK (( SELECT public.task_type_editable(task_type_item_categories.task_type_id) AS task_type_editable));

CREATE POLICY "Read task type item categories" ON public.task_type_item_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.task_type_item_categories AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.recurring_task_rule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit rule items" ON public.recurring_task_rule_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.recurring_task_rules r
  WHERE ((r.id = recurring_task_rule_items.recurring_task_rule_id) AND (( SELECT public.rls_has('recurring_tasks.edit.all'::text) AS rls_has) OR (r.asset_id = ANY (( SELECT public.rls_scope_asset_ids('recurring_tasks.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))))))) WITH CHECK ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND (EXISTS ( SELECT 1
   FROM public.recurring_task_rules r
  WHERE ((r.id = recurring_task_rule_items.recurring_task_rule_id) AND (( SELECT public.rls_has('recurring_tasks.edit.all'::text) AS rls_has) OR (r.asset_id = ANY (( SELECT public.rls_scope_asset_ids('recurring_tasks.edit.assigned_assets'::text) AS rls_scope_asset_ids)::uuid[]))))))));

CREATE POLICY "Read rule items" ON public.recurring_task_rule_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.recurring_task_rules r
  WHERE (r.id = recurring_task_rule_items.recurring_task_rule_id))));

CREATE POLICY mfa_required ON public.recurring_task_rule_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.asset_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add asset items" ON public.asset_items FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('items.edit'::text) AS rls_has) AND public.can_access_entity('assets'::text, asset_id, 'view'::text)));

CREATE POLICY "Delete asset items" ON public.asset_items FOR DELETE TO authenticated USING ((( SELECT public.rls_has('items.edit'::text) AS rls_has) AND public.can_access_entity('assets'::text, asset_id, 'view'::text)));

CREATE POLICY "Edit asset items" ON public.asset_items FOR UPDATE TO authenticated USING ((( SELECT public.rls_has('items.edit'::text) AS rls_has) AND public.can_access_entity('assets'::text, asset_id, 'view'::text))) WITH CHECK ((( SELECT public.rls_has('items.edit'::text) AS rls_has) AND public.can_access_entity('assets'::text, asset_id, 'view'::text)));

CREATE POLICY "Read asset items" ON public.asset_items FOR SELECT TO authenticated USING ((( SELECT public.rls_has('items.view'::text) AS rls_has) AND public.can_access_entity('assets'::text, asset_id, 'view'::text)));

CREATE POLICY mfa_required ON public.asset_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.items_overview WITH (security_invoker='on') AS
 SELECT p.id,
    p.item_number,
    p.name,
    p.category_phrase_id,
    p.description,
    p.manufacturer,
    p.manufacturer_item_number,
    p.supplier_id,
    p.unit_phrase_id,
    p.erp_item_number,
    p.lead_time_days,
    p.is_critical,
    p.is_active,
    p.created_at,
    p.updated_at,
    p.created_by_user_id,
    p.updated_by_user_id,
    p.photo_attachment_id,
    s.name AS supplier_name,
    s.erp_supplier_number,
    pr.unit_price,
    ( SELECT count(*) AS count
           FROM public.asset_items ap
          WHERE (ap.item_id = p.id)) AS asset_count,
    ph.storage_path AS photo_path,
    COALESCE(ph.thumbnail_path, ph.storage_path) AS photo_thumbnail_path
   FROM (((public.items p
     LEFT JOIN public.suppliers s ON ((s.id = p.supplier_id)))
     LEFT JOIN public.item_prices pr ON ((pr.item_id = p.id)))
     LEFT JOIN LATERAL ( SELECT a.storage_path,
            a.thumbnail_path
           FROM public.attachments a
          WHERE ((a.entity_type = 'items'::text) AND (a.entity_id = p.id) AND (a.mime_type ~~ 'image/%'::text))
          ORDER BY (a.id = p.photo_attachment_id) DESC, a.created_at
         LIMIT 1) ph ON (true));


ALTER VIEW public.items_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.items_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.items_overview TO authenticated;
GRANT ALL ON TABLE public.items_overview TO service_role;

CREATE VIEW public.item_stock_overview WITH (security_invoker='on') AS
 SELECT i.id AS item_id,
    i.item_number,
    i.name,
    i.unit_phrase_id,
    i.is_active,
    i.minimum_stock,
    i.reorder_quantity,
    i.default_stock_location_id,
        CASE
            WHEN ( SELECT public.rls_has('stock.view'::text) AS rls_has) THEN COALESCE(s.total, (0)::numeric)
            ELSE NULL::numeric
        END AS quantity,
        CASE
            WHEN ( SELECT public.rls_has('stock.view'::text) AS rls_has) THEN COALESCE(s.locations, (0)::bigint)
            ELSE NULL::bigint
        END AS location_count,
        CASE
            WHEN ( SELECT public.rls_has('stock.view'::text) AS rls_has) THEN ((i.minimum_stock IS NOT NULL) AND (COALESCE(s.total, (0)::numeric) < i.minimum_stock))
            ELSE NULL::boolean
        END AS below_minimum
   FROM (public.items i
     LEFT JOIN LATERAL ( SELECT sum(b.quantity) AS total,
            count(*) FILTER (WHERE (b.quantity <> (0)::numeric)) AS locations
           FROM public.stock_balances b
          WHERE (b.item_id = i.id)) s ON (true))
  WHERE i.stock_managed;


ALTER VIEW public.item_stock_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.item_stock_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.item_stock_overview TO authenticated;
GRANT ALL ON TABLE public.item_stock_overview TO service_role;

CREATE VIEW public.task_items_overview WITH (security_invoker='on') AS
 SELECT l.id,
    l.task_id,
    l.item_id,
    l.description,
    l.quantity,
    l.state,
    l.note,
    l.purchase_task_id,
    l.arrived_at,
    l.created_at,
    l.updated_at,
    l.created_by_user_id,
    l.unit_phrase_id AS line_unit_phrase_id,
    l.supplier_id AS line_supplier_id,
    COALESCE(l.unit_phrase_id, p.unit_phrase_id) AS unit_phrase_id,
    COALESCE(l.supplier_id, p.supplier_id) AS supplier_id,
    s.name AS supplier_name,
    s.erp_supplier_number,
    p.item_number,
    COALESCE(p.name, l.description) AS item_name,
    p.manufacturer,
    p.manufacturer_item_number,
    p.erp_item_number,
    p.category_phrase_id,
    p.lead_time_days,
    COALESCE(p.is_critical, false) AS is_critical,
    pr.unit_price,
    t.task_number,
    t.title AS task_title,
    t.asset_id,
    pt.task_number AS purchase_task_number,
    pt.status AS purchase_task_status,
    COALESCE(ph.thumbnail_path, ph.storage_path) AS photo_thumbnail_path
   FROM ((((((public.task_items l
     LEFT JOIN public.items p ON ((p.id = l.item_id)))
     LEFT JOIN public.item_prices pr ON ((pr.item_id = l.item_id)))
     LEFT JOIN public.tasks t ON ((t.id = l.task_id)))
     LEFT JOIN public.suppliers s ON ((s.id = COALESCE(l.supplier_id, p.supplier_id))))
     LEFT JOIN public.tasks pt ON ((pt.id = l.purchase_task_id)))
     LEFT JOIN LATERAL ( SELECT x.storage_path,
            x.thumbnail_path
           FROM public.attachments x
          WHERE ((l.item_id IS NOT NULL) AND (x.entity_type = 'items'::text) AND (x.entity_id = l.item_id) AND (x.mime_type ~~ 'image/%'::text))
          ORDER BY (x.id = p.photo_attachment_id) DESC, x.created_at
         LIMIT 1) ph ON (true))
  WHERE (( SELECT public.rls_has('items.view'::text) AS rls_has) AND ((l.item_id IS NULL) OR (p.id IS NOT NULL)));


ALTER VIEW public.task_items_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.task_items_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.task_items_overview TO authenticated;
GRANT ALL ON TABLE public.task_items_overview TO service_role;

CREATE VIEW public.asset_items_overview WITH (security_invoker='on') AS
 SELECT ap.asset_id,
    ap.item_id,
    ap.quantity_installed,
    ap.position_note,
    ap.created_at,
    ap.created_by_user_id,
    a.name AS asset_name,
    (a.path)::text AS asset_path,
    p.item_number,
    p.name AS item_name,
    p.manufacturer,
    p.manufacturer_item_number,
    p.category_phrase_id,
    p.unit_phrase_id,
    p.lead_time_days,
    p.is_critical,
    p.is_active,
    s.name AS supplier_name,
    ph.storage_path AS photo_path,
    COALESCE(ph.thumbnail_path, ph.storage_path) AS photo_thumbnail_path
   FROM ((((public.asset_items ap
     JOIN public.assets a ON ((a.id = ap.asset_id)))
     JOIN public.items p ON ((p.id = ap.item_id)))
     LEFT JOIN public.suppliers s ON ((s.id = p.supplier_id)))
     LEFT JOIN LATERAL ( SELECT x.storage_path,
            x.thumbnail_path
           FROM public.attachments x
          WHERE ((x.entity_type = 'items'::text) AND (x.entity_id = p.id) AND (x.mime_type ~~ 'image/%'::text))
          ORDER BY (x.id = p.photo_attachment_id) DESC, x.created_at
         LIMIT 1) ph ON (true));


ALTER VIEW public.asset_items_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.asset_items_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.asset_items_overview TO authenticated;
GRANT ALL ON TABLE public.asset_items_overview TO service_role;

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
        CASE
            WHEN ( SELECT public.rls_has('items.view'::text) AS rls_has) THEN ( SELECT count(*) AS count
               FROM public.task_items sp
              WHERE ((sp.task_id = t.id) AND (sp.state = 'needed'::text) AND (sp.arrived_at IS NULL) AND (sp.purchase_task_id IS DISTINCT FROM sp.task_id)))
            ELSE NULL::bigint
        END AS items_waiting,
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

CREATE FUNCTION public.asset_items_for(p_asset_id uuid, p_subtree boolean DEFAULT false) RETURNS SETOF public.asset_items_overview
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select o.*
  from public.asset_items_overview o
  join public.assets a on a.id = o.asset_id
  where case when p_subtree
             then a.path operator(public.<@) (select r.path from public.assets r where r.id = p_asset_id)
             else o.asset_id = p_asset_id end
  order by a.path, o.item_name;
$$;


ALTER FUNCTION public.asset_items_for(p_asset_id uuid, p_subtree boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.asset_items_for(p_asset_id uuid, p_subtree boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.asset_items_for(p_asset_id uuid, p_subtree boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.asset_items_for(p_asset_id uuid, p_subtree boolean) TO service_role;
GRANT ALL ON FUNCTION public.asset_items_for(p_asset_id uuid, p_subtree boolean) TO authenticated;

ALTER TABLE ONLY public.task_costs
    ADD CONSTRAINT task_costs_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;

CREATE TRIGGER tasks_copy_rule_items AFTER INSERT ON public.tasks FOR EACH ROW WHEN ((new.recurring_task_rule_id IS NOT NULL)) EXECUTE FUNCTION public.tasks_copy_rule_items();

-- Hand-written part of the items module (after the objects copied from COMPASS).

-- Stock movements are numbered by an identity column (COMPASS: sequence stock_movements_seq_seq).
ALTER TABLE public.stock_movements ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.stock_movements_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);
grant all on sequence public.stock_movements_seq_seq to authenticated, service_role;

-- Workflow hook of ordering tasks (COMPASS migration 20261104100000_hooks_for_items_and_tickets.sql, live row).
insert into public.workflow_hooks (key, events, sort_order) values ('items_order_finished', array['done', 'cancelled'], 20);

-- Item categories and units (COMPASS migration 20261026100000_items.sql, live rows; German texts as translations, D6).
insert into public.phrases (category, code, text_en, translations, sequence) values
  ('item_category', 'spare_part', 'Spare part', '{"de": "Ersatzteil"}', 1),
  ('item_category', 'consumable', 'Consumable', '{"de": "Verbrauchsmaterial"}', 2),
  ('item_category', 'protective_equipment', 'Protective equipment', '{"de": "Schutzausrüstung"}', 3),
  ('item_category', 'lab_supplies', 'Lab supplies', '{"de": "Laborbedarf"}', 4),
  ('item_category', 'office_supplies', 'Office supplies', '{"de": "Bürobedarf"}', 5),
  ('item_category', 'hygiene', 'Hygiene', '{"de": "Hygieneartikel"}', 6),
  ('item_unit', 'piece', 'piece', '{"de": "Stück"}', 1),
  ('item_unit', 'set', 'set', '{"de": "Satz"}', 2),
  ('item_unit', 'pair', 'pair', '{"de": "Paar"}', 3),
  ('item_unit', 'metre', 'metre', '{"de": "Meter"}', 4),
  ('item_unit', 'litre', 'litre', '{"de": "Liter"}', 5),
  ('item_unit', 'kilogram', 'kg', '{"de": "kg"}', 6),
  ('item_unit', 'pack', 'pack', '{"de": "Packung"}', 7);

-- Permissions (COMPASS registry rows) and their implications.
insert into public.permissions (key, module, action, scope, sort_order) values
  ('items.view', 'items', 'view', null, 600),
  ('items.edit', 'items', 'edit', null, 601),
  ('stock.view', 'stock', 'view', null, 610),
  ('stock.edit.team', 'stock', 'edit', 'team', 611),
  ('stock.edit.all', 'stock', 'edit', 'all', 612);
insert into public.permission_implies (permission, implies) values
  ('items.edit', 'items.view'), ('stock.edit.team', 'stock.view'), ('stock.edit.all', 'stock.view'),
  ('stock.edit.all', 'stock.edit.team');

-- Items as a record type (COMPASS user_has_access / record_moderator, branch 'items'): items.view to view, items.edit for
-- anything else and to moderate notes; labelled by name.
create function public.items_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'items.edit' = any (public.user_permissions(p_user_id));
  end if;
  return exists (select 1 from public.items where id = p_entity_id)
    and ('items.' || case when p_action = 'view' then 'view' else 'edit' end) = any (public.user_permissions(p_user_id));
end $$;
create function public.items_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select i.name from public.items i where i.id = p_entity_id; $$;
revoke all on function public.items_access(uuid, uuid, text), public.items_label(uuid) from public, anon;
grant execute on function public.items_access(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.items_label(uuid) to service_role;
select public.entity_type_register('items', 'items', 'items_access', null, 'An item', 'items_label', null, null);

-- Search: items (COMPASS global_search, block 'items'; runs as the caller, so the items' policies decide what is found).
create function public.items_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
  select 'items'::text, sp.id,
    (greatest(public.search_field_score(sp.name, p_term), public.search_field_score(sp.item_number, p_term),
              public.search_field_score(sp.manufacturer_item_number, p_term), public.search_field_score(sp.manufacturer, p_term) * 0.7)
      + case when lower(sp.item_number) = lower(p_term) or lower(sp.manufacturer_item_number) = lower(p_term) then 1 else 0 end)::real,
    null::bigint, sp.name, nullif(concat_ws(' · ', sp.item_number, sp.manufacturer, sp.manufacturer_item_number), ''), null::text,
    null::text, null::uuid, null::text, null::text, sp.created_at, null::uuid
  from public.items sp
  where sp.is_active
    and (sp.name ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) sp.name)
      or sp.item_number ilike '%' || p_term || '%' or sp.manufacturer_item_number ilike '%' || p_term || '%'
      or sp.erp_item_number ilike '%' || p_term || '%'
      or sp.manufacturer ilike '%' || p_term || '%')
  order by 3 desc limit 8;
$$;
revoke all on function public.items_search(text, boolean, bigint) from public, anon;
grant execute on function public.items_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('items', 'items', 'items_search', 'Items by name, item number, manufacturer number and ERP number');

-- Notifications (COMPASS email_notification_types / push_notification_types).
select public.notification_type_register('items_arrived', 'items', false, 'Items of your task have arrived', true, true);
select public.notification_type_register('items_order_due', 'items', true, 'Reminder: items have to be ordered now', false, true);
select public.notification_type_register('stock_below_minimum', 'items', true, 'Reminder: the stock of an item is below its minimum', false, true);

-- Jobs (COMPASS cron.job rows).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('send-item-reminders', '5 5 * * 1-5', 'select public.send_item_reminders()');
  perform cron.schedule('send-stock-reminders', '15 5 * * 1-5', 'select public.send_stock_reminders()');
exception when others then
  raise notice 'pg_cron unavailable (%): schedule send_item_reminders() and send_stock_reminders() externally', sqlerrm;
end $$;

