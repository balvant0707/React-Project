-- search_rank as in 20261110230000_npm_search_rank.sql (NPM); changed: the exact branch is the platform's search_hit_score
-- (the same position ranking, raised by 1, 0 for a field without the term), the typo branch search_field_score as before
-- (20261113170000_platform_search_one_scale.sql). NPM's sources and the COMPASS ones now score on one scale. The name stays:
-- the NPM source functions call it. Still plain SQL without a `set search_path` clause, so the planner inlines it.
create or replace function public.search_rank(field text, term text, fuzzy boolean) returns real
  language sql stable
  as $$
  select case when fuzzy then public.search_field_score(field, term) else public.search_hit_score(field, term) end;
$$;
