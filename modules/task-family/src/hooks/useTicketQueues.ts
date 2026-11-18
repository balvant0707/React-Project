// Ported 1:1 from COMPASS (app/src/hooks/useTicketQueues.ts).
import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@rbp/core";
import { usePermissions } from "@rbp/core";
import { useHasModule } from "../lib/modules";

export type TicketQueue = {
  id: string;
  key: string;
  name: string;
  name_de: string;
  description: string | null;
  open_to_everyone: boolean;
  icon: string | null;
  color: string | null;
  default_team_id: string | null;
  sort_order: number;
  active: boolean;
};

// Platform (andon): group_key, default_priority and public_report are the andon fields of a type (tickets migration 20261114100000).
export type TicketTypeRow = {
  id: string;
  queue_id: string;
  key: string;
  name: string;
  name_de: string;
  sort_order: number;
  active: boolean;
  group_key: string | null;
  default_priority: string | null;
  public_report: boolean;
};

type QueueData = { queues: TicketQueue[]; types: TicketTypeRow[]; working: string[] };
// Module level, so the query memoizes the result and `working` keeps its identity between renders.
const withWorkingSet = (d: QueueData) => ({ ...d, working: new Set(d.working) });

// The queues (service desks) and their ticket types. `creatable` = the active queues the signed-in user may open a
// ticket in: queues open to everyone, or the user holds a create literal (the broad ones only in a queue they work in,
// i.e. one without teams or with a team of theirs, rpc my_ticket_queue_ids); the database checks again on insert.
export function useTicketQueues() {
  const { hasAny, ready } = usePermissions();
  const { data } = useQuery({
    queryKey: ["ticket-queues"],
    // Platform: the queues come with the tickets module.
    enabled: useHasModule("tickets"),
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: queues }, { data: types }, { data: working }] = await Promise.all([
        supabaseClient.from("ticket_queues").select("*").order("sort_order").order("name"),
        supabaseClient.from("ticket_types").select("*").order("sort_order").order("name"),
        supabaseClient.rpc("my_ticket_queue_ids"),
      ]);
      return { queues: (queues ?? []) as TicketQueue[], types: (types ?? []) as TicketTypeRow[], working: (working ?? []) as string[] };
    },
    // The cache is persisted as JSON, so it holds the array; the Set is built here (offline/persistCache.ts).
    select: withWorkingSet,
  });
  const queues = data?.queues ?? [];
  const types = data?.types ?? [];
  const working = data?.working ?? new Set<string>();
  const mayCreateIn = (q: TicketQueue) =>
    q.active && (q.open_to_everyone || hasAny("tickets.create.reported") || hasAny("tickets.create.team") || (working.has(q.id) && hasAny("tickets.create.")));
  return {
    queues,
    types,
    typesOf: (queueId: string | undefined) => types.filter((x) => x.queue_id === queueId && x.active),
    creatable: ready ? queues.filter(mayCreateIn) : [],
    // Somebody without a ticket literal still follows their own tickets in such a queue.
    hasOpenQueue: queues.some((q) => q.open_to_everyone),
  };
}
