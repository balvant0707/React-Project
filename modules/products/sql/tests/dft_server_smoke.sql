-- The DFT proposal runs on the server and the coefficient master data is admin-only (migration 20261115140000_npm_products_dft_server).
-- apps: npm. Needs the seed (a product with coefficients). Rolled back.
begin;
do $$
declare
  v_user uuid; v_pkg uuid; v_n int;
begin
  select pp.id into v_pkg from public.product_packagings pp join public.product_coefficients pc using (product_id) limit 1;
  assert v_pkg is not null, 'seed: a packaging whose product has coefficients';

  -- a user who is not an admin
  for v_user in select id from public.users loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    exit when not public.is_admin();
    v_user := null;
  end loop;
  assert v_user is not null, 'seed: a user who is not an admin';

  execute 'set local role authenticated';
  select count(*) into v_n from public.product_coefficients;  assert v_n = 0, 'FAIL: coefficients readable by a non-admin';
  select count(*) into v_n from public.coefficient_curves;    assert v_n = 0, 'FAIL: curves readable by a non-admin';
  select count(*) into v_n from public.coefficient_points;    assert v_n = 0, 'FAIL: curve points readable by a non-admin';

  -- the server calculation works for them: two coats (150 + 10) on a flat bottom, 150 + 100 on the vertical sides
  assert public.dft_proposal(v_pkg, 18, 17.5, 275, 60, 'flat_bottom', 0) = 150, 'FAIL: flat bottom coat 1';
  assert public.dft_proposal(v_pkg, 18, 17.5, 275, 60, 'flat_bottom', 1) = 10, 'FAIL: flat bottom coat 2';
  assert public.dft_proposal(v_pkg, 18, 17.5, 275, 60, 'flat_bottom', 2) is null, 'FAIL: no third coat';
  assert public.dft_proposal(v_pkg, 18, 17.5, 275, 60, 'vertical', 1) = 100, 'FAIL: vertical coat 2';
  assert public.dft_proposal(v_pkg, null, 17.5, 275, 60) is null, 'FAIL: missing input gives no proposal';
  assert public.dft_proposal(gen_random_uuid(), 18, 17.5, 275, 60) is null, 'FAIL: unknown packaging gives no proposal';
  select count(*) into v_n from public.product_max_dft(array[(select product_id from public.product_packagings where id = v_pkg)]);
  assert v_n = 1, 'FAIL: the maximum DFT of a product with coefficients is available to a non-admin';
  assert (select maximum_dft_per_coat_um from public.product_max_dft(array[(select product_id from public.product_packagings where id = v_pkg)])) = 150, 'FAIL: maximum value';

  execute 'reset role';
  assert not has_function_privilege('anon', 'public.dft_proposal(uuid,double precision,double precision,double precision,double precision,text,integer)', 'execute'), 'FAIL: anon can run dft_proposal';
  assert not has_function_privilege('authenticated', 'public.dft_curve_value(uuid,double precision)', 'execute'), 'FAIL: dft_curve_value is callable by users';
end $$;
select 'dft_server_smoke: all checks passed' as result;
rollback;
