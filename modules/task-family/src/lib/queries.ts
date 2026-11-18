// Ported 1:1 from COMPASS (app/src/lib/queries.ts).
import { supabaseClient } from "@rbp/core";
import { REACTIONS_COLUMN, splitReactions } from "@rbp/module-messaging/src/lib/reactions.ts";
import type { TaskOverviewRow, TaskTypeStep, TicketOverviewRow } from "./domain";

// Query functions shared between the pages and the offline prefetch (offline/prefetch.ts), so both fill the same cache entries.

export const fetchTask = async (id: string) =>
  (await supabaseClient.from("tasks_overview").select("*").eq("id", id).maybeSingle()).data as TaskOverviewRow | null;

export const fetchTaskSteps = async (taskTypeId: string) =>
  ((await supabaseClient.from("task_type_steps").select("*").eq("task_type_id", taskTypeId).order("step_order")).data ?? []) as TaskTypeStep[];

export type FeedEntryRow = {
  id: string;
  kind: "comment" | "system_event";
  body: string | null;
  event_type: string | null;
  metadata: Record<string, any>;
  author_user_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
};
export type FeedAttachmentRow = { id: string; entry_id: string | null; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null };

// The feed of a record: its messages (the conversation anchored to it) and its system events, oldest first.
// conversationId is null while a record has no conversation yet (it is created with the first message).
export const fetchFeed = async (entityType: string, entityId: string) => {
  const [conversation, events, attachments] = await Promise.all([
    supabaseClient.from("conversations").select("id").eq("kind", "record").eq("anchor_type", entityType).eq("anchor_id", entityId).is("deleted_at", null).maybeSingle(),
    supabaseClient
      .from("activity_events")
      .select("id, event_type, metadata, author_user_id, created_at")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId),
    supabaseClient
      .from("attachments")
      .select("id, message_id, event_id, storage_path, file_name, mime_type, size_bytes")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .or("message_id.not.is.null,event_id.not.is.null"),
  ]);
  if (conversation.error) throw conversation.error;
  if (events.error) throw events.error;
  const messages = conversation.data
    ? await supabaseClient
        .from("messages")
        .select(`id, body, author_user_id, created_at, edited_at, deleted_at, reply_to_message_id, ${REACTIONS_COLUMN}`)
        .eq("conversation_id", conversation.data.id)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (messages.error) throw messages.error;
  const { messages: rows, reactions } = splitReactions((messages.data ?? []) as any[]);
  const entries: FeedEntryRow[] = [
    ...rows.map((m: any) => ({ ...m, kind: "comment" as const, event_type: null, metadata: {} })),
    ...(events.data ?? []).map((e: any) => ({
      ...e,
      kind: "system_event" as const,
      body: null,
      edited_at: null,
      deleted_at: null,
      reply_to_message_id: null,
    })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    conversationId: (conversation.data?.id ?? null) as string | null,
    reactions,
    entries,
    attachments: ((attachments.data ?? []) as any[]).map((a) => ({ ...a, entry_id: a.message_id ?? a.event_id })) as FeedAttachmentRow[],
  };
};

export const fetchTicket = async (id: string) =>
  (await supabaseClient.from("tickets_overview").select("*").eq("id", id).maybeSingle()).data as TicketOverviewRow | null;

export const fetchCanEdit = async (entityType: string, entityId: string) => {
  const { data: allowed } = await supabaseClient.rpc("can_access_entity", { p_entity_type: entityType, p_entity_id: entityId, p_grant_type: "edit" });
  return allowed === true;
};
