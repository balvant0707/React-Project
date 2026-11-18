-- WP2: products slice. Rolled back.
begin;
do $$
declare v_p uuid;
begin
  assert (select count(*) from pg_tables where schemaname = 'public' and tablename in
    ('products','product_packagings','product_costs','product_coefficients','coefficient_curves','coefficient_points',
     'product_mix_components','product_overcoating_intervals','antifouling_products')) = 9, 'tables exist';
  assert exists (select 1 from public.permissions where key = 'products.edit'), 'literal registered';
  assert (select count(*) from pg_views where viewname = 'product_packagings_overview') = 1, 'view';
end $$;
select 'npm_products_smoke: all checks passed' as result;
rollback;
