-- Platform attachments: files on records.
-- Source: COMPASS database, copied 1:1 (message_delete included).

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.attachments (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text,
    size_bytes bigint,
    uploaded_by_user_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    checklist_item_id uuid,
    document_type_phrase_id uuid,
    thumbnail_path text,
    message_id uuid,
    event_id uuid,
    CONSTRAINT attachments_entity_type_check CHECK ((entity_type = ANY (ARRAY['assets'::text, 'tickets'::text, 'tasks'::text, 'goals'::text, 'training_records'::text, 'training_sessions'::text, 'position_holders'::text, 'items'::text, 'conversations'::text, 'teams'::text]))),
    CONSTRAINT attachments_thumbnail_path_check CHECK (((thumbnail_path IS NULL) OR (length(thumbnail_path) <= 500))),
    CONSTRAINT attachments_thumbnail_same_folder CHECK (((thumbnail_path IS NULL) OR starts_with(thumbnail_path, (((entity_type || '/'::text) || (entity_id)::text) || '/'::text))))
);

REVOKE ALL ON TABLE public.attachments FROM anon, authenticated, service_role;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.attachments TO authenticated;
GRANT ALL ON TABLE public.attachments TO service_role;

GRANT UPDATE(document_type_phrase_id) ON TABLE public.attachments TO authenticated;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_storage_path_key UNIQUE (storage_path);

CREATE INDEX attachments_checklist_item_id_idx ON public.attachments USING btree (checklist_item_id) WHERE (checklist_item_id IS NOT NULL);

CREATE INDEX attachments_document_type_phrase_id_idx ON public.attachments USING btree (document_type_phrase_id);

CREATE INDEX attachments_entity_id_idx ON public.attachments USING btree (entity_id) WHERE (entity_type = 'items'::text);

CREATE INDEX attachments_entity_type_entity_id_document_type_phrase_id_idx ON public.attachments USING btree (entity_type, entity_id, document_type_phrase_id);

CREATE INDEX attachments_entity_type_entity_id_idx ON public.attachments USING btree (entity_type, entity_id);

CREATE INDEX attachments_event_id_idx ON public.attachments USING btree (event_id);

CREATE INDEX attachments_file_name_trgm_idx ON public.attachments USING gin (file_name extensions.gin_trgm_ops);

