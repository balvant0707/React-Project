-- Converted from ~/npm_tool/supabase/seed/03_demo_narrative.sql (tenants -> owner associate teams, groups -> teams).

insert into public.vessels (imo, name, deadweight_tonnage, gross_tonnage, flag, ship_type, group_owner, group_owner_country, technical_manager, technical_manager_country, status)
values
  ('9123456', 'MV Nordic Trader', 45000, 28000, 'Marshall Islands', 'Bulk Carrier', 'Blumenthal Shipping', 'Germany', 'Oldendorf Carriers', 'Germany', 'In Service'),
  ('9234567', 'MV Baltic Pioneer', 32000, 19500, 'Liberia', 'Container Ship', 'Nordfracht GmbH', 'Germany', 'Nordfracht GmbH', 'Germany', 'In Service'),
  ('9345678', 'MV Atlantic Star', 62000, 35000, 'Panama', 'Tanker', 'Star Tankers Ltd', 'Greece', 'Star Ship Management', 'Greece', 'In Service');

-- Hull events: a mix of types/statuses across the three vessels. No more
-- Seastock-type hull events - Seastock specs now link straight to a vessel
-- (see the 26-483920 specification below), so MV Baltic Pioneer's former SS
-- hull event is gone and MV Atlantic Star keeps only its DD one.
-- snapshot_*_company_id columns are left out here on purpose - the
-- copy_vessel_snapshot_to_hull_event trigger (see
-- 20260917100000_hull_event_snapshot_company_ids.sql) fills them in from the
-- vessel's own group_owner_company_id/technical_manager_company_id, which is
-- exactly what these two rows would produce anyway.
insert into public.hull_events (vessel_id, type_phrase_id, status, event_date)
select v.id,
  (select id from public.phrases where category = 'hull_event_type' and code = 'DD'),
  'Secured', '2026-07-01'::date
from public.vessels v where v.imo = '9123456'
union all
select v.id,
  (select id from public.phrases where category = 'hull_event_type' and code = 'DD'),
  'Open', '2026-10-01'::date
from public.vessels v where v.imo = '9345678';

