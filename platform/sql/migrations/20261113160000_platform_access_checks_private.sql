-- Who may see a record is shown to those who see it themselves (COMPASS's access badge, record_access; the mention list,
-- mentionable_users; read receipts, conversation_readers: each checks the caller's own view first). Asking about a record one
-- cannot see was possible anyway: user_has_access(user, type, id, action) and every module's access function
-- (tasks_access, specifications_access, ...) took any person's id and were executable by signed-in users, so anybody could
-- probe who may see or edit a record they have no access to. The NPM tool kept user_has_access private.
--   * entity_types_rebuild() as in 20261110250200_platform_label_functions_private.sql; changed: every rebuild revokes
--     user_has_access() and the modules' access functions from signed-in users (a module registered later is covered
--     too), and the row-policy dispatcher can_access_entity_ctx() it writes runs as definer (it reaches those functions for
--     record types without a context function: tasks, assets, ...) and answers only for the caller's own context.
--   * conversation_can_ctx() as in 20261110240000_platform_rls_statement_context.sql; changed: the same guard (it answered
--     conversation_access() for any user id in the context).
-- Test: access_helpers_private_smoke.sql.

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
  revoke all on function public.user_has_access(uuid, text, uuid, text) from public, anon, authenticated;
  for r in select access_function f from public.entity_types loop
    execute format('revoke all on function public.%I(uuid, uuid, text) from public, anon, authenticated', r.f);
  end loop;
end;
$fn$;
revoke all on function public.entity_types_rebuild() from public, anon, authenticated;
grant execute on function public.entity_types_rebuild() to service_role;

create or replace function public.conversation_can_ctx(p_conversation_id uuid, p_action text, p_ctx public.access_context)
  returns boolean
  language plpgsql stable security definer set search_path to ''
  as $$
declare
  v_conversation public.conversations;
begin
  if (p_ctx).user_id is null then
    return false;
  end if;
  -- a signed-in caller passes their own context (access_context()); any other user id gets no answer
  if auth.uid() is not null and (p_ctx).user_id is distinct from auth.uid() then
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

select public.entity_types_rebuild();
