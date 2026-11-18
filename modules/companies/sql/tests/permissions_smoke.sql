-- Copied from ~/npm_tool/supabase/tests/permissions_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Permission literals smoke test: bash supabase/tests/run.sh permissions_smoke.sql (local stack, seeded, NEW schema).
-- One line per check (ok / FAIL), rolled back. Covers: registry and hierarchy, helper grants, every module's scopes and
-- actions through the real policies, the offline lock, the spec status machine, insert rules, the account scope with
-- every edge, parent-following child tables, polymorphic tables, mentions, computed columns, and that the policy form
-- and the row function (can_access_entity) agree. The old->new conversion is proven by permissions_equivalence.sql.
\pset pager off
\set ON_ERROR_STOP on
\set pf_companies 300
\set pf_he_copies 5
\set pf_spec_copies 40
\set pf_orders 120
\set pf_dock 80
\set pf_conv 100
begin;
-- permissions_test_data.sql, inlined:
-- Synthetic data for the permission tests (permissions_perf.sql, permissions_equivalence.sql).
-- Include inside an open transaction: \i supabase/tests/permissions_test_data.sql. Copies the seeded hull events,
-- specifications, ... with spread owners, teams and customers (triggers and FKs off). Scale through psql variables:
--   \set pf_companies 20000  pf_he_copies 160  pf_spec_copies 1200  pf_orders 3000  pf_dock 2000  pf_conv 3000
\if :{?pf_companies} \else \set pf_companies 20000 \endif
\if :{?pf_he_copies} \else \set pf_he_copies 160 \endif
\if :{?pf_spec_copies} \else \set pf_spec_copies 1200 \endif
\if :{?pf_orders} \else \set pf_orders 3000 \endif
\if :{?pf_dock} \else \set pf_dock 2000 \endif
\if :{?pf_conv} \else \set pf_conv 3000 \endif
set local session_replication_role = replica;

create temp table pf_users as
  select u.email, u.id, row_number() over (order by u.email) n from public.users u
  where u.email in ('jan.hoessermann@wilckens.com', 'jenko.harrendorf@nipponpaint-marine.eu', 'melih.taskin@nipponpaint-marine.eu', 'ugur.akbati@nipponpaint-marine.eu');
create temp table pf_teams as select id, row_number() over (order by name) n from public.teams;

-- companies: a fifth with an account owner, 1 in 8 a subsidiary of a group company
-- (every company has a group company; roots point at themselves, see materialize_self_group_company)
insert into public.companies (id, name, short_code, sales_account_user_id, group_company_id, country_id, source)
select x.gid, 'PF company ' || x.g, null,
       case when x.g % 5 = 0 then (select id from pf_users where n = 1 + (x.g % 4)) end, x.gid, c.country_id, 'manual'
from (select g, gen_random_uuid() gid from generate_series(1, :pf_companies) g) x,
     lateral (select country_id from public.companies where country_id is not null limit 1) c;
create temp table pf_companies as select id, row_number() over (order by substring(name from '\d+$')::int) n from public.companies where name like 'PF company %';
create index on pf_companies (n);
update public.companies c set group_company_id = g.id
from pf_companies s join pf_companies g on g.n = 1 + (s.n * 7 % greatest(:pf_companies / 10, 1)) and g.n % 8 <> 0
where c.id = s.id and s.n % 8 = 0;

-- hull events
insert into public.hull_events
select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object(
  'id', gen_random_uuid(), 'project_code', null,
  'sales_account_user_id', (select id from pf_users where n = 1 + ((g + h.rn) % 5)),
  'technical_service_rep_user_id', (select id from pf_users where n = 1 + ((g + h.rn + 2) % 5)),
  'assigned_team_id', (select id from pf_teams where n = 1 + ((g + h.rn) % 6)),
  'customer_company_id', (select id from pf_companies where n = 1 + ((g * 131 + h.rn * 17) % :pf_companies))
))).*
from (select *, row_number() over () rn from public.hull_events) h, generate_series(1, :pf_he_copies) g;

-- specifications under random hull events
create temp table pf_he as select id, row_number() over () n from public.hull_events;
create index on pf_he (n);
insert into public.specifications
select (jsonb_populate_record(null::public.specifications, to_jsonb(s) || jsonb_build_object(
  'id', gen_random_uuid(), 'specification_number', 'PF-' || g || '-' || s.rn, 'version', 1,
  'status', case when g % 4 = 0 then 'under_review' when g % 4 = 1 then 'approved' else 'draft' end,
  'hull_event_id', (select id from pf_he where n = 1 + ((g * 37 + s.rn) % (select count(*) from pf_he))),
  'sales_account_user_id', (select id from pf_users where n = 1 + ((g + s.rn) % 5)),
  'assigned_team_id', (select id from pf_teams where n = 1 + ((g + s.rn) % 6)),
  'customer_company_id', (select id from pf_companies where n = 1 + ((g * 71 + s.rn * 13) % :pf_companies))
))).*
from (select *, row_number() over () rn from public.specifications) s, generate_series(1, :pf_spec_copies) g;

-- orders: a seed order, then copies
insert into public.orders (id, order_number, vessel_id, supplier_id, team_id, status_phrase_id, specification_id, hull_event_id, sales_account_user_id, assigned_team_id, customer_company_id)
select gen_random_uuid(), 'PFSEED', s.vessel_id, coalesce(s.supplier_id, (select id from public.companies limit 1)), s.team_id,
       (select id from public.phrases where category = 'order_status' limit 1), s.id, s.hull_event_id, s.sales_account_user_id, s.assigned_team_id, s.customer_company_id
from public.specifications s order by s.id limit 1;
insert into public.orders
select (jsonb_populate_record(null::public.orders, to_jsonb(o) || jsonb_build_object(
  'id', gen_random_uuid(), 'order_number', 'PFO-' || g,
  'specification_id', sp.id, 'hull_event_id', sp.hull_event_id, 'sales_account_user_id', sp.sales_account_user_id,
  'assigned_team_id', sp.assigned_team_id, 'customer_company_id', sp.customer_company_id))).*
from public.orders o, generate_series(1, :pf_orders) g,
     lateral (select * from public.specifications order by id offset (g * 3) limit 1) sp
where o.order_number = 'PFSEED';

-- dock reports: one per hull event
insert into public.dock_reports
select (jsonb_populate_record(null::public.dock_reports, to_jsonb(d) || jsonb_build_object(
  'id', gen_random_uuid(), 'hull_event_id', he.id, 'vessel_id', he.vessel_id,
  'sales_account_user_id', he.sales_account_user_id, 'technical_service_rep_user_id', he.technical_service_rep_user_id,
  'assigned_team_id', he.assigned_team_id, 'locked_by_user_id', case when he.rn % 7 = 0 then (select id from pf_users where n = 1) end,
  'locked_at', null))).*
from (select * from public.dock_reports limit 1) d,
     (select h.*, row_number() over () rn from public.hull_events h where h.vessel_id is not null and not exists (select 1 from public.dock_reports r where r.hull_event_id = h.id) limit :pf_dock) he;

-- children and polymorphic rows
insert into public.specification_line_items
select (jsonb_populate_record(null::public.specification_line_items, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid(), 'specification_id', sp.id))).*
from (select * from public.specification_line_items limit 5) l, lateral (select id from public.specifications order by random() limit greatest(:pf_spec_copies / 2, 5)) sp;
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id)
  select 'hull_events', id, 'report_' || id || '.pdf', 'p/' || id, (select id from pf_users where n = 1) from public.hull_events;
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id)
  select 'specifications', id, 'spec_' || id || '.pdf', 's/' || id, (select id from pf_users where n = 1) from public.specifications;
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id)
  select 'orders', id, 'order_' || id || '.pdf', 'o/' || id, (select id from pf_users where n = 1) from (select id from public.orders order by id limit :pf_conv) x;
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id)
  select 'dock_reports', id, 'dock_' || id || '.pdf', 'd/' || id, (select id from pf_users where n = 1) from (select id from public.dock_reports order by id limit :pf_conv) x;
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id)
  select 'vessels', id, 'vessel_' || id || '.pdf', 'v/' || id, (select id from pf_users where n = 1) from public.vessels;
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id)
  select 'companies', id, 'company_' || id || '.pdf', 'c/' || id, (select id from pf_users where n = 1) from (select id from public.companies order by id limit 500) x;
insert into public.conversations (kind, anchor_type, anchor_id, title)
  select 'record', 'hull_events', id, 'HE ' || id from (select id from public.hull_events order by id limit :pf_conv) x on conflict do nothing;
insert into public.conversations (kind, anchor_type, anchor_id, title)
  select 'record', 'specifications', id, 'S ' || id from (select id from public.specifications order by id limit :pf_conv) x on conflict do nothing;
