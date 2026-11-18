-- Speaking questions for what hangs on a record. The platform asks a record type
--   view        - the record itself: lists, search hits, history, a task's anchor
--   read_notes  - its notes and files (conversation, mentions, note notifications, file search)
--   write_notes - writing a note (and mentioning a team in it)
--   add_files   - adding a file
--   edit, moderate as before.
-- `check` is no platform question any more: it stays COMPASS's task literal (ticking checklist steps, effort, costs).
-- A module answers in its own actions; NEW entity_types.actions maps the platform's question to them, default
-- {read_notes: view, write_notes: view, add_files: <write_notes>}: most types don't tell notes from the record. It replaces
-- entity_types.check_action and .attach_action (20261113180000 / 20261113140000) and entity_attach_action(): NPM's records
-- keep "files need edit" as {add_files: edit}; COMPASS's tasks, tickets and goals answer write_notes and add_files with
-- view now (they needed check: a decision of 2026-11-13). A module that tells them apart (companies) maps them to itself.
-- Changes:
--   * entity_action_expr(): NEW, the routing's mapping as SQL text (used by the rebuild only).
--   * entity_types_rebuild() as in 20261113180000_platform_one_access_function.sql; changed: the mapping above.
--   * conversation_access() as in 20261109130100_platform_messaging_adapt.sql; changed: a record conversation is read with read_notes, written with write_notes (was view / check).
--   * conversations_row_allows() as in 20261113180000_platform_one_access_function.sql; changed: the record's notes: read_notes (was view).
--   * conversation_get_or_create() as in 20261109130100_platform_messaging_adapt.sql; changed: the first note needs write_notes (was check).
--   * team_mention_allowed() as in 20261109130000_platform_messaging.sql; changed: mentioning a team in a record's notes needs write_notes (was check).
--   * mentionable_users() as in 20261109130000_platform_messaging.sql; changed: people one may mention are those who read the notes: read_notes (was view).
--   * messages_c_notify() as in 20261109130100_platform_messaging_adapt.sql; changed: a note notifies those who read the notes: read_notes (was view).
--   * search_documents() as in 20261109150000_platform_search.sql; changed: a record's files are found with read_notes (was view).
--   * storage_path_access() as in 20261113140000_platform_attach_action.sql; changed: no 'attach' special any more: the storage policies ask read_notes / add_files, the record type maps them.
--   * Policies "View attachments", "Add attachments" (attachments) and "Read attachment files", "Upload attachment files"
--     (storage) as live; changed: read_notes / add_files instead of view / entity_attach_action() / 'attach'.
--   * conversations answer write_notes / add_files as 'post', teams as 'check' (their rules' own words).

alter table public.entity_types add column actions jsonb not null default '{}'::jsonb check (jsonb_typeof(actions) = 'object');
update public.entity_types set actions = jsonb_build_object('add_files', 'edit') where attach_action = 'edit';
update public.entity_types set actions = jsonb_build_object('write_notes', 'post') where entity_type = 'conversations';
update public.entity_types set actions = jsonb_build_object('write_notes', 'check') where entity_type = 'teams';

-- The routing's mapping as SQL text: `p_arg` turned into the type's own action (nothing when the type keeps the words).
create function public.entity_action_expr(p_arg text, p_read_notes text, p_write_notes text, p_add_files text) returns text
  language sql immutable set search_path to ''
  as $$
  select case when w = '' then p_arg else format('case %s%s else %s end', p_arg, w, p_arg) end
  from (select concat(
          case when p_read_notes <> 'read_notes' then format(' when ''read_notes'' then %L', p_read_notes) end,
          case when p_write_notes <> 'write_notes' then format(' when ''write_notes'' then %L', p_write_notes) end,
          case when p_add_files <> 'add_files' then format(' when ''add_files'' then %L', p_add_files) end) w) x;
$$;
revoke all on function public.entity_action_expr(text, text, text, text) from public, anon, authenticated;

create or replace function public.entity_types_rebuild() returns void
  language plpgsql security definer set search_path to ''
  as $fn$
declare
  r record;
  v_fn regprocedure;
  v_rn text;
  v_wn text;
  v_af text;
  v_user text := '';
  v_ctx text := '';
  v_label text := '';
  v_team text := '';
  v_fol text := '';
begin
  for r in select * from public.entity_types order by entity_type loop
    v_fn := to_regprocedure(format('public.%I(text, uuid, public.access_context)', r.access_function));
    -- the platform's questions in the type's own actions (entity_types.actions; default: notes and files need view)
    v_rn := coalesce(r.actions ->> 'read_notes', 'view');
    v_wn := coalesce(r.actions ->> 'write_notes', 'view');
    v_af := coalesce(r.actions ->> 'add_files', v_wn);
    v_user := v_user || format(E'\n    when %L then public.%I(%s, p_entity_id, %s)', r.entity_type, r.access_function,
      public.entity_action_expr('p_grant_type', v_rn, v_wn, v_af),
      -- a rule that reads nothing but (p_ctx).user_id gets just the id, any other the person's full context
      case when v_fn is not null and regexp_replace((select prosrc from pg_proc where oid = v_fn), '\(p_ctx\)\.user_id', '', 'g') !~ '\mp_ctx\M'
           then 'row(null, p_user_id, null)::public.access_context'
           else 'public.access_context_for(p_user_id)' end);
    v_ctx := v_ctx || format(E'\n    when %L then public.%I(%s, p_entity_id, p_ctx)', r.entity_type, r.access_function,
      public.entity_action_expr('p_action', v_rn, v_wn, v_af));
    if r.label_function is not null then
      v_label := v_label || format(E'\n    when %L then public.%I(p_entity_id)', r.entity_type, r.label_function);
    end if;
    if r.team_function is not null then
      v_team := v_team || format(E'\n    when %L then public.%I(p_entity_id)', r.entity_type, r.team_function);
    end if;
    if r.follower_function is not null then
      v_fol := v_fol || format(E'\n    when %L then public.%I(p_entity_id)', r.entity_type, r.follower_function);
    end if;
  end loop;
  v_fol := case when v_fol = '' then 'null::uuid[]' else 'case p_entity_type' || v_fol || E'\n    else null end' end;
  execute 'create or replace function public.entity_followers(p_entity_type text, p_entity_id uuid) returns uuid[]
    language plpgsql stable security definer set search_path to '''' as $b$
    begin return ' || v_fol || '; end; $b$';
  v_label := case when v_label = '' then 'null' else 'case p_entity_type' || v_label || E'\n    else null end' end;
  v_team := case when v_team = '' then 'null::uuid' else 'case p_entity_type' || v_team || E'\n    else null end' end;
  execute 'create or replace function public.entity_label(p_entity_type text, p_entity_id uuid) returns text
    language plpgsql stable security definer set search_path to '''' as $b$
    begin return ' || v_label || '; end; $b$';
  execute 'create or replace function public.entity_team(p_entity_type text, p_entity_id uuid) returns uuid
    language plpgsql stable security definer set search_path to '''' as $b$
    begin return ' || v_team || '; end; $b$';
  execute 'create or replace function public.user_has_access(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_grant_type text) returns boolean
    language plpgsql stable security definer set search_path to '''' as $b$
    begin
      if p_user_id is null then return false; end if;
      return case p_entity_type' || v_user || E'\n    else false end;\n    end; $b$';
  execute 'create or replace function public.entity_row_allows(p_entity_type text, p_entity_id uuid, p_action text, p_ctx public.access_context) returns boolean
    language plpgsql stable security definer set search_path to '''' as $b$
    begin
      return case p_entity_type' || v_ctx || E'\n    else false end;\n    end; $b$';
  execute 'create or replace function public.can_access_entity_ctx(p_entity_type text, p_entity_id uuid, p_action text, p_ctx public.access_context) returns boolean
    language plpgsql stable security definer set search_path to '''' as $b$
    begin
      -- a signed-in caller passes their own context (access_context()); any other user id gets no answer
      if auth.uid() is not null and (p_ctx).user_id is distinct from auth.uid() then return false; end if;
      return case p_entity_type' || v_ctx || E'\n    else false end;\n    end; $b$';
  -- The label, team and follower functions answer for any id without an access check: only definer code (notifications,
  -- search, mails) may call them, never a signed-in user directly (a specification number or task title by id).
  revoke all on function public.entity_label(text, uuid), public.entity_team(text, uuid), public.entity_followers(text, uuid)
    from public, anon, authenticated;
  for r in select f from public.entity_types t, unnest(array[t.label_function, t.team_function, t.follower_function]) f where f is not null loop
    execute format('revoke all on function public.%I(uuid) from public, anon, authenticated', r.f);
  end loop;
  -- Whether a given person may see or edit a record: definer code only (notifications, mentions, record_access). A signed-in
  -- user asks only about records they see themselves, through record_access / mentionable_users / conversation_readers.
  revoke all on function public.user_has_access(uuid, text, uuid, text), public.entity_row_allows(text, uuid, text, public.access_context)
    from public, anon, authenticated;
  for r in select access_function f from public.entity_types loop
    if to_regprocedure(format('public.%I(text, uuid, public.access_context)', r.f)) is not null then  -- a module not switched yet
      execute format('revoke all on function public.%I(text, uuid, public.access_context) from public, anon, authenticated', r.f);
    end if;
  end loop;
end;
$fn$;
revoke all on function public.entity_types_rebuild() from public, anon, authenticated;
grant execute on function public.entity_types_rebuild() to service_role;

alter policy "View attachments" on public.attachments
  using (can_access_entity_ctx(entity_type, entity_id, 'read_notes'::text, ( SELECT access_context() AS access_context)));
alter policy "Add attachments" on public.attachments
  with check (((uploaded_by_user_id = ( SELECT auth.uid() AS uid)) AND can_access_entity(entity_type, entity_id, 'add_files'::text)));
alter policy "Read attachment files" on storage.objects
  using (((bucket_id = 'attachments'::text) AND storage_path_access(name, 'read_notes'::text)));
alter policy "Upload attachment files" on storage.objects
  with check (((bucket_id = 'attachments'::text) AND storage_path_access(name, 'add_files'::text)));

create or replace function public.conversation_access(p_user_id uuid, p_conversation_id uuid, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversation public.conversations;
begin
  if p_user_id is null then
    return false;
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if v_conversation.id is null or v_conversation.deleted_at is not null then
    return false;
  end if;
  if v_conversation.kind in ('direct', 'group') then
    if p_action = 'moderate' then
      return false;
    end if;
    if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and user_id = p_user_id) then
      return false;
    end if;
    -- Reading stays for good; writing stops when the other person can no longer sign in (left, locked, login removed).
    if p_action = 'post' and v_conversation.kind = 'direct' then
      return not exists (
        select 1 from public.conversation_participants p join public.users u on u.id = p.user_id
        where p.conversation_id = p_conversation_id and p.user_id <> p_user_id
          and (not u.has_login or u.has_left or u.locked_at is not null));
    end if;
    return true;
  end if;
  if p_action = 'moderate' then
    -- A record conversation is moderated by holders of the record module's edit.all (admin limits, decision 4); a post
    -- by whoever moderates its group (grant 'edit' on a group: an owner or a holder of messages.edit).
    if v_conversation.kind = 'post' then
      return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'edit');
    end if;
    return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'moderate');
  end if;
  return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id,
                                case when p_action = 'view' then 'read_notes' else 'write_notes' end);
