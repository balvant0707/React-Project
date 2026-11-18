-- NPM's cleanup_entity_references triggers on the platform: a deleted record takes its notes (conversation), activity log and
-- attachments with it (platform cleanup_entity_feed(<entity type>), as dock reports and tasks already do).
create trigger cleanup_entity_feed after delete on public.specifications for each row execute function public.cleanup_entity_feed('specifications');
create trigger cleanup_entity_feed after delete on public.orders for each row execute function public.cleanup_entity_feed('orders');
