-- The unread email mark of the offer and order lists (has_unread_emails, the "unread" filter). The offers module's
-- my_unread_records() (npm_offers_before.sql) left the emails "for later", so the mark never showed on RADAR. Its notes part
-- as there, plus the email part 1:1 from the NPM tool's my_unread_records: an unread notification of an email thread marks
-- every record the thread is linked to. Test: npm_thread_follow_rules_smoke.sql.
create or replace function public.my_unread_records() returns table(entity_type text, entity_id uuid, via text)
  language sql stable set search_path to ''
  as $$
  select n.entity_type, n.entity_id, 'notes'::text
  from public.notifications n
  where n.user_id = (select auth.uid()) and n.read_at is null and n.type in ('comment', 'mention') and n.entity_id is not null
  union all
  select l.entity_type, l.entity_id, 'emails'::text
  from public.notifications n join public.email_thread_entity_links l on l.email_thread_id = n.entity_id
  where n.user_id = (select auth.uid()) and n.read_at is null and n.entity_type = 'email_threads';
$$;
