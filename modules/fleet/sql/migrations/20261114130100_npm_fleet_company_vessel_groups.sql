-- company_vessel_groups(p_company_id): the Business Partner tab of the company page, tallied on the server.
-- New (2026-11-14): the page counted vessels with a PostgREST aggregate on vessels_overview filtered by an OR over
-- columns that the view computes through joins, so Postgres joined all 178k vessels to companies six times first (1.3 s for
-- a large group, measured on the RADAR cloud database). This finds the vessels by the indexed role columns first, as
-- company_vessel_role_counts does, and joins names only for those.
-- Same set as the page's old query: a group parent (a company that other companies point at) matches the vessels whose group
-- owner / technical manager / operator is a company of its group (companies.group_company_id = the parent, the parent itself
-- when it points at itself); any other company matches its own vessels in those three roles. Ship manager is not part of
-- the tab. Column names are the vessels_overview names the page already reads. Security invoker: row level security applies.
CREATE FUNCTION public.company_vessel_groups(p_company_id uuid)
RETURNS TABLE(
  group_owner text, group_owner_company_id uuid, resolved_group_owner_company_name text, resolved_group_company_name text,
  technical_manager text, technical_manager_company_id uuid, resolved_technical_manager_company_name text, resolved_technical_manager_group_company_name text,
  operator text, operator_company_id uuid, resolved_operator_company_name text, resolved_operator_group_company_name text,
  count bigint)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with is_group as (
    select exists (select 1 from public.companies c where c.group_company_id = p_company_id and c.id <> p_company_id) as g
  ),
  members as materialized (
    select c.id from public.companies c where c.group_company_id = p_company_id and (select g from is_group)
    union all
    select p_company_id where not (select g from is_group)
  ),
  ids as (
    select v.id from public.vessels v where v.group_owner_company_id in (select id from members)
    union select v.id from public.vessels v where v.technical_manager_company_id in (select id from members)
    union select v.id from public.vessels v where v.operator_company_id in (select id from members)
  )
  select v.group_owner, v.group_owner_company_id, goc.name, gc_group.name,
         v.technical_manager, v.technical_manager_company_id, tmc.name, tmc_group.name,
         v.operator, v.operator_company_id, opc.name, opc_group.name,
         count(*)
  from ids
  join public.vessels v on v.id = ids.id
  left join public.companies goc on goc.id = v.group_owner_company_id
  left join public.companies gc_group on gc_group.id = goc.group_company_id
  left join public.companies tmc on tmc.id = v.technical_manager_company_id
  left join public.companies tmc_group on tmc_group.id = tmc.group_company_id
  left join public.companies opc on opc.id = v.operator_company_id
  left join public.companies opc_group on opc_group.id = opc.group_company_id
  group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
$$;

REVOKE ALL ON FUNCTION public.company_vessel_groups(p_company_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.company_vessel_groups(p_company_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.company_vessel_groups(p_company_id uuid) TO service_role;
