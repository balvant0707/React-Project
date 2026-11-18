-- Grant `mail.access`: who may use the Mail page and the mailboxes at all (read, reply, assign, write, link: one switch,
-- no scopes: the mailbox rules below still decide WHICH mailboxes). Given to no role by default; an admin passes as before.
--   * public.permissions row (the vocabulary is open: 20261109100300_platform_core_registry.sql).
--   * can_access_mailbox(), my_mailbox_ids(): bodies of 20261110170000_npm_email.sql; changed: the personal / shared rules
--     also need rls_has('mail.access').
--   * email_thread_allows(), email_thread_drafts_row_allows(): bodies of 20261113181100_npm_email_one_access_function.sql;
--     changed: the same, read from the context ((p_ctx).permissions).
--   can_access_email_thread() / can_access_email_draft() and the RLS policies go through these, so they follow.
insert into public.permissions (key, module, action, scope, sort_order)
values ('mail.access', 'mail', 'access', null, 800);

create or replace function public.can_access_mailbox(p_mailbox_id uuid) returns boolean
  language sql stable security definer set search_path to ''
  as $$
  select coalesce(
    (select public.is_admin()
       or (public.rls_has('mail.access')
           and ((m.kind = 'personal' and m.owner_user_id = auth.uid())
             or (m.kind = 'shared' and exists (
                   select 1 from public.user_teams ug
                   where ug.user_id = auth.uid() and ug.team_id = m.team_id))))
     from public.mailboxes m
     where m.id = p_mailbox_id),
    false
  );
$$;

create or replace function public.my_mailbox_ids() returns uuid[]
  language sql stable security definer set search_path to ''
  as $$
  select coalesce(array_agg(m.id), '{}')
  from public.mailboxes m
  where public.is_admin()
     or (public.rls_has('mail.access')
         and ((m.kind = 'personal' and m.owner_user_id = auth.uid())
           or (m.kind = 'shared' and exists (select 1 from public.user_teams ug where ug.user_id = auth.uid() and ug.team_id = m.team_id))));
$$;

create or replace function public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context)
  returns boolean
  language sql stable security definer set search_path to ''
  as $$
  select coalesce(
    (select public.is_admin((p_ctx).user_id)
         or ('mail.access' = any((p_ctx).permissions)
             and ((m.kind = 'personal' and m.owner_user_id = (p_ctx).user_id)
               or (m.kind = 'shared' and m.team_id = any((p_ctx).team_ids))))
     from public.email_threads t
     join public.mailboxes m on m.id = t.mailbox_id
     where t.id = p_thread_id),
    false);
$$;

create or replace function public.email_thread_drafts_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context)
  returns boolean
  language sql stable security definer set search_path to ''
  as $$
  select coalesce((
    select case when d.email_thread_id is not null then public.email_thread_allows(d.email_thread_id, p_ctx)
                else exists (
                  select 1 from public.mailboxes m
                  where m.id = d.mailbox_id
                    and (public.is_admin((p_ctx).user_id)
                         or ('mail.access' = any((p_ctx).permissions)
                             and ((m.kind = 'personal' and m.owner_user_id = (p_ctx).user_id)
                               or (m.kind = 'shared' and m.team_id = any((p_ctx).team_ids)))))) end
    from public.email_thread_drafts d where d.id = p_entity_id), false);
$$;
