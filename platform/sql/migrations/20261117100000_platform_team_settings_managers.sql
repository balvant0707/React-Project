-- team_message_settings_save: a team manager (can_manage_teams, e.g. an admin) may save a team's settings too, as the
-- team dialog already lets them (canSettings = moderate or canManageTeams). Before, an admin who was neither an owner
-- nor a moderator of the team was refused even when only adding an owner, because the dialog saves the settings first.
create or replace function public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text) returns void
  language plpgsql security definer set search_path to ''
  as $$
begin
  if not (public.can_manage_teams() or public.team_message_access(auth.uid(), p_team_id, 'moderate')) then
    raise exception 'Only an owner changes the settings of a group';
  end if;
  update public.teams
  set posting = p_posting, audience = p_audience, team_mentions = p_team_mentions,
      description = nullif(btrim(coalesce(p_description, '')), '')
  where id = p_team_id;
end;
$$;
