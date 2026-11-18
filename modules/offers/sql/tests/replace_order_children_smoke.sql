-- Copied from ~/npm_tool/supabase/tests/replace_order_children_smoke.sql with the renames of test_renames.json.
-- Order lines and discounts in one transaction (migration 20261103100000_replace_order_children.sql):
--   bash supabase/tests/run.sh replace_order_children_smoke.sql
-- Local stack, seeded. Signed in through `authenticator` like PostgREST. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.users where email = 'jan.hoessermann@wilckens.com') as no_role_id,
  (select id from public.product_packagings where supplier_id is not null order by id limit 1) as packaging_a,
  (select id from public.product_packagings where supplier_id is not null order by id offset 1 limit 1) as packaging_b,
  (select id from public.specification_line_items order by id limit 1) as spec_line_id, -- must exist, else the link check is empty
  null::uuid as order_id, null::uuid as line_keep, null::uuid as line_drop;
grant all on fixture to public;

insert into public.orders (order_number, vessel_id, supplier_id, team_id, status_phrase_id, currency)
select 'SMOKE-ROC-1', (select id from public.vessels order by id limit 1),
       (select supplier_id from public.product_packagings where id = f.packaging_a),
       (select id from public.teams order by id limit 1),
       (select id from public.phrases where category = 'order_status' and code = 'confirmed'), 'EUR'
from fixture f;
update fixture set order_id = (select id from public.orders where order_number = 'SMOKE-ROC-1');
insert into public.order_lines (order_id, sequence, product_packaging_id, ordered_qty, ordered_packs, sales_price, specification_line_item_id)
select f.order_id, 1, f.packaging_a, 20, 1, 10, f.spec_line_id from fixture f;
insert into public.order_lines (order_id, sequence, product_packaging_id, ordered_qty, ordered_packs, sales_price)
select f.order_id, 2, f.packaging_b, 20, 1, 10 from fixture f;
insert into public.order_discounts (order_id, name, pct, sequence) select order_id, 'old', 5, 1 from fixture;
update fixture set
  line_keep = (select id from public.order_lines where order_id = fixture.order_id and sequence = 1),
  line_drop = (select id from public.order_lines where order_id = fixture.order_id and sequence = 2);

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_failed boolean := false;
begin
  select * into f from fixture;

  -- Keep line 1 (changed), drop line 2, add a new one; replace the discounts.
  perform public.replace_order_children(f.order_id,
    jsonb_build_array(
      jsonb_build_object('id', f.line_keep, 'seq', 2, 'product_packaging_id', f.packaging_a, 'ordered_qty', 40, 'ordered_packs', 2, 'sales_price', 10, 'net_price', 10, 'total_price', 400),
      jsonb_build_object('id', null, 'seq', 1, 'product_packaging_id', f.packaging_b, 'ordered_qty', 20, 'ordered_packs', 1, 'sales_price', 12)),
    jsonb_build_array(jsonb_build_object('name', 'new', 'discount_type', 'amount', 'amount', 50, 'seq', 1)));

  assert (select count(*) from public.order_lines where order_id = f.order_id) = 2, 'two lines';
  assert (select ordered_packs from public.order_lines where id = f.line_keep) = 2, 'kept line updated in place';
  assert (select sequence from public.order_lines where id = f.line_keep) = 2, 'kept line resequenced';
  assert (select specification_line_item_id from public.order_lines where id = f.line_keep) is not distinct from f.spec_line_id, 'offer line link survives the save';
  assert not exists (select 1 from public.order_lines where id = f.line_drop), 'missing line deleted';
  assert (select string_agg(name || ':' || amount, ',') from public.order_discounts where order_id = f.order_id) = 'new:50', 'discounts replaced';

  -- All or nothing: a line without a product fails the whole call.
  begin
    perform public.replace_order_children(f.order_id,
      jsonb_build_array(jsonb_build_object('id', null, 'seq', 1, 'product_packaging_id', null, 'ordered_qty', 1, 'ordered_packs', 1)),
      '[]'::jsonb);
  exception when not_null_violation then v_failed := true;
  end;
  assert v_failed, 'a broken line is refused';
  assert (select count(*) from public.order_lines where order_id = f.order_id) = 2, 'lines unchanged after the failed call';
  assert (select count(*) from public.order_discounts where order_id = f.order_id) = 1, 'discounts unchanged after the failed call';
  raise notice 'ok   admin: ids kept, link kept, atomic';
end $$;

-- A user without order rights cannot see the order, so the call stops before writing.
select set_config('request.jwt.claims', json_build_object('sub', (select no_role_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
do $$
declare
  v_order uuid;
  v_failed boolean := false;
begin
  select order_id into v_order from fixture;
  begin
    perform public.replace_order_children(v_order, '[]'::jsonb, '[]'::jsonb);
  exception when no_data_found then v_failed := true;
  end;
  assert v_failed, 'no rights: refused';
  raise notice 'ok   no rights: refused';
end $$;

rollback;
