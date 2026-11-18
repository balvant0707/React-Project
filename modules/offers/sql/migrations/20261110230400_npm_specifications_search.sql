-- Taken from the NPM dump: NPM header search (global_search_pass) as platform search sources.

create function public.specifications_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
-- Security invoker: row security decides which specifications one finds (as in NPM). title = number, number = version,
  -- subtitle = vessel, snippet = enquiry number, event_at = delivery date.
  select 'specifications'::text, s.id,
         greatest(public.search_rank(v.name, p_term, p_fuzzy), public.search_rank(v.imo, p_term, p_fuzzy),
                  public.search_rank(s.specification_number, p_term, p_fuzzy), public.search_rank(s.enquiry_number, p_term, p_fuzzy)),
         s.version::bigint, s.specification_number, concat_ws(' · ', v.imo, v.name), s.status, null::text, null::uuid, null::text,
         s.enquiry_number, s.delivery_date::timestamptz, null::uuid
  from public.specifications s
  left join public.vessels v on v.id = s.vessel_id
  where s.vessel_id in (select mv.id from public.search_match_vessels(p_term) mv)
     or s.specification_number ilike '%' || p_term || '%' or p_term operator(extensions.<%) s.specification_number
     or s.enquiry_number ilike '%' || p_term || '%' or p_term operator(extensions.<%) s.enquiry_number
  order by 3 desc
  limit 8
$$;
revoke all on function public.specifications_search(text, boolean, bigint) from public, anon;
grant execute on function public.specifications_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('specifications', 'offers', 'specifications_search', 'Specifications by vessel, number and enquiry number (NPM)');
