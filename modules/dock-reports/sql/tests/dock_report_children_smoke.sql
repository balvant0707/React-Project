-- replace_dock_report_children keeps to its own report (migration 20261113110000_npm_dock_report_children_own_areas.sql):
--   tools/sql-test.sh npm platform/sql/tests/dock_report_children_smoke.sql
-- Local RADAR stack, seeded (03b_dock_reports_demo.sql brings a report with areas). Signed in through `authenticator` like
-- PostgREST. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;

-- Report A: the seeded one with areas. Report B: a new, empty one on a DD/NB hull event that has none yet.
create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select r.id from public.dock_reports r where exists (select 1 from public.dock_report_areas a where a.dock_report_id = r.id)
     order by r.id limit 1) as report_a,
  null::uuid as report_b, null::uuid as area_a, null::text as remarks_a, 0::bigint as products_a;
grant all on fixture to public;

insert into public.dock_reports (hull_event_id, specification_id)
select h.id, (select s.id from public.specifications s where s.hull_event_id = h.id order by s.id limit 1)
from public.hull_events h
where h.type_code in ('DD', 'NB')
  and not exists (select 1 from public.dock_reports d where d.hull_event_id = h.id)
  and exists (select 1 from public.specifications s where s.hull_event_id = h.id)
order by h.id limit 1;
update fixture set
  report_b = (select r.id from public.dock_reports r where r.id <> fixture.report_a order by r.created_at desc, r.id desc limit 1),
  area_a = (select a.id from public.dock_report_areas a where a.dock_report_id = fixture.report_a order by a.id limit 1);
update fixture set
  remarks_a = (select remarks_text from public.dock_report_areas where id = fixture.area_a),
  products_a = (select count(*) from public.dock_report_area_products where dock_report_area_id = fixture.area_a);

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_failed boolean := false;
begin
  select * into f from fixture;
  assert f.report_a is not null and f.report_b is not null and f.area_a is not null, 'fixture: two reports, an area on A';

  -- Saving B with A's area id is refused; A's area and its coat lines stay as they were.
  begin
    perform public.replace_dock_report_children(f.report_b,
      jsonb_build_array(jsonb_build_object('id', f.area_a, 'remarks_text', 'smoke: overwritten', 'products', '[]'::jsonb)));
  exception when raise_exception then v_failed := true;
  end;
  assert v_failed, 'an area of another report is refused';
  assert (select dock_report_id from public.dock_report_areas where id = f.area_a) = f.report_a, 'area stays on report A';
  assert (select remarks_text from public.dock_report_areas where id = f.area_a) is not distinct from f.remarks_a, 'area A unchanged';
  assert (select count(*) from public.dock_report_area_products where dock_report_area_id = f.area_a) = f.products_a, 'coat lines of A kept';
  assert not exists (select 1 from public.dock_report_areas where dock_report_id = f.report_b), 'nothing written to B';

  -- Saving A's own area still updates it in place.
  perform public.replace_dock_report_children(f.report_a,
    (select jsonb_agg(jsonb_build_object('id', a.id, 'area_id', a.area_id,
       'remarks_text', case when a.id = f.area_a then 'smoke: own save' else a.remarks_text end, 'products', '[]'::jsonb))
     from public.dock_report_areas a where a.dock_report_id = f.report_a));
  assert (select remarks_text from public.dock_report_areas where id = f.area_a) = 'smoke: own save', 'own area updated';

  -- A new area (new id) on B is still added.
  perform public.replace_dock_report_children(f.report_b,
    jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'remarks_text', 'smoke: new', 'products', '[]'::jsonb)));
  assert (select count(*) from public.dock_report_areas where dock_report_id = f.report_b) = 1, 'new area added to B';
  raise notice 'ok   own areas only, own save and new area still work';
end $$;

rollback;
