-- Platform core, slice 2: record access registry (replaces COMPASS's hard-coded user_has_access() chain and NPM's
-- hard-coded can_access_entity_ctx() CASE). A module registers its record type with a function; the dispatchers are
-- generated from the registry, so policies call one stable function and the per-row cost stays that of a plain function
-- call (no dynamic SQL at run time; function forwarding through SQL wrappers cost ~10x per row in NPM, hence plpgsql).
--
-- Taken over: type access_context and access_context_for() / access_context() from NPM (without the is_admin member:
-- the NPM admin overrule is gone), can_access_entity() from NPM, user_has_access(user, type, id, action) from COMPASS
-- (signature kept; the body is generated). New: entity_types, entity_type_register(), entity_types_rebuild().
--
-- A module registers with
--   select public.entity_type_register('tasks', 'tasks', 'tasks_access');                       -- user based
--   select public.entity_type_register('orders', 'orders', 'orders_access', 'orders_row_allows'); -- plus a context based
-- access_function(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
-- label_function(p_entity_id uuid) returns text     (optional: '#12 Fix the pump', used in notifications and lists of conversations)
-- team_function(p_entity_id uuid) returns uuid      (optional: the team a record belongs to, used for team mentions)
-- follower_function(p_entity_id uuid) returns uuid[] (optional: the people the record is about; they follow its conversation from the start)
-- context_function(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean   (optional, RLS hot paths:
--   the caller's rights and teams are read once per statement through access_context())

create type public.access_context as (permissions text[], user_id uuid, team_ids uuid[]);

create function public.access_context_for(p_user_id uuid) returns public.access_context
  language sql stable security definer set search_path to ''
  as $$
  select row(public.user_permissions(p_user_id), p_user_id,
             coalesce((select array_agg(ut.team_id) from public.user_teams ut where ut.user_id = p_user_id), '{}'))::public.access_context;
$$;

create function public.access_context() returns public.access_context
  language sql stable security definer set search_path to ''
  as $$ select public.access_context_for(auth.uid()); $$;

create table public.entity_types (
  entity_type text primary key,
  module text not null,
  access_function text not null check (access_function ~ '^[a-z_][a-z_0-9]*$'),
  context_function text check (context_function ~ '^[a-z_][a-z_0-9]*$'),
  description text,
  label_function text check (label_function ~ '^[a-z_][a-z_0-9]*$'),
  team_function text check (team_function ~ '^[a-z_][a-z_0-9]*$'),
  follower_function text check (follower_function ~ '^[a-z_][a-z_0-9]*$')
);
alter table public.entity_types enable row level security;
create policy "Read entity types" on public.entity_types for select to authenticated using (true);
create policy mfa_required on public.entity_types as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

-- Placeholders so the first rebuild can replace them; the real bodies are generated.
create function public.user_has_access(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_grant_type text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$ begin return false; end; $$;
create function public.can_access_entity_ctx(p_entity_type text, p_entity_id uuid, p_action text, p_ctx public.access_context) returns boolean
  language plpgsql stable set search_path to '' as $$ begin return false; end; $$;

create function public.entity_label(p_entity_type text, p_entity_id uuid) returns text
  language plpgsql stable security definer set search_path to '' as $$ begin return null; end; $$;
create function public.entity_team(p_entity_type text, p_entity_id uuid) returns uuid
  language plpgsql stable security definer set search_path to '' as $$ begin return null; end; $$;
create function public.entity_followers(p_entity_type text, p_entity_id uuid) returns uuid[]
  language plpgsql stable security definer set search_path to '' as $$ begin return null; end; $$;

create function public.can_access_entity(p_entity_type text, p_entity_id uuid, p_grant_type text) returns boolean
  language sql stable security definer set search_path to ''
  as $$ select public.can_access_entity_ctx(p_entity_type, p_entity_id, p_grant_type, public.access_context()); $$;

create function public.entity_types_rebuild() returns void
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
           else format('public.%I((p_ctx).user_id, p_entity_id, p_action)', r.access_function) end);
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

create function public.entity_type_register(p_type text, p_module text, p_access_function text,
                                            p_context_function text default null, p_description text default null,
                                            p_label_function text default null, p_team_function text default null,
                                            p_follower_function text default null) returns void
  language plpgsql security definer set search_path to ''
  as $$
begin
  insert into public.entity_types (entity_type, module, access_function, context_function, description, label_function, team_function, follower_function)
  values (p_type, p_module, p_access_function, p_context_function, p_description, p_label_function, p_team_function, p_follower_function)
  on conflict (entity_type) do update set module = excluded.module, access_function = excluded.access_function,
    context_function = excluded.context_function, description = excluded.description,
    label_function = excluded.label_function, team_function = excluded.team_function, follower_function = excluded.follower_function;
  perform public.entity_types_rebuild();
end;
$$;

-- Rights: only migrations (postgres) and the service role register; signed-in users may check access.
revoke all on function public.access_context_for(uuid), public.access_context(), public.user_has_access(uuid, text, uuid, text),
  public.can_access_entity_ctx(text, uuid, text, public.access_context), public.can_access_entity(text, uuid, text),
  public.entity_types_rebuild(), public.entity_type_register(text, text, text, text, text, text, text, text), public.entity_label(text, uuid), public.entity_team(text, uuid), public.entity_followers(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.access_context_for(uuid), public.access_context(), public.user_has_access(uuid, text, uuid, text),
  public.can_access_entity_ctx(text, uuid, text, public.access_context), public.can_access_entity(text, uuid, text), public.entity_label(text, uuid), public.entity_team(text, uuid), public.entity_followers(text, uuid) to authenticated, service_role;
grant execute on function public.entity_types_rebuild(), public.entity_type_register(text, text, text, text, text, text, text, text) to service_role;
grant select on public.entity_types to authenticated, service_role;
