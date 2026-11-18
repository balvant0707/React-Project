-- Platform search. global_search() and search_messages() are COMPASS's functions (search_field_score and search_fold came with
-- the messaging copy); adapted:
--   * the per-type blocks (tasks, tickets, assets, goals, items, positions, trainings) are gone from global_search: a module
--     registers a search source function and global_search() calls them all through search_source_hits() (generated, like the
--     access dispatchers, no dynamic SQL at run time);
--   * search_messages(): the per-type parent lookup (tasks / tickets / goals / assets) is entity_label() from the registry;
--   * documents: new search_documents() (candidates first, access per hit, parent title from entity_label()); groups are teams;
--   * search_messages(): the newest 300 matches are scored, not every match (a common word matched 20,000 comments).
-- Performance rules kept from COMPASS (measured there, see tests/search_perf.sql here): comments are matched exactly through the
-- trigram index on comment_search_text(body) and only the last 12 months (setting search_message_months, 0 = no limit); at most 300 candidates are read, ordered by score, and the
-- access check runs per hit with one answer per conversation / team (never a row policy on every message); typo matching only
-- for short fields; every source caps itself (8 per type); a purely numeric term is a number lookup without typo matching.
--
-- A search source function has the signature  f(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
-- and checks access itself (for example through the record's index first and user_has_access() for the hits). global_search() runs
-- as the caller, so the source function needs GRANT EXECUTE ... TO authenticated.
create type public.search_hit as (
  entity_type text, id uuid, rank real, number bigint, title text, subtitle text, status text,
  parent_type text, parent_id uuid, parent_title text, snippet text, event_at timestamp with time zone, author_user_id uuid);

create table public.search_sources (
  source text primary key,
  module text not null,
  function_name text not null check (function_name ~ '^[a-z_][a-z_0-9]*$'),
  description text
);
alter table public.search_sources enable row level security;
create policy "Read search sources" on public.search_sources for select to authenticated using (true);
create policy mfa_required on public.search_sources as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant select on public.search_sources to authenticated, service_role;
grant all on public.search_sources to service_role;

create function public.search_source_hits(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language plpgsql stable set search_path to '' as $$ begin return; end; $$;

create function public.search_sources_rebuild() returns void
  language plpgsql security definer set search_path to ''
  as $fn$
declare
  r record;
  v_body text := '';
begin
  for r in select * from public.search_sources order by source loop
    v_body := v_body || case when v_body = '' then '' else E'\n    union all\n' end
              || format('    select * from public.%I(p_term, p_fuzzy, p_number)', r.function_name);
  end loop;
  v_body := case when v_body = '' then ' select * from (select null::public.search_hit) x where false' else E'\n' || v_body end;
  execute 'create or replace function public.search_source_hits(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
    language plpgsql stable set search_path to '''' as $b$
    begin
      return query' || v_body || E';\n    end; $b$';
end;
$fn$;

create function public.search_source_register(p_source text, p_module text, p_function text, p_description text default null) returns void
  language plpgsql security definer set search_path to ''
  as $$
begin
  insert into public.search_sources (source, module, function_name, description) values (p_source, p_module, p_function, p_description)
  on conflict (source) do update set module = excluded.module, function_name = excluded.function_name, description = excluded.description;
  perform public.search_sources_rebuild();
end;
$$;
revoke all on function public.search_source_hits(text, boolean, bigint), public.search_sources_rebuild(),
  public.search_source_register(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.search_source_hits(text, boolean, bigint) to authenticated, service_role;
grant execute on function public.search_sources_rebuild(), public.search_source_register(text, text, text, text) to service_role;

-- search_messages(text, boolean), copied with the change above.
CREATE FUNCTION public.search_messages(p_term text, p_fuzzy boolean) RETURNS TABLE(entity_type text, id uuid, rank real, number bigint, title text, subtitle text, status text, parent_type text, parent_id uuid, parent_title text, snippet text, event_at timestamp with time zone, author_user_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_pattern text := '%' || p_term || '%';
  -- The search window is a setting (search_message_months, default 12, 0 = no limit): remove it once the search is fast enough.
  v_months integer := coalesce((select nullif(s.value, '')::integer from public.app_settings s where s.key = 'search_message_months'), 12);
  v_since timestamptz := case when v_months = 0 then '-infinity'::timestamptz else now() - make_interval(months => v_months) end;
  v_checked jsonb := '{}';  -- 'c<conversation>' / 'g<group>' -> may read
  v_posts_done jsonb := '{}';
  v_key text;
  v_ok boolean;
  v_comments integer := 0;
  v_posts integer := 0;
  v_number bigint;
  v_parent text;
  r record;
begin
  if v_user is null or length(coalesce(p_term, '')) < 2 then
    return;
  end if;
  -- Message texts are matched exactly: typo matching in long texts makes nearly every message a candidate ("Dichtung"
  -- shares "ich", "cht", "ung" with "Nachricht"), and checking them took seconds. Post titles stay typo tolerant.
  for r in
    with hits as (
      select r.message_id, r.conversation_id, r.body, r.created_at, r.author_user_id,
             public.search_field_score(public.comment_search_text(r.body), p_term) as score
      from (
        -- Newest 300 matches first, scored afterwards: scoring every match of a common word cost seconds on 150,000 comments.
        select m.id as message_id, m.conversation_id, m.body, m.created_at, m.author_user_id
        from public.messages m
        where m.deleted_at is null and m.created_at > v_since
          and public.comment_search_text(m.body) ilike v_pattern
        order by m.created_at desc
        limit 300
      ) r
      union all
      select rm.id, c.id, rm.body, c.created_at, rm.author_user_id, public.search_field_score(c.title, p_term) + 0.1
      from public.conversations c
      join public.messages rm on rm.id = c.first_message_id
      where c.kind = 'post' and c.deleted_at is null and c.created_at > v_since
        and (c.title ilike v_pattern or (p_fuzzy and p_term operator(extensions.<%) c.title))
    )
    select h.message_id, h.conversation_id, h.body, h.created_at, h.author_user_id, h.score, c.kind, c.anchor_type, c.anchor_id
    from hits h
    join public.conversations c on c.id = h.conversation_id and c.deleted_at is null and c.kind in ('record', 'post')
    order by h.score desc, h.created_at desc
    limit 300
  loop
    exit when v_comments >= 10 and v_posts >= 8;
    if r.kind = 'post' then
      continue when v_posts >= 8 or v_posts_done ? r.conversation_id::text;
      v_key := 'g' || r.anchor_id;
    else
      continue when v_comments >= 10;
      v_key := 'c' || r.conversation_id;
    end if;
    if v_checked ? v_key then
      v_ok := (v_checked ->> v_key)::boolean;
    else
      -- Reading a post is reading its group (conversation_access asks the same), so one check per group.
      -- Only a clear yes counts (null = no).
      v_ok := coalesce(case when r.kind = 'post' then public.team_message_access(v_user, r.anchor_id, 'view')
                            else public.conversation_access(v_user, r.conversation_id, 'view') end, false);
      v_checked := v_checked || jsonb_build_object(v_key, v_ok);
    end if;
    continue when not v_ok;

    if r.kind = 'post' then
      v_posts := v_posts + 1;
      v_posts_done := v_posts_done || jsonb_build_object(r.conversation_id::text, true);
      select g.name into v_parent from public.teams g where g.id = r.anchor_id;
      entity_type := 'posts'; id := r.conversation_id; number := null;
      title := public.conversation_label(r.conversation_id); subtitle := v_parent;
      parent_type := 'teams'; parent_id := r.anchor_id; parent_title := v_parent;
    else
      v_comments := v_comments + 1;
      v_number := null;
      v_parent := public.entity_label(r.anchor_type, r.anchor_id);
      entity_type := 'comments'; id := r.message_id; number := v_number;
      title := null; subtitle := null;
      parent_type := r.anchor_type; parent_id := r.anchor_id; parent_title := v_parent;
    end if;
    rank := (r.score - 0.05)::real;
    status := null;
    snippet := public.message_excerpt(r.body, 600);
    event_at := r.created_at;
    author_user_id := r.author_user_id;
    return next;
  end loop;
end;
$$;

-- global_search(text, integer), copied with the changes above.
CREATE FUNCTION public.global_search(p_search_term text, p_result_limit integer DEFAULT 40) RETURNS TABLE(entity_type text, id uuid, rank real, number bigint, title text, subtitle text, status text, parent_type text, parent_id uuid, parent_title text, snippet text, event_at timestamp with time zone, author_user_id uuid)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
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
  v_fuzzy := v_number is null;
  -- Transaction-local (a function-level SET is rejected at create time before pg_trgm is loaded).
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);

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
$_$;
create index messages_recent_idx on public.messages (created_at desc) where deleted_at is null;

-- NEW (modelled on search_messages): files by name. The row policy of attachments asks the record registry for every row it looks at
-- before the cheap name filter runs (8.6 s for 30,000 files), so the candidates are read as the function owner through the trigram
-- index, best 100 first, and the caller's access is checked once per parent record and only until 8 hits are visible.
create function public.search_documents(p_term text, p_fuzzy boolean) returns table(entity_type text, id uuid, rank real, number bigint,
    title text, subtitle text, status text, parent_type text, parent_id uuid, parent_title text, snippet text,
    event_at timestamp with time zone, author_user_id uuid)
    language plpgsql stable security definer
    set search_path to ''
    as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_pattern text := '%' || p_term || '%';
  v_checked jsonb := '{}';
  v_key text;
  v_ok boolean;
  v_found integer := 0;
  r record;
begin
  if v_user is null or length(coalesce(p_term, '')) < 2 then
    return;
  end if;
  for r in
    select c.doc_id, c.file_name, c.created_at, c.parent_type, c.parent_id, public.search_field_score(c.file_name, p_term) as score
    from (
      -- Newest 200 matches first, scored afterwards (a common word such as "drawing" matches every file).
      select d.id as doc_id, d.file_name, d.created_at, d.entity_type as parent_type, d.entity_id as parent_id
      from public.attachments d
      where d.file_name ilike v_pattern or (p_fuzzy and p_term operator(extensions.<%) d.file_name)
      order by d.created_at desc
      limit 200
    ) c
    order by score desc, c.created_at desc
    limit 100
  loop
    exit when v_found >= 8;
    v_key := r.parent_type || ':' || r.parent_id;
    if v_checked ? v_key then
      v_ok := (v_checked ->> v_key)::boolean;
    else
      v_ok := coalesce(public.user_has_access(v_user, r.parent_type, r.parent_id, 'view'), false);
      v_checked := v_checked || jsonb_build_object(v_key, v_ok);
    end if;
    continue when not v_ok;
    v_found := v_found + 1;
    entity_type := 'documents'; id := r.doc_id; rank := (r.score - 0.1)::real; number := null;
    title := r.file_name; subtitle := null; status := null;
    parent_type := r.parent_type; parent_id := r.parent_id; parent_title := public.entity_label(r.parent_type, r.parent_id);
    snippet := null; event_at := r.created_at; author_user_id := null;
    return next;
  end loop;
end;
$$;
REVOKE ALL ON FUNCTION public.search_documents(text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.search_documents(text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_messages(text, boolean), public.global_search(text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.search_messages(text, boolean), public.global_search(text, integer) TO authenticated, service_role;

select public.app_setting_register('search_message_months', 'platform', 'integer', '12', true, 'Search looks at comments of the last N months; 0 = all. Raise or clear once the search is fast enough.');
