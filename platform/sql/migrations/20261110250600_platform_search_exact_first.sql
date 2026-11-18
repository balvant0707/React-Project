-- Header search: exact pass first, typo matching only when it finds nothing (NPM's global_search did it that way; the
-- platform's, from COMPASS, always matched with typos). Measured on full-size RADAR data (40k companies, 175k vessels):
-- "PF company 12" took 2.7-2.9 s with typo matching on every source (companies alone 1.7 s), NPM 0.12-0.17 s. A term with
-- exact hits now costs the exact pass only; a typo ("Maersc") still finds through the second pass.
-- global_search_pass() is the former body of global_search() with the switch p_fuzzy; both passes use NPM's similarity
-- thresholds.

CREATE FUNCTION public.global_search_pass(p_search_term text, p_result_limit integer, p_fuzzy boolean)
 RETURNS TABLE(entity_type text, id uuid, rank real, number bigint, title text, subtitle text, status text, parent_type text, parent_id uuid, parent_title text, snippet text, event_at timestamp with time zone, author_user_id uuid)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_term text := trim(coalesce(p_search_term, ''));
  v_pattern text;
  v_number bigint;
  v_fuzzy boolean;
  v_per_type constant integer := 8;
begin
  if length(v_term) < 2 then
    return;
  end if;
  v_pattern := '%' || v_term || '%';
  -- "#14" or "14" also finds task / ticket number 14.
  if regexp_replace(v_term, '^#', '') ~ '^[0-9]{1,9}$' then
    v_number := regexp_replace(v_term, '^#', '')::bigint;
  end if;
  -- A purely numeric term is a number lookup: no typo matching (digits are similar to far too many things).
  -- p_fuzzy: the pass with typo matching (global_search runs it only when the exact pass found nothing).
  v_fuzzy := p_fuzzy and v_number is null;
  -- Transaction-local (a function-level SET is rejected at create time before pg_trgm is loaded).
  -- NPM's thresholds (its global_search_pass, measured there): 1 = substring hits only for the exact pass and 2-character
  -- terms (NPM's matchers use the similarity operator in the exact pass too: with 0.3 a common prefix such as
  -- "PF company 12" pulled thousands of near matches into it); typo pass 0.3 below 5 characters, else 0.4 (0.3 admitted
  -- >1500 vessels for a 5-letter typo and scoring them is the cost).
  perform set_config('pg_trgm.word_similarity_threshold',
    case when not v_fuzzy or length(v_term) < 3 then '1' when length(v_term) < 5 then '0.3' else '0.4' end, true);

  return query
  with matches as (
    (
      -- Everything the modules registered (search_source_register): records, products, ... Each source limits itself.
      select * from public.search_source_hits(v_term, v_fuzzy, v_number)
    )
    union all
    (
      -- Comments on records and posts in teams (last 12 months), found through the index first and checked for
      -- access only for the hits (public.search_messages): the row policy on every message would cost seconds.
      select * from public.search_messages(v_term, v_fuzzy)
    )
    union all
    (
      -- Documents and photos by file name: candidates through the trigram index, access per hit (search_documents).
      select * from public.search_documents(v_term, v_fuzzy)
    )
    union all
    (
      -- People of the directory (former employees are hidden, like in the directory itself).
      select 'people'::text, u.id,
        greatest(public.search_field_score(u.name, v_term), public.search_field_score(u."position", v_term) * 0.7,
                 public.search_field_score(u.email, v_term) * 0.7)::real,
        null::bigint, u.name, nullif(concat_ws(' · ', u."position", u.site), ''), null::text,
        null::text, null::uuid, null::text, null::text, u.created_at, null::uuid
      from (
        -- Newest 300 matches first, scored afterwards.
        select u0.* from public.users u0
        where not u0.has_left
          and (u0.name ilike v_pattern or (v_fuzzy and v_term operator(extensions.<%) u0.name)
            or u0."position" ilike v_pattern or (v_fuzzy and v_term operator(extensions.<%) u0."position")
            or u0.email ilike v_pattern)
        order by u0.created_at desc limit 300
      ) u
      order by 3 desc limit v_per_type
    )
  )
  select * from matches order by 3 desc limit p_result_limit;
end;
$function$;

revoke all on function public.global_search_pass(text, integer, boolean) from public, anon;
grant execute on function public.global_search_pass(text, integer, boolean) to authenticated, service_role;

create or replace function public.global_search(p_search_term text, p_result_limit integer default 40)
returns table(entity_type text, id uuid, rank real, number bigint, title text, subtitle text, status text, parent_type text,
              parent_id uuid, parent_title text, snippet text, event_at timestamp with time zone, author_user_id uuid)
language plpgsql stable set search_path to '' as $$
begin
  return query select * from public.global_search_pass(p_search_term, p_result_limit, false);
  if found then
    return;
  end if;
  return query select * from public.global_search_pass(p_search_term, p_result_limit, true);
end;
$$;
revoke all on function public.global_search(text, integer) from public, anon;
grant execute on function public.global_search(text, integer) to authenticated, service_role;