insert into public.conversations (kind, anchor_type, anchor_id, title)
  select 'record', 'orders', id, 'O ' || id from (select id from public.orders order by id limit :pf_conv / 3) x on conflict do nothing;
insert into public.conversations (kind, anchor_type, anchor_id, title)
  select 'record', 'dock_reports', id, 'D ' || id from (select id from public.dock_reports order by id limit :pf_conv / 3) x on conflict do nothing;
insert into public.conversations (kind, anchor_type, anchor_id, title)
  select 'record', 'vessels', id, 'V ' || id from (select id from public.vessels order by id limit 100) x on conflict do nothing;
insert into public.messages (conversation_id, author_user_id, body)
  select c.id, (select id from pf_users where n = 1 + (g % 3)), 'hello world message ' || g || ' ' || c.id from public.conversations c, generate_series(1, 2) g;

reset session_replication_role;
analyze public.companies; analyze public.hull_events; analyze public.specifications; analyze public.orders; analyze public.dock_reports;
analyze public.specification_line_items; analyze public.attachments; analyze public.conversations; analyze public.messages;


create temp table chk (n serial, name text, ok boolean, detail text);
grant all on chk to authenticated;
grant usage on sequence chk_n_seq to authenticated;
create function pg_temp.ok(p_name text, p_cond boolean, p_detail text default null) returns void language sql as
  $$ insert into chk (name, ok, detail) values (p_name, coalesce(p_cond, false), p_detail) $$;
-- compare two values and show both when they differ
create function pg_temp.eq(p_name text, p_actual text, p_expected text) returns void language sql as
  $$ insert into chk (name, ok, detail) values (p_name, p_actual is not distinct from p_expected,
     case when p_actual is not distinct from p_expected then null else 'got ' || coalesce(p_actual, 'NULL') || ', expected ' || coalesce(p_expected, 'NULL') end) $$;

-- one value as a signed-in user (or ERR <sqlstate>)
create function pg_temp.as_user(p_email text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  set local session authorization authenticator;
  set local role authenticated;
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR ' || sqlstate;
  end;
  reset role;
  reset session authorization;
  return v;
end $$;
-- a statement as a signed-in user, always rolled back: affected rows, or ERR <sqlstate>
create function pg_temp.try(p_email text, p_sql text) returns text language plpgsql as $$
declare v text; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  set local session authorization authenticator;
  set local role authenticated;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := n::text;
    raise exception using errcode = 'XX999', message = 'probe_rollback';
  exception when others then
    if sqlstate <> 'XX999' then v := 'ERR ' || sqlstate; end if;
  end;
  reset role;
  reset session authorization;
  return v;
end $$;
create function pg_temp.set_role(p_email text, variadic p_literals text[] default '{}') returns void language plpgsql as $$
declare v_role uuid := gen_random_uuid(); v_user uuid := (select id from public.users where email = p_email);
begin
  delete from public.user_roles where user_id = v_user;
  if array_length(p_literals, 1) > 0 then
    insert into public.roles (id, name) values (v_role, 'T ' || v_role);
    insert into public.role_permissions (role_id, permission) select v_role, unnest(p_literals);
    insert into public.user_roles (user_id, role_id) values (v_user, v_role);
  end if;
end $$;

create temp table src_he as select * from public.hull_events limit 1;
create temp table src_dr as select * from public.dock_reports limit 1;
create temp table src_o as select * from public.orders limit 1;
create temp table src_att as select * from public.attachments where entity_type = 'vessels' limit 1;
grant select on src_he, src_dr, src_o, src_att to authenticated;
\set ugur '''ugur.akbati@nipponpaint-marine.eu'''
\set jenko '''jenko.harrendorf@nipponpaint-marine.eu'''
\set melih '''melih.taskin@nipponpaint-marine.eu'''
\set jan '''jan.hoessermann@wilckens.com'''
\set max '''max.wilckens@wilckens.com'''

-- ugur: team Logistics-less spread: see test-data file; give each user a team and keep roles only as the tests set them
delete from public.user_teams where user_id in (select id from pf_users);
insert into public.user_teams (user_id, team_id) select u.id, t.id from pf_users u join pf_teams t on (u.n, t.n) in ((1, 3), (2, 4), (3, 1), (3, 2), (4, 3));
-- pf_users order by email: 1 jan, 2 jenko, 3 melih, 4 ugur; teams by name: 1 Logistics, 2 Sales NPMEU, 3 Sales NPMME, 4 Sales NPMTR
delete from public.user_roles where user_id in (select id from pf_users);

-- ============================ registry and hierarchy ============================
select pg_temp.ok('registry has 90 NPM literals', (select count(*) = 90 from public.permissions where module in ('companies', 'dock_reports', 'hull_events', 'newbuildings', 'orders', 'products', 'specifications', 'vessels')));
select pg_temp.ok('hierarchy has 58 NPM edges', (select count(*) = 58 from public.permission_implies i join public.permissions p on p.key = i.permission
  where p.module in ('companies', 'dock_reports', 'hull_events', 'newbuildings', 'orders', 'products', 'specifications', 'vessels')));
select pg_temp.ok('edit.team implies view.team and nothing else',
  (select array_agg(implied order by implied) = array['hull_events.edit.team', 'hull_events.view.team'] from public.permission_closure where permission = 'hull_events.edit.team'));
select pg_temp.ok('approve implies view, not edit',
  (select array_agg(implied order by implied) = array['specifications.approve.assigned', 'specifications.view.assigned'] from public.permission_closure where permission = 'specifications.approve.assigned'));
select pg_temp.ok('create and delete imply view', (select count(*) = 2 from public.permission_closure where permission in ('orders.create.team', 'dock_reports.delete.assigned') and implied like '%.view.%'));
select pg_temp.ok('all does not imply team or own', (select count(*) = 1 from public.permission_closure where permission = 'hull_events.view.all'));
select pg_temp.ok('scopeless literals stay scopeless',
  (select count(*) = 1 from public.permission_closure where permission = 'vessels.edit'));
select pg_temp.ok('account exists for view and edit only', (select count(*) = 10 and bool_and(action in ('view', 'edit')) from public.permissions where scope = 'account'));
select pg_temp.ok('vessels and companies have no view literal', (select count(*) = 0 from public.permissions where module in ('vessels', 'companies') and action = 'view'));
select pg_temp.ok('old model is gone', to_regclass('public.role_grants') is null and to_regclass('public.role_grant_groups') is null
  and to_regclass('public.entity_group_tags') is null and to_regclass('public.entity_hierarchy') is null
  and not exists (select 1 from information_schema.columns where table_name = 'roles' and column_name = 'access_configured'));
select pg_temp.ok('no function body mentions a dropped helper', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.prosrc ~ '\m(role_grants|role_grant_groups|entity_group_tags|entity_hierarchy|has_grant|has_cascade_grant|scope_matches|rls_grant_scopes|rls_has_cascade_grants|access_configured)\M'));
select pg_temp.ok('no policy mentions a dropped helper', not exists (
  select 1 from pg_policies where schemaname in ('public', 'storage')
    and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(role_grants|has_grant|has_cascade_grant|scope_matches|rls_grant_scopes|entity_hierarchy)'));
select pg_temp.ok('anon cannot execute the access helpers', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('rls_has', 'user_permissions', 'access_context', 'access_context_for', 'hull_events_row_allows', 'specifications_row_allows',
                      'orders_row_allows', 'dock_reports_row_allows', 'can_access_entity_ctx', 'my_permissions', 'rls_my_account_company_ids',
                      'rls_my_account_hull_event_ids', 'permissions_register')
    and has_function_privilege('anon', p.oid, 'execute')));
select pg_temp.ok('anon can execute nothing in public', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and has_function_privilege('anon', p.oid, 'execute')));
-- Recovery / magic-link tokens exist only for accounts whose sign_in_method is 'password' (20261011130000_sign_in_method.sql).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', '21111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'zz.sso.only@example.com', now(), '{}', '{}', now(), now(), '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'zz.password@example.com', now(), '{}', '{}', now(), now(), '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '23333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'zz.both@example.com', now(), '{}', '{}', now(), now(), '', '', '', '');
-- zz.sso.only and zz.both are SSO accounts (zz.both keeps the `email` identity every created account has).
update public.users set sign_in_method = 'sso' where id in ('21111111-1111-1111-1111-111111111111', '23333333-3333-3333-3333-333333333333');
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
values ('zz-sso-1', '21111111-1111-1111-1111-111111111111', '{"sub":"zz-sso-1"}', 'azure', now(), now()),
       ('zz.password@example.com', '22222222-2222-2222-2222-222222222222', '{"sub":"22222222-2222-2222-2222-222222222222"}', 'email', now(), now()),
       ('zz-both-1', '23333333-3333-3333-3333-333333333333', '{"sub":"zz-both-1"}', 'azure', now(), now()),
       ('zz.both@example.com', '23333333-3333-3333-3333-333333333333', '{"sub":"23333333-3333-3333-3333-333333333333"}', 'email', now(), now());
insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to) values
  (gen_random_uuid(), '21111111-1111-1111-1111-111111111111', 'recovery_token', 'zz-hash-sso', 'zz.sso.only@example.com'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'recovery_token', 'zz-hash-pw', 'zz.password@example.com'),
  (gen_random_uuid(), '23333333-3333-3333-3333-333333333333', 'recovery_token', 'zz-hash-both', 'zz.both@example.com'),
  (gen_random_uuid(), '21111111-1111-1111-1111-111111111111', 'confirmation_token', 'zz-hash-sso-confirm', 'zz.sso.only@example.com');
select pg_temp.ok('recovery token: discarded without error for an SSO account',
  not exists (select 1 from auth.one_time_tokens where user_id = '21111111-1111-1111-1111-111111111111' and token_type = 'recovery_token'));
select pg_temp.ok('recovery token: discarded for an SSO account that still has an email identity',
  not exists (select 1 from auth.one_time_tokens where token_hash = 'zz-hash-both'));
select pg_temp.ok('recovery token: kept for a password account',
  (select count(*) from auth.one_time_tokens where token_type = 'recovery_token' and user_id = '22222222-2222-2222-2222-222222222222') = 1);
select pg_temp.ok('recovery token: other token types are not touched', exists (select 1 from auth.one_time_tokens where token_hash = 'zz-hash-sso-confirm'));
update auth.one_time_tokens set token_hash = 'zz-hash-pw-2' where token_hash = 'zz-hash-pw';
select pg_temp.ok('recovery token: an update for a password account goes through', exists (select 1 from auth.one_time_tokens where token_hash = 'zz-hash-pw-2'));
select pg_temp.ok('the pre-login email lookup is gone', not exists (select 1 from pg_proc where proname = 'email_has_password_login'));
select pg_temp.ok('the token trigger function cannot be called by signed-in users', not has_function_privilege('authenticated', 'public.discard_recovery_token_for_sso_accounts()', 'execute'));
select pg_temp.ok('anon holds no privilege on any table, view or sequence in public', not exists (
  select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
         or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage, select, update')))));
select pg_temp.ok('signed-in users cannot execute the helpers that take a user id', not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('user_permissions', 'access_context_for', 'user_account_company_ids', 'user_account_hull_event_ids', 'user_has_access')
    and has_function_privilege('authenticated', p.oid, 'execute')));
select pg_temp.eq('signed-in users cannot read another user''s literals', pg_temp.as_user(:jan, format($q$select public.access_context_for(%L)::text$q$, (select id from public.users where email = :max))), 'ERR 42501');
-- (permissions_register: NPM only; a platform module inserts its literals in its migration)

-- ============================ no grants: nothing, except the open lists ============================
select pg_temp.ok('no role: hull events, specifications, orders, dock reports invisible',
  pg_temp.as_user(:jan, 'select (select count(*) from public.hull_events) + (select count(*) from public.specifications) + (select count(*) from public.orders) + (select count(*) from public.dock_reports)') = '0');
select pg_temp.ok('no role: child tables invisible', pg_temp.as_user(:jan, 'select (select count(*) from public.specification_line_items) + (select count(*) from public.dock_report_areas) + (select count(*) from public.order_lines)') = '0');
select pg_temp.ok('no role: vessel and company lists are open', pg_temp.as_user(:jan, 'select count(*) from public.vessels')::int > 0 and pg_temp.as_user(:jan, 'select count(*) from public.companies')::int > 0);
select pg_temp.ok('no role: vessel attachments readable, hull event attachments not',
  pg_temp.as_user(:jan, $q$select count(*) from public.attachments where entity_type = 'vessels'$q$)::int > 0
  and pg_temp.as_user(:jan, $q$select count(*) from public.attachments where entity_type in ('hull_events', 'specifications')$q$) = '0');
select pg_temp.eq('no role: cannot insert a hull event', pg_temp.try(:jan, $q$insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'project_code', null))).* from (select * from src_he) h$q$), 'ERR 42501');
select pg_temp.eq('my_permissions: no role gets none', pg_temp.as_user(:jan, 'select coalesce(array_length(public.my_permissions(), 1), 0)::text'), '0');
-- (my_permissions of the Admin: the platform Admin holds no content literal by itself)

-- ============================ scopes through the policies (hull events) ============================
-- melih (jan 1, jenko 2, melih 3, ugur 4 in pf_users): rows he owns as sales/tsr, in his teams, others
create temp table me as select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu';
create temp table he_mine as select id from public.hull_events where sales_account_user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu')
  or technical_service_rep_user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu');
create temp table he_team as select id from public.hull_events where assigned_team_id in (select team_id from public.user_teams where user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu'));
create temp table he_team_free as select id from he_team t where not exists (select 1 from public.specifications s where s.hull_event_id = t.id)
  and not exists (select 1 from public.dock_reports d where d.hull_event_id = t.id) and not exists (select 1 from public.orders o where o.hull_event_id = t.id);

select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.assigned');
select pg_temp.ok('view.own: exactly the rows I am sales or technical rep of', pg_temp.as_user(:melih, 'select count(*) from public.hull_events')::int = (select count(*) from he_mine) and (select count(*) from he_mine) > 0);
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.team');
select pg_temp.ok('view.team: exactly the rows of my teams', pg_temp.as_user(:melih, 'select count(*) from public.hull_events')::int = (select count(*) from he_team) and (select count(*) from he_team) > 0);
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.team');
select pg_temp.ok('edit.team alone also views the team rows (implied view)', pg_temp.as_user(:melih, 'select count(*) from public.hull_events')::int = (select count(*) from he_team));
select pg_temp.ok('edit.team updates a team row', pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from he_team limit 1))) = '1');
select pg_temp.ok('edit.team cannot update a foreign row', pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from public.hull_events where id not in (select id from he_team) limit 1))) = '0');
select pg_temp.eq('edit.team cannot delete', pg_temp.try(:melih, format('delete from public.hull_events where id = %L', (select id from he_team_free limit 1))), '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.delete.team');
select pg_temp.eq('delete.team deletes a team row (and views it)', pg_temp.try(:melih, format('delete from public.hull_events where id = %L', (select id from he_team_free limit 1))), '1');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.all', 'hull_events.edit.assigned');
select pg_temp.ok('view.all + edit.own: sees everything, edits only own', pg_temp.as_user(:melih, 'select count(*) from public.hull_events')::int = (select count(*) from public.hull_events)
  and pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from he_mine limit 1))) = '1'
  and pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from public.hull_events where id not in (select id from he_mine) limit 1))) = '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.create.team');
select pg_temp.ok('create.team inserts a row for my team only', pg_temp.try(:melih, format($q$insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'project_code', null, 'assigned_team_id', %L))).* from (select * from src_he) h$q$, (select team_id from public.user_teams where user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu') limit 1))) = '1'
  and pg_temp.try(:melih, $q$insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'project_code', null, 'assigned_team_id', null))).* from (select * from src_he) h$q$) = 'ERR 42501');

-- ============================ approve ============================
create temp table sp_team as select id, status from public.specifications where assigned_team_id in (select team_id from public.user_teams where user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu'));
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'specifications.approve.team');
select pg_temp.ok('approve alone: sees team specifications, row function says yes', pg_temp.as_user(:melih, 'select count(*) from public.specifications')::int = (select count(*) from sp_team)
  and pg_temp.as_user(:melih, format($q$select public.can_access_entity('specifications', %L, 'approve')::text$q$, (select id from sp_team limit 1))) = 'true');
select pg_temp.ok('approve alone cannot update (needs edit): inert as documented', pg_temp.try(:melih, format('update public.specifications set id = id where id = %L', (select id from sp_team where status = 'draft' limit 1))) = '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'specifications.edit.team');
select pg_temp.eq('edit without approve: draft editable, under_review frozen (P0001 from the status trigger)',
  pg_temp.try(:melih, format('update public.specifications set id = id where id = %L', (select id from sp_team where status = 'draft' limit 1)))
  || ' / ' || pg_temp.try(:melih, format('update public.specifications set id = id where id = %L', (select id from sp_team where status = 'under_review' limit 1))), '1 / ERR P0001');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'specifications.edit.team', 'specifications.approve.team');
select pg_temp.eq('edit + approve: under_review editable', pg_temp.try(:melih, format('update public.specifications set id = id where id = %L', (select id from sp_team where status = 'under_review' limit 1))), '1');

