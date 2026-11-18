-- Copied from ~/npm_tool/supabase/tests/incoterm_smoke.sql with the renames of test_renames.json.
-- Incoterm (migration 20261023120000_incoterm.sql): bash supabase/tests/run.sh incoterm_smoke.sql
-- An order inserted for a specification starts with the specification's incoterm and place; an explicit value wins.
-- Runs as the table owner, one transaction, rolled back.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_spec uuid;
  v_fob uuid := (select id from public.phrases where category = 'incoterm' and code = 'FOB');
  v_exw uuid := (select id from public.phrases where category = 'incoterm' and code = 'EXW');
  v_order uuid;
begin
  assert (select count(*) from public.phrases where category = 'incoterm') = 11, 'eleven Incoterms 2020';

  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date, incoterm_phrase_id, incoterm_place)
  select 'SMOKE-IT-1', 1, 'draft', (select id from public.vessels order by id limit 1),
         (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1),
         (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15', v_fob, 'Rotterdam'
  returning id into v_spec;

  insert into public.orders (order_number, specification_id, vessel_id, supplier_id, team_id, status_phrase_id)
  select 'SMOKE-IT-O1', v_spec, s.vessel_id, s.supplier_id, s.team_id, (select id from public.phrases where category = 'order_status' order by sequence limit 1)
  from public.specifications s where s.id = v_spec
  returning id into v_order;
  assert (select incoterm_phrase_id from public.orders where id = v_order) = v_fob, 'order takes the incoterm of its specification';
  assert (select incoterm_place from public.orders where id = v_order) = 'Rotterdam', 'order takes the place too';

  insert into public.orders (order_number, specification_id, vessel_id, supplier_id, team_id, status_phrase_id, incoterm_phrase_id)
  select 'SMOKE-IT-O2', v_spec, s.vessel_id, s.supplier_id, s.team_id, (select id from public.phrases where category = 'order_status' order by sequence limit 1), v_exw
  from public.specifications s where s.id = v_spec
  returning id into v_order;
  assert (select incoterm_phrase_id from public.orders where id = v_order) = v_exw, 'an explicit incoterm wins';
  assert (select incoterm_place from public.orders where id = v_order) is null, 'no place copied next to an explicit incoterm';
end $$;

rollback;
select 'ok' as incoterm_smoke;
