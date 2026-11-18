-- Converted from ~/npm_tool/supabase/seed/03_demo_narrative (dock reports part).sql (tenants -> owner associate teams, groups -> teams).

-- Dock Report demo data for LENA (~/npm_tool/docs/dock-report-module.md) - the only
-- reference spec with real area/coat data, so it's the natural one to carry
-- a realistic dock report too, showcasing the day-paged Daily tab. Dates are
-- relative to current_date (not pinned, unlike everything else in this
-- file) so the "docking underway" window this feature keys off of
-- (indocking_date <= today <= outdocking_date-or-unset) always holds,
-- whenever this seed happens to be (re)applied - an indocking_date 3 days
-- ago with no outdocking_date yet, an open-ended docking still in progress.
-- technical_service_rep_user_id is set explicitly (own-scope anchor for
-- dock_reports, see dock_reports_row_allows) rather than
-- left to default from the hull event, which - deliberately, see the LENA
-- visibility note just above - has none; melih.taskin is the one seeded
-- Technical Service Rep account, this module's primary user.
insert into public.dock_reports (
  hull_event_id, specification_id, report_number, indocking_date, outdocking_date,
  remarks_text, technical_service_rep_user_id
)
select he.id, s.id, 'DR-EURORI-9153-1', current_date - 3, null,
  'Routine antifouling drydock per EURORI 9153-1.',
  (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu')
from public.hull_events he
join public.vessels v on v.id = he.vessel_id
join public.specifications s on s.hull_event_id = he.id
where v.imo = '9347750' and s.specification_number = 'EURORI 9153-1';

-- Areas/coat lines copied straight from the specification - same shape
-- replace_dock_report_children() gives a report created through the app,
-- just done here as plain inserts since seeding has no RPC call to make.
insert into public.dock_report_areas (dock_report_id, area_id, size_m2, substrate_phrase_id, surface_preparation_text)
select dr.id, sa.area_id, sa.size_m2, sa.substrate_phrase_id, sa.surface_preparation_text
from public.dock_reports dr
join public.specifications s on s.id = dr.specification_id
join public.specification_areas sa on sa.specification_id = s.id
where s.specification_number = 'EURORI 9153-1';

insert into public.dock_report_area_products (dock_report_area_id, product_packaging_id, coat_mode_phrase_id, coat_pct, dry_film_thickness_um)
select dra.id, sap.product_packaging_id, sap.coat_mode_phrase_id, sap.coat_pct, sap.dry_film_thickness_um
from public.dock_report_areas dra
join public.dock_reports dr on dr.id = dra.dock_report_id
join public.specifications s on s.id = dr.specification_id
join public.specification_areas sa on sa.specification_id = s.id and sa.area_id = dra.area_id
join public.specification_area_products sap on sap.specification_area_id = sa.id
where s.specification_number = 'EURORI 9153-1';

-- Three days of an in-progress docking: arrival/blast on day 1, blast
-- continuing plus first primer on day 2, primer/first antifouling coat on
-- day 3 (yesterday) - today itself is deliberately left with no log, so
-- opening this report exercises both halves of the Daily tab's default-day
-- logic (falls back to the latest existing day, "day 3", when just viewing;
-- lands on today instead once editing starts, lazily creating its log).
insert into public.dock_report_daily_logs (dock_report_id, log_date, narrative_text)
select dr.id, d.log_date, d.narrative
from public.dock_reports dr
join public.specifications s on s.id = dr.specification_id
join (values
  (current_date - 3, 'Vessel docked. HP freshwater washing completed; blast cleaning (Sa 2) commenced on Flat Bottom.'),
  (current_date - 2, 'Blast cleaning continued on Vertical Sides. Primer coat (ERCC 3900LT) applied to Flat Bottom.'),
  (current_date - 1, 'Primer coat applied to Vertical Sides. First antifouling coat (PSPC 3309) applied to Flat Bottom.')
) as d(log_date, narrative) on true
where s.specification_number = 'EURORI 9153-1';

insert into public.dock_report_activities (
  dock_report_daily_log_id, dock_report_area_id, time_taken, activity_text
)
select ddl.id, dra.id, e.time_taken, e.activity_text
from public.dock_report_daily_logs ddl
join public.dock_reports dr on dr.id = ddl.dock_report_id
join public.specifications s on s.id = dr.specification_id
join public.dock_report_areas dra on dra.dock_report_id = dr.id
join public.spec_areas sarea on sarea.id = dra.area_id
join (values
  (0, '01', '08:30'::time, 'HP freshwater washing, salt residue check - within tolerance.'),
  (1, '02', '09:00'::time, 'Blast cleaning Sa 2, Vertical Sides.'),
  (2, '01', '08:00'::time, 'First antifouling coat (PSPC 3309) applied, Flat Bottom.')
) as e(days_ago, area_code, time_taken, activity_text)
  on ddl.log_date = current_date - (3 - e.days_ago) and sarea.code = e.area_code
where s.specification_number = 'EURORI 9153-1';

insert into public.dock_report_weather_readings (
  dock_report_daily_log_id, time_taken,
  air_temperature_c, surface_temperature_c, dew_point_c, relative_humidity_pct, wind_condition_text
)
select ddl.id, w.time_taken, w.air_c, w.surf_c, w.dew_c, w.humidity, w.wind
from public.dock_report_daily_logs ddl
join public.dock_reports dr on dr.id = ddl.dock_report_id
join public.specifications s on s.id = dr.specification_id
join (values
  (0, '08:30'::time, 22.0, 24.0, 14.0, 65, 'Light breeze, SW'),
  (1, '09:00'::time, 21.5, 23.0, 13.5, 68, 'Calm'),
  (2, '08:00'::time, 20.0, 22.0, 12.0, 60, 'Light breeze, W')
) as w(days_ago, time_taken, air_c, surf_c, dew_c, humidity, wind)
  on ddl.log_date = current_date - (3 - w.days_ago)
where s.specification_number = 'EURORI 9153-1';

with area_products as (
  select drap.id as area_product_id, sarea.code as area_code, p.code as product_code
  from public.dock_report_area_products drap
  join public.dock_report_areas dra on dra.id = drap.dock_report_area_id
  join public.dock_reports dr on dr.id = dra.dock_report_id
  join public.specifications s on s.id = dr.specification_id
  join public.spec_areas sarea on sarea.id = dra.area_id
  join public.product_packagings pp on pp.id = drap.product_packaging_id
  join public.products p on p.id = pp.product_id
  where s.specification_number = 'EURORI 9153-1'
)
insert into public.dock_report_area_product_batches (dock_report_area_product_id, batch_number, drum_quantity, consumption_date)
select ap.area_product_id, b.batch_number, b.drum_qty, current_date - (3 - b.days_ago)
from area_products ap
join (values
  ('01', 'ERCC 3900LT', 'B-2604-11', 12, 0),
  ('02', 'ERCC 3900LT', 'B-2604-12', 10, 1),
  ('01', 'PSPC 3309', 'B-2604-31', 15, 2)
) as b(area_code, product_code, batch_number, drum_qty, days_ago) on b.area_code = ap.area_code and b.product_code = ap.product_code;