-- ============================ dock report lock ============================
create temp table dr_locked as select id from public.dock_reports where locked_by_user_id is not null limit 1;
create temp table dr_free as select id from public.dock_reports where locked_by_user_id is null limit 1;
-- one child row under each (copy of the seeded report's first area, if it has one)
insert into public.dock_report_areas select (jsonb_populate_record(null::public.dock_report_areas, to_jsonb(a) || jsonb_build_object('id', gen_random_uuid(), 'dock_report_id', r.id))).*
  from (select * from public.dock_report_areas limit 1) a, (select id from dr_locked union all select id from dr_free) r;
create temp table dr_area as select a.id, a.dock_report_id from public.dock_report_areas a where a.dock_report_id in (select id from dr_locked union all select id from dr_free);
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'dock_reports.edit.all');
select pg_temp.ok('lock: edit.all sees a locked report but cannot update it', pg_temp.as_user(:melih, format('select count(*) from public.dock_reports where id = %L', (select id from dr_locked)))= '1'
  and pg_temp.try(:melih, format('update public.dock_reports set id = id where id = %L', (select id from dr_locked))) = '0');
select pg_temp.ok('lock: an unlocked report is editable', pg_temp.try(:melih, format('update public.dock_reports set id = id where id = %L', (select id from dr_free))) = '1');
update public.dock_reports set locked_by_user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu') where id = (select id from dr_locked);
select pg_temp.ok('lock: the lock holder can update', pg_temp.try(:melih, format('update public.dock_reports set id = id where id = %L', (select id from dr_locked))) = '1');
select pg_temp.eq('lock: children follow the parent (areas of the free report editable, of the one held by me editable)',
  'free ' || pg_temp.try(:melih, format('update public.dock_report_areas set id = id where id = %L', (select id from dr_area where dock_report_id = (select id from dr_free) limit 1)))
  || ' / locked ' || pg_temp.try(:melih, format('update public.dock_report_areas set id = id where id = %L', (select id from dr_area where dock_report_id = (select id from dr_locked) limit 1))),
  'free 1 / locked 1');
select pg_temp.set_role('jenko.harrendorf@nipponpaint-marine.eu', 'dock_reports.edit.all');
select pg_temp.eq('lock: ... and not for another user with edit.all', pg_temp.try('jenko.harrendorf@nipponpaint-marine.eu', format('update public.dock_report_areas set id = id where id = %L', (select id from dr_area where dock_report_id = (select id from dr_locked) limit 1))), '0');
create temp table dr_mine as select id from public.dock_reports where sales_account_user_id = (select id from me) or technical_service_rep_user_id = (select id from me);
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'dock_reports.view.assigned');
select pg_temp.ok('dock report own = sales rep or technical service rep', (select count(*) from dr_mine) > 0 and pg_temp.as_user(:melih, 'select count(*) from public.dock_reports')::int = (select count(*) from dr_mine));

-- ============================ inserts ============================
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'dock_reports.create.all');
select pg_temp.ok('dock report insert: dock_reports.create alone is denied (needs edit on the hull event)',
  pg_temp.try(:melih, format($q$insert into public.dock_reports select (jsonb_populate_record(null::public.dock_reports, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid()))).* from src_dr d where %L is not null$q$, (select id from dr_free))) = 'ERR 42501');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.all');
select pg_temp.eq('... with edit on the hull event the policy passes (stops at the unique hull event index)',
  pg_temp.try(:melih, format($q$insert into public.dock_reports select (jsonb_populate_record(null::public.dock_reports, to_jsonb(d) || jsonb_build_object('id', gen_random_uuid()))).* from src_dr d where %L is not null$q$, (select id from dr_free))), 'ERR 23505');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'orders.create.team');
