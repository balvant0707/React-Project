// Ported 1:1 from the NPM tool (app/src/pages/dockReports/offline/referenceCache.ts).
import { idbGet, idbPut, REFERENCE_STORE } from "./db";

// Small, static lookup lists (phrase categories, spec areas, users) that
// every dropdown on the Dock Report page needs - cached locally so a fully
// offline reload still renders correct labels for whatever's already in the
// draft, not just blank/broken selects. Deliberately NOT used for the
// product catalog (thousands of rows, searched on the server) - see
// show.tsx's own comment on packaging caching for that narrower, per-draft
// exception.
export async function loadOrCacheReference<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (navigator.onLine) {
    try {
      const fresh = await loader();
      await idbPut(REFERENCE_STORE, { key, value: fresh });
      return fresh;
    } catch {
      // fall through to whatever was last cached
    }
  }
  const cached = await idbGet<{ key: string; value: T }>(REFERENCE_STORE, key);
  if (cached) return cached.value;
  return [] as unknown as T;
}
