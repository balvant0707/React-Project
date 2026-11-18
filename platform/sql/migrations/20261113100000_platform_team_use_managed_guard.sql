-- Review fixes for the managed team uses (20261111130100):
-- 1. The guard checked only the new value on an UPDATE: `update team_uses set use = 'x' where use = 'owner_associate'`
--    removed a managed use. It now checks the old and the new use.
-- 2. A team that carries a managed use was only kept from deletion by the Teams page hiding the button; a team manager
--    could still delete it through the API (cascading to the module's row, e.g. an Owner Associate). Deleting such a team
--    now needs an admin (the module pages that delete them, e.g. NPM's Tenants page, are admin pages).
-- (Both triggers run as the caller on purpose: current_user is the signed-in role only outside a security definer.)
create or replace function public.team_uses_guard_managed() returns trigger
language plpgsql set search_path to '' as $$
declare v_path text;
begin
  if current_user = 'authenticated' then
    select r.managed_path into v_path from public.team_use_registry r
     where r.managed_path is not null
       and r.use in (case when tg_op <> 'INSERT' then old.use end, case when tg_op <> 'DELETE' then new.use end)
     limit 1;
    if v_path is not null then
      raise exception 'This team use is kept on its own page (%)', v_path using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.team_uses_guard_managed() from public, anon;

create function public.teams_guard_managed_delete() returns trigger
language plpgsql set search_path to '' as $$
begin
  if current_user = 'authenticated' and not public.is_admin()
     and exists (select 1 from public.team_uses u join public.team_use_registry r on r.use = u.use
                  where u.team_id = old.id and r.managed_path is not null) then
    raise exception 'This team is kept on its own page; only an admin can delete it' using errcode = '42501';
  end if;
  return old;
end $$;
revoke all on function public.teams_guard_managed_delete() from public, anon;
create trigger teams_guard_managed_delete before delete on public.teams
  for each row execute function public.teams_guard_managed_delete();
