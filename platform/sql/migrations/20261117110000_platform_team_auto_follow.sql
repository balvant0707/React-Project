-- teams.auto_follow: everybody who may read the team follows it (level 'all') until they choose otherwise. Only for a team
-- everybody reads (audience = 'everyone'); a trigger switches it off when the audience becomes 'members', whoever writes
-- the row. Only a team manager (admin) switches it on. It replaces the implicit rule "everybody reads and only owners post"
-- in team_follow_level(); teams that matched that rule get the switch on, so nothing changes for them.
alter table public.teams add column auto_follow boolean not null default false;
update public.teams set auto_follow = true where audience = 'everyone' and posting = 'owners';

create function public.teams_auto_follow_audience() returns trigger
  language plpgsql set search_path to ''
  as $$
begin
  if new.audience <> 'everyone' then
    new.auto_follow := false;
  end if;
  return new;
end;
$$;
create trigger teams_auto_follow_audience before insert or update of audience, auto_follow on public.teams
  for each row execute function public.teams_auto_follow_audience();

create or replace function public.team_follow_level(p_user_id uuid, p_team_id uuid) returns text
  language sql stable security definer set search_path to ''
  as $$
  select coalesce(
    (select f.level from public.team_follows f where f.user_id = p_user_id and f.team_id = p_team_id),
    case when exists (select 1 from public.user_teams where team_id = p_team_id and user_id = p_user_id)
           or exists (select 1 from public.team_owners where team_id = p_team_id and user_id = p_user_id)
           or exists (select 1 from public.teams where id = p_team_id and auto_follow)
         then 'all' end);
$$;

-- p_auto_follow null = leave it as it is (what a dialog without the switch sends).
drop function if exists public.team_message_settings_save(uuid, text, text, text, text);
drop function if exists public.team_message_settings_save(uuid, text, text, text, text, boolean);
create function public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text, p_auto_follow boolean default null) returns void
  language plpgsql security definer set search_path to ''
  as $$
begin
  if not (public.can_manage_teams() or public.team_message_access(auth.uid(), p_team_id, 'moderate')) then
    raise exception 'Only an owner changes the settings of a group';
  end if;
  -- Only a team manager (admin) switches "follow automatically" on; an owner may keep it or switch it off.
  if p_auto_follow and not public.can_manage_teams()
     and not exists (select 1 from public.teams where id = p_team_id and auto_follow) then
    raise exception 'Only an administrator can switch on automatic following';
  end if;
  update public.teams
  set posting = p_posting, audience = p_audience, team_mentions = p_team_mentions,
      auto_follow = coalesce(p_auto_follow, auto_follow),
      description = nullif(btrim(coalesce(p_description, '')), '')
  where id = p_team_id;
end;
$$;
revoke all on function public.team_message_settings_save(uuid, text, text, text, text, boolean) from public, anon, authenticated, service_role;
grant all on function public.team_message_settings_save(uuid, text, text, text, text, boolean) to service_role, authenticated;