CREATE INDEX attachments_message_id_idx ON public.attachments USING btree (message_id);

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_document_type_phrase_id_fkey FOREIGN KEY (document_type_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.activity_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.attachments_check_entry() RETURNS trigger
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
  if new.checklist_item_id is not null and not (
    new.entity_type = 'tasks' and new.message_id is null and new.event_id is null and exists (
      select 1 from public.task_checklist_items i where i.id = new.checklist_item_id and i.task_id = new.entity_id
    )
  ) then
    raise exception 'The checklist item belongs to a different task';
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.attachments_check_entry() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.attachments_check_entry() FROM PUBLIC;
GRANT ALL ON FUNCTION public.attachments_check_entry() TO authenticated;
GRANT ALL ON FUNCTION public.attachments_check_entry() TO service_role;

CREATE FUNCTION public.can_moderate_record(p_entity_type text, p_entity_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.record_moderator(auth.uid(), p_entity_type, p_entity_id); $$;

REVOKE ALL ON FUNCTION public.can_moderate_record(p_entity_type text, p_entity_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_moderate_record(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_moderate_record(p_entity_type text, p_entity_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.can_moderate_record(p_entity_type text, p_entity_id uuid) TO authenticated;

CREATE FUNCTION public.storage_path_access(p_path text, p_grant_type text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) < 3
     or v_parts[1] not in ('assets', 'tickets', 'tasks', 'goals', 'training_records', 'training_sessions', 'position_holders', 'items', 'conversations', 'teams') then
    return false;
  end if;
  return public.can_access_entity(v_parts[1], v_parts[2]::uuid, p_grant_type);
exception when invalid_text_representation then
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.storage_path_access(p_path text, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_path_access(p_path text, p_grant_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.storage_path_access(p_path text, p_grant_type text) TO authenticated;
GRANT ALL ON FUNCTION public.storage_path_access(p_path text, p_grant_type text) TO service_role;

CREATE FUNCTION public.storage_path_moderator(p_path text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) < 3 then
    return false;
  end if;
  return public.record_moderator(auth.uid(), v_parts[1], v_parts[2]::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.storage_path_moderator(p_path text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.storage_path_moderator(p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.storage_path_moderator(p_path text) TO service_role;
GRANT ALL ON FUNCTION public.storage_path_moderator(p_path text) TO authenticated;

CREATE FUNCTION public.message_delete(p_message_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_message public.messages;
  v_conversation public.conversations;
begin
  select * into v_message from public.messages where id = p_message_id and deleted_at is null;
  if v_message.id is null or not public.conversation_access(auth.uid(), v_message.conversation_id, 'view') then
    raise exception 'You cannot delete this message';
  end if;
  -- A direct or group chat: only the author deletes their own message (nobody moderates it, the literal does not
  -- apply). Everywhere else the literal messages.delete decides, the author alone is not enough.
  if exists (select 1 from public.conversations where id = v_message.conversation_id and kind in ('direct', 'group')) then
    if v_message.author_user_id is distinct from auth.uid() then
      raise exception 'You cannot delete this message';
    end if;
  elsif not public.rls_has('messages.delete') then
    raise exception 'You cannot delete this message';
  end if;
  if exists (select 1 from public.conversations where id = v_message.conversation_id and kind = 'post' and first_message_id = p_message_id) then
    raise exception 'Delete the post instead';
  end if;
  perform set_config('messaging.rpc', '1', true);
  update public.messages set body = '', deleted_at = now() where id = p_message_id;
  perform set_config('messaging.rpc', '', true);
  delete from public.message_mentions where message_id = p_message_id;
  delete from public.attachments where message_id = p_message_id;
  update public.conversations set message_count = greatest(message_count - 1, 0) where id = v_message.conversation_id;
  delete from public.message_reactions where message_id = p_message_id;
  select * into v_conversation from public.conversations where id = v_message.conversation_id;
  perform public.notifications_retract(
    array['mention:' || p_message_id, 'team-mention:' || p_message_id, 'reaction:' || p_message_id],
    array['comment:' || v_conversation.anchor_id, 'group-comment:' || v_conversation.id, 'direct:' || v_conversation.id],
    nullif(public.message_excerpt(v_message.body, 140), ''));
end;
$$;

REVOKE ALL ON FUNCTION public.message_delete(p_message_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.message_delete(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.message_delete(p_message_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.message_delete(p_message_id uuid) TO authenticated;

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (((uploaded_by_user_id = ( SELECT auth.uid() AS uid)) AND public.can_access_entity(entity_type, entity_id, 'check'::text)));

CREATE POLICY "Delete own attachments" ON public.attachments FOR DELETE TO authenticated USING (((uploaded_by_user_id = ( SELECT auth.uid() AS uid)) OR public.can_moderate_record(entity_type, entity_id)));

CREATE POLICY "Keep training proof" ON public.attachments AS RESTRICTIVE FOR DELETE TO authenticated USING (((entity_type <> ALL (ARRAY['training_records'::text, 'training_sessions'::text])) OR ( SELECT public.rls_has('people.edit'::text) AS rls_has)));

CREATE POLICY "Tag attachments" ON public.attachments FOR UPDATE TO authenticated USING (public.can_access_entity(entity_type, entity_id, 'edit'::text)) WITH CHECK (public.can_access_entity(entity_type, entity_id, 'edit'::text));

CREATE POLICY "View attachments" ON public.attachments FOR SELECT TO authenticated USING (public.can_access_entity(entity_type, entity_id, 'view'::text));

CREATE POLICY mfa_required ON public.attachments AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER attachments_check_entry BEFORE INSERT OR UPDATE ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.attachments_check_entry();
