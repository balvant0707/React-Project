-- Platform core, slice 3: notifications.
-- Source: COMPASS database (maintenance_tool), copied 1:1.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    actor_user_id uuid,
    entity_type text,
    entity_id uuid,
    dedupe_key text,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurrences integer DEFAULT 1 NOT NULL,
    channels text[] DEFAULT ARRAY['in_app'::text, 'toast'::text] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    email_sent_at timestamp with time zone,
    push_sent_at timestamp with time zone
);

REVOKE ALL ON TABLE public.notifications FROM anon, authenticated, service_role;
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;

GRANT UPDATE(read_at) ON TABLE public.notifications TO authenticated;

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    remind_planned_today boolean DEFAULT true NOT NULL,
    remind_due_soon boolean DEFAULT true NOT NULL,
    remind_overdue boolean DEFAULT true NOT NULL,
    due_soon_days integer DEFAULT 2 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    remind_trainings boolean DEFAULT true NOT NULL,
    remind_items boolean DEFAULT true NOT NULL,
    muted_types text[] DEFAULT '{}'::text[] NOT NULL,
    push_quiet_from time without time zone,
    push_quiet_to time without time zone,
    CONSTRAINT notification_preferences_due_soon_days_check CHECK (((due_soon_days >= 0) AND (due_soon_days <= 14))),
    CONSTRAINT notification_preferences_quiet_complete CHECK (((push_quiet_from IS NULL) = (push_quiet_to IS NULL)))
);

REVOKE ALL ON TABLE public.notification_preferences FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.notification_preferences TO authenticated;
GRANT ALL ON TABLE public.notification_preferences TO service_role;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

CREATE INDEX notifications_dedupe_key_idx ON public.notifications USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);

CREATE UNIQUE INDEX notifications_unread_dedupe_key ON public.notifications USING btree (user_id, dedupe_key) WHERE ((read_at IS NULL) AND (dedupe_key IS NOT NULL));

CREATE INDEX notifications_user_id_created_at_idx ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX notifications_user_id_idx ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE FUNCTION public.notify(p_user_ids uuid[], p_type text, p_title text, p_link text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_actor_user_id uuid DEFAULT NULL::uuid, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_dedupe_key text DEFAULT NULL::text, p_channels text[] DEFAULT ARRAY['in_app'::text, 'toast'::text], p_params jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.notifications
    (user_id, type, title, body, link, actor_user_id, entity_type, entity_id, dedupe_key, channels, params)
  select r.user_id, p_type, p_title, p_body, p_link, p_actor_user_id, p_entity_type, p_entity_id, p_dedupe_key, p_channels,
         coalesce(p_params, '{}'::jsonb)
  from (select distinct unnest(p_user_ids) as user_id) r
  where r.user_id is not null
    and not (p_type = any (public.switchable_notification_types())
             and exists (select 1 from public.notification_preferences np
                         where np.user_id = r.user_id and p_type = any (np.muted_types)))
  on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null
  do update set
    type = excluded.type,
    title = excluded.title,
    body = excluded.body,
    link = excluded.link,
    actor_user_id = excluded.actor_user_id,
    channels = excluded.channels,
    params = excluded.params,
    occurrences = public.notifications.occurrences + 1,
    created_at = now(),
    email_sent_at = null;
end;
$$;

REVOKE ALL ON FUNCTION public.notify(p_user_ids uuid[], p_type text, p_title text, p_link text, p_body text, p_actor_user_id uuid, p_entity_type text, p_entity_id uuid, p_dedupe_key text, p_channels text[], p_params jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notify(p_user_ids uuid[], p_type text, p_title text, p_link text, p_body text, p_actor_user_id uuid, p_entity_type text, p_entity_id uuid, p_dedupe_key text, p_channels text[], p_params jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify(p_user_ids uuid[], p_type text, p_title text, p_link text, p_body text, p_actor_user_id uuid, p_entity_type text, p_entity_id uuid, p_dedupe_key text, p_channels text[], p_params jsonb) TO service_role;

CREATE FUNCTION public.notifications_rearm_push() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.created_at is distinct from old.created_at then
    new.push_sent_at := null;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.notifications_rearm_push() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notifications_rearm_push() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notifications_rearm_push() TO service_role;

CREATE FUNCTION public.notifications_retract(p_keys text[], p_bundle_keys text[] DEFAULT '{}'::text[], p_body text DEFAULT NULL::text, p_link text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.notifications n
  where n.read_at is null
    and (n.dedupe_key = any (p_keys)
         or n.dedupe_key = any (p_bundle_keys) and n.occurrences <= 1
            and (n.body = p_body or n.link = p_link));
  update public.notifications n
  set body = null,
      occurrences = case when n.read_at is null then greatest(n.occurrences - 1, 1) else n.occurrences end
  where n.dedupe_key = any (p_keys)
     or n.dedupe_key = any (p_bundle_keys) and (n.body = p_body or n.link = p_link);
end;
$$;

REVOKE ALL ON FUNCTION public.notifications_retract(p_keys text[], p_bundle_keys text[], p_body text, p_link text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notifications_retract(p_keys text[], p_bundle_keys text[], p_body text, p_link text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notifications_retract(p_keys text[], p_bundle_keys text[], p_body text, p_link text) TO service_role;

CREATE FUNCTION public.notification_preferences_check_muted() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.muted_types := coalesce(array(
    select distinct t from unnest(new.muted_types) t where t = any (public.switchable_notification_types()) order by t), '{}');
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.notification_preferences_check_muted() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notification_preferences_check_muted() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notification_preferences_check_muted() TO service_role;

CREATE FUNCTION public.switchable_notification_types() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select array['comment', 'group_post', 'group_comment', 'direct_message', 'reaction'] $$;

REVOKE ALL ON FUNCTION public.switchable_notification_types() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.switchable_notification_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.switchable_notification_types() TO service_role;
GRANT ALL ON FUNCTION public.switchable_notification_types() TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete own notifications" ON public.notifications FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Read own notifications" ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Update own notifications" ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY mfa_required ON public.notifications AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER notifications_rearm_push BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notifications_rearm_push();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert own preferences" ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Read own preferences" ON public.notification_preferences FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "Update own preferences" ON public.notification_preferences FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_required ON public.notification_preferences AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER notification_preferences_check_muted BEFORE INSERT OR UPDATE OF muted_types ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.notification_preferences_check_muted();
