-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): the module's rule
-- <type>_row_allows(action, id, ctx) is the registered function; the wrappers <type>_access (by user) and <type>_ctx_allows
-- (by context) go. The rule is private: row policies and policy helpers ask the guarded dispatcher can_access_entity_ctx(),
-- which answers only for the caller's own context.
--   * dock_reports_row_allows (the module's rules, unchanged) answer 'check' as 'view' through
--     entity_types.check_action (the wrappers did that).
--   * can_access_dock_report_area, can_access_dock_report_daily_log: as in 20261110160000_npm_dock_reports.sql; changed: they ask
--     can_access_entity_ctx() instead of the rule.
--   * Row policies of the child tables: the same expressions, the rule call replaced by can_access_entity_ctx().
create or replace function public.can_access_dock_report_area(p_area_id uuid, p_action text, p_ctx access_context)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent uuid;
begin
  select t.dock_report_id into v_parent from public.dock_report_areas t where t.id = p_area_id;
  if not found then
    return false;
  end if;
  return public.can_access_entity_ctx('dock_reports', v_parent, p_action, p_ctx);
end;
$function$;

create or replace function public.can_access_dock_report_daily_log(p_daily_log_id uuid, p_action text, p_ctx access_context)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent uuid;
begin
  select t.dock_report_id into v_parent from public.dock_report_daily_logs t where t.id = p_daily_log_id;
  if not found then
    return false;
  end if;
  return public.can_access_entity_ctx('dock_reports', v_parent, p_action, p_ctx);
end;
$function$;

alter policy "Update dock report areas per parent grant" on public.dock_report_areas
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Create dock reports per grant" on public.dock_reports
  with check (can_access_entity_ctx('hull_events', hull_event_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete dock report areas per parent grant" on public.dock_report_areas
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert dock report areas per parent grant" on public.dock_report_areas
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View dock report areas per parent grant" on public.dock_report_areas
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete dock report daily logs per parent grant" on public.dock_report_daily_logs
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert dock report daily logs per parent grant" on public.dock_report_daily_logs
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update dock report daily logs per parent grant" on public.dock_report_daily_logs
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View dock report daily logs per parent grant" on public.dock_report_daily_logs
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Update dock report photos per parent grant" on public.dock_report_photos
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update dock report signatures per parent grant" on public.dock_report_signatures
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete dock report photos per parent grant" on public.dock_report_photos
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert dock report photos per parent grant" on public.dock_report_photos
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View dock report photos per parent grant" on public.dock_report_photos
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete dock report signatures per parent grant" on public.dock_report_signatures
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert dock report signatures per parent grant" on public.dock_report_signatures
  with check (can_access_entity_ctx('dock_reports', dock_report_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View dock report signatures per parent grant" on public.dock_report_signatures
  using (can_access_entity_ctx('dock_reports', dock_report_id, 'view'::text, ( SELECT access_context() AS access_context)));

update public.entity_types set check_action = 'view' where entity_type in ('dock_reports');
update public.entity_types set access_function = 'dock_reports_row_allows' where entity_type = 'dock_reports';
drop function public.dock_reports_access(uuid, uuid, text);
drop function public.dock_reports_ctx_allows(text, uuid, public.access_context);
select public.entity_types_rebuild();
