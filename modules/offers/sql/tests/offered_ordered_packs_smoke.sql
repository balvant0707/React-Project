-- Copied from ~/npm_tool/supabase/tests/offered_ordered_packs_smoke.sql with the renames of test_renames.json.
-- Offered / ordered pack quantities (migration 20261027130000_offered_and_ordered_packs.sql) and the view options:
-- bash supabase/tests/run.sh offered_ordered_packs_smoke.sql
-- Local stack, seeded. Runs as `authenticator` like PostgREST, signed in as an Admin. One transaction, rolled back.
-- Checks: every view still runs with its caller's rights (the migration once reset security_invoker on
-- hull_events_overview and so bypassed row level security), offer lines keep packs and quantity, an order created from
-- them copies both, create_order_from_specification / accept_specification take pack counts per line.
\set ON_ERROR_STOP on
begin;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.users where email = 'jan.hoessermann@wilckens.com') as norole_id,
  (select id from public.vessels order by id limit 1) as vessel_id,
  (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1) as supplier_id,
  (select id from public.product_packagings where unit = 'L' and pack_size > 1 order by id limit 1) as packaging_id,
  (select pack_size from public.product_packagings where unit = 'L' and pack_size > 1 order by id limit 1) as pack_size,
  null::uuid as spec_id,
  null::uuid as seastock_spec_id;
grant all on fixture to public;

do $$
declare
  f record;
begin
  select * into f from fixture;
  assert f.packaging_id is not null, 'needs a litre packaging with a pack size above 1';

  -- Views: each one runs with its caller's rights, or it reads the tables as its owner and skips RLS.
  assert not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o where o in ('security_invoker=true', 'security_invoker=on'))),
    'every view in public has security_invoker';

  -- Columns: the offer line has both, quantity_packed is gone, an order line always has its pack count.
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'specification_line_items' and column_name = 'offered_packs'), 'offered_packs exists';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'specification_line_items' and column_name = 'offered_qty'), 'offered_qty exists';
  assert not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'specification_line_items' and column_name = 'quantity_packed'), 'quantity_packed is renamed';
  assert (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'order_lines' and column_name = 'ordered_packs') = 'NO', 'ordered_packs is required';

  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
  values ('SMOKE-PK-1', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15');
  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
  values ('SMOKE-PK-2', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15');
  update fixture set spec_id = (select id from public.specifications where specification_number = 'SMOKE-PK-1'),
                     seastock_spec_id = (select id from public.specifications where specification_number = 'SMOKE-PK-2');
  assert (select count(*) from public.hull_events) > 0, 'needs hull events (the next check compares what a user without a role sees)';
end $$;

-- A user without a role sees no hull events; the overview view must not show more than the table does.
select set_config('request.jwt.claims', json_build_object('sub', (select norole_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;
do $$
begin
  assert (select count(*) from public.hull_events_overview) = (select count(*) from public.hull_events), 'hull_events_overview shows what the user may see';
end $$;
reset role;
reset session authorization;

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_line uuid;
  v_order uuid;
  v_failed boolean;
  ol record;
begin
  select * into f from fixture;

  -- Two offered lines: 3 packs, and 5 packs of the same packaging. Prices are per unit.
  perform public.replace_specification_children(
    f.spec_id,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'product_packaging_id', f.packaging_id, 'quantity_product', 1, 'real_quantity', 1,
                         'offered_qty', 3 * f.pack_size, 'offered_packs', 3, 'sales_price', 10, 'net_price', 10, 'total_price', 30 * f.pack_size)),
    '[]'::jsonb, '[]'::jsonb);
  select id into v_line from public.specification_line_items where specification_id = f.spec_id;
  assert (select offered_packs from public.specification_line_items where id = v_line) = 3, 'offered_packs saved';
  assert (select offered_qty from public.specification_line_items where id = v_line) = 3 * f.pack_size, 'offered_qty saved';

  -- Order from the offer: both numbers are copied, the total is price x quantity.
  v_order := public.create_order_from_specification(f.spec_id);
  select * into ol from public.order_lines where order_id = v_order;
  assert ol.ordered_packs = 3, 'order line copies the packs';
  assert ol.ordered_qty = 3 * f.pack_size, 'order line copies the quantity';
  assert ol.total_price = 10 * 3 * f.pack_size, 'order line total = net price x quantity';

  -- The customer takes other pack counts: the quantity follows the pack size, the total the quantity.
  v_order := public.create_order_from_specification(f.spec_id, null, jsonb_build_object(v_line::text, 2));
  select * into ol from public.order_lines where order_id = v_order;
  assert ol.ordered_packs = 2, 'given pack count is used';
  assert ol.ordered_qty = 2 * f.pack_size, 'quantity = packs x pack size';
  assert ol.total_price = 10 * 2 * f.pack_size, 'total follows the given quantity';
  v_order := public.create_order_from_specification(f.spec_id, null, jsonb_build_object(v_line::text, 5));
  assert (select ordered_packs from public.order_lines where order_id = v_order) = 5, 'more than offered is allowed (the app asks first)';

  v_failed := false;
  begin perform public.create_order_from_specification(f.spec_id, null, jsonb_build_object(v_line::text, 0)); exception when others then v_failed := true; end;
  assert v_failed, 'a pack count of 0 is refused';

  -- Seastock acceptance creates the order by trigger; the pack counts are applied to it afterwards.
  perform public.replace_specification_children(
    f.seastock_spec_id,
    jsonb_build_array(
      jsonb_build_object('seq', 1, 'product_packaging_id', f.packaging_id, 'quantity_product', 1, 'real_quantity', 1,
                         'offered_qty', 4 * f.pack_size, 'offered_packs', 4, 'sales_price', 10, 'net_price', 10, 'total_price', 40 * f.pack_size)),
    '[]'::jsonb, '[]'::jsonb);
  select id into v_line from public.specification_line_items where specification_id = f.seastock_spec_id;
  update public.specifications set status = 'approved' where id = f.seastock_spec_id;
  perform public.accept_specification(f.seastock_spec_id, array[v_line], jsonb_build_object(v_line::text, 1));
  select * into ol from public.order_lines where order_id = (select id from public.orders where specification_id = f.seastock_spec_id and deleted_at is null);
  assert ol.ordered_packs = 1, 'accepting with a pack count orders that many packs';
  assert ol.ordered_qty = f.pack_size, 'and the matching quantity';
  assert ol.total_price = 10 * f.pack_size, 'and the matching total';
end $$;

rollback;
select 'ok' as offered_ordered_packs_smoke;
