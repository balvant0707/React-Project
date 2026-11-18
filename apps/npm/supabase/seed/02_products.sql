-- Converted from ~/npm_tool/supabase/seed/02_products.sql (tenants -> owner associate teams, groups -> teams).
insert into public.products (code, name, colour, category_phrase_id, group_phrase_id, is_mix, solids_volume_pct, dry_film_thickness_um)
select 'PR-1001', 'NPM Primer 100', 'Red Oxide',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, 60, 150
union all
select 'AF-2002', 'NPM Antifouling 200', 'Black',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'antifouling'),
  false, 55, 125
union all
select 'TC-3003', 'NPM Topcoat 300', 'White',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'topcoat'),
  false, 50, 50
union all
select 'TH-9001', 'NPM Thinner 900', null,
  (select id from public.phrases where category = 'product_category' and code = 'thinner'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, null, null
union all
select 'EP-4001', 'NPM Epoxy Mix 400', 'Grey',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  true, 65, 200
union all
select 'EP-4001-A', 'NPM Epoxy Mix 400 - Base', 'Grey',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, null, null
union all
select 'EP-4001-B', 'NPM Epoxy Mix 400 - Hardener', null,
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, null, null;

insert into public.product_mix_components (mix_product_id, component_product_id, supplier_id, type, parts_volumetric, parts_gravimetric)
select (select id from products where code = 'EP-4001'), (select id from products where code = 'EP-4001-A'), (select id from public.companies where name = 'NPMZ(Z)'), 'base', 4, 4
union all
select (select id from products where code = 'EP-4001'), (select id from products where code = 'EP-4001-B'), (select id from public.companies where name = 'NPMZ(Z)'), 'hardener', 1, 1;

insert into public.product_packagings (product_id, supplier_id, pack_size, unit, supplier_key)
select p.id, s.id, pack.size, 'L', 'SUPKEY-' || p.code || '-' || pack.size
from public.products p
cross join (select id from public.companies where name = 'NPMZ(Z)') s
cross join (values (20), (200)) as pack(size);

-- Technical Service - not a paint product (no colour/category/solids/DFT,
-- no area coverage of its own), so inserted after the bulk 20L/200L
-- packaging cross-join above rather than being swept into it. Quantity is
-- in days, not liters - pack_size 1 unit 'Days' makes quantity_packed
-- (Areas/PaintListPanel's existing formulas, unchanged) come out as a
-- plain day count. Added by default to every new DD/NB specification's
-- Paint List (see specifications/show.tsx) since a drydock/newbuilding job
-- always has some technical service time attached, unlike the area-priced
-- paint lines which vary per job.
insert into public.products (code, name)
values ('TECH-SVC', 'Technical Service');

insert into public.product_packagings (product_id, supplier_id, pack_size, unit, supplier_key)
select (select id from public.products where code = 'TECH-SVC'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  1, 'Days', 'SUPKEY-TECH-SVC-1';

-- Per-liter, matching domain-model.md's formulas (total_price = sales_price
-- x quantity_packed, no pack_size anywhere) - NOT pack_size * 3.2, which
-- would store a per-package figure and inflate every Areas-view "Price/L"
-- lookup (show.tsx's priceByPackaging reads sales_price straight through) by
-- the pack size, exactly the bug already found and fixed once this session
-- for the LENA reference spec.
insert into public.product_costs (product_packaging_id, cost_price, valid_from)
select id, 3.2, '2026-01-01' from public.product_packagings;

-- Coefficient curve reference data for the DFT proposal feature (see
-- ~/npm_tool/docs/domain-model.md "DFT proposal calculation" and the migration
-- comment in 20260918110000_dft_proposal_coefficients.sql). Real values
-- transcribed from NPM's ADECS-11 Excel calculator (rev. 2, 2022) - genuine
-- reference data, not placeholder demo numbers, unlike the rest of this
-- file. Long-tail decimal values in the source (clearly a formula's
-- floating-point output, not hand-typed) are rounded to 4 decimal places
-- here - more precision than a coating coefficient meaningfully carries.
insert into public.coefficient_curves (kind, name) values
  ('speed', 'ECF 200 / Conventional SPC'),
  ('speed', '150 / 250 HyB / FASTAR'),
  ('speed', '600 series'),
  ('speed', 'AQUATERRAS 1000'),
  ('speed', 'AQUATERRAS 2000'),
  ('temperature', 'ECF 200 / FASTAR'),
  ('temperature', '150 HyB'),
  ('temperature', '250 HyB'),
  ('temperature', '600 series'),
  ('temperature', 'AQUATERRAS 1000'),
  ('temperature', 'AQUATERRAS 2000');

insert into public.coefficient_points (curve_id, x_value, coefficient)
select (select id from public.coefficient_curves where name = 'ECF 200 / Conventional SPC' and kind = 'speed'), x, c
from (values
  (11, 0.74), (12, 0.80), (13, 0.86), (14, 0.93), (15, 1.00), (16, 1.07), (17, 1.14), (18, 1.22),
  (19, 1.30), (20, 1.38), (21, 1.46), (22, 1.54), (23, 1.62), (24, 1.70), (25, 1.78)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = '150 / 250 HyB / FASTAR' and kind = 'speed'), x, c
from (values
  (12, 0.98), (13, 0.98), (14, 0.98), (15, 1.00), (16, 1.03), (17, 1.07), (18, 1.11), (19, 1.15),
  (20, 1.21), (21, 1.28), (22, 1.35), (23, 1.42), (24, 1.55), (25, 1.70)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = '600 series' and kind = 'speed'), x, c
from (values
  (10, 0.94), (11, 0.95), (12, 0.96), (13, 0.97), (14, 0.98), (15, 1.00), (16, 1.03), (17, 1.07),
  (18, 1.11), (19, 1.15), (20, 1.21), (21, 1.28), (22, 1.35), (23, 1.42), (24, 1.55), (25, 1.70)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = 'AQUATERRAS 1000' and kind = 'speed'), x, c
from (values
  -- 11-13 knots: source table marks these '-' (no data) - omitted rather than guessed
  (14, 0.98), (15, 1.00), (16, 1.03), (17, 1.07), (18, 1.11), (19, 1.15), (20, 1.21), (21, 1.28),
  (22, 1.35), (23, 1.42), (24, 1.55), (25, 1.70)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = 'AQUATERRAS 2000' and kind = 'speed'), x, c
from (values
  (11, 0.99), (12, 0.99), (13, 0.99), (14, 0.99), (15, 1.00), (16, 1.03), (17, 1.07), (18, 1.11),
  (19, 1.15), (20, 1.21), (21, 1.28), (22, 1.35), (23, 1.42), (24, 1.55), (25, 1.70)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = 'ECF 200 / FASTAR' and kind = 'temperature'), x, c
from (values
  (15, 0.91), (16, 0.92), (17, 0.93), (18, 0.95), (19, 0.96), (20, 0.97), (21, 0.99), (22, 1.00),
  (23, 1.02), (24, 1.03), (25, 1.05), (26, 1.06), (27, 1.08), (28, 1.09), (29, 1.11), (30, 1.12),
  (31, 1.14), (32, 1.16), (33, 1.17), (34, 1.19)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = '150 HyB' and kind = 'temperature'), x, c
from (values
  (15, 0.91), (16, 0.92), (17, 0.93), (18, 0.94), (19, 0.96), (20, 0.97), (21, 0.98), (22, 1.00),
  (23, 1.03), (24, 1.0505), (25, 1.07), (26, 1.09), (27, 1.12), (28, 1.14), (29, 1.16), (30, 1.18),
  (31, 1.20), (32, 1.22), (33, 1.24), (34, 1.26)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = '250 HyB' and kind = 'temperature'), x, c
from (values
  (15, 0.91), (16, 0.92), (17, 0.93), (18, 0.94), (19, 0.96), (20, 0.97), (21, 0.98), (22, 1.00),
  (23, 1.03), (24, 1.0505), (25, 1.0858), (26, 1.1275), (27, 1.1755), (28, 1.2300), (29, 1.2909),
  (30, 1.3582), (31, 1.4319), (32, 1.5119), (33, 1.5984), (34, 1.6913)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = '600 series' and kind = 'temperature'), x, c
from (values
  (15, 0.91), (16, 0.92), (17, 0.93), (18, 0.94), (19, 0.96), (20, 0.97), (21, 0.98), (22, 1.00),
  (23, 1.03), (24, 1.05), (25, 1.07), (26, 1.09), (27, 1.12), (28, 1.14), (29, 1.16), (30, 1.18),
  (31, 1.20), (32, 1.22), (33, 1.24), (34, 1.26)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = 'AQUATERRAS 1000' and kind = 'temperature'), x, c
from (values
  (15, 0.91), (16, 0.92), (17, 0.93), (18, 0.94), (19, 0.96), (20, 0.97), (21, 0.98), (22, 1.00),
  (23, 1.0738), (24, 1.1476), (25, 1.2214), (26, 1.2953), (27, 1.3691), (28, 1.4429), (29, 1.5167),
  (30, 1.5905), (31, 1.6643), (32, 1.7381), (33, 1.8120), (34, 1.8858), (35, 1.9596)
) as v(x, c)
union all
select (select id from public.coefficient_curves where name = 'AQUATERRAS 2000' and kind = 'temperature'), x, c
from (values
  (15, 0.91), (16, 0.92), (17, 0.93), (18, 0.94), (19, 0.96), (20, 0.97), (21, 0.98), (22, 1.00),
  (23, 1.0512), (24, 1.1145), (25, 1.1898), (26, 1.2772), (27, 1.3766), (28, 1.4881), (29, 1.6117),
  (30, 1.7473), (31, 1.8950), (32, 2.0548), (33, 2.2266), (34, 2.4105), (35, 2.6064)
) as v(x, c);

-- Links the demo antifouling product to a representative coefficient set.
-- Illustrative values (matches the rest of this file's demo-data spirit,
-- not real NPM product data): the 150/250/FASTAR speed curve paired with
-- the 150 HyB temperature curve, a 4 um/month polishing rate (matches the
-- source data's A-LF-Sea 150 / LF-Sea 150HyB entries), a 65% derate for
-- Flat Bottom/Boottop, a 90 um total minimum, and a 150 um per-coat
-- maximum (the source file's old coat-count bands implied ~150 um/coat).
insert into public.product_coefficients (
  product_id, polishing_rate, speed_curve_id, temperature_curve_id,
  max_service_life_months, flat_bottom_derate_pct, boottop_derate_pct,
  minimum_dft_um, maximum_dft_per_coat_um, anchoring_dft_um, anchoring_sea_days_threshold
)
select
  (select id from public.products where code = 'AF-2002'),
  4,
  (select id from public.coefficient_curves where name = '150 / 250 HyB / FASTAR' and kind = 'speed'),
  (select id from public.coefficient_curves where name = '150 HyB' and kind = 'temperature'),
  90, 65, 65, 90, 150, null, null;