-- Demo vessels + hull events imported from real SeaWeb/Radar export data
-- (Reference documents/Demo Data/, provided by the user 2026-09-09) - matched
-- sets: every hull event below points at one of the vessels inserted here,
-- and every vessel here has at least one matching hull event. Vessel master
-- fields come from the SeaWeb ship-data export; hull_events.snapshot_* fields
-- come from the hull-event export's own per-row values (as historically
-- captured), not copied from the vessel row, matching the snapshot design.
-- Limited to Drydock/Newbuilding types (the only ones with existing
-- hull_event_type phrases); statuses map per ~/npm_tool/docs/open-questions.md #32a
-- (legacy codes Z/T have no confirmed mapping and become the literal 'Not
-- set' status, same as X - hull_events.status is not-null, see
-- 20260912092000_additional_mandatory_fields.sql, so this can no longer be
-- a bare null the way it was originally modeled).
insert into public.vessels (imo, name, deadweight_tonnage, gross_tonnage, flag, ship_type, group_owner, group_owner_country, ship_manager, ship_manager_country, technical_manager, technical_manager_country, operator, operator_country, docking_survey_date, built_date, status)
values
  ('8968961', 'AGIOS PANTELEIMON', 124, 498, 'Greece', 'Passenger/Ro-Ro Ship (Vehicles)', 'Thassos Shipping Co SA', 'Greece', 'ANETH', 'Greece', 'ANETH', 'Greece', 'ANETH', 'Greece', '2020-03-16', '1999-01-01', 'In Service/Commission'),
  ('1025538', 'NORDBALTIC', 24580, 18508, 'Cyprus', 'Container Ship (Fully Cellular)', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', '2028-01-15', '2025-01-01', 'In Service/Commission'),
  ('8417285', 'PANAGIA THASOU', 1274, 1174, 'Greece', 'Passenger/Ro-Ro Ship (Vehicles)', 'Porthmia Voriou Ellados', 'Greece', 'Porthmia Voriou Ellados', 'Greece', 'Porthmiakes Grammes Thassou', null, 'Porthmia Voriou Ellados', 'Greece', null, '1985-05-01', 'In Service/Commission'),
  ('1014541', 'EL JUNIPER', 71085, 53192, 'Singapore', 'Wood Chips Carrier', 'China Aviation International', 'China', 'Supreme Maritime Services', null, 'Zhengdong Shipping Pte Ltd', 'China', 'Supreme Maritime Services', null, '2028-01-07', '2025-01-01', 'In Service/Commission'),
  ('8036110', 'NIKOLAY KUZNETSOV', 3134, 2466, 'Saint Kitts and Nevis', 'General Cargo Ship', 'Pic Shipping Ltd', 'Ukraine', 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, null, '1982-07-01', 'In Service/Commission'),
  ('8125454', 'ARAL', 8915, 5285, 'Malta', 'Chemical/Products Tanker', 'Orsa Tanker Isletmeciligi', 'Turkey', 'Orsa Tanker Isletmeciligi', 'Turkey', 'Orsa Tanker Isletmeciligi', 'Turkey', 'Orsa Tanker Isletmeciligi', 'Turkey', '2027-03-31', '1982-05-01', 'In Service/Commission'),
  ('1025552', 'NORDSERAPHINA', 24587, 18508, 'Cyprus', 'Container Ship (Fully Cellular)', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Hapag-Lloyd AG', 'Germany', '2028-06-17', '2025-06-01', 'In Service/Commission'),
  ('1015313', 'CYTA', 40442, 24441, 'Liberia', 'Bulk Carrier', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', '2027-08-26', '2024-08-01', 'In Service/Commission'),
  ('8516627', 'SIMFONIYA', 3750, 4298, 'Russian Federation', 'Refrigerated Cargo Ship', 'Yuzhmorrybflot JSC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', '2024-06-05', '1989-06-01', 'In Service/Commission'),
  ('1014553', 'FL KINGWOOD', 71059, 53192, 'Singapore', 'Wood Chips Carrier', 'China Aviation International', 'China', 'Zhengdong Shipping Pte Ltd', 'China', 'Zhengdong Shipping Pte Ltd', 'China', 'Zhengdong Shipping Pte Ltd', 'China', '2028-03-03', '2025-03-01', 'In Service/Commission'),
  ('1015325', 'ANNELIESE', 40398, 24441, 'Liberia', 'Bulk Carrier', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', '2027-09-09', '2024-09-01', 'In Service/Commission'),
  ('8516639', 'GARMONIYA', 3643, 4295, 'Russian Federation', 'Refrigerated Cargo Ship', 'Yuzhmorrybflot JSC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', '2024-06-02', '1990-01-01', 'In Service/Commission'),
  ('1015600', 'SG SUNRISE', 211474, 112097, 'Japan', 'Bulk Carrier', 'NYK Line', 'Japan', 'NYK Line', 'Japan', 'NYK Shipmanagement Pte Ltd', 'Japan', 'NYK Line', 'Japan', '2028-03-18', '2025-03-01', 'In Service/Commission'),
  ('9327152', 'NGOL ZAIRE', 4581, 3006, 'Belize', 'Products Tanker', 'SONANGOL', 'Angola', 'SONANGOL', 'Angola', 'V Ships Ltd', 'Monaco', 'Sonaship Navigation Co Ltd', 'Angola', '2026-07-09', '2006-06-01', 'In Service/Commission'),
  ('7725362', 'HATAY', 3545, 5801, 'Spain', 'Ro-Ro Cargo Ship', 'Balearia Eurolineas Maritimas', 'Spain', 'Balearia Eurolineas Maritimas', 'Spain', 'Balearia Eurolineas Maritimas', 'Spain', 'Balearia Eurolineas Maritimas', 'Spain', null, '1979-07-01', 'In Service/Commission'),
  ('8415794', 'SEA PATRIS', 13895, 36201, 'Panama', 'Vehicles Carrier', 'MCCL', 'Greece', 'MCCL', 'Greece', 'MCCL', 'Greece', 'MCCL', 'Greece', '2027-09-08', '1985-01-01', 'In Service/Commission'),
  ('1014840', 'ALLEGRA', 40005, 24479, 'Liberia', 'Bulk Carrier', 'Shinken Bussan Co Ltd', 'Japan', 'Drydel Shipping Inc', 'Greece', 'Drydel Shipping Inc', 'Greece', 'Drydel Shipping Inc', 'Greece', '2027-07-02', '2024-07-01', 'In Service/Commission'),
  ('8501062', 'SINO P', 2681, 1487, 'Togo', 'General Cargo Ship', 'Dusor Lojistik ve Dis Ticaret', 'Turkey', 'East Shipping Lines Ltd', null, 'East Shipping Lines Ltd', null, 'East Shipping Lines Ltd', null, null, '1985-06-01', 'In Service/Commission'),
  ('1015375', 'SINAR SUMATERA', 28679, 19944, 'Singapore', 'Container Ship (Fully Cellular)', 'Samudera Shipping Line Ltd', 'Indonesia', 'Samudera Ships Investment Pte', 'Indonesia', 'Samudera Ship Management Pte', 'Indonesia', 'Samudera Ships Investment Pte', 'Indonesia', '2027-12-18', '2024-12-01', 'In Service/Commission'),
  ('8507731', 'AKADEMIK IOFFE', 1738, 6450, 'Russian Federation', 'Vessel (function unknown)', 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', 'Russian Federation', '2023-06-22', '1989-02-01', 'In Service/Commission'),
  ('7907673', 'EL. VENIZELOS', 5351, 38261, 'Greece', 'Passenger/Ro-Ro Ship (Vehicles)', 'Blue Star Maritime SA', 'Greece', 'Attica Ferries Single Member', 'Greece', 'Attica Ferries Single Member', 'Greece', 'Attica Ferries Single Member', 'Greece', '2027-04-27', '1992-06-01', 'In Service/Commission'),
  ('7382366', 'LERZAN K', 9962, 8472, 'Palau', 'Ro-Ro Cargo Ship', 'Ucak Shipping Corp', 'Turkey', 'Northwind Denizcilik Sanayi', null, 'Northwind Denizcilik Sanayi', null, 'Northwind Denizcilik Sanayi', null, null, '1975-01-01', 'In Service/Commission'),
  ('7205219', 'MACEDON', 457, 1711, 'Greece', 'Passenger/Ro-Ro Ship (Vehicles)', 'Goutos Lines', 'Greece', 'Valtetsi Shipping Co', 'Greece', 'Valtetsi Shipping Co', 'Greece', 'Valtetsi Shipping Co', 'Greece', '2020-12-08', '1972-03-01', 'In Service/Commission'),
  ('1014125', 'FEDERAL INFINITY', 63653, 36140, 'Panama', 'Bulk Carrier', 'Ehime Kaiun Co Ltd', 'Japan', 'Ehime Kaiun Co Ltd', 'Japan', 'Ehime Kaiun Co Ltd', 'Japan', 'Ehime Kaiun Co Ltd', 'Japan', '2027-09-15', '2024-09-01', 'In Service/Commission'),
  ('9156462', 'INSIGNIA', 2948, 30277, 'Marshall Islands', 'Passenger/Cruise', 'Norwegian Cruise Line Holdings', 'United States', 'NCL Bahamas Ltd', 'United States', 'NCL Bahamas Ltd', 'United States', 'Oceania Cruises Ltd', 'United States', '2027-11-25', '1998-06-01', 'In Service/Commission'),
  ('8502391', 'PRINCESS SEAWAYS', 4110, 31356, 'Denmark', 'Passenger/Ro-Ro Ship (Vehicles)', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', '2025-02-09', '1986-05-01', 'In Service/Commission'),
  ('8509820', 'COE MINA', 3357, 2064, 'San Marino', 'General Cargo Ship', 'BD-Shipsnavo GmbH & Co', 'Germany', 'BD-Shipsnavo GmbH & Co', 'Germany', 'BD-Shipsnavo GmbH & Co', 'Germany', 'BD-Shipsnavo GmbH & Co', 'Germany', null, '1985-08-01', 'In Service/Commission'),
  ('7830911', 'PAVEL GRABOVSKIY', 3147, 2466, 'Panama', 'General Cargo Ship', 'Pic Shipping Ltd', 'Ukraine', 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, null, '1979-01-01', 'In Service/Commission'),
  ('8502406', 'KING SEAWAYS', 4110, 31788, 'Denmark', 'Passenger/Ro-Ro Ship (Vehicles)', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', '2022-01-31', '1987-02-01', 'In Service/Commission'),
  ('1013640', 'CAPE SUZURAN', 182098, 94321, 'Liberia', 'Bulk Carrier', 'Shoei Kisen KK', 'Japan', 'Shoei Ship Management Pte Ltd', 'Japan', 'Shoei Ship Management Pte Ltd', 'Japan', 'Kawasaki Kisen Kaisha Ltd', 'Japan', '2028-02-17', '2025-02-01', 'In Service/Commission'),
  ('8611984', 'CENK CAR', 2674, 7314, 'Malta', 'Vehicles Carrier', 'Cenk Group', 'Turkey', 'Marmara Denizcilik AS', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', 'Marmara Denizcilik AS', 'Turkey', '2018-09-25', '1986-03-01', 'In Service/Commission'),
  ('1014163', 'CRIMSON SAPPHIRE', 40435, 25073, 'Singapore', 'Bulk Carrier', 'Marubeni Corp', 'Japan', 'MMSL Pte Ltd', 'Japan', 'Marufleet Management Pte Ltd', 'Singapore', 'MMSL Pte Ltd', 'Japan', '2027-07-10', '2024-07-01', 'In Service/Commission'),
  ('9723291', 'MINERVA TYCHI', 39070, 24090, 'Greece', 'Chemical/Products Tanker', 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', '2026-02-03', '2016-02-01', 'In Service/Commission'),
  ('9101730', 'SPLITTNES', 18886, 11538, 'Antigua and Barbuda', 'Bulk Carrier, Self-discharging', 'HJH Shipmanagement GmbH', 'Germany', 'HJH Shipmanagement GmbH', 'Germany', 'HJH Shipmanagement GmbH', 'Germany', 'Stema Shipping AS', 'Germany', '2028-03-31', '1994-10-01', 'In Service/Commission'),
  ('1013676', 'AQUADONNA', 63526, 36278, 'Panama', 'Bulk Carrier', 'Nissen Kaiun Co Ltd', 'Japan', 'Nissen Kaiun Co Ltd', 'Japan', 'Blueocean Shipmanagement Intl', null, 'C Transport Maritime SAM', 'Monaco', '2027-07-31', '2024-08-01', 'In Service/Commission'),
  ('7528635', 'CENK T', 8408, 21162, 'Panama', 'Passenger/Ro-Ro Ship (Vehicles)', 'Cenk Group', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', '2026-09-10', '1978-05-01', 'In Casualty Or Repairing'),
  ('9327815', 'JADE LUCK', 203512, 104668, 'Marshall Islands', 'Bulk Carrier', 'Qingdao Yihe Intl Supply Chain', 'China', 'Sea Sailing Co Ltd', null, 'IMC Ship Management Shanghai', 'Hong Kong', 'Delong Zhenxing Pte Ltd', 'China', '2026-08-27', '2006-12-01', 'In Service/Commission'),
  ('8613607', 'ADAMANTIOS KORAIS', 977, 6307, 'Greece', 'Passenger/Ro-Ro Ship (Vehicles)', 'Panagiotakis P', 'Greece', 'Serifos Fast Ferries Maritime', 'Greece', null, null, 'Serifos Fast Ferries Maritime', 'Greece', '2018-12-19', '1987-06-01', 'In Service/Commission'),
  ('9000168', 'HERITAGE ADVENTURER', 1177, 8445, 'Portugal', 'Passenger/Cruise', 'Nordic Hamburg Shipping NHS', 'Germany', 'Nordic Hamburg Shipmgmt GmbH', 'Germany', 'Nordic Cruise Management GmbH', 'Germany', 'Nordic Hamburg Shipmgmt GmbH', 'Germany', '2027-09-11', '1991-06-01', 'In Service/Commission'),
  ('9417452', 'CHRYSANTHEMUM', 105187, 57281, 'Bahamas', 'Crude Oil Tanker', 'Orpheus Marine Transport Corp', 'Greece', 'Orpheus Marine Transport Corp', 'Greece', 'V Ships UK Ltd', 'Monaco', 'Orpheus Marine Transport Corp', 'Greece', '2027-04-08', '2009-03-01', 'In Service/Commission'),
  ('1025526', 'NORDATLANTIC', 24625, 18508, 'Cyprus', 'Container Ship (Fully Cellular)', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', '2028-01-08', '2025-01-01', 'In Service/Commission'),
  ('1014527', 'BL IVY', 71059, 53192, 'Singapore', 'Wood Chips Carrier', 'Shenzhen Financial Leasing', 'China', 'Supreme Maritime Services', null, 'Zhengdong Shipping Pte Ltd', 'China', 'Supreme Maritime Services', null, '2027-07-23', '2024-07-01', 'In Service/Commission');

-- Staged in a temp table with the old text-per-role shape, exactly as
-- originally imported from the SeaWeb/Radar export - every one of the
-- ~120 rows below is left byte-for-byte untouched (still literal per-event
-- text, deliberately diverging from the vessel's current values in several
-- cases, matching the snapshot's whole point). The conversion into
-- snapshot_*_company_id happens in one bulk insert right after this block,
-- via get_or_create_seaweb_company - editing each of these ~120 lines by
-- hand would be needless transcription risk for a mechanical transform.
create temporary table tmp_hull_event_snapshot_seed (
  vessel_id uuid,
  type_phrase_id uuid,
  status text,
  lost_reason text,
  snapshot_group_owner text,
  snapshot_group_owner_country text,
  snapshot_technical_manager text,
  snapshot_technical_manager_country text,
  snapshot_operator text,
  snapshot_operator_country text,
  event_date date
);

insert into tmp_hull_event_snapshot_seed (vessel_id, type_phrase_id, status, lost_reason, snapshot_group_owner, snapshot_group_owner_country, snapshot_technical_manager, snapshot_technical_manager_country, snapshot_operator, snapshot_operator_country, event_date)
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', '2030-01-01'::date
from public.vessels v where v.imo = '1025526'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', '2030-01-01'::date
from public.vessels v where v.imo = '1025538'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', 'Nord GmbH Reederei', 'Germany', '2030-06-01'::date
from public.vessels v where v.imo = '1025552'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, null, null, null, null, null, null, '2025-10-01'::date
from public.vessels v where v.imo = '7205219'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Goutos Lines', 'Greece', 'Valtetsi Shipping Co', 'Greece', 'Valtetsi Shipping Co', 'Greece', '2024-10-01'::date
from public.vessels v where v.imo = '7205219'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Ucak Shipping Corp', 'Turkey', 'Northwind Denizcilik Sanayi', null, 'Northwind Denizcilik Sanayi', null, '2025-09-01'::date
from public.vessels v where v.imo = '7382366'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, null, null, null, null, null, null, '2028-03-01'::date
from public.vessels v where v.imo = '7382366'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Cenk Group', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', '2024-08-01'::date
from public.vessels v where v.imo = '7528635'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, null, null, null, null, null, null, '2021-08-01'::date
from public.vessels v where v.imo = '7528635'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', '2026-01-01'::date
from public.vessels v where v.imo = '9723291'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', 'Minerva Marine Inc', 'Greece', '2031-01-01'::date
from public.vessels v where v.imo = '9723291'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'IBC Guler Dis Ticaret Ltd Sti', 'Turkey', 'Erkdeniz Denizcilik Isltmeleri', null, 'Erkdeniz Denizcilik Isltmeleri', null, '2022-12-01'::date
from public.vessels v where v.imo = '7725362'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Pic Shipping Ltd', 'Ukraine', 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, '2025-08-01'::date
from public.vessels v where v.imo = '7830911'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Pic Shipping Ltd', 'Ukraine', 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, '2027-08-01'::date
from public.vessels v where v.imo = '7830911'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Blue Star Maritime SA', 'Greece', 'Attica Ferries Single Member', 'Greece', 'Attica Ferries Single Member', 'Greece', '2023-04-01'::date
from public.vessels v where v.imo = '7907673'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Pic Shipping Ltd', 'Ukraine', 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, '2026-07-01'::date
from public.vessels v where v.imo = '8036110'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Pic Shipping Ltd', 'Ukraine', 'Onyx Gemi Isletmeciligi', null, 'Onyx Gemi Isletmeciligi', null, '2029-01-01'::date
from public.vessels v where v.imo = '8036110'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Lost', 'Lost to competitor (reason not recorded in import).', 'Orsa Tanker Isletmeciligi', 'Turkey', 'Orsa Tanker Isletmeciligi', 'Turkey', 'Orsa Tanker Isletmeciligi', 'Turkey', '2024-02-01'::date
from public.vessels v where v.imo = '8125454'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'MCCL', 'Greece', 'MCCL', 'Greece', 'MCCL', 'Greece', '2026-06-01'::date
from public.vessels v where v.imo = '8415794'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'MCCL', 'Greece', 'MCCL', 'Greece', 'Sallaum Lines Switzerland SA', 'Switzerland', '2024-08-01'::date
from public.vessels v where v.imo = '8415794'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Porthmia Voriou Ellados', 'Greece', 'Porthmiakes Grammes Thassou', null, 'Porthmia Voriou Ellados', 'Greece', '2025-01-01'::date
from public.vessels v where v.imo = '8417285'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Porthmia Voriou Ellados', 'Greece', 'Porthmiakes Grammes Thassou', null, 'Porthmia Voriou Ellados', 'Greece', '2023-01-01'::date
from public.vessels v where v.imo = '8417285'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Lost', 'supply location', 'Dusor Lojistik ve Dis Ticaret', 'Turkey', 'East Shipping Lines Ltd', null, 'East Shipping Lines Ltd', null, '2025-11-01'::date
from public.vessels v where v.imo = '8501062'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Dusor Lojistik ve Dis Ticaret', 'Turkey', 'East Shipping Lines Ltd', null, 'East Shipping Lines Ltd', null, '2028-11-01'::date
from public.vessels v where v.imo = '8501062'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Lost', 'Lost to competitor (reason not recorded in import).', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', '2026-05-01'::date
from public.vessels v where v.imo = '8502391'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Lost', 'Lost to competitor (reason not recorded in import).', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', 'DFDS A/S', 'Denmark', '2027-02-01'::date
from public.vessels v where v.imo = '8502406'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', null, '2022-12-01'::date
from public.vessels v where v.imo = '8507731'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', 'Russian Federation', 'Shirshov Institute', null, '2027-05-01'::date
from public.vessels v where v.imo = '8507731'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'BD-Shipsnavo GmbH & Co', 'Germany', 'BD-Shipsnavo GmbH & Co', 'Germany', 'BD-Shipsnavo GmbH & Co', 'Germany', '2025-10-01'::date
from public.vessels v where v.imo = '8509820'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Yuzhmorrybflot JSC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', null, '2024-06-01'::date
from public.vessels v where v.imo = '8516627'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Yuzhmorrybflot JSC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', null, '2024-06-01'::date
from public.vessels v where v.imo = '8516639'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Not set', null, 'Yuzhmorrybflot JSC', 'Russian Federation', 'Transrefflot LLC', 'Russian Federation', 'Transrefflot LLC', null, '2027-06-01'::date
from public.vessels v where v.imo = '8516639'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, 'Cenk Group', 'Turkey', 'Cenk Gemi Isletmeciligi AS', 'Turkey', 'Marmara Denizcilik AS', 'Turkey', '2026-06-01'::date
from public.vessels v where v.imo = '8611984'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', null, null, null, null, null, null, null, '2021-08-01'::date
from public.vessels v where v.imo = '8611984'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'LUSTER MARITIME S.A.', null, null, null, null, null, '2025-02-01'::date
from public.vessels v where v.imo = '1013640'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'SOUTHERN ROUTE MARITIME S.A.', null, null, null, null, null, '2024-08-01'::date
from public.vessels v where v.imo = '1013676'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'Ehime Kaiun Co Ltd', null, null, null, null, null, '2024-09-01'::date
from public.vessels v where v.imo = '1014125'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'MMSL PTE. LTD.', null, null, null, null, null, '2024-07-01'::date
from public.vessels v where v.imo = '1014163'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'PSTS', null, null, null, null, null, '2024-07-01'::date
from public.vessels v where v.imo = '1014527'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'PSTS', null, null, null, null, null, '2025-01-01'::date
from public.vessels v where v.imo = '1014541'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'PSTS', null, null, null, null, null, '2025-03-01'::date
from public.vessels v where v.imo = '1014553'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'DRYDEL SHIPPING INC.', null, null, null, null, null, '2024-07-01'::date
from public.vessels v where v.imo = '1014840'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', '2024-08-01'::date
from public.vessels v where v.imo = '1015313'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', 'Osaka Asahi Kaiun Co Ltd', 'Japan', '2024-09-01'::date
from public.vessels v where v.imo = '1015325'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'SAMUDERA SHIPS INVESTMENT PTE. LTD.', null, null, null, null, null, '2024-12-01'::date
from public.vessels v where v.imo = '1015375'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'NB'), 'Secured', null, 'NYK SHIPMANAGEMENT', null, null, null, null, null, '2025-03-01'::date
from public.vessels v where v.imo = '1015600'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Promising', null, 'HJH Shipmanagement GmbH', 'Germany', 'HJH Shipmanagement GmbH', 'Germany', 'Stema Shipping AS', 'Germany', '2026-12-01'::date
from public.vessels v where v.imo = '9101730'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Promising', null, 'Norwegian Cruise Line Holdings', 'United States', 'NCL Bahamas Ltd', 'United States', 'Oceania Cruises Ltd', null, '2027-11-01'::date
from public.vessels v where v.imo = '9156462'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), '50/50', null, 'Thassos Shipping Co SA', 'Greece', 'ANETH', 'Greece', 'ANETH', 'Greece', '2027-01-01'::date
from public.vessels v where v.imo = '8968961'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), '50/50', null, 'Cape Shipping SA', 'Greece', 'Cape Shipping SA', 'Greece', 'Cape Shipping SA', 'Greece', '2026-12-01'::date
from public.vessels v where v.imo = '9327815'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Low', null, 'SONANGOL', 'Angola', 'V Ships Ltd', 'Monaco', 'Sonaship Navigation Co Ltd', 'Angola', '2026-12-01'::date
from public.vessels v where v.imo = '9327152'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Low', null, 'Orpheus Marine Transport Corp', 'Greece', 'V Ships UK Ltd', 'Monaco', 'Orpheus Marine Transport Corp', 'Greece', '2026-12-01'::date
from public.vessels v where v.imo = '9417452'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Report only', null, 'Panagiotakis P', 'Greece', null, null, 'Serifos Fast Ferries Maritime', 'Greece', '2024-01-01'::date
from public.vessels v where v.imo = '8613607'
union all
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Report only', null, 'Nordic Hamburg Shipping NHS', 'Germany', 'Nordic Cruise Management GmbH', 'Germany', 'Nordic Hamburg Shipmgmt GmbH', 'Germany', '2022-09-01'::date
from public.vessels v where v.imo = '9000168';

-- The actual conversion: one company per distinct string (reused across
-- rows that repeat the same text, same as any other get_or_create call) -
-- country text is passed through too, resolved to a country_id on first
-- creation only (see get_or_create_seaweb_company,
-- 20260917130000_company_country_resolution.sql), same as the vessel
-- importer's own trigger now does for group_owner/technical_manager/operator.
insert into public.hull_events (vessel_id, type_phrase_id, status, lost_reason, snapshot_group_owner_company_id, snapshot_technical_manager_company_id, snapshot_operator_company_id, event_date)
select
  vessel_id, type_phrase_id, status, lost_reason,
  public.get_or_create_seaweb_company(snapshot_group_owner, snapshot_group_owner_country),
  public.get_or_create_seaweb_company(snapshot_technical_manager, snapshot_technical_manager_country),
  public.get_or_create_seaweb_company(snapshot_operator, snapshot_operator_country),
  event_date
from tmp_hull_event_snapshot_seed;

drop table tmp_hull_event_snapshot_seed;

-- Specification 1: Seastock order on MV Baltic Pioneer, one version, flat
-- line items - exercises the "quote for a lightweight commercial offer"
-- path, now linked straight to the vessel (no hull event at all).
insert into public.specifications (
  vessel_id, team_id, supplier_id, specification_number, version, status,
  specification_date, delivery_date, currency, exchange_rate, speed, customer_name, customer_country_id,
  remarks_text, contact_person, transport_customs_surcharge
)
select v.id,
  (select id from public.teams where id in (select team_id from public.owner_associate_teams) and name = 'NPMTR'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  '26-483920', 1, 'draft',
  '2026-08-15', '2026-09-15', 'EUR', 1.0, 14.5, 'Nordfracht GmbH',
  (select id from public.countries where name_en = 'Germany'),
  (select text_en from public.phrases where category = 'remarks' and code = 'standard'),
  'Jan Schmidt', 150
from public.vessels v
where v.imo = '9234567';

-- Per-liter sales_price (not pp.pack_size * 5.5) - see the product_costs
-- comment above; total_price = sales_price x quantity_packed directly, no
-- pack_size division.
insert into public.specification_line_items (specification_id, sequence, product_packaging_id, quantity_product, real_quantity, offered_qty, sales_price, discount_pct, net_price, cost_price, gross_profit, gross_profit_pct, total_price, total_gross_profit)
select s.id, 1, pp.id, 180, 180, 200, 5.5, 5,
  5.5 * 0.95,
  (select cost_price from product_costs where product_packaging_id = pp.id),
  5.5 * 0.95 - (select cost_price from product_costs where product_packaging_id = pp.id),
  (5.5 * 0.95 - (select cost_price from product_costs where product_packaging_id = pp.id)) / (5.5 * 0.95) * 100,
  5.5 * 200,
  (5.5 * 0.95 - (select cost_price from product_costs where product_packaging_id = pp.id)) * 200
from public.specifications s
cross join lateral (
  select pp.id, pp.pack_size from public.product_packagings pp
  join public.products p on p.id = pp.product_id
  where p.code = 'AF-2002' and pp.pack_size = 200
) pp
where s.specification_number = '26-483920';

insert into public.specification_discounts (specification_id, name, pct, sequence)
select id, 'Special Discount', 5, 1 from public.specifications where specification_number = '26-483920';

-- Specification 2: DD on MV Nordic Trader, accepted (won). Inserted as
-- 'draft', line items added, THEN flipped to 'accepted' via UPDATE - the
-- lock_accepted_specifications trigger (20260909110000) blocks inserting
-- children of an already-accepted spec, so accepting has to be the last
-- step, same as the real app's own save flow.
insert into public.specifications (
  hull_event_id, team_id, supplier_id, specification_number, version, status,
  specification_date, delivery_date, currency, exchange_rate, speed, customer_name, customer_country_id, contact_person
)
select he.id,
  (select id from public.teams where id in (select team_id from public.owner_associate_teams) and name = 'NPMME'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  '26-510442-01', 1, 'draft',
  '2026-07-01', '2026-08-01', 'EUR', 1.0, 13.0, 'Blumenthal Shipping',
  (select id from public.countries where name_en = 'Germany'), 'Anna Berg'
from public.hull_events he
join public.vessels v on v.id = he.vessel_id
where v.imo = '9123456';

insert into public.specification_line_items (specification_id, sequence, product_packaging_id, quantity_product, real_quantity, offered_qty, sales_price, discount_pct, net_price, cost_price, gross_profit, gross_profit_pct, total_price, total_gross_profit)
select s.id, 1, pp.id, 900, 900, 1000, 5.5, 10,
  5.5 * 0.9,
  (select cost_price from product_costs where product_packaging_id = pp.id),
  5.5 * 0.9 - (select cost_price from product_costs where product_packaging_id = pp.id),
  (5.5 * 0.9 - (select cost_price from product_costs where product_packaging_id = pp.id)) / (5.5 * 0.9) * 100,
  5.5 * 1000,
  (5.5 * 0.9 - (select cost_price from product_costs where product_packaging_id = pp.id)) * 1000
from public.specifications s
cross join lateral (
  select pp.id, pp.pack_size from public.product_packagings pp
  join public.products p on p.id = pp.product_id
  where p.code = 'PR-1001' and pp.pack_size = 200
) pp
where s.specification_number = '26-510442-01';

-- Must happen before the accept-flip below - an accepted specification is
-- immutable (prevent_accepted_specification_changes trigger), so this is
-- the last point sales_account_user_id can still be set for the own-scope
-- RLS test data further down this file.
update public.specifications set sales_account_user_id = (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu')
where specification_number = '26-510442-01';

update public.specifications s set net_sales = (select coalesce(sum(li.total_price), 0) from public.specification_line_items li where li.specification_id = s.id)
where s.specification_number = '26-510442-01';

update public.specifications set status = 'accepted' where specification_number = '26-510442-01';

with conv as (
  insert into public.conversations (kind, anchor_type, anchor_id)
  select 'record', 'hull_events', he.id
  from public.hull_events he
  join public.vessels v on v.id = he.vessel_id
  where v.imo = '9123456'
  returning id
)
insert into public.messages (conversation_id, author_user_id, body)
select conv.id, (select id from public.users where email = 'max.wilckens@wilckens.com'), 'Customer confirmed drydock window for early August.'
from conv;

with conv as (
  insert into public.conversations (kind, anchor_type, anchor_id)
  select 'record', 'specifications', s.id
  from public.specifications s where s.specification_number = '26-510442-01'
  returning id
)
insert into public.messages (conversation_id, author_user_id, body)
select conv.id, (select id from public.users where email = 'max.wilckens@wilckens.com'), 'Accepted after final round of negotiation on antifouling pricing.'
from conv;

-- Real reference specification, transcribed from "Reference documents/LENA -
-- CN Standardversion ECOLOFLEX 200 (20260415).pdf" (Paint Specification No.
-- EURORI 9153-1, vessel LENA, IMO 9347750, customer Marlow Navigation Comp.
-- Ltd., dated 2026-04-15) - the only DD-type reference spec with real
-- area/coat data in this seed file; everything else above is invented for
-- testing. Every area's own line-item totals were cross-checked against the
-- document's own printed area subtotals (quantity_l x price_per_l = total,
-- and the three line totals per area sum to the printed area total) and all
-- 7 areas reconcile exactly. A few of the document's own printed
-- "Price per Area" values didn't reconcile against total/area (most likely
-- OCR/print artifacts in a scanned table, on the T/U touch-up lines and a
-- couple of F/C lines) - those cells are recomputed here as
-- round(total_price / size_m2, 2) rather than the possibly-misread printed
-- digit, favoring internal consistency over an unverifiable digit.
--
-- The document also shows a "Discount on Antifoulings" of 12,210.00 USD -
-- a discount applying ONLY to the two ECOLOFLEX SPC 200 line items, not the
-- whole specification. specification_discounts.pct is a spec-wide value, so
-- representing this precisely isn't possible with that mechanism (a
-- spec-wide equivalent pct would misrepresent it as applying to every line);
-- recorded in internal_remarks instead of fabricating an inaccurate row.
--
-- Products/packagings referenced only by this spec (real product codes from
-- the document's Product List, page 4) - pack size (200L) and cost_price are
-- assumptions (the document deliberately shows only the customer sales
-- price, not NPM's internal cost); solids_volume_pct is a genuine constant
-- per product across every line it appears on in the document, dft is not
-- (it varies by touch-up vs. full-coat context) so each area line below
-- carries its own dry_film_thickness_um override rather than relying on a
-- single product-level default.
insert into public.products (code, name, colour, category_phrase_id, group_phrase_id, is_mix, solids_volume_pct, dry_film_thickness_um)
select 'ERCC 3900LT', 'E-MARINE 2000 LT', 'red oxide',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, 80, 175
union all
select 'ERCC 7301LT', 'E-MARINE 2000 LT', 'grey',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, 80, 175
union all
select 'NES 060', 'E-MARINE A/C II 060', 'gray',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'primer'),
  false, 57, 75
union all
select 'PSPC 3309', 'ECOLOFLEX SPC 200', 'brown z',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'antifouling'),
  false, 62, 120
union all
select 'PSPC 8309', 'ECOLOFLEX SPC 200', 'light brown z',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'antifouling'),
  false, 62, 100
union all
select 'UMF 000', 'U-MARINE FINISH 000', 'white',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'topcoat'),
  false, 62, 60
union all
select 'UMF 225', 'U-MARINE FINISH 225', 'green',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'topcoat'),
  false, 62, 60
union all
select 'AMF 000', 'A-MARINE FINISH 000', 'white',
  (select id from public.phrases where category = 'product_category' and code = 'product'),
  (select id from public.phrases where category = 'product_group' and code = 'topcoat'),
  false, 44, 50;

-- Pack size 20L, derived (not assumed) from the document's own page-4
-- Product List: every product's "Quantity packed" figure (80, 20, 1060,
-- 800, 1940, 620, 580, 300) is an exact multiple of 20 and of nothing
-- larger, so 20L is the real container size these were rounded up to.
insert into public.product_packagings (product_id, supplier_id, pack_size, unit, supplier_key)
select p.id, (select id from public.companies where name = 'NPMZ(Z)'), 20, 'L', 'SUPKEY-' || p.code || '-20'
from public.products p
where p.code in ('ERCC 3900LT', 'ERCC 7301LT', 'NES 060', 'PSPC 3309', 'PSPC 8309', 'UMF 000', 'UMF 225', 'AMF 000');

-- cost_price assumed at 60% of the document's own sales price per liter
-- (the document itself only shows sales price - see comment above).
-- Per-liter, matching sales_price/net_price/total_price below - see
-- domain-model.md's formulas ("gross_profit = net_price - cost_price, per
-- unit"; total_price = sales_price x quantity_packed, no pack_size division
-- anywhere) - NOT per-package, which was this file's first draft and gave
-- every price in the Areas view (which looks prices up from here, see
-- show.tsx's priceByPackaging) a spurious x20 (this product's pack size).
insert into public.product_costs (product_packaging_id, cost_price, valid_from)
select pp.id, sales.price_per_l * 0.6, '2026-01-01'
from public.product_packagings pp
join public.products p on p.id = pp.product_id
join (values
  ('ERCC 3900LT', 5.95), ('ERCC 7301LT', 5.95), ('NES 060', 5.95),
  ('PSPC 3309', 27.50), ('PSPC 8309', 27.50),
  ('UMF 000', 8.95), ('UMF 225', 8.15), ('AMF 000', 5.95)
) as sales(code, price_per_l) on sales.code = p.code
where p.code in ('ERCC 3900LT', 'ERCC 7301LT', 'NES 060', 'PSPC 3309', 'PSPC 8309', 'UMF 000', 'UMF 225', 'AMF 000');

-- New areas the document uses that aren't in the base 5 (Flat Bottom/
-- Vertical Sides/Topside/... seeded in 01_companies_and_phrases.sql).
insert into public.spec_areas (code, name_en, is_immersed, af_zone, sequence) values
  ('06', 'Cranes (lower part)', false, null, 6),
  ('07', 'Cranes (upper part)', false, null, 7),
  ('08', 'Tanktop', true, null, 8),
  ('09', 'Markings', false, null, 9);

insert into public.vessels (imo, name, status)
values ('9347750', 'LENA', 'In Service');

insert into public.hull_events (vessel_id, type_phrase_id, status, event_date)
select v.id, (select id from public.phrases where category = 'hull_event_type' and code = 'DD'), 'Secured', '2026-04-15'::date
from public.vessels v where v.imo = '9347750';

insert into public.specifications (
  hull_event_id, team_id, supplier_id, specification_number, version, status,
  specification_date, delivery_date, currency, exchange_rate, customer_name, remarks_text, internal_remarks
)
select he.id,
  (select id from public.teams where id in (select team_id from public.owner_associate_teams) and name = 'NPMEU'),
  (select id from public.companies where name = 'NPMZ(Z)'),
  'EURORI 9153-1', 1, 'draft',
  '2026-04-15', '2026-05-15', 'USD', 1.0, 'Marlow Navigation Comp. Ltd.',
  'Our technical inspector will be present to assist and advise during this project. However, the responsibility for execution of the work stays with the shipyard & subcontractor. HP fresh water cleaning to be carried out immediately after entering dry dock in order to remove all marine growth, salt deposits etc. Salt residue should not exceed 30mg/sq.mtr. Oil and/or grease deposits to be removed with suitable cleaner. Scuppers to be plugged with drain pipes. Propeller, zinc-anodes, echo sounders to be protected properly. Paints to be applied according information given in technical datasheets and mixed with mechanical mixers. In case of application of a self polishing anti-fouling system, the topside and boottop area should be completed first.',
  'Document shows a 12,210.00 USD "Discount on Antifoulings" applying only to the ECOLOFLEX SPC 200 line items (~27.4% off their subtotal) - not modeled as a specification_discounts row since that mechanism is spec-wide, not per-line.'
from public.hull_events he
join public.vessels v on v.id = he.vessel_id
where v.imo = '9347750';

insert into public.specification_areas (specification_id, sequence, area_id, size_m2, substrate_phrase_id, surface_preparation_text)
select s.id, a.sequence,
  (select id from public.spec_areas where code = a.area_code),
  a.size_m2,
  (select id from public.phrases where category = 'substrate' and code = 'steel'),
  a.surface_prep
from public.specifications s
cross join (values
  (1, '01', 1700, 'High-pressure freshwater washing (minimum 250 bar) Blast Cleaning Sa 2 according to ISO 8501-1.'),
  (2, '02', 2500, 'High-pressure freshwater washing (minimum 250 bar) Blast Cleaning Sa 2 according to ISO 8501-1.'),
  (3, '05', 1530, 'High-pressure freshwater washing (minimum 250 bar) Spot blast cleaning Sa 2 according to ISO 8501-1.'),
  (4, '06', 280, 'High-pressure freshwater washing (minimum 250 bar) Spot blast cleaning Sa 2 according to ISO 8501-1.'),
  (5, '07', 280, 'High-pressure freshwater washing (minimum 250 bar) Spot blast cleaning Sa 2 according to ISO 8501-1.'),
  (6, '08', 2100, 'High-pressure freshwater washing (minimum 250 bar) Spot blast cleaning Sa 2 according to ISO 8501-1.'),
  (7, '09', 100, 'High-pressure freshwater washing (minimum 250 bar) Blast Cleaning Sa 2 according to ISO 8501-1.')
) as a(sequence, area_code, size_m2, surface_prep)
where s.specification_number = 'EURORI 9153-1';

-- Area/coat lines - see the file header comment above this block for how
-- price_per_m2 was derived where the document's own printed value didn't
-- reconcile with total_price/size_m2.
insert into public.specification_area_products (
  specification_area_id, sequence, product_packaging_id, coat_mode_phrase_id, coat_pct,
  theoretical_spreading_rate, loss_factor_pct, coverage_practical, quantity_l,
  price_per_l, price_per_m2, total_price, size_m2, dry_film_thickness_um
)
select sa.id, l.sequence, pp.id,
  (select id from public.phrases where category = 'coat_mode' and code = l.coat_mode),
  l.coat_pct, l.cov_theor, l.loss_pct, l.cov_pract, l.qty_l,
  l.price_l, l.price_m2, l.total, l.line_size_m2, l.dft
from public.specification_areas sa
join public.specifications s on s.id = sa.specification_id
join (values
  -- area_seq, line_seq, product_code, coat_mode, coat_pct, cov_theor, loss_pct, cov_pract, qty_l, price_l, price_m2, total, line_size_m2, dft
  (1, 1, 'ERCC 3900LT', 'fc', 100, 4.57, 40, 2.74, 620, 5.95, 1.79, 3689.00, 1700, 175),
  (1, 2, 'NES 060',     'fc', 100, 7.60, 30, 5.32, 320, 5.95, 0.92, 1904.00, 1700, 75),
  (1, 3, 'PSPC 3309',   'fc', 100, 5.17, 30, 3.62, 470, 27.50, 6.28, 12925.00, 1700, 120),

  (2, 1, 'ERCC 3900LT', 'fc', 100, 4.57, 40, 2.74, 911, 5.95, 1.79, 5420.45, 2500, 175),
  (2, 2, 'NES 060',     'fc', 100, 7.60, 30, 5.32, 470, 5.95, 0.92, 2796.50, 2500, 75),
  (2, 3, 'PSPC 8309',   'fc', 100, 6.20, 30, 4.34, 576, 27.50, 5.23, 15840.00, 2500, 100),
  (2, 4, 'PSPC 3309',   'fc', 100, 6.20, 30, 4.34, 576, 27.50, 5.23, 15840.00, 2500, 100),

  (3, 1, 'ERCC 3900LT', 'tu', 40, 8.00, 40, 4.80, 128, 5.95, 1.24, 761.60, 612, 100),
  (3, 2, 'ERCC 7301LT', 'tu', 40, 8.00, 30, 5.60, 109, 5.95, 1.06, 648.55, 612, 100),
  (3, 3, 'UMF 225',     'fc', 100, 10.33, 40, 6.20, 247, 8.15, 1.32, 2013.05, 1530, 60),

  (4, 1, 'ERCC 3900LT', 'tu', 40, 8.00, 40, 4.80, 23, 5.95, 1.22, 136.85, 112, 100),
  (4, 2, 'ERCC 7301LT', 'tu', 40, 8.00, 30, 5.60, 20, 5.95, 1.06, 119.00, 112, 100),
  (4, 3, 'UMF 225',     'fc', 100, 10.33, 40, 6.20, 45, 8.15, 1.31, 366.75, 280, 60),

  (5, 1, 'ERCC 3900LT', 'tu', 40, 8.00, 40, 4.80, 23, 5.95, 1.22, 136.85, 112, 100),
  (5, 2, 'ERCC 7301LT', 'tu', 40, 8.00, 30, 5.60, 20, 5.95, 1.06, 119.00, 112, 100),
  (5, 3, 'AMF 000',     'fc', 100, 8.80, 40, 5.28, 53, 5.95, 1.13, 315.35, 280, 50),

  (6, 1, 'ERCC 3900LT', 'tu', 50, 6.40, 30, 4.48, 234, 5.95, 1.33, 1392.30, 1050, 125),
  (6, 2, 'ERCC 7301LT', 'fc', 100, 6.40, 30, 4.48, 469, 5.95, 1.33, 2790.55, 2100, 125),

  (7, 1, 'UMF 000',     'fc', 100, 10.33, 40, 6.20, 16, 8.95, 1.43, 143.20, 100, 60),
  (7, 2, 'AMF 000',     'fc', 100, 8.80, 30, 6.16, 16, 5.95, 0.95, 95.20, 100, 50)
) as l(area_sequence, sequence, product_code, coat_mode, coat_pct, cov_theor, loss_pct, cov_pract, qty_l, price_l, price_m2, total, line_size_m2, dft)
  on l.area_sequence = sa.sequence
join public.products p on p.code = l.product_code
join public.product_packagings pp on pp.product_id = p.id
where s.specification_number = 'EURORI 9153-1';

-- Flat consolidated Product List, transcribed directly from the document's
-- own page 4 (one row per product, summed across every area it's used in -
-- not re-derived from the area lines above, since the document's own
-- packed quantities round up per product across the whole job, not per
-- area). sales_price/cost_price/net_price/gross_profit are all per-liter
-- (matching domain-model.md's formulas exactly: total_price = sales_price x
-- quantity_packed, gross_profit = net_price - cost_price "per unit", no
-- pack_size anywhere) - NOT per-package, which this file's first draft used
-- and which also fed a spurious x20 into the Areas view (see show.tsx's
-- priceByPackaging, which looks its per-liter price up from exactly this
-- table). total_price verified against every one of the document's own
-- printed row totals (all 8 reconcile exactly, summing to the document's
-- own printed "68.192,00"). No per-line discount_pct - the document's only
-- discount (see internal_remarks above) applies globally to the antifouling
-- lines' subtotal, not as a per-line negotiated %.
insert into public.specification_line_items (
  specification_id, sequence, product_packaging_id, quantity_product, real_quantity, offered_qty,
  sales_price, discount_pct, net_price, cost_price, gross_profit, gross_profit_pct, total_price, total_gross_profit
)
select s.id, l.sequence, pp.id, l.qty_practical, l.qty_practical, l.qty_packed,
  l.price_l,
  0,
  l.price_l,
  (select cost_price from public.product_costs where product_packaging_id = pp.id),
  l.price_l - (select cost_price from public.product_costs where product_packaging_id = pp.id),
  (l.price_l - (select cost_price from public.product_costs where product_packaging_id = pp.id)) / l.price_l * 100,
  l.price_l * l.qty_packed,
  (l.price_l - (select cost_price from public.product_costs where product_packaging_id = pp.id)) * l.qty_packed
from public.specifications s
join (values
  -- sequence, product_code, price_l, qty_practical, qty_packed
  (1, 'ERCC 3900LT', 5.95, 1939, 1940),
  (2, 'ERCC 7301LT', 5.95, 618, 620),
  (3, 'NES 060',     5.95, 790, 800),
  (4, 'PSPC 3309',   27.50, 1046, 1060),
  (5, 'PSPC 8309',   27.50, 576, 580),
  (6, 'UMF 000',     8.95, 16, 20),
  (7, 'UMF 225',     8.15, 292, 300),
  (8, 'AMF 000',     5.95, 69, 80)
) as l(sequence, product_code, price_l, qty_practical, qty_packed) on true
join public.products p on p.code = l.product_code
join public.product_packagings pp on pp.product_id = p.id
where s.specification_number = 'EURORI 9153-1';

-- Own/team scope test data - the sales_account_user_id/assigned_team_id
-- defaults (auth.uid()) added by the own/team RLS migration only fire on
-- inserts made through the app itself (a real JWT context); psql seeding has
-- none, so these need to be set explicitly. Deliberately spread across the
-- three existing demo specs/hull events so ugur.akbati@nipponpaint-marine.eu
-- (Sales Rep role, member of "Sales - NPMEU", see above) has exactly one
-- record visible via 'own', one via 'team', and one that stays invisible to
-- them - a real, log-in-and-see check that filtering actually excludes
-- something, not just includes it.
update public.hull_events he set sales_account_user_id = u.id
from public.vessels v, public.users u
where he.vessel_id = v.id and v.imo = '9123456' and u.email = 'ugur.akbati@nipponpaint-marine.eu';

-- 26-510442-01's sales_account_user_id is set earlier in this file, before its
-- accept-flip (accepted specifications are immutable).

update public.hull_events he set assigned_team_id = g.id
from public.vessels v, public.teams g
where he.vessel_id = v.id and v.imo = '9234567' and g.name = 'Sales - NPMEU';

update public.specifications set assigned_team_id = (select id from public.teams where name = 'Sales - NPMEU')
where specification_number = '26-483920';

-- LENA (EURORI 9153-1) and its hull event are left unassigned - visible only
-- to Admin, confirming the sales test user's view is actually filtered.
