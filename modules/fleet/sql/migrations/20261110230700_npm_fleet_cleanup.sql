-- NPM's cleanup_entity_references triggers on the platform: a deleted record takes its notes (conversation), activity log and
-- attachments with it (platform cleanup_entity_feed(<entity type>), as dock reports and tasks already do).
create trigger cleanup_entity_feed after delete on public.vessels for each row execute function public.cleanup_entity_feed('vessels');
create trigger cleanup_entity_feed after delete on public.hull_events for each row execute function public.cleanup_entity_feed('hull_events');
create trigger cleanup_entity_feed after delete on public.newbuilding_projects for each row execute function public.cleanup_entity_feed('newbuilding_projects');