select pg_temp.ok('manual order insert needs orders.create in scope (team match passes, other team denied)',
  pg_temp.try(:melih, format($q$insert into public.orders select (jsonb_populate_record(null::public.orders, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'order_number', 'SMK-1', 'specification_id', null, 'assigned_team_id', %L))).* from (select * from src_o) o$q$, (select team_id from public.user_teams where user_id = (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu') limit 1))) = '1'
  and pg_temp.try(:melih, $q$insert into public.orders select (jsonb_populate_record(null::public.orders, to_jsonb(o) || jsonb_build_object('id', gen_random_uuid(), 'order_number', 'SMK-2', 'specification_id', null, 'assigned_team_id', null))).* from (select * from src_o) o$q$) = 'ERR 42501');

-- ============================ account scope ============================
-- G group company, S subsidiary of G, O unrelated, P paint supplier party. The generated companies have owners: clear them.
update public.companies set sales_account_user_id = null where name like 'PF company %';
create temp table acc as
  select (select id from public.companies where name = 'PF company 1') g, (select id from public.companies where name = 'PF company 2') s,
         (select id from public.companies where name = 'PF company 3') o, (select id from public.companies where name = 'PF company 4') p;
update public.companies set group_company_id = id, sales_account_user_id = null where id in (select unnest(array[g, s, o, p]) from acc);
update public.companies set group_company_id = (select g from acc) where id = (select s from acc);
-- clean slate: hull events 1..5 of the test data get exact party columns
create temp table he_acc as select id, row_number() over (order by id) n from public.hull_events order by id limit 8;
update public.hull_events set customer_company_id = null, dealer_company_id = null, shipyard_company_id = null, facilitating_partner_company_id = null,
  snapshot_group_owner_company_id = null, snapshot_operator_company_id = null, snapshot_ship_manager_company_id = null, snapshot_technical_manager_company_id = null,
  sales_account_user_id = null, technical_service_rep_user_id = null, assigned_team_id = null
  where id in (select id from he_acc);
update public.hull_events h set customer_company_id = (select s from acc) from he_acc a where h.id = a.id and a.n = 1;              -- customer = subsidiary
update public.hull_events h set shipyard_company_id = (select g from acc) from he_acc a where h.id = a.id and a.n = 2;               -- shipyard = group company
update public.hull_events h set snapshot_ship_manager_company_id = (select o from acc) from he_acc a where h.id = a.id and a.n = 3;   -- somebody else's
update public.hull_events h set dealer_company_id = (select s from acc) from he_acc a where h.id = a.id and a.n = 5;                 -- dealer = subsidiary

select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.account');
select pg_temp.eq('account: holds the literal but owns no company: sees nothing', pg_temp.as_user(:melih, 'select count(*) from public.hull_events'), '0');
update public.companies set sales_account_user_id = (select id from me) where id = (select s from acc);
select pg_temp.ok('account: owner of the subsidiary sees customer and dealer rows (1, 5), not the group company rows',
  (select array_agg(a.n order by a.n) from he_acc a where a.id in (select id from public.hull_events)
     and a.id = any(array(select unnest(string_to_array(pg_temp.as_user(:melih, 'select coalesce(string_agg(id::text, '','') , '''') from public.hull_events'), ',')::uuid[])))) = array[1, 5]::bigint[]);
update public.companies set sales_account_user_id = null where id = (select s from acc);
update public.companies set sales_account_user_id = (select id from me) where id = (select g from acc);
select pg_temp.ok('account: owner of the group company sees its own and its subsidiaries rows (1, 2, 5)',
  (select array_agg(a.n order by a.n) from he_acc a where a.id = any(string_to_array(pg_temp.as_user(:melih, 'select string_agg(id::text, '','') from public.hull_events'), ',')::uuid[])) = array[1, 2, 5]::bigint[]);
select pg_temp.ok('account: strangers do not count (3, 4 invisible)', not exists (
  select 1 from he_acc a where a.n in (3, 4) and a.id = any(string_to_array(pg_temp.as_user(:melih, 'select string_agg(id::text, '','') from public.hull_events'), ',')::uuid[])));
select pg_temp.ok('account: the row function agrees (can_access_entity view)', (select bool_and(
  (pg_temp.as_user(:melih, format($q$select public.can_access_entity('hull_events', %L, 'view')::text$q$, a.id)) = 'true') = (a.n in (1, 2, 5))) from he_acc a));
select pg_temp.ok('account: view literal alone does not edit', pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from he_acc where n = 1))) = '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.account');
select pg_temp.eq('account: edit.account implies view.account and edits account rows only',
  pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from he_acc where n = 2)))
  || '/' || pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from he_acc where n = 3)))
  || '/' || (select array_agg(a.n order by a.n)::text from he_acc a where a.id = any(string_to_array(pg_temp.as_user(:melih, 'select string_agg(id::text, '','') from public.hull_events'), ',')::uuid[])),
  '1/0/{1,2,5}');
select pg_temp.eq('account: edit.account cannot move a row to companies outside the account, and may keep it inside',
  pg_temp.try(:melih, format($q$update public.hull_events set customer_company_id = %L, dealer_company_id = null, facilitating_partner_company_id = null, shipyard_company_id = null,
    snapshot_group_owner_company_id = null, snapshot_operator_company_id = null, snapshot_ship_manager_company_id = null, snapshot_technical_manager_company_id = null where id = %L$q$,
    (select o from acc), (select id from he_acc where n = 2)))
  || '/' || pg_temp.try(:melih, format($q$update public.hull_events set customer_company_id = %L, dealer_company_id = null, facilitating_partner_company_id = null, shipyard_company_id = null,
    snapshot_group_owner_company_id = null, snapshot_operator_company_id = null, snapshot_ship_manager_company_id = null, snapshot_technical_manager_company_id = null where id = %L$q$,
    (select s from acc), (select id from he_acc where n = 2))),
  'ERR 42501/1');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu');
select pg_temp.ok('account: owner without the literal sees nothing', pg_temp.as_user(:melih, 'select count(*) from public.hull_events') = '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.account');
update public.companies set sales_account_user_id = (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu') where id = (select g from acc);
select pg_temp.eq('account: reassigning the company owner moves the access at once', pg_temp.as_user(:melih, 'select count(*) from public.hull_events'), '0');
update public.companies set sales_account_user_id = null where id = (select g from acc);
update public.companies set sales_account_user_id = (select id from me) where id = (select s from acc);
-- the child modules through their hull event and their own customer
create temp table sp_acc as select id, row_number() over (order by id) n from public.specifications order by id limit 3;
set local session_replication_role = replica;   -- setup only: the status triggers distrust every session user but postgres
update public.specifications s set customer_company_id = case a.n when 1 then (select o from acc) else (select o from acc) end,
  hull_event_id = case a.n when 1 then (select id from he_acc where n = 1) when 2 then (select id from he_acc where n = 3) else null end,
  sales_account_user_id = null, assigned_team_id = null from sp_acc a where s.id = a.id;
update public.specifications set customer_company_id = (select s from acc) where id = (select id from sp_acc where n = 3);
update public.specifications set supplier_id = (select s from acc) where id = (select id from sp_acc where n = 2);   -- the paint supplier is not a party   -- Seastock style: no hull event, customer only
reset session_replication_role;
-- every prepared specification gets one line item (the generator spreads them randomly)
set local session_replication_role = replica;
insert into public.specification_line_items select (jsonb_populate_record(null::public.specification_line_items, to_jsonb(l) || jsonb_build_object('id', gen_random_uuid(), 'specification_id', a.id))).*
  from (select * from public.specification_line_items limit 1) l, sp_acc a;
reset session_replication_role;
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'specifications.view.account');
select pg_temp.ok('account: specification matches via its hull event (1) and via its own customer without hull event (3), not through the paint supplier column (2)',
  (select array_agg(a.n order by a.n) from sp_acc a where a.id = any(string_to_array(pg_temp.as_user(:melih, 'select string_agg(id::text, '','') from public.specifications'), ',')::uuid[])) = array[1, 3]::bigint[]);
select pg_temp.ok('account: specification row function agrees', (select bool_and(
  (pg_temp.as_user(:melih, format($q$select public.can_access_entity('specifications', %L, 'view')::text$q$, a.id)) = 'true') = (a.n in (1, 3))) from sp_acc a));
select pg_temp.ok('account: child rows follow the specification', (select count(*) from public.specification_line_items where specification_id in (select id from sp_acc where n in (1, 3))) > 0
  and pg_temp.as_user(:melih, format('select count(*) from public.specification_line_items where specification_id in (%s)', (select string_agg(quote_literal(id), ',') from sp_acc where n = 2))) = '0'
  and pg_temp.as_user(:melih, format('select count(*) from public.specification_line_items where specification_id in (%s)', (select string_agg(quote_literal(id), ',') from sp_acc where n in (1, 3)))) = (select count(*)::text from public.specification_line_items where specification_id in (select id from sp_acc where n in (1, 3))));
create temp table ord_acc as select id, row_number() over (order by id) n from public.orders order by id limit 2;
update public.orders x set customer_company_id = (select a.o from acc a), hull_event_id = case oa.n when 1 then (select id from he_acc where n = 1) else (select id from he_acc where n = 3) end,
  sales_account_user_id = null, assigned_team_id = null from ord_acc oa where x.id = oa.id;
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'orders.view.account');
select pg_temp.eq('account: orders follow their hull event (1 yes, 2 no)',
  (select array_agg(oa.n order by oa.n)::text from ord_acc oa where oa.id = any(string_to_array(pg_temp.as_user(:melih, 'select string_agg(id::text, '','') from public.orders'), ',')::uuid[])), '{1}');
update public.hull_events set customer_company_id = (select s from acc), dealer_company_id = null, shipyard_company_id = null, facilitating_partner_company_id = null,
  snapshot_group_owner_company_id = null, snapshot_operator_company_id = null, snapshot_ship_manager_company_id = null, snapshot_technical_manager_company_id = null
  where id = (select hull_event_id from public.dock_reports where id = (select id from dr_free));
update public.hull_events set customer_company_id = (select o from acc), dealer_company_id = null, shipyard_company_id = null, facilitating_partner_company_id = null,
  snapshot_group_owner_company_id = null, snapshot_operator_company_id = null, snapshot_ship_manager_company_id = null, snapshot_technical_manager_company_id = null
  where id = (select hull_event_id from public.dock_reports where id = (select id from dr_locked));
update public.dock_reports set sales_account_user_id = null, technical_service_rep_user_id = null, assigned_team_id = null where id in (select id from dr_free union all select id from dr_locked);
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'dock_reports.view.account');
select pg_temp.eq('account: dock reports follow their hull event (free yes, locked one no)',
  (select string_agg(k, ',' order by k) from (select 'free' k, id from dr_free union all select 'locked', id from dr_locked) x
     where x.id = any(string_to_array(pg_temp.as_user(:melih, 'select string_agg(id::text, '','') from public.dock_reports'), ',')::uuid[])), 'free');

-- ============================ policy form and row function agree ============================
-- for several role sets x users x the four modules: the rows the policy lets through = the rows can_access_entity('view') says yes to
create temp table agree (who text, roles text, tbl text, mismatches int);
do $$
declare
  v_email text; v_sets text[]; v_set text; v_tbl text; v_mis int; v_ids text; v_expected text;
begin
  foreach v_set in array array['hull_events.view.assigned,specifications.view.assigned,orders.view.assigned,dock_reports.view.assigned',
                               'hull_events.view.team,specifications.view.team,orders.view.team,dock_reports.view.team',
                               'hull_events.edit.team,specifications.edit.assigned,orders.edit.team,dock_reports.edit.assigned',
                               'hull_events.view.account,specifications.view.account,orders.view.account,dock_reports.view.account',
                               'hull_events.view.all,specifications.view.assigned,orders.view.account,dock_reports.view.team'] loop
    foreach v_email in array array['ugur.akbati@nipponpaint-marine.eu', 'jenko.harrendorf@nipponpaint-marine.eu', 'melih.taskin@nipponpaint-marine.eu', 'jan.hoessermann@wilckens.com'] loop
      perform pg_temp.set_role(v_email, variadic string_to_array(v_set, ','));
      foreach v_tbl in array array['hull_events', 'specifications', 'orders', 'dock_reports'] loop
        v_ids := pg_temp.as_user(v_email, format('select coalesce(string_agg(id::text, '','' order by id), '''') from public.%I', v_tbl));
        perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = v_email), 'role', 'authenticated')::text, true);
        execute format('select coalesce(string_agg(id::text, '','' order by id), '''') from public.%I where public.can_access_entity(%L, id, ''view'')', v_tbl, v_tbl) into v_expected;
        insert into agree values (v_email, v_set, v_tbl, case when v_ids = v_expected then 0 else 1 end);
      end loop;
    end loop;
  end loop;
end $$;
select pg_temp.ok('policy and row function agree for ' || count(*) || ' (role set, user, module) combinations', coalesce(sum(mismatches), 1) = 0, 'mismatches: ' || coalesce(sum(mismatches), 0)) from agree;

-- ============================ polymorphic tables, mentions, computed columns ============================
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.team');
select pg_temp.ok('attachments and conversations follow the parent (hull events of my team only)',
  pg_temp.as_user(:melih, $q$select count(*) from public.attachments where entity_type = 'hull_events'$q$)::int
    = (select count(*) from public.attachments a where a.entity_type = 'hull_events' and a.entity_id in (select id from public.hull_events where assigned_team_id in (select team_id from public.user_teams where user_id = (select id from me))))
  and pg_temp.as_user(:melih, $q$select count(*) from public.attachments where entity_type = 'specifications'$q$) = '0');
select pg_temp.ok('writing a comment needs edit on the parent: view only is not enough',
  pg_temp.try(:melih, format($q$insert into public.conversations (kind, anchor_type, anchor_id, title) values ('record', 'hull_events', %L, 'x')$q$, (select id from he_team limit 1))) = 'ERR 42501');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.team');
select pg_temp.ok('... and edit is', pg_temp.try(:melih, format($q$select public.conversation_get_or_create('hull_events', %L)$q$, (select id from he_team limit 1))) = '1');
select pg_temp.eq('vessel attachments: write needs vessels.edit', pg_temp.try(:melih, format($q$insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) select 'vessels', a.entity_id, 'a.pdf', 'smoke/' || gen_random_uuid(), auth.uid() from src_att a where %L is not null$q$, 'x')), 'ERR 42501');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'vessels.edit');
select pg_temp.eq('... and vessels.edit allows it', pg_temp.try(:melih, format($q$insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) select 'vessels', a.entity_id, 'a.pdf', 'smoke/' || gen_random_uuid(), auth.uid() from src_att a where %L is not null$q$, 'x')), '1');
-- mentionable = who may view the record: admins, jenko (view.all) and melih (view.team, member of the row's team), not ugur or jan
select pg_temp.set_role('ugur.akbati@nipponpaint-marine.eu');
select pg_temp.set_role('jan.hoessermann@wilckens.com');
select pg_temp.set_role('jenko.harrendorf@nipponpaint-marine.eu', 'hull_events.view.all', 'orders.view.all');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.team', 'orders.view.team');
select pg_temp.eq('mentionable users on a hull event: exactly who may view it',
  (select string_agg(u.email, ',' order by u.email) from public.users u where u.id::text = any(string_to_array(pg_temp.as_user(:melih, format($q$select string_agg(id::text, ',') from public.mentionable_users('hull_events', %L)$q$, (select id from he_team_free limit 1))), ','))),
  (select string_agg(email, ',' order by email) from public.users where public.is_admin(id) or email in ('jenko.harrendorf@nipponpaint-marine.eu', 'melih.taskin@nipponpaint-marine.eu')));
select pg_temp.ok('mentionable users on an order are no longer empty (orders and dock reports follow the same rule)',
  pg_temp.as_user(:max, format($q$select count(*)::text from public.mentionable_users('orders', %L)$q$, (select id from public.orders limit 1)))::int >= 8);
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.team', 'specifications.edit.team');
select pg_temp.eq('computed can_edit columns follow edit', pg_temp.as_user(:melih, 'select count(*) filter (where public.hull_events_can_edit(h))::text from public.hull_events h'),
  (select count(*)::text from public.hull_events where assigned_team_id in (select team_id from public.user_teams where user_id = (select id from me))));

-- ============================ messages: author only; mentions: one cheap check per mention ============================
create temp table conv_t as select coalesce((select c.id from public.conversations c where c.anchor_type = 'hull_events' and c.anchor_id = x.he),
  gen_random_uuid()) as id, x.he from (select (select id from he_team_free limit 1) as he) x;
insert into public.conversations (id, kind, anchor_type, anchor_id, title) select id, 'record', 'hull_events', he, 'smoke' from conv_t
  on conflict do nothing;
create temp table msg_t as select gen_random_uuid() as mine, gen_random_uuid() as theirs;
insert into public.messages (id, conversation_id, author_user_id, body)
  select mine, (select id from conv_t), (select id from me), 'mine' from msg_t
  union all select theirs, (select id from conv_t), (select id from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu'), 'theirs' from msg_t;
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.team');
select pg_temp.eq('messages: an editor posts as themselves, not as somebody else',
  pg_temp.try(:melih, format($q$insert into public.messages (conversation_id, author_user_id, body) values (%L, %L, 'x')$q$, (select id from conv_t), (select id from me)))
  || '/' || pg_temp.try(:melih, format($q$insert into public.messages (conversation_id, author_user_id, body) values (%L, %L, 'x')$q$, (select id from conv_t), (select id from public.users where email = 'jenko.harrendorf@nipponpaint-marine.eu'))),
  '1/ERR 42501');
-- (editing, deleting, author: COMPASS rules, see the compass_message* tests)
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu');
select pg_temp.eq('messages: lose edit on the record, lose the right to change your own message',
  pg_temp.try(:melih, format($q$update public.messages set body = 'z' where id = %L$q$, (select mine from msg_t))), '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.edit.team');
-- (mentions are parsed from the body on the platform: compass_team_mentions_smoke)
-- (can_mention_user: NPM only)

-- ============================ edit policies test the new row (also for statements without a filter) ============================
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'orders.edit.assigned', 'dock_reports.edit.assigned', 'hull_events.edit.assigned');
create temp table hand_away as select
  (select count(*) from public.orders where sales_account_user_id = (select id from me)) as orders_mine,
  (select count(*) from public.dock_reports where (sales_account_user_id = (select id from me) or technical_service_rep_user_id = (select id from me)) and locked_by_user_id is null) as dock_mine,
  (select count(*) from public.hull_events where sales_account_user_id = (select id from me) or technical_service_rep_user_id = (select id from me)) as he_mine;
select pg_temp.ok('hand-away setup: melih owns orders, dock reports and hull events', (select orders_mine > 0 and dock_mine > 0 and he_mine > 0 from hand_away));
select pg_temp.eq('orders.edit.assigned cannot hand an order to someone else (unfiltered update)',
  pg_temp.try(:melih, format($q$update public.orders set sales_account_user_id = %L$q$, (select id from public.users where email = :jan))), 'ERR 42501');
select pg_temp.eq('dock_reports.edit.assigned cannot hand a report to someone else (unfiltered update)',
  pg_temp.try(:melih, format($q$update public.dock_reports set sales_account_user_id = %L, technical_service_rep_user_id = %L$q$, (select id from public.users where email = :jan), (select id from public.users where email = :jan))), 'ERR 42501');
select pg_temp.eq('hull_events.edit.assigned cannot hand a hull event to someone else (unfiltered update)',
  pg_temp.try(:melih, format($q$update public.hull_events set sales_account_user_id = %L, technical_service_rep_user_id = %L$q$, (select id from public.users where email = :jan), (select id from public.users where email = :jan))), 'ERR 42501');
select pg_temp.eq('orders.edit.assigned: an unfiltered update that keeps the owner works',
  pg_temp.try(:melih, 'update public.orders set sales_account_user_id = sales_account_user_id'), (select orders_mine::text from hand_away));
select pg_temp.eq('dock_reports.edit.assigned: an unfiltered update that keeps the owner works (the locked reports of others stay out)',
  pg_temp.try(:melih, 'update public.dock_reports set sales_account_user_id = sales_account_user_id'), (select dock_mine::text from hand_away));
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'orders.edit.team');
select pg_temp.eq('orders.edit.team cannot move an order to a team of someone else',
  pg_temp.try(:melih, format($q$update public.orders set assigned_team_id = %L$q$, (select id from public.teams where id not in (select team_id from public.user_teams where user_id = (select id from me)) limit 1))), 'ERR 42501');

-- ============================ role permissions are admin-managed ============================
select pg_temp.ok('a non-admin cannot give a role a literal', pg_temp.try(:melih, $q$insert into public.role_permissions (role_id, permission) select id, 'vessels.delete' from public.roles limit 1$q$) = 'ERR 42501');
-- (role permissions: readable by every signed-in user on the platform, as in COMPASS)
select pg_temp.ok('admin manages role permissions', pg_temp.try(:max, $q$insert into public.role_permissions (role_id, permission) select id, 'vessels.delete' from public.roles where name = 'Logistics' on conflict do nothing$q$) in ('0', '1'));

-- ============================ newbuilding projects (table newbuilding_projects, module newbuildings) ============================
-- Projects are governed by newbuildings.*, hull events by hull_events.*; neither module reaches into the other.
-- Rows: own (I am sales rep, no team), team (my team, has a hull event), team2 (my team, none), other (other team, customer = a company I am account owner of), none.
create temp table np_t as select
  (select id from public.phrases where category = 'hull_event_type' and code = 'NB') as nb_phrase,
  (select id from public.phrases where category = 'hull_event_type' and code = 'DD') as dd_phrase,
  (select team_id from public.user_teams where user_id = (select id from me) limit 1) as my_team,
  (select id from public.teams where id not in (select team_id from public.user_teams where user_id = (select id from me)) limit 1) as other_team,
  -- PF company 1-4 are taken by the account-scope tests above (group, subsidiary, unrelated, party); 5 and 6 are plain roots
  (select id from pf_companies where n = 5) as acc_company,
  -- the customer is mandatory; a company that is nobody's account of mine
  (select id from pf_companies where n = 6) as stranger_company;
create temp table np_rows (k text primary key, id uuid);
create function pg_temp.np(p_k text) returns uuid language sql as $$ select id from np_rows where k = p_k $$;
-- a project (as the superuser running this file)
create function pg_temp.mk_np(p_k text, p_sales uuid, p_team uuid, p_customer uuid default null) returns void language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.newbuilding_projects (id, title, sales_account_user_id, assigned_team_id, customer_company_id) values (v_id, 'SMK ' || p_k, p_sales, p_team, coalesce(p_customer, (select stranger_company from np_t)));
  insert into np_rows values (p_k, v_id);
end $$;
-- an NB hull event copied from src_he, optionally inside a project, optionally without a vessel
create function pg_temp.mk_nb(p_k text, p_project uuid, p_vessel boolean default true) returns void language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object(
    'id', v_id, 'type_phrase_id', (select nb_phrase from np_t), 'type_code', 'NB', 'newbuilding_project_id', p_project, 'project_code', null,
    'vessel_id', case when p_vessel then h.vessel_id end, 'supplier_this_hullevent_id', null, 'vertical_af_product_id', null, 'flat_bottom_af_product_id', null))).*
  from src_he h;
  insert into np_rows values (p_k, v_id);
end $$;
update public.companies set sales_account_user_id = (select id from me) where id = (select acc_company from np_t);
select pg_temp.mk_np('own', (select id from me), null);
select pg_temp.mk_np('team', (select id from public.users where email = :jan), (select my_team from np_t));
select pg_temp.mk_np('other', (select id from public.users where email = :jan), (select other_team from np_t), (select acc_company from np_t));
select pg_temp.mk_np('team2', (select id from public.users where email = :jan), (select my_team from np_t));
select pg_temp.mk_np('none', null, null);
select pg_temp.mk_nb('child', pg_temp.np('team'));
select pg_temp.mk_nb('novessel', pg_temp.np('team'), false);

select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.all', 'hull_events.edit.all', 'hull_events.create.all', 'hull_events.delete.all');
select pg_temp.eq('projects: every hull_events literal together shows no project', pg_temp.as_user(:melih, $q$select count(*) from public.newbuilding_projects$q$), '0');
select pg_temp.eq('projects: ... and updates or deletes none',
  pg_temp.try(:melih, format('update public.newbuilding_projects set title = title where id = %L', pg_temp.np('team'))) || '/' || pg_temp.try(:melih, format('delete from public.newbuilding_projects where id = %L', pg_temp.np('team'))), '0/0');
select pg_temp.eq('projects: ... and inserts none', pg_temp.try(:melih, format($q$insert into public.newbuilding_projects (title, customer_company_id, assigned_team_id) values ('x', %L, %L)$q$, (select stranger_company from np_t), (select my_team from np_t))), 'ERR 42501');
select pg_temp.eq('projects: ... but still sees the hull events of a project (ordinary NB hull events)',
  pg_temp.as_user(:melih, format('select count(*) from public.hull_events where id = %L', pg_temp.np('child'))), '1');

select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.assigned');
select pg_temp.eq('newbuildings.view.assigned: my project only', pg_temp.as_user(:melih, $q$select string_agg(title, ',' order by title) from public.newbuilding_projects$q$), 'SMK own');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.team');
select pg_temp.eq('newbuildings.view.team: the projects of my team only', pg_temp.as_user(:melih, $q$select string_agg(title, ',' order by title) from public.newbuilding_projects$q$), 'SMK team,SMK team2');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.all');
select pg_temp.eq('newbuildings.view.all: every project, no hull event',
  pg_temp.as_user(:melih, $q$select (select count(*) from public.newbuilding_projects)::text || '/' || (select count(*) from public.hull_events)$q$), (select count(*) from public.newbuilding_projects)::text || '/0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.account');
select pg_temp.eq('newbuildings.view.account: the project of a company I own', pg_temp.as_user(:melih, $q$select string_agg(title, ',') from public.newbuilding_projects$q$), 'SMK other');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.account');
select pg_temp.eq('hull_events.view.account does not reach a project of a company I own', pg_temp.as_user(:melih, $q$select count(*) from public.newbuilding_projects$q$), '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.account');
update public.newbuilding_projects set customer_company_id = (select stranger_company from np_t), shipyard_company_id = (select acc_company from np_t) where id = pg_temp.np('other');
select pg_temp.eq('newbuildings.view.account: also through the shipyard', pg_temp.as_user(:melih, format('select count(*) from public.newbuilding_projects where id = %L', pg_temp.np('other'))), '1');
update public.newbuilding_projects set shipyard_company_id = null, owner_associate_company_id = (select acc_company from np_t) where id = pg_temp.np('other');
select pg_temp.eq('newbuildings.view.account: ... and through the owner associate', pg_temp.as_user(:melih, format('select count(*) from public.newbuilding_projects where id = %L', pg_temp.np('other'))), '1');
update public.newbuilding_projects set owner_associate_company_id = null where id = pg_temp.np('other');
select pg_temp.eq('newbuildings.view.account: ... but not once no party of the project is my account', pg_temp.as_user(:melih, format('select count(*) from public.newbuilding_projects where id = %L', pg_temp.np('other'))), '0');
update public.newbuilding_projects set customer_company_id = (select acc_company from np_t) where id = pg_temp.np('other');

select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.edit.team');
select pg_temp.eq('newbuildings.edit.team: updates a project of my team (views it by implication), not another team''s',
  pg_temp.try(:melih, format('update public.newbuilding_projects set title = title where id = %L', pg_temp.np('team'))) || '/' || pg_temp.try(:melih, format('update public.newbuilding_projects set title = title where id = %L', pg_temp.np('other'))), '1/0');
select pg_temp.eq('newbuildings.edit.team cannot delete', pg_temp.try(:melih, format('delete from public.newbuilding_projects where id = %L', pg_temp.np('own'))), '0');
select pg_temp.eq('newbuildings.edit.team cannot hand a project to another team',
  pg_temp.try(:melih, format('update public.newbuilding_projects set assigned_team_id = %L where id = %L', (select other_team from np_t), pg_temp.np('team'))), 'ERR 42501');
select pg_temp.eq('computed column can_edit follows edit: team project yes, other no',
  pg_temp.as_user(:melih, format('select newbuilding_projects_can_edit(p)::text from public.newbuilding_projects p where id = %L', pg_temp.np('team'))) || '/'
  || coalesce(pg_temp.as_user(:melih, format('select newbuilding_projects_can_edit(p)::text from public.newbuilding_projects p where id = %L', pg_temp.np('other'))), 'invisible'), 'true/invisible');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.delete.team');
select pg_temp.eq('newbuildings.delete.team: deletes a project of my team (and views it); the foreign key keeps one with hull events',
  pg_temp.try(:melih, format('delete from public.newbuilding_projects where id = %L', pg_temp.np('team'))), 'ERR 23503');
select pg_temp.eq('... a project of my team without hull events goes', pg_temp.try(:melih, format('delete from public.newbuilding_projects where id = %L', pg_temp.np('team2'))), '1');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.create.team');
select pg_temp.eq('newbuildings.create.team: inserts a project for my team only',
  pg_temp.try(:melih, format($q$insert into public.newbuilding_projects (title, customer_company_id, assigned_team_id) values ('x', %L, %L)$q$, (select stranger_company from np_t), (select my_team from np_t)))
  || '/' || pg_temp.try(:melih, format($q$insert into public.newbuilding_projects (title, customer_company_id) values ('x', %L)$q$, (select stranger_company from np_t))), '1/ERR 42501');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.create.assigned');
select pg_temp.eq('newbuildings.create.assigned: inserts a project of mine (the sales rep defaults to the user), not of someone else',
  pg_temp.try(:melih, format($q$insert into public.newbuilding_projects (title, customer_company_id) values ('x', %L)$q$, (select stranger_company from np_t)))
  || '/' || pg_temp.try(:melih, format($q$insert into public.newbuilding_projects (title, customer_company_id, sales_account_user_id) values ('x', %L, %L)$q$, (select stranger_company from np_t), (select id from public.users where email = :jan))), '1/ERR 42501');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.create.team');
select pg_temp.eq('hull_events.create.team does not insert a project',
  pg_temp.try(:melih, format($q$insert into public.newbuilding_projects (title, customer_company_id, assigned_team_id) values ('x', %L, %L)$q$, (select stranger_company from np_t), (select my_team from np_t))), 'ERR 42501');
select pg_temp.eq('a project needs a title', pg_temp.try(:max, format($q$insert into public.newbuilding_projects (title, customer_company_id) values ('  ', %L)$q$, (select stranger_company from np_t))), 'ERR 23514');
select pg_temp.eq('a project needs a customer', pg_temp.try(:max, $q$insert into public.newbuilding_projects (title) values ('x')$q$), 'ERR 23502');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.all', 'newbuildings.edit.all', 'newbuildings.create.all', 'newbuildings.delete.all');
select pg_temp.eq('newbuildings literals (all of them) reach no hull event',
  pg_temp.as_user(:melih, $q$select count(*) from public.hull_events$q$) || '/'
  || pg_temp.try(:melih, format('update public.hull_events set id = id where id = %L', (select id from public.hull_events where type_code = 'DD' limit 1))), '0/0');

-- comments and attachments follow the project's literals (entity type newbuilding_projects)
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.team');
select pg_temp.eq('project record: view needs newbuildings (team: yes, other team: no), hull_events.view.all does not help',
  pg_temp.as_user(:melih, format($q$select public.can_access_entity('newbuilding_projects', %L, 'view')::text$q$, pg_temp.np('team'))) || '/'
  || pg_temp.as_user(:melih, format($q$select public.can_access_entity('newbuilding_projects', %L, 'view')::text$q$, pg_temp.np('other'))), 'true/false');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'hull_events.view.all', 'hull_events.edit.all');
select pg_temp.eq('project record: hull_events literals do not reach it', pg_temp.as_user(:melih, format($q$select public.can_access_entity('newbuilding_projects', %L, 'view')::text$q$, pg_temp.np('team'))), 'false');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.team');
select pg_temp.eq('project attachments: a view-only user cannot upload', pg_temp.try(:melih, format($q$insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) select 'newbuilding_projects', %L, 'a.pdf', 'smoke/' || gen_random_uuid(), auth.uid() from src_att a$q$, pg_temp.np('team'))), 'ERR 42501');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.edit.team');
select pg_temp.eq('project attachments: edit.team uploads to a project of my team, not to another team''s',
  pg_temp.try(:melih, format($q$insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) select 'newbuilding_projects', %L, 'a.pdf', 'smoke/' || gen_random_uuid(), auth.uid() from src_att a$q$, pg_temp.np('team')))
  || '/' || pg_temp.try(:melih, format($q$insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) select 'newbuilding_projects', %L, 'a.pdf', 'smoke/' || gen_random_uuid(), auth.uid() from src_att a$q$, pg_temp.np('other'))), '1/ERR 42501');
select pg_temp.eq('project comments: edit.team starts a conversation on a project of my team',
  pg_temp.try(:melih, format($q$select public.conversation_get_or_create('newbuilding_projects', %L)$q$, pg_temp.np('team'))), '1');
select pg_temp.eq('project record: an unknown project id is refused', pg_temp.try(:max, $q$select public.conversation_get_or_create('newbuilding_projects', gen_random_uuid())$q$), 'ERR P0001');
select pg_temp.eq('project record: @mentions list those who may view the project',
  pg_temp.as_user(:melih, format($q$select (count(*) > 0)::text from public.mentionable_users('newbuilding_projects', %L)$q$, pg_temp.np('team'))), 'true');
insert into public.attachments (entity_type, entity_id, file_name, storage_path, uploaded_by_user_id) select 'newbuilding_projects', pg_temp.np('none'), 'gone.pdf', 'smoke/' || gen_random_uuid(), a.uploaded_by_user_id from src_att a;
insert into public.conversations (kind, anchor_type, anchor_id) values ('record', 'newbuilding_projects', pg_temp.np('none'));
delete from public.newbuilding_projects where id = pg_temp.np('none');
select pg_temp.eq('project record: deleting a project removes its attachments and conversations',
  ((select count(*) from public.attachments where entity_id = pg_temp.np('none')) + (select count(*) from public.conversations where anchor_id = pg_temp.np('none')))::text, '0');
select pg_temp.set_role('melih.taskin@nipponpaint-marine.eu', 'newbuildings.view.all', 'newbuildings.edit.all', 'newbuildings.create.all', 'newbuildings.delete.all');

-- the policy form and the row function agree for projects too
create temp table agree_np (who text, roles text, mismatches int);
do $$
declare
  v_email text; v_set text; v_ids text; v_expected text;
begin
  foreach v_set in array array['newbuildings.view.assigned', 'newbuildings.view.team', 'newbuildings.edit.team', 'newbuildings.view.account', 'newbuildings.view.all',
                               'newbuildings.view.assigned,hull_events.view.all', 'newbuildings.view.team,hull_events.view.team', 'hull_events.view.all'] loop
    foreach v_email in array array['ugur.akbati@nipponpaint-marine.eu', 'jenko.harrendorf@nipponpaint-marine.eu', 'melih.taskin@nipponpaint-marine.eu', 'jan.hoessermann@wilckens.com'] loop
      perform pg_temp.set_role(v_email, variadic string_to_array(v_set, ','));
      v_ids := pg_temp.as_user(v_email, 'select coalesce(string_agg(id::text, '','' order by id), '''') from public.newbuilding_projects');
      perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = v_email), 'role', 'authenticated')::text, true);
      select coalesce(string_agg(id::text, ',' order by id), '') into v_expected from public.newbuilding_projects
        where public.newbuilding_projects_row_allows('view', id, public.access_context_for((select id from public.users where email = v_email)));
      insert into agree_np values (v_email, v_set, case when v_ids = v_expected then 0 else 1 end);
    end loop;
  end loop;
end $$;
select pg_temp.ok('projects: policy and row function agree for ' || count(*) || ' (role set, user) combinations', coalesce(sum(mismatches), 1) = 0, 'mismatches: ' || coalesce(sum(mismatches), 0)) from agree_np;

-- hull event link: only an NB hull event can belong to a project; a vessel-less NB event is fine
select pg_temp.eq('project link: an NB hull event can be added to a project', pg_temp.try(:max, format($q$insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'type_phrase_id', %L, 'type_code', 'NB', 'newbuilding_project_id', %L, 'project_code', null))).* from src_he h$q$, (select nb_phrase from np_t), pg_temp.np('team'))), '1');
select pg_temp.eq('project link: ... also without a vessel', pg_temp.try(:max, format($q$insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'type_phrase_id', %L, 'type_code', 'NB', 'vessel_id', null, 'newbuilding_project_id', %L, 'project_code', null))).* from src_he h$q$, (select nb_phrase from np_t), pg_temp.np('team'))), '1');
select pg_temp.eq('project link: a drydock cannot belong to a project', pg_temp.try(:max, format($q$insert into public.hull_events select (jsonb_populate_record(null::public.hull_events, to_jsonb(h) || jsonb_build_object('id', gen_random_uuid(), 'type_phrase_id', %L, 'type_code', 'DD', 'newbuilding_project_id', %L, 'project_code', null))).* from src_he h$q$, (select dd_phrase from np_t), pg_temp.np('team'))), 'ERR 23514');
select pg_temp.eq('project link: a project with hull events cannot be deleted', pg_temp.try(:max, format('delete from public.newbuilding_projects where id = %L', pg_temp.np('team'))), 'ERR 23503');
select pg_temp.eq('project link: the makers list is gone from the newbuilding details', (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'hull_event_newbuilding_details' and column_name = 'maker_company_ids'), '0');

