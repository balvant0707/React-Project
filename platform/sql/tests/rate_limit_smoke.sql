-- The platform rate limiter (migration 20261115110000_platform_rate_limit.sql): counts per bucket and window, refuses
-- over the maximum, buckets are independent, and only service_role can call it. Rolled back.
begin;
do $$
declare
  r boolean[] := '{}';
  i int;
begin
  for i in 1..4 loop
    r := r || public.rate_limit_hit('smoke:a', 3600, 3);
  end loop;
  assert r = array[true, true, true, false], 'first three pass, the fourth is refused: ' || r::text;
  assert public.rate_limit_hit('smoke:b', 3600, 3), 'another bucket is counted on its own';
  assert (select request_count from public.rate_limit_buckets where bucket_key = 'smoke:a') = 4, 'every call is counted';

  begin
    perform public.rate_limit_hit('smoke:c', 0, 3);
    assert false, 'a zero window must be refused';
  exception when sqlstate '22023' then null;
  end;

  assert has_function_privilege('service_role', 'public.rate_limit_hit(text, integer, integer)', 'execute'), 'service_role runs it';
  assert not has_function_privilege('authenticated', 'public.rate_limit_hit(text, integer, integer)', 'execute'), 'authenticated must not run it';
  assert not has_function_privilege('anon', 'public.rate_limit_hit(text, integer, integer)', 'execute'), 'anon must not run it';
  assert not has_table_privilege('authenticated', 'public.rate_limit_buckets', 'select'), 'authenticated must not read the buckets';
  assert not has_table_privilege('anon', 'public.rate_limit_buckets', 'select'), 'anon must not read the buckets';
end $$;
rollback;
select 'rate_limit_smoke: all checks passed' as result;
