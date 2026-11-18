-- Converted from ~/npm_tool/supabase/seed/08_newbuilding_projects_demo_data.sql (tenants -> owner associate teams, groups -> teams).
-- Demo newbuilding projects for the Newbuildings list: a few shipyards / owners as companies, then projects across the
-- status pipeline. Makers are our own maker company plus competitors seeded in 07.

insert into public.companies (name, short_code)
select v.name, v.code from (values
  ('Hyundai Heavy Industries', 'HHI'), ('Imabari Shipbuilding', 'IMB'), ('Jiangnan Shipyard', 'JNS'),
  ('Mitsui E&S Shipbuilding', 'MES'), ('Sembcorp Marine', 'SCM'),
  ('Evergreen Marine', 'EVG'), ('Hapag-Lloyd', 'HPL'), ('Stolt Tankers', 'STT')
) as v(name, code)
where not exists (select 1 from public.companies c where c.name = v.name);

insert into public.company_teams (company_id, team_id, roles)
select c.id, t.id, array['customer']
from public.companies c cross join (select * from public.teams where id in (select team_id from public.owner_associate_teams)) t
where t.name = 'NPMEU' and c.name in ('Evergreen Marine', 'Hapag-Lloyd', 'Stolt Tankers')
on conflict (company_id, team_id) do nothing;

select public.company_add_type(c.id, 'shipyard')
from public.companies c
where c.name in ('Hyundai Heavy Industries', 'Imabari Shipbuilding', 'Jiangnan Shipyard', 'Mitsui E&S Shipbuilding', 'Sembcorp Marine');

insert into public.newbuilding_projects
  (title, shipyard_company_id, customer_company_id, owner_associate_company_id, bidding_date, status, lost_reason,
   maker_company_ids, estimated_contract_value, estimated_contract_value_currency, cash_rebate, ship_type,
   sales_account_user_id, created_by_user_id)
select p.title, sy.id, cu.id, ow.id, p.bidding_date::date, p.status, p.lost_reason,
  array[public.own_maker_company_id()] || coalesce((select array_agg(c.id) from public.companies c where c.name = any (p.makers)), '{}'),
  p.value, 'USD', p.rebate, p.ship_type, rep.id, rep.id
from (values
  ('4x 15.000 TEU Container Ship', 'Hyundai Heavy Industries', 'Evergreen Marine', 'Evergreen Marine', '2026-11-15', 'Open', null, array['Jotun'], 1200000, 24000, 'Container Ship'),
  ('6x 7.000 TEU Container Ship', 'Jiangnan Shipyard', 'Hapag-Lloyd', null, '2026-09-01', 'Promising', null, array['Hempel', 'Jotun'], 1850000, 37000, 'Container Ship'),
  ('2x 50.000 DWT Chemical Tanker', 'Mitsui E&S Shipbuilding', 'Stolt Tankers', 'Stolt Tankers', '2026-08-20', 'Secured', null, array[]::text[], 640000, 12800, 'Chemical Tanker'),
  ('3x 82.000 DWT Bulk Carrier', 'Imabari Shipbuilding', 'Evergreen Marine', null, '2026-06-10', 'Lost', 'Competitor price', array['Hempel'], 910000, null, 'Bulk Carrier'),
  ('1x 30.000 DWT Product Tanker', 'Sembcorp Marine', 'Stolt Tankers', null, null, 'Open', null, array[]::text[], null, null, 'Product Tanker')
) as p(title, shipyard, customer, owner_associate, bidding_date, status, lost_reason, makers, value, rebate, ship_type)
join public.companies sy on sy.name = p.shipyard
join public.companies cu on cu.name = p.customer
left join public.companies ow on ow.name = p.owner_associate
cross join (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu') rep
where not exists (select 1 from public.newbuilding_projects n where n.title = p.title);
