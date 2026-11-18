-- NPM email slice (WP 10): mailboxes and their Graph connections, email threads, messages, recipients, drafts, record links,
-- followers, participants, reads, signatures, suppressions, thread_follows (follow/mute of email threads). Source: NPM database.
-- Same renames as the offers slice.
-- NPM's note search search_messages(p_term, p_limit) is kept as npm_search_messages (the platform has its own search_messages).

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.mailboxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    address text NOT NULL,
    display_name text NOT NULL,
    color text,
    kind text NOT NULL,
    owner_user_id uuid,
    team_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mailboxes_kind_check CHECK ((kind = ANY (ARRAY['personal'::text, 'shared'::text]))),
    CONSTRAINT mailboxes_kind_owner_check CHECK ((((kind = 'personal'::text) AND (owner_user_id IS NOT NULL) AND (team_id IS NULL)) OR ((kind = 'shared'::text) AND (team_id IS NOT NULL) AND (owner_user_id IS NULL))))
);


ALTER TABLE public.mailboxes OWNER TO postgres;

REVOKE ALL ON TABLE public.mailboxes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.mailboxes TO authenticated;
GRANT ALL ON TABLE public.mailboxes TO service_role;

CREATE TABLE public.mailbox_connections (
    mailbox_id uuid NOT NULL,
    connected_by_user_id uuid NOT NULL,
    provider text DEFAULT 'microsoft_graph'::text NOT NULL,
    refresh_token_enc bytea NOT NULL,
    access_token_enc bytea,
    access_token_expires_at timestamp with time zone,
    status text DEFAULT 'ok'::text NOT NULL,
    last_synced_at timestamp with time zone,
    last_error text,
    last_error_at timestamp with time zone,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    webhook_subscription_id text,
    webhook_expires_at timestamp with time zone,
    webhook_client_state text,
    CONSTRAINT mailbox_connections_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text])))
);


ALTER TABLE public.mailbox_connections OWNER TO postgres;

REVOKE ALL ON TABLE public.mailbox_connections FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.mailbox_connections TO service_role;

GRANT SELECT(mailbox_id) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(connected_by_user_id) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(provider) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(status) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(last_synced_at) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(last_error) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(last_error_at) ON TABLE public.mailbox_connections TO authenticated;

GRANT SELECT(connected_at) ON TABLE public.mailbox_connections TO authenticated;

CREATE TABLE public.email_threads (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    mailbox_id uuid NOT NULL,
    subject text,
    status text DEFAULT 'open'::text NOT NULL,
    snoozed_until timestamp with time zone,
    responsible_user_id uuid,
    responsible_assigned_at timestamp with time zone,
    responsible_assigned_by_user_id uuid,
    last_message_at timestamp with time zone,
    provider_conversation_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reference_token text,
    CONSTRAINT email_threads_status_check CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'closed'::text, 'spam'::text])))
);


ALTER TABLE public.email_threads OWNER TO postgres;

REVOKE ALL ON TABLE public.email_threads FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_threads TO authenticated;
GRANT ALL ON TABLE public.email_threads TO service_role;

CREATE TABLE public.email_messages (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    email_thread_id uuid NOT NULL,
    direction text NOT NULL,
    message_id_header text,
    in_reply_to_header text,
    references_headers text[],
    from_address text NOT NULL,
    from_display_name text,
    body_text text,
    body_html text,
    send_status text DEFAULT 'received'::text NOT NULL,
    provider_message_id text,
    error_message text,
    sent_at timestamp with time zone NOT NULL,
    provider_conversation_id text,
    CONSTRAINT email_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT email_messages_send_status_check CHECK ((send_status = ANY (ARRAY['received'::text, 'queued'::text, 'sent'::text, 'failed'::text, 'bounced'::text])))
);


ALTER TABLE public.email_messages OWNER TO postgres;

REVOKE ALL ON TABLE public.email_messages FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_messages TO authenticated;
GRANT ALL ON TABLE public.email_messages TO service_role;

CREATE TABLE public.email_message_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_message_id uuid NOT NULL,
    kind text NOT NULL,
    "position" integer NOT NULL,
    email_address text NOT NULL,
    display_name text,
    CONSTRAINT email_message_recipients_kind_check CHECK ((kind = ANY (ARRAY['to'::text, 'cc'::text, 'bcc'::text])))
);


ALTER TABLE public.email_message_recipients OWNER TO postgres;

REVOKE ALL ON TABLE public.email_message_recipients FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_message_recipients TO authenticated;
GRANT ALL ON TABLE public.email_message_recipients TO service_role;

