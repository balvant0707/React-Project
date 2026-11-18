-- Copied from ~/npm_tool/supabase/tests/transports_smoke.sql with the renames of test_renames.json.
-- Transports (migration 20261023130000_transports.sql): bash supabase/tests/run.sh transports_smoke.sql
-- Local stack, seeded. Signed in as an Admin through `authenticator`. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.vessels order by id limit 1) as vessel_id,
  (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1) as supplier_id,
  null::uuid as spec_id;
grant all on fixture to public;

insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
select 'SMOKE-TR-1', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15' from fixture f;
update fixture set spec_id = (select id from public.specifications where specification_number = 'SMOKE-TR-1');

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_failed boolean := false;
begin
  select * into f from fixture;
  insert into public.transports (specification_id, planned_date, freight_cost_estimated) values (f.spec_id, date '2026-12-10', 1200);
  assert (select count(*) from public.transports where specification_id = f.spec_id and order_id is null) = 1, 'transport on the offer';

  begin
    insert into public.transports (specification_id) values (f.spec_id);
  exception when unique_violation then v_failed := true;
  end;
  assert v_failed, 'one open transport per specification';

  v_failed := false;
  begin
    insert into public.transports (planned_date) values (date '2026-12-10');
  exception when check_violation or insufficient_privilege then v_failed := true; -- adapted: without the admin overrule the policy refuses first
  end;
  assert v_failed, 'a transport needs an offer or an order';
end $$;

-- Quotes: request two forwarders, enter a price, award one.
do $$
declare
  f record;
  v_transport uuid;
  v_a uuid;
  v_b uuid;
  v_failed boolean := false;
begin
  select * into f from fixture;
  select id into v_transport from public.transports where specification_id = f.spec_id;
  insert into public.transport_quotes (transport_id, forwarder_company_id) values (v_transport, (select id from public.companies order by id limit 1)) returning id into v_a;
  insert into public.transport_quotes (transport_id, forwarder_company_id) values (v_transport, (select id from public.companies order by id offset 1 limit 1)) returning id into v_b;

  begin
    perform public.award_transport_quote(v_a);
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a quote without a price cannot be awarded';

  update public.transport_quotes set status = 'quoted', price = 900 where id = v_a;
  update public.transport_quotes set status = 'quoted', price = 1100 where id = v_b;
  perform public.award_transport_quote(v_a);
  assert (select status from public.transport_quotes where id = v_a) = 'awarded', 'winner awarded';
  assert (select status from public.transport_quotes where id = v_b) = 'rejected', 'other quote rejected';
  assert (select freight_cost_quoted from public.transports where id = v_transport) = 900, 'quoted cost on the transport';
  assert (select forwarder_company_id from public.transports where id = v_transport) = (select forwarder_company_id from public.transport_quotes where id = v_a), 'forwarder on the transport';

  -- A correction of the awarded price reaches the transport; a price change of a rejected quote does not.
  update public.transport_quotes set price = 1050 where id = v_a;
  assert (select freight_cost_quoted from public.transports where id = v_transport) = 1050, 'awarded price change follows';
  update public.transport_quotes set price = 700 where id = v_b;
  assert (select freight_cost_quoted from public.transports where id = v_transport) = 1050, 'rejected quote price does not move the cost';
end $$;

-- The first order of the specification takes over the transport; a second order starts without one.
do $$
declare
  f record;
  v_order uuid;
begin
  select * into f from fixture;
  insert into public.orders (order_number, specification_id, vessel_id, supplier_id, team_id, status_phrase_id)
  select 'SMOKE-TR-O1', f.spec_id, s.vessel_id, s.supplier_id, s.team_id, (select id from public.phrases where category = 'order_status' order by sequence limit 1)
  from public.specifications s where s.id = f.spec_id
  returning id into v_order;
  assert (select order_id from public.transports where specification_id = f.spec_id) = v_order, 'first order takes the transport';
  assert (select specification_id from public.transports where order_id = v_order) = f.spec_id, 'the transport keeps its specification';

  insert into public.orders (order_number, specification_id, vessel_id, supplier_id, team_id, status_phrase_id)
  select 'SMOKE-TR-O2', f.spec_id, s.vessel_id, s.supplier_id, s.team_id, (select id from public.phrases where category = 'order_status' order by sequence limit 1)
  from public.specifications s where s.id = f.spec_id;
  assert (select count(*) from public.transports where specification_id = f.spec_id) = 1, 'second order does not take it';
end $$;

rollback;
select 'ok' as transports_smoke;
