-- One scale for every search source of both apps (docs/shared-parts.md, 2026-11-12). The header search lists the hits
-- of all sources by score, but the NPM sources (companies, vessels, hull events, specifications, products) scored with
-- NPM's search_rank (exact pass: 2.0 whole value, 1.3 prefix, 1.0 word start, 0.5 inside) and the COMPASS ones (tasks,
-- assets, items, tickets, people, messages, documents) with search_field_score (about 1.3 for any substring hit), so the
-- order across sources depended on which app a source came from.
--   * search_hit_score (new): NPM's search_rank exact branch (copied from 20261110230000_npm_search_rank.sql), raised by 1
--     so a substring hit stays above every typo-only match (word similarity, at most 1), as COMPASS's +0.3 kept it; 0 when
--     the field does not hold the term. Cheap: no similarity computed.
--   * search_field_score as in 20261109130000_platform_messaging.sql (COMPASS); changed: a substring hit scores
--     search_hit_score, anything else its word similarity as before.
--   * Neither has a `set search_path` clause (every reference is schema-qualified): NPM's note on search_rank, either clause
--     stops the planner inlining the function, which cost ~20 us a call on thousands of rows.
-- search_rank (npm-base) now returns search_hit_score in the exact pass and search_field_score in the typo pass
-- (20261113170100_npm_search_rank_one_scale.sql). Test: search_one_scale_smoke.sql.

create function public.search_hit_score(p_field text, p_term text) returns real
  language sql stable
  as $$
  select (
    case strpos(lower(coalesce(p_field, '')), lower(p_term))
      when 0 then 0
      when 1 then 1 + case when length(p_field) = length(p_term) then 2.0 else 1.3 end - least(length(p_field), 200) / 1000.0
      else 1
        + case when substr(lower(p_field), strpos(lower(p_field), lower(p_term)) - 1, 1) = ' ' then 1.0 else 0.5 end
        - least(length(p_field), 200) / 1000.0
    end
  )::real;
$$;
revoke all on function public.search_hit_score(text, text) from public, anon;
grant execute on function public.search_hit_score(text, text) to authenticated, service_role;

create or replace function public.search_field_score(p_field text, p_term text) returns real
  language sql stable
  as $$
  select coalesce(nullif(public.search_hit_score(p_field, p_term), 0), extensions.word_similarity(p_term, coalesce(p_field, '')), 0)::real;
$$;
