-- A team use that a module keeps on its own page (e.g. NPM's Owner Associates: a team plus a company link) is not edited on
-- Admin > Teams: team_use_registry.managed_path names that page; the Teams page shows the use as a fixed tag linking there,
-- and signed-in users cannot add or remove such a use directly (the module's own functions and triggers do it).
alter table public.team_use_registry add column managed_path text check (managed_path is null or managed_path ~ '^/');

drop function public.team_use_register(text, text, text);
create function public.team_use_register(p_use text, p_module text, p_description text default null, p_managed_path text default null)
  returns void language sql security definer set search_path to ''
  as $$ insert into public.team_use_registry (use, module, description, managed_path) values (p_use, p_module, p_description, p_managed_path)
        on conflict (use) do update set module = excluded.module, description = excluded.description, managed_path = excluded.managed_path; $$;
revoke all on function public.team_use_register(text, text, text, text) from public, anon, authenticated;
grant execute on function public.team_use_register(text, text, text, text) to service_role;

create function public.team_uses_guard_managed() returns trigger
language plpgsql set search_path to '' as $$
begin
  if current_user = 'authenticated'
     and exists (select 1 from public.team_use_registry r where r.use = coalesce(new.use, old.use) and r.managed_path is not null) then
    raise exception 'This team use is kept on its own page (%)',
      (select r.managed_path from public.team_use_registry r where r.use = coalesce(new.use, old.use)) using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.team_uses_guard_managed() from public, anon;
create trigger team_uses_guard_managed before insert or update or delete on public.team_uses
  for each row execute function public.team_uses_guard_managed();
