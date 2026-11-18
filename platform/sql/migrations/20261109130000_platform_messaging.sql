-- Platform messaging: conversations, messages, mentions, reactions, polls, team follows.
-- Source: COMPASS database, copied 1:1. Renames: groups -> teams, token @[group:] -> @[team:]; conversation kind "group" (group chat) stays.

-- Extracted from the old app's schema dump: objects copied as they are, only the renames applied. Change them with a new migration.


set check_function_bodies = false;


CREATE FUNCTION public.comment_search_text(p_body text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select regexp_replace(coalesce(p_body, ''), '@\[user:[0-9a-fA-F-]{36}\]\s?', '', 'g') $$;

REVOKE ALL ON FUNCTION public.comment_search_text(p_body text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.comment_search_text(p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.comment_search_text(p_body text) TO authenticated;
GRANT ALL ON FUNCTION public.comment_search_text(p_body text) TO service_role;

CREATE TABLE public.conversations (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    kind text NOT NULL,
    anchor_type text,
    anchor_id uuid,
    title text,
    team_id uuid,
    pinned boolean DEFAULT false NOT NULL,
    pinned_at timestamp with time zone,
    last_message_at timestamp with time zone,
    message_count integer DEFAULT 0 NOT NULL,
    first_message_id uuid,
    created_by_user_id uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by_user_id uuid,
    direct_key text,
    CONSTRAINT conversations_anchor CHECK ((((kind = ANY (ARRAY['record'::text, 'post'::text])) AND (anchor_type IS NOT NULL) AND (anchor_id IS NOT NULL)) OR ((kind = ANY (ARRAY['direct'::text, 'group'::text])) AND (anchor_type IS NULL) AND (anchor_id IS NULL)))),
    CONSTRAINT conversations_direct_key CHECK (((kind = 'direct'::text) = (direct_key IS NOT NULL))),
    CONSTRAINT conversations_kind_check CHECK ((kind = ANY (ARRAY['record'::text, 'post'::text, 'direct'::text, 'group'::text])))
);

REVOKE ALL ON TABLE public.conversations FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.conversations TO authenticated;
GRANT ALL ON TABLE public.conversations TO service_role;

CREATE TABLE public.conversation_participants (
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    taking_part boolean DEFAULT true NOT NULL,
    level text DEFAULT 'all'::text NOT NULL,
    last_read_at timestamp with time zone,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_participants_level_check CHECK ((level = ANY (ARRAY['all'::text, 'mentions'::text, 'mute'::text])))
);

REVOKE ALL ON TABLE public.conversation_participants FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.conversation_participants TO authenticated;
GRANT ALL ON TABLE public.conversation_participants TO service_role;

CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v7() NOT NULL,
    conversation_id uuid NOT NULL,
    author_user_id uuid DEFAULT auth.uid(),
    body text NOT NULL,
    reply_to_message_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    reactions jsonb DEFAULT '{}'::jsonb NOT NULL,
    poll jsonb
);

REVOKE ALL ON TABLE public.messages FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;

CREATE TABLE public.message_mentions (
    message_id uuid NOT NULL,
    mentioned_user_id uuid NOT NULL
);

REVOKE ALL ON TABLE public.message_mentions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.message_mentions TO authenticated;
GRANT ALL ON TABLE public.message_mentions TO service_role;

CREATE TABLE public.message_reactions (
    message_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    reaction text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_reactions_reaction_check CHECK ((reaction = ANY (ARRAY['thumbs_up'::text, 'check'::text, 'heart'::text, 'laugh'::text, 'surprised'::text, 'thanks'::text])))
);

REVOKE ALL ON TABLE public.message_reactions FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.message_reactions TO authenticated;
GRANT ALL ON TABLE public.message_reactions TO service_role;

CREATE TABLE public.poll_votes (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    option smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT poll_votes_option_check CHECK ((option >= 0))
);

REVOKE ALL ON TABLE public.poll_votes FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.poll_votes TO authenticated;
GRANT ALL ON TABLE public.poll_votes TO service_role;

CREATE TABLE public.team_follows (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    team_id uuid NOT NULL,
    level text NOT NULL,
    CONSTRAINT team_follows_level_check CHECK ((level = ANY (ARRAY['all'::text, 'mentions'::text, 'mute'::text])))
);

REVOKE ALL ON TABLE public.team_follows FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.team_follows TO authenticated;
GRANT ALL ON TABLE public.team_follows TO service_role;

CREATE TABLE public.team_reads (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    team_id uuid NOT NULL,
    last_read_at timestamp with time zone DEFAULT now() NOT NULL
);

REVOKE ALL ON TABLE public.team_reads FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.team_reads TO authenticated;
GRANT ALL ON TABLE public.team_reads TO service_role;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

CREATE INDEX conversations_anchor_type_anchor_id_idx ON public.conversations USING btree (anchor_type, anchor_id);

CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at DESC);

CREATE UNIQUE INDEX conversations_one_per_pair ON public.conversations USING btree (direct_key) WHERE (kind = 'direct'::text);

CREATE UNIQUE INDEX conversations_one_per_record ON public.conversations USING btree (anchor_type, anchor_id) WHERE (kind = 'record'::text);

CREATE INDEX conversations_posts_by_team ON public.conversations USING btree (anchor_id, created_at DESC) WHERE ((kind = 'post'::text) AND (deleted_at IS NULL));

CREATE INDEX conversations_team_activity ON public.conversations USING btree (team_id, last_message_at DESC) WHERE (kind = 'record'::text);

CREATE INDEX conversations_team_id_idx ON public.conversations USING btree (team_id) WHERE (team_id IS NOT NULL);

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (conversation_id, user_id);

CREATE INDEX conversation_participants_user_id_idx ON public.conversation_participants USING btree (user_id) WHERE taking_part;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

CREATE INDEX messages_author_user_id_idx ON public.messages USING btree (author_user_id);

CREATE INDEX messages_comment_trgm_idx ON public.messages USING gin (public.comment_search_text(body) extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

CREATE INDEX messages_conversation_id_created_at_idx ON public.messages USING btree (conversation_id, created_at);

CREATE INDEX messages_reply_to_message_id_idx ON public.messages USING btree (reply_to_message_id) WHERE (reply_to_message_id IS NOT NULL);

ALTER TABLE ONLY public.message_mentions
    ADD CONSTRAINT message_mentions_pkey PRIMARY KEY (message_id, mentioned_user_id);

CREATE INDEX message_mentions_mentioned_user_id_idx ON public.message_mentions USING btree (mentioned_user_id);

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (message_id, user_id, reaction);

CREATE INDEX message_reactions_user_id_idx ON public.message_reactions USING btree (user_id);

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_pkey PRIMARY KEY (message_id, user_id, option);

CREATE INDEX poll_votes_user_id_idx ON public.poll_votes USING btree (user_id);

ALTER TABLE ONLY public.team_follows
    ADD CONSTRAINT team_follows_pkey PRIMARY KEY (user_id, team_id);

CREATE INDEX team_follows_group_id_idx ON public.team_follows USING btree (team_id);

ALTER TABLE ONLY public.team_reads
    ADD CONSTRAINT team_reads_pkey PRIMARY KEY (user_id, team_id);

CREATE INDEX team_reads_group_id_idx ON public.team_reads USING btree (team_id);

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_first_message_fk FOREIGN KEY (first_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_participants
    ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.message_mentions
    ADD CONSTRAINT message_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_mentions
    ADD CONSTRAINT message_mentions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_reactions
    ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_follows
    ADD CONSTRAINT team_follows_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_follows
    ADD CONSTRAINT team_follows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_reads
    ADD CONSTRAINT team_reads_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_reads
    ADD CONSTRAINT team_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

CREATE FUNCTION public.conversation_can(p_conversation_id uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.conversation_access(auth.uid(), p_conversation_id, p_action); $$;

REVOKE ALL ON FUNCTION public.conversation_can(p_conversation_id uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_can(p_conversation_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_can(p_conversation_id uuid, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.conversation_can(p_conversation_id uuid, p_action text) TO authenticated;

CREATE FUNCTION public.conversation_link(p_conversation_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case c.kind
    when 'record' then '/' || c.anchor_type || '/' || c.anchor_id
    else '/messages/' || c.id
  end
  from public.conversations c where c.id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.conversation_link(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_link(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_link(p_conversation_id uuid) TO service_role;

CREATE FUNCTION public.conversation_access(p_user_id uuid, p_conversation_id uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
begin
  if p_user_id is null then
    return false;
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if v_conversation.id is null or v_conversation.deleted_at is not null then
    return false;
  end if;
  if v_conversation.kind in ('direct', 'group') then
    if p_action = 'moderate' then
      return false;
    end if;
    if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and user_id = p_user_id) then
      return false;
    end if;
    -- Reading stays for good; writing stops when the other person can no longer sign in (left, locked, login removed).
    if p_action = 'post' and v_conversation.kind = 'direct' then
      return not exists (
        select 1 from public.conversation_participants p join public.users u on u.id = p.user_id
        where p.conversation_id = p_conversation_id and p.user_id <> p_user_id
          and (not u.has_login or u.has_left or u.locked_at is not null));
    end if;
    return true;
  end if;
  if p_action = 'moderate' then
    -- A record conversation is moderated by holders of the record module's edit.all (admin limits, decision 4); a post
    -- by whoever moderates its group (grant 'edit' on a group: an owner or a holder of messages.edit).
    if v_conversation.kind = 'post' then
      return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'edit');
    end if;
    return public.record_moderator(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id);
  end if;
  return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id,
                                case when p_action = 'view' then 'view' else 'check' end);
end;
$$;

REVOKE ALL ON FUNCTION public.conversation_access(p_user_id uuid, p_conversation_id uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_access(p_user_id uuid, p_conversation_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_access(p_user_id uuid, p_conversation_id uuid, p_action text) TO service_role;

CREATE FUNCTION public.conversation_label(p_conversation_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when c.kind = 'record' then case c.anchor_type
      when 'assets' then (select name from public.assets where id = c.anchor_id)
      when 'tickets' then (select '#' || ticket_number || ' ' || title from public.tickets where id = c.anchor_id)
      when 'goals' then (select '#' || goal_number || ' ' || title from public.goals where id = c.anchor_id)
      when 'tasks' then (select '#' || task_number || ' ' || title from public.tasks where id = c.anchor_id)
      else c.title end
    when c.kind = 'post' then coalesce(nullif(btrim(c.title), ''),
      (select public.message_excerpt(m.body, 60) from public.messages m where m.id = c.first_message_id))
    when c.kind = 'direct' then (
      select string_agg(coalesce(u.name, u.email), ', ' order by u.name)
      from public.conversation_participants p join public.users u on u.id = p.user_id
      where p.conversation_id = c.id and (p.user_id is distinct from auth.uid() or auth.uid() is null))
    else coalesce(nullif(btrim(c.title), ''), (
      select string_agg(n, ', ' order by n) || case when max(total) > 4 then ' +' || (max(total) - 4) else '' end
      from (
        select coalesce(u.name, u.email) as n, count(*) over () as total, row_number() over (order by u.name) as rn
        from public.conversation_participants p join public.users u on u.id = p.user_id
        where p.conversation_id = c.id and (p.user_id is distinct from auth.uid() or auth.uid() is null)
      ) x where rn <= 4))
  end
  from public.conversations c where c.id = p_conversation_id;
$$;

REVOKE ALL ON FUNCTION public.conversation_label(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_label(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_label(p_conversation_id uuid) TO service_role;

CREATE FUNCTION public.conversation_team(p_anchor_type text, p_anchor_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case p_anchor_type
    when 'tasks' then (select team_id from public.tasks where id = p_anchor_id)
    when 'tickets' then (select assigned_team_id from public.tickets where id = p_anchor_id)
    when 'goals' then (select team_id from public.goals where id = p_anchor_id)
  end;
$$;

REVOKE ALL ON FUNCTION public.conversation_team(p_anchor_type text, p_anchor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_team(p_anchor_type text, p_anchor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_team(p_anchor_type text, p_anchor_id uuid) TO service_role;

CREATE FUNCTION public.message_edit_window() RETURNS interval
    LANGUAGE sql IMMUTABLE
    AS $$ select interval '15 minutes' $$;

REVOKE ALL ON FUNCTION public.message_edit_window() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.message_edit_window() FROM PUBLIC;
GRANT ALL ON FUNCTION public.message_edit_window() TO service_role;
GRANT ALL ON FUNCTION public.message_edit_window() TO authenticated;

CREATE FUNCTION public.messages_a_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.conversations
  set last_message_at = new.created_at, message_count = message_count + 1, first_message_id = coalesce(first_message_id, new.id)
  where id = new.conversation_id;
  if new.author_user_id is not null then
    insert into public.conversation_participants (conversation_id, user_id, last_read_at)
    values (new.conversation_id, new.author_user_id, now())
    on conflict (conversation_id, user_id) do update set last_read_at = now(), taking_part = true;
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.messages_a_stats() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_a_stats() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_a_stats() TO service_role;

CREATE FUNCTION public.messages_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_at := now();
    end if;
    new.edited_at := null;
    new.deleted_at := null;
    new.reactions := '{}'::jsonb;
    if new.poll is not null and coalesce(current_setting('messaging.poll', true), '') <> '1' then
      raise exception 'A poll is added only with a new post';
    end if;
    if new.reply_to_message_id is not null and not exists (
      select 1 from public.messages r where r.id = new.reply_to_message_id and r.conversation_id = new.conversation_id
    ) then
      raise exception 'A reply points at a message of the same conversation';
    end if;
    return new;
  end if;
  if new.reactions is distinct from old.reactions and coalesce(current_setting('messaging.reactions', true), '') <> '1' then
    raise exception 'Reactions change only through message_reactions';
  end if;
  if new.poll is distinct from old.poll and coalesce(current_setting('messaging.poll', true), '') <> '1' then
    raise exception 'A poll changes only through poll_vote and poll_close';
  end if;
  -- message_delete() sets this for the length of its own statement.
  if coalesce(current_setting('messaging.rpc', true), '') = '1' then
    return new;
  end if;
  if new.conversation_id <> old.conversation_id or new.author_user_id is distinct from old.author_user_id
     or new.created_at <> old.created_at or new.reply_to_message_id is distinct from old.reply_to_message_id
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'Only the text of a message can be edited';
  end if;
  if new.body is distinct from old.body then
    -- The author corrects a message for 15 minutes after writing it (moderators delete, they never edit). Database
    -- work without a session (seeds, maintenance) is not limited.
    if auth.uid() is not null and old.created_at < now() - public.message_edit_window() then
      raise exception 'A message can only be edited for 15 minutes after it was written' using errcode = 'P0001', hint = 'edit_window';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.messages_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_guard() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_guard() TO service_role;

CREATE FUNCTION public.messages_b_mentions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
  v_ids uuid[];
  v_teams uuid[];
  v_old_groups uuid[] := '{}';
  v_target uuid;
  v_team_ids uuid[] := '{}';
  v_all uuid[];
  v_new_ids uuid[];
  v_author text;
  v_team_name text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  select coalesce(array_agg(distinct m[1]::uuid), '{}') into v_ids
  from regexp_matches(new.body, '@\[user:([0-9a-fA-F-]{36})\]', 'g') m;
  v_ids := array(
    select u from unnest(v_ids) u
    where exists (select 1 from public.users where id = u)
      and public.conversation_access(u, new.conversation_id, 'view')
  );

  select coalesce(array_agg(distinct m[1]::uuid), '{}') into v_teams
  from regexp_matches(new.body, '@\[team:([0-9a-fA-F-]{36})\]', 'g') m;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(distinct m[1]::uuid), '{}') into v_old_groups
    from regexp_matches(old.body, '@\[team:([0-9a-fA-F-]{36})\]', 'g') m;
  end if;
  if array_length(v_teams, 1) is not null then
    v_target := public.conversation_mention_team(v_conversation.anchor_type, v_conversation.anchor_id);
    if exists (select 1 from unnest(v_teams) g where g is distinct from v_target) then
      raise exception 'Only the team of this conversation can be mentioned';
    end if;
    -- A team mention added now needs the right; one kept from before an edit does not ask again.
    if not (v_target = any (v_old_groups))
       and not public.team_mention_allowed(new.author_user_id, v_conversation.anchor_type, v_conversation.anchor_id) then
      raise exception 'You may not mention the whole team here';
    end if;
    v_team_ids := array(
      select ug.user_id from public.user_teams ug join public.users u on u.id = ug.user_id
      where ug.team_id = v_target and u.has_login and not u.has_left
        and ug.user_id is distinct from new.author_user_id
        and public.conversation_access(ug.user_id, new.conversation_id, 'view'));
  end if;
  v_all := array(select distinct u from unnest(v_ids || v_team_ids) u);

  select coalesce(array_agg(u), '{}') into v_new_ids
  from unnest(v_all) u
  where not exists (select 1 from public.message_mentions where message_id = new.id and mentioned_user_id = u);

  delete from public.message_mentions where message_id = new.id and not (mentioned_user_id = any(v_all));
  insert into public.message_mentions (message_id, mentioned_user_id)
  select new.id, u from unnest(v_all) u
  on conflict do nothing;
  insert into public.conversation_participants (conversation_id, user_id)
  select new.conversation_id, u from unnest(v_all) u
  on conflict (conversation_id, user_id) do update set taking_part = true;

  v_new_ids := array(select u from unnest(v_new_ids) u where u is distinct from new.author_user_id);
  if array_length(v_new_ids, 1) is null then
    return null;
  end if;
  select coalesce(name, email, 'Someone') into v_author from public.users where id = new.author_user_id;
  -- Named on their own: a personal mention. Reached only through the team: a team mention.
  if exists (select 1 from unnest(v_new_ids) u where u = any (v_ids)) then
    perform public.notify(
      array(select u from unnest(v_new_ids) u where u = any (v_ids)), 'mention', coalesce(v_author, 'Someone') || ' mentioned you',
      public.conversation_link(new.conversation_id), public.message_excerpt(new.body, 140),
      new.author_user_id, coalesce(v_conversation.anchor_type, 'conversations'), coalesce(v_conversation.anchor_id, v_conversation.id),
      'mention:' || new.id, array['in_app', 'toast'],
      jsonb_build_object('actor_name', v_author, 'entity_title', public.conversation_label(new.conversation_id)));
  end if;
  if exists (select 1 from unnest(v_new_ids) u where not (u = any (v_ids))) then
    select name into v_team_name from public.teams where id = v_target;
    perform public.notify(
      array(select u from unnest(v_new_ids) u where not (u = any (v_ids))), 'team_mention',
      coalesce(v_author, 'Someone') || ' mentioned ' || coalesce(v_team_name, 'the team'),
      public.conversation_link(new.conversation_id), public.message_excerpt(new.body, 140),
      new.author_user_id, coalesce(v_conversation.anchor_type, 'conversations'), coalesce(v_conversation.anchor_id, v_conversation.id),
      'team-mention:' || new.id, array['in_app', 'toast'],
      jsonb_build_object('actor_name', v_author, 'team_name', v_team_name, 'entity_title', public.conversation_label(new.conversation_id)));
  end if;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.messages_b_mentions() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_b_mentions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_b_mentions() TO service_role;

CREATE FUNCTION public.messages_c_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
  v_assignee uuid;
  v_fallback uuid;
  v_recipients uuid[];
  v_title text;
  v_author text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if v_conversation.kind <> 'record' then
    return null;
  end if;
  if v_conversation.anchor_type = 'tickets' then
    select assigned_user_id, reporter_user_id, '#' || ticket_number || ' ' || title
      into v_assignee, v_fallback, v_title from public.tickets where id = v_conversation.anchor_id;
  elsif v_conversation.anchor_type = 'tasks' then
    select assigned_user_id, created_by_user_id, '#' || task_number || ' ' || title
      into v_assignee, v_fallback, v_title from public.tasks where id = v_conversation.anchor_id;
  else
    return null;
  end if;
  v_recipients := array(
    select u from (select coalesce(v_assignee, v_fallback) as u) r
    where u is not null and u is distinct from new.author_user_id
      and not exists (select 1 from public.message_mentions where message_id = new.id and mentioned_user_id = r.u)
  );
  if array_length(v_recipients, 1) is null then
    return null;
  end if;
  select coalesce(name, email, 'Someone') into v_author from public.users where id = new.author_user_id;
  perform public.notify(
    v_recipients, 'comment', coalesce(v_author, 'Someone') || ' commented on ' || v_title,
    '/' || v_conversation.anchor_type || '/' || v_conversation.anchor_id,
    public.message_excerpt(new.body, 140),
    new.author_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'comment:' || v_conversation.anchor_id,
    array['in_app'], jsonb_build_object('actor_name', v_author, 'entity_title', v_title));
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.messages_c_notify() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_c_notify() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_c_notify() TO service_role;

CREATE FUNCTION public.messages_d_team_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
  v_team public.teams;
  v_author text;
  v_recipients uuid[];
  v_title text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if v_conversation.kind <> 'post' or v_conversation.anchor_type <> 'teams' then
    return null;
  end if;
  select * into v_team from public.teams where id = v_conversation.anchor_id;
  select coalesce(name, email, 'Someone') into v_author from public.users where id = new.author_user_id;
  v_title := public.conversation_label(v_conversation.id);

  if v_conversation.message_count = 1 then
    select coalesce(array_agg(u.id), '{}') into v_recipients
    from public.users u
    where u.has_login and not u.has_left and u.id is distinct from new.author_user_id
      and public.team_follow_level(u.id, v_team.id) = 'all'
      and public.team_message_access(u.id, v_team.id, 'view');
    if array_length(v_recipients, 1) is null then
      return null;
    end if;
    perform public.notify(
      v_recipients, 'team_post', coalesce(v_author, 'Someone') || ' posted in ' || v_team.name, '/messages/' || v_conversation.id,
      v_title, new.author_user_id, 'conversations', v_conversation.id, 'group-post:' || v_team.id,
      case when v_team.posting = 'owners' then array['in_app', 'toast'] else array['in_app'] end,
      jsonb_build_object('actor_name', v_author, 'team_name', v_team.name, 'entity_title', v_title));
    return null;
  end if;

  v_recipients := array(
    select p.user_id from public.conversation_participants p
    where p.conversation_id = v_conversation.id and p.taking_part and p.level = 'all'
      and p.user_id is distinct from new.author_user_id
      and not exists (select 1 from public.message_mentions where message_id = new.id and mentioned_user_id = p.user_id)
      and exists (select 1 from public.users x where x.id = p.user_id and x.has_login and not x.has_left)
      and public.team_message_access(p.user_id, v_team.id, 'view'));
  if array_length(v_recipients, 1) is null then
    return null;
  end if;
  perform public.notify(
    v_recipients, 'team_comment', coalesce(v_author, 'Someone') || ' commented on ' || v_title, '/messages/' || v_conversation.id,
    public.message_excerpt(new.body, 140), new.author_user_id,
    'conversations', v_conversation.id, 'group-comment:' || v_conversation.id, array['in_app'],
    jsonb_build_object('actor_name', v_author, 'entity_title', v_title));
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.messages_d_team_notify() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_d_team_notify() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_d_team_notify() TO service_role;

CREATE FUNCTION public.messages_e_direct() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
  v_author text;
  v_recipients uuid[];
  v_title text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if v_conversation.kind not in ('direct', 'group') then
    return null;
  end if;
  -- Whoever hid the conversation gets it back with a new message, unless they muted it.
  update public.conversation_participants set taking_part = true
  where conversation_id = new.conversation_id and not taking_part and level <> 'mute';
  v_recipients := array(
    select p.user_id from public.conversation_participants p join public.users u on u.id = p.user_id
    where p.conversation_id = new.conversation_id and p.user_id is distinct from new.author_user_id
      and p.level = 'all' and u.has_login and not u.has_left and u.locked_at is null);
  if array_length(v_recipients, 1) is null then
    return null;
  end if;
  select coalesce(name, email, 'Someone') into v_author from public.users where id = new.author_user_id;
  v_title := case when v_conversation.kind = 'group' then coalesce(v_author, 'Someone') || ' wrote in a group chat'
                  else coalesce(v_author, 'Someone') || ' wrote to you' end;
  perform public.notify(
    v_recipients, 'direct_message', v_title, '/messages/' || new.conversation_id,
    public.message_excerpt(new.body, 140), new.author_user_id, 'conversations', new.conversation_id,
    'direct:' || new.conversation_id, array['in_app', 'toast'],
    jsonb_build_object('actor_name', v_author));
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.messages_e_direct() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.messages_e_direct() FROM PUBLIC;
GRANT ALL ON FUNCTION public.messages_e_direct() TO service_role;

CREATE FUNCTION public.message_excerpt(p_body text, p_length integer) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_text text := coalesce(p_body, '');
  v_match text[];
begin
  for v_match in select regexp_matches(v_text, '@\[user:([0-9a-fA-F-]{36})\]', 'g') loop
    v_text := replace(v_text, '@[user:' || v_match[1] || ']',
                      '@' || coalesce((select coalesce(name, email) from public.users where id = v_match[1]::uuid), '…'));
  end loop;
  -- A team mention (20261120130000_team_mentions.sql) shows the group's name.
  for v_match in select regexp_matches(v_text, '@\[team:([0-9a-fA-F-]{36})\]', 'g') loop
    v_text := replace(v_text, '@[team:' || v_match[1] || ']',
                      '@' || coalesce((select name from public.teams where id = v_match[1]::uuid), '…'));
  end loop;
  -- A task card ([[task:<uuid>]], ~/maintenance_tool/docs/messaging.md "Task cards") shows only the number: the title belongs to those who may open the task.
  for v_match in select regexp_matches(v_text, '\[\[task:([0-9a-fA-F-]{36})\]\]', 'g') loop
    v_text := replace(v_text, '[[task:' || v_match[1] || ']]',
                      '#' || coalesce((select task_number::text from public.tasks where id = v_match[1]::uuid), '…'));
  end loop;
  -- Block tags separate words, inline tags (<strong>, <a>) do not.
  v_text := regexp_replace(v_text, '</?(p|br|li|ul|ol|div|h[1-6]|blockquote)\b[^>]*>', ' ', 'gi');
  v_text := btrim(regexp_replace(regexp_replace(v_text, '<[^>]*>', '', 'g'), '\s+', ' ', 'g'));
  return left(v_text, p_length);
end;
$$;

REVOKE ALL ON FUNCTION public.message_excerpt(p_body text, p_length integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.message_excerpt(p_body text, p_length integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.message_excerpt(p_body text, p_length integer) TO service_role;

CREATE FUNCTION public.message_reactions_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_message public.messages;
  v_level text;
  v_actor text;
  v_title text;
begin
  select * into v_message from public.messages where id = new.message_id;
  if v_message.author_user_id is null or v_message.author_user_id = new.user_id then
    return null;
  end if;
  select level into v_level from public.conversation_participants
  where conversation_id = v_message.conversation_id and user_id = v_message.author_user_id;
  if coalesce(v_level, 'all') <> 'all' then
    return null;
  end if;
  -- One line per person and message: tapping a reaction off and on again, or adding a second one, does not ring again
  -- while the line from that person is still unread.
  if exists (
    select 1 from public.notifications n
    where n.user_id = v_message.author_user_id and n.dedupe_key = 'reaction:' || v_message.id
      and n.read_at is null and n.actor_user_id = new.user_id
  ) then
    return null;
  end if;
  select coalesce(name, email, 'Someone') into v_actor from public.users where id = new.user_id;
  v_title := public.conversation_label(v_message.conversation_id);
  perform public.notify(
    array[v_message.author_user_id], 'reaction', coalesce(v_actor, 'Someone') || ' reacted to your message',
    public.conversation_link(v_message.conversation_id), public.message_excerpt(v_message.body, 140),
    new.user_id, null, null, 'reaction:' || v_message.id,
    array['in_app'], jsonb_build_object('actor_name', v_actor, 'entity_title', v_title, 'reaction', new.reaction,
      -- The texts of notification-texts.json only fill in params; the emoji itself goes along.
      'emoji', case new.reaction when 'thumbs_up' then '👍' when 'check' then '✅' when 'heart' then '❤️'
                                 when 'laugh' then '😂' when 'surprised' then '😮' when 'thanks' then '🙏' end));
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.message_reactions_notify() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.message_reactions_notify() FROM PUBLIC;
GRANT ALL ON FUNCTION public.message_reactions_notify() TO service_role;

CREATE FUNCTION public.message_reactions_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_message uuid := coalesce(new.message_id, old.message_id);
begin
  -- Lock the message first, in a statement of its own: two reactions at the same moment are then written one after
  -- the other, and the list below (a new statement, a new snapshot) sees the other one's row.
  perform 1 from public.messages where id = v_message for update;
  -- messages_guard lets the column change only while this flag is set (for this statement alone).
  perform set_config('messaging.reactions', '1', true);
  update public.messages m set reactions = coalesce((
    select jsonb_object_agg(reaction, users) from (
      select reaction, jsonb_agg(user_id order by created_at, user_id) as users
      from public.message_reactions where message_id = v_message group by reaction
    ) c), '{}'::jsonb)
  where m.id = v_message;
  perform set_config('messaging.reactions', '', true);
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.message_reactions_sync() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.message_reactions_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.message_reactions_sync() TO service_role;

CREATE FUNCTION public.poll_close(p_message_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_message public.messages := public.poll_message_for_update(p_message_id);
begin
  if v_message.id is null or v_message.author_user_id is distinct from auth.uid() then
    raise exception 'You cannot end this poll';
  end if;
  if v_message.poll ->> 'closed_at' is not null then
    return;
  end if;
  perform set_config('messaging.poll', '1', true);
  update public.messages set poll = jsonb_set(poll, '{closed_at}', to_jsonb(now())) where id = p_message_id;
  perform set_config('messaging.poll', '', true);
end;
$$;

REVOKE ALL ON FUNCTION public.poll_close(p_message_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_close(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_close(p_message_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.poll_close(p_message_id uuid) TO authenticated;

CREATE FUNCTION public.poll_message_for_update(p_message_id uuid) RETURNS public.messages
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select m.* from public.messages m
  join public.conversations c on c.id = m.conversation_id and c.deleted_at is null
  where m.id = p_message_id and m.deleted_at is null and m.poll is not null
    and public.conversation_access(auth.uid(), m.conversation_id, 'view')
  for update of m;
$$;

REVOKE ALL ON FUNCTION public.poll_message_for_update(p_message_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_message_for_update(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_message_for_update(p_message_id uuid) TO service_role;

CREATE FUNCTION public.poll_vote(p_message_id uuid, p_options integer[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_message public.messages := public.poll_message_for_update(p_message_id);
  v_options integer[] := array(select distinct o from unnest(coalesce(p_options, '{}')) o order by o);
begin
  if v_message.id is null then
    raise exception 'You cannot vote here';
  end if;
  if v_message.poll ->> 'closed_at' is not null then
    raise exception 'The poll has ended' using errcode = 'P0001', hint = 'poll_closed';
  end if;
  if exists (select 1 from unnest(v_options) o where o is null or o < 0 or o >= jsonb_array_length(v_message.poll -> 'options')) then
    raise exception 'No such option';
  end if;
  if cardinality(v_options) > 1 and not (v_message.poll ->> 'multiple')::boolean then
    raise exception 'This poll takes one option';
  end if;
  delete from public.poll_votes where message_id = p_message_id and user_id = auth.uid();
  insert into public.poll_votes (message_id, user_id, option)
  select p_message_id, auth.uid(), o from unnest(v_options) o;
  perform set_config('messaging.poll', '1', true);
  update public.messages
  set poll = jsonb_set(poll, '{vote_count}', to_jsonb((select count(distinct user_id) from public.poll_votes where message_id = p_message_id)))
  where id = p_message_id;
  perform set_config('messaging.poll', '', true);
end;
$$;

REVOKE ALL ON FUNCTION public.poll_vote(p_message_id uuid, p_options integer[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_vote(p_message_id uuid, p_options integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_vote(p_message_id uuid, p_options integer[]) TO service_role;
GRANT ALL ON FUNCTION public.poll_vote(p_message_id uuid, p_options integer[]) TO authenticated;

CREATE FUNCTION public.poll_votes_drop_with_post() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.poll_votes v using public.messages m
  where m.id = v.message_id and m.conversation_id = new.id;
  return null;
end;
$$;

REVOKE ALL ON FUNCTION public.poll_votes_drop_with_post() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_votes_drop_with_post() FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_votes_drop_with_post() TO service_role;

CREATE FUNCTION public.team_follow_level(p_user_id uuid, p_team_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select f.level from public.team_follows f where f.user_id = p_user_id and f.team_id = p_team_id),
    case when exists (select 1 from public.user_teams where team_id = p_team_id and user_id = p_user_id)
           or exists (select 1 from public.team_owners where team_id = p_team_id and user_id = p_user_id)
           or exists (select 1 from public.teams where id = p_team_id and audience = 'everyone' and posting = 'owners')
         then 'all' end);
$$;

REVOKE ALL ON FUNCTION public.team_follow_level(p_user_id uuid, p_team_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_follow_level(p_user_id uuid, p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_follow_level(p_user_id uuid, p_team_id uuid) TO service_role;

CREATE FUNCTION public.team_message_access(p_user_id uuid, p_team_id uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_team public.teams;
  v_held text[];
  v_moderator boolean;
  v_readable boolean;
begin
  if p_user_id is null then
    return false;
  end if;
  select * into v_team from public.teams where id = p_team_id;
  if v_team.id is null then
    return false;
  end if;
  if exists (select 1 from public.team_owners where team_id = p_team_id and user_id = p_user_id) then
    return true;
  end if;
  v_held := public.user_permissions(p_user_id);
  v_moderator := 'messages.edit' = any (v_held);
  v_readable := (v_moderator or 'messages.view' = any (v_held))
                and (v_team.audience = 'everyone'
                     or exists (select 1 from public.user_teams where team_id = p_team_id and user_id = p_user_id));
  if not v_readable then
    return false;
  end if;
  if p_action = 'moderate' then
    return v_moderator;
  elsif p_action = 'view' then
    return true;
  elsif p_action = 'comment' then
    return v_moderator or 'messages.check' = any (v_held);
  elsif p_action = 'post' then
    return v_moderator or (v_team.posting = 'everyone' and 'messages.create' = any (v_held));
  end if;
  return false;
end;
$$;

REVOKE ALL ON FUNCTION public.team_message_access(p_user_id uuid, p_team_id uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_message_access(p_user_id uuid, p_team_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_message_access(p_user_id uuid, p_team_id uuid, p_action text) TO service_role;

CREATE FUNCTION public.conversation_mention_team(p_anchor_type text, p_anchor_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when p_anchor_type = 'teams' then p_anchor_id else public.conversation_team(p_anchor_type, p_anchor_id) end;
$$;

REVOKE ALL ON FUNCTION public.conversation_mention_team(p_anchor_type text, p_anchor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_mention_team(p_anchor_type text, p_anchor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_mention_team(p_anchor_type text, p_anchor_id uuid) TO service_role;

CREATE FUNCTION public.team_mention_allowed(p_user_id uuid, p_anchor_type text, p_anchor_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_team public.teams;
begin
  select * into v_team from public.teams where id = public.conversation_mention_team(p_anchor_type, p_anchor_id);
  if p_user_id is null or v_team.id is null then
    return false;
  end if;
  if p_anchor_type = 'teams' then
    return public.team_message_access(p_user_id, v_team.id, 'moderate')
      or (v_team.team_mentions = 'members'
          and public.team_message_access(p_user_id, v_team.id, 'comment')
          and exists (select 1 from public.user_teams where team_id = v_team.id and user_id = p_user_id));
  end if;
  return public.user_has_access(p_user_id, p_anchor_type, p_anchor_id, 'check');
end;
$$;

REVOKE ALL ON FUNCTION public.team_mention_allowed(p_user_id uuid, p_anchor_type text, p_anchor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_mention_allowed(p_user_id uuid, p_anchor_type text, p_anchor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_mention_allowed(p_user_id uuid, p_anchor_type text, p_anchor_id uuid) TO service_role;

CREATE FUNCTION public.team_message_can(p_team_id uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.team_message_access(auth.uid(), p_team_id, p_action); $$;

REVOKE ALL ON FUNCTION public.team_message_can(p_team_id uuid, p_action text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_message_can(p_team_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_message_can(p_team_id uuid, p_action text) TO service_role;
GRANT ALL ON FUNCTION public.team_message_can(p_team_id uuid, p_action text) TO authenticated;

CREATE FUNCTION public.chats_search(p_term text, p_limit integer DEFAULT 8) RETURNS TABLE(conversation_id uuid, kind text, title text, partner_user_id uuid, last_excerpt text, sort_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select x.id, x.kind, x.title, x.partner, x.excerpt, x.sort_at
  from (
    select c.id, c.kind, public.conversation_label(c.id) as title,
           case when c.kind = 'direct' then (select o.user_id from public.conversation_participants o
                                             where o.conversation_id = c.id and o.user_id <> auth.uid() limit 1) end as partner,
           (select public.message_excerpt(m.body, 140) from public.messages m
            where m.conversation_id = c.id and m.deleted_at is null order by m.created_at desc, m.id desc limit 1) as excerpt,
           coalesce(c.last_message_at, c.created_at) as sort_at
    from public.conversation_participants mine
    join public.conversations c on c.id = mine.conversation_id
    where mine.user_id = auth.uid() and c.kind in ('direct', 'group') and c.deleted_at is null and c.message_count > 0
  ) x
  where btrim(coalesce(p_term, '')) <> ''
    and not exists (
      select 1 from unnest(string_to_array(public.search_fold(btrim(p_term)), ' ')) w
      where w <> '' and position(w in public.search_fold(x.title)) = 0)
  order by x.sort_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 30);
$$;

REVOKE ALL ON FUNCTION public.chats_search(p_term text, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.chats_search(p_term text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.chats_search(p_term text, p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.chats_search(p_term text, p_limit integer) TO authenticated;

CREATE FUNCTION public.conversation_add_people(p_conversation_id uuid, p_user_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_new uuid[];
  v_has_messages boolean;
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and kind = 'group' and deleted_at is null)
     or not public.conversation_access(auth.uid(), p_conversation_id, 'post') then
    raise exception 'You cannot add people to this chat';
  end if;
  -- Only who is not in it yet, each once: duplicates and people already in it neither count nor fail.
  v_new := array(
    select distinct u from unnest(coalesce(p_user_ids, '{}')) u
    where u is not null
      and not exists (select 1 from public.conversation_participants p where p.conversation_id = p_conversation_id and p.user_id = u));
  if exists (select 1 from unnest(v_new) u left join public.users x on x.id = u
             where x.id is null or not x.has_login or x.has_left or x.locked_at is not null) then
    raise exception 'You cannot write to these people';
  end if;
  if (select count(*) from public.conversation_participants where conversation_id = p_conversation_id)
     + coalesce(array_length(v_new, 1), 0) > 50 then
    raise exception 'A group chat has at most 50 people; make a team instead';
  end if;
  v_has_messages := exists (select 1 from public.messages where conversation_id = p_conversation_id);
  -- The whole history is readable; it counts as read, so nobody starts with a wall of unread messages.
  insert into public.conversation_participants (conversation_id, user_id, taking_part, last_read_at)
  select p_conversation_id, u, v_has_messages, now() from unnest(v_new) u;
end;
$$;

REVOKE ALL ON FUNCTION public.conversation_add_people(p_conversation_id uuid, p_user_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_add_people(p_conversation_id uuid, p_user_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_add_people(p_conversation_id uuid, p_user_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.conversation_add_people(p_conversation_id uuid, p_user_ids uuid[]) TO authenticated;

CREATE FUNCTION public.conversation_get_or_create_direct(p_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_id uuid;
begin
  if v_me is null or p_user_id is null or p_user_id = v_me then
    raise exception 'You cannot write to this person';
  end if;
  v_key := least(v_me, p_user_id)::text || ':' || greatest(v_me, p_user_id)::text;
  select id into v_id from public.conversations where kind = 'direct' and direct_key = v_key;
  if v_id is not null then
    -- A participant row can be missing (somebody deleted their own, the policy allows it): both are put back, so nobody
    -- stays locked out of a conversation that exists.
    insert into public.conversation_participants (conversation_id, user_id, taking_part)
    select v_id, u, exists (select 1 from public.messages where conversation_id = v_id)
    from unnest(array[v_me, p_user_id]) u
    on conflict (conversation_id, user_id) do nothing;
    return v_id;
  end if;
  if not exists (select 1 from public.users where id = p_user_id and has_login and not has_left and locked_at is null) then
    raise exception 'You cannot write to this person';
  end if;
  insert into public.conversations (kind, direct_key) values ('direct', v_key)
  on conflict (direct_key) where kind = 'direct' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where kind = 'direct' and direct_key = v_key;
    return v_id;
  end if;
  -- Both are in, neither takes part before the first message (an empty conversation is not an Inbox line).
  insert into public.conversation_participants (conversation_id, user_id, taking_part)
  values (v_id, v_me, false), (v_id, p_user_id, false);
  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.conversation_get_or_create_direct(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_get_or_create_direct(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_get_or_create_direct(p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.conversation_get_or_create_direct(p_user_id uuid) TO authenticated;

CREATE FUNCTION public.conversation_get_or_create_group(p_user_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_me uuid := auth.uid();
  v_people uuid[];
  v_id uuid;
begin
  if v_me is null then
    raise exception 'You cannot write to these people';
  end if;
  v_people := array(select distinct u from unnest(coalesce(p_user_ids, '{}') || v_me) u where u is not null order by u);
  if array_length(v_people, 1) < 3 then
    raise exception 'A group chat needs at least two other people';
  end if;
  if array_length(v_people, 1) > 50 then
    raise exception 'A group chat has at most 50 people; make a team instead';
  end if;
  if exists (select 1 from unnest(v_people) u left join public.users x on x.id = u
             where u <> v_me and (x.id is null or not x.has_login or x.has_left or x.locked_at is not null)) then
    raise exception 'You cannot write to these people';
  end if;
  -- Two people starting the same chat at the same moment wait for each other here, so only one chat is made.
  perform pg_advisory_xact_lock(hashtextextended('group-chat:' || array_to_string(v_people, ':'), 0));
  -- The chat whose people are exactly these now (nobody left, nobody added since); the oldest if there are several.
  select c.id into v_id
  from public.conversation_participants mine
  join public.conversations c on c.id = mine.conversation_id and c.kind = 'group' and c.deleted_at is null
  where mine.user_id = v_me
    and (select array_agg(p.user_id order by p.user_id) from public.conversation_participants p where p.conversation_id = c.id) = v_people
  order by c.created_at limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.conversations (kind) values ('group') returning id into v_id;
  -- Nobody takes part before the first message (an empty chat is not an Inbox line).
  insert into public.conversation_participants (conversation_id, user_id, taking_part)
  select v_id, u, false from unnest(v_people) u;
  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.conversation_get_or_create_group(p_user_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_get_or_create_group(p_user_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_get_or_create_group(p_user_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.conversation_get_or_create_group(p_user_ids uuid[]) TO authenticated;

CREATE FUNCTION public.conversation_header(p_conversation_id uuid) RETURNS TABLE(conversation_id uuid, kind text, anchor_type text, anchor_id uuid, team_id uuid, team_name text, title text, link text, first_message_id uuid, can_post boolean, can_moderate boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select c.id, c.kind, c.anchor_type, c.anchor_id,
         case when c.kind = 'post' then c.anchor_id else c.team_id end,
         (select g.name from public.teams g where g.id = case when c.kind = 'post' then c.anchor_id else c.team_id end),
         public.conversation_label(c.id), public.conversation_link(c.id), c.first_message_id,
         public.conversation_access(auth.uid(), c.id, 'post'), public.conversation_access(auth.uid(), c.id, 'moderate')
  from public.conversations c
  where c.id = p_conversation_id and public.conversation_access(auth.uid(), c.id, 'view');
$$;

REVOKE ALL ON FUNCTION public.conversation_header(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_header(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_header(p_conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.conversation_header(p_conversation_id uuid) TO authenticated;

CREATE FUNCTION public.conversation_leave(p_conversation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and kind = 'group') then
    raise exception 'You cannot leave this conversation';
  end if;
  delete from public.conversation_participants where conversation_id = p_conversation_id and user_id = auth.uid();
  -- Only one's own bell lines of the chat go; the others keep theirs.
  delete from public.notifications where user_id = auth.uid() and dedupe_key = 'direct:' || p_conversation_id;
end;
$$;

REVOKE ALL ON FUNCTION public.conversation_leave(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_leave(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_leave(p_conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.conversation_leave(p_conversation_id uuid) TO authenticated;

CREATE FUNCTION public.conversation_mark_read(p_conversation_id uuid) RETURNS void
    LANGUAGE sql
    AS $$
  insert into public.conversation_participants (conversation_id, user_id, taking_part, last_read_at)
  values (p_conversation_id, auth.uid(), false, now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  select public.notifications_mark_conversations_read(array[p_conversation_id]);
$$;

REVOKE ALL ON FUNCTION public.conversation_mark_read(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_mark_read(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_mark_read(p_conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.conversation_mark_read(p_conversation_id uuid) TO authenticated;

CREATE FUNCTION public.conversation_people(p_conversation_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.user_id from public.conversation_participants p
  join public.conversations c on c.id = p.conversation_id
  where p.conversation_id = p_conversation_id and c.kind in ('direct', 'group')
    and public.conversation_access(auth.uid(), p_conversation_id, 'view');
$$;

REVOKE ALL ON FUNCTION public.conversation_people(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_people(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_people(p_conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.conversation_people(p_conversation_id uuid) TO authenticated;

CREATE FUNCTION public.conversation_readers(p_conversation_id uuid) RETURNS TABLE(user_id uuid, last_read_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.user_id, p.last_read_at
  from public.conversation_participants p
  where p.conversation_id = p_conversation_id
    and p.last_read_at is not null
    and p.user_id <> auth.uid()
    and public.conversation_access(auth.uid(), p_conversation_id, 'view')
  order by p.last_read_at desc;
$$;

REVOKE ALL ON FUNCTION public.conversation_readers(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_readers(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_readers(p_conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.conversation_readers(p_conversation_id uuid) TO authenticated;

CREATE FUNCTION public.conversation_rename(p_conversation_id uuid, p_title text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and kind = 'group' and deleted_at is null)
     or not public.conversation_access(auth.uid(), p_conversation_id, 'post') then
    raise exception 'You cannot rename this chat';
  end if;
  update public.conversations set title = nullif(left(btrim(coalesce(p_title, '')), 80), '') where id = p_conversation_id;
end;
$$;

REVOKE ALL ON FUNCTION public.conversation_rename(p_conversation_id uuid, p_title text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.conversation_rename(p_conversation_id uuid, p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.conversation_rename(p_conversation_id uuid, p_title text) TO service_role;
GRANT ALL ON FUNCTION public.conversation_rename(p_conversation_id uuid, p_title text) TO authenticated;

CREATE FUNCTION public.team_message_rights() RETURNS TABLE(team_id uuid, can_post boolean, can_comment boolean, can_moderate boolean, is_member boolean, is_owner boolean, level text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select g.id,
         public.team_message_access(auth.uid(), g.id, 'post'),
         public.team_message_access(auth.uid(), g.id, 'comment'),
         public.team_message_access(auth.uid(), g.id, 'moderate'),
         exists (select 1 from public.user_teams ug where ug.team_id = g.id and ug.user_id = auth.uid()),
         exists (select 1 from public.team_owners o where o.team_id = g.id and o.user_id = auth.uid()),
         public.team_follow_level(auth.uid(), g.id)
  from public.teams g
  where public.team_message_access(auth.uid(), g.id, 'view');
$$;

REVOKE ALL ON FUNCTION public.team_message_rights() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_message_rights() FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_message_rights() TO service_role;
GRANT ALL ON FUNCTION public.team_message_rights() TO authenticated;

CREATE FUNCTION public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.team_message_access(auth.uid(), p_team_id, 'moderate') then
    raise exception 'Only an owner changes the settings of a group';
  end if;
  update public.teams
  set posting = p_posting, audience = p_audience, team_mentions = p_team_mentions,
      description = nullif(btrim(coalesce(p_description, '')), '')
  where id = p_team_id;
end;
$$;

REVOKE ALL ON FUNCTION public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text) TO service_role;
GRANT ALL ON FUNCTION public.team_message_settings_save(p_team_id uuid, p_posting text, p_audience text, p_description text, p_team_mentions text) TO authenticated;

CREATE FUNCTION public.team_post_create(p_team_id uuid, p_title text, p_body text, p_poll jsonb DEFAULT NULL::jsonb) RETURNS TABLE(conversation_id uuid, message_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation uuid;
  v_message uuid;
  v_poll jsonb := case when p_poll is not null and p_poll <> 'null'::jsonb then public.poll_normalize(p_poll) end;
begin
  if not public.team_message_access(auth.uid(), p_team_id, 'post') then
    raise exception 'You cannot post in this group';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'A post needs a text';
  end if;
  insert into public.conversations (kind, anchor_type, anchor_id, title)
  values ('post', 'teams', p_team_id, nullif(btrim(coalesce(p_title, '')), ''))
  returning id into v_conversation;
  perform set_config('messaging.poll', '1', true);
  insert into public.messages (conversation_id, author_user_id, body, poll)
  values (v_conversation, auth.uid(), p_body, v_poll)
  returning id into v_message;
  perform set_config('messaging.poll', '', true);
  return query select v_conversation, v_message;
end;
$$;

REVOKE ALL ON FUNCTION public.team_post_create(p_team_id uuid, p_title text, p_body text, p_poll jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_post_create(p_team_id uuid, p_title text, p_body text, p_poll jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_post_create(p_team_id uuid, p_title text, p_body text, p_poll jsonb) TO service_role;
GRANT ALL ON FUNCTION public.team_post_create(p_team_id uuid, p_title text, p_body text, p_poll jsonb) TO authenticated;

CREATE FUNCTION public.team_post_delete(p_conversation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'post' and c.deleted_at is null)
     or not public.rls_has('messages.delete') or not public.conversation_access(auth.uid(), p_conversation_id, 'view') then
    raise exception 'You cannot delete this post';
  end if;
  update public.conversations set deleted_at = now(), deleted_by_user_id = auth.uid(), pinned = false, pinned_at = null
  where id = p_conversation_id;
  -- Everything the post caused in the bell: its comments, mentions and reactions, and the new-post line while it shows
  -- this post.
  perform public.notifications_retract(
    array['group-comment:' || p_conversation_id] || array(
      select k || m.id from public.messages m, unnest(array['mention:', 'team-mention:', 'reaction:']) k
      where m.conversation_id = p_conversation_id),
    array(select 'group-post:' || c.anchor_id from public.conversations c where c.id = p_conversation_id),
    null, '/messages/' || p_conversation_id);
end;
$$;

REVOKE ALL ON FUNCTION public.team_post_delete(p_conversation_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_post_delete(p_conversation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_post_delete(p_conversation_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.team_post_delete(p_conversation_id uuid) TO authenticated;

CREATE FUNCTION public.team_post_edit(p_conversation_id uuid, p_title text, p_body text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_root public.messages;
begin
  select m.* into v_root from public.messages m
  join public.conversations c on c.first_message_id = m.id and c.kind = 'post' and c.deleted_at is null
  where c.id = p_conversation_id;
  if v_root.id is null or v_root.author_user_id is distinct from auth.uid()
     or not public.conversation_access(auth.uid(), p_conversation_id, 'view') then
    raise exception 'You cannot edit this post';
  end if;
  if v_root.created_at < now() - public.message_edit_window() then
    raise exception 'A post can only be edited for 15 minutes after it was written' using errcode = 'P0001', hint = 'edit_window';
  end if;
  if p_body is null or btrim(p_body) = '' then
    raise exception 'A post needs a text';
  end if;
  update public.conversations set title = nullif(btrim(coalesce(p_title, '')), '') where id = p_conversation_id;
  update public.messages set body = p_body where id = v_root.id;
end;
$$;

REVOKE ALL ON FUNCTION public.team_post_edit(p_conversation_id uuid, p_title text, p_body text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_post_edit(p_conversation_id uuid, p_title text, p_body text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_post_edit(p_conversation_id uuid, p_title text, p_body text) TO service_role;
GRANT ALL ON FUNCTION public.team_post_edit(p_conversation_id uuid, p_title text, p_body text) TO authenticated;

CREATE FUNCTION public.team_post_last_comments(p_conversation_ids uuid[]) RETURNS TABLE(conversation_id uuid, message_id uuid, author_user_id uuid, author_name text, excerpt text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select c.id, m.id, m.author_user_id, coalesce(u.name, u.email), public.message_excerpt(m.body, 240), m.created_at
  from unnest(p_conversation_ids[1:50]) as ids(id)
  join public.conversations c on c.id = ids.id and c.kind = 'post' and c.deleted_at is null
  cross join lateral (
    select x.id, x.author_user_id, x.body, x.created_at from public.messages x
    where x.conversation_id = c.id and x.deleted_at is null and x.id is distinct from c.first_message_id
    order by x.created_at desc, x.id desc limit 1
  ) m
  left join public.users u on u.id = m.author_user_id
  where public.conversation_access(auth.uid(), c.id, 'view');
$$;

REVOKE ALL ON FUNCTION public.team_post_last_comments(p_conversation_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_post_last_comments(p_conversation_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_post_last_comments(p_conversation_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.team_post_last_comments(p_conversation_ids uuid[]) TO authenticated;

CREATE FUNCTION public.team_post_pin(p_conversation_id uuid, p_pinned boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and kind = 'post')
     or not public.conversation_access(auth.uid(), p_conversation_id, 'moderate') then
    raise exception 'You cannot pin this post';
  end if;
  update public.conversations set pinned = p_pinned, pinned_at = case when p_pinned then now() end where id = p_conversation_id;
end;
$$;

REVOKE ALL ON FUNCTION public.team_post_pin(p_conversation_id uuid, p_pinned boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_post_pin(p_conversation_id uuid, p_pinned boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_post_pin(p_conversation_id uuid, p_pinned boolean) TO service_role;
GRANT ALL ON FUNCTION public.team_post_pin(p_conversation_id uuid, p_pinned boolean) TO authenticated;

CREATE FUNCTION public.team_unread_counts() RETURNS TABLE(team_id uuid, unread bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with readable as materialized (
    select g.id from public.teams g where coalesce(public.team_message_access((select auth.uid()), g.id, 'view'), false)
  )
  select c.anchor_id, count(*)
  from readable g
  join public.conversations c on c.anchor_id = g.id and c.kind = 'post' and c.anchor_type = 'teams' and c.deleted_at is null
  join public.messages rm on rm.id = c.first_message_id
  left join public.team_reads r on r.team_id = c.anchor_id and r.user_id = (select auth.uid())
  left join public.conversation_participants p on p.conversation_id = c.id and p.user_id = (select auth.uid())
  where rm.author_user_id is distinct from (select auth.uid())
    and c.created_at > greatest(coalesce(r.last_read_at, now() - interval '7 days'), coalesce(p.last_read_at, '-infinity'))
  group by c.anchor_id;
$$;

REVOKE ALL ON FUNCTION public.team_unread_counts() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_unread_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_unread_counts() TO service_role;
GRANT ALL ON FUNCTION public.team_unread_counts() TO authenticated;

CREATE FUNCTION public.inbox_list(p_view text DEFAULT 'mine'::text, p_team_id uuid DEFAULT NULL::uuid, p_unread_only boolean DEFAULT false, p_kind text DEFAULT NULL::text, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30) RETURNS TABLE(conversation_id uuid, kind text, anchor_type text, anchor_id uuid, team_id uuid, team_name text, title text, link text, sort_at timestamp with time zone, last_author_user_id uuid, last_author_name text, last_excerpt text, unread_count integer, mentioned boolean, taking_part boolean, level text, partner_user_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_count integer := 0;
  v_row record;
  v_unread integer;
  v_mentioned boolean;
  v_last record;
begin
  if v_me is null or p_view not in ('mine', 'group') or (p_view = 'group' and p_team_id is null) then
    return;
  end if;
  for v_row in
    select c.id, c.kind, c.anchor_type, c.anchor_id, c.team_id, coalesce(c.last_message_at, c.created_at) as sort_at,
           p.user_id is not null as has_row, coalesce(p.taking_part, false) as taking_part, coalesce(p.level, 'all') as level,
           p.last_read_at, x.new_post, c.direct_key
    from (
      select cp.conversation_id as id, false as new_post
      from public.conversation_participants cp
      where p_view = 'mine' and cp.user_id = v_me and cp.taking_part
      union all
      select np, true from public.inbox_new_posts(v_me) np where p_view = 'mine'
      union all
      select tc.id, false from public.conversations tc
      where p_view = 'group' and tc.kind = 'record' and tc.team_id = p_team_id
      union all
      select gp.id, false from public.conversations gp
      where p_view = 'group' and gp.kind = 'post' and gp.anchor_type = 'teams' and gp.anchor_id = p_team_id
    ) x
    join public.conversations c on c.id = x.id and c.deleted_at is null
    left join public.conversation_participants p on p.conversation_id = c.id and p.user_id = v_me
    where (p_kind is null or (p_kind = 'records' and c.kind = 'record') or (p_kind = 'posts' and c.kind = 'post')
           or (p_kind = 'direct' and c.kind in ('direct', 'group')))
      and (p_before_at is null
           or coalesce(c.last_message_at, c.created_at) < p_before_at
           or (coalesce(c.last_message_at, c.created_at) = p_before_at and c.id < p_before_id))
    order by coalesce(c.last_message_at, c.created_at) desc, c.id desc
  loop
    if v_row.new_post then
      v_unread := 1;
      v_mentioned := false;
    elsif not v_row.has_row and v_row.kind = 'post' then
      v_unread := case when exists (
        select 1 from public.conversations c
        join public.messages rm on rm.id = c.first_message_id
        left join public.team_reads r on r.team_id = c.anchor_id and r.user_id = v_me
        where c.id = v_row.id and rm.author_user_id is distinct from v_me
          and c.created_at > greatest(coalesce(r.last_read_at, '-infinity'), now() - interval '7 days')) then 1 else 0 end;
      v_mentioned := false;
    elsif not v_row.has_row then
      v_unread := null;
      v_mentioned := false;
    elsif v_row.level = 'mute' then
      v_unread := 0;
      v_mentioned := false;
    else
      select count(*)::integer, coalesce(bool_or(mm.message_id is not null), false) into v_unread, v_mentioned
      from public.messages m
      left join public.message_mentions mm on mm.message_id = m.id and mm.mentioned_user_id = v_me
      where m.conversation_id = v_row.id and m.deleted_at is null and m.author_user_id is distinct from v_me
        and m.created_at > coalesce(v_row.last_read_at, '-infinity')
        and (v_row.level = 'all' or mm.message_id is not null);
    end if;
    if p_unread_only and coalesce(v_unread, 0) = 0 then
      continue;
    end if;
    if not public.conversation_access(v_me, v_row.id, 'view') then
      continue;
    end if;
    select m.author_user_id, coalesce(u.name, u.email) as name, public.message_excerpt(m.body, 140) as excerpt into v_last
    from public.messages m left join public.users u on u.id = m.author_user_id
    where m.conversation_id = v_row.id and m.deleted_at is null
    order by m.created_at desc, m.id desc limit 1;

    conversation_id := v_row.id;
    kind := v_row.kind;
    anchor_type := v_row.anchor_type;
    anchor_id := v_row.anchor_id;
    team_id := case when v_row.kind = 'post' then v_row.anchor_id else v_row.team_id end;
    team_name := (select g.name from public.teams g where g.id = team_id);
    title := public.conversation_label(v_row.id);
    link := public.conversation_link(v_row.id);
    sort_at := v_row.sort_at;
    last_author_user_id := v_last.author_user_id;
    last_author_name := v_last.name;
    last_excerpt := v_last.excerpt;
    unread_count := v_unread;
    mentioned := v_mentioned;
    taking_part := v_row.taking_part;
    level := v_row.level;
    -- A direct conversation: the other person, so the list shows their photo.
    partner_user_id := case when v_row.kind = 'direct' then
      (select k::uuid from unnest(string_to_array(v_row.direct_key, ':')) k where k <> v_me::text limit 1) end;
    return next;
    v_count := v_count + 1;
    exit when v_count >= v_limit;
  end loop;
end;
$$;

REVOKE ALL ON FUNCTION public.inbox_list(p_view text, p_team_id uuid, p_unread_only boolean, p_kind text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_list(p_view text, p_team_id uuid, p_unread_only boolean, p_kind text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inbox_list(p_view text, p_team_id uuid, p_unread_only boolean, p_kind text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) TO service_role;
GRANT ALL ON FUNCTION public.inbox_list(p_view text, p_team_id uuid, p_unread_only boolean, p_kind text, p_before_at timestamp with time zone, p_before_id uuid, p_limit integer) TO authenticated;

CREATE FUNCTION public.inbox_mark_all_read() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.conversation_participants set last_read_at = now()
  where user_id = auth.uid() and taking_part;
  insert into public.conversation_participants (conversation_id, user_id, taking_part, last_read_at)
  select np, auth.uid(), false, now() from public.inbox_new_posts(auth.uid()) np
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and type = any (public.message_notification_types());
end;
$$;

REVOKE ALL ON FUNCTION public.inbox_mark_all_read() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_mark_all_read() FROM PUBLIC;
GRANT ALL ON FUNCTION public.inbox_mark_all_read() TO service_role;
GRANT ALL ON FUNCTION public.inbox_mark_all_read() TO authenticated;

CREATE FUNCTION public.inbox_new_posts(p_user_id uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select c.id
  from public.conversations c
  join public.messages rm on rm.id = c.first_message_id
  left join public.team_reads r on r.team_id = c.anchor_id and r.user_id = p_user_id
  left join public.conversation_participants p on p.conversation_id = c.id and p.user_id = p_user_id
  where c.kind = 'post' and c.anchor_type = 'teams' and c.deleted_at is null
    and c.created_at > now() - interval '7 days'
    and rm.author_user_id is distinct from p_user_id
    and c.created_at > coalesce(r.last_read_at, '-infinity')
    and c.created_at > coalesce(p.last_read_at, '-infinity')
    and not coalesce(p.taking_part, false)
    and public.team_follow_level(p_user_id, c.anchor_id) = 'all';
$$;

REVOKE ALL ON FUNCTION public.inbox_new_posts(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_new_posts(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.inbox_new_posts(p_user_id uuid) TO service_role;

CREATE FUNCTION public.inbox_unread_count() RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  -- Once: auth.uid() parses the JWT claims, and called inside the query it ran for every message row (0.5 s).
  v_me uuid := auth.uid();
  v_count integer;
begin
  -- Materialized: inlined, the planner ran the (cheap-looking) access check on every conversation I take part in
  -- before the unread filter, 600 checks instead of the 120 unread ones.
  with mine as materialized (
    select p.conversation_id as id
    from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id and c.deleted_at is null
    where p.user_id = v_me and p.taking_part and p.level <> 'mute'
      and c.last_message_at > coalesce(p.last_read_at, '-infinity')
      and exists (
        select 1 from public.messages m
        where m.conversation_id = p.conversation_id and m.deleted_at is null and m.author_user_id is distinct from v_me
          and m.created_at > coalesce(p.last_read_at, '-infinity')
          and (p.level = 'all' or exists (
            select 1 from public.message_mentions mm where mm.message_id = m.id and mm.mentioned_user_id = v_me)))
    union
    select np from public.inbox_new_posts(v_me) np
  )
  select count(*)::integer into v_count from (
    select 1 from mine where coalesce(public.conversation_access(v_me, mine.id, 'view'), false) limit 100
  ) counted;
  return v_count;
end;
$$;

REVOKE ALL ON FUNCTION public.inbox_unread_count() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.inbox_unread_count() FROM PUBLIC;
GRANT ALL ON FUNCTION public.inbox_unread_count() TO service_role;
GRANT ALL ON FUNCTION public.inbox_unread_count() TO authenticated;

CREATE FUNCTION public.mentionable_users(p_entity_type text, p_entity_id uuid, p_search text DEFAULT ''::text) RETURNS TABLE(id uuid, name text, email text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.can_access_entity(p_entity_type, p_entity_id, 'view') then
    return;
  end if;
  return query
    select u.id, u.name, u.email
    from public.users u
    where u.has_login
      and u.locked_at is null
      and (coalesce(p_search, '') = '' or u.name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
           or u.username ilike '%' || p_search || '%')
      and public.user_has_access(u.id, p_entity_type, p_entity_id, 'view')
    order by u.name nulls last
    limit 10;
end;
$$;

REVOKE ALL ON FUNCTION public.mentionable_users(p_entity_type text, p_entity_id uuid, p_search text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mentionable_users(p_entity_type text, p_entity_id uuid, p_search text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mentionable_users(p_entity_type text, p_entity_id uuid, p_search text) TO authenticated;
GRANT ALL ON FUNCTION public.mentionable_users(p_entity_type text, p_entity_id uuid, p_search text) TO service_role;

CREATE FUNCTION public.message_notification_types() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select array['mention', 'team_mention', 'comment', 'team_post', 'team_comment', 'reaction', 'direct_message']
$$;

REVOKE ALL ON FUNCTION public.message_notification_types() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.message_notification_types() FROM PUBLIC;
GRANT ALL ON FUNCTION public.message_notification_types() TO service_role;
GRANT ALL ON FUNCTION public.message_notification_types() TO authenticated;

CREATE FUNCTION public.notifications_mark_conversations_read(p_conversation_ids uuid[]) RETURNS void
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  update public.notifications n set read_at = now()
  where n.user_id = auth.uid() and n.read_at is null
    and n.type = any (public.message_notification_types())
    and n.link in (
      select case c.kind when 'record' then '/' || c.anchor_type || '/' || c.anchor_id else '/messages/' || c.id end
      from public.conversations c
      where c.id = any (p_conversation_ids)
    );
$$;

REVOKE ALL ON FUNCTION public.notifications_mark_conversations_read(p_conversation_ids uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.notifications_mark_conversations_read(p_conversation_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.notifications_mark_conversations_read(p_conversation_ids uuid[]) TO service_role;
GRANT ALL ON FUNCTION public.notifications_mark_conversations_read(p_conversation_ids uuid[]) TO authenticated;

CREATE FUNCTION public.poll_normalize(p_poll jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  v_options jsonb;
begin
  if jsonb_typeof(p_poll -> 'options') <> 'array' then
    raise exception 'A poll needs options';
  end if;
  select coalesce(jsonb_agg(btrim(o) order by n), '[]'::jsonb) into v_options
  from jsonb_array_elements_text(p_poll -> 'options') with ordinality as e (o, n)
  where btrim(o) <> '';
  if jsonb_array_length(v_options) not between 2 and 10 then
    raise exception 'A poll has 2 to 10 options';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_options) o where length(o) > 200) then
    raise exception 'An option has at most 200 characters';
  end if;
  if (select count(distinct lower(o)) from jsonb_array_elements_text(v_options) o) < jsonb_array_length(v_options) then
    raise exception 'The options of a poll differ';
  end if;
  return jsonb_build_object(
    'options', v_options,
    'multiple', coalesce((p_poll ->> 'multiple')::boolean, false),
    'public', coalesce((p_poll ->> 'public')::boolean, false),
    'closed_at', null,
    'vote_count', 0);
end;
$$;

REVOKE ALL ON FUNCTION public.poll_normalize(p_poll jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_normalize(p_poll jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_normalize(p_poll jsonb) TO service_role;

CREATE FUNCTION public.poll_result(p_message_id uuid) RETURNS TABLE(option integer, votes integer, voter_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select o.n::integer - 1,
         count(v.user_id)::integer,
         case when (m.poll ->> 'public')::boolean
              then coalesce(array_agg(v.user_id order by v.created_at, v.user_id) filter (where v.user_id is not null), '{}') end
  from public.messages m
  cross join lateral jsonb_array_elements(m.poll -> 'options') with ordinality as o (value, n)
  left join public.poll_votes v on v.message_id = m.id and v.option = o.n - 1
  where m.id = p_message_id and m.deleted_at is null and m.poll is not null
    and public.conversation_access(auth.uid(), m.conversation_id, 'view')
    and (m.author_user_id = auth.uid() or m.poll ->> 'closed_at' is not null)
  group by m.id, o.n
  order by o.n;
$$;

REVOKE ALL ON FUNCTION public.poll_result(p_message_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_result(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_result(p_message_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.poll_result(p_message_id uuid) TO authenticated;

CREATE FUNCTION public.poll_state(p_message_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'poll', m.poll,
    'mine', coalesce((select jsonb_agg(v.option order by v.option) from public.poll_votes v
                      where v.message_id = m.id and v.user_id = auth.uid()), '[]'::jsonb),
    'result', coalesce((select jsonb_agg(to_jsonb(r) order by r.option) from public.poll_result(m.id) r), '[]'::jsonb))
  from public.messages m
  where m.id = p_message_id and m.deleted_at is null and m.poll is not null
    and public.conversation_access(auth.uid(), m.conversation_id, 'view');
$$;

REVOKE ALL ON FUNCTION public.poll_state(p_message_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.poll_state(p_message_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_state(p_message_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.poll_state(p_message_id uuid) TO authenticated;

CREATE FUNCTION public.team_mention_target(p_anchor_type text, p_anchor_id uuid) RETURNS TABLE(team_id uuid, name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select g.id, g.name from public.teams g
  where g.id = public.conversation_mention_team(p_anchor_type, p_anchor_id)
    and public.team_mention_allowed(auth.uid(), p_anchor_type, p_anchor_id);
$$;

REVOKE ALL ON FUNCTION public.team_mention_target(p_anchor_type text, p_anchor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_mention_target(p_anchor_type text, p_anchor_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_mention_target(p_anchor_type text, p_anchor_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.team_mention_target(p_anchor_type text, p_anchor_id uuid) TO authenticated;

CREATE FUNCTION public.search_field_score(p_field text, p_term text) RETURNS real
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select coalesce(extensions.word_similarity(p_term, coalesce(p_field, '')), 0)::real
    + case when coalesce(p_field, '') ilike '%' || p_term || '%' then 0.3 else 0 end;
$$;

REVOKE ALL ON FUNCTION public.search_field_score(p_field text, p_term text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_field_score(p_field text, p_term text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_field_score(p_field text, p_term text) TO authenticated;
GRANT ALL ON FUNCTION public.search_field_score(p_field text, p_term text) TO service_role;

CREATE FUNCTION public.search_fold(p_text text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select replace(translate(lower(coalesce(p_text, '')),
    'àáâãäåāăąçćčďèéêëēėęěìíîïīįłñńňòóôõöøōőřśšşťùúûüūůűųýÿźżž',
    'aaaaaaaaacccdeeeeeeeeiiiiiilnnnoooooooorssstuuuuuuuuyyzzz'), 'ß', 'ss')
$$;

REVOKE ALL ON FUNCTION public.search_fold(p_text text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.search_fold(p_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.search_fold(p_text text) TO service_role;

CREATE FUNCTION public.team_create(p_name text, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_me is null or not (public.can_manage_teams() or public.rls_has('teams.create')) then
    raise exception 'You cannot create a team';
  end if;
  if length(v_name) not between 2 and 60 then
    raise exception 'The name of a team has 2 to 60 characters';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name)) then
    raise exception 'A team with this name exists';
  end if;
  insert into public.teams (name, description, user_created, created_by_user_id,
                             usable_for_tasks, usable_for_filters, usable_for_trainings, usable_for_positions, usable_for_leave)
  values (v_name, nullif(btrim(coalesce(p_description, '')), ''), true, v_me, true, true, false, false, false)
  returning id into v_id;
  insert into public.team_owners (team_id, user_id) values (v_id, v_me);
  insert into public.user_teams (user_id, team_id) values (v_me, v_id);
  return v_id;
end;
$$;

REVOKE ALL ON FUNCTION public.team_create(p_name text, p_description text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_create(p_name text, p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_create(p_name text, p_description text) TO service_role;
GRANT ALL ON FUNCTION public.team_create(p_name text, p_description text) TO authenticated;

CREATE FUNCTION public.team_mark_read(p_team_id uuid) RETURNS void
    LANGUAGE sql
    AS $$
  insert into public.team_reads (user_id, team_id, last_read_at) values (auth.uid(), p_team_id, now())
  on conflict (user_id, team_id) do update set last_read_at = now();
  select public.notifications_mark_conversations_read(
    array(select c.id from public.conversations c where c.kind = 'post' and c.anchor_type = 'teams' and c.anchor_id = p_team_id));
$$;

REVOKE ALL ON FUNCTION public.team_mark_read(p_team_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_mark_read(p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_mark_read(p_team_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.team_mark_read(p_team_id uuid) TO authenticated;

CREATE FUNCTION public.team_owner_transfer(p_team_id uuid, p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from public.team_owners where team_id = p_team_id and user_id = v_me) then
    raise exception 'You cannot hand over this team';
  end if;
  if p_user_id is null or p_user_id = v_me
     or not exists (select 1 from public.user_teams where team_id = p_team_id and user_id = p_user_id)
     or not exists (select 1 from public.users where id = p_user_id and has_login and not has_left and locked_at is null) then
    raise exception 'The new owner must be another member who can sign in';
  end if;
  insert into public.team_owners (team_id, user_id) values (p_team_id, p_user_id) on conflict do nothing;
  delete from public.team_owners where team_id = p_team_id and user_id = v_me;
end;
$$;

REVOKE ALL ON FUNCTION public.team_owner_transfer(p_team_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_owner_transfer(p_team_id uuid, p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_owner_transfer(p_team_id uuid, p_user_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.team_owner_transfer(p_team_id uuid, p_user_id uuid) TO authenticated;

CREATE FUNCTION public.team_photo_editable(p_group text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
  select p_group ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and (public.can_manage_teams() or public.team_message_access(auth.uid(), p_group::uuid, 'moderate'));
$_$;

REVOKE ALL ON FUNCTION public.team_photo_editable(p_group text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_photo_editable(p_group text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_photo_editable(p_group text) TO service_role;
GRANT ALL ON FUNCTION public.team_photo_editable(p_group text) TO authenticated;

CREATE FUNCTION public.team_photo_set(p_team_id uuid, p_path text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not public.team_photo_editable(p_team_id::text) then
    raise exception 'Only an owner changes the picture of a group';
  end if;
  update public.teams set photo_path = p_path where id = p_team_id;
end;
$$;

REVOKE ALL ON FUNCTION public.team_photo_set(p_team_id uuid, p_path text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_photo_set(p_team_id uuid, p_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_photo_set(p_team_id uuid, p_path text) TO service_role;
GRANT ALL ON FUNCTION public.team_photo_set(p_team_id uuid, p_path text) TO authenticated;

CREATE FUNCTION public.team_rename(p_team_id uuid, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not exists (select 1 from public.team_owners where team_id = p_team_id and user_id = auth.uid()) then
    raise exception 'You cannot rename this team';
  end if;
  if length(v_name) not between 2 and 60 then
    raise exception 'The name of a team has 2 to 60 characters';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name) and id <> p_team_id) then
    raise exception 'A team with this name exists';
  end if;
  update public.teams set name = v_name where id = p_team_id;
end;
$$;

REVOKE ALL ON FUNCTION public.team_rename(p_team_id uuid, p_name text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.team_rename(p_team_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team_rename(p_team_id uuid, p_name text) TO service_role;
GRANT ALL ON FUNCTION public.team_rename(p_team_id uuid, p_name text) TO authenticated;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View conversations" ON public.conversations FOR SELECT TO authenticated USING (public.conversation_can(id, 'view'::text));

CREATE POLICY mfa_required ON public.conversations AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER poll_votes_drop_with_post AFTER UPDATE OF deleted_at ON public.conversations FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.poll_votes_drop_with_post();

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own participation" ON public.conversation_participants TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.conversation_can(conversation_id, 'view'::text)));

CREATE POLICY mfa_required ON public.conversation_participants AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Edit own messages" ON public.messages FOR UPDATE TO authenticated USING (((author_user_id = ( SELECT auth.uid() AS uid)) AND (deleted_at IS NULL))) WITH CHECK ((author_user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "View messages" ON public.messages FOR SELECT TO authenticated USING (public.conversation_can(conversation_id, 'view'::text));

CREATE POLICY "Write messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (((author_user_id = ( SELECT auth.uid() AS uid)) AND public.conversation_can(conversation_id, 'post'::text)));

CREATE POLICY mfa_required ON public.messages AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER messages_a_stats AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_a_stats();

CREATE TRIGGER messages_b_mentions AFTER INSERT OR UPDATE OF body ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_b_mentions();

CREATE TRIGGER messages_c_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_c_notify();

CREATE TRIGGER messages_d_team_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_d_team_notify();

CREATE TRIGGER messages_e_direct AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_e_direct();

CREATE TRIGGER messages_guard BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.messages_guard();

ALTER TABLE public.message_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View mentions" ON public.message_mentions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.messages m
  WHERE (m.id = message_mentions.message_id))));

CREATE POLICY mfa_required ON public.message_mentions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Add own reactions" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.messages m
  WHERE ((m.id = message_reactions.message_id) AND (m.deleted_at IS NULL))))));

CREATE POLICY "Remove own reactions" ON public.message_reactions FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "View reactions" ON public.message_reactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.messages m
  WHERE (m.id = message_reactions.message_id))));

CREATE POLICY mfa_required ON public.message_reactions AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE TRIGGER message_reactions_notify AFTER INSERT ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION public.message_reactions_notify();

CREATE TRIGGER message_reactions_sync AFTER INSERT OR DELETE ON public.message_reactions FOR EACH ROW EXECUTE FUNCTION public.message_reactions_sync();

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own votes" ON public.poll_votes FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_required ON public.poll_votes AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.team_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own follows" ON public.team_follows TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.team_message_can(team_id, 'view'::text)));

CREATE POLICY mfa_required ON public.team_follows AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

ALTER TABLE public.team_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own reads" ON public.team_reads TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY mfa_required ON public.team_reads AS RESTRICTIVE TO authenticated USING (( SELECT public.mfa_satisfied() AS mfa_satisfied)) WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE VIEW public.team_posts_overview WITH (security_invoker='on') AS
 SELECT c.id,
    c.anchor_id AS team_id,
    g.name AS team_name,
    g.posting,
    rm.id AS root_message_id,
    rm.author_user_id,
    u.name AS author_name,
    u.photo_url AS author_photo_url,
    c.title,
    rm.body,
    c.pinned,
    c.pinned_at,
    GREATEST((c.message_count - 1), 0) AS comment_count,
        CASE
            WHEN (c.message_count > 1) THEN c.last_message_at
            ELSE NULL::timestamp with time zone
        END AS last_comment_at,
    c.created_at,
    rm.edited_at,
    rm.poll
   FROM (((public.conversations c
     JOIN public.teams g ON ((g.id = c.anchor_id)))
     JOIN public.messages rm ON ((rm.id = c.first_message_id)))
     LEFT JOIN public.users u ON ((u.id = rm.author_user_id)))
  WHERE ((c.kind = 'post'::text) AND (c.anchor_type = 'teams'::text) AND (c.deleted_at IS NULL));

REVOKE ALL ON TABLE public.team_posts_overview FROM anon, authenticated, service_role;
GRANT ALL ON TABLE public.team_posts_overview TO authenticated;
GRANT ALL ON TABLE public.team_posts_overview TO service_role;
