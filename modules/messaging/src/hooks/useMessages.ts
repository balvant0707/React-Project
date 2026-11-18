import { useEffect } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import type { Poll } from "../lib/polls";

// The Messages page (~/maintenance_tool/docs/messaging.md): the groups I may read with what I may do there, unread counts, the Inbox.
// Query results are plain objects and arrays, never Maps: the query cache is persisted for offline use.

export type FollowLevel = "all" | "mentions" | "mute";

export type MessageGroup = {
  id: string;
  name: string;
  description: string | null;
  photo_path: string | null;
  posting: "everyone" | "owners";
  audience: "members" | "everyone";
  auto_follow: boolean;
  team_mentions: "owners" | "members";
  can_post: boolean;
  can_comment: boolean;
  can_moderate: boolean;
  is_member: boolean;
  is_owner: boolean;
  // null = I do not follow the group ("Discover groups")
  level: FollowLevel | null;
};

export type GroupPost = {
  id: string; // the conversation
  root_message_id: string;
  team_id: string;
  team_name: string;
  posting: "everyone" | "owners";
  author_user_id: string | null;
  author_name: string | null;
  author_photo_url: string | null;
  title: string | null;
  body: string;
  pinned: boolean;
  pinned_at: string | null;
  comment_count: number;
  last_comment_at: string | null;
  created_at: string;
  edited_at: string | null;
  poll: Poll | null;
};

export type InboxRow = {
  conversation_id: string;
  kind: "record" | "post" | "direct" | "group";
  anchor_type: string | null;
  anchor_id: string | null;
  team_id: string | null;
  team_name: string | null;
  title: string | null;
  link: string;
  sort_at: string;
  last_author_user_id: string | null;
  last_author_name: string | null;
  last_excerpt: string | null;
  unread_count: number | null;
  mentioned: boolean;
  taking_part: boolean;
  level: FollowLevel;
  // Direct conversations: the other person (their photo stands for the conversation).
  partner_user_id: string | null;
};

export function useMessageGroups() {
  const { data, isLoading } = useQuery({
    queryKey: ["message-groups"],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: groups, error }, { data: rights, error: rightsError }] = await Promise.all([
        supabaseClient.from("teams").select("id, name, description, photo_path, posting, audience, team_mentions, auto_follow").order("name"),
        supabaseClient.rpc("team_message_rights"),
      ]);
      if (error) throw error;
      if (rightsError) throw rightsError;
      const byId: Record<string, Omit<MessageGroup, "id" | "name" | "description" | "photo_path" | "posting" | "audience" | "team_mentions" | "auto_follow">> = {};
      for (const r of (rights ?? []) as ({ team_id: string } & MessageGroup)[]) byId[r.team_id] = r;
      return ((groups ?? []) as Pick<MessageGroup, "id" | "name" | "description" | "photo_path" | "posting" | "audience" | "team_mentions" | "auto_follow">[])
        .filter((g) => byId[g.id])
        .map((g) => ({ ...g, ...byId[g.id], level: byId[g.id].level ?? null }) as MessageGroup);
    },
  });
  const groups = data ?? [];
  return {
    groups,
    isLoading,
    groupOf: (id: string | null | undefined) => groups.find((g) => g.id === id),
    // Under "My groups": member, owner or following.
    mine: groups.filter((g) => g.is_member || g.is_owner || g.level !== null),
    discover: groups.filter((g) => !g.is_member && !g.is_owner && g.level === null),
  };
}

// New posts per group since I last looked (not my own).
export function useGroupUnread() {
  const { data } = useQuery({
    queryKey: ["group-unread"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: rows } = await supabaseClient.rpc("team_unread_counts");
      const byGroup: Record<string, number> = {};
      for (const r of (rows ?? []) as { team_id: string; unread: number }[]) byGroup[r.team_id] = Number(r.unread);
      return byGroup;
    },
  });
  return data ?? {};
}

// The badge of the menu entry: conversations under "For me" with something unread.
export function useInboxUnread() {
  const { data } = useQuery({
    queryKey: ["inbox-unread"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: count } = await supabaseClient.rpc("inbox_unread_count");
      return Number(count ?? 0);
    },
  });
  return data ?? 0;
}