CREATE TABLE public.email_signatures (
    user_id uuid NOT NULL,
    new_message_html text,
    reply_html text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_signatures OWNER TO postgres;

REVOKE ALL ON TABLE public.email_signatures FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_signatures TO authenticated;
GRANT ALL ON TABLE public.email_signatures TO service_role;

CREATE TABLE public.email_suppressions (
    email_address text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_suppressions OWNER TO postgres;

REVOKE ALL ON TABLE public.email_suppressions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_suppressions TO authenticated;
GRANT ALL ON TABLE public.email_suppressions TO service_role;

CREATE TABLE public.email_thread_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email_thread_id uuid,
    mailbox_id uuid,
    to_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    cc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    bcc_addresses text[] DEFAULT '{}'::text[] NOT NULL,
    body_text text,
    body_html text,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_by_user_id uuid,
    locked_at timestamp with time zone,
    subject text,
    entity_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT email_thread_drafts_entity_links_check CHECK ((jsonb_typeof(entity_links) = 'array'::text)),
    CONSTRAINT email_thread_drafts_mailbox_required_for_new_thread CHECK (((email_thread_id IS NOT NULL) OR (mailbox_id IS NOT NULL)))
);


ALTER TABLE public.email_thread_drafts OWNER TO postgres;

REVOKE ALL ON TABLE public.email_thread_drafts FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_thread_drafts TO authenticated;
GRANT ALL ON TABLE public.email_thread_drafts TO service_role;

CREATE TABLE public.email_thread_entity_links (
    email_thread_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    linked_by_user_id uuid
);


ALTER TABLE public.email_thread_entity_links OWNER TO postgres;

REVOKE ALL ON TABLE public.email_thread_entity_links FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_thread_entity_links TO authenticated;
GRANT ALL ON TABLE public.email_thread_entity_links TO service_role;

CREATE TABLE public.email_thread_followers (
    email_thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone,
    last_email_notified_at timestamp with time zone
);


ALTER TABLE public.email_thread_followers OWNER TO postgres;

REVOKE ALL ON TABLE public.email_thread_followers FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_thread_followers TO authenticated;
GRANT ALL ON TABLE public.email_thread_followers TO service_role;

CREATE TABLE public.email_thread_participants (
    email_thread_id uuid NOT NULL,
    email_address text NOT NULL,
    display_name text,
    first_seen_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL
);


ALTER TABLE public.email_thread_participants OWNER TO postgres;

REVOKE ALL ON TABLE public.email_thread_participants FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_thread_participants TO authenticated;
GRANT ALL ON TABLE public.email_thread_participants TO service_role;

CREATE TABLE public.email_thread_reads (
    email_thread_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.email_thread_reads OWNER TO postgres;

REVOKE ALL ON TABLE public.email_thread_reads FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.email_thread_reads TO authenticated;
GRANT ALL ON TABLE public.email_thread_reads TO service_role;

CREATE TABLE public.thread_follows (
    user_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    level text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT thread_follows_level_check CHECK ((level = ANY (ARRAY['follow'::text, 'mute'::text]))),
    CONSTRAINT thread_follows_target_type_check CHECK ((target_type = ANY (ARRAY['conversations'::text, 'email_threads'::text])))
);


ALTER TABLE public.thread_follows OWNER TO postgres;

REVOKE ALL ON TABLE public.thread_follows FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.thread_follows TO authenticated;
GRANT ALL ON TABLE public.thread_follows TO service_role;

ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_address_key UNIQUE (address);

ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.mailbox_connections
    ADD CONSTRAINT mailbox_connections_pkey PRIMARY KEY (mailbox_id);

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_pkey PRIMARY KEY (id);

CREATE INDEX email_threads_mailbox_id_idx ON public.email_threads USING btree (mailbox_id);

CREATE INDEX email_threads_mailbox_id_reference_token_idx ON public.email_threads USING btree (mailbox_id, reference_token) WHERE (reference_token IS NOT NULL);

CREATE INDEX email_threads_provider_conversation_id_idx ON public.email_threads USING btree (provider_conversation_id) WHERE (provider_conversation_id IS NOT NULL);

CREATE INDEX email_threads_responsible_user_id_idx ON public.email_threads USING btree (responsible_user_id);

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_message_id_header_key UNIQUE (message_id_header);

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);

CREATE INDEX email_messages_email_thread_id_sent_at_idx ON public.email_messages USING btree (email_thread_id, sent_at);

CREATE INDEX email_messages_provider_conversation_id_idx ON public.email_messages USING btree (provider_conversation_id) WHERE (provider_conversation_id IS NOT NULL);

ALTER TABLE ONLY public.email_message_recipients
    ADD CONSTRAINT email_message_recipients_pkey PRIMARY KEY (id);

CREATE INDEX email_message_recipients_email_address_idx ON public.email_message_recipients USING btree (email_address);

CREATE INDEX email_message_recipients_email_message_id_idx ON public.email_message_recipients USING btree (email_message_id);

ALTER TABLE ONLY public.email_signatures
    ADD CONSTRAINT email_signatures_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.email_suppressions
    ADD CONSTRAINT email_suppressions_pkey PRIMARY KEY (email_address);

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_email_thread_id_key UNIQUE (email_thread_id);

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_pkey PRIMARY KEY (id);

CREATE INDEX email_thread_drafts_mailbox_id_idx ON public.email_thread_drafts USING btree (mailbox_id);

ALTER TABLE ONLY public.email_thread_entity_links
    ADD CONSTRAINT email_thread_entity_links_pkey PRIMARY KEY (email_thread_id, entity_type, entity_id);

CREATE INDEX email_thread_entity_links_entity_type_entity_id_idx ON public.email_thread_entity_links USING btree (entity_type, entity_id);

ALTER TABLE ONLY public.email_thread_followers
    ADD CONSTRAINT email_thread_followers_pkey PRIMARY KEY (email_thread_id, user_id);

CREATE INDEX email_thread_followers_user_id_idx ON public.email_thread_followers USING btree (user_id);

ALTER TABLE ONLY public.email_thread_participants
    ADD CONSTRAINT email_thread_participants_pkey PRIMARY KEY (email_thread_id, email_address);

CREATE INDEX email_thread_participants_email_address_idx ON public.email_thread_participants USING btree (email_address);

ALTER TABLE ONLY public.email_thread_reads
    ADD CONSTRAINT email_thread_reads_pkey PRIMARY KEY (email_thread_id, user_id);

CREATE INDEX email_thread_reads_user_id_idx ON public.email_thread_reads USING btree (user_id);

ALTER TABLE ONLY public.thread_follows
    ADD CONSTRAINT thread_follows_pkey PRIMARY KEY (user_id, target_type, target_id);

CREATE INDEX thread_follows_target_type_target_id_idx ON public.thread_follows USING btree (target_type, target_id);

ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_group_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);

ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.mailbox_connections
    ADD CONSTRAINT mailbox_connections_connected_by_user_id_fkey FOREIGN KEY (connected_by_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.mailbox_connections
    ADD CONSTRAINT mailbox_connections_mailbox_id_fkey FOREIGN KEY (mailbox_id) REFERENCES public.mailboxes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_mailbox_id_fkey FOREIGN KEY (mailbox_id) REFERENCES public.mailboxes(id);

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_responsible_assigned_by_user_id_fkey FOREIGN KEY (responsible_assigned_by_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.email_threads
    ADD CONSTRAINT email_threads_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_message_recipients
    ADD CONSTRAINT email_message_recipients_email_message_id_fkey FOREIGN KEY (email_message_id) REFERENCES public.email_messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_signatures
    ADD CONSTRAINT email_signatures_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_locked_by_user_id_fkey FOREIGN KEY (locked_by_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_mailbox_id_fkey FOREIGN KEY (mailbox_id) REFERENCES public.mailboxes(id);

ALTER TABLE ONLY public.email_thread_drafts
    ADD CONSTRAINT email_thread_drafts_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.email_thread_entity_links
    ADD CONSTRAINT email_thread_entity_links_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_entity_links
    ADD CONSTRAINT email_thread_entity_links_linked_by_user_id_fkey FOREIGN KEY (linked_by_user_id) REFERENCES public.users(id);

ALTER TABLE ONLY public.email_thread_followers
    ADD CONSTRAINT email_thread_followers_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_followers
    ADD CONSTRAINT email_thread_followers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_participants
    ADD CONSTRAINT email_thread_participants_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_reads
    ADD CONSTRAINT email_thread_reads_email_thread_id_fkey FOREIGN KEY (email_thread_id) REFERENCES public.email_threads(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_thread_reads
    ADD CONSTRAINT email_thread_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.thread_follows
    ADD CONSTRAINT thread_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE FUNCTION public.can_access_mailbox(p_mailbox_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select public.is_admin()
       or (m.kind = 'personal' and m.owner_user_id = auth.uid())
       or (m.kind = 'shared' and exists (
             select 1 from public.user_teams ug
             where ug.user_id = auth.uid() and ug.team_id = m.team_id
           ))
     from public.mailboxes m
     where m.id = p_mailbox_id),
    false
  );
$$;


ALTER FUNCTION public.can_access_mailbox(p_mailbox_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_mailbox(p_mailbox_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_mailbox(p_mailbox_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_mailbox(p_mailbox_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_mailbox(p_mailbox_id uuid) TO service_role;

CREATE FUNCTION public.my_mailbox_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(m.id), '{}')
  from public.mailboxes m
  where public.is_admin()
     or (m.kind = 'personal' and m.owner_user_id = auth.uid())
     or (m.kind = 'shared' and exists (select 1 from public.user_teams ug where ug.user_id = auth.uid() and ug.team_id = m.team_id));
$$;


ALTER FUNCTION public.my_mailbox_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_mailbox_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_mailbox_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_mailbox_ids() TO authenticated;
GRANT ALL ON FUNCTION public.my_mailbox_ids() TO service_role;

CREATE FUNCTION public.can_access_email_thread(p_email_thread_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select public.can_access_mailbox(et.mailbox_id)
     from public.email_threads et where et.id = p_email_thread_id),
    false
  );
$$;


ALTER FUNCTION public.can_access_email_thread(p_email_thread_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_email_thread(p_email_thread_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_email_thread(p_email_thread_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_email_thread(p_email_thread_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_email_thread(p_email_thread_id uuid) TO service_role;

CREATE FUNCTION public.can_access_email_message(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((select public.can_access_email_thread(em.email_thread_id) from public.email_messages em where em.id = p_id), false);
$$;


ALTER FUNCTION public.can_access_email_message(p_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_email_message(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_email_message(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_email_message(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_email_message(p_id uuid) TO service_role;

CREATE FUNCTION public.can_access_email_draft(p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((
    select case when etd.email_thread_id is not null then public.can_access_email_thread(etd.email_thread_id)
                else etd.mailbox_id is not null and public.can_access_mailbox(etd.mailbox_id) end
    from public.email_thread_drafts etd where etd.id = p_id), false);
$$;


ALTER FUNCTION public.can_access_email_draft(p_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.can_access_email_draft(p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_access_email_draft(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_email_draft(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_email_draft(p_id uuid) TO service_role;

CREATE FUNCTION public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select public.is_admin()
         or (m.kind = 'personal' and m.owner_user_id = (p_ctx).user_id)
         or (m.kind = 'shared' and m.team_id = any((p_ctx).team_ids))
     from public.email_threads t
     join public.mailboxes m on m.id = t.mailbox_id
     where t.id = p_thread_id),
    false);
$$;


ALTER FUNCTION public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context) TO authenticated;
GRANT ALL ON FUNCTION public.email_thread_allows(p_thread_id uuid, p_ctx public.access_context) TO service_role;

CREATE FUNCTION public.check_email_thread_entity_reference() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  row_exists boolean;
begin
  if new.entity_type not in ('vessels', 'tenants', 'hull_events', 'specifications', 'companies', 'orders') then
    raise exception 'email_thread_entity_links.entity_type must be one of vessels, tenants, hull_events, specifications, companies, orders, got %', new.entity_type;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1)', new.entity_type)
    into row_exists
    using new.entity_id;
  if not row_exists then
    raise exception '% row % does not exist', new.entity_type, new.entity_id;
  end if;
  return new;
end;
$_$;


ALTER FUNCTION public.check_email_thread_entity_reference() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.check_email_thread_entity_reference() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_email_thread_entity_reference() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_email_thread_entity_reference() TO authenticated;
GRANT ALL ON FUNCTION public.check_email_thread_entity_reference() TO service_role;

CREATE FUNCTION public.cleanup_email_attachments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.attachments where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;


ALTER FUNCTION public.cleanup_email_attachments() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.cleanup_email_attachments() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_email_attachments() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_email_attachments() TO service_role;

CREATE FUNCTION public.email_record_assignee(p_entity_type text, p_entity_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id
  from public.users u
  where u.has_login
    and u.id = case p_entity_type
      when 'specifications' then (select coalesce(s.responsible_user_id, s.sales_account_user_id) from public.specifications s where s.id = p_entity_id)
      when 'orders' then (select coalesce(o.responsible_user_id, o.sales_account_user_id) from public.orders o where o.id = p_entity_id)
      when 'companies' then (select c.sales_account_user_id from public.companies c where c.id = p_entity_id)
      when 'hull_events' then (select h.sales_account_user_id from public.hull_events h where h.id = p_entity_id)
      else null
    end;
$$;


ALTER FUNCTION public.email_record_assignee(p_entity_type text, p_entity_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_record_assignee(p_entity_type text, p_entity_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_record_assignee(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_record_assignee(p_entity_type text, p_entity_id uuid) TO service_role;

CREATE FUNCTION public.assign_email_thread_from_record() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_user uuid;
begin
  v_user := public.email_record_assignee(new.entity_type, new.entity_id);
  if v_user is not null then
    update public.email_threads
    set responsible_user_id = v_user, responsible_assigned_at = now(), responsible_assigned_by_user_id = null
    where id = new.email_thread_id and responsible_user_id is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.assign_email_thread_from_record() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assign_email_thread_from_record() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_email_thread_from_record() FROM PUBLIC;
GRANT ALL ON FUNCTION public.assign_email_thread_from_record() TO service_role;

CREATE FUNCTION public.bump_email_thread_last_message_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.email_threads set last_message_at = new.sent_at where id = new.email_thread_id;
  return new;
end;
$$;


ALTER FUNCTION public.bump_email_thread_last_message_at() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.bump_email_thread_last_message_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.bump_email_thread_last_message_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.bump_email_thread_last_message_at() TO authenticated;
GRANT ALL ON FUNCTION public.bump_email_thread_last_message_at() TO service_role;

CREATE FUNCTION public.check_email_thread_draft_delete_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if old.locked_by_user_id is not null
     and old.locked_by_user_id is distinct from auth.uid()
     and old.locked_at > now() - interval '2 minutes' then
    raise exception 'email_thread_drafts % is locked by another user until %', old.id, old.locked_at + interval '2 minutes';
  end if;
  return old;
end;
$$;


ALTER FUNCTION public.check_email_thread_draft_delete_lock() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.check_email_thread_draft_delete_lock() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_email_thread_draft_delete_lock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_email_thread_draft_delete_lock() TO service_role;

CREATE FUNCTION public.check_email_thread_draft_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_lock_lease interval := interval '2 minutes';
begin
  if old.locked_by_user_id is not null
     and old.locked_by_user_id is distinct from auth.uid()
     and old.locked_at > now() - v_lock_lease then
    raise exception 'email_thread_drafts % is locked by another user until %', old.id, old.locked_at + v_lock_lease;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.check_email_thread_draft_lock() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.check_email_thread_draft_lock() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_email_thread_draft_lock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_email_thread_draft_lock() TO authenticated;
GRANT ALL ON FUNCTION public.check_email_thread_draft_lock() TO service_role;

CREATE FUNCTION public.claim_email_thread_on_draft_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.email_thread_id is not null and new.locked_by_user_id is not null then
    update public.email_threads
    set responsible_user_id = new.locked_by_user_id,
        responsible_assigned_at = now(),
        responsible_assigned_by_user_id = new.locked_by_user_id
    where id = new.email_thread_id
      and responsible_user_id is null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.claim_email_thread_on_draft_lock() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.claim_email_thread_on_draft_lock() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_email_thread_on_draft_lock() FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_email_thread_on_draft_lock() TO authenticated;
GRANT ALL ON FUNCTION public.claim_email_thread_on_draft_lock() TO service_role;

CREATE FUNCTION public.reopen_email_thread_on_inbound() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.email_threads
  set status = 'open', snoozed_until = null
  where id = new.email_thread_id and status in ('closed', 'pending');
  return new;
end;
$$;


ALTER FUNCTION public.reopen_email_thread_on_inbound() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.reopen_email_thread_on_inbound() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reopen_email_thread_on_inbound() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reopen_email_thread_on_inbound() TO service_role;

CREATE FUNCTION public.upsert_email_thread_follower_on_responsible_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.email_thread_followers (email_thread_id, user_id)
  values (new.id, new.responsible_user_id)
  on conflict (email_thread_id, user_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION public.upsert_email_thread_follower_on_responsible_change() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_email_thread_follower_on_responsible_change() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_email_thread_follower_on_responsible_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_email_thread_follower_on_responsible_change() TO authenticated;
GRANT ALL ON FUNCTION public.upsert_email_thread_follower_on_responsible_change() TO service_role;

CREATE FUNCTION public.upsert_email_thread_participant_from_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.email_thread_participants (email_thread_id, email_address, display_name, first_seen_at, last_seen_at)
  values (new.email_thread_id, new.from_address, new.from_display_name, new.sent_at, new.sent_at)
  on conflict (email_thread_id, email_address) do update
    set display_name = coalesce(excluded.display_name, public.email_thread_participants.display_name),
        last_seen_at = greatest(public.email_thread_participants.last_seen_at, excluded.last_seen_at);
  return new;
end;
$$;


ALTER FUNCTION public.upsert_email_thread_participant_from_message() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_email_thread_participant_from_message() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_email_thread_participant_from_message() FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_email_thread_participant_from_message() TO authenticated;
GRANT ALL ON FUNCTION public.upsert_email_thread_participant_from_message() TO service_role;

CREATE FUNCTION public.upsert_email_thread_participant_from_recipient() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_email_thread_id uuid;
  v_sent_at         timestamptz;
begin
  select em.email_thread_id, em.sent_at into v_email_thread_id, v_sent_at
  from public.email_messages em
  where em.id = new.email_message_id;

  insert into public.email_thread_participants (email_thread_id, email_address, display_name, first_seen_at, last_seen_at)
  values (v_email_thread_id, new.email_address, new.display_name, v_sent_at, v_sent_at)
  on conflict (email_thread_id, email_address) do update
    set display_name = coalesce(excluded.display_name, public.email_thread_participants.display_name),
        last_seen_at = greatest(public.email_thread_participants.last_seen_at, excluded.last_seen_at);
  return new;
end;
$$;


ALTER FUNCTION public.upsert_email_thread_participant_from_recipient() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_email_thread_participant_from_recipient() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_email_thread_participant_from_recipient() FROM PUBLIC;
GRANT ALL ON FUNCTION public.upsert_email_thread_participant_from_recipient() TO authenticated;
GRANT ALL ON FUNCTION public.upsert_email_thread_participant_from_recipient() TO service_role;

CREATE FUNCTION public.record_role_followers(p_entity_type text, p_entity_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u from (
    select s.responsible_user_id as u from public.specifications s where p_entity_type = 'specifications' and s.id = p_entity_id
    union all
    select s.sales_account_user_id from public.specifications s where p_entity_type = 'specifications' and s.id = p_entity_id
    union all
    select o.responsible_user_id from public.orders o where p_entity_type = 'orders' and o.id = p_entity_id
    union all
    select o.sales_account_user_id from public.orders o where p_entity_type = 'orders' and o.id = p_entity_id
    union all
    select h.sales_account_user_id from public.hull_events h where p_entity_type = 'hull_events' and h.id = p_entity_id
    union all
    select c.sales_account_user_id from public.companies c where p_entity_type = 'companies' and c.id = p_entity_id
  ) x where u is not null;
$$;


ALTER FUNCTION public.record_role_followers(p_entity_type text, p_entity_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.record_role_followers(p_entity_type text, p_entity_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_role_followers(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_role_followers(p_entity_type text, p_entity_id uuid) TO service_role;

CREATE FUNCTION public.thread_role_followers(p_target_type text, p_target_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select record_role from (
    select public.record_role_followers(c.anchor_type, c.anchor_id) as record_role
    from public.conversations c where p_target_type = 'conversations' and c.id = p_target_id and c.anchor_type <> 'email_threads'
    union all
    select t.responsible_user_id
    from public.conversations c join public.email_threads t on t.id = c.anchor_id
    where p_target_type = 'conversations' and c.id = p_target_id and c.anchor_type = 'email_threads'
    union all
    select t.responsible_user_id from public.email_threads t where p_target_type = 'email_threads' and t.id = p_target_id
    union all
    select public.record_role_followers(l.entity_type, l.entity_id)
    from public.email_thread_entity_links l where p_target_type = 'email_threads' and l.email_thread_id = p_target_id
  ) x where record_role is not null;
$$;


ALTER FUNCTION public.thread_role_followers(p_target_type text, p_target_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.thread_role_followers(p_target_type text, p_target_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.thread_role_followers(p_target_type text, p_target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.thread_role_followers(p_target_type text, p_target_id uuid) TO service_role;

CREATE FUNCTION public.thread_recipients(p_target_type text, p_target_id uuid, p_author_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select u.id
  from (
    select public.thread_role_followers(p_target_type, p_target_id) as user_id
    union
    select cp.user_id from public.conversation_participants cp where p_target_type = 'conversations' and cp.conversation_id = p_target_id
    union
    select f.user_id from public.email_thread_followers f where p_target_type = 'email_threads' and f.email_thread_id = p_target_id
    union
    select tf.user_id from public.thread_follows tf where tf.target_type = p_target_type and tf.target_id = p_target_id and tf.level = 'follow'
  ) r
  join public.users u on u.id = r.user_id and u.has_login
  where u.id is distinct from p_author_user_id
    and not exists (
      select 1 from public.thread_follows m
      where m.user_id = u.id and m.target_type = p_target_type and m.target_id = p_target_id and m.level = 'mute'
    );
$$;


ALTER FUNCTION public.thread_recipients(p_target_type text, p_target_id uuid, p_author_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.thread_recipients(p_target_type text, p_target_id uuid, p_author_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.thread_recipients(p_target_type text, p_target_id uuid, p_author_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.thread_recipients(p_target_type text, p_target_id uuid, p_author_user_id uuid) TO service_role;

CREATE FUNCTION public.thread_follow_state(p_target_type text, p_target_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when exists (select 1 from public.thread_follows m where m.user_id = (select auth.uid()) and m.target_type = p_target_type and m.target_id = p_target_id and m.level = 'mute') then 'mute'
    when (select auth.uid()) in (select public.thread_recipients(p_target_type, p_target_id, null)) then 'follow'
    else 'none'
  end;
$$;


ALTER FUNCTION public.thread_follow_state(p_target_type text, p_target_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.thread_follow_state(p_target_type text, p_target_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.thread_follow_state(p_target_type text, p_target_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.thread_follow_state(p_target_type text, p_target_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.thread_follow_state(p_target_type text, p_target_id uuid) TO service_role;

CREATE FUNCTION public.notify_on_inbound_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_thread record;
  v_recipients uuid[];
  v_link text;
  v_first record;
  v_members uuid[];
begin
  select t.id, t.subject, t.responsible_user_id, t.mailbox_id into v_thread from public.email_threads t where t.id = new.email_thread_id;

  select coalesce(array_agg(r), '{}') into v_recipients from public.thread_recipients('email_threads', new.email_thread_id, null) r;

  if cardinality(v_recipients) = 0 then
    -- Unclaimed: ping the mailbox members, once per thread while unread.
    select coalesce(array_agg(distinct u.id), '{}') into v_members
    from public.mailboxes m
    join public.users u on u.has_login
      and ((m.kind = 'personal' and u.id = m.owner_user_id)
           or (m.kind = 'shared' and exists (select 1 from public.user_teams ug where ug.user_id = u.id and ug.team_id = m.team_id)))
    where m.id = v_thread.mailbox_id;
    if cardinality(v_members) > 0 then
      perform public.notify(
        v_members, 'email_unclaimed',
        'Unassigned email from ' || coalesce(new.from_display_name, new.from_address),
        '/inbox?thread=' || new.email_thread_id,
        coalesce(v_thread.subject, '(no subject)'),
        null, 'email_threads', new.email_thread_id, 'unclaimed:' || new.email_thread_id,
        p_channels => array['in_app', 'push']
      );
    end if;
    return new;
  end if;

  select l.entity_type, l.entity_id into v_first
  from public.email_thread_entity_links l
  where l.email_thread_id = new.email_thread_id
  order by (l.entity_type = 'orders') desc, l.linked_at limit 1;
  v_link := case v_first.entity_type
    when 'orders' then '/orders/' || v_first.entity_id
    when 'specifications' then '/specifications/' || v_first.entity_id
    else '/inbox?thread=' || new.email_thread_id
  end;

  perform public.notify(
    v_recipients, 'email_reply',
    'Reply from ' || coalesce(new.from_display_name, new.from_address),
    v_link,
    coalesce(v_thread.subject, '(no subject)'),
    null, 'email_threads', new.email_thread_id, 'email:' || new.email_thread_id,
    p_channels => array['in_app', 'push', 'toast']
  );
  return new;
end;
$$;


ALTER FUNCTION public.notify_on_inbound_email() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.notify_on_inbound_email() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify_on_inbound_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_on_inbound_email() TO service_role;

CREATE FUNCTION public.mark_email_thread_notifications_read() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from public.email_threads t where t.id = new.email_thread_id and (t.last_message_at is null or t.last_message_at <= new.last_read_at)) then
    update public.notifications set read_at = now()
    where user_id = new.user_id and read_at is null and entity_type = 'email_threads' and entity_id = new.email_thread_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.mark_email_thread_notifications_read() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.mark_email_thread_notifications_read() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_email_thread_notifications_read() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_email_thread_notifications_read() TO service_role;

CREATE FUNCTION public.mark_email_thread_read(p_thread_id uuid) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  insert into public.email_thread_reads (email_thread_id, user_id, last_read_at)
  values (p_thread_id, (select auth.uid()), now())
  on conflict (email_thread_id, user_id) do update set last_read_at = now();
$$;


ALTER FUNCTION public.mark_email_thread_read(p_thread_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.mark_email_thread_read(p_thread_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_email_thread_read(p_thread_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_email_thread_read(p_thread_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mark_email_thread_read(p_thread_id uuid) TO service_role;

CREATE FUNCTION public.email_record_threads(p_entity_type text, p_entity_id uuid) RETURNS TABLE(email_thread_id uuid, subject text, status text, last_message_at timestamp with time zone, mailbox_id uuid, last_direction text, last_from text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  with base as (
    select case when p_entity_type = 'orders' then (select o.specification_id from public.orders o where o.id = p_entity_id)
                else p_entity_id end as specification_id
  ),
  family(entity_type, entity_id) as (
    select 'specifications', b.specification_id from base b where b.specification_id is not null
    union
    select 'orders', o.id from public.orders o, base b where o.specification_id = b.specification_id
    union
    select p_entity_type, p_entity_id
  )
  select t.id, t.subject, t.status, t.last_message_at, t.mailbox_id, lm.direction, lm.from_address
  from public.email_threads t
  left join lateral (
    select m.direction, m.from_address from public.email_messages m
    where m.email_thread_id = t.id order by m.sent_at desc limit 1
  ) lm on true
  where exists (
    select 1 from public.email_thread_entity_links l
    join family f on f.entity_type = l.entity_type and f.entity_id = l.entity_id
    where l.email_thread_id = t.id
  )
  order by t.last_message_at desc nulls last;
$$;


ALTER FUNCTION public.email_record_threads(p_entity_type text, p_entity_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_record_threads(p_entity_type text, p_entity_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_record_threads(p_entity_type text, p_entity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_record_threads(p_entity_type text, p_entity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.email_record_threads(p_entity_type text, p_entity_id uuid) TO service_role;

CREATE FUNCTION public.email_view_counts() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with f as (select * from public.email_thread_flags(false)),
  v(view_key, u, t) as (
    select 'unread', count(*) filter (where relevant and unread), count(*) filter (where relevant and unread) from f
    union all select 'mine', count(*) filter (where mine and unread and relevant), count(*) filter (where mine) from f
    union all select 'unassigned', count(*) filter (where unassigned and unread and relevant), count(*) filter (where unassigned) from f
    union all select 'waiting', 0, count(*) filter (where waiting and relevant) from f
    union all select 'availability', count(*) filter (where availability and unread and relevant), count(*) filter (where availability) from f
    union all select 'quotes', count(*) filter (where quote and unread and relevant), count(*) filter (where quote) from f
    union all select 'offers', count(*) filter (where 'specifications' = any (entity_types) and unread and relevant), count(*) filter (where 'specifications' = any (entity_types)) from f
    union all select 'orders', count(*) filter (where 'orders' = any (entity_types) and unread and relevant), count(*) filter (where 'orders' = any (entity_types)) from f
    union all select 'companies', count(*) filter (where 'companies' = any (entity_types) and unread and relevant), count(*) filter (where 'companies' = any (entity_types)) from f
    union all select 'vessels', count(*) filter (where 'vessels' = any (entity_types) and unread and relevant), count(*) filter (where 'vessels' = any (entity_types)) from f
    union all select 'hull_events', count(*) filter (where 'hull_events' = any (entity_types) and unread and relevant), count(*) filter (where 'hull_events' = any (entity_types)) from f
    union all select 'free', count(*) filter (where entity_types is null and unread and relevant), count(*) filter (where entity_types is null) from f
    union all select 'deliveries', count(*) filter (where delivery_soon and unread and relevant), count(*) filter (where delivery_soon) from f
  ),
  mb as (
    select mailbox_id, count(*) filter (where unread and relevant) as u, count(*) as t from f group by mailbox_id
  )
  select jsonb_build_object(
    'views', (select jsonb_object_agg(view_key, jsonb_build_object('u', u, 't', t)) from v),
    'mailboxes', coalesce((select jsonb_object_agg(mailbox_id, jsonb_build_object('u', u, 't', t)) from mb), '{}'::jsonb)
  );
$$;


ALTER FUNCTION public.email_view_counts() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_view_counts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_view_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_view_counts() TO authenticated;
GRANT ALL ON FUNCTION public.email_view_counts() TO service_role;

CREATE FUNCTION public.email_view_threads(p_view text, p_mailbox uuid DEFAULT NULL::uuid, p_unread_only boolean DEFAULT false, p_closed boolean DEFAULT false, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 51) RETURNS TABLE(id uuid, subject text, status text, last_message_at timestamp with time zone, mailbox_name text, mailbox_color text, responsible_user_id uuid, unread boolean, relevant boolean, entity_types text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select f.id, f.subject, f.status, f.last_message_at, f.mailbox_name, f.mailbox_color, f.responsible_user_id, f.unread, f.relevant, f.entity_types
  from public.email_thread_flags(p_closed) f
  where case p_view
      when 'unread' then f.relevant and f.unread
      when 'mine' then f.mine
      when 'unassigned' then f.unassigned
      when 'waiting' then f.waiting and f.relevant
      when 'availability' then f.availability
      when 'quotes' then f.quote
      when 'offers' then 'specifications' = any (f.entity_types)
      when 'orders' then 'orders' = any (f.entity_types)
      when 'companies' then 'companies' = any (f.entity_types)
      when 'vessels' then 'vessels' = any (f.entity_types)
      when 'hull_events' then 'hull_events' = any (f.entity_types)
      when 'free' then f.entity_types is null
      when 'deliveries' then f.delivery_soon
      when 'mailbox' then f.mailbox_id = p_mailbox
      else false
    end
    and (not p_unread_only or (f.unread and f.relevant))
    and (nullif(trim(p_search), '') is null or position(lower(trim(p_search)) in lower(coalesce(f.subject, ''))) > 0)
  order by f.last_message_at desc nulls last, f.id
  limit least(greatest(p_limit, 1), 501);
$$;


ALTER FUNCTION public.email_view_threads(p_view text, p_mailbox uuid, p_unread_only boolean, p_closed boolean, p_search text, p_limit integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_view_threads(p_view text, p_mailbox uuid, p_unread_only boolean, p_closed boolean, p_search text, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_view_threads(p_view text, p_mailbox uuid, p_unread_only boolean, p_closed boolean, p_search text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_view_threads(p_view text, p_mailbox uuid, p_unread_only boolean, p_closed boolean, p_search text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.email_view_threads(p_view text, p_mailbox uuid, p_unread_only boolean, p_closed boolean, p_search text, p_limit integer) TO service_role;

CREATE FUNCTION public.email_thread_flags(p_closed boolean DEFAULT false) RETURNS TABLE(id uuid, subject text, status text, last_message_at timestamp with time zone, mailbox_id uuid, mailbox_name text, mailbox_color text, responsible_user_id uuid, unread boolean, relevant boolean, mine boolean, unassigned boolean, waiting boolean, availability boolean, quote boolean, delivery_soon boolean, entity_types text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    t.id, t.subject, t.status, t.last_message_at,
    t.mailbox_id, mb.display_name, mb.color, t.responsible_user_id,
    t.last_message_at is not null
      and (r.last_read_at < t.last_message_at or (r.email_thread_id is null and t.last_message_at > now() - interval '7 days')),
    t.id in (select public.my_relevant_email_thread_ids()),
    t.responsible_user_id = (select auth.uid())
      or exists (select 1 from public.email_thread_followers f where f.email_thread_id = t.id and f.user_id = (select auth.uid())),
    t.responsible_user_id is null,
    (select m.direction from public.email_messages m where m.email_thread_id = t.id order by m.sent_at desc nulls last limit 1) = 'outbound',
    exists (select 1 from public.availability_requests ar where ar.email_thread_id = t.id),
    exists (select 1 from public.transport_quotes tq where tq.email_thread_id = t.id),
    exists (
      select 1
      from public.email_thread_entity_links l
      join public.transports tr on (l.entity_type = 'orders' and tr.order_id = l.entity_id) or (l.entity_type = 'specifications' and tr.specification_id = l.entity_id)
      where l.email_thread_id = t.id and tr.planned_date between current_date and current_date + 7
    ),
    lk.types
  from public.email_threads t
  join public.mailboxes mb on mb.id = t.mailbox_id
  left join public.email_thread_reads r on r.email_thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (select array_agg(l.entity_type) as types from public.email_thread_entity_links l where l.email_thread_id = t.id) lk on true
  where t.mailbox_id = any ((select public.my_mailbox_ids())::uuid[])
    and t.status = any (case when p_closed then array['open', 'pending', 'closed', 'spam'] else array['open', 'pending'] end);
$$;


ALTER FUNCTION public.email_thread_flags(p_closed boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.email_thread_flags(p_closed boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.email_thread_flags(p_closed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_thread_flags(p_closed boolean) TO authenticated;
GRANT ALL ON FUNCTION public.email_thread_flags(p_closed boolean) TO service_role;

CREATE FUNCTION public.my_unread_email_threads() RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select count(*)::int
  from public.email_threads t
  left join public.email_thread_reads r on r.email_thread_id = t.id and r.user_id = (select auth.uid())
  where t.id in (select public.my_relevant_email_thread_ids())
    and t.last_message_at is not null
    and (r.last_read_at < t.last_message_at
         or (r.email_thread_id is null and t.last_message_at > now() - interval '7 days'));
$$;


ALTER FUNCTION public.my_unread_email_threads() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_unread_email_threads() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_unread_email_threads() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_unread_email_threads() TO authenticated;
GRANT ALL ON FUNCTION public.my_unread_email_threads() TO service_role;

CREATE FUNCTION public.my_email_counters() RETURNS TABLE(unread_relevant integer, unassigned integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select
    (select public.my_unread_email_threads()),
    (select count(*)::int from public.email_threads t where t.status in ('open', 'pending') and t.responsible_user_id is null);
$$;


ALTER FUNCTION public.my_email_counters() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_email_counters() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_email_counters() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_email_counters() TO authenticated;
GRANT ALL ON FUNCTION public.my_email_counters() TO service_role;

CREATE FUNCTION public.my_relevant_email_thread_ids() RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select t.id
  from public.email_threads t
  where t.status in ('open', 'pending')
    and t.mailbox_id = any ((select public.my_mailbox_ids())::uuid[])
    -- a muted thread is never relevant (thread_follows, 20261024260000); a mention always is (its unread notification)
    and not exists (select 1 from public.thread_follows m where m.user_id = (select auth.uid()) and m.target_type = 'email_threads' and m.target_id = t.id and m.level = 'mute')
    and (
      exists (
        select 1 from public.conversations c
        join public.notifications n on n.entity_type = 'conversations' and n.entity_id = c.id and n.user_id = (select auth.uid()) and n.read_at is null and n.type = 'mention'
        where c.anchor_type = 'email_threads' and c.anchor_id = t.id
      )
      or exists (select 1 from public.thread_follows tf where tf.user_id = (select auth.uid()) and tf.target_type = 'email_threads' and tf.target_id = t.id and tf.level = 'follow')
      or t.responsible_user_id = (select auth.uid())
      or exists (select 1 from public.email_thread_followers f where f.email_thread_id = t.id and f.user_id = (select auth.uid()))
      or exists (
        select 1
        from public.email_thread_entity_links l
        where l.email_thread_id = t.id
          and ((select auth.uid()) = case l.entity_type
            when 'companies' then (select c.sales_account_user_id from public.companies c where c.id = l.entity_id)
            when 'specifications' then (select s.responsible_user_id from public.specifications s where s.id = l.entity_id)
            when 'orders' then (select o.responsible_user_id from public.orders o where o.id = l.entity_id)
            when 'hull_events' then (select h.sales_account_user_id from public.hull_events h where h.id = l.entity_id)
          end
          or (l.entity_type = 'specifications' and exists (select 1 from public.specifications s where s.id = l.entity_id and s.sales_account_user_id = (select auth.uid())))
          or (l.entity_type = 'orders' and exists (select 1 from public.orders o where o.id = l.entity_id and o.sales_account_user_id = (select auth.uid()))))
      )
    );
$$;


ALTER FUNCTION public.my_relevant_email_thread_ids() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_relevant_email_thread_ids() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_relevant_email_thread_ids() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_relevant_email_thread_ids() TO authenticated;
GRANT ALL ON FUNCTION public.my_relevant_email_thread_ids() TO service_role;

CREATE FUNCTION public.my_has_unread_notes() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_ctx public.access_context;
  v_ok boolean;
  r record;
begin
  if (select auth.uid()) is null or not (select public.mfa_satisfied()) then
    return false;
  end if;
  v_ctx := public.access_context();
  for r in
    select c.anchor_type as entity_type, c.anchor_id as entity_id
    from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id
    where p.user_id = (select auth.uid())
      and c.last_message_at is not null
      and (p.last_read_at is null or p.last_read_at < c.last_message_at)
  loop
    v_ok := r.entity_type in ('vessels', 'companies', 'tenants')
            or public.can_access_entity_ctx(r.entity_type, r.entity_id, 'view', v_ctx);
    if v_ok then
      return true;
    end if;
  end loop;
  return false;
end;
$$;


ALTER FUNCTION public.my_has_unread_notes() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.my_has_unread_notes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.my_has_unread_notes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_has_unread_notes() TO authenticated;
GRANT ALL ON FUNCTION public.my_has_unread_notes() TO service_role;

CREATE FUNCTION public.npm_search_messages(p_term text, p_limit integer DEFAULT 10) RETURNS TABLE(message_id uuid, conversation_id uuid, parent_type text, parent_id uuid, author_name text, created_at timestamp with time zone, snippet text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_pattern text := '%' || replace(replace(replace(p_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_ctx public.access_context;
  v_found integer := 0;
  v_seen integer := 0;
  v_ok boolean;
  v_before_at timestamptz := 'infinity';
  v_before_id uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_page integer;
  r record;
begin
  if (select auth.uid()) is null or not (select public.mfa_satisfied()) or length(trim(coalesce(p_term, ''))) < 3 then
    return;
  end if;
  v_ctx := public.access_context();
  -- Pages of 200 candidates, newest first (keyset on created_at, id), until enough are visible to the caller or 2,000
  -- candidates were looked at.
  while v_found < p_limit and v_seen < 2000 loop
    v_page := 0;
    for r in
      select m.id, m.conversation_id, m.body, m.created_at, m.author_user_id, c.anchor_type as entity_type, c.anchor_id as entity_id
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.body ilike v_pattern and m.deleted_at is null
        and m.created_at > now() - interval '12 months'
        and (m.created_at, m.id) < (v_before_at, v_before_id)
      order by m.created_at desc, m.id desc
      limit 200
    loop
      v_page := v_page + 1;
      v_before_at := r.created_at;
      v_before_id := r.id;
      v_ok := r.entity_type in ('vessels', 'companies', 'tenants')
              or public.can_access_entity_ctx(r.entity_type, r.entity_id, 'view', v_ctx);
      if v_ok then
        message_id := r.id;
        conversation_id := r.conversation_id;
        parent_type := r.entity_type;
        parent_id := r.entity_id;
        select coalesce(u.name, u.email) into author_name from public.users u where u.id = r.author_user_id;
        created_at := r.created_at;
        snippet := public.message_excerpt(substr(r.body, greatest(1, position(lower(p_term) in lower(r.body)) - 40)), 120);
        return next;
        v_found := v_found + 1;
        exit when v_found >= p_limit;
      end if;
    end loop;
    v_seen := v_seen + v_page;
    exit when v_page < 200;
  end loop;
end;
$$;


ALTER FUNCTION public.npm_search_messages(p_term text, p_limit integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.npm_search_messages(p_term text, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.npm_search_messages(p_term text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.npm_search_messages(p_term text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.npm_search_messages(p_term text, p_limit integer) TO service_role;

ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins manage mailboxes" ON public.mailboxes TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "View mailboxes you belong to" ON public.mailboxes FOR SELECT TO authenticated USING ((((kind = 'personal'::text) AND (owner_user_id = auth.uid())) OR ((kind = 'shared'::text) AND (EXISTS ( SELECT 1
   FROM public.user_teams ug
  WHERE ((ug.user_id = auth.uid()) AND (ug.team_id = mailboxes.team_id)))))));

CREATE POLICY mfa_required ON public.mailboxes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.mailbox_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View mailbox connection status per mailbox access" ON public.mailbox_connections FOR SELECT TO authenticated USING ((public.can_access_mailbox(mailbox_id)));

CREATE POLICY mfa_required ON public.mailbox_connections AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete email threads per mailbox access" ON public.email_threads FOR DELETE TO authenticated USING ((mailbox_id = ANY (( SELECT public.my_mailbox_ids() AS my_mailbox_ids)::uuid[])));

CREATE POLICY "Insert email threads per mailbox access" ON public.email_threads FOR INSERT TO authenticated WITH CHECK ((mailbox_id = ANY (( SELECT public.my_mailbox_ids() AS my_mailbox_ids)::uuid[])));

CREATE POLICY "Update email threads per mailbox access" ON public.email_threads FOR UPDATE TO authenticated USING ((mailbox_id = ANY (( SELECT public.my_mailbox_ids() AS my_mailbox_ids)::uuid[]))) WITH CHECK ((mailbox_id = ANY (( SELECT public.my_mailbox_ids() AS my_mailbox_ids)::uuid[])));

CREATE POLICY "View email threads per mailbox access" ON public.email_threads FOR SELECT TO authenticated USING ((mailbox_id = ANY (( SELECT public.my_mailbox_ids() AS my_mailbox_ids)::uuid[])));

CREATE POLICY mfa_required ON public.email_threads AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER upsert_follower_on_responsible_change AFTER INSERT OR UPDATE ON public.email_threads FOR EACH ROW WHEN ((new.responsible_user_id IS NOT NULL)) EXECUTE FUNCTION public.upsert_email_thread_follower_on_responsible_change();

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete email messages per thread access" ON public.email_messages FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_messages.email_thread_id))));

CREATE POLICY "Insert email messages per thread access" ON public.email_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_messages.email_thread_id))));

CREATE POLICY "Update email messages per thread access" ON public.email_messages FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_messages.email_thread_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_messages.email_thread_id))));

CREATE POLICY "View email messages per thread access" ON public.email_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_messages.email_thread_id))));

CREATE POLICY mfa_required ON public.email_messages AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER bump_email_thread_last_message_at AFTER INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.bump_email_thread_last_message_at();

CREATE TRIGGER cleanup_email_attachments AFTER DELETE ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.cleanup_email_attachments('email_messages');

CREATE TRIGGER notify_on_inbound_email AFTER INSERT ON public.email_messages FOR EACH ROW WHEN ((new.direction = 'inbound'::text)) EXECUTE FUNCTION public.notify_on_inbound_email();

CREATE TRIGGER reopen_email_thread_on_inbound AFTER INSERT ON public.email_messages FOR EACH ROW WHEN ((new.direction = 'inbound'::text)) EXECUTE FUNCTION public.reopen_email_thread_on_inbound();

CREATE TRIGGER upsert_email_thread_participant_from_message AFTER INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.upsert_email_thread_participant_from_message();

ALTER TABLE public.email_message_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View email message recipients per thread access" ON public.email_message_recipients FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.email_messages em
  WHERE ((em.id = email_message_recipients.email_message_id) AND public.can_access_email_thread(em.email_thread_id))))));

CREATE POLICY "Write email message recipients per thread access" ON public.email_message_recipients TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.email_messages em
  WHERE ((em.id = email_message_recipients.email_message_id) AND public.can_access_email_thread(em.email_thread_id)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.email_messages em
  WHERE ((em.id = email_message_recipients.email_message_id) AND public.can_access_email_thread(em.email_thread_id))))));

CREATE POLICY mfa_required ON public.email_message_recipients AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER upsert_email_thread_participant_from_recipient AFTER INSERT ON public.email_message_recipients FOR EACH ROW EXECUTE FUNCTION public.upsert_email_thread_participant_from_recipient();

ALTER TABLE public.email_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage own email signature" ON public.email_signatures TO authenticated USING (((user_id = auth.uid()) OR public.is_admin())) WITH CHECK (((user_id = auth.uid()) OR public.is_admin()));

CREATE POLICY mfa_required ON public.email_signatures AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_signatures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins manage suppressions" ON public.email_suppressions TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Only admins read suppressions" ON public.email_suppressions FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY mfa_required ON public.email_suppressions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.email_thread_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View email thread drafts per mailbox access" ON public.email_thread_drafts FOR SELECT TO authenticated USING ((((email_thread_id IS NOT NULL) AND public.can_access_email_thread(email_thread_id)) OR ((email_thread_id IS NULL) AND public.can_access_mailbox(mailbox_id))));

CREATE POLICY "Write email thread drafts per mailbox access" ON public.email_thread_drafts TO authenticated USING ((((email_thread_id IS NOT NULL) AND public.can_access_email_thread(email_thread_id)) OR ((email_thread_id IS NULL) AND public.can_access_mailbox(mailbox_id)))) WITH CHECK ((((email_thread_id IS NOT NULL) AND public.can_access_email_thread(email_thread_id)) OR ((email_thread_id IS NULL) AND public.can_access_mailbox(mailbox_id))));

CREATE POLICY mfa_required ON public.email_thread_drafts AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER check_email_thread_draft_delete_lock BEFORE DELETE ON public.email_thread_drafts FOR EACH ROW EXECUTE FUNCTION public.check_email_thread_draft_delete_lock();

CREATE TRIGGER check_email_thread_draft_lock BEFORE UPDATE ON public.email_thread_drafts FOR EACH ROW EXECUTE FUNCTION public.check_email_thread_draft_lock();

CREATE TRIGGER claim_email_thread_on_draft_insert AFTER INSERT ON public.email_thread_drafts FOR EACH ROW WHEN (((new.email_thread_id IS NOT NULL) AND (new.locked_by_user_id IS NOT NULL))) EXECUTE FUNCTION public.claim_email_thread_on_draft_lock();

CREATE TRIGGER claim_email_thread_on_draft_lock_change AFTER UPDATE ON public.email_thread_drafts FOR EACH ROW WHEN (((new.email_thread_id IS NOT NULL) AND (new.locked_by_user_id IS NOT NULL) AND (new.locked_by_user_id IS DISTINCT FROM old.locked_by_user_id))) EXECUTE FUNCTION public.claim_email_thread_on_draft_lock();

CREATE TRIGGER cleanup_email_attachments AFTER DELETE ON public.email_thread_drafts FOR EACH ROW EXECUTE FUNCTION public.cleanup_email_attachments('email_thread_drafts');

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.email_thread_drafts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.email_thread_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete email thread entity links per thread access" ON public.email_thread_entity_links FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_entity_links.email_thread_id))));

CREATE POLICY "Insert email thread entity links per thread access" ON public.email_thread_entity_links FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_entity_links.email_thread_id))));

CREATE POLICY "Update email thread entity links per thread access" ON public.email_thread_entity_links FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_entity_links.email_thread_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_entity_links.email_thread_id))));

CREATE POLICY "View email thread entity links per thread access" ON public.email_thread_entity_links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_entity_links.email_thread_id))));

CREATE POLICY mfa_required ON public.email_thread_entity_links AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER assign_email_thread_from_record AFTER INSERT ON public.email_thread_entity_links FOR EACH ROW EXECUTE FUNCTION public.assign_email_thread_from_record();

CREATE TRIGGER check_entity_reference BEFORE INSERT OR UPDATE ON public.email_thread_entity_links FOR EACH ROW EXECUTE FUNCTION public.check_email_thread_entity_reference();

ALTER TABLE public.email_thread_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete own follower row" ON public.email_thread_followers FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Insert own follower row" ON public.email_thread_followers FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_followers.email_thread_id)))));

CREATE POLICY "Update own follower row" ON public.email_thread_followers FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_followers.email_thread_id)))));

CREATE POLICY "View email thread followers per thread access" ON public.email_thread_followers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_followers.email_thread_id))));

CREATE POLICY mfa_required ON public.email_thread_followers AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.email_thread_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View email thread participants per thread access" ON public.email_thread_participants FOR SELECT TO authenticated USING ((public.can_access_email_thread(email_thread_id)));

CREATE POLICY "Write email thread participants per thread access" ON public.email_thread_participants TO authenticated USING ((public.can_access_email_thread(email_thread_id))) WITH CHECK ((public.can_access_email_thread(email_thread_id)));

CREATE POLICY mfa_required ON public.email_thread_participants AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.email_thread_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own thread read state" ON public.email_thread_reads TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_reads.email_thread_id))))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.email_threads et
  WHERE (et.id = email_thread_reads.email_thread_id)))));

CREATE POLICY mfa_required ON public.email_thread_reads AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER mark_email_thread_notifications_read AFTER INSERT OR UPDATE OF last_read_at ON public.email_thread_reads FOR EACH ROW EXECUTE FUNCTION public.mark_email_thread_notifications_read();

ALTER TABLE public.thread_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete own thread follows" ON public.thread_follows FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Read own thread follows" ON public.thread_follows FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Update own thread follows" ON public.thread_follows FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND
CASE target_type
    WHEN 'email_threads'::text THEN public.can_access_email_thread(target_id)
    ELSE (EXISTS ( SELECT 1
       FROM public.conversations c
      WHERE (c.id = thread_follows.target_id)))
END));

CREATE POLICY "Write own thread follows" ON public.thread_follows FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND
CASE target_type
    WHEN 'email_threads'::text THEN public.can_access_email_thread(target_id)
    ELSE (EXISTS ( SELECT 1
       FROM public.conversations c
      WHERE (c.id = thread_follows.target_id)))
END));

CREATE POLICY mfa_required ON public.thread_follows AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

-- Hand-written part of the email slice.

-- Entity types: an email thread carries internal notes (a record conversation) and files; a message and a draft carry files
-- (attachments with entity_type email_messages / email_thread_drafts, stored under <entity_type>/<id>/). Access: mailbox
-- membership (email_thread_allows / can_access_email_draft), as in NPM's can_access_entity branches.
create function public.email_threads_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.email_thread_allows(p_entity_id, public.access_context_for(p_user_id)); $$;
create function public.email_threads_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable set search_path to '' as $$ select public.email_thread_allows(p_entity_id, p_ctx); $$;
create function public.email_messages_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.email_thread_allows((select m.email_thread_id from public.email_messages m where m.id = p_entity_id), public.access_context_for(p_user_id)); $$;
create function public.email_messages_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable security definer set search_path to '' as $$
  select public.email_thread_allows((select m.email_thread_id from public.email_messages m where m.id = p_entity_id), p_ctx); $$;
-- Drafts: the signed-in user's view (can_access_email_draft reads auth.uid()), like NPM.
create function public.email_thread_drafts_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language sql stable security definer set search_path to '' as $$ select public.can_access_email_draft(p_entity_id); $$;
create function public.email_thread_drafts_ctx_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language sql stable security definer set search_path to '' as $$ select public.can_access_email_draft(p_entity_id); $$;
create function public.email_threads_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select coalesce(t.subject, '(no subject)') from public.email_threads t where t.id = p_entity_id; $$;
revoke all on function public.email_threads_access(uuid, uuid, text), public.email_messages_access(uuid, uuid, text),
  public.email_thread_drafts_access(uuid, uuid, text), public.email_threads_label(uuid),
  public.email_threads_ctx_allows(text, uuid, public.access_context), public.email_messages_ctx_allows(text, uuid, public.access_context),
  public.email_thread_drafts_ctx_allows(text, uuid, public.access_context) from public, anon;
grant execute on function public.email_threads_access(uuid, uuid, text), public.email_messages_access(uuid, uuid, text),
  public.email_thread_drafts_access(uuid, uuid, text), public.email_threads_label(uuid),
  public.email_threads_ctx_allows(text, uuid, public.access_context), public.email_messages_ctx_allows(text, uuid, public.access_context),
  public.email_thread_drafts_ctx_allows(text, uuid, public.access_context) to authenticated, service_role;
select public.entity_type_register('email_threads', 'npm-email', 'email_threads_access', 'email_threads_ctx_allows', 'An email thread', 'email_threads_label');
select public.entity_type_register('email_messages', 'npm-email', 'email_messages_access', 'email_messages_ctx_allows', 'An email message');
select public.entity_type_register('email_thread_drafts', 'npm-email', 'email_thread_drafts_access', 'email_thread_drafts_ctx_allows', 'An email draft');

select public.notification_type_register('email_reply', 'npm-email', true, 'A reply arrived in an email thread you are responsible for or follow', true);
select public.notification_type_register('email_unclaimed', 'npm-email', true, 'An email thread of your mailbox is still unassigned', true);

-- Realtime as in NPM (thread list, drafts being written, read markers).
alter publication supabase_realtime add table public.email_thread_followers, public.email_messages, public.email_thread_drafts, public.email_thread_reads;

