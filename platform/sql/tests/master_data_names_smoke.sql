-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/master_data_names_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- German names of master data (migration 20261114100000_master_data_german_names.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/master_data_names_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
do $$
declare
  v_id uuid;
begin
  assert (select name_de from public.task_types where key = 'purchase_request') = 'Beschaffungsanfrage', '1 built-in type has its German name';
  assert (select translations ->> 'de' from public.roles where name = 'Workshop') = 'Werkstatt', '2 built-in role';
  assert (select count(*) from public.asset_types where name_de = name) = 0, '3 seeded asset types are translated';
  assert (select count(*) from public.task_type_steps where name_de is null or name_de = '') = 0, '4 no step without German name';

  -- (5-7 roles: platform roles keep their names in translations, the UI falls back to the name)

  -- The views carry the German names.
  assert (select count(*) from public.tickets_overview where queue_name_de is null) = 0, '8 tickets_overview';
  assert (select count(*) from public.tasks_overview where task_type_name_de is null) = 0, '9 tasks_overview';
  assert (select count(*) from public.assets_overview where asset_type_name is not null and asset_type_name_de is null) = 0, '10 assets_overview';
end $$;
rollback;
