-- Ports (copied from NPM), until 2026-11-13 part of the npm-base core delta. Only offers use them (specifications.port_id), so the
-- table lives here. Needs public.countries (companies, 20261110100000_npm_core_delta.sql).
create table public.ports (
  id uuid primary key default public.uuid_generate_v7(),
  name text not null check (btrim(name) <> ''),
  name_normalized text generated always as (regexp_replace(lower(name), '[^a-z0-9]', '', 'g')) stored,
  country_id uuid references public.countries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_user_id uuid default auth.uid() references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  continent text check (continent = any (array['Europe','Asia','Middle East','Africa','North America','South America','Oceania']))
);
create index ports_country_id_idx on public.ports (country_id);
create index ports_created_by_user_id_idx on public.ports (created_by_user_id);
create unique index ports_name_key on public.ports (name_normalized);
alter table public.ports enable row level security;
create policy "Authenticated users can read ports" on public.ports for select to authenticated using (true);
create policy "Authenticated users can add ports" on public.ports for insert to authenticated with check (true);
create policy "Team managers update ports" on public.ports for update to authenticated
  using ((select public.can_manage_teams())) with check ((select public.can_manage_teams()));
create policy "Team managers delete ports" on public.ports for delete to authenticated using ((select public.can_manage_teams()));
create policy mfa_required on public.ports as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant select, insert, update, delete on public.ports to authenticated;
grant all on public.ports to service_role;

create function public.set_port_continent_from_country() returns trigger
  language plpgsql set search_path to '' as $$
declare v_continent text;
begin
  -- Filled on insert without a continent, and when the country changes without the continent being changed in the same
  -- statement (a continent chosen together with the country wins).
  if new.country_id is not null
     and ((tg_op = 'INSERT' and new.continent is null)
          or (tg_op = 'UPDATE' and new.country_id is distinct from old.country_id and new.continent is not distinct from old.continent)) then
    select c.continent into v_continent from public.countries c where c.id = new.country_id;
    new.continent := coalesce(v_continent, new.continent);
  end if;
  return new;
end; $$;
create trigger set_port_continent before insert or update of country_id on public.ports
  for each row execute function public.set_port_continent_from_country();
create trigger set_updated_at before update on public.ports for each row execute function public.set_updated_at_and_by();
