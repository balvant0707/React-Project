-- Review 2026-11-10: entity_label / entity_team / entity_followers and the modules' label, team and follower functions
-- were executable by every signed-in user (20261109110000 granted them; the modules' migrations granted theirs), so anybody
-- could read the number of a specification or the title of a task they cannot see, given its id. Nothing in the frontend
-- calls them (definer code does). entity_types_rebuild() (as in 20261110240000) now revokes them after each rebuild, so a
-- module registered later is covered too.

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
  -- The label, team and follower functions answer for any id without an access check: only definer code (notifications,
  -- search, mails) may call them, never a signed-in user directly (a specification number or task title by id).
  revoke all on function public.entity_label(text, uuid), public.entity_team(text, uuid), public.entity_followers(text, uuid)
    from public, anon, authenticated;
  for r in select f from public.entity_types t, unnest(array[t.label_function, t.team_function, t.follower_function]) f where f is not null loop
    execute format('revoke all on function public.%I(uuid) from public, anon, authenticated', r.f);
  end loop;
end;
$fn$;
revoke all on function public.entity_types_rebuild() from public, anon, authenticated;
grant execute on function public.entity_types_rebuild() to service_role;

select public.entity_types_rebuild();
