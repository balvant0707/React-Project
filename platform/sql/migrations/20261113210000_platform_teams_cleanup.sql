-- Deleting a team removed its memberships, owners and follows (ON DELETE CASCADE) but left the team's posts
-- (conversations with anchor_type 'teams', no foreign key on anchor_id), their messages, files and history rows behind
-- as orphans. cleanup_entity_feed (20261109140100) removes them, the way it does for companies, tasks and the other records.
create trigger cleanup_entity_feed after delete on public.teams for each row execute function public.cleanup_entity_feed('teams');
