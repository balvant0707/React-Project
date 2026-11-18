-- Platform activity events: the log of what happened to a record.
-- Source: COMPASS database, copied 1:1 (named events).

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE TABLE public.activity_events (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    event_type text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    author_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_events_entity_type_check CHECK ((entity_type = ANY (ARRAY['assets'::text, 'tickets'::text, 'tasks'::text, 'goals'::text])))
);

REVOKE ALL ON TABLE public.activity_events FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.activity_events TO authenticated;
GRANT ALL ON TABLE public.activity_events TO service_role;

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);

CREATE INDEX activity_events_entity_type_entity_id_created_at_idx ON public.activity_events USING btree (entity_type, entity_id, created_at);

CREATE INDEX activity_events_entity_type_entity_id_event_type_idx ON public.activity_events USING btree (entity_type, entity_id, event_type);

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION public.activity_events_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'System events are immutable';
end;
$$;

REVOKE ALL ON FUNCTION public.activity_events_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.activity_events_immutable() FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_events_immutable() TO service_role;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View events" ON public.activity_events FOR SELECT TO authenticated USING (public.can_access_entity(entity_type, entity_id, 'view'::text));

CREATE POLICY mfa_required ON public.activity_events AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER activity_events_immutable BEFORE UPDATE ON public.activity_events FOR EACH ROW EXECUTE FUNCTION public.activity_events_immutable();
