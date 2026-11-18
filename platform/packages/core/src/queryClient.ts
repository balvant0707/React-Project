// Copied from COMPASS app/src/queryClient.ts (NPM's is the same minus the offline parts). Changes: the week-long gcTime moved
// to offline/persistCache.ts (set only in an app that keeps the device cache, COMPASS; RADAR keeps the default), and the
// queued writes of module outboxes are counted through registerOutbox (COMPASS: hooks/useOutboxCount.ts of the checklists).
import { QueryClient, QueryCache, MutationCache, keepPreviousData, replaceEqualDeep } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { lastRequestFailedAtNetworkLevel } from "./supabase";

// A shared external store (no React context) of the queries and mutations that are currently erroring, as a set keyed
// by query hash / mutation id: a single boolean would flicker "reachable" whenever any one concurrent query succeeds.
// The banner is on while at least one errors and clears once all have succeeded or been evicted (the `removed` cache
// event).
type Listener = () => void;
const listeners = new Set<Listener>();
const erroringKeys = new Set<string>();

function notify() {
  listeners.forEach((l) => l());
}

function markErroring(key: string) {
  const wasEmpty = erroringKeys.size === 0;
  erroringKeys.add(key);
  if (wasEmpty) notify();
}

function clearErroring(key: string) {
  if (erroringKeys.delete(key) && erroringKeys.size === 0) notify();
}

export function subscribeBackendReachability(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBackendUnreachable() {
  return erroringKeys.size > 0;
}

// Handed to <Refine options={{ reactQuery: { clientConfig } }}> as a QueryClient instance. Refine then skips its own
// default merging (refetchOnWindowFocus: false, placeholderData: keepPreviousData), so those are replicated here.
// The global queryCache/mutationCache onError+onSuccess fire once per query/mutation on any page, so an unreachable
// backend is caught for every request. onError fires after the retries are exhausted; retries pause while the tab is
// hidden.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
      // Bad reception: a request that failed at the network level resolves with an empty result instead of throwing.
      // Keep the old data then, so a flaky connection never replaces good cached data with nothing.
      structuralSharing: (oldData: unknown, newData: unknown) =>
        oldData !== undefined && lastRequestFailedAtNetworkLevel() ? oldData : replaceEqualDeep(oldData, newData),
    },
    // Writes fail at once instead of hanging while offline. A module with its own write queue (COMPASS checklists)
    // registers it below; the rest of the app needs a connection to save.
    mutations: { networkMode: "always" },
  },
  queryCache: new QueryCache({
    onError: (_error, query) => markErroring(query.queryHash),
    onSuccess: (_data, query) => clearErroring(query.queryHash),
  }),
  mutationCache: new MutationCache({
    onError: (_error, _variables, _context, mutation) => markErroring(String(mutation.mutationId)),
    onSuccess: (_data, _variables, _context, mutation) => clearErroring(String(mutation.mutationId)),
  }),
});

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "removed") clearErroring(event.query.queryHash);
});

// Connection is back: refresh what is on screen.
window.addEventListener("online", () => void queryClient.invalidateQueries());

/** A module's write queue on the device (COMPASS checklist answers and photos): the status banner shows how many wait. */
export interface Outbox {
  count: () => Promise<number>;
  subscribe: (listener: () => void) => () => void;
}
const outboxes = new Set<Outbox>();
export const registerOutbox = (outbox: Outbox) => void outboxes.add(outbox);

// How many entries wait on this device to be sent, over all registered outboxes (COMPASS hooks/useOutboxCount.ts).
export function useOutboxCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const read = () =>
      void Promise.all([...outboxes].map((o) => o.count()))
        .then((n) => alive && setCount(n.reduce((a, b) => a + b, 0)))
        .catch(() => undefined);
    read();
    const offs = [...outboxes].map((o) => o.subscribe(read));
    const timer = window.setInterval(read, 5000);
    return () => {
      alive = false;
      offs.forEach((off) => off());
      window.clearInterval(timer);
    };
  }, []);
  return count;
}
