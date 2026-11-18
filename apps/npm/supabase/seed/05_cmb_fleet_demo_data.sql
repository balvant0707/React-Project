-- Converted from ~/npm_tool/supabase/seed/05_cmb_fleet_demo_data.sql (tenants -> owner associate teams, groups -> teams).
-- CMB fleet demo data - requested directly (not derived from
-- 03_demo_narrative.sql's own curated set): CMB.Tech NV and CMB NV,
-- anchored as SeaWeb-sourced companies (matching the get_or_create pattern,
-- see 20260917090000_company_seaweb_auto_resolution.sql) with CMB.Tech NV
-- as CMB NV's group company, per the request - then every vessel from the
-- provided SeaWeb export associated with either company, transcribed
-- verbatim from that export (Group Owner/Operator/Ship Manager/Technical
-- Manager + country exactly as given, including its own occasional
-- inconsistencies, e.g. a couple of rows list a different Group Owner
-- Country than the vessel's own flag - not corrected here, since that's
-- the source data, not a transcription error). Flag cross-referenced by
-- IMO from the same SeaWeb ship data export (Reference documents/Demo
-- Data/Seaweb Ship Data All_20260526.xlsx), which the pasted table itself
-- didn't include. No hull events are created for these vessels - the
-- source table's own NP DD/NP NB columns show none exist yet for this
-- fleet, so none are fabricated here either.
--
-- CMB Tech Belgium NV and CMB.Tech Enterprises NV (each appearing on
-- exactly one vessel) are deliberately left to auto-create as their own
-- companies, same as any other SeaWeb text - they're spelling/entity
-- variants, not confirmed to be the same legal entity as CMB.Tech NV, and
-- merging them wasn't part of the request.
insert into public.companies (name, source, seaweb_match_name)
values
  ('CMB.Tech NV', 'seaweb', 'CMB.Tech NV'),
  ('CMB NV', 'seaweb', 'CMB NV');

-- Direct inserts bypass get_or_create_seaweb_company, so give these two
-- SeaWeb companies the customer role for every tenant explicitly.
insert into public.company_teams (company_id, team_id, roles)
select c.id, t.id, array['customer']
from public.companies c
cross join (select * from public.teams where id in (select team_id from public.owner_associate_teams)) t
where c.source = 'seaweb' and c.seaweb_match_name in ('CMB.Tech NV', 'CMB NV');

update public.companies
set group_company_id = (select id from public.companies where source = 'seaweb' and seaweb_match_name = 'CMB.Tech NV')
where source = 'seaweb' and seaweb_match_name = 'CMB NV';

insert into public.vessels (imo, name, deadweight_tonnage, gross_tonnage, flag, ship_type, group_owner, group_owner_country, ship_manager, ship_manager_country, technical_manager, technical_manager_country, operator, operator_country, built_date, status)
values
  ('9995337', 'WINDCAT ROTTERDAM', 2036, 6711, 'Belgium', 'Commissioning Service Operation Vessel', 'CMB NV', 'Belgium', 'Windcat Workboats BV', 'Netherlands', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'Windcat Workboats BV', 'Netherlands', '2025-01-01', 'In Service/Commission'),
  ('1019931', 'WINDCAT HAARLEM', 2036, 6711, 'Belgium', 'Commissioning Service Operation Vessel', 'CMB NV', 'Netherlands', 'Windcat Workboats BV', 'Netherlands', 'Anglo-Eastern Antwerp NV', null, 'Windcat Workboats BV', 'Netherlands', '2026-01-01', 'In Service/Commission'),
  ('9995349', 'WINDCAT AMSTERDAM', 2036, 6711, 'Belgium', 'Commissioning Service Operation Vessel', 'CMB NV', 'Belgium', 'Windcat Workboats BV', 'Netherlands', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'Windcat Workboats BV', 'Netherlands', '2025-01-01', 'In Service/Commission'),
  ('9789324', 'WEPION', 28468, 25248, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2018-01-01', 'In Service/Commission'),
  ('9659139', 'WARISOULX', 28590, 25143, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9659103', 'WAASMUNSTER', 28518, 25320, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9658965', 'UNITY ADVENTURE', 60436, 34241, 'Bahamas', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Unity Team Ltd', 'United Kingdom', 'Unity Ship Management Ltd', 'United Kingdom', 'Unity Team Ltd', 'United Kingdom', '2016-01-01', 'In Service/Commission'),
  ('9461776', 'STELLA', 164714, 84735, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2011-01-01', 'In Service/Commission'),
  ('9336971', 'SIENNA', 149847, 79235, 'Liberia', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2007-01-01', 'In Service/Commission'),
  ('9470260', 'SEAWAYS ATHENS', 50342, 30066, 'Marshall Islands', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'Alpha Vessel Ltd', 'Belgium', 'V Ships UK Ltd', 'Monaco', 'CPTA', 'Japan', '2012-01-01', 'In Service/Commission'),
  ('1059266', 'RURI SEKAI', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2027-01-01', 'Keel Laid'),
  ('1059228', 'RURI MIRAI', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2026-01-01', 'Launched'),
  ('1060643', 'RURI HIKARI', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2027-01-01', 'Keel Laid'),
  ('9984869', 'ORION', 157717, 84268, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('8359407', 'NUNCE', 15124, 21093, 'Unknown', 'Offshore Support Vessel', 'Exmar NV', 'Belgium', 'Exmar NV', 'Belgium', null, null, 'Exmar NV', 'Belgium', '2009-01-01', 'In Service/Commission'),
  ('1050624', 'MORINI', 319000, 164977, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', null, null, 'CMB.Tech NV', 'Belgium', '2027-01-01', 'Launched'),
  ('9882475', 'MINERAL ZIMBABWE', 207999, 108481, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2021-01-01', 'In Service/Commission'),
  ('9882463', 'MINERAL ZAMBIA', 207999, 108481, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2021-01-01', 'In Service/Commission'),
  ('9723526', 'MINERAL YOURI', 181046, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9721499', 'MINERAL YEOSU', 180228, 94145, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'CMB.Tech NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9723538', 'MINERAL YANNICK', 181044, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9757591', 'MINERAL WALCOTT', 207999, 107646, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9723514', 'MINERAL VINCENT', 181043, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'CMB.Tech NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9723502', 'MINERAL TOBY', 181010, 94742, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9719941', 'MINERAL THIBAUT', 181062, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'CMB NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9882451', 'MINERAL TANZANIA', 207999, 108481, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9701358', 'MINERAL SUMIRE', 182610, 93237, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Columbia Shipmanagement Ltd', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9519779', 'MINERAL STONEHENGE', 175713, 91971, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'Bocimar International NV', 'Belgium', '2010-01-01', 'In Service/Commission'),
  ('9989508', 'MINERAL SLOVENSKO', 210000, 110717, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Ship Management', 'Hong Kong', 'CMB NV', 'Belgium', '2025-01-01', 'In Service/Commission'),
  ('1019474', 'MINERAL SLOVENIJA', 210000, 110717, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', 'Anglo-Eastern Ship Management', 'Hong Kong', 'CMB NV', 'Belgium', '2025-01-01', 'In Service/Commission'),
  ('9884631', 'MINERAL SHOUGANG INTERNATIONAL', 207999, 108481, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9696058', 'MINERAL SEONDEOK', 179337, 93659, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9701346', 'MINERAL SAKURA', 182481, 93518, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Columbia Shipmanagement Ltd', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9719915', 'MINERAL ROMELU', 181066, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9721487', 'MINERAL POHANG', 180355, 94145, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9743150', 'MINERAL NIMBUS', 180503, 93908, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9519767', 'MINERAL NEW YORK', 175799, 91971, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'Bocimar International NV', 'Belgium', '2010-01-01', 'In Service/Commission'),
  ('9950258', 'MINERAL NEDERLAND', 210204, 108985, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'Bocimar International NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9884629', 'MINERAL NAMIBIA', 207999, 108481, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9719939', 'MINERAL NACER', 181055, 94742, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'CMB.Tech NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9847970', 'MINERAL MAURITIUS', 210897, 109716, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9719927', 'MINERAL MAROUANE', 181020, 94742, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('1059216', 'MINERAL MAGYAR', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2026-01-01', 'Launched'),
  ('9847982', 'MINERAL MADAGASCAR', 207994, 109716, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9950260', 'MINERAL LUXEMBOURG', 210197, 108985, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'FML Ship Management Ltd', 'Hong Kong', 'CMB NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9989546', 'MINERAL LIETUVA', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2026-01-01', 'Launched'),
  ('9722429', 'MINERAL KWANGYANG', 180513, 94091, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Columbia Shipmanagement Ltd', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9701334', 'MINERAL KIKU', 182472, 93518, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Columbia Shipmanagement Ltd', 'Cyprus', 'Golden Ocean Group Ltd', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9683271', 'MINERAL KEVIN', 180958, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'CMB.Tech NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9701322', 'MINERAL KAEDE', 182486, 93518, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Columbia Shipmanagement Ltd', 'Cyprus', 'Golden Ocean Group Ltd', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9696046', 'MINERAL JINDEOK', 179189, 93659, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Management AS', 'Bermuda', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Management AS', 'Bermuda', '2014-01-01', 'In Service/Commission'),
  ('9683269', 'MINERAL JAN', 181009, 94742, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9567025', 'MINERAL HOPE', 175591, 91971, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'Bocimar International NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9701188', 'MINERAL HIMAWARI', 181214, 92957, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9974204', 'MINERAL HELLAS', 210799, 110710, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'CMB NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9950272', 'MINERAL FRANCE', 210252, 108985, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'FML Ship Management Ltd', 'Hong Kong', 'CMB NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9575668', 'MINERAL FAITH', 175620, 91971, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'CMB NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9989534', 'MINERAL EESTI', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2026-01-01', 'Launched'),
  ('9683257', 'MINERAL EDEN', 180960, 94742, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9719903', 'MINERAL DRIES', 181062, 94528, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'CMB.Tech NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9974199', 'MINERAL DANMARK', 210774, 110710, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'CMB NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9722417', 'MINERAL DANGJIN', 180491, 94091, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9702481', 'MINERAL COMOROS', 211135, 109716, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9989522', 'MINERAL CHINA', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2026-01-01', 'Launched'),
  ('9702479', 'MINERAL CABO VERDE', 211122, 109716, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9950246', 'MINERAL BELGIE', 210177, 108985, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Hong Kong', 'CMB NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9683245', 'MINERAL AXEL', 181015, 94742, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'CMB NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9989510', 'MINERAL AUSTRALIA', 210000, 113029, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', null, null, 'CMB NV', 'Belgium', '2026-01-01', 'Keel Laid'),
  ('9701176', 'MINERAL AJISAI', 181214, 92957, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Management AS', 'Bermuda', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Management AS', 'Bermuda', '2014-01-01', 'In Service/Commission'),
  ('1044106', 'MENAPII', 319000, 164743, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', null, 'CMB.Tech NV', 'Belgium', '2026-01-01', 'In Service/Commission'),
  ('9474539', 'MARIANNE', 4001, 3493, 'Belgium', 'LPG Tanker', 'Exmar NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2009-01-01', 'In Service/Commission'),
  ('9530890', 'MARIA', 157523, 81482, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9894777', 'LEONARDO', 63676, 36177, 'Marshall Islands', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Sealink Navigation Ltd', 'Greece', 'Sealink Navigation Ltd', 'Greece', 'Sealink Navigation Ltd', 'Greece', '2020-01-01', 'In Service/Commission'),
  ('9723540', 'KSL SEVILLE', 181003, 94742, 'Hong Kong', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9483138', 'KSL CHINA', 179109, 94523, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2013-01-01', 'In Service/Commission'),
  ('9719288', 'KRUIBEKE', 29649, 25952, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9687514', 'KORTRIJK', 29588, 25952, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9687502', 'KONTICH', 29461, 26261, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9719305', 'KOKSIJDE', 29543, 25952, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2018-01-01', 'In Service/Commission'),
  ('9687497', 'KNOKKE', 29478, 26261, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2016-01-01', 'In Service/Commission'),
  ('9687485', 'KAPRIJKE', 29639, 25952, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9719290', 'KAPELLEN', 29590, 26101, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2018-01-01', 'In Service/Commission'),
  ('9719276', 'KALLO', 29664, 25952, 'Belgium', 'LPG Tanker', 'Saverex NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9448877', 'JOAN', 4000, 3493, 'Belgium', 'LPG Tanker', 'Exmar NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2009-01-01', 'In Service/Commission'),
  ('9842578', 'HYDROVILLE', 2, 21, 'Belgium', 'Passenger Ship, Inland Waterways', 'CMB NV', 'Belgium', 'CMB.Tech Enterprises NV', 'Belgium', 'Anglo-Eastern Ship Management', 'Hong Kong', 'CMB.Tech Enterprises NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9984857', 'HELIOS', 157595, 84268, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9443619', 'GOLDEN ZHEJIANG', 175837, 92270, 'Portugal', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Antwerp NV', 'Cyprus', 'Golden Ocean Group Ltd', 'Belgium', '2010-01-01', 'In Service/Commission'),
  ('9977153', 'GOLDEN WAVE', 84984, 49508, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9977165', 'GOLDEN TIDE', 84996, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9678472', 'GOLDEN SUE', 84943, 47003, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2013-01-01', 'In Service/Commission'),
  ('9950703', 'GOLDEN STAR', 84988, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'CMB.Tech NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9950715', 'GOLDEN SOUL', 84986, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9590747', 'GOLDEN ROSE', 81585, 44485, 'Portugal', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9511416', 'GOLDEN MYRTALIA', 177979, 91373, 'Portugal', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Anglo-Eastern Maritime Service', 'Hong Kong', 'Golden Ocean Group Ltd', 'Belgium', '2011-01-01', 'In Service/Commission'),
  ('9950727', 'GOLDEN LION', 84967, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9740835', 'GOLDEN KENNEDY', 84978, 47003, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2015-01-01', 'In Service/Commission'),
  ('9461324', 'GOLDEN JAKE', 82188, 42917, 'Portugal', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2011-01-01', 'In Service/Commission'),
  ('9955569', 'GOLDEN HOPE', 84986, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Wilhelmsen Ship Mgmt Singapore', 'Norway', 'Golden Ocean Group Ltd', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9590761', 'GOLDEN GINGER', 81507, 44485, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9443607', 'GOLDEN FUTURE', 175861, 92270, 'Portugal', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Columbia Shipmanagement Ltd', 'Cyprus', 'Golden Ocean Group Ltd', 'Belgium', '2010-01-01', 'In Service/Commission'),
  ('9860128', 'GOLDEN FURIOUS', 80595, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2021-01-01', 'In Service/Commission'),
  ('9955583', 'GOLDEN FROZEN', 84504, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9849899', 'GOLDEN FROST', 80559, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9470404', 'GOLDEN FROID', 74232, 41725, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9458987', 'GOLDEN FRIS', 74753, 41586, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('9470375', 'GOLDEN FRIO', 74300, 41718, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2013-01-01', 'In Service/Commission'),
  ('9955571', 'GOLDEN FRIGO', 84520, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9854301', 'GOLDEN FRIEND', 81206, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9955595', 'GOLDEN FRIDGE', 84508, 49508, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9849904', 'GOLDEN FREEZE', 81135, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2021-01-01', 'In Service/Commission'),
  ('9438638', 'GOLDEN FRAICHE', 74524, 41586, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2013-01-01', 'In Service/Commission'),
  ('9852535', 'GOLDEN FORWARD', 81130, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9852523', 'GOLDEN FORTUNE', 81210, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9854313', 'GOLDEN FELLOW', 81135, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2020-01-01', 'In Service/Commission'),
  ('9860116', 'GOLDEN FAST', 80573, 44094, 'Belgium', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2021-01-01', 'In Service/Commission'),
  ('9977177', 'GOLDEN FAITH', 84987, 49508, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB Tech Belgium NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB Tech Belgium NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9678484', 'GOLDEN DEB', 84970, 47003, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2014-01-01', 'In Service/Commission'),
  ('9590759', 'GOLDEN DAISY', 81507, 44485, 'Belgium', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9439412', 'GOLDEN BEIJING', 175820, 92270, 'Portugal', 'Bulk Carrier', 'CMB NV', 'Belgium', 'Golden Ocean Group Ltd', 'Belgium', 'Bernhard Schulte Singapore', 'Germany', 'CMB.Tech NV', 'Belgium', '2010-01-01', 'In Service/Commission'),
  ('9461336', 'GOLDEN ARION', 82188, 42917, 'Portugal', 'Bulk Carrier', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'OSM Maritime Ship Mgmt Dry Pte', 'Cyprus', 'CMB.Tech NV', 'Belgium', '2011-01-01', 'In Service/Commission'),
  ('9253284', 'FSRU TOSCANA', 73758, 117916, 'Italy', 'Gas Processing Vessel', 'Saverex NV', 'Belgium', 'Ecos Srl', 'Belgium', 'Ecos Srl', 'Belgium', 'Ecos Srl', 'Belgium', '2003-01-01', 'In Service/Commission'),
  ('9224752', 'FSO ASIA', 432023, 236638, 'Marshall Islands', 'FSO, Oil', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Euronav Ship Mgmt SAS', 'Belgium', 'CMB.Tech NV', 'Belgium', '2002-01-01', 'In Service/Commission'),
  ('9224764', 'FSO AFRICA', 432023, 236638, 'Marshall Islands', 'FSO, Oil', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Euronav Ship Mgmt SAS', 'Belgium', 'CMB.Tech NV', 'Belgium', '2002-01-01', 'In Service/Commission'),
  ('9416733', 'FRATERNITY', 157714, 81482, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2009-01-01', 'In Service/Commission'),
  ('9387700', 'FAUSKANGER', 46180, 29804, 'Norway', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'Westfal-Larsen Management AS', 'Norway', 'Westfal-Larsen Management AS', 'Norway', 'Westfal-Larsen Shipping AS', 'Norway', '2009-01-01', 'In Service/Commission'),
  ('9230050', 'EXCALIBUR', 77822, 94379, 'Belgium', 'FSO, Gas', 'Exmar NV', 'Belgium', 'Exmar UK Shipping Co Ltd', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2002-01-01', 'In Service/Commission'),
  ('9442184', 'ELISABETH', 3990, 3493, 'Belgium', 'LPG Tanker', 'Exmar NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2009-01-01', 'In Service/Commission'),
  ('9757694', 'EEMSHAVEN LNG', 19510, 28804, 'Belgium', 'Gas Processing Vessel', 'Exmar NV', 'Belgium', 'Exmar NV', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2017-01-01', 'In Service/Commission'),
  ('1037139', 'EBURONES', 321735, 164743, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2026-01-01', 'In Service/Commission'),
  ('9723083', 'DONOUSSA', 299999, 157092, 'France', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'PETROBRAS', 'Brazil', '2016-01-01', 'In Service/Commission'),
  ('9925825', 'CMA CGM MASAI MARA', 75833, 60284, 'Belgium', 'Container Ship (Fully Cellular)', 'CMB NV', 'Belgium', 'Delphis NV', 'Belgium', 'Anglo-Eastern Ship Management', 'Hong Kong', 'Delphis NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9926221', 'CMA CGM DOLOMITES', 75623, 60284, 'Belgium', 'Container Ship (Fully Cellular)', 'CMB NV', 'Belgium', 'Delphis NV', 'Belgium', 'Anglo-Eastern Ship Management', 'Hong Kong', 'Delphis NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('1054876', 'CHINA MERCHANTS JL YANGZHOU CMYZ0162', 17100, 14424, 'Portugal', 'Asphalt/Bitumen Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', null, null, 'CMB.Tech NV', 'Belgium', '2026-01-01', 'Keel Laid'),
  ('1054864', 'CHINA MERCHANTS JL YANGZHOU CMYZ0161', 17000, 14818, 'Portugal', 'Asphalt/Bitumen Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', null, null, 'CMB.Tech NV', 'Belgium', '2026-01-01', 'Keel Laid'),
  ('9531480', 'CAPTAIN MICHAEL', 157648, 81482, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2012-01-01', 'In Service/Commission'),
  ('9380740', 'CAP THEODORA', 158819, 81324, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2008-01-01', 'In Service/Commission'),
  ('9817107', 'CAP QUEBEC', 156013, 82099, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Valero Energy Corp', 'United States', '2018-01-01', 'In Service/Commission'),
  ('9829801', 'CAP PORT ARTHUR', 156049, 82099, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Valero Energy Corp', 'United States', '2018-01-01', 'In Service/Commission'),
  ('9817119', 'CAP PEMBROKE', 156002, 82099, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Valero Energy Corp', 'United States', '2018-01-01', 'In Service/Commission'),
  ('1044534', 'CAP JOSEPH', 156790, 84313, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', null, 'CMB.Tech NV', 'Belgium', '2026-01-01', 'In Service/Commission'),
  ('1044522', 'CAP GRACE', 157425, 84313, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', null, 'CMB.Tech NV', 'Belgium', '2026-01-01', 'In Service/Commission'),
  ('9380738', 'CAP FELIX', 158765, 81409, 'Belgium', 'Crude Oil Tanker', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Euronav UK Agencies Ltd', 'Belgium', '2008-01-01', 'In Service/Commission'),
  ('9829813', 'CAP CORPUS CHRISTI', 156004, 82099, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'Valero Energy Corp', 'United States', '2018-01-01', 'In Service/Commission'),
  ('9941855', 'BRUGGE', 157138, 80222, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9941879', 'BRISTOL', 157077, 80222, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2024-01-01', 'In Service/Commission'),
  ('9941867', 'BREST', 157071, 80222, 'Greece', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2023-01-01', 'In Service/Commission'),
  ('9956422', 'BOCHEM SHANGHAI', 25998, 17023, 'Portugal', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', 'Fleet Management Ltd-HKG', 'Hong Kong', 'Stolt Tankers BV', 'Norway', '2024-01-01', 'In Service/Commission'),
  ('9973303', 'BOCHEM NEW ORLEANS', 26574, 17023, 'Portugal', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'Bocimar International NV', 'Belgium', 'Anglo-Eastern Shipmanagement S', 'Hong Kong', 'Stolt Tankers BV', 'Norway', '2024-01-01', 'In Service/Commission'),
  ('9737565', 'BOCHEM LUXEMBOURG', 19999, 12136, 'Liberia', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'Bochem Hong Kong Ltd', 'Belgium', 'Anglo-Eastern Shipmanagement S', 'Hong Kong', 'Ultranav International SA', 'Chile', '2015-01-01', 'In Service/Commission'),
  ('9955428', 'BOCHEM HOUSTON', 25999, 18082, 'Portugal', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', 'Anglo-Eastern Shipmanagement S', 'Hong Kong', 'Stolt Tankers BV', 'Norway', '2023-01-01', 'In Service/Commission'),
  ('9956410', 'BOCHEM CASABLANCA', 26644, 17019, 'Portugal', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'CMB NV', 'Belgium', 'Fleet Management Ltd-HKG', 'Hong Kong', 'Stolt Tankers BV', 'Norway', '2024-01-01', 'In Service/Commission'),
  ('1029869', 'ATREBATES', 321761, 164743, 'Belgium', 'Crude Oil Tanker', 'CMB.Tech NV', 'Belgium', 'CMB.Tech NV', 'Belgium', 'Anglo-Eastern Ship Mgmt Hellas', 'Belgium', 'CMB.Tech NV', 'Belgium', '2025-01-01', 'In Service/Commission'),
  ('9474541', 'ANGELA', 3998, 3493, 'Belgium', 'LPG Tanker', 'Exmar NV', 'Belgium', 'Exmar Marine SA', 'Belgium', 'Exmar Shipmanagement BV', 'Belgium', 'Exmar NV', 'Belgium', '2009-01-01', 'In Service/Commission'),
  ('1018858', 'AGNES PG', 10795, 7928, 'Isle Of Man', 'Chemical/Products Tanker', 'CMB NV', 'Belgium', 'Pritchard-Gordon Tankers Ltd', 'United Kingdom', 'Pritchard-Gordon Tankers Ltd', 'United Kingdom', 'Pritchard-Gordon Tankers Ltd', 'United Kingdom', '2025-01-01', 'In Service/Commission'),
  ('9386524', 'A LA MARINE', 20073, 16023, 'Belgium', 'Container Ship (Fully Cellular)', 'CMB NV', 'Belgium', 'HanseContor Shipmanagement', 'Germany', 'HanseContor Shipmanagement', 'Germany', 'CMA CGM SA The French Line', 'France', '2009-01-01', 'In Service/Commission');
