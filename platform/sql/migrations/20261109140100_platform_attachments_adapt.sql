-- Platform attachments, part 2: ADAPTATIONS.
--   * column names/union with NPM (decision D1 of the attachments inventory): document_type_phrase_id -> category_phrase_id,
--     NPM's checksum_sha256, content_id, is_inline added. COMPASS's message_id / event_id stay (messages and events are core).
--     checklist_item_id belongs to the tasks module and is dropped here; NPM's company_id belongs to companies.
--   * the CHECK on entity_type (fixed list) becomes check_entity_type_registered() from the activity migration.
--   * attachments_check_entry without the checklist rule (the tasks module adds its own trigger).
--   * can_moderate_record / storage_path_moderator: user_has_access(..., 'moderate') instead of record_moderator().
--   * storage_path_access: any registered entity type (was a hard-coded list).
--   * NEW: the attachments bucket and its storage policies, copied from the COMPASS database (without the training proof rule).
--   * cleanup_entity_feed (COMPASS): deleting a record removes its conversations, events and files; a module attaches it as a trigger.
alter table public.attachments drop constraint attachments_entity_type_check;
create trigger attachments_entity_type before insert or update of entity_type on public.attachments
  for each row execute function public.check_entity_type_registered();
alter table public.attachments rename column document_type_phrase_id to category_phrase_id;
alter table public.attachments drop column checklist_item_id;
alter table public.attachments add column checksum_sha256 text, add column content_id text, add column is_inline boolean not null default false;
alter index if exists attachments_document_type_phrase_id_idx rename to attachments_category_phrase_id_idx;

CREATE OR REPLACE FUNCTION public.attachments_check_entry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_type text;
  v_id uuid;
  v_author uuid;
begin
  if new.message_id is not null then
    select coalesce(c.anchor_type, 'conversations'), coalesce(c.anchor_id, c.id), m.author_user_id
      into v_type, v_id, v_author
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = new.message_id;
    if v_type is distinct from new.entity_type or v_id is distinct from new.entity_id then
      raise exception 'The message belongs to a different record';
    end if;
    if v_author is distinct from new.uploaded_by_user_id then
      raise exception 'Only the author of a message can add files to it';
    end if;
  end if;
  if new.event_id is not null and not exists (
    select 1 from public.activity_events e where e.id = new.event_id and e.entity_type = new.entity_type and e.entity_id = new.entity_id
  ) then
    raise exception 'The history entry belongs to a different record';
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.can_moderate_record(p_entity_type text, p_entity_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.user_has_access(auth.uid(), p_entity_type, p_entity_id, 'moderate'); $$;

CREATE OR REPLACE FUNCTION public.storage_path_moderator(p_path text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) < 3 then
    return false;
  end if;
  return public.user_has_access(auth.uid(), v_parts[1], v_parts[2]::uuid, 'moderate');
exception when invalid_text_representation then
  return false;
end;
$$;

CREATE OR REPLACE FUNCTION public.storage_path_access(p_path text, p_grant_type text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) < 3 or not exists (select 1 from public.entity_types where entity_type = v_parts[1]) then
    return false;
  end if;
  return public.can_access_entity(v_parts[1], v_parts[2]::uuid, p_grant_type);
exception when invalid_text_representation then
  return false;
end;
$$;

CREATE FUNCTION public.cleanup_entity_feed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.conversations where anchor_type = tg_argv[0] and anchor_id = old.id;
  delete from public.activity_events where entity_type = tg_argv[0] and entity_id = old.id;
  delete from public.attachments where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;
REVOKE ALL ON FUNCTION public.cleanup_entity_feed() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.cleanup_entity_feed() TO service_role;

insert into storage.buckets (id, name, public, file_size_limit) values ('attachments', 'attachments', false, 26214400)
  on conflict (id) do nothing;
create policy "Read attachment files" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.storage_path_access(name, 'view'));
create policy "Upload attachment files" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.storage_path_access(name, 'check'));
create policy "Delete own attachment files" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (owner = (select auth.uid()) or public.storage_path_moderator(name)));
