-- Copied from ~/maintenance_tool/supabase/tests/holiday_import_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Holiday import (migration 20261106100000_holiday_import.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/holiday_import_smoke.sql
begin;
do $$
declare
  v_n integer;
begin
  -- manual rows of the first migration stay, imported ones are replaced for the period only
  insert into public.public_holidays (holiday_date, name, site, source) values ('2031-05-01', 'Old import', null, 'import'), ('2031-06-01', 'Company day', null, 'manual');
  v_n := public.holidays_replace_import('2031-01-01', '2031-12-31',
    '[{"date": "2031-01-01", "name": "Neujahr", "site": null}, {"date": "2031-01-06", "name": "Heilige Drei Könige", "site": "Werk Süd"},
      {"date": "2031-06-01", "name": "Duplicate of manual", "site": null}]'::jsonb);
  assert v_n = 2, 'inserted 2, the manual day wins: ' || v_n;
  assert not exists (select 1 from public.public_holidays where name = 'Old import'), 'old import replaced';
  assert (select source from public.public_holidays where holiday_date = '2031-06-01') = 'manual', 'manual kept';
  assert (select site from public.public_holidays where holiday_date = '2031-01-06') = 'Werk Süd', 'regional row has the site';
  -- the first migration's national holidays outside the period are untouched
  assert exists (select 1 from public.public_holidays where holiday_date = '2027-01-01'), 'other years untouched';
  begin
    perform public.holidays_replace_import('2031-01-01', '2031-12-31', '{"not": "an array"}'::jsonb);
    raise exception 'accepted a non-array';
  exception when others then
    assert sqlerrm like 'p_rows must be an array%', sqlerrm;
  end;
  assert not has_function_privilege('authenticated', 'public.holidays_replace_import(date, date, jsonb)', 'execute'), 'not callable by users';
  assert has_function_privilege('service_role', 'public.holidays_replace_import(date, date, jsonb)', 'execute'), 'service role may';
end $$;
rollback;
