-- One scale for every search source (20261113170000_platform_search_one_scale.sql): a substring hit ranks whole value >
-- prefix > word start > inside, every substring hit above a typo-only match, and search_rank (RADAR) is the same score in
-- both passes. Run: tools/sql-test.sh <compass|npm> platform/sql/tests/search_one_scale_smoke.sql
begin;
do $$
declare
  v_whole real := public.search_field_score('Maersk', 'maersk');
  v_prefix real := public.search_field_score('Maersk Line', 'maersk');
  v_word real := public.search_field_score('AP Maersk', 'maersk');
  v_inside real := public.search_field_score('Supermaersk', 'maersk');
  v_typo real := public.search_field_score('Maersc Line', 'maersk');
  v_none real := public.search_field_score('Hapag-Lloyd', 'maersk');
  v_long real := public.search_field_score(repeat('x', 300) || ' maersk', 'maersk');
begin
  assert v_whole > v_prefix and v_prefix > v_word and v_word > v_inside, format('position order: %s %s %s %s', v_whole, v_prefix, v_word, v_inside);
  assert v_inside > 1 and v_long > 1, format('a substring hit stays above 1: %s %s', v_inside, v_long);
  assert v_typo > 0 and v_typo <= 1, format('typo-only match between 0 and 1: %s', v_typo);
  assert v_none < v_typo, format('no match below a typo: %s', v_none);
  assert public.search_field_score(null, 'maersk') = 0, 'null field';
  assert (select bool_and(proconfig is null) from pg_proc where oid in ('public.search_field_score(text, text)'::regprocedure, 'public.search_hit_score(text, text)'::regprocedure)), 'no SET clause (inlined)';
  if to_regprocedure('public.search_rank(text, text, boolean)') is not null then
    assert public.search_rank('AP Maersk', 'maersk', false) = v_word and public.search_rank('AP Maersk', 'maersk', true) = v_word, 'search_rank: a hit scores the same in both passes';
    assert public.search_rank('Hapag-Lloyd', 'maersk', false) = 0, 'search_rank exact pass: a field without the term scores 0';
  end if;
  raise notice 'search one scale: ok';
end $$;
rollback;
