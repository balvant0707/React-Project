-- Taken from the NPM dump: NPM header search (global_search_pass) as platform search sources.
CREATE FUNCTION public.search_match_products(p_term text, p_fuzzy boolean, p_limit integer) RETURNS TABLE(id uuid, code text, name text, rank real)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_pattern text := '%' || p_term || '%';
begin
  if (select auth.uid()) is null or not (select public.mfa_satisfied()) then
    return;
  end if;
  return query
  select
    pr.id, pr.code, pr.name,
    greatest(
      public.search_rank(pr.code, p_term, p_fuzzy),
      public.search_rank(pr.name, p_term, p_fuzzy)
    )
  from public.products pr
  where pr.code ilike v_pattern or p_term operator(extensions.<%) pr.code
     or pr.name ilike v_pattern or p_term operator(extensions.<%) pr.name
  order by 4 desc
  limit p_limit;
end;
$$;
revoke all on function public.search_match_products(text, boolean, integer) from public, anon;
grant execute on function public.search_match_products(text, boolean, integer) to authenticated, service_role;

create function public.products_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
select 'products'::text, pr.id, pr.rank, null::bigint, pr.code, pr.name, null::text, null::text, null::uuid, null::text, null::text,
         null::timestamptz, null::uuid
  from public.search_match_products(p_term, p_fuzzy, 8) pr
$$;
revoke all on function public.products_search(text, boolean, bigint) from public, anon;
grant execute on function public.products_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('products', 'products', 'products_search', 'Products by code and name (NPM)');
