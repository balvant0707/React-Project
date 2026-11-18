-- Converted from ~/npm_tool/supabase/seed/01_companies_and_phrases.sql (tenants -> owner associate teams, groups -> teams).

-- Each NP tenant is also its own "maker" company record (see domain-model.md
-- "Companies") - lets an accepted specification resolve to a real company
-- row for hull_events.supplier_this_hullevent_id. Companies are created
-- FIRST, tenants second, referencing the company directly at insert time -
-- tenants.company_id is not-null (20260912092000_additional_mandatory_
-- fields.sql), so the previous tenants-then-companies-then-backfill order
-- would insert tenants with no company_id yet and fail immediately.
insert into public.companies (name, short_code) values
  ('NPMTR', 'NPMTR'), ('NPMEU', 'NPMEU'), ('NPMME', 'NPMME');

with t as (insert into public.teams (name) select short_code from public.companies where short_code in ('NPMTR', 'NPMEU', 'NPMME') returning id, name)
insert into public.owner_associate_teams (team_id, company_id, short_code)
  select t.id, c.id, t.name from t join public.companies c on c.short_code = t.name;

-- The tenants' own companies are makers (company type, see migration 20261017120000).
select public.company_add_type(c.id, 'maker')
  from public.companies c join public.teams t on t.id in (select team_id from public.owner_associate_teams) and t.name = c.short_code;

-- Our own maker company (own_maker_company_id(), created by migration
-- 20260920160000) - the supplier set on a hull event once a spec is accepted.
-- The migration runs before this seed, so give it the maker type here.
select public.company_add_type(public.own_maker_company_id(), 'maker');

insert into public.companies (name) values
  ('NPMZ(Z)'), ('NPM Poland');

insert into public.company_teams (company_id, team_id, roles)
  select c.id, t.id, array['supplier']
  from public.companies c cross join (select * from public.teams where id in (select team_id from public.owner_associate_teams)) t
  where c.name in ('NPMZ(Z)', 'NPM Poland');

insert into public.spec_areas (code, name_en, is_immersed, af_zone, sequence) values
  ('01', 'Flat Bottom', true, 'flat_bottom', 1),
  ('02', 'Vertical Sides', true, 'vertical', 2),
  ('03', 'Underwater Area', true, null, 3),
  ('04', 'Bootop', false, 'boottop', 4),
  ('05', 'Topside', false, null, 5);

-- (phrases: see migration 20261110125000_npm_reference_phrases.sql)

-- Attachment categorization for Hull Events - a separate category per
-- entity type (not one shared "attachment_type" list) since a vessel or
-- specification attachment will likely want a different set of options
-- when that dropdown gets added there too (see attachmentsPanel.tsx's
-- per-entity category-key map).
-- (phrases: see migration 20261110125000_npm_reference_phrases.sql)


-- Dock Report module (~/npm_tool/docs/dock-report-module.md, migration
-- 20260926090000_dock_report_module.sql).
-- (phrases: see migration 20261110125000_npm_reference_phrases.sql)
