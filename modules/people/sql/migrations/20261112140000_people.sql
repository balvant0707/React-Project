-- People (module people): COMPASS person data that only HR sees (person_private), positions and appointments, job
-- descriptions, fit reviews, trainings (types, sessions, records, requirements, exemptions, reminders), operating
-- instructions (versions, texts, assets, approval). Source: COMPASS database.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


-- Hand-written part of the people module, before the objects copied from COMPASS.

-- Exclusion constraints on (uuid, date range) need btree_gist (COMPASS has it in the extensions schema).
create extension if not exists btree_gist with schema extensions;

-- Numbers of operating instructions (COMPASS sequence operating_instruction_number_seq, owned by the column; see _after.sql).
create sequence public.operating_instruction_number_seq;
grant all on sequence public.operating_instruction_number_seq to authenticated, service_role;

-- The training reminder switch of the profile (COMPASS notification_preferences.remind_trainings).
alter table public.notification_preferences add column remind_trainings boolean default true not null;
grant select (remind_trainings), insert (remind_trainings), update (remind_trainings) on public.notification_preferences to authenticated;


CREATE FUNCTION public.position_today() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;


ALTER FUNCTION public.position_today() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_today() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_today() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_today() TO service_role;
GRANT ALL ON FUNCTION public.position_today() TO authenticated;

CREATE TABLE public.person_private (
    user_id uuid NOT NULL,
    birth_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    exit_date date,
    CONSTRAINT person_private_birth_date_check CHECK (((birth_date IS NULL) OR (birth_date <= CURRENT_DATE)))
);


ALTER TABLE public.person_private OWNER TO postgres;

REVOKE ALL ON TABLE public.person_private FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.person_private TO authenticated;
GRANT ALL ON TABLE public.person_private TO service_role;

CREATE TABLE public.positions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    code text,
    site text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    kind text DEFAULT 'job'::text NOT NULL,
    CONSTRAINT positions_code_check CHECK (((code IS NULL) OR ((length(code) >= 1) AND (length(code) <= 30)))),
    CONSTRAINT positions_kind_check CHECK ((kind = ANY (ARRAY['job'::text, 'appointment'::text]))),
    CONSTRAINT positions_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT positions_site_check CHECK (((site IS NULL) OR (length(site) <= 60)))
);


ALTER TABLE public.positions OWNER TO postgres;

REVOKE ALL ON TABLE public.positions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.positions TO authenticated;
GRANT ALL ON TABLE public.positions TO service_role;

CREATE TABLE public.position_teams (
    position_id uuid NOT NULL,
    team_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid()
);


ALTER TABLE public.position_teams OWNER TO postgres;

REVOKE ALL ON TABLE public.position_teams FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_teams TO authenticated;
GRANT ALL ON TABLE public.position_teams TO service_role;

CREATE TABLE public.position_holders (
    position_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    valid_from date DEFAULT public.position_today() NOT NULL,
    valid_to date,
    appointed_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid,
    CONSTRAINT position_holders_period CHECK (((valid_to IS NULL) OR (valid_to >= valid_from)))
);


ALTER TABLE public.position_holders OWNER TO postgres;

REVOKE ALL ON TABLE public.position_holders FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_holders TO authenticated;
GRANT ALL ON TABLE public.position_holders TO service_role;

CREATE TABLE public.position_assignment_log (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    position_id uuid NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    source text NOT NULL,
    team_id uuid,
    team_name text,
    happened_at timestamp with time zone DEFAULT now() NOT NULL,
    by_user_id uuid DEFAULT auth.uid(),
    valid_from date,
    valid_to date,
    CONSTRAINT position_assignment_log_action_check CHECK ((action = ANY (ARRAY['added'::text, 'removed'::text, 'changed'::text]))),
    CONSTRAINT position_assignment_log_source_check CHECK ((source = ANY (ARRAY['direct'::text, 'team'::text])))
);


ALTER TABLE public.position_assignment_log OWNER TO postgres;

REVOKE ALL ON TABLE public.position_assignment_log FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_assignment_log TO authenticated;
GRANT ALL ON TABLE public.position_assignment_log TO service_role;

CREATE TABLE public.requirement_phrases (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT requirement_phrases_text_check CHECK ((((length(text) >= 1) AND (length(text) <= 300)) AND (text = btrim(text))))
);


ALTER TABLE public.requirement_phrases OWNER TO postgres;

REVOKE ALL ON TABLE public.requirement_phrases FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.requirement_phrases TO authenticated;
GRANT ALL ON TABLE public.requirement_phrases TO service_role;

CREATE TABLE public.job_description_versions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    position_id uuid NOT NULL,
    version_no integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    valid_from date,
    purpose text DEFAULT ''::text NOT NULL,
    duties text DEFAULT ''::text NOT NULL,
    authority text DEFAULT ''::text NOT NULL,
    working_conditions text DEFAULT ''::text NOT NULL,
    change_note text,
    returned_note text,
    submitted_by_user_id uuid,
    submitted_at timestamp with time zone,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT job_description_versions_authority_check CHECK ((length(authority) <= 50000)),
    CONSTRAINT job_description_versions_change_note_check CHECK (((change_note IS NULL) OR (length(change_note) <= 2000))),
    CONSTRAINT job_description_versions_duties_check CHECK ((length(duties) <= 50000)),
    CONSTRAINT job_description_versions_purpose_check CHECK ((length(purpose) <= 50000)),
    CONSTRAINT job_description_versions_returned_note_check CHECK (((returned_note IS NULL) OR (length(returned_note) <= 2000))),
    CONSTRAINT job_description_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT job_description_versions_version_no_check CHECK ((version_no >= 1)),
    CONSTRAINT job_description_versions_working_conditions_check CHECK ((length(working_conditions) <= 50000))
);


ALTER TABLE public.job_description_versions OWNER TO postgres;

REVOKE ALL ON TABLE public.job_description_versions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.job_description_versions TO authenticated;
GRANT ALL ON TABLE public.job_description_versions TO service_role;

CREATE TABLE public.job_description_requirements (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    version_id uuid NOT NULL,
    phrase_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.job_description_requirements OWNER TO postgres;

REVOKE ALL ON TABLE public.job_description_requirements FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.job_description_requirements TO authenticated;
GRANT ALL ON TABLE public.job_description_requirements TO service_role;

CREATE TABLE public.position_fit_reviews (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    reviewed_on date NOT NULL,
    next_review_on date NOT NULL,
    result text NOT NULL,
    note text,
    measure text,
    measure_due_on date,
    measure_status text,
    positions jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT position_fit_reviews_dates CHECK ((next_review_on >= reviewed_on)),
    CONSTRAINT position_fit_reviews_measure_check CHECK (((measure IS NULL) OR (length(measure) <= 4000))),
    CONSTRAINT position_fit_reviews_measure_status_check CHECK ((measure_status = ANY (ARRAY['open'::text, 'done'::text]))),
    CONSTRAINT position_fit_reviews_note_check CHECK (((note IS NULL) OR (length(note) <= 4000))),
    CONSTRAINT position_fit_reviews_result_check CHECK ((result = ANY (ARRAY['fulfilled'::text, 'deviation'::text])))
);


ALTER TABLE public.position_fit_reviews OWNER TO postgres;

REVOKE ALL ON TABLE public.position_fit_reviews FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_fit_reviews TO authenticated;
GRANT ALL ON TABLE public.position_fit_reviews TO service_role;

CREATE TABLE public.position_fit_review_items (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    review_id uuid NOT NULL,
    phrase_id uuid NOT NULL,
    rating text NOT NULL,
    comment text,
    CONSTRAINT position_fit_review_items_comment_check CHECK (((comment IS NULL) OR (length(comment) <= 2000))),
    CONSTRAINT position_fit_review_items_rating_check CHECK ((rating = ANY (ARRAY['fulfilled'::text, 'deviation'::text])))
);


ALTER TABLE public.position_fit_review_items OWNER TO postgres;

REVOKE ALL ON TABLE public.position_fit_review_items FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_fit_review_items TO authenticated;
GRANT ALL ON TABLE public.position_fit_review_items TO service_role;

CREATE TABLE public.training_types (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    name text NOT NULL,
    description text,
    provider text,
    validity_months integer,
    reminder_days_before integer DEFAULT 60 NOT NULL,
    requires_certificate boolean DEFAULT false NOT NULL,
    retention_years_after_exit integer DEFAULT 30 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    category_phrase_id uuid,
    responsible_kind text,
    responsible_user_id uuid,
    responsible_external text,
    content text,
    CONSTRAINT training_types_content_check CHECK (((content IS NULL) OR (length(content) <= 20000))),
    CONSTRAINT training_types_description_check CHECK (((description IS NULL) OR (length(description) <= 1000))),
    CONSTRAINT training_types_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT training_types_provider_check CHECK (((provider IS NULL) OR (length(provider) <= 120))),
    CONSTRAINT training_types_reminder_days_before_check CHECK (((reminder_days_before >= 0) AND (reminder_days_before <= 730))),
    CONSTRAINT training_types_responsible_consistent CHECK ((((responsible_kind IS NULL) AND (responsible_user_id IS NULL) AND (responsible_external IS NULL)) OR COALESCE(((responsible_kind = 'supervisor'::text) AND (responsible_user_id IS NULL) AND (responsible_external IS NULL)), false) OR COALESCE(((responsible_kind = 'person'::text) AND (responsible_user_id IS NOT NULL) AND (responsible_external IS NULL)), false) OR COALESCE(((responsible_kind = 'external'::text) AND (responsible_user_id IS NULL) AND (responsible_external IS NOT NULL)), false))),
    CONSTRAINT training_types_responsible_external_check CHECK (((responsible_external IS NULL) OR ((length(responsible_external) >= 1) AND (length(responsible_external) <= 120)))),
    CONSTRAINT training_types_responsible_kind_check CHECK ((responsible_kind = ANY (ARRAY['supervisor'::text, 'person'::text, 'external'::text]))),
    CONSTRAINT training_types_retention_years_after_exit_check CHECK (((retention_years_after_exit >= 0) AND (retention_years_after_exit <= 100))),
    CONSTRAINT training_types_validity_months_check CHECK (((validity_months IS NULL) OR ((validity_months >= 1) AND (validity_months <= 240))))
);


ALTER TABLE public.training_types OWNER TO postgres;

REVOKE ALL ON TABLE public.training_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_types TO authenticated;
GRANT ALL ON TABLE public.training_types TO service_role;

CREATE TABLE public.training_session_types (
    session_id uuid NOT NULL,
    training_type_id uuid NOT NULL
);


ALTER TABLE public.training_session_types OWNER TO postgres;

REVOKE ALL ON TABLE public.training_session_types FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_session_types TO authenticated;
GRANT ALL ON TABLE public.training_session_types TO service_role;

CREATE TABLE public.training_sessions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    held_on date NOT NULL,
    location text,
    trainer text,
    extra_content text,
    note text,
    status text DEFAULT 'planned'::text NOT NULL,
    confirmed_at timestamp with time zone,
    confirmed_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT training_sessions_check CHECK (((status = 'confirmed'::text) = (confirmed_at IS NOT NULL))),
    CONSTRAINT training_sessions_extra_content_check CHECK (((extra_content IS NULL) OR (length(extra_content) <= 20000))),
    CONSTRAINT training_sessions_location_check CHECK (((location IS NULL) OR (length(location) <= 120))),
    CONSTRAINT training_sessions_note_check CHECK (((note IS NULL) OR (length(note) <= 2000))),
    CONSTRAINT training_sessions_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'confirmed'::text]))),
    CONSTRAINT training_sessions_trainer_check CHECK (((trainer IS NULL) OR (length(trainer) <= 120)))
);


ALTER TABLE public.training_sessions OWNER TO postgres;

REVOKE ALL ON TABLE public.training_sessions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_sessions TO authenticated;
GRANT ALL ON TABLE public.training_sessions TO service_role;

CREATE TABLE public.training_session_participants (
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    attended boolean DEFAULT true NOT NULL
);


ALTER TABLE public.training_session_participants OWNER TO postgres;

REVOKE ALL ON TABLE public.training_session_participants FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_session_participants TO authenticated;
GRANT ALL ON TABLE public.training_session_participants TO service_role;

CREATE TABLE public.training_records (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    training_type_id uuid NOT NULL,
    completed_on date NOT NULL,
    valid_until date,
    trainer text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    session_id uuid,
    CONSTRAINT training_records_completed_on_check CHECK ((completed_on <= CURRENT_DATE)),
    CONSTRAINT training_records_note_check CHECK (((note IS NULL) OR (length(note) <= 2000))),
    CONSTRAINT training_records_trainer_check CHECK (((trainer IS NULL) OR (length(trainer) <= 120)))
);


ALTER TABLE public.training_records OWNER TO postgres;

REVOKE ALL ON TABLE public.training_records FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_records TO authenticated;
GRANT ALL ON TABLE public.training_records TO service_role;

CREATE TABLE public.training_requirements (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    training_type_id uuid NOT NULL,
    team_id uuid,
    role_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    position_id uuid,
    user_id uuid,
    CONSTRAINT training_requirements_one_target CHECK ((num_nonnulls(team_id, role_id, position_id, user_id) = 1))
);


ALTER TABLE public.training_requirements OWNER TO postgres;

REVOKE ALL ON TABLE public.training_requirements FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_requirements TO authenticated;
GRANT ALL ON TABLE public.training_requirements TO service_role;

CREATE TABLE public.training_exemptions (
    user_id uuid NOT NULL,
    training_type_id uuid NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT training_exemptions_reason_check CHECK (((length(btrim(reason)) >= 1) AND (length(btrim(reason)) <= 500)))
);


ALTER TABLE public.training_exemptions OWNER TO postgres;

REVOKE ALL ON TABLE public.training_exemptions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_exemptions TO authenticated;
GRANT ALL ON TABLE public.training_exemptions TO service_role;

CREATE TABLE public.training_reminder_log (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    user_id uuid NOT NULL,
    training_type_id uuid NOT NULL,
    stage text NOT NULL,
    ref_date date NOT NULL,
    sent_on date DEFAULT CURRENT_DATE NOT NULL,
    CONSTRAINT training_reminder_log_stage_check CHECK ((stage = ANY (ARRAY['due_soon'::text, 'expired'::text, 'missing'::text, 'reinstruction'::text])))
);


ALTER TABLE public.training_reminder_log OWNER TO postgres;

REVOKE ALL ON TABLE public.training_reminder_log FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_reminder_log TO service_role;

CREATE TABLE public.operating_instructions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    number integer NOT NULL,
    legacy_number text,
    kind text NOT NULL,
    owner_user_id uuid DEFAULT auth.uid(),
    review_due_on date,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT operating_instructions_kind_check CHECK ((kind = ANY (ARRAY['substance'::text, 'machine'::text]))),
    CONSTRAINT operating_instructions_legacy_number_check CHECK (((legacy_number IS NULL) OR ((length(legacy_number) >= 1) AND (length(legacy_number) <= 40))))
);


ALTER TABLE public.operating_instructions OWNER TO postgres;

REVOKE ALL ON TABLE public.operating_instructions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.operating_instructions TO authenticated;
GRANT ALL ON TABLE public.operating_instructions TO service_role;

CREATE TABLE public.operating_instruction_versions (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    instruction_id uuid NOT NULL,
    version_no integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    valid_from date,
    signal_word text,
    signs jsonb DEFAULT '{}'::jsonb NOT NULL,
    change_note text,
    requires_reinstruction boolean DEFAULT false NOT NULL,
    returned_note text,
    submitted_by_user_id uuid,
    submitted_at timestamp with time zone,
    approved_by_user_id uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    updated_by_user_id uuid,
    CONSTRAINT operating_instruction_versions_change_note_check CHECK (((change_note IS NULL) OR (length(change_note) <= 2000))),
    CONSTRAINT operating_instruction_versions_returned_note_check CHECK (((returned_note IS NULL) OR (length(returned_note) <= 2000))),
    CONSTRAINT operating_instruction_versions_signal_word_check CHECK ((signal_word = ANY (ARRAY['danger'::text, 'warning'::text]))),
    CONSTRAINT operating_instruction_versions_signs_check CHECK (((jsonb_typeof(signs) = 'object'::text) AND (length((signs)::text) <= 4000))),
    CONSTRAINT operating_instruction_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT operating_instruction_versions_version_no_check CHECK ((version_no >= 1))
);


ALTER TABLE public.operating_instruction_versions OWNER TO postgres;

REVOKE ALL ON TABLE public.operating_instruction_versions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.operating_instruction_versions TO authenticated;
GRANT ALL ON TABLE public.operating_instruction_versions TO service_role;

CREATE TABLE public.operating_instruction_texts (
    version_id uuid NOT NULL,
    language text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    work_area text DEFAULT ''::text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    needs_check boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid,
    CONSTRAINT operating_instruction_texts_language_check CHECK ((language ~ '^[a-z]{2}$'::text)),
    CONSTRAINT operating_instruction_texts_sections_check CHECK (((jsonb_typeof(sections) = 'object'::text) AND (length((sections)::text) <= 100000))),
    CONSTRAINT operating_instruction_texts_subject_check CHECK ((length(subject) <= 300)),
    CONSTRAINT operating_instruction_texts_title_check CHECK ((length(title) <= 200)),
    CONSTRAINT operating_instruction_texts_work_area_check CHECK ((length(work_area) <= 200))
);


ALTER TABLE public.operating_instruction_texts OWNER TO postgres;

REVOKE ALL ON TABLE public.operating_instruction_texts FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.operating_instruction_texts TO authenticated;
GRANT ALL ON TABLE public.operating_instruction_texts TO service_role;

CREATE TABLE public.operating_instruction_assets (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    instruction_id uuid NOT NULL,
    asset_id uuid,
    asset_type_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT operating_instruction_assets_one_target CHECK ((num_nonnulls(asset_id, asset_type_id) = 1))
);


ALTER TABLE public.operating_instruction_assets OWNER TO postgres;

REVOKE ALL ON TABLE public.operating_instruction_assets FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.operating_instruction_assets TO authenticated;
GRANT ALL ON TABLE public.operating_instruction_assets TO service_role;

CREATE TABLE public.operating_instruction_log (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    instruction_id uuid NOT NULL,
    version_id uuid,
    action text NOT NULL,
    language text,
    note text,
    happened_at timestamp with time zone DEFAULT now() NOT NULL,
    by_user_id uuid DEFAULT auth.uid(),
    CONSTRAINT operating_instruction_log_action_check CHECK ((action = ANY (ARRAY['submitted'::text, 'returned'::text, 'published'::text, 'reviewed'::text, 'translation'::text, 'classified'::text])))
);


ALTER TABLE public.operating_instruction_log OWNER TO postgres;

REVOKE ALL ON TABLE public.operating_instruction_log FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.operating_instruction_log TO authenticated;
GRANT ALL ON TABLE public.operating_instruction_log TO service_role;

CREATE TABLE public.training_type_operating_instructions (
    training_type_id uuid NOT NULL,
    instruction_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid DEFAULT auth.uid()
);


