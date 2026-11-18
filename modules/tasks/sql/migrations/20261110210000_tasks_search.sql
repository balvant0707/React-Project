-- Tasks in the global search (COMPASS search_work_items, the tasks half; the tickets half comes with the ticket module).
-- Candidates through the trigram indexes on title / description and the number, access per hit (never a row policy on every
-- task). Changed: the subtitle is the record the task belongs to (task_anchor_label: only for who may view it) instead of
-- COMPASS's asset name.
create function public.tasks_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language plpgsql stable security definer set search_path to '' as $$
declare
  v_user uuid := auth.uid();
  v_pattern text := '%' || p_term || '%';
  v_n integer := 0;
  r record;
begin
  if v_user is null then
    return;
  end if;
  for r in
    select t.id, t.task_number::bigint as number, t.title, t.status, t.anchor_type, t.anchor_id, t.created_at,
      (greatest(public.search_field_score(t.title, p_term), public.search_field_score(t.description, p_term) * 0.7)
        + case when t.task_number = p_number then 2 else 0 end)::real as score
    from public.tasks t
    where t.task_number = p_number
       or t.title ilike v_pattern or (p_fuzzy and p_term operator(extensions.<%) t.title)
       or t.description ilike v_pattern
    order by score desc limit 200
  loop
    exit when v_n >= 8;
    -- Only a clear yes counts (null = no).
    continue when not coalesce(public.user_has_access(v_user, 'tasks', r.id, 'view'), false);
    v_n := v_n + 1;
    return next row('tasks', r.id, r.score, r.number, r.title, public.task_anchor_label(r.anchor_type, r.anchor_id), r.status,
                    null, null, null, null, r.created_at, null)::public.search_hit;
  end loop;
end $$;
revoke all on function public.tasks_search(text, boolean, bigint) from public, anon;
grant execute on function public.tasks_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('tasks', 'tasks', 'tasks_search', 'Tasks by number, title and description');
