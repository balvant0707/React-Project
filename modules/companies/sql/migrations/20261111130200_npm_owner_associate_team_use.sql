-- Owner Associates are a team use of the platform registry (COMPASS's team_uses) instead of NPM's own teams.kind
-- (docs/shared-parts.md A2). The extension row owner_associate_teams stays the source (company link, short code); a
-- trigger keeps the use in step. Admin > Teams shows the use as a fixed tag linking to the Owner Associates page (A3).
select public.team_use_register('owner_associate', 'companies', 'Owner Associate', '/admin/tenants');
insert into public.team_uses (team_id, use) select team_id, 'owner_associate' from public.owner_associate_teams on conflict do nothing;

drop trigger owner_associate_set_kind on public.owner_associate_teams;
drop function public.owner_associate_set_kind();
create function public.owner_associate_sync_use() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.team_uses (team_id, use) values (new.team_id, 'owner_associate') on conflict do nothing;
  else
    delete from public.team_uses where team_id = old.team_id and use = 'owner_associate';
  end if;
  return null;
end $$;
revoke all on function public.owner_associate_sync_use() from public, anon, authenticated;
create trigger owner_associate_sync_use after insert or delete on public.owner_associate_teams
  for each row execute function public.owner_associate_sync_use();

create or replace function public.owner_associate_create(p_name text, p_short_code text default null, p_company_id uuid default null)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_id uuid; v_name text := btrim(p_name);
begin
  if not (select public.can_manage_teams()) then
    raise exception 'Not allowed to manage teams' using errcode = '42501';
  end if;
  if nullif(v_name, '') is null then raise exception 'An owner associate needs a name'; end if;
  insert into public.teams (name, created_by_user_id) values (v_name, auth.uid()) returning id into v_id;
  insert into public.owner_associate_teams (team_id, company_id, short_code) values (v_id, p_company_id, coalesce(nullif(btrim(p_short_code), ''), v_name));
  return v_id;
end; $function$;

create or replace function public.create_tenant(p_name text, p_company_id uuid default null)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  v_id uuid;
  v_name text := btrim(p_name);
  v_company_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create tenants' using errcode = '42501';
  end if;
  if nullif(v_name, '') is null then
    raise exception 'A tenant needs a name';
  end if;
  if exists (select 1 from public.teams t join public.owner_associate_teams o on o.team_id = t.id where lower(t.name) = lower(v_name)) then
    raise exception 'A tenant named "%" already exists', v_name;
  end if;

  if p_company_id is not null then
    if not exists (select 1 from public.companies where id = p_company_id) then
      raise exception 'Company not found';
    end if;
    v_company_id := p_company_id;
  else
    if exists (select 1 from public.companies where lower(short_code) = lower(v_name)) then
      raise exception 'A company with the short code "%" already exists - select it instead', v_name;
    end if;
    insert into public.companies (name, short_code) values (v_name, v_name) returning id into v_company_id;
  end if;
  insert into public.teams (name) values (v_name) returning id into v_id;
  insert into public.owner_associate_teams (team_id, company_id, short_code) values (v_id, v_company_id, v_name);

  perform public.company_add_type(v_company_id, 'maker');
  perform public.company_add_type(public.own_maker_company_id(), 'maker');

  return v_id;
end;
$function$;
