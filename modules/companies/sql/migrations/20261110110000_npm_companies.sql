-- NPM companies slice (WP 1): companies, company_teams (was company_tenants), company_search_options, account helpers.
-- Source: NPM database. Renames: tenants -> teams (owner associates), company_tenants -> company_teams.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.companies (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    short_code text,
    address_line text,
    city text,
    postal_code text,
    telephone text,
    sales_account_user_id uuid,
    account_status_phrase_id uuid,
    group_company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    country_id uuid,
    source text DEFAULT 'manual'::text NOT NULL,
    seaweb_match_name text,
    email text,
    supplier_api_adapter text,
    chart_color text,
    chart_text_color text,
    company_types text[] DEFAULT '{}'::text[] NOT NULL,
    is_group_company boolean GENERATED ALWAYS AS ((id = group_company_id)) STORED,
    supplier_connection_method text,
    CONSTRAINT companies_api_connection_needs_adapter CHECK (((supplier_connection_method IS DISTINCT FROM 'api'::text) OR (supplier_api_adapter IS NOT NULL))),
    CONSTRAINT companies_chart_color_check CHECK ((chart_color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT companies_chart_text_color_check CHECK ((chart_text_color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT companies_company_types_valid CHECK ((company_types <@ ARRAY['shipyard'::text, 'maker'::text, 'dealer'::text, 'facilitating_partner'::text, 'owner'::text, 'ship_manager'::text, 'technical_manager'::text, 'operator'::text, 'forwarder'::text])),
    CONSTRAINT companies_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'seaweb'::text]))),
    CONSTRAINT companies_supplier_api_adapter_check CHECK ((supplier_api_adapter = 'scms_sqs'::text)),
    CONSTRAINT companies_supplier_connection_method_check CHECK ((supplier_connection_method = ANY (ARRAY['in_app'::text, 'email'::text, 'api'::text])))
);

REVOKE ALL ON TABLE public.companies FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

CREATE TABLE public.company_teams (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    company_id uuid NOT NULL,
    team_id uuid NOT NULL,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    our_number_at_company text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT company_teams_roles_valid CHECK ((roles <@ ARRAY['customer'::text, 'supplier'::text]))
);

REVOKE ALL ON TABLE public.company_teams FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.company_teams TO authenticated;
GRANT ALL ON TABLE public.company_teams TO service_role;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

CREATE INDEX companies_account_status_phrase_id_idx ON public.companies USING btree (account_status_phrase_id);

CREATE INDEX companies_company_types_idx ON public.companies USING gin (company_types);

CREATE INDEX companies_country_id_idx ON public.companies USING btree (country_id);

CREATE INDEX companies_created_by_user_id_idx ON public.companies USING btree (created_by_user_id);

CREATE INDEX companies_group_company_id_idx ON public.companies USING btree (group_company_id);

CREATE INDEX companies_name_idx ON public.companies USING btree (name);

CREATE INDEX companies_name_trgm_idx ON public.companies USING gin (name extensions.gin_trgm_ops);

CREATE INDEX companies_sales_account_user_id_idx ON public.companies USING btree (sales_account_user_id);

CREATE UNIQUE INDEX companies_seaweb_match_name_key ON public.companies USING btree (lower(seaweb_match_name)) WHERE (source = 'seaweb'::text);

CREATE UNIQUE INDEX companies_short_code_key ON public.companies USING btree (short_code) WHERE (short_code IS NOT NULL);

CREATE INDEX companies_short_code_trgm_idx ON public.companies USING gin (short_code extensions.gin_trgm_ops);

ALTER TABLE ONLY public.company_teams
    ADD CONSTRAINT company_teams_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX company_teams_company_id_team_id_idx ON public.company_teams USING btree (company_id, team_id);

CREATE INDEX company_teams_created_by_user_id_idx ON public.company_teams USING btree (created_by_user_id);

