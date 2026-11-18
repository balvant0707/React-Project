-- Read policy with the caller's rights read once per statement (platform 20261110240000).
drop policy "View draft presence per conversation access" on public.conversation_draft_presence;
create policy "View draft presence per conversation access" on public.conversation_draft_presence for select to authenticated
  using (public.conversation_can_ctx(conversation_id, 'view', (select public.access_context())));
