-- The record notes panel uses the platform's chat (docs/shared-parts.md B1); NPM's server-side note drafts and their
-- "is drafting" presence (20261110150000) have no user any more. Email drafts are email_thread_drafts (npm-email) and stay.
drop table if exists public.conversation_draft_presence;
drop table if exists public.conversation_drafts;
drop function if exists public.sync_draft_presence();
