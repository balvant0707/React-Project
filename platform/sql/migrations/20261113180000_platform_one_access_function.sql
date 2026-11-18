-- One access function per record type, owned by its module: <type>_row_allows(action, id, ctx), private. It replaces the
-- pair <type>_access(user, id, action) + <type>_ctx_allows(action, id, ctx) (NPM had both plus its rule; COMPASS had the
-- first). The platform only routes, it holds no rule:
--   * can_access_entity(type, id, action): the app's question, for the signed-in user.
--   * can_access_entity_ctx(type, id, action, ctx): the row policies' question; answers only for the caller's own context.
--   * entity_row_allows(type, id, action, ctx): NEW, private; the same routing without that check, for definer code that
--     carries someone else's context (a conversation asks for its record).
--   * user_has_access(user, type, id, action): private, for definer code that asks about someone else (notifications,
--     mentions, read receipts). A rule that reads only the person's id from the context ((p_ctx).user_id, e.g. COMPASS's
--     rules, which work out the rights themselves) gets just the id; any other rule the person's full context
--     (access_context_for(), about 2 ms).
-- Changes:
--   * entity_types.context_function dropped; NEW entity_types.check_action: the action a type answers 'check' with (NPM's
--     records: 'view'; null = the rule gets 'check'), mapped in the generated routing so the rules need no wrapper.
--   * entity_type_register() as in 20261109110000_platform_entity_access.sql; changed: no context function, and it refuses a
--     function without the signature (action text, id uuid, ctx access_context).
--   * entity_types_rebuild() as in 20261113160000_platform_access_checks_private.sql; changed: the routing calls the one
--     registered function; every rebuild revokes it from signed-in users.
--   * conversations_row_allows: the rule of conversation_can_ctx() (20261113160000) without its caller check, asking the
--     record through entity_row_allows() with the context it gets; 'moderate' keeps conversation_access()'s own rule (the
--     old by-user function turned it into 'post'); 'check' and 'edit' mean writing ('post'). conversation_can_ctx() (the
--     policies' helper) is its caller check plus this rule. teams_row_allows: teams_access (20261109130100_platform_messaging_adapt.sql)
--     with the user from the context. conversations_access / teams_access / conversations_ctx_allows / teams_ctx_allows go.
-- The modules switch their types in their own migrations (2026111318xxxx_<module>_one_access_function.sql);
-- 20261113189000_platform_access_functions_check.sql checks the result.

alter table public.entity_types drop column context_function;
alter table public.entity_types add column check_action text check (check_action in ('view', 'edit'));

drop function public.entity_type_register(text, text, text, text, text, text, text, text);
create function public.entity_type_register(p_type text, p_module text, p_access_function text,
                                            p_description text default null, p_label_function text default null,
                                            p_team_function text default null, p_follower_function text default null) returns void
  language plpgsql security definer set search_path to ''
  as $$
begin
  if to_regprocedure(format('public.%I(text, uuid, public.access_context)', p_access_function)) is null then
    raise exception 'entity_type_register: % needs public.%(action text, id uuid, ctx access_context)', p_type, p_access_function;
  end if;
  insert into public.entity_types (entity_type, module, access_function, description, label_function, team_function, follower_function)
  values (p_type, p_module, p_access_function, p_description, p_label_function, p_team_function, p_follower_function)
  on conflict (entity_type) do update set module = excluded.module, access_function = excluded.access_function,
    description = excluded.description, label_function = excluded.label_function, team_function = excluded.team_function,
    follower_function = excluded.follower_function;
  perform public.entity_types_rebuild();
end;
$$;
revoke all on function public.entity_type_register(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.entity_type_register(text, text, text, text, text, text, text) to service_role;

create or replace function public.entity_types_rebuild() returns void
  language plpgsql security definer set search_path to ''
  as $fn$
declare
  r record;
  v_fn regprocedure;
  v_user text := '';
  v_ctx text := '';
  v_label text := '';
  v_team text := '';
  v_fol text := '';
begin
  for r in select * from public.entity_types order by entity_type loop
    v_fn := to_regprocedure(format('public.%I(text, uuid, public.access_context)', r.access_function));
    v_user := v_user || format(E'\n    when %L then public.%I(%s, p_entity_id, %s)', r.entity_type, r.access_function,
      case when r.check_action is null then 'p_grant_type'
           else format('case when p_grant_type = ''check'' then %L else p_grant_type end', r.check_action) end,
      -- a rule that reads nothing but (p_ctx).user_id gets just the id, any other the person's full context
      case when v_fn is not null and regexp_replace((select prosrc from pg_proc where oid = v_fn), '\(p_ctx\)\.user_id', '', 'g') !~ '\mp_ctx\M'
           then 'row(null, p_user_id, null)::public.access_context'
           else 'public.access_context_for(p_user_id)' end);
    v_ctx := v_ctx || format(E'\n    when %L then public.%I(%s, p_entity_id, p_ctx)', r.entity_type, r.access_function,
      case when r.check_action is null then 'p_action'
           else format('case when p_action = ''check'' then %L else p_action end', r.check_action) end);
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

-- entity_row_allows() is written by the rebuild; created here first so the conversation rule compiles against it.
select public.entity_types_rebuild();

create function public.conversations_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $$
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
  return coalesce(public.entity_row_allows(v_conversation.anchor_type, v_conversation.anchor_id, 'view', p_ctx), false);
end $$;

create or replace function public.conversation_can_ctx(p_conversation_id uuid, p_action text, p_ctx public.access_context)
  returns boolean
  language plpgsql stable security definer set search_path to ''
  as $$
begin
  -- a signed-in caller passes their own context (access_context()); any other user id gets no answer
  if auth.uid() is not null and (p_ctx).user_id is distinct from auth.uid() then
    return false;
  end if;
  return public.conversations_row_allows(p_action, p_conversation_id, p_ctx);
end $$;

create function public.teams_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable security definer set search_path to ''
  as $fn$ select public.team_message_access((p_ctx).user_id, p_entity_id,
                   case p_action when 'view' then 'view' when 'check' then 'comment' else 'moderate' end); $fn$;

update public.entity_types set access_function = 'conversations_row_allows' where entity_type = 'conversations';
update public.entity_types set access_function = 'teams_row_allows' where entity_type = 'teams';
drop function public.conversations_access(uuid, uuid, text);
drop function public.conversations_ctx_allows(text, uuid, public.access_context);
drop function public.teams_access(uuid, uuid, text);
drop function public.teams_ctx_allows(text, uuid, public.access_context);

select public.entity_types_rebuild();
