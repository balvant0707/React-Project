-- Taken from the NPM dump: NPM header search (global_search_pass) as platform search sources.
CREATE FUNCTION public.search_match_companies(p_term text, p_fuzzy boolean, p_limit integer) RETURNS TABLE(id uuid, name text, short_code text, rank real, is_group_company boolean)
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
    c.id, c.name, c.short_code, c.rank,
    exists (
      select 1 from public.companies child
      where child.group_company_id = c.id and child.id <> c.id
    )
  from (
    select
      c0.id, c0.name, c0.short_code,
      greatest(
        public.search_rank(c0.name, p_term, p_fuzzy),
        public.search_rank(c0.short_code, p_term, p_fuzzy)
      ) as rank
    from public.companies c0
    where c0.name ilike v_pattern or p_term operator(extensions.<%) c0.name
       or c0.short_code ilike v_pattern or p_term operator(extensions.<%) c0.short_code
    order by 4 desc
    limit p_limit
  ) c;
end;
$$;
revoke all on function public.search_match_companies(text, boolean, integer) from public, anon;
grant execute on function public.search_match_companies(text, boolean, integer) to authenticated, service_role;

create function public.companies_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
select 'companies'::text, c.id, c.rank, null::bigint, c.name, c.short_code,
         case when c.is_group_company then 'group' end, null::text, null::uuid, null::text, null::text, null::timestamptz, null::uuid
  from public.search_match_companies(p_term, p_fuzzy, 8) c
$$;
revoke all on function public.companies_search(text, boolean, bigint) from public, anon;
grant execute on function public.companies_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('companies', 'companies', 'companies_search', 'Companies by name and short code (NPM)');