CREATE INDEX company_teams_team_id_idx ON public.company_teams USING btree (team_id);

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_account_status_phrase_id_fkey FOREIGN KEY (account_status_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_group_company_id_fkey FOREIGN KEY (group_company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_sales_account_user_id_fkey FOREIGN KEY (sales_account_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.company_teams
    ADD CONSTRAINT company_teams_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company_teams
    ADD CONSTRAINT company_teams_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.company_teams
    ADD CONSTRAINT company_teams_tenant_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.company_teams
    ADD CONSTRAINT company_teams_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.company_add_type(p_company_id uuid, p_type text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.companies
  set company_types = array_append(company_types, p_type)
  where id = p_company_id and not (company_types @> array[p_type]);
$$;

REVOKE ALL ON FUNCTION public.company_add_type(p_company_id uuid, p_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.company_add_type(p_company_id uuid, p_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_add_type(p_company_id uuid, p_type text) TO authenticated;
GRANT ALL ON FUNCTION public.company_add_type(p_company_id uuid, p_type text) TO service_role;

CREATE FUNCTION public.company_add_types(p_company_ids uuid[], p_types text[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with want as (
    select u.company_id, u.type
    from unnest(p_company_ids, p_types) as u (company_id, type)
    where u.company_id is not null
  ), missing as (
    select w.company_id, array_agg(distinct w.type) as types
    from want w
    join public.companies c on c.id = w.company_id
    where not (c.company_types @> array[w.type])
    group by w.company_id
  )
  update public.companies c
  set company_types = (select array_agg(distinct t order by t) from unnest(c.company_types || m.types) as t)
  from missing m
  where c.id = m.company_id;
$$;

REVOKE ALL ON FUNCTION public.company_add_types(p_company_ids uuid[], p_types text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.company_add_types(p_company_ids uuid[], p_types text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.company_add_types(p_company_ids uuid[], p_types text[]) TO authenticated;
GRANT ALL ON FUNCTION public.company_add_types(p_company_ids uuid[], p_types text[]) TO service_role;

CREATE FUNCTION public.own_maker_company_id() RETURNS uuid
    LANGUAGE sql IMMUTABLE
    AS $$ select '00000000-0000-0000-0000-00000000a001'::uuid $$;

REVOKE ALL ON FUNCTION public.own_maker_company_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.own_maker_company_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.own_maker_company_id() TO authenticated;
GRANT ALL ON FUNCTION public.own_maker_company_id() TO service_role;

CREATE FUNCTION public.materialize_self_group_company() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.group_company_id is null then
    new.group_company_id := new.id;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.materialize_self_group_company() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.materialize_self_group_company() FROM PUBLIC;
GRANT ALL ON FUNCTION public.materialize_self_group_company() TO authenticated;
GRANT ALL ON FUNCTION public.materialize_self_group_company() TO service_role;

CREATE FUNCTION public.user_account_company_ids(p_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select c.id from public.companies c where c.sales_account_user_id = p_user_id
  union
  select c.id from public.companies c
  where c.group_company_id in (select g.id from public.companies g where g.sales_account_user_id = p_user_id);
$$;

REVOKE ALL ON FUNCTION public.user_account_company_ids(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_account_company_ids(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_account_company_ids(p_user_id uuid) TO service_role;

CREATE FUNCTION public.rls_my_account_company_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.user_account_company_ids(auth.uid()); $$;

REVOKE ALL ON FUNCTION public.rls_my_account_company_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_my_account_company_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rls_my_account_company_ids() TO authenticated;
GRANT ALL ON FUNCTION public.rls_my_account_company_ids() TO service_role;

CREATE FUNCTION public.get_or_create_seaweb_company(p_text text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
  v_text text := btrim(coalesce(p_text, ''));
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

  insert into public.companies (name, seaweb_match_name, source)
  values (v_text, v_text, 'seaweb')
  returning id into v_id;

  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text) TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text) TO service_role;

CREATE FUNCTION public.get_or_create_seaweb_company(p_text text, p_country_text text DEFAULT NULL::text) RETURNS uuid
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

  insert into public.company_teams (company_id, team_id, roles)
  select v_id, t.id, array['customer']
  from public.teams t where t.kind = 'owner_associate';

  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text, p_country_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text, p_country_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text, p_country_text text) TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_seaweb_company(p_text text, p_country_text text) TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Create companies per literal" ON public.companies FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('companies.create'::text) AS rls_has) OR ( SELECT public.rls_has('companies.edit'::text) AS rls_has)));

CREATE POLICY "Delete companies per literal" ON public.companies FOR DELETE TO authenticated USING (( SELECT public.rls_has('companies.delete'::text) AS rls_has));

CREATE POLICY "Edit companies per literal" ON public.companies FOR UPDATE TO authenticated USING (( SELECT public.rls_has('companies.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('companies.edit'::text) AS rls_has));

CREATE POLICY "Signed-in users read companies" ON public.companies FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.companies AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER materialize_group_company BEFORE INSERT OR UPDATE OF group_company_id ON public.companies FOR EACH ROW EXECUTE FUNCTION public.materialize_self_group_company();

ALTER TABLE public.company_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read company tenants" ON public.company_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Write company tenants per companies.edit" ON public.company_teams TO authenticated USING (( SELECT public.rls_has('companies.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('companies.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.company_teams AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.company_search_options WITH (security_invoker='true') AS
 SELECT c.id,
    c.name,
    co.name_en AS country,
        CASE
            WHEN (c.group_company_id = c.id) THEN NULL::text
            ELSE grp.name
        END AS group_company_name,
    ( SELECT COALESCE(array_agg(DISTINCT r.r ORDER BY r.r), '{}'::text[]) AS "coalesce"
           FROM unnest((COALESCE(roles_agg.all_roles, '{}'::text[]) || c.company_types)) r(r)) AS all_roles,
    lower(c.name) AS name_sort,
    COALESCE(roles_agg.team_roles, '{}'::text[]) AS team_roles,
    c.company_types
   FROM (((public.companies c
     LEFT JOIN public.countries co ON ((co.id = c.country_id)))
     LEFT JOIN public.companies grp ON ((grp.id = c.group_company_id)))
     LEFT JOIN LATERAL ( SELECT array_agg(DISTINCT role.role) AS all_roles,
            array_agg(DISTINCT (((ct.team_id)::text || ':'::text) || role.role)) AS team_roles
           FROM public.company_teams ct,
            LATERAL unnest(ct.roles) role(role)
          WHERE (ct.company_id = c.id)) roles_agg ON (true));

REVOKE ALL ON TABLE public.company_search_options FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.company_search_options TO authenticated;
GRANT ALL ON TABLE public.company_search_options TO service_role;

-- Hand-written part of the companies slice: triggers whose functions the platform already has, permissions, registries.
-- NPM compared the whole rows without company_types; a WHEN condition may not read a table with generated columns, so the
-- trigger lists the columns instead (a change of company_types alone leaves updated_at alone).
create trigger set_updated_at before update of name, short_code, address_line, city, postal_code, telephone, sales_account_user_id,
  account_status_phrase_id, group_company_id, country_id, source, seaweb_match_name, email, supplier_api_adapter, chart_color,
  chart_text_color, supplier_connection_method on public.companies for each row
  when (old.name is distinct from new.name or old.short_code is distinct from new.short_code or old.address_line is distinct from new.address_line
    or old.city is distinct from new.city or old.postal_code is distinct from new.postal_code or old.telephone is distinct from new.telephone
    or old.sales_account_user_id is distinct from new.sales_account_user_id or old.account_status_phrase_id is distinct from new.account_status_phrase_id
    or old.group_company_id is distinct from new.group_company_id or old.country_id is distinct from new.country_id or old.source is distinct from new.source
    or old.seaweb_match_name is distinct from new.seaweb_match_name or old.email is distinct from new.email
    or old.supplier_api_adapter is distinct from new.supplier_api_adapter or old.chart_color is distinct from new.chart_color
    or old.chart_text_color is distinct from new.chart_text_color or old.supplier_connection_method is distinct from new.supplier_connection_method)
  execute function public.set_updated_at_and_by();
create trigger set_updated_at before update on public.company_teams for each row execute function public.set_updated_at_and_by();
create trigger companies_clean_events after delete on public.companies for each row execute function public.log_field_changes('companies');
create trigger companies_log_changes after update of name, short_code, address_line, city, postal_code, telephone, email, country_id,
  sales_account_user_id, account_status_phrase_id, group_company_id, supplier_api_adapter on public.companies for each row
  execute function public.log_field_changes('companies', 'name', 'short_code', 'address_line', 'city', 'postal_code', 'telephone', 'email',
    'country_id=countries', 'sales_account_user_id=users', 'account_status_phrase_id=phrases', 'group_company_id=companies', 'supplier_api_adapter');
select public.activity_label_register('countries', 'countries', 'name_en', 'companies');
select public.activity_label_register('companies', 'companies', 'name', 'companies');

-- Permissions (module companies has no view literal: both lists are open to every signed-in user).
insert into public.permissions (key, module, action, scope, sort_order) values
  ('companies.edit', 'companies', 'edit', null, 400),
  ('companies.create', 'companies', 'create', null, 401),
  ('companies.delete', 'companies', 'delete', null, 402);

-- Record access for notes, attachments and activity on a company: everybody sees it, edits need the literal.
create function public.companies_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  return p_action in ('view', 'check') or ('companies.' || p_action) = any (public.user_permissions(p_user_id));
end; $$;
create function public.companies_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable set search_path to '' as $$
begin
  return p_action in ('view', 'check') or ('companies.' || p_action) = any ((p_ctx).permissions);
end; $$;
create function public.companies_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select c.name from public.companies c where c.id = p_entity_id; $$;
revoke all on function public.companies_access(uuid, uuid, text), public.companies_row_allows(text, uuid, public.access_context),
  public.companies_label(uuid) from public, anon, authenticated;
grant execute on function public.companies_access(uuid, uuid, text), public.companies_row_allows(text, uuid, public.access_context),
  public.companies_label(uuid) to authenticated, service_role;
select public.entity_type_register('companies', 'companies', 'companies_access', 'companies_row_allows', 'A company (customer, supplier, owner, shipyard ...)', 'companies_label');

-- The owner associate extension points at its company now.
alter table public.owner_associate_teams add constraint owner_associate_teams_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null;

-- The own maker company (own_maker_company_id() returns its fixed id): "Nippon Paint" is the brand whose coatings count as ours.
insert into public.companies (id, name, short_code, company_types, chart_color)
values ('00000000-0000-0000-0000-00000000a001', 'Nippon Paint Marine', 'NIPPON', array['maker'], '#09428F');

