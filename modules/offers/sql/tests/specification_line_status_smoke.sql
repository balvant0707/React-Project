-- Copied from ~/npm_tool/supabase/tests/specification_line_status_smoke.sql with the renames of test_renames.json.
-- Line status, availability answers and the chosen lines on accept / order (migration
-- 20261022100000_specification_line_status_availability.sql): bash supabase/tests/run.sh specification_line_status_smoke.sql
-- Local stack, seeded. Runs as `authenticator` like PostgREST (the lock triggers trust session_user = postgres),
-- signed in as an Admin. One transaction, rolled back; a failed assertion aborts with its message.
\set ON_ERROR_STOP on
begin;

-- A fresh Seastock offer (no hull event) with two lines, and the first DD spec that is accepted.
create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.vessels order by id limit 1) as vessel_id,
  (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1) as supplier_id,
  (select id from public.product_packagings order by id limit 1) as packaging_a,
  (select id from public.product_packagings order by id offset 1 limit 1) as packaging_b,
  (select s.id from public.specifications s
    where s.status = 'accepted' and s.hull_event_type_code = 'DD' and s.vessel_id is not null
      and exists (select 1 from public.specification_line_items li where li.specification_id = s.id)
    order by s.id limit 1) as dd_spec_id,
  null::uuid as spec_id;
grant all on fixture to public;

insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
select 'SMOKE-LS-1', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15'
from fixture f;
update fixture set spec_id = (select id from public.specifications where specification_number = 'SMOKE-LS-1');

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

-- 1. Saving keeps line ids; a new Seastock line is "requested" while nothing was sent.
do $$
declare
  f record;
  v_first uuid;
  v_second uuid;
begin
  select * into f from fixture;
  perform public.replace_specification_children(f.spec_id, jsonb_build_array(
    jsonb_build_object('seq', 1, 'product_packaging_id', f.packaging_a, 'quantity_product', 100, 'offered_qty', 100, 'total_price', 1000),
    jsonb_build_object('seq', 2, 'product_packaging_id', f.packaging_b, 'quantity_product', 40, 'offered_qty', 40, 'total_price', 400, 'comment', '  note  ')
  ), '[]', '[]');
  select id into v_first from public.specification_line_items where specification_id = f.spec_id and sequence = 1;
  select id into v_second from public.specification_line_items where specification_id = f.spec_id and sequence = 2;
  assert (select bool_and(is_requested and is_offered and is_accepted is null) from public.specification_line_items where specification_id = f.spec_id),
    'new Seastock lines: requested, offered, undecided';
  assert (select comment from public.specification_line_items where id = v_second) = 'note', 'comment trimmed';

  perform public.replace_specification_children(f.spec_id, jsonb_build_array(
    jsonb_build_object('id', v_second, 'seq', 1, 'product_packaging_id', f.packaging_b, 'quantity_product', 40, 'offered_qty', 40, 'total_price', 400, 'is_offered', false),
    jsonb_build_object('id', v_first, 'seq', 2, 'product_packaging_id', f.packaging_a, 'quantity_product', 120, 'offered_qty', 120, 'total_price', 1200, 'comment', '')
  ), '[]', '[]');
  assert (select count(*) from public.specification_line_items where specification_id = f.spec_id and id in (v_first, v_second)) = 2, 'ids kept on save';
  assert (select quantity_product from public.specification_line_items where id = v_first) = 120, 'existing line updated';
  assert (select comment from public.specification_line_items where id = v_first) is null, 'empty comment stored as null';
  assert not (select is_offered from public.specification_line_items where id = v_second), 'offer flag saved';
end $$;

-- 2. Email / phone requests: one unsent request is reused, then sent; later lines are not "requested".
do $$
declare
  f record;
  v_request uuid;
  v_again uuid;
  v_first uuid;
  v_new uuid;
  v_ok boolean := false;
