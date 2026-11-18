import type { QueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";

// Polls in group posts (~/maintenance_tool/docs/messaging.md "Polls"): messages.poll on the post's first message, own votes in poll_votes,
// the result through poll_result (author at once, others once ended). UI: chats/pollCard.tsx and the post editor.

// messages.poll as the database keeps it.
export type Poll = { options: string[]; multiple: boolean; public: boolean; closed_at: string | null; vote_count: number };
// The poll being written in the post form; `key` keeps the option inputs stable while options are removed.
export type PollDraft = { options: { key: string; text: string }[]; multiple: boolean; public: boolean };
// One row per option; voter_ids only in a public poll.
type PollResultRow = { option: number; votes: number; voter_ids: string[] | null };
type PollState = { poll: Poll | null; mine: number[]; result: PollResultRow[] };

export const POLL_MAX_OPTIONS = 10;

export const pollEnded = (poll: Pick<Poll, "closed_at">) => !!poll.closed_at;

const draftTexts = (draft: PollDraft) => draft.options.map((o) => o.text.trim()).filter(Boolean);

// What keeps a draft from being posted, as poll_normalize checks it: fewer than two options, or two equal ones.
export const pollDraftProblem = (draft: PollDraft): "tooFew" | "duplicate" | null => {
  const texts = draftTexts(draft);
  if (texts.length < 2) return "tooFew";
  if (new Set(texts.map((o) => o.toLowerCase())).size < texts.length) return "duplicate";
  return null;
};

// team_post_create p_poll.
export const pollDraftPayload = (draft: PollDraft) => ({ options: draftTexts(draft), multiple: draft.multiple, public: draft.public });

export const pollQueryKey = (messageId: string) => ["poll", messageId] as const;

// Current poll, my votes and the result as far as I may see it (RPC poll_state).
export async function fetchPollState(messageId: string): Promise<PollState> {
  const { data, error } = await supabaseClient.rpc("poll_state", { p_message_id: messageId });
  if (error) throw error;
  const state = data as PollState | null;
  return { poll: state?.poll ?? null, mine: state?.mine ?? [], result: state?.result ?? [] };
}

// Patches a Realtime poll update into the cache; returns whether the poll changed (a vote or the end, not a reaction).
// The result is refetched only when it can have changed for me (ended, or I am the author).
export function applyPollUpdate(queryClient: QueryClient, messageId: string, poll: Poll | null | undefined, authorIsMe: boolean): boolean {
  const key = pollQueryKey(messageId);
  const cached = queryClient.getQueryData<PollState>(key);
  if (!poll || !cached?.poll) return false;
  if (JSON.stringify(cached.poll) === JSON.stringify(poll)) return false;
  if (authorIsMe || poll.closed_at !== cached.poll.closed_at) void queryClient.invalidateQueries({ queryKey: key });
  else queryClient.setQueryData<PollState>(key, { ...cached, poll });
  return true;
}

export const pollVote = (messageId: string, options: number[]) => supabaseClient.rpc("poll_vote", { p_message_id: messageId, p_options: options });
export const pollClose = (messageId: string) => supabaseClient.rpc("poll_close", { p_message_id: messageId });

export const isPollClosedError = (error: { hint?: string | null } | null | undefined) => error?.hint === "poll_closed";
