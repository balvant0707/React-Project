-- Read policies of the polymorphic tables with the caller's rights read once per statement (NPM's rule, CLAUDE.md "Access
-- control": `(select public.access_context())`), not once per row. Before, conversation_can() / can_access_entity() rebuilt
-- the access context for every row through user_has_access(); on ~10k records attachments took 8-14 s, messages 4-7 s,
-- conversations 2-4 s (NPM: 0.2-0.7 s). Same answers: can_access_entity(t, id, a) is can_access_entity_ctx(t, id, a,
-- access_context()), and conversation_can_ctx() is conversation_access() with the record check through the context.

-- conversation_access() of COMPASS for the read path: direct and group chats by participation, a record conversation or
-- a team post by the record's / team's access with the given context. Other actions keep conversation_access().
create function public.conversation_can_ctx(p_conversation_id uuid, p_action text, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
declare
  v_conversation public.conversations;
begin
  if (p_ctx).user_id is null then
    return false;
  end if;
  if p_action <> 'view' then
    return public.conversation_access((p_ctx).user_id, p_conversation_id, p_action);
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if v_conversation.id is null or v_conversation.deleted_at is not null then
    return false;
  end if;
  if v_conversation.kind in ('direct', 'group') then
    return exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and user_id = (p_ctx).user_id);
  end if;
  return coalesce(public.can_access_entity_ctx(v_conversation.anchor_type, v_conversation.anchor_id, 'view', p_ctx), false);
end $$;
revoke all on function public.conversation_can_ctx(uuid, text, public.access_context) from public, anon;
grant execute on function public.conversation_can_ctx(uuid, text, public.access_context) to authenticated, service_role;

drop policy "View conversations" on public.conversations;
create policy "View conversations" on public.conversations for select to authenticated
  using (public.conversation_can_ctx(id, 'view', (select public.access_context())));

drop policy "View messages" on public.messages;
create policy "View messages" on public.messages for select to authenticated
  using (public.conversation_can_ctx(conversation_id, 'view', (select public.access_context())));

drop policy "View attachments" on public.attachments;
create policy "View attachments" on public.attachments for select to authenticated
  using (public.can_access_entity_ctx(entity_type, entity_id, 'view', (select public.access_context())));

drop policy "View events" on public.activity_events;
create policy "View events" on public.activity_events for select to authenticated
  using (public.can_access_entity_ctx(entity_type, entity_id, 'view', (select public.access_context())));

-- Conversations and teams had no context function, so the context dispatcher called their user-based access functions,
-- which signed-in users may not execute (attachments of a message, team posts). Context functions for both, then rebuild.
create function public.conversations_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable security definer set search_path to ''
  as $$ select public.conversation_can_ctx(p_entity_id, p_action, p_ctx); $$;
create function public.teams_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable security definer set search_path to ''
  as $$ select public.teams_access((p_ctx).user_id, p_entity_id, p_action); $$;
revoke all on function public.conversations_ctx_allows(text, uuid, public.access_context), public.teams_ctx_allows(text, uuid, public.access_context) from public, anon;
grant execute on function public.conversations_ctx_allows(text, uuid, public.access_context), public.teams_ctx_allows(text, uuid, public.access_context)
  to authenticated, service_role;
-- The generator: a type without a context function is checked through user_has_access() (security definer).
create or replace function public.entity_types_rebuild() returns void
  language plpgsql security definer set search_path to ''
  as $fn$
declare
  r record;
  v_user text := '';
  v_ctx text := '';
  v_label text := '';
  v_team text := '';
  v_fol text := '';
begin
  for r in select * from public.entity_types order by entity_type loop
    v_user := v_user || format(E'\n    when %L then public.%I(p_user_id, p_entity_id, p_grant_type)', r.entity_type, r.access_function);
    v_ctx := v_ctx || format(E'\n    when %L then %s', r.entity_type,
      case when r.context_function is not null
           then format('public.%I(p_action, p_entity_id, p_ctx)', r.context_function)
           -- no context function: through user_has_access(), which runs as definer (the module's access function need not
           -- be executable by signed-in users; read policies call this dispatcher as the caller)
           else format('public.user_has_access((p_ctx).user_id, %L, p_entity_id, p_action)', r.entity_type) end);
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
  execute 'create or replace function public.can_access_entity_ctx(p_entity_type text, p_entity_id uuid, p_action text, p_ctx public.access_context) returns boolean
    language plpgsql stable set search_path to '''' as $b$
    begin
      return case p_entity_type' || v_ctx || E'\n    else false end;\n    end; $b$';
end;
$fn$;
revoke all on function public.entity_types_rebuild() from public, anon, authenticated;
grant execute on function public.entity_types_rebuild() to service_role;

update public.entity_types set context_function = 'conversations_ctx_allows' where entity_type = 'conversations' and context_function is null;
update public.entity_types set context_function = 'teams_ctx_allows' where entity_type = 'teams' and context_function is null;
select public.entity_types_rebuild();
