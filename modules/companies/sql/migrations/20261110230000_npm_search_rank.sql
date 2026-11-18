-- Taken from the NPM dump: NPM header search (global_search_pass) as platform search sources.
-- The ranking NPM's search uses (exact pass: position of the hit; fuzzy pass: platform search_field_score).
CREATE FUNCTION public.search_rank(field text, term text, fuzzy boolean) RETURNS real
    LANGUAGE sql STABLE
    AS $$
  -- One plain expression, and deliberately no `set search_path` clause (every
  -- reference is schema-qualified): either one stops the planner inlining the
  -- function, which made each call cost ~20 us on thousands of rows.
  -- Non-matching values come out <= 0, below every substring hit (>= 0.3 even
  -- for a 200+ character value).
  select case
    when fuzzy then public.search_field_score(field, term)
    else (
      case strpos(lower(coalesce(field, '')), lower(term))
        when 0 then 0
        when 1 then case when length(field) = length(term) then 2.0 else 1.3 end
        else case
          when substr(lower(field), strpos(lower(field), lower(term)) - 1, 1) = ' ' then 1.0
          else 0.5
        end
      end
      - least(length(coalesce(field, '')), 200) / 1000.0
    )::real
  end;
$$;
revoke all on function public.search_rank(text, text, boolean) from public, anon;
grant execute on function public.search_rank(text, text, boolean) to authenticated, service_role;
