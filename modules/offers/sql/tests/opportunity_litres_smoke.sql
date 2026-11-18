-- Copied from ~/npm_tool/supabase/tests/opportunity_litres_smoke.sql with the renames of test_renames.json.
-- Opportunity litres / value (migration 20261025100000_hull_event_opportunity_litres.sql):
-- bash supabase/tests/run.sh opportunity_litres_smoke.sql
-- A hand-set opportunity stays through draft saves and is replaced when the specification is approved.
-- Runs as the table owner, one transaction, rolled back.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_he uuid := (select id from public.hull_events where type_code = 'DD' order by id limit 1);
  v_spec uuid;
  v_pack uuid := (select id from public.product_packagings where unit = 'L' order by id limit 1);
begin
  assert v_he is not null and v_pack is not null, 'needs a DD hull event and a litre packaging';
  update public.hull_events set opportunity_value = 111, opportunity_value_currency = 'USD', opportunity_litres = 222 where id = v_he;

  insert into public.specifications (specification_number, version, status, vessel_id, hull_event_id, supplier_id, team_id, currency, delivery_date)
  select 'SMOKE-OL-1', 1, 'draft', (select id from public.vessels order by id limit 1), v_he,
         (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1),
         (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15'
  returning id into v_spec;
  insert into public.specification_line_items (specification_id, product_packaging_id, quantity_product, offered_qty)
  values (v_spec, v_pack, 50, 50), (v_spec, v_pack, 10, 10);
  update public.specification_line_items set is_offered = false
    where specification_id = v_spec and offered_qty = 10;

  perform public.apply_specification_opportunity_value(v_spec);
  assert (select opportunity_litres from public.hull_events where id = v_he) = 222, 'a draft save leaves the hand-set litres';
  assert (select opportunity_value from public.hull_events where id = v_he) = 111, 'a draft save leaves the hand-set value';

  update public.specifications set status = 'under_review' where id = v_spec;
  assert (select opportunity_litres from public.hull_events where id = v_he) = 222, 'submitting for review leaves them too';

  update public.specifications set status = 'approved' where id = v_spec;
  assert (select opportunity_litres from public.hull_events where id = v_he) = 50,
    'approval takes the offered litres (not offered lines left out)';
  assert (select opportunity_value_currency from public.hull_events where id = v_he) = 'EUR', 'approval takes the currency';

  update public.hull_events set opportunity_litres = 7 where id = v_he;
  assert (select opportunity_litres from public.hull_events where id = v_he) = 7, 'a hand edit after approval stays';
end $$;

rollback;
select 'ok' as opportunity_litres_smoke;
