-- NPM note drafts and "is drafting" presence of the notes panel (NPM migration 20260919130000_conversation_drafts_and_presence,
-- copied 1:1; adapted: access through the platform's conversation_can() instead of NPM's can_access_conversation(), and the
-- mfa_required policy every table needs).
--
-- Two tables, not one: Realtime postgres_changes enforces the same RLS as reads and only works on tables. The private body
-- lives in conversation_drafts (own row only); a trigger mirrors just (conversation_id, user_id, updated_at) into
-- conversation_draft_presence, readable by everyone who can view the conversation, and only that one is in the publication.

create table public.conversation_drafts (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  body            text not null default '',
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_drafts enable row level security;
create policy "Manage own draft" on public.conversation_drafts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.conversation_can(conversation_id, 'view'));
create policy mfa_required on public.conversation_drafts as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));

create table public.conversation_draft_presence (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  updated_at      timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_draft_presence enable row level security;
create policy "View draft presence per conversation access" on public.conversation_draft_presence for select to authenticated
  using (public.conversation_can(conversation_id, 'view'));
create policy mfa_required on public.conversation_draft_presence as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
-- No write policy: only the security definer trigger below maintains it.

revoke all on public.conversation_drafts, public.conversation_draft_presence from anon;
grant select, insert, update, delete on public.conversation_drafts to authenticated;
grant select on public.conversation_draft_presence to authenticated;

create function public.sync_draft_presence()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.conversation_draft_presence
    where conversation_id = old.conversation_id and user_id = old.user_id;
    return old;
  end if;
  insert into public.conversation_draft_presence (conversation_id, user_id, updated_at)
  values (new.conversation_id, new.user_id, new.updated_at)
  on conflict (conversation_id, user_id) do update set updated_at = excluded.updated_at;
  return new;
end;
$$;
revoke execute on function public.sync_draft_presence() from public, anon, authenticated;

create trigger sync_draft_presence_on_upsert
  after insert or update on public.conversation_drafts
  for each row execute function public.sync_draft_presence();

create trigger sync_draft_presence_on_delete
  after delete on public.conversation_drafts
  for each row execute function public.sync_draft_presence();

alter publication supabase_realtime add table public.conversation_draft_presence;
