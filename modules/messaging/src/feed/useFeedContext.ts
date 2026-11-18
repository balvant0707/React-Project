import { useTeams, useUserMap } from "@rbp/core";
import type { FeedContext } from "./eventText";
import { userDisplayName } from "./mentions";

// Name lookups a module adds for its event metadata (COMPASS useFeedContext: the assets named in the metadata, the steps of a
// task's route). `use` is a hook, called on every feed render in registration order (modules register at load), and returns
// the lookup for one id; undefined = unknown.
type Events = { metadata: Record<string, unknown> | null }[];
type NameSource = { kind: string; use: (entityType: string, entityId: string, events: Events) => (id: string) => string | undefined };
const nameSources: NameSource[] = [];
export const registerFeedNames = (kind: string, use: NameSource["use"]) => void nameSources.push({ kind, use });

// The name lookups for history events (eventSentence), shared by the record feed and the chat on the Messages page.
export function useFeedContext(entityType = "", entityId = "", events: Events = []): FeedContext {
  const users = useUserMap();
  const { data: teams } = useTeams();
  const lookups = new Map(nameSources.map((s) => [s.kind, s.use(entityType, entityId, events)]));
  return {
    userName: (id) => (id && users.get(id) ? userDisplayName(users.get(id)!) : "?"),
    teamName: (id) => teams?.find((g) => g.id === id)?.name ?? "?",
    name: (kind, id) => (id ? lookups.get(kind)?.(id) ?? id : "—"),
  };
}
