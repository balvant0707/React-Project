-- Duplicates of platform functions (docs/shared-parts.md B2, B3): the Mail page lists email threads only, record notes
-- are counted and searched by the platform's messaging (inbox counts, search_messages).
drop function if exists public.my_has_unread_notes();
drop function if exists public.npm_search_messages(text, integer);
