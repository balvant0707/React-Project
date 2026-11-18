-- Copied from ~/maintenance_tool/supabase/tests/stock_history_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Stock history (migration 20261101100000_stock_history.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/stock_history_smoke.sql
-- Local stack, seeded DB. Everything runs in one transaction and is rolled back.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  v_spare uuid := (select id from public.phrases where category = 'item_category' and code = 'spare_part');
  v_store uuid; v_item uuid; v_other uuid;
  v_n integer;
begin
  -- Fixtures as the table owner (the ledger is closed to users): +10 twelve days ago, -4 five days ago, +1 now.
  insert into public.stock_locations (name) values ('History store') returning id into v_store;
  insert into public.items (item_number, name, category_phrase_id) values ('SH-1', 'History part', v_spare) returning id into v_item;
  insert into public.items (item_number, name, category_phrase_id) values ('SH-2', 'Untouched part', v_spare) returning id into v_other;
  update public.items set stock_managed = true, default_stock_location_id = v_store where id in (v_item, v_other);
  insert into public.stock_movements (item_id, stock_location_id, quantity, kind, created_at) values
    (v_item, v_store, 10, 'opening', now() - interval '12 days'),
    (v_item, v_store, -4, 'issue', now() - interval '5 days'),
    (v_item, v_store, 1, 'receipt', now());
  set local role authenticated;

  perform pg_temp.act_as('anna.weber@example.com');
  select count(*) into v_n from public.stock_history(array[v_item, v_other], 4);
  assert v_n = 8, '1 one point per item and week: ' || v_n;
  -- Points are today, -7, -14, -21 days: 7 (10 - 4 + 1), 10 (before the issue), 0 (before the opening).
  assert (select quantity from public.stock_history(array[v_item], 4) where day = current_date) = 7, '2 today = balance';
  assert (select quantity from public.stock_history(array[v_item], 4) where day = current_date - 7) = 10, '3 a week ago: before the issue';
  assert (select quantity from public.stock_history(array[v_item], 4) where day = current_date - 14) = 0, '4 before the opening: 0';
  assert (select quantity from public.stock_history(array[v_other], 4) where day = current_date) = 0, '5 untouched item: 0';
  assert (select count(*) from public.stock_history(array[v_item], 1000)) = 104, '6 weeks are capped';
  assert (select count(*) from public.stock_history(null, 4)) = 0, '7 no items, no rows';

  -- Without stock.view nothing comes back.
  reset role;
  delete from public.role_permissions where permission = 'stock.view'
    and role_id in (select ur.role_id from public.user_roles ur where ur.user_id = (select id from public.users where email = 'ben.keller@example.com'));
  set local role authenticated;
  perform pg_temp.act_as('ben.keller@example.com');
  assert (select count(*) from public.stock_history(array[v_item], 4)) = 0, '8 hidden without stock.view';
  raise notice 'stock_history_smoke ok';
end;
$$;
rollback;
