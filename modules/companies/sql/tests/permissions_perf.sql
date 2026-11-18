-- RADAR: NPM's permissions_perf.sql with its data generator (permissions_test_data.sql) inlined, adapted to the platform tables (attachments.file_name, record conversations by anchor).
-- Run: bash tools/sql-test.sh npm platform/sql/tests/npm_permissions_perf.sql   (~1 min, rolled back). Compare the ms columns
-- with the same probe in the NPM tool.
-- Permission performance check: psql -f supabase/tests/permissions_perf.sql (local stack, seeded). Everything is rolled back.
-- Generates ~10.7k hull events, ~10.8k specifications, ~3k orders, ~2k dock reports and tens of thousands of
-- attachments/conversations/messages by copying the seeded rows (triggers and FKs off), then times the queries the
-- list pages and the polymorphic tables run as five users (Sales Rep, Manager, Technical Service Rep, a user
-- without a role, Admin). Run it before and after a change to the access model and compare the "ms" columns.
-- Works on the old (role_grants) and the new (permission literals) schema: it only touches data and roles by name.
\pset pager off
\set ON_ERROR_STOP on
begin;
-- psql -v apply_migration=1: apply the permission literals migration inside the transaction first (to time it before it is committed)
-- Copied from ~/npm_tool/supabase/tests/permissions_test_data.sql with the renames and platform adaptations.
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

select 'rows' as what, (select count(*) from public.hull_events) hull_events, (select count(*) from public.specifications) specifications,
       (select count(*) from public.orders) orders, (select count(*) from public.dock_reports) dock_reports,
       (select count(*) from public.attachments) attachments, (select count(*) from public.messages) messages, (select count(*) from public.companies) companies;

create temp table pf_result (who text, probe text, ms numeric, n bigint);
grant all on pf_result to authenticated;
create or replace function pg_temp.pf_time(p_who text, p_email text, p_probe text, p_sql text) returns void language plpgsql as $$
declare t0 timestamptz; v bigint; i int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..2 loop  -- second run counts: warm caches, same as a user paging a list
    t0 := clock_timestamp();
    execute p_sql into v;
    if i = 2 then
      execute 'reset role';
      insert into pf_result values (p_who, p_probe, round(extract(epoch from clock_timestamp() - t0) * 1000, 1), v);
      execute 'set local role authenticated';
    end if;
  end loop;
  execute 'reset role';
end $$;

create or replace function pg_temp.pf_run() returns void language plpgsql as $$
declare u record; q record;
begin
  for u in select * from (values ('Sales Rep', 'ugur.akbati@nipponpaint-marine.eu'), ('Technical Service Rep', 'melih.taskin@nipponpaint-marine.eu'),
                                 ('no role', 'jan.hoessermann@wilckens.com'), ('Admin', 'max.wilckens@wilckens.com')) v (who, email) loop
    for q in select * from (values
      ('hull_events count', 'select count(*) from public.hull_events'),
      ('hull_events_overview page', 'select count(*) from (select * from public.hull_events_overview order by created_at desc limit 50) x'),
      ('hull_events_overview count', 'select count(*) from public.hull_events_overview'),
      ('specifications count', 'select count(*) from public.specifications'),
      ('specifications_overview page', 'select count(*) from (select * from public.specifications_overview order by specification_date desc limit 50) x'),
      ('orders count', 'select count(*) from public.orders'),
      ('orders_overview page', 'select count(*) from (select * from public.orders_overview order by created_at desc limit 50) x'),
      ('dock_reports count', 'select count(*) from public.dock_reports'),
      ('dock_reports_overview page', 'select count(*) from (select * from public.dock_reports_overview order by created_at desc limit 50) x'),
      ('specification_line_items count', 'select count(*) from public.specification_line_items'),
      ('attachments count', 'select count(*) from public.attachments'),
      ('conversations count', 'select count(*) from public.conversations'),
      ('messages count', 'select count(*) from public.messages'),
      ('global_search', $s$select count(*) from public.global_search('MSC', 20)$s$),
      ('vessels_overview page (open list)', 'select count(*) from (select * from public.vessels_overview order by name limit 100) x'),
      ('companies_overview page (open list)', 'select count(*) from (select * from public.companies_overview order by name limit 100) x')
    ) v (probe, sql) loop
      begin
        perform pg_temp.pf_time(u.who, u.email, q.probe, q.sql);
      exception when others then
        execute 'reset role';
        insert into pf_result values (u.who, q.probe || ' [ERROR ' || sqlerrm || ']', null, null);
      end;
    end loop;
  end loop;
end $$;
select pg_temp.pf_run();
\pset format aligned
select probe, max(ms) filter (where who = 'Sales Rep') as "Sales Rep ms", max(n) filter (where who = 'Sales Rep') as "rows",
       max(ms) filter (where who = 'Technical Service Rep') as "TSR ms", max(ms) filter (where who = 'no role') as "no role ms",
       max(ms) filter (where who = 'Admin') as "Admin ms"
from pf_result group by probe order by min(ctid);
rollback;
