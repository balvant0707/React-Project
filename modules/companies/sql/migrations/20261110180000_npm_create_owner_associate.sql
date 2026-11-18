-- create_tenant(): the NPM admin RPC behind Configuration > Tenants (NPM migration 20261016120000), adapted to the platform model:
-- an owner associate ("tenant") is a team of the kind owner_associate with its extension row owner_associate_teams (company link,
-- short code). Same checks and the same maker links as in NPM.
create function public.create_tenant(p_name text, p_company_id uuid default null) returns uuid
  language plpgsql security definer set search_path to ''
  as $$
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
  if exists (select 1 from public.teams where kind = 'owner_associate' and lower(name) = lower(v_name)) then
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
  insert into public.teams (name, kind) values (v_name, 'owner_associate') returning id into v_id;
  insert into public.owner_associate_teams (team_id, company_id, short_code) values (v_id, v_company_id, v_name);

  perform public.company_add_type(v_company_id, 'maker');
  perform public.company_add_type(public.own_maker_company_id(), 'maker');

  return v_id;
end;
$$;
revoke all on function public.create_tenant(text, uuid) from public, anon;
grant execute on function public.create_tenant(text, uuid) to authenticated, service_role;
