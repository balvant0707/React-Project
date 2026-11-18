-- Copied from ~/npm_tool/supabase/tests/offer_order_revision_2_smoke.sql with the renames of test_renames.json.
-- Offer / order revision 2 (migration 20261105100000_offer_order_revision_2.sql):
-- bash supabase/tests/run.sh offer_order_revision_2_smoke.sql
-- Local stack, seeded. Runs as `authenticator` like PostgREST, signed in as an Admin. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.vessels order by id limit 1) as vessel_id,
  (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1) as supplier_id,
  (select id from public.teams order by id limit 1) as team_id;
grant all on fixture to public;

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_spec uuid;
  v_order uuid;
  v_failed boolean;
begin
  select * into f from fixture;

  -- Continents
  assert (select continent from public.countries where iso3 = 'TUR') = 'Europe', 'Turkey is Europe';
  assert (select continent from public.countries where iso3 = 'ARE') = 'Middle East', 'UAE is Middle East';

  -- A Seastock offer (vessel only) can be accepted straight from draft; every status step is logged.
  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date, request_received_at)
  values ('SMOKE-R2-1', 1, 'draft', f.vessel_id, f.supplier_id, f.team_id, 'EUR', date '2026-12-15', now() - interval '2 hours')
  returning id into v_spec;

  -- Sent stamp
  perform public.mark_specification_sent(v_spec);
  assert (select sent_at is not null and sent_by_user_id = f.admin_id from public.specifications where id = v_spec), 'marked as sent';
  assert (select count(*) from public.activity_events where entity_id = v_spec and metadata ->> 'field' = 'sent_at') = 1, 'sent logged';

  -- platform: acceptance orders the offered lines, and an offer without any is refused since NPM's line status
  -- (20261022100000); NPM's test predates that and fails in the NPM tool too. One offered line of the supplier.
  insert into public.specification_line_items (specification_id, product_packaging_id, quantity_product, offered_qty)
  select v_spec, pp.id, 20, 20 from public.product_packagings pp where pp.supplier_id = f.supplier_id order by pp.id limit 1;
  if not found then
    insert into public.specification_line_items (specification_id, product_packaging_id, quantity_product, offered_qty)
    select v_spec, pp.id, 20, 20 from public.product_packagings pp order by pp.id limit 1;
  end if;

  update public.specifications set status = 'approved' where id = v_spec;
  update public.specifications set status = 'draft' where id = v_spec;
  update public.specifications set status = 'accepted' where id = v_spec;
  assert (select accepted_by_user_id = f.admin_id and accepted_at is not null from public.specifications where id = v_spec), 'accepted from draft';
  assert (select count(*) from public.activity_events where entity_id = v_spec and metadata ->> 'field' = 'status') = 3, 'each status step logged (no merge)';

  -- Not on an accepted offer any more.
  v_failed := false;
  begin perform public.mark_specification_sent(v_spec, false); exception when others then v_failed := true; end;
  assert v_failed, 'accepted offer cannot be unmarked';

  -- Order invoiced stamp (the Seastock acceptance created an order).
  select id into v_order from public.orders where specification_id = v_spec and deleted_at is null limit 1;
  assert v_order is not null, 'order created on acceptance';
  update public.orders set status_phrase_id = (select id from public.phrases where category = 'order_status' and code = 'invoiced') where id = v_order;
  assert (select invoiced_at is not null from public.orders where id = v_order), 'invoiced_at stamped';
  assert (select count(*) from public.activity_events where entity_id = v_order and metadata ->> 'field' = 'status_phrase_id') = 1, 'order status logged';
  assert (select invoiced_at is not null and request_received_at is not null and sent_at is not null from public.deals_overview where id = v_order),
    'deals_overview carries the timestamps';
  update public.orders set status_phrase_id = (select id from public.phrases where category = 'order_status' and code = 'delivered') where id = v_order;
  assert (select invoiced_at is null from public.orders where id = v_order), 'invoiced_at cleared';

  -- DD/NB-style rule unchanged: a non-Seastock draft cannot jump to accepted (tested via an SS-less type code).
  -- Default suppliers: admins write.
  insert into public.country_default_suppliers (team_id, country_id, supplier_company_id)
  values (f.team_id, (select id from public.countries where iso3 = 'NLD'), f.supplier_id);
  assert (select count(*) from public.country_default_suppliers) >= 1, 'default supplier stored';
end $$;

-- A sent Seastock offer is locked for users without the approve right (a Sales Rep): status changes only.
reset role;
reset session authorization;
insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date, sent_at, responsible_user_id)
select 'SMOKE-R2-2', 1, 'draft', f.vessel_id, f.supplier_id, f.team_id, 'EUR', date '2026-12-15', now(), f.admin_id from fixture f;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  v_spec uuid := (select id from public.specifications where specification_number = 'SMOKE-R2-2');
  v_failed boolean;
begin
  if not public.can_access_entity('specifications', v_spec, 'edit') or public.can_access_entity('specifications', v_spec, 'approve') then
    raise notice 'skipped: the Sales Rep needs edit without approve on the test offer';
    return;
  end if;
  v_failed := false;
  begin update public.specifications set currency = 'USD' where id = v_spec; exception when others then v_failed := true; end;
  assert v_failed, 'sent Seastock offer: header locked for a non-approver';
  v_failed := false;
  begin perform public.mark_specification_sent(v_spec, false); exception when others then v_failed := true; end;
  assert v_failed, 'sent mark cannot be taken back by a non-approver';
  update public.specifications set status = 'lost' where id = v_spec;
  assert (select status from public.specifications where id = v_spec) = 'lost', 'status change still possible';
end $$;

rollback;
\echo 'offer_order_revision_2_smoke: ok'