// Unread messages of the conversation of one record (task, ticket ...), for the chat button: what the Inbox would count
// (messages of others after my read marker; muted = 0; a record I never took part in or opened has no marker: 0).
export function useRecordUnread(entityType: string, entityId: string, userId: string | undefined, enabled = true) {
  const { data } = useQuery({
    queryKey: ["record-unread", entityType, entityId],
    enabled: enabled && !!entityId && !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: conv } = await supabaseClient.from("conversations").select("id").eq("kind", "record").eq("anchor_type", entityType).eq("anchor_id", entityId).maybeSingle();
      if (!conv) return 0;
      const { data: me } = await supabaseClient.from("conversation_participants").select("last_read_at, level").eq("conversation_id", conv.id).eq("user_id", userId!).maybeSingle();
      if (!me || me.level === "mute") return 0;
      const since = me.last_read_at ?? "1970-01-01";
      const base = supabaseClient.from("messages").select("id, message_mentions(mentioned_user_id)", { count: "exact", head: false }).eq("conversation_id", conv.id).is("deleted_at", null).neq("author_user_id", userId!).gt("created_at", since).limit(100);
      const { data: rows, count } = await base;
      if (me.level === "mentions") return (rows ?? []).filter((m) => (m.message_mentions as { mentioned_user_id: string }[]).some((x) => x.mentioned_user_id === userId)).length;
      return count ?? rows?.length ?? 0;
    },
  });
  return data ?? 0;
}

const INBOX_PAGE = 30;

export function useInbox(params: { view: "mine" | "group"; groupId?: string | null; unreadOnly?: boolean; kind?: "records" | "posts" | "direct" | null; enabled?: boolean; limit?: number }) {
  const limit = params.limit ?? INBOX_PAGE;
  return useInfiniteQuery({
    queryKey: ["inbox", params.view, params.groupId ?? null, !!params.unreadOnly, params.kind ?? null, limit],
    enabled: params.enabled ?? true,
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabaseClient.rpc("inbox_list", {
        p_view: params.view,
        p_team_id: params.groupId ?? null,
        p_unread_only: !!params.unreadOnly,
        p_kind: params.kind ?? null,
        p_before_at: pageParam?.at ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as InboxRow[];
    },
    getNextPageParam: (last) => (last.length === limit ? { at: last[last.length - 1].sort_at, id: last[last.length - 1].conversation_id } : undefined),
  });
}

// After reading or following something: the lists and counters that depend on it.
export const refreshMessageCounts = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ["inbox"] }),
    queryClient.invalidateQueries({ queryKey: ["inbox-unread"] }),
    queryClient.invalidateQueries({ queryKey: ["group-unread"] }),
  ]);

// Refreshes lists and counters when somebody writes (Realtime on conversations; the policies filter the events). Every
// message updates its conversation's counters, so that one table is enough; a burst of changes (a busy company, a
// team mention) is folded into one refresh every few seconds instead of one round of list queries per message.
const REALTIME_BATCH_MS = 3000;
export function useMessagesRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: ["group-posts"] });
        void queryClient.invalidateQueries({ queryKey: ["group-post"] });
        void refreshMessageCounts(queryClient);
      }, REALTIME_BATCH_MS);
    };
    const channel = supabaseClient
      .channel(`messages-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabaseClient.removeChannel(channel);
    };
  }, [queryClient]);
}

type ConversationHeader = {
  conversation_id: string;
  kind: InboxRow["kind"];
  anchor_type: string | null;
  anchor_id: string | null;
  team_id: string | null;
  team_name: string | null;
  title: string | null;
  link: string;
  first_message_id: string | null;
  can_post: boolean;
  can_moderate: boolean;
};

// What a conversation is (for the right pane): read once per conversation, null when I may not read it.
export function useConversationHeader(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation-header", conversationId],
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabaseClient.rpc("conversation_header", { p_conversation_id: conversationId });
      if (error) throw error;
      return (((data ?? []) as ConversationHeader[])[0] ?? null) as ConversationHeader | null;
    },
  });
}
