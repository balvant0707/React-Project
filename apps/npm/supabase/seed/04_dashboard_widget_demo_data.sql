-- Converted from ~/npm_tool/supabase/seed/04_dashboard_widget_demo_data.sql (tenants -> owner associate teams, groups -> teams).
-- ============================================================================
-- Dashboard widget demo data (2026-09-11) - gives the top-reporter,
-- sales-amount-by-month, and open-hull-events-for-my-customers widgets
-- something meaningful to show. Appended rather than woven into the blocks
-- above so it stays easy to find/adjust on its own; "today" in this demo
-- data is whatever the seed is run on (matches the real system date).
-- ============================================================================

-- Reported-by backfill for the two existing "Report only" hull events -
-- their own inserts predate the reported_by_user_id column.
update public.hull_events he set reported_by_user_id = u.id
from public.vessels v, public.users u
where he.vessel_id = v.id and v.imo = '8613607' and he.status = 'Report only' and u.email = 'jan.hoessermann@wilckens.com';

update public.hull_events he set reported_by_user_id = u.id
from public.vessels v, public.users u
where he.vessel_id = v.id and v.imo = '9000168' and he.status = 'Report only' and u.email = 'johan.wilckens@wilckens.com';

-- Three more "Report only" hull events on already-seeded vessels, spread so
-- a last-12-months window and an all-time window actually differ.
-- snapshot_*_company_id left out below throughout this file, same reasoning
-- as 03_demo_narrative.sql - the trigger derives them from the vessel's own
-- resolved *_company_id, which is exactly what passing v.group_owner would
-- have produced anyway.
insert into public.hull_events (vessel_id, type_phrase_id, status, event_date, reported_by_user_id)
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Report only', '2026-08-01'::date,
  (select id from public.users where email = 'max.wilckens@wilckens.com')
from public.vessels v where v.imo = '9723291'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Report only', '2026-06-01'::date,
  (select id from public.users where email = 'max.wilckens@wilckens.com')
