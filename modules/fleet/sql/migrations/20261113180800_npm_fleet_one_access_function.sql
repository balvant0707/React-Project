-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): the module's rule
-- <type>_row_allows(action, id, ctx) is the registered function; the wrappers <type>_access (by user) and <type>_ctx_allows
-- (by context) go. The rule is private: row policies and policy helpers ask the guarded dispatcher can_access_entity_ctx(),
-- which answers only for the caller's own context.
--   * hull_events_row_allows, newbuilding_projects_row_allows (the module's rules, unchanged) answer 'check' as 'view' through
--     entity_types.check_action (the wrappers did that).
--   * Row policies of the child tables: the same expressions, the rule call replaced by can_access_entity_ctx().
alter policy "Insert newbuilding details per parent grant" on public.hull_event_newbuilding_details
  with check (can_access_entity_ctx('hull_events', hull_event_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update newbuilding details per parent grant" on public.hull_event_newbuilding_details
  using (can_access_entity_ctx('hull_events', hull_event_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('hull_events', hull_event_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete newbuilding details per parent grant" on public.hull_event_newbuilding_details
  using (can_access_entity_ctx('hull_events', hull_event_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View newbuilding details per parent grant" on public.hull_event_newbuilding_details
  using (can_access_entity_ctx('hull_events', hull_event_id, 'view'::text, ( SELECT access_context() AS access_context)));

update public.entity_types set check_action = 'view' where entity_type in ('hull_events', 'newbuilding_projects');
update public.entity_types set access_function = 'hull_events_row_allows' where entity_type = 'hull_events';
update public.entity_types set access_function = 'newbuilding_projects_row_allows' where entity_type = 'newbuilding_projects';
update public.entity_types set access_function = 'vessels_row_allows' where entity_type = 'vessels';
drop function public.hull_events_access(uuid, uuid, text);
drop function public.hull_events_ctx_allows(text, uuid, public.access_context);
drop function public.newbuilding_projects_access(uuid, uuid, text);
drop function public.newbuilding_projects_ctx_allows(text, uuid, public.access_context);
drop function public.vessels_access(uuid, uuid, text);
select public.entity_types_rebuild();
