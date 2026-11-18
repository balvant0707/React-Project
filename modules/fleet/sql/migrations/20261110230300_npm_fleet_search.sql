-- Taken from the NPM dump: NPM header search (global_search_pass) as platform search sources.
CREATE FUNCTION public.search_match_vessels(p_term text) RETURNS TABLE(id uuid, name text, imo text)
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
  select v.id, v.name, v.imo
  from public.vessels v
  where v.name ilike v_pattern or p_term operator(extensions.<%) v.name
     or v.imo ilike v_pattern or p_term operator(extensions.<%) v.imo;
end;
$$;
revoke all on function public.search_match_vessels(text) from public, anon;
grant execute on function public.search_match_vessels(text) to authenticated, service_role;
CREATE FUNCTION public.search_match_phrases(p_term text) RETURNS TABLE(id uuid)
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
  select p.id
  from public.phrases p
  where p.text_en ilike v_pattern or p_term operator(extensions.<%) p.text_en
     or p.code ilike v_pattern or p_term operator(extensions.<%) p.code;
end;
$$;
revoke all on function public.search_match_phrases(text) from public, anon;
grant execute on function public.search_match_phrases(text) to authenticated, service_role;

create function public.vessels_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
select 'vessels'::text, v.id,
         greatest(public.search_rank(v.name, p_term, p_fuzzy), public.search_rank(v.imo, p_term, p_fuzzy)),
         null::bigint, v.name, v.imo, null::text, null::text, null::uuid, null::text, null::text, null::timestamptz, null::uuid
  from public.search_match_vessels(p_term) v
  order by 3 desc
  limit 8
$$;
revoke all on function public.vessels_search(text, boolean, bigint) from public, anon;
grant execute on function public.vessels_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('vessels', 'fleet', 'vessels_search', 'Vessels by name and IMO (NPM)');

create function public.hull_events_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
-- Security invoker: row security decides which hull events one finds (as in NPM).
  select 'hull_events'::text, he.id,
         greatest(public.search_rank(v.name, p_term, p_fuzzy), public.search_rank(v.imo, p_term, p_fuzzy),
                  public.search_rank(p.text_en, p_term, p_fuzzy), public.search_rank(p.code, p_term, p_fuzzy)),
         null::bigint, v.name, v.imo, p.text_en, null::text, null::uuid, null::text, null::text, he.event_date::timestamptz, null::uuid
  from public.hull_events he
  left join public.vessels v on v.id = he.vessel_id
  left join public.phrases p on p.id = he.type_phrase_id
  where he.vessel_id in (select mv.id from public.search_match_vessels(p_term) mv)
     or he.type_phrase_id in (select mp.id from public.search_match_phrases(p_term) mp)
  order by 3 desc
  limit 8
$$;
revoke all on function public.hull_events_search(text, boolean, bigint) from public, anon;
grant execute on function public.hull_events_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('hull_events', 'fleet', 'hull_events_search', 'Hull events by vessel and event type (NPM)');