from public.vessels v where v.imo = '8415794'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Report only', '2026-03-01'::date,
  (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu')
from public.vessels v where v.imo = '8501062';

-- A team for max.wilckens to belong to, matching Ugur's own "Sales - NPMEU"
-- membership above, so the "my team" sales widget has something to show for
-- more than one pilot login.
insert into public.user_teams (user_id, team_id)
select u.id, g.id from public.users u cross join public.teams g
where u.email = 'max.wilckens@wilckens.com' and g.name = 'Sales - NPMEU';

-- Gives max.wilckens as sales rep to the company already auto-created (by
-- the vessels_resolve_company_links trigger, see
-- 20260917090000_company_seaweb_auto_resolution.sql) for the "Nord GmbH
-- Reederei" group-owner string shared by three vessels seeded above - drives
-- the "open hull events for my customers" widget. Updating, not inserting:
-- that company row already exists by this point, since those vessels'
-- own insert above ran get_or_create_seaweb_company() on their group_owner
-- text already.
update public.companies c
set sales_account_user_id = u.id
from public.users u
where c.source = 'seaweb' and lower(c.seaweb_match_name) = lower('Nord GmbH Reederei')
  and u.email = 'max.wilckens@wilckens.com';

-- Two Open hull events within the next 6 months (widget window) plus one
-- well outside it, all on Nord-owned vessels - proves the date filter
-- actually excludes something, not just includes everything for this
-- customer.
insert into public.hull_events (vessel_id, type_phrase_id, status, event_date)
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Open', '2026-11-01'::date
from public.vessels v where v.imo = '1025538'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Open', '2027-02-01'::date
from public.vessels v where v.imo = '1025552'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Open', '2027-09-01'::date
from public.vessels v where v.imo = '1025526';

-- Four new Secured hull events, each with one accepted, single-line-item
-- specification - three for max.wilckens as sales rep, one for the
-- "Sales - NPMEU" team (a different sales rep) - across three different
-- delivery months for the "sales amount" widget.
insert into public.hull_events (vessel_id, type_phrase_id, status, event_date)
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', '2026-07-01'::date
from public.vessels v where v.imo = '8502391'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', '2026-08-01'::date
from public.vessels v where v.imo = '8502406'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', '2026-09-01'::date
from public.vessels v where v.imo = '8611984'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', '2026-08-15'::date
from public.vessels v where v.imo = '8509820';

insert into public.specifications (
  hull_event_id, team_id, supplier_id, specification_number, version, status,
  specification_date, delivery_date, currency, exchange_rate, customer_name,
  sales_account_user_id, assigned_team_id
)
select he.id,
  (select id from public.teams where id in (select team_id from public.owner_associate_teams) and name = 'NPMEU'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  x.spec_number, 1, 'draft', x.spec_date, x.delivery_date, 'EUR', 1.0, v.group_owner,
  (select id from public.users where email = x.sales_rep_email),
  case when x.team_name is null then null else (select id from public.teams where name = x.team_name) end
from public.hull_events he
join public.vessels v on v.id = he.vessel_id
join (values
  ('8502391', '26-628117-01', date '2026-07-01', date '2026-07-15', 'max.wilckens@wilckens.com', null),
  ('8502406', '26-628204-01', date '2026-08-01', date '2026-08-20', 'max.wilckens@wilckens.com', null),
  ('8611984', '26-731556-01', date '2026-09-01', date '2026-09-25', 'max.wilckens@wilckens.com', null),
  ('8509820', '26-742983-01', date '2026-08-15', date '2026-08-10', 'jan.hoessermann@wilckens.com', 'Sales - NPMEU')
) as x(imo, spec_number, spec_date, delivery_date, sales_rep_email, team_name) on x.imo = v.imo
where he.status = 'Secured' and he.event_date = x.spec_date;

insert into public.specification_line_items (specification_id, sequence, product_packaging_id, quantity_product, real_quantity, offered_qty, sales_price, discount_pct, net_price, cost_price, gross_profit, gross_profit_pct, total_price, total_gross_profit)
select s.id, 1, pp.id, x.qty, x.qty, x.qty, x.sales_price, 0,
  x.sales_price,
  (select cost_price from public.product_costs where product_packaging_id = pp.id),
  x.sales_price - (select cost_price from public.product_costs where product_packaging_id = pp.id),
  (x.sales_price - (select cost_price from public.product_costs where product_packaging_id = pp.id)) / x.sales_price * 100,
  x.sales_price * x.qty,
  (x.sales_price - (select cost_price from public.product_costs where product_packaging_id = pp.id)) * x.qty
from public.specifications s
join (values
  ('26-628117-01', 6.0, 400),
  ('26-628204-01', 5.8, 600),
  ('26-731556-01', 6.2, 350),
  ('26-742983-01', 5.5, 800)
) as x(spec_number, sales_price, qty) on x.spec_number = s.specification_number
cross join lateral (
  select pp.id from public.product_packagings pp
  join public.products p on p.id = pp.product_id
  where p.code = 'AF-2002' and pp.pack_size = 200
) pp;

update public.specifications s set net_sales = (select coalesce(sum(li.total_price), 0) from public.specification_line_items li where li.specification_id = s.id)
where s.specification_number in ('26-628117-01', '26-628204-01', '26-731556-01', '26-742983-01');

update public.specifications set status = 'accepted'
where specification_number in ('26-628117-01', '26-628204-01', '26-731556-01', '26-742983-01');

-- Pipeline demo data: one not-yet-accepted specification each on an
-- existing Promising and an existing 50/50 hull event (neither had any
-- specification before) - scoped one to max.wilckens, one to the team, so
-- the pipeline series shows up in both flavors of the sales widget.
insert into public.specifications (
  hull_event_id, team_id, supplier_id, specification_number, version, status,
  specification_date, delivery_date, currency, customer_name, sales_account_user_id, assigned_team_id
)
select he.id,
  (select id from public.teams where id in (select team_id from public.owner_associate_teams) and name = 'NPMEU'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  '26-815630-01', 1, 'draft', '2026-11-15', '2026-12-15', 'EUR', v.group_owner,
  (select id from public.users where email = 'max.wilckens@wilckens.com'), null
from public.hull_events he
join public.vessels v on v.id = he.vessel_id
where v.imo = '9101730' and he.status = 'Promising';

insert into public.specifications (
  hull_event_id, team_id, supplier_id, specification_number, version, status,
  specification_date, delivery_date, currency, customer_name, sales_account_user_id, assigned_team_id
)
select he.id,
  (select id from public.teams where id in (select team_id from public.owner_associate_teams) and name = 'NPMEU'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  '26-826471-01', 1, 'draft', '2026-12-20', '2027-01-20', 'EUR', v.group_owner,
  null, (select id from public.teams where name = 'Sales - NPMEU')
from public.hull_events he
join public.vessels v on v.id = he.vessel_id
where v.imo = '8968961' and he.status = '50/50';

insert into public.specification_line_items (specification_id, sequence, product_packaging_id, quantity_product, real_quantity, offered_qty, sales_price, discount_pct, net_price, cost_price, gross_profit, gross_profit_pct, total_price, total_gross_profit)
select s.id, 1, pp.id, x.qty, x.qty, x.qty, x.sales_price, 0,
  x.sales_price,
  (select cost_price from public.product_costs where product_packaging_id = pp.id),
  x.sales_price - (select cost_price from public.product_costs where product_packaging_id = pp.id),
  (x.sales_price - (select cost_price from public.product_costs where product_packaging_id = pp.id)) / x.sales_price * 100,
  x.sales_price * x.qty,
  (x.sales_price - (select cost_price from public.product_costs where product_packaging_id = pp.id)) * x.qty
from public.specifications s
join (values
  ('26-815630-01', 6.5, 500),
  ('26-826471-01', 6.0, 300)
) as x(spec_number, sales_price, qty) on x.spec_number = s.specification_number
cross join lateral (
  select pp.id from public.product_packagings pp
  join public.products p on p.id = pp.product_id
  where p.code = 'AF-2002' and pp.pack_size = 200
) pp;

-- The app assigns hull_events.project_code lazily via
-- generate_specification_number_for_hull_event() on first specification -
-- seed.sql inserts specifications directly, bypassing that, so it has to
-- set project_code itself. Derived from each spec's own number (its
-- "YY-XXXXXX" prefix) rather than re-picking a code here, so the two never
-- drift apart. LENA (EURORI 9153-1) is deliberately excluded - a real
-- transcribed reference number, not part of the new scheme - so its hull
-- event is left with no project_code, same as any hull event with no
-- specification in the new format.
update public.hull_events he
set project_code = left(s.specification_number, 9)
from public.specifications s
where s.hull_event_id = he.id
  and s.specification_number in (
    '26-510442-01', '26-628117-01', '26-628204-01', '26-731556-01', '26-742983-01', '26-815630-01', '26-826471-01'
  );

-- Backfill net_sales for every specification (existing and new) from its
-- actual line items/discounts/surcharge - at most one pct and one amount
-- discount per spec anywhere in this seed file, so this ordering-agnostic
-- formula is exact for all of them (the general client-side reduce in
-- show.tsx handles arbitrary sequences; this mirrors it for the cases that
-- actually occur here).
update public.specifications s
set net_sales =
  coalesce((select sum(li.total_price) from public.specification_line_items li where li.specification_id = s.id), 0)
  * coalesce((select (1 - d.pct / 100.0) from public.specification_discounts d where d.specification_id = s.id and d.discount_type = 'pct' limit 1), 1)
  - coalesce((select sum(d.amount) from public.specification_discounts d where d.specification_id = s.id and d.discount_type = 'amount'), 0)
  + coalesce(s.transport_customs_surcharge, 0)
where s.status = 'draft';

