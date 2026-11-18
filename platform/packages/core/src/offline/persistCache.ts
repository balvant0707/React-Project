// Copied from COMPASS app/src/offline/persistCache.ts. Changes: an app opts in by calling restoreOfflineCache before it renders
// (COMPASS does, RADAR keeps no device cache as the NPM tool did); the storage key, the queries left out and the extra clean-up
// (COMPASS: pinned asset files) come from the app; the identity key is the core auth provider's; the week-long gcTime that
// COMPASS set in queryClient.ts is set here; "mentionable" left the list (no such query any more).
import { persistQueryClientRestore, persistQueryClientSubscribe } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";
import { queryClient } from "../queryClient";
import { supabaseClient } from "../supabase";
import { IDENTITY_KEY } from "../refine/authProvider";

export interface OfflineCacheOptions {
  /** IndexedDB key of the cache, e.g. "compass-query-cache". */
  key: string;
  /** First query-key parts that are never persisted: big lists, signed URLs, blobs. */
  notPersisted?: string[];
  /** Further device data to wipe with the cache (sign-out, another user). */
  onClear?: () => Promise<void>;
  /** Raise when a persisted query changes its shape, so devices drop the old entries. */
  buster?: string;
}

// Read cache on the device: every successful query is kept in IndexedDB so "My work" and the pages the
// user opened before are readable without reception. Deliberately NOT persisted: big lists (the whole
// asset tree), signed URLs and PDF blobs (those live in the pinned-files cache, see task-family offline/files.ts).
const MAX_AGE = 7 * 24 * 3600_000;

/** Called once before the app renders, so the first render already sees the cached data. */
export async function restoreOfflineCache({ key, notPersisted = [], onClear, buster = "3" }: OfflineCacheOptions) {
  const USER_KEY = `${key}.user`;
  const NOT_PERSISTED = new Set(notPersisted);
  // Offline use: queries pause without a connection and keep showing what is cached. Cached data is kept for a week.
  queryClient.setDefaultOptions({ ...queryClient.getDefaultOptions(), queries: { ...queryClient.getDefaultOptions().queries, gcTime: MAX_AGE } });

  const persister = createAsyncStoragePersister({
    storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
    key,
    throttleTime: 2000,
  });

  const options = {
    queryClient,
    persister,
    maxAge: MAX_AGE,
    // The cache is JSON: a query must return plain data (a Set or Map comes back as {}; build it in `select`).
    buster,
    dehydrateOptions: {
      shouldDehydrateQuery: (query: { state: { status: string }; queryKey: readonly unknown[] }) =>
        query.state.status === "success" && !NOT_PERSISTED.has(String(query.queryKey[0])),
    },
  };

  // Wipes the device cache (sign-out, or another user signing in on the same device).
  async function clearOfflineCache() {
    queryClient.clear();
    await persister.removeClient();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* storage may be blocked */
    }
    await onClear?.();
  }

  try {
    // From the identity the auth provider cached: no network call that could hang on bad reception.
    const userId = (JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? "null") as { id?: string } | null)?.id ?? null;
    const owner = localStorage.getItem(USER_KEY);
    if (owner && userId && owner !== userId) await clearOfflineCache();
    if (userId) {
      localStorage.setItem(USER_KEY, userId);
      await persistQueryClientRestore(options);
    }
  } catch (error) {
    console.warn("offline cache restore failed", error);
  }
  persistQueryClientSubscribe(options);
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") void clearOfflineCache();
    if (event === "SIGNED_IN" && session) {
      const owner = localStorage.getItem(USER_KEY);
      if (owner && owner !== session.user.id) void clearOfflineCache();
      localStorage.setItem(USER_KEY, session.user.id);
    }
  });
}