begin
  select * into f from fixture;
  v_request := public.prepare_availability_request(f.spec_id, 'email', '2026-12-01');
  v_again := public.prepare_availability_request(f.spec_id, 'email', null);
  assert v_request = v_again, 'unsent request reused';
  assert (select request_number from public.availability_requests where id = v_request) = 'SMOKE-LS-1-A01', 'numbered <spec>-A01';
  assert (select estimated_arrival from public.availability_requests where id = v_request) = '2026-12-01', 'arrival kept';
  assert (select count(*) from public.availability_request_lines where availability_request_id = v_request) = 2, 'snapshot of both lines';
  begin
    perform public.save_availability_answers(v_request, '[]');
  exception when others then v_ok := true;
  end;
  assert v_ok, 'no answer before the request is sent';

  perform public.mark_availability_request_sent(v_request);
  assert (select requested_at is not null and requested_by_user_id = f.admin_id from public.availability_requests where id = v_request), 'marked sent';

  select id into v_first from public.specification_line_items where specification_id = f.spec_id and product_packaging_id = f.packaging_a;
  perform public.save_availability_answers(v_request, jsonb_build_array(jsonb_build_object(
    'id', (select id from public.availability_request_lines where availability_request_id = v_request and specification_line_item_id = v_first),
    'confirmed_qty', 80, 'confirmed_date', '2026-11-20', 'comment', 'rest in December')), 'ENQ-1');
  assert (select confirmed_qty = 80 and answered_by_user_id = f.admin_id and answered_at is not null
          from public.availability_request_lines where availability_request_id = v_request and specification_line_item_id = v_first), 'answer saved';
  assert (select supplier_enquiry_number from public.availability_requests where id = v_request) = 'ENQ-1', 'supplier reference saved';

  -- An alternative added after the request: not requested; its availability goes into the sent request.
  perform public.replace_specification_children(f.spec_id,
    (select jsonb_agg(jsonb_build_object('id', id, 'seq', sequence, 'product_packaging_id', product_packaging_id,
             'quantity_product', quantity_product, 'offered_qty', offered_qty, 'total_price', total_price, 'is_offered', is_offered))
       from public.specification_line_items where specification_id = f.spec_id)
    || jsonb_build_array(jsonb_build_object('seq', 3, 'product_packaging_id', f.packaging_b, 'quantity_product', 60, 'offered_qty', 60, 'total_price', 600)),
    '[]', '[]');
  select id into v_new from public.specification_line_items where specification_id = f.spec_id and sequence = 3;
  assert not (select is_requested from public.specification_line_items where id = v_new), 'line added after the request is not requested';
  assert (select count(*) from public.availability_request_lines where availability_request_id = v_request and specification_line_item_id is not null) = 2,
    'answers stay linked to their lines across saves';

  perform public.set_line_item_availability(v_new, 60, '2026-11-25', null);
  assert (select line_number = 3 and confirmed_qty = 60 from public.availability_request_lines where specification_line_item_id = v_new), 'single line added to the sent request';
  perform public.set_line_item_availability(v_new, null, null, null);
  assert (select confirmed_qty is null and answered_at is null from public.availability_request_lines where specification_line_item_id = v_new), 'single line answer cleared';
end $$;

-- 3. Accept with a choice of lines: the Seastock order gets exactly those; the choice survives the lock.
do $$
declare
  f record;
  v_first uuid;
  v_new uuid;
  v_ok boolean := false;
  v_order uuid;
begin
  select * into f from fixture;
  select id into v_first from public.specification_line_items where specification_id = f.spec_id and product_packaging_id = f.packaging_a;
  select id into v_new from public.specification_line_items where specification_id = f.spec_id and sequence = 3;
  update public.specifications set status = 'approved' where id = f.spec_id;

  begin
    perform public.accept_specification(f.spec_id, array[(select id from public.specification_line_items where specification_id = f.spec_id and not is_offered)]);
  exception when others then v_ok := true;
  end;
  assert v_ok, 'a line outside the offer cannot be accepted';

  perform public.accept_specification(f.spec_id, array[v_first]);
  assert (select status from public.specifications where id = f.spec_id) = 'accepted', 'accepted';
  assert (select is_accepted from public.specification_line_items where id = v_first), 'chosen line accepted';
  assert (select is_accepted = false from public.specification_line_items where id = v_new), 'other offered line declined';
  assert (select is_accepted is null from public.specification_line_items where specification_id = f.spec_id and not is_offered), 'line outside the offer undecided';

  select id into v_order from public.orders where specification_id = f.spec_id;
  assert v_order is not null, 'Seastock order created on accept';
  assert (select count(*) from public.order_lines where order_id = v_order) = 1, 'order has only the accepted line';
  assert (select specification_line_item_id from public.order_lines where order_id = v_order) = v_first, 'order line linked to its spec line';

  update public.specification_line_items set is_accepted = true where id = v_new;
  assert (select is_accepted from public.specification_line_items where id = v_new), 'choice still writable on an accepted spec';
  v_ok := false;
  begin
    update public.specification_line_items set comment = 'changed' where id = v_new;
  exception when others then v_ok := true;
  end;
  assert v_ok, 'other columns stay locked on an accepted spec';
end $$;

-- 4. DD/NB: each Create Order takes its own lines.
do $$
declare
  f record;
  v_line uuid;
  v_order uuid;
begin
  select * into f from fixture;
  if f.dd_spec_id is null then
    raise notice 'skipped: no accepted DD spec with lines in the seed';
    return;
  end if;
  select id into v_line from public.specification_line_items where specification_id = f.dd_spec_id and is_offered order by sequence limit 1;
  v_order := public.create_order_from_specification(f.dd_spec_id, array[v_line]);
  assert (select count(*) from public.order_lines where order_id = v_order) = 1, 'DD order has the chosen line';
  assert (select is_accepted from public.specification_line_items where id = v_line), 'chosen DD line accepted';
end $$;

reset role;
reset session authorization;

select 'ok: specification line status' as result;
rollback;