end;
$function$;

create or replace function public.conversations_row_allows(p_action text, p_entity_id uuid, p_ctx access_context)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversation public.conversations;
begin
  if (p_ctx).user_id is null then
    return false;
  end if;
  if p_action <> 'view' then
    -- 'moderate' keeps its own rule; 'check' (a note) and 'edit' mean writing in the conversation
    return public.conversation_access((p_ctx).user_id, p_entity_id, case when p_action = 'moderate' then 'moderate' else 'post' end);
  end if;
  select * into v_conversation from public.conversations where id = p_entity_id;
  if v_conversation.id is null or v_conversation.deleted_at is not null then
    return false;
  end if;
  if v_conversation.kind in ('direct', 'group') then
    return exists (select 1 from public.conversation_participants where conversation_id = p_entity_id and user_id = (p_ctx).user_id);
  end if;
  return coalesce(public.entity_row_allows(v_conversation.anchor_type, v_conversation.anchor_id, 'read_notes', p_ctx), false);
end $function$;

create or replace function public.conversation_get_or_create(p_anchor_type text, p_anchor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.user_has_access(auth.uid(), p_anchor_type, p_anchor_id, 'write_notes') then
    raise exception 'You cannot write here';
  end if;
  select id into v_id from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.conversations (kind, anchor_type, anchor_id, team_id)
  values ('record', p_anchor_type, p_anchor_id, public.conversation_team(p_anchor_type, p_anchor_id))
  on conflict (anchor_type, anchor_id) where kind = 'record' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
    return v_id;
  end if;
  -- The people the record is about (entity_followers) take part from the start; later changes
  -- are the owning module's business (record_follow).
  insert into public.conversation_participants (conversation_id, user_id)
  select v_id, u from unnest(public.entity_followers(p_anchor_type, p_anchor_id)) u
  where u is not null and exists (select 1 from public.users x where x.id = u)
  on conflict do nothing;
  return v_id;
end;
$function$;

create or replace function public.team_mention_allowed(p_user_id uuid, p_anchor_type text, p_anchor_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_team public.teams;
begin
  select * into v_team from public.teams where id = public.conversation_mention_team(p_anchor_type, p_anchor_id);
  if p_user_id is null or v_team.id is null then
    return false;
  end if;
  if p_anchor_type = 'teams' then
    return public.team_message_access(p_user_id, v_team.id, 'moderate')
      or (v_team.team_mentions = 'members'
          and public.team_message_access(p_user_id, v_team.id, 'comment')
          and exists (select 1 from public.user_teams where team_id = v_team.id and user_id = p_user_id));
  end if;
  return public.user_has_access(p_user_id, p_anchor_type, p_anchor_id, 'write_notes');
end;
$function$;

create or replace function public.mentionable_users(p_entity_type text, p_entity_id uuid, p_search text DEFAULT ''::text)
 RETURNS TABLE(id uuid, name text, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.can_access_entity(p_entity_type, p_entity_id, 'read_notes') then
    return;
  end if;
  return query
    select u.id, u.name, u.email
    from public.users u
    where u.has_login
      and u.locked_at is null
      and (coalesce(p_search, '') = '' or u.name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
           or u.username ilike '%' || p_search || '%')
      and public.user_has_access(u.id, p_entity_type, p_entity_id, 'read_notes')
    order by u.name nulls last
    limit 10;
end;
$function$;

create or replace function public.messages_c_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_conversation public.conversations;
  v_recipients uuid[];
  v_title text;
  v_author text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if v_conversation.kind <> 'record' then
    return null;
  end if;
  v_title := public.conversation_label(v_conversation.id);
  v_recipients := array(
    select p.user_id from public.conversation_participants p join public.users u on u.id = p.user_id
    where p.conversation_id = v_conversation.id and p.taking_part and p.level = 'all'
      and p.user_id is distinct from new.author_user_id
      and u.has_login and not u.has_left and u.locked_at is null
      and not exists (select 1 from public.message_mentions where message_id = new.id and mentioned_user_id = p.user_id)
      and public.user_has_access(p.user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'read_notes')
  );
  if array_length(v_recipients, 1) is null then
    return null;
  end if;
  select coalesce(name, email, 'Someone') into v_author from public.users where id = new.author_user_id;
  perform public.notify(
    v_recipients, 'comment', coalesce(v_author, 'Someone') || ' commented on ' || coalesce(v_title, 'a record'),
    '/' || v_conversation.anchor_type || '/' || v_conversation.anchor_id,
    public.message_excerpt(new.body, 140),
    new.author_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'comment:' || v_conversation.anchor_id,
    array['in_app'], jsonb_build_object('actor_name', v_author, 'entity_title', v_title));
  return null;
end;
$function$;

create or replace function public.search_documents(p_term text, p_fuzzy boolean)
 RETURNS TABLE(entity_type text, id uuid, rank real, number bigint, title text, subtitle text, status text, parent_type text, parent_id uuid, parent_title text, snippet text, event_at timestamp with time zone, author_user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      v_ok := coalesce(public.user_has_access(v_user, r.parent_type, r.parent_id, 'read_notes'), false);
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
$function$;

create or replace function public.storage_path_access(p_path text, p_grant_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) < 3 or not exists (select 1 from public.entity_types where entity_type = v_parts[1]) then
    return false;
  end if;
  return public.can_access_entity(v_parts[1], v_parts[2]::uuid, p_grant_type);
exception when invalid_text_representation then
  return false;
end;
$function$;


drop function public.entity_attach_action(text);
alter table public.entity_types drop column check_action, drop column attach_action;

select public.entity_types_rebuild();
