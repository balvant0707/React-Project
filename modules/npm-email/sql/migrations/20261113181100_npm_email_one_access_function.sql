-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): the by-user wrappers
-- <type>_access go; the rules answer for the person in the context they get.
--   * email_threads_row_allows, email_messages_row_allows: the context functions of 20261110170000_npm_email.sql, renamed
--     (<type>_ctx_allows -> <type>_row_allows), bodies unchanged.
--   * email_thread_allows(id, ctx) as in 20261110170000_npm_email.sql; changed: the admin pass is the context person's
--     (is_admin((p_ctx).user_id)), not the caller's. Private now (only the rules call it).
--   * email_thread_drafts_row_allows: NEW in place of email_thread_drafts_ctx_allows, which called can_access_email_draft()
--     and so answered for the caller whoever was asked about. The same rule as can_access_email_draft() / can_access_mailbox()
--     (20261110170000_npm_email.sql), read from the context: a draft on a thread follows the thread, a new mail its mailbox.
alter function public.email_threads_ctx_allows(text, uuid, public.access_context) rename to email_threads_row_allows;
alter function public.email_messages_ctx_allows(text, uuid, public.access_context) rename to email_messages_row_allows;

create or replace function public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context)
  returns boolean
  language sql stable security definer set search_path to ''
  as $$
  select coalesce(
    (select public.is_admin((p_ctx).user_id)
         or (m.kind = 'personal' and m.owner_user_id = (p_ctx).user_id)
         or (m.kind = 'shared' and m.team_id = any((p_ctx).team_ids))
     from public.email_threads t
     join public.mailboxes m on m.id = t.mailbox_id
     where t.id = p_thread_id),
    false);
$$;
revoke all on function public.email_thread_allows(uuid, public.access_context) from public, anon, authenticated;

create function public.email_thread_drafts_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context)
  returns boolean
  language sql stable security definer set search_path to ''
  as $$
  select coalesce((
    select case when d.email_thread_id is not null then public.email_thread_allows(d.email_thread_id, p_ctx)
                else exists (
                  select 1 from public.mailboxes m
                  where m.id = d.mailbox_id
                    and (public.is_admin((p_ctx).user_id)
                         or (m.kind = 'personal' and m.owner_user_id = (p_ctx).user_id)
                         or (m.kind = 'shared' and m.team_id = any((p_ctx).team_ids)))) end
    from public.email_thread_drafts d where d.id = p_entity_id), false);
$$;

update public.entity_types set access_function = 'email_threads_row_allows' where entity_type = 'email_threads';
update public.entity_types set access_function = 'email_messages_row_allows' where entity_type = 'email_messages';
update public.entity_types set access_function = 'email_thread_drafts_row_allows' where entity_type = 'email_thread_drafts';
drop function public.email_threads_access(uuid, uuid, text);
drop function public.email_messages_access(uuid, uuid, text);
drop function public.email_thread_drafts_access(uuid, uuid, text);
drop function public.email_thread_drafts_ctx_allows(text, uuid, public.access_context);
select public.entity_types_rebuild();
