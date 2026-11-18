-- Which teams may hold access to the asset tree (the team use 'assets') is an access lever like a role assignment, so its
-- changes are logged. Taken over from COMPASS 20261211120000_asset_team_guard.sql part 2 (groups_switch_log, kind
-- 'group_switch'); its part 1 is in 20261112110000_assets.sql. Changed: the switch groups.usable_for_assets is a team_uses row
-- (D2), so the trigger sits on team_uses: a row added = on, removed = off; new_value names the use. Kind 'team_switch'
-- (renamed in the core's log). Test: compass_permissions_smoke.sql.
create function public.team_uses_assets_log()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.use = 'assets' and (tg_op = 'INSERT' or old.use <> 'assets') then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, team_id, team_name, new_value)
    values (auth.uid(), (select name from public.users where id = auth.uid()), 'team_switch', 'added', new.team_id,
            (select name from public.teams where id = new.team_id), 'assets');
  end if;
  if tg_op in ('DELETE', 'UPDATE') and old.use = 'assets' and (tg_op = 'DELETE' or new.use <> 'assets') then
    insert into public.role_assignment_log (by_user_id, by_user_name, kind, action, team_id, team_name, new_value)
    values (auth.uid(), (select name from public.users where id = auth.uid()), 'team_switch', 'removed', old.team_id,
            (select name from public.teams where id = old.team_id), 'assets');
  end if;
  return null;
end;
$$;
revoke execute on function public.team_uses_assets_log() from public, anon, authenticated;
create trigger team_uses_assets_log after insert or update or delete on public.team_uses
  for each row execute function public.team_uses_assets_log();
