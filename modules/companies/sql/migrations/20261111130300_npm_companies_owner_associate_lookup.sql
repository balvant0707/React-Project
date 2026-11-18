-- Owner Associates are found through owner_associate_teams now (teams.kind was dropped, docs/shared-parts.md A2).
CREATE OR REPLACE FUNCTION public.get_or_create_seaweb_company(p_text text, p_country_text text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_text text := btrim(coalesce(p_text, ''));
  v_country_id uuid;
begin
  if v_text = '' then
    return null;
  end if;

  select id into v_id
  from public.companies
  where source = 'seaweb' and lower(seaweb_match_name) = lower(v_text);

  if v_id is not null then
    return v_id;
  end if;

  if p_country_text is not null and btrim(p_country_text) <> '' then
    select id into v_country_id from public.countries where lower(name_en) = lower(btrim(p_country_text));
  end if;

  insert into public.companies (name, seaweb_match_name, source, country_id)
  values (v_text, v_text, 'seaweb', v_country_id)
  returning id into v_id;

  insert into public.company_teams (company_id, team_id, roles)
  select v_id, t.id, array['customer']
  from public.teams t join public.owner_associate_teams o on o.team_id = t.id;

  return v_id;
end;
$function$

;
