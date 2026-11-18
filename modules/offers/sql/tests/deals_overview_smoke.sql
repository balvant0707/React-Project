-- Copied from ~/npm_tool/supabase/tests/deals_overview_smoke.sql with the renames of test_renames.json.
-- Offers & Orders list (migration 20261023160000_deals_overview.sql): bash supabase/tests/run.sh deals_overview_smoke.sql
-- Runs as the table owner (row security not in play), one transaction, rolled back.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_vessel uuid := (select id from public.vessels order by id limit 1);
  v_supplier uuid := (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1);
  v_tenant uuid := (select id from public.teams order by id limit 1);
  v_spec2 uuid;
  v_order uuid;
begin
  -- Only Seastock offers appear as offers, DD / NB specifications never.
  assert not exists (select 1 from public.deals_overview where kind = 'offer' and deal_type not in ('SS', 'OTHER')), 'DD / NB specifications are not listed as offers';

  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
  values ('SMOKE-DL-1', 1, 'draft', v_vessel, v_supplier, v_tenant, 'EUR', date '2026-12-15');
  assert (select count(*) from public.deals_overview where specification_number = 'SMOKE-DL-1' and kind = 'offer') = 1, 'Seastock offer listed';

  -- Latest version only.
  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
  values ('SMOKE-DL-1', 2, 'draft', v_vessel, v_supplier, v_tenant, 'EUR', date '2026-12-15')
  returning id into v_spec2;
  assert (select count(*) from public.deals_overview where specification_number = 'SMOKE-DL-1') = 1, 'one row per offer';
  assert (select specification_version from public.deals_overview where specification_number = 'SMOKE-DL-1') = 2, 'latest version';

  -- A live order replaces the offer row.
  insert into public.orders (order_number, specification_id, vessel_id, supplier_id, team_id, status_phrase_id)
  values ('SMOKE-DL-O1', v_spec2, v_vessel, v_supplier, v_tenant, (select id from public.phrases where category = 'order_status' order by sequence limit 1))
  returning id into v_order;
  assert not exists (select 1 from public.deals_overview where specification_number = 'SMOKE-DL-1' and kind = 'offer'), 'offer hidden once ordered';
  assert (select deal_type from public.deals_overview where id = v_order) = 'OTHER', 'an order without any hull event is OTHER';
  assert (select deal_type from public.deals_overview where specification_number = 'SMOKE-DL-1' and kind = 'order') = 'OTHER', 'order row type';
  assert (select specification_number from public.deals_overview where id = v_order) = 'SMOKE-DL-1', 'order shows its offer number';

  -- The customer company is exposed for the company page link and the Customer chip.
  update public.orders set customer_company_id = v_supplier where id = v_order;
  update public.specifications set customer_company_id = v_supplier where id = v_spec2;
  assert (select customer_company_id from public.deals_overview where id = v_order) = v_supplier, 'order customer company';

  -- A deleted order brings the offer back.
  update public.orders set deleted_at = now() where id = v_order;
  assert (select count(*) from public.deals_overview where specification_number = 'SMOKE-DL-1' and kind = 'offer') = 1, 'offer back after the order is deleted';
  assert (select customer_company_id from public.deals_overview where specification_number = 'SMOKE-DL-1' and kind = 'offer') = v_supplier, 'offer customer company';
  assert not exists (select 1 from public.deals_overview where id = v_order), 'deleted order not listed';
end $$;

rollback;
select 'ok' as deals_overview_smoke;