ALTER TABLE public.training_type_operating_instructions OWNER TO postgres;

REVOKE ALL ON TABLE public.training_type_operating_instructions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_type_operating_instructions TO authenticated;
GRANT ALL ON TABLE public.training_type_operating_instructions TO service_role;

CREATE TABLE public.training_record_operating_instructions (
    record_id uuid NOT NULL,
    instruction_id uuid NOT NULL,
    version_id uuid NOT NULL
);


ALTER TABLE public.training_record_operating_instructions OWNER TO postgres;

REVOKE ALL ON TABLE public.training_record_operating_instructions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_record_operating_instructions TO authenticated;
GRANT ALL ON TABLE public.training_record_operating_instructions TO service_role;

ALTER TABLE ONLY public.person_private
    ADD CONSTRAINT person_private_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_code_key UNIQUE (code);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_name_key UNIQUE (name);

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);

CREATE INDEX positions_name_trgm_idx ON public.positions USING gin (name extensions.gin_trgm_ops);

ALTER TABLE ONLY public.position_teams
    ADD CONSTRAINT position_teams_pkey PRIMARY KEY (position_id, team_id);

CREATE INDEX position_teams_group_id_idx ON public.position_teams USING btree (team_id);

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_no_overlap EXCLUDE USING gist (position_id WITH =, user_id WITH =, daterange(valid_from, valid_to, '[]'::text) WITH &&);

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_pkey PRIMARY KEY (id);

CREATE INDEX position_holders_appointed_by_user_id_idx ON public.position_holders USING btree (appointed_by_user_id);

CREATE INDEX position_holders_position_id_idx ON public.position_holders USING btree (position_id);

CREATE INDEX position_holders_user_id_idx ON public.position_holders USING btree (user_id);

ALTER TABLE ONLY public.position_assignment_log
    ADD CONSTRAINT position_assignment_log_pkey PRIMARY KEY (id);

CREATE INDEX position_assignment_log_position_id_happened_at_idx ON public.position_assignment_log USING btree (position_id, happened_at);

CREATE INDEX position_assignment_log_user_id_happened_at_idx ON public.position_assignment_log USING btree (user_id, happened_at);

ALTER TABLE ONLY public.requirement_phrases
    ADD CONSTRAINT requirement_phrases_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX requirement_phrases_text_unique ON public.requirement_phrases USING btree (lower(text));

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_position_id_version_no_key UNIQUE (position_id, version_no);

CREATE UNIQUE INDEX job_description_one_open ON public.job_description_versions USING btree (position_id) WHERE (status = ANY (ARRAY['draft'::text, 'submitted'::text]));

CREATE UNIQUE INDEX job_description_one_published ON public.job_description_versions USING btree (position_id) WHERE (status = 'published'::text);

ALTER TABLE ONLY public.job_description_requirements
    ADD CONSTRAINT job_description_requirements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.job_description_requirements
    ADD CONSTRAINT job_description_requirements_version_id_phrase_id_key UNIQUE (version_id, phrase_id);

CREATE INDEX job_description_requirements_phrase_id_idx ON public.job_description_requirements USING btree (phrase_id);

ALTER TABLE ONLY public.position_fit_reviews
    ADD CONSTRAINT position_fit_reviews_pkey PRIMARY KEY (id);

CREATE INDEX position_fit_reviews_user_id_reviewed_on_idx ON public.position_fit_reviews USING btree (user_id, reviewed_on DESC);

ALTER TABLE ONLY public.position_fit_review_items
    ADD CONSTRAINT position_fit_review_items_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX position_fit_review_items_phrase ON public.position_fit_review_items USING btree (review_id, phrase_id) WHERE (phrase_id IS NOT NULL);

CREATE INDEX position_fit_review_items_phrase_id_idx ON public.position_fit_review_items USING btree (phrase_id) WHERE (phrase_id IS NOT NULL);

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_name_key UNIQUE (name);

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_pkey PRIMARY KEY (id);

CREATE INDEX training_types_name_trgm_idx ON public.training_types USING gin (name extensions.gin_trgm_ops);

CREATE INDEX training_types_responsible_user_idx ON public.training_types USING btree (responsible_user_id) WHERE (responsible_user_id IS NOT NULL);

ALTER TABLE ONLY public.training_session_types
    ADD CONSTRAINT training_session_types_pkey PRIMARY KEY (session_id, training_type_id);

CREATE INDEX training_session_types_training_type_id_idx ON public.training_session_types USING btree (training_type_id);

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_pkey PRIMARY KEY (id);

CREATE INDEX training_sessions_confirmed_by_user_id_idx ON public.training_sessions USING btree (confirmed_by_user_id);

CREATE INDEX training_sessions_created_by_user_id_idx ON public.training_sessions USING btree (created_by_user_id);

CREATE INDEX training_sessions_held_on_idx ON public.training_sessions USING btree (held_on DESC);

ALTER TABLE ONLY public.training_session_participants
    ADD CONSTRAINT training_session_participants_pkey PRIMARY KEY (session_id, user_id);

CREATE INDEX training_session_participants_user_id_idx ON public.training_session_participants USING btree (user_id);

ALTER TABLE ONLY public.training_records
    ADD CONSTRAINT training_records_pkey PRIMARY KEY (id);

CREATE INDEX training_records_session_id_idx ON public.training_records USING btree (session_id);

CREATE INDEX training_records_training_type_id_idx ON public.training_records USING btree (training_type_id);

CREATE INDEX training_records_user_id_training_type_id_completed_on_idx ON public.training_records USING btree (user_id, training_type_id, completed_on DESC);

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_pkey PRIMARY KEY (id);

CREATE INDEX training_requirements_group_id_idx ON public.training_requirements USING btree (team_id) WHERE (team_id IS NOT NULL);

CREATE UNIQUE INDEX training_requirements_group_unique ON public.training_requirements USING btree (training_type_id, team_id) WHERE (team_id IS NOT NULL);

CREATE INDEX training_requirements_position_id_idx ON public.training_requirements USING btree (position_id) WHERE (position_id IS NOT NULL);

CREATE UNIQUE INDEX training_requirements_position_unique ON public.training_requirements USING btree (training_type_id, position_id) WHERE (position_id IS NOT NULL);

CREATE INDEX training_requirements_role_id_idx ON public.training_requirements USING btree (role_id) WHERE (role_id IS NOT NULL);

CREATE UNIQUE INDEX training_requirements_role_unique ON public.training_requirements USING btree (training_type_id, role_id) WHERE (role_id IS NOT NULL);

CREATE INDEX training_requirements_user_id_idx ON public.training_requirements USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX training_requirements_user_unique ON public.training_requirements USING btree (training_type_id, user_id) WHERE (user_id IS NOT NULL);

ALTER TABLE ONLY public.training_exemptions
    ADD CONSTRAINT training_exemptions_pkey PRIMARY KEY (user_id, training_type_id);

CREATE INDEX training_exemptions_training_type_id_idx ON public.training_exemptions USING btree (training_type_id);

ALTER TABLE ONLY public.training_reminder_log
    ADD CONSTRAINT training_reminder_log_pkey PRIMARY KEY (id);

CREATE INDEX training_reminder_log_user_id_training_type_id_stage_sent_o_idx ON public.training_reminder_log USING btree (user_id, training_type_id, stage, sent_on DESC);

ALTER TABLE ONLY public.operating_instructions
    ADD CONSTRAINT operating_instructions_number_key UNIQUE (number);

ALTER TABLE ONLY public.operating_instructions
    ADD CONSTRAINT operating_instructions_pkey PRIMARY KEY (id);

CREATE INDEX operating_instructions_owner_user_id_idx ON public.operating_instructions USING btree (owner_user_id);

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_instruction_id_version_no_key UNIQUE (instruction_id, version_no);

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX operating_instruction_one_open ON public.operating_instruction_versions USING btree (instruction_id) WHERE (status = ANY (ARRAY['draft'::text, 'submitted'::text]));

CREATE UNIQUE INDEX operating_instruction_one_published ON public.operating_instruction_versions USING btree (instruction_id) WHERE (status = 'published'::text);

ALTER TABLE ONLY public.operating_instruction_texts
    ADD CONSTRAINT operating_instruction_texts_pkey PRIMARY KEY (version_id, language);

ALTER TABLE ONLY public.operating_instruction_assets
    ADD CONSTRAINT operating_instruction_assets_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX operating_instruction_assets_asset ON public.operating_instruction_assets USING btree (instruction_id, asset_id) WHERE (asset_id IS NOT NULL);

CREATE INDEX operating_instruction_assets_asset_id_idx ON public.operating_instruction_assets USING btree (asset_id) WHERE (asset_id IS NOT NULL);

CREATE INDEX operating_instruction_assets_asset_type_id_idx ON public.operating_instruction_assets USING btree (asset_type_id) WHERE (asset_type_id IS NOT NULL);

CREATE UNIQUE INDEX operating_instruction_assets_type ON public.operating_instruction_assets USING btree (instruction_id, asset_type_id) WHERE (asset_type_id IS NOT NULL);

ALTER TABLE ONLY public.operating_instruction_log
    ADD CONSTRAINT operating_instruction_log_pkey PRIMARY KEY (id);

CREATE INDEX operating_instruction_log_instruction_id_happened_at_idx ON public.operating_instruction_log USING btree (instruction_id, happened_at);

ALTER TABLE ONLY public.training_type_operating_instructions
    ADD CONSTRAINT training_type_operating_instructions_pkey PRIMARY KEY (training_type_id, instruction_id);

CREATE INDEX training_type_operating_instructions_instruction_id_idx ON public.training_type_operating_instructions USING btree (instruction_id);

ALTER TABLE ONLY public.training_record_operating_instructions
    ADD CONSTRAINT training_record_operating_instructions_pkey PRIMARY KEY (record_id, instruction_id);

CREATE INDEX training_record_operating_instructions_instruction_id_idx ON public.training_record_operating_instructions USING btree (instruction_id);

CREATE INDEX training_record_operating_instructions_version_id_idx ON public.training_record_operating_instructions USING btree (version_id);

