import { supabaseClient } from "@rbp/core";
import { selectInChunks } from "@rbp/ui";

// Emoji reactions on messages (~/maintenance_tool/docs/messaging.md "Reactions"; table message_reactions): the fixed set, stored as English
// codes, and the loader. The UI lives in components/feed/reactions.tsx.

export const REACTIONS = [
  { key: "thumbs_up", emoji: "👍" },
  { key: "check", emoji: "✅" },
  { key: "heart", emoji: "❤️" },
  { key: "laugh", emoji: "😂" },
  { key: "surprised", emoji: "😮" },
  { key: "thanks", emoji: "🙏" },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]["key"];
export type ReactionRow = { message_id: string; user_id: string; reaction: ReactionKey };
// message id -> its reactions (a plain object: the query cache is persisted).
export type ReactionMap = Record<string, ReactionRow[]>;

// messages.reactions as the database keeps it (trigger message_reactions_sync): code -> user ids in order.
export type ReactionColumn = Partial<Record<ReactionKey, string[]>> | null | undefined;
export const reactionRows = (messageId: string, column: ReactionColumn): ReactionRow[] =>
  REACTIONS.flatMap((r) => (column?.[r.key] ?? []).map((user_id) => ({ message_id: messageId, user_id, reaction: r.key })));

// The reactions of a few messages (the text of a post). Read from the messages, so the rights are checked once per
// message, not once per reaction (~/maintenance_tool/docs/messaging.md "Performance").
export async function fetchReactions(messageIds: string[]): Promise<ReactionMap> {
  const map: ReactionMap = {};
  if (!messageIds.length) return map;
  const rows = await selectInChunks<{ id: string; reactions: ReactionColumn }>(messageIds, (chunk) =>
    supabaseClient.from("messages").select("id, reactions").in("id", chunk),
  );
  for (const r of rows) map[r.id] = reactionRows(r.id, r.reactions);
  return map;
}

// For the messages queries: select the column with the messages and pull it out into a map.
export const REACTIONS_COLUMN = "reactions";
export function splitReactions<T extends { id: string; reactions?: ReactionColumn }>(rows: T[]) {
  const reactions: ReactionMap = {};
  const messages = rows.map(({ reactions: column, ...m }) => {
    const list = reactionRows(m.id, column);
    if (list.length) reactions[m.id] = list;
    return m as Omit<T, "reactions">;
  });
  return { messages, reactions };
}

// The column of a message row as it comes from a Realtime event or an old cache: anything the database holds (from NPM's
// utils/reactions.ts, which npm-email's note list used).
export const asReactions = (value: unknown): ReactionColumn =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as ReactionColumn) : {};

// A Realtime UPDATE of a message whose text and state are unchanged is a reaction (message_reactions_sync rewrites the
// message): the views then take the new reactions from the event itself instead of refetching the conversation.
export const isReactionUpdate = (
  cached: { body: string | null; edited_at: string | null; deleted_at: string | null } | undefined,
  row: { body?: string | null; edited_at?: string | null; deleted_at?: string | null },
) => !!cached && cached.body === row.body && cached.edited_at === row.edited_at && cached.deleted_at === row.deleted_at;