-- views and vessel-less quotes (migration 20261005100000)
select pg_temp.eq('views: newbuilding_projects_overview counts the hull events of a project (one with a vessel, one without)', (select hull_event_count::text from public.newbuilding_projects_overview where id = pg_temp.np('team')), '2');
select pg_temp.eq('views: the project overview resolves company, rep and team names',
  (select (shipyard_name is null and sales_account_user_name is not null and assigned_team_name is not null and owner_associate_name is null)::text from public.newbuilding_projects_overview where id = pg_temp.np('team')), 'true');
select pg_temp.eq('views: hull_events_overview knows the project of an event', (select newbuilding_project_title from public.hull_events_overview where id = pg_temp.np('child')), 'SMK team');
select pg_temp.ok('views: hull_events_overview has no maker columns, but the litres columns',
  (select count(*) = 0 from information_schema.columns where table_schema = 'public' and table_name = 'hull_events_overview' and column_name like 'newbuilding\_maker%')
  and (select count(*) = 2 from information_schema.columns where table_schema = 'public' and table_name = 'hull_events_overview' and column_name in ('offered_litres', 'ordered_litres')));
select pg_temp.eq('specification: a vessel-less NB event can carry a quote', pg_temp.try(:max, format($q$insert into public.specifications select (jsonb_populate_record(null::public.specifications, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'hull_event_id', %L, 'hull_event_type_code', null, 'vessel_id', null, 'specification_number', 'SMK-NB-1', 'version', 1, 'status', 'draft'))).* from (select * from public.specifications where status = 'accepted' limit 1) s$q$, pg_temp.np('novessel'))), '1');
select pg_temp.eq('specification: any other spec still needs a vessel', pg_temp.try(:max, $q$insert into public.specifications select (jsonb_populate_record(null::public.specifications, to_jsonb(s) || jsonb_build_object('id', gen_random_uuid(), 'hull_event_id', null, 'hull_event_type_code', 'SS', 'vessel_id', null, 'specification_number', 'SMK-SS-1', 'version', 1, 'status', 'draft'))).* from (select * from public.specifications where status = 'accepted' limit 1) s$q$), 'ERR 23514');

\pset format aligned
select n, name, case when ok then 'ok' else 'FAIL' end as result, detail from chk order by n;
select count(*) filter (where not ok) as failed, count(*) as total from chk;
rollback;