ALTER TABLE ONLY public.person_private
    ADD CONSTRAINT person_private_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_teams
    ADD CONSTRAINT position_teams_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_teams
    ADD CONSTRAINT position_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.position_teams
    ADD CONSTRAINT position_teams_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_appointed_by_user_id_fkey FOREIGN KEY (appointed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_holders
    ADD CONSTRAINT position_holders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.position_assignment_log
    ADD CONSTRAINT position_assignment_log_by_user_id_fkey FOREIGN KEY (by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_assignment_log
    ADD CONSTRAINT position_assignment_log_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.position_assignment_log
    ADD CONSTRAINT position_assignment_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.requirement_phrases
    ADD CONSTRAINT requirement_phrases_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_description_versions
    ADD CONSTRAINT job_description_versions_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.job_description_requirements
    ADD CONSTRAINT job_description_requirements_phrase_id_fkey FOREIGN KEY (phrase_id) REFERENCES public.requirement_phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.job_description_requirements
    ADD CONSTRAINT job_description_requirements_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.job_description_versions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.position_fit_reviews
    ADD CONSTRAINT position_fit_reviews_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_fit_reviews
    ADD CONSTRAINT position_fit_reviews_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.position_fit_reviews
    ADD CONSTRAINT position_fit_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.position_fit_review_items
    ADD CONSTRAINT position_fit_review_items_phrase_id_fkey FOREIGN KEY (phrase_id) REFERENCES public.requirement_phrases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.position_fit_review_items
    ADD CONSTRAINT position_fit_review_items_review_id_fkey FOREIGN KEY (review_id) REFERENCES public.position_fit_reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_category_phrase_id_fkey FOREIGN KEY (category_phrase_id) REFERENCES public.phrases(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.training_types
    ADD CONSTRAINT training_types_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_session_types
    ADD CONSTRAINT training_session_types_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_session_types
    ADD CONSTRAINT training_session_types_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_confirmed_by_user_id_fkey FOREIGN KEY (confirmed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_sessions
    ADD CONSTRAINT training_sessions_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_session_participants
    ADD CONSTRAINT training_session_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_session_participants
    ADD CONSTRAINT training_session_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.training_records
    ADD CONSTRAINT training_records_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_records
    ADD CONSTRAINT training_records_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.training_records
    ADD CONSTRAINT training_records_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.training_records
    ADD CONSTRAINT training_records_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_records
    ADD CONSTRAINT training_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_requirements
    ADD CONSTRAINT training_requirements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_exemptions
    ADD CONSTRAINT training_exemptions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_exemptions
    ADD CONSTRAINT training_exemptions_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_exemptions
    ADD CONSTRAINT training_exemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_reminder_log
    ADD CONSTRAINT training_reminder_log_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_reminder_log
    ADD CONSTRAINT training_reminder_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instructions
    ADD CONSTRAINT operating_instructions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instructions
    ADD CONSTRAINT operating_instructions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instructions
    ADD CONSTRAINT operating_instructions_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES public.operating_instructions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_versions
    ADD CONSTRAINT operating_instruction_versions_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_texts
    ADD CONSTRAINT operating_instruction_texts_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_texts
    ADD CONSTRAINT operating_instruction_texts_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.operating_instruction_versions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instruction_assets
    ADD CONSTRAINT operating_instruction_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instruction_assets
    ADD CONSTRAINT operating_instruction_assets_asset_type_id_fkey FOREIGN KEY (asset_type_id) REFERENCES public.asset_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instruction_assets
    ADD CONSTRAINT operating_instruction_assets_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_assets
    ADD CONSTRAINT operating_instruction_assets_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES public.operating_instructions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instruction_log
    ADD CONSTRAINT operating_instruction_log_by_user_id_fkey FOREIGN KEY (by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.operating_instruction_log
    ADD CONSTRAINT operating_instruction_log_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES public.operating_instructions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.operating_instruction_log
    ADD CONSTRAINT operating_instruction_log_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.operating_instruction_versions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_type_operating_instructions
    ADD CONSTRAINT training_type_operating_instructions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.training_type_operating_instructions
    ADD CONSTRAINT training_type_operating_instructions_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES public.operating_instructions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_type_operating_instructions
    ADD CONSTRAINT training_type_operating_instructions_training_type_id_fkey FOREIGN KEY (training_type_id) REFERENCES public.training_types(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_record_operating_instructions
    ADD CONSTRAINT training_record_operating_instructions_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES public.operating_instructions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_record_operating_instructions
    ADD CONSTRAINT training_record_operating_instructions_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.training_records(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.training_record_operating_instructions
    ADD CONSTRAINT training_record_operating_instructions_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.operating_instruction_versions(id) ON DELETE RESTRICT;

CREATE FUNCTION public.job_description_access(p_viewer uuid, p_position uuid, p_status text, p_author uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_held text[];
begin
  if p_viewer is null or p_action not in ('view', 'edit') then
    return false;
  end if;
  v_held := public.user_permissions(p_viewer);
  if ('job_descriptions.' || p_action || '.all') = any (v_held) then
    return true;
  end if;
  if ('job_descriptions.' || p_action || '.team') = any (v_held) and public.position_team_access(p_viewer, p_position) then
    return true;
  end if;
  if p_action = 'view' then
    if p_author = p_viewer then
      return true;
    end if;
    return p_status in ('published', 'archived') and 'job_descriptions.view.own' = any (v_held)
      and public.position_holder_or_supervisor(p_viewer, p_position);
  end if;
  return false;
end;
$$;


ALTER FUNCTION public.job_description_access(p_viewer uuid, p_position uuid, p_status text, p_author uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_access(p_viewer uuid, p_position uuid, p_status text, p_author uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_access(p_viewer uuid, p_position uuid, p_status text, p_author uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_access(p_viewer uuid, p_position uuid, p_status text, p_author uuid, p_action text) TO service_role;

CREATE FUNCTION public.job_description_access_for_me(p_position uuid, p_status text, p_author uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.job_description_access(auth.uid(), p_position, p_status, p_author, p_action) $$;


ALTER FUNCTION public.job_description_access_for_me(p_position uuid, p_status text, p_author uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_access_for_me(p_position uuid, p_status text, p_author uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_access_for_me(p_position uuid, p_status text, p_author uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_access_for_me(p_position uuid, p_status text, p_author uuid, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.job_description_access_for_me(p_position uuid, p_status text, p_author uuid, p_action text) TO authenticated;

CREATE FUNCTION public.job_description_approvers() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(u.id), '{}') from public.users u
  where u.has_login and not u.has_left
    and 'job_descriptions.edit.all' = any (public.user_permissions(u.id));
$$;


ALTER FUNCTION public.job_description_approvers() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_approvers() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_approvers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_approvers() TO service_role;

CREATE FUNCTION public.job_description_new_draft(p_position uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_src public.job_description_versions;
  v_id uuid;
begin
  if not public.job_description_access(auth.uid(), p_position, 'draft', auth.uid(), 'edit') then
    raise exception 'No permission to write a job description for this position' using errcode = '42501';
  end if;
  if exists (select 1 from public.job_description_versions where position_id = p_position and status in ('draft', 'submitted')) then
    raise exception 'There is already an open draft for this position' using errcode = '23505';
  end if;
  select * into v_src from public.job_description_versions
    where position_id = p_position order by (status = 'published') desc, version_no desc limit 1;
  perform set_config('app.job_description_rpc', 'on', true);
  insert into public.job_description_versions (position_id, version_no, status, purpose, duties, authority, working_conditions)
  values (p_position, coalesce(v_src.version_no, 0) + 1, 'draft', coalesce(v_src.purpose, ''), coalesce(v_src.duties, ''),
          coalesce(v_src.authority, ''), coalesce(v_src.working_conditions, ''))
  returning id into v_id;
  perform set_config('app.job_description_rpc', 'off', true);
  if v_src.id is not null then
    insert into public.job_description_requirements (version_id, phrase_id, sort_order)
    select v_id, r.phrase_id, r.sort_order from public.job_description_requirements r where r.version_id = v_src.id;
  end if;
  return v_id;
end;
$$;


ALTER FUNCTION public.job_description_new_draft(p_position uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_new_draft(p_position uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_new_draft(p_position uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_new_draft(p_position uuid) TO service_role;
GRANT ALL ON FUNCTION public.job_description_new_draft(p_position uuid) TO authenticated;

CREATE FUNCTION public.job_description_publish(p_version uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.job_description_versions;
  v_name text;
begin
  select * into v from public.job_description_versions where id = p_version;
  if v.id is null or not ('job_descriptions.edit.all' = any (public.user_permissions(auth.uid()))) then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status not in ('draft', 'submitted') then
    raise exception 'Only a draft or submitted version can be published' using errcode = '22023';
  end if;
  if length(btrim(regexp_replace(v.purpose, '<[^>]*>', '', 'g'))) = 0 or length(btrim(regexp_replace(v.duties, '<[^>]*>', '', 'g'))) = 0 then
    raise exception 'Purpose and duties must be filled in' using errcode = '22023';
  end if;
  perform set_config('app.job_description_rpc', 'on', true);
  update public.job_description_versions set status = 'archived' where position_id = v.position_id and status = 'published';
  update public.job_description_versions
    set status = 'published', approved_by_user_id = auth.uid(), approved_at = now(),
        valid_from = coalesce(valid_from, current_date)
    where id = p_version;
  perform set_config('app.job_description_rpc', 'off', true);
  select name into v_name from public.positions where id = v.position_id;
  if v.created_by_user_id is not null and v.created_by_user_id <> auth.uid() then
    perform public.notify(
      array[v.created_by_user_id], 'job_description_published', v_name, '/positions/' || v.position_id, null,
      auth.uid(), 'job_description_versions', v.id, 'job-description:' || v.position_id, array['in_app'],
      jsonb_build_object('position', v_name, 'version', v.version_no));
  end if;
end;
$$;


ALTER FUNCTION public.job_description_publish(p_version uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_publish(p_version uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_publish(p_version uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_publish(p_version uuid) TO service_role;
GRANT ALL ON FUNCTION public.job_description_publish(p_version uuid) TO authenticated;

CREATE FUNCTION public.job_description_requirement_add(p_version uuid, p_texts text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.job_description_versions;
  t text;
  v_phrase uuid;
  v_added integer := 0;
  v_order integer;
begin
  select * into v from public.job_description_versions where id = p_version;
  if v.id is null or v.status <> 'draft'
     or not public.job_description_access(auth.uid(), v.position_id, v.status, v.created_by_user_id, 'edit') then
    raise exception 'No permission or not a draft' using errcode = '42501';
  end if;
  select coalesce(max(sort_order), 0) into v_order from public.job_description_requirements where version_id = p_version;
  foreach t in array coalesce(p_texts, '{}') loop
    t := btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g'));
    continue when t = '';
    if length(t) > 300 then
      raise exception 'A requirement may have at most 300 characters' using errcode = '22023';
    end if;
    select id into v_phrase from public.requirement_phrases where lower(text) = lower(t);
    if v_phrase is null then
      insert into public.requirement_phrases (text) values (t) returning id into v_phrase;
    end if;
    v_order := v_order + 1;
    insert into public.job_description_requirements (version_id, phrase_id, sort_order) values (p_version, v_phrase, v_order)
      on conflict (version_id, phrase_id) do nothing;
    if found then v_added := v_added + 1; end if;
  end loop;
  return v_added;
end;
$$;


ALTER FUNCTION public.job_description_requirement_add(p_version uuid, p_texts text[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_requirement_add(p_version uuid, p_texts text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_requirement_add(p_version uuid, p_texts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_requirement_add(p_version uuid, p_texts text[]) TO service_role;
GRANT ALL ON FUNCTION public.job_description_requirement_add(p_version uuid, p_texts text[]) TO authenticated;

CREATE FUNCTION public.job_description_requirement_remove(p_item uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.job_description_versions;
begin
  select dv.* into v from public.job_description_requirements r
    join public.job_description_versions dv on dv.id = r.version_id where r.id = p_item;
  if v.id is null or v.status <> 'draft'
     or not public.job_description_access(auth.uid(), v.position_id, v.status, v.created_by_user_id, 'edit') then
    raise exception 'No permission or not a draft' using errcode = '42501';
  end if;
  delete from public.job_description_requirements where id = p_item;
end;
$$;


ALTER FUNCTION public.job_description_requirement_remove(p_item uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_requirement_remove(p_item uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_requirement_remove(p_item uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_requirement_remove(p_item uuid) TO service_role;
GRANT ALL ON FUNCTION public.job_description_requirement_remove(p_item uuid) TO authenticated;

CREATE FUNCTION public.job_description_return(p_version uuid, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.job_description_versions;
  v_name text;
begin
  select * into v from public.job_description_versions where id = p_version;
  if v.id is null or not ('job_descriptions.edit.all' = any (public.user_permissions(auth.uid()))) then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status <> 'submitted' then
    raise exception 'Only a submitted version can be returned' using errcode = '22023';
  end if;
  perform set_config('app.job_description_rpc', 'on', true);
  update public.job_description_versions
    set status = 'draft', returned_note = nullif(btrim(p_note), ''), submitted_by_user_id = null, submitted_at = null
    where id = p_version;
  perform set_config('app.job_description_rpc', 'off', true);
  select name into v_name from public.positions where id = v.position_id;
  if v.submitted_by_user_id is not null and v.submitted_by_user_id <> auth.uid() then
    perform public.notify(
      array[v.submitted_by_user_id], 'job_description_returned', v_name, '/positions/' || v.position_id, nullif(btrim(p_note), ''),
      auth.uid(), 'job_description_versions', v.id, 'job-description:' || v.position_id, array['in_app'],
      jsonb_build_object('position', v_name, 'version', v.version_no));
  end if;
end;
$$;


ALTER FUNCTION public.job_description_return(p_version uuid, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_return(p_version uuid, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_return(p_version uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_return(p_version uuid, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.job_description_return(p_version uuid, p_note text) TO authenticated;

CREATE FUNCTION public.job_description_submit(p_version uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.job_description_versions;
  v_name text;
begin
  select * into v from public.job_description_versions where id = p_version;
  if v.id is null or not public.job_description_access(auth.uid(), v.position_id, v.status, v.created_by_user_id, 'edit') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023';
  end if;
  if length(btrim(regexp_replace(v.purpose, '<[^>]*>', '', 'g'))) = 0 or length(btrim(regexp_replace(v.duties, '<[^>]*>', '', 'g'))) = 0 then
    raise exception 'Purpose and duties must be filled in' using errcode = '22023';
  end if;
  perform set_config('app.job_description_rpc', 'on', true);
  update public.job_description_versions
    set status = 'submitted', submitted_by_user_id = auth.uid(), submitted_at = now(), returned_note = null
    where id = p_version;
  perform set_config('app.job_description_rpc', 'off', true);
  select name into v_name from public.positions where id = v.position_id;
  perform public.notify(
    array(select a from unnest(public.job_description_approvers()) a where a <> auth.uid()),
    'job_description_submitted', v_name, '/positions/' || v.position_id, null, auth.uid(),
    'job_description_versions', v.id, 'job-description:' || v.position_id, array['in_app'],
    jsonb_build_object('position', v_name, 'version', v.version_no));
end;
$$;


ALTER FUNCTION public.job_description_submit(p_version uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_submit(p_version uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_submit(p_version uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_submit(p_version uuid) TO service_role;
GRANT ALL ON FUNCTION public.job_description_submit(p_version uuid) TO authenticated;

CREATE FUNCTION public.job_description_versions_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if current_setting('app.job_description_rpc', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Create a draft with job_description_new_draft()' using errcode = '42501';
  end if;
  if old.status <> 'draft' then
    raise exception 'Only a draft can be edited' using errcode = '42501';
  end if;
  if new.status is distinct from old.status or new.version_no is distinct from old.version_no
     or new.position_id is distinct from old.position_id
     or new.submitted_by_user_id is distinct from old.submitted_by_user_id or new.submitted_at is distinct from old.submitted_at
     or new.approved_by_user_id is distinct from old.approved_by_user_id or new.approved_at is distinct from old.approved_at
     or new.returned_note is distinct from old.returned_note then
    raise exception 'Use the job description functions to change the status' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.job_description_versions_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.job_description_versions_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.job_description_versions_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_description_versions_guard() TO service_role;

CREATE FUNCTION public.operating_instruction_approvers() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(array_agg(u.id), '{}') from public.users u
  where u.has_login and not u.has_left and 'operating_instructions.approve' = any (public.user_permissions(u.id));
$$;


ALTER FUNCTION public.operating_instruction_approvers() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_approvers() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_approvers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_approvers() TO service_role;

CREATE FUNCTION public.operating_instruction_baselines() RETURNS TABLE(instruction_id uuid, baseline_no integer, current_version_id uuid, current_no integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select i.id,
         coalesce(max(v.version_no) filter (where v.requires_reinstruction), min(v.version_no)),
         (array_agg(v.id order by v.version_no desc))[1],
         max(v.version_no)
  from public.operating_instructions i
  join public.operating_instruction_versions v on v.instruction_id = i.id and v.status in ('published', 'archived')
  where i.active
  group by i.id
  having bool_or(v.status = 'published');
$$;


ALTER FUNCTION public.operating_instruction_baselines() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_baselines() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_baselines() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_baselines() TO service_role;

CREATE FUNCTION public.operating_instruction_classify(p_version uuid, p_requires_reinstruction boolean, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.operating_instruction_versions;
begin
  select * into v from public.operating_instruction_versions where id = p_version;
  if v.id is null or not public.rls_has('operating_instructions.approve') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status not in ('published', 'archived') then
    raise exception 'Only a published or archived version can be classified; a draft has its own switch' using errcode = '22023';
  end if;
  if v.requires_reinstruction = p_requires_reinstruction then
    return;
  end if;
  perform set_config('app.operating_instruction_rpc', 'on', true);
  update public.operating_instruction_versions set requires_reinstruction = p_requires_reinstruction where id = p_version;
  perform set_config('app.operating_instruction_rpc', 'off', true);
  insert into public.operating_instruction_log (instruction_id, version_id, action, note)
  values (v.instruction_id, v.id, 'classified',
          case when p_requires_reinstruction then 'reinstruction' else 'editorial' end || coalesce(': ' || nullif(btrim(p_note), ''), ''));
end;
$$;


ALTER FUNCTION public.operating_instruction_classify(p_version uuid, p_requires_reinstruction boolean, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_classify(p_version uuid, p_requires_reinstruction boolean, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_classify(p_version uuid, p_requires_reinstruction boolean, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_classify(p_version uuid, p_requires_reinstruction boolean, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_classify(p_version uuid, p_requires_reinstruction boolean, p_note text) TO authenticated;

CREATE FUNCTION public.operating_instruction_complete(p_version uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.operating_instruction_texts t
    where t.version_id = p_version and t.language = 'de' and length(btrim(t.title)) > 0
      and exists (select 1 from jsonb_each_text(t.sections) s
                  where length(btrim(regexp_replace(s.value, '<[^>]*>', '', 'g'))) > 0)
  );
$$;


ALTER FUNCTION public.operating_instruction_complete(p_version uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_complete(p_version uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_complete(p_version uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_complete(p_version uuid) TO service_role;

CREATE FUNCTION public.operating_instruction_create(p_kind text, p_title text, p_owner uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
  v_version uuid;
begin
  if not public.rls_has('operating_instructions.edit.all') then
    raise exception 'No permission to create operating instructions' using errcode = '42501';
  end if;
  if p_kind not in ('substance', 'machine') then
    raise exception 'Unknown kind %', p_kind using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'A title is required' using errcode = '22023';
  end if;
  insert into public.operating_instructions (kind, owner_user_id) values (p_kind, coalesce(p_owner, auth.uid())) returning id into v_id;
  perform set_config('app.operating_instruction_rpc', 'on', true);
  insert into public.operating_instruction_versions (instruction_id, version_no, status) values (v_id, 1, 'draft') returning id into v_version;
  insert into public.operating_instruction_texts (version_id, language, title) values (v_version, 'de', btrim(p_title));
  perform set_config('app.operating_instruction_rpc', 'off', true);
  return v_id;
end;
$$;


ALTER FUNCTION public.operating_instruction_create(p_kind text, p_title text, p_owner uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_create(p_kind text, p_title text, p_owner uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_create(p_kind text, p_title text, p_owner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_create(p_kind text, p_title text, p_owner uuid) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_create(p_kind text, p_title text, p_owner uuid) TO authenticated;

CREATE FUNCTION public.operating_instruction_editable(p_instruction uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select public.rls_has('operating_instructions.edit.all')
    or (public.rls_has('operating_instructions.edit.own')
        and exists (select 1 from public.operating_instructions i where i.id = p_instruction and i.owner_user_id = auth.uid()));
$$;


ALTER FUNCTION public.operating_instruction_editable(p_instruction uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_editable(p_instruction uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_editable(p_instruction uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_editable(p_instruction uuid) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_editable(p_instruction uuid) TO authenticated;

CREATE FUNCTION public.operating_instruction_import(p_items jsonb, p_apply boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
declare
  v_results jsonb := '[]'::jsonb;
  v_item jsonb;
  v_result jsonb;
  v_id uuid;
  v_number integer;
  v_kind text;
  v_open public.operating_instruction_versions;
  v_pub public.operating_instruction_versions;
  v_target uuid;
  v_mode text;
  v_content boolean;
  v_translations boolean;
  v_links boolean;
  v_lang text;
  v_text jsonb;
  v_ids uuid[];
  v_name text;
  v_count integer;
  v_asset uuid;
  v_seen uuid[] := '{}';
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'At most 500 operating instructions per import' using errcode = '22023';
  end if;

  begin
    for v_item in select * from jsonb_array_elements(p_items) loop
      begin
        v_id := nullif(v_item->>'instruction_id', '')::uuid;
        v_number := null;
        v_target := null;
        v_mode := 'unchanged';
        v_links := false;
        v_open := null;
        v_pub := null;

        if v_id is null then
          -- A new instruction: German title and kind are needed.
          v_kind := v_item->>'kind';
          if v_kind is null or v_kind not in ('substance', 'machine') then
            raise exception 'A new operating instruction needs the kind substance or machine' using errcode = '22023';
          end if;
          if length(btrim(coalesce(v_item#>>'{texts,de,title}', ''))) = 0 then
            raise exception 'A new operating instruction needs a German row with a title' using errcode = '22023';
          end if;
          if not public.rls_has('operating_instructions.edit.all') then
            raise exception 'No permission to create operating instructions' using errcode = '42501';
          end if;
          v_mode := 'created';
          if p_apply then
            v_id := public.operating_instruction_create(v_kind, v_item#>>'{texts,de,title}');
            select number into v_number from public.operating_instructions where id = v_id;
            select * into v_open from public.operating_instruction_versions where instruction_id = v_id and status = 'draft';
            v_target := v_open.id;
          end if;
        else
          if v_id = any (v_seen) then
            raise exception 'This operating instruction appears more than once in the file' using errcode = '22023';
          end if;
          v_seen := v_seen || v_id;
          select number, kind into v_number, v_kind from public.operating_instructions where id = v_id;
          if not found then
            raise exception 'Unknown operating instruction' using errcode = 'P0002';
          end if;
          if v_item ? 'kind' and v_item->>'kind' is distinct from v_kind then
            raise exception 'The kind of an operating instruction cannot be changed' using errcode = '22023';
          end if;
          select * into v_open from public.operating_instruction_versions where instruction_id = v_id and status in ('draft', 'submitted');
          select * into v_pub from public.operating_instruction_versions where instruction_id = v_id and status = 'published';
          if nullif(v_item->>'base_version_id', '')::uuid is distinct from coalesce(v_open.id, v_pub.id) then
            raise exception 'The operating instruction changed after the export; export it again' using errcode = '40001';
          end if;

          -- A changed note belongs to a version: without an open draft it starts one.
          v_content := v_item ? 'signs' or v_item ? 'signal_word' or v_item ? 'change_note' or coalesce(v_item->'texts' ? 'de', false);
          v_translations := exists (select 1 from jsonb_object_keys(coalesce(v_item->'texts', '{}'::jsonb)) k where k <> 'de');
          if v_content or v_translations then
            if v_open.status = 'submitted' then
              raise exception 'Version % is waiting for approval; return it before importing', v_open.version_no using errcode = '42501';
            elsif v_open.id is not null then
              v_target := v_open.id;
              v_mode := 'updated';
            elsif not v_content and public.rls_has('operating_instructions.approve') then
              -- Only translations: they go onto the published version (the text guard logs them).
              v_target := v_pub.id;
              v_mode := 'translation';
            else
              v_target := public.operating_instruction_new_draft(v_id);
              v_mode := 'new_draft';
            end if;
          end if;
        end if;

        -- The old number (also of a new instruction; in the preview a new one has no row yet).
        if v_item ? 'legacy_number' and v_id is not null then
          update public.operating_instructions set legacy_number = nullif(btrim(v_item->>'legacy_number'), '')
          where id = v_id and legacy_number is distinct from nullif(btrim(v_item->>'legacy_number'), '');
          get diagnostics v_count = row_count;
          if v_count = 0 and exists (select 1 from public.operating_instructions where id = v_id
                                     and legacy_number is distinct from nullif(btrim(v_item->>'legacy_number'), '')) then
            raise exception 'No permission to change the old number' using errcode = '42501';
          end if;
          if v_count > 0 then
            v_links := true;
          end if;
        end if;

        -- The version: signal word, pictograms and note only on a draft.
        if v_target is not null and v_mode <> 'translation' then
          update public.operating_instruction_versions set
            signal_word = case when v_kind = 'machine' then null
                               when v_item ? 'signal_word' then nullif(v_item->>'signal_word', '') else signal_word end,
            signs = case when v_item ? 'signs' then v_item->'signs' else signs end,
            change_note = case when v_item ? 'change_note' then nullif(btrim(v_item->>'change_note'), '') else change_note end
          where id = v_target;
          if not found then
            raise exception 'No permission to write this operating instruction' using errcode = '42501';
          end if;
        end if;
        if v_target is not null then
          for v_lang, v_text in select * from jsonb_each(coalesce(v_item->'texts', '{}'::jsonb)) loop
            if v_lang !~ '^[a-z]{2}$' then
              raise exception 'Unknown language %', v_lang using errcode = '22023';
            end if;
            continue when v_mode = 'translation' and v_lang = 'de';
            insert into public.operating_instruction_texts (version_id, language, title, work_area, subject, sections)
            values (v_target, v_lang, btrim(coalesce(v_text->>'title', '')), btrim(coalesce(v_text->>'work_area', '')),
                    btrim(coalesce(v_text->>'subject', '')), coalesce(v_text->'sections', '{}'::jsonb))
            on conflict (version_id, language) do update set title = excluded.title, work_area = excluded.work_area,
              subject = excluded.subject, sections = excluded.sections;
          end loop;
        end if;

        -- Where it applies and which trainings teach it: a list given replaces the links (the policies decide).
        if v_item ? 'assets' then
          v_ids := '{}';
          -- A name, or the end of its path ("Line 2 / Pump", up to the whole path): it must name one asset.
          for v_name in select regexp_replace(btrim(x), '\s+/\s+', ' / ', 'g') from jsonb_array_elements_text(v_item->'assets') x where btrim(x) <> '' loop
            select count(*), min(m.id::text)::uuid into v_count, v_asset from (
              select a.id from public.assets a
              where lower(a.name) = lower(regexp_replace(v_name, '^.* / ', ''))
                and right(lower(' / ' || (select string_agg(p.name, ' / ' order by public.nlevel(p.path))
                                          from public.assets p where p.path operator(public.@>) a.path)),
                          length(' / ' || v_name)) = lower(' / ' || v_name)) m;
            if v_count = 0 then
              raise exception 'Unknown asset: %', v_name using errcode = 'P0002';
            elsif v_count > 1 then
              raise exception 'Several assets are called %; write the path, e.g. Line 2 / %', v_name, v_name using errcode = '22023';
            end if;
            v_ids := v_ids || v_asset;
          end loop;
          if v_id is not null then
            delete from public.operating_instruction_assets where instruction_id = v_id and asset_id is not null and not (asset_id = any (v_ids));
            get diagnostics v_count = row_count;
            v_links := v_links or v_count > 0;
            insert into public.operating_instruction_assets (instruction_id, asset_id)
            select v_id, x from unnest(v_ids) x
            where not exists (select 1 from public.operating_instruction_assets l where l.instruction_id = v_id and l.asset_id = x);
            get diagnostics v_count = row_count;
            v_links := v_links or v_count > 0;
          end if;
        end if;
        if v_item ? 'asset_types' then
          v_ids := '{}';
          for v_name in select btrim(x) from jsonb_array_elements_text(v_item->'asset_types') x where btrim(x) <> '' loop
            select array_agg(distinct t.id) into v_ids from (
              select unnest(v_ids) as id
              union select t.id from public.asset_types t where lower(t.name) = lower(v_name) or lower(t.name_de) = lower(v_name)) t;
            if not exists (select 1 from public.asset_types t where lower(t.name) = lower(v_name) or lower(t.name_de) = lower(v_name)) then
              raise exception 'Unknown asset type: %', v_name using errcode = 'P0002';
            end if;
          end loop;
          if v_id is not null then
            delete from public.operating_instruction_assets where instruction_id = v_id and asset_type_id is not null and not (asset_type_id = any (v_ids));
            get diagnostics v_count = row_count;
            v_links := v_links or v_count > 0;
            insert into public.operating_instruction_assets (instruction_id, asset_type_id)
            select v_id, x from unnest(v_ids) x
            where not exists (select 1 from public.operating_instruction_assets l where l.instruction_id = v_id and l.asset_type_id = x);
            get diagnostics v_count = row_count;
            v_links := v_links or v_count > 0;
          end if;
        end if;
        if v_item ? 'training_types' then
          v_ids := '{}';
          for v_name in select btrim(x) from jsonb_array_elements_text(v_item->'training_types') x where btrim(x) <> '' loop
            select array_agg(distinct t.id) into v_ids from (
              select unnest(v_ids) as id
              union select t.id from public.training_types t where lower(t.name) = lower(v_name)) t;
            if not exists (select 1 from public.training_types t where lower(t.name) = lower(v_name)) then
              raise exception 'Unknown training: %', v_name using errcode = 'P0002';
            end if;
          end loop;
          if v_id is not null then
            delete from public.training_type_operating_instructions where instruction_id = v_id and not (training_type_id = any (v_ids));
            get diagnostics v_count = row_count;
            v_links := v_links or v_count > 0;
            insert into public.training_type_operating_instructions (training_type_id, instruction_id, sort_order)
            select x, v_id, coalesce((select max(o.sort_order) + 1 from public.training_type_operating_instructions o where o.training_type_id = x), 0)
            from unnest(v_ids) x
            where not exists (select 1 from public.training_type_operating_instructions l where l.instruction_id = v_id and l.training_type_id = x);
            get diagnostics v_count = row_count;
            v_links := v_links or v_count > 0;
          end if;
        end if;

        if v_mode = 'unchanged' and v_links then
          v_mode := 'updated';
        end if;
        v_result := jsonb_build_object('result', v_mode, 'number', v_number);
      exception when others then
        v_result := jsonb_build_object('result', 'error', 'number', v_number, 'message', sqlerrm);
      end;
      v_results := v_results || jsonb_build_array(jsonb_build_object('row', v_item->'row') || v_result);
    end loop;
    if not p_apply then
      raise exception 'preview' using errcode = 'P0D01';
    end if;
  exception when sqlstate 'P0D01' then
    null; -- the preview: every write above is rolled back, the results stay
  end;
  return v_results;
end;
$_$;


ALTER FUNCTION public.operating_instruction_import(p_items jsonb, p_apply boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_import(p_items jsonb, p_apply boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_import(p_items jsonb, p_apply boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_import(p_items jsonb, p_apply boolean) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_import(p_items jsonb, p_apply boolean) TO authenticated;

CREATE FUNCTION public.operating_instruction_label(p_version uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select 'BA-' || lpad(i.number::text, 4, '0') || coalesce(' ' || nullif(t.title, ''), '')
  from public.operating_instruction_versions v
  join public.operating_instructions i on i.id = v.instruction_id
  left join public.operating_instruction_texts t on t.version_id = v.id and t.language = 'de'
  where v.id = p_version;
$$;


ALTER FUNCTION public.operating_instruction_label(p_version uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_label(p_version uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_label(p_version uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_label(p_version uuid) TO service_role;

CREATE FUNCTION public.operating_instruction_new_draft(p_instruction uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_src public.operating_instruction_versions;
  v_id uuid;
begin
  if not public.operating_instruction_editable(p_instruction) then
    raise exception 'No permission to write this operating instruction' using errcode = '42501';
  end if;
  if exists (select 1 from public.operating_instruction_versions where instruction_id = p_instruction and status in ('draft', 'submitted')) then
    raise exception 'There is already an open draft for this operating instruction' using errcode = '23505';
  end if;
  select * into v_src from public.operating_instruction_versions
    where instruction_id = p_instruction order by (status = 'published') desc, version_no desc limit 1;
  perform set_config('app.operating_instruction_rpc', 'on', true);
  insert into public.operating_instruction_versions (instruction_id, version_no, status, signal_word, signs)
  values (p_instruction, coalesce(v_src.version_no, 0) + 1, 'draft', v_src.signal_word, coalesce(v_src.signs, '{}'::jsonb))
  returning id into v_id;
  insert into public.operating_instruction_texts (version_id, language, title, work_area, subject, sections)
  select v_id, t.language, t.title, t.work_area, t.subject, t.sections
  from public.operating_instruction_texts t where t.version_id = v_src.id;
  if not exists (select 1 from public.operating_instruction_texts where version_id = v_id and language = 'de') then
    insert into public.operating_instruction_texts (version_id, language) values (v_id, 'de');
  end if;
  perform set_config('app.operating_instruction_rpc', 'off', true);
  return v_id;
end;
$$;


ALTER FUNCTION public.operating_instruction_new_draft(p_instruction uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_new_draft(p_instruction uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_new_draft(p_instruction uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_new_draft(p_instruction uuid) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_new_draft(p_instruction uuid) TO authenticated;

CREATE FUNCTION public.operating_instruction_publish(p_version uuid, p_requires_reinstruction boolean DEFAULT NULL::boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.operating_instruction_versions;
  v_label text := public.operating_instruction_label(p_version);
  v_from date;
begin
  select * into v from public.operating_instruction_versions where id = p_version;
  if v.id is null or not public.rls_has('operating_instructions.approve') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status not in ('draft', 'submitted') then
    raise exception 'Only a draft or submitted version can be published' using errcode = '22023';
  end if;
  if not public.operating_instruction_complete(p_version) then
    raise exception 'The German title and at least one section must be filled in' using errcode = '22023';
  end if;
  v_from := coalesce(v.valid_from, current_date);
  perform set_config('app.operating_instruction_rpc', 'on', true);
  update public.operating_instruction_versions set status = 'archived' where instruction_id = v.instruction_id and status = 'published';
  update public.operating_instruction_versions
    set status = 'published', approved_by_user_id = auth.uid(), approved_at = now(), valid_from = v_from,
        requires_reinstruction = coalesce(p_requires_reinstruction, requires_reinstruction)
    where id = p_version;
  update public.operating_instruction_texts set needs_check = false where version_id = p_version;
  update public.operating_instructions set review_due_on = (v_from + interval '1 year')::date where id = v.instruction_id;
  perform set_config('app.operating_instruction_rpc', 'off', true);
  insert into public.operating_instruction_log (instruction_id, version_id, action) values (v.instruction_id, v.id, 'published');
  if v.created_by_user_id is not null and v.created_by_user_id <> auth.uid() then
    perform public.notify(
      array[v.created_by_user_id], 'operating_instruction_published', v_label, '/operating-instructions/' || v.instruction_id, null,
      auth.uid(), 'operating_instruction_versions', v.id, 'operating-instruction:' || v.instruction_id, array['in_app'],
      jsonb_build_object('instruction', v_label, 'version', v.version_no));
  end if;
end;
$$;


ALTER FUNCTION public.operating_instruction_publish(p_version uuid, p_requires_reinstruction boolean) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_publish(p_version uuid, p_requires_reinstruction boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_publish(p_version uuid, p_requires_reinstruction boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_publish(p_version uuid, p_requires_reinstruction boolean) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_publish(p_version uuid, p_requires_reinstruction boolean) TO authenticated;

CREATE FUNCTION public.operating_instruction_return(p_version uuid, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.operating_instruction_versions;
  v_label text := public.operating_instruction_label(p_version);
begin
  select * into v from public.operating_instruction_versions where id = p_version;
  if v.id is null or not public.rls_has('operating_instructions.approve') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status <> 'submitted' then
    raise exception 'Only a submitted version can be returned' using errcode = '22023';
  end if;
  perform set_config('app.operating_instruction_rpc', 'on', true);
  update public.operating_instruction_versions
    set status = 'draft', returned_note = nullif(btrim(p_note), ''), submitted_by_user_id = null, submitted_at = null
    where id = p_version;
  perform set_config('app.operating_instruction_rpc', 'off', true);
  insert into public.operating_instruction_log (instruction_id, version_id, action, note)
  values (v.instruction_id, v.id, 'returned', nullif(btrim(p_note), ''));
  if v.submitted_by_user_id is not null and v.submitted_by_user_id <> auth.uid() then
    perform public.notify(
      array[v.submitted_by_user_id], 'operating_instruction_returned', v_label, '/operating-instructions/' || v.instruction_id,
      nullif(btrim(p_note), ''), auth.uid(), 'operating_instruction_versions', v.id, 'operating-instruction:' || v.instruction_id,
      array['in_app'], jsonb_build_object('instruction', v_label, 'version', v.version_no));
  end if;
end;
$$;


ALTER FUNCTION public.operating_instruction_return(p_version uuid, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_return(p_version uuid, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_return(p_version uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_return(p_version uuid, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_return(p_version uuid, p_note text) TO authenticated;

CREATE FUNCTION public.operating_instruction_reviewed(p_instruction uuid, p_next date DEFAULT NULL::date, p_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.rls_has('operating_instructions.approve') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if not exists (select 1 from public.operating_instruction_versions where instruction_id = p_instruction and status = 'published') then
    raise exception 'Only a published operating instruction can be reviewed' using errcode = '22023';
  end if;
  if p_next is not null and p_next <= current_date then
    raise exception 'The next review must lie in the future' using errcode = '22023';
  end if;
  perform set_config('app.operating_instruction_rpc', 'on', true);
  update public.operating_instructions set review_due_on = coalesce(p_next, (current_date + interval '1 year')::date) where id = p_instruction;
  perform set_config('app.operating_instruction_rpc', 'off', true);
  insert into public.operating_instruction_log (instruction_id, version_id, action, note)
  select p_instruction, v.id, 'reviewed', nullif(btrim(p_note), '')
  from public.operating_instruction_versions v where v.instruction_id = p_instruction and v.status = 'published';
end;
$$;


ALTER FUNCTION public.operating_instruction_reviewed(p_instruction uuid, p_next date, p_note text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_reviewed(p_instruction uuid, p_next date, p_note text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_reviewed(p_instruction uuid, p_next date, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_reviewed(p_instruction uuid, p_next date, p_note text) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_reviewed(p_instruction uuid, p_next date, p_note text) TO authenticated;

CREATE FUNCTION public.operating_instruction_status_for_me() RETURNS TABLE(user_id uuid, instruction_id uuid, training_type_id uuid, required boolean, status text, record_id uuid, completed_on date, taught_version_no integer, baseline_no integer, current_no integer, covered boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.user_id, k.instruction_id, s.training_type_id, s.required, s.status, s.record_id, s.completed_on,
         tv.version_no, b.baseline_no, b.current_no, coalesce(tv.version_no >= b.baseline_no, false)
  from public.training_status_for_me() s
  join public.training_type_operating_instructions k on k.training_type_id = s.training_type_id
  join public.operating_instruction_baselines() b on b.instruction_id = k.instruction_id
  left join public.training_record_operating_instructions t on t.record_id = s.record_id and t.instruction_id = k.instruction_id
  left join public.operating_instruction_versions tv on tv.id = t.version_id;
$$;


ALTER FUNCTION public.operating_instruction_status_for_me() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_status_for_me() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_status_for_me() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_status_for_me() TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_status_for_me() TO authenticated;

CREATE FUNCTION public.operating_instruction_submit(p_version uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v public.operating_instruction_versions;
  v_label text := public.operating_instruction_label(p_version);
begin
  select * into v from public.operating_instruction_versions where id = p_version;
  if v.id is null or not public.operating_instruction_editable(v.instruction_id) then
    raise exception 'No permission' using errcode = '42501';
  end if;
  if v.status <> 'draft' then
    raise exception 'Only a draft can be submitted' using errcode = '22023';
  end if;
  if not public.operating_instruction_complete(p_version) then
    raise exception 'The German title and at least one section must be filled in' using errcode = '22023';
  end if;
  perform set_config('app.operating_instruction_rpc', 'on', true);
  update public.operating_instruction_versions
    set status = 'submitted', submitted_by_user_id = auth.uid(), submitted_at = now(), returned_note = null
    where id = p_version;
  perform set_config('app.operating_instruction_rpc', 'off', true);
  insert into public.operating_instruction_log (instruction_id, version_id, action) values (v.instruction_id, v.id, 'submitted');
  perform public.notify(
    array(select a from unnest(public.operating_instruction_approvers()) a where a <> auth.uid()),
    'operating_instruction_submitted', v_label, '/operating-instructions/' || v.instruction_id, null, auth.uid(),
    'operating_instruction_versions', v.id, 'operating-instruction:' || v.instruction_id, array['in_app'],
    jsonb_build_object('instruction', v_label, 'version', v.version_no));
end;
$$;


ALTER FUNCTION public.operating_instruction_submit(p_version uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_submit(p_version uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_submit(p_version uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_submit(p_version uuid) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_submit(p_version uuid) TO authenticated;

CREATE FUNCTION public.operating_instruction_texts_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_row public.operating_instruction_texts := case when tg_op = 'DELETE' then old else new end;
  v public.operating_instruction_versions;
begin
  if current_setting('app.operating_instruction_rpc', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select * into v from public.operating_instruction_versions where id = v_row.version_id;
  -- Deleting a draft (or an unpublished instruction) cascades here after the version is gone.
  if tg_op = 'DELETE' and v.id is null then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.version_id is distinct from old.version_id then
    raise exception 'A text cannot move to another version' using errcode = '42501';
  end if;
  if v.status = 'draft' then
    if tg_op = 'DELETE' and old.language = 'de' then
      raise exception 'The German text cannot be removed' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.language = 'de'
       and (new.title, new.work_area, new.subject, new.sections) is distinct from (old.title, old.work_area, old.subject, old.sections) then
      perform set_config('app.operating_instruction_rpc', 'on', true);
      update public.operating_instruction_texts set needs_check = true where version_id = new.version_id and language <> 'de';
      perform set_config('app.operating_instruction_rpc', 'off', true);
    end if;
    if tg_op = 'UPDATE' and new.language <> 'de' then
      new.needs_check := false;
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v.status = 'published' and v_row.language <> 'de' then
    if tg_op <> 'DELETE' then
      new.needs_check := false;
    end if;
    insert into public.operating_instruction_log (instruction_id, version_id, action, language)
    values (v.instruction_id, v.id, 'translation', v_row.language);
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'This text cannot be changed any more' using errcode = '42501';
end;
$$;


ALTER FUNCTION public.operating_instruction_texts_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_texts_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_texts_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_texts_guard() TO service_role;

CREATE FUNCTION public.operating_instruction_version_visible(p_version uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.operating_instruction_versions v
    where v.id = p_version
      and ((v.status in ('published', 'archived') and public.rls_has('operating_instructions.view.all'))
           or v.created_by_user_id = auth.uid()
           or public.rls_has('operating_instructions.approve')
           or public.operating_instruction_editable(v.instruction_id))
  );
$$;


ALTER FUNCTION public.operating_instruction_version_visible(p_version uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_version_visible(p_version uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_version_visible(p_version uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_version_visible(p_version uuid) TO service_role;
GRANT ALL ON FUNCTION public.operating_instruction_version_visible(p_version uuid) TO authenticated;

CREATE FUNCTION public.operating_instruction_versions_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if current_setting('app.operating_instruction_rpc', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Create a draft with operating_instruction_new_draft()' using errcode = '42501';
  end if;
  if old.status <> 'draft' then
    raise exception 'Only a draft can be edited' using errcode = '42501';
  end if;
  if new.status is distinct from old.status or new.version_no is distinct from old.version_no
     or new.instruction_id is distinct from old.instruction_id
     or new.submitted_by_user_id is distinct from old.submitted_by_user_id or new.submitted_at is distinct from old.submitted_at
     or new.approved_by_user_id is distinct from old.approved_by_user_id or new.approved_at is distinct from old.approved_at
     or new.returned_note is distinct from old.returned_note then
    raise exception 'Use the operating instruction functions to change the status' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.operating_instruction_versions_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instruction_versions_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instruction_versions_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instruction_versions_guard() TO service_role;

CREATE FUNCTION public.operating_instructions_for_asset(p_asset uuid) RETURNS TABLE(instruction_id uuid, source text, source_asset_id uuid)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select distinct on (l.instruction_id) l.instruction_id,
         case when l.asset_type_id is not null then 'asset_type' when l.asset_id = a.id then 'asset' else 'parent' end,
         l.asset_id
  from public.assets a
  join public.assets up on up.path operator(public.@>) a.path
  join public.operating_instruction_assets l on l.asset_id = up.id or (l.asset_type_id = a.asset_type_id and up.id = a.id)
  where a.id = p_asset
  order by l.instruction_id, (l.asset_id = a.id) desc nulls last, public.nlevel(up.path) desc;
$$;


ALTER FUNCTION public.operating_instructions_for_asset(p_asset uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instructions_for_asset(p_asset uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instructions_for_asset(p_asset uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instructions_for_asset(p_asset uuid) TO service_role;
GRANT ALL ON FUNCTION public.operating_instructions_for_asset(p_asset uuid) TO authenticated;

CREATE FUNCTION public.operating_instructions_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.number is distinct from old.number or new.kind is distinct from old.kind then
    raise exception 'Number and kind of an operating instruction cannot be changed' using errcode = '42501';
  end if;
  if new.review_due_on is distinct from old.review_due_on and current_setting('app.operating_instruction_rpc', true) is distinct from 'on' then
    raise exception 'Use operating_instruction_reviewed() to move the review date' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.operating_instructions_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.operating_instructions_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operating_instructions_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operating_instructions_guard() TO service_role;

CREATE FUNCTION public.people_refresh_has_left() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.users u set has_left = x.left_now
  from (
    select u2.id, exists (select 1 from public.person_private p where p.user_id = u2.id and p.exit_date <= current_date) as left_now
    from public.users u2
  ) x
  where x.id = u.id and u.has_left is distinct from x.left_now;
$$;


ALTER FUNCTION public.people_refresh_has_left() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.people_refresh_has_left() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.people_refresh_has_left() FROM PUBLIC;
GRANT ALL ON FUNCTION public.people_refresh_has_left() TO service_role;

CREATE FUNCTION public.person_private_sync_birthday() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    update public.users set birthday_month = null, birthday_day = null where id = old.user_id;
    return old;
  end if;
  update public.users
     set birthday_month = extract(month from new.birth_date)::smallint,
         birthday_day = extract(day from new.birth_date)::smallint
   where id = new.user_id;
  return new;
end;
$$;


ALTER FUNCTION public.person_private_sync_birthday() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.person_private_sync_birthday() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.person_private_sync_birthday() FROM PUBLIC;
GRANT ALL ON FUNCTION public.person_private_sync_birthday() TO service_role;

CREATE FUNCTION public.person_private_sync_exit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_hire date;
begin
  if tg_op = 'DELETE' then
    update public.users set has_left = false where id = old.user_id;
    return old;
  end if;
  select hire_date into v_hire from public.users where id = new.user_id;
  if new.exit_date is not null and v_hire is not null and new.exit_date < v_hire then
    raise exception 'The exit date cannot be before the hire date';
  end if;
  update public.users set has_left = (new.exit_date is not null and new.exit_date <= current_date) where id = new.user_id;
  return new;
end;
$$;


ALTER FUNCTION public.person_private_sync_exit() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.person_private_sync_exit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.person_private_sync_exit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.person_private_sync_exit() TO service_role;

CREATE FUNCTION public.position_fit_context(p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_pos jsonb;
  v_versions uuid[];
begin
  if not public.user_fit_access(auth.uid(), p_user, 'view') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  v_pos := public.position_fit_snapshot(p_user);
  select coalesce(array_agg((e ->> 'version_id')::uuid), '{}') into v_versions from jsonb_array_elements(v_pos) e;
  return jsonb_build_object(
    'positions', v_pos,
    'requirements', (select coalesce(jsonb_agg(jsonb_build_object('phrase_id', q.phrase_id, 'text', ph.text, 'position_ids', q.source_position_ids)
                                               order by ph.text), '[]'::jsonb)
                     from public.position_fit_requirements(v_versions) q join public.requirement_phrases ph on ph.id = q.phrase_id),
    'without_description', (select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb)
                            from public.positions p
                            where p.active and p.kind = 'job'
                              and exists (select 1 from public.position_holders_effective h where h.position_id = p.id and h.user_id = p_user)
                              and not exists (select 1 from public.job_description_versions v where v.position_id = p.id and v.status = 'published')));
end;
$$;


ALTER FUNCTION public.position_fit_context(p_user uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_fit_context(p_user uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_fit_context(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_fit_context(p_user uuid) TO service_role;
GRANT ALL ON FUNCTION public.position_fit_context(p_user uuid) TO authenticated;

CREATE FUNCTION public.position_fit_requirements(p_versions uuid[]) RETURNS TABLE(phrase_id uuid, source_position_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select r.phrase_id, array_agg(distinct v.position_id)
  from public.job_description_requirements r
  join public.job_description_versions v on v.id = r.version_id
  where v.id = any (p_versions)
  group by r.phrase_id;
$$;


ALTER FUNCTION public.position_fit_requirements(p_versions uuid[]) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_fit_requirements(p_versions uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_fit_requirements(p_versions uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_fit_requirements(p_versions uuid[]) TO service_role;

CREATE FUNCTION public.position_fit_review_save(p_review uuid, p_user uuid, p_reviewed_on date, p_next_review_on date, p_note text, p_measure text, p_measure_due_on date, p_measure_status text, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_rev public.position_fit_reviews;
  v_user uuid;
  v_pos jsonb;
  v_versions uuid[];
  v_id uuid;
  v_result text;
  v_missing integer;
  v_extra integer;
  v_status text;
begin
  if p_review is null then
    v_user := p_user;
    v_pos := public.position_fit_snapshot(v_user);
  else
    select * into v_rev from public.position_fit_reviews where id = p_review;
    if v_rev.id is null then
      raise exception 'Review not found' using errcode = 'P0002';
    end if;
    v_user := v_rev.user_id;
    v_pos := v_rev.positions;
  end if;
  if v_user is null or not public.user_fit_access(auth.uid(), v_user, 'edit') then
    raise exception 'No permission' using errcode = '42501';
  end if;
  select coalesce(array_agg((e ->> 'version_id')::uuid), '{}') into v_versions from jsonb_array_elements(v_pos) e;
  if not exists (select 1 from public.position_fit_requirements(v_versions)) then
    raise exception 'There is nothing to review: no published job description with requirements' using errcode = '22023';
  end if;
  if p_reviewed_on is null or p_reviewed_on > current_date or p_next_review_on is null or p_next_review_on < p_reviewed_on then
    raise exception 'Invalid dates' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as f (phrase_id uuid, rating text, comment text)
             where f.rating is null or f.rating not in ('fulfilled', 'deviation')) then
    raise exception 'Every requirement needs a rating' using errcode = '22023';
  end if;
  select count(*) into v_missing from public.position_fit_requirements(v_versions) q
    where not exists (select 1 from jsonb_to_recordset(p_items) as f (phrase_id uuid, rating text, comment text) where f.phrase_id = q.phrase_id);
  select count(*) into v_extra from jsonb_to_recordset(p_items) as f (phrase_id uuid, rating text, comment text)
    where not exists (select 1 from public.position_fit_requirements(v_versions) q where q.phrase_id = f.phrase_id);
  if v_missing > 0 or v_extra > 0 then
    raise exception 'Every requirement needs a rating (missing %, unknown %)', v_missing, v_extra using errcode = '22023';
  end if;

  v_result := case when exists (select 1 from jsonb_to_recordset(p_items) as f (phrase_id uuid, rating text, comment text) where f.rating = 'deviation') then 'deviation' else 'fulfilled' end;
  v_status := case when nullif(btrim(coalesce(p_measure, '')), '') is null then null else coalesce(p_measure_status, 'open') end;
  if p_review is null then
    insert into public.position_fit_reviews (user_id, reviewed_on, next_review_on, result, note, measure, measure_due_on, measure_status, positions)
    values (v_user, p_reviewed_on, p_next_review_on, v_result, nullif(btrim(coalesce(p_note, '')), ''),
            nullif(btrim(coalesce(p_measure, '')), ''), case when v_status is null then null else p_measure_due_on end, v_status, v_pos)
    returning id into v_id;
  else
    update public.position_fit_reviews
      set reviewed_on = p_reviewed_on, next_review_on = p_next_review_on, result = v_result,
          note = nullif(btrim(coalesce(p_note, '')), ''), measure = nullif(btrim(coalesce(p_measure, '')), ''),
          measure_due_on = case when v_status is null then null else p_measure_due_on end, measure_status = v_status
      where id = p_review;
    v_id := p_review;
    delete from public.position_fit_review_items where review_id = v_id;
  end if;
  insert into public.position_fit_review_items (review_id, phrase_id, rating, comment)
    select v_id, f.phrase_id, f.rating, nullif(btrim(coalesce(f.comment, '')), '')
    from jsonb_to_recordset(p_items) as f (phrase_id uuid, rating text, comment text);
  return v_id;
end;
$$;


ALTER FUNCTION public.position_fit_review_save(p_review uuid, p_user uuid, p_reviewed_on date, p_next_review_on date, p_note text, p_measure text, p_measure_due_on date, p_measure_status text, p_items jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_fit_review_save(p_review uuid, p_user uuid, p_reviewed_on date, p_next_review_on date, p_note text, p_measure text, p_measure_due_on date, p_measure_status text, p_items jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_fit_review_save(p_review uuid, p_user uuid, p_reviewed_on date, p_next_review_on date, p_note text, p_measure text, p_measure_due_on date, p_measure_status text, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_fit_review_save(p_review uuid, p_user uuid, p_reviewed_on date, p_next_review_on date, p_note text, p_measure text, p_measure_due_on date, p_measure_status text, p_items jsonb) TO service_role;
GRANT ALL ON FUNCTION public.position_fit_review_save(p_review uuid, p_user uuid, p_reviewed_on date, p_next_review_on date, p_note text, p_measure text, p_measure_due_on date, p_measure_status text, p_items jsonb) TO authenticated;

CREATE FUNCTION public.position_fit_snapshot(p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('position_id', p.id, 'name', p.name, 'version_id', v.id, 'version_no', v.version_no)
                            order by p.name), '[]'::jsonb)
  from public.positions p
  join public.job_description_versions v on v.position_id = p.id and v.status = 'published'
  where p.active and p.kind = 'job'
    and exists (select 1 from public.position_holders_effective h where h.position_id = p.id and h.user_id = p_user);
$$;


ALTER FUNCTION public.position_fit_snapshot(p_user uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_fit_snapshot(p_user uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_fit_snapshot(p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_fit_snapshot(p_user uuid) TO service_role;

CREATE FUNCTION public.position_fit_status_all(p_today date DEFAULT CURRENT_DATE) RETURNS TABLE(user_id uuid, review_id uuid, reviewed_on date, next_review_on date, result text, measure_status text, deviation_open boolean, position_count integer, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with held as (
    select h.user_id, count(distinct h.position_id)::integer as position_count
    from public.position_holders_effective h
    join public.positions p on p.id = h.position_id and p.active and p.kind = 'job'
    group by h.user_id
  ),
  latest as (
    select distinct on (r.user_id) r.* from public.position_fit_reviews r order by r.user_id, r.reviewed_on desc, r.created_at desc
  )
  select h.user_id, l.id, l.reviewed_on, l.next_review_on, l.result, l.measure_status,
         coalesce(l.result = 'deviation' and coalesce(l.measure_status, 'open') <> 'done', false),
         h.position_count,
         case
           when l.id is null then 'never'
           when l.next_review_on < p_today then 'overdue'
           when l.next_review_on <= p_today + 30 then 'due_soon'
           else 'ok'
         end
  from held h left join latest l on l.user_id = h.user_id;
$$;


ALTER FUNCTION public.position_fit_status_all(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_fit_status_all(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_fit_status_all(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_fit_status_all(p_today date) TO service_role;

CREATE FUNCTION public.position_fit_status_for_me() RETURNS TABLE(user_id uuid, review_id uuid, reviewed_on date, next_review_on date, result text, measure_status text, deviation_open boolean, position_count integer, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.* from public.position_fit_status_all() s where public.user_fit_access((select auth.uid()), s.user_id, 'view');
$$;


ALTER FUNCTION public.position_fit_status_for_me() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_fit_status_for_me() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_fit_status_for_me() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_fit_status_for_me() TO service_role;
GRANT ALL ON FUNCTION public.position_fit_status_for_me() TO authenticated;

CREATE FUNCTION public.position_holder_or_supervisor(p_viewer uuid, p_position uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with recursive below (id) as (
    select p_viewer
    union
    select u.id from public.users u join below b on u.supervisor_user_id = b.id
  )
  select exists (
    select 1 from public.position_holders_effective h
    where h.position_id = p_position and h.user_id in (select id from below)
  );
$$;


ALTER FUNCTION public.position_holder_or_supervisor(p_viewer uuid, p_position uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_holder_or_supervisor(p_viewer uuid, p_position uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_holder_or_supervisor(p_viewer uuid, p_position uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_holder_or_supervisor(p_viewer uuid, p_position uuid) TO service_role;

CREATE FUNCTION public.position_holders_at(p_position uuid, p_date date) RETURNS TABLE(user_id uuid, source text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select h.user_id, 'direct'::text
  from public.position_holders h
  where h.position_id = p_position and h.valid_from <= p_date and (h.valid_to is null or h.valid_to >= p_date)
  union
  select l.user_id, l.source
  from (
    select distinct on (l.user_id) l.user_id, l.source, l.action
    from public.position_assignment_log l
    where l.position_id = p_position and l.source = 'team' and l.happened_at < (p_date + 1)::timestamptz
    order by l.user_id, l.happened_at desc, l.id desc
  ) l
  where l.action = 'added';
$$;


ALTER FUNCTION public.position_holders_at(p_position uuid, p_date date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_holders_at(p_position uuid, p_date date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_holders_at(p_position uuid, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_holders_at(p_position uuid, p_date date) TO service_role;
GRANT ALL ON FUNCTION public.position_holders_at(p_position uuid, p_date date) TO authenticated;

CREATE FUNCTION public.position_holders_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' then
    if new.position_id <> old.position_id or new.user_id <> old.user_id then
      raise exception 'position_holder_fixed' using errcode = '42501';
    end if;
    return new;
  end if;
  if exists (select 1 from public.attachments where entity_type = 'position_holders' and entity_id = old.id) then
    raise exception 'position_holder_has_letter' using errcode = 'P0001';
  end if;
  return old;
end;
$$;


ALTER FUNCTION public.position_holders_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_holders_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_holders_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_holders_guard() TO service_role;

CREATE FUNCTION public.position_holders_log() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.position_log(new.position_id, new.user_id, 'added', 'direct', null, new.valid_from, new.valid_to);
  elsif tg_op = 'DELETE' then
    perform public.position_log(old.position_id, old.user_id, 'removed', 'direct', null, old.valid_from, old.valid_to);
  elsif old.valid_to is null and new.valid_to is not null then
    perform public.position_log(new.position_id, new.user_id, 'removed', 'direct', null, new.valid_from, new.valid_to);
  elsif old.valid_to is not null and new.valid_to is null then
    perform public.position_log(new.position_id, new.user_id, 'added', 'direct', null, new.valid_from, new.valid_to);
  elsif new.valid_from <> old.valid_from or new.valid_to <> old.valid_to then
    perform public.position_log(new.position_id, new.user_id, 'changed', 'direct', null, new.valid_from, new.valid_to);
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.position_holders_log() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_holders_log() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_holders_log() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_holders_log() TO service_role;

CREATE FUNCTION public.position_log(p_position uuid, p_user uuid, p_action text, p_source text, p_group uuid, p_valid_from date DEFAULT NULL::date, p_valid_to date DEFAULT NULL::date) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.position_assignment_log (position_id, user_id, action, source, team_id, team_name, valid_from, valid_to)
  values (p_position, p_user, p_action, p_source, p_group, (select name from public.teams where id = p_group), p_valid_from, p_valid_to);
$$;


ALTER FUNCTION public.position_log(p_position uuid, p_user uuid, p_action text, p_source text, p_group uuid, p_valid_from date, p_valid_to date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_log(p_position uuid, p_user uuid, p_action text, p_source text, p_group uuid, p_valid_from date, p_valid_to date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_log(p_position uuid, p_user uuid, p_action text, p_source text, p_group uuid, p_valid_from date, p_valid_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_log(p_position uuid, p_user uuid, p_action text, p_source text, p_group uuid, p_valid_from date, p_valid_to date) TO service_role;

CREATE FUNCTION public.position_team_access(p_viewer uuid, p_position uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.position_teams pt
    join public.user_teams ug on ug.team_id = pt.team_id and ug.user_id = p_viewer
    where pt.position_id = p_position
  );
$$;


ALTER FUNCTION public.position_team_access(p_viewer uuid, p_position uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_team_access(p_viewer uuid, p_position uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_team_access(p_viewer uuid, p_position uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_team_access(p_viewer uuid, p_position uuid) TO service_role;

CREATE FUNCTION public.position_teams_appointment_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_table_name = 'position_teams' then
    if (select kind from public.positions where id = new.position_id) = 'appointment' then
      raise exception 'appointment_without_teams' using errcode = 'P0001';
    end if;
  elsif new.kind = 'appointment' and exists (select 1 from public.position_teams where position_id = new.id) then
    raise exception 'appointment_without_teams' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.position_teams_appointment_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_teams_appointment_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_teams_appointment_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_teams_appointment_guard() TO service_role;

CREATE FUNCTION public.position_teams_log_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.position_log(x.position_id, x.user_id, 'removed', 'team', x.team_id)
  from (
    select distinct on (o.position_id, ug.user_id) o.position_id, ug.user_id, o.team_id
    from old_rows o
    join public.user_teams ug on ug.team_id = o.team_id
    where not exists (
      select 1 from public.position_teams pt
      join public.user_teams ug2 on ug2.team_id = pt.team_id and ug2.user_id = ug.user_id
      where pt.position_id = o.position_id
    )
    order by o.position_id, ug.user_id, o.team_id
  ) x;
  return null;
end;
$$;


ALTER FUNCTION public.position_teams_log_delete() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_teams_log_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_teams_log_delete() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_teams_log_delete() TO service_role;

CREATE FUNCTION public.position_teams_log_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.position_log(x.position_id, x.user_id, 'added', 'team', x.team_id)
  from (
    select distinct on (n.position_id, ug.user_id) n.position_id, ug.user_id, n.team_id
    from new_rows n
    join public.user_teams ug on ug.team_id = n.team_id
    where not exists (
      select 1 from public.position_teams pt
      join public.user_teams ug2 on ug2.team_id = pt.team_id and ug2.user_id = ug.user_id
      where pt.position_id = n.position_id
        and not exists (select 1 from new_rows n2 where n2.position_id = pt.position_id and n2.team_id = pt.team_id)
    )
    order by n.position_id, ug.user_id, n.team_id
  ) x;
  return null;
end;
$$;


ALTER FUNCTION public.position_teams_log_insert() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.position_teams_log_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.position_teams_log_insert() FROM PUBLIC;
GRANT ALL ON FUNCTION public.position_teams_log_insert() TO service_role;

CREATE FUNCTION public.send_fit_review_reminders(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  lead record;
  v_people uuid[];
  v_count integer;
  v_sent integer := 0;
begin
  select coalesce(array_agg(s.user_id), '{}') into v_people from public.position_fit_status_all(p_today) s
    where s.status in ('never', 'overdue', 'due_soon');
  if cardinality(v_people) = 0 then
    return 0;
  end if;
  for lead in
    select u.id from public.users u
    where u.has_login and not u.has_left
      and exists (select 1 from unnest(public.user_permissions(u.id)) p where p like 'fit_reviews.edit.%')
  loop
    select count(*) into v_count from unnest(v_people) as person where public.user_fit_access(lead.id, person, 'edit');
    if v_count > 0 then
      perform public.notify(
        array[lead.id], 'fit_review_digest', v_count || ' suitability reviews need attention', '/positions?view=reviews', null,
        null, null, null, 'fit-review-digest', array['in_app'], jsonb_build_object('count', v_count));
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;


ALTER FUNCTION public.send_fit_review_reminders(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.send_fit_review_reminders(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_fit_review_reminders(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_fit_review_reminders(p_today date) TO service_role;

CREATE FUNCTION public.send_training_reminders(p_today date DEFAULT CURRENT_DATE) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  rec record;
  lead record;
  v_sent integer := 0;
  v_logged integer;
  v_people uuid[] := '{}';
  v_count integer;
begin
  for rec in
    select s.user_id, s.training_type_id, s.status as stage, coalesce(s.valid_until, date '1970-01-01') as ref_date,
           tt.name as training_name, u.has_login, coalesce(np.remind_trainings, true) as want
    from public.training_status_all() s
    join public.training_types tt on tt.id = s.training_type_id
    join public.users u on u.id = s.user_id
    left join public.notification_preferences np on np.user_id = s.user_id
    where s.required and s.status in ('due_soon', 'expired', 'missing', 'reinstruction')
  loop
    if rec.stage = 'due_soon' then
      select count(*) into v_logged from public.training_reminder_log
        where user_id = rec.user_id and training_type_id = rec.training_type_id and stage = rec.stage and ref_date = rec.ref_date;
    else
      select count(*) into v_logged from public.training_reminder_log
        where user_id = rec.user_id and training_type_id = rec.training_type_id and stage = rec.stage
          and ref_date = rec.ref_date and sent_on > p_today - 7;
    end if;
    continue when v_logged > 0;

    insert into public.training_reminder_log (user_id, training_type_id, stage, ref_date, sent_on)
    values (rec.user_id, rec.training_type_id, rec.stage, rec.ref_date, p_today);
    v_people := v_people || rec.user_id;
    v_sent := v_sent + 1;

    if rec.has_login and rec.want then
      perform public.notify(
        array[rec.user_id], 'training_' || rec.stage, rec.training_name, '/people/' || rec.user_id, null,
        null, null, null, 'training:' || rec.training_type_id, array['in_app'],
        jsonb_build_object('training', rec.training_name, 'date', to_char(rec.ref_date, 'DD.MM.YYYY')));
    end if;
  end loop;

  if v_sent > 0 then
    for lead in
      select u.id from public.users u
      left join public.notification_preferences np on np.user_id = u.id
      where u.has_login and coalesce(np.remind_trainings, true)
        and exists (select 1 from unnest(public.user_permissions(u.id)) p where p like 'trainings.edit.%')
    loop
      select count(*) into v_count from unnest(v_people) as person
        where public.user_training_access(lead.id, person, 'edit');
      if v_count > 0 then
        perform public.notify(
          array[lead.id], 'training_digest', v_count || ' trainings need attention', '/trainings', null,
          null, null, null, 'training-digest', array['in_app'], jsonb_build_object('count', v_count));
      end if;
    end loop;
  end if;

  delete from public.training_reminder_log where sent_on < p_today - 800;
  return v_sent;
end;
$$;


ALTER FUNCTION public.send_training_reminders(p_today date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.send_training_reminders(p_today date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.send_training_reminders(p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_training_reminders(p_today date) TO service_role;

CREATE FUNCTION public.training_records_set_valid_until() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_months integer;
begin
  select validity_months into v_months from public.training_types where id = new.training_type_id;
  new.valid_until := case when v_months is null then null else (new.completed_on + make_interval(months => v_months))::date end;
  return new;
end;
$$;


ALTER FUNCTION public.training_records_set_valid_until() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_records_set_valid_until() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_records_set_valid_until() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_records_set_valid_until() TO service_role;

CREATE FUNCTION public.training_records_taught_instructions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'UPDATE' and (new.training_type_id, new.completed_on) is not distinct from (old.training_type_id, old.completed_on) then
    return null;
  end if;
  delete from public.training_record_operating_instructions where record_id = new.id;
  insert into public.training_record_operating_instructions (record_id, instruction_id, version_id)
  select new.id, k.instruction_id, v.id
  from public.training_type_operating_instructions k
  join lateral (
    select x.id from public.operating_instruction_versions x
    where x.instruction_id = k.instruction_id and x.status in ('published', 'archived') and x.valid_from <= new.completed_on
    order by x.version_no desc limit 1
  ) v on true
  where k.training_type_id = new.training_type_id;
  return null;
end;
$$;


ALTER FUNCTION public.training_records_taught_instructions() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_records_taught_instructions() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_records_taught_instructions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_records_taught_instructions() TO service_role;

CREATE FUNCTION public.training_reminders_run_now() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (public.is_admin() or public.rls_has('training_types.edit')) then
    raise exception 'Only admins or HR may run this';
  end if;
  return public.send_training_reminders();
end;
$$;


ALTER FUNCTION public.training_reminders_run_now() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_reminders_run_now() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_reminders_run_now() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_reminders_run_now() TO service_role;
GRANT ALL ON FUNCTION public.training_reminders_run_now() TO authenticated;

CREATE FUNCTION public.training_session_access(p_viewer uuid, p_session uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_held text[];
begin
  if p_viewer is null or p_action not in ('view', 'edit') then
    return false;
  end if;
  if p_action = 'view' then
    return exists (select 1 from public.training_sessions s where s.id = p_session and s.created_by_user_id = p_viewer)
      or exists (select 1 from public.training_session_participants p
                 where p.session_id = p_session and public.user_training_access(p_viewer, p.user_id, 'view'));
  end if;
  v_held := public.user_permissions(p_viewer);
  if not ('trainings.edit.all' = any (v_held) or 'trainings.edit.reports' = any (v_held)) then
    return false;
  end if;
  return exists (select 1 from public.training_sessions s where s.id = p_session)
    and not exists (select 1 from public.training_session_participants p
                    where p.session_id = p_session and not public.user_training_access(p_viewer, p.user_id, 'edit'));
end;
$$;


ALTER FUNCTION public.training_session_access(p_viewer uuid, p_session uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_access(p_viewer uuid, p_session uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_access(p_viewer uuid, p_session uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_access(p_viewer uuid, p_session uuid, p_action text) TO service_role;

CREATE FUNCTION public.training_session_confirm(p_session_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session public.training_sessions;
  v_count integer;
begin
  select * into v_session from public.training_sessions where id = p_session_id for update;
  if v_session.id is null or not public.training_session_access(v_uid, p_session_id, 'edit') then
    raise exception 'Training session not found or not yours to confirm' using errcode = '42501';
  end if;
  if v_session.status <> 'planned' then
    raise exception 'training_session_confirmed' using errcode = 'P0001';
  end if;
  if v_session.held_on > current_date then
    raise exception 'training_session_in_future' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.training_session_types where session_id = p_session_id) then
    raise exception 'training_session_no_types' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.training_session_participants where session_id = p_session_id and attended) then
    raise exception 'training_session_no_participants' using errcode = 'P0001';
  end if;

  perform public.training_session_write_records(p_session_id, p.user_id)
  from public.training_session_participants p
  where p.session_id = p_session_id and p.attended;
  select count(*) into v_count from public.training_records where session_id = p_session_id;

  perform set_config('app.training_session_confirm', 'on', true);
  update public.training_sessions set status = 'confirmed', confirmed_at = now(), confirmed_by_user_id = v_uid
  where id = p_session_id;
  perform set_config('app.training_session_confirm', '', true);
  return v_count;
end;
$$;


ALTER FUNCTION public.training_session_confirm(p_session_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_confirm(p_session_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_confirm(p_session_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_confirm(p_session_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.training_session_confirm(p_session_id uuid) TO authenticated;

CREATE FUNCTION public.training_session_editable(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (select public.rls_has('trainings.edit.all'))
    or ((select public.rls_has('trainings.edit.reports'))
        and not exists (select 1 from public.training_session_participants p
                        where p.session_id = p_session and not (p.user_id = any ((select public.my_report_ids())::uuid[]))))
$$;


ALTER FUNCTION public.training_session_editable(p_session uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_editable(p_session uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_editable(p_session uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_editable(p_session uuid) TO service_role;
GRANT ALL ON FUNCTION public.training_session_editable(p_session uuid) TO authenticated;

CREATE FUNCTION public.training_session_is_planned(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select exists (select 1 from public.training_sessions where id = p_session and status = 'planned') $$;


ALTER FUNCTION public.training_session_is_planned(p_session uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_is_planned(p_session uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_is_planned(p_session uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_is_planned(p_session uuid) TO service_role;
GRANT ALL ON FUNCTION public.training_session_is_planned(p_session uuid) TO authenticated;

CREATE FUNCTION public.training_session_participants_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.training_session_is_planned(new.session_id) and new.attended then
    perform public.training_session_write_records(new.session_id, new.user_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION public.training_session_participants_after() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_participants_after() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_participants_after() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_participants_after() TO service_role;

CREATE FUNCTION public.training_session_visible(p_session uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select (select public.rls_has('trainings.view.all'))
    or exists (select 1 from public.training_session_participants p
               where p.session_id = p_session
                 and ((p.user_id = (select auth.uid()) and (select public.rls_has('trainings.view.own')))
                      or ((select public.rls_has('trainings.view.reports')) and p.user_id = any ((select public.my_report_ids())::uuid[]))))
$$;


ALTER FUNCTION public.training_session_visible(p_session uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_visible(p_session uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_visible(p_session uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_visible(p_session uuid) TO service_role;
GRANT ALL ON FUNCTION public.training_session_visible(p_session uuid) TO authenticated;

CREATE FUNCTION public.training_session_write_records(p_session uuid, p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.training_records (user_id, training_type_id, completed_on, trainer, session_id, created_by_user_id)
  select p_user_id, t.training_type_id, s.held_on, s.trainer, s.id, auth.uid()
  from public.training_sessions s
  join public.training_session_types t on t.session_id = s.id
  where s.id = p_session
    and not exists (select 1 from public.training_records r
                    where r.session_id = s.id and r.user_id = p_user_id and r.training_type_id = t.training_type_id);
$$;


ALTER FUNCTION public.training_session_write_records(p_session uuid, p_user_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_session_write_records(p_session uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_session_write_records(p_session uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_session_write_records(p_session uuid, p_user_id uuid) TO service_role;

CREATE FUNCTION public.training_sessions_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if coalesce(current_setting('app.training_session_confirm', true), '') = 'on' then
    return new;
  end if;
  if (new.status, new.confirmed_at, new.confirmed_by_user_id) is distinct from (old.status, old.confirmed_at, old.confirmed_by_user_id) then
    raise exception 'A training session is confirmed only through training_session_confirm' using errcode = '42501';
  end if;
  if old.status = 'confirmed' and (new.held_on, new.trainer, new.location, new.extra_content)
                                   is distinct from (old.held_on, old.trainer, old.location, old.extra_content) then
    raise exception 'training_session_confirmed' using errcode = 'P0001',
      hint = 'A confirmed training session is fixed; correct the single records instead.';
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.training_sessions_guard() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_sessions_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_sessions_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_sessions_guard() TO service_role;

CREATE FUNCTION public.training_sessions_keep_proofs() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (select 1 from public.attachments where entity_type = 'training_sessions' and entity_id = old.id) then
    raise exception 'training_session_has_proofs' using errcode = 'P0001';
  end if;
  return old;
end;
$$;


ALTER FUNCTION public.training_sessions_keep_proofs() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_sessions_keep_proofs() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_sessions_keep_proofs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_sessions_keep_proofs() TO service_role;

CREATE FUNCTION public.training_status_all() RETURNS TABLE(user_id uuid, training_type_id uuid, record_id uuid, completed_on date, valid_until date, status text, required boolean, exempt boolean, proof_count bigint, requires_certificate boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with req as (
    select distinct x.user_id, x.training_type_id
    from (
      select ug.user_id, r.training_type_id from public.training_requirements r join public.user_teams ug on ug.team_id = r.team_id
      union all
      select ur.user_id, r.training_type_id from public.training_requirements r join public.user_roles ur on ur.role_id = r.role_id
      union all
      select h.user_id, r.training_type_id from public.training_requirements r join public.position_holders_effective h on h.position_id = r.position_id
      union all
      select r.user_id, r.training_type_id from public.training_requirements r where r.user_id is not null
    ) x
    join public.users u on u.id = x.user_id
      and not exists (select 1 from public.person_private pp where pp.user_id = u.id and pp.exit_date <= current_date)
    join public.training_types tt on tt.id = x.training_type_id and tt.active
  ),
  latest as (
    select distinct on (r.user_id, r.training_type_id) r.*
    from public.training_records r
    order by r.user_id, r.training_type_id, r.completed_on desc, r.created_at desc
  ),
  pairs as (
    select user_id, training_type_id from req
    union
    select user_id, training_type_id from latest
  ),
  -- latest records that do not cover every instruction of their type (~/maintenance_tool/docs/operating-instructions.md)
  uncovered as (
    select distinct l.id as record_id
    from latest l
    join public.training_type_operating_instructions k on k.training_type_id = l.training_type_id
    join public.operating_instruction_baselines() b on b.instruction_id = k.instruction_id
    left join public.training_record_operating_instructions t on t.record_id = l.id and t.instruction_id = k.instruction_id
    left join public.operating_instruction_versions tv on tv.id = t.version_id
    where tv.version_no is null or tv.version_no < b.baseline_no
  )
  select p.user_id, p.training_type_id, l.id, l.completed_on, l.valid_until,
         case
           when e.user_id is not null then 'exempt'
           when l.id is not null and l.id in (select record_id from uncovered) and public.training_status_of(l.valid_until, tt.reminder_days_before) in ('valid', 'due_soon') then 'reinstruction'
           when l.id is not null then public.training_status_of(l.valid_until, tt.reminder_days_before)
           else 'missing'
         end,
         (rq.user_id is not null),
         (e.user_id is not null),
         coalesce((select count(*) from public.attachments a
                   where (a.entity_type = 'training_records' and a.entity_id = l.id)
                      or (a.entity_type = 'training_sessions' and a.entity_id = l.session_id)), 0),
         tt.requires_certificate
  from pairs p
  join public.training_types tt on tt.id = p.training_type_id
  left join latest l on l.user_id = p.user_id and l.training_type_id = p.training_type_id
  left join req rq on rq.user_id = p.user_id and rq.training_type_id = p.training_type_id
  left join public.training_exemptions e on e.user_id = p.user_id and e.training_type_id = p.training_type_id;
$$;


ALTER FUNCTION public.training_status_all() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_status_all() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_status_all() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_status_all() TO service_role;

CREATE FUNCTION public.training_status_for_me() RETURNS TABLE(user_id uuid, training_type_id uuid, record_id uuid, completed_on date, valid_until date, status text, required boolean, exempt boolean, proof_count bigint, requires_certificate boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select s.* from public.training_status_all() s
  where public.user_training_access((select auth.uid()), s.user_id, 'view');
$$;


ALTER FUNCTION public.training_status_for_me() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_status_for_me() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_status_for_me() FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_status_for_me() TO service_role;
GRANT ALL ON FUNCTION public.training_status_for_me() TO authenticated;

CREATE FUNCTION public.training_status_of(p_valid_until date, p_reminder_days integer) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select case
    when p_valid_until is null then 'valid'
    when p_valid_until < current_date then 'expired'
    when p_valid_until <= current_date + p_reminder_days then 'due_soon'
    else 'valid'
  end;
$$;


ALTER FUNCTION public.training_status_of(p_valid_until date, p_reminder_days integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.training_status_of(p_valid_until date, p_reminder_days integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.training_status_of(p_valid_until date, p_reminder_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.training_status_of(p_valid_until date, p_reminder_days integer) TO service_role;
GRANT ALL ON FUNCTION public.training_status_of(p_valid_until date, p_reminder_days integer) TO authenticated;

CREATE FUNCTION public.user_fit_access(p_viewer uuid, p_person uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_held text[];
begin
  if p_viewer is null or p_action not in ('view', 'edit') then
    return false;
  end if;
  v_held := public.user_permissions(p_viewer);
  if ('fit_reviews.' || p_action || '.all') = any (v_held) then
    return true;
  end if;
  if p_action = 'view' and p_viewer = p_person and 'fit_reviews.view.own' = any (v_held) then
    return true;
  end if;
  return ('fit_reviews.' || p_action || '.reports') = any (v_held) and public.user_reports_to(p_viewer, p_person);
end;
$$;


ALTER FUNCTION public.user_fit_access(p_viewer uuid, p_person uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_fit_access(p_viewer uuid, p_person uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_fit_access(p_viewer uuid, p_person uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_fit_access(p_viewer uuid, p_person uuid, p_action text) TO service_role;

CREATE FUNCTION public.user_fit_access_for_me(p_person uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.user_fit_access(auth.uid(), p_person, p_action) $$;


ALTER FUNCTION public.user_fit_access_for_me(p_person uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_fit_access_for_me(p_person uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_fit_access_for_me(p_person uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_fit_access_for_me(p_person uuid, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.user_fit_access_for_me(p_person uuid, p_action text) TO authenticated;

CREATE FUNCTION public.user_supervisor_at(p_user_id uuid, p_level integer) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_current uuid := p_user_id;
  v_up uuid;
  v_found uuid;
  v_levels integer := 0;
  v_guard integer := 0;
begin
  while v_levels < p_level and v_guard < 20 loop
    v_guard := v_guard + 1;
    select supervisor_user_id into v_up from public.users where id = v_current;
    exit when v_up is null;
    v_current := v_up;
    if (select has_login and locked_at is null from public.users where id = v_up) then
      v_levels := v_levels + 1;
      v_found := v_up;
    end if;
  end loop;
  return case when v_levels = p_level then v_found end;
end;
$$;


ALTER FUNCTION public.user_supervisor_at(p_user_id uuid, p_level integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_supervisor_at(p_user_id uuid, p_level integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_supervisor_at(p_user_id uuid, p_level integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_supervisor_at(p_user_id uuid, p_level integer) TO service_role;

CREATE FUNCTION public.user_training_access(p_viewer uuid, p_person uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_held text[];
begin
  if p_viewer is null or p_action not in ('view', 'edit') then
    return false;
  end if;
  v_held := public.user_permissions(p_viewer);
  if ('trainings.' || p_action || '.all') = any (v_held) then
    return true;
  end if;
  if p_action = 'view' and p_viewer = p_person and 'trainings.view.own' = any (v_held) then
    return true;
  end if;
  return ('trainings.' || p_action || '.reports') = any (v_held) and public.user_reports_to(p_viewer, p_person);
end;
$$;


ALTER FUNCTION public.user_training_access(p_viewer uuid, p_person uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_training_access(p_viewer uuid, p_person uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_training_access(p_viewer uuid, p_person uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_training_access(p_viewer uuid, p_person uuid, p_action text) TO service_role;

CREATE FUNCTION public.user_training_access_for_me(p_person uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.user_training_access(auth.uid(), p_person, p_action) $$;


ALTER FUNCTION public.user_training_access_for_me(p_person uuid, p_action text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_training_access_for_me(p_person uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_training_access_for_me(p_person uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_training_access_for_me(p_person uuid, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.user_training_access_for_me(p_person uuid, p_action text) TO authenticated;

CREATE FUNCTION public.users_birthday_hidden() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.birthday_hidden then
    new.birthday_month := null;
    new.birthday_day := null;
  elsif old.birthday_hidden then
    select extract(month from pp.birth_date)::smallint, extract(day from pp.birth_date)::smallint
      into new.birthday_month, new.birthday_day
      from public.person_private pp where pp.user_id = new.id and pp.birth_date is not null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.users_birthday_hidden() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.users_birthday_hidden() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.users_birthday_hidden() FROM PUBLIC;
GRANT ALL ON FUNCTION public.users_birthday_hidden() TO service_role;

CREATE FUNCTION public.user_teams_position_log_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.position_log(x.position_id, x.user_id, 'removed', 'team', x.team_id)
  from (
    select distinct on (pt.position_id, o.user_id) pt.position_id, o.user_id, pt.team_id
    from old_rows o
    join public.position_teams pt on pt.team_id = o.team_id
    where not exists (
      select 1 from public.position_teams pt2
      join public.user_teams ug2 on ug2.team_id = pt2.team_id and ug2.user_id = o.user_id
      where pt2.position_id = pt.position_id
    )
    order by pt.position_id, o.user_id, pt.team_id
  ) x;
  return null;
end;
$$;


ALTER FUNCTION public.user_teams_position_log_delete() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_teams_position_log_delete() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_teams_position_log_delete() FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_teams_position_log_delete() TO service_role;

CREATE FUNCTION public.user_teams_position_log_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.position_log(x.position_id, x.user_id, 'added', 'team', x.team_id)
  from (
    select distinct on (pt.position_id, n.user_id) pt.position_id, n.user_id, pt.team_id
    from new_rows n
    join public.position_teams pt on pt.team_id = n.team_id
    where not exists (
      select 1 from public.position_teams pt2
      join public.user_teams ug2 on ug2.team_id = pt2.team_id and ug2.user_id = n.user_id
      where pt2.position_id = pt.position_id
        and not exists (select 1 from new_rows n2 where n2.user_id = ug2.user_id and n2.team_id = ug2.team_id)
    )
    order by pt.position_id, n.user_id, pt.team_id
  ) x;
  return null;
end;
$$;


ALTER FUNCTION public.user_teams_position_log_insert() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.user_teams_position_log_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_teams_position_log_insert() FROM PUBLIC;
GRANT ALL ON FUNCTION public.user_teams_position_log_insert() TO service_role;

ALTER TABLE public.person_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add person data" ON public.person_private FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY "Delete person data" ON public.person_private FOR DELETE TO authenticated USING (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY "Edit person data" ON public.person_private FOR UPDATE TO authenticated USING (( SELECT public.rls_has('people.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY "Read person data" ON public.person_private FOR SELECT TO authenticated USING (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY mfa_required ON public.person_private AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER person_private_sync_birthday AFTER INSERT OR DELETE OR UPDATE OF birth_date ON public.person_private FOR EACH ROW EXECUTE FUNCTION public.person_private_sync_birthday();

CREATE TRIGGER person_private_sync_exit AFTER INSERT OR DELETE OR UPDATE OF exit_date ON public.person_private FOR EACH ROW EXECUTE FUNCTION public.person_private_sync_exit();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.person_private FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add positions" ON public.positions FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY "Delete positions" ON public.positions FOR DELETE TO authenticated USING (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY "Edit positions" ON public.positions FOR UPDATE TO authenticated USING (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY "Read positions" ON public.positions FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.positions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER positions_appointment_guard BEFORE INSERT OR UPDATE OF kind ON public.positions FOR EACH ROW EXECUTE FUNCTION public.position_teams_appointment_guard();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.position_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add position teams" ON public.position_teams FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY "Read position teams" ON public.position_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Remove position teams" ON public.position_teams FOR DELETE TO authenticated USING (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY mfa_required ON public.position_teams AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER position_teams_appointment_guard BEFORE INSERT ON public.position_teams FOR EACH ROW EXECUTE FUNCTION public.position_teams_appointment_guard();

CREATE TRIGGER position_teams_log_delete AFTER DELETE ON public.position_teams REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.position_teams_log_delete();

CREATE TRIGGER position_teams_log_insert AFTER INSERT ON public.position_teams REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.position_teams_log_insert();

ALTER TABLE public.position_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add position holders" ON public.position_holders FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY "Edit position holders" ON public.position_holders FOR UPDATE TO authenticated USING (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY "Read position holders" ON public.position_holders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Remove position holders" ON public.position_holders FOR DELETE TO authenticated USING (( SELECT public.rls_has('job_descriptions.edit.all'::text) AS rls_has));

CREATE POLICY mfa_required ON public.position_holders AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER position_holders_guard BEFORE DELETE OR UPDATE ON public.position_holders FOR EACH ROW EXECUTE FUNCTION public.position_holders_guard();

CREATE TRIGGER position_holders_log AFTER INSERT OR DELETE OR UPDATE OF valid_from, valid_to ON public.position_holders FOR EACH ROW EXECUTE FUNCTION public.position_holders_log();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.position_holders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.position_assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR deletes assignment log entries" ON public.position_assignment_log FOR DELETE TO authenticated USING (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY "Read assignment log" ON public.position_assignment_log FOR SELECT TO authenticated USING ((( SELECT public.rls_has('job_descriptions.view.all'::text) AS rls_has) OR (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY mfa_required ON public.position_assignment_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.requirement_phrases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read requirement phrases" ON public.requirement_phrases FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.requirement_phrases AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.job_description_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete job description versions" ON public.job_description_versions FOR DELETE TO authenticated USING ((((status = 'draft'::text) AND public.job_description_access_for_me(position_id, status, created_by_user_id, 'edit'::text)) OR ((status = 'archived'::text) AND ( SELECT public.rls_has('people.edit'::text) AS rls_has))));

CREATE POLICY "Edit job description drafts" ON public.job_description_versions FOR UPDATE TO authenticated USING (((status = 'draft'::text) AND public.job_description_access_for_me(position_id, status, created_by_user_id, 'edit'::text))) WITH CHECK (((status = 'draft'::text) AND public.job_description_access_for_me(position_id, status, created_by_user_id, 'edit'::text)));

CREATE POLICY "Read job description versions" ON public.job_description_versions FOR SELECT TO authenticated USING (public.job_description_access_for_me(position_id, status, created_by_user_id, 'view'::text));

CREATE POLICY mfa_required ON public.job_description_versions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER job_description_versions_guard BEFORE INSERT OR UPDATE ON public.job_description_versions FOR EACH ROW EXECUTE FUNCTION public.job_description_versions_guard();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.job_description_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.job_description_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read job description requirements" ON public.job_description_requirements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.job_description_versions v
  WHERE (v.id = job_description_requirements.version_id))));

CREATE POLICY mfa_required ON public.job_description_requirements AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.position_fit_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete fit reviews" ON public.position_fit_reviews FOR DELETE TO authenticated USING (( SELECT public.rls_has('people.edit'::text) AS rls_has));

CREATE POLICY "Read fit reviews" ON public.position_fit_reviews FOR SELECT TO authenticated USING (public.user_fit_access_for_me(user_id, 'view'::text));

CREATE POLICY mfa_required ON public.position_fit_reviews AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.position_fit_reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.position_fit_review_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read fit review items" ON public.position_fit_review_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.position_fit_reviews r
  WHERE (r.id = position_fit_review_items.review_id))));

CREATE POLICY mfa_required ON public.position_fit_review_items AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.training_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training types" ON public.training_types FOR INSERT TO authenticated WITH CHECK (( SELECT public.rls_has('training_types.edit'::text) AS rls_has));

CREATE POLICY "Delete training types" ON public.training_types FOR DELETE TO authenticated USING (( SELECT public.rls_has('training_types.edit'::text) AS rls_has));

CREATE POLICY "Edit training types" ON public.training_types FOR UPDATE TO authenticated USING (( SELECT public.rls_has('training_types.edit'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('training_types.edit'::text) AS rls_has));

CREATE POLICY "Read training types" ON public.training_types FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.training_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.training_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.training_session_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training session types" ON public.training_session_types FOR INSERT TO authenticated WITH CHECK ((public.training_session_editable(session_id) AND public.training_session_is_planned(session_id)));

CREATE POLICY "Read training session types" ON public.training_session_types FOR SELECT TO authenticated USING (public.training_session_visible(session_id));

CREATE POLICY "Remove training session types" ON public.training_session_types FOR DELETE TO authenticated USING ((public.training_session_editable(session_id) AND public.training_session_is_planned(session_id)));

CREATE POLICY mfa_required ON public.training_session_types AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training sessions" ON public.training_sessions FOR INSERT TO authenticated WITH CHECK (((status = 'planned'::text) AND (created_by_user_id = ( SELECT auth.uid() AS uid)) AND (( SELECT public.rls_has('trainings.edit.all'::text) AS rls_has) OR ( SELECT public.rls_has('trainings.edit.reports'::text) AS rls_has))));

CREATE POLICY "Delete planned training sessions" ON public.training_sessions FOR DELETE TO authenticated USING (((status = 'planned'::text) AND public.training_session_editable(id)));

CREATE POLICY "Edit training sessions" ON public.training_sessions FOR UPDATE TO authenticated USING (public.training_session_editable(id)) WITH CHECK (public.training_session_editable(id));

CREATE POLICY "Read training sessions" ON public.training_sessions FOR SELECT TO authenticated USING (((created_by_user_id = ( SELECT auth.uid() AS uid)) OR public.training_session_visible(id)));

CREATE POLICY mfa_required ON public.training_sessions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.training_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER training_sessions_guard BEFORE UPDATE ON public.training_sessions FOR EACH ROW EXECUTE FUNCTION public.training_sessions_guard();

CREATE TRIGGER training_sessions_keep_proofs BEFORE DELETE ON public.training_sessions FOR EACH ROW EXECUTE FUNCTION public.training_sessions_keep_proofs();

ALTER TABLE public.training_session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training session participants" ON public.training_session_participants FOR INSERT TO authenticated WITH CHECK ((public.training_session_editable(session_id) AND public.user_training_access_for_me(user_id, 'edit'::text) AND (attended OR public.training_session_is_planned(session_id))));

CREATE POLICY "Read training session participants" ON public.training_session_participants FOR SELECT TO authenticated USING (public.training_session_visible(session_id));

CREATE POLICY "Remove training session participants" ON public.training_session_participants FOR DELETE TO authenticated USING ((public.training_session_editable(session_id) AND public.training_session_is_planned(session_id)));

CREATE POLICY "Tick training session participants" ON public.training_session_participants FOR UPDATE TO authenticated USING ((public.training_session_editable(session_id) AND public.training_session_is_planned(session_id))) WITH CHECK ((public.training_session_editable(session_id) AND public.training_session_is_planned(session_id)));

CREATE POLICY mfa_required ON public.training_session_participants AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER training_session_participants_after AFTER INSERT ON public.training_session_participants FOR EACH ROW EXECUTE FUNCTION public.training_session_participants_after();

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training records" ON public.training_records FOR INSERT TO authenticated WITH CHECK (public.user_training_access_for_me(user_id, 'edit'::text));

CREATE POLICY "Edit training records" ON public.training_records FOR UPDATE TO authenticated USING (public.user_training_access_for_me(user_id, 'edit'::text)) WITH CHECK (public.user_training_access_for_me(user_id, 'edit'::text));

CREATE POLICY "Read training records" ON public.training_records FOR SELECT TO authenticated USING (public.user_training_access_for_me(user_id, 'view'::text));

CREATE POLICY mfa_required ON public.training_records AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.training_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

CREATE TRIGGER training_records_set_valid_until BEFORE INSERT OR UPDATE OF completed_on, training_type_id ON public.training_records FOR EACH ROW EXECUTE FUNCTION public.training_records_set_valid_until();

CREATE TRIGGER training_records_taught_instructions AFTER INSERT OR UPDATE ON public.training_records FOR EACH ROW EXECUTE FUNCTION public.training_records_taught_instructions();

ALTER TABLE public.training_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training requirements" ON public.training_requirements FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('training_types.edit'::text) AS rls_has) OR ((user_id IS NOT NULL) AND public.user_training_access_for_me(user_id, 'edit'::text))));

CREATE POLICY "Delete training requirements" ON public.training_requirements FOR DELETE TO authenticated USING ((( SELECT public.rls_has('training_types.edit'::text) AS rls_has) OR ((user_id IS NOT NULL) AND public.user_training_access_for_me(user_id, 'edit'::text))));

CREATE POLICY "Read training requirements" ON public.training_requirements FOR SELECT TO authenticated USING (true);

CREATE POLICY mfa_required ON public.training_requirements AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.training_exemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add training exemptions" ON public.training_exemptions FOR INSERT TO authenticated WITH CHECK (public.user_training_access_for_me(user_id, 'edit'::text));

CREATE POLICY "Delete training exemptions" ON public.training_exemptions FOR DELETE TO authenticated USING (public.user_training_access_for_me(user_id, 'edit'::text));

CREATE POLICY "Edit training exemptions" ON public.training_exemptions FOR UPDATE TO authenticated USING (public.user_training_access_for_me(user_id, 'edit'::text)) WITH CHECK (public.user_training_access_for_me(user_id, 'edit'::text));

CREATE POLICY "Read training exemptions" ON public.training_exemptions FOR SELECT TO authenticated USING (public.user_training_access_for_me(user_id, 'view'::text));

CREATE POLICY mfa_required ON public.training_exemptions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.training_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_required ON public.training_reminder_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.operating_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete unpublished operating instructions" ON public.operating_instructions FOR DELETE TO authenticated USING ((( SELECT public.rls_has('operating_instructions.edit.all'::text) AS rls_has) AND (NOT (EXISTS ( SELECT 1
   FROM public.operating_instruction_versions v
  WHERE ((v.instruction_id = operating_instructions.id) AND (v.status = ANY (ARRAY['published'::text, 'archived'::text]))))))));

CREATE POLICY "Edit operating instructions" ON public.operating_instructions FOR UPDATE TO authenticated USING (( SELECT public.rls_has('operating_instructions.edit.all'::text) AS rls_has)) WITH CHECK (( SELECT public.rls_has('operating_instructions.edit.all'::text) AS rls_has));

CREATE POLICY "Read operating instructions" ON public.operating_instructions FOR SELECT TO authenticated USING (( SELECT public.rls_has('operating_instructions.view.all'::text) AS rls_has));

CREATE POLICY mfa_required ON public.operating_instructions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER operating_instructions_guard BEFORE UPDATE ON public.operating_instructions FOR EACH ROW EXECUTE FUNCTION public.operating_instructions_guard();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.operating_instructions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.operating_instruction_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delete operating instruction drafts" ON public.operating_instruction_versions FOR DELETE TO authenticated USING (((status = 'draft'::text) AND public.operating_instruction_editable(instruction_id)));

CREATE POLICY "Edit operating instruction drafts" ON public.operating_instruction_versions FOR UPDATE TO authenticated USING (((status = 'draft'::text) AND public.operating_instruction_editable(instruction_id))) WITH CHECK (((status = 'draft'::text) AND public.operating_instruction_editable(instruction_id)));

CREATE POLICY "Read operating instruction versions" ON public.operating_instruction_versions FOR SELECT TO authenticated USING ((((status = ANY (ARRAY['published'::text, 'archived'::text])) AND ( SELECT public.rls_has('operating_instructions.view.all'::text) AS rls_has)) OR (created_by_user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.rls_has('operating_instructions.approve'::text) AS rls_has) OR public.operating_instruction_editable(instruction_id)));

CREATE POLICY mfa_required ON public.operating_instruction_versions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER operating_instruction_versions_guard BEFORE INSERT OR UPDATE ON public.operating_instruction_versions FOR EACH ROW EXECUTE FUNCTION public.operating_instruction_versions_guard();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.operating_instruction_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.operating_instruction_texts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add operating instruction texts" ON public.operating_instruction_texts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.operating_instruction_versions v
  WHERE ((v.id = operating_instruction_texts.version_id) AND (((v.status = 'draft'::text) AND public.operating_instruction_editable(v.instruction_id)) OR ((v.status = 'published'::text) AND public.rls_has('operating_instructions.approve'::text)))))));

CREATE POLICY "Delete operating instruction texts" ON public.operating_instruction_texts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.operating_instruction_versions v
  WHERE ((v.id = operating_instruction_texts.version_id) AND (((v.status = 'draft'::text) AND public.operating_instruction_editable(v.instruction_id)) OR ((v.status = 'published'::text) AND public.rls_has('operating_instructions.approve'::text)))))));

CREATE POLICY "Edit operating instruction texts" ON public.operating_instruction_texts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.operating_instruction_versions v
  WHERE ((v.id = operating_instruction_texts.version_id) AND (((v.status = 'draft'::text) AND public.operating_instruction_editable(v.instruction_id)) OR ((v.status = 'published'::text) AND public.rls_has('operating_instructions.approve'::text))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.operating_instruction_versions v
  WHERE ((v.id = operating_instruction_texts.version_id) AND (((v.status = 'draft'::text) AND public.operating_instruction_editable(v.instruction_id)) OR ((v.status = 'published'::text) AND public.rls_has('operating_instructions.approve'::text)))))));

CREATE POLICY "Read operating instruction texts" ON public.operating_instruction_texts FOR SELECT TO authenticated USING (public.operating_instruction_version_visible(version_id));

CREATE POLICY mfa_required ON public.operating_instruction_texts AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER operating_instruction_texts_guard BEFORE INSERT OR DELETE OR UPDATE ON public.operating_instruction_texts FOR EACH ROW EXECUTE FUNCTION public.operating_instruction_texts_guard();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.operating_instruction_texts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_and_by();

ALTER TABLE public.operating_instruction_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add operating instruction assets" ON public.operating_instruction_assets FOR INSERT TO authenticated WITH CHECK (public.operating_instruction_editable(instruction_id));

CREATE POLICY "Read operating instruction assets" ON public.operating_instruction_assets FOR SELECT TO authenticated USING (( SELECT public.rls_has('operating_instructions.view.all'::text) AS rls_has));

CREATE POLICY "Remove operating instruction assets" ON public.operating_instruction_assets FOR DELETE TO authenticated USING (public.operating_instruction_editable(instruction_id));

CREATE POLICY mfa_required ON public.operating_instruction_assets AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.operating_instruction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read operating instruction log" ON public.operating_instruction_log FOR SELECT TO authenticated USING (( SELECT public.rls_has('operating_instructions.view.all'::text) AS rls_has));

CREATE POLICY mfa_required ON public.operating_instruction_log AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.training_type_operating_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Link training type instructions" ON public.training_type_operating_instructions FOR INSERT TO authenticated WITH CHECK ((( SELECT public.rls_has('training_types.edit'::text) AS rls_has) OR public.operating_instruction_editable(instruction_id)));

CREATE POLICY "Read training type instructions" ON public.training_type_operating_instructions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Unlink training type instructions" ON public.training_type_operating_instructions FOR DELETE TO authenticated USING ((( SELECT public.rls_has('training_types.edit'::text) AS rls_has) OR public.operating_instruction_editable(instruction_id)));

CREATE POLICY mfa_required ON public.training_type_operating_instructions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.training_record_operating_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read taught instructions" ON public.training_record_operating_instructions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.training_records r
  WHERE (r.id = training_record_operating_instructions.record_id))));

CREATE POLICY mfa_required ON public.training_record_operating_instructions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.position_holders_effective WITH (security_invoker='on') AS
 SELECT h.position_id,
    h.user_id,
    'direct'::text AS source,
    NULL::uuid AS team_id,
    h.valid_from,
    h.valid_to,
    h.id AS holder_id
   FROM (public.position_holders h
     JOIN public.users u ON (((u.id = h.user_id) AND (NOT u.has_left))))
  WHERE ((h.valid_from <= public.position_today()) AND ((h.valid_to IS NULL) OR (h.valid_to >= public.position_today())))
UNION ALL
 SELECT pt.position_id,
    ug.user_id,
    'team'::text AS source,
    pt.team_id,
    NULL::date AS valid_from,
    NULL::date AS valid_to,
    NULL::uuid AS holder_id
   FROM ((public.position_teams pt
     JOIN public.user_teams ug ON ((ug.team_id = pt.team_id)))
     JOIN public.users u ON (((u.id = ug.user_id) AND (NOT u.has_left))));


ALTER VIEW public.position_holders_effective OWNER TO postgres;

REVOKE ALL ON TABLE public.position_holders_effective FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_holders_effective TO authenticated;
GRANT ALL ON TABLE public.position_holders_effective TO service_role;

CREATE VIEW public.position_fit_status WITH (security_invoker='on') AS
 SELECT user_id,
    review_id,
    reviewed_on,
    next_review_on,
    result,
    measure_status,
    deviation_open,
    position_count,
    status
   FROM public.position_fit_status_for_me() position_fit_status_for_me(user_id, review_id, reviewed_on, next_review_on, result, measure_status, deviation_open, position_count, status);


ALTER VIEW public.position_fit_status OWNER TO postgres;

REVOKE ALL ON TABLE public.position_fit_status FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.position_fit_status TO authenticated;
GRANT ALL ON TABLE public.position_fit_status TO service_role;

CREATE VIEW public.training_records_overview WITH (security_invoker='true') AS
 SELECT r.id,
    r.user_id,
    r.training_type_id,
    r.completed_on,
    r.valid_until,
    r.trainer,
    r.note,
    r.created_at,
    r.updated_at,
    r.created_by_user_id,
    r.updated_by_user_id,
    tt.name AS type_name,
    tt.category_phrase_id,
    tt.validity_months,
    tt.reminder_days_before,
    tt.requires_certificate,
    tt.retention_years_after_exit,
    u.name AS person_name,
    ( SELECT p.exit_date
           FROM public.person_private p
          WHERE (p.user_id = r.user_id)) AS exit_date,
    ( SELECT ((p.exit_date + make_interval(years => tt.retention_years_after_exit)))::date AS date
           FROM public.person_private p
          WHERE (p.user_id = r.user_id)) AS retain_until,
    public.training_status_of(r.valid_until, tt.reminder_days_before) AS status,
    (NOT (EXISTS ( SELECT 1
           FROM public.training_records n
          WHERE ((n.user_id = r.user_id) AND (n.training_type_id = r.training_type_id) AND (ROW(n.completed_on, n.created_at) > ROW(r.completed_on, r.created_at)))))) AS is_latest,
    ( SELECT count(*) AS count
           FROM public.attachments a
          WHERE (((a.entity_type = 'training_records'::text) AND (a.entity_id = r.id)) OR ((a.entity_type = 'training_sessions'::text) AND (a.entity_id = r.session_id)))) AS proof_count,
    r.session_id
   FROM ((public.training_records r
     JOIN public.training_types tt ON ((tt.id = r.training_type_id)))
     JOIN public.users u ON ((u.id = r.user_id)));


ALTER VIEW public.training_records_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.training_records_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_records_overview TO authenticated;
GRANT ALL ON TABLE public.training_records_overview TO service_role;

CREATE VIEW public.training_sessions_overview WITH (security_invoker='true') AS
 SELECT id,
    held_on,
    location,
    trainer,
    extra_content,
    note,
    status,
    confirmed_at,
    confirmed_by_user_id,
    created_at,
    updated_at,
    created_by_user_id,
    updated_by_user_id,
    COALESCE(( SELECT array_agg(t.training_type_id ORDER BY tt.sort_order, tt.name) AS array_agg
           FROM (public.training_session_types t
             JOIN public.training_types tt ON ((tt.id = t.training_type_id)))
          WHERE (t.session_id = s.id)), '{}'::uuid[]) AS training_type_ids,
    COALESCE(( SELECT string_agg(tt.name, ', '::text ORDER BY tt.sort_order, tt.name) AS string_agg
           FROM (public.training_session_types t
             JOIN public.training_types tt ON ((tt.id = t.training_type_id)))
          WHERE (t.session_id = s.id)), ''::text) AS type_names,
    (( SELECT count(*) AS count
           FROM public.training_session_participants p
          WHERE (p.session_id = s.id)))::integer AS participant_count,
    (( SELECT count(*) AS count
           FROM public.training_session_participants p
          WHERE ((p.session_id = s.id) AND p.attended)))::integer AS attended_count,
    (( SELECT count(*) AS count
           FROM public.attachments a
          WHERE ((a.entity_type = 'training_sessions'::text) AND (a.entity_id = s.id))))::integer AS proof_count,
    (EXISTS ( SELECT 1
           FROM (public.training_session_types t
             JOIN public.training_types tt ON ((tt.id = t.training_type_id)))
          WHERE ((t.session_id = s.id) AND tt.requires_certificate))) AS requires_certificate,
    public.training_session_editable(id) AS can_edit
   FROM public.training_sessions s;


ALTER VIEW public.training_sessions_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.training_sessions_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_sessions_overview TO authenticated;
GRANT ALL ON TABLE public.training_sessions_overview TO service_role;

CREATE VIEW public.training_status WITH (security_invoker='on') AS
 SELECT user_id,
    training_type_id,
    record_id,
    completed_on,
    valid_until,
    status,
    required,
    exempt,
    proof_count,
    requires_certificate
   FROM public.training_status_for_me() training_status_for_me(user_id, training_type_id, record_id, completed_on, valid_until, status, required, exempt, proof_count, requires_certificate);


ALTER VIEW public.training_status OWNER TO postgres;

REVOKE ALL ON TABLE public.training_status FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.training_status TO authenticated;
GRANT ALL ON TABLE public.training_status TO service_role;

CREATE VIEW public.operating_instructions_overview WITH (security_invoker='on') AS
 SELECT i.id,
    i.number,
    i.legacy_number,
    i.kind,
    i.owner_user_id,
    i.review_due_on,
    i.active,
    i.created_at,
    i.updated_at,
    pub.id AS published_version_id,
    pub.version_no AS published_version_no,
    pub.valid_from,
    pub.signal_word,
    open.id AS open_version_id,
    open.version_no AS open_version_no,
    open.status AS open_status,
    COALESCE(tde.title, ''::text) AS title,
    COALESCE(ten.title, ''::text) AS title_en,
    COALESCE(tde.work_area, ''::text) AS work_area,
    COALESCE(tde.subject, ''::text) AS subject,
    COALESCE(pub.signs, open.signs, '{}'::jsonb) AS signs,
    ( SELECT COALESCE(array_agg(t.language ORDER BY t.language), '{}'::text[]) AS "coalesce"
           FROM public.operating_instruction_texts t
          WHERE (t.version_id = COALESCE(pub.id, open.id))) AS languages,
    ( SELECT count(*) AS count
           FROM public.operating_instruction_assets a
          WHERE (a.instruction_id = i.id)) AS asset_count,
    public.operating_instruction_editable(i.id) AS can_edit
   FROM ((((public.operating_instructions i
     LEFT JOIN public.operating_instruction_versions pub ON (((pub.instruction_id = i.id) AND (pub.status = 'published'::text))))
     LEFT JOIN public.operating_instruction_versions open ON (((open.instruction_id = i.id) AND (open.status = ANY (ARRAY['draft'::text, 'submitted'::text])))))
     LEFT JOIN public.operating_instruction_texts tde ON (((tde.version_id = COALESCE(pub.id, open.id)) AND (tde.language = 'de'::text))))
     LEFT JOIN public.operating_instruction_texts ten ON (((ten.version_id = COALESCE(pub.id, open.id)) AND (ten.language = 'en'::text))));


ALTER VIEW public.operating_instructions_overview OWNER TO postgres;

REVOKE ALL ON TABLE public.operating_instructions_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.operating_instructions_overview TO authenticated;
GRANT ALL ON TABLE public.operating_instructions_overview TO service_role;

CREATE TRIGGER users_birthday_hidden BEFORE UPDATE OF birthday_hidden, birthday_month, birthday_day ON public.users FOR EACH ROW EXECUTE FUNCTION public.users_birthday_hidden();

CREATE TRIGGER user_teams_position_log_delete AFTER DELETE ON public.user_teams REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.user_teams_position_log_delete();

CREATE TRIGGER user_teams_position_log_insert AFTER INSERT ON public.user_teams REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.user_teams_position_log_insert();

-- Hand-written part of the people module (after the objects copied from COMPASS).

ALTER TABLE ONLY public.operating_instructions ALTER COLUMN number SET DEFAULT nextval('public.operating_instruction_number_seq'::regclass);
ALTER SEQUENCE public.operating_instruction_number_seq OWNED BY public.operating_instructions.number;

-- Teams for trainings and positions (COMPASS groups.usable_for_trainings / usable_for_positions; platform team use registry).
select public.team_use_register('trainings', 'people', 'Training requirements and training sessions');
select public.team_use_register('positions', 'people', 'Positions (the teams a position belongs to)');

-- Settings (COMPASS app_settings.operating_instruction_languages; key/value on the platform).
select public.app_setting_register('operating_instruction_languages', 'people', 'json', '["de", "en"]', true,
  'Languages an operating instruction is written in');
insert into public.app_settings (key, value)
select r.key, coalesce(r.default_value, '') from public.app_setting_registry r where r.module = 'people'
on conflict (key) do nothing;

-- Permissions (COMPASS registry rows) and their implications.
insert into public.permissions (key, module, action, scope, sort_order) values
  ('people.edit', 'people', 'edit', null, 700),
  ('trainings.view.own', 'trainings', 'view', 'own', 710),
  ('trainings.view.reports', 'trainings', 'view', 'reports', 711),
  ('trainings.view.all', 'trainings', 'view', 'all', 712),
  ('trainings.edit.reports', 'trainings', 'edit', 'reports', 713),
  ('trainings.edit.all', 'trainings', 'edit', 'all', 714),
  ('training_types.edit', 'training_types', 'edit', null, 715),
  ('job_descriptions.view.own', 'job_descriptions', 'view', 'own', 720),
  ('job_descriptions.view.team', 'job_descriptions', 'view', 'team', 721),
  ('job_descriptions.view.all', 'job_descriptions', 'view', 'all', 722),
  ('job_descriptions.edit.team', 'job_descriptions', 'edit', 'team', 723),
  ('job_descriptions.edit.all', 'job_descriptions', 'edit', 'all', 724),
  ('fit_reviews.view.own', 'fit_reviews', 'view', 'own', 730),
  ('fit_reviews.view.reports', 'fit_reviews', 'view', 'reports', 731),
  ('fit_reviews.view.all', 'fit_reviews', 'view', 'all', 732),
  ('fit_reviews.edit.reports', 'fit_reviews', 'edit', 'reports', 733),
  ('fit_reviews.edit.all', 'fit_reviews', 'edit', 'all', 734),
  ('operating_instructions.view.all', 'operating_instructions', 'view', 'all', 740),
  ('operating_instructions.edit.own', 'operating_instructions', 'edit', 'own', 741),
  ('operating_instructions.edit.all', 'operating_instructions', 'edit', 'all', 742),
  ('operating_instructions.approve', 'operating_instructions', 'approve', null, 743);
insert into public.permission_implies (permission, implies) values
  ('trainings.edit.all', 'trainings.view.all'), ('trainings.edit.reports', 'trainings.view.reports'),
  ('job_descriptions.edit.team', 'job_descriptions.view.team'), ('job_descriptions.edit.all', 'job_descriptions.view.all'),
  ('fit_reviews.edit.all', 'fit_reviews.view.all'), ('fit_reviews.edit.reports', 'fit_reviews.view.reports'),
  ('operating_instructions.edit.own', 'operating_instructions.view.all'),
  ('operating_instructions.edit.all', 'operating_instructions.view.all'),
  ('operating_instructions.approve', 'operating_instructions.view.all');

-- Record types (COMPASS user_has_access / record_moderator, branches 'training_records', 'training_sessions',
-- 'position_holders'): attachments (training proofs, appointment letters) and notes hang on them. An action other than
-- 'view' counts as 'edit' (COMPASS maps 'check' to 'edit' for these).
create function public.training_records_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'people.edit' = any (public.user_permissions(p_user_id));
  end if;
  if p_action = 'check' then
    p_action := 'edit';
  end if;
  return exists (
    select 1 from public.training_records r
    where r.id = p_entity_id and public.user_training_access(p_user_id, r.user_id, p_action)
  );
end $$;
create function public.training_sessions_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'people.edit' = any (public.user_permissions(p_user_id));
  end if;
  return public.training_session_access(p_user_id, p_entity_id, case when p_action = 'view' then 'view' else 'edit' end);
end $$;
create function public.position_holders_access(p_user_id uuid, p_entity_id uuid, p_action text) returns boolean
  language plpgsql stable security definer set search_path to '' as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'job_descriptions.edit.all' = any (public.user_permissions(p_user_id));
  end if;
  -- Appointment letters: the person themselves and job_descriptions.view.all read, edit.all adds.
  return exists (
    select 1 from public.position_holders h
    where h.id = p_entity_id
      and ((p_action = 'view' and h.user_id = p_user_id)
           or ('job_descriptions.' || case when p_action = 'view' then 'view' else 'edit' end || '.all') = any (public.user_permissions(p_user_id)))
  );
end $$;
revoke all on function public.training_records_access(uuid, uuid, text), public.training_sessions_access(uuid, uuid, text),
  public.position_holders_access(uuid, uuid, text) from public, anon;
grant execute on function public.training_records_access(uuid, uuid, text), public.training_sessions_access(uuid, uuid, text),
  public.position_holders_access(uuid, uuid, text) to authenticated, service_role;
select public.entity_type_register('training_records', 'people', 'training_records_access', null, 'A training record', null, null, null);
select public.entity_type_register('training_sessions', 'people', 'training_sessions_access', null, 'A training session', null, null, null);
select public.entity_type_register('position_holders', 'people', 'position_holders_access', null, 'An appointment to a position', null, null, null);

-- Notifications (COMPASS email_notification_types / push_notification_types and the types the functions send).
select public.notification_type_register('training_due_soon', 'people', true, 'Reminder: a training of yours is due soon', false, true);
select public.notification_type_register('training_expired', 'people', true, 'Reminder: a training of yours has expired', false, true);
select public.notification_type_register('training_missing', 'people', true, 'Reminder: a required training of yours is missing', false, true);
select public.notification_type_register('training_reinstruction', 'people', true, 'Reminder: a re-instruction is due', false, true);
select public.notification_type_register('training_digest', 'people', true, 'Trainings of your reports that are due', false, true);
select public.notification_type_register('fit_review_digest', 'people', true, 'Fit reviews of your reports that are due', false, false);
select public.notification_type_register('job_description_submitted', 'people', false, 'A job description waits for your approval', true, false);
select public.notification_type_register('job_description_returned', 'people', false, 'A job description was returned to you', true, false);
select public.notification_type_register('job_description_published', 'people', false, 'A job description was published', true, false);
select public.notification_type_register('operating_instruction_submitted', 'people', false, 'An operating instruction waits for your approval', false, false);
select public.notification_type_register('operating_instruction_returned', 'people', false, 'An operating instruction was returned to you', false, false);
select public.notification_type_register('operating_instruction_published', 'people', false, 'An operating instruction was published', false, false);

-- Jobs (COMPASS cron.job rows).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('send-training-reminders', '10 5 * * 1-5', 'select public.send_training_reminders()');
  perform cron.schedule('people-refresh-has-left', '5 0 * * *', 'select public.people_refresh_has_left()');
  perform cron.schedule('send-fit-review-reminders', '20 5 * * 1', 'select public.send_fit_review_reminders()');
exception when others then
  raise notice 'pg_cron unavailable (%): schedule send_training_reminders(), people_refresh_has_left() and send_fit_review_reminders() externally', sqlerrm;
end $$;

-- Search: people, positions, trainings (COMPASS global_search, blocks 'people', 'positions', 'trainings'; run as the caller, so
-- the tables' policies decide what is found). A phrase's text: translations->>'de' (was text_de), then text_en.
create function public.people_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
  -- People of the directory (former employees are hidden, like in the directory itself).
  select 'people'::text, u.id,
    greatest(public.search_field_score(u.name, p_term), public.search_field_score(u."position", p_term) * 0.7,
             public.search_field_score(u.email, p_term) * 0.7)::real,
    null::bigint, u.name, nullif(concat_ws(' · ', u."position", u.site), ''), null::text,
    null::text, null::uuid, null::text, null::text, u.created_at, null::uuid
  from public.users u
  where not u.has_left
    and (u.name ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) u.name)
      or u."position" ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) u."position")
      or u.email ilike '%' || p_term || '%')
  order by 3 desc limit 8;
$$;
create function public.positions_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
  select 'positions'::text, p.id,
    greatest(public.search_field_score(p.name, p_term), public.search_field_score(p.code, p_term))::real,
    null::bigint, p.name, nullif(concat_ws(' · ', p.code, p.site), ''), null::text,
    null::text, null::uuid, null::text, null::text, p.created_at, null::uuid
  from public.positions p
  where p.active
    and (p.name ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) p.name)
      or p.code ilike '%' || p_term || '%')
  order by 3 desc limit 8;
$$;
create function public.trainings_search(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable set search_path to '' as $$
  select 'trainings'::text, tt.id,
    greatest(public.search_field_score(tt.name, p_term), public.search_field_score(tt.provider, p_term) * 0.7,
             public.search_field_score(tt.description, p_term) * 0.6)::real,
    null::bigint, tt.name, nullif(concat_ws(' · ', coalesce(ph.translations ->> 'de', ph.text_en), tt.provider), ''), null::text,
    null::text, null::uuid, null::text, null::text, tt.created_at, null::uuid
  from public.training_types tt
  left join public.phrases ph on ph.id = tt.category_phrase_id
  where tt.active
    and (tt.name ilike '%' || p_term || '%' or (p_fuzzy and p_term operator(extensions.<%) tt.name)
      or tt.provider ilike '%' || p_term || '%' or tt.description ilike '%' || p_term || '%')
  order by 3 desc limit 8;
$$;
revoke all on function public.people_search(text, boolean, bigint), public.positions_search(text, boolean, bigint),
  public.trainings_search(text, boolean, bigint) from public, anon;
grant execute on function public.people_search(text, boolean, bigint), public.positions_search(text, boolean, bigint),
  public.trainings_search(text, boolean, bigint) to authenticated, service_role;
select public.search_source_register('people', 'people', 'people_search', 'People of the directory by name, position and email');
select public.search_source_register('positions', 'people', 'positions_search', 'Positions by name and code');
select public.search_source_register('trainings', 'people', 'trainings_search', 'Training types by name, provider and description');

