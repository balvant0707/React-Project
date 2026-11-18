-- NPM's cleanup_entity_references triggers on the platform: a deleted record takes its notes (conversation), activity log and
-- attachments with it (platform cleanup_entity_feed(<entity type>), as dock reports and tasks already do).
create trigger cleanup_entity_feed after delete on public.companies for each row execute function public.cleanup_entity_feed('companies');
