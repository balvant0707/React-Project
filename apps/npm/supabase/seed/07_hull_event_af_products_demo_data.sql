-- Converted from ~/npm_tool/supabase/seed/07_hull_event_af_products_demo_data.sql (tenants -> owner associate teams, groups -> teams).
-- Demo suppliers and antifouling products on past drydock/newbuilding hull
-- events - feeds the supplier/product area chart on the company detail page
-- and the vessel list's global supplier treemap. Competitor makers are plain
-- companies with the maker role; our own maker company
-- (own_maker_company_id()) already exists. Products are illustrative names
-- only. Every past DD/NB event gets a supplier (rotating, roughly a third
-- ours) and, for most, a vertical-sides and flat-bottom product of that
-- supplier; a few keep a supplier without products so the chart shows an
-- "unknown product" slice.
insert into public.companies (name, short_code)
select v.name, v.short_code
from (values
  ('Jotun', 'JOTUN'), ('Hempel', 'HEMPEL'), ('International Paint', 'INTERNATIONAL'), ('Chugoku Marine Paints', 'CHUGOKU'),
  ('PPG Marine Coatings', 'PPG'), ('Kansai Paint', 'KANSAI'), ('Boero Bartoletti', 'BOERO'), ('Sherwin-Williams Coatings', 'SHERWIN'),
  ('KCC', 'KCC')
) as v(name, short_code)
where not exists (select 1 from public.companies c where c.name = v.name);

select public.company_add_type(c.id, 'maker')
from public.companies c
where c.name in ('Jotun', 'Hempel', 'International Paint', 'Chugoku Marine Paints', 'PPG Marine Coatings', 'Kansai Paint', 'Boero Bartoletti', 'Sherwin-Williams Coatings', 'KCC');

insert into public.antifouling_products (supplier_id, name)
select s.id, p.product_name
from (values
  ('Nippon Paint Marine', 'LF-Sea 500'), ('Nippon Paint Marine', 'LF-Sea 600 Plus'), ('Nippon Paint Marine', 'Ecoloflex SPC'),
  ('Jotun', 'SeaQuantum X200'), ('Jotun', 'SeaForce 90'), ('Jotun', 'SeaLion 200'),
  ('Hempel', 'Hempaguard X7'), ('Hempel', 'Globic 9000'),
  ('International Paint', 'Intersleek 1100SR'), ('International Paint', 'Intersmooth 7460 HS SPC'),
  ('Chugoku Marine Paints', 'Seaflo Neo'), ('Chugoku Marine Paints', 'Bioclean Ultimate'),
  ('PPG Marine Coatings', 'Sigmaglide 2190'), ('PPG Marine Coatings', 'Sigma Ecofleet'),
  ('Kansai Paint', 'Nautilus SP'), ('Kansai Paint', 'Nautilus CF'),
  ('Boero Bartoletti', 'Boero Fluid 350'), ('Boero Bartoletti', 'Boero Silfluor'),
  ('Sherwin-Williams Coatings', 'Sea Vantage 4200'), ('Sherwin-Williams Coatings', 'Sea Vantage Advantage'),
  ('KCC', 'Seaguard SPC'), ('KCC', 'Seaguard Marathon')
) as p(supplier_name, product_name)
join public.companies s on s.name = p.supplier_name
on conflict (supplier_id, name_normalized) do nothing;

with events as (
  select he.id, row_number() over (order by he.event_date, he.id) as rn
  from public.hull_events he
  join public.phrases ph on ph.id = he.type_phrase_id
  where ph.code in ('DD', 'NB') and he.event_date <= current_date
),
picked as (
  select e.id, e.rn,
    (array[
      'Nippon Paint Marine', 'Jotun', 'Hempel', 'Nippon Paint Marine', 'International Paint', 'Chugoku Marine Paints',
      'Nippon Paint Marine', 'PPG Marine Coatings', 'Jotun', 'Nippon Paint Marine', 'Kansai Paint', 'Hempel',
      'Boero Bartoletti', 'Nippon Paint Marine', 'Sherwin-Williams Coatings', 'International Paint', 'KCC'
    ])[1 + e.rn % 17] as supplier_name
  from events e
)
update public.hull_events he
set supplier_this_hullevent_id = s.id,
    vertical_af_product_id = case when p.rn % 7 = 0 then null else (
      select ap.id from public.antifouling_products ap where ap.supplier_id = s.id
      order by ap.name offset ((p.rn / 8) % 2) limit 1) end,
    flat_bottom_af_product_id = case when p.rn % 7 = 0 then null else (
      select ap.id from public.antifouling_products ap where ap.supplier_id = s.id
      order by ap.name offset ((p.rn / 4) % 2) limit 1) end
from picked p
join public.companies s on s.name = p.supplier_name
where he.id = p.id;

-- companies_vessel_rollup (see
-- 20260923090000_companies_overview_vessel_role_counts.sql, a table since
-- 20261018100000) is populated once, at migration-apply time - before any of the seed data
-- above exists - and otherwise only refreshed by its 5-minute pg_cron job.
-- Without this, every fresh reset or reseed shows every company's vessel
-- counts on the companies list as 0 until the next tick.
select public.refresh_companies_vessel_rollup();

-- Chart colors of the paint makers (companies.chart_color / chart_text_color), used by the supplier treemaps.
-- Matched by name, so this also colors a company imported under the same name; a rerun is harmless.
update public.companies c
set chart_color = v.color, chart_text_color = v.text_color
from (values
  ('Hempel', '#00B5E9', '#000000'),
  ('Jotun', '#F0AB00', '#000000'),
  ('International Paint', '#CB3188', '#ffffff'),
  ('Chugoku Marine Paints', '#0269C6', '#ffffff'),
  ('Nippon Paint Marine', '#09428F', '#ffffff'),
  ('PPG Marine Coatings', '#0272A6', '#ffffff'),
  ('KCC', '#222222', '#ffffff'),
  ('Kansai Paint', '#00205B', '#ffffff')
) as v(name, color, text_color)
where c.name = v.name;
